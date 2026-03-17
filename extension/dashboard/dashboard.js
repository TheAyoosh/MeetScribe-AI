// MeetScribe Dashboard JS

const KEYS = {
  MEETINGS: 'meetscribe_meetings',
  SETTINGS: 'meetscribe_settings'
};

let allMeetings = [];
let currentMeeting = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  bindNav();
  bindSettings();

  // Deep link: #meeting-<id>
  const hash = location.hash;
  if (hash.startsWith('#meeting-')) {
    const id = hash.replace('#meeting-', '');
    const m = allMeetings.find(x => x.id === id);
    if (m) openMeetingDetail(m);
  }
});

async function loadAll() {
  const { [KEYS.SETTINGS]: s = {} } = await chrome.storage.local.get(KEYS.SETTINGS);
  applyTheme(s.darkMode !== false);

  const { [KEYS.MEETINGS]: meetings = [] } = await chrome.storage.local.get(KEYS.MEETINGS);
  allMeetings = meetings;
  renderOverview();
  renderMeetingsList();
  renderAnalytics();
  loadSettingsForm(s);
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function bindNav() {
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(el.dataset.view);
    });
  });
  document.getElementById('btn-new-meeting')?.addEventListener('click', openMeetTab);
}

function switchView(viewId) {
  document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.dash-navlink').forEach(l => l.classList.remove('active'));
  
  const view = document.getElementById(`view-${viewId}`);
  if (view) view.classList.add('active');
  
  const navLink = document.querySelector(`.dash-navlink[data-view="${viewId}"]`);
  if (navLink) navLink.classList.add('active');
}

// ─── Overview ────────────────────────────────────────────────────────────────

function renderOverview() {
  // Stats
  const totalMeetings = allMeetings.length;
  const totalWords = allMeetings.reduce((s, m) => s + (m.transcript || []).reduce((sw, t) => sw + (t.text?.split(/\s+/).length || 0), 0), 0);
  const totalMs = allMeetings.reduce((s, m) => s + (m.duration || 0), 0);
  const totalHours = (totalMs / 3600000).toFixed(1);
  const totalActions = allMeetings.reduce((s, m) => s + (m.actionItems?.length || 0), 0);

  setText('stat-meetings', totalMeetings);
  setText('stat-words', totalWords > 1000 ? `${(totalWords/1000).toFixed(1)}k` : totalWords);
  setText('stat-hours', `${totalHours}h`);
  setText('stat-actions', totalActions);

  // Recent
  const recentList = document.getElementById('overview-recent-list');
  if (allMeetings.length === 0) {
    recentList.innerHTML = '<div class="dash-empty-msg">No meetings recorded yet.<br>Open Google Meet and start recording.</div>';
  } else {
    recentList.innerHTML = '';
    allMeetings.slice(0, 5).forEach(m => {
      recentList.appendChild(buildMeetingRow(m, true));
    });
  }

  // Tone distribution
  renderToneDistribution();

  // Platform breakdown
  renderPlatformBreakdown();
}

function renderToneDistribution() {
  const container = document.getElementById('dash-tone-dist');
  const tones = { positive: 0, negative: 0, neutral: 0, confident: 0, questioning: 0, excited: 0, calm: 0 };
  let total = 0;

  allMeetings.forEach(m => {
    (m.transcript || []).forEach(t => {
      if (t.tone) {
        tones[t.tone.sentiment] = (tones[t.tone.sentiment] || 0) + 1;
        tones[t.tone.tone] = (tones[t.tone.tone] || 0) + 1;
        total += 2;
      }
    });
  });

  if (total === 0) {
    container.innerHTML = '<div class="dash-empty-msg" style="padding:20px 0">No tone data yet</div>';
    return;
  }

  const topTones = Object.entries(tones).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const colors = { positive: '#4ECDC4', negative: '#FF6B6B', neutral: '#6B7280', confident: '#00D4FF', questioning: '#A78BFA', excited: '#FFE66D', calm: '#4ECDC4', frustrated: '#FF6B6B' };

  container.innerHTML = '';
  topTones.forEach(([tone, count]) => {
    const pct = Math.round((count / total) * 100);
    const color = colors[tone] || '#6B7280';
    const row = document.createElement('div');
    row.className = 'tone-dist-item';
    row.innerHTML = `
      <div class="tone-dist-label">${tone}</div>
      <div class="tone-dist-bar-wrap">
        <div class="tone-dist-bar" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="tone-dist-pct">${pct}%</div>
    `;
    container.appendChild(row);
  });
}

