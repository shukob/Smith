# Smith - DevPost Submission Reference

## Project Name
**Smith - Speculative Turn-taking S2S Technical Consultant**

## Tagline (short)
AI architect that conducts voice meetings with semantic interruption detection and auto-generates structured project artifacts in real-time.

## URL
https://cogent-silicon-489609-d0.web.app/

## Repository
https://github.com/anthropics/smith (or wherever hosted)

---

## What it does

Smith is an AI technical consultant that conducts requirements definition and architecture design meetings through natural voice conversation. As you discuss your project, Smith:

1. **Listens and responds as a senior IT architect** - concise, expert-level guidance
2. **Detects interruptions semantically** (Speculative Turn-taking) - distinguishes "uh-huh" from real disagreements using embedding cosine distance, not just volume
3. **Auto-generates 4 structured dashboards** in real-time:
   - **Outline**: Hierarchical requirements/goals/assumptions tree
   - **Architecture**: System component diagram (nodes + edges)
   - **Tasks**: Kanban board (todo/in_progress/done)
   - **Schedule**: Gantt chart with milestones and dependencies
4. **Supports bidirectional editing** - users can manually edit any pane; the AI notices and adapts
5. **Bilingual** - Japanese and English, switchable mid-session

---

## Inspiration

Every voice AI suffers from the same UX problem: **false interruptions**. Say "uh-huh" while the AI talks, and it stops mid-sentence. Whisper a genuine objection, and it doesn't notice. We asked: what if the AI could predict what you're about to say, and only yield the floor when you actually disagree?

Traditional approaches use volume-based VAD (Voice Activity Detection). Smith introduces **Speculative Turn-taking** - a semantic layer that predicts, embeds, and compares in real-time.

---

## How we built it

### Architecture

```
Browser (Next.js + Firebase Auth)
  | WebSocket (PCM16 audio + JSON)
  v
Cloud Run (FastAPI, Python)
  |-- GeminiLiveClient --> Gemini Live API (native audio)
  |     Voice I/O + 7 Function Tools
  |-- SpeculativeEngine --> Gemini Flash (predictions)
  |     DivergenceDetector (Gemini Embeddings, cosine distance)
  |-- BackgroundAgent --> Gemini Flash (dashboard inference)
  |     Event-driven, 2s debounce
  |-- FirestoreWriter --> Cloud Firestore
  v                          ^
Browser listens via onSnapshot (real-time sync)
```

### Speculative Turn-taking Algorithm

```
AI Speaking Phase:
  1. Gemini Flash predicts likely user responses (~500ms, async)
  2. Predictions embedded via Gemini Embeddings (~10ms)
  3. Embeddings cached in memory

User Speaks During AI Output:
  4. input_transcription -> partial text
  5. Partial text embedded (~10ms)
  6. Cosine distance vs prediction embeddings:
     < 0.3 -> IGNORE (backchannel: "uh-huh", "I see")
     0.3-0.6 -> MONITOR (ambiguous, wait for more tokens)
     > 0.6 -> INTERRUPT (real disagreement -> AI yields floor)
```

**Total decision latency: ~10-15ms** (prediction is pre-computed; only fast embedding comparison runs in real-time).

### Three Parallel Agents

| Agent | Model | Role |
|-------|-------|------|
| GeminiLiveClient | gemini-2.5-flash-native-audio-preview-12-2025 | Voice conversation + function calling (7 tools) |
| SpeculativeEngine | gemini-2.5-flash + gemini-embedding-2-preview | Prediction + semantic divergence detection |
| BackgroundAgent | gemini-2.5-flash | Infers implicit context, updates dashboard (event-driven, 2s debounce) |

### Tech Stack

**Backend**: Python 3.14, FastAPI, google-genai SDK, firebase-admin, Cloud Run (4GB RAM)
**Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS 4, @xyflow/react (architecture diagram), gantt-task-react (Gantt chart), dnd-kit (drag-and-drop)
**Infrastructure**: GCP Cloud Run, Cloud Firestore (transaction-safe upserts), Firebase Auth (Google OAuth), Firebase Hosting
**AI/ML**: Gemini Live API, Gemini Flash, Gemini Embeddings, scipy (cosine distance)

---

## Challenges we ran into

1. **Gemini Live native audio + tools**: The model requires at least 1 tool declaration to produce audio responses (0 tools = complete silence). With 7+ tools, it occasionally outputs `<ctrl46>` control characters instead of speech. We found 3-7 tools to be the sweet spot and added a regex filter for control characters.

2. **Speech-to-text spacing**: Gemini's output transcription arrives as space-less chunks ("NoProbleme.WhatAreYour"). Fixed by adding spaces between transcript segments on the frontend.

3. **Race conditions on dashboard edits**: Three concurrent writers (user, Live API, Background Agent) can collide on the same Firestore array. Solved with Firestore transactions (read-modify-write atomicity with automatic retry).

4. **WebSocket + Cloud Run concurrency**: Initially set `containerConcurrency: 1`, which meant each WebSocket session locked an entire instance. Changed to 80 to allow multiple sessions per instance.

5. **Token expiration during long meetings**: Firebase ID tokens expire after 1 hour. Added token refresh logic in the frontend auto-connect flow.

---

## Accomplishments that we're proud of

- **Speculative Turn-taking works**: Sub-100ms semantic interruption detection that distinguishes backchannels from real disagreements
- **4-pane auto-generation**: Speak about your system and watch architecture diagrams, task boards, and timelines populate in real-time
- **Hybrid architecture**: Gemini Live handles explicit requests instantly; Background Agent infers implicit context with 2-second delay
- **Bilingual voice switching**: JP/EN toggle changes voice, system prompt, and dashboard output language
- **Auto-maximize panes**: When AI edits a pane, it automatically maximizes for 4 seconds so users see the change

---

## What we learned

- Gemini Live native audio API is powerful but has quirks (tool count sensitivity, `<ctrl46>` control characters)
- Semantic embedding comparison is fast enough (~10ms) for real-time interruption detection
- Firestore transactions are essential when multiple agents write concurrently
- The Background Agent pattern (separate model for inference) solves the problem of Live API limitations with tool calling

---

## What's next for Smith

- **Ablation study**: Quantitative measurement of Speculative Turn-taking vs volume-based VAD
- **Multi-participant tracking**: Distinguish speakers and assign tasks accordingly
- **Export**: Generate PDF/Markdown reports from meeting artifacts
- **Integration**: Connect to Jira, Linear, GitHub Issues for task export
- **Proactive Audio**: Use Gemini's proactive audio feature for smarter response timing

---

## Built with

- Gemini Live API
- Gemini Flash
- Gemini Embeddings
- Google GenAI SDK
- Cloud Run
- Cloud Firestore
- Firebase Auth
- Firebase Hosting
- FastAPI
- Next.js
- React
- TypeScript
- Tailwind CSS
- Python
- Docker

---

## Team

Shumpei Kobayashi

---

## Demo Video Notes

See [demo-video-structure.md](demo-video-structure.md) for video script and structure.

### Key scenes to capture:
1. Google login -> meeting room
2. Start recording, say a project idea
3. AI responds, outline + architecture auto-populates
4. Show divergence meter during interruption
5. Toggle Speculative Turn-taking ON/OFF comparison
6. Switch JP/EN language mid-session
7. Manual edit on a pane -> AI acknowledges the change
8. Resize chat panel (drag)
9. Show Firestore real-time sync in browser devtools
