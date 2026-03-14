"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Requirement {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: "functional" | "non-functional" | "constraint" | "assumption";
  status: "proposed" | "confirmed" | "needs_clarification" | "rejected";
  created_at?: string;
  updated_at?: string;
}

export interface MeetingSummary {
  text: string;
  topics_discussed: string[];
  last_updated: string;
}

export interface OutlineNode {
  id: string;
  parent_id: string;
  text: string;
  type: "requirement" | "goal" | "assumption" | "note";
  order: number;
}

export interface ArchElement {
  id: string;
  type: "node" | "edge";
  label?: string;
  source?: string;
  target?: string;
}

export interface TaskNode {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  assignee: string;
  priority: "high" | "medium" | "low";
}

export interface ScheduleItem {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  progress: number;
  dependencies: string[];
}

export interface SessionData {
  requirements: Requirement[];
  summary: MeetingSummary;
  transcript: { role: string; text: string; timestamp: string }[];
  outline_nodes: OutlineNode[];
  architecture_elements: ArchElement[];
  tasks: TaskNode[];
  schedule_items: ScheduleItem[];
  metadata?: { created: string; status: string; name?: string };
}

/**
 * Hook for real-time Firestore session data.
 * Listens to smith_sessions/{sessionId} via onSnapshot.
 */
export function useFirestore(sessionId: string | null) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [summary, setSummary] = useState<MeetingSummary>({
    text: "",
    topics_discussed: [],
    last_updated: "",
  });
  const [outlineNodes, setOutlineNodes] = useState<OutlineNode[]>([]);
  const [archElements, setArchElements] = useState<ArchElement[]>([]);
  const [tasks, setTasks] = useState<TaskNode[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [transcript, setTranscript] = useState<SessionData["transcript"]>([]);
  const [metadata, setMetadata] = useState<SessionData["metadata"]>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }

    const docRef = doc(db, "smith_sessions", sessionId);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setRequirements(data.requirements || []);
          setSummary(
            data.summary || {
              text: "",
              topics_discussed: [],
              last_updated: "",
            }
          );
          setOutlineNodes(data.outline_nodes || []);
          setArchElements(data.architecture_elements || []);
          setTasks(data.tasks || []);
          setScheduleItems(data.schedule_items || []);
          setTranscript(data.transcript || []);
          setMetadata(data.metadata);
        }
        setIsLoading(false);
      },
      (error) => {
        console.error("[Firestore] Snapshot error:", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [sessionId]);

  return { 
    requirements, 
    summary, 
    outlineNodes, 
    archElements, 
    tasks, 
    scheduleItems, 
    transcript,
    metadata,
    isLoading 
  };
}

export function useSessionsList() {
  const [sessions, setSessions] = useState<{ id: string; metadata: SessionData["metadata"] }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "smith_sessions"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const results = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            metadata: data.metadata,
          };
        });
        // Sort in memory since indexing might require composite index setup on Firebase
        results.sort((a, b) => {
          const tA = new Date(a.metadata?.created || 0).getTime();
          const tB = new Date(b.metadata?.created || 0).getTime();
          return tB - tA; // descending
        });
        setSessions(results);
        setIsLoading(false);
      },
      (error) => {
        console.error("[Firestore] Sessions list error:", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { sessions, isLoading };
}
