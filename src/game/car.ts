import { CAR_LIMIT, FINISH_S, centerAt, offsetPoint, project, wrapAngle, wrapDelta } from './track';

export interface CarSpec {
  /** Asymptotic top speed, m/s. */
  maxSpeed: number;
  /** Launch acceleration, m/s^2. */
  accel: number;
  /** Braking deceleration, m/s^2. */
  brake: number;
  /** Maximum lateral tyre acceleration, m/s^2. */
  grip: number;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const GEAR_TOP = [0, 22, 38, 52, 64, 75, 90];

/** One car: arcade physics state plus race bookkeeping. */
export class Car {
  // pose + velocity (world frame)
  x = 0;
  z = 0;
  h = 0;
  vx = 0;
  vz = 0;
  // velocity in the car frame (forward / left) and derived values
  vf = 0;
  vl = 0;
  yawRate = 0;
  ax = 0;
  // controls
  steer = 0; // -1 left .. +1 right
  throttle = 0;
  brake = 0;
  steerSmooth = 0;
  locked = false;
  // track position
  s = 0;
  d = 0;
  dist = 0; // distance travelled relative to the finish line (negative on the grid)
  // race
  finished = false;
  finishTime = 0;
  lapTimes: number[] = [];
  lapStart = 0;
  topSpeed = 0;
  contacts = 0;
  // feedback for audio / visuals
  contactCd = 0;
  impact = 0;
  skid = 0;
  gear = 1;
  rpm = 1500;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly color: number,
    readonly isPlayer: boolean,
    readonly spec: CarSpec,
  ) {}

  place(s: number, d: number): void {
    const p = offsetPoint(s, d);
    this.x = p.x;
    this.z = p.z;
    this.h = p.h;
    this.vx = this.vz = this.vf = this.vl = 0;
    this.yawRate = this.ax = 0;
    this.steer = this.throttle = this.brake = this.steerSmooth = 0;
    const pr = project(p.x, p.z);
    this.s = pr.s;
    this.d = pr.d;
    this.dist = wrapDelta(this.s - FINISH_S);
    this.finished = false;
    this.finishTime = 0;
    this.lapTimes = [];
    this.lapStart = 0;
    this.topSpeed = 0;
    this.contacts = 0;
    this.contactCd = 0;
    this.impact = 0;
    this.skid = 0;
    this.rpm = 1500;
    this.gear = 1;
  }

  step(dt: number): void {
    if (dt <= 0) return;
    const sp = this.spec;
    this.contactCd = Math.max(0, this.contactCd - dt);

    if (this.locked) {
      this.vx = this.vz = this.vf = this.vl = 0;
      this.yawRate = this.ax = this.skid = 0;
      this.rpm += (1500 - this.rpm) * Math.min(1, 6 * dt);
      return;
    }

    // Steering input ramps so a tapped key is not an instant full-lock.
    const maxDelta = (Math.abs(this.steer) > 0.01 ? 5.5 : 8) * dt;
    this.steerSmooth += clamp(this.steer - this.steerSmooth, -maxDelta, maxDelta);

    const speed = Math.abs(this.vf);
    const reversing = this.vf < -0.5;
    const maxYaw = 2.4 / (1 + speed / 20);
    const yaw = -this.steerSmooth * maxYaw * Math.min(1, speed / 4) * (reversing ? -1 : 1);
    this.yawRate = yaw;
    this.h += yaw * dt;

    // Split the world velocity into forward / left components of the new heading.
    const fx = Math.sin(this.h);
    const fz = Math.cos(this.h);
    const lx = Math.cos(this.h);
    const lz = -Math.sin(this.h);
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * lx + this.vz * lz;
    const vf0 = vf;

    if (this.brake > 0.05) {
      if (vf > 0.5) vf = Math.max(0, vf - sp.brake * this.brake * dt);
      else vf = Math.max(-10, vf - 9 * dt); // hold brake at a standstill to reverse
    } else if (this.throttle > 0.01) {
      vf += sp.accel * Math.max(0, 1 - Math.max(0, vf) / sp.maxSpeed) * this.throttle * dt;
    } else {
      vf -= vf * 0.09 * dt + Math.sign(vf) * Math.min(Math.abs(vf), 1.2 * dt);
    }

    // Tyre grip: sideways velocity is bled off, but only up to the grip limit.
    // Beyond it the car slides (understeer / drift) and scrubs speed.
    const bleed = Math.min(Math.abs(vl) * Math.min(1, 9 * dt), sp.grip * dt);
    vl -= Math.sign(vl) * bleed;
    this.skid = clamp((Math.abs(vl) - 2.2) / 5, 0, 1);

    this.vx = fx * vf + lx * vl;
    this.vz = fz * vf + lz * vl;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    this.ax += ((vf - vf0) / dt - this.ax) * Math.min(1, 8 * dt);
    this.vf = vf;
    this.vl = vl;
    if (vf > this.topSpeed) this.topSpeed = vf;
    this.updateEngine(dt);
  }

  /** Keep the car between the walls, bounce, scrape and refresh (s, d). */
  collideWalls(dt: number): void {
    const p = project(this.x, this.z);
    this.s = p.s;
    this.d = p.d;
    if (Math.abs(p.d) <= CAR_LIMIT) return;

    const sign = p.d > 0 ? 1 : -1;
    const c = centerAt(p.s);
    const lx = Math.cos(c.h);
    const lz = -Math.sin(c.h);
    this.x = c.x + lx * sign * CAR_LIMIT;
    this.z = c.z + lz * sign * CAR_LIMIT;
    this.d = sign * CAR_LIMIT;

    const nx = lx * sign;
    const nz = lz * sign;
    const vn = this.vx * nx + this.vz * nz;
    if (vn > 0) {
      this.vx -= 1.25 * vn * nx;
      this.vz -= 1.25 * vn * nz;
      this.noteImpact(vn);
    }
    const scrub = Math.max(0, 1 - 1.2 * dt);
    this.vx *= scrub;
    this.vz *= scrub;
    this.h += wrapAngle(c.h - this.h) * Math.min(1, 4 * dt); // glance along the wall
  }

  noteImpact(v: number): void {
    if (v > this.impact) this.impact = v;
    if (v > 2.5 && this.contactCd <= 0) {
      this.contacts++;
      this.contactCd = 0.6;
    }
  }

  private updateEngine(dt: number): void {
    const v = Math.abs(this.vf);
    let g = 1;
    while (g < 6 && v > GEAR_TOP[g]) g++;
    this.gear = g;
    const f = clamp((v - GEAR_TOP[g - 1]) / (GEAR_TOP[g] - GEAR_TOP[g - 1]), 0, 1);
    const target = 2300 + f * 4900 + this.throttle * 300;
    this.rpm += (target - this.rpm) * Math.min(1, 10 * dt);
  }
}
