/* Menu and page layout (v1.5):
   - every page of every station can be switched off / on and re-ordered in Settings → "منوها و بخش‌ها"
     (a page that is off disappears from the menu and cannot be opened; it can be switched on again there);
   - inside a page the admin can open "چیدمان این صفحه" and hide / show / move tabs, cards, number boxes and charts,
     and switch a chart between bars and lines — saved for all computers. */
'use strict';

// pages hidden by default (until the admin saves his own choice for that station)
const NAV_DEFAULT_HIDDEN = {
  admin: [
    // stock & accounts: not needed in the admin menu (the stock station has them)
    'stock-dash', 'medicines', 'purchases', 'suppliers', 'expenses', 'withdrawals', 'daily', 'month-account', 'dr-daily', 'monthly', 'med-sales', 'reorder', 'import',
    'expiry', 'controlled', 'abc', 'stock-count', 'po', 'dept-requests', 'compare',
    // reception: only the money parts stay for the admin
    'reception', 'visits', 'reservations', 'patients', 'ipd', 'rc-wd', 'qdisplay', 'reminders',
    // pharmacy: no selling from the admin, only lists and accounts
    'rx-inbox', 'pos', 'ph-wd',
    // laboratory: the admin sees one summary page
    'lab-inbox', 'lab-walkin', 'lab-list', 'lab-tests', 'lab-items', 'lab-reports', 'lab-setup', 'lab-sales', 'lab-qc', 'lab-tat', 'verify'
  ],
  reception: ['lab-reports', 'lab-setup', 'lab-tat', 'verify', 'rc-wd', 'dept-requests'],
  lab: ['lab-qc', 'lab-tat', 'verify', 'dept-requests'],
  doctor: ['verify', 'dept-requests'],
  pharmacy: ['verify'],
  stock: ['verify']
};
// pages that can never be switched off (otherwise nobody could switch them on again)
const NAV_LOCKED = { admin: ['settings', 'local'], _all: ['local'] };

const NavCfg = {
  all() { try { return JSON.parse(App.settings.nav_config || '{}') || {}; } catch (_) { return {}; } },
  of(role) { const c = this.all()[role]; return c && Array.isArray(c.hidden) ? c : { hidden: NAV_DEFAULT_HIDDEN[role] || [], order: [] }; },
  locked(role, page) { return (NAV_LOCKED[role] || []).includes(page) || NAV_LOCKED._all.includes(page); },
  hidden(role, page) { return !this.locked(role, page) && this.of(role).hidden.includes(page); },
  // NAV entries of a role, de-duplicated, in the saved order
  items(role, withHidden) {
    const seen = new Set();
    let items = NAV.filter(n => (role === 'admin' || n[3].includes(role)) && !seen.has(n[0]) && seen.add(n[0]));
    if (!withHidden) items = items.filter(n => !this.hidden(role, n[0]));
    const order = this.of(role).order || [];
    const gRank = (n) => role === 'admin' ? 0 : (n[4] === 'local' ? 3 : n[4] === 'staff' ? 2 : n[4] === role ? 0 : 1);
    const groups = role === 'admin' ? [...new Set(NAV.map(n => n[4]))] : [];
    const oi = (n) => { const i = order.indexOf(n[0]); return i < 0 ? 1e6 + NAV.indexOf(n) : i; };
    return items.map((n, i) => [n, i]).sort((a, b) => (gRank(a[0]) - gRank(b[0])) || (role === 'admin' ? groups.indexOf(a[0][4]) - groups.indexOf(b[0][4]) : 0) || (oi(a[0]) - oi(b[0])) || (a[1] - b[1])).map(x => x[0]);
  }
};

