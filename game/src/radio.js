// SOLPORT — radio.js
// In-car radio: three procedural stations built on WebAudio, no audio
// files anywhere. Each station is its own little sequencer — a bass
// line, a lead voice and (on the ambient station) slow pads — driven by
// a lookahead scheduler so the groove stays steady while the player
// drives. The radio only plays inside a car; it cuts out on foot, on
// pause, on mute, and in staged screenshot mode.

import { CONFIG } from './config.js';

// MIDI note numbers, one octave of A minor pentatonic-ish material per
// station, plus a root the bass walks around. Patterns are written as
// scale-degree steps (null = rest) so each station reads like its own
// little score instead of sharing one generic loop.
const STATIONS = [
  {
    name: 'SOLPORT FM', freq: '88.4', bpm: 92,
    songs: ['Sunset Cruise', 'Marina Lights', 'Slow Lane Home'],
    bassRoot: 33, // A1
    bass: [0, null, 7, null, 5, null, 3, null],
    leadRoot: 69, // A4
    lead: [0, null, 2, null, 4, null, 7, null, 9, null, 7, null, 4, null, 2, null],
    leadWave: 'triangle', leadVol: 0.10, bassVol: 0.16,
    pad: null, // this station rides on bass + lead alone
  },
  {
    name: 'NEON DRIVE', freq: '101.2', bpm: 132,
    songs: ['Midnight Overpass', 'Redline', 'Nitrous Hearts'],
    bassRoot: 28, // E1
    bass: [0, 0, 7, 0, 10, 0, 7, 12],
    leadRoot: 76, // E5
    lead: [0, 3, 7, 10, 12, 10, 7, 3, 0, 3, 7, 12, 14, 12, 10, 7],
    leadWave: 'square', leadVol: 0.05, bassVol: 0.18,
    pad: null,
  },
  {
    name: 'DUSK AMBIENT', freq: '94.7', bpm: 60,
    songs: ['Fog Over Portside', 'Low Tide Static', 'Empty Boulevard'],
    bassRoot: 36, // C2
    bass: [0, null, null, null, 7, null, null, null],
    leadRoot: 72, // C5
    lead: [0, null, null, null, null, null, 4, null, null, null, null, null, 7, null, null, null],
    leadWave: 'sine', leadVol: 0.09, bassVol: 0.10,
    // One soft chord per bar: root, third, fifth and a high colour note.
    pad: [[0, 4, 7, 12], [0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9]],
    padVol: 0.05,
  },
];

const STEP_BEATS = 0.25; // sequencer steps in sixteenth notes
const BARS_PER_SONG = 8;

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export class CarRadio {
  constructor() {
    this.station = CONFIG.radio.startStation || 0;
    this.song = 0;
    this.running = false;
    this.ctx = null;
    this.master = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.bar = 0;
    this._labelFlash = null;
  }

  get stationDef() { return STATIONS[this.station]; }

  // One voice: oscillator -> gentle low-pass -> gain envelope.
  _note(freq, at, dur, type, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = type === 'square' ? 1400 : 3200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(filt).connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  // A pad chord: several detuned saws swelling in over a whole bar.
  _pad(chord, at, dur) {
    const ctx = this.ctx;
    for (const deg of chord) {
      for (const det of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToFreq(this.stationDef.leadRoot - 24 + deg);
        osc.detune.value = det;
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(this.stationDef.padVol, at + dur * 0.4);
        g.gain.linearRampToValueAtTime(0.0001, at + dur);
        osc.connect(filt).connect(g).connect(this.master);
        osc.start(at);
        osc.stop(at + dur + 0.05);
      }
    }
  }

  _scheduleStep(step, at) {
    const st = this.stationDef;
    const stepDur = (60 / st.bpm) * STEP_BEATS;
    const sixteenth = step % 16;
    // Bass walks on eighth notes (every other step).
    if (step % 2 === 0) {
      const deg = st.bass[(step / 2) % st.bass.length];
      if (deg !== null && deg !== undefined) {
        this._note(midiToFreq(st.bassRoot + deg), at, stepDur * 1.8, 'triangle', st.bassVol);
      }
    }
    // Lead plays the sixteenth-note pattern.
    const leadDeg = st.lead[sixteenth];
    if (leadDeg !== null && leadDeg !== undefined) {
      this._note(midiToFreq(st.leadRoot + leadDeg), at, stepDur * 1.6, st.leadWave, st.leadVol);
    }
    // Pads change once per bar, on the downbeat.
    if (st.pad && sixteenth === 0) {
      const chord = st.pad[this.bar % st.pad.length];
      this._pad(chord, at, stepDur * 16);
    }
    // Count bars; a new song title rolls around every few bars.
    if (sixteenth === 15) {
      this.bar += 1;
      if (this.bar % BARS_PER_SONG === 0) {
        this.song = (this.song + 1) % st.songs.length;
        this._labelFlash = this.stationLabel();
      }
    }
  }

  _tick = () => {
    if (!this.ctx || !this.running) return;
    const st = this.stationDef;
    const stepDur = (60 / st.bpm) * STEP_BEATS;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this._scheduleStep(this.step, this.nextTime);
      this.step += 1;
      this.nextTime += stepDur;
    }
  };

  _start(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = CONFIG.radio.volume;
    this.master.connect(ctx.destination);
    this.step = 0;
    this.bar = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.running = true;
    this.timer = setInterval(this._tick, 40);
  }

  _stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.master) {
      const m = this.master;
      try { m.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); } catch (e) { /* ctx gone */ }
      setTimeout(() => { try { m.disconnect(); } catch (e) { /* already gone */ } }, 400);
      this.master = null;
    }
    this.running = false;
  }

  // R key: hop to the next station. Returns the new station line for the HUD.
  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.song = 0;
    this.bar = 0;
    if (this.running) { this.step = 0; this.nextTime = this.ctx.currentTime + 0.05; }
    const label = this.stationLabel();
    this._labelFlash = label;
    return label;
  }

  update(dt, S) {
    const audible = S.mode === 'playing' && !S.shotMode &&
      !S.player.onFoot && S.audio.ctx && !S.audio.muted;
    if (audible && !this.running) this._start(S.audio.ctx);
    else if (!audible && this.running) this._stop();
    else if (this.running && this.master) {
      // Mute toggle while driving: fade the master instead of cutting it.
      const target = S.audio.muted ? 0 : CONFIG.radio.volume;
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    }
    const msg = this._labelFlash;
    this._labelFlash = null;
    return msg;
  }

  // --- Getters for the HUD ------------------------------------------------
  stationLabel() {
    const st = this.stationDef;
    return `${st.name} ${st.freq} — ${st.songs[this.song]}`;
  }
  songLabel() { return this.stationDef.songs[this.song]; }
  isOn() { return this.running; }
}
