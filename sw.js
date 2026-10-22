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

/* v8：模型从 12 万面 / baseColor 2048（4.4 MB）换成 30 万面 / 4096（10.8 MB），
   并且 ar-webgl.js 补了 glTF 的 sRGB→线性→sRGB 正确往返。
   wolf.glb 走的是运行时缓存（cache-first），不 bump 的话老访客会一直拿到旧的 4.4 MB 模型 */
const VERSION = 'wolf-v12';
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
/* assets/models/wolf.glb（4.4 MB）故意不放进 CORE：装 SW 就把 4.4 MB 推给每个
   访客太重了。它走下面的"静态资源：缓存优先 + 运行时入库"——只要打开过一次
   AR 页就进缓存，之后离线也能用；没用过 AR 的人不付这 4.4 MB 流量。 */

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
