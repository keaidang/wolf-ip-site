#!/usr/bin/env node
/* ============================================================
   小狼足球乐园 · 全站自检
   零依赖，Node 18+ 直接跑：node docs/verify.js
   覆盖：页面完整性 / 本地引用可达 / SW 预缓存 / manifest /
        edgeone.json 部署配置 / 游戏与回传桥对应 / JS 语法编译
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PAGES = [
  'index.html', 'ip.html', 'match.html', 'ar.html', 'games.html',
  'players.html', 'about.html', 'missions.html', 'shop.html',
  'profile.html', 'play.html', 'admin.html', '404.html'
];
const GAMES = ['wolf-pass3d', 'wolf-dribble', 'wolf-tft', 'football-linkgame'];

let pass = 0;
const fails = [];
const ok = () => { pass++; };
const bad = (name, detail) => fails.push(name + (detail ? ' → ' + detail : ''));
const check = (name, cond, detail) => (cond ? ok() : bad(name, detail));

const abs = rel => path.join(ROOT, rel);
const exists = rel => fs.existsSync(abs(rel));
const read = rel => fs.readFileSync(abs(rel), 'utf8');

/* ---------- 1. 页面完整性 ---------- */
for (const page of PAGES) {
  const name = '页面存在 ' + page;
  if (!exists(page)) { bad(name); continue; }
  ok();
  const html = read(page);
  check(page + ' 含 <!doctype html>', /^\s*<!doctype html>/i.test(html));
  check(page + ' 声明 lang="zh-CN"', /<html[^>]+lang=["']zh-CN["']/i.test(html));
  check(page + ' 含 viewport', /name=["']viewport["']/i.test(html));
  check(page + ' 引 style.css', /assets\/css\/style\.css/.test(html));
  check(page + ' 引 app.js', /assets\/js\/app\.js/.test(html));
  check(page + ' 引 manifest', /manifest\.webmanifest/.test(html));
  check(page + ' 含 og:title', /property=["']og:title["']/.test(html));
  check(page + ' 含主题色', /name=["']theme-color["']/.test(html));
}

/* ---------- 2. 本地引用可达 ---------- */
function localTarget(raw, fromPage) {
  if (!raw) return null;
  const v = raw.trim();
  if (!v || v.startsWith('#') || v.startsWith('data:') || v.startsWith('mailto:') ||
      v.startsWith('tel:') || v.startsWith('javascript:') || v.startsWith('//') ||
      /^https?:\/\//i.test(v) || v.includes('${') || v.includes('{{') || v.includes('+')) return null;
  const clean = v.split('#')[0].split('?')[0];
  if (!clean) return null;
  let rel = clean.startsWith('/')
    ? clean.replace(/^\/+/, '')
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromPage), clean));
  if (rel.endsWith('/')) rel += 'index.html';
  return rel;
}

for (const page of PAGES) {
  if (!exists(page)) continue;
  const html = read(page);
  const re = /\s(?:href|src)\s*=\s*["']([^"']*)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const rel = localTarget(m[1], page);
    if (!rel) continue;
    check(page + ' 引用可达 ' + rel, exists(rel));
  }
}

/* ---------- 3. CSS 内资源 ---------- */
{
  const cssPath = 'assets/css/style.css';
  const css = read(cssPath);
  const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  let m;
  while ((m = re.exec(css))) {
    const rel = localTarget(m[1], cssPath);
    if (!rel) continue;
    check('style.css 引用可达 ' + rel, exists(rel));
  }
}

/* ---------- 4. Service Worker ---------- */
{
  const sw = read('sw.js');
  const vm = sw.match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
  check('sw.js 声明 VERSION', !!vm, vm ? '' : '未找到 VERSION');
  if (vm) check('sw.js VERSION 形如 wolf-vN', /^wolf-v\d+$/.test(vm[1]), vm[1]);

  const core = sw.match(/const\s+CORE\s*=\s*\[([\s\S]*?)\]/);
  if (!core) {
    bad('sw.js 声明 CORE 列表');
  } else {
    ok(); // 列表本身
    const items = [...core[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
    check('sw.js CORE 条目数 > 20', items.length > 20, String(items.length));
    for (const it of items) {
      const rel = it.replace(/^\.\//, '');
      if (rel === '') { check('sw.js CORE 根路径可解析', true); continue; }
      check('SW 预缓存存在 ' + it, exists(rel));
    }
    check('sw.js CORE 覆盖 404.html', items.some(x => x.endsWith('404.html')));
    check('sw.js CORE 覆盖 bridge.js', items.some(x => x.endsWith('bridge.js')));
  }
  check('sw.js 安装即 skipWaiting', /self\.skipWaiting\s*\(/.test(sw));
  check('sw.js 激活即 clients.claim', /clients\.claim\s*\(/.test(sw));
  check('sw.js 仅处理 GET', /req\.method\s*!==\s*'GET'/.test(sw));
}

/* ---------- 5. manifest ---------- */
{
  const raw = read('manifest.webmanifest');
  let mf = null;
  try { mf = JSON.parse(raw); ok(); } catch (e) { bad('manifest 是合法 JSON', e.message); }
  if (mf) {
    check('manifest 有 name', typeof mf.name === 'string' && mf.name.length > 0);
    check('manifest 有 start_url', typeof mf.start_url === 'string');
    check('manifest display=standalone', mf.display === 'standalone');
    const icons = Array.isArray(mf.icons) ? mf.icons : [];
    check('manifest 至少 2 个图标', icons.length >= 2, String(icons.length));
    for (const ic of icons) {
      const rel = localTarget(ic.src, 'manifest.webmanifest');
      if (rel) check('manifest 图标存在 ' + ic.src, exists(rel));
    }
  }
}

/* ---------- 6. edgeone.json（Makers 部署） ---------- */
{
  let cfg = null;
  try { cfg = JSON.parse(read('edgeone.json')); ok(); } catch (e) { bad('edgeone.json 是合法 JSON', e.message); }
  if (cfg) {
    check('edgeone.json 输出目录为 dist', cfg.outputDirectory === 'dist', String(cfg.outputDirectory));
    check('edgeone.json 构建命令调用 tools/stage.js',
      typeof cfg.buildCommand === 'string' && /tools\/stage\.js/.test(cfg.buildCommand), String(cfg.buildCommand));
    /* 平台构建镜像只预装这几个 Node 版本，写别的版本会构建失败 */
    const NODE_VERSIONS = ['14.21.3', '16.20.2', '18.20.4', '20.18.0', '22.11.0'];
    check('edgeone.json 锁定平台预装的 Node 版本',
      NODE_VERSIONS.includes(cfg.nodeVersion), String(cfg.nodeVersion));
    check('edgeone.json 安装命令不拉取依赖',
      cfg.installCommand === undefined || !/npm\s+(install|ci)/.test(String(cfg.installCommand)),
      String(cfg.installCommand));
    const rules = Array.isArray(cfg.headers) ? cfg.headers : [];
    check('edgeone.json 声明 headers 规则', rules.length > 0);
    const swRule = rules.find(r => r.source === '/sw.js');
    check('存在 /sw.js 独立缓存规则', !!swRule);
    if (swRule) {
      const h = (swRule.headers || []).find(x => x.key.toLowerCase() === 'cache-control');
      check('/sw.js 禁止缓存', !!h && /no-cache|no-store/.test(h.value), h && h.value);
    }
    const htmlRule = rules.find(r => r.source === '/*.html');
    check('HTML 走协商缓存', !!htmlRule, '缺 /*.html 规则');
    const rootRule = rules.find(r => r.source === '/*');
    check('全局安全响应头', !!rootRule && (rootRule.headers || []).some(x => x.key === 'X-Content-Type-Options'));
    /* 线上实测：manifest 不声明 MIME 会被发成 application/octet-stream，PWA 装不上 */
    const mfRule = rules.find(r => r.source === '/manifest.webmanifest');
    check('manifest 声明 manifest+json MIME', !!mfRule &&
      (mfRule.headers || []).some(x => x.key === 'Content-Type' && /application\/manifest\+json/.test(x.value)));
    /* 线上实测：同一 header key 以靠后的规则为准，图片规则必须排在 /assets/* 之后 */
    const iAssets = rules.findIndex(r => r.source === '/assets/*');
    const iImg = rules.findIndex(r => r.source === '/assets/img/*');
    check('/assets/img/* 规则排在 /assets/* 之后',
      iAssets >= 0 && iImg > iAssets, 'index ' + iAssets + ' -> ' + iImg);
  }
  check('404.html 位于输出根目录（Makers 自动识别）', exists('404.html'));
}

/* ---------- 7. 游戏与回传桥 ---------- */
{
  const bridge = read('assets/js/bridge.js');
  const keys = [...bridge.matchAll(/^\s{2}'([a-z0-9-]+)'\s*:\s*\{/gm)].map(m => m[1]);
  check('bridge.js 配置了 4 款游戏', keys.length === 4, keys.join(','));

  for (const g of GAMES) {
    const idx = 'games/' + g + '/index.html';
    check('游戏入口存在 ' + idx, exists(idx));
    check('bridge 覆盖游戏 ' + g, keys.includes(g));
  }
  for (const k of keys) check('bridge 中的游戏目录存在 ' + k, exists('games/' + k + '/index.html'));

  const gamesHtml = read('games.html');
  for (const g of GAMES) {
    check('games.html 可进入 ' + g, gamesHtml.includes('play.html?g=' + g) || gamesHtml.includes('g=' + g));
  }

  /* 狼之棋阵：结算判定必须锚定 #btnAgain，不能再靠"冠军/淘汰"文案 */
  const tftBlock = bridge.slice(bridge.indexOf("'wolf-tft'"), bridge.indexOf("'football-linkgame'"));
  check('狼之棋阵判定锚定 #btnAgain', /btnAgain/.test(tftBlock));
  check('狼之棋阵不再用文案判定', !/淘汰\|冠军/.test(tftBlock));
  /* 回传不得在顶层自我 postMessage */
  check('bridge 避免 parent===window 自我投递', /parent\s*!==\s*window/.test(bridge));
  /* play.html 需要重复投递去重 */
  const play = read('play.html');
  check('play.html 对重复投递去重', /lastSig/.test(play));
}

/* ---------- 8. 已删除模型不得再被引用 ---------- */
{
  const glbRefs = [];
  const walk = dir => {
    for (const ent of fs.readdirSync(abs(dir), { withFileTypes: true })) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      const rel = path.posix.join(dir, ent.name);
      if (ent.isDirectory()) walk(rel);
      else if (/\.(html|js|css|json|webmanifest)$/i.test(ent.name)) {
        if (fs.readFileSync(abs(rel), 'utf8').includes('wolf.glb')) glbRefs.push(rel);
      }
    }
  };
  walk('.');
  const realRefs = glbRefs.filter(f => !f.startsWith('docs/'));
  check('无残留 wolf.glb 引用', realRefs.length === 0, realRefs.join(', '));
}

/* ---------- 9. JS 语法编译 ---------- */
{
  const files = ['sw.js', 'server/server.js'];
  for (const f of fs.readdirSync(abs('assets/js')).filter(f => f.endsWith('.js'))) {
    files.push('assets/js/' + f);
  }
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--check', abs(f)], { encoding: 'utf8' });
    check('语法检查 ' + f, r.status === 0, (r.stderr || '').trim().split('\n')[0]);
  }
}

/* ---------- 汇总 ---------- */
const total = pass + fails.length;
console.log('小狼足球乐园 · 全站自检');
console.log('通过 ' + pass + ' / ' + total + '，失败 ' + fails.length);
if (fails.length) {
  console.log('\n失败项：');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('✓ 全部通过');

