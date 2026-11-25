// Мобильная версия «Вид с места». Сцена и данные – общие с десктопом (scene.js, data.js).
// Холст 3D всегда на весь экран; на схеме он обрезан по карточке зала (clip-path),
// при входе в 3D обрезка раскрывается на весь экран. Камера кадрирует «рамку» (frameR):
// на схеме это карточка зала, в 3D – область над нижней панелью.
import * as THREE from 'three';
import { buildUnits, PRICES, TYPE_NAME, seatLabel, fmt } from './data.js';
import { createScene, SCREEN } from './scene.js';

const $ = (s, r = document) => r.querySelector(s);
const units = buildUnits();
const byId = new Map(units.map((u) => [u.id, u]));
const selected = new Set();   // по умолчанию ничего не выбрано: место выбирает сам зритель

// ---------- размер: телефон – весь экран; компьютер – превью 390×844
const app = $('#app');
const DESK = matchMedia('(min-width: 821px)').matches && !matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('desk', DESK);
let W = 390, H = 844, scale = 1;
function fit() {
  if (DESK) {
    W = 390; H = 844;
    scale = Math.min(1, (innerHeight - 48) / H, (innerWidth - 48) / W);
    Object.assign(app.style, { width: W + 'px', height: H + 'px', transform: `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})` });
  } else {
    W = innerWidth; H = innerHeight; scale = 1;
    Object.assign(app.style, { width: W + 'px', height: H + 'px', transform: 'none' });
  }
}

// ---------- 3D
const canvas = $('#gl');
const S = createScene(canvas, units);
const cam = S.camera;
let mapR = { x: 12, y: 80, w: 366, h: 500 };
let povR = { x: 0, y: 0, w: 390, h: 600 };
let frameR = mapR;
function setFrame(R) {
  frameR = R;
  cam.aspect = R.w / R.h;
  cam.setViewOffset(R.w, R.h, -R.x, -R.y, W, H);
}
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpR = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });

function layout() {
  fit();
  const prq = +new URLSearchParams(location.search).get('pr');   // ?pr=3 – чёткость холста для записи ролика
  const pr = (prq || Math.min(devicePixelRatio || 1, 2)) * (DESK ? scale : 1);
  S.setSize(W, H, Math.max(1, pr));
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const hb = $('header').offsetHeight;
  const st = $('#sheet').offsetTop;
  mapR = { x: 12, y: hb + 2, w: W - 24, h: st - hb - 2 };
  Object.assign($('#card').style, { left: mapR.x + 'px', top: mapR.y + 'px', width: mapR.w + 'px', height: mapR.h + 'px' });
  const ph = $('.povpanel').offsetHeight + 8 + safeBottom();
  povR = { x: 0, y: 0, w: W, h: H - ph + 28 };
  const lh = $('.lookhint'); lh.style.top = H - ph - 52 + 'px';
  clip(document.body.classList.contains('expanded'), true);
}
function safeBottom() { const v = getComputedStyle(document.documentElement).getPropertyValue('--sb'); return parseFloat(v) || 0; }
// обрезка холста: карточка зала или весь экран
function clip(full, instant) {
  if (instant) canvas.style.transition = 'opacity .45s';
  const r = mapR;
  canvas.style.clipPath = full ? 'inset(0px 0px 0px 0px round 0px)'
    : `inset(${r.y}px ${W - r.x - r.w}px ${H - r.y - r.h}px ${r.x}px round 20px)`;
  if (instant) { void canvas.offsetWidth; canvas.style.transition = ''; }
}

// поза «сверху»: зал вписан в карточку
const PAD = { l: 34, r: 34, t: 44, b: 40 };
const TOP_FOV = 18;
let top = null;
function computeTop() {
  let minX = Infinity, maxX = -Infinity, maxZ = -Infinity;
  units.forEach((u) => { minX = Math.min(minX, u.x - u.width / 2); maxX = Math.max(maxX, u.x + u.width / 2); maxZ = Math.max(maxZ, u.z + 0.45); });
  minX = Math.min(minX, -SCREEN.w / 2); maxX = Math.max(maxX, SCREEN.w / 2);
  const minZ = SCREEN.z;
  const R = mapR;
  const pw = R.w - PAD.l - PAD.r, ph = R.h - PAD.t - PAD.b;
  const s = Math.min(pw / (maxX - minX), ph / (maxZ - minZ));
  const pcx = PAD.l + pw / 2, pcy = PAD.t + ph / 2;
  const wcx = (minX + maxX) / 2, wcz = (minZ + maxZ) / 2;
  const Hh = 1.6 + (R.h / s) / 2 / Math.tan(THREE.MathUtils.degToRad(TOP_FOV / 2));
  const cx = wcx - (pcx - R.w / 2) / s, cz = wcz - (pcy - R.h / 2) / s;
  top = { pos: new THREE.Vector3(cx, Hh, cz), target: new THREE.Vector3(cx, 0, cz) };
}
function applyTop() {
  setFrame(mapR);
  cam.fov = TOP_FOV; cam.updateProjectionMatrix();
  cam.position.copy(top.pos); cam.up.set(0, 0, -1); cam.lookAt(top.target);
  cam.updateMatrixWorld();
}
const v3 = new THREE.Vector3();
function project(x, y, z) { v3.set(x, y, z).project(cam); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }

