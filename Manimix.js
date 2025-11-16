/**
 * animix.esm.js
 *
 * ESM-friendly build of Animix — includes:
 * - dynamic splitText (chars / words / lines)
 * - robust unit & color parsing (including rgba, percentages, arrays)
 * - transform normalization and correct animation of x,y,z,rotation,rotationX,rotationY,rotationZ,scale
 * - automatic parent perspective management when animating 3D transforms
 * - improved .from behavior, timeline, stagger, scrollTrigger helpers
 *
 * Save this file as "animix.esm.js".
 */

/* eslint-disable */
const CONFIG = { debug: false };

function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
function clamp(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }
function isNodeList(obj) { return typeof NodeList !== 'undefined' && NodeList.prototype.isPrototypeOf(obj); }
function toArr(x) { return (Array.isArray(x) || isNodeList(x)) ? Array.from(x) : [x]; }
function safeGetComputedStyle(el) {
  try { return (el && typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(el) : {}; } catch (e) { return {}; }
}
function isElement(el) { return !!el && typeof el.getBoundingClientRect === 'function'; }
function isSVG(el) { return typeof SVGElement !== 'undefined' && el instanceof SVGElement; }

// Convert JS-style prop (backgroundColor) to CSS property name (background-color)
function cssPropName(prop) {
  if (!prop) return prop;
  if (prop.indexOf('-') !== -1) return prop;
  return prop.replace(/([A-Z])/g, '-$1').toLowerCase();
}

// Safe getter for computed style value that supports camelCase props and kebab-case
function getComputedValue(el, cs, prop) {
  const cssName = cssPropName(prop);
  try {
    if (cs && typeof cs.getPropertyValue === 'function') {
      const v = cs.getPropertyValue(cssName);
      if (v && v !== '') return v;
      if (cs[cssName]) return cs[cssName];
      if (cs[prop]) return cs[prop];
    }
  } catch (e) {}
  try { return (el && el.style) ? (el.style[prop] || el.style[cssName] || '') : ''; } catch(e) { return ''; }
}

function parseDuration(v) {
  if (v == null) return undefined;
  if (typeof v === 'number') return Math.max(0, Number(v));
  const s = String(v).trim().toLowerCase();
  const ms = s.match(/^(-?[\d.]+)ms$/);
  if (ms) return Math.max(0, parseFloat(ms[1]) / 1000);
  const ss = s.match(/^(-?[\d.]+)s$/);
  if (ss) return Math.max(0, parseFloat(ss[1]));
  const n = parseFloat(s);
  return isNaN(n) ? undefined : Math.max(0, n);
}

/* Easing helpers */
function linear(t) { return t; }
function makePower(n) {
  return {
    in: (t) => Math.pow(t, n),
    out: (t) => 1 - Math.pow(1 - t, n),
    inOut: (t) => {
      if (t < 0.5) return 0.5 * Math.pow(t * 2, n);
      return 1 - 0.5 * Math.pow((1 - t) * 2, n);
    }
  };
}
const _powers = { 1: makePower(1), 2: makePower(2), 3: makePower(3), 4: makePower(4) };

function parseEase(e) {
  if (!e) return linear;
  if (typeof e === 'function') return e;
  const s = String(e).trim().toLowerCase();
  if (s === 'linear' || s === 'none') return linear;
  const m = s.match(/^power(\d)(?:\.(inout|in|out))?$/i);
  if (m) {
    const n = parseInt(m[1], 10) || 2;
    const variant = (m[2] || 'out').toLowerCase();
    const pow = _powers[n] || _powers[2];
    if (variant === 'in') return pow.in;
    if (variant === 'inout') return pow.inOut;
    return pow.out;
  }
  if (s === 'power2' || s === 'power2.out') return _powers[2].out;
  return linear;
}

/* Color utilities */
function clampInt(v) { return Math.round(Math.max(0, Math.min(255, Math.round(v)))); }
function parseHexColor(str) {
  const s = String(str).replace('#', '').trim();
  if (s.length === 3) {
    return { r: parseInt(s[0]+s[0],16), g: parseInt(s[1]+s[1],16), b: parseInt(s[2]+s[2],16), a:1 };
  } else if (s.length === 6 || s.length === 8) {
    const r = parseInt(s.slice(0,2),16), g = parseInt(s.slice(2,4),16), b = parseInt(s.slice(4,6),16);
    const a = s.length === 8 ? parseInt(s.slice(6,8),16)/255 : 1;
    return { r,g,b,a };
  }
  return null;
}

// Updated parseColor to accept many rgba forms, arrays, objects and percentages.
function parseColor(input) {
  if (input == null) return null;

  // If it's already an array like [r,g,b] or [r,g,b,a]
  if (Array.isArray(input)) {
    const r = Number(input[0]) || 0;
    const g = Number(input[1]) || 0;
    const b = Number(input[2]) || 0;
    const a = (input.length > 3) ? Number(input[3]) : 1;
    return { r: clampInt(r), g: clampInt(g), b: clampInt(b), a: Math.max(0, Math.min(1, isNaN(a) ? 1 : a)) };
  }

  if (typeof input === 'object') {
    return {
      r: clampInt(input.r || 0),
      g: clampInt(input.g || 0),
      b: clampInt(input.b || 0),
      a: ('a' in input) ? Math.max(0, Math.min(1, Number(input.a))) : 1
    };
  }

  const s = String(input).trim();

  if (s === 'transparent') return { r:0,g:0,b:0,a:0 };

  if (s[0] === '#') return parseHexColor(s);

  // Accept rgb()/rgba() with commas or space separated and optional "/" alpha
  const fnMatch = s.match(/^rgba?\(\s*([^\)]+)\s*\)$/i);
  if (fnMatch) {
    const inner = fnMatch[1].trim();
    // split on commas or spaces or slash
    const parts = inner.split(/\s+|,|\//).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      function parseChannel(ch) {
        if (ch.endsWith('%')) {
          const p = parseFloat(ch.slice(0,-1));
          if (isNaN(p)) return 0;
          return clampInt((p/100)*255);
        }
        const n = parseFloat(ch);
        if (isNaN(n)) return 0;
        return clampInt(n);
      }
      const r = parseChannel(parts[0]);
      const g = parseChannel(parts[1]);
      const b = parseChannel(parts[2]);
      let a = 1;
      if (parts.length >= 4) {
        const astr = parts[3];
        if (astr.endsWith('%')) {
          const p = parseFloat(astr.slice(0,-1));
          a = isNaN(p) ? 1 : Math.max(0, Math.min(1, p/100));
        } else {
          const n = parseFloat(astr);
          a = isNaN(n) ? 1 : Math.max(0, Math.min(1, n));
        }
      }
      return { r,g,b,a };
    }
  }

  // loose parse "r,g,b,a" or "r g b / a"
  const looseParts = s.split(/(?:\s+|,|\/)+/).map(p => p.trim()).filter(Boolean);
  if (looseParts.length === 3 || looseParts.length === 4) {
    const r = clampInt(parseFloat(looseParts[0]) || 0);
    const g = clampInt(parseFloat(looseParts[1]) || 0);
    const b = clampInt(parseFloat(looseParts[2]) || 0);
    let a = 1;
    if (looseParts.length === 4) {
      const astr = looseParts[3];
      if (astr.endsWith('%')) {
        a = Math.max(0, Math.min(1, parseFloat(astr.slice(0,-1)) / 100));
      } else {
        const n = parseFloat(astr);
        a = isNaN(n) ? 1 : Math.max(0, Math.min(1, n));
      }
    }
    return { r,g,b,a };
  }

  return null;
}

