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
  
  const keyK=expoOut(seg(t,0,1.2));
  const keyScale=lerp(2.6,1,keyK);
  ctx.save(); ctx.translate(960,540); ctx.scale(keyScale,keyScale);
  txt('一句话',0,0,{font:font(F.zh,340,'bold'),fill:K.amber,align:'center',base:'middle',glow:'rgba(245,166,35,.9)',glowR:30});
  ctx.restore();
  
  if(lt>0.8){
    const teacherK=ease(seg(lt,0.8,1.6));
    const teacherA=teacherK*0.9;
    ctx.save();
    ctx.translate(320,540);
    circle(0,-60,45,{stroke:K.cream,lw:3,a:teacherA});
    ctx.beginPath();
    ctx.moveTo(-35,0);
    ctx.quadraticCurveTo(-40,80,-15,140);
    ctx.lineTo(15,140);
    ctx.quadraticCurveTo(40,80,35,0);
    ctx.strokeStyle=K.cream;
    ctx.lineWidth=3;
    ctx.globalAlpha=teacherA;
    ctx.stroke();
    ctx.restore();
  }
  
  if(lt>1.2){
    const boxK=ease(seg(lt,1.2,1.8));
    rrect(560,620,800,110,12,{stroke:K.grey,lw:2,a:boxK*0.8});
    
    const typeStart=Hh.typeStart-S.b1;
    const typeDone=Hh.typeDone-S.b1;
    let displayText='';
    if(lt>=typeStart && lt<2.8){
      const tempText='你希望我做什么';
      const charCount=Math.floor((lt-typeStart)/0.28);
      displayText=tempText.substring(0,Math.min(charCount,tempText.length));
    }else if(lt>=2.8 && lt<3.2){
      const delCount=Math.floor((lt-2.8)/0.1);
      const tempText='你希望我做什么';
      displayText=tempText.substring(0,Math.max(0,tempText.length-delCount));
    }else if(lt>=3.2){
      const finalText='做一个班级随机点名器';
      const charCount=Math.floor((lt-3.2)/0.28);
      displayText=finalText.substring(0,Math.min(charCount,finalText.length));
    }
    
    if(displayText){
      txt(displayText,590,675,{font:font(F.zh,32),fill:K.cream,align:'left',base:'middle',a:0.95});
    }
    
    const cursorTime=Hh.cursor-S.b1;
    if(lt>=typeStart && lt<typeDone){
      const cursorBlink=Math.floor(lt*2.5)%2;
      if(cursorBlink){
        const cursorX=590+displayText.length*18;
        line([[cursorX,645],[cursorX,705]],K.amber,2,0.9);
      }
    }
    
    if(lt>=cursorTime){
      const btnK=ease(seg(lt,cursorTime,cursorTime+0.4));
      const btnGlow=btnK*25;
      rrect(1280,635,60,60,999,{fill:K.amber,a:btnK*0.95,glow:'rgba(245,166,35,.8)',glowR:btnGlow});
      ctx.save();
      ctx.globalAlpha=btnK;
      ctx.beginPath();
      ctx.moveTo(1300,665);
      ctx.lineTo(1325,665);
      ctx.lineTo(1315,655);
      ctx.moveTo(1325,665);
      ctx.lineTo(1315,675);
      ctx.strokeStyle=K.ink;
      ctx.lineWidth=3;
      ctx.stroke();
      ctx.restore();
    }
  }
  
  RECT.b1input=[560,620,800,110];
  
  hud(t,{tl:'01 / 一句话',tr:'备课',bl:'■ 01 / 08   一句话',br:'SCHEMATIC · 演示',zh:'老师备课到深夜？一句话就够了'});
}

