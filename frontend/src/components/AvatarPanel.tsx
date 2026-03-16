"use client";

import { useRef, useEffect, useCallback } from "react";

interface AvatarPanelProps {
  isConnected: boolean;
  isSpeaking: boolean;
  simliConnected: boolean;
  onVideoFrame?: ArrayBuffer | null;
}

/**
 * Avatar panel - renders Simli lip-sync video via Canvas or emoji fallback.
 *
 * Video frames arrive as JPEG ArrayBuffers from the backend relay.
 * Each frame is decoded and drawn onto a Canvas element.
 */
export function AvatarPanel({ isConnected, isSpeaking, simliConnected, onVideoFrame }: AvatarPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw JPEG frame onto canvas when a new video frame arrives
  useEffect(() => {
    if (!onVideoFrame || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const blob = new Blob([onVideoFrame], { type: "image/jpeg" });
    createImageBitmap(blob).then((bmp) => {
      // Adapt canvas buffer to actual frame size
      if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        canvas.style.aspectRatio = `${bmp.width} / ${bmp.height}`;
      }
      canvas.getContext("2d")?.drawImage(bmp, 0, 0, bmp.width, bmp.height);
      bmp.close();
    }).catch(() => {
      // Ignore decode errors for dropped frames
    });
  }, [onVideoFrame]);

  return (
    <div className="relative flex flex-col items-center justify-center h-full bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] overflow-hidden">
      {/* Simli avatar canvas */}
      {simliConnected && (
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover"
        />
      )}

      {/* Fallback emoji when Simli not connected */}
      {!simliConnected && (
        <div
          className={`w-32 h-32 rounded-full flex items-center justify-center text-4xl transition-all duration-300 ${
            isSpeaking
              ? "bg-[var(--color-accent)] shadow-lg shadow-blue-500/20 scale-105"
              : isConnected
                ? "bg-[var(--color-surface-hover)]"
                : "bg-[var(--color-surface)]"
          }`}
        >
          {isConnected ? (isSpeaking ? "\u{1F5E3}" : "\u{1F916}") : "\u{1F4A4}"}
        </div>
      )}

      <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-[var(--color-text-muted)]">
        {isSpeaking ? "AI is speaking..." : isConnected ? "Listening" : "Offline"}
      </p>
    </div>
  );
}
