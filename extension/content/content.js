// MeetScribe AI - Content Script
// Optimized for stability and reliability. Fixed DOM injection and reference errors.

(function () {
  'use strict';
  if (window.__meetscribe_content_injected) return;
  window.__meetscribe_content_injected = true;

  const PLATFORM = (() => {
    const h = location.hostname;
    if (h.includes('meet.google.com')) return 'Google Meet';
    if (h.includes('zoom.us')) return 'Zoom';
    if (h.includes('teams.microsoft.com')) return 'Microsoft Teams';
    if (h.includes('teams.live.com')) return 'Microsoft Teams';
    return 'Meeting';
  })();

  // ── State ──────────────────────────────────────────────────────────────────
  let meetingActive = false, sidebarVisible = false, currentSpeaker = null;
  let speakers = new Map(), speakerCounter = 0;
  let transcriptEntries = [], entryIdCounter = 0;
  let recordingStart = null, timerInterval = null;
  let recognition = null, isRecognizing = false;
  let meetingId = null, participantNames = [], summaryText = '';
  let keywordCount = {};
  let agentChatHistory = [];

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
      case 'SPEAKER_RENAMED':        onSpeakerRenamed(d); break;
      case 'PARTICIPANTS_UPDATE':    syncNames(d.names); break;
    }
  });

  function sendToPage(cmd) {
    window.dispatchEvent(new CustomEvent('__meetscribe_cmd', { detail: cmd }));
  }

  // ── Transcription ─────────────────────────────────────────────────────────
  let cachedSettings = null;
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, s => { cachedSettings = s; });

  async function handleChunk(d) {
    const { buffer, mimeType, timestamp, speakerId, speakerName, hasVoice, isLocal } = d;

    if (hasVoice === false || !buffer) return;
    if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) return;

    const speaker = speakerId
      ? (speakers.get(speakerId) || getOrCreate(speakerName || 'Unknown'))
      : (currentSpeaker || getOrCreate('You'));
    
    const base64Audio = await new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            const parts = reader.result.split(',');
            if (parts.length > 1) resolve(parts[1]);
            else reject(new Error('Invalid format'));
          } else reject(new Error('Result not string'));
        };
        reader.onerror = () => reject(new Error('Failed'));
        reader.readAsDataURL(new Blob([buffer], { type: mimeType || 'audio/webm' }));
      } catch (e) { reject(e); }
    }).catch(() => null);

    if (!base64Audio) return;

    chrome.runtime.sendMessage({
      type: 'TRANSCRIBE_CHUNK',
      audioBase64: base64Audio,
      mimeType: mimeType || 'audio/webm',
      speakerHint: speaker.name,
      isLocal,
      timestamp
    }, (res) => {
      if (res?.success && res.text) {
        addEntry(res.text, speaker, timestamp, 'remote');
      }
    });
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
  function onSpeakerRenamed(d) {
    const { speakerId, newName } = d;
    const sp = speakers.get(speakerId);
    if (sp && sp.name !== newName) {
      sp.name = newName;
      // Update UI for this speaker card
      const card = document.getElementById(`speaker-${speakerId}`);
      if (card) {
        card.querySelector('.ms-speaker-card-name').textContent = newName;
        const avatar = card.querySelector('.ms-speaker-avatar span');
        if (avatar) avatar.textContent = newName[0].toUpperCase();
      }
      // Update all transcript entries for this speaker
      document.querySelectorAll(`.ms-entry[data-speaker-id="${speakerId}"]`).forEach(el => {
        const nameEl = el.querySelector('.ms-speaker-name');
        if (nameEl) nameEl.textContent = newName;
      });
    }
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

  // ── Web Speech API ────────────────────────────────────────────────────────
  function startWebSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = 'en-US';

    recognition.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          clearInterim();
          const text = r[0].transcript.trim();
          if (text.length < 2) continue;
          addEntry(text, currentSpeaker || getOrCreate('You'), Date.now(), 'ws', false);
        } else {
          interim += r[0].transcript;
        }
      }
      if (interim) {
        paintInterim(interim, currentSpeaker);
      } else {
        clearInterim();
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed') showToast('Microphone access required');
    };

    recognition.onend = () => {
      if (meetingActive && isRecognizing) {
        try { recognition.start(); } catch (_) {}
      }
    };

    try { recognition.start(); isRecognizing = true; } catch (_) {}
  }

  let interimNode = null;

  function paintInterim(text, speaker) {
    const list = document.getElementById('ms-transcript-list');
    if (!list) return;

    if (!interimNode) {
      interimNode = document.createElement('div');
      interimNode.className = 'ms-entry ms-entry-interim';
      interimNode.dataset.speakerId = speaker?.id || '';
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

    const textEl = interimNode.querySelector('.ms-entry-interim-text');
    if (textEl) textEl.textContent = text;

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
  function addEntry(text, speaker, ts, source, skipSync = false) {
    if (transcriptEntries.length) {
      const last = transcriptEntries[transcriptEntries.length - 1];
      const timeDiff = Math.abs(last.timestamp - (ts || Date.now()));
      if (last.speaker?.id === speaker?.id && timeDiff < 3000) {
        if (similarity(last.text, text) > 0.85) return;
      }
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
    updateSpeakerMeta(entry.speaker);
    updateInsights(entry);
    
    sendToPage({ type: 'PROCESS_TRANSCRIPT_ENTRY', entry });

    chrome.runtime.sendMessage({ type: 'ANALYZE_TONE', text, speaker: entry.speaker.name }, (r) => {
      if (!r || chrome.runtime.lastError) return;
      entry.tone = r;
      updateTonePill(entry.id, r);
      entry.speaker.tones.push(r);
      updateSpeakerTone(entry.speaker);
    });

    if (!skipSync) {
      chrome.runtime.sendMessage({
        type: 'APPEND_TRANSCRIPT_ENTRY',
        entry: { id: entry.id, text, speaker: entry.speaker.name, timestamp: entry.timestamp, source }
      });
    }
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

    const entryEl = document.createElement('div');
    entryEl.className = 'ms-entry';
    entryEl.id = `entry-${entry.id}`;
    entryEl.style.setProperty('--speaker-color', entry.speaker.color);
    entryEl.dataset.speakerId = entry.speaker.id;

    entryEl.innerHTML = `
      <div class="ms-entry-header">
        <div class="ms-speaker-dot" style="background:${entry.speaker.color}"></div>
        <span class="ms-speaker-name" style="color:${entry.speaker.color}">${esc(entry.speaker.name)}</span>
        <div class="ms-tone-pill" id="tone-${entry.id}"></div>
        <span class="ms-entry-time">${time}</span>
      </div>
      <div class="ms-entry-text">${esc(entry.text)}</div>`;

    if (interimNode?.parentNode === list) {
      list.insertBefore(entryEl, interimNode);
    } else {
      list.appendChild(entryEl);
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

    const speakerEl = document.createElement('div');
    speakerEl.className = 'ms-speaker-card';
    speakerEl.id = `speaker-${sp.id}`;
    speakerEl.innerHTML = `
      <div class="ms-speaker-avatar" style="background:${sp.color}14;border-color:${sp.color}35">
        <span style="color:${sp.color}">${sp.name[0].toUpperCase()}</span>
      </div>
      <div class="ms-speaker-info">
        <div class="ms-speaker-card-name">${esc(sp.name)}</div>
        <div class="ms-speaker-meta">
          <span id="tt-${sp.id}">0s</span>
          <span id="sc-${sp.id}">0 segments</span>
        </div>
        <div class="ms-tone-bar-wrap"><div class="ms-tone-bar" id="tb-${sp.id}" style="background:${sp.color};width:20%"></div></div>
      </div>
      <button class="ms-rename-btn" data-id="${sp.id}" title="Rename">Rename</button>`;

    speakerEl.querySelector('.ms-rename-btn').addEventListener('click', () => renameSpeaker(sp.id));
    list.appendChild(speakerEl);
    const toneSection = document.getElementById('ms-tone-section');
    if (toneSection) toneSection.style.display = 'block';
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

      const cardEl = document.createElement('div');
      cardEl.className = 'ms-tone-card';
      cardEl.innerHTML = `
        <div class="ms-tone-card-speaker" style="color:${sp.color}">${sp.name[0].toUpperCase()}</div>
        <div>
          <div style="font-size:11px;font-weight:600;color:${sc}">${last.tone || 'neutral'}</div>
          <div style="font-size:10px;color:#6B7280">${last.sentiment}</div>
        </div>
        <div class="ms-energy-ring" style="--e:${avgE}%;--c:${sp.color}"><span>${avgE}%</span></div>`;
      grid.appendChild(cardEl);
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
    document.querySelectorAll(`.ms-entry[data-speaker-id="${id}"]`).forEach(entryEl => {
      const nm = entryEl.querySelector('.ms-speaker-name');
      if (nm) nm.textContent = sp.name;
      const dot = entryEl.querySelector('.ms-speaker-dot');
      if (dot) dot.style.background = sp.color;
    });
    if (interimNode && interimNode.dataset.speakerId === id) {
      const nm = interimNode.querySelector('.ms-speaker-name');
      if (nm) nm.textContent = sp.name;
    }
  }

  function syncNames(names) {
    if (!names || names.length === 0) return;
    participantNames = names;
    speakers.forEach(sp => {
      if (sp.name.startsWith('Speaker ')) {
        const unused = names.find(n => !Array.from(speakers.values()).some(s => s.name === n));
        if (unused) {
          sp.name = unused;
          const card = document.getElementById(`speaker-${sp.id}`);
          if (card) {
            card.querySelector('.ms-speaker-card-name').textContent = sp.name;
            card.querySelector('.ms-speaker-avatar span').textContent = sp.name[0].toUpperCase();
          }
          document.querySelectorAll(`.ms-entry[data-speaker-id="${sp.id}"]`).forEach(entryEl => {
            const nm = entryEl.querySelector('.ms-speaker-name');
            if (nm) nm.textContent = sp.name;
            const dot = entryEl.querySelector('.ms-speaker-dot');
            if (dot) dot.style.background = sp.color;
          });
        }
      }
    });
  }

  // ── Insights ──────────────────────────────────────────────────────────────
  function updateInsights(entry) {
    updateSentimentBar(entry);
    detectActionItems(entry);
    entry.text.toLowerCase().split(/\W+/).forEach(w => {
      if (w.length > 4) keywordCount[w] = (keywordCount[w] || 0) + 1;
    });
    if (transcriptEntries.length % 2 === 0) renderKeywords();
    
    if (transcriptEntries.length > 0 && transcriptEntries.length % 10 === 0) {
      generateBackgroundSummary();
    }
  }

  function generateBackgroundSummary() {
    chrome.runtime.sendMessage({
      type: 'GENERATE_SUMMARY',
      transcript: transcriptEntries.slice(-15).map(e => `${e.speaker.name}: ${e.text}`).join('\n')
    }, (r) => {
      if (r?.summary) {
        const cards = document.getElementById('ms-insight-cards');
        if (cards) {
          cards.querySelector('.ms-live-summary-card')?.remove();
          const cardEl = document.createElement('div');
          cardEl.className = 'ms-insight-card ms-live-summary-card';
          cardEl.innerHTML = `
            <div class="ms-insight-label">Live Summary</div>
            <div class="ms-summary-text">${esc(r.summary)}</div>`;
          cards.prepend(cardEl);
        }
      }
    });
  }

  function updateSentimentBar(e) {
    const wrap = document.getElementById('ms-sentiment-timeline');
    const bars = document.getElementById('ms-sentiment-bars');
    if (!bars || !wrap) return;
    wrap.style.display = 'block';
    const barEl = document.createElement('div');
    barEl.className = 'ms-sent-bar';
    barEl.style.setProperty('--speaker-color', e.speaker?.color || '#4A9EFF');
    barEl.title = `${e.speaker?.name}: ${e.text.slice(0, 50)}`;
    bars.appendChild(barEl);
    while (bars.children.length > 30) bars.removeChild(bars.firstChild);
  }

  function detectActionItems(e) {
    if (!/\b(will|should|need to|must|follow.?up|deadline|by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week)|i'll|we'll|assign|action item)\b/i.test(e.text)) return;
    const list = document.getElementById('ms-action-items');
    if (!list) return;
    list.querySelector('.ms-empty-state')?.remove();
    const itemEl = document.createElement('div');
    itemEl.className = 'ms-action-item';
    itemEl.innerHTML = `
      <input type="checkbox" class="ms-checkbox">
      <div class="ms-action-content">
        <div class="ms-action-text">${esc(e.text.slice(0, 120))}${e.text.length > 120 ? '...' : ''}</div>
        <div class="ms-action-meta">
          <span style="color:${e.speaker?.color}">${esc(e.speaker?.name || 'Unknown')}</span>
          <span>${new Date(e.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>
        </div>
      </div>`;
    list.appendChild(itemEl);
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
    const cardEl = document.createElement('div');
    cardEl.className = 'ms-insight-card ms-keywords-card';
    cardEl.innerHTML = `
      <div class="ms-insight-label">Top Keywords</div>
      <div class="ms-keyword-chips">${top.map(w => `<span class="ms-keyword">${esc(w)}</span>`).join('')}</div>`;
    cards.prepend(cardEl);
  }

  // ── Summary & Export ──────────────────────────────────────────────────────
  async function generateSummary() {
    if (transcriptEntries.length < 3) { showToast('Need more transcript content first'); return; }
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
        summaryText = r.summary;
        const cards = document.getElementById('ms-insight-cards');
        if (cards) {
          cards.querySelector('.ms-summary-card')?.remove();
          cards.querySelector('.ms-empty-state')?.remove();
          const cardEl = document.createElement('div');
          cardEl.className = 'ms-insight-card ms-summary-card';
          cardEl.innerHTML = `
            <div class="ms-insight-label">Meeting Summary</div>
            <div class="ms-summary-text">${esc(r.summary)}</div>`;
          cards.prepend(cardEl);
        }
        showToast('Summary ready');
      }
    });
  }

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
    } else if (fmt === 'pdf') {
      const win = window.open('', '_blank');
      win.document.write(`<html><head><title>${title}</title><style>
        body { font-family: sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.6; }
        .h { border-bottom: 2px solid #eee; margin-bottom: 24px; padding-bottom: 12px; }
        .t { font-size: 28px; font-weight: 700; margin: 0; color: #2563eb; }
        .s { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 24px 0; border-radius: 4px; white-space: pre-wrap; }
        .row { margin-bottom: 12px; display: flex; gap: 12px; }
        .spk { font-weight: 600; min-width: 100px; color: #475569; }
      </style></head><body>
        <div class="h"><h1 class="t">${title}</h1><div>Date: ${date}</div></div>
        <h2>AI Summary</h2><div class="s">${summaryText || 'No summary generated.'}</div>
        <h2>Full Transcript</h2>
        ${transcriptEntries.map(e => `<div class="row"><span class="spk">${e.speaker.name}:</span><span>${e.text}</span></div>`).join('')}
        <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
      </body></html>`);
      win.document.close();
      document.getElementById('ms-export-menu').style.display = 'none';
      return;
    }
    const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/\s+/g, '_')}_${date}.${fmt}`;
    a.click();
    document.getElementById('ms-export-menu').style.display = 'none';
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  function resetMeetingState() {
    transcriptEntries = [];
    entryIdCounter = 0;
    speakers.clear();
    speakerCounter = 0;
    keywordCount = {};
    recordingStart = null;
    currentSpeaker = null;

    const transcriptList = document.getElementById('ms-transcript-list');
    if (transcriptList) transcriptList.innerHTML = '<div class="ms-empty-state"><p>Click Record to begin transcription</p></div>';
    
    const speakersList = document.getElementById('ms-speakers-list');
    if (speakersList) speakersList.innerHTML = '<div class="ms-empty-state"><p>Speakers appear as they talk</p></div>';
    
    const insightCards = document.getElementById('ms-insight-cards');
    if (insightCards) insightCards.innerHTML = '<div class="ms-empty-state"><p>Insights appear as the conversation builds</p></div>';
    
    const actionItems = document.getElementById('ms-action-items');
    if (actionItems) actionItems.innerHTML = '<div class="ms-empty-state"><p>Action items are detected automatically</p></div>';
    
    const sentimentBars = document.getElementById('ms-sentiment-bars');
    if (sentimentBars) sentimentBars.innerHTML = '';
    
    const toneGrid = document.getElementById('ms-tone-grid');
    if (toneGrid) toneGrid.innerHTML = '';
    
    const speakerCount = document.getElementById('ms-speaker-count');
    if (speakerCount) speakerCount.textContent = '0';
    
    const timer = document.getElementById('ms-timer');
    if (timer) timer.textContent = '00:00';
    
    createSpeaker('You');
  }

  async function startRecording() {
    if (!chrome.runtime?.id) {
      showToast('Extension updated. Please refresh this page.');
      return;
    }
    try {
      resetMeetingState();
      meetingActive = true;
      recordingStart = Date.now();
      meetingId = `m_${Date.now().toString(36)}`;
      showToast('Recording started');

      sendToPage({ type: 'START_CAPTURE', meetingId, settings: cachedSettings });

      const btn = document.getElementById('ms-start-btn');
      if (btn) { btn.textContent = 'Stop'; btn.classList.add('ms-recording'); }
      
      const liveInd = document.getElementById('ms-live-indicator');
      if (liveInd) liveInd.style.display = 'flex';
      
      document.getElementById('ms-live-dot')?.classList.add('ms-live');
      
      const badge = document.getElementById('ms-status-badge');
      if (badge) { badge.textContent = 'LIVE'; badge.classList.add('ms-badge-live'); }
      
      startWebSpeech();
      chrome.runtime.sendMessage({ 
        type: 'START_CAPTURE', 
        title: detectTitle(), 
        platform: PLATFORM, 
        meetingId
      });

      timerInterval = setInterval(() => {
        const el = document.getElementById('ms-timer');
        if (!el) return;
        const e = Date.now() - recordingStart;
        el.textContent =
          String(Math.floor(e / 60000)).padStart(2, '0') + ':' +
          String(Math.floor((e % 60000) / 1000)).padStart(2, '0');
      }, 1000);

    } catch (err) {
      showToast('Recording failed');
      meetingActive = false;
    }
  }

  function stopRecording() {
    meetingActive = false;
    clearInterval(timerInterval);
    stopWebSpeech();
    sendToPage({ type: 'STOP_CAPTURE' });
    chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });

    const btn = document.getElementById('ms-start-btn');
    if (btn) { btn.textContent = 'Record'; btn.classList.remove('ms-recording'); }
    
    const liveInd = document.getElementById('ms-live-indicator');
    if (liveInd) liveInd.style.display = 'none';
    
    document.getElementById('ms-live-dot')?.classList.remove('ms-live');
    
    const badge = document.getElementById('ms-status-badge');
    if (badge) {
      badge.textContent = 'READY';
      badge.classList.remove('ms-badge-live');
    }
    showToast('Meeting saved');
  }

  // ── Sidebar HTML ──────────────────────────────────────────────────────────
  function injectSidebar() {
    if (document.getElementById('meetscribe-sidebar')) return;

    const sidebar = document.createElement('div');
    sidebar.id = 'meetscribe-sidebar';
    sidebar.className = 'meetscribe-hidden';
    document.body.appendChild(sidebar);

    const toggle = document.createElement('div');
    toggle.id = 'meetscribe-toggle';
    toggle.innerHTML = `
      <div class="ms-toggle-icon">
        <div class="ms-live-dot" id="ms-live-dot"></div>
        <div class="ms-toggle-label">MEETSCRIBE</div>
      </div>
    `;
    toggle.addEventListener('click', toggleSidebar);
    document.body.appendChild(toggle);

    sidebar.innerHTML = `
      <div class="ms-sidebar-inner">
        <div class="ms-header">
          <div class="ms-header-left">
            <div class="ms-logo">S</div>
            <span class="ms-title">MeetScribe</span>
          </div>
          <div class="ms-header-right">
            <button class="ms-icon-btn" id="ms-dashboard-btn" title="Open Dashboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </button>
            <button class="ms-icon-btn" id="ms-settings-btn" title="Settings">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1V15a2 2 0 0 1-2-2 2 2 0 0 1 2-2v-.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2v.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <button class="ms-icon-btn" id="ms-close-btn" title="Minimize">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div class="ms-tabs">
          <button class="ms-tab active" data-tab="live">Live</button>
          <button class="ms-tab" data-tab="speakers">Speakers</button>
          <button class="ms-tab" data-tab="insights">Insights</button>
          <button class="ms-tab" data-tab="actions">Tasks</button>
          <button class="ms-tab" data-tab="agent">Agent</button>
          <button class="ms-tab" data-tab="alerts">Alerts <span id="ms-alert-badge" class="ms-alert-count" style="display:none">0</span></button>
        </div>

        <div class="ms-tab-content">
          <div class="ms-tab-panel active" id="tab-live">
            <div class="ms-controls">
              <button class="ms-btn ms-btn-primary" id="ms-start-btn">Start Session</button>
              <input type="text" class="ms-search" id="ms-search" placeholder="Search transcript...">
            </div>
            <div class="ms-live-indicator" id="ms-live-indicator" style="display:none">
              <div class="ms-pulse"></div>
              <span>Live Capture</span>
              <span class="ms-timer" id="ms-timer">00:00:00</span>
            </div>
            <div class="ms-transcript-list" id="ms-transcript-list">
              <div class="ms-empty-state"><p>Waiting for speech...</p></div>
            </div>
          </div>
          <div class="ms-tab-panel" id="tab-speakers">
            <div class="ms-speakers-header"><span class="ms-section-label">Detected Speakers</span><span class="ms-speaker-count" id="ms-speaker-count">0</span></div>
            <div class="ms-speakers-list" id="ms-speakers-list"><div class="ms-empty-state"><p>Speakers appear as they talk</p></div></div>
            <div class="ms-tone-section" id="ms-tone-section" style="display:none"><div class="ms-section-label">Tone Overview</div><div class="ms-tone-grid" id="ms-tone-grid"></div></div>
          </div>
          <div class="ms-tab-panel" id="tab-insights">
            <div class="ms-insight-cards" id="ms-insight-cards"><div class="ms-empty-state"><p>Insights appear as the conversation builds</p></div></div>
            <div id="ms-sentiment-timeline" style="display:none"><div class="ms-section-label">Sentiment Timeline</div><div id="ms-sentiment-bars"></div></div>
          </div>
          <div class="ms-tab-panel" id="tab-actions">
            <div class="ms-action-items" id="ms-action-items"><div class="ms-empty-state"><p>Action items are detected automatically</p></div></div>
            <div class="ms-actions-footer"><button class="ms-btn ms-btn-outline" id="ms-summarize-btn">AI Summary</button><button class="ms-btn ms-btn-outline" id="ms-export-btn">Export</button></div>
            <div class="ms-export-menu" id="ms-export-menu" style="display:none">
              <button class="ms-export-item" data-fmt="txt">Plain Text</button>
              <button class="ms-export-item" data-fmt="md">Markdown</button>
              <button class="ms-export-item" data-fmt="json">JSON</button>
              <button class="ms-export-item" data-fmt="srt">SRT Subtitles</button>
              <button class="ms-export-item" data-fmt="pdf">PDF Document</button>
            </div>
          </div>
          <div class="ms-tab-panel" id="tab-agent">
            <div class="ms-agent-chat">
              <div id="ms-agent-messages" class="ms-agent-messages">
                <div class="ms-agent-msg ms-agent-msg-bot">Hello! I am your MeetScribe Agent. I can help you with meeting details or even speak as your proxy if you are away.</div>
              </div>
              <div class="ms-agent-input-wrap">
                <input type="text" id="ms-agent-input" class="ms-agent-input" placeholder="Ask about the meeting...">
                <button id="ms-agent-send" class="ms-agent-send" title="Send message">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
                <button id="ms-agent-speak" class="ms-agent-send" style="background:#3DB89A" title="Speak as Me (Voice Proxy)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                </button>
              </div>
              <div class="ms-agent-quick-actions">
                <button class="ms-qa-btn" data-q="What were the key points so far?">Key Points</button>
                <button class="ms-qa-btn" data-q="Draft a follow-up email.">Draft Email</button>
                <button class="ms-qa-btn" data-q="Who is participating most?">Participation</button>
                <button class="ms-qa-btn" data-q="Any action items for me?">My Tasks</button>
              </div>
            </div>
          </div>
          <div class="ms-tab-panel" id="tab-alerts"><div id="ms-alert-list" class="ms-alert-list"><div class="ms-empty-state"><p>No alerts yet</p></div></div></div>
        </div>
        <div class="ms-toast" id="ms-toast"></div>
        <div class="ms-settings-panel" id="ms-settings-panel" style="display:none">
          <div class="ms-settings-header"><span>Settings</span><button class="ms-icon-btn" id="ms-settings-close"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
          <div class="ms-settings-body">
            <label class="ms-label">HuggingFace Token</label><input type="password" class="ms-input" id="ms-hf-token" placeholder="hf_...">
            <label class="ms-label">Gemini API Key</label><input type="password" class="ms-input" id="ms-gemini-key" placeholder="AIza...">
            <label class="ms-label">Transcription Mode</label><select class="ms-select" id="ms-tmode-select"><option value="hf">HuggingFace API</option><option value="webspeech">Web Speech</option></select>
            <button class="ms-btn ms-btn-primary" id="ms-save-settings" style="width:100%;margin-top:16px">Save</button>
          </div>
        </div>
      </div>`;
    bindEvents();
  }

  // ── Event binding ─────────────────────────────────────────────────────────
  function bindEvents() {
    const tabs = document.querySelectorAll('.ms-tab');
    tabs.forEach(function(t) {
      t.addEventListener('click', function() {
        const tabId = t.getAttribute('data-tab');
        document.querySelectorAll('.ms-tab').forEach(function(x) { x.classList.remove('active'); });
        document.querySelectorAll('.ms-tab-panel').forEach(function(x) { x.classList.remove('active'); });
        t.classList.add('active');
        const panel = document.getElementById('tab-' + tabId);
        if (panel) panel.classList.add('active');
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
    document.getElementById('ms-dashboard-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
    });
    document.getElementById('ms-settings-close').addEventListener('click', closeSettings);
    document.getElementById('ms-save-settings').addEventListener('click', saveSettings);

    document.getElementById('ms-search').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.ms-entry:not(.ms-entry-interim)').forEach(itemEl => {
        itemEl.style.display = (!q || itemEl.textContent.toLowerCase().includes(q)) ? '' : 'none';
      });
    });

    document.getElementById('ms-summarize-btn').addEventListener('click', generateSummary);
    document.getElementById('ms-export-btn').addEventListener('click', () => {
      const menu = document.getElementById('ms-export-menu');
      menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    });

    document.querySelectorAll('.ms-export-item').forEach(b => {
      b.addEventListener('click', () => exportTranscript(b.dataset.fmt));
    });

    // Agent Chat Events
    const agentInput = document.getElementById('ms-agent-input');
    const agentSend = document.getElementById('ms-agent-send');
    const agentSpeak = document.getElementById('ms-agent-speak');
    
    if (agentInput && agentSend) {
      agentSend.addEventListener('click', () => handleAgentQuery());
      agentInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAgentQuery(); });
    }
    
    if (agentSpeak) {
      agentSpeak.addEventListener('click', () => {
        const text = agentInput.value.trim();
        if (text) {
          handleVoiceProxy(text);
          agentInput.value = '';
        }
      });
    }

    document.querySelectorAll('.ms-qa-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.q;
        if (q) {
          agentInput.value = q;
          handleAgentQuery();
        }
      });
    });
  }

  function handleAgentQuery() {
    const input = document.getElementById('ms-agent-input');
    const query = input.value.trim();
    if (!query) return;

    appendAgentMessage('user', query);
    input.value = '';

    const context = transcriptEntries.slice(-20).map(e => `${e.speaker.name}: ${e.text}`).join('\n');
    
    chrome.runtime.sendMessage({
      type: 'AGENT_QUERY',
      query,
      context,
      history: agentChatHistory.slice(-5)
    }, (res) => {
      if (res?.answer) {
        appendAgentMessage('bot', res.answer);
        agentChatHistory.push({ role: 'user', content: query }, { role: 'bot', content: res.answer });
      } else {
        appendAgentMessage('bot', 'Sorry, I encountered an error processing your request.');
      }
    });
  }

  function appendAgentMessage(role, text) {
    const container = document.getElementById('ms-agent-messages');
    if (!container) return;

    const msg = document.createElement('div');
    msg.className = `ms-agent-msg ms-agent-msg-${role}`;
    msg.textContent = text;
    
    if (role === 'bot') {
      const speakBtn = document.createElement('button');
      speakBtn.className = 'ms-icon-btn';
      speakBtn.style.cssText = 'width:18px;height:18px;position:absolute;bottom:-18px;right:0;opacity:0.6;';
      speakBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>';
      speakBtn.onclick = () => handleVoiceProxy(text);
      msg.style.marginBottom = '20px';
      msg.appendChild(speakBtn);
    }

    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  async function handleVoiceProxy(text) {
    appendAgentMessage('user', `[Proxy]: ${text}`);
    
    try {
      // Use Google TTS (unofficial/public)
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
      console.error('[MeetScribe] Voice Proxy failed:', e);
      // Fallback: regular speech synthesis (user hears it)
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  }

  function toggleSidebar(force) {
    sidebarVisible = (typeof force === 'boolean') ? force : !sidebarVisible;
    const sb = document.getElementById('meetscribe-sidebar');
    const tog = document.getElementById('meetscribe-toggle');
    if (sb) sb.classList.toggle('meetscribe-hidden', !sidebarVisible);
    if (tog) tog.classList.toggle('ms-active', sidebarVisible);
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  function openSettings() {
    const panel = document.getElementById('ms-settings-panel');
    if (panel) panel.style.display = 'flex';
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, s => {
      if (!s) return;
      document.getElementById('ms-hf-token').value = s.hfToken || '';
      document.getElementById('ms-gemini-key').value = s.geminiKey || '';
      document.getElementById('ms-tmode-select').value = s.transcriptionMode || 'hf';
    });
  }

  function closeSettings() {
    const panel = document.getElementById('ms-settings-panel');
    if (panel) panel.style.display = 'none';
  }

  function saveSettings() {
    const settings = {
      hfToken: document.getElementById('ms-hf-token').value.trim(),
      geminiKey: document.getElementById('ms-gemini-key').value.trim(),
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
    return document.title.replace(' - Google Meet', '').trim() || 'Meeting';
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
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'TOGGLE_SIDEBAR') toggleSidebar();
    if (msg.type === 'OPEN_SETTINGS') openSettings();
    if (msg.type === 'JIRA_TICKET_CREATED') showToast(`Jira Ticket Created: ${msg.key}`);
    if (msg.type === 'TRANSCRIPT_UPDATE') {
      const { entry } = msg;
      if (transcriptEntries.some(e => e.id === entry.id)) return;
      const speaker = Array.from(speakers.values()).find(s => s.id === entry.speaker || s.name === entry.speaker) || getOrCreate(entry.speaker);
      addEntry(entry.text, speaker, entry.timestamp, entry.source || 'remote', true);
    }
    if (msg.type === 'NEW_SPEAKER_IDENTIFIED') onNewSpeaker(msg);
    if (msg.type === 'SPEAKER_IDENTIFIED') onSpeakerMatched(msg);
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    console.log('[MeetScribe] Initializing content script...');
    injectScript('content/audio-interceptor.js');
    injectScript('content/alert-engine.js');
    injectSidebar();
    createSpeaker('You');

    // Auto-open when meeting is detected (Meet, Teams, Zoom)
    const autoOpenCheck = setInterval(() => {
      const isInMeeting = !!(
        document.querySelector('[data-meeting-title]') || 
        document.querySelector('[data-call-id]') ||
        document.querySelector('[aria-label*="Leave call"]') ||
        document.querySelector('[aria-label*="Hang up"]') ||
        document.querySelector('.meeting-info-container') ||
        document.querySelector('.roster-list')
      );
      if (isInMeeting) {
        setTimeout(() => toggleSidebar(true), 1500); // Small delay for UI to settle
        clearInterval(autoOpenCheck);
      }
    }, 2000);
    // Safety timeout to clear interval after 5 minutes if no meeting detected
    setTimeout(() => clearInterval(autoOpenCheck), 300000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
