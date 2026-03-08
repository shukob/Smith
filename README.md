# Smith - Speculative Turn-taking S2S Technical Consultant Agent

> An AI technical consultant that conducts requirements definition meetings through natural voice conversation. Features a novel **Speculative Turn-taking** algorithm that predicts what users will say next, enabling intelligent interruption handling that distinguishes backchannels from real disagreements.

Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) hackathon.

## What Makes This Different

Traditional voice AI uses simple volume-based VAD (Voice Activity Detection) to detect interruptions - any sound stops the AI. Smith uses **Speculative Turn-taking**:

1. **While AI speaks**: A background task predicts what the user might say next (especially disagreements) using Gemini Flash, and pre-computes semantic embeddings
2. **When user speaks during AI output**: The actual speech is embedded and compared against predictions via cosine distance in real-time (~10ms)
3. **Intelligent decision**:
   - Low divergence (< 0.3) → Backchannel ("うんうん", "I see") → AI continues speaking
   - High divergence (> 0.6) → Real interruption/disagreement → AI yields the floor

This approach detects interruptions from **meaning**, not sound — even soft-spoken disagreements trigger a yield, while loud agreement doesn't.

## Architecture

```
Browser (Next.js / Firebase App Hosting)
  │ WebSocket (PCM16 16kHz + JSON)
  ▼
Cloud Run (Python/FastAPI, Docker)
  ├── GeminiLiveClient ──WebSocket──▶ Gemini Live API
  │     Audio I/O + Function Calling      (gemini-2.5-flash-native-audio-preview)
  ├── SpeculativeEngine ──API call──▶ Gemini Flash (text prediction)
  │     └── DivergenceDetector            (sentence-transformers, ~10ms)
  ├── SimliClient ──WebSocket──▶ Simli API (avatar lip-sync)
  ├── AudioProcessor                      (24kHz↔16kHz PCM resampling)
  └── FirestoreWriter ──▶ Cloud Firestore
                              ▲
Browser listens via onSnapshot ─┘
```

### Key Technologies
- **Gemini Live API** (`gemini-2.5-flash-native-audio-preview-12-2025`): Full-duplex audio I/O with function calling
- **Google GenAI SDK** (`google-genai`): Python SDK for Gemini APIs
- **Cloud Run**: WebSocket-capable serverless container (2GB RAM, 2 vCPU)
- **Cloud Firestore**: Real-time document sync for requirements/summary UI
- **Simli**: Avatar lip-sync from audio stream
- **sentence-transformers** (`all-MiniLM-L6-v2`): Lightweight embedding model for divergence detection

## Features

- **Voice Meeting with AI Consultant**: Discuss system requirements naturally; AI asks clarifying questions, identifies risks, and facilitates discussion
- **Real-time Requirements Extraction**: Gemini function calling extracts requirements as you speak — they appear in the UI instantly via Firestore
- **Speculative Divergence Meter**: Visual indicator showing the semantic distance between predicted and actual user speech
- **Ablation Toggle**: Switch speculative engine ON/OFF to compare intelligent vs basic interruption handling
- **Multi-participant Support**: Single microphone, multiple speakers — AI tracks conversation context
- **Bilingual**: Japanese and English support

## Project Structure

```
Smith/
├── backend/                    # Cloud Run (Python/FastAPI)
│   ├── src/
│   │   ├── main.py             # FastAPI WebSocket endpoint
│   │   ├── gemini_live_client.py   # Gemini Live API wrapper
│   │   ├── speculative_engine.py   # Core innovation
│   │   ├── divergence_detector.py  # Embedding comparison
│   │   ├── session_manager.py  # Session orchestration
│   │   ├── firestore_writer.py # Real-time Firestore updates
│   │   ├── function_tools.py   # Gemini function declarations
│   │   ├── system_prompt.py    # Consultant prompt
│   │   ├── audio_processor.py  # PCM resampling
│   │   └── simli_client.py     # Simli avatar client
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js (Firebase App Hosting)
│   └── src/
│       ├── components/         # MeetingRoom, Requirements, Divergence, etc.
│       ├── hooks/              # useAudioStream, useFirestore
│       └── lib/                # Firebase config
└── infra/                      # Pulumi IaC (TypeScript)
    └── index.ts                # GCP resources definition
```

## Setup & Deployment

### Prerequisites
- Google Cloud project with billing enabled
- [Pulumi CLI](https://www.pulumi.com/docs/install/) installed
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) authenticated
- Node.js 20+ and Python 3.12+
- Gemini API key (from [Google AI Studio](https://aistudio.google.com/))
- Simli API key and Face ID (from [Simli](https://simli.com/))

### 1. Infrastructure (Pulumi)

```bash
cd infra
npm install
pulumi stack init dev
pulumi config set gcp:project YOUR_PROJECT_ID
pulumi config set gcp:region us-central1
pulumi up
```

This creates: Artifact Registry, Cloud Run service, Firestore database, Secret Manager secrets, IAM bindings.

### 2. Set Secrets

```bash
echo -n "YOUR_GEMINI_KEY" | gcloud secrets versions add smith-google-api-key --data-file=-
echo -n "YOUR_SIMLI_KEY" | gcloud secrets versions add smith-simli-api-key --data-file=-
echo -n "YOUR_FACE_ID" | gcloud secrets versions add smith-simli-face-id --data-file=-
```

### 3. Deploy Backend

```bash
# Authenticate Docker
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build and push
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT/smith/backend ./backend
docker push us-central1-docker.pkg.dev/YOUR_PROJECT/smith/backend

# Cloud Run will auto-pick up the new image
```

### 4. Deploy Frontend

```bash
cd frontend
npm install

# Set environment variables
cp .env.example .env.local
# Edit .env.local with your Firebase config and backend URL

# Deploy via Firebase App Hosting
firebase init apphosting
firebase apphosting:backends:create
```

### 5. Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
GOOGLE_API_KEY=your_key python -m src.main

# Frontend (in another terminal)
cd frontend
npm run dev
```

## The Speculative Turn-taking Algorithm

### Problem
Traditional S2S systems use Volume-based VAD: any sound above a threshold stops the AI. This causes false interruptions from backchannels ("うんうん", "I see") and misses soft-spoken disagreements.

### Solution: Predict, Embed, Compare

```
┌──────────────────────────────────────────────────────────┐
│ AI Speaking Phase                                         │
│                                                          │
│  1. Gemini Flash predicts user responses (~500ms, async) │
│  2. Predictions embedded via MiniLM-L6-v2 (~10ms each)  │
│  3. Embeddings cached in memory                          │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│ User Starts Speaking During AI Output                     │
│                                                          │
│  4. Gemini input_transcription → partial text             │
│  5. Partial text embedded (~10ms)                         │
│  6. Cosine distance vs prediction embeddings              │
│     ├─ < 0.3 → IGNORE (backchannel)                      │
│     ├─ 0.3-0.6 → MONITOR (wait for more tokens)          │
│     └─ > 0.6 → INTERRUPT (real disagreement)              │
└──────────────────────────────────────────────────────────┘
```

### Why This Is Novel
- **Not keyword matching** (1st gen): Works across languages and phrasings
- **Not VAD-based** (2nd gen): Detects meaning, not volume
- **Not E2E full-duplex** (3rd gen): Adds intelligence layer on top of existing APIs
- **Sub-100ms latency**: Prediction is pre-computed; only the fast embedding comparison runs in real-time

## License

MIT

## Hackathon

Built for **Gemini Live Agent Challenge** on Devpost.

\#GeminiLiveAgentChallenge
