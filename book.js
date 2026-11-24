/* Telegram-мини-приложение бронирования для гостей (book.html). Не править: тексты и цены — в content.js */
(() => {
  const C = window.CONTENT, W = window.Telegram && Telegram.WebApp;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m) => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 2600); };
  const haptic = (k) => { try { W.HapticFeedback.notificationOccurred(k); } catch (_) {} };
  const OBJ = { cottage: 'Коттедж', hall: 'Банкетный зал', banya: 'Баня', complex: 'Весь комплекс' };
  const STATUS = { new: 'на рассмотрении', confirmed: 'подтверждена', done: 'завершена', cancelled: 'отменена' };
  const priceOf = (id) => { const o = C.objects.find((x) => x.id === id); return o ? parseInt(String(o.price).replace(/\D/g, ''), 10) || 0 : 0; };
  const money = (n) => n.toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';

  $('phone').href = 'tel:+' + C.phone.replace(/\D/g, ''); $('phone').textContent = C.phone;
  const bot = C.telegramBot ? 'https://t.me/' + C.telegramBot + '?start=book' : null;
  if (!W || !W.initData) {
    $('wrap').innerHTML = `<div class="bk-card bk-msg"><h2>Бронирование в Telegram</h2><p class="muted">Эта страница открывается внутри Telegram-бота «Мичурино».</p>
      ${bot ? `<p><a class="btn" href="${esc(bot)}">Открыть бота</a></p>` : ''}<p><a class="link" href="./#booking">или оставьте заявку на сайте →</a></p></div>`;
    return;
  }
  W.ready(); W.expand();
  try { W.setHeaderColor('#F3F5EE'); W.setBackgroundColor('#F3F5EE'); } catch (_) {}
  $('site').addEventListener('click', (e) => { e.preventDefault(); try { W.openLink('https://michurino.asia/'); } catch (_) { location.href = './'; } });

  const call = async (action, extra = {}) => {
    const r = await fetch(SB_URL + '/functions/v1/tg-guest', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
      body: JSON.stringify({ initData: W.initData, action, ...extra }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || 'failed'); e.status = r.status; throw e; }
    return data;
  };

  // ---------- календарь ----------
  const f = $('f');
  let booked = new Map();
  const cal = MCal.mount($('cal'), {
    months: 2, interactive: 'free', maxMonths: 14,
    onDay: (day, set) => {
      if (MCal.kind(set) === 'both') { toast('В этот день всё занято'); return; }
      const v = f.object.value;
      if (set && set.has(v === 'complex' ? 'cottage' : v)) { f.object.value = set.has('cottage') ? 'hall' : 'cottage'; sync(); }
      f.date_in.value = day;
      if (stay() && (!f.date_out.value || f.date_out.value <= day)) f.date_out.value = MCal.addDays(day, 1);
      update();
      $('form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });

  // ---------- форма ----------
  const today = MCal.todayIso();
  f.date_in.min = today; f.date_out.min = MCal.addDays(today, 1);
  const stay = () => f.object.value === 'cottage' || f.object.value === 'complex';
  function sync() {
    const s = stay();
    $('lbl-in').textContent = s ? 'Заезд (в 12:00)' : 'Дата';
    $('row-out').hidden = !s; $('stay-hint').hidden = !s;
    $('row-hours').hidden = f.object.value !== 'banya';
    update();
  }
  function update() {
    // предупреждение о занятых датах
    const v = f.object.value, objs = v === 'complex' ? ['cottage', 'hall'] : v === 'cottage' || v === 'hall' ? [v] : [];
    const days = [];
    if (f.date_in.value) {
      days.push(f.date_in.value);
      if (stay() && f.date_out.value > f.date_in.value) for (let d = MCal.addDays(f.date_in.value, 1), n = 0; d < f.date_out.value && n < 60; d = MCal.addDays(d, 1), n++) days.push(d);
    }
    const busy = days.filter((d) => objs.some((o) => booked.get(d) && booked.get(d).has(o)));
    $('warn').hidden = !busy.length;
    if (busy.length) $('warn').textContent = `⚠️ Уже занято: ${MCal.ranges(busy).map(MCal.rangeText).join(', ')}. Выберите другие даты или напишите в комментарии.`;
    // примерная стоимость
    let est = '';
    if (v === 'cottage' && f.date_in.value && f.date_out.value > f.date_in.value) {
      const n = Math.round((Date.parse(f.date_out.value) - Date.parse(f.date_in.value)) / 864e5);
      est = `${n} ${n === 1 ? 'сутки' : 'суток'} (${MCal.human(f.date_in.value)} 12:00 → ${MCal.human(f.date_out.value)} 12:00)` + (priceOf('cottage') ? ` · ориентировочно ${money(n * priceOf('cottage'))}` : '');
    } else if (v === 'banya') {
      const h = parseInt(f.hours.value, 10); if (h >= 3 && priceOf('banya')) est = `${h} ч · ориентировочно ${money(h * priceOf('banya'))}`;
    } else if (v === 'hall' && priceOf('hall')) est = `Аренда зала: ${money(priceOf('hall'))}, без приготовления блюд`;
    $('est').hidden = !est; $('est').textContent = est;
  }
  f.object.addEventListener('change', sync);
  ['date_in', 'date_out', 'hours'].forEach((n) => f[n].addEventListener('input', update));
  f.date_in.addEventListener('change', () => { if (stay() && f.date_in.value && (!f.date_out.value || f.date_out.value <= f.date_in.value)) f.date_out.value = MCal.addDays(f.date_in.value, 1); update(); });

  // телефон из Telegram (если версия Telegram поддерживает)
  if (W.requestContact && W.isVersionAtLeast && W.isVersionAtLeast('6.9')) {
    $('tg-phone').hidden = false;
    $('tg-phone').addEventListener('click', () => W.requestContact((ok, res) => {
      const p = ok && res && res.responseUnsafe && res.responseUnsafe.contact && res.responseUnsafe.contact.phone_number;
      if (p) { f.phone.value = (p.startsWith('+') ? '' : '+') + p; toast('Номер подставлен'); }
      else if (ok) toast('Номер отправлен — впишите его в поле, если не появился');
    }));
  }

  function render(state) {
    $('cal-card').hidden = !state.showDates;
    booked = MCal.toMap(state.showDates ? state.rows || [] : []); cal.set(booked);
    if (state.profile) { if (!f.name.value) f.name.value = state.profile.name || ''; if (!f.phone.value) f.phone.value = state.profile.phone || ''; }
    const mine = state.mine || [];
    $('mine-card').hidden = !mine.length;
    $('mine').innerHTML = mine.map((b) => {
      const when = b.date_out ? `${MCal.human(b.date_in)} 12:00 → ${MCal.human(b.date_out)} 12:00` : MCal.human(b.date_in) + (b.hours ? ` · ${b.hours} ч` : '');
      return `<div class="bk-item"><b>${OBJ[b.object] || ''}</b><span class="bk-st st-${esc(b.status)}">${STATUS[b.status] || ''}</span><span>${esc(when)} · гостей: ${b.guests}</span></div>`;
    }).join('');
    update();
  }

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('err'); err.textContent = '';
    const bad = (el, msg) => { el.focus(); err.textContent = msg; haptic('error'); };
    const v = f.object.value;
    if (!f.date_in.value) return bad(f.date_in, stay() ? 'Выберите дату заезда' : 'Выберите дату');
    if (stay() && !(f.date_out.value > f.date_in.value)) return bad(f.date_out, 'Выезд должен быть позже заезда');
    const hours = parseInt(f.hours.value, 10);
    if (v === 'banya' && !(hours >= 3 && hours <= 24)) return bad(f.hours, 'Баня бронируется минимум на 3 часа');
    if (!f.name.value.trim()) return bad(f.name, 'Напишите, как к вам обращаться');
    if (f.phone.value.replace(/\D/g, '').length < 10) return bad(f.phone, 'Проверьте номер телефона');
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Отправляем…';
    try {
      const data = await call('book', { booking: {
        object: v, date_in: f.date_in.value, date_out: stay() ? f.date_out.value : null, hours: v === 'banya' ? hours : null,
        guests: parseInt(f.guests.value, 10) || 1, name: f.name.value.trim(), phone: f.phone.value.trim(), comment: f.comment.value.trim(),
      } });
      haptic('success');
      render(data);
      $('form-card').innerHTML = `<div class="bk-done"><div class="big">🎉</div><h2>Заявка отправлена!</h2>
        <p class="muted">${esc(C.booking.success)} Подтверждение придёт в этот чат.</p>
        <p><button class="btn" id="again" type="button">Новая заявка</button></p></div>`;
      $('again').onclick = () => location.reload();
      $('form-card').scrollIntoView({ behavior: 'smooth' });
    } catch (x) {
      btn.disabled = false; btn.textContent = 'Отправить заявку';
      err.textContent = x.message === 'too_many' ? 'Слишком много заявок подряд. Подождите немного или позвоните: ' + C.phone
        : x.message.startsWith('bad_date') ? 'Проверьте даты'
        : x.status === 401 ? 'Сессия устарела — закройте окно и откройте его заново из бота.'
        : 'Не получилось отправить. Позвоните нам: ' + C.phone;
      haptic('error');
    }
  });

  sync();
  call('init').then(render).catch((x) => {
    if (x.status === 401) toast('Закройте окно и откройте заново из бота');
    else toast('Календарь не загрузился — проверьте интернет');
  });
})();
