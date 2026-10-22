/* ============================================================
   小狼足球乐园 · WebAR 苏小狼（零依赖手写 WebGL）
   - 最小 mat4 数学库 + 三点光照（主光 / 补光 / 边缘光）
   - 全曲面几何体系（通体无棱角，软塑玩具质感）：
       · buildEllipsoid  椭球，解析法线 n = normalize(p / r²)，全平滑
       · buildLathe      车削体，2D 剖面 (r,y) 绕 Y 轴旋转，
                         法线由剖面切线解析求出（接头处也平滑）
         - capsuleProfile 胶囊（半球帽 + 圆柱身）→ 四肢 / 袖 / 尾 / 眉
         - taperProfile   锥体（底圆帽 → 线性收细 → 尖帽）→ 大尖耳
       · buildRoundBox   圆角盒（带逐面着色回调）→ 躯干 / 短裤
     装饰线不再用「悬浮小方块」，而是 colorFn 逐三角着色焊在母体网格上，
     跟着曲面走、永不漂移：白脸罩 / 金 V 领 / 球衣金侧条 / 球裤白侧条 / 深灰耳尖
   - 层级骨架：身 / 头 / 耳 / 眼鼻嘴 / 张臂 / 双腿 / 尾
   - 待机呼吸 + 摆尾 + 放置庆祝（跳跃旋转）动画
   - 形象依据：南通苏超官方吉祥物「苏小狼」立版
     （大头圆脸灰毛、白脸罩、怒眉大眼高光、金 V 领 + 金袖口条、
       红短袖 + 灰前臂灰掌、白侧条红短裤、蓝袜黄鞋、张臂站位、大尾巴白尖）
   - 用法：ArWolf.mount({ stage, video, canvas })
     → { state, rotate(d), reset(), cheer(), stop(), shot() }
   ============================================================ */
(function(){
'use strict';

/* ---------- 最小 mat4（列主序，与 WebGL 一致） ---------- */
const M = {
  ident: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  mul(a, b, out){
    out = out || new Float32Array(16);
    for(let c = 0; c < 4; c++){
      const b0 = b[c*4], b1 = b[c*4+1], b2 = b[c*4+2], b3 = b[c*4+3];
      out[c*4]   = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
      out[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
      out[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
      out[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
    }
    return out;
  },
  persp(fov, aspect, near, far){
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return new Float32Array([
      f/aspect,0,0,0,
      0,f,0,0,
      0,0,(far+near)*nf,-1,
      0,0,2*far*near*nf,0
    ]);
  },
  trans(x, y, z){
    const m = M.ident(); m[12] = x; m[13] = y; m[14] = z; return m;
  },
  scale(x, y, z){
    const m = M.ident(); m[0] = x; m[5] = y; m[10] = z; return m;
  },
  rotX(a){ const c=Math.cos(a), s=Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); },
  rotY(a){ const c=Math.cos(a), s=Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); },
  rotZ(a){ const c=Math.cos(a), s=Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); }
};

/* ---------- 苏小狼配色（按官方立版取色，略提亮以抵消光照衰减） ---------- */
const C = {
  gray:   [0.62, 0.60, 0.50],   // 狼毛灰（暖灰；实测受光≈1.14，落定≈#b0ac93 中灰）
  grayD:  [0.38, 0.39, 0.32],   // 深灰（耳尖 / 怒眉）
  red:    [0.95, 0.25, 0.20],   // 球衣红（官方 #d8261c）
  redD:   [0.80, 0.20, 0.17],   // 球裤深红
  sock:   [0.35, 0.50, 0.68],   // 蓝球袜（官方 #2e4561）
  shoe:   [1.02, 0.88, 0.38],   // 黄球鞋（官方 #f0d24a）
  pink:   [1.02, 0.65, 0.58],   // 舌头粉
  pinkIn: [1.06, 0.60, 0.58],   // 耳内粉（官方立版是明显粉红内耳）
  eyeD:   [0.30, 0.25, 0.21],   // 眼底深暖灰（官方眼睛深褐近黑，不是白圈！）
  white:  [1.05, 1.04, 0.97],   // 白脸罩 / 白胸毛（暖白，不死白）
  gold:   [1.05, 0.88, 0.42],   // 金饰边（领口 / 袖口 / 短裤侧条）
  dark:   [0.11, 0.11, 0.09],   // 鼻 / 眼 / 嘴膛
  plain:  [1, 1, 1]             // 占位：网格自带逐顶点色时用纯白相乘
};

/* ---------- 颜色小工具 ---------- */
function mixc(a, b, t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function clamp01(t){ return t < 0 ? 0 : t > 1 ? 1 : t; }
function smooth01(t){ t = clamp01(t); return t * t * (3 - 2 * t); }

/* ============================================================
   几何：全曲面体系
   ============================================================ */

/* ---------- 椭球：解析法线，全平滑无棱 ----------
   colorFn(vertexPos, faceIdx) 可选：返回该**顶点**的颜色。
   注意是逐顶点而非逐三角形：GPU 会在三角形内线性插值顶点色，
   所以白脸罩这类跨曲面的装饰边界天然平滑，不会出现色块阶梯
   （早期按三角形烘焙，过渡带只有 2-3 个三角形，必然 quantize 成锯齿）。 */
function buildEllipsoid(rx, ry, rz, lat, lon, colorFn){
  lat = Math.max(3, Math.round(lat || 12));
  lon = Math.max(3, Math.round(lon || 16));
  const pos = [], nor = [], col = [];
  const V = (phi, th) => [rx * Math.sin(phi) * Math.cos(th),
                          ry * Math.cos(phi),
                          rz * Math.sin(phi) * Math.sin(th)];
  function tri(a, b, c, fi){
    for(const q of [a, b, c]){
      pos.push(q[0], q[1], q[2]);
      /* 椭球法线 = 梯度方向 p / r²，解析求得 → 完全平滑 */
      const nx = q[0] / (rx * rx), ny = q[1] / (ry * ry), nz = q[2] / (rz * rz);
      const L = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / L, ny / L, nz / L);
      const cc = colorFn ? colorFn(q, fi) : C.plain;
      col.push(cc[0], cc[1], cc[2]);
    }
  }
  for(let i = 0; i < lat; i++){
    const p0 = Math.PI * i / lat, p1 = Math.PI * (i + 1) / lat;
    for(let j = 0; j < lon; j++){
      const t0 = 2 * Math.PI * j / lon, t1 = 2 * Math.PI * (j + 1) / lon;
      const a = V(p0, t0), b = V(p0, t1), c = V(p1, t1), d = V(p1, t0);
      if(i === 0) tri(a, c, d, j);                 // 北极：a 与 b 重合
      else if(i === lat - 1) tri(a, b, c, j);      // 南极：c 与 d 重合
      else { tri(a, b, c, j); tri(a, c, d, j); }
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col) };
}

/* ---------- 车削体：2D 剖面 (r, y) 绕 Y 轴旋转 ----------
   法线由剖面切线解析求出（端点取邻段切线，r=0 的极点直接给轴向），
   所以半球帽与圆柱身的接头也是平滑的，不会出现折面。
   colorFn 同样是逐顶点 → GPU 插值出平滑边界。 */
function buildLathe(profile, seg, colorFn){
  seg = Math.max(3, Math.round(seg || 12));
  const n = profile.length;
  const nrm2 = [];
  for(let i = 0; i < n; i++){
    const p = profile[i];
    if(p.r < 1e-5){ nrm2.push([0, i * 2 < n ? -1 : 1]); continue; }   // 极点 → 轴向
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(n - 1, i + 1)];
    let tr = b.r - a.r, ty = b.y - a.y;
    const L = Math.hypot(tr, ty) || 1; tr /= L; ty /= L;
    nrm2.push([ty, -tr]);                    // 切线顺时针转 90° → 朝外
  }
  const pos = [], nor = [], col = [];
  const V = (i, j) => {
    const p = profile[i], n2 = nrm2[i], t = 2 * Math.PI * j / seg;
    return { p: [p.r * Math.cos(t), p.y, p.r * Math.sin(t)],
             n: [n2[0] * Math.cos(t), n2[1], n2[0] * Math.sin(t)] };
  };
  function tri(a, b, c, j){
    for(const q of [a, b, c]){
      pos.push(q.p[0], q.p[1], q.p[2]);
      nor.push(q.n[0], q.n[1], q.n[2]);
      const cc = colorFn ? colorFn(q.p, j) : C.plain;
      col.push(cc[0], cc[1], cc[2]);
    }
  }
  for(let i = 0; i < n - 1; i++){
    for(let j = 0; j < seg; j++){
      const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
      tri(a, b, c, j); tri(a, c, d, j);
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col) };
}
/* 胶囊剖面：总高 h，竖直居中于原点（下半球帽 + 圆柱身 + 上半球帽） */
function capsuleProfile(r, h, capSeg){
  capSeg = Math.max(2, Math.round(capSeg || 4));
  const prof = [], half = h / 2;
  const bodyH = Math.max(0.001, h - 2 * r);
  for(let i = 0; i <= capSeg; i++){                     // 底帽：-half → -half+r
    const a = Math.PI * 0.5 * (i / capSeg);
    prof.push({ r: r * Math.sin(a), y: -half + r - r * Math.cos(a) });
  }
  for(let i = 1; i <= capSeg; i++){                     // 柱身
    const k = i / capSeg;
    prof.push({ r: r, y: -half + r + bodyH * k });
  }
  for(let i = 1; i <= capSeg; i++){                     // 顶帽：half-r → half
    const a = Math.PI * 0.5 * (1 - i / capSeg);
    prof.push({ r: r * Math.sin(a), y: half - r + r * Math.cos(a) });
  }
  return prof;
}
/* 锥体剖面：总高 h，竖直居中于原点（底圆帽 → 线性收细 → 顶圆帽）→ 大尖耳 */
function taperProfile(rb, rt, h, capSeg){
  capSeg = Math.max(2, Math.round(capSeg || 4));
  const prof = [], half = h / 2;
  const bodyH = Math.max(0.001, h - rb - rt);
  for(let i = 0; i <= capSeg; i++){                     // 底帽
    const a = Math.PI * 0.5 * (i / capSeg);
    prof.push({ r: rb * Math.sin(a), y: -half + rb - rb * Math.cos(a) });
  }
  for(let i = 1; i <= capSeg; i++){                     // 线性收细的锥身
    const k = i / capSeg;
    prof.push({ r: rb + (rt - rb) * k, y: -half + rb + bodyH * k });
  }
  for(let i = 1; i <= capSeg; i++){                     // 顶帽
    const a = Math.PI * 0.5 * (1 - i / capSeg);
    prof.push({ r: rt * Math.sin(a), y: half - rt + rt * Math.cos(a) });
  }
  return prof;
}

/* ---------- 圆角盒：细分立方体表面 → SDF 圆角化 ----------
   法线 = 圆角方向 → 平滑着色。colorFn(centroid, faceIdx) 可选，
   faceIdx：0=+Z前 1=-Z后 2=+X右 3=-X左 4=+Y顶 5=-Y底。
   这里**保持逐三角形**着色（圆角盒的装饰是按"面"切的，顶点插值会把面边界糊掉）。 */
function buildRoundBox(sx, sy, sz, r, seg, colorFn){
  seg = Math.max(2, Math.round(seg || 4));
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  r = Math.max(0.002, Math.min(r, hx * 0.92, hy * 0.92, hz * 0.92));
  const ix = hx - r, iy = hy - r, iz = hz - r;
  const pos = [], nor = [], col = [];
  const clamp = (v, a) => Math.max(-a, Math.min(a, v));
  function vert(p){
    const cx = clamp(p[0], ix), cy = clamp(p[1], iy), cz = clamp(p[2], iz);
    let dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
    const L = Math.hypot(dx, dy, dz);
    if(L < 1e-6){ dx = 0; dy = 0; dz = 1; } else { dx /= L; dy /= L; dz /= L; }
    return { p: [cx + dx * r, cy + dy * r, cz + dz * r], n: [dx, dy, dz] };
  }
  function tri(a, b, c, fi){
    /* 三角形法向与「由中心指向重心」比较，决定是否翻转绕序（保证朝外） */
    const ux = b.p[0]-a.p[0], uy = b.p[1]-a.p[1], uz = b.p[2]-a.p[2];
    const vx = c.p[0]-a.p[0], vy = c.p[1]-a.p[1], vz = c.p[2]-a.p[2];
    const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const mx = (a.p[0]+b.p[0]+c.p[0])/3, my = (a.p[1]+b.p[1]+c.p[1])/3, mz = (a.p[2]+b.p[2]+c.p[2])/3;
    const flip = (nx*mx + ny*my + nz*mz) < 0;
    const B = flip ? c : b, Cc = flip ? b : c;
    const cc = colorFn ? colorFn([mx, my, mz], fi) : C.plain;
    for(const q of [a, B, Cc]){
      pos.push(q.p[0], q.p[1], q.p[2]);
      nor.push(q.n[0], q.n[1], q.n[2]);
      col.push(cc[0], cc[1], cc[2]);
    }
  }
  const faces = [
    p => [p[0]*hx, p[1]*hy,  hz], p => [p[0]*hx, p[1]*hy, -hz],
    p => [ hx, p[0]*hy, p[1]*hz], p => [-hx, p[0]*hy, p[1]*hz],
    p => [p[0]*hx,  hy, p[1]*hz], p => [p[0]*hx, -hy, p[1]*hz]
  ];
  faces.forEach((f, fi) => {
    for(let i = 0; i < seg; i++) for(let j = 0; j < seg; j++){
      const u0 = -1 + 2*i/seg, u1 = -1 + 2*(i+1)/seg;
      const v0 = -1 + 2*j/seg, v1 = -1 + 2*(j+1)/seg;
      const A = vert(f([u0, v0])), B = vert(f([u1, v0])), C = vert(f([u1, v1])), D = vert(f([u0, v1]));
      tri(A, B, C, fi); tri(A, C, D, fi);
    }
  });
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col) };
}

