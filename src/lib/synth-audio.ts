let soundEnabled = false;
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

let lastTickMs = -100;
let lastBurstMs = -100;
let lastLockMs = -100;
let lastXrayMs = -100;

type AudioContextCtor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function nowPerformanceMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function getReadyAudio(): { ctx: AudioContext; out: GainNode } | null {
  if (!soundEnabled || !audioCtx || !masterGain) return null;
  try {
    if (audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }
    if (audioCtx.state === "closed") return null;
    return { ctx: audioCtx, out: masterGain };
  } catch {
    return null;
  }
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

/**
 * Enables or disables synthesized UI feedback.
 * Lazily constructs AudioContext strictly when enabled inside a user gesture.
 */
export function setSoundEnabled(enabled: boolean): boolean {
  if (!enabled) {
    soundEnabled = false;
    try {
      if (audioCtx && masterGain && audioCtx.state !== "closed") {
        masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.015);
      }
      if (audioCtx && audioCtx.state === "running") {
        void audioCtx.suspend().catch(() => {});
      }
    } catch {
      // Ignore Web Audio teardown restrictions.
    }
    return false;
  }

  const AudioCtor = getAudioContextConstructor();
  if (!AudioCtor) {
    soundEnabled = false;
    return false;
  }

  try {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioCtor();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }
    if (masterGain) {
      masterGain.gain.setTargetAtTime(0.85, audioCtx.currentTime, 0.015);
    }
    soundEnabled = true;
    return true;
  } catch {
    soundEnabled = false;
    return false;
  }
}

/** Filtered micro-click tick for UI switches and scrubbing. */
export function playTick(): void {
  const audio = getReadyAudio();
  if (!audio) return;
  const ms = nowPerformanceMs();
  if (ms - lastTickMs < 24) return;
  lastTickMs = ms;

  try {
    const { ctx, out } = audio;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(1750, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.022);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400, t);
    filter.Q.setValueAtTime(1.6, t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.045, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);

    osc.start(t);
    osc.stop(t + 0.032);
  } catch {
    // Ignore transient synthesis errors.
  }
}

/** Soft sub-bass burst thump for fluid shockwaves and radar triggers. */
export function playBurst(): void {
  const audio = getReadyAudio();
  if (!audio) return;
  const ms = nowPerformanceMs();
  if (ms - lastBurstMs < 60) return;
  lastBurstMs = ms;

  try {
    const { ctx, out } = audio;
    const t = ctx.currentTime;

    const sub = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const subGain = ctx.createGain();

    sub.type = "sine";
    sub.frequency.setValueAtTime(135, t);
    sub.frequency.exponentialRampToValueAtTime(38, t + 0.19);

    lp.type = "lowpass";
    lp.frequency.setValueAtTime(260, t);

    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.linearRampToValueAtTime(0.14, t + 0.004);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);

    sub.connect(lp);
    lp.connect(subGain);
    subGain.connect(out);

    sub.start(t);
    sub.stop(t + 0.22);

    const transient = ctx.createOscillator();
    const bp = ctx.createBiquadFilter();
    const tGain = ctx.createGain();

    transient.type = "triangle";
    transient.frequency.setValueAtTime(480, t);
    transient.frequency.exponentialRampToValueAtTime(120, t + 0.035);

    bp.type = "bandpass";
    bp.frequency.setValueAtTime(360, t);
    bp.Q.setValueAtTime(1.2, t);

    tGain.gain.setValueAtTime(0.0001, t);
    tGain.gain.linearRampToValueAtTime(0.035, t + 0.002);
    tGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.042);

    transient.connect(bp);
    bp.connect(tGain);
    tGain.connect(out);

    transient.start(t);
    transient.stop(t + 0.048);
  } catch {
    // Ignore transient synthesis errors.
  }
}

/** Crisp 2-tone lock chirp for orbital beacon locks and detector acquisitions. */
export function playLock(): void {
  const audio = getReadyAudio();
  if (!audio) return;
  const ms = nowPerformanceMs();
  if (ms - lastLockMs < 50) return;
  lastLockMs = ms;

  try {
    const { ctx, out } = audio;
    const t = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, t);
    osc1.frequency.exponentialRampToValueAtTime(940, t + 0.036);
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.linearRampToValueAtTime(0.048, t + 0.003);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.042);
    osc1.connect(g1);
    g1.connect(out);
    osc1.start(t);
    osc1.stop(t + 0.046);

    const t2 = t + 0.042;
    const osc2 = ctx.createOscillator();
    const lp2 = ctx.createBiquadFilter();
    const g2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1320, t2);
    osc2.frequency.exponentialRampToValueAtTime(1480, t2 + 0.055);
    lp2.type = "lowpass";
    lp2.frequency.setValueAtTime(2600, t2);
    g2.gain.setValueAtTime(0.0001, t2);
    g2.gain.linearRampToValueAtTime(0.052, t2 + 0.003);
    g2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.068);
    osc2.connect(lp2);
    lp2.connect(g2);
    g2.connect(out);
    osc2.start(t2);
    osc2.stop(t2 + 0.074);
  } catch {
    // Ignore transient synthesis errors.
  }
}

/** Crisp X-Ray optical sweep for diagnostic overlay transitions. */
export function playXray(on: boolean): void {
  const audio = getReadyAudio();
  if (!audio) return;
  const ms = nowPerformanceMs();
  if (ms - lastXrayMs < 60) return;
  lastXrayMs = ms;

  try {
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const dur = on ? 0.145 : 0.115;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(on ? 440 : 1040, t);
    osc.frequency.exponentialRampToValueAtTime(on ? 1320 : 360, t + dur);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(on ? 600 : 1800, t);
    filter.frequency.exponentialRampToValueAtTime(on ? 2200 : 500, t + dur);
    filter.Q.setValueAtTime(2.4, t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(on ? 0.055 : 0.045, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);

    osc.start(t);
    osc.stop(t + dur + 0.01);
  } catch {
    // Ignore transient synthesis errors.
  }
}
