import * as THREE from 'three';
import { buildUnits, PRICES, TYPE_NAME, seatLabel, fmt } from './data.js';
import { createScene, SCREEN } from './scene.js';

const $ = (s, r = document) => r.querySelector(s);
const units = buildUnits();
const byId = new Map(units.map((u) => [u.id, u]));
const selected = new Set();   // по умолчанию ничего не выбрано: место выбирает сам зритель

// ---------- масштаб артборда 2560×1290
const ART_W = 2560, ART_H = 1290;
let artScale = 1;
function fit() {
  artScale = Math.min(innerWidth / ART_W, innerHeight / ART_H);
  const art = $('#art');
  art.style.transform = `translate(${(innerWidth - ART_W * artScale) / 2}px, ${(innerHeight - ART_H * artScale) / 2}px) scale(${artScale})`;
  resize();
}

// ---------- 3D
const stage = $('#stage');
const canvas = $('#gl');
const S = createScene(canvas, units);
const cam = S.camera;
let stageW = 1260, stageH = 962;
const CANVAS_W = 2080; // холст всегда шириной развёрнутой сцены, видимая часть задаётся view offset
let viewW = 0;
function resize() {
  stageH = stage.offsetHeight;
  if (mode === 'map') stageW = stage.offsetWidth;
  const prq = +new URLSearchParams(location.search).get('pr');   // ?pr=2 – чёткость холста для записи ролика
  const pr = (prq || Math.min(devicePixelRatio || 1, 1.75)) * artScale;
  S.setSize(CANVAS_W, stageH, pr);
  viewW = 0; setView(stage.offsetWidth);
}
function setView(w) {
  if (w === viewW) return;
  viewW = w;
  cam.aspect = w / stageH;
  cam.setViewOffset(w, stageH, 0, 0, CANVAS_W, stageH);
}

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

// поза «сверху»: подгоняем зал в прямоугольник сцены
const MAP_PAD = { l: 110, r: 110, t: 96, b: 96 };
const TOP_FOV = 18;
let top = null;
function computeTop() {
  let minX = Infinity, maxX = -Infinity, maxZ = -Infinity;
  units.forEach((u) => { minX = Math.min(minX, u.x - u.width / 2); maxX = Math.max(maxX, u.x + u.width / 2); maxZ = Math.max(maxZ, u.z + 0.45); });
  minX = Math.min(minX, -SCREEN.w / 2); maxX = Math.max(maxX, SCREEN.w / 2);
  const minZ = SCREEN.z;
  const pw = stageW - MAP_PAD.l - MAP_PAD.r, ph = stageH - MAP_PAD.t - MAP_PAD.b;
  const s = Math.min(pw / (maxX - minX), ph / (maxZ - minZ));
  const pcx = MAP_PAD.l + pw / 2, pcy = MAP_PAD.t + ph / 2;
  const wcx = (minX + maxX) / 2, wcz = (minZ + maxZ) / 2;
  const yp = 1.6;
  const H = yp + (stageH / s) / 2 / Math.tan(THREE.MathUtils.degToRad(TOP_FOV / 2));
  const cx = wcx - (pcx - stageW / 2) / s;
  const cz = wcz - (pcy - stageH / 2) / s;
  top = { pos: new THREE.Vector3(cx, H, cz), target: new THREE.Vector3(cx, 0, cz), fov: TOP_FOV, aspect: stageW / stageH };
}
function applyTop() {
  viewW = 0; setView(stageW);
  cam.fov = top.fov; cam.updateProjectionMatrix();
  cam.position.copy(top.pos); cam.up.set(0, 0, -1); cam.lookAt(top.target);
  cam.updateMatrixWorld();
}
const v3 = new THREE.Vector3();
function project(x, y, z) {
  v3.set(x, y, z).project(cam);
  return [(v3.x + 1) / 2 * CANVAS_W, (1 - v3.y) / 2 * stageH];
}

