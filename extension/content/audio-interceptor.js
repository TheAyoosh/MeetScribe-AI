// MeetScribe - Audio Interceptor v2
// Per-stream recording: each RTC peer gets its own MediaRecorder
// Voice fingerprinting via MFCC embeddings - maps voice → person, persistently
// Local mic (you) = always Speaker 1. Each remote track = one participant.
// Zero external dependencies — pure Web Audio API math.

(function () {
  'use strict';

  if (window.__meetscribe_audio_hooked) return;
  window.__meetscribe_audio_hooked = true;

  // ─── Constants ─────────────────────────────────────────────────────────────

  const CHUNK_MS        = 3000;   // transcription chunk size
  const SAMPLE_RATE     = 16000;  // 16kHz — what Whisper/Parakeet expect
  const FFT_SIZE        = 512;
  const MEL_BINS        = 26;     // MFCC mel filter banks
  const MFCC_COEFFS     = 13;     // number of cepstral coefficients kept
  const EMBED_DIM       = MFCC_COEFFS * 3; // mean + std + delta = 39-dim vector
  const MATCH_THRESHOLD = 0.82;   // cosine similarity threshold for ID match
  const MIN_VOICE_RMS   = 0.004;  // below this = silence, skip fingerprinting
  const FINGERPRINT_HZ  = 10;     // how often to sample voice (per second)

  // ─── State ─────────────────────────────────────────────────────────────────

  // Per-stream state: streamId → { recorder, audioCtx, analyser, source, speakerId, frameBuffer }
  const streams         = new Map();
  // Voice profiles: speakerId → { embedding: Float32Array, name: string, sampleCount: int }
  const voiceProfiles   = new Map();
  // Stream → speakerId (stable mapping once matched)
  const streamSpeakerMap = new Map();

  let isCapturing    = false;
  let meetingId      = null;
  let speakerSeq     = 0;        // auto-increment for new speaker IDs
  let localStreamId  = null;     // stream ID of local mic

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
        if (ev.track.kind !== 'audio') return;
        if (!isCapturing) return;

        const stream = ev.streams?.[0] || new MediaStream([ev.track]);
        const sid    = stream.id;

        if (streams.has(sid)) return; // already registered

        console.log('[MeetScribe] New remote audio stream:', sid);
        registerStream(sid, stream, false);

        dispatch({ type: 'NEW_REMOTE_TRACK', streamId: sid, trackId: ev.track.id });
      });
    }
  }

  Object.keys(OrigRTC).forEach(k => {
    try { HookedRTC[k] = OrigRTC[k]; } catch (_) {}
  });

  window.RTCPeerConnection        = HookedRTC;
  window.webkitRTCPeerConnection  = HookedRTC;

  // ─── Hook getUserMedia ────────────────────────────────────────────────────
  // Captures local mic as a separate stream → speaker is always "You"

  const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async function (constraints) {
    const stream = await origGUM(constraints);
    if (constraints.audio && isCapturing && !localStreamId) {
      localStreamId = stream.id;
      console.log('[MeetScribe] Local mic stream:', stream.id);
      registerStream(stream.id, stream, true);
    }
    return stream;
  };

  // ─── Stream Registration ───────────────────────────────────────────────────
  // Each stream gets its own AudioContext + Analyser + MediaRecorder
  // so audio chunks are cleanly separated per person

  function registerStream(sid, mediaStream, isLocal) {
    try {
      const ctx      = new AudioContext({ sampleRate: SAMPLE_RATE });
      const analyser = ctx.createAnalyser();
      analyser.fftSize     = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.2;

      const source = ctx.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      // Each stream also gets a destination for recording
      const dest = ctx.createMediaStreamDestination();
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

    } catch (e) {
      console.error('[MeetScribe] Stream registration error:', e);
    }
  }

  // ─── Per-Stream MediaRecorder ─────────────────────────────────────────────

  function startStreamRecorder(sid, state) {
    const mimeType = getSupportedMimeType();

    try {
      state.recorder = new MediaRecorder(state.dest.stream, {
        mimeType,
        audioBitsPerSecond: 16000
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

      // VAD: measure RMS of the chunk — skip if silent
      // This is fast (typed array loop), adds <1ms latency
      const rmsBuffer = new Float32Array(buffer.slice(0, Math.min(buffer.byteLength, 4096)));
      const rms = Math.sqrt(rmsBuffer.reduce((s,v) => s + v*v, 0) / rmsBuffer.length);
      const hasVoice = rms > 0.003;  // threshold: below = silence

      dispatch({
        type:      'AUDIO_CHUNK_READY',
        buffer,
        mimeType,
        streamId:  sid,
        speakerId: resolvedSpeakerId,
        speakerName: voiceProfiles.get(resolvedSpeakerId)?.name || 'Unknown',
        isLocal:   state.isLocal,
        hasVoice,
        meetingId,
        timestamp: Date.now()
      });
    };

    state.recorder.onerror = (e) => console.warn('[MeetScribe] Recorder error:', e);

    state.recorder.start();

    // Chunk every CHUNK_MS
    const tick = () => {
      if (!isCapturing || !state.active) return;
      if (state.recorder.state === 'recording') {
        state.recorder.stop();
        setTimeout(() => {
          if (isCapturing && state.active && state.recorder.state === 'inactive') {
            try { state.recorder.start(); } catch (_) {}
          }
          setTimeout(tick, CHUNK_MS);
        }, 80);
      } else {
        setTimeout(tick, CHUNK_MS);
      }
    };
    setTimeout(tick, CHUNK_MS);
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
      for (let i = 1; i < n; i++) { dsum += Math.abs(frames[i][j] - frames[i-1][j]); cnt++; }
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
    let bestId   = null;
    let bestSim  = -1;

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

      console.log(`[MeetScribe] Stream ${sid.slice(0,8)} → ${voiceProfiles.get(bestId).name} (sim=${bestSim.toFixed(3)})`);

    } else {
      // New voice — create new speaker profile
      const spId   = `sp_${++speakerSeq}`;
      const isLocal = state.isLocal;
      const name   = isLocal ? 'You' : `Speaker ${speakerSeq}`;

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

      console.log(`[MeetScribe] New speaker created: ${name} (stream ${sid.slice(0,8)})`);
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

  // ─── Allow content script to rename speaker (updates profile name) ────────

  window.addEventListener('__meetscribe_cmd', (ev) => {
    const cmd = ev.detail;
    switch (cmd.type) {
      case 'START_CAPTURE':
        isCapturing = true;
        meetingId = cmd.meetingId;
        // Capture any streams that connected before recording started
        // (getUserMedia may have fired before START_CAPTURE)
        break;

      case 'STOP_CAPTURE':
        stopAll();
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
    for (const [sid, state] of streams) {
      state.active = false;
      clearInterval(state.fingerprintTimer);
      try { if (state.recorder.state !== 'inactive') state.recorder.stop(); } catch (_) {}
      try { state.ctx.close(); } catch (_) {}
    }
    streams.clear();
    localStreamId = null;
  }

  // ─── DSP Math ─────────────────────────────────────────────────────────────

  // Build mel filterbank matrix [numFilters × fftBins/2]
  function buildMelFilterbank(sampleRate, fftSize, numFilters) {
    const fftBins = fftSize / 2;
    const minHz   = 80;
    const maxHz   = sampleRate / 2;

    const hzToMel  = hz => 2595 * Math.log10(1 + hz / 700);
    const melToHz  = mel => 700 * (Math.pow(10, mel / 2595) - 1);

    const minMel  = hzToMel(minHz);
    const maxMel  = hzToMel(maxHz);
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
      for (let k = bins[m-1]; k < bins[m]; k++) {
        filter[k] = (k - bins[m-1]) / (bins[m] - bins[m-1]);
      }
      for (let k = bins[m]; k < bins[m+1] && k < fftBins; k++) {
        filter[k] = (bins[m+1] - k) / (bins[m+1] - bins[m]);
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
    return ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  function dispatch(data) {
    window.dispatchEvent(new CustomEvent('__meetscribe_event', { detail: data }));
  }

  dispatch({ type: 'AUDIO_INTERCEPTOR_READY' });
  console.log('[MeetScribe] Audio interceptor v2 — per-stream MFCC fingerprinting active');

})();