// ---------- схема (проекция 3D-зала сверху)
const map = $('#map');
const seatEls = new Map(), mapRects = new Map();
let screenRect = null;
function seatSVG(u) {
  const n = u.seats.length > 1 || u.type === 'sofa' ? 2 : 1;
  const Wd = n === 2 ? 64 : 34, Hd = 36, aw = 5, inner = Wd - aw * 2 - 2;
  return `<svg viewBox="0 0 ${Wd} ${Hd}" preserveAspectRatio="none">
    <rect class="b" x="2" y="12" width="${Wd - 4}" height="22" rx="4"/>
    <rect class="c" x="${aw + 1}" y="3" width="${inner}" height="17" rx="4"/>
    <rect class="a" x="0.5" y="10" width="${aw}" height="25" rx="2.5"/>
    <rect class="a" x="${Wd - aw - 0.5}" y="10" width="${aw}" height="25" rx="2.5"/>
    <rect class="s" x="${aw + 1}" y="20" width="${inner}" height="12" rx="3"/></svg>`;
}
function buildMap() {
  computeTop(); applyTop();
  map.querySelectorAll('.seat,.rowlbl').forEach((e) => e.remove());
  units.forEach((u) => {
    const hw = u.width / 2, y = u.floor + 0.6;
    const pts = [[u.x - hw, u.z - 0.38], [u.x + hw, u.z - 0.38], [u.x - hw, u.z + 0.46], [u.x + hw, u.z + 0.46]].map(([x, z]) => project(x, y, z));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    mapRects.set(u.id, r);
    let el = seatEls.get(u.id);
    if (!el) {
      el = document.createElement('button');
      el.className = `seat ${u.type} ${u.status}`;
      el.innerHTML = seatSVG(u) + `<span class="num">${u.seats[0]}</span>`;
      el.setAttribute('aria-label', `Ряд ${u.row}, ${seatLabel(u)}`);
      el.dataset.id = u.id;
      el.addEventListener('click', () => toggle(u));
      seatEls.set(u.id, el);
    }
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', fontSize: Math.round(r.h * 0.62) + 'px' });
    map.appendChild(el);
  });
  for (let row = 1; row <= 11; row++) {
    const rs = units.filter((u) => u.row === row);
    const a = mapRects.get(rs[0].id), b = mapRects.get(rs[rs.length - 1].id);
    const y = a.y + a.h / 2 - 9;
    [[mapR.x + 8], [mapR.x + mapR.w - 26]].forEach(([x]) => {
      const l = document.createElement('div');
      l.className = 'rowlbl'; l.textContent = row;
      l.style.left = x + 'px'; l.style.top = y + 'px';
      map.appendChild(l);
    });
  }
  const [x1, y1] = project(-SCREEN.w / 2, 0.6, SCREEN.z);
  const [x2] = project(SCREEN.w / 2, 0.6, SCREEN.z);
  Object.assign($('#screenArc').style, { left: x1 + 'px', top: y1 - 22 + 'px', width: x2 - x1 + 'px' });
  screenRect = { x: x1, y: y1 - 4, w: x2 - x1, h: 4 };
  Object.assign($('.hallname').style, { left: mapR.x + 14 + 'px', top: mapR.y + 14 + 'px' });
  Object.assign($('.legend').style, { left: mapR.x + 14 + 'px', top: mapR.y + mapR.h - 28 + 'px' });
  syncSeats();
}
function syncSeats() {
  seatEls.forEach((el, id) => el.classList.toggle('yours', selected.has(id)));
  units.forEach((u) => S.setSeatState(u.id, selected.has(u.id) ? 'yours' : u.status));
  renderSheet(); renderMini(); updatePovUI();
}
function toggle(u) {
  if (u.status !== 'free') { const el = seatEls.get(u.id); el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); return; }
  if (selected.has(u.id)) selected.delete(u.id); else { if (selected.size >= 8) return; selected.add(u.id); }
  syncSeats();
  if (navigator.vibrate) navigator.vibrate(8);
}

