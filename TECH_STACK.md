# MeetScribe AI - Technical Architecture & Tech Stack

## 1. Project Vision
MeetScribe AI is an enterprise-grade browser extension designed to automate meeting documentation by capturing high-fidelity, per-speaker audio streams directly from the browser's internal communication layer. It leverages state-of-the-art AI models for real-time transcription, sentiment analysis, and automated task management.

---

## 2. Tech Stack Overview

### Frontend (Chrome Extension - Manifest V3)
| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Core Engine** | Vanilla JavaScript (ES6+) | Maximum performance, zero overhead. |
| **Styling** | CSS3 (Custom Design System) | Glassmorphic, modern UI with Light/Dark mode support. |
| **Capture Layer** | Web Audio API + WebRTC | Intercepting digital audio tracks before speaker mixing. |
| **Transcription** | Web Speech API (Local) | Low-latency interim feedback for the user's own mic. |
| **Messaging** | Chrome Runtime Messaging | Communication between Content Scripts, Service Worker, and Sidebar. |

### Intelligence Layer (AI Models)
| Feature | Model / Provider | Why? |
| :--- | :--- | :--- |
| **Transcription** | **Groq (Whisper Large V3 Turbo)** | Blazing fast STT (< 500ms chunks). |
| **Summarization** | **Gemini 1.5 Flash** | Optimized for long-context meeting minutes. |
| **Tone Analysis** | **Gemini 1.5 Flash** | Detects sentiment, energy, and formality levels. |
| **Inference Backup** | **HuggingFace Inference API** | Reliable fallback for Whisper/Parakeet models. |

### Backend & Storage
| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **API Server** | **FastAPI (Python)** | High-concurrency, asynchronous meeting data handling. |
| **Database** | **PostgreSQL** | Relational storage for transcripts, summaries, and action items. |
| **ORM** | **SQLAlchemy (AsyncIO)** | Asynchronous database interactions. |
| **Local Storage** | `chrome.storage.local` | Offline-first data persistence and fast UI loading. |

---

## 3. System Architecture & Workflows

### A. Audio Interception Pipeline
1. **The Hook**: `audio-interceptor.js` is injected at `document_start`. It replaces `window.RTCPeerConnection` with a proxied version.
2. **Stream Isolation**: Every incoming remote audio track is isolated into a dedicated `AudioContext` node.
3. **Voice Fingerprinting**: Uses **MFCC (Mel-Frequency Cepstral Coefficients)** to create unique voice signatures for each participant.
4. **VAD (Voice Activity Detection)**: Only sends audio chunks to the AI if speech energy is detected above a sensitive threshold (`0.0001 RMS`).

### B. Transcription Relay
1. **Chunking**: Audio is captured in 6-second buffers (adjustable via `CHUNK_MS`).
2. **Relay**: Content script sends base64-encoded WebM blobs to the Service Worker.
3. **AI Processing**: Service Worker manages API keys and routes chunks to the fastest available model (Groq -> HF).
4. **Broadcast**: Transcription text is broadcast to the Sidebar UI in real-time.

### C. Data Synchronization
- **Local-First**: Meetings are initially saved in the browser's local storage for privacy and speed.
- **Auto-Sync**: If `autoSyncToDb` is enabled, the extension pushes finalized meetings to the FastAPI backend via a secure POST request.
- **Merging**: The Dashboard (`dashboard.js`) merges local and remote data to ensure no meeting history is lost if the user clears their browser cache.

---

## 4. Key Security Features
- **CSP Compliance**: Manifest V3 compliant with no unsafe-eval or inline scripts.
- **Private Capture**: No audio is stored permanently on any server unless the user explicitly enables Database Sync.
- **Secure Integration**: API keys are managed via a protected `config.js` or encrypted extension storage.

---

## 5. Third-Party Integrations
- **Jira Software**: Automated task extraction and ticket creation using the Jira REST API v3.
- **Google Meet / Zoom**: Specialized DOM scraping logic for real-time participant name mapping.

---

## 6. Directory Structure
```text
/extension
  /background     # Service Worker (Logic, Sync, AI Routing)
  /content        # Content Scripts (Audio Hooks, Alerts, UI Injection)
  /dashboard      # Professional User Dashboard
  /popup          # Extension Quick-Settings
  /assets         # Icons and static resources
/backend          # FastAPI + PostgreSQL infrastructure
```

---
*Document Generated: 2026-04-24*
