#!/usr/bin/env node
/* ============================================================
   发布打包：把站点文件拷到 dist/，作为 EdgeOne Makers 的构建输出
   零依赖，Node 18+ 直接跑：node tools/stage.js

   为什么需要它：仓库里还有 server/（后端骨架）、miniprogram/、
   docs/（自检脚本）与架构图，直接把仓库根当输出目录发布，这些
   都会变成公网可访问资源。这个脚本只挑站点文件进 dist/。
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

/* 非站点目录：不进 dist */
const SKIP_DIRS = new Set([
  '.git', '.edgeone', '.github',
  'node_modules', 'dist', 'build', 'tmp', '.cache',
  'server', 'miniprogram', 'docs', 'tools'
]);
/* 非站点文件：点开头（.gitignore/.gitattributes）、Markdown 文档、架构图 */
const SKIP_FILES = [/^\./, /\.md$/i, /^ARCHITECTURE-diagram\./i, /\.log$/i];

/* dist 必须有的文件：少一个就说明打包逻辑坏了 */
const MUST_HAVE = ['index.html', '404.html', 'sw.js', 'manifest.webmanifest', 'edgeone.json'];
/* 绝不能出现在 dist 里的目录 */
const NEVER_SHIP = ['server', 'miniprogram', 'docs', 'tools'];

let count = 0;
let bytes = 0;

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, ent.name);
    const dst = path.join(to, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      copyTree(src, dst);
    } else if (ent.isFile()) {
      if (SKIP_FILES.some(re => re.test(ent.name))) continue;
      fs.copyFileSync(src, dst);
      count++;
      bytes += fs.statSync(dst).size;
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyTree(ROOT, OUT);

const missing = MUST_HAVE.filter(f => !fs.existsSync(path.join(OUT, f)));
if (missing.length) {
  console.error('✗ dist 缺少必要文件：' + missing.join(', '));
  process.exit(1);
}

const leaked = NEVER_SHIP.filter(d => fs.existsSync(path.join(OUT, d)));
if (leaked.length) {
  console.error('✗ dist 混入非站点目录：' + leaked.join(', '));
  process.exit(1);
}

console.log('✓ dist 打包完成');
console.log('  文件数：' + count);
console.log('  体积：  ' + (bytes / 1024 / 1024).toFixed(2) + ' MB');
console.log('  入口：  index.html / 404.html / sw.js / manifest.webmanifest / edgeone.json');
