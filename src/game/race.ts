import { AIDriver } from './ai';
import { Car, CarSpec } from './car';
import type { Controls } from './input';
import { FINISH_S, TRACK_LENGTH, wrapDelta } from './track';

export const LAPS = 3;
export type Phase = 'attract' | 'countdown' | 'racing' | 'finished';

const PLAYER_SPEC: CarSpec = { maxSpeed: 86, accel: 15, brake: 38, grip: 24 };
export const PLAYER_COLOR = 0x57b8ff; // sky blue

const AI_DEFS = [
  { name: 'REESE', color: 0xe53935, skill: 0.97, lane: -14 },
  { name: 'AMEN', color: 0xfdd835, skill: 0.945, lane: 9 },
  { name: 'SUBZERO', color: 0xf2f2f2, skill: 0.92, lane: -4 },
  { name: 'RIDDIM', color: 0x43a047, skill: 0.895, lane: 14 },
  { name: 'JUNGLIST', color: 0xff8f00, skill: 0.87, lane: 3 },
];

export class Race {
  readonly cars: Car[];
  readonly player: Car;
  phase: Phase = 'attract';
  time = 0;
  countdown = 0;
  finishOrder: Car[] = [];
  private drivers = new Map<Car, AIDriver>();

  constructor() {
    const ai = AI_DEFS.map((d, i) => {
      const spec: CarSpec = { ...PLAYER_SPEC, accel: PLAYER_SPEC.accel * (0.55 + 0.45 * d.skill) };
      const car = new Car(i + 1, d.name, d.color, false, spec);
      this.drivers.set(car, new AIDriver(car, d.skill, d.lane));
      return car;
    });
    this.player = new Car(0, 'YOU', PLAYER_COLOR, true, PLAYER_SPEC);
    this.drivers.set(this.player, new AIDriver(this.player, 0.97, 0)); // autopilot for attract / cool-down
    // Grid order (front to back). The player starts 5th.
    this.cars = [ai[0], ai[1], ai[2], ai[3], this.player, ai[4]];
    this.reset('attract');
  }

  reset(phase: Phase): void {
    this.phase = phase;
    this.time = 0;
    this.countdown = phase === 'countdown' ? 4.6 : 0;
    this.finishOrder = [];
    this.cars.forEach((c, i) => {
      const row = i >> 1;
      const side = i % 2 ? 1 : -1;
      c.place(FINISH_S - 12 - row * 15 - (side > 0 ? 6 : 0), side * 6);
      c.locked = phase === 'countdown';
    });
    this.drivers.forEach((d) => d.reset());
  }

  standings(): Car[] {
    return [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
  }

  countdownLabel(): string {
    if (this.phase === 'countdown') return this.countdown > 3 ? 'READY' : String(Math.ceil(this.countdown));
    if (this.phase === 'racing' && this.time < 1.2) return 'GO!';
    return '';
  }

  update(dt: number, input: Controls): void {
    if (dt <= 0) return;

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.time = 0;
        this.cars.forEach((c) => (c.locked = false));
      }
    } else if (this.phase !== 'attract') {
      this.time += dt;
    }

    for (const c of this.cars) {
      if (c.locked) {
        c.throttle = c.brake = c.steer = 0;
      } else if (c.isPlayer && this.phase === 'racing' && !c.finished) {
        c.steer = input.steer;
        c.throttle = input.throttle;
        c.brake = input.brake;
      } else {
        this.drivers.get(c)!.update(dt, this.cars, this.player, this.phase === 'racing');
      }
    }

    const prev = this.cars.map((c) => c.s);
    for (const c of this.cars) c.step(dt);
    this.collideCars();
    this.cars.forEach((c, i) => {
      c.collideWalls(dt);
      c.dist += wrapDelta(c.s - prev[i]);
      if (this.phase === 'racing' || this.phase === 'finished') this.trackLaps(c);
    });
  }

  private trackLaps(c: Car): void {
    while (!c.finished && c.dist >= (c.lapTimes.length + 1) * TRACK_LENGTH) {
      const k = c.lapTimes.length + 1;
      const over = c.dist - k * TRACK_LENGTH;
      const t = this.time - over / Math.max(8, c.vf);
      c.lapTimes.push(t - c.lapStart);
      c.lapStart = t;
      if (k >= LAPS) {
        c.finished = true;
        c.finishTime = t;
        this.finishOrder.push(c);
        if (c.isPlayer) this.phase = 'finished';
      }
    }
  }

  /** Two circles per car (nose and tail) keeps side-by-side racing possible. */
  private collideCars(): void {
    const R = 1.15;
    const OFF = 1.25;
    const cs = this.cars;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i];
        const b = cs[j];
        if (Math.abs(a.x - b.x) > 6 || Math.abs(a.z - b.z) > 6) continue;
        const ax = Math.sin(a.h);
        const az = Math.cos(a.h);
        const bx = Math.sin(b.h);
        const bz = Math.cos(b.h);
        for (const sa of [OFF, -OFF]) {
          for (const sb of [OFF, -OFF]) {
            let dx = b.x + bx * sb - (a.x + ax * sa);
            let dz = b.z + bz * sb - (a.z + az * sa);
            const dist = Math.hypot(dx, dz);
            if (dist >= 2 * R || dist < 1e-6) continue;
            dx /= dist;
            dz /= dist;
            const push = (2 * R - dist) / 2;
            a.x -= dx * push;
            a.z -= dz * push;
            b.x += dx * push;
            b.z += dz * push;
            const rv = (b.vx - a.vx) * dx + (b.vz - a.vz) * dz;
            if (rv < 0) {
              const j2 = (-(1 + 0.25) * rv) / 2;
              a.vx -= j2 * dx;
              a.vz -= j2 * dz;
              b.vx += j2 * dx;
              b.vz += j2 * dz;
              a.noteImpact(-rv);
              b.noteImpact(-rv);
            }
          }
        }
      }
    }
  }
}