// ---------- 2D-схема (проекция 3D-зала сверху)
const map = $('#map');
const seatEls = new Map();
const mapRects = new Map();
let screenRect = null;
function seatSVG(u) {
  const n = u.seats.length;
  const W = n === 2 ? 64 : 34, H = 36;
  const aw = 5, inner = W - aw * 2 - 2, cw = (inner - (n - 1) * 2) / n;
  let cush = '';
  for (let i = 0; i < n; i++) {
    const x = aw + 1 + i * (cw + 2);
    cush += `<rect class="c" x="${x}" y="3" width="${cw}" height="17" rx="4"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <rect class="b" x="2" y="12" width="${W - 4}" height="22" rx="4"/>
    ${cush}
    <rect class="a" x="0.5" y="10" width="${aw}" height="25" rx="2.5"/>
    <rect class="a" x="${W - aw - 0.5}" y="10" width="${aw}" height="25" rx="2.5"/>
    <rect class="s" x="${aw + 1}" y="20" width="${inner}" height="12" rx="3"/>
  </svg>`;
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
      el.innerHTML = seatSVG(u) + `<span class="num">${u.seats[0]}</span>`;   // номер – HTML, чтобы не растягивался вместе с иконкой
      el.dataset.id = u.id;
      el.addEventListener('click', () => toggle(u));
      el.addEventListener('mouseenter', () => showTip(u, el));
      el.addEventListener('mouseleave', hideTip);
      seatEls.set(u.id, el);
    }
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    el.style.fontSize = Math.round(r.h * 0.66) + 'px';   // номер места крупно, по центру иконки
    map.appendChild(el);
  });
  // номера рядов
  for (let row = 1; row <= 11; row++) {
    const rs = units.filter((u) => u.row === row);
    const a = mapRects.get(rs[0].id), b = mapRects.get(rs[rs.length - 1].id);
    [[a.x - 46, a.y + a.h / 2], [b.x + b.w + 14, b.y + b.h / 2]].forEach(([x, y]) => {
      const l = document.createElement('div');
      l.className = 'rowlbl'; l.textContent = row;
      l.style.left = x + 'px'; l.style.top = y - 16 + 'px';
      map.appendChild(l);
    });
  }
  // экран
  const [x1, y1] = project(-SCREEN.w / 2, 0.6, SCREEN.z);
  const [x2] = project(SCREEN.w / 2, 0.6, SCREEN.z);
  const scr = $('#screenArc');
  Object.assign(scr.style, { left: x1 + 'px', top: y1 - 34 + 'px', width: x2 - x1 + 'px' });
  screenRect = { x: x1, y: y1 - 4, w: x2 - x1, h: 4 };
  syncSeats();
}

function syncSeats() {
  seatEls.forEach((el, id) => el.classList.toggle('yours', selected.has(id)));
  units.forEach((u) => S.setSeatState(u.id, selected.has(u.id) ? 'yours' : u.status));
  renderAside();
  renderMini();
  updatePovUI();
}

function toggle(u) {
  if (u.status !== 'free') { pulse(seatEls.get(u.id)); return; }
  if (selected.has(u.id)) selected.delete(u.id);
  else { if (selected.size >= 8) return; selected.add(u.id); }
  syncSeats();
  showTip(u, seatEls.get(u.id));
}
function pulse(el) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); }

// ---------- подсказка
const tip = $('#tip');
function showTip(u, el) {
  if (mode !== 'map') return;
  const r = mapRects.get(u.id);
  const st = selected.has(u.id) ? '<i class="dot o"></i>Выбрано' : u.status === 'free' ? '<i class="dot v"></i>Свободно' : '<i class="dot g"></i>Занято';
  tip.innerHTML = `<b>Ряд ${u.row}, ${seatLabel(u)}</b><span>${TYPE_NAME[u.type]}, ${fmt(PRICES[u.type])}</span><em>${st}</em>`;
  tip.style.left = r.x + r.w / 2 + 'px';
  tip.style.top = r.y - 12 + 'px';
  tip.classList.add('on');
}
function hideTip() { tip.classList.remove('on'); }

// ---------- правая колонка
function sel() { return [...selected].map((id) => byId.get(id)).sort((a, b) => a.row - b.row || a.idx - b.idx); }
function total() { return sel().reduce((s, u) => s + PRICES[u.type], 0); }
const CHEV = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
function renderAside() {
  const list = $('#picked');
  const items = sel();
  list.innerHTML = items.length ? items.map((u) => `
    <div class="tk">
      <span class="pico ${u.type}">${seatSVG(u)}</span>
      <div class="tcat"><div><b>Стандартный</b><small>${TYPE_NAME[u.type]}</small></div>${CHEV}</div>
      <div class="tcell"><b>${u.row}</b><small>ряд</small></div>
      <div class="tcell"><b>${u.seats[0]}</b><small>место</small></div>
      <div class="tcell price"><b>${PRICES[u.type].toFixed(2).replace('.', ',')}</b><small>BYN</small></div>
      <button class="tview" data-id="${u.id}" aria-label="Вид с этого места" title="Вид с этого места">${ICON.cube}</button>
      <button class="prm" data-id="${u.id}" aria-label="Убрать">${ICON.x}</button>
    </div>`).join('') : `<div class="empty">Выберите места на схеме</div>`;
  list.querySelectorAll('.prm').forEach((b) => b.addEventListener('click', () => { selected.delete(b.dataset.id); syncSeats(); }));
  list.querySelectorAll('.tview').forEach((b) => b.addEventListener('click', () => openPreview(byId.get(b.dataset.id))));
  $('#total').textContent = fmt(total());
  $('#pay').disabled = !items.length;
  $('#preview').disabled = !items.length;
  const rows = new Set(items.map((u) => u.row));
  map.querySelectorAll('.rowlbl').forEach((l) => l.classList.toggle('on', rows.has(+l.textContent)));
  timer(items.length > 0);
}
// таймер брони, как на mooon.by: 5 минут с первого выбранного места
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
const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'место' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'места' : 'мест');

