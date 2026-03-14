"use client";

import React from "react";
import { useSessionsList } from "@/hooks/useFirestore";
import { MessageSquare, PlusCircle } from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export function Sidebar({ isOpen, onClose, currentSessionId, onSelectSession, onNewSession }: SidebarProps) {
  const { sessions, isLoading } = useSessionsList();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 z-40 transition-opacity" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-xl z-50 flex flex-col transform transition-transform duration-300">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-lg">Meeting History</h2>
          <button 
            onClick={onNewSession}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-600 dark:text-slate-300"
            title="New Meeting"
          >
            <PlusCircle size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="p-4 text-sm text-slate-500 text-center">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-sm text-slate-500 text-center italic">No past meetings found.</div>
          ) : (
            sessions.map((session) => {
              const isSelected = session.id === currentSessionId;
              const dateStr = session.metadata?.created 
                ? new Date(session.metadata.created).toLocaleString() 
                : "Unknown date";
                
              return (
                <button
                  key={session.id}
                  onClick={() => {
                    onSelectSession(session.id);
                    onClose();
                  }}
                  className={`w-full text-left flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    isSelected 
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" 
                      : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <MessageSquare size={16} className={`mt-0.5 shrink-0 ${isSelected ? "text-indigo-500" : "text-slate-400"}`} />
                  <div className="overflow-hidden">
                    <div className="text-sm font-medium truncate">
                      {session.metadata?.name || session.id.split("-")[0]}
                    </div>
                    <div className="text-xs opacity-70 truncate mt-0.5">
                      {dateStr}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