function sB2(t){
  const lt=t-S.b2;
  bg(K.ink);
  
  if(lt>0){
    const streamK=Math.min(lt/2.5,1);
    for(let i=0;i<8;i++){
      const yy=80+i*50+Math.sin(lt*2+i)*15;
      const ww=lerp(100,600,ease((lt+i*0.15)%2.5/2.5));
      const xx=960-ww/2;
      const aa=0.15*ease(seg(lt,i*0.1,i*0.1+0.6));
      rrect(xx,yy,ww,8,4,{fill:K.grey,a:aa});
    }
  }
  
  const streamTime=Hh.stream-S.b2;
  if(lt>=streamTime){
    const threadK=seg(lt,streamTime,streamTime+1.8);
    thread([300,200],[960,540],threadK,K.amber);
    thread([1620,200],[960,540],threadK,K.amber);
    thread([960,100],[960,540],threadK,K.amber);
  }
  
  const icon1Time=Hh.icon1-S.b2;
  const icon2Time=Hh.icon2-S.b2;
  const icon3Time=Hh.icon3-S.b2;
  
  if(lt>=icon1Time){
    const k1=backOut(seg(lt,icon1Time,icon1Time+0.5));
    const scale1=lerp(0.7,1,k1);
    const glow1=k1*20;
    ctx.save();
    ctx.translate(620,540);
    ctx.scale(scale1,scale1);
    rrect(-40,-50,80,100,8,{stroke:K.cream,lw:3,a:k1*0.9,glow:'rgba(245,242,234,.5)',glowR:glow1});
    for(let j=0;j<4;j++){
      line([[-25,-30+j*20],[25,-30+j*20]],K.cream,2,k1*0.7);
    }
    ctx.restore();
    txt('课件',620,620,{font:font(F.zh,24),fill:K.cream,align:'center',base:'top',a:k1*0.85});
  }
  
  if(lt>=icon2Time){
    const k2=backOut(seg(lt,icon2Time,icon2Time+0.5));
    const scale2=lerp(0.7,1,k2);
    const glow2=k2*20;
    ctx.save();
    ctx.translate(960,540);
    ctx.scale(scale2,scale2);
    rrect(-40,-40,80,80,16,{stroke:K.amber,lw:3,a:k2*0.9,glow:'rgba(245,166,35,.6)',glowR:glow2});
    circle(-15,-10,8,{fill:K.amber,a:k2*0.9});
    rrect(0,5,30,20,8,{fill:K.amber,a:k2*0.9});
    ctx.restore();
    txt('智能体',960,620,{font:font(F.zh,24),fill:K.amber,align:'center',base:'top',a:k2*0.95});
  }
  
  if(lt>=icon3Time){
    const k3=backOut(seg(lt,icon3Time,icon3Time+0.5));
    const scale3=lerp(0.7,1,k3);
    const glow3=k3*20;
    ctx.save();
    ctx.translate(1300,540);
    ctx.scale(scale3,scale3);
    for(let row=0;row<3;row++){
      for(let col=0;col<3;col++){
        rrect(-35+col*25,-35+row*25,20,20,4,{stroke:K.cream,lw:2,a:k3*0.8,glow:'rgba(245,242,234,.4)',glowR:glow3});
      }
    }
    ctx.restore();
    txt('小应用',1300,620,{font:font(F.zh,24),fill:K.cream,align:'center',base:'top',a:k3*0.85});
    RECT.b2icon3=[1260,500,80,80];
  }
  
  hud(t,{tl:'02 / 生成',tr:'AI',bl:'■ 02 / 08   生成',br:'SCHEMATIC · 演示',zh:'不只是文档，是可交互的应用'});
}