// ---------- камера: полёт сверху в кресло
const SCREEN_T = new THREE.Vector3(0, SCREEN.y - 0.8, SCREEN.z);
const POV_FOV = 46;
let mode = 'map';
let viewUnit = null;
let eye = new THREE.Vector3();
let yaw = 0, pitch = 0, vYaw = 0, vPitch = 0, touched = false, arriveT = 0;
let anim = null;

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
const tmp = { p: new THREE.Vector3(), t: new THREE.Vector3(), up: new THREE.Vector3() };
function bez(p0, c1, c2, p3, t, out) {
  const u = 1 - t;
  return out.set(0, 0, 0)
    .addScaledVector(p0, u * u * u).addScaledVector(c1, 3 * u * u * t)
    .addScaledVector(c2, 3 * u * t * t).addScaledVector(p3, t * t * t);
}
// Полёт. Камера снижается по экспоненте (ровный «наезд» без рывка в конце), по плану идёт
// по дуге через точку над рядом позади кресла. Взгляд сначала переходит с центра зала
// на выбранное кресло (оно всё время в кадре), потом поднимается на экран.
const FLY_SEAT = new THREE.Vector3(), FLY_C = new THREE.Vector3();
function flightPose(w) {   // w – доля времени полёта 0…1
  if (w <= 0.0005) { applyTop(); morph(0); return; }
  const t = ease(w), u = 1 - t;   // путь – по ease, поворот взгляда – по времени: без резкого разворота в середине
  FLY_C.set(eye.x, 0, Math.min(eye.z + 4, 21.5));
  const x = u * u * top.pos.x + 2 * u * t * FLY_C.x + t * t * eye.x;
  const z = u * u * top.pos.z + 2 * u * t * FLY_C.z + t * t * eye.z;
  const y = Math.exp(lerp(Math.log(top.pos.y), Math.log(eye.y), t));
  FLY_SEAT.set(eye.x, eye.y - 1.1, eye.z - 0.6);
  tmp.t.lerpVectors(top.target, FLY_SEAT, ss(0, 0.5, w)).lerp(SCREEN_T, ss(0.3, 0.97, w));
  tmp.up.set(0, 0, -1).lerp(new THREE.Vector3(0, 1, 0), ss(0.12, 0.75, w)).normalize();
  cam.position.set(x, y, z);
  cam.up.copy(tmp.up);
  cam.lookAt(tmp.t);
  cam.fov = lerp(TOP_FOV, POV_FOV, ss(0.1, 0.9, t));
  cam.updateProjectionMatrix();
  morph(w);
}
function povPose() {
  const d = new THREE.Vector3().subVectors(SCREEN_T, eye).normalize();
  const by = Math.atan2(d.x, -d.z), bp = Math.asin(d.y);
  const Y = by + yaw, P = THREE.MathUtils.clamp(bp + pitch, -0.9, 0.7);
  const dir = new THREE.Vector3(Math.sin(Y) * Math.cos(P), Math.sin(P), -Math.cos(Y) * Math.cos(P));
  cam.position.copy(eye);
  cam.up.set(0, 1, 0);
  cam.lookAt(v3.copy(eye).add(dir));
  cam.fov = POV_FOV; cam.updateProjectionMatrix();
}
function morph(t) {
  S.setMorph(ss(0.1, 0.75, t));   // цвета схемы уходят в материалы зала растянуто, без вспышки в середине полёта
}

