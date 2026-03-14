"use client";

import { useState, useCallback, useMemo } from "react";
import { ControlBar } from "./ControlBar";
import { TranscriptPanel, type TranscriptEntry } from "./TranscriptPanel";
import { AvatarPanel } from "./AvatarPanel";
import OmniOutline from "./OmniOutline";
import OmniGraffle from "./OmniGraffle";
import OmniFocus from "./OmniFocus";
import OmniPlan from "./OmniPlan";
import { DivergenceIndicator } from "./DivergenceIndicator";
import { useAudioStream, type AudioStreamMessage } from "@/hooks/useAudioStream";
import { useFirestore } from "@/hooks/useFirestore";

const WS_URL =
  process.env.NEXT_PUBLIC_BACKEND_WS_URL || "ws://localhost:8080/ws/meeting";

export function MeetingRoom() {
  const [sessionId] = useState(
    () => `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  );
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [speculativeEnabled, setSpeculativeEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Divergence state
  const [divergence, setDivergence] = useState({
    score: 0,
    action: null as "ignore" | "monitor" | "interrupt" | null,
    predicted: null as string | null,
    actual: null as string | null,
    isActive: false,
  });

  // Firestore real-time data
  const { requirements, summary } = useFirestore(sessionId);

  const handleMessage = useCallback((msg: AudioStreamMessage) => {
    switch (msg.type) {
      case "transcript":
        setTranscript((prev) => [
          ...prev,
          {
            role: msg.role as "user" | "assistant",
            text: msg.text as string,
          },
        ]);
        break;

      case "divergence":
        setDivergence({
          score: msg.score as number,
          action: msg.action as "ignore" | "monitor" | "interrupt",
          predicted: msg.predicted as string | null,
          actual: msg.actual as string | null,
          isActive: true,
        });
        break;

      case "speculation_started":
        setDivergence((prev) => ({
          ...prev,
          isActive: true,
          score: 0,
          action: null,
        }));
        setIsSpeaking(true);
        break;

      case "turn_complete":
        setDivergence((prev) => ({ ...prev, isActive: false }));
        setIsSpeaking(false);
        break;

      case "interrupted":
        setDivergence((prev) => ({ ...prev, isActive: false }));
        setIsSpeaking(false);
        break;

      case "ready":
        console.log("[MeetingRoom] Session ready:", msg.session_id);
        break;
    }
  }, []);

  const wsUrl = useMemo(() => `${WS_URL}/${sessionId}`, [sessionId]);

  const {
    isConnected,
    isRecording,
    connect,
    startRecording,
    stopRecording,
    disconnect,
    sendMessage,
  } = useAudioStream({
    wsUrl,
    onMessage: handleMessage,
  });

  const handleToggleSpeculative = useCallback(
    (enabled: boolean) => {
      setSpeculativeEnabled(enabled);
      sendMessage({ type: "toggle_speculative", enabled });
    },
    [sendMessage]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <ControlBar
        isConnected={isConnected}
        isRecording={isRecording}
        speculativeEnabled={speculativeEnabled}
        onConnect={connect}
        onStartRecording={startRecording}
        onStopRecording={() => {
          stopRecording();
          setIsSpeaking(false);
        }}
        onDisconnect={disconnect}
        onToggleSpeculative={handleToggleSpeculative}
      />

      {/* Main content: 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Avatar + Transcript */}
        <div className="w-80 flex flex-col border-r border-[var(--color-border)]">
          <div className="h-64 p-4">
            <AvatarPanel isConnected={isConnected} isSpeaking={isSpeaking} />
          </div>
          <div className="flex-1 overflow-hidden">
            <TranscriptPanel entries={transcript} />
          </div>
        </div>

        {/* Main content: Omni 4-Pane Dashboard */}
        <div className="flex-1 flex flex-col p-4 gap-4 bg-slate-50 dark:bg-slate-950 overflow-hidden">
          {/* Top Row */}
          <div className="flex-1 flex gap-4 min-h-[300px]">
             <div className="flex-1">
               <OmniOutline />
             </div>
             <div className="flex-1">
               <OmniGraffle />
             </div>
          </div>
          {/* Bottom Row */}
          <div className="flex-1 flex gap-4 min-h-[300px]">
             <div className="flex-1">
               <OmniFocus />
             </div>
             <div className="flex-1 overflow-hidden">
               <OmniPlan />
             </div>
          </div>
        </div>
      </div>

      {/* Bottom: Divergence indicator */}
      <DivergenceIndicator
        score={divergence.score}
        action={divergence.action}
        predicted={divergence.predicted}
        actual={divergence.actual}
        isActive={divergence.isActive}
      />
    </div>
  );
}
