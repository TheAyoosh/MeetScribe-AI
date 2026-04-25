// MeetScribe AI - Service Worker
// Handles: tab audio capture, Whisper/Parakeet transcription, speaker diarization, storage

// ─── Load config.js (user's API keys) ────────────────────────────────────────
importScripts('/config.js');

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
  groqKey: '',           // Groq API key
  groqTranscriptionModel: 'whisper-large-v3-turbo',
  groqChatModel: 'llama-3.3-70b-versatile',
  transcriptionMode: 'groq',
  language: 'en',
  autoStart: true,
  showToneAnalysis: true,
  autoCreateActionItems: true,
  autoCreateTicket: false,
  sidebarPosition: 'right',
  theme: 'dark'
};

let activeMeeting = null;
let captureStream = null;
let audioProcessor = null;
let offscreenReady = false;

// ─── Lifecycle ───────────────────────────────────────────────────────────────

// Apply keys from config.js into storage on every startup
async function applyConfigKeys() {
  const cfg = typeof MEETSCRIBE_CONFIG !== 'undefined' ? MEETSCRIBE_CONFIG : {};
  if (!cfg.hfToken && !cfg.geminiKey && !cfg.groqKey && !cfg.model && !cfg.transcriptionMode) return;

  const { [STORAGE_KEYS.SETTINGS]: existing = {} } = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...existing };

  // Config.js keys overwrite storage (so user just edits the file and reloads)
  if (cfg.hfToken)            merged.hfToken = cfg.hfToken;
  if (cfg.geminiKey)          merged.geminiKey = cfg.geminiKey;
  if (cfg.groqKey)            merged.groqKey = cfg.groqKey;
  if (cfg.model)              merged.model = cfg.model;
  if (cfg.hfModel)            merged.model = cfg.hfModel;
  if (cfg.transcriptionMode)  merged.transcriptionMode = cfg.transcriptionMode;
  if (cfg.groqTranscriptionModel) merged.groqTranscriptionModel = cfg.groqTranscriptionModel;
  if (cfg.groqChatModel)      merged.groqChatModel = cfg.groqChatModel;
  if (cfg.jiraDomain)         merged.jiraDomain = cfg.jiraDomain;
  if (cfg.jiraEmail)          merged.jiraEmail = cfg.jiraEmail;
  if (cfg.jiraToken)          merged.jiraToken = cfg.jiraToken;
  if (cfg.jiraProjectKey)     merged.jiraProjectKey = cfg.jiraProjectKey;
  if (typeof cfg.autoCreateTicket !== 'undefined') merged.autoCreateTicket = cfg.autoCreateTicket;
  if (cfg.backendUrl)         merged.backendUrl = cfg.backendUrl;
  if (typeof cfg.autoSyncToDb !== 'undefined') merged.autoSyncToDb = cfg.autoSyncToDb;

  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  console.log('[MeetScribe] Config applied — Groq:', cfg.groqKey ? 'set' : 'empty', '| HF:', cfg.hfToken ? 'set' : 'empty', '| Gemini:', cfg.geminiKey ? 'set' : 'empty');
}

chrome.runtime.onInstalled.addListener(async () => {
  await applyConfigKeys();
  console.log('[MeetScribe] Extension installed');
});

