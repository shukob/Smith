# Smith - Demo Video Script (4 minutes)

## 0:00-0:50 — The Problem & Vision (Narration over slides/screen)

"Designing software architecture is hard. It takes years of experience to know which components to choose, how they connect, and what trade-offs matter. For most developers — especially those just starting out — it's overwhelming.

What if you could just talk about your idea, and have a senior architect guide you through the process — visually, interactively, in real-time?

That's Smith. It's not just a chatbot that generates documents. It's an AI technical consultant that works alongside you — co-editing requirements, architecture diagrams, task boards, and project timelines as you speak. Think of it as pair-architecture with an AI.

And here's the bigger picture: once your architecture, requirements, and tasks are structured and validated through this conversation, you can hand that data directly to a coding agent to start building. Smith bridges the gap between a rough idea and automated development."

## 0:50-1:10 — Quick Product Overview (Screen recording)

"Let me show you how it works. On the left, you have a real-time voice conversation with your AI architect. On the right, four live dashboards that you and the AI co-edit together — an outline of requirements, a system architecture diagram, a task board, and a project timeline.

Everything updates in real-time. You can speak and the AI organizes. You can also directly edit any pane — drag nodes, rename tasks, adjust timelines — and the AI sees your changes and adapts."

## 1:10-3:10 — Live Demo (Screen + mic recording)

*(Start a new session, begin speaking)*

"Let's design a shift management system for a restaurant chain."

*(AI responds as a consultant, asks clarifying questions)*

*(Outline begins populating with requirements)*

"We need to optimize employee schedules across 50 locations, with constraints like labor law compliance and employee preferences."

*(Architecture diagram populates — show pane auto-maximizing)*

"What kind of architecture would you recommend?"

*(AI suggests microservices, diagram updates with nodes and edges)*

*(Show task board getting populated with action items)*

"We want an MVP in 3 months."

*(Gantt chart populates with timeline)*

*(Manually edit a node on the architecture diagram)*

"Watch — I just renamed a component directly. The AI notices and incorporates my edit into the conversation. This is true co-editing, not just AI generating and you reading."

*(Switch language from EN to JP to show bilingual support)*

"And it works in Japanese too — voice, dashboard content, everything switches."

## 3:10-3:45 — How It Works (Narration over architecture diagram)

"Under the hood, Smith runs on Gemini Live API for real-time voice — native audio processing with no speech-to-text pipeline. Audio in, audio out.

A Background Agent powered by Gemini Flash watches the conversation and infers what should appear on the dashboard — even things you mentioned implicitly.

Both agents write to Firestore with transaction safety, so concurrent edits from you and the AI never conflict. The frontend syncs instantly via snapshot listeners."

## 3:45-4:00 — Closing & Future Vision (Narration)

"Smith makes architecture design accessible to everyone. Talk about your idea, get expert guidance, and walk away with structured, validated project artifacts.

And that structured output? It's ready to be fed into coding agents for automated development.

From conversation to code — that's the future Smith is building toward."
