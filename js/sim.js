// Headless simulation core: structure-of-arrays, spatial hashing, fixed timestep.
import { UNITS, NT, T, ATK, MULT, PREF, CHARGE, DT, ARENA, SIEGE_MELEE_DMG, HP_SCALE, SK } from './units.js?v=2026111104';
import { RNG } from './rng.js?v=2026111104';

const F = (k) => Float32Array.from(UNITS.map((u) => u[k]));
const HP = F('hp').map((v) => v * HP_SCALE), DMG = F('dmg'), CD = F('cd'), RANGE = F('range'), MINR = F('minRange');
const SPEED = F('speed'), R = F('r'), ARMOR = F('armor'), PIERCE = F('pierce'), SPLASH = F('splash');
const KIND = Uint8Array.from(UNITS.map((u) => u.atk));
const MASS = Float32Array.from(UNITS.map((u) => u.r * u.r));
const COST = Float32Array.from(UNITS.map((u) => u.cost));
const MINPREF = Math.min(...PREF.flat());

const MAXPUSH = 2.5, RETARGET = 12, MAXRING = 6, SEP = 0.8, STIFF = 0.5, ACCEL = 0.3;
const CELL = 25, TCELL = 50;
export const EVCAP = 6000;
export const EV = { DEATH: 0, HIT: 1, SPLASH: 2, SHOT: 3 };
export const PCAP = 4000;
const ARROW_SPEED = 380, BOULDER_SPEED = 210, MAX_TIME = 300;

function makeGrid(cell, cap) {
  const cols = Math.ceil(ARENA.w / cell), rows = Math.ceil(ARENA.h / cell);
  return { cell, cols, rows, start: new Int32Array(cols * rows + 2), fill: new Int32Array(cols * rows + 2), items: new Int32Array(cap), cellOf: new Int32Array(cap) };
}
function buildGrid(g, ids, n, xs, ys) {
  const { cell, cols, rows, start, fill, items, cellOf } = g;
  start.fill(0);
  for (let k = 0; k < n; k++) {
    const i = ids[k];
    let cx = (xs[i] / cell) | 0, cy = (ys[i] / cell) | 0;
    cx = cx < 0 ? 0 : cx >= cols ? cols - 1 : cx;
    cy = cy < 0 ? 0 : cy >= rows ? rows - 1 : cy;
    const c = cy * cols + cx;
    cellOf[k] = c;
    start[c + 1]++;
  }
  const nc = cols * rows;
  for (let c = 0; c < nc; c++) start[c + 1] += start[c];
  fill.set(start);
  for (let k = 0; k < n; k++) items[fill[cellOf[k]]++] = ids[k];
}