/* ---------- 足球：UV 球面 + 二十面体顶点方向判定黑白块面 ---------- */
const ICO = (() => {
  const g = (1 + Math.sqrt(5)) / 2;
  return [[0,1,g],[0,-1,g],[0,1,-g],[0,-1,-g],[1,g,0],[-1,g,0],[1,-g,0],[-1,-g,0],[g,0,1],[-g,0,1],[g,0,-1],[-g,0,-1]]
    .map(v => { const L = Math.hypot(v[0], v[1], v[2]); return [v[0]/L, v[1]/L, v[2]/L]; });
})();
function buildBall(rad, latSeg, lonSeg){
  latSeg = latSeg || 10; lonSeg = lonSeg || 14;
  const pos = [], nor = [], col = [];
  const P = (i, j) => {
    const phi = Math.PI * j / latSeg, th = 2 * Math.PI * i / lonSeg;
    return [rad * Math.sin(phi) * Math.cos(th), rad * Math.cos(phi), rad * Math.sin(phi) * Math.sin(th)];
  };
  const dark = [0.07, 0.11, 0.19], white = [1, 1, 1];
  function tri(a, b, c){
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    /* 重心方向：若贴近某个二十面体顶点 → 黑块面（仿足球五边形） */
    let mx = (a[0]+b[0]+c[0])/3, my = (a[1]+b[1]+c[1])/3, mz = (a[2]+b[2]+c[2])/3;
    const ML = Math.hypot(mx, my, mz) || 1; mx /= ML; my /= ML; mz /= ML;
    let best = 0;
    for(const d of ICO){ const t = mx*d[0] + my*d[1] + mz*d[2]; if(t > best) best = t; }
    const cc = best > 0.9 ? dark : white;
    for(const q of [a, b, c]){
      pos.push(q[0], q[1], q[2]);
      /* 平滑法线：球面法线 = 位置方向 */
      const ql = Math.hypot(q[0], q[1], q[2]) || 1;
      nor.push(q[0]/ql, q[1]/ql, q[2]/ql);
      col.push(cc[0], cc[1], cc[2]);
    }
  }
  for(let j = 0; j < latSeg; j++) for(let i = 0; i < lonSeg; i++){
    const a = P(i, j), b = P(i+1, j), c = P(i+1, j+1), d = P(i, j+1);
    if(j !== 0) tri(a, b, d);
    if(j !== latSeg-1) tri(b, c, d);
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col) };
}

/* ---------- 地面接触影（半径 1 圆盘；径向渐隐在着色器里做） ---------- */
function buildDisc(seg){
  seg = seg || 32;
  const pos = [], nor = [], col = [];
  for(let i = 0; i < seg; i++){
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    const tri = [[0,0,0],[Math.cos(a0),0,Math.sin(a0)],[Math.cos(a1),0,Math.sin(a1)]];
    for(const v of tri){ pos.push(v[0], 0.0, v[2]); nor.push(0, 1, 0); col.push(1, 1, 1); }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col) };
}
/* ---------- 空网格：纯容器节点用（不产生任何三角形） ---------- */
function buildEmpty(){
  return { pos: new Float32Array(0), nor: new Float32Array(0), col: new Float32Array(0) };
}

/* ---------- 着色器：程序化毛发 + 半球环境光 + Blinn-Phong + 次表面散射 ----------
   从"光滑软塑"升级到"有质感的真实渲染"：
   · 毛发/织物：3D 值噪声 fbm 扰动法线 + 毛色斑驳（频率随材质分频）
   · 光照：半球环境光（上天光/下地光）替代死板常量项，主光带半角高光
   · 次表面散射：耳朵/鼻尖/毛边透光
   · 噪声按**局部坐标**采样 → 细节长在物体表面，移动旋转都不"游动"
   · 贴图分支（GLB 扫描模型）：baseColor + 金属度/粗糙度 + 导数法 TBN 法线贴图 */
const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec2 aUv;
attribute vec4 aTan;                       /* glTF 标准切线：xyz=切线，w=手性 */
uniform mat4 uProj, uModel; varying vec3 vN, vC, vL, vP, vT; varying vec2 vUv; varying float vFade, vW;
void main(){
  vN = mat3(uModel) * aNor; vC = aCol; vL = aPos; vUv = aUv;
  vT = mat3(uModel) * aTan.xyz; vW = aTan.w;
  vec4 wp = uModel * vec4(aPos, 1.0);
  vP = wp.xyz;
  vFade = 1.0 - clamp(length(aPos.xz), 0.0, 1.0);
  gl_Position = uProj * wp;
}`;
/* FS_BASE 是不带头部的主体；createGL 再按 OES_standard_derivatives 可用性拼上
   #extension 指令与 USE_NMAP 宏——GLSL 要求 #extension 必须位于所有非预处理指令之前 */
const FS_BASE = `
/* 精度：能用 highp 就用。mediump（很多实现是 fp16）在法线插值 + 高光
   pow(...,96) 这类计算上会出现条带与麻点，远看就是"粗糙"。 */
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vN, vC, vL, vP, vT; varying vec2 vUv; varying float vFade, vW;
uniform vec3 uLight, uTint; uniform float uAlpha, uShadow;
uniform float uFur, uGloss, uSss, uTextured, uHasTan, uSrgb;
uniform sampler2D uTexColor, uTexMR, uTexN;

