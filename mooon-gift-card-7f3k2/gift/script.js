/* mooon, подарочная карта: страница получателя (ссылка из SMS).
   Экраны: «Открытие» (конверт, doOpen) → «Woow! Это – вам» → «Это – про вас» (пожелание) → «Вас ждут великие дела!» (карта) + модалки (Wallet, файл, вход и регистрация).
   Параметры ссылки: ?rv=wish|nowish|surp – с пожеланием / без пожелания / сюрприз; ?view=sender – страницу открыл отправитель (карта без номера и кнопок); ?theme=dark; ?demo – демо-панель (клавиша D).
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

  const AMOUNT = 100; // номинал карты, BYN
  const SAMPLE_WISH = 'С днём рождения! Пусть в этом году будет много хорошего кино.';
  const DEMO = {
    sound: true
  };
  /* from – от кого, wish – пожелание, surprise – отправитель скрыт */
  /* snd – страницу открыл отправитель («Как выглядит подарок»): номер карты видит только получатель */
  const S = {
    screen: null,
    from: 'Денис',
    wish: SAMPLE_WISH,
    surprise: false,
    snd: Q.get('view') === 'sender'
  };

  function setVariant(v) {
    S.from = 'Денис';
    S.wish = v === 'nowish' ? '' : SAMPLE_WISH;
    S.surprise = v === 'surp'
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

  /* тост */
  function toast(t) {
    const el = $('#toast');
    el.textContent = t;
    el.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('on'), 2400)
  }
  const mailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const fmtPhone = v => {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('375')) d = d.slice(3);
    d = d.slice(0, 9);
    let o = '+375';
    if (d.length) o += ' ' + d.slice(0, 2);
    if (d.length > 2) o += ' ' + d.slice(2, 5);
    if (d.length > 5) o += '-' + d.slice(5, 7);
    if (d.length > 7) o += '-' + d.slice(7, 9);
    return o
  }
  const phoneOkS = v => /^(25|29|33|44)\d{7}$/.test(v.replace(/\D/g, '').replace(/^375/, ''));

  function target(sc) {
    if (M) {
      const cx = W / 2,
        sl = sc === 'woow' || sc === 'msg' || sc === 'card' ? slotOf(sc) : null;
      return sl ? {
        ...sl,
        op: 1
      } : {
        cx,
        cy: 300,
        d: 200,
        op: 0
      }
    }
    if (sc === 'woow') return {
      cx: 720,
      cy: 320,
      d: 300,
      op: 1
    };
    if (sc === 'msg' || sc === 'card') return {
      cx: 325,
      cy: 415,
      d: 470,
      op: 1
    };
    return {
      cx: 720,
      cy: 470,
      d: 300,
      op: 0
    }
  }

  function syncBadge() {
    $('#badge').classList.toggle('hid', M || !(S.screen === 'msg' || S.screen === 'card'))
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
    if (S.screen !== 'open') {
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

  /* ── звук и вибро: только по действию пользователя ── */
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
  const vib = n => {
    try {
      navigator.vibrate && navigator.vibrate(n)
    } catch (_) {}
  };

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
    const ec = $('#ecO');
    ec.innerHTML = ENV('e1');
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
  // доля карты, вышедшая из кармана (0…1): сетка точек внутри круга карты против V-кромки переда
  function cardOut(E) {
    const r = 150 * E.cs,
      cx = 260 + E.cx,
      cy = -15 + E.cy;
    let tot = 0,
      cov = 0;
    for (let i = 0; i < 14; i++)
      for (let j = 0; j < 14; j++) {
        const x = cx - r + (i + .5) * r / 7,
          y = cy - r + (j + .5) * r / 7;
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        tot++;
        if (y >= 340 || (x > 0 && x < 520 && y > 198 - Math.abs(x - 260) * 198 / 260)) cov++
      }
    return tot ? 1 - cov / tot : 1
  }

  /* ── путь получателя ── */
  /* имя отправителя подставляется как введено, в именительном падеже, без склонения */

  const slotOf = sc => {
    const el = $(sc === 'woow' ? '#slotW' : sc === 'msg' ? '#slotM' : '#slotC');
    if (!el) return null;
    const r = el.getBoundingClientRect(),
      f = frame.getBoundingClientRect(),
      k = f.width / W;
    if (!r.width) return null;
    return {
      cx: (r.left - f.left + r.width / 2) / k,
      cy: (r.top - f.top + r.height / 2) / k,
      d: r.width / k
    }
  };
  /* ── конфетти: canvas поверх сцены. Три формы (бумажки, «луны», серпантин), две волны, глубина (мелкие дальше и медленнее),
     переворот с бликом, парение: сопротивление воздуха, предельная скорость падения, раскачивание. ── */
  const cfx = document.createElement('canvas');
  cfx.id = 'cfx';
  frame.appendChild(cfx);
  let cfP = [],
    cfRaf = 0;
  const CFC = [
    ['#E8397A', '#A8164F'],
    ['#FF8FB5', '#D45F88'],
    ['#6B52C9', '#3E2A86'],
    ['#A592F0', '#6F5BC4'],
    ['#F6EFE0', '#CBBB98'],
    ['#FFD27A', '#D39A2E']
  ];

  function cfSpawn(x, y, R, k, pw, n) {
    for (let i = 0; i < n; i++) {
      const kind = Math.random() < .2 ? 'rib' : Math.random() < .3 ? 'disc' : 'rect',
        z = .6 + Math.random() * .75;
      const th = (-90 + (Math.random() * 2 - 1) * 75) * Math.PI / 180,
        rr = R * (.35 + Math.random() * .55),
        dir = th + (Math.random() * 2 - 1) * .35,
        v = (560 + Math.random() * 980) * pw * k * (.7 + .3 * z);
      cfP.push({
        kind,
        z,
        k,
        x: x + Math.cos(th) * rr,
        y: y + Math.sin(th) * rr * .8,
        vx: Math.cos(dir) * v,
        vy: Math.sin(dir) * v,
        rot: Math.random() * 6.283,
        vrot: (Math.random() * 2 - 1) * 6,
        flip: Math.random() * 6.283,
        vflip: 4 + Math.random() * 9,
        sw: Math.random() * 6.283,
        vsw: 1.8 + Math.random() * 2.4,
        amp: (14 + Math.random() * 26) * k,
        w: (kind === 'rib' ? 7 : kind === 'disc' ? 10 + Math.random() * 5 : 10 + Math.random() * 6) * k * z,
        h: (kind === 'rib' ? 48 + Math.random() * 40 : 15 + Math.random() * 9) * k * z,
        term: (kind === 'rib' ? 90 : kind === 'disc' ? 175 : 125) * k * (.65 + .35 * z),
        c: CFC[(Math.random() * CFC.length) | 0],
        t: 0,
        life: 3.8 + Math.random() * 1.8
      })
    }
    cfP.sort((a, b) => a.z - b.z)
  }

  function confettiBurst(x, y, R) {
    if (RM) return;
    const s = parseFloat(frame.style.getPropertyValue('--s')) || 1,
      dpr = Math.min(2, devicePixelRatio || 1),
      k = M ? .8 : 1;
    cfx.width = Math.round(W * s * dpr);
    cfx.height = Math.round(H * s * dpr);
    cfx.style.width = W + 'px';
    cfx.style.height = H + 'px';
    cfSpawn(x, y, R, k, 1, M ? 90 : 150);
    setTimeout(() => cfSpawn(x, y, R, k, .62, M ? 40 : 70), 130);
    if (cfRaf) return;
    let last = performance.now();
    const ctx = cfx.getContext('2d');
    const f = t => {
      const dt = Math.min(.034, Math.max(0, (t - last) / 1000));
      last = t;
      const keep = ['open', 'woow', 'msg', 'card'].includes(S.screen);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cfx.width, cfx.height);
      ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
      const dr = Math.exp(-2.4 * dt);
      cfP = cfP.filter(p => {
        p.t += dt;
        if (!keep || p.t > p.life || p.y > H + 90) return false;
        p.vx *= dr;
        p.vy = p.vy * dr + 1150 * p.k * dt;
        if (p.vy > p.term) p.vy = p.term + (p.vy - p.term) * Math.exp(-5 * dt);
        const fall = Math.max(0, Math.min(1, p.vy / p.term));
        p.sw += p.vsw * dt;
        p.x += p.vx * dt + Math.cos(p.sw) * p.amp * p.vsw * dt * fall;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt * (.35 + .65 * fall) + Math.cos(p.sw) * .7 * dt * fall;
        p.flip += p.vflip * dt;
        const al = Math.min(1, p.t / .05) * Math.min(1, (p.life - p.t) / .9);
        ctx.globalAlpha = al;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.kind === 'rib') {
          const n = 14,
            L = p.h,
            A = p.w * 1.15;
          ctx.lineWidth = p.w * .62;
          ctx.lineCap = 'round';
          let px = Math.sin(p.flip) * A,
            py = -L / 2;
          for (let j = 1; j <= n; j++) {
            const ph = j * .5 + p.flip,
              nx = Math.sin(ph) * A,
              ny = -L / 2 + j * L / n;
            ctx.strokeStyle = Math.cos(ph) > 0 ? p.c[0] : p.c[1];
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(nx, ny);
            ctx.stroke();
            px = nx;
            py = ny
          }
        } else {
          const cf = Math.cos(p.flip),
            g = Math.abs(cf);
          ctx.fillStyle = cf > 0 ? p.c[0] : p.c[1];
          ctx.beginPath();
          if (p.kind === 'disc') {
            ctx.scale(Math.max(.08, g), 1);
            ctx.arc(0, 0, p.w / 2, 0, 6.283)
          } else {
            ctx.scale(1, Math.max(.06, g));
            if (ctx.roundRect) ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 1.6 * p.k);
            else ctx.rect(-p.w / 2, -p.h / 2, p.w, p.h)
          }
          ctx.fill();
          if (g > .8) {
            ctx.globalAlpha = al * (g - .8) / .2 * .55;
            ctx.fillStyle = '#fff';
            ctx.fill()
          }
        }
        ctx.restore();
        return true
      });
      ctx.globalAlpha = 1;
      if (cfP.length) cfRaf = requestAnimationFrame(f);
      else {
        cfRaf = 0;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cfx.width, cfx.height)
      }
    };
    cfRaf = requestAnimationFrame(f)
  }

  /* ── 07 · открытие: вход конверта пружиной; по клику – печать → клапан → карта выходит из кармана → конверт уходит → «Woow» ── */
  let openTok = 0,
    opened = false;
  // место и размер диска на «Woow» (мобилка: экран скрыт до перехода – на мгновение включаем раскладку и меряем слот)
  function woowTarget() {
    const sw = $('.scr[data-s="woow"]'),
      had = sw.classList.contains('act');
    if (!had) sw.classList.add('act');
    const t = target('woow');
    if (!had) sw.classList.remove('act');
    return t
  }

  function initOpen() {
    opened = false;
    const tok = ++openTok,
      ec = $('#ecO'),
      E = envReset(ec, {
        open: false,
        sunk: true,
        seal: true
      });
    ec.style.pointerEvents = '';
    ec.classList.add('idle');
    if (RM) {
      ec.style.opacity = '1';
      return
    }
    ec.classList.add('anim');
    runTL(t => {
      const p = tSp(t, 0, .95, .8);
      envSet(E, {
        y: lerp(90 * E.es, 0, p),
        k: lerp(.9, 1, p)
      });
      ec.style.opacity = tSeg(t, 0, 500, EZ.out).toFixed(3);
      if (t > 1400) {
        envSet(E);
        ec.classList.remove('anim');
        return true
      }
    }, () => tok === openTok && S.screen === 'open' && !opened)
  }
  async function doOpen() {
    if (opened || S.screen !== 'open') return;
    opened = true;
    const tok = openTok,
      alive = () => tok === openTok && S.screen === 'open';
    const ec = $('#ecO'),
      seal = $('.seal', ec);
    const s0 = new DOMMatrix(getComputedStyle(seal).transform).a || 1; // печать стартует с текущего масштаба (дыхание / наведение / нажатие)
    ec.classList.remove('idle');
    ec.style.pointerEvents = 'none';
    const E = envOf(ec);
    E.cx = 0;
    E.cy = 380;
    E.cs = 1;
    if (RM) {
      ec.style.opacity = '0';
      await sleep(200);
      return go('woow')
    }
    ec.classList.add('anim');
    envSet(E);
    const T = woowTarget(),
      TC = 1420,
      u = E.es;
    sfx('pop');
    vib(8);
    let tOut = null,
      tFull = null,
      snd = 0,
      chimed = false,
      pc = 0;
    const frameCard = () => {
      const c = E.cur;
      return {
        x: W / 2 + c.x + E.cx * c.s,
        y: E.top + c.y + (-15 + E.cy) * c.s,
        r: 150 * E.cs * c.s
      }
    };
    const ok = await runTL(t => {
      // 0–180 нажатие печати (.92), конверт проседает (.985); 180–480 печать отпускается (1.25) и гаснет
      const sP = lerp(s0, .92, tSeg(t, 0, 180, EZ.out));
      seal.style.transform = `scale(${lerp(sP,1.25,tSeg(t,180,300,EZ.out)).toFixed(4)})`;
      seal.style.opacity = (1 - tSeg(t, 210, 270, EZ.inOut)).toFixed(3);
      let k = 1 - .015 * tSeg(t, 0, 180, EZ.out) + .015 * tSp(t, 180, .5, .7);
      // 300–1300 клапан: пружина response 1.2 / ζ .9
      if (t >= 300 && snd < 1) {
        snd = 1;
        sfx('whoosh')
      }
      envFlap(E, 180 * tSp(t, 300, 1.2, .9));
      // 1420… карта выходит из кармана (response 1.3 / ζ .82 – перелёт ≤ 6 px), конверт отвечает сдвигом вниз на 12 px
      if (t >= TC && snd < 2) {
        snd = 2;
        sfx('slide');
        vib(14)
      }
      pc = tSp(t, TC, 1.3, .82);
      let y = 12 * u * tSp(t, TC + 60, .7, .75),
        op = 1;
      // конверт опускается и гаснет (600 мс) – только когда карта вышла на 70 %+, не раньше 2600
      if (tOut !== null) {
        const t0 = Math.max(2600, tOut),
          f = tSeg(t, t0, 600, EZ.inOut);
        y += 150 * u * EZ.in(tSeg(t, t0, 600));
        k *= 1 - .06 * f;
        op = 1 - f
      }
      envSet(E, {
        y,
        k
      });
      // карта держит курс на диск «Woow» в координатах кадра, пока конверт под ней движется
      const c = E.cur,
        ty = (T.cy - E.top - c.y) / c.s + 15,
        tx = (T.cx - W / 2 - c.x) / c.s,
        sc = (T.d / 300) / c.s;
      envCard(E, lerp(380, ty, pc), lerp(1, sc, pc), lerp(0, tx, pc));
      const land = tSeg(pc, .6, .4);
      E.csh.style.opacity = (1 - land).toFixed(3);
      E.crg.style.opacity = land.toFixed(3); // тень → кольцо диска «Woow»
      [E.bk, E.front, E.ff, E.fb, E.shadow].forEach(e => e.style.opacity = op.toFixed(3));
      if (pc > 0) {
        const o = cardOut(E);
        if (tOut === null && o >= .7) tOut = t;
        if (tFull === null && o >= .995) {
          tFull = t;
          const fc = frameCard();
          confettiBurst(fc.x, fc.y, fc.r)
        }
      } // конфетти – когда карта целиком вышла
      if (!chimed && pc > .96) {
        chimed = true;
        sfx('chime');
        vib(12)
      }
      if (tOut !== null && t >= Math.max(2600, tOut) + 600 && t >= TC + 1750) {
        envCard(E, ty, sc, tx);
        E.csh.style.opacity = '0';
        E.crg.style.opacity = '1';
        return true
      }
    }, alive);
    if (!ok) return;
    E.card.style.opacity = '0';
    go('woow')
  } // подмена за один кадр: карта гаснет в том же тике, когда встаёт диск «Woow»
  $('#ecO').onclick = doOpen;
  $('#ecO').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      doOpen()
    }
  });
  const ICON_COPY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8"/><path d="M10.5 3.8V3.5a1.5 1.5 0 0 0-1.5-1.5H3.8A1.8 1.8 0 0 0 2 3.8V9a1.5 1.5 0 0 0 1.5 1.5H4"/></svg>';
  const BD = () => {
    const t = AMOUNT + ' BYN';
    ['#wBd', '#mbW', '#mbM', '#mbC'].forEach(s => $(s).textContent = t)
  };

  function fillWoow() {
    BD();
    const from = S.from.trim(),
      el = $('#w1');
    el.textContent = (S.surprise || !from) ? 'Кажется, внутри что-то особенное' : `${from} дарит вам что-то особенное`;
    el.parentNode.style.setProperty('--wx', Math.max(0, el.offsetHeight - 28) + 'px')
  } // длинное имя уходит на вторую строку – кнопка «открыть» сдвигается вниз
  function fillMsg() {
    BD();
    const w = S.wish.trim();
    $('#msgB').textContent = w + (S.surprise || !S.from.trim() ? '' : `\n– ${S.from.trim()}`)
  }

  function fillCard() {
    BD();
    $('.scr[data-s="card"]').classList.toggle('snd', !!S.snd); /* snd – экран открыл отправитель («Как выглядит подарок»): номер карты видит только получатель */
    $('#csub').textContent = `Подарочная карта mooon на ${AMOUNT} BYN`;
    const a = new Date(),
      b = new Date(a);
    b.setFullYear(b.getFullYear() + 1);
    const f = d => `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`;
    $('#exp').textContent = `Срок действия: с ${f(a)} до ${f(b)}`;
    ['#cp'].forEach(s => {
      $(s).classList.remove('ok');
      $(s).innerHTML = ICON_COPY
    });
    $('#dlB').classList.remove('busy')
  }
  $('#openGift').onclick = () => {
    sfx('ok');
    go(S.wish.trim() ? 'msg' : 'card')
  };
  $('#smile').onclick = () => go('card');
  $('#cp').onclick = () => {
    try {
      navigator.clipboard && navigator.clipboard.writeText('0101 0101 1100 1010')
    } catch (_) {}
    const b = $('#cp');
    b.classList.add('ok');
    b.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-6.5"/></svg>';
    sfx('ok');
    setTimeout(() => {
      b.classList.remove('ok');
      b.innerHTML = ICON_COPY
    }, 1800)
  };

  /* ── модалки: Wallet, «Файл загружен», вход и регистрация ── */
  const ov2 = $('#ov2');

  function openM2(id) {
    ov2.classList.add('on');
    $$('.gm').forEach(m => {
      const on = m.id === id;
      m.classList.toggle('act', on);
      if (on) {
        m.classList.add('pre');
        void m.offsetWidth;
        m.classList.remove('pre')
      }
    })
  }

  function closeM2() {
    ov2.classList.remove('on');
    setTimeout(() => $$('.gm').forEach(m => m.classList.remove('act')), 350)
  }
  ov2.addEventListener('click', e => {
    if (e.target === ov2 || e.target.classList.contains('ovc') || e.target.closest('[data-close]')) closeM2()
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && ov2.classList.contains('on')) closeM2()
  });
  $('#dlB').onclick = async () => {
    const b = $('#dlB');
    if (b.classList.contains('busy')) return;
    b.classList.add('busy');
    await sleep(1000);
    b.classList.remove('busy');
    openM2('gmF')
  };
  $('#openF').onclick = closeM2;
  $('#wlB').onclick = () => {
    $('#gmWs').textContent = `Подарочная карта mooon на ${AMOUNT} BYN`;
    openM2('gmW')
  };
  $$('.wbtn').forEach(b => b.onclick = () => {
    sfx('ok');
    closeM2();
    $('#wlB').classList.add('okk')
  });
  (function qr() {
    const n = 25;
    let seed = 7,
      rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647,
      c = '';
    const fin = (x, y) => (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let on;
        if (fin(x, y)) {
          const lx = x < 7 ? x : x > n - 8 ? x - (n - 7) : x,
            ly = y < 7 ? y : y - (n - 7);
          on = lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4)
        } else on = rnd() > .52;
        if (on) c += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`
      }
    $('#qr').innerHTML = `<svg viewBox="0 0 ${n} ${n}" fill="#0c0c0e" shape-rendering="crispEdges">${c}</svg>`
  })();

  /* ── вход и регистрация ── */
  const AU = {
    pane: 'login',
    cons: [false, false, false],
    t: 87,
    iv: 0
  };

  function aShow(n) {
    AU.pane = n;
    $$('#gmA .ap').forEach(e => e.classList.toggle('on', e.dataset.p === n));
    $('#aTabs').classList.toggle('hid', n === 'reg4');
    $$('#aTabs button').forEach(b => b.classList.toggle('on', (b.dataset.t === 'login') === (n === 'login')));
    clearInterval(AU.iv);
    if (n === 'reg2') {
      AU.t = 87;
      aTick();
      AU.iv = setInterval(() => {
        AU.t = Math.max(0, AU.t - 1);
        aTick()
      }, 1000)
    }
    aSync()
  }

  function aTick() {
    $('#aTimer').textContent = AU.t > 0 ? `Отправить код повторно или изменить номер телефона можно будет через ${AU.t} сек` : 'Отправить код повторно или изменить номер телефона можно'
  }

  function aSync() {
    $('#aGo2').classList.toggle('on', phoneOkS($('#aPh').value) && AU.cons[0] && AU.cons[1]);
    $$('#gmA .ac[data-c]').forEach(b => {
      const i = +b.dataset.c;
      b.classList.toggle('on', AU.cons[i]);
      b.setAttribute('aria-checked', AU.cons[i])
    })
  }
  $$('#aTabs button').forEach(b => b.onclick = () => aShow(b.dataset.t === 'login' ? 'login' : 'reg1'));
  $('#aPh').addEventListener('input', e => {
    e.target.value = fmtPhone(e.target.value);
    aSync()
  });
  $$('#gmA .ac[data-c]').forEach(b => b.onclick = () => {
    const i = +b.dataset.c;
    AU.cons[i] = !AU.cons[i];
    aSync()
  });
  $('#aRm').onclick = () => {
    const b = $('#aRm');
    b.classList.toggle('on');
    b.setAttribute('aria-checked', b.classList.contains('on'))
  };
  $('#aEye').onclick = () => {
    const b = $('#aEye'),
      i = $('#aPw'),
      on = i.type === 'password';
    i.type = on ? 'text' : 'password';
    b.classList.toggle('on', on)
  };
  const shk = el => {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake')
  };
  $('#aGo1').onclick = () => {
    const id = $('#aId'),
      pw = $('#aPw');
    let ok = true;
    [id, pw].forEach(e => {
      const bad = e.value.trim().length < 3;
      e.classList.toggle('bad', bad);
      if (bad) ok = false
    });
    if (!ok) return shk($('#aGo1'));
    sfx('ok');
    closeM2();
    const b = $('#toProf');
    b.classList.add('saved');
    b.textContent = 'Карта в профиле'
  };
  $('#aGo2').onclick = () => {
    if (!$('#aGo2').classList.contains('on')) return shk($('#aGo2'));
    aShow('reg2');
    setTimeout(() => $('#aCode').focus(), 200)
  };
  $('#aCode').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.classList.remove('bad')
  });
  $('#aGo3').onclick = () => {
    if ($('#aCode').value.length < 4) {
      $('#aCode').classList.add('bad');
      return shk($('#aGo3'))
    }
    aShow('reg3')
  };
  $('#aGo4').onclick = () => {
    const n = $('#aName'),
      m = $('#aMail');
    const bn = !n.value.trim(),
      bm = !mailOk(m.value.trim());
    n.classList.toggle('bad', bn);
    m.classList.toggle('bad', bm);
    if (bn || bm) return shk($('#aGo4'));
    $('#aSent').textContent = `Отправили письмо на ${m.value.trim()}. Перейдите по ссылке из письма, чтобы активировать профиль, и подарок появится в нём.`;
    aShow('reg4')
  };
  $('#aChg').onclick = () => aShow('reg3');
  $('#aAgain').onclick = () => toast('Письмо отправлено ещё раз');
  $('#toProf').onclick = () => {
    aShow('login');
    openM2('gmA')
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
    if (to === 'open') initOpen();
    if (to === 'woow') {
      fillWoow();
      const el = disc;
      el.style.transition = 'opacity 0s';
      setTimeout(() => el.style.transition = '', 700); // подмена карты из конверта на диск – за один кадр
      if (from === 'open') {
        const g = $('.glow', el);
        g.style.transition = 'none';
        g.style.opacity = '0';
        void g.offsetWidth;
        g.style.transition = 'opacity 1s var(--ease) .15s';
        g.style.opacity = '';
        setTimeout(() => g.style.transition = '', 1300)
      }
    }
    if (to === 'msg') fillMsg();
    if (to === 'card') {
      fillCard();
      $('#wlB').classList.remove('okk')
    }
    syncBadge();
    layout()
  }

  $('#logo').onclick = () => {
    location.href = '../'
  };

  /* ── вариант письма: из ссылки (?rv=) или из демо-панели (D) ── */
  $('#dRv').onchange = e => setVariant(e.target.value);
  $('#dGo').onclick = () => {
    setVariant($('#dRv').value);
    if (S.screen === 'open') initOpen();
    else go('open')
  };
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
  if (Q.get('rv')) {
    setVariant(Q.get('rv'));
    $('#dRv').value = Q.get('rv')
  }
  fit();
  layout(true);
  go('open');
})();
