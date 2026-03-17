// MeetScribe AI - Service Worker
// Handles: tab audio capture, Whisper/Parakeet transcription, speaker diarization, storage

const STORAGE_KEYS = {
  MEETINGS: 'meetscribe_meetings',
  SETTINGS: 'meetscribe_settings',
  ACTIVE_MEETING: 'meetscribe_active'
};

// Default settings
const DEFAULT_SETTINGS = {
  model: 'whisper-base', // whisper-tiny, whisper-base, whisper-small (via HF Inference API)
  hfToken: '',           // HuggingFace API token (free tier)
  geminiKey: '',         // Gemini API key (free tier)
  language: 'en',
  autoStart: true,
  showToneAnalysis: true,
  sidebarPosition: 'right',
  theme: 'dark'
};

let activeMeeting = null;
let captureStream = null;
let audioProcessor = null;
let offscreenReady = false;

// ─── Lifecycle ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  if (!existing[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS });
  }
  console.log('[MeetScribe] Extension installed');
});

// ─── Message Router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'START_CAPTURE':
      handleStartCapture(msg, sender, sendResponse);
      return true;

    case 'STOP_CAPTURE':
      handleStopCapture(sendResponse);
      return true;

    case 'TRANSCRIBE_CHUNK':
      handleTranscribeChunk(msg, sendResponse);
      return true;

    case 'ANALYZE_TONE':
      handleTonAnalysis(msg, sendResponse);
      return true;

    case 'SAVE_MEETING':
      saveMeeting(msg.meeting, sendResponse);
      return true;

    case 'GET_MEETINGS':
      getMeetings(sendResponse);
      return true;

    case 'GET_MEETING':
      getMeeting(msg.id, sendResponse);
      return true;

    case 'DELETE_MEETING':
      deleteMeeting(msg.id, sendResponse);
      return true;

    case 'GET_SETTINGS':
      getSettings(sendResponse);
      return true;

    case 'SAVE_SETTINGS':
      saveSettings(msg.settings, sendResponse);
      return true;

    case 'EXPORT_MEETING':
      exportMeeting(msg.id, msg.format, sendResponse);
      return true;

    case 'GET_ACTIVE_MEETING':
      sendResponse({ meeting: activeMeeting });
      return true;

    case 'TRANSCRIPT_UPDATE':
      // Relay from offscreen/content to popup/sidebar
      broadcastToSidebar(msg);
      return false;

    case 'SPEAKER_UPDATE':
      broadcastToSidebar(msg);
      return false;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// ─── Tab Audio Capture ───────────────────────────────────────────────────────

async function handleStartCapture(msg, sender, sendResponse) {
  try {
    const tabId = sender.tab?.id || msg.tabId;
    if (!tabId) return sendResponse({ success: false, error: 'No tab ID' });

    // Start the meeting session
    activeMeeting = {
      id: generateId(),
      title: msg.title || 'Meeting',
      platform: msg.platform || 'unknown',
      startTime: Date.now(),
      participants: [],
      transcript: [],
      summary: null,
      tabId
    };

    await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_MEETING]: activeMeeting });

    // Use tabCapture to get the tab's audio stream
    // Use tabCapture to get the tab's audio stream
    // In MV3, this requires offscreen document
    await ensureOffscreenDocument();
    
    chrome.offscreen.sendMessage({
      type: 'START_AUDIO_CAPTURE',
      tabId,
      meetingId: activeMeeting.id
    });

    sendResponse({ success: true, meetingId: activeMeeting.id });
  } catch (err) {
    console.error('[MeetScribe] Start capture error:', err);
    sendResponse({ success: false, error: err.message });
  }
}

async function handleStopCapture(sendResponse) {
  try {
    if (offscreenReady) {
      await chrome.offscreen.sendMessage({ type: 'STOP_AUDIO_CAPTURE' });
    }

    if (activeMeeting) {
      activeMeeting.endTime = Date.now();
      activeMeeting.duration = activeMeeting.endTime - activeMeeting.startTime;
      await saveMeetingData(activeMeeting);
      broadcastToSidebar({ type: 'MEETING_ENDED', meeting: activeMeeting });
      activeMeeting = null;
    }

    await chrome.storage.local.remove(STORAGE_KEYS.ACTIVE_MEETING);
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// ─── Transcription via HuggingFace Inference API ─────────────────────────────

async function handleTranscribeChunk(msg, sendResponse) {
  try {
    const settings = await getSettingsData();
    const hfToken = settings.hfToken;
    if (!hfToken) return sendResponse({ success: false });

    const modelId = settings.model === 'parakeet' 
      ? 'nvidia/parakeet-tdt-0.6b-v2'
      : 'openai/whisper-base';

    const audioData = new Uint8Array(msg.audioArray);

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${modelId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': msg.mimeType || 'audio/webm'
        },
        body: audioData
      }
    );

    if (response.ok) {
      const result = await response.json();
      const transcription = result.text || result[0]?.text || '';
      sendResponse({ success: true, text: transcription });
    } else {
      console.error('[MeetScribe] HF API Error:', response.status, await response.text());
      sendResponse({ success: false, error: 'HF API Error' });
    }
  } catch (err) {
    console.error('[MeetScribe] Transcription error:', err);
    sendResponse({ success: false, error: err.message });
  }
}