// Ensure lerpColor is defined and available for interpolation
function lerpColor(a, b, t) {
  const ar = (a && typeof a.r === 'number') ? a.r : 0;
  const ag = (a && typeof a.g === 'number') ? a.g : 0;
  const ab = (a && typeof a.b === 'number') ? a.b : 0;
  const aa = (a && typeof a.a === 'number') ? a.a : 1;

  const br = (b && typeof b.r === 'number') ? b.r : 0;
  const bg = (b && typeof b.g === 'number') ? b.g : 0;
  const bb = (b && typeof b.b === 'number') ? b.b : 0;
  const ba = (b && typeof b.a === 'number') ? b.a : 1;

  return {
    r: ar + (br - ar) * t,
    g: ag + (bg - ag) * t,
    b: ab + (bb - ab) * t,
    a: aa + (ba - aa) * t
  };
}

// Updated colorToString: use rgba when alpha < 1
function colorToString(c) {
  if (c == null) return '';
  const r = clampInt(c.r || 0);
  const g = clampInt(c.g || 0);
  const b = clampInt(c.b || 0);
  const a = (typeof c.a === 'number') ? c.a : 1;
  if (a == null || a >= 0.999) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  const aStr = (+a.toFixed(3));
  return `rgba(${r}, ${g}, ${b}, ${aStr})`;
}

/* Transform & units */
function identityTransform(){ return { x:0,y:0,z:0, rotation:0, rotationX:0, rotationY:0, rotationZ:0, scale:1 }; }
function decomposeTransform(style){
  if (!style || style === 'none') return identityTransform();
  const s = String(style);
  if (s.startsWith('matrix(')) {
    try {
      const p = s.slice(7,-1).split(',').map(Number);
      const a = p[0], b = p[1], tx = p[4], ty = p[5];
      const rotation = Math.atan2(b,a) * 180 / Math.PI;
      const scale = Math.sqrt(a*a + b*b);
      return { x: tx, y: ty, z:0, rotation, rotationX:0, rotationY:0, rotationZ:rotation, scale };
    } catch (e) { return identityTransform(); }
  }
  return identityTransform();
}
function convertUnit(val, unit, el, reference=0){
  if (!unit || unit === 'px') return val;
  if (unit === '%') {
    try {
      const p = el && el.parentElement;
      const size = p ? (p.clientWidth || reference) : reference || 0;
      return (val/100) * size;
    } catch (e) { return val; }
  }
  if (unit === 'em') {
    try { const cs = safeGetComputedStyle(el); const fs = parseFloat(cs.fontSize || 16); return val * fs; } catch(e){ return val * 16; }
  }
  return val;
}
function parseRelative(start, expr, el){
  if (typeof expr === 'number') return { end: expr, unit: null };
  const sRaw = String(expr).trim();
  if (sRaw === '') return { end: '', unit: null };
  const rel = sRaw.match(/^([+-]=)(-?[\d.]+)([a-z%]*)$/i);
  if (rel) {
    const sign = rel[1][0] === '+' ? 1 : -1;
    const num = parseFloat(rel[2]);
    const unit = rel[3] || '';
    if (unit === '%' || unit === 'em' || unit === 'px' || unit === '') {
      const converted = convertUnit(num, unit || 'px', el, start);
      const value = start + sign * converted;
      return { end: value, unit: 'px' };
    }
    const value2 = start + sign * num;
    return { end: value2, unit: unit || null };
  }
  const m = sRaw.match(/^(-?[\d.]+)([a-z%]*)$/i);
  if (m) {
    const num = parseFloat(m[1]);
    const unit = m[2] || '';
    if (unit === '%' || unit === 'em' || unit === 'px' || unit === '') {
      return { end: convertUnit(num, unit || 'px', el, start), unit: 'px' };
    }
    return { end: num, unit: unit || null };
  }
  return { end: sRaw, unit: null };
}

/* Helpers to manage automatic parent perspective when animating 3D transforms */
function ensureParentPerspectiveOnAdd(parent, px) {
  if (!parent) return null;
  try {
    if (!parent.__animix_autoPerspectiveCount) parent.__animix_autoPerspectiveCount = 0;
    if (!parent.__animix_autoPerspectiveCount) {
      parent.__animix_prevPerspective = parent.style.perspective || '';
      if (!parent.style.perspective || parent.style.perspective === '') {
        parent.style.perspective = (typeof px === 'number' ? (px + 'px') : (px || '600px'));
      }
    }
    parent.__animix_autoPerspectiveCount++;
    return parent.__animix_prevPerspective;
  } catch (e) { return null; }
}
function releaseParentPerspectiveOnRemove(parent) {
  if (!parent) return;
  try {
    parent.__animix_autoPerspectiveCount = Math.max(0, (parent.__animix_autoPerspectiveCount || 1) - 1);
    if (parent.__animix_autoPerspectiveCount === 0) {
      const prev = parent.__animix_prevPerspective || '';
      parent.style.perspective = prev;
      delete parent.__animix_prevPerspective;
      delete parent.__animix_autoPerspectiveCount;
    }
  } catch(e){}
}

/* Motion path */
function motionPathToGetter(input){
  if (!input) return (t)=>({x:0,y:0});
  if (Array.isArray(input)){
    const pts = input.slice();
    const total = Math.max(1, pts.length - 1);
    return function(t){
      t = clamp(t,0,1);
      if (t <= 0) return pts[0];
      if (t >= 1) return pts[pts.length-1];
      const scaled = t * total;
      const i = Math.floor(scaled);
      const local = scaled - i;
      const a = pts[i], b = pts[i+1];
      const lerp = (u,v,f)=> u + (v-u)*f;
      return { x: lerp(a.x,b.x,local), y: lerp(a.y,b.y,local), z: ('z' in a||'z' in b) ? lerp(a.z||0,b.z||0,local) : undefined, rotation: ('rotation' in a||'rotation' in b) ? lerp(a.rotation||0,b.rotation||0,local) : undefined };
    };
  }
  try {
    let pathEl = null;
    if (typeof input === 'string') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      const p = document.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('d', input);
      svg.appendChild(p);
      pathEl = p;
    } else if (typeof SVGPathElement !== 'undefined' && input instanceof SVGPathElement) pathEl = input;
    if (pathEl && typeof pathEl.getTotalLength === 'function') {
      const len = pathEl.getTotalLength();
      return function(t){
        const l = Math.max(0, Math.min(1, t)) * len;
        const pt = pathEl.getPointAtLength(l);
        const delta = Math.max(1, 0.01 * len);
        const p1 = pathEl.getPointAtLength(Math.max(0, l - delta));
        const p2 = pathEl.getPointAtLength(Math.min(len, l + delta));
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
        return { x: pt.x, y: pt.y, rotation: angle };
      };
    }
  } catch(e){}
  return (t)=>({x:0,y:0});
}

