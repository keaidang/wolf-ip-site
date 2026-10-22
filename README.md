# 小狼足球乐园 · 南通苏超"小狼"足球 IP 交互系统

毕业设计项目站点。围绕南通苏超"小狼"足球 IP，用 Web 游戏化设计 + AR 拓展体验，把"看球"延伸成"玩球"。

**线上地址**：https://wolf-football-park.app.workbuddy.host/ （2026-10-19 首次发布；在「设置—数据管理—应用」中管理）

## 快速开始

```bash
# 1. 静态站点（任选一种方式起本地服务）
cd wolf-ip-site
npx serve .                # 或者 python -m http.server 8080

# 2. 后端 API 骨架（可选，零 npm 依赖，Node 22.5+ 直接跑）
cd server
node server.js             # http://localhost:3000/api/health

# 3. 全站自检（274 项逻辑级检查，替代浏览器渲染验证）
node docs/verify.js
```

打开 `http://localhost:8080`（或 serve 给出的端口）即可浏览全站。

## 站点结构（七大模块 · 13 页）

| 模块 | 页面 | 说明 |
| --- | --- | --- |
| 首页 | `index.html` | 主视觉、模块导览、游戏精选、积分闭环、赛事速递 |
| 小狼 IP | `ip.html` | 苏小狼档案、设计理念、形象演变、配色规范 |
| 赛事中心 | `match.html` | 赛程、赛果、积分榜、射手榜（演示数据） |
| AR 体验 | `ar.html` | 小程序 AR 主轨 + 网页 WebAR 实机（摄像头放置/手势/合影），完成放置 +20 积分 |
| 足球乐园 | `games.html` → `play.html?g=<id>` | 四款游戏即点即玩，结算自动折算积分 |
| 球员展厅 | `players.html` | 美术馆「一号展厅」：10 人阵容展览墙，真人照片落盘即自动上墙 |
| 关于我们 | `about.html` | 团队、项目背景、技术架构 |

子页：任务与积分 `missions.html`、盲盒兑换 `shop.html`、个人中心 `profile.html`、游戏嵌入 `play.html`、后台管理 `admin.html`（演示口令 `wolf2026`）、`404.html`。

## 四款游戏

| 游戏 | 类型 | 积分规则（单款日上限 20） |
| --- | --- | --- |
| 神笔球王 `wolf-pass3d` | 技巧型 · 3D 画线足球 | 每球 8 分，单场 5 球以上 +4 |
| 狼之盘带 `wolf-dribble` | 进度型 · 绝技闯关 | 每 200 本关得分 = 1 分 |
| 狼之棋阵 `wolf-tft` | 竞技型 · 足球自走棋 | 每小关 5 分 |
| 绝技连连看 `football-linkgame` | 活跃型 · 动作消除 | 每 100 得分 = 1 积分 |

## 球员真人照片上墙

十幅写实肖像（AI 生成演示素材，900×1200 · 3:4）已按拼音命名落入 `assets/img/players/` 并全部上墙；如需更换照片，放入后刷新 `players.html` 即自动替换，**无需改代码**：

- **一键通道**：原始照片（任意文件名）放入 `assets/img/players-raw/`，运行 `python docs/prepare-player-photos.py`，脚本按姓名/拼音/号码匹配，EXIF 转正 → 居中裁 3:4 → 限宽 900 → 落入 `assets/img/players/`
- **手动通道**：按 `assets/img/players/README.md` 命名表放置，如 1 号门将 → `gu-tianchi.jpg`（竖版 3:4 最佳）
- 照片缺失时该画框继续展示剪影展签，页面不报错

> 版权提示：当前上墙肖像是 AI 生成的演示素材；正式上线前请替换为已获授权的球员照片。

## 技术要点

