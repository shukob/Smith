"use client";

import React, { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase"; // Assumes firebase is initialized here
import { Gantt, Task, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";

interface ScheduleItem {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  progress: number;
  dependencies: string[];
}

export default function OmniPlan() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);

  useEffect(() => {
    // Change "smith_sessions/YOUR_SESSION/schedule_items" to dynamic session later
    const q = query(collection(db, "schedule_items"), orderBy("start_date", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => doc.data() as ScheduleItem);
      
      const newTasks: Task[] = data.map((item) => {
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
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="h-full w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 overflow-x-auto shadow-sm flex flex-col relative min-w-[500px]">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2 z-10">
          Omni Plan
        </h2>
        <div className="flex gap-2 text-xs">
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
            <Gantt
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
