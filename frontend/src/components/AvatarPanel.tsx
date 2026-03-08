"use client";

interface AvatarPanelProps {
  isConnected: boolean;
  isSpeaking: boolean;
}

/**
 * Avatar panel - placeholder for Simli integration.
 * Will be replaced with actual Simli video stream on Day 4.
 */
export function AvatarPanel({ isConnected, isSpeaking }: AvatarPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
      {/* Placeholder avatar circle */}
      <div
        className={`w-32 h-32 rounded-full flex items-center justify-center text-4xl transition-all duration-300 ${
          isSpeaking
            ? "bg-[var(--color-accent)] shadow-lg shadow-blue-500/20 scale-105"
            : isConnected
              ? "bg-[var(--color-surface-hover)]"
              : "bg-[var(--color-surface)]"
        }`}
      >
        {isConnected ? (isSpeaking ? "🗣" : "🤖") : "💤"}
      </div>
      <p className="mt-3 text-sm text-[var(--color-text-muted)]">
        {isSpeaking ? "AI is speaking..." : isConnected ? "Listening" : "Offline"}
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">
        AI Technical Consultant
      </p>
    </div>
  );
}