function animate(dur, fn, done) {
  let t0 = null;   // отсчёт от первого кадра: время берём только из requestAnimationFrame
  anim = { tick(now) { if (t0 === null) t0 = now; const t = Math.min(1, (now - t0) / dur); fn(t); if (t >= 1) { anim = null; done && done(); } } };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const FLY_MS = 2900, EXPAND_AT = 0.4;
async function openPreview(u) {
  if (mode !== 'map' || !u) return;
  hideTip();
  mode = 'enter';
  viewUnit = u;
  eye.copy(eyeOf(u));
  yaw = pitch = vYaw = vPitch = 0; touched = false;
  computeTop(); applyTop(); morph(0);
  document.body.classList.add('in3d');
  stage.classList.add('gl-on');          // 3D проявляется под схемой
  await wait(450);
  stage.classList.add('map-off');        // схема растворяется, под ней тот же зал в 3D
  await wait(380);
  // сцена расширяется, когда камера уже ниже стен: пустоты за залом не видно
  setTimeout(() => { if (mode === 'enter') stage.classList.add('expanded'); }, FLY_MS * EXPAND_AT);
  animate(FLY_MS, (t) => flightPose(t), () => {
    mode = 'pov'; arriveT = lastNow;
    stage.classList.add('pov');
    updatePovUI();
  });
}

async function closePreview() {
  if (mode !== 'pov') return;
  mode = 'leave';
  stage.classList.remove('pov');
  const y0 = yaw, p0 = pitch;
  await new Promise((r) => animate(380, (t) => { yaw = lerp(y0, 0, ease(t)); pitch = lerp(p0, 0, ease(t)); povPose(); }, r));
  setTimeout(() => stage.classList.remove('expanded'), 2400 * 0.12);
  await new Promise((r) => animate(2400, (t) => flightPose(1 - t), r));
  applyTop(); morph(0);
  stage.classList.remove('map-off');
  await wait(380);
  stage.classList.remove('gl-on');
  document.body.classList.remove('in3d');
  await wait(300);
  mode = 'map';
}

function hop(u) {
  if (mode !== 'pov' || u === viewUnit) return;
  mode = 'hop';
  const from = cam.position.clone(), y0 = yaw, p0 = pitch;
  viewUnit = u;
  const to = eyeOf(u);
  animate(1300, (t) => {
    const e = ease(t);
    eye.lerpVectors(from, to, e); eye.y += Math.sin(Math.PI * e) * 1.2;
    yaw = lerp(y0, 0, e); pitch = lerp(p0, 0, e);
    povPose();
  }, () => { eye.copy(to); mode = 'pov'; updatePovUI(); });
  updatePovUI();
}

// ---------- 3D-оверлей
function updatePovUI() {
  if (!viewUnit) return;
  const u = viewUnit;
  const mine = selected.has(u.id);
  $('#povSeat').textContent = `Ряд ${u.row}, ${seatLabel(u)}`;
  $('#povType').textContent = `${TYPE_NAME[u.type]}, ${fmt(PRICES[u.type])}`;
  const st = $('#povState');
  st.className = 'state ' + (mine ? 'o' : u.status === 'free' ? 'v' : 'g');
  st.textContent = mine ? 'Выбрано' : u.status === 'free' ? 'Свободно' : 'Занято';
  const act = $('#povAction');
  if (mine) { act.innerHTML = 'В корзину'; act.disabled = false; act.dataset.a = 'pay'; }
  else if (u.status === 'free') { act.innerHTML = 'Выбрать место'; act.disabled = false; act.dataset.a = 'pick'; }
  else { act.innerHTML = 'Место занято'; act.disabled = true; act.dataset.a = ''; }
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
  if (a === 'pick') { selected.add(viewUnit.id); syncSeats(); }
  else if (a === 'pay') payToast();
});

// мини-схема «Пересесть»
const mini = $('#mini');
function renderMini() {
  if (!mapRects.size) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  [...mapRects.values(), screenRect].forEach((r) => { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
  const W = 340, H = 230, k = Math.min(W / (x1 - x0), H / (y1 - y0));
  const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
  const sr = screenRect;
  mini.innerHTML = `<div class="mscreen" style="left:${ox + (sr.x - x0) * k}px;top:${oy + (sr.y - y0) * k}px;width:${sr.w * k}px"></div>` + units.map((u) => {
    const r = mapRects.get(u.id);
    const c = selected.has(u.id) ? 'o' : u.status === 'free' ? 'v' : 'g';
    const cur = viewUnit && viewUnit.id === u.id ? ' cur' : '';
    return `<button class="m ${c}${cur}" data-id="${u.id}" style="left:${ox + (r.x - x0) * k + 1}px;top:${oy + (r.y - y0) * k + 1}px;width:${r.w * k - 2}px;height:${r.h * k - 2}px"></button>`;
  }).join('');
  mini.querySelectorAll('.m').forEach((b) => b.addEventListener('click', () => hop(byId.get(b.dataset.id))));
}

// осмотреться: drag
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'pov') return;
  drag = { x: e.clientX, y: e.clientY }; touched = true;
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  stage.classList.add('grabbing', 'touched');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = (e.clientX - drag.x) / artScale, dy = (e.clientY - drag.y) / artScale;
  drag = { x: e.clientX, y: e.clientY };
  vYaw = -dx * 0.0022; vPitch = dy * 0.0018;
  yaw += vYaw; pitch += vPitch; clampLook();
});
const endDrag = () => { drag = null; stage.classList.remove('grabbing'); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
function clampLook() { yaw = THREE.MathUtils.clamp(yaw, -1.35, 1.35); pitch = THREE.MathUtils.clamp(pitch, -0.45, 0.5); }

$('#preview').addEventListener('click', () => openPreview(lastPicked()));
$('#back').addEventListener('click', closePreview);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closePreview(); });
$('#pay').addEventListener('click', payToast);
function payToast() {
  const t = $('#toast'); t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200);
}