// Also apply on every service worker wake-up (covers extension reload)
applyConfigKeys();

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

    case 'NEW_SPEAKER':
    case 'SPEAKER_CHANGE':
      broadcastToSidebar({
        type: msg.type === 'NEW_SPEAKER' ? 'NEW_SPEAKER_IDENTIFIED' : 'SPEAKER_IDENTIFIED',
        ...msg.speaker,
        meetingId: msg.meetingId
      });
      return false;

    case 'AGENT_QUERY':
      handleAgentQuery(msg, sendResponse);
      return true;

    case 'GENERATE_SUMMARY':
      handleGenerateSummary(msg.transcript, sendResponse);
      return true;

    case 'APPEND_TRANSCRIPT_ENTRY':
      appendTranscriptEntry(msg.entry);
      sendResponse({ success: true });
      return true;

    case 'CREATE_JIRA_TICKET':
      getSettingsData().then(settings => {
        createJiraTicket(msg.summary, msg.title, settings).then(key => {
          if (key) sendResponse({ success: true, key });
          else sendResponse({ success: false });
        });
      });
      return true;

    case 'TRANSCRIPT_UPDATE':
      // Relay from offscreen/content to popup/sidebar
      broadcastToSidebar(msg);
      return false;

    case 'SPEAKER_UPDATE':
      broadcastToSidebar(msg);
      return false;

    case 'OPEN_DASHBOARD':
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
      sendResponse({ success: true });
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// ─── Tab Audio Capture ───────────────────────────────────────────────────────

async function handleStartCapture(msg, sender, sendResponse) {
  try {
    const tabId = sender.tab?.id || msg.tabId;
    if (!tabId) return sendResponse({ success: false, error: 'No tab ID' });

    // MV3: Get a streamId for the tab audio (only if offscreen capture is needed)
    let streamId = null;
    if (msg.useOffscreenCapture) {
      streamId = await new Promise((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, id => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(id);
        });
      });
    }

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

    // In our new architecture, content.js handles the merged capture (Mic + Tab).
    // We only start the offscreen capture if specifically requested, 
    // to avoid double transcription.
    if (msg.useOffscreenCapture) {
      await ensureOffscreenDocument();
      chrome.runtime.sendMessage({
        type: 'START_AUDIO_CAPTURE',
        streamId,
        tabId,
        meetingId: activeMeeting.id
      });
    }

    sendResponse({ success: true, meetingId: activeMeeting.id });
  } catch (err) {
    console.error('[MeetScribe] Start capture error:', err.message || err);
    sendResponse({ success: false, error: err.message || 'Capture failed' });
  }
}

async function handleStopCapture(sendResponse) {
  try {
    if (offscreenReady) {
      chrome.runtime.sendMessage({ type: 'STOP_AUDIO_CAPTURE' });
    }

    if (activeMeeting) {
      activeMeeting.endTime = Date.now();
      activeMeeting.duration = activeMeeting.endTime - activeMeeting.startTime;
      
      // Automatic MoM and Jira Integration
      const settings = await getSettingsData();
      const hasTranscript = activeMeeting.transcript && activeMeeting.transcript.length > 3;
      
      if ((settings.autoCreateTicket || settings.autoCreateActionItems) && hasTranscript) {
        console.log('[MeetScribe] Auto-generating summary...');
        const transcriptText = activeMeeting.transcript.map(e => `${e.speaker}: ${e.text}`).join('\n');
        const summary = await generateSummaryText(transcriptText, settings);
        
        if (summary) {
          activeMeeting.summary = summary;
          
          // Parse action items if possible (simple split or LLM can do it)
          if (summary.toLowerCase().includes('action items')) {
            const lines = summary.split('\n');
            const aiIdx = lines.findIndex(l => l.toLowerCase().includes('action items'));
            if (aiIdx >= 0) {
              activeMeeting.actionItems = lines.slice(aiIdx + 1, aiIdx + 6).filter(l => l.trim().length > 3);
            }
          }

          if (settings.autoCreateTicket) {
            console.log('[MeetScribe] Auto-creating Jira ticket...');
            const jiraKey = await createJiraTicket(summary, activeMeeting.title, settings);
            if (jiraKey) activeMeeting.jiraKey = jiraKey;
          }
        }
      }

      await saveMeetingData(activeMeeting);
      broadcastToSidebar({ type: 'MEETING_ENDED', meeting: activeMeeting });
      activeMeeting = null;
    }

    await chrome.storage.local.remove(STORAGE_KEYS.ACTIVE_MEETING);
    if (sendResponse) sendResponse({ success: true });
  } catch (err) {
    console.error('[MeetScribe] Stop capture error:', err);
    if (sendResponse) sendResponse({ success: false, error: err.message });
  }
}

