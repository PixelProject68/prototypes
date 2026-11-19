/* mooon, подарочная карта: страница после оплаты.
   Экраны: «Упаковка» (конверт: карта в карман → клапан → печать → улёт, runPack) → «Успех» (5 статусов, renderDone).
   Параметры ссылки: ?status=a|b|v|g|d – статус; ?screen=done – сразу успех, без упаковки; ?theme=dark; ?demo – панель статусов (клавиша D).
   Клавиша T – тема. Выделено из общего прототипа, поведение то же. */
(() => {
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app'),
    frame = $('#frame');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, RM ? 10 : ms));
  const pad = n => String(n).padStart(2, '0');
  const Q = new URLSearchParams(location.search);

  const MONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const AMOUNT = 100; // номинал карты, BYN
  const USER_EMAIL = 'den@mail.by'; // куда ушёл чек
  const LINK_SAMPLE = 'mooon.by/g/kx4-92lp';
  const DEMO = {
    force: '',
    sound: true
  };
  /* when: 0 – отправить сразу, 1 – отложено (date, hh, mm); pdf – «себе, PDF на почту»; fresh – только что с упаковки */
  const S = {
    screen: null,
    phone: '+375 29 314-52-08',
    email: USER_EMAIL,
    pdf: false,
    when: 0,
    sentNow: false,
    date: null,
    hh: 18,
    mm: 30,
    fresh: false
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  S.date = new Date(today.getTime() + 2 * 864e5);
  const phoneDigits = () => S.phone.replace(/\D/g, '').slice(3);

  function phonePretty() {
    const d = phoneDigits();
    return `+375 (${d.slice(0,2)}) ${d.slice(2,5)}-${d.slice(5,7)}-${d.slice(7,9)}`
  }

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
    syncBadge();
    layout()
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

  function target(sc) {
    if (M) {
      const cx = W / 2;
      return sc === 'done' ? {
        cx,
        cy: (H + 36) / 2 - 130 + 58,
        d: 116,
        op: 1
      } : {
        cx,
        cy: 300,
        d: 200,
        op: 0
      }
    }
    return sc === 'done' ? {
      cx: 325,
      cy: 415,
      d: 470,
      op: 1
    } : {
      cx: 720,
      cy: 470,
      d: 300,
      op: 0
    }
  }

  function syncBadge() {
    $('#badge').classList.toggle('hid', M || S.screen !== 'done')
  }
  $('#badge').textContent = AMOUNT + ' BYN';

  /* ── диск с дизайном карты: один на всю страницу, переезжает между экранами (target → место и размер) ── */
  const CARD_SRC = 'img/card.webp';
  const disc = document.createElement('div');
  disc.className = 'it cur';
  disc.style.pointerEvents = 'none';
  disc.innerHTML = `<div class="tw"><div class="glow"><img alt="" src="${CARD_SRC}"></div><div class="face"><img alt="Дизайн карты" src="${CARD_SRC}" draggable="false"><i class="shine"></i></div></div>`;
  $('#items').appendChild(disc);
  const put = (el, t, k = 1) => {
    const d = t.d * k;
    el.style.transform = `translate(${t.cx-d/2}px,${t.cy-d/2}px) scale(${d/380})`
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

  /* ── диск наклоняется за курсором и ловит блик ── */
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
    requestAnimationFrame(tilt)
  })();

  /* ── звук: только по действию пользователя ── */
  let AC = null;

  function sfx(k) {
    if (!DEMO.sound) return;
    try {
      AC = AC || new(window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      const t = AC.currentTime;
      const tone = (f, t0, d, v) => {
        const o = AC.createOscillator(),
          g = AC.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t + t0);
        g.gain.linearRampToValueAtTime(v, t + t0 + .012);
        g.gain.exponentialRampToValueAtTime(.0001, t + t0 + d);
        o.connect(g);
        g.connect(AC.destination);
        o.start(t + t0);
        o.stop(t + t0 + d + .05)
      };
      const noise = (t0, d, f0, f1, v) => {
        const n = AC.createBufferSource(),
          b = AC.createBuffer(1, Math.ceil(AC.sampleRate * d), AC.sampleRate),
          ch = b.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
        n.buffer = b;
        const bp = AC.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 1.4;
        bp.frequency.setValueAtTime(f0, t + t0);
        bp.frequency.exponentialRampToValueAtTime(f1, t + t0 + d);
        const g = AC.createGain();
        g.gain.setValueAtTime(0, t + t0);
        g.gain.linearRampToValueAtTime(v, t + t0 + d * .3);
        g.gain.exponentialRampToValueAtTime(.0001, t + t0 + d);
        n.connect(bp);
        bp.connect(g);
        g.connect(AC.destination);
        n.start(t + t0);
        n.stop(t + t0 + d + .05)
      };
      if (k === 'pop') {
        const o = AC.createOscillator(),
          g = AC.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(880, t);
        o.frequency.exponentialRampToValueAtTime(240, t + .09);
        g.gain.setValueAtTime(.0001, t);
        g.gain.linearRampToValueAtTime(.1, t + .006);
        g.gain.exponentialRampToValueAtTime(.0001, t + .12);
        o.connect(g);
        g.connect(AC.destination);
        o.start(t);
        o.stop(t + .15)
      } else if (k === 'whoosh') noise(0, .45, 500, 2600, .05);
      else if (k === 'slide') noise(0, .5, 900, 3200, .035);
      else
      if (k === 'tick') tone(520, 0, .14, .08);
      else if (k === 'chime')[659, 880, 1319].forEach((f, i) => tone(f, i * .09, .95, .06));
      else if (k === 'ok') tone(880, 0, .18, .05)
    } catch (_) {}
  }

  /* ── конверт (520×340, масштаб --es) ──
     Один контур: задник, перед и клапан строятся из EC_PATH (верхние углы – линия сгиба, нижние – радиус 18).
     Сгибы сходятся точно в нижние углы, клапан перекрывает V-вырез на 1,5 px по нормали, обводок по кромке нет.
     Фактура: бумажное зерно и волокна (генерируются один раз), подкладка – сетка лун, тени складок. */
  const LOGO_D = 'M42.1729 0.0253906C48.4222 0.0254363 52.9582 4.647 52.9609 11.0146C52.9608 14.0075 51.9071 16.7662 49.9951 18.7812C48.0252 20.8557 45.2465 21.9999 42.1758 22C38.9836 22 36.252 20.8866 34.2793 18.7783C32.4142 16.7858 31.3878 14.0301 31.3877 11.0117C31.3877 8.02149 32.4418 5.2631 34.3594 3.24512C36.3321 1.1706 39.1075 0.0253906 42.1729 0.0253906ZM64.5098 0.0283203C70.4327 0.0283203 75.2342 4.94653 75.2344 11.0137C75.2344 17.081 70.4328 22 64.5098 22C58.5868 22 53.7852 17.081 53.7852 11.0137C53.7854 4.94656 58.5869 0.0283684 64.5098 0.0283203ZM86.6387 0.0253906C92.8879 0.0254987 97.424 4.64704 97.4268 11.0146C97.4267 14.0075 96.3729 16.7662 94.4609 18.7812C92.491 20.8557 89.7123 21.9999 86.6416 22C83.4495 22 80.7179 20.8865 78.7451 18.7783C76.88 16.7858 75.8536 14.0301 75.8535 11.0117C75.8535 8.0217 76.9069 5.26306 78.8242 3.24512C80.797 1.1706 83.5733 0.0253906 86.6387 0.0253906ZM9.67578 0C12.3383 0 14.5929 1.26649 15.9062 3.47949C17.4872 1.33997 20.103 0.0145451 22.7959 0.0117188C25.1383 0.0117494 27.1001 0.765894 28.4658 2.1875C29.8095 3.58652 30.5186 5.56218 30.5186 7.90234V21.5537H26.7246V8.34082C26.7246 5.34223 25.0694 3.55288 22.2939 3.55273C19.4963 3.55273 17.131 5.86166 17.1309 8.5918V18.4814L17.1455 21.5566H16.9189L14.4551 21.582V21.5566H13.3545V8.34375C13.3545 5.43555 11.5663 3.55576 8.80176 3.55566C6.21923 3.55566 3.77441 5.93272 3.77441 8.44531V21.5537H0V0.438477H3.77441V2.37402C5.22286 0.879005 7.3914 0.000105755 9.67578 0ZM108.853 0.110352C113.88 0.110352 117.003 3.33531 117 8.52441V21.5566H113.231V9.04102C113.231 5.66953 111.38 3.65449 108.279 3.6543C104.988 3.6543 102.311 6.32225 102.311 9.60352V21.5537H98.5254V0.4375H102.3V2.69043C103.944 1.04557 106.306 0.110404 108.853 0.110352ZM42.1729 3.55859C38.1473 3.55859 35.2256 6.69322 35.2256 11.0146C35.2258 15.4037 38.084 18.4697 42.1729 18.4697C46.2617 18.4697 49.1172 15.4036 49.1201 11.0146C49.1201 8.95724 48.4471 7.07741 47.2305 5.72363C45.9585 4.30767 44.209 3.55862 42.1729 3.55859ZM86.6387 3.55859C82.6131 3.55859 79.6914 6.69322 79.6914 11.0146C79.6916 15.4037 82.5498 18.4697 86.6387 18.4697C90.7274 18.4696 93.583 15.4036 93.5859 11.0146C93.5859 8.95727 92.9129 7.07741 91.6963 5.72363C90.4244 4.3077 88.6748 3.55865 86.6387 3.55859Z';
  const EC_PATH = 'M0 0H520V322A18 18 0 0 1 502 340H18A18 18 0 0 1 0 322Z';
  const EC_POCKET = 'M0 0L260 198L520 0V322A18 18 0 0 1 502 340H18A18 18 0 0 1 0 322Z';
  const EC_FLAP = '0,0 520,0 520,1.89 260,199.89 0,1.89';
  const MOON = 'M2-3.46A4 4 0 1 0 2 3.46A3.6 3.6 0 0 1 2-3.46Z';
  const PAPER = (() => {
    const n = 256,
      c = document.createElement('canvas');
    c.width = c.height = n;
    const x = c.getContext('2d'),
      d = x.createImageData(n, n);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random(),
        w = v > .5;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = w ? 255 : 0;
      d.data[i + 3] = Math.round(Math.pow(Math.abs(v - .5) * 2, 2.4) * (w ? 70 : 60))
    }
    x.putImageData(d, 0, 0);
    x.lineCap = 'round';
    for (let k = 0; k < 70; k++) {
      const x0 = Math.random() * n,
        y0 = Math.random() * n,
        L = 14 + Math.random() * 46,
        a = Math.random() * 6.283,
        b = (Math.random() - .5) * 22;
      const x1 = x0 + Math.cos(a) * L,
        y1 = y0 + Math.sin(a) * L,
        mx = (x0 + x1) / 2 - Math.sin(a) * b,
        my = (y0 + y1) / 2 + Math.cos(a) * b;
      x.strokeStyle = Math.random() < .6 ? `rgba(255,255,255,${(.07+Math.random()*.1).toFixed(3)})` : `rgba(0,0,0,${(.06+Math.random()*.08).toFixed(3)})`;
      x.lineWidth = .5 + Math.random() * .7;
      for (const ox of [-n, 0, n])
        for (const oy of [-n, 0, n]) {
          x.beginPath();
          x.moveTo(x0 + ox, y0 + oy);
          x.quadraticCurveTo(mx + ox, my + oy, x1 + ox, y1 + oy);
          x.stroke()
        }
    }
    return c.toDataURL('image/png')
  })();
  document.documentElement.style.setProperty('--paper', `url(${PAPER})`);
  const LOGO_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 117 22"><path d="${LOGO_D}"/></svg>`)}")`;
  // полоса-градиент от кромки внутрь фигуры: тени складок и блики по кромке (вместо обводок)
  const strip = (id, mx, my, nx, ny, len, col, a) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${mx}" y1="${my}" x2="${(mx+nx*len).toFixed(2)}" y2="${(my+ny*len).toFixed(2)}"><stop offset="0" stop-color="${col}" stop-opacity="${a}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>`;
  const LT = 'M0 0L260 198L0 340Z',
    RT = 'M520 0L260 198L520 340Z',
    BT = 'M0 340L260 198L520 340Z';
  const ENV = p => `<div class="shadow"></div>
<div class="bk"><svg viewBox="0 0 520 340" aria-hidden="true"><defs>
<linearGradient id="${p}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c1a70"/><stop offset="1" stop-color="#1c0f4d"/></linearGradient>
<linearGradient id="${p}bi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
<pattern id="${p}ml" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="3.2" fill="#fff"/><path transform="translate(27 27) rotate(-35)" d="${MOON}" fill="#fff"/></pattern>
<pattern id="${p}pp" width="128" height="128" patternUnits="userSpaceOnUse"><image href="${PAPER}" width="128" height="128"/></pattern>
</defs><path d="${EC_PATH}" fill="url(#${p}bg)"/><path d="${EC_PATH}" fill="url(#${p}ml)" opacity=".07"/><path d="${EC_PATH}" fill="url(#${p}pp)" opacity=".6"/><rect width="520" height="46" fill="url(#${p}bi)"/></svg></div>
<div class="cw"><div class="card"><i class="csh"></i><img alt="" src=""><i class="crg"></i></div></div>
<div class="front"><svg viewBox="0 0 520 340" aria-hidden="true"><defs>
<clipPath id="${p}pk"><path d="${EC_POCKET}"/></clipPath>
<linearGradient id="${p}fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#40298c"/><stop offset="1" stop-color="#22135a"/></linearGradient>
<radialGradient id="${p}fv" cx="50%" cy="38%" r="75%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
${strip(p+'sl',130,269,-.479,-.878,18,'#0c0330',.42)}${strip(p+'sr',390,269,.479,-.878,18,'#0c0330',.42)}
${strip(p+'hl',130,269,.479,.878,4,'#fff',.2)}${strip(p+'hr',390,269,-.479,.878,4,'#fff',.2)}
${strip(p+'vl',130,99,-.606,.796,3,'#fff',.16)}${strip(p+'vr',390,99,.606,.796,3,'#fff',.12)}
${strip(p+'cl',130,99,-.606,.796,24,'#0c0330',.5)}${strip(p+'cr',390,99,.606,.796,24,'#0c0330',.5)}
</defs><g clip-path="url(#${p}pk)">
<rect width="520" height="340" fill="url(#${p}fg)"/>
<path d="${LT}" fill="#fff" fill-opacity=".06"/><path d="${RT}" fill="#000" fill-opacity=".14"/>
<path d="${LT}" fill="url(#${p}sl)"/><path d="${RT}" fill="url(#${p}sr)"/>
<path d="${BT}" fill="#fff" fill-opacity=".05"/><path d="${BT}" fill="url(#${p}hl)"/><path d="${BT}" fill="url(#${p}hr)"/>
<path d="${LT}" fill="url(#${p}vl)"/><path d="${RT}" fill="url(#${p}vr)"/>
<g class="fsh"><path d="${LT}" fill="url(#${p}cl)"/><path d="${RT}" fill="url(#${p}cr)"/></g>
<rect width="520" height="340" fill="url(#${p}pp)" opacity=".7"/><rect width="520" height="340" fill="url(#${p}fv)"/>
</g></svg></div>
<div class="fl"><div class="ff"><svg viewBox="0 0 520 202" aria-hidden="true"><defs>
<linearGradient id="${p}flg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3bb8"/><stop offset="1" stop-color="#3b2582"/></linearGradient>
<radialGradient id="${p}fls" cx="28%" cy="0%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".13"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
${strip(p+'el',130,100.89,.606,-.796,7,'#fff',.22)}${strip(p+'er',390,100.89,-.606,-.796,7,'#fff',.16)}
<linearGradient id="${p}lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFBF2"/><stop offset=".5" stop-color="#EADBBF"/><stop offset="1" stop-color="#F6EFE0"/></linearGradient>
</defs><polygon points="${EC_FLAP}" fill="url(#${p}flg)"/><polygon points="${EC_FLAP}" fill="url(#${p}fls)"/>
<polygon points="0,0 260,0 260,199.89 0,1.89" fill="url(#${p}el)"/><polygon points="260,0 520,0 520,1.89 260,199.89" fill="url(#${p}er)"/>
<polygon points="${EC_FLAP}" fill="url(#${p}pp)" opacity=".7"/></svg>
<span class="elogo" aria-hidden="true"><svg viewBox="0 0 117 22"><path d="${LOGO_D}" fill="url(#${p}lg)"/></svg><span class="gl"><i></i></span></span>
<svg class="shd" viewBox="0 0 520 202" aria-hidden="true"><polygon points="${EC_FLAP}" fill="#000"/></svg></div>
<div class="fb"><svg viewBox="0 0 520 202" aria-hidden="true"><defs><linearGradient id="${p}fbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff63a0"/><stop offset="1" stop-color="#d93573"/></linearGradient></defs>
<polygon points="${EC_FLAP}" fill="url(#${p}fbg)"/><polygon points="${EC_FLAP}" fill="url(#${p}ml)" opacity=".2"/><polygon points="${EC_FLAP}" fill="url(#${p}pp)" opacity=".55"/></svg>
<svg class="shd" viewBox="0 0 520 202" aria-hidden="true"><polygon points="${EC_FLAP}" fill="#000"/></svg></div></div>
<div class="seal"></div>`;
  {
    const ec = $('#ecP');
    ec.innerHTML = ENV('e0');
    ec.style.setProperty('--lm', LOGO_MASK)
  }

  /* ── один таймлайн на JS: аналитические пружины (response, ζ) и кривые; кадр = функция времени, без накопления ошибок ── */
  const lerp = (a, b, p) => a + (b - a) * p;
  const EZ = {
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    in: t => t * t * t,
    sine: t => .5 - .5 * Math.cos(Math.PI * t)
  };

  function springAt(response, zeta, t) {
    if (t <= 0) return 0;
    const w = 2 * Math.PI / response;
    if (zeta < 1) {
      const wd = w * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + zeta * w / wd * Math.sin(wd * t))
    }
    return 1 - Math.exp(-w * t) * (1 + w * t)
  }
  const tSp = (t, t0, r, z) => springAt(r, z, (t - t0) / 1000);
  const tSeg = (t, t0, d, e) => {
    const p = Math.min(1, Math.max(0, (t - t0) / d));
    return e ? e(p) : p
  };

  function runTL(render, alive) {
    return new Promise(res => {
      let t0 = null;
      const f = now => {
        if (!alive()) return res(false);
        if (t0 === null) t0 = now;
        if (render(now - t0)) return res(true);
        requestAnimationFrame(f)
      };
      requestAnimationFrame(f)
    })
  }

  /* ── состояние конверта ── */
  function envOf(ec) {
    const cs = getComputedStyle(ec);
    return {
      ec,
      top: parseFloat(cs.top) || 0,
      es: parseFloat(cs.getPropertyValue('--es')) || 1,
      card: $('.card', ec),
      csh: $('.csh', ec),
      crg: $('.crg', ec),
      seal: $('.seal', ec),
      fl: $('.fl', ec),
      ff: $('.ff', ec),
      fb: $('.fb', ec),
      shd: $$('.shd', ec),
      fsh: $('.fsh', ec),
      bk: $('.bk', ec),
      front: $('.front', ec),
      shadow: $('.shadow', ec),
      cx: 0,
      cy: 380,
      cs: 1,
      cur: null
    }
  }
  // x, y – сдвиг в px кадра; k – масштаб вокруг центра конверта поверх базового --es; r – поворот
  function envSet(E, {
    x = 0,
    y = 0,
    k = 1,
    r = 0
  } = {}) {
    const s = E.es * k,
      ty = y + 170 * E.es * (1 - k);
    E.ec.style.transform = `translate3d(${x.toFixed(2)}px,${ty.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg) scale(${s.toFixed(5)})`;
    E.cur = {
      x,
      y: ty,
      s
    }
  }
  // a: 0 – закрыт, 180 – открыт. Слой меняется строго на 90° (клапан ребром); затемнение к 90° до яркости .75 и обратно
  // сторона клапана (лицо / изнанка) переключается здесь же, явно: вместе со слоем, на 90°
  function envFlap(E, a) {
    E.fl.style.transform = `rotateX(${(-a).toFixed(3)}deg)`;
    const bk = a > 90;
    E.fl.style.zIndex = bk ? '1' : '5';
    E.ff.style.visibility = bk ? 'hidden' : 'inherit';
    E.fb.style.visibility = bk ? 'inherit' : 'hidden';
    const d = (.25 * Math.sin(Math.max(0, Math.min(180, a)) * Math.PI / 180)).toFixed(3);
    E.shd.forEach(e => e.style.opacity = d);
    E.fsh.style.opacity = Math.max(0, 1 - a / 40).toFixed(3)
  }

  function envCard(E, ty, sc = 1, tx = 0) {
    E.card.style.transform = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${sc.toFixed(5)})`;
    E.cx = tx;
    E.cy = ty;
    E.cs = sc
  }

  function envReset(ec, {
    open,
    sunk,
    seal
  }) {
    ec.className = 'ec';
    ec.style.transform = '';
    ec.style.opacity = '';
    ec.style.translate = '';
    ec.style.scale = '';
    $('.card img', ec).src = CARD_SRC;
    const E = envOf(ec);
    [E.bk, E.front, E.ff, E.fb, E.shadow, E.seal, E.card, E.csh, E.crg].forEach(e => {
      e.style.opacity = '';
      e.style.transform = ''
    });
    envFlap(E, open ? 180 : 0);
    envCard(E, sunk ? 380 : 0);
    if (!seal) E.seal.style.opacity = '0';
    return E
  }

  /* ── 05 · упаковка: конверт въезжает, карта уходит в карман, клапан закрывается, печать прилипает, конверт улетает по дуге ── */
  let packTok = 0;
  async function runPack() {
    const tok = ++packTok,
      ec = $('#ecP'),
      txt = $('#pkTxt'),
      alive = () => tok === packTok && S.screen === 'pack';
    const E = envReset(ec, {
      open: true,
      sunk: false,
      seal: false
    });
    txt.classList.remove('two');
    if (RM) {
      envFlap(E, 0);
      envCard(E, 380);
      E.seal.style.opacity = '';
      ec.style.opacity = '1';
      txt.classList.add('two');
      await new Promise(r => setTimeout(r, 900));
      if (!alive()) return;
      S.fresh = true;
      return go('done')
    }
    ec.classList.add('anim');
    const T1 = 1000,
      T2 = 2250,
      T3 = 3300,
      T4 = 4500,
      u = E.es / .8077;
    let stamped = false;
    const ok = await runTL(t => {
      const pin = tSp(t, 0, .9, .86); // вход снизу
      envCard(E, lerp(0, 380, tSeg(t, T1, 1150, EZ.inOut))); // карта в карман
      envFlap(E, 180 * (1 - tSp(t, T2, 1, .9))); // клапан закрывается
      let k = 1,
        x = 0,
        y = lerp(56, 0, pin) * u,
        r = 0,
        op = tSeg(t, 0, 650, EZ.out);
      if (t >= T3) {
        if (!stamped) {
          stamped = true;
          txt.classList.add('two');
          ec.classList.add('shine')
        }
        E.seal.style.opacity = tSeg(t, T3, 120).toFixed(3);
        E.seal.style.transform = `scale(${lerp(1.6,1,tSp(t,T3,.42,.55)).toFixed(4)})`;
        const hit = T3 + 110;
        k = 1 - .02 * (tSeg(t, hit, 80, EZ.out) - tSp(t, hit + 80, .45, .6))
      } // печать прилипла: проседание .98 и возврат
      const ant = tSeg(t, T4, 140, EZ.out) - tSeg(t, T4 + 140, 200, EZ.inOut);
      y += 8 * u * ant;
      k *= 1 - .012 * ant; // замах
      const f = tSeg(t, T4 + 140, 900);
      if (f > 0) {
        x = 70 * u * EZ.out(f);
        y -= (380 * f * f + 40 * f) * u;
        r = -4.5 * EZ.out(f);
        k *= 1 - .34 * EZ.in(f);
        op *= 1 - tSeg(t, T4 + 140 + 400, 500, EZ.inOut)
      } // улёт по дуге
      envSet(E, {
        x,
        y,
        k,
        r
      });
      ec.style.opacity = op.toFixed(3);
      return t >= T4 + 140 + 940
    }, alive);
    if (!ok) return;
    S.fresh = true;
    go('done')
  }
  $('#skip').onclick = () => {
    packTok++;
    S.fresh = true;
    go('done')
  };

  /* ── успех: 5 статусов ──
     a – отправлено, b – отложено, v – ссылка, g – отправляем (сразу после упаковки, через 2,4 с сменяется на «a»), d – PDF себе */
  const ICON_REFRESH = '<path d="M16.5 7.5A7 7 0 0 0 4 6.2M3.5 12.5A7 7 0 0 0 16 13.8M4 3v3.4h3.4M16 17v-3.4h-3.4"/>';
  const ICON_SEND = '<path d="M3 3.5l14 6.5-14 6.5 2.6-6.5L3 3.5zM5.6 10H17"/>';
  const statusKey = () => DEMO.force || ((S.when && !S.sentNow) ? 'b' : S.pdf ? 'd' : 'a');

  function doneCopy(k) {
    const to = USER_EMAIL,
      w = `${S.date.getDate()} ${MONG[S.date.getMonth()]} в ${pad(S.hh)}:${pad(S.mm)} по Минску`;
    switch (k) {
      case 'a':
        return {
          t: `Отправили SMS с подарком на ${phonePretty()}.\nЧек улетел на ${to}.`, l: ['Отправить ещё раз', ICON_REFRESH]
        };
      case 'b':
        return {
          t: `Оплачено. Отправим ${w}\nЧек отправили на ${to}`, l: ['Отправить сейчас', ICON_SEND]
        };
      case 'v':
        return {
          t: `Оплачено. Ссылка на подарок готова\nЧек отправили на ${to}`
        };
      case 'g':
        return {
          t: `Оплачено. Отправляем подарок\nЧек отправили на ${to}`, l: ['Отправить ещё раз', ICON_REFRESH], dis: true
        };
      case 'd':
        return {
          t: `Подарок улетел к вам на ${S.email||USER_EMAIL}!\nЧек мы отправили туда же.`
        }
    }
  }

  function renderDone(k, anim) {
    const c = doneCopy(k),
      sc = $('.scr[data-s="done"]'),
      dn2 = $('#dn2'),
      lnk = $('#lnk'),
      box = $('#lbox'),
      dl = $('#dl');
    const apply = () => {
      dn2.textContent = c.t;
      sc.classList.toggle('v', k === 'v');
      lnk.hidden = !c.l;
      lnk.classList.toggle('dis', !!c.dis);
      if (c.l) {
        $('#lnkT').textContent = c.l[0];
        const i = $('#lnkI');
        i.innerHTML = c.l[1];
        i.classList.remove('sw');
        void i.getBoundingClientRect();
        i.classList.add('sw')
      }
      box.hidden = k !== 'v';
      dl.hidden = k !== 'd';
      $('#lnkV').textContent = LINK_SAMPLE;
      dn2.classList.remove('swap')
    };
    if (anim) {
      dn2.classList.add('swap');
      setTimeout(apply, 260)
    } else apply()
  }

  function showDone() {
    let k = statusKey();
    if (k === 'a' && S.fresh && !DEMO.force) {
      S.fresh = false;
      renderDone('g');
      setTimeout(() => {
        if (S.screen === 'done') renderDone('a', true)
      }, RM ? 100 : 2400)
    } else {
      S.fresh = false;
      renderDone(k)
    }
  }
  $('#lnk').onclick = async () => {
    const b = $('#lnk');
    if (b.classList.contains('dis')) return;
    b.classList.add('go');
    setTimeout(() => b.classList.remove('go'), 700);
    if (S.when && !S.sentNow) {
      S.sentNow = true;
      await sleep(450);
      renderDone(statusKey(), true)
    }
  }
  $('#cpL').onclick = () => {
    try {
      navigator.clipboard && navigator.clipboard.writeText(LINK_SAMPLE)
    } catch (_) {}
    const b = $('#cpL');
    b.classList.add('ok');
    b.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5l3.8 3.8L16 6.5"/></svg>';
    sfx('ok');
    setTimeout(() => {
      b.classList.remove('ok');
      b.innerHTML = ICON_COPY
    }, 1800)
  };
  const ICON_COPY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8"/><path d="M10.5 3.8V3.5a1.5 1.5 0 0 0-1.5-1.5H3.8A1.8 1.8 0 0 0 2 3.8V9a1.5 1.5 0 0 0 1.5 1.5H4"/></svg>';
  $('#dl').onclick = () => {
    const b = $('#dl');
    b.classList.add('done');
    $('#dlT').textContent = 'Скачано';
    setTimeout(() => {
      b.classList.remove('done');
      $('#dlT').textContent = 'Скачать карту'
    }, 2200)
  };
  $('#toRcpt').onclick = () => {
    location.href = '../gift/'
  };

  /* ── переход между экранами: старый уходит (.out), новый входит (.in), элементы с data-a появляются каскадом (--i) ── */
  function go(to) {
    const from = S.screen;
    if (from === to) return;
    const a = from && $(`.scr[data-s="${from}"]`),
      b = $(`.scr[data-s="${to}"]`);
    if (a) {
      a.classList.remove('in');
      a.classList.add('out');
      setTimeout(() => {
        if (!a.classList.contains('in')) {
          a.classList.remove('act', 'out')
        }
      }, 300)
    }
    b.classList.remove('out');
    b.classList.add('act');
    let k = 0;
    $$('[data-a]', b).forEach(el => el.style.setProperty('--i', k++));
    void b.offsetWidth;
    b.classList.add('in');
    S.screen = to;
    app.dataset.s = to;
    $('#hTitle').textContent = to === 'done' ? 'Готово' : '';
    if (to === 'pack') runPack();
    if (to === 'done') showDone();
    syncBadge();
    layout()
  }

  $('#logo').onclick = $('#closeB').onclick = () => {
    location.href = '../'
  };

  /* ── статус: из ссылки (?status=) или из демо-панели (D) ── */
  function setStatus(v) {
    DEMO.force = (v === 'b' || v === 'd') ? '' : v;
    S.when = v === 'b' ? 1 : 0;
    S.sentNow = false;
    S.pdf = v === 'd';
    $('#dStat').value = v;
    if (S.screen === 'done') showDone()
  }
  $('#dStat').onchange = e => setStatus(e.target.value);
  $('#dSnd').onchange = e => {
    DEMO.sound = e.target.checked
  };

  addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === 'd' || e.key === 'в' || e.key === 'D' || e.key === 'В') document.body.classList.toggle('demo')
  });
  if (Q.has('demo')) document.body.classList.add('demo');

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

  /* старт */
  setStatus(Q.get('status') || '');
  fit();
  layout(true);
  go(Q.get('screen') === 'done' ? 'done' : 'pack');
})();
