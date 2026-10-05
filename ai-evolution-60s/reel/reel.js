// reel.js: a kinetic-typography reel (template from the kinetic-reel skill). Every frame is a pure function of t.
// Layers per frame:  WebGL backgrounds (particle terrain, liquid marble, chrome knot) → 2D canvas (type, HUD, shapes)
// → WebGL post pass (RGB split, slice glitch, grain, vignette, flash) → #out. The render.mjs contract: window.ready,
// renderAt(t), renderSheet(...), gpuInfo(), globals DUR + PROJECT.
import * as THREE from '../node_modules/three/build/three.module.js';

const W = 1920, H = 1080, C = KCUE, S = C.S, Hh = C.hits, FPS = C.fps, BEAT = 60 / C.bpm;
window.DUR = C.dur; window.PROJECT = { audio: 'assets/score.m4a' };
const K = { ink: '#050505', ink2: '#0e100e', cream: '#F5F2EA', lime: '#f5a623', amber: '#f5a623', blue: '#2F3CFF', red: '#E8412F', grey: '#8B908A', mid: '#5E625D' };
const F = { cond: '"Anton"', wide: '"Archivo Black"', serif: '"Instrument Serif"', mono: '"JetBrains Mono"', zh: '"Noto Sans SC"' };

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
const easeIn = x => Math.pow(clamp(x), 3);
const expoOut = x => { x = clamp(x); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); };
const backOut = x => { x = clamp(x); const s = 1.7; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const beatPulse = (t, k = 7) => Math.exp(-((t / BEAT) % 1) * k);
const TAU = Math.PI * 2;

// ---------- canvases ----------
const out = document.getElementById('out');
const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
let ctx = c2.getContext('2d');   // swapped to an offscreen buffer while a transition renders its two scenes
const mainCtx = ctx;
const mkBuf = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const bufA = mkBuf(), bufB = mkBuf(), bufT = mkBuf();   // outgoing scene · incoming scene · text-mask scratch
let TRANS = false;                                       // true while a scene renders inside a transition
const RECT = {};                                         // rects scenes register for zoom-through transitions
const glA = document.createElement('canvas'); glA.width = W; glA.height = H;
const RA = new THREE.WebGLRenderer({ canvas: glA, antialias: true, alpha: true, preserveDrawingBuffer: true });
RA.setPixelRatio(1); RA.setSize(W, H, false);
const RP = new THREE.WebGLRenderer({ canvas: out, antialias: false, preserveDrawingBuffer: true });
RP.setPixelRatio(1); RP.setSize(W, H, false); RP.outputColorSpace = THREE.LinearSRGBColorSpace;

// ---------- GL layer 1: particle terrain ----------
const terrain = (() => {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, W / H, .1, 100);
  const nx = 220, nz = 140, pos = new Float32Array(nx * nz * 3);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const k = (i * nz + j) * 3; pos[k] = (i / (nx - 1) - .5) * 26; pos[k + 1] = 0; pos[k + 2] = -j / (nz - 1) * 30 + 3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, amp: { value: 1 }, fade: { value: 1 }, tint: { value: new THREE.Color(K.cream) } },
    vertexShader: `uniform float time, amp; varying float vA;
      float wave(vec2 p, float t){ return sin(p.x*.5+t*.9)*.45 + sin(p.y*.38-t*.7)*.6 + sin((p.x+p.y)*.27+t*.5)*.7 + sin(length(p-vec2(3.,-9.))*.8-t*1.4)*.4; }
      void main(){ vec3 p = position; p.y = wave(p.xz, time)*amp; vec4 mv = modelViewMatrix*vec4(p,1.);
        gl_PointSize = 5.5 * (6.0 / -mv.z); float d = -mv.z; vA = clamp(1.0 - d/30.0, 0., 1.) * (.25 + .75*smoothstep(-1.2, 1.6, p.y)) * smoothstep(0.5, 3.5, d);
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float fade; uniform vec3 tint; varying float vA;
      void main(){ vec2 c = gl_PointCoord-.5; float r = dot(c,c); if (r>.25) discard; gl_FragColor = vec4(tint, vA*fade*(1.0-r*2.5)); }`,
  });
  scene.add(new THREE.Points(g, mat));
  return (t, o = {}) => {
    mat.uniforms.time.value = t; mat.uniforms.amp.value = o.amp ?? 1; mat.uniforms.fade.value = o.fade ?? 1;
    cam.position.set(Math.sin(t * .15) * 1.5, o.camY ?? 3.2, 5 - (o.push ?? 0)); cam.lookAt(0, -.4, -8); cam.rotation.z += o.roll ?? 0;
    RA.setClearColor(0x000000, 0); RA.clear(); RA.render(scene, cam);
    return glA;
  };
})();

