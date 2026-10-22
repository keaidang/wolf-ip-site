/* ============================================================
   小狼足球乐园 · 公共脚本
   导航注入 / 积分仓库(localStorage) / 签到 / Toast / 徽章
   ============================================================ */
(function(){
'use strict';

/* ---------- 工具 ---------- */
const $  = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};
const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

/* ---------- 站点配置 ---------- */
const NAV = [
  { href: 'index.html',   txt: '首页' },
  { href: 'ip.html',      txt: '小狼IP' },
  { href: 'match.html',   txt: '赛事中心' },
  { href: 'ar.html',      txt: 'AR体验' },
  { href: 'games.html',   txt: '足球乐园' },
  { href: 'players.html', txt: '球员展厅' },
  { href: 'about.html',   txt: '关于我们' }
];

/* ---------- 积分仓库 ---------- */
const STORE_KEY = 'wolfStore.v1';
const DEFAULT_STORE = {
  points: 0,
  logs: [],                 // {t, hm, type, desc, delta}
  checkin: { last: '', streak: 0 },
  badges: [],
  dailyGame: {},            // { '2026-10-18': { 'wolf-pass3d': 12 } }
  dailyAR: '',
  best: {},                 // { 'wolf-pass3d': 3 } 站点侧记录的各游戏最高分
  blindbox: { count: 0, items: [] }
};
function loadStore(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return JSON.parse(JSON.stringify(DEFAULT_STORE));
    const s = JSON.parse(raw);
    return Object.assign(JSON.parse(JSON.stringify(DEFAULT_STORE)), s);
  }catch(e){ return JSON.parse(JSON.stringify(DEFAULT_STORE)); }
}
function saveStore(s){ localStorage.setItem(STORE_KEY, JSON.stringify(s)); }
let store = loadStore();

const ICONS = { checkin:'📅', game:'🎮', share:'📣', ar:'📦', box:'🎁', shop:'🛒', badge:'🏅', sys:'⚙️' };

/** 记一笔积分流水并落库 */
function addPoints(delta, type, desc){
  store.points = Math.max(0, store.points + delta);
  store.logs.unshift({ t: today(), hm: nowHM(), type, desc, delta });
  if(store.logs.length > 60) store.logs.length = 60;
  saveStore(store);
  renderPoints();
  return store.points;
}

/** 今日某款游戏已获积分 */
function gamePointsToday(gameId){
  const d = store.dailyGame[today()] || {};
  return d[gameId] || 0;
}
/** 记录游戏积分（带单款日上限 20） */
function addGamePoints(gameId, gameName, pts){
  if(pts <= 0) return 0;
  const cap = 20, d = today();
  if(!store.dailyGame[d]) store.dailyGame[d] = {};
  const got = store.dailyGame[d][gameId] || 0;
  const real = Math.min(pts, cap - got);
  if(real <= 0){
    toast('今日《' + gameName + '》积分已满 20 分，明天再来～', '⏰');
    return 0;
  }
  store.dailyGame[d][gameId] = got + real;
  addPoints(real, 'game', gameName + ' 对局奖励');
  toast('对局结算 +' + real + ' 积分', '⚽');
  return real;
}

/** 记录站点侧最高分（游戏自身不一定持久化，由回传桥喂数据） */
function recordBest(gameId, score){
  if(!Number.isFinite(score) || score <= 0) return;
  if((store.best[gameId] || 0) >= score) return;
  store.best[gameId] = score;
  saveStore(store);
  renderBest();
}

/** 每日签到 */
function checkin(){
  const d = today();
  if(store.checkin.last === d){ toast('今天已经签过到了，明天再来', '📅'); return false; }
  const y = new Date(Date.now() - 86400000);
  const yStr = y.getFullYear() + '-' + pad(y.getMonth() + 1) + '-' + pad(y.getDate());
  store.checkin.streak = (store.checkin.last === yStr) ? store.checkin.streak + 1 : 1;
  store.checkin.last = d;
  const bonus = store.checkin.streak >= 7 ? 20 : 10;
  addPoints(bonus, 'checkin', '每日签到（连续 ' + store.checkin.streak + ' 天）');
  toast('签到成功 +' + bonus + ' 积分' + (store.checkin.streak >= 7 ? '（连签加成）' : ''), '📅');
  grantBadge('checkin7', store.checkin.streak >= 7);
  return true;
}

/** 徽章 */
const BADGES = {
  first:    { ic:'👋', name:'初见小狼', desc:'首次访问乐园' },
  checkin7: { ic:'📅', name:'全勤球迷', desc:'连续签到 7 天' },
  gamer:    { ic:'🎮', name:'乐园常客', desc:'任意游戏满 20 积分' },
  scorer:   { ic:'⚽', name:'神笔球王', desc:'单场打进 3 球' },
  tft:      { ic:'♟️', name:'狼教头',   desc:'棋阵到达 3 章' },
  link:     { ic:'🧩', name:'绝技达人', desc:'连连看解锁 6 个动作' },
  ar:       { ic:'📦', name:'AR 体验官', desc:'完成一次 AR 放置' },
  lucky:    { ic:'🎁', name:'欧气满满', desc:'抽到稀有及以上盲盒' }
};
function grantBadge(id, cond){
  if(cond === false) return;
  if(store.badges.includes(id)) return;
  store.badges.push(id);
  saveStore(store);
  const b = BADGES[id];
  if(b) toast('解锁徽章「' + b.name + '」', b.ic);
}