/* splitText (dynamic, supports 'line') */
function splitText(element, options = { type: 'chars' }) {
  if (!element) return null;
  const type = options.type || 'chars';
  const originalHTML = element.innerHTML;

  function createSpansFromTextNodes() {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    const created = [];
    for (const tn of textNodes) {
      const parent = tn.parentNode;
      if (!parent) continue;
      const txt = tn.nodeValue || '';
      const frag = document.createDocumentFragment();
      if (type === 'chars') {
        for (let i = 0; i < txt.length; i++) {
          const span = document.createElement('span');
          span.setAttribute('data-animix-char', '');
          span.style.display = 'inline-block';
          span.style.whiteSpace = 'pre';
          span.textContent = txt[i];
          frag.appendChild(span);
          created.push(span);
        }
      } else {
        const parts = txt.split(/(\s+)/);
        for (const p of parts) {
          if (p === '') continue;
          if (/^\s+$/.test(p)) {
            const sp = document.createElement('span');
            sp.setAttribute('data-animix-space', '');
            sp.style.whiteSpace = 'pre';
            sp.textContent = p;
            frag.appendChild(sp);
            created.push(sp);
          } else {
            const span = document.createElement('span');
            span.setAttribute('data-animix-word', '');
            span.style.display = 'inline-block';
            span.style.whiteSpace = 'pre';
            span.textContent = p;
            frag.appendChild(span);
            created.push(span);
          }
        }
      }
      parent.replaceChild(frag, tn);
    }
    return created;
  }

  let allSpans = createSpansFromTextNodes();

  function computeLines(spans) {
    const lines = [];
    if (!spans.length) return lines;
    let lastTop = null;
    let currentLine = [];
    for (const sp of spans) {
      if (!sp || !sp.ownerDocument || !sp.getBoundingClientRect) continue;
      const r = sp.getBoundingClientRect();
      const top = Math.round(r.top || sp.offsetTop || 0);
      if (lastTop === null) {
        currentLine = [sp];
        lastTop = top;
      } else {
        if (Math.abs(top - lastTop) > 2) {
          if (currentLine.length) lines.push(currentLine);
          currentLine = [sp];
          lastTop = top;
        } else {
          currentLine.push(sp);
        }
      }
    }
    if (currentLine.length) lines.push(currentLine);
    return lines;
  }

  function wrapLines(spans) {
    const lines = computeLines(spans);
    if (!lines.length) return [];
    const wrappers = [];
    for (const line of lines) {
      const wrap = document.createElement('span');
      wrap.setAttribute('data-animix-line', '');
      wrap.style.display = 'block';
      wrap.style.whiteSpace = 'nowrap';
      const first = line[0];
      try {
        first.parentNode.insertBefore(wrap, first);
        for (const sp of line) {
          try { wrap.appendChild(sp); } catch (e) {}
        }
        wrappers.push(wrap);
      } catch (e) {}
    }
    return wrappers;
  }

  function collectByAttr(spans) {
    const chars = [];
    const words = [];
    for (const sp of spans) {
      if (!sp) continue;
      if (sp.hasAttribute && sp.hasAttribute('data-animix-char')) chars.push(sp);
      if (sp.hasAttribute && (sp.hasAttribute('data-animix-word') || sp.hasAttribute('data-animix-space'))) words.push(sp);
    }
    return { chars, words };
  }

  let lineWrappers = [];
  if (type === 'line' || type === 'lines') {
    lineWrappers = wrapLines(allSpans);
    const refreshed = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT, null);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n && (n.hasAttribute && (n.hasAttribute('data-animix-char') || n.hasAttribute('data-animix-word') || n.hasAttribute('data-animix-space')))) refreshed.push(n);
    }
    if (refreshed.length > 0) allSpans = refreshed;
  }

  let charsWords = collectByAttr(allSpans);
  let lines = computeLines(allSpans);

  function restore() { try { element.innerHTML = originalHTML; } catch (e) {} }

  function update() {
    try {
      const existing = element.querySelectorAll('[data-animix-char],[data-animix-word],[data-animix-space]');
      for (let i = 0; i < existing.length; i++) {
        const sp = existing[i];
        if (!sp || !sp.parentNode) continue;
        const txtNode = document.createTextNode(sp.textContent || '');
        sp.parentNode.replaceChild(txtNode, sp);
      }
      const wrappers = element.querySelectorAll('[data-animix-line]');
      for (let i = 0; i < wrappers.length; i++) {
        const w = wrappers[i];
        if (!w || !w.parentNode) continue;
        const txtNode = document.createTextNode(w.textContent || '');
        w.parentNode.replaceChild(txtNode, w);
      }
    } catch (e) {
      try {
        for (const sp of allSpans.slice()) {
          if (!sp) continue;
          const parent = sp.parentNode;
          if (!parent) continue;
          const txtNode = document.createTextNode(sp.textContent || '');
          parent.replaceChild(txtNode, sp);
        }
        for (const w of lineWrappers.slice()) {
          if (!w) continue;
          const parent = w.parentNode;
          if (!parent) continue;
          const txtNode = document.createTextNode(w.textContent || '');
          parent.replaceChild(txtNode, w);
        }
      } catch (e2) {}
    }

    allSpans = createSpansFromTextNodes();

    lineWrappers = [];
    if (type === 'line' || type === 'lines') {
      lineWrappers = wrapLines(allSpans);
      const refreshed = [];
      const walker2 = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT, null);
      while (walker2.nextNode()) {
        const n = walker2.currentNode;
        if (n && (n.hasAttribute && (n.hasAttribute('data-animix-char') || n.hasAttribute('data-animix-word') || n.hasAttribute('data-animix-space')))) refreshed.push(n);
      }
      if (refreshed.length > 0) allSpans = refreshed;
    }

    lines = computeLines(allSpans);
    charsWords = collectByAttr(allSpans);
    return { chars: charsWords.chars.slice(), words: charsWords.words.slice(), lines: lines.map(l => l.slice()) };
  }

  return { chars: charsWords.chars.slice(), words: charsWords.words.slice(), lines: lines.map(l => l.slice()), restore, update, _internalSpans: allSpans };
}

/* Tween Manager */
class TweenManager {
  constructor(){ this.tweens = new Map(); this._raf = null; this._running = false; this._nextId = 1; }
  add(t){ const id = this._nextId++; t._id = id; this.tweens.set(id, t); this._ensureRunning(); return id; }
  remove(t){ if (!t || !t._id) return; this.tweens.delete(t._id); }
  _ensureRunning(){ if (this._running) return; this._running = true; const loop = () => { const n = now(); this.update(n); if (this.tweens.size > 0) this._raf = requestAnimationFrame(loop); else { this._running = false; this._raf = null; } }; this._raf = requestAnimationFrame(loop); }
  update(time){ for (const t of Array.from(this.tweens.values())) if (t._running) t._tick(time); }
}
const manager = new TweenManager();

class GroupController {
  constructor(payload){ this.payload = payload; }
  pause(){ if (Array.isArray(this.payload)) for (const p of this.payload) p.pause(); else if (this.payload && typeof this.payload.pause === 'function') this.payload.pause(); return this; }
  play(){ if (Array.isArray(this.payload)) for (const p of this.payload) p.play(); else if (this.payload && typeof this.payload.play === 'function') this.payload.play(); return this; }
  kill(){ if (Array.isArray(this.payload)) for (const p of this.payload) p.kill(); else if (this.payload && typeof this.payload.kill === 'function') this.payload.kill(); return this; }
  getTweens(){ return Array.isArray(this.payload) ? this.payload.slice() : (this.payload ? [this.payload] : []); }
}

/* Tween */
class Tween {
  constructor(targets, durationArg, vars = {}) {
    this.targets = (isNodeList(targets) || Array.isArray(targets)) ? Array.from(targets) : [targets];
    this.vars = Object.assign({}, vars);
    const durFromVars = parseDuration(vars.duration);
    this.duration = (typeof durationArg !== 'undefined' && durationArg !== null) ? Math.max(0, Number(durationArg)) : (typeof durFromVars !== 'undefined' ? durFromVars : 0.5);
    this.ease = parseEase(vars.ease);
    this._startTime = 0; this._running = false; this._prepared = false; this._propertyTweens = [];
    this._stagger = (this.targets.length > 1 && (vars.stagger != null)) ? vars.stagger : null;
    this._baseDelay = (typeof vars.delay === 'number') ? vars.delay : 0;
    this._repeatDelay = (typeof vars.repeatDelay !== 'undefined') ? (parseDuration(vars.repeatDelay) || 0) : 0;

    if (vars && (vars.repeat === -1 || vars.repeat === Infinity)) this._repeat = Infinity;
    else this._repeat = (typeof vars.repeat === 'number') ? Math.max(0, Math.floor(vars.repeat)) : 0;
    this._yoyo = !!vars.yoyo;
    if (this._yoyo && this._repeat === 0) this._repeat = 1;

    this._immediateRender = !!vars.immediateRender;

    this._onStartCalledFor = new WeakSet();
    this._completedFor = new WeakSet();

    this._autoPerspectiveParents = new Set();

    this._prepare();
    manager.add(this);

    if (this._immediateRender) {
      for (const item of this._propertyTweens) this._renderTarget(item, 0);
    }

    if (this.duration === 0) {
      for (const item of this._propertyTweens) this._renderTarget(item, 1);
      if (this.vars.onCompleteAll) try { this.vars.onCompleteAll(); } catch(e){}
      this._restoreAutoParentPerspectives();
    } else {
      if (!this.vars.paused) this.play();
    }
  }

