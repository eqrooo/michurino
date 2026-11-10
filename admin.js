(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const d = (s) => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const dt = (s) => new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const show = (id) => ['login', 'noaccess', 'panel'].forEach((x) => { $(x).hidden = x !== id; });
  const toast = (msg) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 2500); };
  const OBJ = { cottage: 'Коттедж', hall: 'Банкетный зал', banya: 'Баня', complex: 'Весь комплекс' };
  const STATUS = { new: 'Новая', confirmed: 'Подтверждена', done: 'Завершена', cancelled: 'Отменена' };

  // ---------- вход ----------
  async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return show('login');
    const { data: isAdmin } = await sb.rpc('is_admin');
    if (!isAdmin) return show('noaccess');
    show('panel');
    loadBookings(); loadPosts(); loadAccess();
    if (location.hash === '#access') document.querySelector('[data-tab="access"]').click();
  }
  // вкладки «Вход / Регистрация»
  document.querySelectorAll('[data-auth]').forEach((b) => b.addEventListener('click', () => {
    const up = b.dataset.auth === 'up';
    document.querySelectorAll('[data-auth]').forEach((x) => x.setAttribute('aria-selected', x === b));
    $('login-form').hidden = up; $('signup-form').hidden = !up;
    $('login-error').textContent = ''; $('signup-error').textContent = '';
    (up ? $('signup-form') : $('login-form')).email.focus();
  }));
  const busy = (form, on, text) => { const b = form.querySelector('button[type=submit]'); b.disabled = on; if (text) b.textContent = text; };
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = $('login-error'); err.textContent = '';
    const email = f.email.value.trim();
    if (!emailOk(email)) { err.textContent = 'Проверьте почту'; f.email.focus(); return; }
    if (!f.password.value) { err.textContent = 'Введите пароль'; f.password.focus(); return; }
    busy(f, true, 'Входим…');
    const { error } = await sb.auth.signInWithPassword({ email, password: f.password.value });
    busy(f, false, 'Войти');
    if (error) {
      const m = (error.message || '').toLowerCase();
      err.textContent = m.includes('invalid') ? 'Неверная почта или пароль. Если вы ещё не регистрировались — откройте вкладку «Регистрация».'
        : m.includes('rate') || m.includes('too many') ? 'Слишком много попыток. Подождите пару минут.'
        : 'Не получилось войти. Проверьте интернет и попробуйте ещё раз.';
      return;
    }
    boot();
  });

  $('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = $('signup-error'); err.textContent = '';
    const email = f.email.value.trim();
    if (!emailOk(email)) { err.textContent = 'Проверьте почту'; f.email.focus(); return; }
    if (f.password.value.length < 8) { err.textContent = 'Пароль должен быть не короче 8 символов'; f.password.focus(); return; }
    if (f.password.value !== f.password2.value) { err.textContent = 'Пароли не совпадают'; f.password2.focus(); return; }
    busy(f, true, 'Создаём аккаунт…');
    const { data, error } = await sb.functions.invoke('register', { body: { email, password: f.password.value } });
    let code = data && data.error;
    if (error && error.context && typeof error.context.json === 'function') { try { code = (await error.context.json()).error; } catch (_) {} }
    if (error || !data || !data.ok) {
      busy(f, false, 'Зарегистрироваться');
      err.textContent = code === 'exists' ? 'Эта почта уже зарегистрирована — войдите во вкладке «Вход».'
        : code === 'weak_password' ? 'Пароль слишком простой — минимум 8 символов.'
        : code === 'bad_email' ? 'Проверьте почту'
        : code === 'too_many' ? 'Слишком много регистраций, попробуйте через час.'
        : 'Не получилось зарегистрироваться. Попробуйте ещё раз.';
      return;
    }
    const { error: e2 } = await sb.auth.signInWithPassword({ email, password: f.password.value });
    busy(f, false, 'Зарегистрироваться');
    if (e2) { err.textContent = 'Аккаунт создан, но войти не получилось — попробуйте во вкладке «Вход».'; return; }
    await requestAccess(true);
    boot();
  });
  document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', async () => { await sb.auth.signOut(); show('login'); }));

  // ---------- запрос доступа ----------
  async function requestAccess(silent) {
    const m = $('req-msg'), btn = $('req-btn'); btn.disabled = true;
    const { data, error } = await sb.rpc('request_admin');
    btn.disabled = false;
    if (error) { m.textContent = 'Ошибка, попробуйте позже'; return; }
    if (data === 'already_admin') return boot();
    if (data === 'too_soon') { if (!silent) m.textContent = 'Запрос уже отправлен недавно — дождитесь подтверждения.'; return; }
    const { data: r } = await sb.functions.invoke('notify-admin');
    m.textContent = r && r.sent ? '✅ Запрос отправлен владельцу. Когда он подтвердит — нажмите «Проверить».'
      : '✅ Запрос сохранён — владелец увидит его в админке. Когда подтвердит — нажмите «Проверить».';
  }
  $('req-btn').addEventListener('click', () => requestAccess(false));
  $('req-check').addEventListener('click', boot);

  // ---------- Telegram ----------
  async function tg(action, extra = {}) {
    const { data, error } = await sb.functions.invoke('tg-link', { body: { action, ...extra } });
    if (error) { $('tg-status').textContent = 'Ошибка связи, попробуйте позже'; return null; }
    if (!data.configured) {
      $('tg-status').innerHTML = data.error === 'bad_token' ? 'Токен бота неверный — проверьте TELEGRAM_BOT_TOKEN в Supabase.' : 'Бот ещё не настроен (нужен токен TELEGRAM_BOT_TOKEN в Supabase).';
      $('tg-link').hidden = true; $('tg-test').hidden = true; $('tg-chats').innerHTML = ''; return data;
    }
    $('tg-link').hidden = false;
    const n = data.chats.length;
    $('tg-status').innerHTML = n ? `Бот <b>@${esc(data.bot)}</b> присылает заявки в ${n} ${n === 1 ? 'чат' : 'чата'}:` : `Бот <b>@${esc(data.bot)}</b> готов. Нажмите «Подключить Telegram» на телефоне, где у вас Telegram.`;
    $('tg-test').hidden = !n;
    $('tg-chats').innerHTML = data.chats.map((c) => `<div class="tg-chat"><span>👤 ${esc(c.name || ('чат ' + c.chat_id))}</span><button class="btn-danger" data-tgoff="${c.chat_id}">Отключить</button></div>`).join('');
    return data;
  }
  $('tg-link').addEventListener('click', async () => {
    const w = window.open('', '_blank');
    const data = await tg('link');
    if (data && data.link) { if (w) w.location = data.link; else location.href = data.link; toast('Нажмите «Start» в Telegram'); }
    else { if (w) w.close(); toast('Не получилось'); }
  });
  $('tg-test').addEventListener('click', async () => { const d = await tg('test'); toast(d && d.tested ? 'Тест отправлен в Telegram' : 'Не получилось'); });
  document.addEventListener('click', async (e) => { const b = e.target.closest('[data-tgoff]'); if (b && confirm('Отключить уведомления в этот чат?')) { await tg('unlink', { chat_id: +b.dataset.tgoff }); toast('Отключено'); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('panel').hidden) tg('status'); });

  // ---------- вкладка «Доступ» ----------
  async function loadAccess() {
    tg('status');
    const { data: reqs } = await sb.from('admin_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    const n = (reqs || []).length; $('req-count').textContent = n; $('req-count').hidden = !n;
    $('req-list').innerHTML = n ? reqs.map((r) => `<article class="card pc acc">
        <div><h4>${esc(r.email)}</h4><time>запрос: ${dt(r.created_at)}</time></div>
        <div class="row-btns"><button class="btn btn-small" data-ok="${r.id}">Подтвердить</button><button class="btn-danger" data-no="${r.id}">Отклонить</button></div>
      </article>`).join('') : '<p class="empty">Новых запросов нет</p>';
    const { data: admins } = await sb.rpc('list_admins');
    const { data: { user } } = await sb.auth.getUser();
    $('admin-list').innerHTML = (admins || []).map((a) => `<article class="card pc acc">
        <div><h4>${esc(a.email)}${a.user_id === user.id ? ' <span class="obj-tag">это вы</span>' : ''}</h4><time>админ с ${dt(a.created_at)}</time></div>
        ${a.user_id === user.id ? '' : `<button class="btn-danger" data-rm="${a.user_id}" data-email="${esc(a.email)}">Убрать доступ</button>`}
      </article>`).join('');
  }
  document.addEventListener('click', async (e) => {
    const ok = e.target.closest('[data-ok]'), no = e.target.closest('[data-no]'), rm = e.target.closest('[data-rm]');
    if (ok || no) {
      const id = +(ok || no).dataset[ok ? 'ok' : 'no'];
      if (no && !confirm('Отклонить запрос?')) return;
      const { data } = await sb.rpc('decide_admin', { req_id: id, approve: !!ok });
      toast(data === 'ok' ? (ok ? 'Доступ выдан' : 'Запрос отклонён') : 'Не получилось'); loadAccess();
    }
    if (rm) {
      if (!confirm(`Убрать доступ у ${rm.dataset.email}?`)) return;
      const { data } = await sb.rpc('remove_admin', { target: rm.dataset.rm });
      toast(data === 'ok' ? 'Доступ убран' : 'Не получилось'); loadAccess();
    }
  });

  // ---------- вкладки ----------
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    if (b.dataset.tab === 'stats') loadStats();
    if (b.dataset.tab === 'access') loadAccess();
  }));

  // ---------- заявки ----------
  let filter = 'active';
  document.querySelectorAll('[data-filter]').forEach((c) => c.addEventListener('click', () => {
    filter = c.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('active', x === c));
    loadBookings();
  }));
  async function loadBookings() {
    let q = sb.from('bookings').select('*').order('created_at', { ascending: false }).limit(200);
    if (filter === 'active') q = q.in('status', ['new', 'confirmed']);
    const { data, error } = await q;
    const box = $('bookings-list');
    if (error) { box.innerHTML = '<p class="empty">Ошибка загрузки</p>'; return; }
    const n = (data || []).filter((b) => b.status === 'new').length;
    $('new-count').textContent = n; $('new-count').hidden = !n;
    if (!data.length) { box.innerHTML = '<p class="empty">Заявок пока нет</p>'; return; }
    box.innerHTML = data.map((b) => {
      const phone = b.phone.replace(/[^\d+]/g, '');
      const wa = phone.replace(/\D/g, '').replace(/^8/, '7');
      return `<article class="card bk">
        <div><h3>${esc(b.name)}</h3>
          <div class="meta"><span class="obj-tag">${OBJ[b.object] || ''}</span> <span class="dates">${b.date_out ? `${d(b.date_in)} — ${d(b.date_out)}` : d(b.date_in)}${b.hours ? ` · ${b.hours} ч` : ''}</span> · гостей: ${b.guests} · пришла ${dt(b.created_at)}</div></div>
        <span class="status st-${b.status}">${STATUS[b.status]}</span>
        ${b.comment ? `<p class="comment">${esc(b.comment)}</p>` : ''}
        <div class="actions">
          <a class="btn btn-small" href="tel:${esc(phone)}">Позвонить ${esc(b.phone)}</a>
          <a class="btn btn-small btn-ghost" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>
          <select data-id="${b.id}" aria-label="Статус заявки">
            ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === b.status ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div></article>`;
    }).join('');
    box.querySelectorAll('select').forEach((s) => s.addEventListener('change', async () => {
      const { error } = await sb.from('bookings').update({ status: s.value }).eq('id', s.dataset.id);
      toast(error ? 'Не сохранилось' : 'Статус обновлён'); loadBookings();
    }));
  }

  // ---------- посты ----------
  const pf = $('post-form');
  pf.image.addEventListener('change', () => {
    const f = pf.image.files[0]; const p = $('preview');
    if (f) { p.src = URL.createObjectURL(f); p.hidden = false; } else p.hidden = true;
  });
  async function shrink(file) {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  }
  pf.addEventListener('submit', async (e) => {
    e.preventDefault(); $('post-error').textContent = '';
    const btn = pf.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Публикуем…';
    try {
      let image_url = null;
      const file = pf.image.files[0];
      if (file) {
        const blob = await shrink(file);
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const up = await sb.storage.from('post-images').upload(path, blob, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        image_url = sb.storage.from('post-images').getPublicUrl(path).data.publicUrl;
      }
      const { error } = await sb.from('posts').insert({ title: pf.title.value.trim(), body: pf.body.value.trim() || null, image_url });
      if (error) throw error;
      pf.reset(); $('preview').hidden = true; toast('Пост опубликован'); loadPosts();
    } catch (err) {
      $('post-error').textContent = 'Не получилось: ' + (err.message || err);
    } finally { btn.disabled = false; btn.textContent = 'Опубликовать'; }
  });
  async function loadPosts() {
    const { data } = await sb.from('posts').select('*').order('created_at', { ascending: false });
    const box = $('posts-list');
    if (!data || !data.length) { box.innerHTML = '<p class="empty">Постов пока нет</p>'; return; }
    box.innerHTML = data.map((p) => `<article class="card pc">
      ${p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : '<div class="noimg"></div>'}
      <div><h4>${esc(p.title)}</h4><time>${dt(p.created_at)}</time></div>
      <button class="btn-danger" data-del="${p.id}" data-img="${esc(p.image_url || '')}">Удалить</button></article>`).join('');
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Удалить пост навсегда?')) return;
      const { error } = await sb.from('posts').delete().eq('id', b.dataset.del);
      if (!error && b.dataset.img) { const name = b.dataset.img.split('/post-images/')[1]; if (name) await sb.storage.from('post-images').remove([name]); }
      toast(error ? 'Не удалилось' : 'Пост удалён'); loadPosts();
    }));
  }

  // ---------- посещения ----------
  async function loadStats() {
    const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - 29);
    const { data } = await sb.from('visits').select('created_at, device').gte('created_at', since.toISOString()).limit(10000);
    const v = data || [];
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const week = new Date(startToday); week.setDate(week.getDate() - 6);
    const cnt = (from) => v.filter((x) => new Date(x.created_at) >= from).length;
    const mob = v.length ? Math.round(v.filter((x) => x.device === 'mobile').length / v.length * 100) : 0;
    $('stats-cards').innerHTML = `
      <div class="card stat"><strong>${cnt(startToday)}</strong><span>сегодня</span></div>
      <div class="card stat"><strong>${cnt(week)}</strong><span>за 7 дней</span></div>
      <div class="card stat"><strong>${v.length}</strong><span>за 30 дней · ${mob}% с телефона</span></div>`;
    const days = [...Array(14)].map((_, i) => { const x = new Date(startToday); x.setDate(x.getDate() - 13 + i); return x; });
    const counts = days.map((day) => { const next = new Date(day); next.setDate(next.getDate() + 1); return v.filter((x) => { const t = new Date(x.created_at); return t >= day && t < next; }).length; });
    const max = Math.max(1, ...counts);
    $('bars').innerHTML = days.map((day, i) => `<div class="bar" title="${counts[i]} посещений"><b>${counts[i] || ''}</b><i style="height:${counts[i] / max * 85}%"></i>${day.getDate()}</div>`).join('');
  }

  boot();
})();