function renderPlatformBreakdown() {
  const container = document.getElementById('dash-platform-grid');
  const counts = {};
  allMeetings.forEach(m => { counts[m.platform || 'Unknown'] = (counts[m.platform || 'Unknown'] || 0) + 1; });

  if (Object.keys(counts).length === 0) {
    container.innerHTML = '<div class="dash-empty-msg">No data yet</div>';
    return;
  }

  const icons = { 'Google Meet': '', 'Zoom': '', 'Microsoft Teams': '', 'Unknown': '' };
  container.innerHTML = '';
  Object.entries(counts).forEach(([platform, count]) => {
    const badge = document.createElement('div');
    badge.className = 'platform-badge';
    badge.innerHTML = `
      <span class="platform-icon">${icons[platform] || ''}</span>
      <span>${platform}</span>
      <span class="platform-count">${count}</span>
    `;
    container.appendChild(badge);
  });
}

// ─── Meetings List ────────────────────────────────────────────────────────────

function renderMeetingsList(filter = '', platform = 'all') {
  const container = document.getElementById('meetings-list-container');
  const label = document.getElementById('meetings-count-label');

  let filtered = allMeetings.filter(m => {
    const matchText = !filter || m.title.toLowerCase().includes(filter.toLowerCase());
    const matchPlatform = platform === 'all' || m.platform === platform;
    return matchText && matchPlatform;
  });

  label.textContent = `${filtered.length} meeting${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="dash-empty-msg">No meetings found.</div>';
    return;
  }

  container.innerHTML = '';
  filtered.forEach(m => container.appendChild(buildMeetingRow(m)));
}

function buildMeetingRow(m, compact = false) {
  const icons = { 'Google Meet': '', 'Zoom': '', 'Microsoft Teams': '' };
  const date = new Date(m.startTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const dur = m.duration ? `${Math.round(m.duration / 60000)}min` : '—';
  const words = (m.transcript || []).reduce((s, t) => s + (t.text?.split(/\s+/).length || 0), 0);

  const row = document.createElement('div');
  row.className = 'dash-meeting-row';
  row.innerHTML = `
    <div class="dash-meeting-platform">${icons[m.platform] || ''}</div>
    <div class="dash-meeting-info">
      <div class="dash-meeting-name">${m.title || 'Untitled Meeting'}</div>
      <div class="dash-meeting-meta">${date} · ${m.platform || 'Unknown'}</div>
    </div>
    ${!compact ? `
    <div class="dash-meeting-stats">
      <div class="dash-meeting-stat">
        <div class="dash-meeting-stat-val">${m.transcript?.length || 0}</div>
        <div class="dash-meeting-stat-label">Segments</div>
      </div>
      <div class="dash-meeting-stat">
        <div class="dash-meeting-stat-val">${dur}</div>
        <div class="dash-meeting-stat-label">Duration</div>
      </div>
      <div class="dash-meeting-stat">
        <div class="dash-meeting-stat-val">${words > 1000 ? (words/1000).toFixed(1)+'k' : words}</div>
        <div class="dash-meeting-stat-label">Words</div>
      </div>
    </div>
    ` : ''}
  `;
  row.addEventListener('click', () => openMeetingDetail(m));
  return row;
}

// ─── Meeting Detail ───────────────────────────────────────────────────────────

function openMeetingDetail(meeting) {
  currentMeeting = meeting;
  switchView('meeting-detail');

  const content = document.getElementById('meeting-detail-content');
  const date = new Date(meeting.startTime).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const time = new Date(meeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dur = meeting.duration ? `${Math.round(meeting.duration / 60000)} minutes` : 'Unknown duration';
  const participants = [...new Set((meeting.transcript || []).map(t => t.speaker))];

  // Build speakers with colors
  const speakerColors = ['#00D4FF', '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF'];
  const speakerMap = {};
  participants.forEach((sp, i) => { speakerMap[sp] = speakerColors[i % speakerColors.length]; });

  content.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">${meeting.title || 'Untitled Meeting'}</div>
      <div class="detail-meta">
        <span> ${date}</span>
        <span> ${time}</span>
        <span> ${dur}</span>
        <span> ${meeting.platform || 'Unknown'}</span>
        <span> ${participants.length} speaker${participants.length !== 1 ? 's' : ''}</span>
        <span> ${(meeting.transcript || []).length} segments</span>
      </div>
    </div>

    <div class="detail-two-col">
      <!-- Speakers -->
      <div class="dash-card">
        <div class="dash-card-header"><h3>Speakers</h3></div>
        ${participants.length === 0 ? '<div class="dash-empty-msg">No speaker data</div>' :
          participants.map(sp => {
            const color = speakerMap[sp];
            const segs = (meeting.transcript || []).filter(t => t.speaker === sp).length;
            const tones = (meeting.transcript || []).filter(t => t.speaker === sp && t.tone).map(t => t.tone);
            const avgSentiment = tones.length > 0 ? 
              (tones.filter(t => t.sentiment === 'positive').length > tones.length / 2 ? 'Positive' : 
               tones.filter(t => t.sentiment === 'negative').length > tones.length / 2 ? 'Negative' : 'Neutral') : '—';
            return `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
                <div style="width:32px;height:32px;border-radius:50%;background:${color}20;border:2px solid ${color}40;display:flex;align-items:center;justify-content:center;font-weight:700;color:${color};font-size:13px">${sp[0]}</div>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:600">${sp}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${segs} segments · ${avgSentiment}</div>
                </div>
              </div>
            `;
          }).join('')
        }
      </div>

      <!-- Summary -->
      <div class="dash-card">
        <div class="dash-card-header"><h3>AI Summary</h3></div>
        ${meeting.summary ? 
          `<div style="font-size:13px;line-height:1.7;color:var(--text-dim)">${meeting.summary}</div>` :
          '<div class="dash-empty-msg">No summary available</div>'
        }
      </div>
    </div>

    <!-- Transcript -->
    <div class="detail-transcript">
      <div class="detail-transcript-header">
        <h3 style="font-size:14px;font-weight:600">Full Transcript</h3>
        <span style="font-size:11px;color:var(--text-muted)">${(meeting.transcript || []).length} segments</span>
      </div>
      <div class="detail-transcript-body">
        ${(meeting.transcript || []).length === 0 ? '<div class="dash-empty-msg">No transcript data</div>' :
          (meeting.transcript || []).map(entry => {
            const color = speakerMap[entry.speaker] || '#00D4FF';
            const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const toneColors = { positive: '#4ECDC4', negative: '#FF6B6B', neutral: '#888', confident: '#00D4FF', excited: '#FFE66D', calm: '#4ECDC4', frustrated: '#FF6B6B' };
            const toneColor = entry.tone ? (toneColors[entry.tone.tone] || toneColors[entry.tone.sentiment] || '#888') : null;
            return `
              <div class="detail-entry" style="border-left-color:${color}">
                <div class="detail-entry-header">
                  <div class="detail-speaker-dot" style="background:${color}"></div>
                  <span class="detail-speaker-name" style="color:${color}">${entry.speaker || 'Unknown'}</span>
                  ${entry.tone ? `<span class="detail-tone-badge" style="color:${toneColor};border-color:${toneColor}40;background:${toneColor}15">${entry.tone.tone || entry.tone.sentiment}</span>` : ''}
                  <span class="detail-time">${time}</span>
                </div>
                <div class="detail-entry-text">${escapeHtml(entry.text)}</div>
              </div>
            `;
          }).join('')
        }
      </div>
    </div>
  `;

  // Export button
  document.getElementById('detail-export-btn').onclick = () => showExportOptions(meeting);
  document.getElementById('detail-delete-btn').onclick = () => deleteMeetingConfirm(meeting.id);
}

