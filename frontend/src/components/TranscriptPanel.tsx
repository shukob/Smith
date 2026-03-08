"use client";

import { useRef, useEffect } from "react";

export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
}

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
}

export function TranscriptPanel({ entries }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-[var(--color-text-muted)] px-4 py-2 border-b border-[var(--color-border)]">
        Transcript
      </h2>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {entries.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)] italic">
            Start a meeting to see the transcript...
          </p>
        )}
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`flex gap-2 ${entry.role === "assistant" ? "" : "justify-end"}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                entry.role === "assistant"
                  ? "bg-[var(--color-surface-hover)] text-[var(--color-text)]"
                  : "bg-[var(--color-accent-dim)] text-white"
              }`}
            >
              <span className="text-xs text-[var(--color-text-muted)] block mb-1">
                {entry.role === "assistant" ? "AI Consultant" : "Participant"}
              </span>
              {entry.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
