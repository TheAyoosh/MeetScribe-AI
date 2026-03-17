// MeetScribe - Real-Time Alert Engine
// Runs inside content script context
// Detects: foul language, off-topic drift, interruptions, overtime
// Responds with: audio chimes + voice synthesis alerts

(function () {
  'use strict';

  // ─── Configuration ─────────────────────────────────────────────────────────

  const ALERT_CONFIG = {
    foulLanguage: {
      enabled: true,
      voiceAlert: true,
      chime: true,
      message: 'Language warning detected in meeting.'
    },
    offTopic: {
      enabled: true,
      voiceAlert: true,
      chime: false,
      sensitivity: 'medium', // low | medium | high
      message: "Heads up — the conversation seems to be going off-topic."
    },
    interruption: {
      enabled: true,
      voiceAlert: false,
      chime: true,
    },
    overtime: {
      enabled: true,
      voiceAlert: true,
      chime: true,
      warningAt: 5, // minutes before scheduled end (or just elapsed threshold)
    }
  };

  // ─── Foul Language Dictionary ─────────────────────────────────────────────
  // Tiered: tier 1 = mild warning, tier 2 = strong warning

  const FOUL_TIER1 = new Set([
    'damn','crap','hell','ass','jerk','idiot','moron','stupid',
    'dumb','sucks','suck','loser','shut up','shutup','hate you',
    'screw','screwing','freaking','fricking','bloody','bastard'
  ]);

  const FOUL_TIER2 = new Set([
    'fuck','shit','bitch','asshole','bullshit','motherfucker',
    'dickhead','piss off','cunt','wanker','cock','twat',
    'dumbass','jackass','piece of shit','son of a bitch'
  ]);

  // ─── Topic Tracking ────────────────────────────────────────────────────────
  // Maintains a rolling window of recent transcript to detect topic drift

  let meetingTopicKeywords = [];     // established from first N entries
  let recentEntryBuffer = [];        // last 5 entries for drift detection
  let topicEstablished = false;
  let lastOffTopicAlert = 0;
  let lastFoulAlert = 0;
  let lastInterruptionAlert = 0;
  let lastSpeakerEndTime = 0;
  let lastSpeakerId = null;
  let meetingStartTime = null;
  let overtimeWarned = false;
  let alertSettings = { ...ALERT_CONFIG };
  let geminiKey = '';
  let isEnabled = true;

  // Audio context for chimes
  let alertAudioCtx = null;

  // ─── Public API ────────────────────────────────────────────────────────────

  window.__MeetScribeAlerts = {
    init,
    processTranscriptEntry,
    updateSettings,
    setGeminiKey: (key) => { geminiKey = key; },
    setEnabled: (v) => { isEnabled = v; },
    setMeetingStart: (t) => { meetingStartTime = t; overtimeWarned = false; }
  };

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init(settings = {}) {
    alertSettings = deepMerge(alertSettings, settings);
    meetingStartTime = Date.now();

    // Load Gemini key from extension settings
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (s) => {
      if (s?.geminiKey) geminiKey = s.geminiKey;
    });

    // Start overtime checker
    setInterval(checkOvertime, 30000);

    console.log('[MeetScribe Alerts] Engine initialized');
  }

  // ─── Main entry point: called for every new transcript segment ────────────

  async function processTranscriptEntry(entry) {
    if (!isEnabled) return;

    const { text, speaker, timestamp } = entry;
    if (!text || text.length < 3) return;

    // Track speaker timing for interruption detection
    const now = timestamp || Date.now();
    detectInterruption(speaker, now);
    lastSpeakerEndTime = now + estimateSpeechDuration(text);
    lastSpeakerId = speaker?.id;

    // Update rolling buffer
    recentEntryBuffer.push({ text, speaker, timestamp: now });
    if (recentEntryBuffer.length > 8) recentEntryBuffer.shift();

    // Establish topic from first 4 entries
    if (!topicEstablished && recentEntryBuffer.length >= 4) {
      establishTopic();
    }

    // Run detectors in parallel
    const [foulResult, offTopicResult] = await Promise.all([
      detectFoulLanguage(text, speaker),
      topicEstablished ? detectOffTopic(text, speaker) : Promise.resolve(null)
    ]);

    if (foulResult) triggerFoulAlert(foulResult, speaker);
    if (offTopicResult) triggerOffTopicAlert(offTopicResult, speaker);
  }

  // ─── Foul Language Detection ───────────────────────────────────────────────

  async function detectFoulLanguage(text, speaker) {
    if (!alertSettings.foulLanguage.enabled) return null;

    const lower = text.toLowerCase();
    const now = Date.now();

    // Cooldown: don't alert more than once per 15 seconds
    if (now - lastFoulAlert < 15000) return null;

    // Check tier 2 first (more serious)
    for (const word of FOUL_TIER2) {
      // Use word boundary check
      const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
      if (regex.test(lower)) {
        return { tier: 2, word, text };
      }
    }

    // Check tier 1
    for (const word of FOUL_TIER1) {
      const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
      if (regex.test(lower)) {
        return { tier: 1, word, text };
      }
    }

    return null;
  }

  // ─── Topic Establishment ───────────────────────────────────────────────────

  function establishTopic() {
    const allText = recentEntryBuffer.map(e => e.text).join(' ').toLowerCase();
    const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','need','dare','ought','used','that','this','these','those','it','its','i','you','he','she','we','they','and','or','but','for','nor','so','yet','both','either','neither','not','only','own','same','than','too','very','just','dont','cant','wont','im','its','also']);

    const words = allText.split(/\W+/)
      .filter(w => w.length > 4 && !stopWords.has(w));

    const freq = {};
    words.forEach(w => freq[w] = (freq[w] || 0) + 1);

    meetingTopicKeywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([w]) => w);

    topicEstablished = true;
    console.log('[MeetScribe Alerts] Topic established:', meetingTopicKeywords.slice(0, 5).join(', '));
  }

  // ─── Off-Topic Detection ───────────────────────────────────────────────────

  async function detectOffTopic(text, speaker) {
    if (!alertSettings.offTopic.enabled) return null;

    const now = Date.now();
    // Cooldown: max once per 45 seconds
    if (now - lastOffTopicAlert < 45000) return null;
    // Only check after enough context
    if (recentEntryBuffer.length < 5) return null;

    // Quick local check first
    const localScore = localOffTopicScore(text);

    if (localScore > 0.75) {
      // High confidence locally — no need for API call
      return { confidence: localScore, method: 'local', text };
    }

    if (localScore > 0.5 && geminiKey) {
      // Borderline — use Gemini to confirm
      return await geminiOffTopicCheck(text);
    }

    return null;
  }

  function localOffTopicScore(text) {
    if (!meetingTopicKeywords.length) return 0;

    const lower = text.toLowerCase();
    const words = lower.split(/\W+/).filter(w => w.length > 4);
    if (words.length === 0) return 0;

    // How many words overlap with established topic keywords?
    const overlap = words.filter(w => meetingTopicKeywords.includes(w)).length;
    const overlapRatio = overlap / words.length;

    // Also check recent buffer for consistency
    const recentText = recentEntryBuffer.slice(-3).map(e => e.text).join(' ').toLowerCase();
    const recentWords = recentText.split(/\W+/).filter(w => w.length > 4);
    const recentOverlap = recentWords.filter(w => meetingTopicKeywords.includes(w)).length;
    const recentRatio = recentWords.length > 0 ? recentOverlap / recentWords.length : 1;

    // Only flag if BOTH current and recent context are off-topic
    if (overlapRatio < 0.15 && recentRatio < 0.2 && words.length > 8) {
      return 1 - Math.max(overlapRatio, recentRatio);
    }

    return 0;
  }

  async function geminiOffTopicCheck(text) {
    try {
      const topicContext = meetingTopicKeywords.slice(0, 8).join(', ');
      const recentContext = recentEntryBuffer.slice(-2).map(e => e.text).join(' ');

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text:
              `Meeting topic keywords: ${topicContext}
Recent conversation: "${recentContext}"
New statement: "${text}"

Is this new statement clearly off-topic from the meeting? Reply with only: YES or NO` }] }],
            generationConfig: { maxOutputTokens: 5, temperature: 0 }
          })
        }
      );

      if (!res.ok) return null;
      const data = await res.json();
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase();
      return answer === 'YES' ? { confidence: 0.9, method: 'gemini', text } : null;
    } catch (e) {
      return null;
    }
  }

  // ─── Interruption Detection ────────────────────────────────────────────────

  function detectInterruption(speaker, now) {
    if (!alertSettings.interruption.enabled) return;
    if (!lastSpeakerId || !lastSpeakerEndTime) return;
    if (lastSpeakerId === speaker?.id) return; // same speaker continuing

    // If someone starts speaking before the previous speaker's estimated end
    const timeSinceLastEnd = now - lastSpeakerEndTime;
    if (timeSinceLastEnd < -500) { // 500ms buffer
      const now2 = Date.now();
      if (now2 - lastInterruptionAlert < 20000) return; // cooldown
      lastInterruptionAlert = now2;
      triggerInterruptionAlert(speaker);
    }
  }

  function estimateSpeechDuration(text) {
    // Average speaking rate: ~130 words per minute = ~2.2 words/sec
    const words = text.split(/\s+/).length;
    return (words / 2.2) * 1000;
  }

  // ─── Overtime Detection ────────────────────────────────────────────────────

  function checkOvertime() {
    if (!alertSettings.overtime.enabled || overtimeWarned || !meetingStartTime) return;

    const elapsed = (Date.now() - meetingStartTime) / 60000; // minutes

    // Warn at 55 min (for a typical 1h meeting) or configurable threshold
    const threshold = alertSettings.overtime.threshold || 55;
    if (elapsed >= threshold) {
      overtimeWarned = true;
      triggerOvertimeAlert(Math.round(elapsed));
    }
  }

  // ─── Alert Triggers ────────────────────────────────────────────────────────

  function triggerFoulAlert(result, speaker) {
    lastFoulAlert = Date.now();

    const speakerName = speaker?.name || 'Someone';
    const tier = result.tier;

    // Show visual alert in sidebar
    showSidebarAlert({
      type: 'foul',
      tier,
      icon: tier === 2 ? '' : '',
      title: tier === 2 ? 'Language Advisory — Tier 2' : 'Language Advisory',
      message: `${speakerName} used inappropriate language.`,
      color: tier === 2 ? '#FF4444' : '#FF8C00'
    });

    // Chime
    if (alertSettings.foulLanguage.chime) {
      playChime(tier === 2 ? 'warning_strong' : 'warning_soft');
    }

    // Voice alert
    if (alertSettings.foulLanguage.voiceAlert) {
      const msg = tier === 2
        ? `Strong language warning. ${speakerName} has used inappropriate language.`
        : `Language advisory. Please keep the conversation professional.`;
      speak(msg, { rate: 0.95, pitch: 0.9 });
    }

    console.log(`[MeetScribe Alerts] Foul language tier ${tier} detected:`, result.word);
  }

  function triggerOffTopicAlert(result, speaker) {
    lastOffTopicAlert = Date.now();

    const speakerName = speaker?.name || 'The conversation';

    showSidebarAlert({
      type: 'offtopic',
      icon: '',
      title: 'Off-Topic',
      message: `${speakerName} may be going off-topic. Refocus?`,
      color: '#FFE66D',
      action: { label: 'Dismiss', onClick: 'dismiss' }
    });

    if (alertSettings.offTopic.chime) playChime('gentle');

    if (alertSettings.offTopic.voiceAlert) {
      speak("Heads up — the conversation seems to be drifting off-topic.", { rate: 0.9, pitch: 1.0 });
    }

    console.log('[MeetScribe Alerts] Off-topic detected, confidence:', result.confidence);
  }

  function triggerInterruptionAlert(speaker) {
    showSidebarAlert({
      type: 'interruption',
      icon: '',
      title: 'Interruption',
      message: `${speaker?.name || 'Someone'} interrupted the speaker.`,
      color: '#A78BFA'
    });

    if (alertSettings.interruption.chime) playChime('gentle');

    if (alertSettings.interruption.voiceAlert) {
      speak("Interruption detected.", { rate: 1.0, volume: 0.7 });
    }
  }

  function triggerOvertimeAlert(minutes) {
    showSidebarAlert({
      type: 'overtime',
      icon: '',
      title: 'Overtime',
      message: `Meeting has been running for ${minutes} minutes. Consider wrapping up.`,
      color: '#4ECDC4'
    });

    playChime('overtime');

    if (alertSettings.overtime.voiceAlert) {
      speak(`Reminder: the meeting has been running for ${minutes} minutes. You may want to start wrapping up.`, { rate: 0.9 });
    }
  }

  // ─── Voice Synthesis ──────────────────────────────────────────────────────
  // Uses Web Speech Synthesis API — works with zero config, zero internet

  let speakQueue = [];
  let isSpeaking = false;

  function speak(text, opts = {}) {
    speakQueue.push({ text, opts });
    if (!isSpeaking) drainSpeakQueue();
  }

  function drainSpeakQueue() {
    if (speakQueue.length === 0) { isSpeaking = false; return; }
    isSpeaking = true;

    const { text, opts } = speakQueue.shift();
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate = opts.rate || 0.92;
    utterance.pitch = opts.pitch || 1.0;
    utterance.volume = opts.volume || 0.8;
    utterance.lang = 'en-US';

    // Prefer a calm, neutral voice
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.includes('Samantha') ||
      v.name.includes('Google US English') ||
      v.name.includes('Karen') ||
      v.name.includes('Moira') ||
      (v.lang === 'en-US' && !v.name.includes('Male'))
    );
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => setTimeout(drainSpeakQueue, 400);
    utterance.onerror = () => { isSpeaking = false; drainSpeakQueue(); };

    speechSynthesis.speak(utterance);
  }

  // ─── Audio Chimes ─────────────────────────────────────────────────────────
  // Synthesized tones using Web Audio API — no audio files needed

  function getAlertAudioCtx() {
    if (!alertAudioCtx || alertAudioCtx.state === 'closed') {
      alertAudioCtx = new AudioContext();
    }
    if (alertAudioCtx.state === 'suspended') alertAudioCtx.resume();
    return alertAudioCtx;
  }

  function playChime(type) {
    try {
      const ctx = getAlertAudioCtx();
      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);

      switch (type) {
        case 'warning_strong':
          // Three descending beeps — urgent
          playTone(ctx, masterGain, 880, 0,    0.15, 0.3);
          playTone(ctx, masterGain, 660, 0.2,  0.15, 0.3);
          playTone(ctx, masterGain, 440, 0.4,  0.25, 0.3);
          break;

        case 'warning_soft':
          // Two soft beeps
          playTone(ctx, masterGain, 660, 0,   0.1, 0.2);
          playTone(ctx, masterGain, 550, 0.2, 0.1, 0.2);
          break;

        case 'gentle':
          // Single soft ascending chime
          playTone(ctx, masterGain, 523, 0,   0.08, 0.15, 'sine');
          playTone(ctx, masterGain, 659, 0.15, 0.08, 0.15, 'sine');
          break;

        case 'overtime':
          // Three ascending tones — reminder
          playTone(ctx, masterGain, 440, 0,   0.1, 0.2, 'sine');
          playTone(ctx, masterGain, 554, 0.25, 0.1, 0.2, 'sine');
          playTone(ctx, masterGain, 659, 0.5, 0.15, 0.3, 'sine');
          break;
      }
    } catch (e) {
      console.warn('[MeetScribe Alerts] Chime error:', e);
    }
  }

  function playTone(ctx, destination, freq, startOffset, duration, volume, type = 'triangle') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);

    gain.gain.setValueAtTime(0, ctx.currentTime + startOffset);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startOffset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(ctx.currentTime + startOffset);
    osc.stop(ctx.currentTime + startOffset + duration + 0.05);
  }

  // ─── Sidebar Alert UI ─────────────────────────────────────────────────────

  function showSidebarAlert({ type, icon, title, message, color, tier, action }) {
    // Find or create alert container
    let container = document.getElementById('ms-alert-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ms-alert-container';
      container.style.cssText = `
        position: fixed;
        top: 16px;
        right: 360px;
        width: 280px;
        z-index: 9999999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    const alert = document.createElement('div');
    alert.style.cssText = `
      background: #0F1117;
      border: 1px solid ${color}50;
      border-left: 3px solid ${color};
      border-radius: 10px;
      padding: 10px 13px;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 12px;
      color: #E8EAF2;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      pointer-events: all;
      animation: ms-alert-in 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      cursor: pointer;
    `;

    alert.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:8px">
        <span style="font-size:16px;flex-shrink:0">${icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:11px;color:${color};margin-bottom:2px;text-transform:uppercase;letter-spacing:0.5px">${title}</div>
          <div style="color:#9CA3AF;line-height:1.4">${message}</div>
        </div>
        <button class="ms-alert-close-btn" style="background:none;border:none;color:#6B7280;cursor:pointer;font-size:14px;padding:0;flex-shrink:0;line-height:1"></button>
      </div>
    `;

    alert.dataset.msAlert = type;

    const closeBtn = alert.querySelector('.ms-alert-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        alert.remove();
      });
    }

    // Add dismiss animation CSS if not added yet
    if (!document.getElementById('ms-alert-styles')) {
      const style = document.createElement('style');
      style.id = 'ms-alert-styles';
      style.textContent = `
        @keyframes ms-alert-in {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes ms-alert-out {
          from { opacity: 1; transform: translateX(0); max-height: 100px; }
          to   { opacity: 0; transform: translateX(20px); max-height: 0; padding: 0; margin: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    container.appendChild(alert);

    // Also update the sidebar alert tab
    updateAlertBadge(type, title, message, color, icon);

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      alert.style.animation = 'ms-alert-out 0.3s forwards';
      setTimeout(() => alert.remove(), 300);
    }, 8000);
  }

  // Update the sidebar's alert section
  function updateAlertBadge(type, title, message, color, icon) {
    const alertList = document.getElementById('ms-alert-list');
    if (!alertList) return;

    const item = document.createElement('div');
    item.style.cssText = `padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;align-items:flex-start;animation:ms-alert-in 0.3s forwards`;
    item.innerHTML = `
      <span style="font-size:14px">${icon}</span>
      <div style="flex:1">
        <div style="font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.5px">${title}</div>
        <div style="font-size:11px;color:#9CA3AF;margin-top:1px">${message}</div>
        <div style="font-size:9px;color:#4B5563;margin-top:2px">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>
      </div>
    `;
    alertList.prepend(item);

    // Update alert count badge
    const badge = document.getElementById('ms-alert-badge');
    if (badge) {
      const count = (parseInt(badge.textContent) || 0) + 1;
      badge.textContent = count;
      badge.style.display = 'inline-block';
    }
  }

  // ─── Settings management ───────────────────────────────────────────────────

  function updateSettings(newSettings) {
    alertSettings = deepMerge(alertSettings, newSettings);
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source || {})) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

})();
