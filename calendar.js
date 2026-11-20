/* Календарь занятых дат: общий код для сайта, админки и Telegram-мини-приложения. Не править. */
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const OBJ = { cottage: 'коттедж', hall: 'банкетный зал' };
  const OBJ_T = { cottage: 'Коттедж', hall: 'Банкетный зал' };

  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;          // m — с нуля
  const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
  const parts = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d }; };
  const addDays = (s, n) => { const p = parts(s); const t = new Date(Date.UTC(p.y, p.m, p.d + n)); return iso(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
  const human = (s, withYear) => { const p = parts(s); return `${p.d} ${MONTHS_GEN[p.m]}${withYear ? ' ' + p.y : ''}`; };
  const valid = (y, m, d) => { const t = new Date(Date.UTC(y, m, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m && t.getUTCDate() === d; };

  // booked: Map<iso, Set<'cottage'|'hall'>>
  const toMap = (rows) => { const m = new Map(); (rows || []).forEach((r) => { if (!m.has(r.day)) m.set(r.day, new Set()); m.get(r.day).add(r.object); }); return m; };
  const kind = (set) => !set || !set.size ? '' : set.size > 1 ? 'both' : [...set][0];
  const describe = (s, set) => {
    const k = kind(set);
    return `${human(s)}: ` + (k === 'both' ? 'заняты коттедж и банкетный зал' : k ? `занят ${OBJ[k]}, ${OBJ[k === 'cottage' ? 'hall' : 'cottage']} свободен` : 'всё свободно');
  };

  // HTML одного месяца. opts: { booked, interactive: 'free' | 'all' | false, min }
  function month(y, m, opts) {
    const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    const shift = (first.getDay() + 6) % 7, today = todayIso();
    let cells = '';
    for (let i = 0; i < shift; i++) cells += '<span class="cal-d cal-pad" aria-hidden="true"></span>';
    for (let d = 1; d <= days; d++) {
      const s = iso(y, m, d), set = opts.booked.get(s), k = kind(set), past = s < today;
      const cls = ['cal-d', k && 'b-' + k, past && 'is-past', s === today && 'is-today'].filter(Boolean).join(' ');
      const label = describe(s, set) + (s === today ? ' (сегодня)' : '');
      const click = opts.interactive === 'all' || (opts.interactive === 'free' && !past);
      cells += click
        ? `<button type="button" class="${cls}" data-day="${s}" aria-label="${label}" title="${label}"><span>${d}</span></button>`
        : `<span class="${cls}" role="img" aria-label="${label}" title="${label}"><span>${d}</span></span>`;
    }
    return `<div class="cal-m"><h3 class="cal-title">${MONTHS[m]} <span>${y}</span></h3>
      <div class="cal-g cal-week" aria-hidden="true">${WEEK.map((w, i) => `<span class="${i > 4 ? 'we' : ''}">${w}</span>`).join('')}</div>
      <div class="cal-g">${cells}</div></div>`;
  }

  // Виджет: стрелки + N месяцев. Возвращает { set(rows), get() }
  function mount(el, opts) {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth(), booked = new Map();
    const minY = y, minM = m, maxOff = opts.maxMonths ?? 18;
    const off = () => (y - minY) * 12 + (m - minM);
    el.classList.add('cal');
    el.innerHTML = `<div class="cal-top">
        <button type="button" class="cal-nav" data-nav="-1" aria-label="Предыдущий месяц">‹</button>
        <button type="button" class="cal-nav" data-nav="1" aria-label="Следующий месяц">›</button>
      </div>
      <div class="cal-months" aria-live="polite"></div>
      <p class="cal-info" role="status"></p>`;
    const box = el.querySelector('.cal-months'), info = el.querySelector('.cal-info');
    const draw = () => {
      let html = '';
      for (let i = 0; i < (opts.months || 2); i++) { const t = new Date(y, m + i, 1); html += month(t.getFullYear(), t.getMonth(), { booked, interactive: opts.interactive }); }
      box.innerHTML = html;
      el.querySelector('[data-nav="-1"]').disabled = !opts.allowPast && off() <= 0;
      el.querySelector('[data-nav="1"]').disabled = off() >= maxOff;
    };
    el.addEventListener('click', (e) => {
      const n = e.target.closest('[data-nav]');
      if (n) { const t = new Date(y, m + Number(n.dataset.nav), 1); y = t.getFullYear(); m = t.getMonth(); draw(); return; }
      const b = e.target.closest('[data-day]');
      if (b) { info.textContent = describe(b.dataset.day, booked.get(b.dataset.day)); if (opts.onDay) opts.onDay(b.dataset.day, booked.get(b.dataset.day)); }
    });
    // на сайте подсказка и по занятым (некликабельным) дням
    el.addEventListener('pointerup', (e) => { const s = e.target.closest('.cal-d[role="img"]'); if (s) info.textContent = s.getAttribute('aria-label'); });
    let sx = null; // свайп по месяцам на телефоне
    box.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) { const btn = el.querySelector(`[data-nav="${dx < 0 ? 1 : -1}"]`); if (!btn.disabled) btn.click(); } });
    draw();
    return { set(rows) { booked = rows instanceof Map ? rows : toMap(rows); draw(); }, get: () => booked, info: (t) => { info.textContent = t; }, redraw: draw };
  }

  // ---------- разбор дат, вписанных руками ----------
  // «25.12», «25.12.2026», «31.12–02.01», «5, 6, 7 января», «10-12 марта 2027», «2026-12-25»
  const MON_RE = [/^янв/, /^фев/, /^мар/, /^апр/, /^ма[йя]/, /^июн/, /^июл/, /^авг/, /^сен/, /^окт/, /^ноя/, /^дек/];
  function parse(text) {
    const src = String(text || '').toLowerCase().replace(/[—–−]/g, '-').replace(/ё/g, 'е');
    const re = /(^|[^\d])(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})(?:\s*[./]\s*(\d{1,2})(?:\s*[./]\s*(\d{4}|\d{2}))?|\s+([а-я]+)\.?(?:\s+(\d{4}))?)?)(?!\d)/g;
    const toks = []; const errors = []; let last = 0, mt;
    while ((mt = re.exec(src))) {
      const start = mt.index + mt[1].length;
      const gap = src.slice(last, start);
      let t;
      if (mt[2]) t = { d: +mt[4], m: +mt[3] - 1, y: +mt[2] };
      else {
        t = { d: +mt[5] };
        if (mt[6]) { t.m = +mt[6] - 1; if (mt[7]) t.y = mt[7].length === 2 ? 2000 + +mt[7] : +mt[7]; }
        else if (mt[8]) {
          const mi = MON_RE.findIndex((r) => r.test(mt[8]));
          if (mi < 0) { errors.push(mt[0].trim()); last = re.lastIndex; continue; }
          t.m = mi; if (mt[9]) t.y = +mt[9];
        }
      }
      t.range = toks.length > 0 && /^\s*(-|по|до)\s*$/.test(gap);
      if (!/^[\s,;.\n-]*(по|до|и)?[\s,;.\n-]*$/.test(gap)) errors.push(gap.trim());
      toks.push(t); last = re.lastIndex;
    }
    const tail = src.slice(last); if (/[\da-zа-я]/.test(tail)) errors.push(tail.trim());
    // день без месяца берёт месяц у следующей даты: «5, 6, 7 января», «10-12.03»
    for (let i = toks.length - 1; i >= 0; i--) if (toks[i].m == null) {
      const nx = toks.slice(i + 1).find((x) => x.m != null);
      if (!nx) { errors.push(String(toks[i].d)); toks.splice(i, 1); continue; }
      toks[i].m = nx.m; if (toks[i].y == null && nx.y != null) toks[i].y = nx.y; toks[i].borrow = true;
    }
    const today = todayIso();
    const fix = (t, ref) => {
      if (t.y != null) return;
      const now = new Date().getFullYear();
      if (ref) { t.y = ref.y; if (iso(t.y, t.m, t.d) > iso(ref.y, ref.m, ref.d)) t.y--; return; }
      t.y = now; if (iso(t.y, t.m, t.d) < addDays(today, -30)) t.y++;
    };
    const days = new Set();
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], nx = toks[i + 1];
      if (nx && nx.range) {
        fix(nx); fix(t, nx);
        if (!valid(t.y, t.m, t.d) || !valid(nx.y, nx.m, nx.d)) { errors.push(`${t.d}.${t.m + 1}-${nx.d}.${nx.m + 1}`); i++; continue; }
        let a = iso(t.y, t.m, t.d); const b = iso(nx.y, nx.m, nx.d);
        if (a > b) { errors.push(`${human(a)} позже ${human(b)}`); i++; continue; }
        for (let n = 0; a <= b && n < 200; n++, a = addDays(a, 1)) days.add(a);
        i++; continue;
      }
      fix(t);
      if (!valid(t.y, t.m, t.d)) { errors.push(`${t.d}.${t.m + 1}`); continue; }
      days.add(iso(t.y, t.m, t.d));
    }
    return { days: [...days].sort(), errors: errors.map((e) => e.replace(/^[\s,;.-]+|[\s,;.-]+$/g, '')).filter(Boolean) };
  }

  // подряд идущие дни → отрезки: [{from, to, n}]
  function ranges(list) {
    const out = [];
    [...list].sort().forEach((s) => { const r = out[out.length - 1]; if (r && addDays(r.to, 1) === s) { r.to = s; r.n++; } else out.push({ from: s, to: s, n: 1 }); });
    return out;
  }
  const rangeText = (r) => {
    if (r.from === r.to) return human(r.from);
    const a = parts(r.from), b = parts(r.to);
    return a.m === b.m && a.y === b.y ? `${a.d}–${b.d} ${MONTHS_GEN[b.m]}` : `${human(r.from)} – ${human(r.to)}`;
  };

  window.MCal = { mount, month, parse, ranges, rangeText, toMap, kind, describe, human, iso, todayIso, addDays, OBJ, OBJ_T };
})();
