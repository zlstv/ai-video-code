// reel/cues.js: THE timeline for 《AI 进化之路》. 60 s, 8 beats × 7.5 s, 120 BPM (beat = 0.5 s).
// The page (reel.js) and the score both read it.
var KCUE = (() => {
  const B = n => +(n * 0.5).toFixed(4);                    // B(n) = time of beat n
  const S = { b1: 0, b2: 7.5, b3: 15, b4: 22.5, b5: 30, b6: 37.5, b7: 45, b8: 52.5 };
  return {
    bpm: 120, fps: 30, dur: 60, B, S,
    // chapters drive the segmented progress bar in the HUD
    CH: [
      ['01 对话', 0, 7.5], ['02 出手', 7.5, 15], ['03 桌面', 15, 22.5], ['04 眼手', 22.5, 30],
      ['05 AGENT', 30, 37.5], ['06 虚拟电脑', 37.5, 45], ['07 龙虾', 45, 52.5], ['08 搭子', 52.5, 60],
    ],
    hits: {
      // b1: chat typing
      typeUser: 2.2, typeAI: 3.6, counter: 5.2,
      // b2: gear + code
      gear: 8.2, code: 10.2, chips: 12.2,
      // b3: desktop
      capsule: 16.0, shot: 18.2, os: 20.2,
      // b4: cursor demo
      move: 23.6, click: 25.6, drag: 27.4,
      // b5: task tree
      split: 31.0, ticks: [32.4, 33.4, 34.4, 35.4],
      // b6: virtual computer
      panes: 38.6, work: 40.0, done: 44.2,
      // b7: lobster
      lobster: 46.2, bubble: 48.2, stars: 49.6,
      // b8: finale
      silhouette: 53.4, orbit: 54.4, words: 56.0, finale: 58.4,
    },
  };
})();
if (typeof module !== 'undefined') module.exports = KCUE;
