# 小狼足球乐园 · 南通苏超"小狼"足球 IP 交互系统

毕业设计项目站点。围绕南通苏超"小狼"足球 IP，用 Web 游戏化设计 + AR 拓展体验，把"看球"延伸成"玩球"。

**线上地址**：https://wolf-football-park.app.workbuddy.host/ （2026-10-19 首次发布；在「设置—数据管理—应用」中管理）

**代码仓库**：https://github.com/keaidang/wolf-ip-site

## 快速开始

```bash
# 1. 静态站点（任选一种方式起本地服务）
cd wolf-ip-site
npx serve .                # 或者 python -m http.server 8080

# 2. 后端 API 骨架（可选，零 npm 依赖，Node 22.5+ 直接跑）
cd server
node server.js             # http://localhost:3000/api/health

# 3. 全站自检（页面/引用/SW/manifest/部署配置/语法，零依赖）
node docs/verify.js

# 4. 分数回传桥回归测试（开局误判 / 重复入账）
node docs/bridge-test.js
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

- **一键通道**：原始照片（任意文件名）放入 `assets/img/players-raw/` 后按下方命名表手动裁切落盘（早期批量脚本未随仓库发布）
- **手动通道**：按 `assets/img/players/README.md` 命名表放置，如 1 号门将 → `gu-tianchi.jpg`（竖版 3:4 最佳）
- 照片缺失时该画框继续展示剪影展签，页面不报错

> 版权提示：当前上墙肖像是 AI 生成的演示素材；正式上线前请替换为已获授权的球员照片。

## 技术要点

- **零依赖静态站**：原生 HTML/CSS/JS，无构建无框架；导航/页脚由 `assets/js/app.js` 统一注入
- **PC/手机全兼容**：响应式断点（展厅 4→3→2→1 列）、刘海安全区（`env(safe-area-inset)`）、触屏目标 ≥44px、iOS 聚焦缩放防护（触屏表单 16px）、横向溢出裁剪、`prefers-reduced-motion` 降级；游戏内教学视频的 B 站缩略图已全部本地化，断网完整可玩
- **PWA**：`manifest.webmanifest` + `sw.js`（页面网络优先、静态资源缓存优先并运行时入库）——手机可"添加到主屏幕"，游戏玩过一次后离线可玩；三枚图标（192/512/maskable）
- **分享卡片**：13 页均注入 og/twitter 元数据，微信转发显示带苏小狼的卡片；分享卡图为预生成资源 `assets/img/og-image.jpg`（1200×630）
- **浅色/深色双主题**：全站 CSS 变量驱动，导航栏 🌙 按钮切换，跟随系统偏好并记忆选择（`wolf.theme`）
- **真实最高分**：游戏卡显示本站记录的最高分（`wolfStore.v1.best`），与游戏本体解耦，不碰已验证的游戏文件
- **游戏零重构嵌入**：四款单文件游戏经 iframe 嵌入 `play.html`，分数回传桥（`assets/js/bridge.js`）轮询结算态自动折算积分
- **数据配置化**：资讯/奖池/任务在 `admin.html` 后台管理（演示期存 localStorage，可导出 JSON），由 `assets/js/data.js` 统一读取，正式版切后端 API 消费端零改动
- **积分双轨**：前端 localStorage 演示闭环（离线可演）；后端 `server/server.js`（Node 22 原生 node:http + node:sqlite，14 个端点）持有倍率真相并验分
- **AR 双轨**：小程序 AR 主轨（见 `miniprogram/README.md`，正式版按规范落地）+ 网页版 WebAR 实机轨（`assets/js/ar-webgl.js` 手写 WebGL 零依赖渲染：按官方立版还原的 Q 版苏小狼——大圆头灰毛、白脸罩、怒眉大眼高光、金 V 领 + 金袖口条、红短袖灰前臂灰掌、白侧条红短裤、蓝袜黄鞋、张臂站位、大尾巴白尖；全曲面几何（椭球解析法线 + 车削胶囊/锥耳 + 圆角盒），白脸罩/金 V 领/球衣金侧条/球裤白侧条/深灰耳尖用逐三角着色焊在母体网格上不漂移；渲染矩阵 scratch 按骨架深度分层防兄弟节点互相踩踏；摄像头实机背景 + 单指拖动/双指缩放旋转/一键合影，不支持摄像头自动回退扫描演示）
- 完整设计（站点地图、闭环、API、数据表、排期、风险）见 `ARCHITECTURE.md`

## 工具脚本（docs/ 与 tools/）

| 脚本 | 用途 |
| --- | --- |
| `docs/verify.js` | 全站自检（330 项）：13 页结构 / 本地引用可达 / CSS 资源 / SW 预缓存 / manifest / `edgeone.json` / 游戏与回传桥对应 / JS 语法，零依赖直接跑 |
| `docs/bridge-test.js` | 分数回传桥回归测试（11 项）：开局菜单不误判为赛季结算、顶层页不自我 postMessage、嵌入时仍向父窗口广播一次 |
| `tools/stage.js` | 发布打包：把纯站点文件拷进 `dist/`（排除 `server/`、`miniprogram/`、`docs/`、架构图），Makers 构建输出即此目录 |

> 早期开发用过的运行时体检（jsdom 抓错）、WebAR 实机 E2E（CDP + 假摄像头）与 Python 图片处理脚本未随仓库发布；当前可复跑的验证入口以上面两个脚本为准。

## 目录

```
wolf-ip-site/
├── *.html            # 13 个页面（7 模块 + play/missions/shop/profile/admin/404）
├── assets/           # css / js / img（徽标、吉祥物、图标、分享卡图、球员照片槽位）
├── games/            # 4 款游戏最终版
├── edgeone.json      # EdgeOne Makers 部署配置（构建命令 / 输出目录 / 缓存头 / 安全头）
├── tools/stage.js    # 发布打包：只把站点文件拷进 dist/（后端骨架与文档不发布）
├── server/           # 后端骨架（14 个 API 端点）
├── miniprogram/      # 小程序壳接入说明（正式版开发规范）
├── docs/             # 自检与回归脚本（verify.js / bridge-test.js）
└── ARCHITECTURE.md   # 架构设计文档 v2.1
```

> 演示数据说明：赛事中心、球员展厅、周榜为演示设定；个人中心数据保存在本地浏览器 localStorage。

## 部署（EdgeOne Makers，纯静态）

站点无框架、无 npm 依赖，`edgeone.json` 已声明构建命令与输出目录，两种方式都可用。

### 方式 A：Git 导入（推荐，push 即自动部署）

Makers 新建项目 → 导入 Git 仓库 `keaidang/wolf-ip-site`（分支 `main`），构建配置按下面填：

| 配置项 | 填写 |
| --- | --- |
| 预设框架 | `Other` |
| 根目录 | `./` |
| 构建命令 | `node tools/stage.js` |
| 安装命令 | **留空**（没有依赖，不要填 `npm install`） |
| 构建输出目录 | `dist` |

> 这些值 `edgeone.json` 里也写了（`buildCommand` / `outputDirectory`），控制台留空时会以配置文件为准；但界面必填项按上表填，避免歧义。打包结果 95 个文件 / 5.72 MB。

### 方式 B：CLI / 控制台直传

```bash
node tools/stage.js                     # 生成 dist/
edgeone makers deploy dist -n wolf-ip-site -e production --area global
```

控制台「直接上传」则把 `dist/` 内的**内容**打成 zip 上传（`index.html` 必须在 zip 根目录；上限 20000 文件、单文件 25 MB）。

> 一个项目只能用一种来源：CLI/控制台直传建的项目，不能再改成 Git 导入。

### 部署后核对

1. 访问不存在的路径 → 返回站点自己的 `404.html`（Makers 自动识别输出根目录的 404.html，无需 rewrite）
2. `/sw.js` → `Cache-Control: no-cache, no-store, must-revalidate`（`edgeone.json` 已声明）
3. `/assets/img/*` 30 天、`/assets/*` 1 小时、HTML 协商缓存
4. `/server/server.js`、`/docs/verify.js` 应返回 404（`tools/stage.js` 已把它们排除在发布物之外）
5. 若更新后仍看到旧页面：DevTools → Application → Service Workers → Unregister（SW 版本已 bump 到 `wolf-v13`）

`edgeone.json` 只做静态层配置，不需要 Functions；若要真防刷，把 `server/server.js` 里的 `/api/game/score`、`/api/checkin`、`/api/shop/draw` 按同形接口迁到 Makers Functions + KV 即可，前端调用点无需改动。

## 已知限制（演示期）

- **积分/任务/盲盒都在 localStorage**：`wolfStore.v1` 可被手动修改，前端校验只能防误操作，不能防刷；正式版需服务端持有积分真相
- **后台口令是前端常量**（`admin.html` 内的 `wolf2026`，提示文案亦可见）：纯静态站无法安全鉴权，答辩演示可用，正式上线需换服务端登录态
- **发布物已收窄**：`tools/stage.js` 只把 13 页 + `assets/` + `games/` + PWA 文件拷进 `dist/`，`server/`、`miniprogram/`、`docs/`、架构图不会进公网（`verify.js` 会断言配置一致）
- 赛事、球员、周榜为演示数据；AR 页使用程序化建模（不依赖任何外部模型文件）

## 2026-10 修复记录

- **积分翻倍**：顶层打开 `play.html` 时 `parent === window`，`bridge.js` 把 `wolf:score` 投给自己，又被页面兜底监听器处理一次 → 改为仅在被嵌入时向父窗口广播，并在 `play.html` 对 2.5 秒内的同签名投递去重
- **狼之棋阵“空手 +6”**：开局菜单文案含“登顶冠军棋阵”被 `/淘汰|冠军/` 判真，且 `pStage` 初值 `1-1` 折 6 分 → 结算判定改为锚定结算弹窗独有的 `#btnAgain`
- **删除死资源**：`assets/models/wolf.glb`（5.4 MB，占全站体积 46%）全站无引用（AR 页固定 `badge:true` 走程序化建模），已从仓库移除，历史仍可在首个提交中找回
- **CORS 预检**：`server.js` 补齐 `PUT/DELETE` 与 `x-admin-token`，后台改/删资讯不再被预检拦截
- **部署配置**：新增 `edgeone.json`；SW 版本 `wolf-v12` → `wolf-v13`
- **验证入口**：重建 `docs/verify.js`（329 项）与 `docs/bridge-test.js`（11 项），替代已缺失的旧脚本
