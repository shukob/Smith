"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Task, ViewMode } from "gantt-task-react";
import { Maximize2, Minimize2 } from "lucide-react";

// Dynamically import the Gantt wrapper to avoid SSR issues with its CSS
const GanttWrapper = dynamic(
  () => import("./GanttWrapper"),
  { ssr: false, loading: () => <div className="p-4 text-slate-500">Loading schedule...</div> }
);

interface ScheduleItem {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  progress: number;
  dependencies: string[];
}

interface PlanProps {
  items: ScheduleItem[];
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

export default function Plan({ items, isMaximized, onToggleMaximize }: PlanProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);

  useEffect(() => {
    const newTasks: Task[] = items.map((item) => {
      // Fallbacks if dates are missing or invalid
      const start = new Date(item.start_date || new Date().toISOString());
      let end = new Date(item.end_date || "");
      
      // If end date is invalid or same as start, add a day
      if (isNaN(end.getTime()) || end <= start) {
        end = new Date(start);
        end.setDate(end.getDate() + 1);
      }

      return {
        id: item.id,
        name: item.name,
        start: start,
        end: end,
        progress: item.progress || 0,
        dependencies: item.dependencies || [],
        type: "task",
        project: "Project A", 
        hideChildren: false,
        styles: { progressColor: '#3b82f6', progressSelectedColor: '#2563eb' }
      };
    });

    setTasks(newTasks);
  }, [items]);

  return (
    <div className="h-full w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 overflow-x-auto shadow-sm flex flex-col relative min-w-[500px]">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2 z-10">
          Plan
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-2 text-xs mr-2">
            <button 
              onClick={() => setViewMode(ViewMode.Day)}
              className={`px-2 py-1 rounded transition-colors ${viewMode === ViewMode.Day ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Day
            </button>
            <button 
              onClick={() => setViewMode(ViewMode.Week)}
              className={`px-2 py-1 rounded transition-colors ${viewMode === ViewMode.Week ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Week
            </button>
            <button 
              onClick={() => setViewMode(ViewMode.Month)}
              className={`px-2 py-1 rounded transition-colors ${viewMode === ViewMode.Month ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Month
            </button>
          </div>
          {onToggleMaximize && (
            <>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
              <button 
                onClick={onToggleMaximize}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 transition-colors z-10"
                title={isMaximized ? "Minimize" : "Maximize"}
              >
                {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-grow relative h-full min-h-[300px]">
        {tasks.length === 0 ? (
           <div className="absolute inset-0 flex items-center justify-center">
             <div className="text-sm text-slate-400 italic text-center px-4">
               No schedule items defined. ADK Agent will create timelines when dates are discussed.
             </div>
           </div>
        ) : (
          <div className="rounded-lg border border-slate-200 shadow-sm overflow-hidden bg-white">
            <GanttWrapper
              tasks={tasks}
              viewMode={viewMode}
              listCellWidth="150px"
              columnWidth={viewMode === ViewMode.Month ? 150 : 60}
              barCornerRadius={4}
              handleWidth={8}
            />
          </div>
        )}
      </div>
    </div>
  );
}
