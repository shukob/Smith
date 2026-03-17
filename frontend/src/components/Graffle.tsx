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
  Handle,
  Position,
} from "@xyflow/react";
import { Maximize2, Minimize2, Database, Square, Circle, Triangle, AppWindow } from "lucide-react";
import "@xyflow/react/dist/style.css";

export interface ArchitectureElement {
  id: string;
  type: "node" | "edge";
  label?: string;
  source?: string;
  target?: string;
  shape?: "rectangle" | "rounded" | "circle" | "diamond" | "database";
  position?: { x: number; y: number };
}

interface GraffleProps {
  elements: ArchitectureElement[];
  onUpdateElement?: (id: string, updates: Partial<ArchitectureElement>) => void;
  onDeleteElement?: (id: string) => void;
  onAddElement?: (type: ArchitectureElement["type"], shape?: ArchitectureElement["shape"]) => void;
  onSetFocus?: (elementId: string | null, action: string | null) => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

const ShapeNode = ({ data, selected }: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.label);

  useEffect(() => {
    setEditValue(data.label);
  }, [data.label]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editValue !== data.label && data.onUpdateElement && data.id) {
      data.onUpdateElement(data.id, { label: editValue });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const shape = data.shape || "rectangle";
  const isSelectedStyle = selected ? "ring-2 ring-indigo-500" : "";
  const textColor = "text-slate-700 dark:text-slate-200";
  const bgColor = "bg-white dark:bg-slate-800";
  const borderColor = "border border-slate-300 dark:border-slate-600";
  
  if (shape === "diamond") {
    return (
      <div className={`relative w-16 h-16 pointer-events-auto`} onDoubleClick={handleDoubleClick}>
         <div className={`absolute inset-0 flex items-center justify-center rotate-45 ${bgColor} ${borderColor} shadow-sm rounded-sm ${isSelectedStyle}`} style={{ borderStyle: 'solid', borderWidth: '1px' }}></div>
         <div className={`absolute inset-0 flex items-center justify-center p-1 text-center text-[9px] font-medium z-10 ${textColor}`}>
            {isEditing ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent border-none outline-none focus:ring-0 text-center p-0 m-0"
                style={{ fontSize: '9px' }}
              />
            ) : (
              <span className="line-clamp-2">{data.label}</span>
            )}
         </div>
         <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !-top-1 !z-20" />
         <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !-bottom-1 !z-20" />
         <Handle type="source" position={Position.Left} id="left" className="!w-1.5 !h-1.5 !-left-1 !z-20" />
         <Handle type="source" position={Position.Right} id="right" className="!w-1.5 !h-1.5 !-right-1 !z-20" />
      </div>
    );
  }

  if (shape === "database") {
    return (
      <div className={`relative w-20 h-24 pointer-events-auto ${isSelectedStyle}`} onDoubleClick={handleDoubleClick}>
         <svg className={`absolute inset-0 w-full h-full fill-white dark:fill-slate-800 stroke-slate-300 dark:stroke-slate-600 drop-shadow-sm`} strokeWidth="1" viewBox="0 0 100 120" preserveAspectRatio="none">
            <path d="M 0 20 C 0 0, 100 0, 100 20 L 100 100 C 100 120, 0 120, 0 100 Z" />
            <ellipse cx="50" cy="20" rx="49" ry="10" fill="none" stroke="inherit" />
         </svg>
         <div className={`absolute inset-0 flex items-center justify-center px-1 text-center text-[9px] font-medium z-10 ${textColor}`}>
            {isEditing ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="w-full mt-3 bg-transparent border-none outline-none focus:ring-0 text-center p-0 m-0"
                style={{ fontSize: '9px' }}
              />
            ) : (
              <span className="mt-3 line-clamp-3">{data.label}</span>
            )}
         </div>
         <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !top-0 !z-20" />
         <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bottom-0 !z-20" />
         <Handle type="source" position={Position.Left} id="left" className="!w-1.5 !h-1.5 !z-20" />
         <Handle type="source" position={Position.Right} id="right" className="!w-1.5 !h-1.5 !z-20" />
      </div>
    );
  }

  const baseClasses = `relative flex items-center justify-center text-center text-[10px] font-medium shadow-sm transition-shadow ${bgColor} ${borderColor} ${textColor} ${isSelectedStyle} pointer-events-auto`;
  
  let shapeClass = "";
  if (shape === "rectangle") shapeClass = "w-24 h-12 rounded-sm px-2";
  if (shape === "rounded") shapeClass = "w-24 h-12 rounded-xl px-2";
  if (shape === "circle") shapeClass = "w-16 h-16 rounded-full p-2";

  return (
    <div className={`${baseClasses} ${shapeClass}`} style={{ borderStyle: 'solid', borderWidth: '1px' }} onDoubleClick={handleDoubleClick}>
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5" />
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent border-none outline-none focus:ring-0 text-center p-0 m-0"
          style={{ fontSize: '10px' }}
        />
      ) : (
        <span className="line-clamp-3">{data.label}</span>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Left} id="left" className="!w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Right} id="right" className="!w-1.5 !h-1.5" />
    </div>
  );
};

const nodeTypes = {
  customShape: ShapeNode,
};

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
            type: "customShape",
            position: element.position || existingNode?.position || { x: x + (index % 3) * 200, y: y + Math.floor(index / 3) * 150 },
            data: { 
              id: element.id,
              label: element.label || "System Node", 
              shape: element.shape || "rectangle",
              onUpdateElement: onUpdateElement
            },
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
  }, [elements, setNodes, setEdges, onUpdateElement]); 

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
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded p-0.5">
                <button 
                  onClick={() => onAddElement("node", "rectangle")}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                  title="Rectangle"
                >
                  <Square size={14} />
                </button>
                <button 
                  onClick={() => onAddElement("node", "rounded")}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                  title="Rounded Rectangle"
                >
                  <AppWindow size={14} />
                </button>
                <button 
                  onClick={() => onAddElement("node", "circle")}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                  title="Circle"
                >
                  <Circle size={14} />
                </button>
                <button 
                  onClick={() => onAddElement("node", "diamond")}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                  title="Decision / Diamond"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-diamond"><path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"/></svg>
                </button>
                <button 
                  onClick={() => onAddElement("node", "database")}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                  title="Database"
                >
                  <Database size={14} />
                </button>
              </div>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
              <button 
                onClick={() => onAddElement("edge")}
                className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded transition-colors"
                title="Add Edge/Connection"
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
            nodeTypes={nodeTypes}
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
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
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
