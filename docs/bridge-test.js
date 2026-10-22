#!/usr/bin/env node
/* ============================================================
   bridge.js 回归测试（零依赖）：node docs/bridge-test.js
   锁死两个答辩前修过的 bug：
   1) 狼之棋阵开局菜单含"冠军"文案 → 不得被判为赛季结算
   2) 顶层打开 play.html 时 parent === window → 不得自我 postMessage 造成二次入账
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'bridge.js'), 'utf8');
let pass = 0;
const fails = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; return; }
  fails.push(name + (detail ? ' → ' + detail : ''));
};

function fakeDoc({ modalOn = false, text = '', ids = [] } = {}) {
  const els = {
    modal: { classList: { contains: c => modalOn && c === 'on' } },
    sheet: { textContent: text },
    pStage: { textContent: '3-12' }
  };
  for (const id of ids) els[id] = { id };
  return { getElementById: id => els[id] || null };
}

function makeBridge({ embedded }) {
  const posted = [];
  const win = {};
  win.parent = embedded ? { postMessage: m => posted.push(m) } : win;
  const sandbox = {
    window: win,
    document: {},
    console,
    setInterval, clearInterval, setTimeout, clearTimeout, Date
  };
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox, { filename: 'bridge.js' });
  return { api: sandbox.window.WolfBridge, posted };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { api } = makeBridge({ embedded: false });
  check('bridge 暴露 WolfBridge', !!api && typeof api.startBridge === 'function');
  const tft = api.GAME_CFG['wolf-tft'];

  /* 1. 开局菜单：modal 打开、文案含"冠军"、带 #btnStart、不带 #btnAgain */
  const startMenu = fakeDoc({ modalOn: true, text: '登顶冠军棋阵 开始游戏', ids: ['btnStart'] });
  check('狼之棋阵开局菜单不判结算', tft.isEnd(startMenu) === false);
  check('开局菜单分数仍可读', tft.score(startMenu) === 27, String(tft.score(startMenu)));

  /* 2. 赛季结算：带 #btnAgain */
  const seasonEnd = fakeDoc({ modalOn: true, text: '💔 淘汰出局', ids: ['btnAgain'] });
  check('狼之棋阵赛季结算判为结算', tft.isEnd(seasonEnd) === true);

  /* 3. 局中战报（#btnNext）不判结算 */
  const roundEnd = fakeDoc({ modalOn: true, text: '🎉 战斗胜利', ids: ['btnNext'] });
  check('狼之棋阵局中战报不判结算', tft.isEnd(roundEnd) === false);

  /* 4. 顶层打开：onScore 只回调一次，且不向自己 postMessage */
  {
    const { api: a, posted } = makeBridge({ embedded: false });
    const got = [];
    const timer = a.startBridge({ contentDocument: seasonEnd }, 'wolf-tft', (s, p) => got.push([s, p]));
    await sleep(1100);
    clearInterval(timer);
    check('顶层只入账一次', got.length === 1, JSON.stringify(got));
    check('顶层不自我 postMessage', posted.length === 0, JSON.stringify(posted));
    check('入账数值正确 27 分', got[0] && got[0][1] === 27, JSON.stringify(got[0]));
  }

  /* 5. 被容器嵌入：仍然向父窗口广播一次，同时回调一次 */
  {
    const { api: a, posted } = makeBridge({ embedded: true });
    const got = [];
    const timer = a.startBridge({ contentDocument: seasonEnd }, 'wolf-tft', (s, p) => got.push([s, p]));
    await sleep(1100);
    clearInterval(timer);
    check('嵌入时回调一次', got.length === 1, JSON.stringify(got));
    check('嵌入时向父窗口广播一次', posted.length === 1, JSON.stringify(posted));
    check('广播载荷正确', posted[0] && posted[0].type === 'wolf:score' && posted[0].points === 27,
      JSON.stringify(posted[0]));
  }

  console.log('bridge 回归测试');
  console.log('通过 ' + pass + ' / ' + (pass + fails.length) + '，失败 ' + fails.length);
  if (fails.length) {
    for (const f of fails) console.log('  ✗ ' + f);
    process.exit(1);
  }
  console.log('✓ 全部通过');
})();
