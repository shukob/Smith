"use client";

interface ControlBarProps {
  isConnected: boolean;
  isRecording: boolean;
  speculativeEnabled: boolean;
  onConnect: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onDisconnect: () => void;
  onToggleSpeculative: (enabled: boolean) => void;
}

export function ControlBar({
  isConnected,
  isRecording,
  speculativeEnabled,
  onConnect,
  onStartRecording,
  onStopRecording,
  onDisconnect,
  onToggleSpeculative,
}: ControlBarProps) {
  return (
    <div className="flex items-center gap-3 p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <h1 className="text-lg font-bold mr-4">Smith</h1>

      {!isConnected ? (
        <button
          onClick={onConnect}
          className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-dim)] transition-colors text-sm font-medium"
        >
          Connect
        </button>
      ) : !isRecording ? (
        <button
          onClick={onStartRecording}
          className="px-4 py-2 bg-[var(--color-success)] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
        >
          Start Meeting
        </button>
      ) : (
        <button
          onClick={onStopRecording}
          className="px-4 py-2 bg-[var(--color-danger)] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
        >
          End Meeting
        </button>
      )}

      {isConnected && (
        <button
          onClick={onDisconnect}
          className="px-3 py-2 border border-[var(--color-border)] text-[var(--color-text-muted)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors text-sm"
        >
          Disconnect
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] cursor-pointer">
          <input
            type="checkbox"
            checked={speculativeEnabled}
            onChange={(e) => onToggleSpeculative(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-accent)]"
          />
          Speculative Turn-taking
        </label>

        {isRecording && (
          <span className="flex items-center gap-1.5 text-sm text-[var(--color-danger)]">
            <span className="w-2 h-2 bg-[var(--color-danger)] rounded-full animate-pulse" />
            Recording
          </span>
        )}
      </div>
    </div>
  );
}
