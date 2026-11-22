// SOLPORT — stunts.js
// Stunt scoring for drivers who cannot resist showing off: long drifts,
// threading traffic at speed, and flat-out top-speed runs all pay cash.
//
// The tracker only watches state the game already produces — the player
// car's speed, the Space (drift) key, and traffic positions — so it can
// never desync the car or the world. A stunt pays when it *ends* cleanly
// (a drift you hold, a near miss you survive), which rewards finishing
// the move instead of farming the middle of it.

import { CONFIG } from './config.js';

export class StuntTracker {
  constructor() {
    this.driftTime = 0; // seconds of one continuous drift
    this.driftValue = 0; // cash banked by the current drift
    this.topSpeedTime = 0; // seconds pinned near the car's top speed
    this.nearMissAt = -10; // last near-miss payout (seconds, game clock)
    this.topSpeedAt = -10; // last top-speed payout (seconds, game clock)
    this.totalEarned = 0;
    this.lastStunt = ''; // human-readable line for the HUD flash
    this._flash = null;
  }

  _pay(S, amount, text) {
    const cash = Math.max(1, Math.round(amount));
    S.cash += cash;
    this.totalEarned += cash;
    this.lastStunt = `${text} +$${cash}`;
    this._flash = this.lastStunt;
  }

  update(dt, S) {
    // Stunts only count while actually driving in live play.
    if (S.mode !== 'playing' || S.shotMode || S.player.onFoot || !S.car) {
      this.driftTime = 0;
      this.driftValue = 0;
      this.topSpeedTime = 0;
      return null;
    }
    const car = S.car;
    const speed = Math.abs(car.speed);
    const drifting = S.input.down(' ') && speed > CONFIG.stunts.driftMinSpeed;

    // --- Drift streak: hold Space through a slide, bank cash per second.
    if (drifting) {
      this.driftTime += dt;
      this.driftValue += CONFIG.stunts.driftCashPerSec * dt;
    } else if (this.driftTime > 0) {
      if (this.driftTime >= CONFIG.stunts.driftMinTime) {
        const bonus = this.driftValue * (1 + Math.min(1, this.driftTime / 8));
        this._pay(S, bonus, `Drift ${this.driftTime.toFixed(1)}s`);
      }
      this.driftTime = 0;
      this.driftValue = 0;
    }

    // --- Near miss: a traffic car flashes past within arm's reach while
    // the player is barrelling along — but not so close it is a crash.
    if (speed > CONFIG.stunts.nearMissMinSpeed && S.time - this.nearMissAt > CONFIG.stunts.cooldown) {
      for (const t of S.traffic.cars) {
        const dx = t.mesh.position.x - car.x;
        const dz = t.mesh.position.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d > 2.6 && d < CONFIG.stunts.nearMissRange) {
          // Only count cars roughly ahead, in the player's path.
          const ahead = (dx * Math.sin(car.angle) + dz * Math.cos(car.angle)) > 0;
          if (ahead) {
            this.nearMissAt = S.time;
            this._pay(S, CONFIG.stunts.nearMissCash, 'Near miss!');
            break;
          }
        }
      }
    }

    // --- Top-speed run: hold the needle near the max for a solid burst.
    if (speed > CONFIG.stunts.topSpeed) {
      this.topSpeedTime += dt;
      if (this.topSpeedTime >= CONFIG.stunts.topSpeedHold &&
          S.time - this.topSpeedAt > CONFIG.stunts.cooldown) {
        this.topSpeedAt = S.time;
        this.topSpeedTime = 0;
        this._pay(S, CONFIG.stunts.topSpeedCash, 'Top speed!');
      }
    } else {
      this.topSpeedTime = 0;
    }

    const msg = this._flash;
    this._flash = null;
    return msg;
  }
}
