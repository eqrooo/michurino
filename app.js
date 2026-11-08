(() => {
  const C = window.CONTENT;
  const get = (path) => path.split('.').reduce((o, k) => o && o[k], C);
  document.querySelectorAll('[data-c]').forEach((el) => { el.textContent = get(el.dataset.c) ?? ''; });

  const tel = 'tel:+' + C.phone.replace(/\D/g, '');
  const wa = 'https://wa.me/' + C.whatsapp;
  const ig = 'https://www.instagram.com/' + C.instagram + '/';
  const setLink = (id, href, text) => { const a = document.getElementById(id); if (!a) return; a.href = href; if (text) a.textContent = text; };
  setLink('phone-link', tel, C.phone);
  setLink('phone-foot', tel, C.phone);
  setLink('wa-hero', wa);
  setLink('wa-foot', wa);
  setLink('ig-link', ig);
  setLink('ig-foot', ig);

  const icons = {
    home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    tree: '<path d="M12 2 5 13h4l-3 5h12l-3-5h4zM12 18v4"/>',
    fire: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"/>',
    car: '<path d="M5 16h14M6 16l1.5-6h9L18 16M5 16v3h2v-3M17 16v3h2v-3"/><circle cx="8" cy="13.5" r=".5"/><circle cx="16" cy="13.5" r=".5"/>',
  };
  document.getElementById('features').innerHTML = C.features.map((f) => `
    <div class="feature reveal">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[f.icon] || icons.home}</svg>
      <h3>${f.title}</h3><p>${f.text}</p>
    </div>`).join('');

  document.getElementById('price-list').innerHTML = C.prices.map((p) => `
    <div class="price reveal"><h3>${p.title}</h3><strong>${p.price}</strong><span>${p.note}</span></div>`).join('');

  // Посты из админки
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  (async () => {
    const box = document.getElementById('posts');
    const { data, error } = await sb.from('posts').select('*').eq('published', true).order('created_at', { ascending: false }).limit(6);
    if (error || !data || !data.length) { document.getElementById('news').hidden = true; document.querySelector('a[href="#news"]').hidden = true; return; }
    box.innerHTML = data.map((p) => `
      <article class="post">${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : ''}
        <div><time>${fmtDate(p.created_at)}</time><h3>${esc(p.title)}</h3><p>${esc(p.body).replace(/\n/g, '<br>')}</p></div></article>`).join('');
  })();

  // Счётчик посещений (без личных данных)
  try {
    if (!sessionStorage.getItem('v')) {
      const w = innerWidth; const device = w < 700 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop';
      sb.from('visits').insert({ path: location.pathname.slice(0, 300), referrer: (document.referrer || '').slice(0, 500), device }).then(() => {});
      sessionStorage.setItem('v', '1');
    }
  } catch (_) {}

  // Меню на телефоне
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });
  nav.addEventListener('click', (e) => { if (e.target.tagName === 'A') { nav.classList.remove('open'); burger.setAttribute('aria-expanded', false); } });

  // Шапка с линией при скролле
  const header = document.querySelector('.header');
  addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 10), { passive: true });

  // Плавное появление
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });

  // Форма брони
  const today = new Date().toISOString().slice(0, 10);
  const form = document.getElementById('booking-form');
  form.date_in.min = today; form.date_out.min = today;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('form-error');
    err.textContent = '';
    form.querySelectorAll('input').forEach((i) => i.removeAttribute('aria-invalid'));
    const bad = (el, msg) => { el.setAttribute('aria-invalid', 'true'); el.focus(); err.textContent = msg; };
    if (!form.name.value.trim()) return bad(form.name, 'Напишите, как к вам обращаться');
    if (form.phone.value.replace(/\D/g, '').length < 10) return bad(form.phone, 'Проверьте номер телефона');
    if (!form.date_in.value) return bad(form.date_in, 'Выберите дату заезда');
    if (!form.date_out.value || form.date_out.value <= form.date_in.value) return bad(form.date_out, 'Выезд должен быть позже заезда');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Отправляем…';
    const { error } = await sb.from('bookings').insert({
      name: form.name.value.trim().slice(0, 100),
      phone: form.phone.value.trim().slice(0, 30),
      date_in: form.date_in.value,
      date_out: form.date_out.value,
      guests: Math.max(1, Math.min(50, parseInt(form.guests.value, 10) || 1)),
      comment: form.comment.value.trim().slice(0, 1000) || null,
    });
    if (error) {
      btn.disabled = false; btn.textContent = 'Отправить заявку';
      err.textContent = 'Не получилось отправить. Позвоните нам: ' + C.phone;
      return;
    }
    const ok = document.getElementById('form-ok');
    ok.textContent = C.booking.success; ok.hidden = false;
    btn.textContent = 'Заявка отправлена';
  });
})();
