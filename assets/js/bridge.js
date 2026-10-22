/* ============================================================
   小狼足球乐园 · 游戏分数回传桥（play.html 使用）
   轮询 iframe 内 DOM（同源）识别"结算态"，把游戏得分
   换算成积分写入本地仓库，并 postMessage 通知外层容器。
   四款游戏的结算态各不相同：
   - 神笔球王：modal 打开且内容含"评级"（结束弹窗，非开始菜单）
   - 狼之盘带：ovClear 通关浮层打开，读 cScore（本关得分）
   - 狼之棋阵：modal 打开且出现 #btnAgain（仅赛季结算弹窗有）
   - 绝技连连看：winov 通关浮层打开，读 sScore
   ============================================================ */
(function(){
'use strict';

const GAME_CFG = {
  'wolf-pass3d': {
    name: '神笔球王',
    isEnd: doc => {
      const m = doc.getElementById('modal'), s = doc.getElementById('sheet');
      return !!(m && s && m.classList.contains('on') && /评级|全场结束/.test(s.textContent || ''));
    },
    score: doc => parseInt((doc.getElementById('goals') || {}).textContent, 10) || 0,
    toPoints: s => s * 8 + (s >= 5 ? 4 : 0),
    unit: '球'
  },
  'wolf-dribble': {
    name: '狼之盘带',
    isEnd: doc => {
      const o = doc.getElementById('ovClear');
      return !!(o && o.classList.contains('on'));
    },
    score: doc => parseInt((doc.getElementById('cScore') || {}).textContent, 10) || 0,
    toPoints: s => Math.floor(s / 200),
    unit: '本关得分'
  },
  'wolf-tft': {
    name: '狼之棋阵',
    isEnd: doc => {
      const m = doc.getElementById('modal'), s = doc.getElementById('sheet');
      if(!(m && s && m.classList.contains('on'))) return false;
      /* 只认赛季结算弹窗：它带「再来一局」按钮（#btnAgain）。
         开局菜单带 #btnStart、局中战报带 #btnNext、玩法说明带 #btnCloseHelp，
         文案里同样会出现「冠军 / 淘汰」，仅靠文本判断会把开局当成结算。 */
      return !!doc.getElementById('btnAgain');
    },
    score: doc => {
      const el = doc.getElementById('pStage');
      if(!el) return 0;
      const m = (el.textContent || '').match(/(\d+)\D+(\d+)/);
      return m ? (+m[1]) * 5 + (+m[2]) : 0;
    },
    toPoints: s => s,
    unit: '关卡分'
  },
  'football-linkgame': {
    name: '绝技连连看',
    isEnd: doc => {
      const w = doc.getElementById('winov');
      return !!(w && w.classList.contains('on'));
    },
    score: doc => parseInt((doc.getElementById('sScore') || {}).textContent, 10) || 0,
    toPoints: s => Math.floor(s / 100),
    unit: '得分'
  }
};

/**
 * 启动回传桥
 * @param iframe  游戏 iframe 元素
 * @param gameId  游戏目录名
 * @param onScore 回调 (score, points) —— 由页面决定如何入账
 */
function startBridge(iframe, gameId, onScore){
  const cfg = GAME_CFG[gameId];
  if(!cfg || !iframe){ console.warn('[bridge] 未知游戏', gameId); return; }
  let lastReported = 0, closeTimer = null;

  const timer = setInterval(() => {
    let doc;
    try{ doc = iframe.contentDocument; }catch(e){ return; }   // 跨域则放弃
    if(!doc || !doc.getElementById) return;

    const end = cfg.isEnd(doc);
    const score = cfg.score(doc);

    if(end){
      if(closeTimer){ clearTimeout(closeTimer); closeTimer = null; }
      if(score < lastReported) lastReported = 0;      // 新对局，分数归零
      if(score > lastReported){
        lastReported = score;
        const pts = cfg.toPoints(score);
        try{
          /* 只在被外层容器嵌入时广播给父窗口。顶层打开时 parent === window，
             自我投递会被 play.html 自己的 message 监听器再收一次 → 积分翻倍。 */
          if(window.parent && window.parent !== window){
            window.parent.postMessage({ type: 'wolf:score', game: gameId, score: score, points: pts }, '*');
          }
        }catch(e){}
        if(onScore) onScore(score, pts);
      }
    }else if(!closeTimer){
      // 结算浮层关闭 2.5s 后，把当前分数设为基线，避免重复计分
      closeTimer = setTimeout(() => {
        closeTimer = null;
        lastReported = Math.max(0, cfg.score(iframe.contentDocument || document));
      }, 2500);
    }
  }, 900);
  return timer;               // 返回计时器，便于测试/销毁
}

window.WolfBridge = { GAME_CFG, startBridge };
})();