// ─── Transcription via HuggingFace Inference API ─────────────────────────────

async function handleTranscribeChunk(msg, sendResponse) {
  try {
    const settings = await getSettingsData();
    let { audioBase64, audioBlob, mimeType, speakerHint, timestamp } = msg;

    if (!audioBase64 && !audioBlob) {
      return sendResponse({ success: false, error: 'No audio data' });
    }

    let audioBlobObj;
    if (audioBase64) {
      // Convert Base64 back to Blob
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      audioBlobObj = new Blob([bytes], { type: mimeType || 'audio/webm' });
    } else {
      // Use raw ArrayBuffer
      audioBlobObj = new Blob([audioBlob], { type: mimeType || 'audio/webm' });
    }

    let transcription = '';
    console.log(`[MeetScribe] Received chunk for ${speakerHint || 'Unknown'} (Size: ${audioBlobObj.size} bytes)`);

    // Priority 1: Groq Whisper (High Speed & Accuracy)
    if (settings.groqKey && settings.transcriptionMode === 'groq') {
      try {
        const formData = new FormData();
        formData.append('file', audioBlobObj, 'audio.webm');
        formData.append('model', settings.groqTranscriptionModel || 'whisper-large-v3-turbo');
        if (settings.language && settings.language !== 'auto') {
          formData.append('language', settings.language);
        }
        formData.append('response_format', 'json');

        let res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${settings.groqKey}` },
          body: formData
        });

        // Handle Rate Limits (429) with simple retry
        if (res.status === 429) {
          console.warn('[MeetScribe] Groq Rate limit hit. Retrying in 2s...');
          await new Promise(r => setTimeout(r, 2000));
          res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${settings.groqKey}` },
            body: formData
          });
        }

        if (res.ok) {
          const result = await res.json();
          transcription = result.text || '';
        } else {
          console.error('[MeetScribe] Groq Transcription error:', await res.text());
        }
      } catch (e) {
        console.error('[MeetScribe] Groq fetch error:', e);
      }
    }

    // Priority 2: HuggingFace Inference API
    if (!transcription && settings.hfToken && (settings.transcriptionMode === 'hf' || settings.transcriptionMode === 'groq')) {
      const modelId = settings.model === 'parakeet' 
        ? 'nvidia/parakeet-tdt-0.6b-v2'
        : 'openai/whisper-base';

      try {
        const response = await fetch(
          `https://api-inference.huggingface.co/models/${modelId}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${settings.hfToken}`,
              'x-wait-for-model': 'true'
            },
            body: audioBlobObj
          }
        );
        // Note: Some HF models require passing parameters in a specific way, 
        // but for Whisper on Inference API, it often uses auto-detection.
        // We add x-wait-for-model to handle cold starts in production.

        if (response.ok) {
          const result = await response.json();
          transcription = result.text || result[0]?.text || '';
        } else {
          console.error('[MeetScribe] HF API Error:', await response.text());
        }
      } catch (e) {
        console.error('[MeetScribe] HF API error:', e);
      }
    }

    if (transcription && transcription.length > 2) {
      console.log(`[MeetScribe] Transcription success: "${transcription.slice(0, 50)}..."`);
    } else {
      // Fallback: Web Speech API (handled in content script)
      transcription = msg.webSpeechFallback || '';
    }

    // Update active meeting transcript
    if (activeMeeting && transcription) {
      const entry = {
        id: generateId(),
        text: transcription,
        speaker: speakerHint || 'Unknown',
        timestamp: Date.now(),
        confidence: 0.9
      };
      
      activeMeeting.transcript.push(entry);
      
      // Broadcast to sidebar
      broadcastToSidebar({
        type: 'TRANSCRIPT_UPDATE',
        entry,
        meetingId: activeMeeting.id
      });

      // Trigger tone analysis asynchronously
      if (settings.showToneAnalysis) {
        analyzeToneAsync(entry, settings);
      }
    }

    sendResponse({ success: true, text: transcription });
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
  const toxicWords = ['fuck', 'shit', 'bitch', 'asshole', 'motherfucker', 'idiot', 'stupid', 'moron', 'hate', 'kill', 'shut up', 'bastard', 'piss'];
  const positiveWords = ['great','good','excellent','agree','yes','perfect','love','happy','excited','wonderful','awesome','thanks','thank'];
  const negativeWords = ['no','bad','wrong','disagree','problem','issue','concern','worried','unfortunately','fail','terrible','worst','awful'];
  const questionWords = ['?','how','what','why','when','where','who','could','would','should'];
  
  let score = 0;
  let isToxic = toxicWords.some(w => t.includes(w));
  positiveWords.forEach(w => { if (t.includes(w)) score++; });
  negativeWords.forEach(w => { if (t.includes(w)) score--; });
  const hasQuestion = questionWords.some(w => t.includes(w));

  let sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  if (isToxic) sentiment = 'toxic';

  let tone = 'calm';
  if (isToxic) tone = 'hostile';
  else if (hasQuestion) tone = 'questioning';
  else if (score > 1) tone = 'excited';
  else if (score < -1) tone = 'frustrated';

  return {
    sentiment,
    tone,
    energy: Math.min(100, (isToxic ? 80 : 40) + Math.abs(score) * 15),
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

  // Sync to Backend/PostgreSQL if enabled
  const settings = await getSettingsData();
  if (settings.autoSyncToDb && settings.backendUrl) {
    syncMeetingToBackend(meeting, settings);
  }
}