// ---------- нижняя панель
function sel() { return [...selected].map((id) => byId.get(id)).sort((a, b) => a.row - b.row || a.idx - b.idx); }
const ICON_CUBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function renderSheet() {
  const items = sel();
  const list = $('#picked');
  list.innerHTML = items.length ? items.map((u) => `
    <div class="tk"><span class="pico ${u.type}">${seatSVG(u)}</span>
      <div><b>Ряд ${u.row}, место ${u.seats[0]}</b><small>${TYPE_NAME[u.type]}, ${fmt(PRICES[u.type])}</small></div>
      <button class="tview" data-id="${u.id}" aria-label="Вид с этого места">${ICON_CUBE}</button>
      <button class="prm" data-id="${u.id}" aria-label="Убрать">${ICON_X}</button></div>`).join('')
    : '<div class="empty">Выберите места на схеме</div>';
  list.querySelectorAll('.prm').forEach((b) => b.addEventListener('click', () => { selected.delete(b.dataset.id); syncSeats(); }));
  list.querySelectorAll('.tview').forEach((b) => b.addEventListener('click', () => { if (!DESK) gyroStart(); openPreview(byId.get(b.dataset.id)); }));
  $('#total').textContent = fmt(items.reduce((s, u) => s + PRICES[u.type], 0));
  $('#pay').disabled = !items.length;
  $('#promo').classList.toggle('off', !items.length);
  const rows = new Set(items.map((u) => u.row));
  map.querySelectorAll('.rowlbl').forEach((l) => l.classList.toggle('on', rows.has(+l.textContent)));
  timer(items.length > 0);
}
let tEnd = 0, tInt = 0;
function timer(on) {
  const el = $('#timer');
  if (!on) { el.classList.remove('on'); clearInterval(tInt); tEnd = 0; return; }
  el.classList.add('on');
  if (tEnd) return;
  tEnd = Date.now() + 5 * 60 * 1000;
  const tick = () => { const s = Math.max(0, Math.round((tEnd - Date.now()) / 1000)); $('#timerVal').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  tick(); tInt = setInterval(tick, 1000);
}

// ---------- камера
const SCREEN_T = new THREE.Vector3(0, SCREEN.y - 0.8, SCREEN.z);
let mode = 'map', viewUnit = null, anim = null;
const eye = new THREE.Vector3();
let yaw = 0, pitch = 0, vYaw = 0, vPitch = 0, touched = false, arriveT = 0;
// угол обзора в 3D: по горизонтали ~60°, чтобы экран целиком помещался в вертикальный кадр
function povFov() {
  const a = povR.w / povR.h;
  const v = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(60) / 2) / a);
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(v), 46, 84);
}
// камера встаёт в выбранное кресло; если рядом выбраны соседние места того же ряда (одна компания) – посередине между ними
function eyeOf(u) {
  let grp = [u];
  if (selected.has(u.id)) {
    const row = units.filter((s) => s.row === u.row);
    let a = u.idx, b = u.idx;
    while (row[a - 1] && selected.has(row[a - 1].id)) a--;
    while (row[b + 1] && selected.has(row[b + 1].id)) b++;
    grp = row.slice(a, b + 1);
  }
  const x = grp.reduce((s, g) => s + g.x, 0) / grp.length;
  return new THREE.Vector3(x, u.floor + 1.16, u.z + 0.1);
}
// какое место показать по общей кнопке «Посмотреть»: последнее выбранное
const lastPicked = () => { const ids = [...selected]; return ids.length ? byId.get(ids[ids.length - 1]) : null; };
const FLY_SEAT = new THREE.Vector3(), FLY_C = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), tgt = new THREE.Vector3(), upv = new THREE.Vector3();
// тот же полёт, что на десктопе: снижение по экспоненте, взгляд – центр зала → кресло → экран
function flightPose(w) {
  if (w <= 0.0005) { applyTop(); morph(0); return; }
  const t = ease(w), u = 1 - t;
  FLY_C.set(eye.x, 0, Math.min(eye.z + 4, 21.5));
  const x = u * u * top.pos.x + 2 * u * t * FLY_C.x + t * t * eye.x;
  const z = u * u * top.pos.z + 2 * u * t * FLY_C.z + t * t * eye.z;
  const y = Math.exp(lerp(Math.log(top.pos.y), Math.log(eye.y), t));
  FLY_SEAT.set(eye.x, eye.y - 1.1, eye.z - 0.6);
  tgt.lerpVectors(top.target, FLY_SEAT, ss(0, 0.5, w)).lerp(SCREEN_T, ss(0.3, 0.97, w));
  upv.set(0, 0, -1).lerp(UP, ss(0.12, 0.75, w)).normalize();
  setFrame(lerpR(mapR, povR, ss(0.2, 0.85, w)));
  cam.position.set(x, y, z); cam.up.copy(upv); cam.lookAt(tgt);
  cam.fov = lerp(TOP_FOV, povFov(), ss(0.1, 0.9, t));
  cam.updateProjectionMatrix();
  morph(w);
}
function povPose() {
  const d = v3.subVectors(SCREEN_T, eye).normalize();
  const by = Math.atan2(d.x, -d.z), bp = Math.asin(d.y);
  const Y = by + yaw + gy.yaw, P = THREE.MathUtils.clamp(bp + pitch + gy.pitch, -0.95, 0.75);
  setFrame(povR);
  cam.position.copy(eye); cam.up.set(0, 1, 0);
  cam.lookAt(eye.x + Math.sin(Y) * Math.cos(P), eye.y + Math.sin(P), eye.z - Math.cos(Y) * Math.cos(P));
  cam.fov = povFov(); cam.updateProjectionMatrix();
}
function morph(t) { S.setMorph(ss(0.1, 0.75, t)); }
function animate(dur, fn, done) {
  let t0 = null;   // отсчёт от первого кадра: время берём только из requestAnimationFrame
  anim = { tick(now) { if (t0 === null) t0 = now; const t = Math.min(1, (now - t0) / dur); fn(t); if (t >= 1) { anim = null; done && done(); } } };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = document.body;

const FLY_MS = 2500, EXPAND_AT = 0.36;
async function openPreview(u) {
  if (mode !== 'map' || !u) return;
  mode = 'enter'; viewUnit = u;
  eye.copy(eyeOf(u));
  yaw = pitch = vYaw = vPitch = 0; touched = false; gy.base = null; gy.yaw = gy.pitch = 0;
  computeTop(); applyTop(); morph(0);
  B.classList.add('in3d', 'gl-on');
  await wait(400);
  B.classList.add('map-off');
  await wait(300);
  setTimeout(() => { if (mode === 'enter') { B.classList.add('expanded'); clip(true); } }, FLY_MS * EXPAND_AT);
  animate(FLY_MS, flightPose, () => { mode = 'pov'; arriveT = lastNow; B.classList.add('pov'); updatePovUI(); });
}
async function closePreview() {
  if (mode !== 'pov') return;
  mode = 'leave';
  B.classList.remove('pov');
  const y0 = yaw + gy.yaw, p0 = pitch + gy.pitch;
  gyroStop();
  yaw = y0; pitch = p0;
  await new Promise((r) => animate(350, (t) => { yaw = lerp(y0, 0, ease(t)); pitch = lerp(p0, 0, ease(t)); povPose(); }, r));
  setTimeout(() => { B.classList.remove('expanded'); clip(false); }, 2200 * 0.3);
  await new Promise((r) => animate(2200, (t) => flightPose(1 - t), r));
  applyTop(); morph(0);
  B.classList.remove('map-off');
  await wait(380);
  B.classList.remove('gl-on', 'in3d');
  await wait(300);
  mode = 'map';
}
function hop(u) {
  if (mode !== 'pov' || u === viewUnit) return;
  mode = 'hop';
  const from = eye.clone(), y0 = yaw, p0 = pitch;
  viewUnit = u;
  const to = eyeOf(u);
  animate(1200, (t) => {
    const e = ease(t);
    eye.lerpVectors(from, to, e); eye.y += Math.sin(Math.PI * e) * 1.0;
    yaw = lerp(y0, 0, e); pitch = lerp(p0, 0, e);
    povPose();
  }, () => { eye.copy(to); mode = 'pov'; updatePovUI(); });
  updatePovUI();
}

// ---------- оверлей 3D
function updatePovUI() {
  if (!viewUnit) return;
  const u = viewUnit, mine = selected.has(u.id);
  $('#povSeat').textContent = `Ряд ${u.row}, ${seatLabel(u)}`;
  $('#povType').textContent = `${TYPE_NAME[u.type]}, ${fmt(PRICES[u.type])}`;
  const st = $('#povState');
  st.className = 'state ' + (mine ? 'o' : u.status === 'free' ? 'v' : 'g');
  st.textContent = mine ? 'Выбрано' : u.status === 'free' ? 'Свободно' : 'Занято';
  const act = $('#povAction');
  if (mine) { act.textContent = 'В корзину'; act.disabled = false; act.dataset.a = 'pay'; }
  else if (u.status === 'free') { act.textContent = 'Выбрать место'; act.disabled = false; act.dataset.a = 'pick'; }
  else { act.textContent = 'Место занято'; act.disabled = true; act.dataset.a = ''; }
  renderMini();
  renderMine();
}
// «Ваши места» в 3D: переключение между выбранными местами, если их несколько
function renderMine() {
  const box = $('#mySeats'), items = sel();
  box.classList.toggle('on', items.length > 1);
  box.innerHTML = items.length > 1 ? items.map((u) => `<button class="ms${viewUnit && viewUnit.id === u.id ? ' cur' : ''}" data-id="${u.id}">Ряд ${u.row}, место ${u.seats[0]}</button>`).join('') : '';
  box.querySelectorAll('.ms').forEach((b) => b.addEventListener('click', () => hop(byId.get(b.dataset.id))));
}
$('#povAction').addEventListener('click', (e) => {
  const a = e.currentTarget.dataset.a;
  if (a === 'pick') { selected.add(viewUnit.id); syncSeats(); if (navigator.vibrate) navigator.vibrate(8); }
  else if (a === 'pay') toast();
});
const mini = $('#mini');
function renderMini() {
  if (!mapRects.size) return;
  // границы – по креслам; экран рисуем полосой над первым рядом, без пустого прохода до него
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  mapRects.forEach((r) => { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
  const sr = screenRect;
  x0 = Math.min(x0, sr.x); x1 = Math.max(x1, sr.x + sr.w);
  const GAP = 16, Wm = W - 16 - 28, Hm = 150, k = Math.min(Wm / (x1 - x0), (Hm - GAP) / (y1 - y0));
  const ox = (Wm - (x1 - x0) * k) / 2, oy = GAP + (Hm - GAP - (y1 - y0) * k) / 2;
  mini.style.height = Hm + 'px';
  mini.innerHTML = `<div class="mscreen" style="left:${ox + (sr.x - x0) * k}px;top:${oy - GAP + 2}px;width:${sr.w * k}px"></div>` + units.map((u) => {
    const r = mapRects.get(u.id);
    const c = selected.has(u.id) ? 'o' : u.status === 'free' ? 'v' : 'g';
    const cur = viewUnit && viewUnit.id === u.id ? ' cur' : '';
    return `<button class="m ${c}${cur}" data-id="${u.id}" style="left:${ox + (r.x - x0) * k + 1}px;top:${oy + (r.y - y0) * k + 1}px;width:${r.w * k - 2}px;height:${r.h * k - 2}px"></button>`;
  }).join('');
  mini.querySelectorAll('.m').forEach((b) => b.addEventListener('click', () => hop(byId.get(b.dataset.id))));
}

// ---------- осмотреться: палец
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'pov') return;
  drag = { x: e.clientX, y: e.clientY }; touched = true; B.classList.add('touched');
  try { canvas.setPointerCapture(e.pointerId); } catch {}
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = (e.clientX - drag.x) / scale, dy = (e.clientY - drag.y) / scale;
  drag = { x: e.clientX, y: e.clientY };
  vYaw = -dx * 0.0042; vPitch = dy * 0.0034;
  yaw += vYaw; pitch += vPitch; clampLook();
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function clampLook() {
  yaw = THREE.MathUtils.clamp(yaw, -1.35 - gy.yaw, 1.35 - gy.yaw);
  pitch = THREE.MathUtils.clamp(pitch, -0.45 - gy.pitch, 0.5 - gy.pitch);
}

// ---------- осмотреться: наклон телефона
const gy = { on: false, base: null, yaw: 0, pitch: 0, ty: 0, tp: 0, ok: 'DeviceOrientationEvent' in window };
function onOrient(e) {
  if (e.alpha == null) return;
  if (!gy.live) { gy.live = true; $('#hintTx').textContent = 'Наклоните телефон или потяните'; $('#hintIc').innerHTML = '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M3 9.5c-1 1.6-1 3.4 0 5M21 9.5c1 1.6 1 3.4 0 5"/>'; }
  if (!gy.base) gy.base = { a: e.alpha, b: e.beta };
  let da = e.alpha - gy.base.a; if (da > 180) da -= 360; if (da < -180) da += 360;
  gy.ty = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(da), -1.35, 1.35);
  gy.tp = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(e.beta - gy.base.b), -0.45, 0.5);
  if (!touched && mode === 'pov' && (Math.abs(da) > 3 || Math.abs(e.beta - gy.base.b) > 3)) { touched = true; B.classList.add('touched'); }
}
// без запроса разрешений: где датчик доступен сразу (Android), вид поворачивается за телефоном;
// где нужен запрос (iPhone), остаётся только палец
function gyroStart() {
  if (!gy.ok || typeof DeviceOrientationEvent.requestPermission === 'function') return;
  gy.on = true; gy.base = null;
  addEventListener('deviceorientation', onOrient);
}
function gyroStop() {
  gy.on = false; removeEventListener('deviceorientation', onOrient);
  gy.yaw = gy.pitch = gy.ty = gy.tp = 0;
}

