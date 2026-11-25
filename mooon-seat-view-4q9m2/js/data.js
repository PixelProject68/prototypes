// Реальная раскладка: mooon в ТРК Minsk City Mall, Зал 3 mooon+ (снято с mooon.by/hall)
// px-координаты из SVG-схемы сайта (ширина схемы 816px); занятость демонстрационная: центр зала свободен, чтобы посмотреть вид с центральных мест
const A = [[261,48],[314,25],[346,25],[376,48],[429,48],[482,48],[534,25],[567,25],[596,48]];
const B = [[261,48],[315,48],[367,25],[399,25],[429,48],[481,25],[514,25],[543,48],[596,48]];
const L = [172,48];
const S7 = [[261,48],[317,48],[373,48],[429,48],[484,48],[540,48],[596,48]];
const S6 = S7.slice(1);

export const PRICES = { single: 20, sofa: 46 };
export const TYPE_NAME = { single: 'Single', sofa: 'Sofa' };

const ROWS = [
  { units: A, st: 'FFFFTFFFF' },
  { units: B, st: 'FFTFFFFTF' },
  { units: A, st: 'TFFTFFFFT' },
  { units: B, st: 'FTFFFFTFF' },
  { units: A, st: 'TFFFFFFTF' },
  { units: B, st: 'FTFFFFFTF' },
  { units: [L, ...A], st: 'TTFFTFFFTF' },
  { units: B, st: 'FTFFFFFTF' },
  { units: [L, ...S7], st: 'FTFFFFTF' },
  { units: [L, ...S6], st: 'TTFFFTF' },
  { units: S6, st: 'TTFFTT' },
];

export const K = 0.03125;          // м на px схемы
export const CENTER_PX = 408;      // центр экрана на схеме
export const ROW_Z0 = 5.2;         // первый ряд, м от экрана
export const ROW_STEP = 1.12;

export function floorOf(r) { return r <= 2 ? 0 : (r - 2) * 0.36; }
export function rowZ(r) { return ROW_Z0 + (r - 1) * ROW_STEP; }

export function buildUnits() {
  const units = [];
  ROWS.forEach((row, ri) => {
    const r = ri + 1;
    let n = 1;
    row.units.forEach(([px, w], i) => {
      const type = w > 30 ? 'sofa' : 'single';
      const seats = [n];          // как на mooon.by: у дивана один номер места
      n += 1;
      units.push({
        id: `r${r}u${i}`, row: r, idx: i, type, px, w,
        status: row.st[i] === 'F' ? 'free' : 'taken',
        seats,
        x: (px + w / 2 - CENTER_PX) * K,
        z: rowZ(r),
        floor: floorOf(r),
        width: type === 'sofa' ? 1.5 : 0.78,
      });
    });
  });
  return units;
}

export function seatLabel(u) {
  return `место ${u.seats[0]}`;
}
export const fmt = (v) => v.toFixed(2).replace('.', ',') + ' BYN';
