"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export interface AudioStreamMessage {
  type: string;
  [key: string]: unknown;
}

interface UseAudioStreamOptions {
  wsUrl: string;
  audioDeviceId?: string;
  speakerDeviceId?: string;
  onMessage?: (msg: AudioStreamMessage) => void;
  onAudioReceived?: (pcmData: ArrayBuffer) => void;
}

/**
 * Hook for bidirectional audio streaming over WebSocket.
 *
 * - Captures mic audio via AudioWorklet → PCM16 16kHz → WebSocket binary
 * - Receives PCM 24kHz audio from server → plays via AudioContext
 * - Receives JSON messages from server → routes to onMessage callback
 */
export function useAudioStream({
  wsUrl,
  audioDeviceId,
  speakerDeviceId,
  onMessage,
  onAudioReceived,
}: UseAudioStreamOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setIsConnected(true);
      console.log("[AudioStream] WebSocket connected");
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary = audio from Gemini (24kHz PCM16)
        playAudio(event.data);
        onAudioReceived?.(event.data);
      } else {
        // Text = JSON control message
        try {
          const msg = JSON.parse(event.data);
          onMessage?.(msg);
        } catch {
          // ignore parse errors
        }
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsRecording(false);
      console.log("[AudioStream] WebSocket disconnected");
    };

    ws.onerror = (err) => {
      console.error("[AudioStream] WebSocket error:", err);
    };

    wsRef.current = ws;
  }, [wsUrl, onMessage, onAudioReceived]);

  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("[AudioStream] WebSocket not connected");
      return;
    }

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: audioDeviceId && audioDeviceId !== "default" ? { exact: audioDeviceId } : undefined,
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Create AudioContext and load worklet
      const audioCtx = new AudioContext({ sampleRate: 48000 });
      await audioCtx.audioWorklet.addModule("/audio-worklet-processor.js");

      const source = audioCtx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(
        audioCtx,
        "pcm16-capture-processor"
      );

      // Send PCM16 chunks over WebSocket
      workletNode.port.onmessage = (event) => {
        if (
          wsRef.current?.readyState === WebSocket.OPEN &&
          event.data instanceof ArrayBuffer
        ) {
          wsRef.current.send(event.data);
        }
      };

      source.connect(workletNode);
      workletNode.connect(audioCtx.destination); // Needed to keep worklet alive

      audioContextRef.current = audioCtx;
      workletNodeRef.current = workletNode;
      setIsRecording(true);
      console.log("[AudioStream] Recording started with mic:", audioDeviceId || "default");
    } catch (err) {
      console.error("[AudioStream] Failed to start recording:", err);
    }
  }, [audioDeviceId]);

  const stopRecording = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    console.log("[AudioStream] Recording stopped");
  }, []);

  const disconnect = useCallback(() => {
    stopRecording();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [stopRecording]);

  const sendMessage = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Play received PCM 24kHz audio
  const playAudio = useCallback((pcmBuffer: ArrayBuffer) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = playbackContextRef.current.currentTime;
    }

    const ctx = playbackContextRef.current;
    const int16 = new Int16Array(pcmBuffer);
    const float32 = new Float32Array(int16.length);

    // Int16 → Float32
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x7fff;
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    // Schedule seamless playback
    const now = ctx.currentTime;
    const startTime = Math.max(now, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;
  }, []);

  useEffect(() => {
    if (playbackContextRef.current && speakerDeviceId && speakerDeviceId !== "default") {
      if ("setSinkId" in playbackContextRef.current) {
        (playbackContextRef.current as any).setSinkId(speakerDeviceId).catch(console.error);
        console.log("[AudioStream] Output speaker set to:", speakerDeviceId);
      }
    }
  }, [speakerDeviceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      if (playbackContextRef.current) {
        playbackContextRef.current.close();
      }
    };
  }, [disconnect]);

  return {
    isConnected,
    isRecording,
    connect,
    startRecording,
    stopRecording,
    disconnect,
    sendMessage,
  };
}