// ---------- цикл
let lastScreen = 0;
let lastNow = 0;
function loop(now) {
  requestAnimationFrame(loop);
  lastNow = now;
  setView(stage.offsetWidth);
  if (anim) anim.tick(now);
  if (mode === 'pov') {
    if (!drag) { yaw += vYaw; pitch += vPitch; vYaw *= 0.92; vPitch *= 0.92; clampLook(); }
    if (!touched) { // подсказка: камера сама «оглядывается»
      const t = (now - arriveT) / 1000;
      if (t > 0.6 && t < 6.6) yaw = Math.sin((t - 0.6) / 6 * Math.PI * 2) * 0.42 * Math.sin((t - 0.6) / 6 * Math.PI);
    }
    povPose();
  }
  if (mode === 'map' && !stage.classList.contains('gl-on')) return;
  if (now - lastScreen > 33) { S.drawScreen(now); lastScreen = now; }
  S.updateCeiling(cam.position.y);
  S.composer.render();
}

// ---------- снег в шапке
function heroSnow() {
  const c = $('#snow'), x = c.getContext('2d');
  const fl = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, r: 0.6 + Math.random() * 2.4, v: 0.15 + Math.random() * 0.6, d: Math.random() * 6 }));
  (function f(t) {
    requestAnimationFrame(f);
    if (mode === 'pov') return;
    x.clearRect(0, 0, c.width, c.height);
    fl.forEach((p) => {
      p.y += p.v; if (p.y > c.height) { p.y = -4; p.x = Math.random() * c.width; }
      x.globalAlpha = 0.15 + p.r / 5; x.fillStyle = '#fff';
      x.beginPath(); x.arc(p.x + Math.sin(t / 1400 + p.d) * 8, p.y, p.r, 0, 7); x.fill();
    });
  })(0);
}

const ICON = {
  x: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>',
};

// отладка для автотестов
window.__dbg = {
  pose(t) { computeTop(); viewUnit = lastPicked(); eye.copy(eyeOf(viewUnit)); stage.classList.add('gl-on'); flightPose(t); S.drawScreen(0); S.updateCeiling(cam.position.y); S.composer.render(); },
  cam(x, y, z, tx, ty, tz) { mode = 'debug'; stage.classList.add('gl-on', 'map-off', 'expanded'); cam.position.set(x, y, z); cam.up.set(0, 1, 0); cam.lookAt(tx, ty, tz); cam.fov = 46; cam.updateProjectionMatrix(); S.setMorph(1); S.updateCeiling(y); S.composer.render(); },
  pov(y, p) { mode = 'pov'; yaw = y; pitch = p; touched = true; stage.classList.add('gl-on', 'map-off', 'expanded', 'pov', 'touched'); document.body.classList.add('in3d'); updatePovUI(); },
};

// ---------- старт
document.fonts.ready.then(() => {
  fit();
  addEventListener('resize', () => { fit(); if (mode === 'map') buildMap(); });
  resize();
  buildMap();
  // прогрев шейдеров, чтобы первый переход не подвисал
  morph(0); S.drawScreen(0); S.updateCeiling(cam.position.y); S.composer.render();
  eye.copy(eyeOf(sel()[0] || units[0])); flightPose(1); S.composer.render();
  applyTop(); morph(0);
  heroSnow();
  requestAnimationFrame(loop);
  document.body.classList.add('ready');
});

$('#tiS').innerHTML = seatSVG({ seats: [1], type: 'single' });
$('#tiF').innerHTML = seatSVG({ seats: [1, 2], type: 'sofa' });