  _prepare() {
    if (this._prepared) return;
    this._propertyTweens = [];

    let motionGetter = null;
    if (this.vars.motionPath != null) {
      try { motionGetter = motionPathToGetter(this.vars.motionPath); } catch(e){ motionGetter = null; }
    }

    for (let ti=0; ti<this.targets.length; ti++){
      const target = this.targets[ti];
      const cs = safeGetComputedStyle(target);
      const tTrans = decomposeTransform((cs && cs.transform) ? cs.transform : (target && target.style ? target.style.transform : undefined));
      try { if (!target._animix) target._animix = { transform: tTrans }; else { target._animix.transform = Object.assign(identityTransform(), target._animix.transform || {}); } } catch(e){}

      const entries = [];
      if (motionGetter) entries.push({ type: 'motionPath', getter: motionGetter });

      let targetNeedsAutoPerspective = false;

      for (const k in this.vars) {
        if (['ease','duration','delay','stagger','paused','repeat','yoyo','controller','individual','onStart','onUpdate','onComplete','onCompleteAll','repeatDelay','immediateRender','motionPath'].includes(k)) continue;
        const raw = this.vars[k];
        const keyLower = String(k).toLowerCase();

        if (k === 'x' || k === 'y' || k === 'z' || k === 'rotation' || k === 'rotate' || k === 'scale' ||
            keyLower === 'rotationx' || keyLower === 'rotationy' || keyLower === 'rotationz' ||
            keyLower === 'rotatex' || keyLower === 'rotatey' || keyLower === 'rotatez') {

          let prop;
          if (keyLower === 'rotatex' || keyLower === 'rotationx') prop = 'rotationX';
          else if (keyLower === 'rotatey' || keyLower === 'rotationy') prop = 'rotationY';
          else if (keyLower === 'rotatez' || keyLower === 'rotationz') prop = 'rotationZ';
          else prop = (k === 'rotate') ? 'rotation' : k;

          const start = (target && target._animix && typeof target._animix.transform[prop] === 'number') ? target._animix.transform[prop] : (prop === 'scale' ? 1 : 0);
          const parsed = parseRelative(start, raw, target);
          entries.push({ prop, start, end: parsed.end, type: 'num', unit: parsed.unit || null });

          if (prop === 'rotationX' || prop === 'rotationY' || prop === 'rotationZ' || prop === 'z') {
            if (prop === 'rotationX' || prop === 'rotationY' || prop === 'z') targetNeedsAutoPerspective = true;
          }
          continue;
        }

        if (/color$/i.test(k) || k === 'fill' || k === 'stroke' || k === 'backgroundColor' || k === 'background-color' || k === 'color') {
          const startStr = getComputedValue(target, cs, k);
          const startColor = parseColor(startStr) || { r:0,g:0,b:0,a:1 };
          const endColor = parseColor(raw) || startColor;
          entries.push({ prop: k, start: startColor, end: endColor, type: 'color' });
          continue;
        }

        const startVal = getComputedValue(target, cs, k);
        const numericTest = String(startVal).trim().match(/^(-?[\d.]+)([a-z%]*)$/i);
        if (numericTest) {
          const parsed = parseRelative(parseFloat(numericTest[1]) || 0, raw, target);
          if (typeof parsed.end === 'number') entries.push({ prop: k, start: parseFloat(numericTest[1]) || 0, end: parsed.end, type: 'num', unit: parsed.unit || null });
          else entries.push({ prop: k, start: startVal, end: raw, type: 'raw' });
        } else {
          const parsedRaw = parseRelative(0, raw, target);
          if (typeof parsedRaw.end === 'number') entries.push({ prop: k, start: 0, end: parsedRaw.end, type: 'num', unit: parsedRaw.unit || null });
          else entries.push({ prop: k, start: startVal, end: raw, type: 'raw' });
        }
      }

      if (targetNeedsAutoPerspective) {
        try {
          const parent = target.parentElement;
          if (parent) {
            ensureParentPerspectiveOnAdd(parent, 600);
            this._autoPerspectiveParents.add(parent);
          }
        } catch (e) {}
      }

      let staggerDelay;
      if (this._stagger != null) {
        if (typeof this._stagger === 'function') {
          try {
            const res = this._stagger(ti, target, this.targets);
            const nres = Number(res);
            staggerDelay = this._baseDelay + (isNaN(nres) ? 0 : nres);
          } catch(e) { staggerDelay = this._baseDelay; }
        } else {
          const sval = parseFloat(this._stagger) || 0;
          staggerDelay = this._baseDelay + sval * ti;
        }
      } else {
        staggerDelay = this._baseDelay;
      }

      this._propertyTweens.push({ target, entries, staggerDelay, index: ti });
    }
    this._prepared = true;
  }

  _restoreAutoParentPerspectives(){
    try {
      for (const p of Array.from(this._autoPerspectiveParents)) {
        try { releaseParentPerspectiveOnRemove(p); } catch(e){}
      }
      this._autoPerspectiveParents.clear();
    } catch(e){}
  }

  play(){ if (this._running) return this; this._running = true; this._startTime = now(); return this; }
  pause(){ this._running = false; return this; }

  _tick(timeNow){
    if (!this._running) return;
    for (const item of this._propertyTweens){
      const elapsed = (timeNow - this._startTime) / 1000;
      const tRaw = elapsed - item.staggerDelay;
      const cycleTime = (this.duration + this._repeatDelay) || this.duration || 0.000001;
      let cycle = Math.floor(Math.max(0, tRaw / (cycleTime || 0.000001)));
      let localT = (tRaw - (cycle * (cycleTime))) / Math.max(0.000001, this.duration);

      if (this._repeat !== Infinity && this._repeat > 0 && cycle > this._repeat) { cycle = this._repeat; localT = 1; }

      const isYoyo = this._yoyo && (cycle % 2 === 1);
      const progress = clamp(isYoyo ? 1 - localT : localT, 0, 1);
      const eased = this.ease(progress);

      if (!this._onStartCalledFor.has(item.target) && tRaw >= 0 && this.vars.onStart) {
        try { this.vars.onStart(item.target, item.index); } catch(e) {}
        this._onStartCalledFor.add(item.target);
      }

      if (tRaw >= 0) {
        this._renderTarget(item, eased);
        if (this.vars.onUpdate) try { this.vars.onUpdate(eased, item.target, item.index); } catch(e){}
      }

      if (this._repeat !== Infinity && tRaw >= (this._repeat + 1) * cycleTime) {
        this._renderTarget(item, 1);
        if (this.vars.onComplete && !item._onCompleteCalled) {
          try { this.vars.onComplete(item.target, item.index); } catch(e) {}
          item._onCompleteCalled = true;
        }
        this._completedFor.add(item.target);
      }
    }

    const allDone = this._propertyTweens.every(item => {
      const elapsed = (now() - this._startTime) / 1000;
      if (this._repeat === Infinity) return false;
      const cycleTime = (this.duration + this._repeatDelay) || this.duration || 0.000001;
      return elapsed >= item.staggerDelay + cycleTime * (this._repeat + 1);
    });
    if (allDone) {
      this._running = false;
      manager.remove(this);
      if (this.vars.onCompleteAll) try { this.vars.onCompleteAll(); } catch(e){}
      this._restoreAutoParentPerspectives();
    }
  }