// ─── Tone Analysis via Gemini (free tier) ────────────────────────────────────

async function handleTonAnalysis(msg, sendResponse) {
  const result = await analyzeTone(msg.text, msg.speaker);
  sendResponse(result);
}

async function analyzeToneAsync(entry, settings) {
  const result = await analyzeTone(entry.text, entry.speaker, settings);
  if (result && activeMeeting) {
    const idx = activeMeeting.transcript.findIndex(t => t.id === entry.id);
    if (idx >= 0) {
      activeMeeting.transcript[idx].tone = result;
      broadcastToSidebar({
        type: 'TONE_UPDATE',
        entryId: entry.id,
        tone: result,
        meetingId: activeMeeting.id
      });
    }
  }
}

async function analyzeTone(text, speaker, settings) {
  if (!text || text.length < 10) return null;
  
  try {
    const s = settings || await getSettingsData();
    
    if (s.geminiKey) {
      // Gemini 1.5 Flash (free tier - 15 RPM, 1M TPM)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${s.geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Analyze the tone and sentiment of this speech segment. Respond ONLY with a JSON object (no markdown):
{"sentiment": "positive|negative|neutral", "tone": "confident|hesitant|excited|calm|frustrated|questioning|assertive", "energy": 0-100, "formality": 0-100, "keywords": ["word1","word2"]}

Speech: "${text}"`
              }]
            }],
            generationConfig: { maxOutputTokens: 150, temperature: 0.1 }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
      }
    }

    // Fallback: simple keyword-based analysis
    return simpleToneAnalysis(text);

  } catch (err) {
    return simpleToneAnalysis(text);
  }
}

function simpleToneAnalysis(text) {
  const t = text.toLowerCase();
  const positiveWords = ['great','good','excellent','agree','yes','perfect','love','happy','excited','wonderful'];
  const negativeWords = ['no','bad','wrong','disagree','problem','issue','concern','worried','unfortunately','fail'];
  const questionWords = ['?','how','what','why','when','where','who','could','would','should'];
  
  let score = 0;
  positiveWords.forEach(w => { if (t.includes(w)) score++; });
  negativeWords.forEach(w => { if (t.includes(w)) score--; });
  const hasQuestion = questionWords.some(w => t.includes(w));

  return {
    sentiment: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral',
    tone: hasQuestion ? 'questioning' : score > 1 ? 'excited' : score < -1 ? 'frustrated' : 'calm',
    energy: Math.min(100, 40 + Math.abs(score) * 15),
    formality: t.split(' ').some(w => ['therefore','however','furthermore','consequently'].includes(w)) ? 70 : 45,
    keywords: text.split(/\s+/).filter(w => w.length > 5).slice(0, 3)
  };
}

// ─── Speaker Diarization ─────────────────────────────────────────────────────
// Uses pyannote-inspired approach: track audio energy patterns per voice

// Speaker profiles are maintained in content script via Web Audio API analysis
// Background script tracks speaker identities across sessions

// ─── Meeting Storage ──────────────────────────────────────────────────────────

async function saveMeetingData(meeting) {
  const { [STORAGE_KEYS.MEETINGS]: meetings = [] } = await chrome.storage.local.get(STORAGE_KEYS.MEETINGS);
  const idx = meetings.findIndex(m => m.id === meeting.id);
  if (idx >= 0) meetings[idx] = meeting;
  else meetings.unshift(meeting);
  
  // Keep last 50 meetings
  const trimmed = meetings.slice(0, 50);
  await chrome.storage.local.set({ [STORAGE_KEYS.MEETINGS]: trimmed });
}

async function saveMeeting(meeting, sendResponse) {
  await saveMeetingData(meeting);
  sendResponse({ success: true });
}

async function getMeetings(sendResponse) {
  const { [STORAGE_KEYS.MEETINGS]: meetings = [] } = await chrome.storage.local.get(STORAGE_KEYS.MEETINGS);
  sendResponse({ meetings });
}

async function getMeeting(id, sendResponse) {
  const { [STORAGE_KEYS.MEETINGS]: meetings = [] } = await chrome.storage.local.get(STORAGE_KEYS.MEETINGS);
  sendResponse({ meeting: meetings.find(m => m.id === id) || null });
}

async function deleteMeeting(id, sendResponse) {
  const { [STORAGE_KEYS.MEETINGS]: meetings = [] } = await chrome.storage.local.get(STORAGE_KEYS.MEETINGS);
  await chrome.storage.local.set({ [STORAGE_KEYS.MEETINGS]: meetings.filter(m => m.id !== id) });
  sendResponse({ success: true });
}

// ─── Settings ────────────────────────────────────────────────────────────────

async function getSettingsData() {
  const { [STORAGE_KEYS.SETTINGS]: settings } = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function getSettings(sendResponse) {
  sendResponse(await getSettingsData());
}

async function saveSettings(newSettings, sendResponse) {
  const current = await getSettingsData();
  const merged = { ...current, ...newSettings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  sendResponse({ success: true });
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function exportMeeting(id, format, sendResponse) {
  const { [STORAGE_KEYS.MEETINGS]: meetings = [] } = await chrome.storage.local.get(STORAGE_KEYS.MEETINGS);
  const meeting = meetings.find(m => m.id === id);
  if (!meeting) return sendResponse({ error: 'Meeting not found' });

  let content = '';
  const date = new Date(meeting.startTime).toLocaleDateString();

  if (format === 'txt') {
    content = `MEETING TRANSCRIPT\n${'='.repeat(50)}\n`;
    content += `Title: ${meeting.title}\nDate: ${date}\nPlatform: ${meeting.platform}\n\n`;
    meeting.transcript.forEach(t => {
      const time = new Date(t.timestamp).toLocaleTimeString();
      content += `[${time}] ${t.speaker}: ${t.text}\n`;
      if (t.tone) content += `  Tone: ${t.tone.tone} | Sentiment: ${t.tone.sentiment}\n`;
    });
  } else if (format === 'json') {
    content = JSON.stringify(meeting, null, 2);
  } else if (format === 'md') {
    content = `# ${meeting.title}\n\n**Date:** ${date}  \n**Platform:** ${meeting.platform}\n\n## Transcript\n\n`;
    meeting.transcript.forEach(t => {
      const time = new Date(t.timestamp).toLocaleTimeString();
      content += `**${t.speaker}** *(${time})*: ${t.text}\n\n`;
    });
  } else if (format === 'srt') {
    meeting.transcript.forEach((t, i) => {
      const start = formatSRTTime(t.timestamp - meeting.startTime);
      const end = formatSRTTime((t.timestamp - meeting.startTime) + 3000);
      content += `${i+1}\n${start} --> ${end}\n${t.speaker}: ${t.text}\n\n`;
    });
  }

  sendResponse({ content, filename: `${meeting.title.replace(/\s+/g, '_')}_${date}.${format}` });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatSRTTime(ms) {
  const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
  const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
  const mm = (ms % 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${mm}`;
}

async function ensureOffscreenDocument() {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: 'background/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Capture tab audio for transcription'
    });
    offscreenReady = true;
  }
}

function broadcastToSidebar(msg) {
  // Send to all content scripts (sidebars)
  chrome.tabs.query({ active: true }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    });
  });
  // Also send to popup if open
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ─── Summary Generation ───────────────────────────────────────────────────────

async function handleGenerateSummary(transcript, sendResponse) {
  try {
    const settings = await getSettingsData();
    if (!settings.geminiKey) {
      sendResponse({ error: 'No Gemini key configured' });
      return;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${settings.geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Summarize this meeting transcript in 3-5 sentences. Focus on key decisions, action items, and main discussion points. Be concise and professional.\n\n${transcript}` }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.3 }
        })
      }
    );

    if (!response.ok) { sendResponse({ error: `Gemini error: ${response.status}` }); return; }
    const data = await response.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    sendResponse({ summary });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

// ─── Append entry to active meeting in storage ────────────────────────────────

async function appendTranscriptEntry(entry) {
  if (!activeMeeting) return;
  activeMeeting.transcript.push(entry);
  // Debounced save every 10 entries
  if (activeMeeting.transcript.length % 10 === 0) {
    await saveMeetingData(activeMeeting);
  }
}

