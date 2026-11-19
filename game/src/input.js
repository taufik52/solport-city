// Keyboard + mouse input for SOLPORT. Pointer lock orbits the third-person
// camera; drag also works when lock is unavailable (e.g. in screenshots).
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.clicked = false; this.clickX = 0; this.clickY = 0;
    this.locked = false; this.dragging = false;
    this.pressed = new Set(); // edge-triggered keys, consumed each frame
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch (_) { /* drag fallback */ } }
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
      else if (this.dragging) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true; this.clicked = true; this.clickX = e.clientX; this.clickY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  consumeMouse() { const dx = this.mouseDX, dy = this.mouseDY; this.mouseDX = 0; this.mouseDY = 0; return [dx, dy]; }
  consumeClick() { const c = this.clicked; this.clicked = false; return c; }
  endFrame() { this.pressed.clear(); }
}