  _renderTarget(item, progress){
    const t = item.target;
    if (!t) return;
    for (const e of item.entries){
      if (e.type === 'motionPath') {
        try {
          const pos = e.getter(progress || 0);
          if (!t._animix) t._animix = { transform: identityTransform() };
          if (typeof pos.x === 'number') t._animix.transform.x = pos.x;
          if (typeof pos.y === 'number') t._animix.transform.y = pos.y;
          if (typeof pos.rotation === 'number') t._animix.transform.rotation = pos.rotation;
          if (isSVG(t)) {
            const tr = t._animix.transform;
            t.setAttribute('transform', `translate(${tr.x||0},${tr.y||0}) rotate(${tr.rotation||0}) scale(${tr.scale||1})`);
          } else {
            const tr = t._animix.transform;
            if (t.style) t.style.transform = `translate3d(${tr.x||0}px, ${tr.y||0}px, ${tr.z||0}px) rotateX(${tr.rotationX||0}deg) rotateY(${tr.rotationY||0}deg) rotateZ(${tr.rotationZ||tr.rotation||0}deg) rotate(${tr.rotation||0}deg) scale(${tr.scale||1})`;
          }
        } catch(e){}
        continue;
      }

      if (e.type === 'num'){
        const val = e.start + (e.end - e.start) * progress;
        if (['x','y','z','rotation','rotationX','rotationY','rotationZ','scale'].includes(e.prop)) {
          const prop = e.prop;
          if (!t._animix) t._animix = { transform: identityTransform() };
          t._animix.transform[prop] = val;
          try {
            if (isSVG(t)) {
              const tr = t._animix.transform;
              const svgTrans = `translate(${tr.x||0},${tr.y||0}) rotate(${tr.rotation||0}) scale(${tr.scale||1})`;
              t.setAttribute('transform', svgTrans);
            } else {
              const tr = t._animix.transform;
              if (t.style) t.style.transform = `translate3d(${tr.x||0}px, ${tr.y||0}px, ${tr.z||0}px) rotateX(${tr.rotationX||0}deg) rotateY(${tr.rotationY||0}deg) rotateZ(${tr.rotationZ||tr.rotation||0}deg) rotate(${tr.rotation||0}deg) scale(${tr.scale||1})`;
            }
          } catch(e){}
        } else {
          if (e.prop === 'opacity') {
            try { if (t.style) t.style.opacity = String(val); } catch(e){}
          } else if (e.prop === 'perspective' || e.prop === 'transformPerspective') {
            try {
              const unit = e.unit || 'px';
              if (t.style) t.style.perspective = `${val}${unit}`;
            } catch(e){}
          } else {
            try {
              const unit = e.unit || 'px';
              const propJS = e.prop;
              const cssName = cssPropName(propJS);
              if (propJS.indexOf('-') !== -1) {
                t.style.setProperty(cssName, `${val}${unit}`);
              } else {
                if (t.style && (propJS in t.style)) {
                  t.style[propJS] = `${val}${unit}`;
                } else {
                  t.style.setProperty(cssName, `${val}${unit}`);
                }
              }
            } catch(e){}
          }
        }
      } else if (e.type === 'color'){
        const c = lerpColor(e.start, e.end, progress);
        try {
          const propJS = e.prop;
          const cssName = cssPropName(propJS);
          if (propJS.indexOf('-') === -1 && t.style && (propJS in t.style)) {
            t.style[propJS] = colorToString(c);
          } else {
            try { t.style.setProperty(cssName, colorToString(c)); } catch(e){}
          }
        } catch(e){}
      } else if (e.type === 'raw'){
        if (progress >= 1) {
          try {
            const propJS = e.prop;
            const cssName = cssPropName(propJS);
            if (propJS.indexOf('-') === -1 && t.style && (propJS in t.style)) {
              t.style[propJS] = e.end;
            } else {
              t.style.setProperty(cssName, e.end);
            }
          } catch(e){}
        }
      }
    }
  }

  seek(progress){ const p = clamp(progress,0,1); for (const item of this._propertyTweens) this._renderTarget(item,p); if (p >= 1 && this.vars.onComplete) try { this.vars.onComplete(); } catch(e){} return this; }
  playFrom(timeSec){ this._startTime = now() - timeSec * 1000; this._running = true; return this; }
  kill(){ this._running = false; manager.remove(this); this._restoreAutoParentPerspectives(); }
}

/* Timeline */
class Timeline {
  constructor(opts = {}){ this.items = []; this.duration = 0; this.paused = !!opts.paused; this._playing = false; this._start = 0; this._raf = null; this._labels = {}; }
  _parsePosition(position) {
    if (typeof position === 'number') return position;
    if (!position) return this.duration;
    const s = String(position).trim();
    if (/^[+-]=/.test(s)) {
      const m = s.match(/^([+-]=)(-?[\d.]+)(s|ms)?$/);
      if (m) {
        const sign = m[1][0] === '+' ? 1 : -1;
        const val = parseFloat(m[2]);
        const secs = (!m[3] || m[3] === 's') ? val : val / 1000;
        return this.duration + sign * secs;
      }
      const val = parseFloat(s.slice(2));
      return this.duration + (s[0] === '+' ? val : -val);
    }
    if (this._labels && this._labels[s] != null) return this._labels[s];
    const n = parseFloat(s);
    return isNaN(n) ? this.duration : n;
  }
  to(target, duration, vars, position = undefined){
    let dur = duration;
    let v = vars;
    if (typeof duration === 'object' && vars === undefined) { v = duration; dur = undefined; }
    v = v || {};
    const finalDur = (typeof dur !== 'undefined' && dur !== null) ? Number(dur) : (parseDuration(v.duration) || 0.5);
    const tween = new Tween(target, finalDur, v);
    tween.pause();
    const pos = (typeof position === 'undefined') ? this.duration : this._parsePosition(position);
    this.items.push({ tween, position: pos });
    this.duration = Math.max(this.duration, pos + finalDur);
    if (!this.paused && !this._playing) this.play();
    return this;
  }
  add(tweenOrTimeline, position = undefined){
    if (!tweenOrTimeline || typeof tweenOrTimeline.seek !== 'function') return this;
    tweenOrTimeline.pause();
    const pos = (position === undefined) ? this.duration : this._parsePosition(position);
    this.items.push({ tween: tweenOrTimeline, position: pos });
    this.duration = Math.max(this.duration, pos + tweenOrTimeline.duration);
    return this;
  }
  addLabel(name, position) {
    const pos = (typeof position === 'undefined') ? this.duration : this._parsePosition(position);
    this._labels[name] = pos;
    return this;
  }
  play(){ if (this._playing) return this; this._playing = true; this._start = now(); const loop = () => { const elapsed = (now() - this._start) / 1000; for (const it of this.items){ const localElapsed = elapsed - it.position; const localT = clamp(localElapsed / Math.max(0.000001, it.tween.duration), 0, 1); it.tween.seek(localT); } if (elapsed < this.duration) this._raf = requestAnimationFrame(loop); else { for (const it of this.items) it.tween.seek(1); this._playing = false; } }; this._raf = requestAnimationFrame(loop); return this; }
  pause(){ this._playing = false; for (const it of this.items) it.tween.pause(); return this; }
  seek(time){ const t = clamp(time,0,this.duration); for (const it of this.items){ const localT = clamp((t - it.position) / Math.max(0.000001, it.tween.duration), 0, 1); it.tween.seek(localT); } return this; }
}

/* Convenience utilities */
function killTweensOf(target){
  const list = (Array.isArray(target) || isNodeList(target)) ? Array.from(target) : [target];
  for (const t of list) {
    for (const tw of Array.from(manager.tweens.values())) {
      if (!tw._propertyTweens) continue;
      for (const pt of tw._propertyTweens) if (pt.target === t) tw.kill();
    }
  }
}

