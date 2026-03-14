"use client";

import React, { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase"; // Assumes firebase is initialized here
import { ChevronRight, ChevronDown, Circle, CheckCircle } from "lucide-react";

interface OutlineNode {
  id: string;
  parent_id: string;
  text: string;
  type: "requirement" | "goal" | "assumption" | "note";
  order: number;
}

export default function OmniOutline() {
  const [nodes, setNodes] = useState<OutlineNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    // We fetch all nodes and build the tree locally
    // Change "smith_sessions/YOUR_SESSION/outline_nodes" to the dynamic session later
    // For now, assuming a global collection or we need to pass sessionId as prop.
    // We'll just listen to "outline_nodes" as a top-level collection for simplicity in this demo.
    const q = query(collection(db, "outline_nodes"), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => doc.data() as OutlineNode);
      setNodes(data);
      
      // Auto-expand all by default
      setExpanded(new Set(data.map((n) => n.id)));
    });

    return () => unsubscribe();
  }, []);

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
                {node.type === "goal" && <CheckCircle size={14} className="text-green-500" />}
                {node.type === "requirement" && <Circle size={14} className="text-blue-500 fill-blue-100" />}
                {node.type === "assumption" && <Circle size={14} className="text-orange-500 border-dashed" />}
                {node.type === "note" && <Circle size={14} className="text-slate-400" />}

                {/* Text */}
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {node.text}
                </span>

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
    <div className="h-full w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 overflow-y-auto shadow-sm">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          Omni Outline
        </h2>
      </div>
      {nodes.length === 0 ? (
        <div className="text-sm text-slate-400 italic text-center mt-10">No items in outline yet. Start speaking requirements!</div>
      ) : (
        renderTree("") // Start with root elements (empty parent_id)
      )}
    </div>
  );
}