$('#preview').addEventListener('click', () => {
  if (!DESK) gyroStart();
  openPreview(lastPicked());
});
$('#back').addEventListener('click', closePreview);
$('#toMap').addEventListener('click', closePreview);
$('#pay').addEventListener('click', toast);
function toast() { const t = $('#toast'); t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200); }

// ---------- цикл
let lastScreen = 0;
let lastNow = 0;
function loop(now) {
  requestAnimationFrame(loop);
  lastNow = now;
  if (anim) anim.tick(now);
  if (mode === 'pov') {
    if (gy.on) { gy.yaw += (gy.ty - gy.yaw) * 0.18; gy.pitch += (gy.tp - gy.pitch) * 0.18; }
    if (!drag) { yaw += vYaw; pitch += vPitch; vYaw *= 0.9; vPitch *= 0.9; clampLook(); }
    if (!touched) {   // подсказка: камера сама «оглядывается»
      const t = (now - arriveT) / 1000;
      if (t > 0.6 && t < 6.6) yaw = Math.sin((t - 0.6) / 6 * Math.PI * 2) * 0.38 * Math.sin((t - 0.6) / 6 * Math.PI);
    }
    povPose();
  }
  if (mode === 'map' && !B.classList.contains('gl-on')) return;
  if (now - lastScreen > 40) { S.drawScreen(now); lastScreen = now; }
  S.updateCeiling(cam.position.y);
  S.composer.render();
}