async function syncMeetingToBackend(meeting, settings) {
  if (!settings.backendUrl) return; // Skip sync if no backend is configured

  try {
    const url = `${settings.backendUrl.replace(/\/$/, '')}/meetings`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: meeting.id,
        title: meeting.title,
        platform: meeting.platform,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        duration: meeting.duration,
        transcript: meeting.transcript,
        summary: meeting.summary,
        jiraKey: meeting.jiraKey
      })
    });
    if (res.ok) console.log('[MeetScribe] Synced to PostgreSQL:', meeting.id);
    else console.error('[MeetScribe] Sync failed:', await res.text());
  } catch (e) {
    console.error('[MeetScribe] Sync error:', e);
  }
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
    const summary = await generateSummaryText(transcript, settings);
    if (summary) {
      sendResponse({ summary });
    } else {
      sendResponse({ error: 'Failed to generate summary' });
    }
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function handleAgentQuery(msg, sendResponse) {
  const { query, context, history } = msg;
  const { [STORAGE_KEYS.SETTINGS]: settings = {} } = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const apiKey = settings.groqKey || MEETSCRIBE_CONFIG.groqKey;
  
  if (!apiKey) {
    sendResponse({ answer: "Agent error: Groq API Key missing." });
    return;
  }

  const historyPrompt = (history || []).map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.groqChatModel || MEETSCRIBE_CONFIG.groqChatModel || 'llama-3.3-70b-versatile',
        messages: [
          { 
            role: 'system', 
            content: `You are the MeetScribe Smart Agent. You are helping a user during a live meeting.
            Recent Transcript Context:
            ${context}
            
            Previous Conversation:
            ${historyPrompt}
            
            Be concise, professional, and helpful. Use the context to answer specifically.` 
          },
          { role: 'user', content: query }
        ],
        temperature: 0.5,
        max_tokens: 500
      })
    });

    const data = await res.json();
    if (data.choices?.[0]?.message?.content) {
      sendResponse({ answer: data.choices[0].message.content });
    } else {
      sendResponse({ answer: "I couldn't process that. Please try again." });
    }
  } catch (e) {
    console.error('[MeetScribe] Agent query error:', e);
    sendResponse({ answer: "Sorry, I'm having trouble connecting to my brain." });
  }
}