function showExportOptions(meeting) {
  const formats = [
    ['txt', 'Plain Text'],
    ['md', 'Markdown'],
    ['json', 'JSON'],
    ['srt', 'SRT Subtitles']
  ];

  const menu = document.createElement('div');
  menu.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-2);border:1px solid var(--border-2);border-radius:12px;padding:16px;z-index:9999;min-width:200px;box-shadow:0 20px 60px rgba(0,0,0,0.5)`;
  menu.innerHTML = `
    <div style="font-size:14px;font-weight:700;margin-bottom:12px">Export Meeting</div>
    ${formats.map(([fmt, label]) => `
      <button class="export-format-btn" data-fmt="${fmt}" style="display:block;width:100%;padding:9px 12px;margin-bottom:5px;background:var(--bg-3);border:1px solid var(--border);border-radius:8px;color:var(--text-dim);font-size:13px;cursor:pointer;text-align:left;font-family:var(--font);transition:all 0.15s">${label}</button>
    `).join('')}
    <button class="export-cancel-btn" style="display:block;width:100%;padding:8px;background:transparent;border:none;color:var(--text-muted);font-size:12px;cursor:pointer;margin-top:4px;font-family:var(--font)">Cancel</button>
  `;

  menu.querySelectorAll('.export-format-btn').forEach(btn => {
    btn.addEventListener('click', () => exportMeeting(meeting.id, btn.dataset.fmt));
    btn.addEventListener('mouseover', () => btn.style.borderColor = 'var(--accent)');
    btn.addEventListener('mouseout', () => btn.style.borderColor = 'var(--border)');
  });
  menu.querySelector('.export-cancel-btn').addEventListener('click', () => menu.remove());

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998';
  overlay.onclick = () => { overlay.remove(); menu.remove(); };
  
  document.body.appendChild(overlay);
  document.body.appendChild(menu);
}

async function exportMeeting(id, format) {
  document.querySelectorAll('[style*="z-index:9999"]').forEach(el => el.remove());
  document.querySelectorAll('[style*="z-index:9998"]').forEach(el => el.remove());

  const meeting = allMeetings.find(m => m.id === id);
  if (!meeting) return;

  let content = '';
  const date = new Date(meeting.startTime).toLocaleDateString();

  if (format === 'txt') {
    content = `MEETING TRANSCRIPT\n${'='.repeat(60)}\nTitle: ${meeting.title}\nDate: ${date}\nPlatform: ${meeting.platform}\n\n`;
    (meeting.transcript || []).forEach(t => {
      const time = new Date(t.timestamp).toLocaleTimeString();
      content += `[${time}] ${t.speaker}: ${t.text}\n`;
      if (t.tone) content += `  ↳ Tone: ${t.tone.tone} | Sentiment: ${t.tone.sentiment} | Energy: ${t.tone.energy}%\n`;
      content += '\n';
    });
  } else if (format === 'md') {
    content = `# ${meeting.title}\n\n**Date:** ${date}  \n**Platform:** ${meeting.platform}\n\n---\n\n## Transcript\n\n`;
    (meeting.transcript || []).forEach(t => {
      const time = new Date(t.timestamp).toLocaleTimeString();
      content += `**${t.speaker}** *(${time})*\n\n${t.text}\n\n`;
      if (t.tone) content += `>  ${t.tone.tone} · ${t.tone.sentiment}\n\n`;
    });
  } else if (format === 'json') {
    content = JSON.stringify(meeting, null, 2);
  } else if (format === 'srt') {
    (meeting.transcript || []).forEach((t, i) => {
      const start = msToSRT(t.timestamp - meeting.startTime);
      const end = msToSRT(t.timestamp - meeting.startTime + 3000);
      content += `${i+1}\n${start} --> ${end}\n${t.speaker}: ${t.text}\n\n`;
    });
  }

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(meeting.title || 'meeting').replace(/\s+/g, '_')}_${date}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

