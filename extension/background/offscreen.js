// MeetScribe - Offscreen Document
// Handles tab audio capture + audio chunking for transcription

let mediaRecorder = null;
let audioContext = null;
let analyser = null;
let captureStream = null;
let chunkInterval = null;
let speakerTracker = null;
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === 'START_AUDIO_CAPTURE') {
    await startCapture(msg.tabId, msg.meetingId);
  } else if (msg.type === 'STOP_AUDIO_CAPTURE') {
    stopCapture();
  }
});

async function startCapture(tabId, mId) {
  meetingId = mId;
  try {
    // tabCapture for tab audio
    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture({ audio: true, video: false }, stream => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(stream);
      });
    }).catch(async () => {
      // Fallback: getUserMedia (mic only)
      return navigator.mediaDevices.getUserMedia({ audio: true });
    });

    captureStream = streamId;

    // Set up Web Audio for speaker detection
    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(captureStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    speakerTracker = new SpeakerTracker(analyser);

    // MediaRecorder for chunked audio
    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(captureStream, { mimeType, audioBitsPerSecond: 16000 });

    let chunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      chunks = [];
    };

    mediaRecorder.start();

    // Chunk every 3 seconds for low-latency transcription
    chunkInterval = setInterval(() => {
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        mediaRecorder.start();
      }
    }, 3000);

    // Speaker change detection
    speakerTracker.start();

    console.log('[MeetScribe Offscreen] Audio capture started');
  } catch (err) {
    console.error('[MeetScribe Offscreen] Capture error:', err);
    // Notify to use Web Speech API fallback
    chrome.runtime.sendMessage({ type: 'USE_WEBSPEECH_FALLBACK', meetingId });
  }
}

function stopCapture() {
  clearInterval(chunkInterval);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  if (captureStream) captureStream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
  if (speakerTracker) speakerTracker.stop();
  mediaRecorder = null;
  captureStream = null;
  audioContext = null;
}

// ─── Speaker Tracker ──────────────────────────────────────────────────────────
// Tracks speaker changes using audio energy + spectral centroid heuristics

class SpeakerTracker {
  constructor(analyser) {
    this.analyser = analyser;
    this.speakers = new Map(); // id -> { profile, lastSeen, color }
    this.currentSpeaker = null;
    this.interval = null;
    this.speakerCount = 0;
    this.COLORS = ['#00D4FF', '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94'];
    this.silenceThreshold = 0.01;
    this.lastFeatureVector = null;
    this.frameBuffer = [];
  }

  start() {
    this.interval = setInterval(() => this.analyzeFrame(), 100);
  }

  stop() {
    clearInterval(this.interval);
  }

  analyzeFrame() {
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(dataArray);

    const rms = Math.sqrt(dataArray.reduce((s, v) => s + v * v, 0) / bufferLength);
    
    if (rms < this.silenceThreshold) {
      // Silence
      return;
    }

    // Extract simple spectral features
    const freqData = new Float32Array(bufferLength);
    this.analyser.getFloatFrequencyData(freqData);
    const features = this.extractFeatures(freqData, rms);
    
    this.frameBuffer.push(features);
    if (this.frameBuffer.length > 10) this.frameBuffer.shift();

    const avgFeatures = this.averageFeatures(this.frameBuffer);
    const speakerId = this.matchSpeaker(avgFeatures);
    
    if (speakerId !== this.currentSpeaker?.id) {
      this.currentSpeaker = this.speakers.get(speakerId);
      chrome.runtime.sendMessage({
        type: 'SPEAKER_CHANGE',
        speaker: this.currentSpeaker,
        meetingId
      });
    }
  }

  extractFeatures(freqData, rms) {
    // Spectral centroid (simple pitch proxy)
    let weightedSum = 0, totalPower = 0;
    for (let i = 0; i < freqData.length; i++) {
      const power = Math.pow(10, freqData[i] / 10);
      weightedSum += i * power;
      totalPower += power;
    }
    const centroid = totalPower > 0 ? weightedSum / totalPower : 0;

    // Energy in speech bands
    const lowEnergy = freqData.slice(0, 50).reduce((s, v) => s + Math.abs(v), 0) / 50;
    const midEnergy = freqData.slice(50, 200).reduce((s, v) => s + Math.abs(v), 0) / 150;
    const highEnergy = freqData.slice(200, 500).reduce((s, v) => s + Math.abs(v), 0) / 300;

    return { centroid, lowEnergy, midEnergy, highEnergy, rms };
  }

  averageFeatures(frames) {
    const avg = { centroid: 0, lowEnergy: 0, midEnergy: 0, highEnergy: 0, rms: 0 };
    frames.forEach(f => {
      Object.keys(avg).forEach(k => avg[k] += f[k] / frames.length);
    });
    return avg;
  }

  matchSpeaker(features) {
    let bestMatch = null;
    let bestDist = Infinity;

    for (const [id, data] of this.speakers) {
      const dist = this.featureDistance(features, data.avgFeatures);
      if (dist < bestDist && dist < 0.3) {
        bestDist = dist;
        bestMatch = id;
      }
    }

    if (!bestMatch) {
      // New speaker
      const id = `speaker_${++this.speakerCount}`;
      const color = this.COLORS[(this.speakerCount - 1) % this.COLORS.length];
      this.speakers.set(id, {
        id,
        name: `Speaker ${this.speakerCount}`,
        color,
        avgFeatures: features,
        segments: 0
      });
      bestMatch = id;
      chrome.runtime.sendMessage({
        type: 'NEW_SPEAKER',
        speaker: this.speakers.get(id),
        meetingId
      });
    } else {
      // Update running average
      const sp = this.speakers.get(bestMatch);
      sp.segments++;
      const alpha = 0.1;
      Object.keys(features).forEach(k => {
        sp.avgFeatures[k] = sp.avgFeatures[k] * (1 - alpha) + features[k] * alpha;
      });
    }

    return bestMatch;
  }

  featureDistance(a, b) {
    return Math.sqrt(
      Math.pow((a.centroid - b.centroid) / 1000, 2) +
      Math.pow((a.midEnergy - b.midEnergy) / 50, 2) +
      Math.pow((a.highEnergy - b.highEnergy) / 50, 2)
    );
  }

  getCurrentSpeaker() {
    return this.currentSpeaker;
  }
}
