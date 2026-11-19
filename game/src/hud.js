// SOLPORT HUD: DOM overlay — health/cash, wanted stars, minimap canvas,
// objective + prompts, speedometer, banners, menus (start / pause / end).
import { fmtCash, fmtTime } from './utils.js';

export class HUD {
  constructor(G) {
    this.G = G;
    const el = (id) => document.getElementById(id);
    this.healthFill = el('health-fill'); this.healthText = el('health-text');
    this.cashText = el('cash'); this.respectText = el('respect');
    this.starsEl = el('stars'); this.districtEl = el('district');
    this.objectiveEl = el('objective'); this.promptEl = el('prompt');
    this.speedEl = el('speed'); this.bannerEl = el('banner'); this.bannerTitle = el('banner-title'); this.bannerSub = el('banner-sub');
    this.timerEl = el('timer'); this.bustEl = el('bust'); this.bustFill = el('bust-fill');
    this.menuEl = el('menu'); this.menuTitle = el('menu-title'); this.menuBody = el('menu-body');
    this.map = el('minimap'); this.mapCtx = this.map.getContext('2d');
    this.damageEl = el('damage');
    this._bannerT = 0; this._damageT = 0;
    // Menu buttons are bound once, by data-action, in _bindMenuButtons below.
    this._bindMenuButtons();
  }
  _bindMenuButtons() {
    // Buttons inside the menu share ids across states; rebind by data-action.
    document.querySelectorAll('[data-action]').forEach(b => {
      b.addEventListener('click', () => {
        const a = b.dataset.action;
        if (a === 'start') this.G.startGame(false);
        if (a === 'continue') this.G.startGame(true);
        if (a === 'resume') this.G.resumeGame();
        if (a === 'restart') this.G.restartGame();
        if (a === 'menu') this.G.toMenu();
      });
    });
  }
  showMenu(kind, title, bodyHtml) {
    this.menuEl.classList.remove('hidden');
    this.menuTitle.textContent = title;
    this.menuBody.innerHTML = bodyHtml;
    this.menuEl.dataset.kind = kind;
    // Show only the buttons that fit this menu state.
    document.querySelectorAll('[data-action]').forEach(b => {
      const a = b.dataset.action;
      b.style.display = '';
      if (kind === 'start' && (a === 'resume' || a === 'restart' || a === 'menu')) b.style.display = 'none';
      if (kind === 'pause' && (a === 'start' || a === 'continue' || a === 'restart')) b.style.display = 'none';
      if (kind === 'end' && (a === 'start' || a === 'resume' || a === 'menu')) b.style.display = 'none';
      if (kind === 'start' && a === 'continue' && !this.G.hasSave) b.style.display = 'none';
    });
  }
  hideMenu() { this.menuEl.classList.add('hidden'); }
  showMissionCard(name, intro) {
    this.banner(name, intro);
  }
  banner(title, sub) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub || '';
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.classList.add('show');
    this._bannerT = 4;
  }
  flashDamage() {
    this.damageEl.classList.add('show');
    this._damageT = 0.25;
  }
  setObjective(text) { this.objectiveEl.textContent = text; }
  setPrompt(text) { this.promptEl.textContent = text || ''; }
  setTimer(s) { this.timerEl.textContent = s > 0 ? '⏱ ' + fmtTime(s) : ''; }
  setBust(frac) {
    if (frac > 0) { this.bustEl.classList.remove('hidden'); this.bustFill.style.width = Math.round(frac * 100) + '%'; }
    else this.bustEl.classList.add('hidden');
  }
  update(dt) {
    const G = this.G, P = G.player;
    if (this._bannerT > 0) { this._bannerT -= dt; if (this._bannerT <= 0) this.bannerEl.classList.add('hidden'); }
    if (this._damageT > 0) { this._damageT -= dt; if (this._damageT <= 0) this.damageEl.classList.remove('show'); }
    this.healthFill.style.width = Math.max(0, P.hp) + '%';
    this.healthText.textContent = Math.ceil(Math.max(0, P.hp)) + ' HP';
    this.cashText.textContent = fmtCash(P.cash);
    this.respectText.textContent = 'Respect ' + P.respect;
    this.starsEl.textContent = '★'.repeat(G.police.wanted) + '☆'.repeat(5 - G.police.wanted);
    this.starsEl.classList.toggle('hot', G.police.wanted > 0);
    this.districtEl.textContent = G.city.districtAt(P.x, P.z);
    this.speedEl.textContent = P.inCar ? Math.round(Math.abs(P.car.speed) * 2.4) + ' km/h' : '';
    this.drawMinimap();
  }
  drawMinimap() {
    const G = this.G, c = this.mapCtx, W = this.map.width, H = this.map.height;
    const scale = W / 480;
    const toX = (x) => W / 2 + x * scale, toY = (z) => H / 2 + z * scale;
    c.fillStyle = '#0d1a26'; c.fillRect(0, 0, W, H);
    // Water west.
    c.fillStyle = '#1e6f8f'; c.fillRect(0, 0, toX(-200), H);
    // Roads.
    c.strokeStyle = '#3a3f46'; c.lineWidth = 3;
    for (let v = -198; v <= 198; v += 44) {
      c.beginPath(); c.moveTo(toX(v), 0); c.lineTo(toX(v), H); c.stroke();
      c.beginPath(); c.moveTo(0, toY(v)); c.lineTo(W, toY(v)); c.stroke();
    }
    // Mission marker.
    if (G.city.beacon.visible) {
      const bx = G.city.beacon.position.x, bz = G.city.beacon.position.z;
      c.fillStyle = '#ffd23f';
      c.beginPath(); c.arc(toX(bx), toY(bz), 5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffd23f'; c.beginPath(); c.arc(toX(bx), toY(bz), 9, 0, Math.PI * 2); c.stroke();
    }
    // Taxi fare.
    if (G.taxi && !G.taxi.active) { c.fillStyle = '#2ecc71'; c.fillRect(toX(G.taxi.x) - 3, toY(G.taxi.z) - 3, 6, 6); }
    if (G.taxi && G.taxi.active) { c.fillStyle = '#2ecc71'; c.beginPath(); c.arc(toX(G.taxi.dx), toY(G.taxi.dz), 5, 0, Math.PI * 2); c.fill(); }
    // Police blips.
    c.fillStyle = '#ff4444';
    for (const car of G.police.cars) { c.beginPath(); c.arc(toX(car.x), toY(car.z), 3.5, 0, Math.PI * 2); c.fill(); }
    // Player arrow.
    const px = toX(G.player.x), pz = toY(G.player.z);
    c.save(); c.translate(px, pz); c.rotate(-G.player.yaw + Math.PI);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill();
    c.restore();
  }
}