async function deleteMeetingConfirm(id) {
  if (!confirm('Delete this meeting? This cannot be undone.')) return;
  allMeetings = allMeetings.filter(m => m.id !== id);
  await chrome.storage.local.set({ [KEYS.MEETINGS]: allMeetings });
  switchView('meetings');
  renderMeetingsList();
  renderOverview();
}

// ─── Analytics ────────────────────────────────────────────────────────────────

function renderAnalytics() {
  renderMeetingsPerWeekChart();
  renderSpeakerDistribution();
}

function renderMeetingsPerWeekChart() {
  const canvas = document.getElementById('meetings-chart');
  if (!canvas) return;

  const weeks = {};
  allMeetings.forEach(m => {
    const d = new Date(m.startTime);
    const weekKey = `${d.getFullYear()}-W${getWeekNumber(d)}`;
    weeks[weekKey] = (weeks[weekKey] || 0) + 1;
  });

  const labels = Object.keys(weeks).slice(-8);
  const data = labels.map(k => weeks[k]);

  if (window._meetingsChart) window._meetingsChart.destroy();
  window._meetingsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels.map(l => l.replace(/\d+-W/, 'W')),
      datasets: [{
        data,
        backgroundColor: 'rgba(0,212,255,0.3)',
        borderColor: '#00D4FF',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#6B7280', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#6B7280', font: { size: 11 }, stepSize: 1 } }
      }
    }
  });
}