function staggerTo(targets, duration, vars = {}, stagger = 0.1){
  const clone = Object.assign({}, vars);
  if (typeof stagger !== 'undefined' && clone.stagger == null) clone.stagger = stagger;
  return new Tween(targets, duration, clone);
}
function staggerFrom(targets, duration, fromVars = {}, stagger = 0.1){
  const list = toArr(targets);
  for (let i=0;i<list.length;i++){
    const el = list[i];
    try {
      for (const k in fromVars) {
        if (k === 'x' || k === 'y' || k === 'z' || k === 'rotation' || k === 'rotate' || k === 'scale' ||
            k.toLowerCase() === 'rotatex' || k.toLowerCase() === 'rotatey' || k.toLowerCase() === 'rotatez') {
          const keyLower = k.toLowerCase();
          const prop = (keyLower === 'rotatex' || keyLower === 'rotationx') ? 'rotationX' :
                       (keyLower === 'rotatey' || keyLower === 'rotationy') ? 'rotationY' :
                       (keyLower === 'rotatez' || keyLower === 'rotationz') ? 'rotationZ' :
                       (k === 'rotate') ? 'rotation' : k;
          if (!el._animix) el._animix = { transform: identityTransform() };
          el._animix.transform[prop] = fromVars[k];
          if (el.style) el.style.transform = `translate3d(${el._animix.transform.x||0}px, ${el._animix.transform.y||0}px, ${el._animix.transform.z||0}px) rotateX(${el._animix.transform.rotationX||0}deg) rotateY(${el._animix.transform.rotationY||0}deg) rotateZ(${el._animix.transform.rotationZ||el._animix.transform.rotation||0}deg) rotate(${el._animix.transform.rotation||0}deg) scale(${el._animix.transform.scale||1})`;
        } else {
          if (el.style) el.style[k] = fromVars[k];
        }
      }
    } catch(e){}
  }
  const cloneVars = Object.assign({}, fromVars);
  if (typeof stagger !== 'undefined' && cloneVars.stagger == null) cloneVars.stagger = stagger;
  return new Tween(list, duration, cloneVars);
}
function staggerFromTo(targets, duration, fromVars = {}, toVars = {}, stagger = 0.1){
  const list = toArr(targets);
  for (let i=0;i<list.length;i++){
    const el = list[i];
    try {
      for (const k in fromVars) {
        if (k === 'x' || k === 'y' || k === 'z' || k === 'rotation' || k === 'rotate' || k === 'scale' ||
            k.toLowerCase() === 'rotatex' || k.toLowerCase() === 'rotatey' || k.toLowerCase() === 'rotatez') {
          const keyLower = k.toLowerCase();
          const prop = (keyLower === 'rotatex' || keyLower === 'rotationx') ? 'rotationX' :
                       (keyLower === 'rotatey' || keyLower === 'rotationy') ? 'rotationY' :
                       (keyLower === 'rotatez' || keyLower === 'rotationz') ? 'rotationZ' :
                       (k === 'rotate') ? 'rotation' : k;
          if (!el._animix) el._animix = { transform: identityTransform() };
          el._animix.transform[prop] = fromVars[k];
          if (el.style) el.style.transform = `translate3d(${el._animix.transform.x||0}px, ${el._animix.transform.y||0}px, ${el._animix.transform.z||0}px) rotateX(${el._animix.transform.rotationX||0}deg) rotateY(${el._animix.transform.rotationY||0}deg) rotateZ(${el._animix.transform.rotationZ||el._animix.transform.rotation||0}deg) rotate(${el._animix.transform.rotation||0}deg) scale(${el._animix.transform.scale||1})`;
        } else {
          if (el.style) el.style[k] = fromVars[k];
        }
      }
    } catch(e){}
  }
  const cloneVars = Object.assign({}, toVars);
  if (typeof stagger !== 'undefined' && cloneVars.stagger == null) cloneVars.stagger = stagger;
  return new Tween(list, duration, cloneVars);
}
function varsOrEmpty(v){ return v || {}; }

/* Scroll helpers */
function createEnterTrigger(opts = {}) {
  const { trigger, onEnter, onLeave, once = false, threshold = 0.1, root = null, rootMargin = '0px', playOnEnter = null, pauseOnLeave = false } = opts;
  if (!isElement(trigger)) throw new Error('createEnterTrigger: trigger must be element');
  let observed = true;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        try { if (typeof onEnter === 'function') onEnter(entry); } catch(e){}
        if (playOnEnter && typeof playOnEnter.play === 'function') try { playOnEnter.play(); } catch(e){}
        if (once) { try { obs.unobserve(entry.target); observed = false; } catch(e){} }
      } else {
        try { if (typeof onLeave === 'function') onLeave(entry); } catch(e){}
        if (pauseOnLeave && playOnEnter && typeof playOnEnter.pause === 'function') try { playOnEnter.pause(); } catch(e){}
      }
    });
  }, { threshold, root, rootMargin });
  obs.observe(trigger);
  return { observer: obs, isObserving: ()=>observed, kill(){ try { obs.disconnect(); } catch(e){} observed = false; } };
}

function createScrubTrigger(opts = {}) {
  const { trigger, timeline, start = '100%', end = '0%', container = window, onUpdate = null } = opts;
  if (!isElement(trigger)) throw new Error('createScrubTrigger: trigger must be element');
  if (!timeline || typeof timeline.seek !== 'function') throw new Error('createScrubTrigger: timeline must be an Animix timeline');

  function parseOffset(value) {
    if (typeof value === 'number') return { type: 'px', value };
    const s = String(value).trim();
    const m = s.match(/^(-?[\d.]+)%$/);
    if (m) return { type: '%', value: parseFloat(m[1]) / 100 };
    const p = parseFloat(s);
    return isNaN(p) ? { type:'%', value:1 } : { type:'px', value: p };
  }
  const startSpec = parseOffset(start), endSpec = parseOffset(end);
  const getVH = () => window.innerHeight || document.documentElement.clientHeight || 0;
  let rafId = null, destroyed = false;

  function computeProgress() {
    if (destroyed) return 0;
    const rect = trigger.getBoundingClientRect();
    const vh = getVH();
    const startPx = startSpec.type === '%' ? vh * startSpec.value : startSpec.value;
    const endPx = endSpec.type === '%' ? vh * endSpec.value : endSpec.value;
    const denom = (startPx - endPx) || 1;
    const raw = (startPx - rect.top) / denom;
    return Math.min(1, Math.max(0, raw));
  }

  function update() {
    if (destroyed) return;
    const p = computeProgress();
    const time = p * (timeline.duration || 0);
    timeline.seek(time);
    try { if (typeof onUpdate === 'function') onUpdate(p, time); } catch(e){}
    rafId = null;
  }

  function onScroll() {
    if (destroyed) return;
    if (!rafId) rafId = requestAnimationFrame(update);
  }

  const target = (container && container !== window && isElement(container)) ? container : window;
  target.addEventListener('scroll', onScroll, { passive: true });
  target.addEventListener('resize', onScroll, { passive: true });
  onScroll();
  return { refresh(){ onScroll(); }, kill(){ destroyed = true; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } try { target.removeEventListener('scroll', onScroll); target.removeEventListener('resize', onScroll); } catch(e){} } };
}

