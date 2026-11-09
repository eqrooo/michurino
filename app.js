(() => {
  const C = window.CONTENT;
  const $ = (id) => document.getElementById(id);
  const get = (path) => path.split('.').reduce((o, k) => o && o[k], C);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const photoList = (folder, count) => Array.from({ length: count }, (_, i) => `photos/${folder}/${pad(i + 1)}`);
  document.querySelectorAll('[data-c]').forEach((el) => { el.textContent = get(el.dataset.c) ?? ''; });

  // ---------- контакты ----------
  const tel = 'tel:+' + C.phone.replace(/\D/g, '');
  const ig = 'https://www.instagram.com/' + C.instagram + '/';
  const setLink = (id, href, text) => { const a = $(id); if (!a) return; a.href = href; if (text) a.textContent = text; };
  setLink('phone-link', tel, C.phone);
  setLink('phone-foot', tel, C.phone);
  setLink('ig-link', ig);
  setLink('ig-foot', ig);
  const was = [].concat(C.whatsapp || []).filter(Boolean);
  const waUrl = (n) => 'https://wa.me/' + n.replace(/\D/g, '');
  const waIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.6-.1 1.1Z"/></svg>';
  const light = document.body.classList.contains('page-complex');
  if ($('hero-actions')) $('hero-actions').insertAdjacentHTML('beforeend', was.map((n) =>
    `<a class="btn ${light ? 'btn-outline-light' : 'btn-ghost'}" href="${waUrl(n)}" target="_blank" rel="noopener">${waIcon} ${n}</a>`).join(''));
  if ($('wa-line')) $('wa-line').innerHTML = 'WhatsApp: ' + was.map((n) => `<a href="${waUrl(n)}" target="_blank" rel="noopener">${n}</a>`).join(', ');
  if ($('wa-foot')) $('wa-foot').innerHTML = was.map((n) => `<a href="${waUrl(n)}" target="_blank" rel="noopener">WhatsApp ${n}</a>`).join('');

  if ($('hero-img')) $('hero-img').src = C.heroPhoto;

  // ---------- иконки ----------
  const icons = {
    home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    hall: '<path d="M4 20V9l8-5 8 5v11M4 20h16M9 20v-5h6v5M8 11h.01M16 11h.01"/>',
    banya: '<path d="M4 21h16M6 21V10l6-5 6 5v11M10 21v-5h4v5M8 3c0 1 1 1 1 2s-1 1-1 2M12 2c0 1 1 1 1 2"/>',
    tree: '<path d="M12 2 5 13h4l-3 5h12l-3-5h4zM12 18v4"/>',
    fire: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"/>',
    gazebo: '<path d="M3 9 12 4l9 5M5 9v11M19 9v11M3 20h18M8 14h8"/>',
    kids: '<circle cx="12" cy="5" r="2"/><path d="M12 7v7m0 0-4 7m4-7 4 7M7 10h10"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[k] || icons.home}</svg>`;
  const objIcon = { cottage: 'home', hall: 'hall', banya: 'banya' };

  // ---------- лайтбокс ----------
  const lb = $('lb'); let cur = [], idx = 0;
  const openLb = (list, i) => {
    cur = list; idx = (i + cur.length) % cur.length;
    $('lb-img').src = cur[idx] + '.jpg';
    $('lb-count').textContent = `${idx + 1} / ${cur.length}`;
    if (!lb.open) lb.showModal();
  };
  if (lb) {
    $('lb-prev').onclick = () => openLb(cur, idx - 1);
    $('lb-next').onclick = () => openLb(cur, idx + 1);
    $('lb-close').onclick = () => lb.close();
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
    lb.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') openLb(cur, idx + 1); if (e.key === 'ArrowLeft') openLb(cur, idx - 1); });
    let sx = null;
    lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) openLb(cur, idx + (dx < 0 ? 1 : -1)); sx = null; });
  }
  const photoGrid = (el, list, title) => {
    el.innerHTML = list.map((src, i) => `<button class="g-item" data-i="${i}" aria-label="Открыть фото ${i + 1} из ${list.length}"><img src="${src}-s.jpg" alt="${esc(title)}, фото ${i + 1}" loading="lazy"></button>`).join('');
    el.querySelectorAll('img').forEach((im) => { im.onload = () => im.classList.add('ok'); if (im.complete) im.classList.add('ok'); });
    el.onclick = (e) => { const b = e.target.closest('.g-item'); if (b) openLb(list, +b.dataset.i); };
  };

  // ---------- главная: галерея с вкладками ----------
  const tabs = $('g-tabs'), grid = $('g-grid');
  if (tabs && grid) {
    const showTab = (k) => {
      const g = C.gallery[k];
      tabs.querySelectorAll('button').forEach((b, i) => { b.setAttribute('aria-selected', i === k); b.tabIndex = i === k ? 0 : -1; });
      grid.className = 'gallery n' + Math.min(g.count, 5);
      photoGrid(grid, photoList(g.folder, g.count), g.title);
    };
    tabs.innerHTML = C.gallery.map((g, i) => `<button role="tab" data-k="${i}">${esc(g.title)} <span>${g.count}</span></button>`).join('');
    tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showTab(+b.dataset.k); });
    tabs.addEventListener('keydown', (e) => {
      const n = C.gallery.length, k = [...tabs.children].indexOf(document.activeElement);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const j = (k + (e.key === 'ArrowRight' ? 1 : n - 1)) % n; showTab(j); tabs.children[j].focus(); }
    });
    showTab(0);
  }

  // ---------- главная: карточки ----------
  if ($('features')) {
    const cards = C.objects.map((o) => ({ href: `complex.html#${o.id}`, icon: objIcon[o.id], title: o.title, text: o.facts.join(' · ') }))
      .concat([{ href: 'complex.html#territory', icon: 'tree', title: 'Территория', text: C.extras.map((x) => x.title).join(', ') }]);
    $('features').innerHTML = cards.map((f) => `
      <a class="feature reveal" href="${f.href}">${icon(f.icon)}<h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></a>`).join('');
  }
  if ($('events')) $('events').innerHTML = C.events.items.map((t) => `<li>${icon('check')}${esc(t)}</li>`).join('');
  if ($('objects')) {
    $('objects').innerHTML = C.objects.map((o) => `
      <article class="obj reveal">
        <a class="obj-pic" href="complex.html#${o.id}"><img src="${o.photo}-s.jpg" alt="${esc(o.title)}" loading="lazy"></a>
        <div class="obj-body">
          <h3>${esc(o.title)}</h3>
          <p>${esc(o.short)}</p>
          <div class="obj-price"><strong>${esc(o.price)}</strong><span>${esc(o.priceNote)}</span></div>
          <div class="obj-actions">
            <a class="btn btn-small" href="#booking" data-book="${o.id}">Забронировать</a>
            <a class="link" href="complex.html#${o.id}">Подробнее →</a>
          </div>
        </div>
      </article>`).join('');
  }

  // ---------- страница «О комплексе» ----------
  if ($('object-sections')) {
    $('object-sections').innerHTML = C.objects.map((o, n) => `
      <section class="section ${n % 2 ? 'alt' : ''} obj-section" id="${o.id}">
        <div class="container two">
          <div class="reveal">
            <p class="eyebrow">${icon(objIcon[o.id])} ${n + 1} / ${C.objects.length}</p>
            <h2>${esc(o.title)}</h2>
            <ul class="facts">${o.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
            <p class="lead">${esc(o.intro)}</p>
            ${o.blocks.map((b) => `<div class="block"><h3>${esc(b.title)}</h3>${b.items ? `<ul class="ticks">${b.items.map((i) => `<li>${icon('check')}${esc(i)}</li>`).join('')}</ul>` : `<p>${esc(b.text)}</p>`}</div>`).join('')}
            <p class="outro">${esc(o.outro)}</p>
            <div class="price-box"><div><span>Стоимость</span><strong>${esc(o.price)}</strong><small>${esc(o.priceNote)}</small></div>
              <a class="btn" href="./?obj=${o.id}#booking">Забронировать</a></div>
          </div>
          <div class="obj-photos reveal" data-folder="${o.gallery}" data-count="${o.photos}" data-title="${esc(o.title)}"></div>
        </div>
      </section>`).join('');
    document.querySelectorAll('.obj-photos[data-folder]').forEach((el) => photoGrid(el, photoList(el.dataset.folder, +el.dataset.count), el.dataset.title));
    $('extras').innerHTML = C.extras.map((x) => `<div class="feature reveal">${icon(x.icon)}<h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></div>`).join('');
    const street = C.gallery.find((g) => g.folder === 'street');
    if (street) photoGrid($('territory-photos'), photoList('street', street.count), 'Территория');
  }

  // ---------- карта 2ГИС ----------
  const m = C.map2gis;
  if (m && $('map-frame')) {
    const opt = encodeURIComponent(JSON.stringify({ pos: { lat: m.lat, lon: m.lon, zoom: 16 }, opt: { city: m.city }, org: m.id }));
    $('map-frame').src = 'https://widgets.2gis.com/widget?type=firmsonmap&options=' + opt;
    setLink('map-link', `https://2gis.kz/${m.city}/geo/${m.id}`);
  }

  // ---------- посты из админки ----------
  const fmtDate = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  if ($('posts') && window.sb) (async () => {
    const { data, error } = await sb.from('posts').select('*').eq('published', true).order('created_at', { ascending: false }).limit(6);
    if (error || !data || !data.length) { $('news').hidden = true; const a = document.querySelector('a[href="#news"]'); if (a) a.hidden = true; return; }
    $('posts').innerHTML = data.map((p) => `
      <article class="post">${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : ''}
        <div><time>${fmtDate(p.created_at)}</time><h3>${esc(p.title)}</h3><p>${esc(p.body).replace(/\n/g, '<br>')}</p></div></article>`).join('');
  })();

  // ---------- счётчик посещений (без личных данных) ----------
  try {
    if (window.sb && !sessionStorage.getItem('v')) {
      const w = innerWidth; const device = w < 700 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop';
      sb.from('visits').insert({ path: location.pathname.slice(0, 300), referrer: (document.referrer || '').slice(0, 500), device }).then(() => {});
      sessionStorage.setItem('v', '1');
    }
  } catch (_) {}

  // ---------- меню, шапка, анимации ----------
  const burger = $('burger'), nav = $('nav');
  burger.addEventListener('click', () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
  nav.addEventListener('click', (e) => { if (e.target.tagName === 'A') { nav.classList.remove('open'); burger.setAttribute('aria-expanded', false); } });
  const header = document.querySelector('.header');
  addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 10), { passive: true });
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });

  // ---------- скрытый вход в админку: 5 быстрых нажатий по логотипу внизу ----------
  const fb = document.querySelector('.footer .brand');
  if (fb) {
    let taps = 0, t = null;
    fb.style.cursor = 'default'; fb.style.userSelect = 'none'; fb.style.webkitTapHighlightColor = 'transparent';
    fb.addEventListener('click', () => {
      taps++; clearTimeout(t); t = setTimeout(() => (taps = 0), 1500);
      if (taps >= 5) { taps = 0; location.href = 'admin.html'; }
    });
  }

  // ---------- форма брони ----------
  const form = $('booking-form');
  if (!form) return;
  const today = new Date().toISOString().slice(0, 10);
  form.date_in.min = today; form.date_out.min = today;
  const syncObject = () => {
    const v = form.object.value;
    const stay = v === 'cottage' || v === 'complex';
    $('lbl-in').textContent = stay ? 'Заезд' : 'Дата';
    $('row-out').hidden = !stay;
    $('row-hours').hidden = v !== 'banya';
  };
  form.object.addEventListener('change', syncObject);
  const pick = (id) => { if (id && [...form.object.options].some((o) => o.value === id)) { form.object.value = id; syncObject(); } };
  pick(new URLSearchParams(location.search).get('obj'));
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-book]'); if (b) pick(b.dataset.book); });
  syncObject();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('form-error'); err.textContent = '';
    form.querySelectorAll('input').forEach((i) => i.removeAttribute('aria-invalid'));
    const bad = (el, msg) => { el.setAttribute('aria-invalid', 'true'); el.focus(); err.textContent = msg; };
    const v = form.object.value, stay = v === 'cottage' || v === 'complex';
    if (!form.name.value.trim()) return bad(form.name, 'Напишите, как к вам обращаться');
    if (form.phone.value.replace(/\D/g, '').length < 10) return bad(form.phone, 'Проверьте номер телефона');
    if (!form.date_in.value) return bad(form.date_in, stay ? 'Выберите дату заезда' : 'Выберите дату');
    if (stay && (!form.date_out.value || form.date_out.value <= form.date_in.value)) return bad(form.date_out, 'Выезд должен быть позже заезда');
    const hours = parseInt(form.hours.value, 10);
    if (v === 'banya' && !(hours >= 3)) return bad(form.hours, 'Баня бронируется минимум на 3 часа');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Отправляем…';
    const { error } = await sb.from('bookings').insert({
      object: v,
      name: form.name.value.trim().slice(0, 100),
      phone: form.phone.value.trim().slice(0, 30),
      date_in: form.date_in.value,
      date_out: stay ? form.date_out.value : null,
      hours: v === 'banya' ? Math.min(24, hours) : null,
      guests: Math.max(1, Math.min(150, parseInt(form.guests.value, 10) || 1)),
      comment: form.comment.value.trim().slice(0, 1000) || null,
    });
    if (error) {
      btn.disabled = false; btn.textContent = 'Отправить заявку';
      err.textContent = 'Не получилось отправить. Позвоните нам: ' + C.phone;
      return;
    }
    const ok = $('form-ok'); ok.textContent = C.booking.success; ok.hidden = false;
    btn.textContent = 'Заявка отправлена';
  });
})();
