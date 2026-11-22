// SOLPORT — input.js (retry session, 19 Nov 2026)
// Keyboard + mouse state. Click-to-shoot uses a queued flag consumed once
// per frame; drag orbits the third-person camera (no pointer lock needed,
// so screenshots and casual play both work).

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clickQueued = false;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._pressed = new Set(); // edge-triggered keys, consumed per frame

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      // Held-key auto-repeat must not re-trigger edge actions (pause, E, F…).
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this._pressed.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this._dragging = false; });

    canvas.addEventListener('mousedown', (e) => {
      this._dragging = true; this._lastX = e.clientX; this._lastY = e.clientY;
      if (e.button === 0) this.clickQueued = true;
    });
    // Right-drag orbits the camera too; never pop the browser menu mid-game.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mouseup', () => { this._dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      this.mouseDX += e.clientX - this._lastX;
      this.mouseDY += e.clientY - this._lastY;
      this._lastX = e.clientX; this._lastY = e.clientY;
    });
  }

  down(k) { return this.keys.has(k); }
  // True once on the frame the key went down.
  pressed(k) { return this._pressed.has(k); }
  endFrame() {
    this.mouseDX = 0; this.mouseDY = 0;
    this.clickQueued = false;
    this._pressed.clear();
  }
}
