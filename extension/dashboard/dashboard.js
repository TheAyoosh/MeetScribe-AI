// MeetScribe Dashboard JS

const KEYS = {
  MEETINGS: 'meetscribe_meetings',
  SETTINGS: 'meetscribe_settings'
};

let allMeetings = [];
let currentMeeting = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  bindNav();
  bindSettings();
  try {
    await loadAll();
  } catch (err) {
    console.error('[MeetScribe] Init error:', err);
  }

  // Bind new meeting button
  document.getElementById('btn-new-meeting')?.addEventListener('click', openMeetTab);
  
  // Bind Jira test button
  document.getElementById('btn-test-jira')?.addEventListener('click', async (e) => {
    const btn = e.target;
    const domain = document.getElementById('s-jira-domain').value;
    const email = document.getElementById('s-jira-email').value;
    const token = document.getElementById('s-jira-token').value;
    const project = document.getElementById('s-jira-project').value || 'SCRB';

    if (!domain || !email || !token) {
      alert('Please fill in Domain, Email, and Token first.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Testing...';

    try {
      const auth = btoa(`${email}:${token}`);
      const cleanDomain = domain.replace('https://', '').split('/')[0];
      const url = `https://${cleanDomain}/rest/api/3/project/${project}`;
      
      const res = await fetch(url, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      });

      if (res.ok) {
        alert('✅ Connection Successful! Jira project "' + project + '" found.');
      } else {
        const err = await res.text();
        alert('❌ Connection Failed: ' + (err || res.statusText));
      }
    } catch (err) {
      alert('❌ Error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Test Connection';
    }
  });

  // Deep link: #meeting-<id>
  const handleHash = () => {
    const hash = location.hash;
    if (hash.startsWith('#meeting-')) {
      const id = hash.replace('#meeting-', '');
      const m = allMeetings.find(x => x.id === id);
      if (m) openMeetingDetail(m);
    }
  };

  handleHash();
  window.addEventListener('hashchange', handleHash);
});

async function loadAll() {
  const { [KEYS.MEETINGS]: localMeetings = [], [KEYS.SETTINGS]: settings = {} } = await chrome.storage.local.get([KEYS.MEETINGS, KEYS.SETTINGS]);
  
  allMeetings = localMeetings;

  // Try to sync from backend if available
  if (settings.backendUrl) {
    try {
      const res = await fetch(`${settings.backendUrl.replace(/\/$/, '')}/meetings`);
      if (res.ok) {
        const remoteMeetings = await res.json();
        if (remoteMeetings && remoteMeetings.length > 0) {
          // Map backend fields to frontend fields
          const mappedRemote = remoteMeetings.map(rm => ({
            ...rm,
            startTime: rm.start_time ? new Date(rm.start_time).getTime() : Date.now(),
            endTime: rm.end_time ? new Date(rm.end_time).getTime() : null,
            jiraKey: rm.jira_key || rm.jiraKey
          }));

          // Merge local and remote (remote takes priority for same ID)
          const mergedMap = new Map();
          localMeetings.forEach(m => mergedMap.set(m.id, m));
          mappedRemote.forEach(m => mergedMap.set(m.id, m));
          
          allMeetings = Array.from(mergedMap.values()).sort((a, b) => b.startTime - a.startTime);
        }
      }
    } catch (e) {
      console.warn('[MeetScribe] Could not fetch from backend, using local data.');
    }
  }

  renderOverview();
  renderMeetingsList();
  renderAnalytics();
  renderTasks();
  loadSettingsForm();
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function bindNav() {
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(el.dataset.view);
    });
  });
}