// ---------------------------------------------------------------- page layout (tabs, cards, number boxes, charts)
const Layout = {
  page: null, view: null, obs: null, edit: false, busy: false,
  all() { try { return JSON.parse(App.settings.page_layout || '{}') || {}; } catch (_) { return {}; } },
  cfg(page) { const a = this._draft || this.all(); return a[page] || { hide: [], order: [], chart: {} }; },
  setCfg(page, c) { const a = this._draft || (this._draft = this.all()); a[page] = c; },
  keyOf(el) {
    if (el.dataset.lyKey) return el.dataset.lyKey;
    const clean = (s) => String(s || '').replace(/[\d۰-۹٠-٩,.:٪%()]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    let k = null;
    if (el.matches('.tabs > button')) k = 'tab:' + (el.dataset.t || el.dataset.h || el.dataset.tab || clean(el.textContent));
    else if (el.matches('.kpi')) k = 'kpi:' + clean($('.lbl', el)?.textContent);
    else if (el.matches('.card')) { const h = $(':scope > h2, :scope > .cardHead h2', el); k = 'card:' + (el.id || clean(h?.textContent) || ''); if (k === 'card:') k = null; }
    if (k) el.dataset.lyKey = k;
    return k;
  },
  items(root) {
    return $$('.tabs > button, .kpi, .card', root).filter(el => !el.closest('#modals') && !el.closest('.lyBar') && this.keyOf(el));
  },
  attach(view, page) {
    this.page = page; this.view = view; this._draft = null;
    try { this.obs && this.obs.disconnect(); } catch (_) { }
    this.obs = new MutationObserver(() => { if (!this.busy) this.schedule(); });
    this.obs.observe(view, { childList: true, subtree: true });
    this.apply();
    this.edit && this.decorate();
  },
  schedule() { if (this._t) return; this._t = requestAnimationFrame(() => { this._t = null; this.apply(); if (this.edit) this.decorate(); }); },
  apply() {
    const v = this.view; if (!v || !v.isConnected) return;
    const c = this.cfg(this.page); this.busy = true;
    try {
      const items = this.items(v);
      for (const el of items) el.classList.toggle('lyHidden', c.hide.includes(this.keyOf(el)));
      // order inside the same parent
      if (c.order && c.order.length) {
        const parents = new Set(items.map(el => el.parentElement));
        for (const p of parents) {
          const kids = [...p.children].filter(x => x.dataset.lyKey);
          if (kids.length < 2) continue;
          const pos = (x) => { const i = c.order.indexOf(x.dataset.lyKey); return i < 0 ? 1e6 + kids.indexOf(x) : i; };
          const sorted = kids.slice().sort((a, b) => pos(a) - pos(b));
          if (sorted.every((x, i) => x === kids[i])) continue;
          // put the sorted elements into the places the keyed children used (other elements stay where they are)
          const slots = kids.map(x => { const m = document.createComment('ly'); p.replaceChild(m, x); return m; });
          slots.forEach((m, i) => p.replaceChild(sorted[i], m));
        }
      }
      // a tab that is hidden but open: open the first visible one
      $$('.tabs', v).forEach(t => { const on = $(':scope > button.on', t); if (on && on.classList.contains('lyHidden') && !this.edit) { const f = $$(':scope > button', t).find(b => !b.classList.contains('lyHidden')); if (f) setTimeout(() => f.click(), 0); } });
      this.applyCharts();
    } finally { this.busy = false; }
  },
  applyCharts() {
    const c = this.cfg(this.page);
    for (const ch of App.charts || []) {
      const cv = ch.canvas; if (!cv || !this.view || !this.view.contains(cv)) continue;
      const card = cv.closest('.card'); const k = card && this.keyOf(card); if (!k) continue;
      if (!ch._lyOrig) ch._lyOrig = ch.data.datasets.map(d => d.type || ch.config.type);
      const want = c.chart && c.chart[k];
      const types = ch.data.datasets.map((d, i) => want === 'line' ? 'line' : want === 'bar' ? 'bar' : ch._lyOrig[i]);
      if (ch.data.datasets.every((d, i) => (d.type || ch.config.type) === types[i])) continue;
      ch.data.datasets.forEach((d, i) => { d.type = types[i]; if (types[i] === 'line') { d.borderColor = d.backgroundColor; d.borderWidth = 2; d.pointRadius = 3; d.fill = false; } else { d.borderWidth = 0; d.pointRadius = 0; } });
      try { ch.update(); } catch (_) { }
    }
  },
  // ---------- edit mode (admin)
  toggleEdit() {
    this.edit = !this.edit; document.documentElement.classList.toggle('lyEdit', this.edit);
    if (this.edit) { this._draft = JSON.parse(JSON.stringify(this.all())); this.bar(); this.decorate(); toast('چیدمان: روی 👁 بزنید تا پنهان / نمایان شود، با ▲▼ جابجا کنید، 📊 نوع چارت. در آخر «ذخیره» را بزنید.'); }
    else { $$('.lyTools').forEach(x => x.remove()); $('.lyBar')?.remove(); this._draft = null; this.apply(); }
  },
  bar() {
    $('.lyBar')?.remove();
    const b = document.createElement('div'); b.className = 'lyBar';
    b.innerHTML = `<b>${icon('edit', 15)} چیدمان صفحه</b><span class="muted small">برای همه کمپیوترها ذخیره می‌شود</span><button class="btn sm primary" data-ly="save">${icon('check', 13)} ذخیره</button><button class="btn sm" data-ly="reset">پیش‌فرض این صفحه</button><button class="btn sm ghost" data-ly="exit">خروج</button>`;
    b.onclick = async (e) => {
      const a = e.target.closest('[data-ly]')?.dataset.ly; if (!a) return;
      if (a === 'reset') { const c = this.all(); delete this._draft[this.page]; this.apply(); this.decorate(); void c; }
      if (a === 'save') { try { await API.post('/api/settings', { page_layout: JSON.stringify(this._draft || {}) }); App.settings.page_layout = JSON.stringify(this._draft || {}); toast('چیدمان ذخیره شد', 'good'); this.toggleEdit(); } catch (err) { errToast(err); } }
      if (a === 'exit') this.toggleEdit();
    };
    document.body.appendChild(b);
  },
  decorate() {
    if (!this.view) return; this.busy = true;
    try {
      const c = this.cfg(this.page);
      for (const el of this.items(this.view)) {
        if ($(':scope > .lyTools', el)) continue;
        const k = this.keyOf(el), isTab = el.matches('.tabs > button'), chart = el.matches('.card') && $('canvas', el);
        const t = document.createElement('span'); t.className = 'lyTools';
        t.innerHTML = `<i data-lyt="hide" title="پنهان / نمایان">${c.hide.includes(k) ? '🚫' : '👁'}</i><i data-lyt="up" title="${isTab ? 'قبل' : 'بالا / قبل'}">${isTab ? '▶' : '▲'}</i><i data-lyt="down" title="${isTab ? 'بعد' : 'پایین / بعد'}">${isTab ? '◀' : '▼'}</i>${chart ? `<i data-lyt="chart" title="نوع چارت: ستونی / خطی">📊</i>` : ''}`;
        el.appendChild(t);
      }
    } finally { this.busy = false; }
  },
  act(el, a) {
    const k = this.keyOf(el); const c = JSON.parse(JSON.stringify(this.cfg(this.page))); c.hide = c.hide || []; c.order = c.order || []; c.chart = c.chart || {};
    if (a === 'hide') { const i = c.hide.indexOf(k); i >= 0 ? c.hide.splice(i, 1) : c.hide.push(k); }
    if (a === 'up' || a === 'down') {
      const p = el.parentElement; const kids = [...p.children].filter(x => x.dataset.lyKey); const i = kids.indexOf(el); const j = a === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= kids.length) return;
      [kids[i], kids[j]] = [kids[j], kids[i]];
      const keys = kids.map(x => x.dataset.lyKey); c.order = c.order.filter(x => !keys.includes(x)).concat(keys);
    }
    if (a === 'chart') { const cur = c.chart[k] || ''; c.chart[k] = cur === '' ? 'line' : cur === 'line' ? 'bar' : ''; if (!c.chart[k]) delete c.chart[k]; toast(c.chart[k] === 'line' ? 'چارت خطی' : c.chart[k] === 'bar' ? 'چارت ستونی' : 'چارت پیش‌فرض'); }
    this.setCfg(this.page, c);
    $$('.lyTools', this.view).forEach(x => x.remove());
    this.apply(); this.decorate();
  }
};
// clicks on the edit tools must not open the tab / card underneath
document.addEventListener('click', (e) => {
  const t = e.target.closest('.lyTools [data-lyt]'); if (!t) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  const el = t.closest('.lyTools').parentElement; Layout.act(el, t.dataset.lyt);
}, true);

