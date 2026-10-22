/* ============================================================
   小狼足球乐园 · 站点数据配置模块
   默认配置写死在本文件；管理员在 admin.html 的修改以
   JSON 形式覆盖存到 localStorage（key: wolf.admin.v1）。
   消费方：shop.html（奖池）、missions.html（任务）、
   match.html（快讯）、admin.html（管理界面）。
   正式版：这些配置改由后端 /api/news、/api/admin/* 下发，
          本模块的 load* 可直接换成 fetch。
   ============================================================ */
(function(){
'use strict';

const ADMIN_KEY = 'wolf.admin.v1';

/* ---------- 默认：狼群快讯（赛事中心消费） ---------- */
const DEFAULT_NEWS = [
  { id:'n1', date:'2026-10-25', kind:'fixture', title:'第 9 轮 · 南通小狼 VS 江宁狼群', summary:'主场 · 南通体育会展中心体育场 · 19:35 开球 · 主裁沈一鸣' },
  { id:'n2', date:'2026-11-01', kind:'fixture', title:'第 10 轮 · 海安独角兽 VS 南通小狼', summary:'19:35 · 海安体育中心 · 客场' },
  { id:'n3', date:'2026-11-08', kind:'fixture', title:'第 11 轮 · 南通小狼 VS 崇川铁联', summary:'15:30 · 南通体育会展中心体育场 · 主场' },
  { id:'n4', date:'2026-10-18', kind:'result',  title:'第 8 轮 · 南通小狼 3 : 1 海门飞鲨', summary:'陆铁牛 12\' · 周野 34\' · 陈骁 71\' ｜ 顾天驰零封' },
  { id:'n5', date:'2026-10-11', kind:'result',  title:'第 7 轮 · 港闸飓风 2 : 1 南通小狼', summary:'周野 58\' 扳回一球 · 客场控球率 61% 遭反击致败' },
  { id:'n6', date:'2026-10-04', kind:'result',  title:'第 6 轮 · 南通小狼 2 : 2 如皋灯塔', summary:'周野 23\' · 陈骁 90+4\' 补时绝平' },
  { id:'n7', date:'2026-09-27', kind:'result',  title:'第 5 轮 · 通州湾蓝鲸 0 : 2 南通小狼', summary:'陆铁牛 41\' · 周野 66\' · 赛季首次客场零封' },
  { id:'n8', date:'2026-10-20', kind:'news',    title:'小狼盲盒第三弹「赛季高光」上架', summary:'50 积分/次，新增签名球衣与队围巾两档实物奖品' },
  { id:'n9', date:'2026-10-16', kind:'news',    title:'苏小狼 AR 模块开启网页版兜底体验', summary:'没有微信环境也能放一只狼在桌面上，完成即 +20 积分' },
  { id:'n10',date:'2026-10-12', kind:'news',    title:'周野当选第 7 轮队内最佳', summary:'7 球领跑队内射手榜，球迷投票占比 68%' }
];

/* ---------- 默认：盲盒奖池（shop.html 消费） ---------- */
const DEFAULT_POOL = [
  { id:'p1', name:'小狼签名球衣',    ic:'🧥', rarity:'传说', weight:1,  form:'实物' },
  { id:'p2', name:'小狼队围巾',      ic:'🧣', rarity:'史诗', weight:5,  form:'实物' },
  { id:'p3', name:'球星闪卡·周野',  ic:'🃏', rarity:'稀有', weight:15, form:'电子' },
  { id:'p4', name:'赛季高光壁纸',    ic:'🖼️', rarity:'稀有', weight:15, form:'电子' },
  { id:'p5', name:'小狼表情包·扩展', ic:'😺', rarity:'普通', weight:24, form:'电子' },
  { id:'p6', name:'小狼头像框',      ic:'⚽', rarity:'普通', weight:24, form:'电子' },
  { id:'p7', name:'下次五折券',      ic:'🍀', rarity:'普通', weight:10, form:'电子' },
  { id:'p8', name:'谢谢参与',        ic:'💬', rarity:'—',   weight:6,  form:'—' }
];

/* ---------- 默认：每日任务（missions.html 消费） ---------- */
const DEFAULT_MISSIONS = [
  { key:'play',  ic:'🎮', name:'玩任意游戏 1 局', desc:'四款任选，结算即完成', pts:5,  enabled:true, act:'去乐园', href:'games.html' },
  { key:'share', ic:'📣', name:'分享站点给好友', desc:'每日 1 次，把狼分享出去', pts:5,  enabled:true, act:'分享',  href:'', share:true },
  { key:'ar',    ic:'📦', name:'AR 放置一次小狼', desc:'网页演示版也算', pts:20, enabled:true, act:'去放置', href:'ar.html' },
  { key:'box',   ic:'🎁', name:'抽 1 次盲盒', desc:'50 积分/次，试试欧气', pts:0,  enabled:true, act:'去抽奖', href:'shop.html', cost:50 }
];

/* ---------- 读写 ---------- */
function loadOverride(){
  try{
    const raw = localStorage.getItem(ADMIN_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
function saveOverride(obj){ localStorage.setItem(ADMIN_KEY, JSON.stringify(obj)); }

function getNews(){ const o = loadOverride(); return Array.isArray(o.news) ? o.news : DEFAULT_NEWS; }
function getPool(){ const o = loadOverride(); return Array.isArray(o.pool) ? o.pool : DEFAULT_POOL; }
function getMissions(){ const o = loadOverride(); return Array.isArray(o.missions) ? o.missions : DEFAULT_MISSIONS; }

function setNews(news){ const o = loadOverride(); o.news = news; saveOverride(o); }
function setPool(pool){ const o = loadOverride(); o.pool = pool; saveOverride(o); }
function setMissions(ms){ const o = loadOverride(); o.missions = ms; saveOverride(o); }

function resetAll(){
  localStorage.removeItem(ADMIN_KEY);
}

/* ---------- 工具 ---------- */
const KIND_LABEL = { fixture:'赛程', result:'赛果', news:'快讯' };
function fmtDateCN(d){
  const m = d.split('-');
  return m[1] + '月' + m[2] + '日';
}
function newsDateCN(d){
  const p = d.split('-');
  return { day: p[2], ym: p[1] + '月' };
}

window.WolfData = {
  ADMIN_KEY, DEFAULT_NEWS, DEFAULT_POOL, DEFAULT_MISSIONS,
  getNews, getPool, getMissions,
  setNews, setPool, setMissions, resetAll,
  KIND_LABEL, fmtDateCN, newsDateCN
};
})();
