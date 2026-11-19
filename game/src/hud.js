// SOLPORT — hud.js (retry session, 19 Nov 2026)
// DOM HUD: health + cash, wanted stars, minimap canvas (roads, player
// arrow, mission marker, police blips, packages), objective line,
// speedometer, centre banners, start/pause/wasted/busted screens.

import { CONFIG } from './config.js';

export class HUD {
  constructor() {
    this.el = {
      health: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      objective: document.getElementById('objective-text'),
      speed: document.getElementById('speed'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('banner-title'),
      bannerSub: document.getElementById('banner-sub'),
      flash: document.getElementById('flash'),
      menu: document.getElementById('menu'),
      pause: document.getElementById('pause'),
      end: document.getElementById('end'),
      endTitle: document.getElementById('end-title'),
      endSub: document.getElementById('end-sub'),
      minimap: document.getElementById('minimap'),
      respect: document.getElementById('respect'),
      weapon: document.getElementById('weapon'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this._bannerTimer = 0;
    this._flashTimer = 0;
  }

  showMenu() {
    this.el.menu.classList.remove('hidden');
    this.el.pause.classList.add('hidden');
    this.el.end.classList.add('hidden');
  }
  hideMenu() { this.el.menu.classList.add('hidden'); }
  showPause(show) { this.el.pause.classList.toggle('hidden', !show); }
  showEnd(title, sub) {
    this.el.endTitle.textContent = title;
    this.el.endSub.textContent = sub;
    this.el.end.classList.remove('hidden');
  }
  hideEnd() { this.el.end.classList.add('hidden'); }

  banner(title, sub, seconds = 4) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.classList.remove('hidden');
    this._bannerTimer = seconds;
  }

  flash(text) {
    this.el.flash.textContent = text;
    this.el.flash.classList.remove('hidden');
    this._flashTimer = 2.5;
  }

  update(dt, S) {
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.el.banner.classList.add('hidden');
    }
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) this.el.flash.classList.add('hidden');
    }
    const hp = Math.max(0, Math.round(S.player.hp));
    this.el.health.style.width = `${hp}%`;
    this.el.healthText.textContent = `HP ${hp}`;
    this.el.cash.textContent = `$${S.cash.toLocaleString()}`;
    this.el.respect.textContent = `Respect ${S.saveData.respect}  •  Packages ${S.saveData.packages.length}/10`;
    this.el.stars.textContent = '★'.repeat(S.wanted) + '☆'.repeat(5 - S.wanted);
    this.el.stars.style.color = S.wanted > 0 ? '#ff4444' : '#888888';
    this.el.objective.textContent = S.missions.label();
    const wname = S.player.weapon === 'fists' ? 'Fists' : S.player.weapon.toUpperCase();
    const ammo = S.player.weapon === 'fists' ? '∞' : (S.player.ammo[S.player.weapon] || 0);
    this.el.weapon.textContent = `${wname} • ${ammo}`;
    if (S.car && !S.player.onFoot) {
      this.el.speed.classList.remove('hidden');
      this.el.speed.textContent = `${Math.round(Math.abs(S.car.speed) * 3.2)} mph`;
    } else {
      this.el.speed.classList.add('hidden');
    }
    this._drawMinimap(S);
  }

  _drawMinimap(S) {
    const ctx = this.mapCtx;
    const W = 170, H = 170;
    const scale = W / 420; // world -210..210 -> 0..170
    const toX = (x) => (x + 210) * scale;
    const toY = (z) => (z + 210) * scale;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(12,18,28,0.85)';
    ctx.fillRect(0, 0, W, H);
    // Water west edge.
    ctx.fillStyle = '#2a7fa8';
    ctx.fillRect(0, 0, 8, H);
    // Roads.
    ctx.strokeStyle = '#555c66';
    ctx.lineWidth = 3;
    for (let v = -160; v <= 160; v += 40) {
      ctx.beginPath(); ctx.moveTo(toX(-200), toY(v)); ctx.lineTo(toX(200), toY(v)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(v), toY(-200)); ctx.lineTo(toX(v), toY(200)); ctx.stroke();
    }
    // Sun-packages.
    ctx.fillStyle = '#ffd23c';
    for (const [x, z] of S.packageSpots) {
      if (S.saveData.packages.includes(`${x},${z}`)) continue;
      ctx.beginPath(); ctx.arc(toX(x), toY(z), 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Mission marker.
    if (S.missions.objective) {
      const o = S.missions.objective;
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath(); ctx.arc(toX(o.x), toY(o.z), 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(toX(o.x), toY(o.z), 8, 0, Math.PI * 2); ctx.stroke();
    }
    // Police blips.
    ctx.fillStyle = '#ff4444';
    for (const c of S.police.cars) {
      ctx.beginPath(); ctx.arc(toX(c.x), toY(c.z), 3, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const px = toX(S.player.x), py = toY(S.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-S.player.angle + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    void CONFIG;
  }
}
