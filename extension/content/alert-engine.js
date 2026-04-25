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
      warningAt: 5,
    },
    professionalism: {
      enabled: true,
      fillerThreshold: 3, // Max fillers per segment
      message: 'Professionalism advisory: excessive filler words detected.'
    }
  };

  const FILLER_WORDS = new Set(['um', 'uh', 'ah', 'er', 'hmm', 'like', 'actually', 'basically', 'literally', 'you know', 'i mean']);

  // ─── Foul Language Dictionary ─────────────────────────────────────────────
  // Tiered: tier 1 = mild warning, tier 2 = strong warning

  const FOUL_TIER1 = new Set([
    'damn', 'crap', 'hell', 'ass', 'jerk', 'idiot', 'moron', 'stupid',
    'dumb', 'sucks', 'suck', 'loser', 'shut up', 'shutup', 'hate you',
    'screw', 'screwing', 'freaking', 'fricking', 'bloody', 'bastard',
    'unprofessional', 'clueless', 'pathetic', 'worthless', 'lazy', 'terrible'
  ]);

  const badWords = {
    en: ['fuck','shit','bitch','asshole','bastard','dick','pussy','cock','cunt'],
    hi: ['chutiya','kamina','harami','saala','gandu','bhadwa','madarchod','behenchod','gaali','pagal','bewakoof'],
    kn: ['sule','bolimaga','holeya','kanna','lofer'],
    te: ['lanja','kodaka','erripappa','pichodu','vp','dhed']
  };

  const FOUL_TIER2 = new Set([
    'fuck', 'shit', 'bitch', 'asshole', 'bullshit', 'motherfucker',
    'dickhead', 'piss off', 'cunt', 'wanker', 'cock', 'twat',
    'dumbass', 'jackass', 'piece of shit', 'son of a bitch',
    'racist', 'bigot', 'retard', 'slut', 'whore', 'toxic', 'hostile'
  ]);

  function containsBadWords(text) {
    const lower = text.toLowerCase();
    for (const lang in badWords) {
      if (badWords[lang].some(w => lower.includes(w))) return true;
    }
    return false;
  }

  const COMPLAINT_WORDS = new Set([
    'not working', 'failing', 'broken', 'useless', 'garbage', 'error',
    'buggy', 'slow', 'horrible', 'waste', 'complaint', 'dissatisfied',
    'unhappy', 'frustrated', 'annoyed', 'fix this', 'terrible', 'awful'
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
  let groqKey = '';
  let groqChatModel = 'llama-3.3-70b-versatile';
  let isEnabled = true;

  // Audio context for chimes
  let alertAudioCtx = null;

  // ─── Public API ────────────────────────────────────────────────────────────

  window.__MeetScribeAlerts = {
    init,
    processTranscriptEntry,
    updateSettings,
    setGeminiKey: (key) => { geminiKey = key; },
    setGroqKey: (key) => { groqKey = key; },
    setGroqChatModel: (model) => { groqChatModel = model; },
    setEnabled: (v) => { isEnabled = v; },
    setMeetingStart: (t) => { meetingStartTime = t; overtimeWarned = false; },
    getTopicKeywords: () => meetingTopicKeywords
  };

  window.addEventListener('__meetscribe_cmd', (ev) => {
    const cmd = ev.detail;
    if (cmd.type === 'PROCESS_TRANSCRIPT_ENTRY') {
      processTranscriptEntry(cmd.entry);
    } else if (cmd.type === 'START_CAPTURE') {
      init(cmd.settings);
    } else if (cmd.type === 'UPDATE_SETTINGS') {
      if (cmd.settings?.geminiKey) geminiKey = cmd.settings.geminiKey;
      if (cmd.settings?.groqKey) groqKey = cmd.settings.groqKey;
      if (cmd.settings?.groqChatModel) groqChatModel = cmd.settings.groqChatModel;
    }
  });

  // Auto-init on load
  init();

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init(settings = {}) {
    alertSettings = deepMerge(alertSettings, settings);
    meetingStartTime = Date.now();

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

    // Establish topic from first 2 entries (faster monitoring)
    if (!topicEstablished && recentEntryBuffer.length >= 2) {
      establishTopic();
    }

    // Run detectors in parallel
    const [foulResult, offTopicResult, flawResult, complaintResult] = await Promise.all([
      detectFoulLanguage(text, speaker),
      topicEstablished ? detectOffTopic(text, speaker) : Promise.resolve(null),
      detectFlawWords(text, speaker),
      detectComplaint(text, speaker)
    ]);

    if (foulResult || (entry.tone && (entry.tone.sentiment === 'negative' || entry.tone.tone === 'hostile'))) {
      if (!foulResult) {
        triggerFoulAlert({ tier: 1, word: 'hostile tone', text: entry.text }, speaker);
      } else {
        triggerFoulAlert(foulResult, speaker);
      }
    }
    if (offTopicResult) triggerOffTopicAlert(offTopicResult, speaker);
    if (flawResult) triggerFlawAlert(flawResult, speaker);
    if (complaintResult) triggerComplaintAlert(complaintResult, speaker);
  }

  // ─── Flaw/Filler Word Detection ───────────────────────────────────────────

  function detectFlawWords(text, speaker) {
    if (!alertSettings.professionalism.enabled) return null;
    const lower = text.toLowerCase().split(/\W+/);
    const fillers = lower.filter(w => FILLER_WORDS.has(w));
    
    if (fillers.length >= alertSettings.professionalism.fillerThreshold) {
      return { type: 'filler', count: fillers.length, text };
    }
    return null;
  }

  async function detectComplaint(text, speaker) {
    const lower = text.toLowerCase();
    // Local check
    for (const word of COMPLAINT_WORDS) {
      if (lower.includes(word)) return { method: 'local', word, text };
    }
    // AI check for sentiment
    if (groqKey && text.length > 15) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: groqChatModel,
            messages: [{ role: 'user', content: `Text: "${text}"\nIs this a complaint or an expression of high frustration? Reply with ONLY: YES or NO` }],
            max_tokens: 5, temperature: 0
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.choices?.[0]?.message?.content?.trim().toUpperCase() === 'YES') return { method: 'ai', text };
        }
      } catch (e) {}
    }
    return null;
  }

  // ─── Foul Language Detection ───────────────────────────────────────────────

  async function checkFoulWithAI(text) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: groqChatModel || 'llama-3.3-70b-versatile',
          messages: [{
            role: 'user',
            content: `Text: "${text}"\n\nIs this text unprofessional, rude, or contain bad words in English, Hindi, Kannada, or Telugu? Reply with only YES or NO.`
          }],
          max_tokens: 5,
          temperature: 0
        })
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.toUpperCase().includes('YES');
    } catch (e) { return false; }
  }

  async function detectFoulLanguage(text, speaker) {
    if (!alertSettings.foulLanguage.enabled) return null;

    const lower = text.toLowerCase();
    const now = Date.now();

    // Cooldown: don't alert more than once per 5 seconds
    if (now - lastFoulAlert < 5000) return null;

    if (containsBadWords(text)) return { tier: 2, word: 'policy-violation', text };

    // Check tier 2 first (more serious)
    for (const word of FOUL_TIER2) {
      const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
      if (regex.test(lower)) return { tier: 2, word, text };
    }

    // Tier 1 local check
    for (const word of FOUL_TIER1) {
      const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
      if (regex.test(lower)) return { tier: 1, word, text };
    }

    // AI Check for multilingual foul/bad words (Hindi, Kannada, Telugu)
    if (groqKey && text.length > 5) {
      const isBad = await checkFoulWithAI(text);
      if (isBad) return { tier: 2, word: 'multilingual-policy', text };
    }

    return null;
  }

  // ─── Topic Establishment ───────────────────────────────────────────────────

  function establishTopic() {
    const allText = recentEntryBuffer.map(e => e.text).join(' ').toLowerCase();
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'that', 'this', 'these', 'those', 'it', 'its', 'i', 'you', 'he', 'she', 'we', 'they', 'and', 'or', 'but', 'for', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'dont', 'cant', 'wont', 'im', 'its', 'also']);

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
    // Cooldown: max once per 20 seconds
    if (now - lastOffTopicAlert < 20000) return null;
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

      // Priority 1: Groq
      if (groqKey) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: groqChatModel || 'llama-3.3-70b-versatile',
            messages: [{
              role: 'user',
              content: `Meeting topic keywords: ${topicContext}\nRecent conversation: "${recentContext}"\nNew statement: "${text}"\n\nIs this new statement clearly off-topic from the meeting? The meeting may be in English, Hindi, Kannada, or Telugu. Evaluate the context carefully. Reply with only: YES or NO`
            }],
            max_tokens: 5,
            temperature: 0
          })
        });

        if (res.ok) {
          const data = await res.json();
          const answer = data.choices?.[0]?.message?.content?.trim().toUpperCase();
          if (answer === 'YES') return { confidence: 0.9, method: 'groq', text };
          return null;
        }
      }

      // Priority 2: Gemini
      if (geminiKey) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text:
                    `Meeting topic keywords: ${topicContext}
  Recent conversation: "${recentContext}"
  New statement: "${text}"
  
  Is this new statement clearly off-topic from the meeting? Reply with only: YES or NO` }]
              }],
              generationConfig: { maxOutputTokens: 5, temperature: 0 }
            })
          }
        );

        if (res.ok) {
          const data = await res.json();
          const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase();
          if (answer === 'YES') return { confidence: 0.9, method: 'gemini', text };
        }
      }

      return null;
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
      icon: tier === 2 ? '🚫' : '⚠️',
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
        ? `Warning for ${speakerName}. That language is strictly prohibited. Please continue professionally.`
        : `${speakerName}, please avoid using such words. This is a professional meeting.`;
      speak(msg, { rate: 1.05, pitch: 1.0 });
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
      speak(`Advisory: ${speakerName}, the conversation is drifting off-topic. Please refocus on the meeting goals immediately.`, { rate: 1.1, pitch: 1.05 });
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

  function triggerFlawAlert(result, speaker) {
    const speakerName = speaker?.name || 'Someone';
    showSidebarAlert({
      type: 'flaw',
      icon: '💡',
      title: 'Speech Quality',
      message: `${speakerName} is using excessive filler words (${result.count}).`,
      color: '#4A9EFF'
    });
    if (alertSettings.professionalism.enabled) {
      playChime('gentle');
      if (alertSettings.foulLanguage.voiceAlert) { // Reuse voice setting
        speak(`${speakerName}, please avoid excessive filler words. Clarity is important for this discussion.`, { rate: 1.1 });
      }
    }
    console.log('[MeetScribe Alerts] Flaw detected:', result);
  }

  function triggerComplaintAlert(result, speaker) {
    const speakerName = speaker?.name || 'Someone';
    showSidebarAlert({
      type: 'complaint',
      icon: '⚠️',
      title: 'Complaint Detected',
      message: `${speakerName} is expressing frustration or a complaint.`,
      color: '#FF9E4A'
    });
    console.log('[MeetScribe Alerts] Complaint detected:', result);
  }

  // ─── Voice Synthesis ──────────────────────────────────────────────────────
  // Uses Web Speech Synthesis API — works with zero config, zero internet

  let speakQueue = [];
  let isSpeaking = false;

  function speak(text, opts = {}) {
    // 1. Local Alert (User hears it)
    speakLocal(text, opts);

    // Note: Public warning injection disabled as per user request
    /*
    if (opts.injectPublicly !== false) {
      injectPublicWarning(text);
    }
    */
  }

  function speakLocal(text, opts = {}) {
    speakQueue.push({ text, opts });
    if (!isSpeaking) drainSpeakQueue();
  }

  async function injectPublicWarning(text) {
    try {
      // Use Google TTS to get a blob (reliable for short warnings)
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
      const res = await fetch(url);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        window.dispatchEvent(new CustomEvent('__meetscribe_cmd', {
          detail: { type: 'INJECT_AUDIO', audioBase64: base64 }
        }));
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.warn('[MeetScribe Alerts] Public injection failed:', e);
    }
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
    let voices = speechSynthesis.getVoices();
    if (!voices.length) {
      // Fallback if voices not loaded yet
      speechSynthesis.onvoiceschanged = () => {
        voices = speechSynthesis.getVoices();
        drainSpeakQueue();
      };
      return;
    }
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
          playTone(ctx, masterGain, 880, 0, 0.15, 0.3);
          playTone(ctx, masterGain, 660, 0.2, 0.15, 0.3);
          playTone(ctx, masterGain, 440, 0.4, 0.25, 0.3);
          break;

        case 'warning_soft':
          // Two soft beeps
          playTone(ctx, masterGain, 660, 0, 0.1, 0.2);
          playTone(ctx, masterGain, 550, 0.2, 0.1, 0.2);
          break;

        case 'gentle':
          // Single soft ascending chime
          playTone(ctx, masterGain, 523, 0, 0.08, 0.15, 'sine');
          playTone(ctx, masterGain, 659, 0.15, 0.08, 0.15, 'sine');
          break;

        case 'overtime':
          // Three ascending tones — reminder
          playTone(ctx, masterGain, 440, 0, 0.1, 0.2, 'sine');
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
          top: 20px;
          right: 20px;
          width: 320px;
          z-index: 2147483647; 
          display: flex;
          flex-direction: column;
          gap: 12px;
          pointer-events: none;
        `;
        (document.body || document.documentElement).appendChild(container);
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

    // Secure DOM Construction (Fixes TrustedHTML error)
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:flex-start;gap:8px';

    const iconSpan = document.createElement('span');
    iconSpan.style.cssText = 'font-size:16px;flex-shrink:0';
    iconSpan.textContent = icon;

    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'flex:1;min-width:0';

    const titleDiv = document.createElement('div');
    titleDiv.style.cssText = `font-weight:700;font-size:11px;color:${color};margin-bottom:2px;text-transform:uppercase;letter-spacing:0.5px`;
    titleDiv.textContent = title;

    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = 'color:#9CA3AF;line-height:1.4';
    msgDiv.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'background:none;border:none;color:#6B7280;cursor:pointer;font-size:14px;padding:0;flex-shrink:0;line-height:1';
    closeBtn.textContent = '×';
    closeBtn.onclick = (e) => { e.stopPropagation(); alert.remove(); };

    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(msgDiv);
    wrapper.appendChild(iconSpan);
    wrapper.appendChild(contentDiv);
    wrapper.appendChild(closeBtn);
    alert.appendChild(wrapper);

    alert.dataset.msAlert = type;

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
      if (alert.parentNode) {
        alert.style.animation = 'ms-alert-out 0.3s forwards';
        setTimeout(() => alert.remove(), 300);
      }
    }, 8000);
  }

  // Update the sidebar's alert section
  function updateAlertBadge(type, title, message, color, icon) {
    const alertList = document.getElementById('ms-alert-list');
    if (!alertList) return;

    const item = document.createElement('div');
    item.style.cssText = `padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;align-items:flex-start;animation:ms-alert-in 0.3s forwards`;
    
    const iconSpan = document.createElement('span');
    iconSpan.style.cssText = 'font-size:14px';
    iconSpan.textContent = icon;

    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = 'flex:1';

    const titleDiv = document.createElement('div');
    titleDiv.style.cssText = `font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.5px`;
    titleDiv.textContent = title;

    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = 'font-size:11px;color:#9CA3AF;margin-top:1px';
    msgDiv.textContent = message;

    const timeDiv = document.createElement('div');
    timeDiv.style.cssText = 'font-size:9px;color:#4B5563;margin-top:2px';
    timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(msgDiv);
    contentDiv.appendChild(timeDiv);
    item.appendChild(iconSpan);
    item.appendChild(contentDiv);

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
