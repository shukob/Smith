"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
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

export interface SessionData {
  requirements: Requirement[];
  summary: MeetingSummary;
  transcript: { role: string; text: string; timestamp: string }[];
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

  return { requirements, summary, isLoading };
}
