// SOLPORT — audio.js (retry session, 19 Nov 2026)
// WebAudio synth only: no audio files, everything is generated.
// Engine hum, gunshot noise, two-tone siren, pickup chime, mission sting.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenTimer = null;
    this.sirenOn = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // Engine: low sawtooth through a low-pass, gain follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filt).connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
      // A hidden tab must not keep the siren interval (or the engine)
      // running unheard: suspend the context, resume when visible again.
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend();
        else if (this.ctx.state === 'suspended') this.ctx.resume();
      });
    } catch (e) { this.ctx = null; }
  }

  setEngine(speedNorm, driving) {
    if (!this.ctx || !this.engineOsc || this.muted) {
      if (this.engineGain) this.engineGain.gain.value = 0;
      return;
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 140, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.03 + speedNorm * 0.05 : 0, t, 0.1);
  }

  _noise(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start();
  }

  _tone(freq, dur, vol, type = 'sine', when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot() { this._noise(0.14, 0.5, 1800); this._tone(160, 0.08, 0.25, 'square'); }
  punch() { this._noise(0.08, 0.3, 900); }
  // Short UI click for menu buttons (created lazily; silent until ensure()).
  uiClick() { this._tone(660, 0.06, 0.12, 'triangle'); }
  chime() { this._tone(880, 0.12, 0.2); this._tone(1318, 0.22, 0.2, 'sine', 0.1); }
  sting() { // mission complete: rising arpeggio
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 0.22, 'triangle', i * 0.09));
  }
  fail() { [330, 262, 196].forEach((f, i) => this._tone(f, 0.25, 0.2, 'sawtooth', i * 0.12)); }
  crash() { this._noise(0.25, 0.5, 500); }

  siren(start) {
    if (!this.ctx) return;
    if (start && !this.sirenTimer) {
      let hi = false;
      this.sirenTimer = setInterval(() => {
        if (this.muted) return;
        this._tone(hi ? 960 : 720, 0.32, 0.05, 'sine');
        hi = !hi;
      }, 340);
      this.sirenOn = true;
    } else if (!start && this.sirenTimer) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      this.sirenOn = false;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.engineGain) this.engineGain.gain.value = 0;
    if (this.muted) this.siren(false);
    return this.muted;
  }
}
