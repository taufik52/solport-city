// SOLPORT — weather.js
// Dynamic weather: clear skies, heavy rain and thick fog roll across
// Solport on their own schedule, and missions can force a change.
//
// Every condition is a small profile (fog band, sky colour, sun strength,
// how much rain falls, how slippery the roads get). The system blends
// between profiles over a few seconds instead of snapping, so a storm
// visibly closes in. Rain is a THREE.Points cloud that follows the
// player; fog is the scene fog pulled in close, which also shortens how
// far ahead the player can see.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, lerp, smoothstep } from './utils.js';

// What each condition looks and feels like. grip 1.0 is a dry road;
// lower values make the car slide more in the same steering input.
const PROFILES = {
  clear: {
    label: 'Clear skies',
    sky: 0x9fc8e8, fogColor: 0xa8c8e0, fogNear: 180, fogFar: 520,
    sun: 2.2, rain: 0, grip: 1.0, visibility: 520,
  },
  rain: {
    label: 'Heavy rain',
    sky: 0x5d7488, fogColor: 0x6d8296, fogNear: 90, fogFar: 300,
    sun: 1.1, rain: 1.0, grip: 0.55, visibility: 300,
  },
  fog: {
    label: 'Thick fog',
    sky: 0xb8bcc0, fogColor: 0xc2c6cc, fogNear: 25, fogFar: 110,
    sun: 0.7, rain: 0, grip: 0.9, visibility: 110,
  },
};

const ORDER = ['clear', 'rain', 'fog'];
// Weighted roll for the next automatic change: clear stays most likely,
// rain shows up often enough to matter, fog is the rare one.
const NEXT_WEIGHTS = { clear: 0.5, rain: 0.3, fog: 0.2 };

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.current = 'clear';
    this.from = 'clear'; // profile we are blending away from
    this.blend = 1; // 0..1, 1 = fully on `current`
    this.timer = 0; // seconds since the last automatic change
    this.nextChangeAt = CONFIG.weather.changeEvery;
    this._flash = null; // pending HUD message, consumed by main.js

    // Cache the lights city.js installed, so weather can dim the sun
    // and flatten the sky light as a storm rolls in.
    this.sun = null;
    this.hemi = null;
    scene.traverse((o) => {
      if (o.isDirectionalLight && !this.sun) this.sun = o;
      if (o.isHemisphereLight && !this.hemi) this.hemi = o;
    });

    // Rain: a box of falling streaks centred on the player. The points
    // are invisible until rain starts; their opacity follows rain amount.
    const count = CONFIG.weather.rainDrops;
    this.rainCount = count;
    this.rainArea = CONFIG.weather.rainArea;
    this.rainSpeed = CONFIG.weather.rainSpeed;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.rainArea;
      pos[i * 3 + 1] = Math.random() * 45;
      pos[i * 3 + 2] = (Math.random() - 0.5) * this.rainArea;
    }
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.PointsMaterial({
      color: 0xaec6d8, size: 0.45, transparent: true, opacity: 0,
      sizeAttenuation: true, depthWrite: false,
    });
    this.rain = new THREE.Points(this.rainGeo, this.rainMat);
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    this._apply(PROFILES.clear, 1);
  }

  // Mission hook: force a condition right now (e.g. a getaway in the rain).
  setWeather(state) {
    if (!PROFILES[state] || state === this.current) return false;
    this.from = this.current;
    this.current = state;
    this.blend = 0;
    this.timer = 0;
    this.nextChangeAt = CONFIG.weather.changeEvery;
    this._flash = `Weather: ${PROFILES[state].label}` +
      (state === 'rain' ? ' — roads are slick, drive careful' :
        state === 'fog' ? ' — visibility is way down' : '');
    return true;
  }

  // Pick the next condition, never repeating the one we just had.
  _rollNext() {
    let pick = this.current;
    while (pick === this.current) {
      const r = Math.random();
      let acc = 0;
      for (const key of ORDER) {
        acc += NEXT_WEIGHTS[key];
        if (r <= acc) { pick = key; break; }
      }
    }
    this.setWeather(pick);
  }

  // Blend one profile into another and push the result into the scene.
  _apply(a, t) {
    const b = PROFILES[this.current];
    const e = smoothstep(t);
    const sky = new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), e);
    const fogC = new THREE.Color(a.fogColor).lerp(new THREE.Color(b.fogColor), e);
    if (this.scene.background && this.scene.background.isColor) {
      this.scene.background.copy(sky);
    }
    if (this.scene.fog) {
      this.scene.fog.color.copy(fogC);
      this.scene.fog.near = lerp(a.fogNear, b.fogNear, e);
      this.scene.fog.far = lerp(a.fogFar, b.fogFar, e);
    }
    if (this.sun) this.sun.intensity = lerp(a.sun, b.sun, e);
    // Sky light follows the sun: bright and open on a clear day,
    // flat and grey when the weather closes in.
    if (this.hemi) this.hemi.intensity = 0.55 + (lerp(a.sun, b.sun, e) / 2.2) * 0.35;
    const rainAmt = lerp(a.rain, b.rain, e);
    this.rain.visible = rainAmt > 0.02;
    this.rainMat.opacity = clamp(rainAmt * 0.85, 0, 0.85);
    this._rainAmt = rainAmt;
  }

  update(dt, S) {
    // Staged screenshots pin the sky themselves; weather must not fight them.
    if (S.shotMode) return null;
    // Automatic rotation: every so often, roll for a new condition.
    this.timer += dt;
    if (this.timer >= this.nextChangeAt) {
      this.timer = 0;
      if (Math.random() < CONFIG.weather.changeChance) this._rollNext();
      else this.nextChangeAt = CONFIG.weather.changeEvery * 0.5;
    }
    // Ease the blend toward the new profile.
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / CONFIG.weather.transition);
    }
    this._apply(PROFILES[this.from], this.blend);
    // Rain falls around the player and recycles to the top of its box.
    // Drops live in the cloud's local space; the cloud itself is centred
    // on the player each frame, so rain follows the drive.
    if (this.rain.visible) {
      const arr = this.rainGeo.attributes.position.array;
      const fall = this.rainSpeed * dt;
      for (let i = 0; i < this.rainCount; i++) {
        let y = arr[i * 3 + 1] - fall * (0.8 + (i % 5) * 0.1);
        if (y < 0) {
          y = 42 + Math.random() * 3;
          arr[i * 3] = (Math.random() - 0.5) * this.rainArea;
          arr[i * 3 + 2] = (Math.random() - 0.5) * this.rainArea;
        }
        arr[i * 3 + 1] = y;
      }
      this.rainGeo.attributes.position.needsUpdate = true;
      this.rain.position.set(S.player.x, 0, S.player.z);
    }
    const msg = this._flash;
    this._flash = null;
    return msg;
  }

  // --- Getters for HUD / driving / missions -------------------------------
  gripFactor() {
    const a = PROFILES[this.from], b = PROFILES[this.current];
    return lerp(a.grip, b.grip, smoothstep(this.blend));
  }
  visibilityMeters() {
    const a = PROFILES[this.from], b = PROFILES[this.current];
    return Math.round(lerp(a.visibility, b.visibility, smoothstep(this.blend)));
  }
  label() { return PROFILES[this.current].label; }
  isRaining() { return (this._rainAmt || 0) > 0.3; }
  state() { return this.current; }
}
