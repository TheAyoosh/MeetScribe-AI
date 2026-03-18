// MeetScribe AI - Content Script
// No emojis. VAD-gated transcription. Interim results render instantly.

(function () {
  'use strict';
  if (window.__meetscribe_content_injected) return;
  window.__meetscribe_content_injected = true;

  const PLATFORM = (() => {
    const h = location.hostname;
    if (h.includes('meet.google.com')) return 'Google Meet';
    if (h.includes('zoom.us')) return 'Zoom';
    if (h.includes('teams.microsoft.com')) return 'Microsoft Teams';
    return 'Meeting';
  })();

  // ── State ──────────────────────────────────────────────────────────────────
  let meetingActive = false, sidebarVisible = false, currentSpeaker = null;
  let speakers = new Map(), speakerCounter = 0;
  let transcriptEntries = [], entryIdCounter = 0;
  let recordingStart = null, timerInterval = null;
  let recognition = null, isRecognizing = false;
  let meetingId = null, participantNames = [];
  let speakerSeq = 0;
  const keywordCount = {};

  const COLORS = ['#4A9EFF','#E05C5C','#3DB89A','#D4A843','#7C6FFF','#5BB8A4','#CF6E9B','#6B8FD4'];

  // ── Inject scripts into page world ────────────────────────────────────────
  function injectScript(path, onReady) {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL(path);
    s.onload = () => { s.remove(); onReady && onReady(); };
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Page script events ────────────────────────────────────────────────────
  window.addEventListener('__meetscribe_event', (ev) => {
    const d = ev.detail;
    switch (d.type) {
      case 'AUDIO_CHUNK_READY':      if (meetingActive) handleChunk(d); break;
      case 'NEW_SPEAKER_IDENTIFIED': onNewSpeaker(d); break;
      case 'SPEAKER_IDENTIFIED':     onSpeakerMatched(d); break;
      case 'PARTICIPANTS_UPDATE':    syncNames(d.names); break;
    }
  });

  function sendToPage(cmd) {
    window.dispatchEvent(new CustomEvent('__meetscribe_cmd', { detail: cmd }));
  }

  // ── HuggingFace transcription ─────────────────────────────────────────────
  // Only called when VAD confirms voice activity in the chunk
  let cachedSettings = null;
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, s => { cachedSettings = s; });

  async function handleChunk(d) {
    const { buffer, mimeType, timestamp, speakerId, speakerName, hasVoice } = d;

    // Respect VAD — skip silent chunks entirely
    if (hasVoice === false) return;

    const speaker = speakerId
      ? (speakers.get(speakerId) || getOrCreate(speakerName || 'Unknown'))
      : (currentSpeaker || getOrCreate('You'));
    if (speakerId) currentSpeaker = speaker;

    const s = cachedSettings;
    if (!s?.hfToken || s.transcriptionMode === 'webspeech') return;

    try {
      chrome.runtime.sendMessage({
        type: 'TRANSCRIBE_CHUNK',
        audioArray: Array.from(new Uint8Array(buffer)),
        mimeType: mimeType || 'audio/webm'
      }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.success && response.text) {
          const text = response.text.trim();
          if (text.length > 1) {
            addEntry(text, speaker, timestamp, 'hf');
          }
        }
      });
    } catch (e) {
      console.error('[MeetScribe] Failed to queue chunk for transcription:', e);
    }
  }

  // ── Speaker fingerprint events ────────────────────────────────────────────
  function onNewSpeaker(d) {
    const { speakerId, speakerName, isLocal } = d;
    if (speakers.has(speakerId)) return;
    const sp = createSpeakerWithId(speakerId, speakerName);
    if (isLocal || speakers.size === 1) currentSpeaker = sp;
  }

  function onSpeakerMatched(d) {
    const { speakerId, speakerName } = d;
    currentSpeaker = speakers.get(speakerId) || createSpeakerWithId(speakerId, speakerName);
  }

  // ── Speaker management ────────────────────────────────────────────────────
  function createSpeakerWithId(id, name) {
    if (speakers.has(id)) return speakers.get(id);
    const color = COLORS[speakers.size % COLORS.length];
    const sp = { id, name, color, segments: 0, tones: [] };
    speakers.set(id, sp);
    renderSpeakerCard(sp);
    updateSpeakerCount();
    return sp;
  }

  function createSpeaker(name) {
    const id = `sp${++speakerCounter}`;
    const color = COLORS[(speakerCounter - 1) % COLORS.length];
    const sp = { id, name, color, segments: 0, tones: [] };
    speakers.set(id, sp);
    renderSpeakerCard(sp);
    updateSpeakerCount();
    if (speakerCounter === 1) currentSpeaker = sp;
    return sp;
  }

  function getOrCreate(name) {
    for (const [, sp] of speakers) if (sp.name === name) return sp;
    return createSpeaker(name);
  }

  function syncNames(names) {
    participantNames = names;
    let i = 0;
    for (const [id, sp] of speakers) {
      if (names[i] && sp.name.startsWith('Speaker ')) {
        sp.name = names[i];
        const card = document.getElementById(`speaker-${id}`);
        if (card) {
          card.querySelector('.ms-speaker-card-name').textContent = names[i];
          card.querySelector('.ms-speaker-avatar span').textContent = names[i][0].toUpperCase();
        }
      }
      i++;
    }
  }

  // ── Web Speech API — primary real-time path ───────────────────────────────
  // Interim results paint to screen in <100ms — no API round-trip
  // Final results go through addEntry() same as HF chunks

  function startWebSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;   // word-by-word as you speak
    recognition.maxAlternatives = 1;
    recognition.lang = 'en-US';

    let interimEl = null;

    recognition.onresult = (ev) => {
      let interim = '';

      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];

        if (r.isFinal) {
          // Remove interim display immediately
          if (interimEl) { interimEl.remove(); interimEl = null; }
          clearInterim();

          const text = r[0].transcript.trim();
          if (text.length < 2) continue;

          // Only add via Web Speech if HF is not active
          const s = cachedSettings;
          if (!s?.hfToken || s.transcriptionMode === 'webspeech') {
            addEntry(text, currentSpeaker || getOrCreate('You'), Date.now(), 'ws');
          }
        } else {
          interim += r[0].transcript;
        }
      }

      // Paint interim instantly — directly manipulate DOM, no state overhead
      if (interim) {
        paintInterim(interim, currentSpeaker);
      } else if (!interim && interimEl) {
        interimEl.remove();
        interimEl = null;
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed') showToast('Microphone access required');
    };

    recognition.onend = () => {
      if (meetingActive && isRecognizing) {
        // Restart immediately — no delay
        try { recognition.start(); } catch (_) {}
      }
    };

    try { recognition.start(); isRecognizing = true; } catch (_) {}
  }

  // Interim text element — updated in place, zero layout thrash
  let interimNode = null;

  function paintInterim(text, speaker) {
    const list = document.getElementById('ms-transcript-list');
    if (!list) return;

    if (!interimNode) {
      interimNode = document.createElement('div');
      interimNode.className = 'ms-entry ms-entry-interim';
      interimNode.style.setProperty('--speaker-color', speaker?.color || '#4A9EFF');
      interimNode.innerHTML = `
        <div class="ms-entry-header">
          <div class="ms-speaker-dot" style="background:${speaker?.color || '#4A9EFF'}"></div>
          <span class="ms-speaker-name" style="color:${speaker?.color || '#4A9EFF'}">${esc(speaker?.name || 'You')}</span>
          <span class="ms-interim-tag">live</span>
        </div>
        <div class="ms-entry-text ms-entry-interim-text"></div>`;
      list.appendChild(interimNode);
    }

    // Update only the text node — no re-render of the whole element
    const textEl = interimNode.querySelector('.ms-entry-interim-text');
    if (textEl) textEl.textContent = text;

    // Scroll only if already at bottom
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    if (atBottom) list.scrollTop = list.scrollHeight;
  }

  function clearInterim() {
    if (interimNode) { interimNode.remove(); interimNode = null; }
  }

  function stopWebSpeech() {
    isRecognizing = false;
    clearInterim();
    try { recognition?.stop(); } catch (_) {}
  }

  // ── Transcript entry ──────────────────────────────────────────────────────
  function addEntry(text, speaker, ts, source) {
    // Deduplicate near-identical consecutive entries from same speaker
    if (transcriptEntries.length) {
      const last = transcriptEntries[transcriptEntries.length - 1];
      if (last.speaker?.id === speaker?.id && similarity(last.text, text) > 0.82) return;
    }

    const entry = {
      id: `e${++entryIdCounter}`,
      text,
      speaker: speaker || getOrCreate('You'),
      timestamp: ts || Date.now(),
      source,
      tone: null
    };

    transcriptEntries.push(entry);
    entry.speaker.segments++;
    renderEntry(entry);
    updateInsights(entry);
    updateSpeakerMeta(entry.speaker);
    if (window.__MeetScribeAlerts) window.__MeetScribeAlerts.processTranscriptEntry(entry);

    // Tone analysis — async, doesn't block rendering
    chrome.runtime.sendMessage({ type: 'ANALYZE_TONE', text, speaker: entry.speaker.name }, (r) => {
      if (!r || chrome.runtime.lastError) return;
      entry.tone = r;
      updateTonePill(entry.id, r);
      entry.speaker.tones.push(r);
      updateSpeakerTone(entry.speaker);
    });

    chrome.runtime.sendMessage({
      type: 'APPEND_TRANSCRIPT_ENTRY',
      entry: { id: entry.id, text, speaker: entry.speaker.name, timestamp: entry.timestamp, source }
    });
  }

  function similarity(a, b) {
    const wa = a.toLowerCase().split(/\s+/), wb = b.toLowerCase().split(/\s+/);
    return wa.filter(w => wb.includes(w)).length / Math.max(wa.length, wb.length, 1);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function renderEntry(entry) {
    const list = document.getElementById('ms-transcript-list');
    if (!list) return;
    list.querySelector('.ms-empty-state')?.remove();

    const time = new Date(entry.timestamp).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const el = document.createElement('div');
    el.className = 'ms-entry';
    el.id = `entry-${entry.id}`;
    el.style.setProperty('--speaker-color', entry.speaker.color);
    el.innerHTML =
      `<div class="ms-entry-header">` +
        `<div class="ms-speaker-dot" style="background:${entry.speaker.color}"></div>` +
        `<span class="ms-speaker-name" style="color:${entry.speaker.color}">${esc(entry.speaker.name)}</span>` +
        `<div class="ms-tone-pill" id="tone-${entry.id}"></div>` +
        `<span class="ms-entry-time">${time}</span>` +
      `</div>` +
      `<div class="ms-entry-text">${esc(entry.text)}</div>`;

    // Insert before interim node if it exists
    if (interimNode && interimNode.parentNode === list) {
      list.insertBefore(el, interimNode);
    } else {
      list.appendChild(el);
    }

    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (atBottom) list.scrollTop = list.scrollHeight;
  }



  function updateTonePill(id, t) {
    const pill = document.getElementById(`tone-${id}`);
    if (!pill || !t) return;
    const colors = {
      positive:'#3DB89A', negative:'#E05C5C', neutral:'#6B7280',
      confident:'#4A9EFF', excited:'#D4A843', frustrated:'#E05C5C',
      calm:'#3DB89A', questioning:'#9B87D4', hesitant:'#C4894A',
      assertive:'#4A9EFF'
    };
    const c = colors[t.tone] || colors[t.sentiment] || '#6B7280';
    pill.textContent = t.tone || t.sentiment || '';
    pill.style.cssText = `background:${c}18;color:${c};border-color:${c}40;display:${t.tone?'inline-block':'none'}`;
  }

  function renderSpeakerCard(sp) {
    const list = document.getElementById('ms-speakers-list');
    if (!list) return;
    list.querySelector('.ms-empty-state')?.remove();

    const el = document.createElement('div');
    el.className = 'ms-speaker-card';
    el.id = `speaker-${sp.id}`;
    el.innerHTML =
      `<div class="ms-speaker-avatar" style="background:${sp.color}14;border-color:${sp.color}35">` +
        `<span style="color:${sp.color}">${sp.name[0].toUpperCase()}</span>` +
      `</div>` +
      `<div class="ms-speaker-info">` +
        `<div class="ms-speaker-card-name">${esc(sp.name)}</div>` +
        `<div class="ms-speaker-meta">` +
          `<span id="tt-${sp.id}">0s</span>` +
          `<span id="sc-${sp.id}">0 segments</span>` +
        `</div>` +
        `<div class="ms-tone-bar-wrap"><div class="ms-tone-bar" id="tb-${sp.id}" style="background:${sp.color};width:20%"></div></div>` +
      `</div>` +
      `<button class="ms-rename-btn" data-id="${sp.id}" title="Rename">Rename</button>`;

    el.querySelector('.ms-rename-btn').addEventListener('click', () => renameSpeaker(sp.id));
    list.appendChild(el);
    document.getElementById('ms-tone-section').style.display = 'block';
  }

  function updateSpeakerMeta(sp) {
    if (!sp) return;
    const sc = document.getElementById(`sc-${sp.id}`);
    if (sc) sc.textContent = `${sp.segments} segment${sp.segments !== 1 ? 's' : ''}`;
  }

  function updateSpeakerTone(sp) {
    if (!sp.tones.length) return;
    const bar = document.getElementById(`tb-${sp.id}`);
    const avgE = Math.round(sp.tones.reduce((s, t) => s + (t.energy || 50), 0) / sp.tones.length);
    if (bar) bar.style.width = `${avgE}%`;
    updateToneGrid();
  }

  function updateToneGrid() {
    const grid = document.getElementById('ms-tone-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const sentColors = { positive:'#3DB89A', negative:'#E05C5C', neutral:'#6B7280' };

    speakers.forEach(sp => {
      if (!sp.tones.length) return;
      const last = sp.tones[sp.tones.length - 1];
      const avgE = Math.round(sp.tones.reduce((s, t) => s + (t.energy || 50), 0) / sp.tones.length);
      const sc = sentColors[last.sentiment] || '#6B7280';

      const c = document.createElement('div');
      c.className = 'ms-tone-card';
      c.innerHTML =
        `<div class="ms-tone-card-speaker" style="color:${sp.color}">${sp.name[0].toUpperCase()}</div>` +
        `<div>` +
          `<div style="font-size:11px;font-weight:600;color:${sc}">${last.tone || 'neutral'}</div>` +
          `<div style="font-size:10px;color:#6B7280">${last.sentiment}</div>` +
        `</div>` +
        `<div class="ms-energy-ring" style="--e:${avgE}%;--c:${sp.color}"><span>${avgE}%</span></div>`;
      grid.appendChild(c);
    });
  }

  function updateSpeakerCount() {
    const el = document.getElementById('ms-speaker-count');
    if (el) el.textContent = speakers.size;
  }

  function renameSpeaker(id) {
    const sp = speakers.get(id);
    if (!sp) return;
    const n = prompt(`Rename "${sp.name}":`, sp.name);
    if (!n?.trim()) return;
    sp.name = n.trim();
    sendToPage({ type: 'RENAME_SPEAKER', speakerId: id, name: sp.name });
    const card = document.getElementById(`speaker-${id}`);
    if (card) {
      card.querySelector('.ms-speaker-card-name').textContent = sp.name;
      card.querySelector('.ms-speaker-avatar span').textContent = sp.name[0].toUpperCase();
    }
    document.querySelectorAll('.ms-entry').forEach(el => {
      const dot = el.querySelector('.ms-speaker-dot');
      if (dot?.style.background === sp.color) {
        const nm = el.querySelector('.ms-speaker-name');
        if (nm) nm.textContent = sp.name;
      }
    });
    // Update interim if showing
    if (interimNode) {
      const nm = interimNode.querySelector('.ms-speaker-name');
      if (nm && currentSpeaker?.id === id) nm.textContent = sp.name;
    }
  }

  // ── Insights ──────────────────────────────────────────────────────────────
  function updateInsights(entry) {
    updateSentimentBar(entry);
    detectActionItems(entry);
    entry.text.toLowerCase().split(/\W+/).forEach(w => {
      if (w.length > 4) keywordCount[w] = (keywordCount[w] || 0) + 1;
    });
    if (transcriptEntries.length % 5 === 0) renderKeywords();
  }

  function updateSentimentBar(e) {
    const wrap = document.getElementById('ms-sentiment-timeline');
    const bars = document.getElementById('ms-sentiment-bars');
    if (!bars) return;
    wrap.style.display = 'block';
    const b = document.createElement('div');
    b.className = 'ms-sent-bar';
    b.style.setProperty('--speaker-color', e.speaker?.color || '#4A9EFF');
    b.title = `${e.speaker?.name}: ${e.text.slice(0, 50)}`;
    bars.appendChild(b);
    while (bars.children.length > 30) bars.removeChild(bars.firstChild);
  }

  function detectActionItems(e) {
    if (!/\b(will|should|need to|must|follow.?up|deadline|by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week)|i'll|we'll|assign|action item)\b/i.test(e.text)) return;
    const list = document.getElementById('ms-action-items');
    if (!list) return;
    list.querySelector('.ms-empty-state')?.remove();
    const item = document.createElement('div');
    item.className = 'ms-action-item';
    item.innerHTML =
      `<input type="checkbox" class="ms-checkbox">` +
      `<div class="ms-action-content">` +
        `<div class="ms-action-text">${esc(e.text.slice(0, 120))}${e.text.length > 120 ? '...' : ''}</div>` +
        `<div class="ms-action-meta">` +
          `<span style="color:${e.speaker?.color}">${esc(e.speaker?.name || 'Unknown')}</span>` +
          `<span>${new Date(e.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>` +
        `</div>` +
      `</div>`;
    list.appendChild(item);
  }

  function renderKeywords() {
    const cards = document.getElementById('ms-insight-cards');
    if (!cards) return;
    cards.querySelector('.ms-keywords-card')?.remove();
    const stop = new Set(['that','this','with','have','from','they','will','been','were','their','what','when','which','would','could','should','about','there','just','very','also','then','than']);
    const top = Object.entries(keywordCount)
      .filter(([w]) => !stop.has(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([w]) => w);
    if (!top.length) return;
    cards.querySelector('.ms-empty-state')?.remove();
    const card = document.createElement('div');
    card.className = 'ms-insight-card ms-keywords-card';
    card.innerHTML =
      `<div class="ms-insight-label">Top Keywords</div>` +
      `<div class="ms-keyword-chips">${top.map(w => `<span class="ms-keyword">${esc(w)}</span>`).join('')}</div>`;
    cards.prepend(card);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  async function generateSummary() {
    if (transcriptEntries.length < 5) { showToast('Need more transcript content first'); return; }
    const btn = document.getElementById('ms-summarize-btn');
    btn.textContent = 'Generating...';
    btn.disabled = true;
    chrome.runtime.sendMessage({
      type: 'GENERATE_SUMMARY',
      transcript: transcriptEntries.map(e => `${e.speaker.name}: ${e.text}`).join('\n')
    }, (r) => {
      btn.textContent = 'AI Summary';
      btn.disabled = false;
      if (r?.summary) {
        const cards = document.getElementById('ms-insight-cards');
        cards.querySelector('.ms-summary-card')?.remove();
        const card = document.createElement('div');
        card.className = 'ms-insight-card ms-summary-card';
        card.innerHTML =
          `<div class="ms-insight-label">Meeting Summary</div>` +
          `<div class="ms-summary-text">${esc(r.summary)}</div>`;
        cards.prepend(card);
        document.querySelector('[data-tab="insights"]')?.click();
        showToast('Summary ready');
      }
    });
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function exportTranscript(fmt) {
    const date = new Date().toLocaleDateString(), title = detectTitle();
    let out = '';
    if (fmt === 'txt') {
      out = `TRANSCRIPT — ${title}\n${date}\n${'─'.repeat(60)}\n\n`;
      transcriptEntries.forEach(e => {
        out += `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.speaker.name}: ${e.text}\n`;
        if (e.tone) out += `  Tone: ${e.tone.tone} | ${e.tone.sentiment}\n`;
        out += '\n';
      });
    } else if (fmt === 'md') {
      out = `# ${title}\n\n**Date:** ${date}\n\n## Transcript\n\n`;
      transcriptEntries.forEach(e => {
        out += `**${e.speaker.name}** *(${new Date(e.timestamp).toLocaleTimeString()})*\n\n${e.text}\n\n---\n\n`;
      });
    } else if (fmt === 'json') {
      out = JSON.stringify({
        title, date,
        transcript: transcriptEntries.map(e => ({
          speaker: e.speaker.name, text: e.text,
          timestamp: e.timestamp, tone: e.tone
        }))
      }, null, 2);
    } else if (fmt === 'srt') {
      transcriptEntries.forEach((e, i) => {
        const s = srt(e.timestamp - (recordingStart || e.timestamp));
        const end = srt(e.timestamp - (recordingStart || e.timestamp) + 3000);
        out += `${i + 1}\n${s} --> ${end}\n${e.speaker.name}: ${e.text}\n\n`;
      });
    }
    const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/\s+/g, '_')}_${date}.${fmt}`;
    a.click();
    document.getElementById('ms-export-menu').style.display = 'none';
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  function startRecording() {
    meetingActive = true;
    recordingStart = Date.now();
    meetingId = `m_${Date.now().toString(36)}`;
    sendToPage({ type: 'START_CAPTURE', meetingId });
    startWebSpeech();
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, s => { cachedSettings = s; });
    chrome.runtime.sendMessage({ type: 'START_CAPTURE', title: detectTitle(), platform: PLATFORM, meetingId });

    const btn = document.getElementById('ms-start-btn');
    if (btn) { btn.textContent = 'Stop'; btn.classList.add('ms-recording'); }
    document.getElementById('ms-live-indicator').style.display = 'flex';
    document.getElementById('ms-live-dot')?.classList.add('ms-live');
    document.getElementById('ms-status-badge').textContent = 'LIVE';
    document.getElementById('ms-status-badge')?.classList.add('ms-badge-live');
    document.querySelector('#tab-transcript .ms-empty-state')?.remove();

    timerInterval = setInterval(() => {
      const el = document.getElementById('ms-timer');
      if (!el) return;
      const e = Date.now() - recordingStart;
      el.textContent =
        String(Math.floor(e / 60000)).padStart(2, '0') + ':' +
        String(Math.floor((e % 60000) / 1000)).padStart(2, '0');
    }, 1000);
  }

  function stopRecording() {
    meetingActive = false;
    clearInterval(timerInterval);
    stopWebSpeech();
    sendToPage({ type: 'STOP_CAPTURE' });
    chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });

    const btn = document.getElementById('ms-start-btn');
    if (btn) { btn.textContent = 'Record'; btn.classList.remove('ms-recording'); }
    document.getElementById('ms-live-indicator').style.display = 'none';
    document.getElementById('ms-live-dot')?.classList.remove('ms-live');
    document.getElementById('ms-status-badge').textContent = 'READY';
    document.getElementById('ms-status-badge')?.classList.remove('ms-badge-live');
    showToast('Meeting saved');
  }

  // ── Sidebar HTML ──────────────────────────────────────────────────────────
  function injectSidebar() {
    if (document.getElementById('meetscribe-sidebar')) return;

    const sb = document.createElement('div');
    sb.id = 'meetscribe-sidebar';
    sb.className = 'meetscribe-sidebar meetscribe-hidden';
    
    chrome.storage.local.get('meetscribe_settings', (res) => {
      const s = res.meetscribe_settings || {};
      if (s.darkMode === false) sb.classList.add('light-mode');
    });

    sb.innerHTML = buildSidebarHTML();
    document.body.appendChild(sb);

    const tog = document.createElement('div');
    tog.id = 'meetscribe-toggle';
    tog.innerHTML =
      `<div class="ms-toggle-icon">` +
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">` +
          `<path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="currentColor" stroke-width="1.5"/>` +
          `<path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
        `</svg>` +
        `<span class="ms-toggle-label">MS</span>` +
        `<div class="ms-live-dot" id="ms-live-dot"></div>` +
      `</div>`;
    tog.addEventListener('click', toggleSidebar);
    document.body.appendChild(tog);
    bindEvents();
  }

  function buildSidebarHTML() {
    return (
      `<div class="ms-sidebar-inner">` +

      // Header
      `<div class="ms-header">` +
        `<div class="ms-header-left">` +
          `<div class="ms-logo">` +
            `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M8 12l2 2 4-4" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>` +
          `</div>` +
          `<span class="ms-title">MeetScribe</span>` +
          `<div class="ms-badge" id="ms-status-badge">READY</div>` +
        `</div>` +
        `<div class="ms-header-right">` +
          `<button class="ms-icon-btn" id="ms-settings-btn" title="Settings">` +
            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.5"/></svg>` +
          `</button>` +
          `<button class="ms-icon-btn" id="ms-close-btn" title="Close">` +
            `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>` +
          `</button>` +
        `</div>` +
      `</div>` +

      // Tabs — text only, no emojis
      `<div class="ms-tabs">` +
        `<button class="ms-tab active" data-tab="transcript">Transcript</button>` +
        `<button class="ms-tab" data-tab="speakers">Speakers</button>` +
        `<button class="ms-tab" data-tab="insights">Insights</button>` +
        `<button class="ms-tab" data-tab="actions">Actions</button>` +
        `<button class="ms-tab" data-tab="alerts">Alerts <span id="ms-alert-badge" class="ms-alert-count" style="display:none">0</span></button>` +
      `</div>` +

      `<div class="ms-tab-content">` +

      // Transcript tab
      `<div class="ms-tab-panel active" id="tab-transcript">` +
        `<div class="ms-controls">` +
          `<button class="ms-btn ms-btn-primary" id="ms-start-btn">Record</button>` +
          `<input type="text" class="ms-search" id="ms-search" placeholder="Search transcript">` +
        `</div>` +
        `<div class="ms-live-indicator" id="ms-live-indicator" style="display:none">` +
          `<div class="ms-pulse"></div>` +
          `<span>Recording</span>` +
          `<span class="ms-timer" id="ms-timer">00:00</span>` +
        `</div>` +
        `<div class="ms-transcript-list" id="ms-transcript-list">` +
          `<div class="ms-empty-state"><p>Click Record to begin transcription</p></div>` +
        `</div>` +
      `</div>` +

      // Speakers tab
      `<div class="ms-tab-panel" id="tab-speakers">` +
        `<div class="ms-speakers-header">` +
          `<span class="ms-section-label">Detected Speakers</span>` +
          `<span class="ms-speaker-count" id="ms-speaker-count">0</span>` +
        `</div>` +
        `<div class="ms-speakers-list" id="ms-speakers-list">` +
          `<div class="ms-empty-state"><p>Speakers appear as they talk</p></div>` +
        `</div>` +
        `<div class="ms-tone-section" id="ms-tone-section" style="display:none">` +
          `<div class="ms-section-label" style="padding:8px 12px 4px">Tone Overview</div>` +
          `<div class="ms-tone-grid" id="ms-tone-grid"></div>` +
        `</div>` +
      `</div>` +

      // Insights tab
      `<div class="ms-tab-panel" id="tab-insights">` +
        `<div class="ms-insight-cards" id="ms-insight-cards">` +
          `<div class="ms-empty-state"><p>Insights appear as the conversation builds</p></div>` +
        `</div>` +
        `<div id="ms-sentiment-timeline" style="display:none;padding:8px 12px;border-top:1px solid var(--ms-border)">` +
          `<div class="ms-section-label" style="margin-bottom:6px">Sentiment Timeline</div>` +
          `<div id="ms-sentiment-bars" style="display:flex;gap:2px;height:18px;align-items:flex-end"></div>` +
        `</div>` +
      `</div>` +

      // Actions tab
      `<div class="ms-tab-panel" id="tab-actions">` +
        `<div class="ms-action-items" id="ms-action-items">` +
          `<div class="ms-empty-state"><p>Action items are detected automatically</p></div>` +
        `</div>` +
        `<div class="ms-actions-footer">` +
          `<button class="ms-btn ms-btn-outline" id="ms-summarize-btn">AI Summary</button>` +
          `<button class="ms-btn ms-btn-outline" id="ms-export-btn">Export</button>` +
        `</div>` +
        `<div class="ms-export-menu" id="ms-export-menu" style="display:none">` +
          `<button class="ms-export-item" data-fmt="txt">Plain Text</button>` +
          `<button class="ms-export-item" data-fmt="md">Markdown</button>` +
          `<button class="ms-export-item" data-fmt="json">JSON</button>` +
          `<button class="ms-export-item" data-fmt="srt">SRT Subtitles</button>` +
        `</div>` +
      `</div>` +

      // Alerts tab
      `<div class="ms-tab-panel" id="tab-alerts">` +
        `<div class="ms-alerts-header">` +
          `<span class="ms-section-label">Real-Time Alerts</span>` +
          `<button id="ms-test-alert-btn" class="ms-test-btn">Test</button>` +
        `</div>` +
        `<div id="ms-alert-list" class="ms-alert-list">` +
          `<div class="ms-empty-state"><p>No alerts yet</p></div>` +
        `</div>` +
        `<div class="ms-alert-settings">` +
          `<div class="ms-section-label" style="margin-bottom:8px">Alert Settings</div>` +
          `<div class="ms-toggle-rows">` +
            `<div class="ms-toggle-row"><span>Foul Language</span><label class="ms-switch"><input type="checkbox" id="ms-al-foul" checked><span class="ms-slider-switch"></span></label></div>` +
            `<div class="ms-toggle-row"><span>Off-Topic Warning</span><label class="ms-switch"><input type="checkbox" id="ms-al-offtopic" checked><span class="ms-slider-switch"></span></label></div>` +
            `<div class="ms-toggle-row"><span>Interruptions</span><label class="ms-switch"><input type="checkbox" id="ms-al-interrupt" checked><span class="ms-slider-switch"></span></label></div>` +
            `<div class="ms-toggle-row"><span>Voice Alerts</span><label class="ms-switch"><input type="checkbox" id="ms-al-voice" checked><span class="ms-slider-switch"></span></label></div>` +
            `<div class="ms-toggle-row"><span>Audio Chimes</span><label class="ms-switch"><input type="checkbox" id="ms-al-chime" checked><span class="ms-slider-switch"></span></label></div>` +
            `<div class="ms-toggle-row"><span>Overtime (55 min)</span><label class="ms-switch"><input type="checkbox" id="ms-al-overtime" checked><span class="ms-slider-switch"></span></label></div>` +
          `</div>` +
        `</div>` +
      `</div>` +

      `</div>` + // ms-tab-content

      // Toast
      `<div class="ms-toast" id="ms-toast"></div>` +

      // Settings overlay
      `<div class="ms-settings-panel" id="ms-settings-panel" style="display:none">` +
        `<div class="ms-settings-header">` +
          `<span>Settings</span>` +
          `<button class="ms-icon-btn" id="ms-settings-close">` +
            `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>` +
          `</button>` +
        `</div>` +
        `<div class="ms-settings-body">` +
          `<label class="ms-label">HuggingFace Token<span class="ms-hint">huggingface.co/settings/tokens</span></label>` +
          `<input type="password" class="ms-input" id="ms-hf-token" placeholder="hf_...">` +
          `<label class="ms-label">Gemini API Key<span class="ms-hint">aistudio.google.com/apikey</span></label>` +
          `<input type="password" class="ms-input" id="ms-gemini-key" placeholder="AIza...">` +
          `<label class="ms-label">Transcription Model</label>` +
          `<select class="ms-select" id="ms-model-select">` +
            `<option value="whisper-base">Whisper Base — fast</option>` +
            `<option value="whisper-small">Whisper Small — accurate</option>` +
            `<option value="parakeet">Parakeet TDT 0.6B — best</option>` +
          `</select>` +
          `<label class="ms-label">Transcription Mode</label>` +
          `<select class="ms-select" id="ms-tmode-select">` +
            `<option value="hf">HuggingFace API</option>` +
            `<option value="webspeech">Web Speech (no key needed)</option>` +
          `</select>` +
          `<button class="ms-btn ms-btn-primary" id="ms-save-settings" style="width:100%;margin-top:16px">Save</button>` +
        `</div>` +
      `</div>` +

      `</div>` // ms-sidebar-inner
    );
  }

  // ── Event binding ─────────────────────────────────────────────────────────
  function bindEvents() {
    document.querySelectorAll('.ms-tab').forEach(t => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.ms-tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.ms-tab-panel').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById(`tab-${t.dataset.tab}`)?.classList.add('active');
      });
    });

    document.getElementById('ms-start-btn').addEventListener('click', () => {
      meetingActive ? stopRecording() : startRecording();
    });

    document.getElementById('ms-close-btn').addEventListener('click', () => {
      document.getElementById('meetscribe-sidebar').classList.add('meetscribe-hidden');
      document.getElementById('meetscribe-toggle').classList.remove('ms-active');
      sidebarVisible = false;
    });

    document.getElementById('ms-settings-btn').addEventListener('click', openSettings);
    document.getElementById('ms-settings-close').addEventListener('click', closeSettings);
    document.getElementById('ms-save-settings').addEventListener('click', saveSettings);

    document.getElementById('ms-search').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.ms-entry:not(.ms-entry-interim)').forEach(el => {
        el.style.display = (!q || el.textContent.toLowerCase().includes(q)) ? '' : 'none';
      });
    });

    document.getElementById('ms-summarize-btn').addEventListener('click', generateSummary);

    document.getElementById('ms-export-btn').addEventListener('click', () => {
      const m = document.getElementById('ms-export-menu');
      m.style.display = m.style.display === 'none' ? 'flex' : 'none';
    });

    document.querySelectorAll('.ms-export-item').forEach(b => {
      b.addEventListener('click', () => exportTranscript(b.dataset.fmt));
    });

    // Alert toggles
    ['foul','offtopic','interrupt','voice','chime','overtime'].forEach(key => {
      const el = document.getElementById(`ms-al-${key}`);
      if (!el) return;
      el.addEventListener('change', () => {
        if (!window.__MeetScribeAlerts) return;
        const s = {};
        if (key === 'foul')     s.foulLanguage  = { enabled: el.checked };
        if (key === 'offtopic') s.offTopic      = { enabled: el.checked };
        if (key === 'interrupt') s.interruption = { enabled: el.checked };
        if (key === 'voice')    { s.foulLanguage = { voiceAlert: el.checked }; s.offTopic = { voiceAlert: el.checked }; s.overtime = { voiceAlert: el.checked }; }
        if (key === 'chime')    { s.foulLanguage = { chime: el.checked }; s.interruption = { chime: el.checked }; s.overtime = { chime: el.checked }; }
        if (key === 'overtime') s.overtime = { enabled: el.checked };
        window.__MeetScribeAlerts.updateSettings(s);
      });
    });

    document.getElementById('ms-test-alert-btn')?.addEventListener('click', () => {
      if (window.__MeetScribeAlerts) {
        window.__MeetScribeAlerts.processTranscriptEntry({
          text: 'Let me just check my emails quickly and order lunch',
          speaker: currentSpeaker || { id: 'sp1', name: 'You', color: '#4A9EFF' },
          timestamp: Date.now()
        });
      }
    });
  }

  function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
    document.getElementById('meetscribe-sidebar').classList.toggle('meetscribe-hidden', !sidebarVisible);
    document.getElementById('meetscribe-toggle').classList.toggle('ms-active', sidebarVisible);
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  function openSettings() {
    document.getElementById('ms-settings-panel').style.display = 'flex';
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, s => {
      if (!s) return;
      document.getElementById('ms-hf-token').value = s.hfToken || '';
      document.getElementById('ms-gemini-key').value = s.geminiKey || '';
      document.getElementById('ms-model-select').value = s.model || 'whisper-base';
      document.getElementById('ms-tmode-select').value = s.transcriptionMode || 'hf';
    });
  }

  function closeSettings() { document.getElementById('ms-settings-panel').style.display = 'none'; }

  function saveSettings() {
    const settings = {
      hfToken: document.getElementById('ms-hf-token').value.trim(),
      geminiKey: document.getElementById('ms-gemini-key').value.trim(),
      model: document.getElementById('ms-model-select').value,
      transcriptionMode: document.getElementById('ms-tmode-select').value
    };
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, () => {
      cachedSettings = settings;
      showToast('Settings saved');
      closeSettings();
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  function detectTitle() {
    return document.title.replace(' - Google Meet', '').replace(' | Zoom', '').trim() || 'Meeting';
  }

  function showToast(msg) {
    const t = document.getElementById('ms-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('ms-toast-show');
    setTimeout(() => t.classList.remove('ms-toast-show'), 3000);
  }

  function srt(ms) {
    ms = Math.max(0, ms);
    return (
      String(Math.floor(ms / 3600000)).padStart(2, '0') + ':' +
      String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0') + ':' +
      String(Math.floor((ms % 60000) / 1000)).padStart(2, '0') + ',' +
      String(ms % 1000).padStart(3, '0')
    );
  }

  function esc(t) {
    return (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Background messages ───────────────────────────────────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.meetscribe_settings) {
      const s = changes.meetscribe_settings.newValue || {};
      cachedSettings = s;
      const sb = document.getElementById('meetscribe-sidebar');
      if (sb) {
        if (s.darkMode === false) sb.classList.add('light-mode');
        else sb.classList.remove('light-mode');
      }
    }
  });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'TOGGLE_SIDEBAR') toggleSidebar();
    if (msg.type === 'OPEN_SETTINGS') openSettings();
    if (msg.type === 'TRANSCRIPT_UPDATE') {
      // Receive transcription done by background script via offscreen document
      const { text, speaker, timestamp } = msg.entry || {};
      if (text) {
        // Resolve speaker object
        const sp = speakers.get((speaker || '').replace('speaker_', 'sp_')) 
                   || getOrCreate(speaker || 'Unknown');
        addEntry(text, sp, timestamp, 'hf-bg');
      }
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    injectScript('content/audio-interceptor.js');
    if (window.__MeetScribeAlerts) window.__MeetScribeAlerts.init();
    injectSidebar();
    createSpeaker('You');
    setTimeout(() => {
      const inMeeting = document.querySelector('.crqnQb') || location.pathname.length > 5;
      if (inMeeting && !sidebarVisible) toggleSidebar();
    }, 1800);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