function switchView(viewId) {
  if (!viewId) return;
  console.log('[MeetScribe] Switching to view:', viewId);
  
  document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.dash-navlink').forEach(l => l.classList.remove('active'));
  
  const view = document.getElementById(`view-${viewId}`);
  if (view) {
    view.classList.add('active');
    // Scroll to top of view
    window.scrollTo(0, 0);
  }
  
  const navLinks = document.querySelectorAll(`.dash-navlink[data-view="${viewId}"]`);
  navLinks.forEach(l => l.classList.add('active'));

  // Refresh dynamic views
  if (viewId === 'meetings') renderMeetingsList();
  if (viewId === 'analytics') setTimeout(renderAnalytics, 50);
  if (viewId === 'tasks') renderTasks();
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

async function openMeetingDetail(meeting) {
  currentMeeting = meeting;
  switchView('meeting-detail');

  const { [KEYS.SETTINGS]: settings = {} } = await chrome.storage.local.get(KEYS.SETTINGS);
  const content = document.getElementById('meeting-detail-content');
  const date = new Date(meeting.startTime).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const time = new Date(meeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dur = meeting.duration ? `${Math.round(meeting.duration / 60000)} minutes` : 'Unknown duration';
  const participants = [...new Set((meeting.transcript || []).map(t => t.speaker))];

  // Build speakers with colors
  const speakerColors = ['#00D4FF', '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF'];
  const speakerMap = {};
  participants.forEach((sp, i) => { speakerMap[sp] = speakerColors[i % speakerColors.length]; });

  const jiraDomain = settings.jiraDomain || '';
  const jiraBadge = meeting.jiraKey ? `
    <a href="https://${jiraDomain}/browse/${meeting.jiraKey}" target="_blank" class="detail-jira-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.77v1.77c0 2.4 1.94 4.35 4.35 4.35V2h-10.47zM2.35 13.06c0 2.4 1.94 4.35 4.35 4.35H8.5v1.77c0 2.4 1.94 4.35 4.35 4.35V13.06H2.35zM11.53 13.06c0 2.4 1.97 4.35 4.35 4.35h1.77v1.77c0 2.4 1.94 4.35 4.35 4.35V13.06h-10.47z"/></svg>
      Jira: ${meeting.jiraKey}
    </a>
  ` : `
    <button class="detail-jira-create" id="manual-jira-btn">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Create Jira Task
    </button>
  `;

  content.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">${escapeHtml(meeting.title || 'Untitled Meeting')}</div>
      <div class="detail-subtitle">
        <span>${date} at ${time}</span> · 
        <span>${dur}</span> · 
        <span>${participants.length} speaker${participants.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="detail-actions" id="detail-jira-area">
        ${jiraBadge}
      </div>
    </div>

    <div class="detail-two-col">
      <div class="detail-main">
        <!-- AI Summary -->
        <div class="dash-card">
          <div class="dash-card-header"><h3>AI Summary & Insights</h3></div>
          ${meeting.summary ? 
            `<div style="font-size:13px;line-height:1.7;color:var(--text-dim)">${meeting.summary.split('\n').map(l => `<p style="margin-bottom:8px">${escapeHtml(l)}</p>`).join('')}</div>` :
            '<div class="dash-empty-msg">No summary available. Enable AI features in settings.</div>'
          }
        </div>

        <!-- Speakers -->
        <div class="dash-card" style="margin-top:16px">
          <div class="dash-card-header"><h3>Speakers</h3></div>
          <div class="detail-speakers-list">
            ${participants.length === 0 ? '<div class="dash-empty-msg">No speaker data</div>' :
              participants.map(sp => {
                const color = speakerMap[sp];
                const segs = (meeting.transcript || []).filter(t => t.speaker === sp).length;
                const tones = (meeting.transcript || []).filter(t => t.speaker === sp && t.tone).map(t => t.tone);
                const avgSentiment = tones.length > 0 ? 
                  (tones.filter(t => t.sentiment === 'positive').length > tones.length / 2 ? 'Positive' : 
                   tones.filter(t => t.sentiment === 'negative').length > tones.length / 2 ? 'Negative' : 'Neutral') : '—';
                return `
                  <div class="speaker-item" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
                    <div style="width:36px;height:36px;border-radius:50%;background:${color}15;border:1.5px solid ${color}40;display:flex;align-items:center;justify-content:center;font-weight:700;color:${color};font-size:14px">${sp[0]}</div>
                    <div style="flex:1">
                      <div style="font-size:13px;font-weight:600">${escapeHtml(sp)}</div>
                      <div style="font-size:11px;color:var(--text-muted)">${segs} segments · ${avgSentiment}</div>
                    </div>
                  </div>
                `;
              }).join('')
            }
          </div>
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
                    <span class="detail-speaker-name" style="color:${color}">${escapeHtml(entry.speaker || 'Unknown')}</span>
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
    </div>
  `;

  // Export button
  document.getElementById('detail-export-btn').onclick = () => showExportOptions(meeting);
  document.getElementById('detail-delete-btn').onclick = () => deleteMeetingConfirm(meeting.id);
  
  const jiraBtn = document.getElementById('manual-jira-btn');
  if (jiraBtn) {
    jiraBtn.onclick = async () => {
      jiraBtn.disabled = true;
      jiraBtn.innerHTML = 'Creating...';
      
      const transcriptText = (meeting.transcript || []).map(e => `${e.speaker}: ${e.text}`).join('\n');
      
      chrome.runtime.sendMessage({
        type: 'CREATE_JIRA_TICKET',
        summary: meeting.summary || transcriptText,
        title: meeting.title || 'Meeting'
      }, async (response) => {
        if (response && response.success) {
          meeting.jiraKey = response.key;
          const { [KEYS.MEETINGS]: meetings = [] } = await chrome.storage.local.get(KEYS.MEETINGS);
          const idx = meetings.findIndex(m => m.id === meeting.id);
          if (idx >= 0) {
            meetings[idx] = meeting;
            await chrome.storage.local.set({ [KEYS.MEETINGS]: meetings });
          }
          
          // Show success and refresh
          alert(`✅ Jira Ticket Created: ${response.key}`);
          openMeetingDetail(meeting);
        } else {
          const errorMsg = response?.error || 'Please check your Jira settings (Domain, Email, API Token) and ensure the Project Key exists.';
          alert('❌ Failed to create Jira ticket: ' + errorMsg);
          jiraBtn.disabled = false;
          jiraBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Create Jira Task';
        }
      });
    };
  }
}

function showExportOptions(meeting) {
  const formats = [
    ['txt', 'Plain Text'],
    ['md', 'Markdown'],
    ['json', 'JSON'],
    ['srt', 'SRT Subtitles']
  ];

  const menu = document.createElement('div');
  menu.className = 'ms-export-menu';
  menu.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-2);border:1px solid var(--border-2);border-radius:12px;padding:16px;z-index:9999;min-width:200px;box-shadow:0 20px 60px rgba(0,0,0,0.5)`;
  
  const title = document.createElement('div');
  title.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text)';
  title.textContent = 'Export Meeting';
  menu.appendChild(title);

  formats.forEach(([fmt, label]) => {
    const btn = document.createElement('button');
    btn.className = 'ms-export-btn';
    btn.style.cssText = 'display:block;width:100%;padding:9px 12px;margin-bottom:5px;background:var(--bg-3);border:1px solid var(--border);border-radius:8px;color:var(--text-dim);font-size:13px;cursor:pointer;text-align:left;font-family:var(--font);transition:all 0.15s';
    btn.textContent = label;
    
    btn.onclick = () => {
      exportMeeting(meeting.id, fmt);
      overlay.remove();
      menu.remove();
    };
    
    btn.onmouseover = () => btn.style.borderColor = 'var(--accent)';
    btn.onmouseout = () => btn.style.borderColor = 'var(--border)';
    
    menu.appendChild(btn);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.style.cssText = 'display:block;width:100%;padding:8px;background:transparent;border:none;color:var(--text-muted);font-size:12px;cursor:pointer;margin-top:4px;font-family:var(--font)';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => {
    overlay.remove();
    menu.remove();
  };
  menu.appendChild(cancelBtn);

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

// ─── Tasks ────────────────────────────────────────────────────────────────────

function renderTasks() {
  const container = document.getElementById('tasks-list-container');
  const label = document.getElementById('tasks-count-label');
  if (!container) return;

  const allTasks = [];
  allMeetings.forEach(m => {
    if (m.actionItems && m.actionItems.length > 0) {
      m.actionItems.forEach(task => {
        allTasks.push({ ...task, meetingId: m.id, meetingTitle: m.title, jiraKey: m.jiraKey });
      });
    }
  });

  label.textContent = `${allTasks.length} pending item${allTasks.length !== 1 ? 's' : ''}`;

  if (allTasks.length === 0) {
    container.innerHTML = '<div class="dash-empty-msg">No action items detected in your meetings yet.</div>';
    return;
  }

  container.innerHTML = allTasks.map(task => `
    <div class="dash-task-item">
      <div class="dash-task-check">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="dash-task-content">
        <div class="dash-task-text">${escapeHtml(task.text || task)}</div>
        <div class="dash-task-meta">
          From: <a href="#meeting-${task.meetingId}" class="dash-task-link">${escapeHtml(task.meetingTitle)}</a>
          ${task.jiraKey ? `<span class="dash-task-jira">· Jira: ${task.jiraKey}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
  
  // Re-bind hash links for deep linking
  container.querySelectorAll('.dash-task-link').forEach(link => {
    link.onclick = (e) => {
      const id = link.getAttribute('href').replace('#meeting-', '');
      const m = allMeetings.find(x => x.id === id);
      if (m) openMeetingDetail(m);
    };
  });
}

// ─── Analytics ────────────────────────────────────────────────────────────────

// ─── Analytics (Native Implementation) ────────────────────────────────────────
function renderAnalytics() {
  renderMeetingsPerWeekChart();
  renderSpeakerDistribution();
  renderToneChart();
}

function renderToneChart() {
  const container = document.getElementById('tone-chart')?.parentElement;
  if (!container) return;

  const dayData = {};
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  allMeetings.forEach(m => {
    const day = days[new Date(m.startTime).getDay()];
    if (!dayData[day]) dayData[day] = { pos: 0, neg: 0, total: 0 };
    (m.transcript || []).forEach(t => {
      if (t.tone) {
        if (t.tone.sentiment === 'positive') dayData[day].pos++;
        if (t.tone.sentiment === 'negative') dayData[day].neg++;
        dayData[day].total++;
      }
    });
  });

  const data = days.map(d => {
    const day = dayData[d];
    if (!day || day.total === 0) return 50;
    return Math.round(((day.pos - day.neg) / day.total) * 40 + 50);
  });

  // Render SVG Line Chart
  const h = 120, w = container.clientWidth - 40;
  const points = data.map((v, i) => `${(i * (w / 6)) + 20},${h - (v * (h / 100))}`);
  const path = `M ${points.join(' L ')}`;

  const canvas = document.getElementById('tone-chart');
  if (canvas) canvas.remove(); // Remove old canvas

  let svg = container.querySelector('.ms-custom-chart');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ms-custom-chart');
    svg.setAttribute('height', h);
    svg.setAttribute('width', '100%');
    container.appendChild(svg);
  }

  svg.innerHTML = `
    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4ECDC4" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#4ECDC4" stop-opacity="0"/>
    </linearGradient>
    <path d="${path} L ${points[points.length-1].split(',')[0]},${h} L 20,${h} Z" fill="url(#grad)" />
    <path d="${path}" fill="none" stroke="#4ECDC4" stroke-width="2.5" stroke-linecap="round" />
    ${points.map((p, i) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="4" fill="#4ECDC4" />`).join('')}
    <line x1="0" y1="${h}" x2="100%" y2="${h}" stroke="rgba(255,255,255,0.1)" />
  `;
}

function renderMeetingsPerWeekChart() {
  const container = document.getElementById('meetings-chart')?.parentElement;
  if (!container) return;

  const weeks = {};
  allMeetings.forEach(m => {
    const d = new Date(m.startTime);
    const weekKey = `W${getWeekNumber(d)}`;
    weeks[weekKey] = (weeks[weekKey] || 0) + 1;
  });

  const labels = Object.keys(weeks).slice(-6);
  if (labels.length === 0) labels.push('W' + getWeekNumber(new Date()));
  
  const data = labels.map(k => weeks[k] || 0);
  const max = Math.max(...data, 5);

  const canvas = document.getElementById('meetings-chart');
  if (canvas) canvas.remove();

  let chart = container.querySelector('.ms-bar-chart');
  if (!chart) {
    chart = document.createElement('div');
    chart.className = 'ms-bar-chart';
    chart.style.cssText = 'display:flex;align-items:flex-end;height:120px;gap:12px;padding:10px 0;';
    container.appendChild(chart);
  }

  chart.innerHTML = data.map((v, i) => `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px">
      <div style="width:100%;background:rgba(0,212,255,0.2);border:1px solid #00D4FF;height:${(v/max)*100}px;border-radius:4px;position:relative" title="${v} meetings">
        <div style="position:absolute;top:-18px;width:100%;text-align:center;font-size:10px;color:#00D4FF">${v}</div>
      </div>
      <div style="font-size:10px;color:#6B7280">${labels[i]}</div>
    </div>
  `).join('');
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

async function loadSettingsForm() {
  const { [KEYS.SETTINGS]: s = {} } = await chrome.storage.local.get(KEYS.SETTINGS);
  
  setVal('s-hf-token', s.hfToken || '');
  setVal('s-gemini-key', s.geminiKey || '');
  setVal('s-model', s.model || 'whisper-base');
  setVal('s-lang', s.language || 'en');
  setCheck('s-tone', s.showToneAnalysis !== false);
  setCheck('s-autostart', s.autoStart !== false);
  setCheck('s-sync', s.autoSyncToDb !== false);
  setVal('s-backend-url', s.backendUrl || 'http://localhost:8000');

  // Jira
  setVal('s-jira-domain', s.jiraDomain || '');
  setVal('s-jira-email', s.jiraEmail || '');
  setVal('s-jira-token', s.jiraToken || '');
  setVal('s-jira-project', s.jiraProjectKey || '');
  setCheck('s-jira-auto', s.autoCreateTicket === true);
  setCheck('s-actions', s.autoCreateActionItems !== false);
  
  if (s.sidebarPosition === 'left') {
    setCheck('s-pos-l', true);
  } else {
    setCheck('s-pos-r', true);
  }

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
      showToneAnalysis: getCheck('s-tone'),
      autoStart: getCheck('s-autostart'),
      autoSyncToDb: getCheck('s-sync'),
      backendUrl: getVal('s-backend-url'),
      jiraDomain: getVal('s-jira-domain'),
      jiraEmail: getVal('s-jira-email'),
      jiraToken: getVal('s-jira-token'),
      jiraProjectKey: getVal('s-jira-project'),
      autoCreateTicket: getCheck('s-jira-auto'),
      autoCreateActionItems: getCheck('s-actions'),
      sidebarPosition: document.getElementById('s-pos-r')?.checked ? 'right' : 'left'
    };

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

// Make functions available globally for inline onclick
window.exportMeeting = exportMeeting;
window.openMeetTab = openMeetTab;
