// Round candy-cane radar drawn on a 2D canvas. Rotates with the camera so
// camera-forward is always up, sweeps once per stats.radarPingSeconds and
// shows presents (gift-box dots) and crackers (little bon-bons). When nothing
// is in range it softly points the rim toward the nearest treat it could show.
//
// Everything is drawn in a logical 200 x 200 space and scaled to the canvas'
// real pixel size, so it stays crisp on hi-dpi screens and at any CSS size.

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const C = 100; // logical centre
const R_FIELD = 79; // where blips live (range maps to this radius)
const R_DISC = 87; // inner edge of the candy rim
const R_RIM = 98.5; // outer edge of the candy rim
const SWEEP_TRAIL = 1.25; // radians of glowing trail behind the sweep line
const HINT_DELAY = 1.5; // seconds of empty radar before the "this way" hint fades in
const HINT_ICON_R = R_FIELD - 15; // where the little treat icon of the hint sits

const INK = '#21163a';
const GRID = 'rgba(126, 255, 178, 0.17)';
const SWEEP_LINE = '#bfffd6';
const SWEEP_LINE_GOLD = '#ffe9a0';
const RED = '#e63946';
const GOLD = '#ffc94a';
const PRESENT = '#ff5d73';
const RIBBON = '#fff8ec';
const PINK = '#ff8fc7';
const COMMON = '#f4f8ff';
const HOME = '#a8dcf0';
const FONT = '700 11px Fredoka, "Comic Sans MS", system-ui, sans-serif';

const HUES = [];
for (let i = 0; i < 36; i++) HUES.push('hsl(' + i * 10 + ', 95%, 64%)');

const DEFAULT_STATS = {
  radarRange: 25,
  radarShowCrackers: false,
  radarPingSeconds: 3,
  radarRarity: false,
};
const NO_OPTS = {};
const DASH = [2, 5];
const NO_DASH = [];