export class Sim {
  constructor({ cap = 3200, seed = 1, events = true } = {}) {
    this.cap = cap; this.seed = seed; this.rng = new RNG(seed);
    this.w = ARENA.w; this.h = ARENA.h;
    this.emitEvents = events;
    this.n = 0; this.tick = 0; this.time = 0; this.over = false; this.winner = -1;
    this.x = new Float32Array(cap); this.y = new Float32Array(cap);
    this.px = new Float32Array(cap); this.py = new Float32Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap);
    this.hp = new Float32Array(cap); this.cd = new Float32Array(cap); this.chg = new Float32Array(cap);
    this.ang = new Float32Array(cap);
    this.rt = new Float32Array(cap); this.ct = new Float32Array(cap); this.rally = [0, 0]; // commander skills: rally / charge timers per unit, rally point
    this.fxPts = new Float32Array(160); this.fxN = 0; // sampled unit positions of the last skill cast (for effects)
    this.type = new Uint8Array(cap); this.team = new Uint8Array(cap); this.alive = new Uint8Array(cap);
    this.flash = new Uint8Array(cap); this.phase = new Uint8Array(cap); this.tgt = new Int32Array(cap).fill(-1);
    this.ord = new Int32Array(cap); this.nOrd = 0;
    this.tl = [new Int32Array(cap), new Int32Array(cap)]; this.tn = [0, 0];
    this.cnt = new Int32Array(2 * NT); this.cnt0 = new Int32Array(2 * NT);
    this.cx = [0, 0]; this.cy = [0, 0];
    this.g = makeGrid(CELL, cap); this.tg = [makeGrid(TCELL, cap), makeGrid(TCELL, cap)];
    this.mods = [null, null]; // per-team upgrade modifiers (upgrades.js buildMods); null = base balance
    this.adj = new Uint8Array(cap); // shield wall: square with a friendly square touching
    this.blocked = null; // hook: Uint8Array over a coarse grid (terrain, later rounds)
    // projectiles (pooled)
    this.pn = 0;
    this.pAlive = new Uint8Array(PCAP); this.pKind = new Uint8Array(PCAP); this.pTeam = new Uint8Array(PCAP); this.pSrc = new Uint8Array(PCAP);
    this.pX = new Float32Array(PCAP); this.pY = new Float32Array(PCAP); this.pPX = new Float32Array(PCAP); this.pPY = new Float32Array(PCAP);
    this.pVX = new Float32Array(PCAP); this.pVY = new Float32Array(PCAP);
    this.pTX = new Float32Array(PCAP); this.pTY = new Float32Array(PCAP);
    this.pT = new Float32Array(PCAP); this.pDur = new Float32Array(PCAP); this.pX0 = new Float32Array(PCAP); this.pY0 = new Float32Array(PCAP);
    this.pTgt = new Int32Array(PCAP); this.pMul = new Float32Array(PCAP);
    this.pFree = new Int32Array(PCAP); this.pFreeN = 0; this.pHigh = 0;
    // render events
    this.evN = 0; this.evKind = new Uint8Array(EVCAP); this.evX = new Float32Array(EVCAP); this.evY = new Float32Array(EVCAP);
    this.evA = new Uint8Array(EVCAP); this.evB = new Float32Array(EVCAP);
  }

  setMods(team, m) { this.mods[team] = m; }

  spawn(team, type, x, y) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = this.px[i] = x; this.y[i] = this.py[i] = y;
    this.vx[i] = this.vy[i] = 0;
    this.type[i] = type; this.team[i] = team; this.alive[i] = 1;
    this.hp[i] = HP[type] * (this.mods[team] ? this.mods[team].hp[type] : 1); this.cd[i] = this.rng.next() * CD[type]; this.chg[i] = 0;
    this.tgt[i] = -1; this.rt[i] = this.ct[i] = 0; this.flash[i] = 0; this.phase[i] = this.rng.int(RETARGET); this.ang[i] = team === 0 ? 0 : Math.PI;
    this.cnt[team * NT + type]++; this.cnt0[team * NT + type]++;
    return i;
  }

  count(team) { let s = 0; for (let t = 0; t < NT; t++) s += this.cnt[team * NT + t]; return s; }
  value(team, initial) { const c = initial ? this.cnt0 : this.cnt; let s = 0; for (let t = 0; t < NT; t++) s += c[team * NT + t] * COST[t]; return s; }
  hpTotal(team) { let s = 0; for (let i = 0; i < this.n; i++) if (this.alive[i] && this.team[i] === team) s += this.hp[i]; return s; }

  ev(kind, x, y, a, b) {
    if (!this.emitEvents || this.evN >= EVCAP) return;
    const k = this.evN++;
    this.evKind[k] = kind; this.evX[k] = x; this.evY[k] = y; this.evA[k] = a; this.evB[k] = b;
  }

  kill(i) {
    this.alive[i] = 0; this.hp[i] = 0;
    this.cnt[this.team[i] * NT + this.type[i]]--;
    this.ev(EV.DEATH, this.x[i], this.y[i], this.team[i], this.type[i]);
  }

  // Damage with counter table, armor and optional charge bonus.
  hurt(i, srcType, base, bonus) {
    if (!this.alive[i]) return;
    const dt = this.type[i];
    let d = base * MULT[srcType][dt] * (1 - ARMOR[dt] * (1 - PIERCE[srcType])) * bonus;
    const am = this.mods[1 - this.team[i]], dm = this.mods[this.team[i]];
    if (am && srcType === T.ARCHER && dt === T.SQUARE) d *= am.vsSquare;
    if (dm && dm.wall && dt === T.SQUARE && this.adj[i]) d *= 1 - dm.wall;
    this.hp[i] -= d; this.flash[i] = 4;
    if (this.hp[i] <= 0) this.kill(i);
  }

  findTarget(i) {
    const team = this.team[i], et = 1 - team;
    if (this.tn[et] === 0) return -1;
    const g = this.tg[et], { cols, rows, cell, start, items } = g;
    const x = this.x[i], y = this.y[i], pref = PREF[this.type[i]], type = this.type, X = this.x, Y = this.y;
    let cx = (x / cell) | 0, cy = (y / cell) | 0;
    cx = cx < 0 ? 0 : cx >= cols ? cols - 1 : cx; cy = cy < 0 ? 0 : cy >= rows ? rows - 1 : cy;
    let best = -1, bestS = 1e30;
    for (let ring = 0; ring <= MAXRING; ring++) {
      if (best >= 0 && ring > 1) { const md = (ring - 1) * cell; if (md * md * MINPREF > bestS) break; }
      for (let yy = cy - ring; yy <= cy + ring; yy++) {
        if (yy < 0 || yy >= rows) continue;
        const edge = yy === cy - ring || yy === cy + ring;
        const step = edge || ring === 0 ? 1 : ring * 2;
        for (let xx = cx - ring; xx <= cx + ring; xx += step) {
          if (xx < 0 || xx >= cols) continue;
          const c = yy * cols + xx;
          for (let k = start[c], e = start[c + 1]; k < e; k++) {
            const j = items[k];
            if (!this.alive[j]) continue;
            const dx = X[j] - x, dy = Y[j] - y, s = (dx * dx + dy * dy) * pref[type[j]];
            if (s < bestS) { bestS = s; best = j; }
          }
        }
      }
    }
    if (best < 0) { // nothing close: sample random enemies and walk toward the nearest sample
      const list = this.tl[et], n = this.tn[et];
      for (let s = 0; s < 8; s++) {
        const j = list[this.rng.int(n)];
        if (!this.alive[j]) continue;
        const dx = X[j] - x, dy = Y[j] - y, d2 = dx * dx + dy * dy;
        if (d2 < bestS) { bestS = d2; best = j; }
      }
    }
    return best;
  }

  addProjectile(kind, team, src, x, y, tx, ty, tgt, mul = 1) {
    if (this.pn >= PCAP && this.pFreeN === 0) return;
    const p = this.pFreeN > 0 ? this.pFree[--this.pFreeN] : this.pn++;
    this.pAlive[p] = 1; this.pMul[p] = mul; this.pKind[p] = kind; this.pTeam[p] = team; this.pSrc[p] = src;
    this.pX[p] = this.pPX[p] = this.pX0[p] = x; this.pY[p] = this.pPY[p] = this.pY0[p] = y;
    this.pTX[p] = tx; this.pTY[p] = ty; this.pTgt[p] = tgt; this.pT[p] = 0;
    const dx = tx - x, dy = ty - y, d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    const sp = kind === ATK.ARROW ? ARROW_SPEED : BOULDER_SPEED;
    this.pVX[p] = dx / d * sp; this.pVY[p] = dy / d * sp;
    this.pDur[p] = kind === ATK.BOULDER ? Math.max(0.5, d / sp) : 2.5;
    if (p >= this.pHigh) this.pHigh = p + 1;
  }

  // enemy of `team` nearest to (x,y) within rad, via team grid
  nearestEnemyAt(team, x, y, rad) {
    const et = 1 - team, g = this.tg[et], { cols, rows, cell, start, items } = g;
    const c0 = Math.max(0, ((x - rad) / cell) | 0), c1 = Math.min(cols - 1, ((x + rad) / cell) | 0);
    const r0 = Math.max(0, ((y - rad) / cell) | 0), r1 = Math.min(rows - 1, ((y + rad) / cell) | 0);
    let best = -1, bd = rad * rad;
    for (let yy = r0; yy <= r1; yy++) for (let xx = c0; xx <= c1; xx++) {
      const c = yy * cols + xx;
      for (let k = start[c], e = start[c + 1]; k < e; k++) {
        const j = items[k]; if (!this.alive[j]) continue;
        const dx = this.x[j] - x, dy = this.y[j] - y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = j; }
      }
    }
    return best;
  }

  splashAt(team, src, x, y, rad, base) {
    const et = 1 - team, g = this.tg[et], { cols, rows, cell, start, items } = g;
    const c0 = Math.max(0, ((x - rad) / cell) | 0), c1 = Math.min(cols - 1, ((x + rad) / cell) | 0);
    const r0 = Math.max(0, ((y - rad) / cell) | 0), r1 = Math.min(rows - 1, ((y + rad) / cell) | 0);
    for (let yy = r0; yy <= r1; yy++) for (let xx = c0; xx <= c1; xx++) {
      const c = yy * cols + xx;
      for (let k = start[c], e = start[c + 1]; k < e; k++) {
        const j = items[k]; if (!this.alive[j]) continue;
        const dx = this.x[j] - x, dy = this.y[j] - y, d2 = dx * dx + dy * dy;
        if (d2 < rad * rad) this.hurt(j, src, base * (1 - 0.55 * Math.sqrt(d2) / rad), 1);
      }
    }
    this.ev(EV.SPLASH, x, y, team, rad);
  }

  updateProjectiles() {
    for (let p = 0; p < this.pHigh; p++) {
      if (!this.pAlive[p]) continue;
      this.pPX[p] = this.pX[p]; this.pPY[p] = this.pY[p];
      this.pT[p] += DT;
      const team = this.pTeam[p], src = this.pSrc[p];
      if (this.pKind[p] === ATK.BOULDER) {
        const u = Math.min(1, this.pT[p] / this.pDur[p]);
        this.pX[p] = this.pX0[p] + (this.pTX[p] - this.pX0[p]) * u;
        this.pY[p] = this.pY0[p] + (this.pTY[p] - this.pY0[p]) * u;
        const pm = this.mods[team];
        if (u >= 1) { this.splashAt(team, src, this.pTX[p], this.pTY[p], SPLASH[src] * (pm ? pm.splash : 1), DMG[src] * (pm ? pm.dmg[src] : 1) * this.pMul[p]); this.freeP(p); }
      } else {
        const tg = this.pTgt[p];
        if (tg >= 0 && this.alive[tg]) { this.pTX[p] = this.x[tg]; this.pTY[p] = this.y[tg]; }
        const dx = this.pTX[p] - this.pX[p], dy = this.pTY[p] - this.pY[p], d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        const step = ARROW_SPEED * DT;
        if (d <= step + 2) {
          let v = (tg >= 0 && this.alive[tg]) ? tg : this.nearestEnemyAt(team, this.pTX[p], this.pTY[p], 9);
          if (v >= 0) { this.hurt(v, src, DMG[src] * (this.mods[team] ? this.mods[team].dmg[src] : 1) * this.pMul[p], 1); this.ev(EV.HIT, this.x[v], this.y[v], team, 0); }
          this.freeP(p);
        } else {
          this.pVX[p] = dx / d * ARROW_SPEED; this.pVY[p] = dy / d * ARROW_SPEED;
          this.pX[p] += this.pVX[p] * DT; this.pY[p] += this.pVY[p] * DT;
          if (this.pT[p] > this.pDur[p]) this.freeP(p);
        }
      }
    }
  }
  freeP(p) { this.pAlive[p] = 0; this.pFree[this.pFreeN++] = p; }

  // ---- commander skills (player team); each returns the number of affected units and fills fxPts with sample positions ----
  fxAdd(i) { if (this.fxN < 80) { this.fxPts[this.fxN * 2] = this.x[i]; this.fxPts[this.fxN * 2 + 1] = this.y[i]; this.fxN++; } }
  castRally(team, cx, cy, rad = SK.rallyRadius, dur = SK.rallyDur) {
    this.fxN = 0; this.rally[0] = cx; this.rally[1] = cy; let n = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i] || this.team[i] !== team) continue;
      const dx = this.x[i] - cx, dy = this.y[i] - cy;
      if (dx * dx + dy * dy <= rad * rad) { this.rt[i] = dur; n++; if (n % 6 === 1) this.fxAdd(i); }
    }
    return n;
  }
  castVolley(team, mul = 1 + SK.volleyDmg) {
    this.fxN = 0; let n = 0;
    const m = this.mods[team];
    for (let i = 0; i < this.n; i++) {
      const t = this.type[i];
      if (!this.alive[i] || this.team[i] !== team || (t !== T.ARCHER && t !== T.SIEGE)) continue;
      let tg = this.tgt[i];
      if (tg < 0 || !this.alive[tg]) tg = this.findTarget(i);
      if (tg < 0) continue;
      const dx = this.x[tg] - this.x[i], dy = this.y[tg] - this.y[i], d = Math.sqrt(dx * dx + dy * dy), rm = m ? m.rng[t] : 1;
      if (d > RANGE[t] * rm || d < MINR[t]) continue;
      if (t === T.ARCHER) { this.addProjectile(ATK.ARROW, team, t, this.x[i], this.y[i], this.x[tg], this.y[tg], tg, mul); this.ev(EV.SHOT, this.x[i], this.y[i], team, 0); }
      else { const fl = Math.max(0.5, d / BOULDER_SPEED); this.addProjectile(ATK.BOULDER, team, t, this.x[i], this.y[i], this.x[tg] + this.vx[tg] * fl, this.y[tg] + this.vy[tg] * fl, -1, mul); this.ev(EV.SHOT, this.x[i], this.y[i], team, 1); }
      n++; if (n % 4 === 1) this.fxAdd(i);
    }
    return n;
  }
  castCharge(team, dur = SK.chargeDur) {
    this.fxN = 0; let n = 0;
    for (let i = 0; i < this.n; i++) if (this.alive[i] && this.team[i] === team && this.type[i] === T.RIDER) { this.ct[i] = dur; n++; if (n % 3 === 1) this.fxAdd(i); }
    return n;
  }

  step() {
    if (this.over) return;
    const { x, y, px, py, vx, vy, hp, cd, chg, ang, type, team, alive, flash, tgt, rng, rt, ct } = this;
    const nAll = this.n;
    // alive lists + centroids
    let no = 0; this.tn[0] = this.tn[1] = 0;
    let sx0 = 0, sy0 = 0, sx1 = 0, sy1 = 0;
    for (let i = 0; i < nAll; i++) {
      if (!alive[i]) continue;
      this.ord[no++] = i;
      px[i] = x[i]; py[i] = y[i];
      const tm = team[i];
      this.tl[tm][this.tn[tm]++] = i;
      if (tm === 0) { sx0 += x[i]; sy0 += y[i]; } else { sx1 += x[i]; sy1 += y[i]; }
    }
    this.nOrd = no;
    if (this.tn[0] === 0 || this.tn[1] === 0) { this.finish(); return; }
    this.cx[0] = sx0 / this.tn[0]; this.cy[0] = sy0 / this.tn[0]; this.cx[1] = sx1 / this.tn[1]; this.cy[1] = sy1 / this.tn[1];
    buildGrid(this.g, this.ord, no, x, y);
    buildGrid(this.tg[0], this.tl[0], this.tn[0], x, y);
    buildGrid(this.tg[1], this.tl[1], this.tn[1], x, y);
    const g = this.g, gc = g.cols, gr = g.rows, gs = g.start, gi = g.items, gcell = g.cell;
    const tick = this.tick, W = this.w, H = this.h, blocked = this.blocked;

    // random visiting order (Fisher-Yates) so no side/position gets a first-mover edge
    const ordA = this.ord;
    for (let k = no - 1; k > 0; k--) { const j = rng.int(k + 1), tmp = ordA[k]; ordA[k] = ordA[j]; ordA[j] = tmp; }
    for (let o = 0; o < no; o++) {
      const i = ordA[o];
      if (!alive[i]) continue;
      const t = type[i], tm = team[i], m = this.mods[tm];
      let dmgM = m ? m.dmg[t] : 1, spdM = m ? m.spd[t] : 1;
      const rngM = m ? m.rng[t] : 1;
      if (rt[i] > 0) { rt[i] -= DT; spdM += SK.rallySpd; }
      if (ct[i] > 0) { ct[i] -= DT; spdM += SK.chargeSpd; dmgM *= 1 + SK.chargeDmg; }
      if (cd[i] > 0) cd[i] -= DT;
      if (chg[i] > 0) chg[i] -= DT;
      if (flash[i] > 0) flash[i]--;
      let tg = tgt[i];
      if (tg < 0 || !alive[tg] || (this.phase[i] + tick) % RETARGET === 0) { tg = this.findTarget(i); tgt[i] = tg; }
      let dvx = 0, dvy = 0, faceX = 0, faceY = 0;
      if (tg >= 0) {
        const dx = x[tg] - x[i], dy = y[tg] - y[i], d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        const tt = type[tg], contact = R[t] + R[tt] + 1.2;
        let ranged = KIND[t] !== ATK.MELEE, reach;
        if (ranged && d < MINR[t]) ranged = false;
        reach = ranged ? RANGE[t] * rngM * 0.94 : contact;
        faceX = dx / d; faceY = dy / d;
        if (d > reach) { dvx = faceX * SPEED[t] * spdM; dvy = faceY * SPEED[t] * spdM; }
        else if (cd[i] <= 0) {
          cd[i] = CD[t] * (0.9 + 0.2 * rng.next());
          if (!ranged) {
            let bonus = 1;
            if (t === T.RIDER && chg[i] <= 0) { bonus = 1 + (CHARGE.mul - 1) * (1 - CHARGE.resist[tt]) * (m ? m.charge : 1); chg[i] = CHARGE.rearm; }
            this.hurt(tg, t, KIND[t] === ATK.BOULDER ? SIEGE_MELEE_DMG : DMG[t] * dmgM, bonus);
            if (bonus > 1 || (tick + i) % 3 === 0) this.ev(EV.HIT, x[tg], y[tg], tm, bonus > 1 ? 1 : 0);
          } else if (KIND[t] === ATK.ARROW) {
            this.addProjectile(ATK.ARROW, tm, t, x[i], y[i], x[tg], y[tg], tg);
            this.ev(EV.SHOT, x[i], y[i], tm, 0);
          } else {
            const fl = Math.max(0.5, d / BOULDER_SPEED);
            const lx = x[tg] + vx[tg] * fl + rng.range(-9, 9), ly = y[tg] + vy[tg] * fl + rng.range(-9, 9);
            this.addProjectile(ATK.BOULDER, tm, t, x[i], y[i], lx, ly, -1);
            this.ev(EV.SHOT, x[i], y[i], tm, 1);
          }
        }
      }
      if (rt[i] > 0) { // rally: walk to the rally point until close
        const rx = this.rally[0] - x[i], ry = this.rally[1] - y[i], rd = Math.sqrt(rx * rx + ry * ry);
        if (rd > 22) { dvx = rx / rd * SPEED[t] * spdM; dvy = ry / rd * SPEED[t] * spdM; } else { dvx = dvy = 0; }
      }
      vx[i] += (dvx - vx[i]) * ACCEL; vy[i] += (dvy - vy[i]) * ACCEL;
      let nx = x[i] + vx[i] * DT, ny = y[i] + vy[i] * DT;
      // separation (position-based, mass weighted)
      const ri = R[t], mi = MASS[t], nx0 = nx, ny0 = ny;
      let sx = 0, sy = 0, adjF = 0;
      const wallOn = m !== null && m.wall > 0 && t === T.SQUARE;
      let cx = (nx / gcell) | 0, cy = (ny / gcell) | 0;
      cx = cx < 0 ? 0 : cx >= gc ? gc - 1 : cx; cy = cy < 0 ? 0 : cy >= gr ? gr - 1 : cy;
      const ya = cy > 0 ? cy - 1 : 0, yb = cy < gr - 1 ? cy + 1 : gr - 1, xa = cx > 0 ? cx - 1 : 0, xb = cx < gc - 1 ? cx + 1 : gc - 1;
      for (let yy = ya; yy <= yb; yy++) {
        for (let xx = xa; xx <= xb; xx++) {
          const c = yy * gc + xx;
          for (let k = gs[c], e = gs[c + 1]; k < e; k++) {
            const j = gi[k];
            if (j === i || !alive[j]) continue;
            const tj = type[j], md = ri + R[tj] + SEP;
            const ddx = nx0 - x[j], ddy = ny0 - y[j], d2 = ddx * ddx + ddy * ddy;
            if (wallOn && tj === T.SQUARE && team[j] === tm && d2 < (md + 6) * (md + 6)) adjF = 1;
            if (d2 < md * md) {
              if (d2 < 1e-6) { const a = ((i * 7919 + j * 104729) % 628) / 100; sx += Math.cos(a) * 0.3; sy += Math.sin(a) * 0.3; continue; }
              const d = Math.sqrt(d2), push = (md - d) * (MASS[tj] / (mi + MASS[tj])) * STIFF / d;
              sx += ddx * push; sy += ddy * push;
            }
          }
        }
      }
      this.adj[i] = adjF;
      const sl = sx * sx + sy * sy; // order-independent: all pushes are summed from the same start point, then capped
      if (sl > MAXPUSH * MAXPUSH) { const k = MAXPUSH / Math.sqrt(sl); sx *= k; sy *= k; }
      nx += sx; ny += sy;
      const r = ri;
      nx = nx < r ? r : nx > W - r ? W - r : nx; ny = ny < r ? r : ny > H - r ? H - r : ny;
      if (blocked && blocked[((ny / 50) | 0) * 32 + ((nx / 50) | 0)]) { nx = x[i]; ny = y[i]; }
      x[i] = nx; y[i] = ny;
      if (faceX !== 0 || faceY !== 0) ang[i] = Math.atan2(faceY, faceX);
      else if (vx[i] * vx[i] + vy[i] * vy[i] > 4) ang[i] = Math.atan2(vy[i], vx[i]);
    }
    this.updateProjectiles();
    this.tick++; this.time = this.tick * DT;
    if (this.time >= MAX_TIME) this.finish(true);
  }

  finish(timeout) {
    this.over = true;
    const a = this.count(0), b = this.count(1);
    if (a > 0 && b > 0) { const va = this.value(0) , vb = this.value(1); this.winner = va === vb ? -1 : va > vb ? 0 : 1; this.timeout = true; }
    else this.winner = a > 0 ? 0 : b > 0 ? 1 : -1;
  }

  // stars 1-3 by surviving value ratio (used by later rounds)
  stars(team = 0) {
    if (this.winner !== team) return 0;
    const r = this.value(team) / Math.max(1, this.value(team, true));
    return r > 0.66 ? 3 : r > 0.33 ? 2 : 1;
  }
}
