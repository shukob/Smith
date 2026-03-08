"use client";

interface DivergenceIndicatorProps {
  score: number;
  action: "ignore" | "monitor" | "interrupt" | null;
  predicted: string | null;
  actual: string | null;
  isActive: boolean;
}

export function DivergenceIndicator({
  score,
  action,
  predicted,
  actual,
  isActive,
}: DivergenceIndicatorProps) {
  const getBarColor = () => {
    if (!isActive) return "bg-[var(--color-border)]";
    if (action === "ignore") return "bg-[var(--color-success)]";
    if (action === "monitor") return "bg-[var(--color-warning)]";
    if (action === "interrupt") return "bg-[var(--color-danger)]";
    return "bg-[var(--color-border)]";
  };

  const getLabel = () => {
    if (!isActive) return "Idle";
    if (action === "ignore") return "Backchannel";
    if (action === "monitor") return "Monitoring";
    if (action === "interrupt") return "Interruption Detected";
    return "Waiting";
  };

  const widthPercent = Math.min(100, Math.max(0, score * 100));

  return (
    <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">
          Speculative Divergence
        </span>
        <span
          className={`text-xs font-mono ${
            isActive ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
          }`}
        >
          {isActive ? score.toFixed(3) : "---"}
        </span>
      </div>

      {/* Divergence bar */}
      <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-150 ${getBarColor()} ${
            isActive && action === "interrupt" ? "divergence-pulse" : ""
          }`}
          style={{ width: `${widthPercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-[var(--color-text-muted)]">{getLabel()}</span>
        <div className="flex gap-3 text-xs text-[var(--color-text-muted)]">
          <span>0.3</span>
          <span>0.6</span>
        </div>
      </div>

      {/* Prediction vs Actual display */}
      {isActive && (predicted || actual) && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          {predicted && (
            <div className="bg-[var(--color-bg)] rounded p-2">
              <span className="text-[var(--color-text-muted)] block mb-0.5">
                Predicted
              </span>
              <span className="text-[var(--color-text)]">{predicted}</span>
            </div>
          )}
          {actual && (
            <div className="bg-[var(--color-bg)] rounded p-2">
              <span className="text-[var(--color-text-muted)] block mb-0.5">
                Actual
              </span>
              <span className="text-[var(--color-text)]">{actual}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
