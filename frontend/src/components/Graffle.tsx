"use client";

import React, { useEffect, useState, useCallback } from "react";
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
import { Maximize2, Minimize2 } from "lucide-react";
import "@xyflow/react/dist/style.css";

export interface ArchitectureElement {
  id: string;
  type: "node" | "edge";
  label?: string;
  source?: string;
  target?: string;
  position?: { x: number; y: number };
}

interface GraffleProps {
  elements: ArchitectureElement[];
  onUpdateElement?: (id: string, updates: Partial<ArchitectureElement>) => void;
  onDeleteElement?: (id: string) => void;
  onAddElement?: (type: ArchitectureElement["type"]) => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

export default function Graffle({ elements, onUpdateElement, onDeleteElement, onAddElement, isMaximized, onToggleMaximize }: GraffleProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    let x = 100;
    let y = 100;

    setNodes((prevNodes) => {
      return elements
        .filter(el => el.type === "node")
        .map((element, index) => {
          const existingNode = prevNodes.find(n => n.id === element.id);
          return {
            id: element.id,
            position: element.position || existingNode?.position || { x: x + (index % 3) * 200, y: y + Math.floor(index / 3) * 150 },
            data: { label: element.label || "System Node" },
            style: { 
              background: '#fff', 
              color: '#1e293b',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }
          };
      });
    });

    setEdges(() => {
      return elements
        .filter(el => el.type === "edge" && el.source && el.target)
        .map((element) => ({
          id: element.id,
          source: element.source!,
          target: element.target!,
          animated: true,
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        }));
    });
  }, [elements, setNodes, setEdges]); 

  const onNodesDelete = useCallback((deleted: Node[]) => {
    if (onDeleteElement) {
      deleted.forEach(node => onDeleteElement(node.id));
    }
  }, [onDeleteElement]);

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    if (onDeleteElement) {
      deleted.forEach(edge => onDeleteElement(edge.id));
    }
  }, [onDeleteElement]);

  // Handle local dragging updates
  const onNodeDragStop = useCallback((event: any, node: Node) => {
    if (onUpdateElement) {
      onUpdateElement(node.id, {
        position: node.position
      });
    }
  }, [onUpdateElement]);

  return (
    <div className="h-full w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2 overflow-hidden shadow-sm flex flex-col relative min-h-[300px]">
      <div className="flex items-center justify-between mb-2 px-2 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded py-1">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            Graffle
          </h2>
          {onAddElement && (
            <div className="flex items-center gap-1">
              <button 
                onClick={() => onAddElement("node")}
                className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded transition-colors"
                title="Add Node"
              >
                + Node
              </button>
              <button 
                onClick={() => onAddElement("edge")}
                className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded transition-colors"
                title="Add Edge"
              >
                + Edge
              </button>
            </div>
          )}
        </div>
        {onToggleMaximize && (
          <>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1" />
            <button 
              onClick={onToggleMaximize}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 transition-colors"
              title={isMaximized ? "Minimize" : "Maximize"}
            >
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </>
        )}
      </div>

      <div className="flex-grow w-full h-full min-h-[400px]">
        <style dangerouslySetInnerHTML={{__html: `
          .react-flow__controls { box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 6px; overflow: hidden; }
          .react-flow__controls-button { background: #fff; border-bottom: 1px solid #e2e8f0; fill: #64748b; }
          .react-flow__controls-button:hover { background: #f8fafc; }
          .react-flow__minimap { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .react-flow__minimap-mask { fill: rgba(241, 245, 249, 0.7); }
          
          :is(.dark) .react-flow__controls-button { background: #1e293b; border-bottom: 1px solid #334155; fill: #94a3b8; }
          :is(.dark) .react-flow__controls-button:hover { background: #334155; }
          :is(.dark) .react-flow__minimap { background: #1e293b; border: 1px solid #334155; }
          :is(.dark) .react-flow__minimap-mask { fill: rgba(15, 23, 42, 0.7); }
          :is(.dark) .react-flow__attribution { background: rgba(15, 23, 42, 0.5); color: #94a3b8; }
          :is(.dark) .react-flow__attribution a { color: #cbd5e1; }
        `}} />
          <ReactFlow 
            nodes={nodes} 
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onNodeDragStop={onNodeDragStop}
            connectionMode={ConnectionMode.Loose}
            fitView 
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.5}
            maxZoom={2}
            attributionPosition="bottom-right"
          >
          <Controls showInteractive={false} />
          <MiniMap 
            nodeColor={(node: any) => document.documentElement.classList.contains('dark') ? '#475569' : '#cbd5e1'}
          />
          <Background color="#cbd5e1" gap={20} size={1.5} />
        </ReactFlow>
      </div>
    </div>
  );
}