function createSmoothScrub(opts = {}) {
  const { trigger, timeline, start = '100%', end = '0%', container = window, smoothing = 0.12, onUpdate = null } = opts;
  if (!isElement(trigger)) throw new Error('createSmoothScrub: trigger must be element');
  if (!timeline || typeof timeline.seek !== 'function') throw new Error('createSmoothScrub: timeline must be an Animix timeline');

  if (typeof timeline.duration !== 'number' || isNaN(timeline.duration)) {
    if (typeof console !== 'undefined' && console.warn) console.warn('createSmoothScrub: timeline has no numeric duration; smooth scrub will be a no-op until timeline.duration is set.');
  }

  function parseOffset(value) {
    if (typeof value === 'number') return { type: 'px', value };
    const s = String(value).trim();
    const m = s.match(/^(-?[\d.]+)%$/);
    if (m) return { type: '%', value: parseFloat(m[1]) / 100 };
    const p = parseFloat(s);
    return isNaN(p) ? { type:'%', value:1 } : { type:'px', value: p };
  }
  const startSpec = parseOffset(start), endSpec = parseOffset(end);
  const getVH = () => window.innerHeight || document.documentElement.clientHeight || 0;

  let destroyed = false, raw = 0, smooth = 0, rafId = null;

  function computeRaw() {
    if (destroyed) return 0;
    const rect = trigger.getBoundingClientRect();
    const vh = getVH();
    const startPx = startSpec.type === '%' ? vh * startSpec.value : startSpec.value;
    const endPx = endSpec.type === '%' ? vh * endSpec.value : endSpec.value;
    const denom = (startPx - endPx) || 1;
    const r = (startPx - rect.top) / denom;
    return Math.min(1, Math.max(0, r));
  }

  function loop() {
    rafId = null;
    raw = computeRaw();
    if (smoothing <= 0) smooth = raw;
    else smooth += (raw - smooth) * smoothing;
    const time = (timeline.duration || 0) * smooth;
    try { timeline.seek(time); } catch(e) {}
    try { if (typeof onUpdate === 'function') onUpdate(smooth, time); } catch(e){}
    if (!destroyed) rafId = requestAnimationFrame(loop);
  }

  function onScroll() {
    if (destroyed) return;
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  const target = (container && container !== window && isElement(container)) ? container : window;
  target.addEventListener('scroll', onScroll, { passive: true });
  target.addEventListener('resize', onScroll, { passive: true });
  if (!rafId) rafId = requestAnimationFrame(loop);

  return {
    refresh(){ raw = computeRaw(); smooth = raw; },
    kill(){ destroyed = true; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } try { target.removeEventListener('scroll', onScroll); target.removeEventListener('resize', onScroll); } catch(e){} }
  };
}

function createRevealOnEnter(opts = {}) {
  const { targets, vars = { y:0, opacity:1, duration:0.6 }, stagger = 0.06, root = null, rootMargin = '0px', threshold = 0.12, once = true, initialSet = true } = opts;
  const list = (isNodeList(targets) || Array.isArray(targets)) ? Array.from(targets) : [targets];
  if (!list.length) throw new Error('createRevealOnEnter: targets required');
  if (initialSet) {
    try {
      list.forEach(el => {
        if (!el) return;
        if (vars.opacity != null) { if (el.style) el.style.opacity = el.style.opacity || '0'; }
      });
    } catch(e){}
  }
  const tween = new Tween(list, vars.duration || 0.6, Object.assign({}, vars, { stagger, paused: true }));
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        try { tween.play(); } catch(e){}
        if (once) try {
          try { obs.unobserve(entry.target); } catch(_) {}
        } catch(e) {}
      }
    });
  }, { root, rootMargin, threshold });
  list.forEach(el => { try { if (el) obs.observe(el); } catch(e){} });
  return { tween, observer: obs, kill(){ try { tween.kill(); } catch(e){} try { obs.disconnect(); } catch(e){} } };
}

