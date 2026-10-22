/* ============================================================
   小狼足球乐园 · Service Worker
   策略：
   - 页面导航（HTML）：网络优先，失败回退缓存（保证更新可见、
     离线可开）；完全离线且无缓存时回退首页
   - 静态资源（css/js/img）：缓存优先，运行时入库（游戏本体
     首次玩过之后即可离线玩）
   - 仅处理同源 GET
   ============================================================ */
'use strict';

/* v13：修复游戏结算重复入账、狼之棋阵开局被误判为赛季结束；
   AR 页统一走程序化建模，不再加载任何 GLB 模型文件。
   bump VERSION 让老访客丢弃旧缓存、拿到新的 bridge.js / play.html */
const VERSION = 'wolf-v13';
const CORE = [
  './',
  './index.html',
  './games.html',
  './play.html',
  './missions.html',
  './shop.html',
  './profile.html',
  './ar.html',
  './ip.html',
  './match.html',
  './players.html',
  './about.html',
  './admin.html',
  './404.html',
  './manifest.webmanifest',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/ar-webgl.js',
  './assets/js/data.js',
  './assets/js/bridge.js',
  './assets/img/wolf.svg',
  './assets/img/mascot-cutout.webp',
  './assets/img/mascot.jpg',
  './assets/img/covers/wolf-pass3d.jpg',
  './assets/img/covers/wolf-dribble.jpg',
  './assets/img/covers/wolf-tft.jpg',
  './assets/img/covers/football-linkgame.jpg'
];
/* 说明：AR 页（ar.html）以 badge:true 走程序化建模分支，不下载任何模型文件，
   所以 CORE 里没有任何 .glb；其余静态资源走下方「缓存优先 + 运行时入库」。 */

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    /* 逐个入库，单个失败不拖垮整个安装 */
    await Promise.all(CORE.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;

  /* 页面导航：网络优先 */
  if(req.mode === 'navigate'){
    e.respondWith((async () => {
      try{
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone());
        return fresh;
      }catch{
        const cache = await caches.open(VERSION);
        return (await cache.match(req)) || (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  /* 静态资源：缓存优先 + 运行时入库 */
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req);
    if(hit) return hit;
    try{
      const fresh = await fetch(req);
      if(fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    }catch{
      return hit || Response.error();
    }
  })());
});
