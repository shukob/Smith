"use client";

import type { MeetingSummary } from "@/hooks/useFirestore";

interface SummaryPanelProps {
  summary: MeetingSummary;
}

export function SummaryPanel({ summary }: SummaryPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-[var(--color-text-muted)] px-4 py-2 border-b border-[var(--color-border)]">
        Discussion Summary
      </h2>
      <div className="flex-1 overflow-y-auto p-4">
        {!summary.text ? (
          <p className="text-sm text-[var(--color-text-muted)] italic">
            Summary will be generated as the meeting progresses...
          </p>
        ) : (
          <>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {summary.text}
            </div>
            {summary.topics_discussed.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] mb-2">
                  Topics Covered
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {summary.topics_discussed.map((topic, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-[var(--color-surface-hover)] rounded text-xs text-[var(--color-text-muted)]"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
