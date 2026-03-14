"use client";

import React, { useState } from "react";
import { useSessionsList } from "@/hooks/useFirestore";
import { MessageSquare, PlusCircle, Archive, ArchiveRestore } from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export function Sidebar({ isOpen, onClose, currentSessionId, onSelectSession, onNewSession }: SidebarProps) {
  const { sessions, isLoading, toggleArchiveStatus } = useSessionsList();
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");

  if (!isOpen) return null;
  
  const filteredSessions = sessions.filter(
    (s) => (s.metadata?.status === "archived" && activeTab === "archived") ||
           (s.metadata?.status !== "archived" && activeTab === "active")
  );

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 z-40 transition-opacity" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-xl z-50 flex flex-col transform transition-transform duration-300">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-lg">Meeting History</h2>
          <button 
            onClick={onNewSession}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-600 dark:text-slate-300 flex items-center gap-1 text-sm bg-slate-50 dark:bg-slate-800/50 pr-3"
            title="New Meeting"
          >
            <PlusCircle size={18} />
            <span className="font-medium">New</span>
          </button>
        </div>
        
        <div className="flex border-b border-slate-200 dark:border-slate-800 p-2 gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <button 
            onClick={() => setActiveTab("active")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "active" ? "bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"}`}
          >
            Active
          </button>
          <button 
            onClick={() => setActiveTab("archived")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "archived" ? "bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"}`}
          >
            Archived
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="p-4 text-sm text-slate-500 text-center">Loading sessions...</div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-4 text-sm text-slate-500 text-center italic">No {activeTab} meetings found.</div>
          ) : (
            filteredSessions.map((session) => {
              const isSelected = session.id === currentSessionId;
              const dateStr = session.metadata?.created 
                ? new Date(session.metadata.created).toLocaleString() 
                : "Unknown date";
                
              return (
                <div key={session.id} className="group flex items-center w-full rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                  <button
                    onClick={() => {
                      onSelectSession(session.id);
                      onClose();
                    }}
                    className={`flex-1 text-left flex items-start gap-3 p-3 rounded-l-lg ${
                      isSelected 
                        ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" 
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <MessageSquare size={16} className={`mt-0.5 shrink-0 ${isSelected ? "text-indigo-500" : "text-slate-400"}`} />
                    <div className="overflow-hidden">
                      <div className="text-sm font-medium truncate pr-2">
                        {session.metadata?.name || session.id.split("-")[0]}
                      </div>
                      <div className="text-xs opacity-70 truncate mt-0.5">
                        {dateStr}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleArchiveStatus(session.id, session.metadata?.status || "active");
                    }}
                    className={`p-2.5 shrink-0 rounded-r-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-200 dark:hover:bg-slate-700 ${isSelected ? "bg-indigo-50 dark:bg-indigo-900/30" : ""}`}
                    title={activeTab === "active" ? "Archive" : "Restore"}
                  >
                    {activeTab === "active" ? (
                      <Archive size={16} className="text-slate-500" />
                    ) : (
                      <ArchiveRestore size={16} className="text-slate-500" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
