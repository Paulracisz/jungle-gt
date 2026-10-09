import { JungleSynth } from './jungle';

export interface Track {
  title: string;
  artist: string;
  file: string;
  credit?: string;
}

const MUSIC_BASE = `${import.meta.env.BASE_URL}music/`;

/** Plays real audio files listed in public/music/playlist.json. */
class TrackPlayer {
  private el = new Audio();
  private idx: number;
  private failures = 0;
  title = '';

  constructor(ctx: AudioContext, out: AudioNode, private tracks: Track[], private onFail: () => void) {
    this.el.preload = 'auto';
    ctx.createMediaElementSource(this.el).connect(out);
    this.idx = Math.floor(Math.random() * tracks.length);
    this.el.addEventListener('ended', () => this.next());
    this.el.addEventListener('error', () => {
      if (++this.failures >= this.tracks.length) this.onFail();
      else this.next();
    });
  }

  start(): void {
    const t = this.tracks[this.idx];
    this.el.src = MUSIC_BASE + t.file;
    this.title = t.credit ? `${t.title} - ${t.artist} (${t.credit})` : `${t.title} - ${t.artist}`;
    void this.el.play().catch(() => undefined);
  }

  stop(): void {
    this.el.pause();
  }

  next(): void {
    this.idx = (this.idx + 1) % this.tracks.length;
    this.start();
  }
}

export class AudioEngine {
  musicOn = true;
  nowPlaying = '';
  private ctx: AudioContext | null = null;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private engine?: { o1: OscillatorNode; o2: OscillatorNode; lp: BiquadFilterNode; g: GainNode };
  private skidGain?: GainNode;
  private noise!: AudioBuffer;
  private synth?: JungleSynth;
  private files?: TrackPlayer;
  private musicReady = false;
  private starting = false;

  /** Must be called from a user gesture (the Start button). */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      const ctx = this.ctx;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(master);
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(master);

      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.buildEngine(ctx);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (!this.musicReady && !this.starting) {
      this.starting = true;
      void this.initMusic().then(() => {
        this.musicReady = true;
      });
    }
  }

  private buildEngine(ctx: AudioContext): void {
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    const mix2 = ctx.createGain();
    mix2.gain.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.value = 0;
    o1.connect(lp);
    o2.connect(mix2);
    mix2.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    o1.start();
    o2.start();
    this.engine = { o1, o2, lp, g };

    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 3;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    n.connect(bp);
    bp.connect(this.skidGain);
    this.skidGain.connect(this.sfxGain);
    n.start();
  }

  private async initMusic(): Promise<void> {
    const ctx = this.ctx!;
    let tracks: Track[] = [];
    try {
      const res = await fetch(`${MUSIC_BASE}playlist.json`);
      if (res.ok) tracks = ((await res.json()) as { tracks?: Track[] }).tracks ?? [];
    } catch {
      /* no playlist: fall back to the built-in synth */
    }
    this.synth = new JungleSynth(ctx, this.musicGain);
    if (tracks.length > 0) {
      this.files = new TrackPlayer(ctx, this.musicGain, tracks, () => {
        this.files?.stop();
        this.files = undefined;
        if (this.musicOn) this.startMusic();
      });
    }
    if (this.musicOn) this.startMusic();
  }

  private startMusic(): void {
    if (this.files) {
      this.files.start();
      this.nowPlaying = this.files.title;
    } else if (this.synth) {
      this.synth.start();
      this.nowPlaying = this.synth.title;
    }
  }

  private stopMusic(): void {
    this.files?.stop();
    this.synth?.stop();
    this.nowPlaying = '';
  }

  toggleMusic(): void {
    this.musicOn = !this.musicOn;
    if (!this.ctx || !this.musicReady) return;
    if (this.musicOn) this.startMusic();
    else this.stopMusic();
  }

  nextTrack(): void {
    if (!this.musicOn || !this.musicReady) return;
    if (this.files) {
      this.files.next();
      this.nowPlaying = this.files.title;
    } else if (this.synth) {
      this.synth.nextMood();
      this.nowPlaying = this.synth.title;
    }
  }

  setPaused(p: boolean): void {
    if (!this.ctx) return;
    void (p ? this.ctx.suspend() : this.ctx.resume());
  }

  /** Called every frame with the player's engine state. */
  update(rpm: number, throttle: number, skid: number, active: boolean): void {
    if (!this.ctx || !this.engine) return;
    const now = this.ctx.currentTime;
    const f = (rpm / 60) * 3;
    this.engine.o1.frequency.setTargetAtTime(f, now, 0.03);
    this.engine.o2.frequency.setTargetAtTime(f * 1.005, now, 0.03);
    this.engine.lp.frequency.setTargetAtTime(500 + throttle * 1300 + rpm * 0.12, now, 0.05);
    this.engine.g.gain.setTargetAtTime(active ? 0.05 + throttle * 0.07 : 0.02, now, 0.06);
    this.skidGain?.gain.setTargetAtTime(active ? skid * 0.09 : 0, now, 0.05);
  }

  thud(strength: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, strength / 14);
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55 * v + 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    n.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    n.start(t);
    n.stop(t + 0.3);
    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    og.gain.setValueAtTime(0.5 * v + 0.1, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(og);
    og.connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.25);
  }

  beep(freq: number, dur = 0.14): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  dispose(): void {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
  }
}
