"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
import { useAuth } from "@/contexts/AuthContext";

const WS_URL =
  process.env.NEXT_PUBLIC_BACKEND_WS_URL || "ws://localhost:8080/ws/meeting";

export function MeetingRoom() {
  const { user } = useAuth();
  const [idToken, setIdToken] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sessionId, setSessionId] = useState(
    () => `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  );
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [speculativeEnabled, setSpeculativeEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [maximizedPane, setMaximizedPane] = useState<"outline" | "graffle" | "focus" | "plan" | null>(null);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [simliConnected, setSimliConnected] = useState(false);
  const [lastVideoFrame, setLastVideoFrame] = useState<ArrayBuffer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Divergence state
  const [divergence, setDivergence] = useState({
    score: 0,
    action: null as "ignore" | "monitor" | "interrupt" | null,
    predicted: null as string | null,
    actual: null as string | null,
    isActive: false,
  });

  // Lockout state
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [forceConnect, setForceConnect] = useState(false);

  // Firestore real-time data
  const { requirements, summary, outlineNodes, archElements, tasks: focusTasks, scheduleItems, metadata } = useFirestore(sessionId);

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
        setSimliConnected(msg.simli_connected === true);
        break;

      case "error":
        console.error("[MeetingRoom] Error from server:", msg.message);
        if (msg.message === "Session already active") {
          setIsLockedOut(true);
        }
        break;
    }
  }, []);

  const handleVideoFrame = useCallback((jpegData: ArrayBuffer) => {
    setLastVideoFrame(jpegData);
  }, []);

  useEffect(() => {
    if (user) {
      user.getIdToken().then(setIdToken).catch(console.error);
    }
  }, [user]);

  const wsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (idToken) params.set("token", idToken);
    if (forceConnect) params.set("force", "true");
    const qs = params.toString();
    return `${WS_URL}/${sessionId}${qs ? `?${qs}` : ""}`;
  }, [sessionId, forceConnect, idToken]);

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
    onVideoFrame: handleVideoFrame,
  });

  const handleForceJoin = useCallback(() => {
    setIsLockedOut(false);
    setForceConnect(true);
  }, []);

  const handleShareScreen = async () => {
    if (isSharingScreen && streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setIsSharingScreen(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        streamRef.current = stream;
        setIsSharingScreen(true);
        stream.getVideoTracks()[0].onended = () => {
          setIsSharingScreen(false);
          streamRef.current = null;
        };
      } catch (err) {
        console.error("Failed to share screen:", err);
      }
    }
  };

  const hasAttemptedConnectRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!sessionId) return;
    
    // Auto-connect to the control socket so the 4 panes are immediately interactable, but only try once
    if (!isConnected && !isLockedOut && !hasAttemptedConnectRef.current[sessionId]) {
      hasAttemptedConnectRef.current[sessionId] = true;
      connect();
    }
    
    if (forceConnect) {
      // If forced, reset the attempt flag and connect with the force wsUrl
      hasAttemptedConnectRef.current[sessionId] = true;
      connect();
      const timer = setTimeout(() => setForceConnect(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [forceConnect, connect, isConnected, isLockedOut, sessionId]);

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
    setIsLockedOut(false);
    setForceConnect(false);
    setIsSpeaking(false);
    setSimliConnected(false);
    setLastVideoFrame(null);
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
    setIsLockedOut(false);
    setIsSpeaking(false);
    setSimliConnected(false);
    setLastVideoFrame(null);
  }, [isConnected, disconnect]);

  const handleEditOutlineNode = useCallback((id: string, newText: string) => {
    const node = outlineNodes.find(n => n.id === id);
    if (!node) return;
    const updatedNode = { ...node, text: newText };
    sendMessage({ type: "user_edit_outline", node: updatedNode });
  }, [outlineNodes, sendMessage]);

  const handleUpdateNodeType = useCallback((id: string, newType: string) => {
    const node = outlineNodes.find(n => n.id === id);
    if (!node) return;
    const updatedNode = { ...node, type: newType };
    sendMessage({ type: "user_edit_outline", node: updatedNode });
  }, [outlineNodes, sendMessage]);

  const handleUpdateNodeParent = useCallback((id: string, newParentId: string) => {
    const node = outlineNodes.find(n => n.id === id);
    if (!node) return;
    const updatedNode = { ...node, parent_id: newParentId };
    sendMessage({ type: "user_edit_outline", node: updatedNode });
  }, [outlineNodes, sendMessage]);

  const handleSetFocus = useCallback((pane: string, elementId: string | null, action: string | null) => {
    sendMessage({ 
      type: "user_set_focus", 
      focus: { pane, elementId, action } 
    });
  }, [sendMessage]);

  const handleDeleteOutlineNode = useCallback((id: string) => {
    sendMessage({ type: "user_delete_outline", id });
  }, [sendMessage]);

  const handleAddChildNode = useCallback((parentId: string) => {
    const newNode = {
      id: `node-${Date.now()}`,
      parent_id: parentId,
      text: "New Node",
      type: "note",
      order: outlineNodes.filter(n => n.parent_id === parentId).length,
    };
    sendMessage({ type: "user_edit_outline", node: newNode });
  }, [outlineNodes, sendMessage]);

  const handleEditFocusTask = useCallback((id: string, newTitle: string) => {
    const task = focusTasks.find(t => t.id === id);
    if (!task) return;
    const updatedTask = { ...task, title: newTitle };
    sendMessage({ type: "user_edit_task", task: updatedTask });
  }, [focusTasks, sendMessage]);

  const handleUpdateFocusTaskProperty = useCallback((id: string, property: string, value: string) => {
    const task = focusTasks.find(t => t.id === id);
    if (!task) return;
    const updatedTask = { ...task, [property]: value };
    sendMessage({ type: "user_edit_task", task: updatedTask });
  }, [focusTasks, sendMessage]);

  const handleDeleteFocusTask = useCallback((id: string) => {
    sendMessage({ type: "user_delete_task", id });
  }, [sendMessage]);

  const handleAddFocusTask = useCallback((status: string) => {
    const newTask = {
      id: `task-${Date.now()}`,
      title: "New Task",
      status: status,
      assignee: "",
      priority: "medium",
    };
    sendMessage({ type: "user_edit_task", task: newTask });
  }, [sendMessage]);

  const handleUpdateScheduleItem = useCallback((id: string, updates: any) => {
    const item = scheduleItems.find((i: any) => i.id === id);
    if (!item) return;
    const updatedItem = { ...item, ...updates };
    sendMessage({ type: "user_edit_schedule", item: updatedItem });
  }, [scheduleItems, sendMessage]);

  const handleDeleteScheduleItem = useCallback((id: string) => {
    sendMessage({ type: "user_delete_schedule", id });
  }, [sendMessage]);

  const handleAddScheduleItem = useCallback(() => {
    const newItem = {
      id: `schedule-${Date.now()}`,
      name: "New Milestone",
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 86400000).toISOString(), // +1 day
      progress: 0,
      dependencies: [],
    };
    sendMessage({ type: "user_edit_schedule", item: newItem });
  }, [sendMessage]);

  const handleUpdateArchElement = useCallback((id: string, updates: any) => {
    const el = archElements.find((e: any) => e.id === id);
    if (!el) return;
    const updatedEl = { ...el, ...updates };
    sendMessage({ type: "user_edit_arch", element: updatedEl });
  }, [archElements, sendMessage]);

  const handleDeleteArchElement = useCallback((id: string) => {
    sendMessage({ type: "user_delete_arch", id });
  }, [sendMessage]);

  const handleAddArchElement = useCallback((type: string, shape?: string) => {
    const isConn = type === "edge";
    const nodes = archElements.filter(e => e.type !== "edge");
    const newEl = {
      id: isConn ? `edge-${Date.now()}` : `node-${Date.now()}`,
      type: type,
      shape: type === "node" ? (shape || "rectangle") : undefined,
      label: isConn ? undefined : "New Component",
      position: isConn ? undefined : { x: 0, y: 0 },
      source: isConn ? (nodes[0]?.id || "") : undefined,
      target: isConn ? (nodes[1]?.id || nodes[0]?.id || "") : undefined,
    };
    sendMessage({ type: "user_edit_arch", element: newEl });
  }, [archElements, sendMessage]);

  const handleEditTitle = useCallback((title: string) => {
    sendMessage({ type: "user_edit_title", title });
  }, [sendMessage]);

  return (
    <div className="flex flex-col h-full relative">
      {isLockedOut && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-2xl max-w-md text-center border border-red-200 dark:border-red-900/50">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Session Already Active</h2>
            <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm">
              This session is currently being edited in another window or by another user. You cannot connect to the same session concurrently.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button 
                onClick={handleForceJoin}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors sm:order-1"
              >
                Force Takeover
              </button>
              <button 
                onClick={handleNewSession}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors sm:order-2"
              >
                Start New Session
              </button>
            </div>
          </div>
        </div>
      )}

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
        onShareScreen={handleShareScreen}
        isSharingScreen={isSharingScreen}
        onUploadFile={(file) => { console.log("TODO: Upload file", file); }}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        sessionTitle={metadata?.name || `Meeting ${sessionId.split("-").slice(-2).join("-")}`}
        onEditTitle={handleEditTitle}
      />

      {/* Main content: 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Avatar + Transcript */}
        <div className="w-80 flex flex-col border-r border-[var(--color-border)]">
          <div className="h-64 p-4">
            <AvatarPanel isConnected={isConnected} isSpeaking={isSpeaking} simliConnected={simliConnected} onVideoFrame={lastVideoFrame} />
          </div>
          <div className="flex-1 overflow-hidden">
            <TranscriptPanel entries={transcript} />
          </div>
        </div>

        {/* Main content: 4-Pane Dashboard */}
        <div className="flex-1 flex flex-col p-4 gap-4 bg-slate-50 dark:bg-slate-950 overflow-hidden">
          {maximizedPane === "outline" && (
            <div className="flex-1 overflow-hidden">
              <Outline
                nodes={outlineNodes}
                onEditNode={handleEditOutlineNode}
                onUpdateNodeType={handleUpdateNodeType}
                onDeleteNode={handleDeleteOutlineNode}
                onAddChildNode={handleAddChildNode}
                onUpdateNodeParent={handleUpdateNodeParent}
                onSetFocus={(elementId, action) => handleSetFocus("outline", elementId, action)}
                isMaximized={true}
                onToggleMaximize={() => setMaximizedPane(null)}
              />
            </div>
          )}
          {maximizedPane === "graffle" && (
            <div className="flex-1 overflow-hidden">
              <Graffle
                elements={archElements}
                onUpdateElement={handleUpdateArchElement}
                onDeleteElement={handleDeleteArchElement}
                onAddElement={handleAddArchElement}
                onSetFocus={(elementId, action) => handleSetFocus("architecture", elementId, action)}
                isMaximized={true}
                onToggleMaximize={() => setMaximizedPane(null)}
              />
            </div>
          )}
          {maximizedPane === "focus" && (
            <div className="flex-1 overflow-hidden">
              <Focus
                initialTasks={focusTasks}
                onEditTask={handleEditFocusTask}
                onUpdateTaskProperty={handleUpdateFocusTaskProperty}
                onDeleteTask={handleDeleteFocusTask}
                onAddTask={handleAddFocusTask}
                onSetFocus={(elementId, action) => handleSetFocus("focus", elementId, action)}
                isMaximized={true}
                onToggleMaximize={() => setMaximizedPane(null)}
              />
            </div>
          )}
          {maximizedPane === "plan" && (
            <div className="flex-1 overflow-hidden">
              <Plan
                items={scheduleItems}
                onUpdateScheduleItem={handleUpdateScheduleItem}
                onDeleteScheduleItem={handleDeleteScheduleItem}
                onAddScheduleItem={handleAddScheduleItem}
                onSetFocus={(elementId, action) => handleSetFocus("schedule", elementId, action)}
                isMaximized={true}
                onToggleMaximize={() => setMaximizedPane(null)}
              />
            </div>
          )}

          {!maximizedPane && (
            <>
              {/* Top Row */}
              <div className="flex-1 flex gap-4 min-h-[300px]">
                 <div className="flex-1 overflow-hidden min-h-[300px] h-full">
                <Outline
                  nodes={outlineNodes}
                  onEditNode={handleEditOutlineNode}
                  onUpdateNodeType={handleUpdateNodeType}
                  onDeleteNode={handleDeleteOutlineNode}
                  onAddChildNode={handleAddChildNode}
                  onUpdateNodeParent={handleUpdateNodeParent}
                  onSetFocus={(elementId, action) => handleSetFocus("outline", elementId, action)}
                  isMaximized={maximizedPane === "outline"}
                  onToggleMaximize={() => setMaximizedPane("outline")}
                />
              </div>
                 <div className="flex-1 overflow-hidden">
                   <Graffle
                     elements={archElements}
                     onUpdateElement={handleUpdateArchElement}
                     onDeleteElement={handleDeleteArchElement}
                     onAddElement={handleAddArchElement}
                     onSetFocus={(elementId, action) => handleSetFocus("architecture", elementId, action)}
                     isMaximized={maximizedPane === "graffle"}
                     onToggleMaximize={() => setMaximizedPane("graffle")}
                   />
                 </div>
              </div>
              {/* Bottom Row */}
              <div className="flex-1 flex gap-4 min-h-[300px]">
                 <div className="flex-1 overflow-hidden">
                    <Focus 
                      initialTasks={focusTasks} 
                      onEditTask={handleEditFocusTask}
                      onUpdateTaskProperty={handleUpdateFocusTaskProperty}
                      onDeleteTask={handleDeleteFocusTask}
                      onAddTask={handleAddFocusTask}
                      onSetFocus={(elementId, action) => handleSetFocus("focus", elementId, action)}
                      isMaximized={maximizedPane === "focus"}
                      onToggleMaximize={() => setMaximizedPane("focus")}
                    />
                 </div>
                 <div className="flex-1 overflow-hidden">
                   <Plan
                     items={scheduleItems}
                     onUpdateScheduleItem={handleUpdateScheduleItem}
                     onDeleteScheduleItem={handleDeleteScheduleItem}
                     onAddScheduleItem={handleAddScheduleItem}
                     onSetFocus={(elementId, action) => handleSetFocus("schedule", elementId, action)}
                     isMaximized={maximizedPane === "plan"}
                     onToggleMaximize={() => setMaximizedPane("plan")}
                   />
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

      {/* Screen Share Preview (Picture in Picture) */}
      {isSharingScreen && (
        <div className="absolute bottom-20 right-4 w-64 aspect-video bg-black rounded-lg shadow-xl overflow-hidden border-2 border-slate-700 z-40 group">
          <video
            autoPlay
            playsInline
            muted
            ref={(videoNode) => {
              if (videoNode && streamRef.current) {
                videoNode.srcObject = streamRef.current;
              }
            }}
            className="w-full h-full object-contain"
          />
          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-[10px] font-medium rounded backdrop-blur-sm pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            Sharing Screen
          </div>
        </div>
      )}
    </div>
  );
}
