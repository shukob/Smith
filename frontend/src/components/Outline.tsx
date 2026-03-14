"use client";

import React, { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, Circle, CheckCircle, Maximize2, Minimize2 } from "lucide-react";

interface OutlineNode {
  id: string;
  parent_id: string;
  text: string;
  type: "requirement" | "goal" | "assumption" | "note";
  order: number;
}

interface OutlineProps {
  nodes: OutlineNode[];
  onEditNode?: (id: string, newText: string) => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

function OutlineNodeItem({ 
  node, 
  onEdit 
}: { 
  node: OutlineNode; 
  onEdit?: (id: string, newText: string) => void;
}) {
  const [text, setText] = useState(node.text);

  useEffect(() => {
    setText(node.text);
  }, [node.text]);

  const handleCommit = () => {
    if (text !== node.text && onEdit) {
      onEdit(node.id, text);
    }
  };

  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="text-sm font-medium text-slate-700 dark:text-slate-200 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1 w-full"
    />
  );
}

export default function Outline({ nodes, onEditNode, isMaximized, onToggleMaximize }: OutlineProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Auto-expand all incoming nodes by default
    setExpanded(new Set(nodes.map((n) => n.id)));
  }, [nodes]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpanded(newExpanded);
  };

  const renderTree = (parentId: string, depth = 0) => {
    const children = nodes.filter((n) => (n.parent_id || "") === parentId);
    
    if (children.length === 0) return null;

    return (
      <ul className={`pl-${depth > 0 ? 4 : 0}`}>
        {children.map((node) => {
          const hasChildren = nodes.some((n) => n.parent_id === node.id);
          const isExpanded = expanded.has(node.id);

          return (
            <li key={node.id} className="my-1">
              <div className="flex items-center gap-2 group p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                {/* Expand/Collapse Toggle */}
                {hasChildren ? (
                  <button onClick={() => toggleExpand(node.id)} className="text-slate-500 hover:text-slate-800 focus:outline-none">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                ) : (
                  <span className="w-3.5 inline-block" /> // Spacer
                )}

                {/* Icon based on type */}
                {node.type === "goal" && <CheckCircle size={14} className="text-green-500 shrink-0" />}
                {node.type === "requirement" && <Circle size={14} className="text-blue-500 fill-blue-100 shrink-0" />}
                {node.type === "assumption" && <Circle size={14} className="text-orange-500 border-dashed shrink-0" />}
                {node.type === "note" && <Circle size={14} className="text-slate-400 shrink-0" />}

                {/* Text Input */}
                <div className="flex-1 min-w-0">
                  <OutlineNodeItem node={node} onEdit={onEditNode} />
                </div>

                {/* Type badge */}
                <span className="ml-auto opacity-0 group-hover:opacity-100 text-[10px] uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                  {node.type}
                </span>
              </div>

              {/* Recursive Children */}
              {isExpanded && renderTree(node.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="h-full w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 overflow-y-auto shadow-sm flex flex-col">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          Outline
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
      <div className="flex-1 overflow-y-auto pr-2">
        {nodes.length === 0 ? (
          <div className="text-sm text-slate-400 italic text-center mt-10">No items in outline yet. Start speaking requirements!</div>
        ) : (
          renderTree("") // Start with root elements (empty parent_id)
        )}
      </div>
    </div>
  );
}
