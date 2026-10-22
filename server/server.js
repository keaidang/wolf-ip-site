/* ============================================================
   小狼足球乐园 · 后端骨架（Node.js 22 原生模块，零 npm 依赖）
   - node:http   原生 HTTP 服务
   - node:sqlite Node 22 内置 SQLite（生产可平滑换 MySQL，
                表结构见 ARCHITECTURE.md 第六节）
   启动：node server.js        （默认 3000 端口）
   说明：
   1. 本服务只负责 /api/*，静态站点由独立静态服务器托管；
   2. 积分入账的核心是「后端验分」：前端只上报
      {gameId, score, durationSec}，倍率与日上限在服务端算；
   3. 演示期用固定演示用户，正式版替换为微信 code2session。
   ============================================================ */
'use strict';

const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DEMO_USER = 1;   // 演示用户；正式版：req.userId = verifyWechatSession(token)

/* ---------- 数据库 ---------- */
const db = new DatabaseSync(path.join(__dirname, 'wolf.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  openid     TEXT UNIQUE,
  nickname   TEXT NOT NULL DEFAULT '苏小狼球迷',
  points     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS points_log(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  delta      INTEGER NOT NULL,
  type       TEXT NOT NULL,
  desc       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS blindbox(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  item       TEXT NOT NULL,
  rarity     TEXT NOT NULL,
  form       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS news(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,                -- YYYY-MM-DD
  kind       TEXT NOT NULL DEFAULT 'news', -- fixture/result/news
  title      TEXT NOT NULL,
  summary    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_log_user ON points_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_box_user ON blindbox(user_id, created_at);
`);
if(!db.prepare('SELECT id FROM users WHERE id = ?').get(DEMO_USER)){
  db.prepare('INSERT INTO users(id, nickname) VALUES(?, ?)').run(DEMO_USER, '苏小狼球迷');
}

/* ---------- 积分规则（服务端唯一真相） ---------- */
const RATE = {
  checkin:          () => 10,
  'wolf-pass3d':       s => s * 8 + (s >= 5 ? 4 : 0),
  'wolf-dribble':      s => Math.floor(s / 200),
  'wolf-tft':          s => s,
  'football-linkgame': s => Math.floor(s / 100),
  share:            () => 5,
  ar:               () => 20
};
const DAILY_CAP_GAME = 20;
const MIN_SEC = { 'wolf-pass3d': 20, 'wolf-dribble': 15, 'wolf-tft': 30, 'football-linkgame': 20 };
const MAX_SCORE = { 'wolf-pass3d': 30, 'wolf-dribble': 30000, 'wolf-tft': 300, 'football-linkgame': 5000 };

const POOL = [
  { name: '小狼签名球衣',    rarity: '传说', weight: 1,  form: 'physical' },
  { name: '小狼队围巾',      rarity: '史诗', weight: 5,  form: 'physical' },
  { name: '球星闪卡·周野',  rarity: '稀有', weight: 15, form: 'electronic' },
  { name: '赛季高光壁纸',    rarity: '稀有', weight: 15, form: 'electronic' },
  { name: '小狼表情包·扩展', rarity: '普通', weight: 24, form: 'electronic' },
  { name: '小狼头像框',      rarity: '普通', weight: 24, form: 'electronic' },
  { name: '下次五折券',      rarity: '普通', weight: 10, form: 'electronic' },
  { name: '谢谢参与',        rarity: '—',   weight: 6,  form: 'none' }
];
const POOL_TOTAL = POOL.reduce((s, p) => s + p.weight, 0);
const BOX_COST = 50;

/* ---------- 工具 ---------- */
function addPoints(userId, delta, type, desc){
  db.prepare('UPDATE users SET points = MAX(0, points + ?) WHERE id = ?').run(delta, userId);
  db.prepare('INSERT INTO points_log(user_id, delta, type, desc) VALUES(?,?,?,?)')
    .run(userId, delta, type, desc || null);
  return db.prepare('SELECT points FROM users WHERE id = ?').get(userId).points;
}
function totalPoints(userId){
  return db.prepare('SELECT points FROM users WHERE id = ?').get(userId).points;
}
function gamePointsToday(userId, gameId){
  return db.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS got FROM points_log
    WHERE user_id = ? AND type = 'game' AND desc LIKE ?
      AND date(created_at) = date('now','localtime')
  `).get(userId, gameId + '%').got;
}
function doneToday(userId, type){
  return db.prepare(`
    SELECT COUNT(*) AS n FROM points_log
    WHERE user_id = ? AND type = ? AND date(created_at) = date('now','localtime')
  `).get(userId, type).n > 0;
}

/* ---------- 路由 ---------- */
const routes = {
  'GET /api/health': () => ({ ok: true, data: { ts: new Date().toISOString() } }),

  /* 1. 我的资料 + 积分 */
  'GET /api/me': () => ({
    ok: true,
    data: db.prepare('SELECT id, nickname, points FROM users WHERE id = ?').get(DEMO_USER)
  }),

  /* 2. 每日签到（幂等；连签 7 天起 +20） */
  'POST /api/checkin': () => {
    if(doneToday(DEMO_USER, 'checkin')) return { ok: false, msg: '今日已签到', code: 409 };
    const streak = db.prepare(`
      SELECT COUNT(*) AS n FROM points_log
      WHERE user_id = ? AND type = 'checkin'
        AND date(created_at) BETWEEN date('now','localtime','-6 days') AND date('now','localtime')
    `).get(DEMO_USER).n;
    const pts = streak >= 6 ? 20 : 10;
    return { ok: true, data: { points: pts, total: addPoints(DEMO_USER, pts, 'checkin', '每日签到') } };
  },

  /* 3. 游戏结算上报（核心：服务端验分 + 日上限） */
  'POST /api/game/score': body => {
    const { gameId, score, durationSec } = body || {};
    const fn = RATE[gameId];
    if(!fn) return { ok: false, msg: '未知游戏', code: 400 };
    if(!Number.isFinite(score) || score < 0) return { ok: false, msg: '分数不合法', code: 400 };
    if(!Number.isFinite(durationSec) || durationSec < (MIN_SEC[gameId] || 0))
      return { ok: false, msg: '对局时长异常，本局不计分', code: 422 };
    if(score > (MAX_SCORE[gameId] || Infinity))
      return { ok: false, msg: '单局得分异常，本局不计分', code: 422 };

    const room = DAILY_CAP_GAME - gamePointsToday(DEMO_USER, gameId);
    if(room <= 0) return { ok: true, data: { points: 0, capped: true, total: totalPoints(DEMO_USER) } };
    const pts = Math.min(Math.floor(fn(score)), room);
    if(pts <= 0) return { ok: true, data: { points: 0, total: totalPoints(DEMO_USER) } };
    return { ok: true, data: { points: pts, capped: false, total: addPoints(DEMO_USER, pts, 'game', gameId + ' 对局奖励') } };
  },

  /* 4. 分享奖励 */
  'POST /api/share': () => {
    if(doneToday(DEMO_USER, 'share')) return { ok: false, msg: '今日分享奖励已领', code: 409 };
    return { ok: true, data: { points: 5, total: addPoints(DEMO_USER, 5, 'share', '分享站点') } };
  },

  /* 5. AR 体验奖励 */
  'POST /api/ar': () => {
    if(doneToday(DEMO_USER, 'ar')) return { ok: false, msg: '今日 AR 奖励已领', code: 409 };
    return { ok: true, data: { points: 20, total: addPoints(DEMO_USER, 20, 'ar', 'AR 放置体验') } };
  },

  /* 6. 积分流水 */
  'GET /api/points/log': () => ({
    ok: true,
    data: db.prepare(`
      SELECT delta, type, desc, created_at FROM points_log
      WHERE user_id = ? ORDER BY id DESC LIMIT 60
    `).all(DEMO_USER)
  }),

  /* 7. 盲盒抽奖（服务端定奖，最多十连） */
  'POST /api/shop/draw': body => {
    const times = Math.min(Math.max(parseInt((body || {}).times, 10) || 1, 1), 10);
    const cost = BOX_COST * times;
    if(totalPoints(DEMO_USER) < cost) return { ok: false, msg: '积分不足', code: 402 };
    const results = [];
    for(let i = 0; i < times; i++){
      let r = Math.random() * POOL_TOTAL, pick = POOL[POOL.length - 1];
      for(const p of POOL){ r -= p.weight; if(r <= 0){ pick = p; break; } }
      db.prepare('INSERT INTO blindbox(user_id, item, rarity, form) VALUES(?,?,?,?)')
        .run(DEMO_USER, pick.name, pick.rarity, pick.form);
      results.push(pick);
    }
    return { ok: true, data: { results, cost, total: addPoints(DEMO_USER, -cost, 'shop', '盲盒抽取 ×' + times) } };
  },

  /* 8. 兑换记录 */
  'GET /api/shop/records': () => ({
    ok: true,
    data: db.prepare(`
      SELECT item, rarity, form, created_at FROM blindbox
      WHERE user_id = ? ORDER BY id DESC LIMIT 60
    `).all(DEMO_USER)
  }),

  /* 9. 周榜（本周积分合计） */
  'GET /api/leaderboard/weekly': () => ({
    ok: true,
    data: db.prepare(`
      SELECT u.id, u.nickname, COALESCE(SUM(l.delta), 0) AS weekly
      FROM users u LEFT JOIN points_log l
        ON l.user_id = u.id AND l.type != 'shop'
        AND date(l.created_at) >= date('now','localtime','-7 days')
      GROUP BY u.id ORDER BY weekly DESC LIMIT 20
    `).all()
  }),

  /* 10. 资讯列表（公开） */
  'GET /api/news': () => ({
    ok: true,
    data: db.prepare(`
      SELECT id, date, kind, title, summary FROM news ORDER BY date DESC, id DESC LIMIT 100
    `).all()
  })
};

/* ---------- 后台资讯管理（演示 token 鉴权，正式版换登录态+权限） ---------- */
const ADMIN_TOKEN = process.env.WOLF_ADMIN_TOKEN || 'wolf2026';
const adminRoutes = {
  /* 新增 */
  'POST /api/admin/news': (body, req) => {
    const { date, kind, title, summary } = body || {};
    if(!date || !title) return { ok: false, msg: 'date 和 title 必填', code: 400 };
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, msg: 'date 格式应为 YYYY-MM-DD', code: 400 };
    if(!['fixture', 'result', 'news'].includes(kind || 'news')) return { ok: false, msg: 'kind 仅支持 fixture/result/news', code: 400 };
    db.prepare('INSERT INTO news(date, kind, title, summary) VALUES(?,?,?,?)')
      .run(date, kind || 'news', title, summary || '');
    return { ok: true, data: { id: db.prepare('SELECT last_insert_rowid() AS id').get().id } };
  },
  /* 修改 */
  'PUT /api/admin/news': (body) => {
    const { id, date, kind, title, summary } = body || {};
    if(!id) return { ok: false, msg: '缺少 id', code: 400 };
    const n = db.prepare('SELECT * FROM news WHERE id = ?').get(id);
    if(!n) return { ok: false, msg: '条目不存在', code: 404 };
    db.prepare('UPDATE news SET date = ?, kind = ?, title = ?, summary = ? WHERE id = ?')
      .run(date || n.date, kind || n.kind, title || n.title,
           summary === undefined ? n.summary : summary, id);
    return { ok: true };
  },
  /* 删除 */
  'DELETE /api/admin/news': (body) => {
    const { id } = body || {};
    if(!id) return { ok: false, msg: '缺少 id', code: 400 };
    db.prepare('DELETE FROM news WHERE id = ?').run(id);
    return { ok: true };
  }
};

/* ---------- HTTP 服务 ---------- */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const key = req.method + ' ' + u.pathname;

  /* CORS（演示期放开，正式版收域名白名单） */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if(req.method === 'OPTIONS'){ res.writeHead(204); res.end(); return; }

  const isAdmin = u.pathname.startsWith('/api/admin/');
  let handler = routes[key];
  if(!handler && isAdmin){
    /* 演示 token 鉴权：正式版替换为登录态 + 角色权限 */
    if(req.headers['x-admin-token'] !== ADMIN_TOKEN){
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, msg: '未授权：x-admin-token 无效' }));
      return;
    }
    handler = adminRoutes[key];
  }
  if(!handler){
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, msg: 'Not Found: ' + key }));
    return;
  }
  let body = '';
  req.on('data', c => { body += c; if(body.length > 1e5) req.destroy(); });
  req.on('end', () => {
    let parsed = {};
    if(body){ try{ parsed = JSON.parse(body); }catch{ /* 忽略非 JSON */ } }
    let out;
    try{ out = handler(parsed); }
    catch(e){ out = { ok: false, msg: '服务器内部错误: ' + e.message, code: 500 }; }
    res.writeHead(out.code || 200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(out));
  });
});

server.listen(PORT, () => {
  console.log('[wolf-ip-server] API listening on http://localhost:' + PORT);
  console.log('[wolf-ip-server] 零 npm 依赖（node:http + node:sqlite），数据文件: server/wolf.db');
  console.log('[wolf-ip-server] 后台资讯 token: ' + ADMIN_TOKEN + '（请求头 x-admin-token）');
  console.log('[wolf-ip-server] 前端静态站点请用独立服务器托管（如 python -m http.server）');
});
