# MeetScribe AI — Real-Time Meeting Assistant Extension

> A Chrome extension that provides real-time transcription, speaker diarization, tone analysis, and action-item detection for Google Meet, Zoom, and Microsoft Teams — powered by open-source AI models (Whisper, Parakeet TDT, Gemini Flash).

---

## ✨ Features

| Feature | Details |
|---|---|
| **Real-time Transcription** | Whisper Base/Small via HuggingFace API, or NVIDIA Parakeet TDT 0.6B |
| **Speaker Diarization** | Automatic voice profiling, speaker labeling, rename speakers |
| **Tone Analysis** | Per-segment emotion analysis (Gemini 1.5 Flash — free tier) |
| **Live Sidebar** | Slides in from the side of your meeting page, stays in view |
| **Low Latency** | 3-second audio chunks sent to HF API; Web Speech API fallback |
| **Action Items** | Auto-detected from transcript keywords |
| **Sentiment Timeline** | Visual timeline of conversation mood |
| **Export** | TXT, Markdown, JSON, SRT subtitles |
| **Dashboard** | Browse, search, and analyze all past meetings |
| **Works On** | Google Meet, Zoom, Microsoft Teams |

---

## 🚀 Quick Start

### 1. Install the Extension

1. Clone or download this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer Mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `extension/` folder inside this project

### 2. Configure AI Keys (Free Tier)

Open any meeting page → click the MeetScribe icon → Settings

**Option A: HuggingFace (for best transcription)**
1. Go to [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. Create a free token (read access)
3. Paste into Settings → HuggingFace API Token
4. Choose model: Parakeet TDT 0.6B (best) or Whisper Base (fastest)

**Option B: Gemini (for tone analysis & summaries)**
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create a free API key
3. Paste into Settings → Google Gemini API Key
4. Free tier: 15 RPM, 1 million tokens/day

**Option C: No keys needed**
Web Speech API works out of the box (browser built-in, English only)

---

## 🤖 AI Models Used

### Transcription
| Model | ID | Best For |
|---|---|---|
| **Whisper Base** | `openai/whisper-base` | Speed, multilingual |
| **Whisper Small** | `openai/whisper-small` | Better accuracy |
| **Parakeet TDT 0.6B** | `nvidia/parakeet-tdt-0.6b-v2` | Meeting audio, best accuracy |

All accessed via [HuggingFace Inference API](https://huggingface.co/docs/api-inference) — free tier available.

### Tone Analysis & Summaries
- **Gemini 1.5 Flash** (`gemini-1.5-flash`) via [Google AI Studio](https://aistudio.google.com)
- Free tier: 15 requests/minute, 1M tokens/day
- Falls back to keyword-based analysis if no key

### Speaker Diarization
- Built-in: Web Audio API + spectral analysis
- Tracks voice profiles using frequency centroid, energy bands
- No external model needed — works fully offline

---

## 📁 Project Structure

```
extension/
├── manifest.json              # Chrome Extension MV3
├── background/
│   ├── service-worker.js      # Background logic, API calls, storage
│   ├── offscreen.html         # Audio capture offscreen document
│   └── offscreen.js           # Tab audio capture + speaker tracking
├── content/
│   ├── content.js             # Sidebar injection, Web Speech API
│   └── sidebar.css            # Sidebar styles
├── popup/
│   ├── popup.html             # Extension popup
│   ├── popup.css
│   └── popup.js
├── dashboard/
│   ├── dashboard.html         # Full dashboard page
│   ├── dashboard.css
│   └── dashboard.js
└── assets/
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

---

## 🎯 How It Works

### Transcription Pipeline
```
Tab Audio → MediaRecorder → 3s chunks → HF Inference API
         → Whisper/Parakeet → Text → Sidebar display
         → Gemini Tone Analysis → Tone pill update
```

### Speaker Diarization
```
Web Audio API → Analyser Node → FFT Frame → Feature Extraction
              → Spectral Centroid + Energy Bands → Speaker Matching
              → Voice Profile Update → Speaker label
```

### Fallback Chain
```
HF API available? → Use Whisper/Parakeet
      ↓ No
Web Speech API → Browser transcription (free, no key)
```

---

## 🎮 Sidebar Controls

| Control | Action |
|---|---|
| Toggle button (side of screen) | Show/hide sidebar |
| **Start Recording** | Begin transcription session |
| **Stop Recording** | End session, trigger action item detection |
| Transcript tab | Live scrolling transcript with tone pills |
| Speakers tab | All detected speakers, voice profiles, tone charts |
| Insights tab | Keywords, sentiment timeline, AI summary |
| Actions tab | Auto-detected action items, export options |
| ✎ Rename | Click the rename button on any speaker to label them |
| ⚙ Settings | Configure API keys, model, language, position |

---

## 📊 Dashboard

Open from popup → **Dashboard** or `chrome-extension://.../dashboard/dashboard.html`

- **Overview** — Stats, recent meetings, tone distribution
- **Meetings** — All recordings with search & filter
- **Meeting Detail** — Full transcript with speaker timeline, export
- **Analytics** — Weekly trends, speaker distribution charts
- **Settings** — Full configuration panel

---

## 🔒 Privacy

- All meeting data stored **locally** in Chrome's storage (no cloud sync)
- Audio chunks sent to HuggingFace Inference API only when you've configured a token
- Tone analysis sent to Gemini only when you've configured a key
- Nothing stored on external servers by MeetScribe itself
- You can clear all data from Dashboard → Settings → "Clear All Meetings"

---

## 🔧 Development

```bash
# Load extension
# chrome://extensions → Developer Mode → Load unpacked → select extension/

# Watch for changes
# Edit files → chrome://extensions → Reload extension (↺ button)

# Test on Google Meet
# Open meet.google.com → look for the MeetScribe toggle on the right edge
```

### Adding a custom model
Edit `background/service-worker.js` → `handleTranscribeChunk()`:
```javascript
const modelId = 'your-org/your-model-id';
```
Any HuggingFace model with automatic speech recognition task works.

---

## 📋 Supported Platforms

| Platform | URL | Status |
|---|---|---|
| Google Meet | `meet.google.com` | ✅ Full support |
| Zoom Web | `zoom.us` | ✅ Full support |
| Microsoft Teams | `teams.microsoft.com` | ✅ Full support |

---

## ⚡ Performance Notes

- **Latency**: 3-5 seconds end-to-end (chunk time + API time)
- **HF free tier**: ~30,000 characters/month transcription
- **Gemini free tier**: 15 tone analyses/minute
- For heavy use: upgrade HF to Pro ($9/month) or deploy your own Whisper

---

## 🙏 Open Source Credits

- [OpenAI Whisper](https://github.com/openai/whisper) — Transcription
- [NVIDIA Parakeet TDT](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2) — Best meeting transcription
- [HuggingFace Inference API](https://huggingface.co/docs/api-inference) — Free model hosting
- [Google Gemini](https://ai.google.dev) — Tone analysis & summaries
- [Chart.js](https://chartjs.org) — Dashboard charts
