"use client";

import { useState, useCallback, useMemo } from "react";
import { ControlBar } from "./ControlBar";
import { TranscriptPanel, type TranscriptEntry } from "./TranscriptPanel";
import { AvatarPanel } from "./AvatarPanel";
import Outline from "./Outline";
import Graffle from "./Graffle";
import Focus from "./Focus";
import Plan from "./Plan";
import { DivergenceIndicator } from "./DivergenceIndicator";
import { useAudioStream, type AudioStreamMessage } from "@/hooks/useAudioStream";
import { useFirestore } from "@/hooks/useFirestore";
import { useDevices } from "@/hooks/useDevices";
import { Sidebar } from "./Sidebar";

const WS_URL =
  process.env.NEXT_PUBLIC_BACKEND_WS_URL || "ws://localhost:8080/ws/meeting";

export function MeetingRoom() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sessionId, setSessionId] = useState(
    () => `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  );
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [speculativeEnabled, setSpeculativeEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [maximizedPane, setMaximizedPane] = useState<"outline" | "graffle" | "focus" | "plan" | null>(null);

  // Divergence state
  const [divergence, setDivergence] = useState({
    score: 0,
    action: null as "ignore" | "monitor" | "interrupt" | null,
    predicted: null as string | null,
    actual: null as string | null,
    isActive: false,
  });

  // Firestore real-time data
  const { requirements, summary, outlineNodes, archElements, tasks: focusTasks, scheduleItems } = useFirestore(sessionId);

  // Device selection
  const devices = useDevices();

  const handleMessage = useCallback((msg: AudioStreamMessage) => {
    switch (msg.type) {
      case "transcript":
        setTranscript((prev) => {
          const last = prev[prev.length - 1];
          const now = Date.now();
          // Group if same role and within 3 seconds of the last update
          if (last && last.role === msg.role && (now - (last.lastUpdate || 0)) < 3000) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              text: last.text + msg.text,
              lastUpdate: now,
            };
            return updated;
          }
          return [
            ...prev,
            {
              role: msg.role as "user" | "assistant",
              text: msg.text as string,
              lastUpdate: now,
            },
          ];
        });
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
    audioDeviceId: devices.selectedMic,
    speakerDeviceId: devices.selectedSpeaker,
    onMessage: handleMessage,
  });

  const handleToggleSpeculative = useCallback(
    (enabled: boolean) => {
      setSpeculativeEnabled(enabled);
      sendMessage({ type: "toggle_speculative", enabled });
    },
    [sendMessage]
  );

  const handleSelectSession = useCallback((id: string) => {
    if (isConnected) {
      disconnect();
    }
    setSessionId(id);
    setTranscript([]);
    setDivergence({
      score: 0,
      action: null,
      predicted: null,
      actual: null,
      isActive: false,
    });
    setIsSpeaking(false);
  }, [isConnected, disconnect]);

  const handleNewSession = useCallback(() => {
    if (isConnected) {
      disconnect();
    }
    const newId = `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setSessionId(newId);
    setTranscript([]);
    setDivergence({
      score: 0,
      action: null,
      predicted: null,
      actual: null,
      isActive: false,
    });
    setIsSpeaking(false);
  }, [isConnected, disconnect]);

  const handleEditOutlineNode = useCallback((id: string, newText: string) => {
    const node = outlineNodes.find(n => n.id === id);
    if (!node) return;
    const updatedNode = { ...node, text: newText };
    sendMessage({ type: "user_edit_outline", node: updatedNode });
  }, [outlineNodes, sendMessage]);

  const handleEditFocusTask = useCallback((id: string, newTitle: string) => {
    const task = focusTasks.find(t => t.id === id);
    if (!task) return;
    const updatedTask = { ...task, title: newTitle };
    sendMessage({ type: "user_edit_task", task: updatedTask });
  }, [focusTasks, sendMessage]);

  return (
    <div className="flex flex-col h-full">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        currentSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
      />
      {/* Top bar */}
      <ControlBar
        isConnected={isConnected}
        isRecording={isRecording}
        speculativeEnabled={speculativeEnabled}
        devices={devices}
        onSelectMic={devices.selectMic}
        onSelectSpeaker={devices.selectSpeaker}
        onConnect={connect}
        onStartRecording={startRecording}
        onStopRecording={() => {
          stopRecording();
          setIsSpeaking(false);
        }}
        onDisconnect={disconnect}
        onToggleSpeculative={handleToggleSpeculative}
        onShareScreen={() => { console.log("TODO: Share screen"); }}
        isSharingScreen={false}
        onUploadFile={(file) => { console.log("TODO: Upload file", file); }}
        onOpenSidebar={() => setIsSidebarOpen(true)}
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

        {/* Main content: 4-Pane Dashboard */}
        <div className="flex-1 flex flex-col p-4 gap-4 bg-slate-50 dark:bg-slate-950 overflow-hidden">
          {maximizedPane === "outline" && (
            <div className="flex-1 overflow-hidden">
              <Outline nodes={outlineNodes} onEditNode={handleEditOutlineNode} isMaximized={true} onToggleMaximize={() => setMaximizedPane(null)} />
            </div>
          )}
          {maximizedPane === "graffle" && (
            <div className="flex-1 overflow-hidden">
              <Graffle elements={archElements} isMaximized={true} onToggleMaximize={() => setMaximizedPane(null)} />
            </div>
          )}
          {maximizedPane === "focus" && (
            <div className="flex-1 overflow-hidden">
              <Focus initialTasks={focusTasks} onEditTask={handleEditFocusTask} isMaximized={true} onToggleMaximize={() => setMaximizedPane(null)} />
            </div>
          )}
          {maximizedPane === "plan" && (
            <div className="flex-1 overflow-hidden">
              <Plan items={scheduleItems} isMaximized={true} onToggleMaximize={() => setMaximizedPane(null)} />
            </div>
          )}

          {!maximizedPane && (
            <>
              {/* Top Row */}
              <div className="flex-1 flex gap-4 min-h-[300px]">
                 <div className="flex-1 overflow-hidden">
                   <Outline nodes={outlineNodes} onEditNode={handleEditOutlineNode} isMaximized={false} onToggleMaximize={() => setMaximizedPane("outline")} />
                 </div>
                 <div className="flex-1 overflow-hidden">
                   <Graffle elements={archElements} isMaximized={false} onToggleMaximize={() => setMaximizedPane("graffle")} />
                 </div>
              </div>
              {/* Bottom Row */}
              <div className="flex-1 flex gap-4 min-h-[300px]">
                 <div className="flex-1 overflow-hidden">
                   <Focus initialTasks={focusTasks} onEditTask={handleEditFocusTask} isMaximized={false} onToggleMaximize={() => setMaximizedPane("focus")} />
                 </div>
                 <div className="flex-1 overflow-hidden">
                   <Plan items={scheduleItems} isMaximized={false} onToggleMaximize={() => setMaximizedPane("plan")} />
                 </div>
              </div>
            </>
          )}
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