// отладка для автотестов
window.__dbg = {
  fly(w) {   // кадр полёта w (0…1) с тем же расписанием раскрытия, что в openPreview
    mode = 'debug'; computeTop(); viewUnit = lastPicked(); eye.copy(eyeOf(viewUnit));
    B.classList.add('in3d', 'gl-on', 'map-off');
    canvas.style.transition = 'none';
    const k = ss(0, 1, (w * FLY_MS - FLY_MS * EXPAND_AT) / 900);
    const r = lerpR(mapR, { x: 0, y: 0, w: W, h: H }, k), rad = 20 * (1 - k);
    canvas.style.clipPath = `inset(${r.y}px ${W - r.x - r.w}px ${H - r.y - r.h}px ${r.x}px round ${rad}px)`;
    flightPose(w); S.drawScreen(0); S.updateCeiling(cam.position.y); S.composer.render();
  },
  pov(y, p) { viewUnit = lastPicked(); eye.copy(eyeOf(viewUnit)); mode = 'pov'; yaw = y; pitch = p; touched = true; B.classList.add('in3d', 'gl-on', 'map-off', 'expanded', 'pov', 'touched'); clip(true, true); updatePovUI(); },
};

// ---------- старт
document.fonts.ready.then(() => {
  layout(); buildMap();
  addEventListener('resize', () => { if (mode !== 'map') return; layout(); buildMap(); });
  morph(0); S.drawScreen(0); S.updateCeiling(cam.position.y); S.composer.render();   // прогрев шейдеров
  eye.copy(eyeOf(sel()[0] || units[0])); flightPose(1); S.composer.render();
  applyTop(); morph(0);
  $('#hintTx').textContent = 'Потяните, чтобы осмотреться';   // про наклон – когда датчик ответил
  requestAnimationFrame(loop);
  B.classList.add('ready');
});