function sB3(t){
  const lt=t-S.b3;
  bg(K.ink);
  
  const planeTime=Hh.plane-S.b3;
  if(lt>=planeTime){
    const planeK=ease(seg(lt,planeTime,planeTime+3.5));
    const p0=[200,400];
    const p1=[1720,300];
    const c0=[600,200];
    const c1=[1300,500];
    const planePos=bez(p0,c0,c1,p1,planeK);
    
    if(planeK<0.95){
      const threadK2=Math.min(planeK+0.15,1);
      thread(p0,planePos,threadK2,K.amber);
    }
    
    ctx.save();
    ctx.translate(planePos[0],planePos[1]);
    const angle=Math.atan2(p1[1]-p0[1],p1[0]-p0[0]);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(-20,-12);
    ctx.lineTo(-20,12);
    ctx.closePath();
    ctx.strokeStyle=K.cream;
    ctx.lineWidth=3;
    ctx.globalAlpha=0.9;
    ctx.stroke();
    ctx.restore();
  }
  
  if(lt>1.5){
    const labelK=ease(seg(lt,1.5,2.2));
    rrect(1400,200,260,60,999,{fill:K.ink2,stroke:K.grey,lw:2,a:labelK*0.85});
    txt('一年级 1 班',1530,230,{font:font(F.zh,28),fill:K.cream,align:'center',base:'middle',a:labelK*0.9});
  }
  
  const tabletY=600;
  const tabletStartX=500;
  for(let i=0;i<7;i++){
    const tabletTime=Hh.tablets[i]-S.b3;
    if(lt>=tabletTime){
      const tabK=ease(seg(lt,tabletTime,tabletTime+0.4));
      const tabX=tabletStartX+i*150;
      const tabCol=tabK>0.8?K.cream:K.grey;
      const tabGlow=tabK>0.8?15:0;
      rrect(tabX,tabletY,100,140,8,{stroke:tabCol,lw:3,a:tabK*0.85,glow:tabK>0.8?'rgba(245,242,234,.6)':null,glowR:tabGlow});
      circle(tabX+50,tabletY+110,6,{fill:tabCol,a:tabK*0.7});
      if(i===0){
        RECT.b3tablet=[tabX,tabletY,100,140];
      }
    }
  }
  
  hud(t,{tl:'03 / 发布',tr:'班级',bl:'■ 03 / 08   发布',br:'SCHEMATIC · 演示',zh:'课件直达每一位学生'});
}

