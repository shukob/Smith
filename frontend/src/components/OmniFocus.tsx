"use client";

import React, { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase"; // Assumes firebase is initialized here

interface TaskNode {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  assignee: string;
  priority: "high" | "medium" | "low";
}

export default function OmniFocus() {
  const [tasks, setTasks] = useState<TaskNode[]>([]);

  useEffect(() => {
    // We fetch all tasks from Firestore
    // Change "smith_sessions/YOUR_SESSION/tasks" to the dynamic session later
    const q = query(collection(db, "tasks"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => doc.data() as TaskNode);
      // Rough sort: high -> medium -> low
      data.sort((a, b) => {
        const pMap = { high: 1, medium: 2, low: 3 };
        return pMap[a.priority] - pMap[b.priority];
      });
      setTasks(data);
    });

    return () => unsubscribe();
  }, []);

  const columns = [
    { id: "todo", title: "To Do" },
    { id: "in_progress", title: "In Progress" },
    { id: "done", title: "Done" },
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800";
      case "low":
        return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="h-full w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 overflow-y-auto shadow-sm flex flex-col">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 flex-shrink-0">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          Omni Focus
        </h2>
      </div>
      
      {tasks.length === 0 ? (
        <div className="text-sm text-slate-400 italic text-center mt-10">No tasks identified yet. ADK Agent will create them based on the conversation.</div>
      ) : (
        <div className="flex gap-4 h-full min-h-[300px] overflow-x-auto pb-2">
          {columns.map((col) => {
            const columnTasks = tasks.filter((t) => t.status === col.id);
            return (
              <div key={col.id} className="flex flex-col bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 min-w-[250px] flex-1 border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm uppercase tracking-wider">{col.title}</h3>
                  <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs py-0.5 px-2 rounded-full font-medium">
                    {columnTasks.length}
                  </span>
                </div>
                
                <div className="flex flex-col gap-3 overflow-y-auto">
                  {columnTasks.map((task) => (
                    <div 
                      key={task.id} 
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded shadow-sm hover:shadow transition-shadow"
                    >
                      <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">{task.title}</h4>
                      <div className="flex items-center justify-between mt-3">
                        <span className={`text-[10px] px-2 py-1 rounded border uppercase tracking-wide font-medium ${getPriorityColor(task.priority)}`}>
                          {task.priority || "Normal"}
                        </span>
                        {task.assignee && (
                          <div className="flex items-center gap-1">
                            <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                              {task.assignee.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[60px]">
                              {task.assignee}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