async function generateSummaryText(transcript, settings) {
  // Priority 1: Groq
  if (settings.groqKey || MEETSCRIBE_CONFIG.groqKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.groqKey || MEETSCRIBE_CONFIG.groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: settings.groqChatModel || MEETSCRIBE_CONFIG.groqChatModel || 'llama-3.3-70b-versatile',
          messages: [{
            role: 'user',
            content: `Generate professional Minutes of Meeting (MoM) for the following transcript. Use a clean, point-wise (bulleted) structure for all sections. 
            
Structure it exactly like this:
1. SUMMARY (Concise point-wise executive overview)
2. KEY DECISIONS (Bulleted list of agreements)
3. ACTION ITEMS (Bulleted list: [Name] - Task)
4. IMPORTANT KEYWORDS (Technical terms)
5. NEXT STEPS (Immediate follow-up points)

Transcript:
${transcript}`
          }],
          max_tokens: 1000,
          temperature: 0.3
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
      }
    } catch (e) { console.error('Groq summary error:', e); }
  }

  // Priority 2: Gemini
  if (settings.geminiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${settings.geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Generate professional Minutes of Meeting (MoM) for the following transcript. Use a clean, point-wise (bulleted) structure for all sections. 
            
Structure it exactly like this:
1. SUMMARY (Concise point-wise executive overview)
2. KEY DECISIONS (Bulleted list of agreements)
3. ACTION ITEMS (Bulleted list: [Name] - Task)
4. IMPORTANT KEYWORDS (Technical terms)
5. NEXT STEPS (Immediate follow-up points)

Transcript:
${transcript}` }] }],
            generationConfig: { maxOutputTokens: 1000, temperature: 0.3 }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    } catch (e) { console.error('Gemini summary error:', e); }
  }
  return null;
}

// ─── Jira Integration ────────────────────────────────────────────────────────

async function createJiraTicket(summary, title, settings) {
  if (!settings.jiraDomain || !settings.jiraEmail || !settings.jiraToken) {
    console.warn('[MeetScribe] Jira credentials missing, skipping ticket creation');
    return null;
  }

  // Robust domain parsing: handles 'https://xyz.atlassian.net/...' or just 'xyz.atlassian.net'
  let domain = settings.jiraDomain.replace('https://', '').replace('http://', '').split('/')[0];
  const url = `https://${domain}/rest/api/3/issue`;
  const auth = btoa(`${settings.jiraEmail}:${settings.jiraToken}`);

  console.log(`[MeetScribe] Attempting Jira ticket creation on ${domain}...`);

  // Convert summary to Atlassian Document Format (ADF)
  const adfContent = summary.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => ({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: line
        }
      ]
    }));

  const body = {
    fields: {
      project: { key: settings.jiraProjectKey || 'SCRUM' },
      summary: `MoM: ${title} (${new Date().toLocaleDateString()})`,
      description: {
        type: 'doc',
        version: 1,
        content: adfContent
      },
      issuetype: { 
        name: 'Task' // Defaulting to Task, which is standard in Scrum projects
      }
    }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[MeetScribe] Jira ticket created successfully:', data.key);
      
      // Notify the UI
      broadcastToSidebar({ 
        type: 'JIRA_TICKET_CREATED', 
        key: data.key, 
        url: `https://${domain}/browse/${data.key}` 
      });
      
      return data.key;
    } else {
      const errorText = await res.text();
      console.error('[MeetScribe] Jira API Error:', res.status, errorText);
      
      // If 'Task' fails, it might be a project schema issue. Let's log it for the user.
      if (res.status === 400 && errorText.includes('issuetype')) {
        console.warn('[MeetScribe] Issue type "Task" might not be available for this project.');
      }
      
      return null;
    }
  } catch (e) {
    console.error('[MeetScribe] Jira fetch error:', e);
    return null;
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
