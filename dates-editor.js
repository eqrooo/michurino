/* Редактор занятых дат: вкладка админки и Telegram-мини-приложение. Не править.
   MDates.mount(el, { load(), add(days, objects), remove(days, objects), toast(msg) })
   load/add/remove возвращают Promise<rows [{day, object}]> (актуальный список после изменения). */
(() => {
  const C = window.MCal;
  const OBJS = { cottage: ['cottage'], hall: ['hall'], both: ['cottage', 'hall'] };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function mount(el, api) {
    let sel = 'cottage', busy = false;
    el.innerHTML = `
      <div class="de-card">
        <p class="de-step">1. Что занято</p>
        <div class="seg" role="radiogroup" aria-label="Что отмечаем">
          <button type="button" role="radio" aria-checked="true" data-obj="cottage"><i class="sw sw-cottage"></i>Коттедж</button>
          <button type="button" role="radio" aria-checked="false" data-obj="hall"><i class="sw sw-hall"></i>Банкетный зал</button>
          <button type="button" role="radio" aria-checked="false" data-obj="both"><i class="sw sw-both"></i>Оба</button>
        </div>
        <p class="de-step">2. Нажмите на дни — они станут занятыми. Повторное нажатие освобождает день</p>
        <div class="de-cal"></div>
        <div class="cal-legend" aria-hidden="true"><span><i class="sw sw-cottage"></i>Коттедж</span><span><i class="sw sw-hall"></i>Банкетный зал</span><span><i class="sw sw-both"></i>Оба заняты</span><span><i class="sw sw-free"></i>Свободно</span></div>
      </div>
      <form class="de-card de-type" novalidate>
        <p class="de-step">Или впишите даты текстом</p>
        <input name="dates" autocomplete="off" placeholder="Например: 25.12, 31.12–02.01, 8 марта" aria-label="Даты текстом">
        <p class="de-hint">Можно через запятую, промежутки — через тире. Год можно не писать.</p>
        <p class="de-preview" aria-live="polite"></p>
        <div class="de-btns">
          <button type="submit" class="btn btn-small" data-act="add">Отметить занятыми</button>
          <button type="button" class="btn btn-small btn-ghost" data-act="remove">Освободить</button>
        </div>
      </form>
      <div class="de-card">
        <p class="de-step">Ближайшие занятые даты</p>
        <div class="de-list"><p class="empty">Загрузка…</p></div>
      </div>`;
    const cal = C.mount(el.querySelector('.de-cal'), { months: 2, interactive: 'all', allowPast: true, onDay: toggle });
    const form = el.querySelector('.de-type'), prev = el.querySelector('.de-preview');

    el.querySelectorAll('[data-obj]').forEach((b) => b.addEventListener('click', () => {
      sel = b.dataset.obj;
      el.querySelectorAll('[data-obj]').forEach((x) => x.setAttribute('aria-checked', x === b));
      preview();
    }));

    const apply = async (fn, days, objs, okMsg) => {
      if (busy) return; busy = true; el.classList.add('is-busy');
      try { const rows = await fn(days, objs); render(rows); if (okMsg) api.toast(okMsg); return true; }
      catch (e) { console.error(e); api.toast('Не сохранилось — проверьте интернет'); return false; }
      finally { busy = false; el.classList.remove('is-busy'); }
    };
    async function toggle(day, set) {
      const objs = OBJS[sel];
      const allBusy = objs.every((o) => set && set.has(o));
      const what = sel === 'both' ? 'коттедж и зал' : C.OBJ[sel];
      await apply(allBusy ? api.remove : api.add, [day], objs, `${C.human(day)}: ${what} — ${allBusy ? 'свободно' : 'занято'}`);
    }

    function preview() {
      const v = form.dates.value.trim();
      if (!v) { prev.textContent = ''; return null; }
      const r = C.parse(v);
      const what = sel === 'both' ? 'коттедж и зал' : C.OBJ[sel];
      prev.innerHTML = (r.days.length ? `<b>${what}:</b> ${C.ranges(r.days).map(C.rangeText).map(esc).join(', ')} <span>(${r.days.length} дн.)</span>` : '')
        + (r.errors.length ? `<span class="de-err">Не понял: ${r.errors.map(esc).join(', ')}</span>` : '');
      return r;
    }
    form.dates.addEventListener('input', preview);
    const run = async (act) => {
      const r = preview();
      if (!r || !r.days.length) { api.toast('Впишите даты, например 25.12'); form.dates.focus(); return; }
      if (r.errors.length && !confirm('Часть текста не распознана. Сохранить то, что понятно?')) return;
      if (r.days.length > 31 && !confirm(`Это ${r.days.length} дней. Точно?`)) return;
      const ok = await apply(act === 'add' ? api.add : api.remove, r.days, OBJS[sel], act === 'add' ? `Занято дней: ${r.days.length}` : `Освобождено дней: ${r.days.length}`);
      if (ok) { form.dates.value = ''; preview(); }
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); run('add'); });
    form.querySelector('[data-act="remove"]').addEventListener('click', () => run('remove'));

    el.querySelector('.de-list').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-free]'); if (!b) return;
      const [from, to, obj] = b.dataset.free.split('|');
      const days = []; for (let d = from; d <= to; d = C.addDays(d, 1)) days.push(d);
      if (!confirm(`Освободить: ${C.OBJ[obj]}, ${C.rangeText({ from, to })}?`)) return;
      apply(api.remove, days, [obj], 'Освобождено');
    });

    function render(rows) {
      cal.set(rows);
      const today = C.todayIso(), list = [];
      ['cottage', 'hall'].forEach((o) => C.ranges(rows.filter((r) => r.object === o && r.day >= today).map((r) => r.day)).forEach((r) => list.push({ ...r, o })));
      list.sort((a, b) => (a.from < b.from ? -1 : 1));
      el.querySelector('.de-list').innerHTML = list.length ? list.slice(0, 60).map((r) => `
        <div class="de-row"><i class="sw sw-${r.o}"></i><span><b>${C.rangeText(r)}</b> · ${C.OBJ_T[r.o]}${r.n > 1 ? ` · ${r.n} дн.` : ''}</span>
          <button type="button" class="btn-danger" data-free="${r.from}|${r.to}|${r.o}">Освободить</button></div>`).join('')
        : '<p class="empty">Пока всё свободно</p>';
    }

    const reload = () => api.load().then(render).catch((e) => { console.error(e); el.querySelector('.de-list').innerHTML = '<p class="empty">Не загрузилось — проверьте интернет</p>'; });
    reload();
    return { reload };
  }
  window.MDates = { mount };
})();
