// MeetScribe - Audio Interceptor v3
// Per-stream recording: each RTC peer gets its own MediaRecorder
// Voice fingerprinting via MFCC embeddings - maps voice → person, persistently
// Local mic (you) = always Speaker 1. Each remote track = one participant.
// Zero external dependencies — pure Web Audio API math.
//
// v3 changes:
//   - Queues RTC streams that arrive BEFORE user clicks Record
//   - Registers queued streams when START_CAPTURE fires
//   - Scrapes participant names from Google Meet / Zoom / Teams DOM
//   - Track 'ended' cleanup to prevent memory leaks
//   - Improved MediaRecorder chunking with timeslice parameter

(function () {
  'use strict';

  if (window.__meetscribe_audio_hooked) return;
  window.__meetscribe_audio_hooked = true;

  // ─── Constants ─────────────────────────────────────────────────────────────

  const CHUNK_MS = 6000;   // transcription chunk size (increased to 6s to avoid Groq rate limits)
  const SAMPLE_RATE = 16000;  // 16kHz — what Whisper/Parakeet expect
  const FFT_SIZE = 512;
  const MEL_BINS = 26;     // MFCC mel filter banks
  const MFCC_COEFFS = 13;     // number of cepstral coefficients kept
  const EMBED_DIM = MFCC_COEFFS * 3; // mean + std + delta = 39-dim vector
  const MATCH_THRESHOLD = 0.78;   // lower slightly for better recall
  const MIN_VOICE_RMS = 0.0001; // significantly lower to catch remote speakers
  const FINGERPRINT_HZ = 10;
  const NAME_SCRAPE_MS = 5000;   // how often to scrape participant names from DOM

  // ─── State ─────────────────────────────────────────────────────────────────

  // Per-stream state: streamId → { recorder, audioCtx, analyser, source, speakerId, frameBuffer }
  const streams = new Map();
  // Voice profiles: speakerId → { embedding: Float32Array, name: string, sampleCount: int }
  const voiceProfiles = new Map();
  // Stream → speakerId (stable mapping once matched)
  const streamSpeakerMap = new Map();

  const pendingStreams = new Map(); // streamId → { stream, isLocal }
  const processedTracks = new Set(); // trackId → boolean (to avoid double-hooking)

  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

  // Master Resume: Chrome blocks AudioContext until a user gesture.
  window.addEventListener('click', () => {
    if (ctx.state === 'suspended') ctx.resume();
  }, { once: false });

  let isCapturing = false;
  let meetingId = null;
  let settings = {};

  // Audio Injection State
  let injectionDestination = null;
  let micStream = null;
  let injectionGain = null;
  let speakerSeq = 0;        // auto-increment for new speaker IDs
  let localStreamId = null;     // stream ID of local mic
  let nameScraperInterval = null;

  // Precompute mel filterbank (done once)
  const melFilterbank = buildMelFilterbank(SAMPLE_RATE, FFT_SIZE, MEL_BINS);

  // ─── Hook RTCPeerConnection ────────────────────────────────────────────────
  // Each remote participant arrives as a separate RTCPeerConnection track.
  // We record each track independently → clean per-person audio → exact mapping.

  const OrigRTC = window.RTCPeerConnection;

  class HookedRTC extends OrigRTC {
    constructor(cfg, cst) {
      super(cfg, cst);

      this.addEventListener('track', (ev) => {
        handleNewTrack(ev, this);
      });
      // Also hook the property setter
      let ontrack = null;
      Object.defineProperty(this, 'ontrack', {
        get: () => ontrack,
        set: (fn) => {
          ontrack = (ev) => {
            handleNewTrack(ev, this);
            if (typeof fn === 'function') fn.call(this, ev);
          };
        }
      });
    }
  }

  function handleNewTrack(ev, pc) {
    const track = ev.track || ev;
    let stream = ev.streams?.[0];

    // Fix: If no stream provided, create a new one from the track
    if (!stream || !(stream instanceof MediaStream)) {
      stream = new MediaStream([track]);
    }

    if (track.kind !== 'audio') return;
    if (!stream) return;

    const sid = stream.id;
    if (processedTracks.has(track.id)) return;
    processedTracks.add(track.id);

    if (streams.has(sid) || pendingStreams.has(sid)) return;

    console.log('[MeetScribe] [DEBUG] Captured remote audio track:', sid, '| Label:', ev.track.label, '| ID:', ev.track.id);

    if (isCapturing) {
      registerStream(sid, stream, false);
    } else {
      pendingStreams.set(sid, { stream, isLocal: false });
    }

    dispatch({ type: 'NEW_REMOTE_TRACK', streamId: sid, trackId: ev.track.id });
  }

  // ─── Extra Hooks for Super Capture ────────────────────────────────────────

  // Hook createMediaStreamSource to catch streams Meet might be creating manually
  const origCreateMSS = AudioContext.prototype.createMediaStreamSource;
  AudioContext.prototype.createMediaStreamSource = function (stream) {
    if (stream && stream.getAudioTracks().length > 0) {
      const sid = stream.id;
      if (!streams.has(sid) && !pendingStreams.has(sid)) {
        console.log('[MeetScribe] Caught stream via createMediaStreamSource:', sid);
        if (isCapturing) registerStream(sid, stream, false);
        else pendingStreams.set(sid, { stream, isLocal: false });
      }
    }
    return origCreateMSS.apply(this, arguments);
  };

  // Hook createMediaElementSource for <audio>/<video> elements
  const origCreateMES = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function (element) {
    if (element && element.srcObject) {
      const stream = element.srcObject;
      const sid = stream.id;
      if (!streams.has(sid) && !pendingStreams.has(sid)) {
        console.log('[MeetScribe] Caught stream via createMediaElementSource:', sid);
        if (isCapturing) registerStream(sid, stream, false);
        else pendingStreams.set(sid, { stream, isLocal: false });
      }
    }
    return origCreateMES.apply(this, arguments);
  };

  window.RTCPeerConnection = HookedRTC;
  window.webkitRTCPeerConnection = HookedRTC;

  // ─── HTMLMediaElement Hook (Nuclear Option) ───────────────────────────────
  // Google Meet and others attach remote streams to <video> or <audio> tags.
  // By hooking .play(), we can grab the stream regardless of how it was created.
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const stream = this.srcObject;
    if (stream instanceof MediaStream && stream.getAudioTracks().length > 0) {
      const sid = stream.id;
      if (!streams.has(sid) && !pendingStreams.has(sid)) {
        console.log('[MeetScribe] Caught remote stream via HTMLMediaElement.play():', sid);
        if (isCapturing) registerStream(sid, stream, false);
        else pendingStreams.set(sid, { stream, isLocal: false });
      }
    }
    return origPlay.apply(this, arguments);
  };

  Object.keys(OrigRTC).forEach(k => {
    try { HookedRTC[k] = OrigRTC[k]; } catch (_) { }
  });

  // ─── Hook getUserMedia ────────────────────────────────────────────────────
  // Captures local mic as a separate stream → speaker is always "You"

  const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async function (constraints) {
    const stream = await origGUM(constraints);
    if (constraints.audio) {
      if (isCapturing) {
        // Recording is active — register the local mic immediately
        if (!localStreamId || !streams.has(localStreamId)) {
          localStreamId = stream.id;
          console.log('[MeetScribe] Local mic stream (live):', stream.id);
          registerStream(stream.id, stream, true);
        }
      } else if (!localStreamId) {
        // Not recording yet — queue for later
        localStreamId = stream.id;
        pendingStreams.set(stream.id, { stream, isLocal: true });
        console.log('[MeetScribe] Queued local mic stream:', stream.id);
      }
    }
    return stream;
  };

  // ─── Stream Registration ───────────────────────────────────────────────────
  // Each stream gets its own AudioContext + Analyser + MediaRecorder
  // so audio chunks are cleanly separated per person

  function registerStream(sid, mediaStream, isLocal) {
    if (streams.has(sid)) return; // prevent double registration

    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.2;

      const source = ctx.createMediaStreamSource(mediaStream);
      const dest = ctx.createMediaStreamDestination();

      source.connect(analyser);
      analyser.connect(dest);

      const state = {
        ctx, analyser, source, dest, mediaStream,
        isLocal,
        speakerId: isLocal ? ensureLocalSpeaker() : null,
        frameBuffer: [],       // MFCC frames for fingerprinting
        recorder: null,
        chunks: [],
        fingerprintTimer: null,
        active: true
      };

      streams.set(sid, state);

      if (ctx.state === 'suspended') ctx.resume();

      // Start per-stream MediaRecorder
      startStreamRecorder(sid, state);

      // Start continuous fingerprinting (runs every 100ms)
      state.fingerprintTimer = setInterval(() => fingerprintFrame(sid, state), 1000 / FINGERPRINT_HZ);

      // Clean up when track ends (participant leaves or stream closes)
      mediaStream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.log('[MeetScribe] Track ended for stream:', sid);
          cleanupStream(sid);
        });
      });

    } catch (e) {
      console.error('[MeetScribe] Stream registration error:', e);
    }
  }

  // ─── Stream Cleanup ──────────────────────────────────────────────────────
  function cleanupStream(sid) {
    const state = streams.get(sid);
    if (!state) return;

    state.active = false;
    clearInterval(state.fingerprintTimer);
    try { if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop(); } catch (_) { }
    try { state.ctx.close(); } catch (_) { }
    streams.delete(sid);
  }

  // ─── Register Queued Streams ──────────────────────────────────────────────
  // Called when START_CAPTURE fires — registers all streams that arrived before recording

  function registerPendingStreams() {
    for (const [sid, { stream, isLocal }] of pendingStreams) {
      // Verify the stream tracks are still active
      const activeTracks = stream.getTracks().filter(t => t.readyState === 'live');
      if (activeTracks.length > 0) {
        console.log(`[MeetScribe] Registering queued stream: ${sid} (isLocal: ${isLocal})`);
        if (isLocal) localStreamId = sid;
        registerStream(sid, stream, isLocal);
      } else {
        console.log(`[MeetScribe] Skipping dead queued stream: ${sid}`);
      }
    }
    pendingStreams.clear();
  }

  // ─── Per-Stream MediaRecorder ─────────────────────────────────────────────

  function startStreamRecorder(sid, state) {
    const mimeType = getSupportedMimeType();

    try {
      state.recorder = new MediaRecorder(state.dest.stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });
    } catch (e) {
      // Fallback: record directly from media stream
      try {
        state.recorder = new MediaRecorder(state.mediaStream, { mimeType });
      } catch (e2) {
        console.warn('[MeetScribe] Could not create recorder for stream', sid, e2);
        return;
      }
    }

    state.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 50) state.chunks.push(ev.data);
    };

    state.recorder.onstop = async () => {
      if (state.chunks.length === 0) return;
      const blob = new Blob(state.chunks, { type: mimeType });
      state.chunks = [];

      const buffer = await blob.arrayBuffer();
      const resolvedSpeakerId = resolveOrCreateSpeaker(sid, state);

      // Trust the real-time VAD from fingerprintFrame
      const hasVoice = state.lastActivity && (Date.now() - state.lastActivity < CHUNK_MS + 500);

      dispatch({
        type: 'AUDIO_CHUNK_READY',
        buffer,
        mimeType,
        streamId: sid,
        speakerId: resolvedSpeakerId,
        speakerName: voiceProfiles.get(resolvedSpeakerId)?.name || 'Unknown',
        isLocal: state.isLocal,
        hasVoice,
        meetingId,
        timestamp: Date.now()
      });
    };

    state.recorder.onerror = (e) => console.warn('[MeetScribe] Recorder error:', e);

    // Use timeslice parameter for automatic chunking — avoids manual stop/start race conditions
    state.recorder.start(CHUNK_MS);
  }

  // ─── Voice Fingerprinting — MFCC ──────────────────────────────────────────
  // Runs continuously on each stream's analyser
  // Builds a running embedding per stream → matches to voice profile

  function fingerprintFrame(sid, state) {
    if (!state.active || !state.analyser) return;

    const timeDomain = new Float32Array(FFT_SIZE);
    state.analyser.getFloatTimeDomainData(timeDomain);

    // Compute RMS — skip silence
    const rms = Math.sqrt(timeDomain.reduce((s, v) => s + v * v, 0) / FFT_SIZE);
    if (rms < MIN_VOICE_RMS) return; // silence

    state.lastActivity = Date.now(); // Mark as active speech

    // FFT power spectrum
    const freqDomain = new Float32Array(FFT_SIZE / 2);
    state.analyser.getFloatFrequencyData(freqDomain);

    // Convert dB to linear power
    const power = new Float32Array(FFT_SIZE / 2);
    for (let i = 0; i < freqDomain.length; i++) {
      power[i] = Math.pow(10, freqDomain[i] / 10);
    }

    // Apply mel filterbank → mel energies
    const melEnergies = applyMelFilterbank(power, melFilterbank, MEL_BINS);

    // Log compress
    const logMel = melEnergies.map(e => Math.log(Math.max(e, 1e-10)));

    // DCT → MFCC coefficients (keep first MFCC_COEFFS)
    const mfcc = dct(logMel).slice(0, MFCC_COEFFS);

    state.frameBuffer.push(mfcc);

    // Keep last ~3 seconds worth of frames
    const maxFrames = FINGERPRINT_HZ * 3;
    if (state.frameBuffer.length > maxFrames) state.frameBuffer.shift();

    // After collecting enough frames, attempt speaker ID
    if (state.frameBuffer.length >= FINGERPRINT_HZ * 0.5) {
      const embedding = computeEmbedding(state.frameBuffer);
      attemptSpeakerMatch(sid, state, embedding);
    }
  }

  // ─── Embedding Computation ────────────────────────────────────────────────
  // Embedding = [mean of each MFCC coeff, std of each coeff, delta mean]
  // Result: MFCC_COEFFS * 3 = 39-dimensional vector

  function computeEmbedding(frames) {
    const n = frames.length;
    const d = frames[0].length;
    const embed = new Float32Array(d * 3);

    // Mean
    for (let j = 0; j < d; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += frames[i][j];
      embed[j] = sum / n;
    }

    // Std
    for (let j = 0; j < d; j++) {
      let sq = 0;
      for (let i = 0; i < n; i++) sq += (frames[i][j] - embed[j]) ** 2;
      embed[d + j] = Math.sqrt(sq / n);
    }

    // Delta (first-order difference mean)
    for (let j = 0; j < d; j++) {
      let dsum = 0, cnt = 0;
      for (let i = 1; i < n; i++) { dsum += Math.abs(frames[i][j] - frames[i - 1][j]); cnt++; }
      embed[2 * d + j] = cnt > 0 ? dsum / cnt : 0;
    }

    return normalize(embed);
  }

  // ─── Speaker Matching ─────────────────────────────────────────────────────

  function attemptSpeakerMatch(sid, state, embedding) {
    if (!embedding) return;

    // If stream is already confidently mapped, update profile (online learning)
    if (streamSpeakerMap.has(sid)) {
      const spId = streamSpeakerMap.get(sid);
      updateProfile(spId, embedding);
      state.speakerId = spId;
      return;
    }

    // Try to match against existing profiles
    let bestId = null;
    let bestSim = -1;

    for (const [spId, profile] of voiceProfiles) {
      const sim = cosineSimilarity(embedding, profile.embedding);
      if (sim > bestSim) { bestSim = sim; bestId = spId; }
    }

    if (bestSim >= MATCH_THRESHOLD) {
      // Matched existing speaker
      streamSpeakerMap.set(sid, bestId);
      state.speakerId = bestId;
      updateProfile(bestId, embedding);

      dispatch({
        type: 'SPEAKER_IDENTIFIED',
        streamId: sid,
        speakerId: bestId,
        speakerName: voiceProfiles.get(bestId).name,
        confidence: bestSim
      });

      console.log(`[MeetScribe] Stream ${sid.slice(0, 8)} → ${voiceProfiles.get(bestId).name} (sim=${bestSim.toFixed(3)})`);

    } else {
      // New voice — create new speaker profile
      const spId = `sp_${++speakerSeq}`;
      const isLocal = state.isLocal;
      const name = isLocal ? 'You' : `Speaker ${speakerSeq}`;

      voiceProfiles.set(spId, {
        embedding: embedding.slice(),
        name,
        isLocal,
        sampleCount: 1,
        createdAt: Date.now()
      });

      streamSpeakerMap.set(sid, spId);
      state.speakerId = spId;

      dispatch({
        type: 'NEW_SPEAKER_IDENTIFIED',
        streamId: sid,
        speakerId: spId,
        speakerName: name,
        isLocal,
        confidence: 1.0
      });

      console.log(`[MeetScribe] New speaker created: ${name} (stream ${sid.slice(0, 8)})`);
    }
  }

  function resolveOrCreateSpeaker(sid, state) {
    if (state.speakerId) return state.speakerId;
    if (streamSpeakerMap.has(sid)) return streamSpeakerMap.get(sid);

    // Fallback: create unidentified speaker
    const spId = `sp_${++speakerSeq}`;
    voiceProfiles.set(spId, {
      embedding: new Float32Array(EMBED_DIM),
      name: state.isLocal ? 'You' : `Speaker ${speakerSeq}`,
      isLocal: state.isLocal,
      sampleCount: 0,
      createdAt: Date.now()
    });
    streamSpeakerMap.set(sid, spId);
    state.speakerId = spId;
    return spId;
  }

  // Online learning: weighted average update so the profile adapts
  // to natural voice variations over the meeting
  function updateProfile(spId, newEmbed) {
    const profile = voiceProfiles.get(spId);
    if (!profile) return;

    const alpha = Math.max(0.05, 1 / (profile.sampleCount + 1));
    for (let i = 0; i < profile.embedding.length; i++) {
      profile.embedding[i] = profile.embedding[i] * (1 - alpha) + newEmbed[i] * alpha;
    }
    profile.embedding = normalize(profile.embedding);
    profile.sampleCount++;
  }

  // ─── Local Speaker Setup ─────────────────────────────────────────────────

  function ensureLocalSpeaker() {
    for (const [id, p] of voiceProfiles) {
      if (p.isLocal) return id;
    }
    const id = `sp_${++speakerSeq}`;
    voiceProfiles.set(id, {
      embedding: new Float32Array(EMBED_DIM),
      name: 'You',
      isLocal: true,
      sampleCount: 0,
      createdAt: Date.now()
    });
    dispatch({ type: 'NEW_SPEAKER_IDENTIFIED', speakerId: id, speakerName: 'You', isLocal: true, streamId: 'local' });
    return id;
  }

  // ─── Participant Name Scraping ────────────────────────────────────────────
  // Scrapes visible participant names from the meeting platform DOM
  // and dispatches them so the content script can map speakers to real names

  function scrapeParticipantNames() {
    const host = location.hostname;
    let names = [];

    if (host.includes('meet.google.com')) {
      // Google Meet: participant chips in the meeting roster
      // Method 1: Participant list panel (if open)
      document.querySelectorAll('[data-participant-id] [data-self-name]').forEach(el => {
        const name = el.textContent.trim();
        if (name) names.push(name);
      });
      // Method 2: Name labels shown beneath video tiles
      if (names.length === 0) {
        document.querySelectorAll('.ZjFb7c, .cS7aqe, .EY8ABd-OWXEXe-TAWMXe').forEach(el => {
          const name = el.textContent.trim();
          if (name && name !== 'You' && !names.includes(name)) names.push(name);
        });
      }
      // Method 3: Bottom bar participant names
      if (names.length === 0) {
        document.querySelectorAll('[data-self-name]').forEach(el => {
          const name = el.getAttribute('data-self-name');
          if (name) names.push(name);
        });
      }
    } else if (host.includes('zoom.us') || host.includes('app.zoom.us')) {
      // Zoom Web: participant list items
      document.querySelectorAll('.participants-item__name-label, .participant-item-name').forEach(el => {
        const name = el.textContent.trim();
        if (name && !names.includes(name)) names.push(name);
      });
    } else if (host.includes('teams.microsoft.com')) {
      // MS Teams: roster participant names
      document.querySelectorAll('[data-tid="roster-participant"] span, .ui-roster__participant-name').forEach(el => {
        const name = el.textContent.trim();
        if (name && !names.includes(name)) names.push(name);
      });
    }

    if (names.length > 0) {
      dispatch({ type: 'PARTICIPANTS_UPDATE', names });
    }

    // Advanced Correlation: Map active streams to names via DOM indicators
    mapActiveStreamsToDOMNames();
  }

  function mapActiveStreamsToDOMNames() {
    const host = location.hostname;
    if (!host.includes('meet.google.com')) return;

    // For each active stream with high volume, check who is "speaking" in the DOM
    for (const [sid, state] of streams) {
      if (state.isLocal) continue;

      const rms = calculateRMS(state.analyser);
      if (rms > 0.01) { // Current stream is talking
        // Find DOM element that says it's speaking
        // Google Meet: [data-is-speaking="true"]
        const speakingEl = document.querySelector('[data-is-speaking="true"]');
        if (speakingEl) {
          const nameEl = speakingEl.querySelector('[data-self-name], .ZjFb7c, .cS7aqe');
          const realName = nameEl?.textContent?.trim() || speakingEl.getAttribute('data-participant-id');

          if (realName && state.speakerId) {
            const profile = voiceProfiles.get(state.speakerId);
            if (profile && (profile.name.startsWith('Speaker') || profile.name === 'Unknown')) {
              console.log(`[MeetScribe] Mapping ${state.speakerId} to real name: ${realName} via DOM indicator`);
              profile.name = realName;
              dispatch({ type: 'SPEAKER_RENAMED', speakerId: state.speakerId, newName: realName });
            }
          }
        }
      }
    }
  }

  function calculateRMS(analyser) {
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }

  function startNameScraper() {
    if (nameScraperInterval) clearInterval(nameScraperInterval);
    // Scrape immediately, then every NAME_SCRAPE_MS
    scrapeParticipantNames();
    nameScraperInterval = setInterval(scrapeParticipantNames, NAME_SCRAPE_MS);
  }

  function stopNameScraper() {
    if (nameScraperInterval) {
      clearInterval(nameScraperInterval);
      nameScraperInterval = null;
    }
  }

  // ─── Allow content script to rename speaker (updates profile name) ────────

  // ─── Aggressive Media Discovery ──────────────────────────────────────────
  // Continuously scan for audio/video elements that might have remote streams
  setInterval(() => {
    if (!meetingId || !isCapturing) return;
    document.querySelectorAll('audio, video').forEach(el => {
      try {
        const stream = el.srcObject;
        if (stream instanceof MediaStream && stream.getAudioTracks().length > 0) {
          stream.getAudioTracks().forEach(track => {
            if (track.enabled && track.readyState === 'live' && !processedTracks.has(track.id)) {
              console.log('[MeetScribe] [Aggressive] Discovered remote track via DOM element:', track.id);
              handleNewTrack(track, stream);
            }
          });
        }
      } catch (e) { }
    });
  }, 3000);

  // ── Hook getUserMedia for Audio Injection ──────────────────────────────────
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = async function (constraints) {
    const stream = await originalGetUserMedia(constraints);

    if (constraints.audio && !stream.getAudioTracks()[0].__ms_hooked) {
      console.log('[MeetScribe] Hooking outgoing audio for injection');

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      injectionDestination = audioCtx.createMediaStreamDestination();
      injectionGain = audioCtx.createGain();

      source.connect(injectionDestination);

      const hookedStream = injectionDestination.stream;
      const hookedTrack = hookedStream.getAudioTracks()[0];

      // Tag it to avoid loops
      hookedTrack.__ms_hooked = true;

      // Return the hooked stream instead
      return hookedStream;
    }

    return stream;
  };

  function injectAgentAudio(audioBuffer) {
    if (!injectionDestination) return;
    const ctx = injectionDestination.context;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(injectionDestination);
    source.start();
  }

  window.addEventListener('__meetscribe_cmd', (ev) => {
    const cmd = ev.detail;
    switch (cmd.type) {
      case 'START_CAPTURE':
        isCapturing = true;
        meetingId = cmd.meetingId;
        // Register any streams that connected before recording started
        registerPendingStreams();
        // Start scraping participant names from the DOM
        startNameScraper();
        break;

      case 'STOP_CAPTURE':
        stopAll();
        break;

      case 'INJECT_AUDIO':
        if (cmd.audioBase64) {
          try {
            const binary = atob(cmd.audioBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const audioCtx = injectionDestination.context;
            audioCtx.decodeAudioData(bytes.buffer, (buffer) => {
              injectAgentAudio(buffer);
            });
          } catch (e) { console.error('[MeetScribe] Audio injection failed:', e); }
        }
        break;

      case 'RENAME_SPEAKER':
        if (voiceProfiles.has(cmd.speakerId)) {
          voiceProfiles.get(cmd.speakerId).name = cmd.name;
        }
        break;

      case 'GET_VOICE_PROFILES':
        dispatch({
          type: 'VOICE_PROFILES',
          profiles: [...voiceProfiles.entries()].map(([id, p]) => ({
            id, name: p.name, isLocal: p.isLocal, sampleCount: p.sampleCount
          }))
        });
        break;

      case 'PING':
        dispatch({ type: 'PONG', hooked: true });
        break;
    }
  });

  // ─── Stop everything ─────────────────────────────────────────────────────

  function stopAll() {
    isCapturing = false;
    stopNameScraper();
    for (const [sid, state] of streams) {
      state.active = false;
      clearInterval(state.fingerprintTimer);
      try { if (state.recorder.state !== 'inactive') state.recorder.stop(); } catch (_) { }
      try { state.ctx.close(); } catch (_) { }
    }
    streams.clear();
    pendingStreams.clear();
    localStreamId = null;
  }

  // ─── DSP Math ─────────────────────────────────────────────────────────────

  // Build mel filterbank matrix [numFilters × fftBins/2]
  function buildMelFilterbank(sampleRate, fftSize, numFilters) {
    const fftBins = fftSize / 2;
    const minHz = 80;
    const maxHz = sampleRate / 2;

    const hzToMel = hz => 2595 * Math.log10(1 + hz / 700);
    const melToHz = mel => 700 * (Math.pow(10, mel / 2595) - 1);

    const minMel = hzToMel(minHz);
    const maxMel = hzToMel(maxHz);
    const melStep = (maxMel - minMel) / (numFilters + 1);

    // Mel center points in Hz
    const centers = [];
    for (let i = 0; i <= numFilters + 1; i++) {
      centers.push(melToHz(minMel + i * melStep));
    }

    // Convert Hz to FFT bin indices
    const binFreq = sampleRate / fftSize;
    const bins = centers.map(hz => Math.floor(hz / binFreq));

    // Build filterbank
    const filters = [];
    for (let m = 1; m <= numFilters; m++) {
      const filter = new Float32Array(fftBins);
      for (let k = bins[m - 1]; k < bins[m]; k++) {
        filter[k] = (k - bins[m - 1]) / (bins[m] - bins[m - 1]);
      }
      for (let k = bins[m]; k < bins[m + 1] && k < fftBins; k++) {
        filter[k] = (bins[m + 1] - k) / (bins[m + 1] - bins[m]);
      }
      filters.push(filter);
    }
    return filters;
  }

  function applyMelFilterbank(power, filters, numFilters) {
    const energies = new Float32Array(numFilters);
    for (let m = 0; m < numFilters; m++) {
      let energy = 0;
      for (let k = 0; k < power.length && k < filters[m].length; k++) {
        energy += filters[m][k] * power[k];
      }
      energies[m] = Math.max(energy, 1e-10);
    }
    return energies;
  }

  // Type-II DCT
  function dct(input) {
    const N = input.length;
    const output = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      let sum = 0;
      for (let n = 0; n < N; n++) {
        sum += input[n] * Math.cos(Math.PI * k * (2 * n + 1) / (2 * N));
      }
      output[k] = sum;
    }
    return output;
  }

  function normalize(vec) {
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (norm < 1e-8) return vec;
    const out = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
    return out;
  }

  function cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    // Both are L2-normalized so magnitude product = 1
    return Math.max(-1, Math.min(1, dot));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function getSupportedMimeType() {
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  function dispatch(data) {
    window.dispatchEvent(new CustomEvent('__meetscribe_event', { detail: data }));
  }

  dispatch({ type: 'AUDIO_INTERCEPTOR_READY' });
  console.log('[MeetScribe] Audio interceptor v3 — per-stream MFCC fingerprinting + pre-record queueing active');

})();