- **零依赖静态站**：原生 HTML/CSS/JS，无构建无框架；导航/页脚由 `assets/js/app.js` 统一注入
- **PC/手机全兼容**：响应式断点（展厅 4→3→2→1 列）、刘海安全区（`env(safe-area-inset)`）、触屏目标 ≥44px、iOS 聚焦缩放防护（触屏表单 16px）、横向溢出裁剪、`prefers-reduced-motion` 降级；游戏内教学视频的 B 站缩略图已全部本地化，断网完整可玩
- **PWA**：`manifest.webmanifest` + `sw.js`（页面网络优先、静态资源缓存优先并运行时入库）——手机可"添加到主屏幕"，游戏玩过一次后离线可玩；三枚图标（192/512/maskable）
- **分享卡片**：13 页均注入 og/twitter 元数据，微信转发显示带苏小狼的卡片；分享卡图由 `docs/make-og-image.py` 生成（1200×630，120KB）
- **浅色/深色双主题**：全站 CSS 变量驱动，导航栏 🌙 按钮切换，跟随系统偏好并记忆选择（`wolf.theme`）
- **真实最高分**：游戏卡显示本站记录的最高分（`wolfStore.v1.best`），与游戏本体解耦，不碰已验证的游戏文件
- **游戏零重构嵌入**：四款单文件游戏经 iframe 嵌入 `play.html`，分数回传桥（`assets/js/bridge.js`）轮询结算态自动折算积分
- **数据配置化**：资讯/奖池/任务在 `admin.html` 后台管理（演示期存 localStorage，可导出 JSON），由 `assets/js/data.js` 统一读取，正式版切后端 API 消费端零改动
- **积分双轨**：前端 localStorage 演示闭环（离线可演）；后端 `server/server.js`（Node 22 原生 node:http + node:sqlite，13 个端点）持有倍率真相并验分
- **AR 双轨**：小程序 AR 主轨（见 `miniprogram/README.md`，正式版按规范落地）+ 网页版 WebAR 实机轨（`assets/js/ar-webgl.js` 手写 WebGL 零依赖渲染：按官方立版还原的 Q 版苏小狼——大圆头灰毛、白脸罩、怒眉大眼高光、金 V 领 + 金袖口条、红短袖灰前臂灰掌、白侧条红短裤、蓝袜黄鞋、张臂站位、大尾巴白尖；全曲面几何（椭球解析法线 + 车削胶囊/锥耳 + 圆角盒），白脸罩/金 V 领/球衣金侧条/球裤白侧条/深灰耳尖用逐三角着色焊在母体网格上不漂移；渲染矩阵 scratch 按骨架深度分层防兄弟节点互相踩踏；摄像头实机背景 + 单指拖动/双指缩放旋转/一键合影，不支持摄像头自动回退扫描演示）
- 完整设计（站点地图、闭环、API、数据表、排期、风险）见 `ARCHITECTURE.md`

## 工具脚本（docs/）

| 脚本 | 用途 |
| --- | --- |
| `verify.js` | 全站逻辑级自检（309 项：编译/运行/引用/结构/PWA/og/展览墙照片/WebAR），Node 直接跑 |
| `runtime-audit.js` | 运行时体检：jsdom 真实加载 13 页抓错 + 游戏脚本编译/DOM id 核对 + 外链依赖扫描（需 `NODE_PATH` 指向 jsdom） |
| `ar-e2e.js` / `ar-e2e2.js` | WebAR 实机回归（CDP + 假摄像头）：摄像头开启/WebGL 渲染/手势/合影导出/兜底切换全链路 |
| `wolf-diag.html` | 小狼模型诊断页：正面 / 3/4 / 侧面 / 面部特写 / 全身广角五视角渲染，调骨架比例时用（浏览器直开或经 http 服务） |
| `make-og-image.py` | 重新生成分享卡图 `assets/img/og-image.jpg` |
| `convert-player-photos.py` | 把生成的球员肖像 PNG 批量转正（居中裁 3:4 / 限宽 900 / JPEG 质量 85，按拼音落盘） |
| `rebrand-colors.py` | 全站品牌色批量替换（换配色时改好色板表重跑即可） |
| `inject-og.py` |  og/twitter 元数据批量注入（幂等，新增页面后可重跑） |
| `localize-linkgame-thumbs.py` | 游戏教学视频的 B 站外链缩略图一键本地化（下载→裁 480 宽→落 `<游戏>/img/`） |
| `prepare-player-photos.py` | 球员真人照片一键裁切转正（见上节） |
| `cutout-mascot.py` | 从官方海报抠取透明底苏小狼（旧版，红框海报专用） |
| `remake-mascot-assets.py` | 用官方立版新图重制 `mascot.jpg` / `mascot-cutout.png|webp`：白键抠像 + 边界 BFS 连通性判定（白胸毛与背景同色，纯阈值会抠穿），产出前自检四角全透 / 各身体部位不透明 |

## 目录

```
wolf-ip-site/
├── *.html            # 13 个页面（7 模块 + play/missions/shop/profile/admin/404）
├── assets/           # css / js / img（徽标、吉祥物、图标、分享卡图、球员照片槽位）
├── games/            # 4 款游戏最终版
├── server/           # 后端骨架（13 个 API 端点）
├── miniprogram/      # 小程序壳接入说明（正式版开发规范）
├── docs/             # 架构外的工具脚本与验证器
└── ARCHITECTURE.md   # 架构设计文档 v2.1
```

> 演示数据说明：赛事中心、球员展厅、周榜为演示设定；个人中心数据保存在本地浏览器 localStorage。
