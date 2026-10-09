/**
 * Procedural jungle / drum & bass, synthesised live with the Web Audio API.
 * 170 BPM, chopped amen-style break, rolling hats, Reese + sub bass, minor pads.
 * Nothing here is sampled, so there is nothing to license.
 */
const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

// 16 sixteenth-note steps per bar, alternating two break variations.
const KICK = ['x.x.......xx....', 'x.x...x...x.....'];
const SNARE = ['....x..x.x..x..x', '....x..x.x..x.xx'];
const GHOST = new Set([7, 9, 15, 13, 14]);
const HAT_VEL = [0.5, 0.15, 0.35, 0.15];

// [step, midi note, length in steps]; roots follow Fm - Db - Fm - Eb.
const BASS: [number, number, number][][] = [
  [[0, 29, 6], [6, 29, 2], [8, 32, 3], [11, 29, 3], [14, 36, 2]],
  [[0, 25, 6], [6, 25, 2], [8, 27, 4], [12, 29, 4]],
  [[0, 29, 6], [6, 29, 2], [8, 36, 3], [11, 32, 3], [14, 29, 2]],
  [[0, 27, 6], [6, 27, 2], [8, 25, 4], [12, 29, 2], [14, 32, 2]],
];
const PADS: number[][] = [
  [53, 56, 60, 63, 67],
  [49, 53, 56, 60, 63],
];

export const MOODS = [
  { name: 'Aura 01 (F minor, 170 BPM)', bpm: 170, shift: 0 },
  { name: 'Aura 02 (G minor, 172 BPM)', bpm: 172, shift: 2 },
  { name: 'Aura 03 (E minor, 168 BPM)', bpm: 168, shift: -1 },
];

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

export class JungleSynth {
  mood = 0;
  private timer = 0;
  private next = 0;
  private step = 0;
  private bar = 0;
  private bus: GainNode;
  private send: GainNode;
  private noise: AudioBuffer;

  constructor(private ctx: AudioContext, out: AudioNode) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    this.bus.connect(comp);
    comp.connect(out);

    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 2.2);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.55;
    verb.connect(verbOut);
    verbOut.connect(this.bus);
    this.send = ctx.createGain();
    this.send.connect(verb);
    this.noise = noiseBuffer(ctx, 1);
  }

  get title(): string {
    return MOODS[this.mood].name;
  }

  start(): void {
    this.stop();
    this.next = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
  }

  nextMood(): void {
    this.mood = (this.mood + 1) % MOODS.length;
    this.step = 0;
    this.bar = 0;
  }

  private pump(): void {
    const now = this.ctx.currentTime;
    if (this.next < now - 0.05) this.next = now + 0.05; // tab was throttled: resync
    while (this.next < now + 0.12) {
      this.play(this.step, this.bar, this.next);
      this.next += 60 / MOODS[this.mood].bpm / 4;
      if (++this.step === 16) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private play(step: number, bar: number, t: number): void {
    const m = MOODS[this.mood];
    const stepLen = 60 / m.bpm / 4;
    const variant = bar % 2;
    const fill = bar % 4 === 3 && step >= 12;

    if (KICK[variant][step] === 'x') this.kick(t, 1);
    if (SNARE[variant][step] === 'x') this.snare(t, GHOST.has(step) ? 0.32 : 1);
    if (fill) this.snare(t, 0.4 + (step - 12) * 0.2);
    this.hat(t, HAT_VEL[step % 4], step === 14 && variant === 1);

    const phrase = bar % 16;
    if (phrase >= 2 && phrase !== 15) {
      for (const [s, n, len] of BASS[bar % 4]) {
        if (s === step) this.bass(t, n + m.shift, len * stepLen);
      }
    }
    if (step === 0 && bar % 2 === 0) this.pad(t, PADS[(bar >> 1) % 2], m.shift, stepLen * 32);
    if (bar % 4 === 3 && step === 10) this.bleep(t);
  }

  private env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }

  private kick(t: number, v: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(0.95 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g);
    g.connect(this.bus);
    o.start(t);
    o.stop(t + 0.35);
  }

  private snare(t: number, v: number): void {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    const sg = this.ctx.createGain();
    sg.gain.value = 0.35;
    n.connect(hp);
    hp.connect(g);
    g.connect(this.bus);
    g.connect(sg);
    sg.connect(this.send);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.2);

    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(130, t + 0.09);
    og.gain.setValueAtTime(0.32 * v, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(og);
    og.connect(this.bus);
    o.start(t);
    o.stop(t + 0.13);
  }

  private hat(t: number, v: number, open: boolean): void {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = this.ctx.createGain();
    const len = open ? 0.16 : 0.035;
    g.gain.setValueAtTime(0.2 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.bus);
    n.start(t, Math.random() * 0.5);
    n.stop(t + len + 0.02);
  }

  private bass(t: number, note: number, len: number): void {
    const f = midi(note);
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f;
    const sg = this.ctx.createGain();
    this.env(sg, t, 0.6, 0.01, Math.max(0.01, len - 0.06), 0.05);
    sub.connect(sg);
    sg.connect(this.bus);
    sub.start(t);
    sub.stop(t + len + 0.1);

    // Reese: two detuned saws through a closing low-pass.
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + len);
    const rg = this.ctx.createGain();
    this.env(rg, t, 0.15, 0.01, Math.max(0.01, len - 0.06), 0.05);
    lp.connect(rg);
    rg.connect(this.bus);
    for (const det of [-9, 9]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * 2;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.1);
    }
  }

  private pad(t: number, notes: number[], shift: number, len: number): void {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const g = this.ctx.createGain();
    this.env(g, t, 0.07, 0.9, len - 1.5, 1.3);
    lp.connect(g);
    g.connect(this.bus);
    g.connect(this.send);
    for (const n of notes) {
      for (const det of [-6, 6]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midi(n + shift);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + len + 0.3);
      }
    }
  }

  private bleep(t: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g);
    g.connect(this.bus);
    g.connect(this.send);
    o.start(t);
    o.stop(t + 0.25);
  }
}
