import * as THREE from 'three';
import { AudioEngine } from './audio';
import { Car, clamp } from './car';
import { CarView, buildCar } from './carModel';
import { Input } from './input';
import { PsxRenderer } from './psx';
import { LAPS, Phase, Race } from './race';
import { buildWorld } from './scene';
import { TRACK_LENGTH, centerAt, wrapAngle } from './track';

export interface HudCar {
  id: number;
  name: string;
  color: number;
  x: number;
  z: number;
  isPlayer: boolean;
  finished: boolean;
  time: number;
}

export interface HudState {
  phase: Phase;
  label: string;
  paused: boolean;
  speed: number; // km/h
  gear: string;
  rpm: number; // 0..1
  lap: number;
  laps: number;
  place: number;
  total: number;
  raceTime: number;
  lapTime: number;
  bestLap: number;
  lastLap: number;
  wrongWay: boolean;
  cars: HudCar[]; // in race order
  nowPlaying: string;
  musicOn: boolean;
}

export interface RaceResult {
  place: number;
  total: number;
  laps: number[];
  best: number;
  topSpeed: number; // km/h
  avgSpeed: number; // km/h
  contacts: number;
}

export interface GameEvents {
  onFinish(result: RaceResult): void;
}

export class Game {
  readonly race = new Race();
  readonly audio = new AudioEngine();
  private input = new Input();
  private psx: PsxRenderer;
  private scene: THREE.Scene;
  private sky: THREE.Group;
  private camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.6, 3500);
  private views = new Map<Car, CarView>();
  private ro: ResizeObserver;
  private raf = 0;
  private last = 0;
  private paused = false;
  private camMode = 0;
  private camH = 0;
  private lastLabel = '';
  private finishedAt = -1;
  private reported = false;

  constructor(private host: HTMLElement, private events: GameEvents) {
    this.psx = new PsxRenderer(host);
    const world = buildWorld();
    this.scene = world.scene;
    this.sky = world.sky;
    for (const car of this.race.cars) {
      const v = buildCar(car.color);
      this.scene.add(v.root);
      this.views.set(car, v);
    }
    this.camH = this.race.player.h;
    this.input.onPress = (code) => this.onKey(code);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- public controls ------------------------------------------------------
  async unlockAudio(): Promise<void> {
    await this.audio.unlock();
  }

  startRace(): void {
    this.setPaused(false);
    this.race.reset('countdown');
    this.camH = this.race.player.h;
    this.lastLabel = '';
    this.finishedAt = -1;
    this.reported = false;
  }

  toTitle(): void {
    this.setPaused(false);
    this.race.reset('attract');
    this.camH = this.race.player.h;
    this.finishedAt = -1;
    this.reported = false;
  }

  togglePause(): void {
    const ph = this.race.phase;
    if (ph === 'countdown' || ph === 'racing') this.setPaused(!this.paused);
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    this.audio.setPaused(p);
  }

  private onKey(code: string): void {
    switch (code) {
      case 'KeyC':
        this.camMode = (this.camMode + 1) % 3;
        break;
      case 'KeyM':
        this.audio.toggleMusic();
        break;
      case 'KeyN':
        this.audio.nextTrack();
        break;
      case 'Escape':
      case 'KeyP':
        this.togglePause();
        break;
    }
  }

  // --- snapshots for React --------------------------------------------------
  private hudCars(): HudCar[] {
    return this.race.standings().map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      x: c.x,
      z: c.z,
      isPlayer: c.isPlayer,
      finished: c.finished,
      time: c.finishTime,
    }));
  }

  hud(): HudState {
    const r = this.race;
    const p = r.player;
    const cars = this.hudCars();
    const trackH = centerAt(p.s).h;
    const racing = r.phase === 'racing';
    return {
      phase: r.phase,
      label: r.countdownLabel(),
      paused: this.paused,
      speed: Math.max(0, p.vf) * 3.6,
      gear: p.vf < -0.5 ? 'R' : p.vf < 0.5 ? 'N' : String(p.gear),
      rpm: clamp((p.rpm - 1500) / 5800, 0, 1),
      lap: Math.min(LAPS, Math.max(1, p.lapTimes.length + 1)),
      laps: LAPS,
      place: cars.findIndex((c) => c.isPlayer) + 1,
      total: cars.length,
      raceTime: p.finished ? p.finishTime : r.time,
      lapTime: racing ? r.time - p.lapStart : 0,
      bestLap: p.lapTimes.length ? Math.min(...p.lapTimes) : Infinity,
      lastLap: p.lapTimes.length ? p.lapTimes[p.lapTimes.length - 1] : Infinity,
      wrongWay: racing && p.vf > 5 && Math.cos(wrapAngle(p.h - trackH)) < -0.2,
      cars,
      nowPlaying: this.audio.nowPlaying,
      musicOn: this.audio.musicOn,
    };
  }

  private result(): RaceResult {
    const p = this.race.player;
    return {
      place: this.race.finishOrder.indexOf(p) + 1,
      total: p.finishTime,
      laps: [...p.lapTimes],
      best: Math.min(...p.lapTimes),
      topSpeed: p.topSpeed * 3.6,
      avgSpeed: ((LAPS * TRACK_LENGTH) / p.finishTime) * 3.6,
      contacts: p.contacts,
    };
  }

  // --- frame loop -----------------------------------------------------------
  private frame = (t: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;

    if (!this.paused && dt > 0) {
      const steps = Math.max(1, Math.ceil(dt / 0.02));
      const h = dt / steps;
      const ctl = this.input.controls();
      for (let i = 0; i < steps; i++) this.race.update(h, ctl);
    }

    this.afterSim(t);
    this.updateViews(this.paused ? 0 : dt);
    this.updateCamera(dt);
    this.psx.render(this.scene, this.camera);
  };

  private afterSim(t: number): void {
    const r = this.race;
    const p = r.player;

    const label = r.countdownLabel();
    if (label !== this.lastLabel) {
      if (label === '3' || label === '2' || label === '1') this.audio.beep(660);
      else if (label === 'GO!') this.audio.beep(1320, 0.45);
      this.lastLabel = label;
    }

    this.audio.update(p.rpm, p.throttle, p.skid, r.phase !== 'attract');
    if (r.phase !== 'attract' && p.impact > 1.5) this.audio.thud(p.impact);
    for (const c of r.cars) c.impact = 0;

    if (r.phase === 'finished' && !this.reported) {
      if (this.finishedAt < 0) this.finishedAt = t;
      else if (t - this.finishedAt > 2200) {
        this.reported = true;
        this.events.onFinish(this.result());
      }
    }
  }

  private updateViews(dt: number): void {
    for (const [car, v] of this.views) {
      v.root.position.set(car.x, 0, car.z);
      v.root.rotation.y = car.h;
      v.spin += (car.vf * dt) / 0.37;
      for (const w of v.wheels) w.rotation.x = v.spin;
      const steerVis = -car.steerSmooth * 0.45 * (car.vf < -0.5 ? -1 : 1);
      for (const f of v.frontPivots) f.rotation.y = steerVis;
      v.body.rotation.z = clamp(car.yawRate * car.vf * 0.0012, -0.05, 0.05);
      v.body.rotation.x = clamp(-car.ax * 0.0022, -0.05, 0.05);
      v.tail.color.setHex(car.brake > 0.1 && car.vf > 0.5 ? 0xff3030 : 0x701010);
    }
  }

  private updateCamera(dt: number): void {
    const p = this.race.player;
    const cam = this.camera;
    this.camH += wrapAngle(p.h - this.camH) * Math.min(1, dt * 5);
    const speedF = clamp(p.vf / 80, 0, 1);

    if (this.camMode === 2) {
      const fx = Math.sin(p.h);
      const fz = Math.cos(p.h);
      cam.position.set(p.x + fx * 2.5, 0.85, p.z + fz * 2.5);
      cam.lookAt(p.x + fx * 30, 0.9, p.z + fz * 30);
    } else {
      const back = this.camMode === 0 ? 8.2 : 14;
      const up = this.camMode === 0 ? 2.9 : 5;
      const sx = Math.sin(this.camH);
      const cz = Math.cos(this.camH);
      cam.position.set(p.x - sx * back, up, p.z - cz * back);
      cam.lookAt(p.x + sx * 8, 1.1, p.z + cz * 8);
    }
    cam.fov = 62 + speedF * 16;
    cam.updateProjectionMatrix();
    this.sky.position.copy(cam.position);
  }

  private resize(): void {
    const r = this.host.getBoundingClientRect();
    this.camera.aspect = this.psx.resize(r.width, r.height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.input.dispose();
    this.audio.dispose();
    this.psx.dispose();
  }
}