/* Public API */
const animix = {
  config: CONFIG,
  debug(enable){ CONFIG.debug = !!enable; return this; },

  to(target, durationOrVars, maybeVars){
    let duration = durationOrVars, vars = maybeVars;
    if (typeof durationOrVars === 'object' && maybeVars === undefined) { vars = durationOrVars || {}; duration = undefined; }
    vars = vars || {};
    const durFromVars = parseDuration(vars.duration);
    const finalDuration = (typeof durFromVars !== 'undefined') ? durFromVars : ((typeof duration !== 'undefined' && duration !== null) ? Number(duration) : 0.5);
    const list = toArr(target);
    const wantsIndividual = !!vars.individual;
    const wantsController = !!vars.controller;

    if (wantsIndividual && list.length > 1) {
      const staggerVal = (vars.stagger != null) ? vars.stagger : 0;
      const baseDelay = (typeof vars.delay === 'number') ? vars.delay : 0;
      const tweens = [];
      for (let i=0;i<list.length;i++){
        const el = list[i];
        const cloneVars = Object.assign({}, vars);
        let computedDelay = baseDelay;
        if (staggerVal != null) {
          if (typeof staggerVal === 'function') {
            try { computedDelay += Number(staggerVal(i, el, list)) || 0; } catch(e) {}
          } else {
            computedDelay += (parseFloat(staggerVal) || 0) * i;
          }
        }
        cloneVars.delay = computedDelay;
        delete cloneVars.individual; delete cloneVars.controller;
        const t = new Tween(el, finalDuration, cloneVars);
        tweens.push(t);
      }
      return wantsController ? new GroupController(tweens) : tweens;
    }

    const clone = Object.assign({}, vars);
    delete clone.individual; delete clone.controller;
    const tween = new Tween(list, finalDuration, clone);
    return wantsController ? new GroupController(tween) : tween;
  },

  from(target, durationOrFromVars, maybeFromVars){
    let duration = durationOrFromVars, fromVars = maybeFromVars;
    if (typeof durationOrFromVars === 'object' && maybeFromVars === undefined) { fromVars = durationOrFromVars || {}; duration = undefined; }
    fromVars = fromVars || {};
    const list = toArr(target);
    const durFromVars = parseDuration(fromVars.duration);
    const defaultDuration = (typeof durFromVars !== 'undefined') ? durFromVars : ((typeof duration !== 'undefined' && duration !== null) ? Number(duration) : 0.5);

    const controlKeys = ['delay','stagger','repeat','yoyo','repeatDelay','ease','onStart','onUpdate','onComplete','onCompleteAll','paused','immediateRender','motionPath'];

    const wantsIndividual = !!fromVars.individual;
    const wantsController = !!fromVars.controller;

    const skipKeys = new Set(['duration','controller','individual', ...controlKeys]);

    const csList = list.map(el => safeGetComputedStyle(el));

    const propKeys = [];
    for (const k in fromVars) {
      if (!skipKeys.has(k)) propKeys.push(k);
    }

    const valuesPerKey = {};
    for (const k of propKeys) valuesPerKey[k] = [];

    for (let i=0;i<list.length;i++){
      const el = list[i];
      const csBefore = csList[i] || {};
      for (const k of propKeys) {
        const keyLower = String(k).toLowerCase();
        if (k === 'x' || k === 'y' || k === 'z' || k === 'rotation' || k === 'rotate' || k === 'scale' ||
            keyLower === 'rotatex' || keyLower === 'rotationx' || keyLower === 'rotatey' || keyLower === 'rotationy' || keyLower === 'rotatez' || keyLower === 'rotationz') {
          const prop = (keyLower === 'rotatex' || keyLower === 'rotationx') ? 'rotationX' :
                       (keyLower === 'rotatey' || keyLower === 'rotationy') ? 'rotationY' :
                       (keyLower === 'rotatez' || keyLower === 'rotationz') ? 'rotationZ' :
                       (k === 'rotate') ? 'rotation' : k;
          const tTrans = decomposeTransform((csBefore && csBefore.transform) ? csBefore.transform : (el && el.style ? el.style.transform : undefined));
          const val = (tTrans && typeof tTrans[prop] === 'number') ? tTrans[prop] : (prop === 'scale' ? 1 : 0);
          valuesPerKey[k].push(val);
        } else if (/color$/i.test(k) || k === 'fill' || k === 'stroke' || k === 'backgroundColor' || k === 'background-color' || k === 'color') {
          const startStr = getComputedValue(el, csBefore, k);
          valuesPerKey[k].push(startStr || '');
        } else {
          const val = getComputedValue(el, csBefore, k);
          const n = parseFloat(val);
          valuesPerKey[k].push(!isNaN(n) ? n : val);
        }
      }
    }

    let allCommon = true;
    const commonToVars = {};
    for (const k of propKeys) {
      const arr = valuesPerKey[k];
      if (arr.length === 0) { allCommon = false; break; }
      const first = JSON.stringify(arr[0]);
      const same = arr.every(x => JSON.stringify(x) === first);
      if (!same) { allCommon = false; break; }
      commonToVars[k] = arr[0];
    }

    const setVars = Object.assign({}, fromVars);
    if (setVars.immediateRender === undefined) setVars.immediateRender = true;
    const setCopy = Object.assign({}, setVars);
    for (const rm of ['duration','delay','stagger','ease','paused','controller','individual','repeat','yoyo','repeatDelay','onStart','onUpdate','onComplete','onCompleteAll','immediateRender']) {
      delete setCopy[rm];
    }
    try { this.set(list, setCopy); } catch(e){}

    const finalDuration = defaultDuration;

    if (list.length > 1 && !wantsIndividual && allCommon) {
      const tweenVars = Object.assign({}, commonToVars);
      for (const key of controlKeys) {
        if (key in fromVars) tweenVars[key] = fromVars[key];
      }
      if (tweenVars.immediateRender === true) delete tweenVars.immediateRender;
      const tween = new Tween(list, finalDuration, tweenVars);
      return wantsController ? new GroupController(tween) : tween;
    }

    const tweens = [];
    for (let i=0;i<list.length;i++){
      const el = list[i];
      const toVars = {};
      for (const k of propKeys) {
        const arr = valuesPerKey[k];
        toVars[k] = (arr && typeof arr[i] !== 'undefined') ? arr[i] : undefined;
      }
      const tweenVars = Object.assign({}, toVars);
      for (const key of controlKeys) {
        if (key in fromVars) tweenVars[key] = fromVars[key];
      }
      if (tweenVars.immediateRender === true) delete tweenVars.immediateRender;
      const t = new Tween(el, finalDuration, tweenVars);
      tweens.push(t);
    }

    if (wantsController) return new GroupController(tweens);
    return tweens.length === 1 ? tweens[0] : tweens;
  },

  fromTo(target, durationOrFromVars, maybeFromVars, maybeToVars){
    let duration = durationOrFromVars, fromVars = maybeFromVars, toVars = maybeToVars;
    if (typeof durationOrFromVars === 'object' && typeof maybeFromVars === 'object' && maybeToVars === undefined) { fromVars = durationOrFromVars; toVars = maybeFromVars; duration = undefined; }
    fromVars = fromVars || {}; toVars = toVars || {};
    this.set(target, fromVars);
    const dur = parseDuration(toVars.duration || fromVars.duration);
    const finalDuration = (typeof dur !== 'undefined') ? dur : ((typeof duration !== 'undefined' && duration !== null) ? Number(duration) : 0.5);
    return this.to(target, finalDuration, toVars);
  },

  set(target, vars = {}) {
    const list = toArr(target);
    for (const el of list) {
      for (const k in vars) {
        const val = vars[k];
        const keyLower = String(k).toLowerCase();
        if (k === 'x' || k === 'y' || k === 'z' || k === 'rotation' || k === 'rotate' || k === 'scale' ||
            keyLower === 'rotatex' || keyLower === 'rotationx' || keyLower === 'rotatey' || keyLower === 'rotationy' || keyLower === 'rotatez' || keyLower === 'rotationz') {
          const prop = (keyLower === 'rotatex' || keyLower === 'rotationx') ? 'rotationX' :
                       (keyLower === 'rotatey' || keyLower === 'rotationy') ? 'rotationY' :
                       (keyLower === 'rotatez' || keyLower === 'rotationz') ? 'rotationZ' :
                       (k === 'rotate') ? 'rotation' : k;
          try {
            if (!el._animix) el._animix = { transform: identityTransform() };
            let numericVal = val;
            if (typeof val === 'string') {
              const parsed = parseRelative(0, val, el);
              if (typeof parsed.end === 'number') numericVal = parsed.end;
            }
            if (numericVal == null || numericVal === '') numericVal = (prop === 'scale' ? 1 : 0);
            el._animix.transform[prop] = numericVal;
            if (isSVG(el)) {
              const tr = el._animix.transform;
              el.setAttribute('transform', `translate(${tr.x||0},${tr.y||0}) rotate(${tr.rotation||0}) scale(${tr.scale||1})`);
            } else {
              const tr = el._animix.transform;
              if (el.style) el.style.transform = `translate3d(${tr.x||0}px, ${tr.y||0}px, ${tr.z||0}px) rotateX(${tr.rotationX||0}deg) rotateY(${tr.rotationY||0}deg) rotateZ(${tr.rotationZ||tr.rotation||0}deg) rotate(${tr.rotation||0}deg) scale(${tr.scale||1})`;
            }
            if (prop === 'rotationX' || prop === 'rotationY' || prop === 'z') {
              const parent = el.parentElement;
              if (parent) ensureParentPerspectiveOnAdd(parent, 600);
            }
          } catch(e){}
        } else if (k === 'motionPath') {
          try {
            const getter = motionPathToGetter(val);
            const pos = getter(0);
            if (!el._animix) el._animix = { transform: identityTransform() };
            if (typeof pos.x === 'number') el._animix.transform.x = pos.x;
            if (typeof pos.y === 'number') el._animix.transform.y = pos.y;
            if (typeof pos.rotation === 'number') el._animix.transform.rotation = pos.rotation;
            if (isSVG(el)) {
              const tr = el._animix.transform;
              el.setAttribute('transform', `translate(${tr.x||0},${tr.y||0}) rotate(${tr.rotation||0}) scale(${tr.scale||1})`);
            } else {
              const tr = el._animix.transform;
              if (el.style) el.style.transform = `translate3d(${tr.x||0}px, ${tr.y||0}px, ${tr.z||0}px) rotateX(${tr.rotationX||0}deg) rotateY(${tr.rotationY||0}deg) rotateZ(${tr.rotationZ||tr.rotation||0}deg) rotate(${tr.rotation||0}deg) scale(${tr.scale||1})`;
            }
          } catch(e){}
        } else if (/color$/i.test(k) || k === 'fill' || k === 'stroke' || k === 'backgroundColor' || k === 'background-color' || k === 'color') {
          try {
            const valueString = (typeof val === 'string') ? val : colorToString(val);
            if (k.indexOf('-') === -1 && el.style && (k in el.style)) {
              el.style[k] = valueString;
            } else {
              el.style.setProperty(cssPropName(k), valueString);
            }
          } catch(e){}
        } else {
          try {
            if (k.indexOf('-') === -1 && el.style && (k in el.style)) {
              el.style[k] = val;
            } else {
              el.style.setProperty(cssPropName(k), val);
            }
          } catch(e){}
        }
      }
      if (vars.transformOrigin) {
        try { if (el.style) el.style.transformOrigin = vars.transformOrigin; } catch(e){}
      }
    }
    return this;
  },

  timeline(opts) { return new Timeline(opts); },

  splitText,
  staggerTo,
  staggerFrom,
  staggerFromTo,
  killTweensOf,

  _internals: { Tween, Timeline, parseEase, parseColor, motionPathToGetter, manager, GroupController }
};

/* backward aliases */
animix.StaggerTo = animix.StaggerTo || animix.staggerTo;
animix.StaggerFrom = animix.StaggerFrom || animix.staggerFrom;
animix.StaggerFromTo = animix.StaggerFromTo || animix.staggerFromTo;

/* attach scrollTrigger helpers */
animix.scrollTrigger = {
  createEnterTrigger,
  createScrubTrigger,
  createSmoothScrub,
  createRevealOnEnter
};

export default animix;