export function createRadar(canvas) {
  let ctx = null;
  let scale = 1;
  let sizeTimer = 0;
  let clock = 0;
  let prevPhase = -1;
  let pingAge = 9;
  let discGrad = null;
  let sweepGrad = null;
  let sweepGradGold = null;
  let labelText = '';
  let labelW = 0;
  let lastRange = -1;
  let rangeText = '25 m';
  // "this way" hint for an empty radar (world bearing, eased so it glides)
  let emptyFor = 0;
  let hintAlpha = 0;
  let hintBearing = 0;
  let hintFill = PRESENT;
  let hintCracker = false;
  let hintGolden = false;

  const radar = {
    canvas,
    /** set by main.js: radar.onPing = (count) => sfx.play('blip') */
    onPing: null,
    /** false: onPing only fires when at least one blip is on the radar */
    pingAlways: false,
    /** little house marker pointing back to the village square (origin) */
    showHome: true,
    update,
    dispose,
  };

  // ---------- setup ----------

  function getCtx() {
    if (ctx) return ctx;
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    ctx = canvas.getContext('2d');
    if (!ctx) return null;
    discGrad = ctx.createRadialGradient(C, C - 12, 4, C, C, R_DISC);
    discGrad.addColorStop(0, '#1f4d63');
    discGrad.addColorStop(0.55, '#162b59');
    discGrad.addColorStop(1, '#0b1130');
    if (typeof ctx.createConicGradient === 'function') {
      sweepGrad = makeSweepGrad('rgba(120, 255, 170, 0)', 'rgba(120, 255, 170, 0.5)');
      sweepGradGold = makeSweepGrad('rgba(255, 210, 90, 0)', 'rgba(255, 210, 90, 0.55)');
    }
    sizeTimer = 0;
    return ctx;
  }

  function makeSweepGrad(clear, bright) {
    // offsets run clockwise from the sweep line, so the trail sits near 1.0
    const g = ctx.createConicGradient(0, 0, 0);
    g.addColorStop(0, clear);
    g.addColorStop(1 - SWEEP_TRAIL / TAU, clear);
    g.addColorStop(1, bright);
    return g;
  }

  function ensureSize() {
    let css = canvas.clientWidth || 0;
    if (!css && canvas.style) css = parseFloat(canvas.style.width) || 0;
    if (!css) css = 200;
    const dpr =
      typeof window !== 'undefined' && window.devicePixelRatio ? Math.min(3, window.devicePixelRatio) : 1;
    const px = Math.max(16, Math.round(css * dpr));
    if (canvas.width !== px) canvas.width = px;
    if (canvas.height !== px) canvas.height = px;
    scale = px / 200;
    // re-measure the range label now and then: the first measure can happen
    // before the Fredoka web font has loaded, leaving the pill the wrong width
    labelText = '';
  }

  // ---------- small drawing helpers (no allocations) ----------

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function drawPresent(x, y, s, fill, ribbon) {
    const hs = s * 0.5;
    const br = s * 0.25;
    const bx = s * 0.25;
    const by = y - hs - s * 0.1;
    // ink outline (box + bow loops)
    ctx.fillStyle = INK;
    rr(x - hs - 1.5, y - hs - 1.5, s + 3, s + 3, 2.8);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - bx, by, br + 1.5, 0, TAU);
    ctx.moveTo(x + bx + br + 1.5, by);
    ctx.arc(x + bx, by, br + 1.5, 0, TAU);
    ctx.fill();
    // box
    ctx.fillStyle = fill;
    rr(x - hs, y - hs, s, s, 1.7);
    ctx.fill();
    // ribbon cross + bow
    ctx.fillStyle = ribbon;
    ctx.fillRect(x - s * 0.13, y - hs, s * 0.26, s);
    ctx.fillRect(x - hs, y - s * 0.13, s, s * 0.26);
    ctx.beginPath();
    ctx.arc(x - bx, by, br, 0, TAU);
    ctx.moveTo(x + bx + br, by);
    ctx.arc(x + bx, by, br, 0, TAU);
    ctx.fill();
  }

  function crackerPath(s) {
    const bw = s * 0.55;
    const bh = s * 0.3;
    const ew = s * 0.42;
    const eh = s * 0.4;
    ctx.beginPath();
    ctx.moveTo(-bw, -bh);
    ctx.lineTo(bw, -bh);
    ctx.lineTo(bw + ew, -eh);
    ctx.lineTo(bw + ew, eh);
    ctx.lineTo(bw, bh);
    ctx.lineTo(-bw, bh);
    ctx.lineTo(-bw - ew, eh);
    ctx.lineTo(-bw - ew, -eh);
    ctx.closePath();
  }

  function drawCracker(x, y, s, fill, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.4);
    crackerPath(s);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
    // twisted-neck bands
    ctx.globalAlpha = alpha * 0.45;
    ctx.fillStyle = INK;
    const bw = s * 0.55;
    const bh = s * 0.3;
    ctx.fillRect(-bw, -bh, 1.2, bh * 2);
    ctx.fillRect(bw - 1.2, -bh, 1.2, bh * 2);
    ctx.restore();
    ctx.globalAlpha = alpha;
  }

  function drawSparkle(x, y, r, rot, color) {
    ctx.beginPath();
    for (let j = 0; j < 8; j++) {
      const a = rot + j * (Math.PI / 4);
      const rad = j % 2 ? r * 0.32 : r;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawRimArrow(theta, fill, out) {
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(theta);
    if (out) ctx.translate(0, -out);
    ctx.beginPath();
    ctx.moveTo(0, -R_FIELD - 5);
    ctx.lineTo(5.5, -R_FIELD + 4);
    ctx.lineTo(-5.5, -R_FIELD + 4);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  // Nothing in range: a soft glow on the inside of the rim, a gently bobbing
  // arrow and a tiny treat icon toward the nearest one. Fainter than a real
  // blip (and no distance) so the Compass Star upgrade is still worth buying.
  function drawHint(theta, t, sweep, a) {
    let delta = (sweep - theta) % TAU;
    if (delta < 0) delta += TAU;
    const flare = delta < 0.6 ? 1 - delta / 0.6 : 0; // sweep passing over it
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    const ang = theta - HALF_PI;
    ctx.globalAlpha = a * (0.16 + 0.14 * pulse + 0.3 * flare);
    ctx.strokeStyle = hintFill;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(C, C, R_DISC - 4.5, ang - 0.3, ang + 0.3);
    ctx.stroke();
    const ia = a * (0.5 + 0.2 * pulse + 0.3 * flare);
    ctx.globalAlpha = ia;
    drawRimArrow(theta, hintFill, 1.6 * pulse);
    const ix = C + Math.sin(theta) * HINT_ICON_R;
    const iy = C - Math.cos(theta) * HINT_ICON_R;
    if (hintCracker) drawCracker(ix, iy, 5, hintFill, ia);
    else drawPresent(ix, iy, 5.4, hintFill, hintGolden ? RED : RIBBON);
    ctx.globalAlpha = 1;
  }

  function blipFill(it, i, rarity, hueBase) {
    if (it.type === 'cracker') {
      if (!rarity) return PINK;
      if (it.rarity === 'legendary') return HUES[(hueBase + i * 4) % 36];
      if (it.rarity === 'rare') return GOLD;
      return COMMON;
    }
    return it.golden ? GOLD : PRESENT;
  }

  function drawHouse(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.78);
    ctx.lineTo(x + s * 0.66, y - s * 0.1);
    ctx.lineTo(x + s * 0.46, y - s * 0.1);
    ctx.lineTo(x + s * 0.46, y + s * 0.55);
    ctx.lineTo(x - s * 0.46, y + s * 0.55);
    ctx.lineTo(x - s * 0.46, y - s * 0.1);
    ctx.lineTo(x - s * 0.66, y - s * 0.1);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = HOME;
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.fillRect(x - s * 0.13, y + s * 0.12, s * 0.26, s * 0.43);
  }

  function drawPip(t) {
    const bob = Math.sin(t * 4) * 0.6;
    const y = C + bob;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(C, C, 12.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    // beak (points to camera-forward = up)
    ctx.beginPath();
    ctx.moveTo(C, y - 11);
    ctx.lineTo(C + 3.4, y - 5.5);
    ctx.lineTo(C - 3.4, y - 5.5);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#ff9a3c';
    ctx.fill();
    // body
    ctx.beginPath();
    ctx.arc(C, y + 1, 7.5, 0, TAU);
    ctx.fillStyle = '#1c1830';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#f4f8ff';
    ctx.stroke();
    // tummy / face
    ctx.beginPath();
    ctx.ellipse(C, y + 2.2, 4.6, 4.9, 0, 0, TAU);
    ctx.fillStyle = '#f4f8ff';
    ctx.fill();
    // eyes + cheeks
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(C - 2, y - 0.4, 1.1, 0, TAU);
    ctx.moveTo(C + 3.1, y - 0.4);
    ctx.arc(C + 2, y - 0.4, 1.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = PINK;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(C - 3.3, y + 1.8, 1, 0, TAU);
    ctx.moveTo(C + 4.3, y + 1.8);
    ctx.arc(C + 3.3, y + 1.8, 1, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawRim(t, reveal, hueBase) {
    // white candy base
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(C, C, R_RIM, 0, TAU);
    ctx.arc(C, C, R_DISC, 0, TAU, true);
    ctx.fill();
    // slanted stripes
    const N = 22;
    const seg = TAU / N;
    const w = seg * 0.5;
    const twist = 0.17;
    const rot = t * 0.3 - HALF_PI;
    if (!reveal) ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const a0 = rot + k * seg;
      if (reveal) ctx.beginPath();
      ctx.moveTo(C + Math.cos(a0) * R_DISC, C + Math.sin(a0) * R_DISC);
      ctx.lineTo(C + Math.cos(a0 + w) * R_DISC, C + Math.sin(a0 + w) * R_DISC);
      ctx.lineTo(C + Math.cos(a0 + w + twist) * R_RIM, C + Math.sin(a0 + w + twist) * R_RIM);
      ctx.lineTo(C + Math.cos(a0 + twist) * R_RIM, C + Math.sin(a0 + twist) * R_RIM);
      ctx.closePath();
      if (reveal) {
        ctx.fillStyle = HUES[(hueBase + k * 5) % 36];
        ctx.fill();
      }
    }
    if (!reveal) {
      ctx.fillStyle = RED;
      ctx.fill();
    }
    // outlines
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(C, C, R_RIM - 1.1, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(C, C, R_DISC, 0, TAU);
    ctx.stroke();
    // "forward" notch at the top
    ctx.beginPath();
    ctx.moveTo(C - 7, C - R_RIM + 1.5);
    ctx.lineTo(C + 7, C - R_RIM + 1.5);
    ctx.lineTo(C, C - R_DISC + 7);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.fill();
  }

  function drawLabel(text, reveal) {
    ctx.font = FONT;
    if (text !== labelText) {
      labelText = text;
      labelW = ctx.measureText(text).width;
    }
    const w = labelW + 14;
    const y = C + 60;
    rr(C - w / 2, y - 8, w, 16, 8);
    ctx.fillStyle = 'rgba(8, 12, 34, 0.8)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = reveal ? 'rgba(255, 220, 120, 0.8)' : 'rgba(185, 255, 210, 0.45)';
    ctx.stroke();
    ctx.fillStyle = reveal ? '#ffe9a0' : '#c8ffdc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, C, y + 0.5);
  }

  // ---------- per-frame ----------

  function update(dt, opts) {
    if (!getCtx()) return;
    const o = opts || NO_OPTS;
    dt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;

    sizeTimer -= dt;
    if (sizeTimer <= 0) {
      ensureSize();
      sizeTimer = 0.5;
    }

    const stats = o.stats || DEFAULT_STATS;
    const reveal = !!o.revealAll;
    const range = Math.max(1, Number(stats.radarRange) || 25);
    const period = Math.max(0.25, Number(stats.radarPingSeconds) || 3);
    const showCrackers = reveal || !!stats.radarShowCrackers;
    const rarity = !!stats.radarRarity;
    const yaw = Number.isFinite(o.yaw) ? o.yaw : 0;
    const t = Number.isFinite(o.time) ? o.time : (clock += dt);
    const p = o.playerPos;
    const items = o.items;

    if (range !== lastRange) {
      lastRange = range;
      rangeText = Math.round(range) + ' m';
    }

    // sweep phase + revolution detection
    const phase = (((t / period) % 1) + 1) % 1;
    const sweep = phase * TAU;
    const wrapped = prevPhase >= 0 && phase + 0.5 < prevPhase;
    prevPhase = phase;
    if (wrapped) pingAge = 0;
    else pingAge += dt;

    const hueBase = Math.floor(t * 18) % 36;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, 200, 200);
    ctx.globalAlpha = 1;
    ctx.setLineDash(NO_DASH);

    // disc
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.arc(C, C, R_DISC + 1, 0, TAU);
    ctx.fill();
    if (reveal) {
      ctx.globalAlpha = 0.1 + 0.07 * Math.sin(t * 5);
      ctx.fillStyle = GOLD;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // grid
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(C, C, R_FIELD / 3, 0, TAU);
    ctx.moveTo(C + (R_FIELD * 2) / 3, C);
    ctx.arc(C, C, (R_FIELD * 2) / 3, 0, TAU);
    ctx.moveTo(C - R_FIELD, C);
    ctx.lineTo(C + R_FIELD, C);
    ctx.moveTo(C, C - R_FIELD);
    ctx.lineTo(C, C + R_FIELD);
    ctx.stroke();
    ctx.setLineDash(DASH);
    ctx.beginPath();
    ctx.arc(C, C, R_FIELD, 0, TAU);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);

    // camera view cone
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#b4ffd0';
    ctx.beginPath();
    ctx.moveTo(C, C);
    ctx.arc(C, C, R_FIELD, -HALF_PI - 0.55, -HALF_PI + 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // sweep
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(sweep - HALF_PI);
    if (sweepGrad) {
      ctx.fillStyle = reveal ? sweepGradGold : sweepGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R_DISC, -SWEEP_TRAIL, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = reveal ? GOLD : '#78ffaa';
      const slices = 10;
      const step = SWEEP_TRAIL / slices;
      for (let i = 0; i < slices; i++) {
        ctx.globalAlpha = 0.045 * (i + 1);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R_DISC, -SWEEP_TRAIL + i * step, -SWEEP_TRAIL + (i + 1) * step + 0.01);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = reveal ? SWEEP_LINE_GOLD : SWEEP_LINE;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(R_DISC - 2, 0);
    ctx.stroke();
    ctx.restore();

    // ping ripple each revolution
    if (pingAge < 0.9) {
      const k = pingAge / 0.9;
      ctx.globalAlpha = (1 - k) * 0.65;
      ctx.strokeStyle = reveal ? SWEEP_LINE_GOLD : SWEEP_LINE;
      ctx.lineWidth = 0.6 + 2.4 * (1 - k);
      ctx.beginPath();
      ctx.arc(C, C, 10 + k * (R_FIELD - 8), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const sinA = Math.sin(yaw);
    const cosA = Math.cos(yaw);
    const k = R_FIELD / range;

    // home marker (village square / sleigh at the origin)
    if (radar.showHome && p) {
      const dx = -p.x;
      const dz = -p.z;
      const f = dx * sinA + dz * cosA;
      const r = -dx * cosA + dz * sinA;
      const d = Math.sqrt(f * f + r * r);
      if (d > 4) {
        ctx.globalAlpha = 0.9;
        if (d <= range) drawHouse(C + r * k, C - f * k, 9);
        else {
          const s = (R_FIELD - 7) / d;
          drawHouse(C + r * s, C - f * s, 7);
        }
        ctx.globalAlpha = 1;
      }
    }

    // blips
    let visible = 0;
    let hintDist = Infinity; // nearest showable item beyond range (no reveal)
    let hintIdx = -1;
    let hintDx = 0;
    let hintDz = 0;
    if (p && items && items.length) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || it.alive === false || it.opening) continue;
        const isCracker = it.type === 'cracker';
        if (isCracker && !showCrackers) continue;
        const pos = it.position || (it.group && it.group.position);
        if (!pos) continue;
        const dx = pos.x - p.x;
        const dz = pos.z - p.z;
        const f = dx * sinA + dz * cosA;
        const r = -dx * cosA + dz * sinA;
        const dist = Math.sqrt(f * f + r * r);
        const inRange = dist <= range;
        if (!inRange && !reveal) {
          if (dist < hintDist) {
            hintDist = dist;
            hintIdx = i;
            hintDx = dx;
            hintDz = dz;
          }
          continue;
        }
        visible++;

        const theta = Math.atan2(r, f); // clockwise from up
        let delta = (sweep - theta) % TAU;
        if (delta < 0) delta += TAU;
        const alpha = 1 - 0.6 * (delta / TAU);
        const pop = delta < 0.45 ? 1 + 0.6 * (1 - delta / 0.45) : 1;

        const fill = blipFill(it, i, rarity, hueBase);

        ctx.globalAlpha = alpha;
        if (!inRange) {
          drawRimArrow(theta, fill);
          continue;
        }
        const x = C + r * k;
        const y = C - f * k;
        if (isCracker) {
          drawCracker(x, y, 7.2 * pop, fill, alpha);
          if (rarity && it.rarity === 'legendary') {
            drawSparkle(x + 6, y - 6, 3.4 + Math.sin(t * 7 + i) * 1.2, t * 2, '#ffffff');
          }
        } else if (it.golden) {
          ctx.globalAlpha = alpha * (0.22 + 0.1 * Math.sin(t * 6));
          ctx.fillStyle = GOLD;
          ctx.beginPath();
          ctx.arc(x, y, 12 * pop, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = alpha;
          drawPresent(x, y, 8.6 * pop, GOLD, RED);
          drawSparkle(x + 7, y - 7, 3.6 + Math.sin(t * 8 + i) * 1.4, t * 1.5, '#ffffff');
        } else {
          drawPresent(x, y, (it.mini ? 5.2 : 7) * pop, PRESENT, RIBBON);
        }
      }
    }
    ctx.globalAlpha = 1;

    // "this way" hint: an empty radar gives a new player no clue where to go,
    // so after a moment it softly points at the nearest treat it could show
    const wantHint = !reveal && visible === 0 && hintIdx >= 0;
    if (wantHint) emptyFor += dt;
    else emptyFor = 0;
    const hintTarget = wantHint && emptyFor >= HINT_DELAY ? 1 : 0;
    hintAlpha += (hintTarget - hintAlpha) * Math.min(1, dt * 3);
    if (hintAlpha < 0.005) hintAlpha = 0;
    if (hintIdx >= 0) {
      // ease the world bearing (not the radar angle) so camera turns stay snappy
      const b = Math.atan2(hintDx, hintDz);
      if (hintAlpha === 0) hintBearing = b;
      else {
        let d = (b - hintBearing) % TAU;
        if (d > Math.PI) d -= TAU;
        else if (d < -Math.PI) d += TAU;
        hintBearing = (hintBearing + d * Math.min(1, dt * 5)) % TAU;
      }
      const hi = items[hintIdx];
      hintFill = blipFill(hi, hintIdx, rarity, hueBase);
      hintCracker = hi.type === 'cracker';
      hintGolden = !hintCracker && !!hi.golden;
    }
    if (hintAlpha > 0) drawHint(yaw - hintBearing, t, sweep, hintAlpha);

    drawPip(t);

    if (reveal) {
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 6);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(C, C, R_DISC - 3, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    drawRim(t, reveal, hueBase);
    drawLabel(reveal ? '✨ ALL ✨' : rangeText, reveal);

    if (wrapped && (visible > 0 || radar.pingAlways) && typeof radar.onPing === 'function') {
      try {
        radar.onPing(visible);
      } catch (err) {
        console.warn('radar.onPing failed', err);
      }
    }
  }

  function dispose() {
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    ctx = null;
    radar.onPing = null;
  }

  return radar;
}