function sB4(t){
  const lt=t-S.b4;
  bg(K.ink);
  
  const pagodaTime=Hh.pagoda-S.b4;
  if(lt>=pagodaTime){
    const buildK=ease(seg(lt,pagodaTime,pagodaTime+1.4));
    const rotatePhase=Math.sin(lt*0.8)*0.3;
    const scaleX=Math.cos(rotatePhase);
    
    ctx.save();
    ctx.translate(700,540);
    
    const layers=[
      {w:180,h:50,y:100},
      {w:160,h:45,y:55},
      {w:140,h:40,y:15},
      {w:120,h:35,y:-20},
      {w:100,h:30,y:-50}
    ];
    
    for(let i=0;i<5;i++){
      const layerK=clamp(seg(buildK,i*0.15,(i+1)*0.15+0.3),0,1);
      if(layerK>0){
        const L=layers[i];
        ctx.save();
        ctx.translate(0,L.y);
        ctx.scale(scaleX,1);
        ctx.beginPath();
        ctx.moveTo(-L.w/2,0);
        ctx.lineTo(-L.w/2+20,-L.h);
        ctx.lineTo(L.w/2-20,-L.h);
        ctx.lineTo(L.w/2,0);
        ctx.closePath();
        ctx.strokeStyle=K.cream;
        ctx.lineWidth=2;
        ctx.globalAlpha=layerK*0.85;
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }
  
  const quizTime=Hh.quiz-S.b4;
  if(lt>=quizTime){
    const quizK=backOut(seg(lt,quizTime,quizTime+0.6));
    const qX=1200;
    const qY=400;
    rrect(qX,qY,280,180,16,{fill:K.ink2,stroke:K.grey,lw:2,a:quizK*0.9});
    
    if(lt<quizTime+1.2){
      txt('3 + 5 = ?',qX+140,qY+70,{font:font(F.mono,42),fill:K.cream,align:'center',base:'middle',a:quizK*0.95});
    }else{
      const ansK=ease(seg(lt,quizTime+1.2,quizTime+1.6));
      txt('8',qX+140,qY+70,{font:font(F.mono,56,'bold'),fill:K.amber,align:'center',base:'middle',a:ansK*0.95});
      
      if(ansK>0.5){
        const checkA=ease(seg(ansK,0.5,1));
        ctx.save();
        ctx.translate(qX+220,qY+130);
        ctx.globalAlpha=checkA;
        ctx.beginPath();
        ctx.moveTo(-15,0);
        ctx.lineTo(-5,10);
        ctx.lineTo(15,-15);
        ctx.strokeStyle=K.amber;
        ctx.lineWidth=4;
        ctx.lineCap='round';
        ctx.stroke();
        ctx.restore();
      }
    }
    RECT.b4quiz=[qX,qY,280,180];
  }
  
  const progressTime=Hh.progress-S.b4;
  if(lt>=progressTime){
    const progK=ease(seg(lt,progressTime,progressTime+1.5));
    const barW=800;
    const barX=560;
    const barY=850;
    rrect(barX,barY,barW,20,999,{fill:K.ink2,stroke:K.grey,lw:2,a:0.8});
    rrect(barX,barY,barW*progK,20,999,{fill:K.amber,a:0.95,glow:'rgba(245,166,35,.7)',glowR:12});
  }
  
  hud(t,{tl:'04 / 学生学',tr:'学习',bl:'■ 04 / 08   学生学',br:'SCHEMATIC · 演示',zh:'打开就学，即时反馈'});
}

function sB5(t) {
  const lt = t - S.b5;
  bg(K.ink);
  
  // 巨型关键词"陪伴"开场
  if (lt < 1.2) {
    const s = ease(clamp(lt / 1.2, 0, 1));
    ctx.save();
    ctx.translate(960, 540);
    ctx.scale(s, s);
    ctx.globalAlpha = s;
    txt('陪伴', 0, 0, {font: font(F.zh, 320, 900), fill: K.amber, align: 'center', base: 'middle'});
    ctx.restore();
  }
  
  // 左侧气泡 31.2s
  if (lt >= 1.2) {
    const blt = lt - 1.2;
    const ba = clamp(blt / 0.3, 0, 1);
    const x = 320, y = 480, w = 480, h = 160;
    ctx.globalAlpha = ba;
    rrect(x, y, w, h, 24, {fill: K.cream, a: ba});
    ctx.beginPath();
    ctx.moveTo(x - 20, y + h / 2);
    ctx.lineTo(x, y + h / 2 - 15);
    ctx.lineTo(x, y + h / 2 + 15);
    ctx.closePath();
    ctx.fillStyle = K.cream;
    ctx.fill();
    
    const chars1 = '12×3=？';
    const chars2 = '36，答对了！';
    const reveal1 = clamp((blt - 0.4) * 15, 0, chars1.length);
    const reveal2 = clamp((blt - 1.8) * 15, 0, chars2.length);
    
    txt(chars1.slice(0, Math.floor(reveal1)), x + 40, y + 60, {font: font(F.zh, 32, 400), fill: K.ink, align: 'left', base: 'top'});
    if (blt > 1.8) {
      txt(chars2.slice(0, Math.floor(reveal2)), x + 40, y + 100, {font: font(F.zh, 32, 400), fill: K.lime, align: 'left', base: 'top'});
    }
    ctx.globalAlpha = 1;
    txt('口算教练', x + 40, y + 20, {font: font(F.zh, 24, 700), fill: K.mid, align: 'left', base: 'top'});
  }
  
  // 右侧气泡 33.6s
  if (lt >= 3.6) {
    const blt = lt - 3.6;
    const ba = clamp(blt / 0.3, 0, 1);
    const x = 1120, y = 640, w = 560, h = 180;
    ctx.globalAlpha = ba;
    rrect(x, y, w, h, 24, {fill: K.cream, a: ba});
    ctx.beginPath();
    ctx.moveTo(x + w + 20, y + h / 2);
    ctx.lineTo(x + w, y + h / 2 - 15);
    ctx.lineTo(x + w, y + h / 2 + 15);
    ctx.closePath();
    ctx.fillStyle = K.cream;
    ctx.fill();
    
    const chars3 = '跟我读：apple';
    const chars4 = 'apple ✓';
    const reveal3 = clamp((blt - 0.4) * 15, 0, chars3.length);
    const reveal4 = clamp((blt - 1.8) * 15, 0, chars4.length);
    
    txt(chars3.slice(0, Math.floor(reveal3)), x + 40, y + 60, {font: font(F.zh, 32, 400), fill: K.ink, align: 'left', base: 'top'});
    if (blt > 1.8) {
      txt(chars4.slice(0, Math.floor(reveal4)), x + 40, y + 110, {font: font(F.zh, 32, 400), fill: K.lime, align: 'left', base: 'top'});
    }
    ctx.globalAlpha = 1;
    txt('英语跟读伙伴', x + 40, y + 20, {font: font(F.zh, 24, 700), fill: K.mid, align: 'left', base: 'top'});
    
    RECT.b5bub2 = [x, y, w, h];
  }
  
  hud(t, {tl: '05 / 陪伴', tr: '智能体', bl: '■ 05 / 08   陪伴', br: 'SCHEMATIC · 演示', zh: '随问随答，全天陪伴'});
}

function sB6(t) {
  const lt = t - S.b6;
  bg(K.ink);
  
  // 巨型关键词"创作"开场
  if (lt < 1.1) {
    const s = ease(clamp(lt / 1.1, 0, 1));
    ctx.save();
    ctx.translate(960, 540);
    ctx.scale(s, s);
    ctx.globalAlpha = s;
    txt('创作', 0, 0, {font: font(F.zh, 320, 900), fill: K.amber, align: 'center', base: 'middle'});
    ctx.restore();
  }
  
  // 38.6s 画笔画线框
  if (lt >= 1.1) {
    const plt = lt - 1.1;
    const prog = clamp(plt / 2.0, 0, 1);
    const x = 660, y = 380, w = 280, h = 320;
    
    if (prog > 0) {
      ctx.strokeStyle = K.lime;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      ctx.strokeRect(x, y, w * Math.min(prog * 4, 1), h * Math.min(prog * 4 - 1, 0, 1));
      if (prog > 0.25) {
        const lp = clamp((prog - 0.25) / 0.25, 0, 1);
        for (let i = 0; i < 3; i++) {
          const yy = y + 60 + i * 40;
          line([[x + 20, yy], [x + 20 + (w - 40) * lp, yy]], K.lime, 2, 0.6);
        }
      }
      if (prog > 0.5) {
        const bp = clamp((prog - 0.5) / 0.25, 0, 1);
        rrect(x + w / 2 - 60, y + h - 60, 120, 36, 18, {stroke: K.lime, lw: 3, a: bp});
      }
      
      // 笔尖
      if (prog < 1) {
        const path = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
        const totalLen = w * 2 + h * 2;
        const dist = prog * totalLen;
        let acc = 0, px = x, py = y;
        for (let i = 0; i < path.length - 1; i++) {
          const segLen = i % 2 === 0 ? w : h;
          if (dist <= acc + segLen) {
            const t = (dist - acc) / segLen;
            px = lerp(path[i][0], path[i + 1][0], t);
            py = lerp(path[i][1], path[i + 1][1], t);
            break;
          }
          acc += segLen;
        }
        circle(px, py, 8, {fill: K.amber, a: 1});
        ctx.shadowColor = K.amber;
        ctx.shadowBlur = 20;
        circle(px, py, 8, {fill: K.amber, a: 1});
        ctx.shadowBlur = 0;
      }
    }
  }
  
  // 41.0s 滑入广场相框
  if (lt >= 3.5) {
    const flt = lt - 3.5;
    const fx = lerp(-400, 1180, clamp(flt / 0.6, 0, 1));
    const fw = 360, fh = 440;
    rrect(fx, 280, fw, fh, 16, {fill: K.ink2, stroke: K.cream, lw: 3});
    txt('学校广场', fx + fw / 2, 320, {font: font(F.zh, 28, 700), fill: K.cream, align: 'center', base: 'top'});
    
    const cx = 800, cy = 500, cw = 280, ch = 320;
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx + 40, 380, fw - 80, 280);
    ctx.clip();
    rrect(cx, cy, cw, ch, 8, {stroke: K.lime, lw: 2});
    for (let i = 0; i < 3; i++) {
      line([[cx + 20, cy + 60 + i * 40], [cx + cw - 20, cy + 60 + i * 40]], K.lime, 2, 0.6);
    }
    rrect(cx + cw / 2 - 60, cy + ch - 60, 120, 36, 18, {stroke: K.lime, lw: 2});
    ctx.restore();
    
    txt('我的小游戏', fx + fw / 2, 400, {font: font(F.zh, 24, 500), fill: K.lime, align: 'center', base: 'top'});
    
    RECT.b6plaza = [fx, 280, fw, fh];
  }
  
  // 43.0s 点赞星星
  if (lt >= 5.5) {
    const llt = lt - 5.5;
    const lx = 1380, ly = 420;
    const cnt = Math.floor(count(t, Hh.like, Hh.like + 1.2, 0, 128));
    txt(cnt.toString(), lx, ly, {font: font(F.cond, 72, 700), fill: K.amber, align: 'center', base: 'middle'});
    
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / 5;
      const r1 = 20, r2 = 8;
      const pts = [];
      for (let j = 0; j < 10; j++) {
        const a = angle + j * Math.PI / 5;
        const r = j % 2 === 0 ? r1 : r2;
        pts.push([lx + Math.cos(a) * r + (i - 2) * 32, ly + 50 + Math.sin(a) * r]);
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) {
        ctx.lineTo(pts[j][0], pts[j][1]);
      }
      ctx.closePath();
      ctx.fillStyle = K.amber;
      ctx.globalAlpha = clamp((llt - i * 0.1) / 0.3, 0, 1);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  
  hud(t, {tl: '06 / 创作', tr: '广场', bl: '■ 06 / 08   创作', br: 'SCHEMATIC · 演示', zh: '学生也能当创作者'});
}

function sB7(t) {
  const lt = t - S.b7;
  bg(K.ink);
  
  // 巨型关键词"看见"开场
  if (lt < 1.2) {
    const s = ease(clamp(lt / 1.2, 0, 1));
    ctx.save();
    ctx.translate(960, 540);
    ctx.scale(s, s);
    ctx.globalAlpha = s;
    txt('看见', 0, 0, {font: font(F.zh, 320, 900), fill: K.amber, align: 'center', base: 'middle'});
    ctx.restore();
  }
  
  // 46.2s 手机框
  const px = 760, py = 270, pw = 400, ph = 540;
  if (lt >= 1.2) {
    const pht = lt - 1.2;
    const pa = clamp(pht / 0.4, 0, 1);
    rrect(px, py, pw, ph, 32, {fill: K.ink2, stroke: K.amber, lw: 4, a: pa});
    RECT.b7phone = [px, py, pw, ph];
  }
  
  // 48.0s 三行数据
  if (lt >= 3.0) {
    const dlt = lt - 3.0;
    const lines = [
      {t: '课件 3/3', y: 380},
      {t: '作品 7 件', y: 480},
      {t: '口算练习 18 次', y: 580}
    ];
    lines.forEach((l, i) => {
      const a = clamp((dlt - i * 0.4) / 0.5, 0, 1);
      const yy = lerp(l.y + 20, l.y, ease(a));
      ctx.globalAlpha = a;
      txt(l.t, px + pw / 2, yy, {font: font(F.zh, 36, 500), fill: K.cream, align: 'center', base: 'middle'});
      ctx.globalAlpha = 1;
    });
  }
  
  // 49.8s 时间轴
  if (lt >= 4.8) {
    const tlt = lt - 4.8;
    const ty = 720;
    const dots = 5;
    const spacing = 60;
    const startX = px + pw / 2 - (dots - 1) * spacing / 2;
    
    for (let i = 0; i < dots; i++) {
      const da = clamp((tlt - i * 0.15) / 0.3, 0, 1);
      circle(startX + i * spacing, ty, 6, {fill: K.lime, a: da});
      if (i < dots - 1) {
        line([[startX + i * spacing + 6, ty], [startX + (i + 1) * spacing - 6, ty]], K.grey, 2, da);
      }
    }
  }
  
  hud(t, {tl: '07 / 家长', tr: '看见', bl: '■ 07 / 08   家长', br: 'SCHEMATIC · 演示', zh: '孩子学了什么，一目了然'});
}

function sB8(t) {
  const lt = t - S.b8;
  bg(K.ink);
  
  // 53.4s 四组数据光流汇入
  if (lt >= 0.9) {
    const flt = lt - 0.9;
    const dataPoints = [
      {s: '23 人', l: '全校师生', x0: 200, y0: 150, x1: 960, y1: 400},
      {s: '3 个班级', l: '', x0: 1720, y0: 150, x1: 960, y1: 400},
      {s: '13 课件', l: '', x0: 200, y0: 930, x1: 960, y1: 640},
      {s: '4 智能体', l: '', x0: 1720, y0: 930, x1: 960, y1: 640}
    ];
    
    dataPoints.forEach((d, i) => {
      const prog = clamp((flt - i * 0.3) / 1.2, 0, 1);
      const ep = ease(prog);
      const x = lerp(d.x0, d.x1, ep);
      const y = lerp(d.y0, d.y1, ep);
      const fade = 1 - seg(lt, 2.6, 3.4);   // labels fade out before the slogan lands
      
      if (prog > 0 && fade > 0) {
        thread([d.x0, d.y0], [d.x1, d.y1], prog, K.amber);
        ctx.globalAlpha = prog * fade;
        txt(d.s, x, y, {font: font(F.zh, 48, 700), fill: K.amber, align: 'center', base: 'middle'});
        if (d.l) {
          txt(d.l, x, y + 40, {font: font(F.zh, 24, 400), fill: K.grey, align: 'center', base: 'top'});
        }
        ctx.globalAlpha = 1;
      }
    });
  }
  
  // 55.6s slogan 三行
  if (lt >= 3.1) {
    const slt = lt - 3.1;
    const slogans = [
      {t: '老师轻松教，', y: 420},
      {t: '学生爱学，', y: 500},
      {t: '家长放心。', y: 580}
    ];
    
    slogans.forEach((sl, i) => {
      const prog = clamp((slt - i * 0.6) / 0.8, 0, 1);
      const yy = lerp(sl.y - 60, sl.y, backOut(prog));
      ctx.globalAlpha = prog;
      txt(sl.t, 960, yy, {font: font(F.zh, 64, 900), fill: K.amber, align: 'center', base: 'middle'});
      ctx.globalAlpha = 1;
    });
  }
  
  // 58.4s 8 个圆点 trace
  if (lt >= 5.9) {
    const dlt = lt - 5.9;
    const dy = 880;
    const spacing = 40;
    const startX = 960 - 3.5 * spacing;
    
    for (let i = 0; i < 8; i++) {
      const da = clamp((dlt - i * 0.1) / 0.3, 0, 1);
      circle(startX + i * spacing, dy, i === 7 ? 12 : 8, {fill: K.amber, a: da});
    }
  }
  
  hud(t, {tl: '08 / 收尾', tr: '课搭AI', bl: '■ 08 / 08   FINALE', br: '课搭AI校园平台', zh: '课搭AI校园平台'});
}



// ---------- transitions INTO a scene (shape-continuity; zoom/iris alternate) ----------
const TR = {
  b1: [.5, trIris(960, 540, K.amber)],
  b2: [.55, trZoom(() => RECT.b1input || [560,620,800,110])],
  b3: [.5, trIris(1400, 400, K.amber)],
  b4: [.55, trZoom(() => RECT.b3tablet || [900,500,120,160])],
  b5: [.5, trIris(480, 500, K.amber)],
  b6: [.55, trZoom(() => RECT.b5bub2 || [1100,600,560,180])],
  b7: [.5, trIris(960, 540, K.amber)],
  b8: [.55, trZoom(() => RECT.b7phone || [760,270,400,540])],
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
const CJK = '·一万上个主之了事云人亿从会住体你信做具养出函到办动化发变句叫台和多天好子它家对屏工己帮幕干平开微成我户手拟搬搭数整是智替月有标桌比源演火点爆理用电的目看眼研破示端答线给聊能脑自虚虾行表记话调路运进通里长问随面鼠龙！，课陪伴创作见轻松放心器应级班练习游戏场机近期除档复即刻反馈直达旋转全才华时览校师生位每文框笔赞跟读伙准确啦爱件次';
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
