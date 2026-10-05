// reel/cues.js: THE timeline for 《课搭AI校园平台》60秒介绍短片. 60 s, 8 beats × 7.5 s, 120 BPM (beat = 0.5 s).
// The page (reel.js) and the score both read it.
var KCUE = (() => {
  const B = n => +(n * 0.5).toFixed(4);                    // B(n) = time of beat n
  const S = { b1: 0, b2: 7.5, b3: 15, b4: 22.5, b5: 30, b6: 37.5, b7: 45, b8: 52.5 };
  return {
    bpm: 120, fps: 30, dur: 60, B, S,
    // chapters drive the segmented progress bar in the HUD
    CH: [
      ['01 一句话', 0, 7.5], ['02 生成', 7.5, 15], ['03 发布', 15, 22.5], ['04 学生学', 22.5, 30],
      ['05 陪伴', 30, 37.5], ['06 创作', 37.5, 45], ['07 家长', 45, 52.5], ['08 收尾', 52.5, 60],
    ],
    hits: {
      // b1: typing
      typeStart: 1.6, typeDone: 4.6, cursor: 5.2,
      // b2: code stream -> 3 icons
      stream: 8.4, icon1: 10.0, icon2: 11.2, icon3: 12.4,
      // b3: paper plane -> class
      plane: 16.0, tablets: [18.0, 18.6, 19.2, 19.8, 20.4, 21.0, 21.6],
      // b4: pagoda rotate + quiz
      pagoda: 23.4, quiz: 25.6, progress: 27.4,
      // b5: two dialog bubbles
      bub1: 31.2, bub2: 33.6,
      // b6: paint -> plaza
      paint: 38.6, plaza: 41.0, like: 43.0,
      // b7: phone lights up
      phone: 46.2, stats: 48.0, timeline: 49.8,
      // b8: finale
      dataflow: 53.4, slogan: 55.6, finale: 58.4,
    },
  };
})();
if (typeof module !== 'undefined') module.exports = KCUE;
