import { Car, clamp } from './car';
import { RADIUS, isTurn, offsetPoint, wrapAngle, wrapDelta } from './track';

const AI_LAT = 19.5; // lateral accel the AI is willing to use in corners (m/s^2)
const AI_BRAKE = 24; // braking decel the AI plans with (m/s^2)
const LOOKAHEAD = [0, 25, 55, 95, 150, 220];

function cornerLimit(s: number, d: number): number {
  return isTurn(s) ? Math.sqrt(AI_LAT * (RADIUS + d)) : Infinity;
}

/** Pure-pursuit lane follower with corner-speed planning and simple overtaking. */
export class AIDriver {
  private target: number;

  constructor(
    private readonly car: Car,
    private readonly skill: number,
    private readonly lane: number,
  ) {
    this.target = lane;
  }

  reset(): void {
    this.target = this.lane;
  }

  update(dt: number, cars: Car[], player: Car, rubberBand: boolean): void {
    const car = this.car;

    // Lane choice: slide around any car ahead that is in our way.
    let want = this.lane;
    let slow = 1;
    for (const o of cars) {
      if (o === car) continue;
      const ahead = wrapDelta(o.s - car.s);
      if (ahead > 0 && ahead < 30 && Math.abs(o.d - this.target) < 4.5) {
        const side = car.d >= o.d ? 1 : -1;
        let cand = o.d + side * 6;
        if (Math.abs(cand) > 18) cand = o.d - side * 6;
        want = clamp(cand, -18, 18);
        if (ahead < 10) slow = Math.min(slow, 0.92);
      }
    }
    this.target += clamp(want - this.target, -7 * dt, 7 * dt);

    // Steering: chase a point on our target lane a little way ahead.
    const speed = Math.max(0, car.vf);
    const p = offsetPoint(car.s + 14 + speed * 0.5, this.target);
    const err = wrapAngle(Math.atan2(p.x - car.x, p.z - car.z) - car.h);
    if (Math.abs(err) > 1.9) {
      // Facing the wrong way after a shunt: reverse round.
      car.throttle = 0;
      car.brake = 1;
      car.steer = Math.sign(err);
      return;
    }
    car.steer = clamp(-err * 2.2, -1, 1);

    // Speed: the slowest speed that still lets us brake for any corner ahead.
    let vMax = Infinity;
    for (const dx of LOOKAHEAD) {
      const vc = cornerLimit(car.s + dx, this.target);
      vMax = Math.min(vMax, Math.sqrt(vc * vc + 2 * AI_BRAKE * dx));
    }
    let rb = 1;
    if (rubberBand) {
      const gap = car.dist - player.dist;
      if (gap > 90) rb = 1 - Math.min(0.06, (gap - 90) / 2500);
      else if (gap < -90) rb = 1 + Math.min(0.035, (-gap - 90) / 4000);
    }
    const vt = Math.min(vMax, car.spec.maxSpeed) * this.skill * slow * rb;
    const v = car.vf;
    if (v < vt - 0.5) {
      car.throttle = 1;
      car.brake = 0;
    } else if (v > vt + 1.5) {
      car.throttle = 0;
      car.brake = clamp((v - vt) / 6, 0.25, 1);
    } else {
      car.throttle = 0.35;
      car.brake = 0;
    }
  }
}
