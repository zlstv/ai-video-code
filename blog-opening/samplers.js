const SAMPLERS = {
  neural(i, N, U) {
    function mulberry(a) {
      return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const rng = mulberry(i * 7919 + 13);
    const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng();
    
    const layers = [
      { x: -9, count: 6 },
      { x: -3, count: 9 },
      { x: 3, count: 9 },
      { x: 9, count: 5 }
    ];
    
    const nodes = [];
    layers.forEach(layer => {
      for (let j = 0; j < layer.count; j++) {
        const angle = (j / layer.count) * U.TAU;
        const radius = 5.5;
        nodes.push({
          x: layer.x + (r1 - 0.5) * 0.3,
          y: Math.cos(angle) * radius + (r2 - 0.5) * 0.3,
          z: Math.sin(angle) * radius + (r3 - 0.5) * 0.3
        });
      }
    });
    
    if (r1 < 0.55) {
      const nodeIdx = Math.floor(r2 * nodes.length);
      const node = nodes[nodeIdx];
      const g1 = Math.sqrt(-2 * Math.log(r3)) * Math.cos(U.TAU * r4);
      const g2 = Math.sqrt(-2 * Math.log(r5)) * Math.cos(U.TAU * r1);
      const g3 = Math.sqrt(-2 * Math.log(r2)) * Math.cos(U.TAU * r3);
      return [
        node.x + g1 * 0.35,
        node.y + g2 * 0.35,
        node.z + g3 * 0.35
      ];
    } else {
      const layerIdx = Math.floor(r2 * 3);
      let startIdx = 0;
      for (let li = 0; li < layerIdx; li++) startIdx += layers[li].count;
      const n1Idx = startIdx + Math.floor(r3 * layers[layerIdx].count);
      const n2Start = startIdx + layers[layerIdx].count;
      const n2Idx = n2Start + Math.floor(r4 * layers[layerIdx + 1].count);
      const n1 = nodes[n1Idx];
      const n2 = nodes[n2Idx];
      const k = r5;
      return [
        U.lerp(n1.x, n2.x, k) + (r1 - 0.5) * 0.5,
        U.lerp(n1.y, n2.y, k) + (r2 - 0.5) * 0.5,
        U.lerp(n1.z, n2.z, k) + (r3 - 0.5) * 0.5
      ];
    }
  },

  text_edu(i, N, U) {
    function mulberry(a) {
      return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const rng = mulberry(i * 7919 + 13);
    const r1 = rng(), r2 = rng(), r3 = rng();
    
    const points = U.sampleText("教育", { fontPx: 380, worldW: 24, step: 4 });
    const len = points.length / 3;
    if (len === 0) return null;
    const idx = i % len;
    return [
      points[idx * 3] + (r1 - 0.5) * 0.5,
      points[idx * 3 + 1] + (r2 - 0.5) * 0.5,
      points[idx * 3 + 2] + (r3 - 0.5) * 0.5
    ];
  },

  gear(i, N, U) {
    function mulberry(a) {
      return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const rng = mulberry(i * 7919 + 13);
    const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
    
    const type = r1;
    
    if (type < 0.1) {
      const angle = r2 * U.TAU;
      const radius = 4.2;
      return [
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        (r3 - 0.5) * 1.6
      ];
    } else if (type < 0.18) {
      const spokeIdx = Math.floor(r2 * 6);
      const spokeAngle = (spokeIdx / 6) * U.TAU;
      const k = r3;
      const radius = U.lerp(0, 7, k);
      return [
        Math.cos(spokeAngle) * radius,
        Math.sin(spokeAngle) * radius,
        (r4 - 0.5) * 1.6
      ];
    } else {
      const t = r2 * U.TAU;
      const toothPhase = (t / (U.TAU / 12)) % 1;
      const radius = 7 + (toothPhase < 0.45 ? 1.8 : 0);
      return [
        Math.cos(t) * radius,
        Math.sin(t) * radius,
        (r3 - 0.5) * 1.6
      ];
    }
  },

  text_agent(i, N, U) {
    function mulberry(a) {
      return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const rng = mulberry(i * 7919 + 13);
    const r1 = rng(), r2 = rng(), r3 = rng();
    
    const points = U.sampleText("智能体", { fontPx: 300, worldW: 26, step: 4 });
    const len = points.length / 3;
    if (len === 0) return null;
    const idx = i % len;
    return [
      points[idx * 3] + (r1 - 0.5) * 0.5,
      points[idx * 3 + 1] + (r2 - 0.5) * 0.5,
      points[idx * 3 + 2] + (r3 - 0.5) * 0.5
    ];
  },

  cube(i, N, U) {
    function mulberry(a) {
      return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const rng = mulberry(i * 7919 + 13);
    const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
    
    const s = 5.5;
    const edges = [
      [[-s,-s,-s], [s,-s,-s]], [[s,-s,-s], [s,s,-s]], [[s,s,-s], [-s,s,-s]], [[-s,s,-s], [-s,-s,-s]],
      [[-s,-s,s], [s,-s,s]], [[s,-s,s], [s,s,s]], [[s,s,s], [-s,s,s]], [[-s,s,s], [-s,-s,s]],
      [[-s,-s,-s], [-s,-s,s]], [[s,-s,-s], [s,-s,s]], [[s,s,-s], [s,s,s]], [[-s,s,-s], [-s,s,s]]
    ];
    
    const edgeIdx = Math.floor(r1 * 12);
    const edge = edges[edgeIdx];
    const k = r2;
    
    return [
      U.lerp(edge[0][0], edge[1][0], k) + (r3 - 0.5) * 0.3,
      U.lerp(edge[0][1], edge[1][1], k) + (r4 - 0.5) * 0.3,
      U.lerp(edge[0][2], edge[1][2], k) + (r1 - 0.5) * 0.3
    ];
  },

  graph(i, N, U) {
    function mulberry(a) {
      return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const rng = mulberry(i * 7919 + 13);
    const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng(), r6 = rng();
    
    const nodes = [];
    const radius = 8;
    const phi = (1 + Math.sqrt(5)) / 2;
    for (let j = 0; j < 40; j++) {
      const y = 1 - (j / (40 - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = U.TAU * j / phi;
      nodes.push([
        Math.cos(theta) * radiusAtY * radius,
        y * radius,
        Math.sin(theta) * radiusAtY * radius
      ]);
    }
    
    if (r1 < 0.5) {
      const nodeIdx = Math.floor(r2 * 40);
      const node = nodes[nodeIdx];
      return [
        node[0] + (r3 - 0.5) * 0.8,
        node[1] + (r4 - 0.5) * 0.8,
        node[2] + (r5 - 0.5) * 0.8
      ];
    } else {
      const n1Idx = Math.floor(r2 * 40);
      const n2Idx = Math.floor(r3 * 40);
      const n1 = nodes[n1Idx];
      const n2 = nodes[n2Idx];
      const k = r4;
      return [
        U.lerp(n1[0], n2[0], k) + (r5 - 0.5) * 1.2,
        U.lerp(n1[1], n2[1], k) + (r6 - 0.5) * 1.2,
        U.lerp(n1[2], n2[2], k) + (r1 - 0.5) * 1.2
      ];
    }
  },

  text_tv(i, N, U) {
    function mulberry(a) {
      return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const rng = mulberry(i * 7919 + 13);
    const r1 = rng(), r2 = rng(), r3 = rng();
    
    const points = U.sampleText("张老师 TV", { fontPx: 230, worldW: 30, step: 4 });
    const len = points.length / 3;
    if (len === 0) return null;
    const idx = i % len;
    return [
      points[idx * 3] + (r1 - 0.5) * 0.5,
      points[idx * 3 + 1] + (r2 - 0.5) * 0.5,
      points[idx * 3 + 2] + (r3 - 0.5) * 0.5
    ];
  }
};
