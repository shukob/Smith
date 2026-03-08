"use client";

import type { Requirement } from "@/hooks/useFirestore";

interface RequirementsListProps {
  requirements: Requirement[];
}

const priorityColors = {
  high: "text-[var(--color-danger)]",
  medium: "text-[var(--color-warning)]",
  low: "text-[var(--color-text-muted)]",
};

const statusBadge = {
  proposed: "bg-blue-900/50 text-blue-300",
  confirmed: "bg-green-900/50 text-green-300",
  needs_clarification: "bg-yellow-900/50 text-yellow-300",
  rejected: "bg-red-900/50 text-red-300",
};

export function RequirementsList({ requirements }: RequirementsListProps) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-[var(--color-text-muted)] px-4 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
        Requirements
        <span className="text-xs font-normal">{requirements.length} items</span>
      </h2>
      <div className="flex-1 overflow-y-auto">
        {requirements.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] italic p-4">
            Requirements will appear here as they are discussed...
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-left px-4 py-2 font-medium">ID</th>
                <th className="text-left px-4 py-2 font-medium">Title</th>
                <th className="text-left px-4 py-2 font-medium">Priority</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((req) => (
                <tr
                  key={req.id}
                  className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-xs text-[var(--color-text-muted)]">
                    {req.id}
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{req.title}</div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {req.description}
                    </div>
                  </td>
                  <td className={`px-4 py-2 capitalize ${priorityColors[req.priority]}`}>
                    {req.priority}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs ${statusBadge[req.status]}`}
                    >
                      {req.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
