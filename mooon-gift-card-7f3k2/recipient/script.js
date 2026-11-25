/* mooon, подарочная карта: шаг 3 «Получатель».
   Что внутри: степпер со сменой шага каплей (spPlay), форма получателя, «Сюрприз» (surSwap), тумблер «прислать PDF на почту» (selfSwap), проверка полей.
   Остальных шагов на странице нет: нажатие на цифру шага, «Далее» и «назад» на мобилке только переводят степпер – чтобы видеть его анимацию.
   Параметры ссылки: ?theme=dark; ?tl – ручной режим степпера (__sp.seek(мс), __sp.finish()). Клавиша T – тема. Выделено из общего прототипа. */
(() => {
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app'),
    frame = $('#frame'),
    next = $('#next');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const Q = new URLSearchParams(location.search);

  const FLOW = ['design', 'nominal', 'recipient', 'time', 'wish', 'pay'];
  const TITLES = ['Дизайн', 'Номинал', 'Получатель', 'Время', 'Пожелания', 'Оплата'];
  const AMOUNT = 100; // номинал, выбранный на шаге 2
  const USER_EMAIL = 'den@mail.by';
  /* step – текущий шаг (с нуля); pdf – «себе, PDF на почту»; consent, ads – галочки согласий */
  const S = {
    screen: 'recipient',
    step: 2,
    phone: '+375 29 314-52-08',
    from: '',
    surprise: false,
    pdf: false,
    email: USER_EMAIL,
    consent: false,
    ads: false
  };

  /* ── сцена: артборд 1440×900 (десктоп) или 390×H (мобилка, ≤820px) вписывается в окно масштабом --s ── */
  const MQ = matchMedia('(max-width:820px)');
  let M = null,
    W = 1440,
    H = 900,
    lastIW = 0;

  function fit() {
    const iw = innerWidth,
      ih = innerHeight,
      m = MQ.matches,
      ae = document.activeElement;
    if (m && M && iw === lastIW && ae && ae.matches && ae.matches('input,textarea')) return; // экранная клавиатура: раскладку не трогаем
    lastIW = iw;
    if (m) {
      const sc = Math.min(iw / 390, ih / 640);
      W = iw / sc;
      H = ih / sc;
      frame.style.setProperty('--s', sc);
      frame.style.setProperty('--W', W + 'px');
      frame.style.setProperty('--H', H + 'px');
      frame.style.setProperty('--dy', ((H + 36) / 2 - 130) + 'px');
      frame.style.setProperty('--hc', (H / 2) + 'px');
      frame.style.setProperty('--vo', Math.max(0, (H - 844) / 2) + 'px')
    } else {
      W = 1440;
      H = 900;
      frame.style.setProperty('--s', Math.min(iw / 1440, ih / 900));
      frame.style.setProperty('--hc', '450px')
    }
    const ch = m !== M;
    M = m;
    app.classList.toggle('m', m);
    app.classList.toggle('short', m && H < 720); // короткий экран (Safari с панелями)
    if (ch || m) refreshMode()
  }
  addEventListener('resize', fit);

  function refreshMode() {
    layout();
    updStep()
  }

  /* ── тема: светлая по умолчанию; клавиша T или ?theme=dark ── */
  const root = document.documentElement;

  function setTh(t) {
    root.dataset.theme = t
  }
  setTh(Q.get('theme') === 'dark' ? 'dark' : 'light');
  addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === 't' || e.key === 'е') setTh(root.dataset.theme === 'dark' ? 'light' : 'dark')
  });

  const phoneDigits = () => S.phone.replace(/\D/g, '').slice(3);
  const phoneOk = () => /^(25|29|33|44)\d{7}$/.test(phoneDigits());
  const mailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  function target() {
    if (M) {
      const SH = app.classList.contains('short');
      return {
        cx: SH ? 44 : 52,
        cy: SH ? 114 : 122,
        d: SH ? 56 : 72,
        op: 1
      }
    }
    return {
      cx: 325,
      cy: 415,
      d: 470,
      op: 1
    }
  }
  $('#badge').textContent = AMOUNT + ' BYN';

  /* ── диск с дизайном карты: один на всю страницу, переезжает между экранами (target → место и размер) ── */
  const CARD_SRC = 'img/card.webp';
  const disc = document.createElement('div');
  disc.className = 'it cur';
  disc.style.pointerEvents = 'none';
  disc.innerHTML = `<div class="tw"><div class="glow"><img alt="" src="${CARD_SRC}"></div><div class="face"><img alt="Дизайн карты" src="${CARD_SRC}" draggable="false"><i class="shine"></i></div></div>`;
  $('#items').appendChild(disc);
  /* 24.11 (Ден): карусель в перспективе. Точка схода – центр выбранного диска; соседние повёрнуты к центру (52° и 62°), чуть уходят вглубь, меньше с шагом ~0,69 (380 / 263 / 183) и под вуалью цвета фона (20 % и 50 %). cfS – где поставить центр, чтобы край u встал в точку T на экране; cfE – где на экране окажется край u; cfM – готовая матрица проекции (плоская: глубины после проекции нет, порядок слоёв задаёт z-index – так Safari не сортирует и не режет слои по глубине) */
  function cfM(px, py, X, Y, z, th, al, s, ox, oy, P) {
    const r = th * Math.PI / 180,
      k = Math.sin(r) / P,
      c = Math.cos(r),
      ca = Math.cos(al * Math.PI / 180),
      sa = Math.sin(al * Math.PI / 180),
      w0 = 1 - z / P,
      m11 = s * ca * (c + px * k),
      m12 = s * sa + s * ca * py * k,
      m14 = s * ca * k,
      m21 = -s * sa * (c + px * k),
      m22 = s * ca - s * sa * py * k,
      m24 = -s * sa * k,
      f = v => +v.toFixed(8);
    return `matrix3d(${f(m11)},${f(m12)},0,${f(m14)},${f(m21)},${f(m22)},0,${f(m24)},0,0,1,0,${f(px*w0+X-ox*m11-oy*m21)},${f(py*w0+Y-ox*m12-oy*m22)},0,${f(w0-ox*m14-oy*m24)})`
  }

  function cfS(T, th, z, u, P) {
    const r = th * Math.PI / 180;
    return T * (P - z + u * Math.sin(r)) / P - u * Math.cos(r)
  }

  function cfE(X, th, z, u, P) {
    const r = th * Math.PI / 180;
    return (X + u * Math.cos(r)) * P / (P - (z - u * Math.sin(r)))
  }
  const dF = () => M ? 250 * (typeof KD === 'number' ? KD : 1) / 380 : 1,
    dP = () => 1400 * dF(),
    dPX = () => M ? W / 2 : 720,
    dPY = () => M ? (typeof dCY === 'function' ? dCY() : 300) : 470; /* на отдельных страницах (success, gift, recipient) шага «Дизайн», KD и dCY нет */
  function dCF(r, vis) {
    const a = Math.abs(r),
      s = Math.sign(r),
      f = dF(),
      P = dP(),
      cx = dPX(),
      cy = dPY(),
      d0 = 380 * f;
    if (!a) return {
      cx,
      cy,
      d: d0,
      op: 1
    };
    const d1 = M ? 140 * KD : 263,
      d2 = M ? 105 * KD : 183,
      g1 = M ? 14 * KD : 20,
      g2 = M ? 12 * KD : 16,
      z1 = -60 * f,
      z2 = -120 * f,
      x1 = -cfS(-(d0 / 2) - g1, 52, z1, d1 / 2, P),
      x2 = -cfS(cfE(-x1, 52, z1, -d1 / 2, P) - g2, 62, z2, d2 / 2, P);
    if (a === 1) return {
      cx: cx + s * x1,
      cy,
      d: d1,
      ry: -s * 52,
      z: z1,
      dm: .2,
      op: vis
    };
    if (a === 2) return {
      cx: cx + s * x2,
      cy,
      d: d2,
      ry: -s * 62,
      z: z2,
      dm: .5,
      op: M ? 0 : vis
    };
    return {
      cx: cx + s * (x2 + d2),
      cy,
      d: d2 * .8,
      ry: -s * 66,
      z: z2 * 1.3,
      dm: .6,
      op: 0
    }
  }
  const put = (el, t, k = 1) => {
    const d = t.d * k,
      px = dPX(),
      py = dPY();
    el.style.transform = `scale3d(1,1,.0001) translate(${px}px,${py}px) perspective(${dP().toFixed(1)}px) translate3d(${(t.cx-px).toFixed(2)}px,${(t.cy-py).toFixed(2)}px,${(t.z||0).toFixed(1)}px) rotateY(${t.ry||0}deg) scale(${(d/380).toFixed(5)}) translate(-190px,-190px)`; /* диски едут CSS-переходом: запись по шагам, чтобы браузер вёл сдвиг, поворот и масштаб раздельно (готовую матрицу он интерполирует с перекосом); scale3d(1,1,.0001) сплющивает глубину */
    el.style.setProperty('--dm', t.dm || 0)
  }

  function layout(intro) {
    const el = disc,
      t = target(S.screen);
    if (intro) { // первое появление: без перехода встаёт чуть меньше и вырастает
      el.classList.add('nt');
      el.style.opacity = 0;
      put(el, t, .82);
      void el.offsetWidth;
      el.classList.remove('nt');
      el.style.transitionDelay = '.12s';
      put(el, t);
      el.style.opacity = t.op;
      setTimeout(() => {
        el.style.transitionDelay = ''
      }, 1400);
      return
    }
    put(el, t);
    el.style.opacity = t.op
  }
  /* диск «плавает» вверх-вниз (6 с, ход 1,8 % диаметра, 2…8 px), плашки суммы плывут вместе с ним.
     Там, где диска нет, ход плавно уходит в 0. prefers-reduced-motion и ?still – без плавания. */
  {
    const RMQ = matchMedia('(prefers-reduced-motion: reduce)'),
      STILL = Q.has('still'),
      T = 6000;
    let amp = 0,
      prev = performance.now();
    const last = new WeakMap();
    const pills = [...document.querySelectorAll('#badge,.scr .bd,.scr .mbadge')];
    const set = (el, y) => {
      const v = y.toFixed(2);
      if (last.get(el) !== v) {
        el.style.translate = y ? `0 ${v}px` : '';
        last.set(el, v)
      }
    };

    function goal() {
      if (RMQ.matches || STILL) return 0;
      const t = target(S.screen);
      if (!t.op) return 0;
      return Math.max(2, Math.min(8, t.d * .018))
    }

    function tick(now) {
      const dt = Math.min(64, now - prev);
      prev = now;
      const g = goal();
      amp += (g - amp) * Math.min(1, dt / (g > amp ? 900 : 350));
      if (Math.abs(g - amp) < .01) amp = g;
      const y = amp ? -(amp / 2) * Math.sin(2 * Math.PI * now / T) : 0;
      set(disc, y);
      pills.forEach(el => set(el, y));
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  /* ── диск наклоняется за курсором и ловит блик ; кнопка «Далее» притягивается к курсору ── */
  const ptr = {
    x: -999,
    y: -999
  };
  frame.addEventListener('pointermove', e => {
    ptr.x = e.clientX;
    ptr.y = e.clientY
  });
  frame.addEventListener('pointerleave', () => {
    ptr.x = ptr.y = -9999
  });
  const TL = {
    rx: 0,
    ry: 0,
    go: 0,
    gx: 50,
    gy: 30
  };
  let mg = {
    x: 0,
    y: 0
  };
  (function tilt() {
    const T = TL,
      tw = disc.firstElementChild,
      face = tw.querySelector('.face');
    let trx = 0,
      try_ = 0,
      tgo = 0,
      gx = T.gx,
      gy = T.gy;
    if (true) {
      const r = face.getBoundingClientRect(),
        cx = r.left + r.width / 2,
        cy = r.top + r.height / 2,
        R = r.width / 2;
      const dx = (ptr.x - cx) / R,
        dy = (ptr.y - cy) / R,
        d = Math.hypot(dx, dy);
      if (d < 1.25) {
        trx = -dy * 9;
        try_ = dx * 9;
        tgo = Math.max(0, 1.15 - d) * .9;
        gx = 50 + dx * 50;
        gy = 50 + dy * 50
      }
    }
    T.rx += (trx - T.rx) * .12;
    T.ry += (try_ - T.ry) * .12;
    T.go += (tgo - T.go) * .12;
    T.gx += (gx - T.gx) * .2;
    T.gy += (gy - T.gy) * .2;
    tw.style.setProperty('--rx', T.rx.toFixed(2) + 'deg');
    tw.style.setProperty('--ry', T.ry.toFixed(2) + 'deg');
    face.style.setProperty('--go', T.go.toFixed(3));
    face.style.setProperty('--gx', T.gx.toFixed(1) + '%');
    face.style.setProperty('--gy', T.gy.toFixed(1) + '%');
    if (M) {
      next.style.translate = ''
    } else {
      const r = next.getBoundingClientRect();
      const k = 1440 / frame.getBoundingClientRect().width;
      const dx = (ptr.x - (r.left + r.width / 2 - mg.x)) * k,
        dy = (ptr.y - (r.top + r.height / 2 - mg.y)) * k,
        d = Math.hypot(dx, dy);
      let tx = 0,
        ty = 0;
      if (d < 150) {
        tx = dx * (1 - d / 150) * .3;
        ty = dy * (1 - d / 150) * .3
      }
      mg.x += (tx - mg.x) * .15;
      mg.y += (ty - mg.y) * .15;
      next.style.translate = `${mg.x.toFixed(1)}px ${mg.y.toFixed(1)}px`
    }
    requestAnimationFrame(tilt)
  })();

  /* ── степпер ── */
  const stp = $('#stepper');
  let sps = [],
    spbP = null,
    spbA = null,
    spPrev = -1,
    spAnim = null;

  function buildSteps() {
    spStop();
    spPrev = -1;
    stp.innerHTML = '<svg class="spb" aria-hidden="true"><path/><path/></svg>';
    spbP = $('path', stp);
    spbA = spbP.nextSibling;
    sps = FLOW.map((f, i) => {
      const b = document.createElement('button');
      b.className = 'sp';
      b.innerHTML = `<span class="n">${i+1}</span><span class="lb">${TITLES[i]}</span>`;
      b.title = TITLES[i];
      b.onclick = () => setStep(i);
      stp.appendChild(b);
      return b
    })
  }
  buildSteps();

  function updStep() {
    const i = S.step,
      p = spPrev,
      mv = !M && !RM && p >= 0 && i >= 0 && p !== i;
    if (p !== i || M) spStop();
    const w0 = mv ? sps[p].offsetWidth : 0;
    sps.forEach((b, j) => {
      b.classList.toggle('on', j === i);
      b.classList.toggle('done', j < i);
      b.setAttribute('aria-current', j === i ? 'step' : 'false')
    });
    stp.style.setProperty('--p', i + 1);
    $('#hTitle').textContent = i >= 0 ? `${TITLES[i]} ${i+1}/${FLOW.length}` : '';
    spPrev = i;
    if (mv) spPlay(p, i, w0)
  }
  /* ── смена шага: активная пилюля собирается в круг на своей цифре, от него отрывается капля, перелетает на цифру нового шага и раскрывается там в пилюлю.
     Ряд не «дышит»: старый шаг сужается, новый расширяется одним ходом, а фиолетовое пятно живёт поверх своей жизнью.
     Пятно – SVG-путь, считается каждый кадр из профиля h(x) (полувысота по оси ряда): остаток на старой цифре + голова капли, у каждого хвост навстречу другому.
     Пока хвосты перекрываются, между ними перемычка; она истончается и рвётся ближе к остатку (35% пути), хвосты втягиваются, остаток гаснет вторым путём.
     Посадка: круг раздаётся до ~12,5 и из отдачи пружиной выстреливает пилюля. Цифра белеет, пока пятно под ней толще 5px; подписи режутся кромкой пятна.
     ?tl – ручной режим: __sp.seek(мс), __sp.finish() */
  const SPDBG = /[?&]tl\b/.test(location.search);

  function spPath(cs, xa, xb, h) {
    const y = 11,
      f = v => v.toFixed(2);
    let p = '',
      top = [],
      bot = [];
    cs.forEach(([x, r]) => {
      if (r > .2) p += `M${f(x-r)},${y}a${f(r)},${f(r)} 0 1 1 ${f(2*r)},0a${f(r)},${f(r)} 0 1 1 ${f(-2*r)},0Z`
    });
    const fl = () => {
        if (top.length > 1) p += 'M' + top.join('L') + 'L' + bot.reverse().join('L') + 'Z';
        top = [];
        bot = []
      },
      n = Math.max(1, Math.ceil(xb - xa));
    for (let i = 0; i <= n; i++) {
      const x = xa + (xb - xa) * i / n,
        v = h(x);
      if (v < .05) {
        fl();
        continue
      }
      top.push(f(x) + ',' + f(y - v));
      bot.push(f(x) + ',' + f(y + v))
    }
    fl();
    return p
  }

  function spStop() {
    const a = spAnim;
    if (!a) return;
    spAnim = null;
    cancelAnimationFrame(a.raf);
    stp.classList.remove('mv');
    sps.forEach(b => {
      b.classList.remove('was', 'cv');
      b.style.cssText = '';
      b.lastChild.style.cssText = ''
    });
    spbA.setAttribute('d', '')
  }

  function spPlay(ai, bi, w0) {
    const A = sps[ai],
      B = sps[bi],
      Al = A.lastChild,
      Bl = B.lastChild,
      R = 11,
      PL = 13.2,
      w1 = B.offsetWidth,
      pa = (22 - A.firstChild.offsetWidth) / 2,
      pb = (22 - B.firstChild.offsetWidth) / 2,
      dir = bi > ai ? 1 : -1,
      fl = 190 + Math.min(3, Math.abs(bi - ai) - 1) * 35,
      T = {
        c: 170,
        p0: 90,
        p1: 90 + fl,
        ts: 90 + .76 * fl,
        e0: 120 + fl,
        r: 190 + fl,
        end: 570 + fl
      };
    const cl = x => x < 0 ? 0 : x > 1 ? 1 : x,
      sg = (t, a, b) => cl((t - a) / (b - a)),
      eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(2 - 2 * x, 3) / 2,
      eo = x => 1 - Math.pow(1 - x, 3),
      spr = (ts, resp, z) => {
        if (ts <= 0) return 0;
        const w = 2 * Math.PI / resp,
          wd = w * Math.sqrt(1 - z * z);
        return 1 - Math.exp(-z * w * ts) * (Math.cos(wd * ts) + z * w / wd * Math.sin(wd * ts))
      },
      f3 = v => v >= 1 ? 0 : Math.pow(1 - Math.pow(v, 1.2), 2.6),
      cap = (dx, r) => dx < r ? Math.sqrt(r * r - dx * dx) : 0;
    stp.classList.add('mv');
    A.classList.add('was');
    [A, B].forEach(el => {
      el.style.justifyContent = 'flex-start';
      el.style.paddingRight = '0'
    });
    const render = t => {
      const e = eio(sg(t, 0, T.r)),
        wA = w0 + (22 - w0) * e,
        wB = 22 + (w1 - 22) * e,
        c = eio(sg(t, 0, T.c)),
        wc = w0 + (22 - w0) * c,
        sE = spr((t - T.e0) / 1000, .34, .75),
        ext = (wB - 22) * sE,
        on = t >= T.e0;
      A.style.width = wA.toFixed(2) + 'px';
      B.style.width = wB.toFixed(2) + 'px';
      A.style.paddingLeft = (PL + (pa - PL) * c).toFixed(2) + 'px';
      B.style.paddingLeft = (pb + (PL - pb) * cl(sE)).toFixed(2) + 'px';
      const aL = A.offsetLeft,
        bL = B.offsetLeft,
        an = aL + R,
        far = aL + wc - R,
        cB = bL + R,
        cA = dir > 0 ? far : an,
        cP = cA + (cB - cA) * eio(sg(t, T.p0, T.p1)),
        d = Math.abs(cP - cA),
        xe = cB + ext;
      // остаток на старой цифре: отдаёт массу голове (11 → 7,8); после разрыва – отдельный путь, который гаснет (впитывается), а не сжимается в точку под цифрой
      const gone = sg(t, T.ts, T.ts + 110),
        rA = R - 3.2 * eio(sg(t, T.p0 + 25, T.ts)) - 1.6 * gone;
      // голова: в полёте 10, на посадке раздаётся до ~12,5 и возвращается к 11 с малой отдачей
      const tau = t - (T.p1 - 15),
        bump = tau > 0 && tau < 140 ? Math.sin(Math.PI * tau / 140) : tau >= 140 && tau < 260 ? -.2 * Math.sin(Math.PI * (tau - 140) / 120) : 0,
        rP = R - Math.min(sg(t, T.p0, T.p0 + 70), 1 - sg(tau, 0, 140)) + 2 * bump;
      // хвосты: до разрыва перекрываются (перемычка), в момент разрыва сходятся остриями на 35% пути от остатка, потом втягиваются
      const k = 1 - Math.pow(sg(t, T.p0 + 40, T.ts), 2),
        cut = t >= T.ts,
        La = cut ? d * .35 * (1 - eo(sg(t, T.ts, T.ts + 80))) : d * (.35 + .65 * k),
        Lp = cut ? d * .65 * (1 - eo(sg(t, T.ts, T.ts + 130))) : d * (.65 + .35 * k);
      const lo = Math.min(an, far),
        hi = Math.max(an, far),
        hA = x => {
          if (rA < .2) return 0;
          const s = dir * (x - cA);
          return s > 0 ? Math.max(cap(s, rA), La > .01 ? rA * f3(s / La) : 0) : x < lo ? cap(lo - x, rA) : x > hi ? cap(x - hi, rA) : rA
        },
        hP = x => {
          const s = dir * (cP - x);
          return s > 0 ? Math.max(cap(s, rP), Lp > .01 ? rP * f3(s / Lp) : 0) : cap(-s, rP)
        },
        hE = x => !on || x < cB ? 0 : x > xe ? cap(x - xe, R) : R + (Math.max(rP, R) - R) * Math.pow(Math.max(0, 1 - (x - cB) / 24), 2),
        h = x => {
          const a = cut ? 0 : hA(x),
            q = hP(x);
          return Math.max(Math.min(Math.max(rA, rP), Math.cbrt(a * a * a + q * q * q)), hE(x))
        };
      spbP.setAttribute('d', spPath(cut ? [
        [cP, rP],
        [xe, on ? R : 0]
      ] : [
        [an, rA],
        [far, rA],
        [cP, rP]
      ], cut ? Math.min(cP, cP - dir * Lp) : Math.min(lo, cP), cut ? Math.max(cP, cP - dir * Lp, on ? xe : cP) : Math.max(hi, cP), h));
      spbA.setAttribute('d', cut && gone < 1 ? spPath([
        [an, rA],
        [far, rA]
      ], Math.min(lo, cA + dir * La), Math.max(hi, cA + dir * La), hA) : '');
      spbA.style.opacity = (1 - gone).toFixed(3);
      sps.forEach(b => {
        const n = b.firstChild,
          x = b.offsetLeft + n.offsetLeft + n.offsetWidth / 2;
        b.classList.toggle('cv', h(x) >= 5.2 || cut && gone < .4 && hA(x) >= 5.2)
      });
      const lab = (el, box, o, tx, bl, br) => {
        const l = box + el.offsetLeft + tx,
          w = el.offsetWidth;
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translateX(${tx.toFixed(2)}px)`;
        el.style.clipPath = `inset(-4px ${Math.max(0,l+w-br+9).toFixed(2)}px -4px ${Math.max(0,bl+9-l).toFixed(2)}px)`
      };
      lab(Al, aL, 1 - sg(t, 0, 110), 0, lo - rA, hi + rA);
      lab(Bl, bL, eo(sg(t, T.e0 + 30, T.e0 + 200)), -6 * (1 - eo(sg(t, T.e0 + 30, T.e0 + 240))), cB - R, on ? xe + R : cB - R)
    };
    const a = spAnim = {
      raf: 0
    };
    render(0);
    if (SPDBG) {
      window.__sp = {
        T,
        seek: render,
        finish: spStop
      };
      return
    }
    const t0 = performance.now(),
      tick = now => {
        if (spAnim !== a) return;
        const t = now - t0;
        if (t >= T.end) return spStop();
        render(t);
        a.raf = requestAnimationFrame(tick)
      };
    a.raf = requestAnimationFrame(tick)
  }

  function setStep(i) {
    if (i < 0 || i >= FLOW.length || i === S.step) return;
    S.step = i;
    updStep()
  }
  $('#backB').onclick = () => setStep(S.step - 1);
  $('#logo').onclick = $('#closeB').onclick = () => {
    location.href = '../'
  };

  /* ── получатель ── */
  const ph = $('#phone');
  ph.addEventListener('focus', () => {
    if (!ph.value) {
      ph.value = '+375 ';
      S.phone = ph.value
    }
  });
  ph.addEventListener('blur', () => {
    if (ph.value.replace(/\D/g, '').length <= 3) {
      ph.value = '';
      S.phone = ''
    }
    upd()
  });
  ph.addEventListener('input', () => {
    let r = ph.value.replace(/\D/g, '');
    if (r.startsWith('375')) r = r.slice(3);
    else if (r.startsWith('80')) r = r.slice(2);
    r = r.slice(0, 9);
    let o = '+375 ';
    if (r.length) o += r.slice(0, 2);
    if (r.length > 2) o += ' ' + r.slice(2, 5);
    if (r.length > 5) o += '-' + r.slice(5, 7);
    if (r.length > 7) o += '-' + r.slice(7, 9);
    ph.value = o;
    S.phone = o;
    $('#fPhone').classList.remove('bad');
    upd()
  });
  const SAMPLES = ['+375 29 314-52-08', '+375 33 512-07-44', '+375 44 700-18-92'];
  let si = 0;
  $('#contact').onclick = () => {
    ph.value = SAMPLES[si++ % SAMPLES.length];
    S.phone = ph.value;
    $('#fPhone').classList.remove('bad');
    upd()
  };
  $('#from').oninput = e => {
    S.from = e.target.value;
    upd()
  };
  $('#sur').onclick = () => {
    S.surprise = !S.surprise;
    surSwap();
    upd()
  };
  /* мобилка: «от кого» схлопывается, всё, что ниже, плавно подтягивается на его место */
  function surSwap() {
    const sc = $('.scr[data-s="recipient"]');
    if (RM || !M || !sc.classList.contains('act')) {
      syncRecipient();
      return
    }
    const els = [$('#surLab'), $('#sur'), $('#pdf')],
      t0 = els.map(e => e.getBoundingClientRect().top);
    syncRecipient();
    const k = frame.getBoundingClientRect().width / W,
      E = 'cubic-bezier(.22,1,.36,1)';
    els.forEach((e, i) => {
      const dy = (t0[i] - e.getBoundingClientRect().top) / k;
      if (Math.abs(dy) > .5) e.animate([{
        transform: 'translateY(' + dy + 'px)'
      }, {
        transform: 'none'
      }], {
        duration: 460,
        easing: E
      })
    });
    if (!S.surprise) $$('.ofrom', sc).forEach(e => e.animate([{
      opacity: 0,
      transform: 'translateY(-6px)'
    }, {
      opacity: 1,
      transform: 'none'
    }], {
      duration: 320,
      delay: 140,
      easing: E,
      fill: 'backwards'
    }))
  }
  $('#pdf').onclick = () => {
    S.pdf = !S.pdf;
    selfSwap();
    upd()
  };
  /* «себе»: 1) лишние поля уходят (160 мс) 2) тумблер переезжает (480 мс) 3) новые поля появляются каскадом */
  let swapTok = 0;

  function selfSwap() {
    const sc = $('.scr[data-s="recipient"]'),
      pdf = $('#pdf'),
      on = S.pdf,
      tok = ++swapTok;
    pdf.classList.toggle('on', on);
    pdf.setAttribute('aria-checked', on);
    sc.getAnimations({
      subtree: true
    }).filter(a => a.id === 'sw').forEach(a => a.cancel());
    if (RM || !sc.classList.contains('act')) {
      syncRecipient();
      return
    }
    const EIN = 'cubic-bezier(.4,0,1,1)',
      EOUT = 'cubic-bezier(.22,1,.36,1)',
      sw = a => (a.id = 'sw', a);
    const outEls = on ? $$('.nself', sc) : $$('#more>*', sc),
      inEls = on ? $$('#more>*', sc) : $$('.nself', sc);
    sc.classList.add('swapping');
    const outs = outEls.map(el => sw(el.animate([{
      opacity: 1,
      transform: 'none'
    }, {
      opacity: 0,
      transform: 'translateY(-6px)'
    }], {
      duration: 160,
      easing: EIN,
      fill: 'forwards'
    })));
    setTimeout(() => {
      if (tok !== swapTok) return;
      const f = pdf.getBoundingClientRect().top;
      syncRecipient();
      outs.forEach(a => a.cancel());
      const k = frame.getBoundingClientRect().width / W,
        dy = (f - pdf.getBoundingClientRect().top) / k;
      if (Math.abs(dy) > .5) sw(pdf.animate([{
        transform: `translateY(${dy}px)`
      }, {
        transform: 'none'
      }], {
        duration: 480,
        easing: EOUT
      }));
      inEls.forEach((el, i) => sw(el.animate([{
        opacity: 0,
        transform: 'translateY(10px)'
      }, {
        opacity: 1,
        transform: 'none'
      }], {
        duration: 380,
        delay: 200 + i * 50,
        easing: EOUT,
        fill: 'backwards'
      })));
      setTimeout(() => {
        if (tok === swapTok) sc.classList.remove('swapping')
      }, 200 + inEls.length * 50 + 420)
    }, 170)
  }
  $('#cons').onclick = () => {
    S.consent = !S.consent;
    syncRecipient();
    upd()
  };
  $('#cons2').onclick = () => {
    S.ads = !S.ads;
    syncRecipient()
  };
  $('#email').oninput = e => {
    S.email = e.target.value;
    $('#fMail').classList.remove('bad');
    upd()
  };

  function syncRecipient() {
    $('#sur').classList.toggle('on', S.surprise);
    $('#sur').setAttribute('aria-checked', S.surprise);
    $('.scr[data-s="recipient"]').classList.toggle('surp', S.surprise);
    const fr = $('#from');
    fr.disabled = S.surprise;
    fr.placeholder = S.surprise ? 'подпись скрыта' : 'ваше имя';
    $('#fFrom').classList.toggle('dis', S.surprise);
    $('#pdf').classList.toggle('on', S.pdf);
    $('#pdf').setAttribute('aria-checked', S.pdf);
    $('#more').classList.toggle('on', S.pdf);
    $('.scr[data-s="recipient"]').classList.toggle('self', S.pdf);
    $$('.nself input,button.nself').forEach(x => x.tabIndex = S.pdf ? -1 : 0);
    $('#cons').classList.toggle('on', S.consent);
    $('#cons').setAttribute('aria-checked', S.consent);
    $('#cons2').classList.toggle('on', S.ads);
    $('#cons2').setAttribute('aria-checked', S.ads);
    $$('#more input,#more button').forEach(x => x.tabIndex = S.pdf ? 0 : -1)
  }
  const recOk = () => S.pdf ? (mailOk(S.email) && S.consent) : (phoneOk() && (S.surprise || S.from.trim().length > 0));

  function recHint() { // show what is wrong after a failed attempt
    if (!S.pdf && !phoneOk()) $('#fPhone').classList.add('bad');
    if (S.pdf && !mailOk(S.email)) $('#fMail').classList.add('bad');
    if (!S.pdf && !S.surprise && !S.from.trim()) $('#fFrom').classList.add('bad')
  }
  $('#from').addEventListener('input', () => $('#fFrom').classList.remove('bad'));

  /* ── «Далее»: неактивна, пока форма не заполнена; по нажатию с ошибкой – подсветка полей и встряска ── */
  function upd() {
    const ok = recOk();
    next.classList.toggle('off', !ok);
    next.setAttribute('aria-disabled', String(!ok))
  }
  next.onclick = () => {
    if (!recOk()) {
      recHint();
      next.classList.remove('shake');
      void next.offsetWidth;
      next.classList.add('shake');
      return
    }
    setStep(S.step + 1)
  };
  addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.target.matches('textarea,button,[role=button]')) next.click()
  });

  /* служебное: ?still – без CSS-переходов (для снимков), ?debug – доступ к состоянию из консоли */
  if (Q.has('still')) {
    const st = document.createElement('style');
    st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
    document.head.appendChild(st)
  }
  if (Q.has('debug')) window.__gc = {
    go: typeof go === 'function' ? go : null,
    S
  };

  /* старт: экран входит, элементы с data-a появляются каскадом (--i) */
  {
    const sc = $('.scr[data-s="recipient"]');
    let k = 0;
    $$('[data-a]', sc).forEach(el => el.style.setProperty('--i', k++));
    sc.classList.add('act');
    void sc.offsetWidth;
    sc.classList.add('in')
  }
  $('#phone').value = S.phone;
  $('#email').value = USER_EMAIL;
  syncRecipient();
  fit();
  layout(true);
  updStep();
  upd();
})();