function renderSpeakerDistribution() {
  const container = document.getElementById('speaker-dist-chart');
  if (!container) return;

  const speakerTime = {};
  allMeetings.forEach(m => {
    (m.transcript || []).forEach(t => {
      speakerTime[t.speaker] = (speakerTime[t.speaker] || 0) + (t.text?.split(/\s+/).length || 0);
    });
  });

  const sorted = Object.entries(speakerTime).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const colors = ['#00D4FF', '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94', '#C3A6FF', '#7C6FFF'];

  if (sorted.length === 0) {
    container.innerHTML = '<div class="dash-empty-msg">No speaker data yet</div>';
    return;
  }

  container.innerHTML = '';
  sorted.forEach(([name, words], i) => {
    const pct = total > 0 ? Math.round((words / total) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'speaker-dist-row';
    row.innerHTML = `
      <div class="speaker-dist-name">${name}</div>
      <div class="speaker-dist-bar-wrap">
        <div class="speaker-dist-bar" style="width:${pct}%;background:${colors[i % colors.length]}"></div>
      </div>
      <div class="speaker-dist-pct" style="color:${colors[i % colors.length]}">${pct}%</div>
    `;
    container.appendChild(row);
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function loadSettingsForm(s = null) {
  if (!s) {
    const data = await chrome.storage.local.get(KEYS.SETTINGS);
    s = data[KEYS.SETTINGS] || {};
  }
  
  setVal('s-hf-token', s.hfToken || '');
  setVal('s-gemini-key', s.geminiKey || '');
  setVal('s-model', s.model || 'whisper-base');
  setVal('s-lang', s.language || 'en');
  setCheck('s-darkmode', s.darkMode !== false);
  setCheck('s-tone', s.showToneAnalysis !== false);
  setCheck('s-autostart', s.autoStart !== false);

  if (s.hfToken) updateModelStatus(true, false);
  if (s.geminiKey) updateModelStatus(false, true);
}

function bindSettings() {
  document.getElementById('s-save')?.addEventListener('click', async () => {
    const settings = {
      hfToken: getVal('s-hf-token'),
      geminiKey: getVal('s-gemini-key'),
      model: getVal('s-model'),
      language: getVal('s-lang'),
      darkMode: getCheck('s-darkmode'),
      showToneAnalysis: getCheck('s-tone'),
      autoStart: getCheck('s-autostart'),
      sidebarPosition: document.getElementById('s-pos-r')?.checked ? 'right' : 'left'
    };

    applyTheme(settings.darkMode);

    await chrome.storage.local.set({ [KEYS.SETTINGS]: settings });
    
    const msg = document.getElementById('s-save-msg');
    msg.textContent = ' Settings saved';
    setTimeout(() => msg.textContent = '', 2500);

    updateModelStatus(!!settings.hfToken, !!settings.geminiKey);
  });

  document.getElementById('s-export-all')?.addEventListener('click', async () => {
    const data = {
      meetings: allMeetings,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meetscribe_backup_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('s-clear-all')?.addEventListener('click', async () => {
    if (!confirm('Delete ALL meetings? This cannot be undone.')) return;
    await chrome.storage.local.set({ [KEYS.MEETINGS]: [] });
    allMeetings = [];
    renderOverview();
    renderMeetingsList();
    renderAnalytics();
    alert('All meetings deleted.');
  });
}

function updateModelStatus(hasHf, hasGemini) {
  const aiDot = document.querySelector('.dash-ai-dot');
  const aiLabel = document.querySelector('.dash-ai-badge span');
  
  if (hasHf || hasGemini) {
    if (aiDot) aiDot.style.background = '#4ECDC4';
    if (aiLabel) aiLabel.textContent = 'AI Models Active';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function getVal(id) { return document.getElementById(id)?.value || ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function getCheck(id) { return document.getElementById(id)?.checked || false; }
function setCheck(id, v) { const el = document.getElementById(id); if (el) el.checked = v; }

function escapeHtml(text) {
  return (text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function msToSRT(ms) {
  const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
  const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
  const mm = (ms % 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${mm}`;
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function openMeetTab() {
  chrome.tabs.create({ url: 'https://meet.google.com' });
}

function applyTheme(isDark) {
  if (isDark) {
    document.documentElement.classList.remove('light-mode');
  } else {
    document.documentElement.classList.add('light-mode');
  }
}

// Make functions available globally for inline onclick
window.exportMeeting = exportMeeting;
window.openMeetTab = openMeetTab;
