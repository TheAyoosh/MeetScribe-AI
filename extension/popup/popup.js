// MeetScribe - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const { meetscribe_settings: s = {} } = await chrome.storage.local.get('meetscribe_settings');
  if (s.darkMode === false) document.documentElement.classList.add('light-mode');

  await loadStatus();
  await loadRecentMeetings();
  await loadModelStatus();
  bindEvents();
});

async function loadStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  const card = document.getElementById('status-card');
  const icon = document.getElementById('status-icon');
  const title = document.getElementById('status-title');
  const sub = document.getElementById('status-sub');
  const dot = document.getElementById('status-dot');

  if (url.includes('meet.google.com') || url.includes('zoom.us') || url.includes('teams.microsoft.com')) {
    const platform = url.includes('meet.google') ? 'Google Meet' : url.includes('zoom') ? 'Zoom' : 'Teams';
    
    // Check if active recording
    const { meetscribe_active: active } = await chrome.storage.local.get('meetscribe_active');
    
    if (active) {
      card.classList.add('active');
      dot.classList.add('live');
      title.textContent = 'Recording';
      sub.textContent = `Live on ${platform}`;
      icon.style.color = '#FF4444';
    } else {
      title.textContent = `${platform} detected`;
      sub.textContent = 'Click sidebar to start transcription';
      icon.style.color = '#00D4FF';
    }
  } else {
    title.textContent = 'Not in a meeting';
    sub.textContent = 'Open Google Meet or Zoom to begin';
  }
}

async function loadRecentMeetings() {
  const container = document.getElementById('recent-meetings');
  const { meetscribe_meetings: meetings = [] } = await chrome.storage.local.get('meetscribe_meetings');
  
  if (meetings.length === 0) {
    container.innerHTML = '<div class="pop-empty">No meetings recorded yet</div>';
    return;
  }

  container.innerHTML = '';
  meetings.slice(0, 3).forEach(meeting => {
    const date = new Date(meeting.startTime);
    const dur = meeting.duration ? Math.round(meeting.duration / 60000) : null;
    
    const item = document.createElement('div');
    item.className = 'pop-meeting-item';
    item.innerHTML = `
      <div class="pop-meeting-dot"></div>
      <div class="pop-meeting-info">
        <div class="pop-meeting-title">${meeting.title}</div>
        <div class="pop-meeting-meta">
          ${date.toLocaleDateString()} · 
          ${meeting.transcript?.length || 0} segments
          ${dur ? `· ${dur}min` : ''}
        </div>
      </div>
    `;
    item.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard/dashboard.html#meeting-${meeting.id}`) });
      window.close();
    });
    container.appendChild(item);
  });
}

async function loadModelStatus() {
  const { meetscribe_settings: settings = {} } = await chrome.storage.local.get('meetscribe_settings');
  
  const hfEl = document.getElementById('hf-status');
  const gemEl = document.getElementById('gemini-status');

  if (settings.hfToken) {
    hfEl.classList.add('configured');
    hfEl.querySelector('.pop-model-dot').className = 'pop-model-dot configured';
    const modelName = settings.model === 'parakeet' ? 'Parakeet TDT' : settings.model === 'whisper-small' ? 'Whisper Small' : 'Whisper Base';
    hfEl.querySelector('.pop-model-state').textContent = modelName;
  }

  if (settings.geminiKey) {
    gemEl.classList.add('configured');
    gemEl.querySelector('.pop-model-dot').className = 'pop-model-dot configured';
    gemEl.querySelector('.pop-model-state').textContent = 'Gemini 1.5 Flash';
  }
}

function bindEvents() {
  document.getElementById('open-sidebar-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }).catch(() => {
        // Not on a meeting page
        alert('Please navigate to Google Meet, Zoom, or Teams first.');
      });
    }
    window.close();
  });

  document.getElementById('open-dashboard-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    window.close();
  });

  document.getElementById('settings-link').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SETTINGS' }).catch(() => {});
    }
    window.close();
  });

  document.getElementById('help-link').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/meetscribe-ai/extension#readme' });
    window.close();
  });
}
