// SOLPORT sound: 100% WebAudio synth, no audio files. Engine hum, gunshots,
// two-tone siren, pickup chime and mission stings, all generated live.
export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenOn = false;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    // Engine: sawtooth + lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter); this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
    // Siren: two-tone square, toggled by timer in setSiren.
    this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'square'; this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master); this.sirenOsc.start();
    this._sirenPhase = 0;
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; return this.muted; }
  setEngine(speed01, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.09 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 140, t, 0.1);
  }
  setSiren(on) {
    if (!this.ctx) return;
    this.sirenOn = on;
    this.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.15);
  }
  sirenTick(dt) {
    if (!this.ctx || !this.sirenOn) return;
    this._sirenPhase += dt;
    this.sirenOsc.frequency.value = (Math.floor(this._sirenPhase * 2) % 2 === 0) ? 700 : 950;
  }
  _noise(dur, freq, gainVal) {
    if (!this.ctx || this.muted) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = gainVal;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  }
  _tone(freq, dur, type, gainVal, slideTo) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  shot() { this._noise(0.14, 1800, 0.5); this._tone(160, 0.1, 'square', 0.25, 60); }
  enemyShot() { this._noise(0.1, 1200, 0.22); }
  chime() { this._tone(880, 0.12, 'sine', 0.3); setTimeout(() => this._tone(1320, 0.18, 'sine', 0.3), 90); }
  sting() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'triangle', 0.28), i * 110)); }
  fail() { this._tone(220, 0.4, 'sawtooth', 0.25, 110); }
  punch() { this._noise(0.08, 900, 0.35); }
  crash() { this._noise(0.25, 500, 0.5); }
}