/* 3D 值噪声（Dave Hoskins hash13：在 mediump 下也稳定，不会出条纹） */
float hash13(vec3 p3){
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i + vec3(0.0,0.0,0.0)), hash13(i + vec3(1.0,0.0,0.0)), f.x),
                 mix(hash13(i + vec3(0.0,1.0,0.0)), hash13(i + vec3(1.0,1.0,0.0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0.0,0.0,1.0)), hash13(i + vec3(1.0,0.0,1.0)), f.x),
                 mix(hash13(i + vec3(0.0,1.0,1.0)), hash13(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p){
  float s = 0.0, a = 0.5;
  for(int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return s;
}

void main(){
  vec3 n = normalize(vN);
  vec3 L = normalize(uLight);
  vec3 V = vec3(0.0, 0.0, 1.0);          /* 视线方向（以相机为参考的空间） */
  float gloss = uGloss;

  /* ---- GLB 贴图模型分支：baseColor + 金属度/粗糙度 + 法线贴图 ---- */
  vec3 base = vC * uTint;
  if(uTextured > 0.5){
    base = texture2D(uTexColor, vUv).rgb;
    /* glTF 的 baseColor 贴图是 sRGB 编码的，必须转到线性空间再参与光照——
       之前直接拿 sRGB 值当线性用，暗部被压死（0.5 的贴图色被当成 0.5 的
       反射率，实际只有 0.21），观感发闷、和 3D 查看器里的样子对不上。
       程序化小狼的颜色本来就是按显示值给的，不参与这趟转换（uSrgb=0）。 */
    if(uSrgb > 0.5) base = pow(max(base, vec3(0.0)), vec3(2.2));
    /* glTF 约定：金属度在 B 通道、粗糙度在 G 通道 */
    vec2 mr = texture2D(uTexMR, vUv).gb;
    gloss = clamp((1.0 - mr.x) * 0.85, 0.02, 0.95);
    /* 法线贴图优先走顶点切线（构建时算好的 TANGENT 属性，插值后重正交化）——
       早期用屏幕空间导数重建 TBN，在原网格（三角形极小、UV 每面连续）上没问题，
       但 decimation 后三角形变大、UV 每面畸变加剧，导数法切线会翻转 →
       满屏明暗皱褶。有 TANGENT 属性的网格一律走这条路。 */
    if(uHasTan > 0.5){
      vec3 T = normalize(vT - vN * dot(vN, vT));
      vec3 B = cross(vN, T) * vW;
      vec3 nt = texture2D(uTexN, vUv).xyz * 2.0 - 1.0;
      n = normalize(T * nt.x + B * nt.y + vN * nt.z);
    }else{
#if USE_NMAP
      /* 无切线属性的兜底：屏幕空间导数重建 TBN（WebGL1 需 OES_standard_derivatives） */
      vec3 dp1 = dFdx(vP), dp2 = dFdy(vP);
      vec2 du1 = dFdx(vUv), du2 = dFdy(vUv);
      vec3 t = normalize(dp1 * du2.y - dp2 * du1.y);
      vec3 b = cross(n, t);
      vec3 nt = texture2D(uTexN, vUv).xyz * 2.0 - 1.0;
      n = normalize(mat3(t, b, n) * nt);
#endif
    }
  }else if(uFur > 0.004){
    /* ---- 毛绒 / 织物：分频扰动法线 + 表面斑驳 ----
       频率必须与网格密度匹配：头部三角形约 0.037 世界单位，若噪声特征尺寸接近它，
       每个三角形采样到不同值 → 严重 aliasing（发霉/麻点）。故毛发放到 18、织物放到 8，
       并压低幅度——要的是"修剪过的毛绒质感"，不是单根毛发。 */
    float fq = (uFur > 0.35) ? 18.0 : 8.0;              /* 毛发细密、织物粗粝 */
    /* 法线扰动用低频（特征尺寸≈三角形）→ 柔和的毛流阴影，不闪不麻；
       毛色斑驳用高频细颗粒、低幅度 → 读作毛的走向而非污斑 */
    vec3 q = vL * fq * 0.6;
    vec3 w = vec3(fbm(q), fbm(q + 19.31), fbm(q + 41.77)) - 0.5;
    n = normalize(n + w * uFur * 0.42);
    base *= 0.94 + 0.13 * fbm(vL * fq * 1.05);
  }

  /* ---- 半球环境光：上得天光、下得地光 ---- */
  vec3 sky = vec3(0.54, 0.60, 0.68), gnd = vec3(0.26, 0.23, 0.20);
  vec3 amb = mix(gnd, sky, n.y * 0.5 + 0.5) * 0.66;

  /* ---- 主光：Lambert + 半角高光（湿鼻/金属/漆皮靠这个） ---- */
  float diff = max(dot(n, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), mix(8.0, 96.0, gloss)) * gloss;

  /* ---- 补光：对向柔光，压平死黑 ---- */
  float fill = max(dot(n, normalize(vec3(-0.55, 0.15, 0.55))), 0.0) * 0.22;

  /* ---- 边缘光：让轮廓从背景里挑出来 ---- */
  float rim = pow(1.0 - clamp(abs(n.z), 0.0, 1.0), 2.6) * 0.16;

  /* ---- 次表面散射：薄处透光（耳尖/鼻尖/毛边） ---- */
  float sss = pow(max(dot(-n, L), 0.0), 2.0) * uSss;

  vec3 col = base * (amb + diff * 0.95 + fill)
           + vec3(1.0, 0.97, 0.92) * spec * 0.9
           + vec3(rim)
           + base * sss * 0.6;

  /* 线性 → sRGB 输出：只对走了 sRGB 输入的贴图模型做，程序化小狼保持原样。
     0.78 是实测曝光补偿：不压（1.0）时探针测出 7.7% 的模型像素冲到 L>250
     （高光糊成一片），0.88 → 5.5%，0.78 → 3.6%，白毛仍白但层次回来了。 */
  if(uSrgb > 0.5) col = pow(max(col * 0.78, vec3(0.0)), vec3(0.4545));

  float a = mix(1.0, uAlpha * vFade * vFade, uShadow);
  gl_FragColor = vec4(col, a);
}`;

/* ============================================================
   装饰着色：把「白脸罩 / 金 V 领 / 球衣金侧条 / 球裤白侧条 / 深灰耳尖」
   直接焊进母体网格的逐三角形颜色里。坐标均为「网格局部坐标」，
   所以装饰跟着曲面走，永远不会像悬浮小方块那样飘。
   ============================================================ */

/* 白脸罩：下颌 + 吻周 + 腮边白毛。边界形状按官方立版：
   两眼之间与额头保持狼毛灰，白从眼睛下缘起向两侧铺开、腮部白得更高，后脑一律灰。
   关键：边界必须是**连续函数**——早期用 |nx|>0.55 的硬跳变，会在头部两侧画出竖直线，
   而竖直线落在经度方向上必然锯齿（再怎么加密都没用）。这里把「腮侧抬高」和「后脑退回灰」
   都写成 smoothstep，再配 0.12 的过渡带（≈2.4 个纬度台阶），边界就成了平滑曲线。 */
function headColor(p){
  const nx = p[0] / 0.38, ny = p[1] / 0.31, nz = p[2] / 0.26;
  const side = smooth01((Math.abs(nx) - 0.35) / 0.25);   // 0 = 鼻梁中间，1 = 腮侧
  const edge = -0.36 + 0.12 * side;                      // 腮部白区上缘略高（连续）
  const back = smooth01((-0.15 - nz) / 0.10);            // 越靠后脑越退回狼毛灰（连续）
  const t = smooth01((edge - ny) / 0.24) * (1 - back);   // 过渡带放宽 → 柔和不画硬线
  return mixc(C.gray, C.white, t);
}

/* 胸口金 V 领：白胸毛上两条金线，外上扬、内下汇于胸口（V 字朝上张） */
function chestColor(p){
  const nx = p[0] / 0.245, ny = p[1] / 0.115, nz = p[2] / 0.145;
  if(nz > 0.22 && Math.abs(nx) < 0.82 && Math.abs(ny - (0.02 + 1.10 * Math.abs(nx))) < 0.18) return C.gold;
  return C.white;
}

/* 球衣金侧条：躯干左右两侧各一条竖金饰条（中高、前段） */
function bodyColor(p){
  if(Math.abs(p[0]) > 0.215 && Math.abs(p[1]) < 0.095 && p[2] > -0.02) return C.gold;
  return C.red;
}

/* 球裤白侧条：短裤左右侧面各一条竖白饰条（前段） */
function shortsColor(p, f){
  if((f === 2 || f === 3) && p[2] > 0.02 && p[2] < 0.09) return C.white;
  return C.redD;
}

/* 深灰耳尖：耳朵上段换成深灰，与官方立版一致 */
function earColor(p){ return p[1] > 0.06 ? C.grayD : C.gray; }

/* ============================================================
   层级骨架
   每个节点：{ mesh, color, t:[x,y,z], r:[x,y,z], s:[x,y,z], kids:[], mat:材质 }
   约定：大件一律用「预缩放网格」且 s=(1,1,1)，子节点按父节点局部绝对单位摆放；
        纯容器节点用 empty 网格（0 三角形），只提供变换坐标系。
   mat 三个通道：
     fur  毛绒/织物强度（0 光滑 ~ 1 厚绒）——驱动法线扰动与毛色斑驳
     gloss 高光锐度（0 全哑光 ~ 1 镜面）——湿鼻、金属、漆皮
     sss  次表面散射（0 无 ~ 1 强透光）——耳尖、鼻尖、毛边
   形象锚定（由官方立版逐段量得，单位=总高 1.58）：
     耳顶 +0.91 / 下巴 +0.19 / 肩 +0.09 / 裆 -0.20 / 脚底 -0.67
     张臂总宽 1.58（与身高等宽）——这是官方立版最鲜明的姿势特征
   ============================================================ */
/* 材质预设：按官方立版的质感分层。
   fur 分三档：头部/白长毛柔顺（0.45~0.50）、躯干四肢灰毛蓬松（0.75）、
   衣物织物干净（0.18~0.30）；gloss 管高光锐度；sss 管薄处透光。 */
const MAT = {
  fur:     { fur: 0.75, gloss: 0.05, sss: 0.12 },   // 灰狼毛（前臂 / 掌 / 尾 / 腿 / 耳 / 乱毛）
  furS:    { fur: 0.55, gloss: 0.06, sss: 0.10 },   // 头部柔顺狼毛
  furL:    { fur: 0.45, gloss: 0.06, sss: 0.14 },   // 白长毛（吻 / 胸毛 / 耳内 / 尾尖）
  cloth:   { fur: 0.18, gloss: 0.04, sss: 0.03 },   // 球衣 / 短裤（哑光织物，干净）
  knit:    { fur: 0.30, gloss: 0.03, sss: 0.02 },   // 球袜（针织罗纹）
  gold:    { fur: 0.03, gloss: 0.88, sss: 0.00 },   // 金饰边（金属）
  wet:     { fur: 0.00, gloss: 0.96, sss: 0.28 },   // 鼻头 / 眼神光（湿润）
  eye:     { fur: 0.00, gloss: 0.80, sss: 0.05 },   // 瞳孔（湿润）
  eyeW:    { fur: 0.00, gloss: 0.42, sss: 0.03 },   // 眼底（深暖灰，微润）
  leather: { fur: 0.10, gloss: 0.46, sss: 0.00 },   // 球鞋（皮革）
  soft:    { fur: 0.05, gloss: 0.22, sss: 0.00 }    // 舌 / 牙
};
function node(mesh, color, t, r, s, kids, mat){
  return { mesh, color: color || C.gray, t: t || [0,0,0], r: r || [0,0,0], s: s || [1,1,1],
           kids: kids || [], mat: mat || MAT.fur };
}

/* 小狼全部网格（全曲面版）。createGL 与 buildWolf 共用同一份几何定义，避免两边漂移。 */
function wolfGeom(){
  return {
    empty:   buildEmpty(),
    /* 头：椭球大头圆脸，白脸罩走 colorFn 焊在球面上（两眼之间与额头保持灰）。
       密度给到 64×80：既让脸罩边界更柔顺，也给毛绒法线扰动留出解析余量 */
    head:    buildEllipsoid(0.38, 0.31, 0.26, 64, 80, headColor),
    muzzle:  buildEllipsoid(0.15, 0.095, 0.085, 12, 16),
    nose:    buildEllipsoid(0.050, 0.038, 0.034, 10, 14),
    /* 眼睛按官方立版：横向杏仁大眼（宽>高）+ 深暖灰眼底 + 近黑瞳孔 + 双高光。
       关键：眼底不是白色！官方是深褐近黑的大眼，白高光提供神采 */
    eyeW:    buildEllipsoid(0.096, 0.066, 0.028, 12, 16),
    pupil:   buildEllipsoid(0.078, 0.052, 0.024, 12, 16),
    shine:   buildEllipsoid(0.017, 0.017, 0.009, 6, 10),
    shine2:  buildEllipsoid(0.007, 0.010, 0.007, 6, 8),
    /* 嘴：张开的笑口 = 宽扁口腔 + 口内顶白牙 + 口内底红舌（都从口膛前缘微微探出） */
    mouth:   buildEllipsoid(0.095, 0.032, 0.024, 10, 14),
    teeth:   buildEllipsoid(0.050, 0.006, 0.012, 6, 10),
    tongue:  buildEllipsoid(0.055, 0.016, 0.020, 8, 12),
    /* 腮部白毛：官方立版脸颊两侧蓬起白毛（破掉"光球头"的轮廓） */
    cheek:   buildEllipsoid(0.085, 0.105, 0.085, 10, 14),
    /* 耳：锥体车削，与竖直方向约 33° 斜上方外展（官方立版的耳位），深灰只覆盖最尖端 */
    ear:     buildLathe(taperProfile(0.100, 0.020, 0.40, 6), 18, earColor),
    earIn:   buildEllipsoid(0.060, 0.240, 0.032, 10, 14),
    /* 胸：椭球白胸毛 + 金 V 领（colorFn） */
    chest:   buildEllipsoid(0.245, 0.115, 0.145, 14, 18, chestColor),
    body:    buildEllipsoid(0.285, 0.215, 0.205, 16, 20, bodyColor),
    /* 四肢：车削胶囊，接缝处法线连续 */
    sleeve:  buildLathe(capsuleProfile(0.084, 0.22, 4), 14),
    cuff:    buildLathe(capsuleProfile(0.095, 0.052, 3), 14),
    forearm: buildLathe(capsuleProfile(0.078, 0.22, 4), 14),
    paw:     buildEllipsoid(0.090, 0.070, 0.080, 10, 14),
    shorts:  buildRoundBox(0.42, 0.17, 0.35, 0.075, 5, shortsColor),
    leg:     buildLathe(capsuleProfile(0.095, 0.14, 4), 14),
    sock:    buildLathe(capsuleProfile(0.095, 0.11, 4), 14),
    shoe:    buildEllipsoid(0.135, 0.058, 0.185, 10, 14),
    tail:    buildLathe(capsuleProfile(0.10, 0.34, 4), 14),
    tailTip: buildEllipsoid(0.082, 0.105, 0.082, 10, 14),
    brow:    buildLathe(capsuleProfile(0.026, 0.15, 3), 10),
    tuft:    buildEllipsoid(0.070, 0.060, 0.070, 8, 12),
    /* 刘海尖刺：粗短圆头锥，七枚密排（官方是蓬起的尖刺刘海，不是牙签） */
    spike:   buildLathe(taperProfile(0.040, 0.006, 0.18, 4), 8)
  };
}

function buildWolf(meshes){
  if(!meshes) meshes = wolfGeom();
  const mk = (mesh, color, t, r, s, kids) => node(mesh, color, t, r, s, kids);
  const E = meshes.empty;
  const P = C.plain;                       // 网格自带逐顶点色 → 材质用纯白相乘

  /* ============ 头：大圆头 + 白脸罩(colorFn) + 杏仁大眼 + 怒眉 + 笑口 + 前倾大尖耳 ============ */
  /* 头局部坐标：头心 (0,0,0)，高 0.62（±0.31）、宽 0.76、深 0.52（前面 +0.26）。
     五官按官方立版的头部占比落位（头顶→下巴）：
       眉 55% / 眼 62% / 鼻 74% / 嘴 85% / 下巴 100% */
  /* 眼睛整体外端上扬（rotZ 正角把局部 +X 甩向上方）→ 精神，不呆 */
  const eyeTilt = side => [0, 0, side * 0.13];
  /* 按官方立版：横向杏仁大眼、深暖灰眼底 + 近黑瞳孔 + 双高光。
     之前"白眼圈 + 黑瞳孔 + 白球高光"是典型 googly 眼，正是显假的元凶 */
  const eye = side => mk(meshes.eyeW, C.eyeD,
    [side * 0.182, -0.058, 0.194], eyeTilt(side), [1, 1, 1], [], MAT.eyeW);   // 眼底（深暖灰）
  const pupil = side => mk(meshes.pupil, C.dark,
    [side * 0.182, -0.070, 0.205], eyeTilt(side), [1, 1, 1], [], MAT.eye);    // 瞳孔（近黑，微前凸）
  const shine = side => mk(meshes.shine, C.white,
    [side * 0.202, -0.044, 0.232], eyeTilt(side), [1, 1, 1], [], MAT.wet);    // 主高光（外上大）
  const shine2 = side => mk(meshes.shine2, C.white,
    [side * 0.162, -0.098, 0.233], eyeTilt(side), [1, 1, 1], [], MAT.wet);    // 次高光（内下小）
  /* 怒眉：深色粗斜杠、内端高外端低（官方立版的怒眉，不是灰胶囊） */
  const brow = side => mk(meshes.brow, C.dark,
    [side * 0.168, 0.002, 0.222], [0, 0, side * (0.55 + Math.PI / 2)], [1.1, 1, 1], [], MAT.fur);
  /* 头顶刘海：七枚粗短尖刺密排成蓬起的刘海（官方是尖刺刘海，不是牙签/花生） */
  const fringeColor = mixc(C.gray, C.white, 0.42);
  const spike = (x, y, z, rz, sc) => mk(meshes.spike, fringeColor, [x, y, z], [0, 0, rz], [sc, sc, sc], [], MAT.fur);
  /* 腮部白毛：脸颊两侧蓬起（官方轮廓是"宽脸 + 腮毛"，不是光球） */
  const cheek = side => mk(meshes.cheek, C.white,
    [side * 0.315, -0.125, 0.075], [0, 0, side * 0.12], [1, 1, 1], [], MAT.furL);
  /* 耳：大尖耳从头顶两侧长出（基座埋进头里、轴心斜上方外展约31°）。
     教训：之前节点在 (±0.44, 0.56) 且 rz 符号写反 → 基座悬空 0.22 + 朝内撇，像折断的耳朵 */
  const ear = side => mk(meshes.ear, P,
    [side * 0.27, 0.39, -0.02], [-0.12, 0, side * 0.55], [1.05, 1.0, 1.05], [
      mk(meshes.earIn, C.pinkIn, [0, 0.010, 0.040], [0, 0, 0], [1, 1, 1], [], MAT.furL)
    ], MAT.fur);

  const head = mk(meshes.head, P, [0, 0.50, 0], [0, 0, 0], [1, 1, 1], [
    mk(meshes.muzzle, C.white, [0, -0.235, 0.215], [0, 0, 0], [1, 1, 1], [], MAT.furL),  // 圆吻部（白长毛）
    mk(meshes.nose,   C.dark,  [0, -0.158, 0.280], [0, 0, 0], [1, 1, 1], [], MAT.wet),   // 小黑鼻（湿润）
    /* 张开的笑口：宽扁口腔 + 口内顶白牙 + 口内底红舌（都从口膛前缘微微探出） */
    mk(meshes.mouth,  C.dark,  [0, -0.230, 0.286], [0, 0, 0], [1, 1, 1], [], MAT.soft),   // 口腔
    mk(meshes.teeth,  C.white, [0, -0.208, 0.298], [0, 0, 0], [1, 1, 1], [], MAT.soft),   // 上排牙
    mk(meshes.tongue, C.pink,  [0, -0.238, 0.296], [0, 0, 0], [1, 1, 1], [], MAT.soft),   // 红舌
    cheek(-1), cheek(1),
    eye(-1), eye(1), pupil(-1), pupil(1),
    shine(-1), shine(1), shine2(-1), shine2(1),
    brow(-1), brow(1),
    /* 刘海尖刺：中轴最高、两侧渐低，整体略微撇向 -x */
    spike(-0.170, 0.238, 0.010, -0.55, 0.78),
    spike(-0.118, 0.262, -0.004, -0.42, 0.95),
    spike(-0.062, 0.278, -0.014, -0.28, 1.05),
    spike( 0.000, 0.285, -0.018, -0.12, 1.10),
    spike( 0.062, 0.278, -0.014,  0.04, 1.02),
    spike( 0.118, 0.262, -0.004,  0.20, 0.90),
    spike( 0.170, 0.238, 0.010,  0.38, 0.74),
    ear(-1), ear(1)
  ], MAT.furS);

  /* ============ 张臂：红短袖 + 金袖口条 + 灰前臂 + 灰掌 ============ */
  /* 臂局部 +Y = 外伸方向（绕 Z 转 ±(90°-2°)：略上扬，官方立版是"欢迎"式张臂）；
     节点原点 = 肩关节 */
  const arm = side => mk(E, C.gray, [side * 0.21, 0.09, 0], [0, 0, -side * (Math.PI / 2 - 0.04)], [1, 1, 1], [
    mk(meshes.sleeve,  C.red,  [0, 0.12, 0], [0, 0, 0], [1, 1, 1], [], MAT.cloth),    // 红袖（织物）
    mk(meshes.cuff,    C.gold, [0, 0.245, 0], [0, 0, 0], [1, 1, 1], [], MAT.gold),     // 金袖口条（金属）
    mk(meshes.forearm, C.gray, [0, 0.36, 0], [0, 0, 0], [1, 1, 1], [], MAT.fur),       // 灰前臂（毛）
    mk(meshes.paw,     C.gray, [0, 0.51, 0], [0, 0, 0], [1, 1, 1], [], MAT.fur)        // 灰掌（毛）
  ], MAT.fur);

  /* ============ 腿：灰大腿 + 蓝袜 + 黄鞋 ============ */
  const leg = side => mk(meshes.leg, C.gray, [side * 0.135, -0.415, 0.01], [0, 0, 0], [1, 1, 1], [
    mk(meshes.sock, C.sock, [0, -0.10, 0], [0, 0, 0], [1, 1, 1], [], MAT.knit),        // 蓝袜（针织）
    mk(meshes.shoe, C.shoe, [0, -0.19, 0.03], [0, 0, 0], [1, 1, 1], [], MAT.leather)   // 黄鞋（皮革）
  ], MAT.fur);

  /* ============ 短裤：红 + 白侧条（整块一个网格，侧条走 colorFn） ============ */
  const shorts = mk(meshes.shorts, P, [0, -0.28, 0.01], [0, 0, 0], [1, 1, 1], [], MAT.cloth);

  /* ============ 尾：大蓬松灰尾翘向右后 + 白尾尖 ============ */
  const tail = mk(meshes.tail, C.gray, [0.14, -0.26, -0.24], [-0.42, 0, -1.02], [1, 1, 1], [
    mk(meshes.tailTip, C.white, [0, 0.21, 0], [0, 0, 0], [1, 1, 1], [], MAT.furL)
  ], MAT.fur);

  /* ============ 躯干：椭球红球衣 + 金侧条(colorFn) + 椭球白胸毛 + 金 V 领 ============ */
  const chest = mk(meshes.chest, P, [0, 0.105, 0.03], [0, 0, 0], [1, 1, 1], [], MAT.furL);
  const body  = mk(meshes.body,  P, [0, -0.10, 0], [0, 0, 0], [1, 1, 1], [], MAT.cloth);

  const legL = leg(-1), legR = leg(1);
  const root = mk(E, C.gray, [0, 0, 0], [0, 0, 0], [1, 1, 1], [
    chest, body, head,
    arm(-1), arm(1),
    shorts,
    legL, legR,
    tail
  ], MAT.fur);
  return { root, head, tail, legs: [legL, legR] };
}

/* ---------- GLB（glTF 2.0 二进制）解析与网格化 ----------
   站点零依赖，不引 three.js：自己解 GLB 头 / JSON chunk / BIN chunk，
   按 accessor 切出 TypedArray 视图直接上传 GPU。 */
/* ============================================================
   勋章（苏小狼荣誉勋章）：绶带 + 珐琅金盘 + 珠边 + 小狼浮雕
   全程序化生成（零贴图），与小狼共用同一套材质/光照体系。
   坐标约定：盘体是绕 Y 轴的车削件 → 节点 rotX(+90°) 立起后正面朝 +Z；
   浮雕挂在盘下的 face 组里，再 rotX(-90°) 旋回「Y 上、Z 朝相机」的直观坐标。
   ============================================================ */
function badgeDiscColor(p){
  const r = Math.hypot(p[0], p[2]);                 // 车削件：盘面在 XZ 平面
  /* 颜色普遍 >1：盘面法线固定朝 +Z，与主光 (0.45,0.8,0.55) 的夹角使漫反射
     只剩 ~55%，不提亮的话金盘会发棕、珐琅红发黑（首版实测） */
  if(r < 0.305) return mixc([1.50, 1.28, 0.66], [1.12, 0.90, 0.40], smooth01(r / 0.305));
  if(r < 0.372) return [1.22, 0.32, 0.24];          // 珐琅红环（苏超球衣红）
  return mixc([1.38, 1.16, 0.55], [1.02, 0.80, 0.34], smooth01((r - 0.372) / 0.068));
}
function badgeFaceColor(p){
  /* 白脸罩：下半脸与口鼻区留白，额头保持狼毛灰（与官方立版一致）。
     同样因盘面受光弱，灰/白都按 1.35× 提亮 */
  const y = p[1] / 0.180, x = Math.abs(p[0]) / 0.185;
  return mixc([0.84, 0.81, 0.68], [1.30, 1.29, 1.20],
              smooth01((0.10 - y) * 1.7) * smooth01((1.0 - x) * 1.5));
}
function badgeEarColor(p){ return p[1] > 0.125 ? [0.50, 0.51, 0.43] : [0.84, 0.81, 0.68]; }
function badgeTorusProfile(R, rc, seg){
  const p = [];
  for(let i = 0; i <= seg; i++){
    const a = i / seg * Math.PI * 2;
    p.push({ r: R + rc * Math.cos(a), y: rc * Math.sin(a) });   // 剖面是圆 → 绕轴成甜甜圈
  }
  return p;
}
function badgeGeom(){
  return {
    empty:  buildEmpty(),
    /* 剖面必须从背面到正面（y 递增）：车削绕向决定法线朝向，写反了
       法线全朝内，盘面按背光渲染 → 金盘发棕、珐琅红发黑（首版实测） */
    disc:   buildLathe([{r:0, y:-0.075},{r:0.30,y:-0.070},{r:0.40,y:-0.052},{r:0.44,y:0.000},
                        {r:0.37,y:0.032},{r:0.30,y:0.060},{r:0.17,y:0.073},{r:0,y:0.075}],
                       56, badgeDiscColor),
    bead:   buildBall(0.034, 8, 12),
    face:   buildEllipsoid(0.185, 0.180, 0.070, 30, 36, badgeFaceColor),
    ear:    buildLathe(taperProfile(0.072, 0.022, 0.20, 5), 14, badgeEarColor),
    nose:   buildEllipsoid(0.034, 0.026, 0.030, 8, 12),
    eye:    buildEllipsoid(0.030, 0.036, 0.022, 8, 10),
    shine:  buildEllipsoid(0.011, 0.011, 0.008, 6, 8),
    loop:   buildLathe(badgeTorusProfile(0.082, 0.024, 18), 24),
    ribbon: buildRoundBox(0.115, 0.44, 0.030, 0.014, 3),
    knot:   buildEllipsoid(0.078, 0.058, 0.046, 10, 14)
  };
}
function buildBadge(meshes){
  if(!meshes) meshes = badgeGeom();
  const mk = (mesh, color, t, r, s, kids, mat) => node(mesh, color, t, r, s, kids, mat);
  const E = meshes.empty, P = C.plain;
  /* --- 盘体：中心离锚点 0.52，直径 0.88 --- */
  const disc = mk(meshes.disc, P, [0, 0.52, 0], [Math.PI / 2, 0, 0], [1, 1, 1], [], MAT.gold);
  for(let i = 0; i < 12; i++){                       // 珠边：12 颗金珠绕盘缘
    const a = i / 12 * Math.PI * 2;
    disc.kids.push(mk(meshes.bead, C.gold,
      [0.452 * Math.cos(a), 0, 0.452 * Math.sin(a)], [0, 0, 0], [1, 1, 1], [], MAT.gold));
  }
  /* --- 小狼浮雕 --- */
  const face = mk(meshes.face, P, [0, 0.012, 0.052], [0, 0, 0], [1, 1, 1], [
    mk(meshes.ear,   P,      [-0.112, 0.150, 0.030], [0, 0,  0.32], [1,1,1], [], MAT.furS),
    mk(meshes.ear,   P,      [ 0.112, 0.150, 0.030], [0, 0, -0.32], [1,1,1], [], MAT.furS),
    mk(meshes.nose,  C.dark, [ 0.000,-0.048, 0.108], [0, 0, 0], [1,1,1], [], MAT.wet),
    mk(meshes.eye,   C.dark, [-0.076, 0.048, 0.098], [0, 0, 0], [1,1,1], [], MAT.eye),
    mk(meshes.eye,   C.dark, [ 0.076, 0.048, 0.098], [0, 0, 0], [1,1,1], [], MAT.eye),
    mk(meshes.shine, C.white,[-0.058, 0.066, 0.118], [0, 0, 0], [1,1,1], [], MAT.wet),
    mk(meshes.shine, C.white,[ 0.058, 0.066, 0.118], [0, 0, 0], [1,1,1], [], MAT.wet)
  ], MAT.furS);
  disc.kids.push(mk(E, P, [0, 0.075, 0], [-Math.PI / 2, 0, 0], [1, 1, 1], [face], MAT.furS));
  /* --- 挂环 + 蝴蝶结 + 红蓝绶带（V 形上扬） --- */
  const loop = mk(meshes.loop,   C.gold, [ 0.000, 1.03, 0], [Math.PI / 2, 0, 0], [1,1,1], [], MAT.gold);
  const knot = mk(meshes.knot,   C.gold, [ 0.000, 1.09, 0.01], [0, 0, 0], [1,1,1], [], MAT.gold);
  const rbL  = mk(meshes.ribbon, C.red,  [-0.150, 1.36, 0], [0, 0,  0.30], [1,1,1], [], MAT.cloth);
  const rbR  = mk(meshes.ribbon, C.sock, [ 0.150, 1.36, 0], [0, 0, -0.30], [1,1,1], [], MAT.cloth);
  /* group 供待机动画摆动（挂着的奖牌轻轻晃），root 保持锚点 */
  const group = mk(E, P, [0, 0, 0], [0, 0, 0], [1, 1, 1], [disc, loop, knot, rbL, rbR], MAT.gold);
  const root  = mk(E, P, [0, 0, 0], [0, 0, 0], [1, 1, 1], [group], MAT.gold);
  return { root, head: group,
           tail: mk(E, P, [0,0,0], [0,0,0], [1,1,1], [], MAT.gold),   /* 占位：动画接口对齐 */
           legs: [mk(E, P, [0,0,0], [0,0,0], [1,1,1], [], MAT.gold),
                  mk(E, P, [0,0,0], [0,0,0], [1,1,1], [], MAT.gold)] };
}

function parseGLB(buf){
  const dv = new DataView(buf);
  if(dv.getUint32(0, true) !== 0x46546C67) throw new Error('不是 GLB 文件');
  const jsLen = dv.getUint32(12, true);
  const js = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsLen)));
  const binOff = 20 + jsLen + 8;
  const binLen = dv.getUint32(20 + jsLen, true);
  return { js, bin: new Uint8Array(buf, binOff, binLen) };
}
const GLB_COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function glbAccessor(js, bin, i){
  const a = js.accessors[i], bv = js.bufferViews[a.bufferView];
  const CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array,
               5122: Int16Array, 5121: Uint8Array, 5120: Int8Array }[a.componentType];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return new CT(bin.buffer, bin.byteOffset + start, a.count * GLB_COMP[a.type]);
}
/* 贴图：GLB 内嵌图片（bufferView + mimeType）→ Blob → Image → WebGL 纹理（含 mipmap） */
function glbTexture(gl, js, bin, imgIdx){
  const im = js.images[imgIdx], bv = js.bufferViews[im.bufferView];
  const start = bv.byteOffset || 0;
  const blob = new Blob([bin.subarray(start, start + bv.byteLength)], { type: im.mimeType || 'image/png' });
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);   /* glTF UV 原点在左上，正好不用翻 */
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      /* 各向异性过滤：这个模型 UV 图集是碎小岛，斜视角 + mip 渗色会把
         相邻岛的颜色串到模型表面（身上的长条/方块色斑）。各向异性采样
         让斜视角走更精细的 mip 层级，渗色带宽显著收窄。移动端普遍支持 8~16x */
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
        || gl.getExtension('WEBGL_EXT_texture_filter_anisotropic');
      if (aniso) {
        const maxA = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
        gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, maxA));
      }
      res(t);
    };
    img.onerror = () => rej(new Error('贴图解码失败: ' + (im.name || imgIdx)));
    img.src = URL.createObjectURL(blob);
  });
}
/* 无 OES_element_index_uint 时的兜底：按 65536 顶点切片，把 u32 索引
   重映射成 u16。每片独立上传成兄弟节点，drawNode 依次画，视觉上与
   单网格完全一致（切在三角形边界上，不产生任何缝）。 */
function glbChunksU16(gl, pos, nor, uv, tan, idx){
  const LIMIT = 65536, chunks = [];
  let i = 0;
  while(i < idx.length){
    const remap = new Map();
    const cPos = [], cNor = [], cUv = [], cTan = [], cIdx = [];
    const push = v => {
      let nv = remap.get(v);
      if(nv === undefined){
        nv = remap.size;
        if(nv >= LIMIT) return -1;            /* 片满：整个三角形搬到下一片 */
        remap.set(v, nv);
        cPos.push(pos[v*3], pos[v*3+1], pos[v*3+2]);
        cNor.push(nor[v*3], nor[v*3+1], nor[v*3+2]);
        cUv.push(uv[v*2], uv[v*2+1]);
        if(tan) cTan.push(tan[v*4], tan[v*4+1], tan[v*4+2], tan[v*4+3]);
      }
      return nv;
    };
    while(i < idx.length){
      const a = idx[i], b = idx[i+1], c = idx[i+2]; i += 3;
      const na = push(a), nb = push(b), nc = push(c);
      if(na < 0 || nb < 0 || nc < 0){ i -= 3; break; }   /* 回退，下片重来 */
      cIdx.push(na, nb, nc);
    }
    const data = { pos: new Float32Array(cPos), nor: new Float32Array(cNor),
                   uv: new Float32Array(cUv), idx: new Uint16Array(cIdx) };
    if(tan) data.tan = new Float32Array(cTan);
    chunks.push(gl.upload(data));
  }
  return chunks;
}
/* 把 GLB 变成与程序化小狼同构的节点树 {mesh,color,t,r,s,kids,mat}，
   外面再包 root→sway→模型 两层空节点：待机呼吸/摇头动画直接复用现有帧循环。
   模型原始朝向：长轴沿 -Z（高度 1.0985），节点 rotation 是 90° X 旋转 → 站立朝 +Z。
   尺度按实测包围盒对齐：程序化小狼 local y ∈ [-0.67, +0.91]（脚 -0.67 / 耳尖 +0.91，
   总高 1.58），这里把模型缩放到同高同脚位，AR 控制器的初始参数因此不用改。
   （朝向最终以渲染结果为准：若 upside-down，把 FLIP 设 true 即可。） */
async function buildGLBModel(gl, js, bin){
  const prim = js.meshes[0].primitives[0];
  const pos = glbAccessor(js, bin, prim.attributes.POSITION);
  const nor = glbAccessor(js, bin, prim.attributes.NORMAL);
  const uv  = glbAccessor(js, bin, prim.attributes.TEXCOORD_0);
  const idx = glbAccessor(js, bin, prim.indices);
  const tan = prim.attributes.TANGENT != null ? glbAccessor(js, bin, prim.attributes.TANGENT) : null;

  /* 贴图按 glTF 材质定义取：baseColor / metallicRoughness / normal
     注意传 gl.gl（真实 WebGL 上下文）：glbTexture 内部要调 createTexture 等
     GL 方法，包装对象上没有这些——早期直接把包装传进去，onload 里抛
     TypeError 又没人接，promise 永远 pending，表现为"构建卡死" */
  const mat = js.materials[prim.material] || {};
  const pbr = mat.pbrMetallicRoughness || {};
  const tColor = pbr.baseColorTexture ? glbTexture(gl.gl, js, bin, js.textures[pbr.baseColorTexture.index].source) : null;
  const tMR = pbr.metallicRoughnessTexture ? glbTexture(gl.gl, js, bin, js.textures[pbr.metallicRoughnessTexture.index].source) : null;
  const tN = mat.normalTexture ? glbTexture(gl.gl, js, bin, js.textures[mat.normalTexture.index].source) : null;
  const [cTex, mrTex, nTex] = await Promise.all([tColor, tMR, tN]);

  /* 实测包围盒：模型沿最长轴（-Z）站立 */
  const mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
  for(let i = 0; i < pos.length; i += 3){
    for(let k = 0; k < 3; k++){
      if(pos[i+k] < mn[k]) mn[k] = pos[i+k];
      if(pos[i+k] > mx[k]) mx[k] = pos[i+k];
    }
  }
  const h = mx[2] - mn[2];
  const FLIP = false;                       /* 实测若倒立，改 true */
  const S = 1.58 / h;                       /* 与程序化小狼同高 */
  const T = [0, FLIP ? 0.91 : -0.67, 0];    /* 脚底对齐 -0.67 */
  const R = [FLIP ? -Math.PI/2 : Math.PI/2, 0, 0];
  const mdef = { textured: 1, fur: 0.0, gloss: 0.30, sss: 0.10, cTex, mrTex, nTex };

  /* u32 索引要 OES_element_index_uint；没有就切片重映射成 u16 */
  const meshes = (idx instanceof Uint32Array && !gl.hasU32)
    ? glbChunksU16(gl, pos, nor, uv, tan, idx)
    : [gl.upload({ pos, nor, uv, tan, idx })];
  const gnodes = meshes.map(m => node(m, [1, 1, 1], T, R, [S, S, S], [], mdef));

  const sway = node(gl.empty, [1, 1, 1], [0, 0, 0], [0, 0, 0], [1, 1, 1], gnodes, MAT.soft);
  const root = node(gl.empty, [1, 1, 1], [0, 0, 0], [0, 0, 0], [1, 1, 1], [sway], MAT.soft);
  /* tail/legs 给占位对象：帧循环对它们的写入无害（GLB 无骨骼动画） */
  return { root, head: sway, tail: { r: [0, 0, 0] }, legs: [{ r: [0, 0, 0] }, { r: [0, 0, 0] }] };
}

/* ---------- 渲染器 ---------- */
function createGL(canvas){
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true })
          || canvas.getContext('experimental-webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true });
  if(!gl) return null;
  /* 法线贴图走屏幕空间导数（WebGL1 需 OES_standard_derivatives）；
     拿不到扩展就编译不含法线贴图的分支，其余照常。
     u32 索引的 GLB 网格还需要 OES_element_index_uint（拿不到时
     buildGLBModel 会改走 u16 切片重映射，见下）。 */
  const hasDeriv = !!gl.getExtension('OES_standard_derivatives');
  const hasU32 = !!gl.getExtension('OES_element_index_uint');
  const FS = (hasDeriv ? '#extension GL_OES_standard_derivatives : enable\n#define USE_NMAP 1\n'
                       : '#define USE_NMAP 0\n') + FS_BASE;
  function sh(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  /* 上传一份网格数据：GLB 网格带 uv + tan + idx；程序化网格只有 pos/nor/col */
  function upload(data){
    const m = {};
    for(const [name, arr, n] of [['pos', data.pos, 3], ['nor', data.nor, 3],
                                 ['col', data.col, 3], ['uv', data.uv, 2], ['tan', data.tan, 4]]){
      if(!arr) continue;
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      m[name] = { buf: b, count: arr.length / n, size: n };
    }
    if(data.idx){
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.idx, gl.STATIC_DRAW);
      m.idx = { buf: b, count: data.idx.length,
                type: data.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
    }
    return m;
  }
  /* 全曲面网格集：与 wolfGeom() 同一份定义，只是上传到 GPU */
  const geom = wolfGeom();
  const wolfMeshes = {};
  for(const k of Object.keys(geom)) wolfMeshes[k] = upload(geom[k]);
  wolfMeshes.empty = { pos: { count: 0 }, nor: { count: 0 }, col: { count: 0 } };
  /* 勋章网格（程序化，零贴图）：与小狼共用 empty 占位 */
  const bgeom = badgeGeom();
  const badgeMeshes = { empty: wolfMeshes.empty };
  for(const k of Object.keys(bgeom)) badgeMeshes[k] = upload(bgeom[k]);
  const disc = upload(buildDisc());
  let wolf = buildWolf(wolfMeshes);

  const u = {
    proj: gl.getUniformLocation(prog, 'uProj'),
    model: gl.getUniformLocation(prog, 'uModel'),
    light: gl.getUniformLocation(prog, 'uLight'),
    tint: gl.getUniformLocation(prog, 'uTint'),
    alpha: gl.getUniformLocation(prog, 'uAlpha'),
    shadow: gl.getUniformLocation(prog, 'uShadow'),
    fur: gl.getUniformLocation(prog, 'uFur'),
    gloss: gl.getUniformLocation(prog, 'uGloss'),
    sss: gl.getUniformLocation(prog, 'uSss'),
    textured: gl.getUniformLocation(prog, 'uTextured'),
    hasTan: gl.getUniformLocation(prog, 'uHasTan'),
    srgb: gl.getUniformLocation(prog, 'uSrgb'),
    texColor: gl.getUniformLocation(prog, 'uTexColor'),
    texMR: gl.getUniformLocation(prog, 'uTexMR'),
    texN: gl.getUniformLocation(prog, 'uTexN'),
    aUv: gl.getAttribLocation(prog, 'aUv'),
    aTan: gl.getAttribLocation(prog, 'aTan')
  };
  gl.enable(gl.DEPTH_TEST);
  gl.uniform3f(u.light, 0.45, 0.8, 0.55);
  gl.uniform1f(u.alpha, 1);
  gl.uniform1f(u.shadow, 0);
  gl.uniform1i(u.texColor, 0);
  gl.uniform1i(u.texMR, 1);
  gl.uniform1i(u.texN, 2);

  /* 每层深度独立 scratch（各 2 个矩阵）：
     兄弟节点都要反复读父矩阵，任何"共享 scratch 交替写入"都会踩掉父矩阵，
     导致后续兄弟姐妹基座被污染、位移逐级复利（耳朵乱飞/腿消失的元凶） */
  const SCRATCH = Array.from({ length: 10 }, () => [new Float32Array(16), new Float32Array(16)]);
  const rA = new Float32Array(16), rB = new Float32Array(16);
  /* 属性开关必须成对管理：WebGL 的 vertexAttribPointer 不会自动 enable
     （老实现靠"上传时 enable、状态残留"混过来了；现在每个网格的属性集不同：
     GLB 网格没有 col，若 aCol 仍开着就会指向上一个网格的颜色缓冲区，
     缓冲区不够大时 drawElements 直接 INVALID_OPERATION → 整帧消失） */
  function bindAttr(loc, attr){
    if(attr){
      gl.bindBuffer(gl.ARRAY_BUFFER, attr.buf);
      gl.vertexAttribPointer(loc, attr.size, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(loc);
    }else{
      gl.disableVertexAttribArray(loc);
    }
  }
  function drawNode(n, parent, depth){
    const scratch = SCRATCH[Math.min(depth, SCRATCH.length - 1)];
    const sa = scratch[0], sb = scratch[1];
    let m = M.mul(parent, M.trans(n.t[0], n.t[1], n.t[2]), sa);
    m = M.mul(m, M.rotY(n.r[1]), sb);
    m = M.mul(m, M.rotX(n.r[0]), sa);
    m = M.mul(m, M.rotZ(n.r[2]), sb);
    m = M.mul(m, M.scale(n.s[0], n.s[1], n.s[2]), sa);
    const mesh_ = n.mesh;
    if(mesh_.pos.count > 0){                                   // 空容器节点直接跳过绘制
      const aPos = gl.getAttribLocation(prog, 'aPos');
      const aNor = gl.getAttribLocation(prog, 'aNor');
      const aCol = gl.getAttribLocation(prog, 'aCol');
      bindAttr(aPos, mesh_.pos);
      bindAttr(aNor, mesh_.nor);
      bindAttr(aCol, mesh_.col);
      if(mesh_.uv){                                            // GLB 网格带 UV
        gl.enableVertexAttribArray(u.aUv);
        bindAttr(u.aUv, mesh_.uv);
      }else{
        gl.disableVertexAttribArray(u.aUv);                    // 关掉 → 取默认值 (0,0)，不采样
      }
      if(mesh_.tan){                                           // GLB 网格带切线（法线贴图正路）
        gl.enableVertexAttribArray(u.aTan);
        bindAttr(u.aTan, mesh_.tan);
        gl.uniform1f(u.hasTan, 1);
      }else{
        gl.disableVertexAttribArray(u.aTan);
        gl.uniform1f(u.hasTan, 0);
      }
      gl.uniform3fv(u.tint, n.color);
      const mt = n.mat || MAT.fur;                             // 材质：毛绒 / 高光 / 次表面 / 贴图
      const textured = mt.textured ? 1 : 0;
      gl.uniform1f(u.fur, mt.fur);
      gl.uniform1f(u.gloss, mt.gloss);
      gl.uniform1f(u.sss, mt.sss);
      gl.uniform1f(u.textured, textured);
      gl.uniform1f(u.srgb, textured);          // 贴图模型走 sRGB→线性→sRGB 往返
      if(textured){
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mt.cTex || null);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mt.mrTex || null);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, mt.nTex || null);
      }
      gl.uniformMatrix4fv(u.model, false, m);
      if(mesh_.idx){
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh_.idx.buf);
        gl.drawElements(gl.TRIANGLES, mesh_.idx.count, mesh_.idx.type, 0);
      }else{
        gl.drawArrays(gl.TRIANGLES, 0, mesh_.pos.count);
      }
    }
    n.kids.forEach(k => drawNode(k, m, depth + 1));
  }

  return {
    gl, disc, upload, hasU32, empty: wolfMeshes.empty,  /* empty 暴露出来：GLB 根/摆动的空节点要用 */
    get wolf(){ return wolf; },
    setModel(m){ wolf = m; },
    setBadge(){ wolf = buildBadge(badgeMeshes); },
    render(opts){
      const w = canvas.width, h = canvas.height;
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const proj = M.persp(0.9, w / h, 0.1, 60);
      gl.uniformMatrix4fv(u.proj, false, proj);
      const aPos = gl.getAttribLocation(prog, 'aPos');
      const aNor = gl.getAttribLocation(prog, 'aNor');
      const aCol = gl.getAttribLocation(prog, 'aCol');
      /* 地面接触影：径向渐隐 + 混合，贴在脚底（不再是死黑椭圆） */
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      const dm = M.mul(M.trans(opts.x, opts.y + 0.015 * opts.scale, opts.z),
                       M.scale(opts.scale * 0.66, 1, opts.scale * 0.92), rA);
      gl.bindBuffer(gl.ARRAY_BUFFER, disc.pos.buf);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(aPos);
      gl.bindBuffer(gl.ARRAY_BUFFER, disc.nor.buf);
      gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(aNor);
      gl.bindBuffer(gl.ARRAY_BUFFER, disc.col.buf);
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(aCol);
      gl.disableVertexAttribArray(u.aUv);
      /* 关键：上一帧若画过贴图模型，uTextured 停留在 1 会让影子也走进贴图分支
         （aUv 已关 → vUv=(0,0) → 影子颜色被贴图角像素污染），必须显式复位 */
      gl.uniform1f(u.textured, 0);
      gl.uniform1f(u.hasTan, 0);
      gl.uniform1f(u.srgb, 0);              // 影子按显示值给色，不走 sRGB 往返
      gl.uniform1f(u.gloss, 0.05);
      gl.uniform3f(u.tint, 0.04, 0.07, 0.12);
      gl.uniform1f(u.shadow, 1);
      gl.uniform1f(u.alpha, 0.42);
      gl.uniformMatrix4fv(u.model, false, dm);
      gl.drawArrays(gl.TRIANGLES, 0, disc.pos.count);
      gl.uniform1f(u.shadow, 0);
      gl.uniform1f(u.alpha, 1);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      /* 小狼：锚点在脚底（根节点=躯干中心，故上抬 0.67*scale） */
      const world = M.mul(M.trans(opts.x, opts.y + 0.67 * opts.scale, opts.z), M.rotY(opts.rotY), rA);
      const sc = M.mul(world, M.scale(opts.scale, opts.scale, opts.scale), rB);
      drawNode(wolf.root, sc, 0);
    }
  };
}

/* ---------- WebAR 控制器 ---------- */
function mount(opts){
  const stage = opts.stage, video = opts.video, canvas = opts.canvas;
  const gl = createGL(canvas);
  if(!gl) return null;

  /* 可选：外部 GLB 模型（异步加载，就绪前不渲染；失败则回退程序化小狼） */
  let modelReady = !opts.model;
  if(opts.badge){
    /* 勋章展示：程序化生成，不下载任何模型文件（离线/file:// 也能用） */
    gl.setBadge();
    modelReady = true;
    window.__AR_MODEL__ = { source: 'badge' };
  }else if(opts.model){
    fetch(opts.model, { cache: 'force-cache' })
      .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(buf => { const { js, bin } = parseGLB(buf); return buildGLBModel(gl, js, bin); })
      .then(m => {
        gl.setModel(m);
        /* 可观测标记：AR 页到底有没有用上 GLB（file:// 下 fetch 会失败 → 回退
           程序化小狼，这是设计内的降级，但要能一眼看出来是走了哪条路） */
        const mn = m.root.kids[0].kids[0];
        window.__AR_MODEL__ = { source: 'glb', path: opts.model,
                                verts: mn.mesh.pos.count, tris: mn.mesh.idx.count / 3,
                                tan: !!mn.mesh.tan };
      })
      .catch(e => {
        console.warn('[ar] GLB 加载失败，回退程序化模型：', e);
        window.__AR_MODEL__ = { source: 'procedural', error: String(e && e.message || e) };
      })
      .then(() => { modelReady = true; });
  }else{
    window.__AR_MODEL__ = { source: 'procedural' };
  }

  /* 世界状态（初始站在舞台中心偏下，锚点在脚下）。
     勋章比小狼高（含绶带 ≈1.6×scale）→ 相机后退、模型略缩，保证绶带不出画 */
  const BASE = opts.badge ? { y: -0.90, z: -4.2, scale: 1.15 }
                          : { y: -0.90, z: -3.2, scale: 1.35 };
  const st = { x: 0, y: BASE.y, z: BASE.z, rotY: 0.55, scale: BASE.scale };
  let anim = 0, celebrate = -1, baseY = BASE.y, raf = 0, last = 0;

  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = stage.getBoundingClientRect();
    canvas.width = Math.max(2, Math.round(r.width * dpr));
    canvas.height = Math.max(2, Math.round(r.height * dpr));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
  }
  resize();
  window.addEventListener('resize', resize);

  /* 把舞台像素坐标映射到世界 x/y（固定深度 z） */
  function toWorld(px, py){
    const r = stage.getBoundingClientRect();
    const nx = (px - r.left) / r.width * 2 - 1;   // -1..1
    const ny = (py - r.top) / r.height * 2 - 1;   // -1..1（上正）
    const halfH = Math.tan(0.9 / 2) * -st.z;      // 该深度可见半高
    const halfW = halfH * (r.width / r.height);
    return { x: nx * halfW, y: -ny * halfH * 0.82 }; // 底部留出地面
  }

  /* 画面内钳制：顶不超出上沿、底不沉出下沿（总高≈1.6×scale，狼含耳 / 勋章含绶带） */
  function clampY(){
    const halfH = Math.tan(0.9 / 2) * -st.z;
    const topLimit = halfH - 1.70 * st.scale;     // 留余量（狼顶含耳约 1.60×scale）
    st.y = Math.min(topLimit, Math.max(-halfH * 0.85, st.y));
  }

  /* ---- 动画循环 ---- */
  function frame(t){
    raf = requestAnimationFrame(frame);
    if(!last) last = t;
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    anim += dt;
    /* 勋章待机：匀速自转（转起来才看得出金盘的金属反光） */
    if(opts.badge) st.rotY += dt * 0.55;
    /* 待机：呼吸起伏 + 摆尾 + 摇头 + 腿部微摆 */
    const bob = Math.sin(anim * 2.2) * 0.018;
    gl.wolf.root.t[1] = bob;
    gl.wolf.tail.r[1] = Math.sin(anim * 6) * 0.45;
    gl.wolf.head.r[1] = Math.sin(anim * 1.3) * 0.14;
    gl.wolf.head.r[2] = Math.sin(anim * 1.7) * 0.045;
    gl.wolf.legs.forEach((l, i) => { l.r[0] = Math.sin(anim * 2.2 + i * 1.7) * 0.05; });
    /* 庆祝：0.9s 跳跃 + 加速旋转（位移按时间驱动、相对起跳点，帧率无关） */
    if(celebrate >= 0){
      celebrate += dt;
      const k = celebrate / 0.9;
      if(k >= 1){ celebrate = -1; st.y = baseY; }
      else{
        st.y = baseY + Math.abs(Math.sin(k * Math.PI * 3)) * 0.35 * (1 - k);
        st.rotY += dt * 7;
        gl.wolf.tail.r[1] = Math.sin(celebrate * 18) * 0.7;
      }
    }
    /* 模型就绪前不渲染，避免先闪一帧程序化小狼 */
    if(modelReady){
      gl.render({ x: st.x, y: st.y, z: st.z, rotY: st.rotY, scale: st.scale });
    }
  }
  raf = requestAnimationFrame(frame);

  /* ---- 手势：单指拖动 / 双指缩放旋转 / 滚轮 ---- */
  const pts = new Map();
  let pinch0 = 0, rot0 = 0, scale0 = 1;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if(pts.size === 2){
      const [a, b] = [...pts.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      rot0 = Math.atan2(b.y - a.y, b.x - a.x);
      scale0 = st.scale;
    }
  });
  canvas.addEventListener('pointermove', e => {
    if(!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if(pts.size === 1){
      const w = toWorld(e.clientX, e.clientY);
      st.x = w.x; st.y = w.y;
      clampY();
    }else if(pts.size === 2){
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      if(pinch0 > 0) st.scale = Math.min(1.6, Math.max(0.45, scale0 * d / pinch0));
      st.rotY += ang - rot0;
      rot0 = ang;
      clampY();
    }
  });
  const up = e => { pts.delete(e.pointerId); if(pts.size < 2) pinch0 = 0; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    st.scale = Math.min(1.6, Math.max(0.45, st.scale * (1 - e.deltaY * 0.0012)));
    clampY();
  }, { passive: false });

  return {
    state: st,
    rotate(d){ st.rotY += d; },
    reset(){ celebrate = -1; st.x = 0; st.y = BASE.y; baseY = BASE.y;
             st.rotY = 0.55; st.scale = BASE.scale; },
    cheer(){ celebrate = 0; baseY = st.y; },
    stop(){ cancelAnimationFrame(raf); window.removeEventListener('resize', resize); },
    shot(){
      /* 输出 2 倍舞台尺寸：先铺视频 cover，再叠 GL 画布 */
      const r = stage.getBoundingClientRect();
      const c = document.createElement('canvas');
      c.width = Math.round(r.width * 2); c.height = Math.round(r.height * 2);
      const ctx = c.getContext('2d');
      const vw = video.videoWidth, vh = video.videoHeight;
      if(vw && vh){
        const s = Math.max(c.width / vw, c.height / vh);
        const dw = vw * s, dh = vh * s;
        ctx.drawImage(video, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
      }else{
        ctx.fillStyle = '#0d131f'; ctx.fillRect(0, 0, c.width, c.height);
      }
      ctx.drawImage(canvas, 0, 0, c.width, c.height);
      return c;
    }
  };
}

window.ArWolf = { mount, createGL, buildWolf, buildBadge, buildBall, parseGLB, buildGLBModel };
})();