// ---------------------------------------------------------------- settings tab: menus of every station
function navSettingsHTML() {
  return `<div class="infoBox">هر صفحه‌ای که خاموش شود از منوی همان ایستگاه پاک می‌شود و باز نمی‌شود؛ هر وقت خواستید دوباره روشن کنید. با ▲▼ ترتیب منو را عوض کنید. برای پنهان کردن تب‌ها، کارت‌ها و چارت‌های داخل یک صفحه، در همان صفحه دکمه ${icon('edit', 13)} «چیدمان» بالای صفحه را بزنید.</div>
    <div class="chips" id="navRoles" style="margin:12px 0">${Object.keys(NAV_DEFAULT_HIDDEN).map((r, i) => `<button type="button" class="chip ${i ? '' : 'on'}" data-role="${r}">${icon(STATIONS[r]?.icon || 'user', 13)} ${esc(STATIONS[r]?.name || r)}</button>`).join('')}</div>
    <div class="bar" style="margin-bottom:8px"><button type="button" class="btn sm" data-nav="all">همه روشن</button><button type="button" class="btn sm" data-nav="def">پیش‌فرض این ایستگاه</button></div>
    <div id="navList" class="navCfgList"></div><input type="hidden" name="nav_config" id="navCfgIn" value="${esc(App.settings.nav_config || '')}">
    <div class="secTitle" style="margin-top:16px">تب‌ها و بخش‌های پنهان داخل صفحه‌ها</div><div id="lyHiddenList"></div>`;
}
function bindNavSettings(root) {
  let role = 'admin';
  const cfg = NavCfg.all();
  const cur = () => cfg[role] && Array.isArray(cfg[role].hidden) ? cfg[role] : (cfg[role] = { hidden: (NAV_DEFAULT_HIDDEN[role] || []).slice(), order: [] });
  const save = () => { $('#navCfgIn', root).value = JSON.stringify(cfg); };
  const draw = () => {
    const c = cur(); const tmp = App.settings.nav_config; App.settings.nav_config = JSON.stringify(cfg);
    const items = NavCfg.items(role, true); App.settings.nav_config = tmp;
    let last = null;
    $('#navList', root).innerHTML = items.map((n, i) => { const g = n[4]; const head = role === 'admin' && g !== last ? `<div class="navCfgGroup">${esc(NAV_GROUPS[g] || 'عمومی')}</div>` : ''; last = g; const lk = NavCfg.locked(role, n[0]);
      return `${head}<div class="navCfgRow ${c.hidden.includes(n[0]) && !lk ? 'off' : ''}" data-p="${n[0]}"><label class="check"><input type="checkbox" data-vis ${c.hidden.includes(n[0]) && !lk ? '' : 'checked'} ${lk ? 'disabled' : ''}> ${icon(n[2], 15)} ${esc(n[1])}</label><span class="grow"></span><button type="button" class="btn ghost icon sm" data-mv="-1" title="بالا">▲</button><button type="button" class="btn ghost icon sm" data-mv="1" title="پایین">▼</button></div>`; }).join('');
  };
  $('#navRoles', root).onclick = (e) => { const b = e.target.closest('[data-role]'); if (!b) return; role = b.dataset.role; $$('#navRoles .chip', root).forEach(x => x.classList.toggle('on', x === b)); draw(); };
  $('#navList', root).addEventListener('change', (e) => { const cb = e.target.closest('[data-vis]'); if (!cb) return; const p = cb.closest('[data-p]').dataset.p, c = cur(); c.hidden = c.hidden.filter(x => x !== p); if (!cb.checked) c.hidden.push(p); cb.closest('.navCfgRow').classList.toggle('off', !cb.checked); save(); });
  $('#navList', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-mv]'); if (!b) return; const c = cur();
    const rows = $$('.navCfgRow', root).map(r => r.dataset.p); const p = b.closest('[data-p]').dataset.p; const i = rows.indexOf(p), j = i + Number(b.dataset.mv);
    if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j], rows[i]]; c.order = rows; save(); draw();
  });
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-nav]'); if (!b) return; const c = cur(); if (b.dataset.nav === 'all') c.hidden = []; else { c.hidden = (NAV_DEFAULT_HIDDEN[role] || []).slice(); c.order = []; } save(); draw(); });
  // hidden tabs / cards of the pages
  const lyDraw = () => {
    const all = Layout.all(); const rows = Object.entries(all).flatMap(([pg, c]) => (c.hide || []).map(k => [pg, k]));
    $('#lyHiddenList', root).innerHTML = rows.length ? `<table class="t"><thead><tr><th>صفحه</th><th>تب / بخش</th><th></th></tr></thead><tbody>${rows.map(([pg, k]) => `<tr><td>${esc((NAV.find(n => n[0] === pg) || [])[1] || pg)}</td><td>${esc(k.replace(/^(tab|card|kpi):/, (m, t) => ({ tab: 'تب: ', card: 'بخش: ', kpi: 'عدد: ' })[t]))}</td><td><button type="button" class="btn sm" data-lyshow="${esc(pg)}|${esc(k)}">${icon('eye', 13)} نمایش دوباره</button></td></tr>`).join('')}</tbody></table>` : '<div class="muted small">هیچ تب یا بخشی پنهان نشده.</div>';
  };
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lyshow]'); if (!b) return; const [pg, k] = b.dataset.lyshow.split('|'); const all = Layout.all(); if (all[pg]) all[pg].hide = (all[pg].hide || []).filter(x => x !== k);
    try { await API.post('/api/settings', { page_layout: JSON.stringify(all) }); App.settings.page_layout = JSON.stringify(all); lyDraw(); toast('دوباره نمایان شد', 'good'); } catch (err) { errToast(err); }
  });
  draw(); lyDraw();
}
