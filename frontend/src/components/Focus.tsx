"use client";

import React, { useEffect, useState, useRef } from "react";

interface TaskNode {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  assignee: string;
  priority: "high" | "medium" | "low";
}

interface FocusProps {
  initialTasks: TaskNode[];
  onEditTask?: (id: string, newTitle: string) => void;
  onUpdateTaskProperty?: (id: string, property: keyof TaskNode, value: string) => void;
  onDeleteTask?: (id: string) => void;
  onAddTask?: (status: TaskNode["status"]) => void;
  onSetFocus?: (elementId: string | null, action: string | null) => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

function EditableTaskTitle({
  task,
  onEdit,
  onSetFocus
}: {
  task: TaskNode;
  onEdit?: (id: string, newTitle: string) => void;
  onSetFocus?: (elementId: string | null, action: string | null) => void;
}) {
  const [title, setTitle] = useState(task.title);

  useEffect(() => {
    setTitle(task.title);
  }, [task.title]);

  const handleCommit = () => {
    if (title !== task.title && onEdit) {
      onEdit(task.id, title);
    }
  };

  return (
    <input
      type="text"
      value={title}
      onFocus={() => onSetFocus?.(task.id, "editing_text")}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={(e) => {
        handleCommit();
        onSetFocus?.(null, null);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-transparent border-none focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-700 rounded w-full mb-2 truncate"
    />
  );
}

import { Trash2, AlertCircle, Clock, CheckCircle2, User, Circle, Maximize2, Minimize2 } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

export default function Focus({ 
  initialTasks, 
  onEditTask, 
  onUpdateTaskProperty,
  onDeleteTask,
  onAddTask,
  onSetFocus,
  isMaximized, 
  onToggleMaximize 
}: FocusProps) {
  const [tasks, setTasks] = useState<TaskNode[]>([]);
  const [mounted, setMounted] = useState(false);
  const localUpdatesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setTasks(prev => {
      const now = Date.now();
      
      // Sync from Server, preserving local order
      const nextTasks = prev.map(pt => {
         const serverTask = initialTasks.find(it => it.id === pt.id);
         if (!serverTask) return null; // deleted on server
         
         const lastLocalMod = localUpdatesRef.current[pt.id] || 0;
         const isLocked = (now - lastLocalMod) < 4000; // 4 second lock
         
         // If locked, keep local state completely. Else use server task.
         return isLocked ? pt : serverTask;
      }).filter(Boolean) as TaskNode[];

      // Add any tasks that are new from the server
      initialTasks.forEach(st => {
         if (!prev.find(pt => pt.id === st.id)) {
            nextTasks.push(st);
         }
      });

      // If lengths or ids are fundamentally different (we have no prev state), apply sort
      if (prev.length === 0) {
        return nextTasks.sort((a, b) => {
          const pMap = { high: 1, medium: 2, low: 3 };
          return pMap[a.priority] - pMap[b.priority];
        });
      }

      return nextTasks;
    });
  }, [initialTasks]);

  const updateTaskLocally = (id: string, updates: Partial<TaskNode>) => {
    localUpdatesRef.current[id] = Date.now();
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const columns = [
    { id: "todo", title: "To Do" },
    { id: "in_progress", title: "In Progress" },
    { id: "done", title: "Done" },
  ];

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    // Optimistically update the UI to prevent rubber-banding
    const newTasks = [...tasks];
    const taskIndex = newTasks.findIndex(t => t.id === draggableId);
    if (taskIndex === -1) return;

    localUpdatesRef.current[draggableId] = Date.now();
    const [movedTask] = newTasks.splice(taskIndex, 1);
    
    // If moving to a different status column, update the status
    if (destination.droppableId !== source.droppableId) {
      movedTask.status = destination.droppableId as TaskNode["status"];
      
      if (onUpdateTaskProperty) {
        onUpdateTaskProperty(draggableId, "status", destination.droppableId as TaskNode["status"]);
      }
    }

    // Insert at the new index relative to the destination column
    // First, find where this index maps to in the overall 'newTasks' array
    const destColumnTasks = newTasks.filter(t => t.status === destination.droppableId);
    
    if (destination.index >= destColumnTasks.length) {
      // Place at the end of the destination column
      newTasks.push(movedTask);
    } else {
      // Place before the element that is currently at the destination index
      const destTaskOverwritten = destColumnTasks[destination.index];
      const absoluteDestIndex = newTasks.findIndex(t => t.id === destTaskOverwritten.id);
      newTasks.splice(absoluteDestIndex, 0, movedTask);
    }
    
    setTasks(newTasks);
  };

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
          Kanban
        </h2>
        {onToggleMaximize && (
          <button
            onClick={onToggleMaximize}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 transition-colors"
            title={isMaximized ? "Minimize" : "Maximize"}
          >
            {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        )}
      </div>
      
      <div className="flex gap-4 h-full min-h-[300px] overflow-x-auto pb-2">
        {mounted && (
          <DragDropContext onDragEnd={onDragEnd}>
            {columns.map((col) => {
              const columnTasks = tasks.filter((t) => t.status === col.id);
              return (
                  <div 
                    key={col.id}
                    className="flex flex-col bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 min-w-[250px] flex-1 border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm uppercase tracking-wider">{col.title}</h3>
                      <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs py-0.5 px-2 rounded-full font-medium">
                        {columnTasks.length}
                      </span>
                    </div>
                    
                    <Droppable droppableId={col.id}>
                      {(provided) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="flex flex-col gap-3 overflow-y-auto flex-1 min-h-[50px]"
                        >
                          {columnTasks.map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided) => (
                                <div 
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className="group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded shadow-sm hover:shadow transition-shadow relative"
                                  style={provided.draggableProps.style}
                                >
                                  {onDeleteTask && (
                                    <button
                                      onClick={() => onDeleteTask(task.id)}
                                      className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Delete task"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                  
                                  <div className="pr-6">
                                    <EditableTaskTitle task={task} onEdit={onEditTask} onSetFocus={onSetFocus} />
                                  </div>
                                  
                                  <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                                    {/* Priority Selector */}
                                    <div className="relative group/priority">
                                      <select
                                        value={task.priority}
                                        onChange={(e) => {
                                          if (onUpdateTaskProperty) {
                                            updateTaskLocally(task.id, { priority: e.target.value as TaskNode["priority"] });
                                            onUpdateTaskProperty(task.id, "priority", e.target.value);
                                          }
                                        }}
                                        disabled={!onUpdateTaskProperty}
                                        className={`appearance-none text-[10px] pl-2 pr-6 py-1 rounded border uppercase tracking-wide font-medium cursor-pointer outline-none ${getPriorityColor(task.priority)} ${!onUpdateTaskProperty ? 'cursor-default' : ''}`}
                                      >
                                        <option value="high">HIGH</option>
                                        <option value="medium">MEDIUM</option>
                                        <option value="low">LOW</option>
                                      </select>
                                      <AlertCircle size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                                    </div>

                                    {/* Status Selector */}
                                    <div className="relative group/status hidden group-hover:block transition-all">
                                      <select
                                        value={task.status}
                                        onChange={(e) => {
                                          if (onUpdateTaskProperty) {
                                            updateTaskLocally(task.id, { status: e.target.value as TaskNode["status"] });
                                            onUpdateTaskProperty(task.id, "status", e.target.value);
                                          }
                                        }}
                                        disabled={!onUpdateTaskProperty}
                                        className={`appearance-none text-[10px] pl-2 pr-5 py-1 rounded border cursor-pointer outline-none bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600`}
                                      >
                                        <option value="todo">To Do</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="done">Done</option>
                                      </select>
                                      {task.status === "todo" && <Circle size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />}
                                      {task.status === "in_progress" && <Clock size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none text-blue-500" />}
                                      {task.status === "done" && <CheckCircle2 size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none text-green-500" />}
                                    </div>

                                    {/* Assignee Input */}
                                    <div className="flex items-center gap-1">
                                      <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-[10px] font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
                                        {task.assignee ? task.assignee.charAt(0).toUpperCase() : <User size={10} />}
                                      </div>
                                      {onUpdateTaskProperty ? (
                                        <input
                                          type="text"
                                          value={task.assignee || ""}
                                          onChange={(e) => {
                                            updateTaskLocally(task.id, { assignee: e.target.value });
                                            onUpdateTaskProperty(task.id, "assignee", e.target.value);
                                          }}
                                          placeholder="Assignee"
                                          className="text-xs text-slate-500 dark:text-slate-400 bg-transparent border-none outline-none w-[70px] hover:bg-slate-50 focus:bg-slate-50 dark:hover:bg-slate-700 dark:focus:bg-slate-700 rounded px-1 transition-colors"
                                        />
                                      ) : (
                                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[60px]">
                                          {task.assignee || "Unassigned"}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                    
                    {onAddTask && (
                      <button
                        onClick={() => onAddTask(col.id as TaskNode["status"])}
                        className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded transition-colors border border-transparent hover:border-slate-300 dark:hover:border-slate-600 border-dashed"
                      >
                        <span>+ Add Task</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </DragDropContext>
          )}
        </div>
      </div>
    );
}
