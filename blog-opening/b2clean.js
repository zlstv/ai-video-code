// ============================================================
// A. 场景 5-7
// ============================================================

SCENES.push({
  id: '05',
  title: 'KNOWLEDGE',
  t0: 24,
  t1: 30,
  sub: '知识库 · 有问即答',
  draw(t, ctx, W, H, X) {
    const local = t - this.t0;
    const dur = this.t1 - this.t0;
    
    // 中央立方体尺寸
    const cubeSize = 80;
    const cx = W / 2;
    const cy = H / 2;
    const rot = local * 0.3;
    
    // 旋转立方体顶点
    const angle = rot;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    function rotate(x, y) {
      return [x * cos - y * sin, x * sin + y * cos];
    }
    
    // 绘制线框立方体
    ctx.save();
    ctx.translate(cx, cy);
    X.glow('#f5a623', 8);
    ctx.strokeStyle = '#f5a623';
    ctx.lineWidth = 1.5;
    
    const vertices = [];
    for (let i = 0; i < 8; i++) {
      const x = (i & 1 ? 1 : -1) * cubeSize / 2;
      const y = (i & 2 ? 1 : -1) * cubeSize / 2;
      const z = (i & 4 ? 1 : -1) * cubeSize / 2;
      const [rx, ry] = rotate(x, y);
      const [rx2, rz] = rotate(rx, z);
      vertices.push([rx2, ry, rz]);
    }
    
    // 简单透视投影
    const edges = [[0,1],[1,3],[3,2],[2,0],[4,5],[5,7],[7,6],[6,4],[0,4],[1,5],[2,6],[3,7]];
    edges.forEach(([a, b]) => {
      const [x1, y1, z1] = vertices[a];
      const [x2, y2, z2] = vertices[b];
      const scale1 = 200 / (200 + z1);
      const scale2 = 200 / (200 + z2);
      ctx.beginPath();
      ctx.moveTo(x1 * scale1, y1 * scale1);
      ctx.lineTo(x2 * scale2, y2 * scale2);
      ctx.stroke();
    });
    
    ctx.restore();
    
    // 数据粒子汇入
    const particleCount = 120;
    X.glow('#fff', 3);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < particleCount; i++) {
      const seed = i * 0.618;
      const phase = (local + seed) % dur;
      const progress = X.ease(Math.min(phase / 2, 1));
      
      const startAngle = seed * Math.PI * 2;
      const startDist = 600;
      const startX = cx + Math.cos(startAngle) * startDist;
      const startY = cy + Math.sin(startAngle) * startDist;
      
      const px = X.lerp(startX, cx, progress);
      const py = X.lerp(startY, cy, progress);
      
      if (progress < 0.95) {
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // 检索光束与答案
    const beamInterval = 2;
    const beamIndex = Math.floor(local / beamInterval);
    const beamT = (local % beamInterval) / beamInterval;
    
    if (beamT < 0.6 && local > 0.5) {
      const beamSeed = beamIndex * 0.789;
      const targetX = cx + 250 + Math.cos(beamSeed * 10) * 100;
      const targetY = cy - 200 + Math.sin(beamSeed * 15) * 80;
      
      const progress = X.ease(beamT / 0.6);
      const bx = X.lerp(cx, targetX, progress);
      const by = X.lerp(cy, targetY, progress);
      
      X.glow('#f5a623', 6);
      ctx.strokeStyle = '#f5a623';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(bx, by);
      ctx.stroke();
      
      if (progress > 0.95) {
        X.glow('#f5a623', 12);
        ctx.fillStyle = '#f5a623';
        ctx.beginPath();
        ctx.arc(targetX, targetY, 8, 0, Math.PI * 2);
        ctx.fill();
        
        X.txt('FOUND', targetX, targetY - 15, 10, '#f5a623', 'center', 1);
      }
    }
  }
});

SCENES.push({
  id: '06',
  title: 'GRAPH',
  t0: 30,
  t1: 35,
  sub: '连接知识',
  draw(t, ctx, W, H, X) {
    const local = t - this.t0;
    const dur = this.t1 - this.t0;
    
    const cx = W / 2;
    const cy = H / 2;
    const breathe = 1 + Math.sin(local * 1.5) * 0.08;
    const rotation = local * 0.15;
    
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.scale(breathe, breathe);
    
    // 节点数据：[层级, 角度偏移, 标签]
    const nodes = [
      [0, 0, '知识中心'],
      [1, 0, '机器学习'],
      [1, 2.09, '教育'],
      [1, 4.19, '创客'],
      [2, -0.5, '神经网络'],
      [2, 0.5, '深度学习'],
      [2, 1.8, '在线课程'],
      [2, 2.4, '课程设计'],
      [2, 3.9, '硬件'],
      [2, 4.5, '开源'],
      [3, -0.7, '卷积网络'],
      [3, 0.3, '生成模型'],
      [3, 1.6, '视频'],
      [3, 2.2, '互动'],
      [3, 3.7, '树莓派'],
      [3, 4.7, '社区']
    ];
    
    const layerRadius = [0, 120, 200, 280];
    const nodePos = [];
    
    nodes.forEach(([layer, angle, label], idx) => {
      const r = layerRadius[layer];
      const progress = X.ease(Math.min((local - layer * 0.3) / 0.8, 1));
      const currentR = r * progress;
      const x = Math.cos(angle) * currentR;
      const y = Math.sin(angle) * currentR;
      nodePos.push([x, y, layer, label, progress]);
    });
    
    // 绘制连线
    X.glow('#f5a623', 4);
    ctx.strokeStyle = 'rgba(245,166,35,0.4)';
    ctx.lineWidth = 1;
    
    nodePos.forEach(([x, y, layer, label, progress], idx) => {
      if (layer > 0 && progress > 0.5) {
        const parentLayer = layer - 1;
        nodePos.forEach(([px, py, pl], pidx) => {
          if (pl === parentLayer) {
            const dist = Math.hypot(x - px, y - py);
            if (dist < layerRadius[layer] - layerRadius[parentLayer] + 50) {
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(x, y);
              ctx.stroke();
            }
          }
        });
      }
    });
    
    // 绘制节点
    nodePos.forEach(([x, y, layer, label, progress]) => {
      if (progress > 0) {
        const size = layer === 0 ? 12 : 6;
        X.glow(layer === 0 ? '#f5a623' : '#fff', layer === 0 ? 8 : 4);
        ctx.fillStyle = layer === 0 ? '#f5a623' : '#fff';
        ctx.beginPath();
        ctx.arc(x, y, size * progress, 0, Math.PI * 2);
        ctx.fill();
        
        if (progress > 0.8) {
          const fontSize = layer === 0 ? 14 : 11;
          const color = layer === 0 ? '#f5a623' : '#ccc';
          X.txt(label, x, y + size + 16, fontSize, color, 'center', 0.5);
        }
      }
    });
    
    ctx.restore();
  }
});

SCENES.push({
  id: '07',
  title: 'IDENTITY',
  t0: 35,
  t1: 40,
  sub: '',
  draw(t, ctx, W, H, X) {
    const local = t - this.t0;
    const cx = W / 2;
    const cy = H / 2;
    
    // 线条汇聚与扩散
    if (local < 2) {
      const lineCount = 60;
      const progress = X.ease(local / 2);
      X.glow('#fff', 4);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      
      for (let i = 0; i < lineCount; i++) {
        const angle = (i / lineCount) * Math.PI * 2;
        const startDist = 500;
        const endDist = progress < 0.5 ? X.lerp(startDist, 0, progress * 2) : X.lerp(0, 600, (progress - 0.5) * 2);
        
        const x = cx + Math.cos(angle) * endDist;
        const y = cy + Math.sin(angle) * endDist;
        
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.globalAlpha = 1 - progress * 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    
    // 光环
    if (local > 1.5) {
      const ringProgress = Math.min((local - 1.5) / 1, 1);
      const ringRadius = 150 * X.ease(ringProgress);
      X.glow('#f5a623', 12);
      ctx.strokeStyle = '#f5a623';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    
    // 主标题
    if (local > 2) {
      const titleProgress = Math.min((local - 2) / 0.8, 1);
      const scale = X.ease(titleProgress);
      ctx.globalAlpha = scale;
      
      X.glow('#f5a623', 16);
      X.txt('张老师 TV', cx, cy - 20, 72 * scale, '#f5a623', 'center', 2);
      
      if (titleProgress > 0.5) {
        X.glow('#ccc', 4);
        X.txt('AI · 教育 · 未来', cx, cy + 50, 18, '#999', 'center', 4);
      }
      
      ctx.globalAlpha = 1;
    }
  }
});

// ============================================================
// B. Web Audio 生成式轻音乐
// ============================================================

let audioCtx = null;
let masterGain = null;
let isMuted = false;
let isAudioStarted = false;

window.__toggleMute = function() {
  if (!audioCtx || !masterGain) return;
  isMuted = !isMuted;
  masterGain.gain.setTargetAtTime(isMuted ? 0 : 0.14, audioCtx.currentTime, 0.1);
};

window.__onFirstGesture.push(function() {
  if (isAudioStarted) return;
  isAudioStarted = true;
  
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.14;
    
    // Delay 节点
    const delay = audioCtx.createDelay();
    delay.delayTime.value = 0.3;
    const delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.25;
    const delayWet = audioCtx.createGain();
    delayWet.gain.value = 0.2;
    
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(masterGain);
    
    masterGain.connect(audioCtx.destination);
    
    // Pad 和弦
    const chords = [
      [220, 261.63, 329.63], // Am
      [174.61, 220, 261.63], // F
      [130.81, 164.81, 196],  // C
      [196, 246.94, 293.66]   // G
    ];
    
    function playPad() {
      if (!audioCtx) return;
      
      const now = audioCtx.currentTime;
      const chordIndex = Math.floor((now / 8) % chords.length);
      const chord = chords[chordIndex];
      
      chord.forEach(freq => {
        const osc = audioCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 2);
        gain.gain.setValueAtTime(0.08, now + 6);
        gain.gain.linearRampToValueAtTime(0, now + 8);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        gain.connect(delay);
        
        osc.start(now);
        osc.stop(now + 8);
      });
      
      setTimeout(playPad, 8000);
    }
    
    playPad();
    
    // 五声音阶拨弦
    const pentatonic = [440, 523.25, 587.33, 659.25, 783.99, 880];
    let pluckSeed = 0.123;
    
    function seededRandom() {
      pluckSeed = (pluckSeed * 9301 + 49297) % 233280;
      return pluckSeed / 233280;
    }
    
    function playPluck() {
      if (!audioCtx) return;
      
      const now = audioCtx.currentTime;
      const freq = pentatonic[Math.floor(seededRandom() * pentatonic.length)];
      
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      
      osc.connect(gain);
      gain.connect(masterGain);
      gain.connect(delay);
      
      osc.start(now);
      osc.stop(now + 1.8);
      
      const nextDelay = 1200 + seededRandom() * 1300;
      setTimeout(playPluck, nextDelay);
    }
    
    playPluck();
    
  } catch (e) {
    // 静默降级
  }
});

// ============================================================
// C. 覆盖层控制与常量
// ============================================================

// 站长改成博客首页地址即可
const BLOG_URL = '#';

// 创建覆盖层
const endCard = document.createElement('div');
endCard.id = 'endCard';
endCard.style.cssText = `
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 24px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.8s ease;
`;

const btnContainer = document.createElement('div');
btnContainer.style.cssText = `
  display: flex;
  gap: 16px;
  pointer-events: auto;
`;

const btnBlog = document.createElement('a');
btnBlog.href = BLOG_URL;
btnBlog.textContent = '进入博客';
btnBlog.style.cssText = `
  padding: 16px 32px;
  background: #f5a623;
  color: #050505;
  text-decoration: none;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 600;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 16px rgba(245,166,35,0.4);
`;
btnBlog.onmouseenter = () => {
  btnBlog.style.transform = 'translateY(-2px)';
  btnBlog.style.boxShadow = '0 6px 24px rgba(245,166,35,0.6)';
};
btnBlog.onmouseleave = () => {
  btnBlog.style.transform = '';
  btnBlog.style.boxShadow = '0 4px 16px rgba(245,166,35,0.4)';
};

const btnReplay = document.createElement('button');
btnReplay.textContent = '再看一遍';
btnReplay.style.cssText = `
  padding: 16px 32px;
  background: transparent;
  color: #f5a623;
  border: 2px solid #f5a623;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
`;
btnReplay.onmouseenter = () => {
  btnReplay.style.background = '#f5a623';
  btnReplay.style.color = '#050505';
};
btnReplay.onmouseleave = () => {
  btnReplay.style.background = 'transparent';
  btnReplay.style.color = '#f5a623';
};
btnReplay.onclick = () => {
  window.__t = 0;
  endCard.style.display = 'none';
  endCard.style.opacity = '0';
};

btnContainer.appendChild(btnBlog);
btnContainer.appendChild(btnReplay);
endCard.appendChild(btnContainer);
document.body.appendChild(endCard);

// 轮询显隐
function checkEndCard() {
  const t = window.__t || 0;
  if (t >= 36) {
    if (endCard.style.display === 'none') {
      endCard.style.display = 'flex';
      setTimeout(() => {
        endCard.style.opacity = '1';
      }, 50);
    }
  } else {
    if (endCard.style.display === 'flex') {
      endCard.style.opacity = '0';
      setTimeout(() => {
        endCard.style.display = 'none';
      }, 800);
    }
  }
  requestAnimationFrame(checkEndCard);
}

checkEndCard();
