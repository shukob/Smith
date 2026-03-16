"use client";

import { DeviceState } from "@/hooks/useDevices";
import { useRef, useState, useEffect } from "react";
import { Menu } from "lucide-react";

interface ControlBarProps {
  isConnected: boolean;
  isRecording: boolean;
  speculativeEnabled: boolean;
  devices: DeviceState;
  onSelectMic: (id: string) => void;
  onSelectSpeaker: (id: string) => void;
  onConnect: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onDisconnect: () => void;
  onToggleSpeculative: (enabled: boolean) => void;
  onShareScreen?: () => void;
  isSharingScreen?: boolean;
  onUploadFile?: (file: File) => void;
  onOpenSidebar: () => void;
  sessionTitle: string;
  onEditTitle: (title: string) => void;
  userName?: string;
  onSignOut?: () => void;
}

export function ControlBar({
  isConnected,
  isRecording,
  speculativeEnabled,
  devices,
  onSelectMic,
  onSelectSpeaker,
  onConnect,
  onStartRecording,
  onStopRecording,
  onDisconnect,
  onToggleSpeculative,
  onShareScreen,
  isSharingScreen,
  onUploadFile,
  onOpenSidebar,
  sessionTitle,
  onEditTitle,
  userName,
  onSignOut,
}: ControlBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localTitle, setLocalTitle] = useState(sessionTitle);

  // Sync prop changes downstream
  useEffect(() => {
    setLocalTitle(sessionTitle);
  }, [sessionTitle]);

  const handleTitleBlur = () => {
    if (localTitle.trim() && localTitle !== sessionTitle) {
      onEditTitle(localTitle);
    } else {
      setLocalTitle(sessionTitle); // Reset on empty
    }
  };

  return (
    <div className="flex items-center gap-3 p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <button 
        onClick={onOpenSidebar}
        className="p-2 hover:bg-[var(--color-surface-hover)] rounded-md text-[var(--color-text)] transition-colors"
        title="Show Meeting History"
        aria-label="Meeting History"
      >
        <Menu size={20} />
      </button>
      <input 
        className="text-lg font-bold mr-4 bg-transparent outline-none border-b border-transparent focus:border-[var(--color-border)] hover:border-[var(--color-border)] transition-colors px-1"
        value={localTitle}
        onChange={(e) => setLocalTitle(e.target.value)}
        onBlur={handleTitleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        title="Edit session title"
      />

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
        <>
          <button
            onClick={onDisconnect}
            className="px-3 py-2 border border-[var(--color-border)] text-[var(--color-text-muted)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors text-sm"
          >
            Disconnect
          </button>
          <div className="h-6 w-px bg-[var(--color-border)] mx-2" />
          <button
            onClick={onShareScreen}
            className={`px-3 py-2 border border-[var(--color-border)] rounded-lg transition-colors text-sm flex items-center gap-2 ${
              isSharingScreen ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
            {isSharingScreen ? "Stop Sharing" : "Share"}
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={(e) => {
              if (e.target.files && e.target.files[0] && onUploadFile) {
                onUploadFile(e.target.files[0]);
              }
              // Reset so the same file can be chosen again
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 border border-[var(--color-border)] text-[var(--color-text-muted)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors text-sm flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
            File
          </button>
        </>
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
          <span className="flex items-center gap-1.5 text-sm text-[var(--color-danger)] mr-2">
            <span className="w-2 h-2 bg-[var(--color-danger)] rounded-full animate-pulse" />
            Recording
          </span>
        )}

        <div className="flex items-center gap-2 border-l border-[var(--color-border)] pl-4">
          <select 
            value={devices.selectedMic} 
            onChange={(e) => onSelectMic(e.target.value)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-sm rounded-md px-2 py-1 max-w-[150px] truncate"
            title="Microphone"
          >
            {devices.microphones.map(m => (
              <option key={m.deviceId} value={m.deviceId}>{m.label || "Mic " + m.deviceId.slice(0, 4)}</option>
            ))}
          </select>
          <select 
            value={devices.selectedSpeaker} 
            onChange={(e) => onSelectSpeaker(e.target.value)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-sm rounded-md px-2 py-1 max-w-[150px] truncate"
            title="Speaker"
          >
            {devices.speakers.map(s => (
              <option key={s.deviceId} value={s.deviceId}>{s.label || "Speaker " + s.deviceId.slice(0, 4)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* User info & sign out */}
      {userName && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-400 truncate max-w-[120px]">{userName}</span>
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors"
            >
              Logout
            </button>
          )}
        </div>
      )}
    </div>
  );
}
