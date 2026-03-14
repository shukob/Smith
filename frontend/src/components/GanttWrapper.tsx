"use client";

import React from "react";
import { Gantt, GanttProps } from "gantt-task-react";
import "gantt-task-react/dist/index.css";

export default function GanttWrapper(props: GanttProps) {
  return <Gantt {...props} />;
}
