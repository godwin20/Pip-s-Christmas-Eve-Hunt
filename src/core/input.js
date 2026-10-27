// Keyboard, mouse, touch and wheel input for the game canvas.
//
// Keys use KeyboardEvent.code ('KeyW', 'Space', 'ArrowUp', 'ShiftLeft' ...).
// Mouse / touch drags on the canvas orbit the camera (dragDelta), a press that
// moves less than 5 px counts as a click, two-finger pinch zooms (wheelDelta),
// and on touch screens a finger that starts on the left part of the canvas
// becomes a little virtual joystick that feeds moveVector().
//
// Objects returned by moveVector() / dragDelta() / clickPosition() are reused
// between calls: read them straight away, don't keep references.

const PREVENT_KEYS = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const CLICK_SLOP = 5; // px a press may wander and still count as a click
const JOY_RADIUS = 56; // px the joystick knob can travel
const JOY_DEADZONE = 0.12;

const MOVE_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

// Inputs that take typed text. Checkboxes, ranges and buttons don't count, so a
// focused settings toggle never swallows WASD.
const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);

function isTypingTarget(t) {
  if (!t || typeof t !== 'object') return false;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has(String(t.type || 'text').toLowerCase());
  return !!t.isContentEditable;
}

// A focused, visible menu control (button, link, tab, card with tabindex...).
// Keys aimed at it keep their browser meaning (Space/Enter activate, Tab and
// arrows move focus): we neither preventDefault them nor count them as game keys.
const UI_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'OPTION', 'LABEL']);
function isUiTarget(t, canvas) {
  if (!t || typeof t !== 'object' || !t.tagName || t === canvas) return false;
  const tag = t.tagName;
  if (tag === 'BODY' || tag === 'HTML' || tag === 'CANVAS') return false;
  const ui =
    UI_TAGS.has(tag) ||
    !!t.isContentEditable ||
    (typeof t.hasAttribute === 'function' && (t.hasAttribute('tabindex') || t.hasAttribute('role')));
  if (!ui) return false;
  // A detached or hidden control can't be what the player is using; keep
  // swallowing Space there so it can never "click" an invisible button.
  if (t.isConnected === false) return false;
  try {
    if (typeof t.getClientRects === 'function' && t.getClientRects().length === 0) return false;
  } catch {
    /* treat as visible */
  }
  return true;
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export function createInput(canvas, options = {}) {
  const win = typeof window !== 'undefined' ? window : null;
  const doc = typeof document !== 'undefined' ? document : null;
  const useJoystick = options.touchJoystick !== false;
  const joystickZone = typeof options.joystickZone === 'number' ? options.joystickZone : 0.42;

  const held = new Set();
  const pressedSet = new Set();
  let enabled = true;
  let enabledAt = -Infinity; // events stamped before this are ignored (see setEnabled)

  let dragX = 0;
  let dragY = 0;
  let wheel = 0;
  let clickFlag = false;

  // Active drag pointers: id -> { x, y, sx, sy, moved, button, type }
  const pointers = new Map();
  let pinchDist = 0;

  // Virtual joystick (touch only)
  const joy = { id: null, ox: 0, oy: 0, sx: 0, sy: 0, t0: 0, moved: false, x: 0, y: 0, el: null, knob: null };

  // Reused result objects (no per-frame allocations).
  const mv = { x: 0, y: 0 };
  const dd = { dx: 0, dy: 0 };
  const clickPos = { x: 0, y: 0, ndcX: 0, ndcY: 0 };

  if (canvas && canvas.style) {
    // Stop the browser from panning / zooming the page while dragging the camera.
    canvas.style.touchAction = 'none';
  }

  function staleEvent(e) {
    // An event that was already being dispatched when input got re-enabled
    // (e.g. the Escape press that closed the pause menu) must not count again.
    const ts = e && e.timeStamp;
    return typeof ts === 'number' && ts > 0 && ts < 1e11 && ts < enabledAt;
  }

  // ---------------------------------------------------------------- keyboard
  function onKeyDown(e) {
    if (!enabled || staleEvent(e) || isTypingTarget(e.target)) return;
    const code = e.code || e.key;
    if (!code) return;
    // Keys aimed at a focused menu control belong to the menu: Tab moves focus,
    // Space/Enter press the button, and none of them leak into gameplay (e.g.
    // the Space that pressed "Start Night" must not also start a belly slide).
    if (isUiTarget(e.target, canvas)) return;
    if (PREVENT_KEYS.has(code) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
    if (!held.has(code)) {
      held.add(code);
      // Auto-repeat after a re-enable re-adds the held key but is not a new press.
      if (!e.repeat) pressedSet.add(code);
    }
  }

  function onKeyUp(e) {
    const code = e.code || e.key;
    if (!code) return;
    held.delete(code);
    // macOS swallows keyup for other keys while Meta is held.
    if (code === 'MetaLeft' || code === 'MetaRight') held.clear();
  }

  function releaseAll() {
    held.clear();
    pointers.clear();
    pinchDist = 0;
    endJoystick();
  }

  function onVisibility() {
    if (doc && doc.hidden) releaseAll();
  }

  // ---------------------------------------------------------------- joystick
  function ensureJoystickEl() {
    if (joy.el || !doc || !canvas) return;
    try {
      const host = canvas.parentElement || doc.body;
      if (!host) return;
      const ring = doc.createElement('div');
      ring.setAttribute('aria-hidden', 'true');
      Object.assign(ring.style, {
        position: 'absolute',
        left: '0px',
        top: '0px',
        width: JOY_RADIUS * 2 + 'px',
        height: JOY_RADIUS * 2 + 'px',
        marginLeft: -JOY_RADIUS + 'px',
        marginTop: -JOY_RADIUS + 'px',
        borderRadius: '50%',
        border: '4px solid rgba(255,255,255,0.55)',
        background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(168,220,240,0.12) 70%)',
        boxShadow: '0 0 18px rgba(168,220,240,0.35)',
        pointerEvents: 'none',
        display: 'none',
        boxSizing: 'border-box',
      });
      const knob = doc.createElement('div');
      Object.assign(knob.style, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '52px',
        height: '52px',
        marginLeft: '-26px',
        marginTop: '-26px',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #ffd6e0 45%, #e63946 100%)',
        boxShadow: '0 3px 0 rgba(42,27,61,0.35), 0 0 12px rgba(255,255,255,0.5)',
        pointerEvents: 'none',
      });
      ring.appendChild(knob);
      // Right after the canvas, with no z-index: it paints over the 3D view but
      // under #hud / #popups / #screens, so a modal opening mid-drag covers it.
      if (canvas.parentElement === host && typeof host.insertBefore === 'function') {
        host.insertBefore(ring, canvas.nextSibling || null);
      } else {
        host.appendChild(ring);
      }
      joy.el = ring;
      joy.knob = knob;
    } catch {
      joy.el = null;
      joy.knob = null;
    }
  }

  function placeJoystick() {
    if (!joy.el) return;
    joy.el.style.display = 'block';
    const rect = canvasRect();
    const hostRect = joy.el.parentElement && joy.el.parentElement.getBoundingClientRect
      ? joy.el.parentElement.getBoundingClientRect()
      : rect;
    joy.el.style.left = joy.ox - (hostRect ? hostRect.left : 0) + 'px';
    joy.el.style.top = joy.oy - (hostRect ? hostRect.top : 0) + 'px';
  }

  function updateJoystickKnob() {
    if (!joy.knob) return;
    joy.knob.style.transform = `translate(${(joy.x * JOY_RADIUS).toFixed(1)}px, ${(-joy.y * JOY_RADIUS).toFixed(1)}px)`;
  }

  function endJoystick() {
    joy.id = null;
    joy.x = 0;
    joy.y = 0;
    if (joy.el) joy.el.style.display = 'none';
    if (joy.knob) joy.knob.style.transform = '';
  }

  // ---------------------------------------------------------------- pointers
  function canvasRect() {
    try {
      return canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    } catch {
      return null;
    }
  }

  function onPointerDown(e) {
    if (!enabled || staleEvent(e)) return;
    const type = e.pointerType || 'mouse';
    if (type === 'mouse' && e.button > 2) return;
    // Middle-drag orbits too; stop the browser's autoscroll cursor.
    if (type === 'mouse' && e.button === 1) e.preventDefault();

    if (type === 'touch' && useJoystick && joy.id === null) {
      const rect = canvasRect();
      const left = rect ? rect.left : 0;
      const width = rect ? rect.width : win ? win.innerWidth : 1000;
      if (e.clientX - left < width * joystickZone) {
        joy.id = e.pointerId;
        joy.ox = e.clientX;
        joy.oy = e.clientY;
        joy.sx = e.clientX;
        joy.sy = e.clientY;
        joy.t0 = now();
        joy.moved = false;
        joy.x = 0;
        joy.y = 0;
        ensureJoystickEl();
        placeJoystick();
        updateJoystickKnob();
        e.preventDefault();
        return;
      }
    }

    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      button: e.button,
      type,
    });
    if (pointers.size === 2) pinchDist = currentPinchDistance();
    if (pointers.size > 1) {
      // A second finger means pinch / two-finger gesture, never a click.
      for (const p of pointers.values()) p.moved = true;
    }
    try {
      if (canvas && canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety only */
    }
    if (type !== 'mouse') e.preventDefault();
  }

  function currentPinchDistance() {
    let a = null;
    let b = null;
    for (const p of pointers.values()) {
      if (!a) a = p;
      else if (!b) b = p;
    }
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerMove(e) {
    if (joy.id !== null && e.pointerId === joy.id) {
      if (!joy.moved && Math.hypot(e.clientX - joy.sx, e.clientY - joy.sy) > CLICK_SLOP) joy.moved = true;
      if (!enabled) return;
      let jx = (e.clientX - joy.ox) / JOY_RADIUS;
      let jy = -(e.clientY - joy.oy) / JOY_RADIUS;
      const len = Math.hypot(jx, jy);
      if (len > 1) {
        // Let the base follow a finger that drifts far away, like most mobile games.
        const over = len - 1;
        joy.ox += (jx / len) * over * JOY_RADIUS * 0.5;
        joy.oy -= (jy / len) * over * JOY_RADIUS * 0.5;
        placeJoystick();
        jx /= len;
        jy /= len;
      }
      joy.x = jx;
      joy.y = jy;
      updateJoystickKnob();
      return;
    }

    const p = pointers.get(e.pointerId);
    if (!p) return;
    let dx = e.clientX - p.x;
    let dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > CLICK_SLOP) {
      p.moved = true;
      // Count the few pixels travelled inside the click slop too, so a slow
      // drag doesn't feel sticky at the start.
      dx = p.x - p.sx;
      dy = p.y - p.sy;
    }
    if (!enabled) return;

    if (pointers.size >= 2) {
      const d = currentPinchDistance();
      if (pinchDist > 0 && d > 0) {
        // Fingers apart = zoom in = negative wheel (same sign as scrolling up).
        wheel += (pinchDist - d) * 2.5;
      }
      pinchDist = d;
      return;
    }
    if (p.moved) {
      dragX += dx;
      dragY += dy;
    }
  }

  function onPointerUp(e) {
    if (joy.id !== null && e.pointerId === joy.id) {
      // A quick tap in the joystick zone is still a tap on the world.
      const tap = !joy.moved && now() - joy.t0 < 350;
      endJoystick();
      if (tap && enabled && !staleEvent(e) && pointers.size === 0) registerClick(e);
      return;
    }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    try {
      if (canvas && canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (!enabled || staleEvent(e)) return;
    const primaryButton = p.type !== 'mouse' || p.button === 0;
    if (!p.moved && primaryButton && pointers.size === 0) registerClick(e);
  }

  function registerClick(e) {
    clickFlag = true;
    const rect = canvasRect();
    const left = rect ? rect.left : 0;
    const top = rect ? rect.top : 0;
    const w = rect && rect.width ? rect.width : 1;
    const h = rect && rect.height ? rect.height : 1;
    clickPos.x = e.clientX - left;
    clickPos.y = e.clientY - top;
    clickPos.ndcX = (clickPos.x / w) * 2 - 1;
    clickPos.ndcY = -(clickPos.y / h) * 2 + 1;
  }

  function onPointerCancel(e) {
    if (joy.id !== null && e.pointerId === joy.id) {
      endJoystick();
      return;
    }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
  }

  function onWheel(e) {
    if (!enabled) return;
    e.preventDefault();
    let d = e.deltaY || 0;
    if (e.deltaMode === 1) d *= 16; // lines
    else if (e.deltaMode === 2) d *= 400; // pages
    if (d > 240) d = 240;
    else if (d < -240) d = -240;
    wheel += d;
  }

  function onContextMenu(e) {
    e.preventDefault(); // right-drag orbits the camera instead
  }

  // ---------------------------------------------------------------- wiring
  const listeners = [];
  function on(target, type, fn, opts) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  }

  on(win, 'keydown', onKeyDown);
  on(win, 'keyup', onKeyUp);
  on(win, 'blur', releaseAll);
  on(doc, 'visibilitychange', onVisibility);
  on(canvas, 'pointerdown', onPointerDown);
  on(win, 'pointermove', onPointerMove);
  on(win, 'pointerup', onPointerUp);
  on(win, 'pointercancel', onPointerCancel);
  on(canvas, 'lostpointercapture', (e) => {
    // Capture lost without a pointerup (e.g. element removed): forget the drag.
    if (e.pointerId !== joy.id && pointers.has(e.pointerId) && !(e.buttons > 0)) onPointerCancel(e);
  });
  on(canvas, 'wheel', onWheel, { passive: false });
  on(canvas, 'contextmenu', onContextMenu);

  // ---------------------------------------------------------------- API
  const api = {
    isDown(code) {
      return held.has(code);
    },
    pressed(code) {
      return pressedSet.has(code);
    },
    // Extra helpers.
    anyDown(...codes) {
      for (const c of codes) if (held.has(c)) return true;
      return false;
    },
    anyPressed(...codes) {
      for (const c of codes) if (pressedSet.has(c)) return true;
      return false;
    },

    moveVector() {
      let x = 0;
      let y = 0;
      if (enabled) {
        if (anyHeld(MOVE_KEYS.right)) x += 1;
        if (anyHeld(MOVE_KEYS.left)) x -= 1;
        if (anyHeld(MOVE_KEYS.up)) y += 1;
        if (anyHeld(MOVE_KEYS.down)) y -= 1;
        if (joy.id !== null) {
          const jl = Math.hypot(joy.x, joy.y);
          if (jl > JOY_DEADZONE) {
            const k = Math.min(1, (jl - JOY_DEADZONE) / (1 - JOY_DEADZONE)) / jl;
            x += joy.x * k;
            y += joy.y * k;
          }
        }
      }
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      mv.x = x;
      mv.y = y;
      return mv;
    },

    dragDelta() {
      dd.dx = dragX;
      dd.dy = dragY;
      dragX = 0;
      dragY = 0;
      return dd;
    },

    wheelDelta() {
      const w = wheel;
      wheel = 0;
      return w;
    },

    clicked() {
      const c = clickFlag;
      clickFlag = false;
      return c;
    },

    // Where the last click landed: CSS px inside the canvas + normalised device
    // coords (for THREE.Raycaster.setFromCamera).
    clickPosition() {
      return clickPos;
    },

    // True while a touch joystick finger is down (handy for showing touch hints).
    touchActive() {
      return joy.id !== null || pointers.size > 0;
    },

    endFrame() {
      pressedSet.clear();
    },

    setEnabled(on) {
      const next = !!on;
      if (next === enabled) return;
      enabled = next;
      held.clear();
      pressedSet.clear();
      dragX = 0;
      dragY = 0;
      wheel = 0;
      clickFlag = false;
      for (const p of pointers.values()) p.moved = true; // a press in progress can't become a click
      if (!enabled) endJoystick();
      else enabledAt = now();
    },

    get enabled() {
      return enabled;
    },

    dispose() {
      for (const [target, type, fn, opts] of listeners) {
        try {
          target.removeEventListener(type, fn, opts);
        } catch {
          /* ignore */
        }
      }
      listeners.length = 0;
      releaseAll();
      if (joy.el && joy.el.parentElement) joy.el.parentElement.removeChild(joy.el);
      joy.el = null;
      joy.knob = null;
    },
  };

  function anyHeld(codes) {
    for (let i = 0; i < codes.length; i++) if (held.has(codes[i])) return true;
    return false;
  }

  return api;
}
