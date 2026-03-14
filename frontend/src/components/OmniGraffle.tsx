"use client";

import React, { useEffect, useState, useCallback } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase"; // Assumes firebase is initialized here
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface ArchElement {
  id: string;
  type: "node" | "edge";
  label?: string;
  source?: string;
  target?: string;
}

export default function OmniGraffle() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    // We fetch architecture elements from Firestore
    // Change "smith_sessions/YOUR_SESSION/architecture_elements" to dynamic session later
    const q = query(collection(db, "architecture_elements"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => doc.data() as ArchElement);
      
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      
      // Auto-layout simple grid
      let x = 100;
      let y = 100;

      data.forEach((element, index) => {
        if (element.type === "node") {
          // Attempt to keep existing positions if they are already in state, else auto-place
          const existingNode = nodes.find(n => n.id === element.id);
          
          newNodes.push({
            id: element.id,
            position: existingNode ? existingNode.position : { x: x + (index % 3) * 200, y: y + Math.floor(index / 3) * 150 },
            data: { label: element.label || "System Node" },
            style: { 
              background: '#fff', 
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }
          });
        } else if (element.type === "edge" && element.source && element.target) {
          newEdges.push({
            id: element.id,
            source: element.source,
            target: element.target,
            animated: true,
            style: { stroke: '#94a3b8', strokeWidth: 2 },
          });
        }
      });

      setNodes(newNodes);
      setEdges(newEdges);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="h-full w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm flex flex-col relative">
      <div className="absolute top-4 left-4 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          Omni Graffle
        </h2>
      </div>

      {nodes.length === 0 && edges.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="text-sm text-slate-400 italic text-center px-4 bg-white/50 backdrop-blur-sm rounded pb-20">
            No architecture mapped yet. ADK Agent will create diagrams when systems are discussed.
          </div>
        </div>
      ) : null}

      <div className="flex-grow w-full h-full min-h-[400px]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          connectionMode={ConnectionMode.Loose}
          fitView
          attributionPosition="bottom-right"
        >
          <Controls className="fill-slate-500 bg-white border-slate-200 shadow-sm" />
          <MiniMap 
            nodeColor="#cbd5e1" 
            maskColor="rgba(241, 245, 249, 0.7)" 
            className="border border-slate-200 shadow-sm rounded-lg overflow-hidden bg-slate-50"
          />
          <Background color="#cbd5e1" gap={20} size={1.5} />
        </ReactFlow>
      </div>
    </div>
  );
}
