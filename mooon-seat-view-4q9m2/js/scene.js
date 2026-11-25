import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { floorOf, rowZ, ROW_STEP } from './data.js';

export const COLORS = {
  stage: 0x121212,
  free: new THREE.Color('#5463F5'),
  taken: new THREE.Color('#2a2a2a'),
  yours: new THREE.Color('#4b4b4b'),      // выбранное место, как на mooon.by
  leather: new THREE.Color('#1c1c1f'),     // чёрная кожа реклайнеров (фото зала)
  stitch: new THREE.Color('#5c5c60'),      // строчка ромбом на спинках: тонкая, приглушённая, как на фото
  badge: '#F2C200',                         // жёлтые номера мест на консолях
};

const ROOM = { halfW: 9.2, back: 23, ceil: 10.8 };
export const SCREEN = { w: 13.6, h: 5.75, y: 4.15, z: -1.2 };
export { ROOM };

function part(w, h, d, x, y, z, rx = 0, r = 0.05) {
  const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

function canvasTex(w, h, draw, repeat = [1, 1], srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- процедурные карты нормалей: зерно кожи и стёганые ромбы
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
// зерно кожи: сетка ячеек (Ворони), низ – по границам ячеек, бугорки внутри
function leatherHeight(W, H, cells) {
  const h = new Float32Array(W * H), cw = W / cells, chh = H / Math.round(cells * H / W), ny = Math.round(cells * H / W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = Math.floor(x / cw), gy = Math.floor(y / chh);
    let f1 = 1e9, f2 = 1e9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = gx + i, cy = gy + j, wx = ((cx % cells) + cells) % cells, wy = ((cy % ny) + ny) % ny;
      const px = (cx + 0.15 + 0.7 * hash(wx, wy)) * cw, py = (cy + 0.15 + 0.7 * hash(wy + 17, wx + 3)) * chh;
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    const e = Math.min(1, (f2 - f1) / (cw * 0.35));
    h[y * W + x] = Math.sqrt(e) + 0.15 * hash(x * 0.7, y * 0.3);
  }
  return h;
}
function normalTex(h, W, H, strength, repeat) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  const at = (x, y) => h[((y + H) % H) * W + ((x + W) % W)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 8;
  return t;
}
// стёжка ромбом: подушечки между швами, швы утоплены, сверху зерно кожи
const QW = 512, QH = 768, QSTEP = QW / 3.2, QK = 0.42;
function quiltHeight(grain, GW) {
  const h = new Float32Array(QW * QH), norm = 1 / Math.hypot(1, QK), R = QSTEP * 0.42 * norm;
  for (let y = 0; y < QH; y++) for (let x = 0; x < QW; x++) {
    const a = ((x - QK * y) % QSTEP + QSTEP) % QSTEP, b = ((x + QK * y - QK * QH) % QSTEP + QSTEP) % QSTEP;
    const dist = Math.min(Math.min(a, QSTEP - a), Math.min(b, QSTEP - b)) * norm;
    const t = Math.min(1, dist / R);
    h[y * QW + x] = Math.sqrt(1 - (1 - t) * (1 - t)) * 6 + 0.35 * grain[((y * 3) % GW) * GW + ((x * 3) % GW)];
  }
  return h;
}

// Реклайнер по фото зала: чёрная кожа, спинка со строчкой ромбом, консоли со столиком
// и жёлтым номером между местами. Диван = двойной реклайнер, Single = одиночный.
const CONS = 0.12;
function seatParts(type) {
  const W = type === 'sofa' ? 1.46 : 0.76;
  const n = type === 'sofa' ? 2 : 1;
  const inner = W - CONS * 2, cw = inner / n;
  const body = [], quilt = [], trim = [], badges = [], holes = [];
  trim.push(part(W - 0.02, 0.12, 0.66, 0, 0.06, 0.02, 0, 0.02));                     // цоколь
  for (let i = 0; i < n; i++) {
    const cx = -inner / 2 + cw / 2 + i * cw;
    body.push(part(cw - 0.02, 0.2, 0.62, cx, 0.36, -0.02, 0, 0.08));                  // сиденье
    body.push(part(cw - 0.04, 0.3, 0.08, cx, 0.2, -0.3, -0.12, 0.035));               // подножка
    body.push(part(cw - 0.03, 0.68, 0.17, cx, 0.8, 0.3, 0.17, 0.075));                // спинка
    const panel = new RoundedBoxGeometry(cw - 0.1, 0.54, 0.03, 2, 0.012);            // строчка только на лицевой стороне спинки
    panel.translate(0, 0.02, -0.088); panel.rotateX(0.17); panel.translate(cx, 0.8, 0.3);
    quilt.push(panel);
    body.push(part(cw - 0.05, 0.16, 0.2, cx, 1.16, 0.37, 0.17, 0.07));                // подголовник
    if (i === 0) badges.push({ x: -(W / 2 - CONS / 2) });   // номер – на консоли слева, у дивана один номер
  }
  [-1, 1].forEach((s) => {
    const x = s * (W / 2 - CONS / 2);
    trim.push(part(CONS, 0.6, 0.7, x, 0.3, 0.02, 0, 0.03));                           // консоль
    trim.push(part(0.24, 0.022, 0.38, x, 0.63, -0.08, 0, 0.01));                       // столик
    const ring = new THREE.CylinderGeometry(0.042, 0.04, 0.006, 28); ring.translate(x, 0.643, -0.19);
    holes.push(ring);                                                                  // подстаканник
  });
  return { body: mergeGeometries(body), quilt: mergeGeometries(quilt), trim: mergeGeometries(trim), holes: mergeGeometries(holes), badges };
}

export function createScene(canvas, units) {
  RectAreaLightUniformsLib.init();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(new THREE.Color().setRGB(0.01621, 0.01621, 0.01621, THREE.LinearSRGBColorSpace), 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color().setRGB(0.01621, 0.01621, 0.01621, THREE.LinearSRGBColorSpace);   // после тонмаппинга ровно #121212, как фон карточки схемы
  const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 200);
  const pmrem = new THREE.PMREMGenerator(renderer);              // мягкие отражения: блики на коже и панелях
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.12;

  // ---------- текстуры
  const carpetTex = canvasTex(512, 512, (x, w, h) => {      // ковролин с продольной полоской
    x.fillStyle = '#2c2c30'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const y = Math.random() * h, l = 20 + Math.random() * 120, c = 30 + Math.random() * 30;
      x.fillStyle = `rgba(${c},${c},${c + 4},.55)`; x.fillRect(Math.random() * w, y, l, 1.2);
    }
  }, [10, 10]);
  const grilleTex = canvasTex(64, 64, (x, w, h) => {        // фронт ступеней: горизонтальные прорези
    x.fillStyle = '#1a1a1d'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#0a0a0b'; for (let y = 0; y < h; y += 8) x.fillRect(0, y, w, 3);
  }, [60, 4]);
  const stitchCanvas = (bg, fg, lw) => (x, w, h) => {      // нитка по линиям швов (те же, что в quiltHeight)
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = fg; x.lineWidth = lw; x.setLineDash([4, 5]);
    for (let k = -8; k < 12; k++) {
      x.beginPath(); x.moveTo(k * QSTEP, 0); x.lineTo(k * QSTEP + h * QK, h); x.stroke();
      x.beginPath(); x.moveTo(k * QSTEP + h * QK, 0); x.lineTo(k * QSTEP, h); x.stroke();
    }
  };
  const stitchTex = canvasTex(QW, QH, stitchCanvas('#000', '#fff', 1.2), [1, 1], false);
  const GW = 256;
  const grainH = leatherHeight(GW, GW, 26);
  const grainN = normalTex(grainH, GW, GW, 1.4, [12, 12]);          // зерно кожи на сиденьях, подлокотниках, спинках сзади
  const quiltN = normalTex(quiltHeight(grainH, GW), QW, QH, 0.9, [1, 1]); // стёжка + зерно на лицевой стороне спинки
  const panelN = normalTex(grainH, GW, GW, 0.8, [3, 3]);          // фактура обивки стеновых панелей

  // ---------- материалы
  const carpet = new THREE.MeshStandardMaterial({ color: 0xffffff, map: carpetTex, roughness: 1 });
  const grille = new THREE.MeshStandardMaterial({ color: 0xffffff, map: grilleTex, roughness: 0.8 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.95 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
  const stepLed = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff0dc, emissiveIntensity: 1.2 });
  const downMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff1dc, emissiveIntensity: 3 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.32, metalness: 0.15 });   // глянцевый чёрный пластик консолей
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.9 });

  // у каждого статуса пара материалов: кожа и спинка со строчкой; в виде сверху – цвета схемы
  const mk = (c) => ({
    body: new THREE.MeshPhysicalMaterial({ color: c.clone(), roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4,
      normalMap: grainN, normalScale: new THREE.Vector2(0.9, 0.9) }),
    quilt: new THREE.MeshPhysicalMaterial({ color: c.clone(), roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4,
      normalMap: quiltN, normalScale: new THREE.Vector2(1, 1),
      emissive: COLORS.stitch.clone(), emissiveMap: stitchTex, emissiveIntensity: 0 }),
  });
  const seatMats = { free: mk(COLORS.free), taken: mk(COLORS.taken), yours: mk(COLORS.yours) };

  const room = new THREE.Group();
  scene.add(room);
  const box = (w, h, d, x, y, z, m) => {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z);
    room.add(me);
    return me;
  };

  // ---------- пол и амфитеатр
  box(ROOM.halfW * 2, 0.02, ROOM.back + 3, 0, -0.01, ROOM.back / 2 - 1.5, carpet);
  for (let r = 3; r <= 11; r++) {
    const h = floorOf(r), hp = floorOf(r - 1);
    const z0 = rowZ(r) - ROW_STEP / 2;
    const len = r === 11 ? ROOM.back - z0 : ROW_STEP;
    box(ROOM.halfW * 2, h, len, 0, h / 2, z0 + len / 2, carpet);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.halfW * 2, h - hp), grille);       // фронт ступени
    f.position.set(0, (h + hp) / 2, z0 - 0.003); f.rotation.y = Math.PI; f.rotation.y = 0; room.add(f);
    [-1, 1].forEach((sd) => box(1.1, 0.012, 0.012, sd * (ROOM.halfW - 0.75), h - 0.03, z0 - 0.006, stepLed));
  }
  box(16, 0.55, 2.2, 0, 0.275, -0.2, blackMat);                                    // сцена под экраном

  // ---------- стены: ромбы-панели, как в зале (тёмные и несколько светлых, скос по краям)
  const wallH = ROOM.ceil;
  [-1, 1].forEach((s) => box(0.1, wallH, ROOM.back + 2, s * (ROOM.halfW + 0.05), wallH / 2, ROOM.back / 2 - 1, wallMat));
  box(ROOM.halfW * 2, wallH, 0.1, 0, wallH / 2, -1.3, blackMat);                   // фронтальная стена
  box(ROOM.halfW * 2, wallH, 0.1, 0, wallH / 2, ROOM.back, wallMat);                // задняя

  const tileGeo = new RoundedBoxGeometry(1, 1, 0.1, 2, 0.045);
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.1, normalMap: panelN, normalScale: new THREE.Vector2(0.5, 0.5) });
  const shades = [['#111113', .5], ['#1c1c20', .24], ['#34343a', .14], ['#6a6a70', .07], ['#a4a4aa', .05]].map(([c, w]) => [new THREE.Color(c), w]);
  const pickShade = () => { let r = Math.random(); for (const [c, w] of shades) { if ((r -= w) <= 0) return c; } return shades[0][0]; };
  function diamondWall(len, y0, y1, place) {
    const S = 0.52, D = S / Math.SQRT2, gap = 0.03, tiles = [], used = new Set();
    const A = Math.ceil((len + y1) / D) + 2;
    const key = (a, b) => a + ',' + b;
    for (let a = -A; a <= A; a++) for (let b = -A; b <= A; b++) {
      if (used.has(key(a, b))) continue;
      const r = Math.random();
      let wa = 1, wb = 1;
      if (r < 0.22 && !used.has(key(a + 1, b))) wa = 2; else if (r < 0.44 && !used.has(key(a, b + 1))) wb = 2;
      const ca = a + (wa - 1) / 2, cb = b + (wb - 1) / 2;
      const x = (ca - cb) * D, y = (ca + cb) * D;
      const hx = (wa + wb) * D / 2 + 0.02, hy = hx;       // габарит повёрнутого прямоугольника
      if (x - hx < 0 || x + hx > len || y - hy < y0 || y + hy > y1) continue;
      for (let i = 0; i < wa; i++) for (let j = 0; j < wb; j++) used.add(key(a + i, b + j));
      tiles.push({ x, y, sx: wa * S - gap, sy: wb * S - gap });
    }
    const im = new THREE.InstancedMesh(tileGeo, tileMat, tiles.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4);
    tiles.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, t.y, 0.05), q, new THREE.Vector3(t.sx, t.sy, 1));
      im.setMatrixAt(i, m); im.setColorAt(i, pickShade());
    });
    const g = new THREE.Group(); g.add(im); place(g); room.add(g);
  }
  const L = ROOM.back + 1.25;
  diamondWall(L, 1.2, wallH - 0.4, (g) => { g.rotation.y = Math.PI / 2; g.position.set(-ROOM.halfW, 0, ROOM.back); });   // левая
  diamondWall(L, 1.2, wallH - 0.4, (g) => { g.rotation.y = -Math.PI / 2; g.position.set(ROOM.halfW, 0, -1.25); });       // правая
  diamondWall(ROOM.halfW * 2, floorOf(11) + 1.6, wallH - 0.4, (g) => { g.rotation.y = Math.PI; g.position.set(ROOM.halfW, 0, ROOM.back - 0.05); }); // задняя

  box(1.4, 0.5, 0.05, 0, 8.6, ROOM.back - 0.2,
    new THREE.MeshStandardMaterial({ color: 0, emissive: 0x9fb2ff, emissiveIntensity: 1.4 })); // окно проекционной
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, transparent: true });
  const ceiling = box(ROOM.halfW * 2, 0.1, ROOM.back + 2, 0, wallH, ROOM.back / 2 - 1, ceilMat); // потолок
  const downGroup = new THREE.Group(); room.add(downGroup);
  const dg = new THREE.CylinderGeometry(0.09, 0.09, 0.03, 20);
  for (let z = 3; z < ROOM.back; z += 3.2) for (let x = -6; x <= 6; x += 4) {
    const d = new THREE.Mesh(dg, downMat); d.position.set(x, wallH - 0.06, z); downGroup.add(d);
  }
  function updateCeiling(camY) {
    const o = Math.min(1, Math.max(0, (wallH - 0.6 - camY) / 2.2));   // потолок проявляется, только когда камера уже в зале
    ceilMat.opacity = o;
    ceiling.visible = o > 0.01;
    downGroup.visible = o > 0.5;
  }

  // ---------- экран
  const sc = document.createElement('canvas');
  sc.width = 2048; sc.height = Math.round(2048 * SCREEN.h / SCREEN.w);
  const sctx = sc.getContext('2d');
  const screenTex = new THREE.CanvasTexture(sc);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 8;
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), screenMat);
  screen.position.set(0, SCREEN.y, SCREEN.z);
  room.add(screen);
  box(SCREEN.w + 0.5, SCREEN.h + 0.5, 0.05, 0, SCREEN.y, -1.24, blackMat);
  const flakes = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.6, v: 0.0006 + Math.random() * 0.0016, d: Math.random() * 6 }));
  function drawScreen(t) {
    const W = sc.width, H = sc.height;
    const g = sctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1420'); g.addColorStop(0.6, '#101d2b'); g.addColorStop(1, '#05080d');
    sctx.fillStyle = g; sctx.fillRect(0, 0, W, H);
    const rg = sctx.createRadialGradient(W * 0.72, H * 0.32, 10, W * 0.72, H * 0.32, H * 0.9);
    rg.addColorStop(0, 'rgba(160,190,225,0.35)'); rg.addColorStop(1, 'rgba(160,190,225,0)');
    sctx.fillStyle = rg; sctx.fillRect(0, 0, W, H);
    // силуэт цилиндра
    sctx.save(); sctx.translate(W * 0.72, H * 0.62); sctx.rotate(-0.08);
    sctx.fillStyle = '#04070b';
    sctx.beginPath(); sctx.ellipse(0, 90, 330, 60, 0, 0, Math.PI * 2); sctx.fill();
    sctx.fillRect(-180, -300, 360, 390);
    sctx.beginPath(); sctx.ellipse(0, -300, 180, 34, 0, 0, Math.PI * 2); sctx.fill();
    sctx.restore();
    sctx.fillStyle = '#fff';
    flakes.forEach((f) => {
      f.y += f.v; if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
      const x = (f.x + Math.sin(t * 0.0006 + f.d) * 0.01) * W;
      sctx.globalAlpha = 0.35 + f.r / 5;
      sctx.beginPath(); sctx.arc(x, f.y * H, f.r, 0, Math.PI * 2); sctx.fill();
    });
    sctx.globalAlpha = 1;
    sctx.font = '800 150px Manrope, sans-serif';
    sctx.textBaseline = 'alphabetic';
    sctx.fillStyle = '#ffffff';
    sctx.shadowColor = 'rgba(170,200,255,0.6)'; sctx.shadowBlur = 40;
    sctx.fillText('Эбенезер', 140, H * 0.58);
    sctx.shadowBlur = 0;
    sctx.font = '500 44px Manrope, sans-serif';
    sctx.fillStyle = 'rgba(255,255,255,0.75)';
    sctx.fillText('В кино с 19 ноября, только в mooon', 146, H * 0.58 + 80);
    const vg = sctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    sctx.fillStyle = vg; sctx.fillRect(0, 0, W, H);
    screenTex.needsUpdate = true;
  }

  // ---------- свет: экран, общий заполняющий и споты с потолка вдоль стен (подсвечивают ромбы)
  scene.add(new THREE.HemisphereLight(0xb4b4b8, 0x161616, 0.75));
  const screenLight = new THREE.RectAreaLight(0xdde4f2, 6, SCREEN.w, SCREEN.h);
  screenLight.position.set(0, SCREEN.y, SCREEN.z + 0.1);
  screenLight.lookAt(0, SCREEN.y - 1, 10);
  scene.add(screenLight);
  [-1, 1].forEach((s) => [3.5, 10.5, 17.5].forEach((z) => {
    const sp = new THREE.SpotLight(0xfff4e8, 110, 16, 0.62, 0.8, 1.6);
    sp.position.set(s * (ROOM.halfW - 1.3), wallH - 0.3, z);
    sp.target.position.set(s * ROOM.halfW, 3, z + 0.5);
    scene.add(sp, sp.target);
  }));
  const topLight = new THREE.DirectionalLight(0xffffff, 0); // помогает в виде сверху
  topLight.position.set(0, 30, 10);
  scene.add(topLight);

  // ---------- кресла
  const parts = { sofa: seatParts('sofa'), single: seatParts('single') };
  const badgeGeo = new THREE.CircleGeometry(0.036, 24);
  const badgeMats = new Map();
  const badgeMat = (n) => {
    if (!badgeMats.has(n)) {
      const t = canvasTex(64, 64, (x) => {
        x.fillStyle = COLORS.badge; x.beginPath(); x.arc(32, 32, 31, 0, 7); x.fill();
        x.fillStyle = '#111'; x.font = '800 30px Manrope, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(n), 32, 34);
      });
      badgeMats.set(n, new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0x332200, emissiveIntensity: 0.4 }));
    }
    return badgeMats.get(n);
  };
  const seatGroups = new Map();
  units.forEach((u) => {
    const p = parts[u.type];
    const g = new THREE.Group();
    g.position.set(u.x, u.floor, u.z);
    const body = new THREE.Mesh(p.body, seatMats[u.status].body);
    const quilt = new THREE.Mesh(p.quilt, seatMats[u.status].quilt);
    g.add(body, quilt, new THREE.Mesh(p.trim, plastic), new THREE.Mesh(p.holes, holeMat));
    p.badges.forEach((b) => {
      const m = new THREE.Mesh(badgeGeo, badgeMat(u.seats[0]));
      m.position.set(b.x, 0.46, 0.02 - 0.35 - 0.002); m.rotation.y = Math.PI;
      g.add(m);
    });
    g.userData = { unit: u, body, quilt };
    room.add(g);
    seatGroups.set(u.id, g);
  });
  function setSeatState(id, state) {
    const g = seatGroups.get(id);
    g.userData.body.material = seatMats[state].body;
    g.userData.quilt.material = seatMats[state].quilt;
  }

  // переход схема → зал: k = 0 цвета схемы, k = 1 настоящие материалы
  const tmp = new THREE.Color();
  // «Плоский» вид схемы. Каждый материал в начале перехода рисуется ровно цветом схемы
  // (значения подобраны так, что после тонмаппинга ACES получаются те же sRGB, что в 2D):
  // фон #121212, свободное #5463F5, занятое #2a2a2a, выбранное #3c3c3c. uFlat = 1 – плоско, 0 – живой зал.
  const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  const FLAT = { bg: lin(0.01621, 0.01621, 0.01621), free: lin(0.00036, 0.09457, 1.74576), taken: lin(0.03744, 0.03744, 0.03744), yours: lin(0.05671, 0.05671, 0.05671), trim: lin(0.026, 0.026, 0.026) };
  const uFlat = { value: 1 };
  const flatOf = new Map();
  ['free', 'taken', 'yours'].forEach((st) => { flatOf.set(seatMats[st].body, FLAT[st]); flatOf.set(seatMats[st].quilt, FLAT[st]); });
  [plastic, holeMat, ...badgeMats.values()].forEach((m) => flatOf.set(m, FLAT.trim));
  const patched = new Set();
  scene.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach((m) => {
      if (patched.has(m)) return;
      patched.add(m);
      const fc = { value: flatOf.get(m) || FLAT.bg };
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uFlat = uFlat; sh.uniforms.uFlatColor = fc;
        sh.fragmentShader = 'uniform float uFlat;\nuniform vec3 uFlatColor;\n' + sh.fragmentShader
          .replace('#include <opaque_fragment>', 'outgoingLight = mix( outgoingLight, uFlatColor, uFlat );\n#include <opaque_fragment>');
      };
      m.needsUpdate = true;
    });
  });

  function setMorph(k) {
    uFlat.value = 1 - k;
    [['free', COLORS.free], ['taken', COLORS.taken]].forEach(([s, c]) => {
      const m = seatMats[s];
      tmp.copy(c).lerp(COLORS.leather, k);
      m.body.color.copy(tmp); m.quilt.color.copy(tmp).multiplyScalar(1 - 0.2 * k);
      m.body.emissive.set(0);
      m.quilt.emissive.copy(COLORS.stitch).lerp(c, 1 - k);
      m.quilt.emissiveIntensity = 0.22 * k;
    });
    const y = seatMats.yours;                       // выбранное: серое, как на схеме; в зале – та же кожа, строчка светится
    tmp.copy(COLORS.yours).lerp(COLORS.leather, k);
    y.body.color.copy(tmp); y.quilt.color.copy(tmp).multiplyScalar(1 - 0.2 * k);
    y.body.emissive.set(0xffffff); y.body.emissiveIntensity = 0.015 * k;
    y.quilt.emissive.set(0xbfbfc4); y.quilt.emissiveIntensity = 0.45 * k;
    topLight.intensity = 0;
    bloom.strength = 0.5 * k * k;                   // свечение появляется последним, без вспышки
  }

  // ---------- постобработка
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.0, 0.55, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    renderer, scene, camera, composer, bloom, seatGroups, setSeatState, setMorph, drawScreen, topLight, screenLight, updateCeiling,
    setSize(w, h, pr) {
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    },
  };
}