// ---------- GL layer 2: liquid marble (domain-warped fbm, banded) ----------
const liquid = (() => {
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, res: { value: new THREE.Vector2(W, H) }, strips: { value: 0 }, stripAmt: { value: 0 }, zoom: { value: 1.6 }, seed: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `uniform float time, strips, stripAmt, zoom, seed; uniform vec2 res; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
      void main(){
        vec2 uv = vUv; vec2 p = (uv-.5)*vec2(res.x/res.y,1.)*zoom + seed;
        if (strips > 0.) { float s = floor(uv.x*strips); p.y += (h(vec2(s,3.))-.5)*stripAmt; p.x += (h(vec2(s,7.))-.5)*stripAmt*.25; }
        vec2 q = vec2(fbm(p + time*.06), fbm(p + vec2(5.2,1.3) - time*.05));
        vec2 r = vec2(fbm(p + 3.6*q + vec2(1.7,9.2) + time*.13), fbm(p + 3.6*q + vec2(8.3,2.8) - time*.11));
        float f = fbm(p + 3.8*r);
        float band = sin(f*22.0 + r.x*7.0)*.5+.5;
        vec3 blue = vec3(.19,.24,1.), red = vec3(.93,.33,.23), lil = vec3(.75,.68,.98), navy = vec3(.06,.07,.32), cream = vec3(.98,.9,.86);
        vec3 col = mix(blue, red, smoothstep(.38,.62,f));
        col = mix(col, lil, smoothstep(.62,.95,band)*.55);
        col = mix(col, navy, smoothstep(.55,.95,1.0-f)*.75);
        col = mix(col, cream, smoothstep(.93,1.,band)*smoothstep(.45,.7,f)*.5);
        gl_FragColor = vec4(col,1.);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  return (t, o = {}) => {
    const u = mat.uniforms; u.time.value = t; u.strips.value = o.strips || 0; u.stripAmt.value = o.stripAmt || 0; u.zoom.value = o.zoom ?? 1.6; u.seed.value = o.seed || 0;
    RA.setClearColor(0x000000, 1); RA.clear(); RA.render(scene, cam);
    return glA;
  };
})();

// ---------- GL layer 3: chrome torus knot (matcap + inked outline) ----------
const knot = (() => {
  const mc = document.createElement('canvas'); mc.width = mc.height = 256; const m = mc.getContext('2d');
  m.fillStyle = '#202020'; m.fillRect(0, 0, 256, 256);
  let g = m.createRadialGradient(96, 84, 4, 128, 128, 132);
  [[0, '#ffffff'], [.18, '#f2f2f2'], [.38, '#b9b9b9'], [.55, '#5c5c5c'], [.7, '#262626'], [.84, '#9d9d9d'], [.93, '#e6e6e6'], [1, '#5a5a5a']].forEach(([s, c]) => g.addColorStop(s, c));
  m.fillStyle = g; m.beginPath(); m.arc(128, 128, 128, 0, TAU); m.fill();
  g = m.createLinearGradient(0, 120, 0, 170); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.5, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  m.fillStyle = g; m.fillRect(0, 120, 256, 50);
  const tex = new THREE.CanvasTexture(mc); tex.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, W / H, .1, 100); cam.position.set(0, 0, 9);
  const geo = new THREE.TorusKnotGeometry(1.25, .34, 360, 48, 2, 3);
  const body = new THREE.Mesh(geo, new THREE.MeshMatcapMaterial({ matcap: tex }));
  const hull = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0e0f0e, side: THREE.BackSide })); hull.scale.setScalar(1.045);
  const grp = new THREE.Group(); grp.add(hull, body); scene.add(grp);
  return (t, o = {}) => {
    grp.rotation.set(t * .55 + (o.r0 || 0), t * .8, t * .25);
    grp.position.set(o.x ?? 1.9, o.y ?? 0, 0); grp.scale.setScalar(o.s ?? 1);
    RA.setClearColor(0x000000, 0); RA.clear(); RA.render(scene, cam);
    return glA;
  };
})();

// ---------- GL layer 4: a particle cloud that condenses into a thyroid (two lobes + isthmus) ----------
// k = 0: a loose shell (dust / embedding space) · k = 1: the gland. Points 0–2 can be highlighted (retrieved chunks);
// cloud.project(i, t, o) gives a point's screen position for 2D overlays (same maths as the shader, minus the wobble).
const cloud = (() => {
  const n = 9000, A = new Float32Array(n * 3), Bp = new Float32Array(n * 3), R = new Float32Array(n), ID = new Float32Array(n);
  let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const inside = (x, y) => {
    for (const s of [-1, 1]) { const cx = s * .62, cy = .05, a = -s * .28, dx = x - cx, dy = y - cy, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a); if ((u / .36) ** 2 + (v / .72) ** 2 < 1) return true; }
    return Math.abs(x) < .42 && y > -.42 && y < -.12;
  };
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, th = rnd() * TAU, r = 2.4 + rnd() * 1.3, q = Math.sqrt(1 - u * u);
    A.set([Math.cos(th) * q * r * 1.45, u * r * .8, Math.sin(th) * q * r], i * 3);
    let x, y; do { x = rnd() * 2.2 - 1.1; y = rnd() * 1.8 - .8; } while (!inside(x, y));
    Bp.set([x * 1.6, y * 1.6, (rnd() - .5) * .45], i * 3);
    R[i] = rnd(); ID[i] = i;
  }
  // move three front-and-centre shell points into slots 0–2 (the highlighted "retrieved chunks")
  let slot = 0;
  for (let i = 3; i < n && slot < 3; i++) {
    const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2];
    if (Math.abs(x) < 1.8 && Math.abs(y) < 1 && z > 1.2 && (slot === 0 || Math.hypot(x - A[0], y - A[1]) > .9) && (slot < 2 || Math.hypot(x - A[3], y - A[4]) > .9)) {
      for (const arr of [A, Bp]) for (let c = 0; c < 3; c++) { const tmp = arr[slot * 3 + c]; arr[slot * 3 + c] = arr[i * 3 + c]; arr[i * 3 + c] = tmp; }
      const tr = R[slot]; R[slot] = R[i]; R[i] = tr; slot++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(A.slice(), 3)); g.setAttribute('a', new THREE.BufferAttribute(A, 3));
  g.setAttribute('b', new THREE.BufferAttribute(Bp, 3)); g.setAttribute('r', new THREE.BufferAttribute(R, 1)); g.setAttribute('id', new THREE.BufferAttribute(ID, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, k: { value: 0 }, hi: { value: 0 }, size: { value: 4 }, fade: { value: 1 } },
    vertexShader: `attribute vec3 a; attribute vec3 b; attribute float r; attribute float id; uniform float time, k, hi, size; varying float vA; varying vec3 vC;
      void main(){
        float kk = clamp(k*1.4 - r*.4, 0., 1.); kk = kk*kk*(3.-2.*kk);
        vec3 wa = a + vec3(sin(time*.5+r*20.)*.08, cos(time*.4+r*13.)*.08, 0.);
        vec3 wb = b + vec3(sin(time*1.3+r*40.)*.015, cos(time*1.1+r*30.)*.015, 0.);
        vec4 mv = modelViewMatrix*vec4(mix(wa, wb, kk), 1.);
        float isHi = step(id, 2.5) * hi;
        gl_PointSize = size * (1. + 5.*isHi) * (7.0 / -mv.z);
        vA = (.3 + .45*kk) * (1. + 2.5*isHi);
        vC = mix(vec3(.95,.93,.9), vec3(.87,.96,.24), min(1., step(.86, r) + isHi));
        vC = mix(vC, vec3(.91,.25,.18), step(.965, r)*(1.-isHi));
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float fade; varying float vA; varying vec3 vC;
      void main(){ vec2 c = gl_PointCoord-.5; float d = dot(c,c); if (d>.25) discard; gl_FragColor = vec4(vC, vA*fade*(1.-d*3.)); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, W / H, .1, 100); cam.position.set(0, 0, 9); scene.add(pts);
  const pose = (t, o) => { pts.rotation.set(.12 * Math.sin(t * .3), o.rot ?? t * .25, 0); pts.position.set(o.x ?? 0, o.y ?? 0, 0); pts.scale.setScalar(o.s ?? 1); pts.updateMatrixWorld(); };
  const fn = (t, o = {}) => {
    const u = mat.uniforms; u.time.value = t; u.k.value = o.k ?? 0; u.hi.value = o.hi ?? 0; u.fade.value = o.fade ?? 1; u.size.value = o.size ?? 4;
    pose(t, o); RA.setClearColor(0x000000, 0); RA.clear(); RA.render(scene, cam); return glA;
  };
  const v = new THREE.Vector3();
  fn.project = (i, t, o = {}) => {
    let kk = clamp((o.k ?? 0) * 1.4 - R[i] * .4); kk = kk * kk * (3 - 2 * kk);
    pose(t, o); v.set(lerp(A[i * 3], Bp[i * 3], kk), lerp(A[i * 3 + 1], Bp[i * 3 + 1], kk), lerp(A[i * 3 + 2], Bp[i * 3 + 2], kk)).applyMatrix4(pts.matrixWorld).project(cam);
    return [(v.x * .5 + .5) * W, (-v.y * .5 + .5) * H];
  };
  return fn;
})();

// ---------- post pass ----------
const post = (() => {
  const tex = new THREE.CanvasTexture(c2); tex.colorSpace = THREE.NoColorSpace; tex.minFilter = tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: tex }, split: { value: 0 }, slice: { value: 0 }, seed: { value: 0 }, grain: { value: .05 }, time: { value: 0 }, vign: { value: .5 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 1, 1) }, res: { value: new THREE.Vector2(W, H) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `uniform sampler2D tex; uniform float split, slice, seed, grain, time, vign, flash; uniform vec3 flashCol; uniform vec2 res; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec2 uv = vUv;
        float band = floor(uv.y*28.0 + h(vec2(seed,1.))*3.0), hb = h(vec2(band, seed));
        if (hb < slice) uv.x += (h(vec2(band, seed+2.)) - .5) * .16 * slice;
        vec2 d = vec2(split, split*.15);
        vec3 c = vec3(texture2D(tex, uv + d).r, texture2D(tex, uv).g, texture2D(tex, uv - d).b);
        c += (h(vUv*res + time*61.7) - .5) * grain;
        vec2 q = vUv - .5; c *= 1.0 - vign*dot(q,q)*.9;
        c = mix(c, flashCol, flash);
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  return (t, fx) => {
    tex.needsUpdate = true;
    const u = mat.uniforms; u.split.value = fx.split; u.slice.value = fx.slice; u.seed.value = fx.seed; u.time.value = Math.floor(t * FPS);
    u.grain.value = fx.grain; u.vign.value = fx.vign; u.flash.value = fx.flash; u.flashCol.value.set(fx.flashCol);
    RP.render(scene, cam);
  };
})();

// ---------- 2D helpers ----------
let FX;
const font = (fam, size, weight = '') => `${weight} ${size}px ${fam}`.trim();
function txt(s, x, y, o = {}) {
  ctx.save();
  ctx.font = o.font; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic'; ctx.letterSpacing = (o.ls || 0) + 'px';
  ctx.globalAlpha = o.a ?? 1;
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowR || 28; }
  if (o.stroke) { ctx.lineWidth = o.lw || 2; ctx.strokeStyle = o.stroke; ctx.strokeText(s, x, y); }
  if (o.fill !== null) { ctx.fillStyle = o.fill || K.cream; ctx.fillText(s, x, y); }
  ctx.restore();
}
// per-letter animation: fn(i, n) → { dx, dy, r, s, a }
function letters(s, x, y, o, fn) {
  ctx.save(); ctx.font = o.font; ctx.letterSpacing = (o.ls || 0) + 'px';
  const total = ctx.measureText(s).width, x0 = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const ch = s[i]; if (ch === ' ') continue;
    const px = ctx.measureText(s.slice(0, i)).width, cw = ctx.measureText(ch).width, a = fn(i, n);
    if ((a.a ?? 1) <= 0.001) continue;
    ctx.save(); ctx.globalAlpha = a.a ?? 1; ctx.translate(x0 + px + cw / 2 + (a.dx || 0), y + (a.dy || 0)); ctx.rotate(a.r || 0); ctx.scale(a.s ?? 1, a.s ?? 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (o.stroke) { ctx.lineWidth = o.lw || 2; ctx.strokeStyle = o.stroke; ctx.strokeText(ch, 0, 0); }
    if (o.fill !== null) { ctx.fillStyle = a.fill || o.fill || K.cream; ctx.fillText(ch, 0, 0); }
    ctx.restore();
  }
  ctx.restore();
  return total;
}
const measure = (s, f, ls = 0) => { ctx.save(); ctx.font = f; ctx.letterSpacing = ls + 'px'; const w = ctx.measureText(s).width; ctx.restore(); return w; };
const bg = col => { ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); };
function line(pts, col, lw = 2, a = 1) { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.restore(); }
function circle(x, y, r, o = {}) { if (!(r > .01)) return; ctx.save(); ctx.globalAlpha = o.a ?? 1; ctx.beginPath(); ctx.arc(x, y, r, o.a0 ?? 0, o.a1 ?? TAU); if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); } if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 2; ctx.stroke(); } ctx.restore(); }
// the Jelly mark: a dome and four tentacles. (x, y) = centre of the dome's base; r = dome radius; k = 0..1 build-in
function jelly(x, y, r, col, t, k = 1, rot = 0) {
  if (!(r > .01)) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
  const dome = easeOut(seg(k, 0, .55));
  if (dome > 0) { ctx.beginPath(); ctx.arc(0, 0, r * dome, Math.PI, TAU); ctx.closePath(); ctx.fill(); }
  const tk = seg(k, .35, 1);
  for (let i = 0; i < 4; i++) {
    const xi = (-0.6 + i * .4) * r, L = r * (1.05 + .25 * (i % 2)) * easeOut(seg(tk, i * .12, .6 + i * .12));
    if (L < 1) continue;
    ctx.lineWidth = r * .16; ctx.beginPath(); ctx.moveTo(xi, r * .12);
    for (let s = 1; s <= 8; s++) { const q = s / 8; ctx.lineTo(xi + Math.sin(t * 5 + i * 1.3 - q * 4) * r * .12 * q, r * .12 + L * q); }
    ctx.stroke();
  }
  ctx.restore();
}
function starburst(x, y, r, n, col, rot = 0, inner = .62) { if (!(r > .01)) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, q = i % 2 ? r * inner : r; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); } ctx.closePath(); ctx.fill(); ctx.restore(); }
function asterisk(x, y, r, col, lw = 5, rot = 0) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'butt'; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(-Math.cos(a) * r, -Math.sin(a) * r); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); } ctx.restore(); }
function arrowNE(x, y, s, col, lw = 6) { line([[x, y + s], [x + s, y]], col, lw); line([[x + s * .35, y], [x + s, y], [x + s, y + s * .65]], col, lw); }
// HUD: corner brackets + micro-type in the four corners + a progress rule
function hud(t, o) {
  const dark = o.dark !== false, col = dark ? 'rgba(241,238,230,.85)' : 'rgba(14,15,14,.85)', dim = dark ? 'rgba(241,238,230,.45)' : 'rgba(14,15,14,.45)';
  const k = o.k ?? 1, m = 40, L = 26 * k;
  if (o.brackets !== false) for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) line([[cx, cy + sy * L], [cx, cy], [cx + sx * L, cy]], col, 2, k);
  const f = font(F.mono, 17, 500), a = clamp(k * 1.4 - .3);
  if (o.tl) txt(o.tl, m + 18, m + 30, { font: f, fill: col, ls: 2.5, a });
  if (o.tr) txt(o.tr, W - m - 18, m + 30, { font: f, fill: col, ls: 2.5, align: 'right', a });
  if (o.bl) txt(o.bl, m + 18, H - m - 18, { font: f, fill: col, ls: 2.5, a });
  if (o.br) txt(o.br, W - m - 18, H - m - 18, { font: f, fill: col, ls: 2.5, align: 'right', a });
  if (o.zh) txt(o.zh, o.zhRight ? W - m - 18 : m + 18, H - m - 52, { font: font(F.zh, 21, 500), fill: dim, ls: 3, align: o.zhRight ? 'right' : 'left', a });
  if (o.progress !== false) {   // the reel as a trace: one segment per chapter, filled as it plays
    const y = H - m + 10, x0 = m + 18, x1 = W - m - 18, X = s => lerp(x0, x1, s / C.dur);
    for (const [, a0, a1] of C.CH) {
      const xa = X(a0) + 3, xb = X(a1) - 3, on = t >= a0 && t < a1;
      line([[xa, y], [xb, y]], dim, 1, a * .6);
      if (t > a0) line([[xa, y], [Math.min(xb, X(t)), y]], col, on ? 3 : 2, a);
    }
  }
}
const tc = t => { const f = Math.floor(t * FPS), s = Math.floor(f / FPS), fr = f % FPS, p = n => String(n).padStart(2, '0'); return `TC 00:00:${p(s)}:${p(fr)}`; };
const sec = (i, name) => `■ ${String(i).padStart(2, '0')} / ${String(C.CH.filter(c => /^\d/.test(c[0])).length).padStart(2, '0')}   ${name}`;
const glShot = (canvas, a = 1) => { ctx.save(); ctx.globalAlpha = a; ctx.drawImage(canvas, 0, 0, W, H); ctx.restore(); };
const count = (t, t0, t1, v0, v1) => Math.round(lerp(v0, v1, expoOut(seg(t, t0, t1))));

// ---------- scenes ----------
function odometer(v0, v1, k, x, y, f, col) {   // digits roll from v0 to v1
  const s0 = String(v0), s1 = String(v1); ctx.save(); ctx.font = f;
  let xx = x; const hgt = parseFloat(f.match(/(\d+)px/)[1]) * .92;
  for (let i = 0; i < s1.length; i++) {
    const d0 = +s0[i], d1 = +s1[i], w = ctx.measureText(s1[i]).width, kk = expoOut(clamp(k * 1.2 - i * .15));
    ctx.save(); ctx.beginPath(); ctx.rect(xx - 10, y - hgt, w + 20, hgt * 1.12); ctx.clip();
    const steps = (d1 - d0 + 10) % 10 || 10, off = kk * steps;
    for (let j = -1; j <= steps + 1; j++) { const dy = (j - off) * hgt; if (Math.abs(dy) > hgt * 1.2) continue; ctx.fillStyle = col; ctx.fillText(String((d0 + j + 10) % 10), xx, y + dy); }
    ctx.restore(); xx += w;
  }
  ctx.restore(); return xx;
}
function tape(t, y, rot, col, fg, words, speed, dir, k) {
  ctx.save(); ctx.translate(W / 2, y); ctx.rotate(rot); ctx.translate(lerp(dir * W * 1.4, 0, expoOut(k)), 0);
  ctx.fillStyle = col; ctx.fillRect(-W * 1.5, -85, W * 3, 170);
  const f = font(F.cond, 128), unit = words.map(w => measure(w, f) + 170).reduce((a, b) => a + b, 0), off = ((t * speed) % unit + unit) % unit;
  let x = -W * 1.4 - off * dir;
  while (x < W * 1.5) for (const w of words) { txt(w, x, 50, { font: f, fill: fg }); const ww = measure(w, f); if (w !== '') { if (words.indexOf(w) % 2 === 0) asterisk(x + ww + 85, 0, 34, fg, 7, t); else arrowNE(x + ww + 55, -32, 62, fg, 8); } x += ww + 170; }
  ctx.restore();
}
// ---------- v2 helpers ----------
function rrect(x, y, w, h, r, o = {}) { if (!(w > .5) || !(h > .5)) return; ctx.save(); ctx.globalAlpha = o.a ?? 1; ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); } if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 2; ctx.stroke(); } ctx.restore(); }
// a label chip, left edge at x, vertically centred on y; k = 0..1 wipe-in. Returns its width.
function chip(s, x, y, o = {}) {
  const f = o.font || font(F.mono, 18, 700), ls = o.ls ?? 2, w = measure(s, f, ls) + 28, h = o.h || 38, k = o.k ?? 1;
  if (k <= 0) return w;
  rrect(x, y - h / 2, w * easeOut(k), h, o.r ?? 0, { fill: o.bg || K.ink, stroke: o.line, lw: o.lw, a: o.a });
  if (k > .6) txt(s, x + 14, y + 6.5, { font: f, fill: o.fg || K.cream, ls, a: (o.a ?? 1) * seg(k, .6, 1) });
  return w;
}
function arrow(x0, y0, x1, y1, col, lw = 2, a = 1, head = 13) {
  if (a <= 0) return;
  line([[x0, y0], [x1, y1]], col, lw, a); const g = Math.atan2(y1 - y0, x1 - x0);
  line([[x1 - Math.cos(g - .45) * head, y1 - Math.sin(g - .45) * head], [x1, y1], [x1 - Math.cos(g + .45) * head, y1 - Math.sin(g + .45) * head]], col, lw, a);
}
// big number + small label under it
function stat(v, label, x, y, o = {}) {
  const k = o.k ?? 1; if (k <= 0) return;
  txt(v, x, y + (1 - easeOut(k)) * 24, { font: font(F.cond, o.size || 110), fill: o.col || K.cream, a: k, align: o.align });
  txt(label, x + (o.align === 'right' ? 0 : 4), y + (o.gap || 38), { font: font(F.mono, o.ls ? 16 : 17, 700), fill: o.sub || 'rgba(241,238,230,.7)', ls: 2.5, a: k, align: o.align });
}
const pad2 = n => String(n).padStart(2, '0');
// drop-in word: letters fall from above with overshoot
const dropWord = (s, x, y, f, t0, t, o = {}) => letters(s, x, y, { font: f, fill: o.fill || K.cream, align: o.align }, (i) => {
  const k = seg(t, t0 + i * (o.stag ?? .03), t0 + i * (o.stag ?? .03) + (o.dur ?? .32)); return { dy: (1 - expoOut(k)) * (o.fall ?? 220), a: k > 0 ? 1 : 0, fill: o.fillAt ? o.fillAt(i) : undefined };
});
const glitchIn = (lt, seed, d = .14, amt = .5) => { if (!TRANS && lt < d) { FX.slice = Math.max(FX.slice, amt * (1 - lt / d)); FX.split = Math.max(FX.split, .006 * (1 - lt / d)); FX.seed = seed; } };
// ---------- 01 MICROSOFT CLOUD & AI ----------
// ---------- 02 UW SURGERY · 03 PROJECTS ----------
// ---------- v3 helpers ----------
// Letters as windows onto a shader: draw() into a scratch buffer, keep only `src` inside what was drawn.
function texWindow(draw, src) {
  const saved = ctx, g = bufT.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H);
  ctx = g; draw(); ctx = saved;
  g.globalCompositeOperation = 'source-in'; g.drawImage(src, 0, 0, W, H); g.globalCompositeOperation = 'source-over';
  ctx.drawImage(bufT, 0, 0);
}
function redacted(x, y, w, h, seed, col, a = 1) {   // a line of "text" as blocks (never real content)
  let xx = x; const end = x + w;
  for (let j = 0; xx < end - 10; j++) { const ww = Math.min(end - xx, 30 + 90 * hash(seed * 13 + j)); rrect(xx, y, ww, h, h / 2, { fill: col, a }); xx += ww + 10; }
}
const bez = (p0, c0, c1, p1, u) => { const v = 1 - u; return [v * v * v * p0[0] + 3 * v * v * u * c0[0] + 3 * v * u * u * c1[0] + u * u * u * p1[0], v * v * v * p0[1] + 3 * v * v * u * c0[1] + 3 * v * u * u * c1[1] + u * u * u * p1[1]]; };
function thread(p0, p1, k, col, lw = 2.5) {   // a cubic "citation thread", drawn up to k
  if (k <= 0) return; const c0 = [p0[0] + 160, p0[1]], c1 = [p1[0] - 160, p1[1]], pts = [];
  for (let i = 0; i <= 40 * k; i++) pts.push(bez(p0, c0, c1, p1, i / 40));
  if (pts.length > 1) line(pts, col, lw);
}
const DARK = '#0B0D0C';

// ---------- index ----------
// ---------- 02 UW–MADISON DEPARTMENT OF SURGERY ----------
// ---------- 03 ENTERPRISE RAG ----------
// ---------- finale: the whole reel as a trace ----------
// ---------- transitions (into a scene; A = outgoing scene frozen on its last frame, B = incoming, live) ----------
const easeInOut = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const ioExpo = x => { x = clamp(x); return x === 0 ? 0 : x === 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2; };
const trIris = (cx, cy, ring = K.lime) => (k, A, B, g) => {
  const e = easeIn(k) * .6 + ease(k) * .4, R = e * Math.hypot(W, H);
  g.drawImage(A, 0, 0); g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip(); g.drawImage(B, 0, 0); g.restore();
  g.save(); g.strokeStyle = ring; g.lineWidth = 2 + 10 * (1 - e); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke(); g.restore();
};
const trZoom = rect => (k, A, B, g) => {   // zoom into a UI element of A; B is seen through it, then fills the frame
  const [rx, ry, rw, rh] = typeof rect === 'function' ? rect() : rect, e = ioExpo(k), s1 = Math.max(W / rw, H / rh), s = Math.pow(s1, e);
  const cx = rx + rw / 2, cy = ry + rh / 2, px = lerp(cx, W / 2, e), py = lerp(cy, H / 2, e);
  g.save(); g.translate(px, py); g.scale(s, s); g.translate(-cx, -cy); g.drawImage(A, 0, 0); g.restore();
  g.save(); g.beginPath(); g.rect(px - rw / 2 * s, py - rh / 2 * s, rw * s, rh * s); g.clip(); g.globalAlpha = clamp(e * 2.2 - .2); g.drawImage(B, 0, 0); g.restore();
  FX.split = Math.max(FX.split, .008 * Math.sin(Math.PI * e));
};
const trPush = (dx, dy) => (k, A, B, g) => { const e = ioExpo(k); g.drawImage(A, -dx * W * e, -dy * H * e); g.drawImage(B, dx * W * (1 - e), dy * H * (1 - e)); FX.split = Math.max(FX.split, .012 * Math.sin(Math.PI * e)); };
const trWipe = (col = K.lime) => (k, A, B, g) => { const x = easeInOut(k) * (W + 40); g.drawImage(A, 0, 0); g.save(); g.beginPath(); g.rect(0, 0, x, H); g.clip(); g.drawImage(B, 0, 0); g.restore(); g.fillStyle = col; g.fillRect(x - 4, 0, 8, H); };
const trSlats = (n = 12) => (k, A, B, g) => { g.drawImage(A, 0, 0); const sw = W / n; for (let i = 0; i < n; i++) { const kk = easeInOut(seg(k, i * .035, i * .035 + .6)); if (kk <= 0) continue; g.save(); g.beginPath(); g.rect(i * sw, 0, sw * kk + 1, H); g.clip(); g.drawImage(B, 0, 0); g.restore(); } };
const trGrid = (cols = 16, rows = 9, col = K.lime) => (k, A, B, g) => {
  g.drawImage(A, 0, 0); const cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = (c + r) / (cols + rows - 2), kk = seg(k, d * .6, d * .6 + .4); if (kk <= 0) continue;
    const x = c * cw, y = r * ch;
    if (kk < .5) { const s = kk * 2; g.fillStyle = col; g.fillRect(x + cw * (1 - s) / 2, y + ch * (1 - s) / 2, cw * s, ch * s); }
    else { g.save(); g.beginPath(); g.rect(x, y, cw + 1, ch + 1); g.clip(); g.drawImage(B, 0, 0); g.restore(); if (kk < 1) { g.globalAlpha = 2 - kk * 2; g.fillStyle = col; g.fillRect(x, y, cw + 1, ch + 1); g.globalAlpha = 1; } }
  }
};
function sB1(t){
  const lt=t-S.b1;
  bg(K.ink);
  
  // 1. Giant year warp
  const labelFade=clamp(seg(t,0,0.6));
  txt('AI 进化之路 · FROM CHATGPT',960,150,{font:font(F.mono,22,700),fill:K.cream,align:'center',a:labelFade,ls:6});
  
  const yearK=expoOut(seg(t,0,1.2));
  const yearScale=lerp(2.6,1,yearK);
  ctx.save();
  ctx.translate(960,430);
  ctx.scale(yearScale,yearScale);
  txt('2022',0,0,{font:font(F.cond,340),fill:K.amber,align:'center',base:'middle',glow:'rgba(245,166,35,.9)',glowR:30});
  ctx.restore();
  
  // 2. Chat window
  const cardK=ease(seg(t,1.4,1.9));
  const cardY=lerp(600,540,cardK);
  rrect(460,cardY,1000,360,28,{fill:K.ink2,stroke:'rgba(245,242,234,.25)',lw:2,a:cardK});
  
  RECT.b1bubble=[520,700,620,120];
  
  // 3. User bubble
  if(t>=1.9){
    rrect(1010,580,330,90,45,{fill:'rgba(245,242,234,.12)',stroke:'rgba(245,242,234,.35)'});
    const userT=t-Hh.typeUser;
    const userN=Math.max(0,Math.floor(userT/0.35));
    const userS='你好';
    const userF=font(F.zh,34,500);
    txt(userS.slice(0,userN),1175,628,{font:userF,fill:K.cream,align:'center',base:'middle',ls:6});
    if(userN<userS.length && Math.floor(t*2.5)%2===0){
      txt('|',1175+measure(userS.slice(0,userN),userF,6)/2+10,628,{font:userF,fill:K.amber,align:'center',base:'middle'});
    }
  }
  
  // 4. AI bubble
  if(t>=2.6){
    rrect(520,700,620,120,30,{fill:K.ink,stroke:K.amber,lw:2.5});
    const aiT=t-Hh.typeAI;
    const aiN=Math.max(0,Math.floor(aiT/0.12));
    const aiS='你好！我是 ChatGPT';
    const aiF=font(F.zh,34,500);
    txt(aiS.slice(0,aiN),830,760,{font:aiF,fill:K.amber,align:'center',base:'middle',ls:6,glow:'rgba(245,166,35,.6)',glowR:16});
    if(aiN<aiS.length && Math.floor(t*2.5)%2===0){
      txt('|',830+measure(aiS.slice(0,aiN),aiF,6)/2+10,760,{font:aiF,fill:K.amber,align:'center',base:'middle'});
    }
  }
  
  // 5. Counter
  if(t>=Hh.counter){
    txt('上线 2 个月',1420,860,{font:font(F.mono,18,500),fill:K.grey,align:'right',ls:2});
    const num=count(t,5.2,6.9,0,100);
    txt(num+'M',1420,940,{font:font(F.cond,96),fill:K.cream,align:'right',base:'alphabetic'});
    txt('用户破亿',1420,940,{font:font(F.mono,22,500),fill:K.mid,align:'left',base:'alphabetic',ls:2});
  }
  
  hud(t,{tl:'01 / 对话',tr:'2022.11',bl:'■ 01 / 08   CHATGPT',br:'SCHEMATIC · 演示对话',zh:'你问，它答'});
}

function sB2(t){
  const lt=t-S.b2;
  bg(K.ink);
  
  // 1. Giant year warp
  const labelFade=clamp(seg(t,7.5,8.1));
  txt('AI 长出了手',960,150,{font:font(F.mono,22,700),fill:K.cream,align:'center',a:labelFade,ls:6});
  
  const yearK=expoOut(seg(t,7.5,8.7));
  const yearScale=lerp(2.6,1,yearK);
  ctx.save();
  ctx.translate(960,430);
  ctx.scale(yearScale,yearScale);
  txt('2023',0,0,{font:font(F.cond,340),fill:K.amber,align:'center',base:'middle',glow:'rgba(245,166,35,.9)',glowR:30});
  ctx.restore();
  
  // 2. Main gear
  const gearK=backOut(seg(t,Hh.gear,Hh.gear+0.8));
  const gearScale=gearK;
  ctx.save();
  ctx.translate(680,560);
  ctx.scale(gearScale,gearScale);
  ctx.rotate(t*0.5);
  for(let i=0;i<12;i++){
    ctx.save();
    ctx.rotate(i*TAU/12);
    rrect(-24,-190,48,60,8,{fill:'rgba(245,242,234,.9)'});
    ctx.restore();
  }
  ctx.restore();
  circle(680,560,150*gearScale,{stroke:'rgba(245,242,234,.9)',lw:10,a:gearK});
  circle(680,560,55*gearScale,{stroke:K.amber,lw:8,a:gearK});
  
  // 3. Small gear
  const gear2K=backOut(seg(t,8.8,9.6));
  const gear2Scale=gear2K;
  ctx.save();
  ctx.translate(1180,640);
  ctx.scale(gear2Scale,gear2Scale);
  ctx.rotate(-t*0.7);
  for(let i=0;i<8;i++){
    ctx.save();
    ctx.rotate(i*TAU/8);
    rrect(-14,-105,28,35,6,{fill:'rgba(245,242,234,.85)'});
    ctx.restore();
  }
  ctx.restore();
  circle(1180,640,85*gear2Scale,{stroke:'rgba(245,242,234,.85)',lw:7,a:gear2K});
  circle(1180,640,30*gear2Scale,{stroke:K.amber,lw:5,a:gear2K});
  
  // 4. Code card
  const codeK=ease(seg(t,Hh.code-0.3,Hh.code+0.3));
  rrect(1290,300,470,300,16,{fill:K.ink2,stroke:'rgba(245,242,234,.2)',a:codeK});
  rrect(1290,300,8,300,4,{fill:K.amber,a:codeK});
  
  const codeLines=['functions.create(','  name: "get_weather",','  run: async () =>','});'];
  const codeF=font(F.mono,24,500);
  for(let i=0;i<codeLines.length;i++){
    const lineK=clamp(seg(t,Hh.code+i*0.25,Hh.code+i*0.25+0.5));
    txt(codeLines[i],1320,370+i*52,{font:codeF,fill:K.cream,a:lineK,base:'top'});
  }
  
  // 5. Chips
  const chip1K=clamp(seg(t,Hh.chips,Hh.chips+0.6));
  const chip1W=chip('函数调用',140,920,{k:chip1K,bg:K.amber,fg:K.ink,font:font(F.zh,26,500),ls:4,h:58,r:999});
  const chip2K=clamp(seg(t,Hh.chips+0.2,Hh.chips+0.8));
  chip('GPTs',160+chip1W,920,{k:chip2K,bg:K.ink2,fg:K.cream,font:font(F.cond,32),ls:1,h:58,r:999,line:K.cream,lw:2});
  
  hud(t,{tl:'02 / 出手',tr:'2023',bl:'■ 02 / 08   TOOLS',br:'函数调用 · GPTS',zh:'从聊天，到动手',zhRight:true});
}

function sB3(t){
  const lt=t-S.b3;
  bg(K.ink);
  
  ctx.save();
  ctx.translate(960,430);
  const sc=lerp(2.6,1,expoOut(seg(t,15,16.2)));
  ctx.scale(sc,sc);
  txt('2024',0,0,{font:font(F.cond,340),fill:K.amber,align:'center',glow:'rgba(245,166,35,.9)',glowR:30,a:seg(t,15,15.6)});
  ctx.restore();
  
  if(t>16.2){
    txt('2024',140,200,{font:font(F.cond,120),fill:K.amber,align:'left',a:seg(t,16.2,16.8)});
    txt('05月',370,200,{font:font(F.mono,42,700),fill:K.amber,align:'left',ls:2,a:seg(t,16.5,17.1)});
  }
  
  const capK=backOut(seg(t,Hh.capsule,Hh.capsule+0.5));
  if(capK>0){
    ctx.save();
    ctx.translate(960,490);
    ctx.scale(lerp(0.6,1,capK),lerp(0.6,1,capK));
    rrect(-260,-70,520,140,70,{fill:K.ink2,stroke:'rgba(245,242,234,.4)',lw:2,a:capK});
    rrect(-200,-35,90,70,14,{fill:'#1c1e1c',stroke:'rgba(245,242,234,.5)',lw:2,a:capK});
    txt('OPT',-155,18,{font:font(F.mono,30,700),fill:K.cream,align:'center',a:capK});
    txt('+',-60,15,{font:font(F.mono,40,700),fill:K.grey,align:'center',a:capK});
    rrect(-10,-35,210,70,14,{fill:'#1c1e1c',stroke:K.amber,lw:2,a:capK});
    txt('SPACE',95,18,{font:font(F.mono,30,700),fill:K.amber,align:'center',a:capK});
    ctx.restore();
  }
  RECT.b3capsule=[700,420,520,140];
  
  const shotK=seg(t,Hh.shot,Hh.shot+0.8);
  if(shotK>0){
    const x0=1330,y0=180,x1=1790,y1=470;
    const w=x1-x0,h=y1-y0;
    const dashLen=20,gapLen=12;
    
    for(let d=0;d<w;d+=dashLen+gapLen){
      const d2=Math.min(d+dashLen,w);
      const prog=d2/w;
      if(prog<=shotK)line([[x0+d,y0],[x0+d2,y0]],K.amber,2,1);
    }
    for(let d=0;d<h;d+=dashLen+gapLen){
      const d2=Math.min(d+dashLen,h);
      const prog=d2/h;
      if(prog<=shotK)line([[x1,y0+d],[x1,y0+d2]],K.amber,2,1);
    }
    for(let d=0;d<w;d+=dashLen+gapLen){
      const d2=Math.min(d+dashLen,w);
      const prog=d2/w;
      if(prog<=shotK)line([[x1-d,y1],[x1-d2,y1]],K.amber,2,1);
    }
    for(let d=0;d<h;d+=dashLen+gapLen){
      const d2=Math.min(d+dashLen,h);
      const prog=d2/h;
      if(prog<=shotK)line([[x0,y1-d],[x0,y1-d2]],K.amber,2,1);
    }
    
    line([[x0-15,y0],[x0,y0],[x0,y0+15]],K.amber,4,shotK);
    line([[x1+15,y0],[x1,y0],[x1,y0+15]],K.amber,4,shotK);
    line([[x0-15,y1],[x0,y1],[x0,y1-15]],K.amber,4,shotK);
    line([[x1+15,y1],[x1,y1],[x1,y1-15]],K.amber,4,shotK);
    
    txt('SCREENSHOT',1560,200,{font:font(F.mono,20,700),fill:K.amber,align:'center',ls:3,a:shotK});
  }
  
  chip('macOS',830,760,{k:seg(t,20.0,20.4),bg:K.ink2,fg:K.cream,line:'rgba(245,242,234,.4)',font:font(F.mono,22,700),h:48,r:999});
  arrow(990,760,1050,760,K.amber,3,seg(t,20.4,20.7),10);
  chip('Windows',1060,760,{k:seg(t,20.7,21.1),bg:K.amber,fg:K.ink,font:font(F.mono,22,700),h:48,r:999});
  
  hud(t,{tl:'03 / 桌面',tr:'2024.05',bl:'■ 03 / 08   DESKTOP',br:'MAC → WINDOWS',zh:'AI 搬进桌面 · 随叫随到'});
}

function sB4(t){
  const lt=t-S.b4;
  bg(K.ink);
  
  for(let x=0;x<=W;x+=120){
    line([[x,0],[x,H]],'rgba(245,242,234,.05)',1);
  }
  for(let y=0;y<=H;y+=120){
    line([[0,y],[W,y]],'rgba(245,242,234,.05)',1);
  }
  
  ctx.save();
  ctx.translate(960,430);
  const sc=lerp(2.6,1,expoOut(seg(t,22.5,23.7)));
  ctx.scale(sc,sc);
  txt('2024',0,0,{font:font(F.cond,340),fill:K.amber,align:'center',glow:'rgba(245,166,35,.9)',glowR:30,a:seg(t,22.5,23.1)});
  ctx.restore();
  
  if(t>23.7){
    txt('2024',140,200,{font:font(F.cond,120),fill:K.amber,align:'left',a:seg(t,23.7,24.3)});
    txt('10月',370,200,{font:font(F.mono,42,700),fill:K.amber,align:'left',ls:2,a:seg(t,24.0,24.6)});
  }
  
  let cx,cy;
  const p0=[420,720],p1=[960,500],p2=[1420,660];
  if(t<Hh.move){
    cx=p0[0];cy=p0[1];
  }else if(t<Hh.click+0.6){
    const k=ease(seg(t,Hh.move,Hh.click+0.6));
    cx=lerp(p0[0],p1[0],k);
    cy=lerp(p0[1],p1[1],k);
  }else if(t<Hh.drag){
    cx=p1[0];cy=p1[1];
  }else if(t<29.2){
    const k=ease(seg(t,Hh.drag,29.2));
    cx=lerp(p1[0],p2[0],k);
    cy=lerp(p1[1],p2[1],k);
  }else{
    cx=p2[0];cy=p2[1];
  }
  
  const cardX=t<Hh.drag?900:(t<29.2?cx-60:cx-60);
  const cardY=t<Hh.drag?440:(t<29.2?cy-30:cy-30);
  const cardA=t<29.2?1:Math.max(0,1-seg(t,29.2,29.6)*2);
  
  if(cardA>0){
    rrect(cardX,cardY,120,150,10,{fill:K.ink2,stroke:'rgba(245,242,234,.4)',lw:2,a:cardA});
    for(let i=0;i<3;i++){
      line([[cardX+20,cardY+40+i*30],[cardX+100,cardY+40+i*30]],K.grey,2,cardA);
    }
  }
  
  const folderX=1340,folderY=620;
  const folderK=seg(t,28.0,28.6);
  if(folderK>0){
    rrect(1360,600,90,26,6,{fill:K.amber,a:folderK});
    const folderFill=t>29.2&&t<30?'rgba(245,166,35,.6)':'rgba(245,166,35,.25)';
    rrect(folderX,folderY,180,120,10,{fill:folderFill,stroke:K.amber,lw:2,a:folderK});
  }
  
  if(t>29.2){
    const checkK=seg(t,29.2,29.8);
    if(checkK>0){
      line([[folderX+50,folderY-20],[folderX+70,folderY-5]],K.amber,5,checkK);
      line([[folderX+70,folderY-5],[folderX+110,folderY-40]],K.amber,5,checkK);
    }
  }
  
  if(t>=23.2){
    ctx.save();
    ctx.translate(cx,cy);
    ctx.fillStyle=K.cream;
    ctx.shadowColor='rgba(245,242,234,.8)';
    ctx.shadowBlur=18;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(0,52);
    ctx.lineTo(14,40);
    ctx.lineTo(21,56);
    ctx.lineTo(28,52);
    ctx.lineTo(21,36);
    ctx.lineTo(34,36);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur=0;
    ctx.restore();
  }
  
  if(t>=Hh.click&&t<Hh.click+1.5){
    for(let i=0;i<3;i++){
      const r=(t-Hh.click-i*0.18)*260;
      const a=clamp(1-(t-Hh.click-i*0.18)/1.2);
      if(a>0){
        circle(p1[0],p1[1],r,{stroke:K.amber,lw:3,a:a});
      }
    }
    const burstK=seg(t,Hh.click,Hh.click+0.3);
    if(burstK>0){
      starburst(p1[0],p1[1],30*burstK,8,K.amber,t*3,.62);
    }
  }
  
  hud(t,{tl:'04 / 眼手',tr:'2024.10',bl:'■ 04 / 08   COMPUTER USE',br:'看屏幕 · 点鼠标',zh:'AI 有了眼和手',zhRight:true});
}

function sB5(t){
const lt=t-S.b5;
bg(K.ink);

ctx.save();
ctx.translate(960,430);
const sc=lerp(2.6,1,expoOut(seg(t,S.b5,S.b5+1.2)));
ctx.scale(sc,sc);
txt('2025',0,0,{font:font(F.cond,340),fill:K.amber,align:'center',glow:'rgba(245,166,35,.9)',glowR:30});
ctx.restore();

const yearSmallA=seg(t,S.b5+1.2,S.b5+1.8);
txt('2025',140,200,{font:font(F.cond,120),fill:K.amber,align:'left',a:yearSmallA});

const cardK=backOut(seg(t,S.b5+0.4,S.b5+0.9));
if(cardK>0){
rrect(660,300,600,120,18,{fill:K.ink2,stroke:K.amber,lw:2.5,a:cardK});
txt('调研 10 家 AI 智能体平台',960,352,{font:font(F.zh,36,700),fill:K.cream,align:'center',ls:6,a:cardK});
txt('ONE GOAL →',960,398,{font:font(F.mono,20,700),fill:K.amber,align:'center',ls:4,a:cardK});
}

const nodes=[
{cx:560,cy:640,label:'调研',sub:'BROWSE'},
{cx:960,cy:680,label:'对比',sub:'COMPARE'},
{cx:1360,cy:640,label:'做表',sub:'TABLE'}
];

const ticks=[32.4,33.4,34.4,35.4];
const checked=[false,false,false];
for(let i=0;i<3;i++){
if(t>=ticks[i])checked[i]=true;
}

for(let i=0;i<3;i++){
const n=nodes[i];
const nk=backOut(seg(t,31.0+i*0.15,31.6+i*0.15));
if(nk>0){
ctx.save();
ctx.translate(n.cx,n.cy);
ctx.scale(nk,nk);
ctx.translate(-n.cx,-n.cy);
rrect(n.cx-150,n.cy-55,300,110,16,{fill:K.ink2,stroke:checked[i]?K.amber:'rgba(245,242,234,.35)',lw:2});
txt(n.label,n.cx,n.cy-10,{font:font(F.zh,32,700),fill:K.cream,align:'center',ls:6});
txt(n.sub,n.cx,n.cy+30,{font:font(F.mono,18,700),fill:K.grey,align:'center',ls:4});
ctx.restore();

const tk=seg(t,31.0+i*0.15,31.6+i*0.15);
if(tk>0)thread([960,420],[n.cx,n.cy-55],tk,K.amber,2.5);

if(checked[i]){
const ck=backOut(seg(t,ticks[i],ticks[i]+0.3));
if(ck>0){
const cx=n.cx+118,cy=n.cy-78;
ctx.save();
ctx.translate(cx+24,cy);
ctx.scale(ck,ck);
ctx.translate(-(cx+24),-cy);
ctx.strokeStyle=K.amber;
ctx.lineWidth=7;
ctx.shadowColor='rgba(245,166,35,.9)';
ctx.shadowBlur=22;
ctx.beginPath();
ctx.moveTo(cx,cy);
ctx.lineTo(cx+16,cy+24);
ctx.lineTo(cx+48,cy-20);
ctx.stroke();
ctx.shadowBlur=0;
ctx.restore();
}
}
}
}

RECT.b5node=[810,625,300,110];

const chipY=900;
const chipK1=seg(t,36.0,36.5);
const chipK2=seg(t,36.15,36.65);
if(chipK1>0)chip('多智能体',800,chipY,{k:chipK1,bg:K.ink2,fg:K.cream,font:font(F.zh,24,700),ls:4,h:50,r:25,line:K.amber,lw:2});
if(chipK2>0)chip('云端运行',1050,chipY,{k:chipK2,bg:K.ink2,fg:K.cream,font:font(F.zh,24,700),ls:4,h:50,r:25,line:K.amber,lw:2});

hud(t,{tl:'05 / AGENT',tr:'2025.03',bl:'■ 05 / 08   MANUS',br:'给目标 · 自己干',zh:'通用 Agent 爆火',zhRight:true});
}

function sB6(t){
const lt=t-S.b6;
bg(K.ink);

ctx.save();
ctx.translate(960,430);
const sc=lerp(2.6,1,expoOut(seg(t,S.b6,S.b6+1.2)));
ctx.scale(sc,sc);
txt('2025',0,0,{font:font(F.cond,340),fill:K.amber,align:'center',glow:'rgba(245,166,35,.9)',glowR:30});
ctx.restore();

const yearSmallA=seg(t,S.b6+1.2,S.b6+1.8);
txt('2025',140,200,{font:font(F.cond,120),fill:K.amber,align:'left',a:yearSmallA});
txt('07月',300,200,{font:font(F.mono,32,700),fill:K.amber,align:'left',ls:4,a:yearSmallA});

const winK=ease(seg(t,38.2,38.8));
const winY=lerp(300,240,winK);
if(winK>0){
rrect(360,winY,1200,640,18,{fill:'#0a0c0a',stroke:'rgba(245,242,234,.3)',lw:2,a:winK});

const tb=winY+50;
line([[360,tb],[1560,tb]],'rgba(245,242,234,.2)',1,winK);
circle(400,tb-25,6,{fill:K.grey,a:winK});
circle(440,tb-25,6,{fill:K.amber,a:winK});
circle(480,tb-25,6,{fill:K.cream,a:winK});

const divY0=tb;
const divY1=winY+640;
line([[760,divY0],[760,divY1]],'rgba(245,242,234,.2)',1.5,winK);
line([[1160,divY0],[1160,divY1]],'rgba(245,242,234,.2)',1.5,winK);

const paneA=ease(seg(t,38.6,39.4));
if(paneA>0){
txt('BROWSER',560,tb+40,{font:font(F.mono,18,700),fill:K.grey,align:'center',ls:4,a:paneA});
const barY=winY+360;
rrect(400,barY,320,14,Math.max(0.01,7),{fill:'rgba(245,242,234,.12)',a:paneA});
const prog=ease(seg(t,40.0,43.5));
const pw=320*prog;
if(pw>0)rrect(400,barY,pw,14,Math.max(0.01,7),{fill:K.amber,a:paneA});
for(let i=0;i<3;i++){
const rk=ease(seg(t,40.5+i*0.3,41.0+i*0.3));
if(rk>0)rrect(420,barY+60+i*40,lerp(0,280,rk),8,Math.max(0.01,4),{fill:K.grey,a:paneA*0.6});
}
}

const paneB=ease(seg(t,39.0,39.8));
if(paneB>0){
txt('TERMINAL',960,tb+40,{font:font(F.mono,18,700),fill:K.grey,align:'center',ls:4,a:paneB});
const cmd='$ agent run research';
const charTime=40.0;
const chars=Math.floor((t-charTime)/0.03);
if(t>=charTime){
txt(cmd.substring(0,Math.min(chars,cmd.length)),790,winY+340,{font:font(F.mono,22,500),fill:K.cream,align:'left',a:paneB});
}
if(t>=41.5)txt('✓ 12 sites scraped',790,winY+380,{font:font(F.mono,20,500),fill:K.amber,align:'left',a:paneB});
if(t>=43.0)txt('✓ slides built',790,winY+420,{font:font(F.mono,20,500),fill:K.amber,align:'left',a:paneB});
const blink=Math.floor((t-charTime)*2)%2;
if(t>=charTime&&t<44.0&&blink)rrect(790+measure(cmd.substring(0,Math.min(chars,cmd.length)),font(F.mono,22,500)),winY+325,12,24,2,{fill:K.cream,a:paneB});
}

const paneC=ease(seg(t,39.4,40.2));
if(paneC>0){
txt('DOC',1360,tb+40,{font:font(F.mono,18,700),fill:K.grey,align:'center',ls:4,a:paneC});
const titleK=ease(seg(t,41.0,41.5));
if(titleK>0)rrect(1190,winY+340,lerp(0,340,titleK),16,Math.max(0.01,8),{fill:K.amber,a:paneC*0.8});
for(let i=0;i<4;i++){
const lk=ease(seg(t,41.5+i*0.3,42.0+i*0.3));
if(lk>0)rrect(1190,winY+380+i*30,lerp(0,340,lk),10,Math.max(0.01,5),{fill:K.cream,a:paneC*0.5});
}
}

if(t>=44.2){
const doneK=backOut(seg(t,44.2,44.7));
if(doneK>0){
const dx=1500,dy=winY+660;
ctx.save();
ctx.translate(dx+24,dy);
ctx.scale(doneK,doneK);
ctx.translate(-(dx+24),-dy);
ctx.strokeStyle=K.amber;
ctx.lineWidth=7;
ctx.shadowColor='rgba(245,166,35,.9)';
ctx.shadowBlur=22;
ctx.beginPath();
ctx.moveTo(dx,dy);
ctx.lineTo(dx+18,dy+26);
ctx.lineTo(dx+52,dy-22);
ctx.stroke();
ctx.shadowBlur=0;
ctx.restore();
txt('DONE',1480,winY+610,{font:font(F.mono,24,700),fill:K.amber,align:'right',ls:4,a:doneK});
}
}
}

RECT.b6win=[360,240,1200,640];

hud(t,{tl:'06 / 虚拟电脑',tr:'2025.07',bl:'■ 06 / 08   AGENT MODE',br:'BROWSER · TERMINAL · DOC',zh:'一台虚拟电脑，替你办事'});
}

function sB7(t){
  const lt=t-S.b7;
  bg(K.ink);
  
  // Year warp 2026
  if(t<46.2){
    const k=seg(t,45,46.2);
    const sc=lerp(2.6,1,ease(k));
    const a=ease(k);
    ctx.save();
    ctx.translate(960,430);
    ctx.scale(sc,sc);
    txt('2026',0,0,{font:font(F.cond,180),fill:K.amber,align:'center',base:'middle',a:a,glow:'rgba(245,166,35,.9)',glowR:30});
    ctx.restore();
  }
  
  // Small year top-left
  if(t>=46.2){
    const a=seg(t,46.2,46.8);
    txt('2026',100,80,{font:font(F.cond,48),fill:K.amber,a:a,glow:'rgba(245,166,35,.9)',glowR:20});
    txt('02月',220,80,{font:font(F.zh,32,500),fill:K.grey,ls:6,a:a});
  }
  
  // Lobster icon
  const cx=700,cy=560;
  const p=seg(t,Hh.lobster,Hh.lobster+1.6);
  if(p>0){
    const pts=[];
    // Tail
    for(let i=0;i<=9;i++)pts.push([cx-70+i*4,cy+150-i*22]);
    // Body ellipse
    for(let i=0;i<=12;i++){
      const a=i/12*TAU;
      pts.push([cx+55*Math.cos(a),cy+20+95*Math.sin(a)]);
    }
    // Left claw arm
    for(let i=0;i<=5;i++)pts.push([lerp(cx-40,cx-130,i/5),lerp(cy-60,cy-120,i/5)]);
    // Left claw arc
    for(let i=0;i<=10;i++){
      const a=i/10*Math.PI*1.3+Math.PI*0.35;
      pts.push([cx-150+45*Math.cos(a),cy-140+45*Math.sin(a)]);
    }
    // Right claw arm
    for(let i=0;i<=5;i++)pts.push([lerp(cx+40,cx+130,i/5),lerp(cy-60,cy-120,i/5)]);
    // Right claw arc
    for(let i=0;i<=10;i++){
      const a=Math.PI-i/10*Math.PI*1.3-Math.PI*0.35;
      pts.push([cx+150+45*Math.cos(a),cy-140+45*Math.sin(a)]);
    }
    // Left antenna
    for(let i=0;i<=8;i++)pts.push([lerp(cx-20,cx-60,i/8),lerp(cy-70,cy-190,i/8)]);
    // Right antenna
    for(let i=0;i<=8;i++)pts.push([lerp(cx+20,cx+60,i/8),lerp(cy-70,cy-190,i/8)]);
    // Legs left
    for(let j=0;j<3;j++){
      const yy=cy-20+j*40;
      for(let i=0;i<=3;i++)pts.push([cx-40-i*12,yy+i*8]);
    }
    // Legs right
    for(let j=0;j<3;j++){
      const yy=cy-20+j*40;
      for(let i=0;i<=3;i++)pts.push([cx+40+i*12,yy+i*8]);
    }
    
    ctx.save();
    ctx.lineCap='round';
    ctx.shadowColor='rgba(232,65,47,.7)';
    ctx.shadowBlur=18;
    line(pts.slice(0,Math.max(2,Math.floor(pts.length*p))),K.red,10);
    ctx.restore();
    
    if(p>0.85){
      circle(cx-18,cy-78,9,{fill:K.amber,a:ease(seg(t,Hh.lobster+1.36,Hh.lobster+1.6))});
      circle(cx+18,cy-78,9,{fill:K.amber,a:ease(seg(t,Hh.lobster+1.36,Hh.lobster+1.6))});
    }
  }
  RECT.b7lobster=[480,330,440,420];
  
  // WeChat bubble
  const bk=backOut(seg(t,Hh.bubble,Hh.bubble+0.6));
  if(bk>0){
    ctx.save();
    ctx.translate(1150,380);
    ctx.scale(bk,bk);
    rrect(0,0,520,130,26,{fill:K.ink2,stroke:'rgba(245,242,234,.4)',lw:2});
    line([[0,40],[-30,60],[-30,30]],K.ink2,2);
    ctx.restore();
    
    if(bk>0.8){
      txt('帮我整理桌面',1200,462,{font:font(F.zh,38,700),fill:K.cream,align:'left',ls:6,a:ease(seg(t,Hh.bubble+0.4,Hh.bubble+0.8))});
    }
    txt('微信里发一句话',1200,352,{font:font(F.mono,18,700),fill:K.grey,align:'left',a:bk});
  }
  
  // Star counter
  if(t>=49.6){
    const ak=seg(t,49.6,50.2);
    txt('GITHUB STAR',1500,700,{font:font(F.mono,18,700),fill:K.amber,align:'center',a:ak});
    const v=(count(t,49.6,51.2,0,252)/10).toFixed(1);
    txt(v+'万',1500,800,{font:font(F.cond,110),fill:K.cream,align:'center',base:'middle',a:ease(ak)});
    txt('4 个月',1500,870,{font:font(F.mono,16),fill:K.grey,align:'center',a:ak});
  }
  
  hud(t,{tl:'07 / 龙虾',tr:'2026.02',bl:'■ 07 / 08   OPENCLAW',br:'开源 · 住进你的电脑',zh:'养龙虾 · AI 会动手了'});
}

function sB8(t){
  const lt=t-S.b8;
  bg(K.ink);
  
  // Silhouette
  const sk=ease(seg(t,Hh.silhouette,Hh.silhouette+0.8));
  if(sk>0){
    ctx.save();
    ctx.shadowColor='rgba(245,242,234,.7)';
    ctx.shadowBlur=30;
    ctx.fillStyle='rgba(245,242,234,.92)';
    ctx.globalAlpha=sk;
    ctx.beginPath();
    ctx.arc(960,430,70,0,TAU);
    ctx.fill();
    ctx.shadowBlur=0;
    ctx.beginPath();
    ctx.ellipse(960,560,190,150,0,0,TAU);
    ctx.fill();
    ctx.restore();
  }
  
  // Orbit rings
  const rk=seg(t,54.4,55.2);
  if(rk>0){
    ctx.save();
    ctx.strokeStyle='rgba(245,242,234,.25)';
    ctx.lineWidth=2;
    ctx.globalAlpha=rk;
    ctx.translate(960,560);
    ctx.rotate(-0.3);
    ctx.beginPath();
    ctx.ellipse(0,0,330,200,0,0,TAU);
    ctx.stroke();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.translate(960,560);
    ctx.rotate(0.25);
    ctx.beginPath();
    ctx.ellipse(0,0,430,260,0,0,TAU);
    ctx.stroke();
    ctx.restore();
    
    // Orbiting icons
    if(t>=54.8){
      const ik=ease(seg(t,54.8,55.6));
      ctx.save();
      ctx.shadowColor='rgba(245,166,35,.6)';
      ctx.shadowBlur=12;
      // Icon 1: calendar on ring1
      const a1=t*0.9;
      const x1=960+330*Math.cos(a1-0.3)*Math.cos(a1)+200*Math.sin(a1-0.3)*Math.sin(a1);
      const y1=560-330*Math.cos(a1-0.3)*Math.sin(a1)+200*Math.sin(a1-0.3)*Math.cos(a1);
      ctx.translate(x1,y1);
      ctx.globalAlpha=ik;
      rrect(-28,-24,56,48,8,{stroke:K.amber,lw:3});
      line([[-20,-24],[-20,-32]],K.amber,3);
      line([[20,-24],[20,-32]],K.amber,3);
      line([[-18,-4],[18,-4]],K.amber,2);
      ctx.setTransform(1,0,0,1,0,0);
      
      // Icon 2: mail on ring1
      const a2=t*0.9+TAU/3;
      const x2=960+330*Math.cos(a2-0.3)*Math.cos(a2)+200*Math.sin(a2-0.3)*Math.sin(a2);
      const y2=560-330*Math.cos(a2-0.3)*Math.sin(a2)+200*Math.sin(a2-0.3)*Math.cos(a2);
      ctx.translate(x2,y2);
      ctx.globalAlpha=ik;
      rrect(-26,-18,52,36,4,{stroke:K.amber,lw:3});
      line([[-26,-18],[0,4],[26,-18]],K.amber,2);
      ctx.setTransform(1,0,0,1,0,0);
      
      // Icon 3: chat on ring1
      const a3=t*0.9+TAU*2/3;
      const x3=960+330*Math.cos(a3-0.3)*Math.cos(a3)+200*Math.sin(a3-0.3)*Math.sin(a3);
      const y3=560-330*Math.cos(a3-0.3)*Math.sin(a3)+200*Math.sin(a3-0.3)*Math.cos(a3);
      ctx.translate(x3,y3);
      ctx.globalAlpha=ik;
      rrect(-26,-22,52,44,12,{stroke:K.amber,lw:3});
      line([[10,22],[18,30],[18,22]],K.amber,3);
      ctx.setTransform(1,0,0,1,0,0);
      
      // Icon 4: star on ring2
      const a4=t*0.9+0.5;
      const x4=960+430*Math.cos(a4+0.25)*Math.cos(a4)+260*Math.sin(a4+0.25)*Math.sin(a4);
      const y4=560-430*Math.cos(a4+0.25)*Math.sin(a4)+260*Math.sin(a4+0.25)*Math.cos(a4);
      starburst(x4,y4,22,5,K.amber,a4,0.38);
      
      // Icon 5: clock on ring2
      const a5=t*0.9+TAU/2+0.5;
      const x5=960+430*Math.cos(a5+0.25)*Math.cos(a5)+260*Math.sin(a5+0.25)*Math.sin(a5);
      const y5=560-430*Math.cos(a5+0.25)*Math.sin(a5)+260*Math.sin(a5+0.25)*Math.cos(a5);
      circle(x5,y5,20,{stroke:K.amber,lw:3,a:ik});
      line([[x5,y5],[x5,y5-14]],K.amber,2.5,ik);
      line([[x5,y5],[x5+10,y5]],K.amber,2.5,ik);
      
      ctx.restore();
    }
  }
  
  // Words drop
  if(t>=56.0){
    letters('记住你',560,900,{font:font(F.zh,54,700),fill:K.cream,align:'center',ls:8},(i)=>{
      const k=seg(t,56.0+i*0.06,56.3+i*0.06);
      return{dy:(1-expoOut(k))*120,a:k};
    });
    txt('·',760,900,{font:font(F.zh,54,700),fill:K.amber,align:'center',base:'middle',a:seg(t,56.18,56.48)});
    letters('主动帮你',960,900,{font:font(F.zh,54,700),fill:K.cream,align:'center',ls:8},(i)=>{
      const k=seg(t,56.5+i*0.06,56.8+i*0.06);
      return{dy:(1-expoOut(k))*120,a:k};
    });
    txt('·',1120,900,{font:font(F.zh,54,700),fill:K.amber,align:'center',base:'middle',a:seg(t,56.74,57.04)});
    letters('随行',1280,900,{font:font(F.zh,54,700),fill:K.cream,align:'center',ls:8},(i)=>{
      const k=seg(t,57.0+i*0.06,57.3+i*0.06);
      return{dy:(1-expoOut(k))*120,a:k};
    });
  }
  
  // Finale dots
  if(t>=58.4){
    for(let i=0;i<8;i++){
      const k=seg(t,58.4+i*0.08,58.6+i*0.08);
      const x=760+i*57;
      circle(x,940,10,{fill:k>0?K.amber:'rgba(245,242,234,.15)',a:Math.min(1,k*3)});
    }
  }
  
  // Top headline
  txt('2026 · PERSONAL AGENT',960,130,{font:font(F.mono,20,700),fill:K.amber,align:'center',a:seg(t,53.0,53.6)});
  txt('个人智能体',960,180,{font:font(F.zh,44,700),fill:K.cream,align:'center',ls:14,a:seg(t,53.0,53.8)});
  
  hud(t,{tl:'08 / 搭子',tr:'2026',bl:'■ 08 / 08   FINALE',br:'CUE · MUSE',zh:'AI 从工具，变成搭子'});
}


// ---------- transitions INTO a scene (shape-continuity; zoom/iris alternate) ----------
const TR = {
  b1: [.5, trIris(960, 540, K.amber)],
  b2: [.55, trZoom(() => RECT.b1bubble || [520, 700, 620, 120])],
  b3: [.5, trIris(680, 560, K.amber)],
  b4: [.55, trZoom(() => RECT.b3capsule || [700, 420, 520, 140])],
  b5: [.5, trIris(960, 500, K.amber)],
  b6: [.55, trZoom(() => RECT.b5node || [810, 625, 300, 110])],
  b7: [.5, trIris(960, 540, K.amber)],
  b8: [.55, trZoom(() => RECT.b7lobster || [480, 330, 440, 420])],
};
const SCENES = [[S.b1, sB1, 'b1'], [S.b2, sB2, 'b2'], [S.b3, sB3, 'b3'], [S.b4, sB4, 'b4'], [S.b5, sB5, 'b5'], [S.b6, sB6, 'b6'], [S.b7, sB7, 'b7'], [S.b8, sB8, 'b8']];

function renderInto(i, t, buf) {
  ctx = buf.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.clearRect(0, 0, W, H);
  SCENES[i][1](t); ctx = mainCtx;
}
function frame(t) {
  FX = { split: 0, slice: 0, seed: 0, grain: .05, vign: .28, flash: 0, flashCol: '#ffffff' };
  let i = 0; while (i + 1 < SCENES.length && t >= SCENES[i + 1][0]) i++;
  const [s0, fn, key] = SCENES[i], tr = TR[key];
  ctx = mainCtx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  if (tr && i > 0 && t < s0 + tr[0]) {
    TRANS = true;
    const keep = FX; FX = { ...keep }; renderInto(i - 1, s0 - 1 / FPS, bufA); FX = keep;   // the outgoing scene's own effects are dropped
    renderInto(i, t, bufB);
    TRANS = false;
    tr[1](seg(t, s0, s0 + tr[0]), bufA, bufB, mainCtx);
  } else {
    fn(t);
    if (!tr && s0 > 0 && t < s0 + 1 / FPS) FX.flash = Math.max(FX.flash, .08);   // a one-frame flash on hard cuts
  }
  post(t, FX);
}

// ---------- render contract ----------
// Chinese glyphs are fetched as a subset: keep CJK listing every CJK character your scenes draw.
const CJK = '·一万上个主之了事云人亿从会住体你信做具养出函到办动化发变句叫台和多天好子它家对屏工己帮幕干平开微成我户手拟搬搭数整是智替月有标桌比源演火点爆理用电的目看眼研破示端答线给聊能脑自虚虾行表记话调路运进通里长问随面鼠龙！，';
const fontsReady = Promise.all([
  document.fonts.load('100px "Anton"'), document.fonts.load('100px "Archivo Black"'), document.fonts.load('italic 100px "Instrument Serif"'),
  document.fonts.load('700 20px "JetBrains Mono"'), document.fonts.load('500 20px "JetBrains Mono"'),
  document.fonts.load('500 20px "Noto Sans SC"', CJK),
  document.fonts.load('700 20px "Noto Sans SC"', CJK),
]);
window.renderAt = async (t, type = 'image/png', q = .92) => { frame(t); return out.toDataURL(type, q); };
window.renderSheet = async (times, cols = 3, w = 640, crop = null) => {
  const [, , cw, ch] = crop || [0, 0, W, H], h = Math.round(w * ch / cw), rows = Math.ceil(times.length / cols), sc = document.createElement('canvas');
  sc.width = cols * w; sc.height = rows * h; const c = sc.getContext('2d'), ms = [];
  for (let i = 0; i < times.length; i++) {
    const t0 = performance.now(); frame(times[i]); ms.push(Math.round(performance.now() - t0));
    const x = (i % cols) * w, y = Math.floor(i / cols) * h, [cx, cy] = crop || [0, 0];
    c.drawImage(out, cx, cy, cw, ch, x, y, w, h); c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(x, y, 84, 24); c.fillStyle = '#fff'; c.font = '15px sans-serif'; c.fillText(times[i].toFixed(2) + 's', x + 6, y + 17);
  }
  return { url: sc.toDataURL('image/jpeg', .9), ms };
};
window.gpuInfo = () => { const gl = RA.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); };
fontsReady.then(() => {
  window.ready = true;
  if (!location.search.includes('render')) {
    const s = document.getElementById('scrub'), lab = document.getElementById('tt');
    const go = () => { const t0 = performance.now(); frame(+s.value); lab.textContent = `${(+s.value).toFixed(2)}s · ${Math.round(performance.now() - t0)} ms`; };
    s.addEventListener('input', go); s.value = new URLSearchParams(location.search).get('t') || 0; go();
  }
});
