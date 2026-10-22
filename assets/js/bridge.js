/* ============================================================
   小狼足球乐园 · 游戏分数回传桥（play.html 使用）
   轮询 iframe 内 DOM（同源）识别"结算态"，把游戏得分
   换算成积分写入本地仓库，并 postMessage 通知外层容器。
   四款游戏的结算态各不相同：
   - 神笔球王：modal 打开且内容含"评级"（结束弹窗，非开始菜单）
   - 狼之盘带：ovClear 通关浮层打开，读 cScore（本关得分）
   - 狼之棋阵：modal 打开且内容含"淘汰/冠军"（赛季结算，非局中强化）
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
      return !!(m && s && m.classList.contains('on') && /淘汰|冠军/.test(s.textContent || ''));
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

  setInterval(() => {
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
          parent.postMessage({ type: 'wolf:score', game: gameId, score: score, points: pts }, '*');
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
}

window.WolfBridge = { GAME_CFG, startBridge };
})();