/* ---------- Toast ---------- */
function toast(msg, ic){
  let box = $('.toast-box');
  if(!box){
    box = document.createElement('div');
    box.className = 'toast-box';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<span class="ic">' + (ic || '🐺') + '</span><span>' + msg + '</span>';
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
}

/* ---------- 主题（浅色/深色） ---------- */
const THEME_KEY = 'wolf.theme';
function currentTheme(){
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
function applyThemeIcon(){
  const btn = document.getElementById('themeToggle');
  if(btn) btn.textContent = currentTheme() === 'dark' ? '☀️' : '🌙';
}
function toggleTheme(){
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
  applyThemeIcon();
}

/* ---------- 导航注入 ---------- */
function renderNav(){
  const host = $('#siteHeader');
  if(!host) return;
  const cur = location.pathname.split('/').pop() || 'index.html';
  const links = NAV.map(n =>
    '<a href="' + n.href + '"' + (n.href === cur ? ' class="on"' : '') + '>' + n.txt + '</a>'
  ).join('');
  host.innerHTML =
    '<div class="site-header"><div class="nav-inner">' +
      '<a class="brand" href="index.html">' +
        '<img src="assets/img/wolf.svg" alt="小狼">' +
        '<span class="bt"><b>小狼足球乐园</b><span>NANTONG SUPER WOLF</span></span>' +
      '</a>' +
      '<nav class="nav-links" id="navLinks">' + links + '</nav>' +
      '<button class="nav-theme" id="themeToggle" title="切换浅色/深色" aria-label="切换主题">🌙</button>' +
      '<a class="nav-cta" href="games.html">🎮 开始游戏</a>' +
      '<button class="nav-toggle" id="navToggle" aria-label="菜单">☰</button>' +
    '</div></div>';
  const t = $('#navToggle'), nl = $('#navLinks');
  if(t) t.addEventListener('click', () => nl.classList.toggle('open'));
  nl.addEventListener('click', e => { if(e.target.tagName === 'A') nl.classList.remove('open'); });
  const tt = $('#themeToggle');
  if(tt) tt.addEventListener('click', toggleTheme);
  applyThemeIcon();
}

/* ---------- 页脚注入 ---------- */
function renderFooter(){
  const host = $('#siteFooter');
  if(!host) return;
  host.innerHTML =
    '<div class="site-footer"><div class="container">' +
      '<div class="foot-grid">' +
        '<div class="foot-brand">' +
          '<img src="assets/img/wolf.svg" alt="小狼">' +
          '<p>南通苏超"小狼"足球 IP 交互系统——用 Web 游戏化设计与 AR 拓展体验，把一支球队的故事玩起来。</p>' +
        '</div>' +
        '<div class="foot-col"><h4>站点导航</h4>' +
          NAV.map(n => '<a href="' + n.href + '">' + n.txt + '</a>').join('') +
        '</div>' +
        '<div class="foot-col"><h4>玩法与福利</h4>' +
          '<a href="missions.html">任务与积分</a><a href="shop.html">盲盒兑换</a>' +
          '<a href="ar.html">AR 互动</a><a href="profile.html">个人中心</a>' +
        '</div>' +
        '<div class="foot-col"><h4>关于项目</h4>' +
          '<a href="about.html">团队介绍</a><a href="about.html#tech">技术架构</a>' +
          '<a href="about.html#contact">联系我们</a><a href="admin.html">后台管理</a>' +
        '</div>' +
      '</div>' +
      '<div class="foot-bottom">© 2026 小狼足球乐园 · 南通苏超"小狼"足球 IP 交互系统 · 毕业设计作品</div>' +
    '</div></div>';
}

/* ---------- 积分显示 ---------- */
function renderPoints(){
  $$('[data-points]').forEach(el => { el.textContent = store.points; });
}

/* ---------- 最高分显示（游戏卡上的"我的最高"） ---------- */
function renderBest(){
  $$('[data-best]').forEach(el => {
    const gid = el.dataset.best;
    const unit = el.dataset.unit || '分';
    const v = store.best[gid];
    el.textContent = v ? '🏅 我的最高：' + v + ' ' + unit : '🆕 还没玩过，来首秀';
  });
}

/* ---------- 启动 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  renderFooter();
  renderPoints();
  renderBest();
  initReveal();
  if(!localStorage.getItem('wolf.visited')){
    localStorage.setItem('wolf.visited', '1');
    grantBadge('first');
  }
});

/* ---------- 滚动入场（渐进增强） ----------
   JS 可用时才隐藏待入场区块；首屏 section 与无 JS 环境一律直接可见。
   三道兜底：IO 不可用 → 立即入场；IO 抛错 → 全部入场；1.2s 超时 → 全部入场。 */
function initReveal(){
  const secs = [...document.querySelectorAll('section')].slice(1);
  if(!secs.length) return;
  const showAll = () => secs.forEach(s => s.classList.add('in'));
  try{
    document.documentElement.classList.add('js');
    if('IntersectionObserver' in window){
      const io = new IntersectionObserver(es => {
        es.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
      secs.forEach(s => io.observe(s));
    }else{
      showAll();
    }
  }catch(e){
    showAll();
    return;
  }
  setTimeout(showAll, 1200);
}

/* ---------- PWA：注册 Service Worker（仅 http/https 环境） ---------- */
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 本地演示失败不影响站点 */ });
  });
}

/* ---------- 导出 ---------- */
window.Wolf = {
  $, $$, store, loadStore, saveStore, addPoints, addGamePoints,
  checkin, gamePointsToday, recordBest, renderBest, grantBadge, toast, today, nowHM,
  toggleTheme, currentTheme,
  BADGES, ICONS, NAV
};
})();
