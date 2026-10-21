/* Application shell: station, login, navigation, router, live events, search, alerts */
'use strict';


const ALL_ROLES = ['admin', 'stock', 'reception', 'doctor', 'pharmacy', 'lab'];
// [page, label, icon, roles, group]
const NAV = [
  ['admin-dash', 'داشبورد کل کلینیک', 'home', ['admin'], 'admin'],
  ['network', 'شبکه و ایستگاه‌ها', 'network', ['admin'], 'admin'],
  ['users', 'کاربران و دسترسی', 'users', ['admin'], 'admin'],
  ['setup', 'داکتران، خدمات و فیس', 'steth', ['admin'], 'admin'],
  ['settings', 'تنظیمات و سرخط نسخه', 'settings', ['admin'], 'admin'],
  ['audit', 'گزارش فعالیت‌ها', 'audit', ['admin'], 'admin'],
  ['backup', 'پشتیبان دیتابیس', 'database', ['admin'], 'admin'],

  ['stock-dash', 'داشبورد انبار و حسابات', 'chart', ['stock'], 'stock'],
  ['medicines', 'دواها، کد و موجودی', 'pill', ['stock', 'pharmacy'], 'stock'],
  ['purchases', 'فاکتورهای خرید دوا', 'truck', ['stock'], 'stock'],
  ['suppliers', 'کمپنی‌ها و طلبات', 'users', ['stock'], 'stock'],
  ['expenses', 'مصارف و فاکتورهای دیگر', 'receipt', ['stock'], 'stock'],
  ['withdrawals', 'برداشت‌ها', 'wallet', ['stock'], 'stock'],
  ['daily', 'حسابات روزانه', 'calendar', ['stock'], 'stock'],
  ['monthly', 'گزارش ماهانه و مفاد', 'trend', ['stock'], 'stock'],
  ['med-sales', 'فروش و مفاد هر دوا', 'chart', ['stock', 'pharmacy'], 'stock'],
  ['reorder', 'سفارش خرید (کمبودها)', 'cart', ['stock', 'pharmacy'], 'stock'],
  ['import', 'ورود اطلاعات از اکسل', 'excel', ['stock'], 'stock'],

  ['reception', 'پذیرش و نوبت', 'ticket', ['reception'], 'reception'],
  ['visits', 'صف امروز و لیست پذیرش', 'list', ['reception'], 'reception'],
  ['reservations', 'وقت‌دهی / رزرو', 'calendar', ['reception'], 'reception'],
  ['patients', 'مریضان', 'users', ['reception', 'doctor'], 'reception'],
  ['cashier', 'صندوق مرکزی (همه پرداخت‌ها)', 'cash', ['reception'], 'reception'],
  ['rc-lab', 'پذیرش لابراتوار', 'flask', ['reception'], 'reception'],
  ['ipd', 'بستر و تخت‌ها', 'bed', ['reception', 'doctor'], 'reception'],
  ['rc-cash', 'حسابات روز و تحویل صندوق', 'money', ['reception'], 'reception'],
  ['qdisplay', 'صفحه نمایش نوبت (TV)', 'tv', ['reception', 'doctor'], 'reception'],

  ['dr-queue', 'صف مریضان', 'list', ['doctor'], 'doctor'],
  ['encounter', 'ویزیت، نسخه و آزمایش', 'rx', ['doctor'], 'doctor'],
  ['rx-list', 'نسخه‌های نوشته شده', 'file', ['doctor'], 'doctor'],
  ['templates', 'قالب‌های نسخه', 'star', ['doctor'], 'doctor'],
  ['dr-stats', 'آمار ویزیت‌ها', 'chart', ['doctor'], 'doctor'],

  ['rx-inbox', 'نسخه‌های رسیده', 'bell', ['pharmacy'], 'pharmacy'],
  ['pos', 'فروش / تحویل نسخه', 'pill', ['pharmacy'], 'pharmacy'],
  ['sales', 'لیست فروشات دواخانه', 'receipt', ['pharmacy', 'stock'], 'pharmacy'],
  ['ph-daily', 'فروش روزانه دواخانه', 'calendar', ['pharmacy'], 'pharmacy'],

  ['lab-inbox', 'درخواست‌های آزمایش', 'bell', ['lab'], 'lab'],
  ['lab-walkin', 'پذیرش مریض بیرونی', 'plus', ['lab'], 'lab'],
  ['lab-list', 'آزمایش‌ها و نتایج', 'list', ['lab'], 'lab'],
  ['lab-tests', 'لیست آزمایش‌ها و قیمت', 'flask', ['lab'], 'lab'],
  ['lab-items', 'موجودی مواد لابراتوار', 'box', ['lab', 'stock'], 'lab'],
  ['lab-reports', 'آمار مراجعین و درآمد داکتران', 'chart', ['lab', 'stock', 'reception'], 'lab'],
  ['lab-setup', 'انواع پذیرش و داکتران معرف', 'list', ['lab', 'reception'], 'lab'],
  ['lab-sales', 'فروش لابراتوار', 'chart', ['lab'], 'lab'],

  ['local', 'تنظیمات این کمپیوتر', 'settings', ALL_ROLES, 'local']
];
const NAV_GROUPS = { admin: 'مدیریت', stock: 'انبار و حسابات', reception: 'پذیرش', doctor: 'داکتر', pharmacy: 'دواخانه', lab: 'لابراتوار', local: '' };
const HOME = { admin: 'admin-dash', stock: 'stock-dash', reception: 'reception', doctor: 'dr-queue', pharmacy: 'rx-inbox', lab: 'lab-inbox' };
const canSee = (page) => { const n = NAV.find(x => x[0] === page); return !n || App.user?.role === 'admin' || n[3].includes(App.user?.role); };
const isRole = (...r) => App.user && (App.user.role === 'admin' || r.includes(App.user.role));

// ---------- station ----------
function detectStation() {
  const q = new URLSearchParams(location.search).get('station');
  const s = q || (window.native && window.native.station) || '';
  App.station = STATIONS[s] ? s : '';
  const st = STATIONS[App.station] || STATIONS.admin;
  Theme.apply();
  $('#loginStation').innerHTML = App.station ? `${icon(st.icon, 14)} ایستگاه: ${esc(st.name)}` : `${icon('network', 14)} مرورگر شبکه`;
  document.title = (App.station ? st.name + ' — ' : '') + 'سیستم جامع کلینیک';
}

async function loadBootstrap() {
  const b = await API.get('/api/bootstrap');
  App.settings = b.settings; App.doctors = b.doctors; App.services = b.services; App.server = b.server; App.departments = b.departments || [];
  if (b.user) App.user = { ...App.user, ...b.user };
  applyBranding(); Theme.apply();
  return b;
}
function applyBranding() {
  const s = App.settings;
  $('#brandName').textContent = s.clinic_name || 'کلینیک';
  $('#loginClinic').textContent = s.clinic_name || 'کلینیک';
  const logo = s.clinic_logo || 'img/logo.png';
  $$('.brandIcon img, .loginLogo img').forEach(i => i.src = logo);
}

function renderNav() {
  const role = App.user.role;
  const items = NAV.filter(n => role === 'admin' || n[3].includes(role));
  if (role !== 'admin') items.sort((a, b) => (a[4] === 'local') - (b[4] === 'local') || (b[4] === role) - (a[4] === role));
  let lastGroup = null, html = '';
  for (const n of items) {
    const g = role === 'admin' ? n[4] : (n[4] === 'local' ? 'local' : role);
    if (g !== lastGroup) { if (NAV_GROUPS[g] && (role === 'admin' || g === 'local')) html += `<div class="navGroup">${NAV_GROUPS[g]}</div>`; else if (g === 'local') html += '<div class="navGroup"></div>'; lastGroup = g; }
    html += `<button class="navItem" data-page="${n[0]}">${icon(n[2])}<span>${n[1]}</span><span class="cnt hidden" data-cnt="${n[0]}"></span></button>`;
  }
  const st = STATIONS[App.station] || null;
  html += `<div class="sideFoot">${st ? `ایستگاه: <b>${esc(st.name)}</b><br>` : ''}سرور: <span class="ltr">${esc((App.server?.addresses || [location.hostname])[0] || '')}:${esc(App.server?.port || location.port)}</span><br>نسخه ${esc(App.server?.version || '')}<br><span class="small">F5 بارگذاری مجدد · Ctrl+K جستجو</span></div>`;
  $('#sidebar').innerHTML = html;
  $$('#sidebar .navItem').forEach(b => b.onclick = () => go(b.dataset.page));
}

async function go(page, params = {}) {
  if (!Pages[page] || !canSee(page)) page = HOME[App.user.role] || 'local';
  App.page = page; App.params = params;
  $$('#sidebar .navItem').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  destroyCharts();
  const view = $('#view');
  const fresh = view.cloneNode(false); view.replaceWith(fresh);
  fresh.scrollTop = 0;
  try { await Pages[page].render(fresh, params); }
  catch (e) { errToast(e); fresh.innerHTML = `<div class="card"><h2>خطا</h2><p class="muted">${esc(e.message)}</p></div>`; }
  refreshCounts();
}
const reloadPage = debounce(() => { if (App.page && Pages[App.page]) go(App.page, App.params); }, 250);

// ---------- login ----------
async function doLogin(e) {
  e && e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    const r = await API.post('/api/login', { username: $('#loginUser').value, password: $('#loginPass').value, station: App.station || undefined });
    API.setToken(r.token); localSet('last_user', $('#loginUser').value);
    App.user = r.user;
    await startSession();
  } catch (err) { $('#loginErr').textContent = err.message; }
}
async function startSession() {
  await loadBootstrap();
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  const u = App.user;
  $('#userName').textContent = u.full_name || u.username;
  $('#userRole').textContent = (ROLES[u.role] || u.role) + (u.doctor ? ' · ' + doctorName(u.doctor) : '');
  $('#avatar').textContent = (u.full_name || u.username).trim().charAt(0);
  $('#brandStation').textContent = STATIONS[App.station]?.name || ROLES[u.role] || '';
  renderNav();
  connectEvents();
  go(HOME[u.role] || 'local');
  if (u.must_change) setTimeout(() => changePasswordDlg(true), 400);
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (_) { }
}
function onSessionLost() {
  if (!App.user) return;
  App.user = null; API.setToken(''); try { evtSource && evtSource.close(); } catch (_) { }
  $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
  $('#loginErr').textContent = 'جلسه شما پایان یافت؛ دوباره وارد شوید.';
}
async function logout() {
  try { await API.post('/api/logout'); } catch (_) { }
  App.user = null; API.setToken(''); try { evtSource && evtSource.close(); } catch (_) { }
  $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
  $('#loginPass').value = ''; $('#loginPass').focus();
}
function changePasswordDlg(forced) {
  const m = modal({ title: 'تغییر رمز عبور', body: `${forced ? '<div class="warnBox">برای امنیت، رمز پیش‌فرض را تغییر دهید.</div>' : ''}
    <div class="stack"><label class="field"><span>رمز فعلی</span><input type="password" id="cp_old"></label>
    <label class="field"><span>رمز جدید</span><input type="password" id="cp_new"></label>
    <label class="field"><span>تکرار رمز جدید</span><input type="password" id="cp_new2"></label></div>`,
    foot: `<button class="btn primary" id="cp_ok">ذخیره رمز</button><button class="btn" data-close2>بعداً</button>` });
  $('[data-close2]', m.el).onclick = m.close;
  $('#cp_ok', m.el).onclick = async () => {
    const a = $('#cp_new', m.el).value; if (a !== $('#cp_new2', m.el).value) return toast('تکرار رمز یکسان نیست', 'bad');
    try { await API.post('/api/change-password', { old: $('#cp_old', m.el).value, new: a }); toast('رمز عبور تغییر کرد', 'good'); m.close(); } catch (e) { errToast(e); }
  };
}

// ---------- live events ----------
const lowStockSeen = new Map();
function onLiveEvent(m) {
  const role = App.user?.role; if (!role) return;
  const d = m.data || {};
  switch (m.type) {
    case 'visit:new':
      if (role === 'doctor' && (!App.user.doctor_id || m.doctor_id === App.user.doctor_id)) notify('مریض جدید در صف', `${d.full_name} — نوبت ${d.turn_no}`);
      break;
    case 'rx:new': if (role === 'pharmacy') notify('نسخه جدید رسید', `${d.rx_code} — ${d.full_name} (${doctorName({ title: d.doctor_title, name: d.doctor_name })})`); break;
    case 'rx:update': if (role === 'pharmacy' && d.status === 'new') toast(`نسخه ${d.rx_code} توسط داکتر تغییر کرد`, 'info'); break;
    case 'lab:new': if (role === 'lab') notify('درخواست آزمایش جدید', `${d.lab_code} — ${d.full_name}`); break;
    case 'lab:result': if (role === 'doctor' && (!App.user.doctor_id || m.doctor_id === App.user.doctor_id)) notify('نتیجه آزمایش آماده شد', `${d.full_name} — ${d.lab_code}`); break;
    case 'stock:low':
      if (['stock', 'admin'].includes(role) && Date.now() - (lowStockSeen.get(d.id) || 0) > 3600000) { lowStockSeen.set(d.id, Date.now()); toast(`موجودی «${d.name}» کم است (${d.stock})`, 'bad'); }
      break;
    case 'sale:paid': if (role === 'pharmacy') notify('پول نسخه در صندوق پرداخت شد', `${d.sale_code}${d.rx_code ? ' / ' + d.rx_code : ''} — ${d.patient_name || ''} · دوا را تحویل دهید`); break;
    case 'lab:paid': if (role === 'lab') notify('فیس آزمایش در صندوق پرداخت شد', d.lab_code); break;
    case 'labitem:low': if (['lab', 'stock', 'admin'].includes(role) && Date.now() - (lowStockSeen.get('l' + d.id) || 0) > 3600000) { lowStockSeen.set('l' + d.id, Date.now()); toast(`مواد لابراتوار «${d.name}» کم است (${d.stock})`, 'bad'); } break;
    case 'settings:update': case 'setup:update': loadBootstrap().catch(() => { }); break;
    case 'reload': setTimeout(() => location.reload(), 800); return;
  }
  refreshCounts();
  const P = Pages[App.page];
  if (P && P.onEvent && $('#modals').children.length === 0) { try { P.onEvent(m); } catch (e) { console.error(e); } }
}

// ---------- nav counters & alerts ----------
const refreshCounts = debounce(async () => {
  if (!App.user) return;
  const role = App.user.role, set = (k, v) => { const el = $(`[data-cnt="${k}"]`); if (el) { el.textContent = v; el.classList.toggle('hidden', !v); } };
  const items = [];
  try {
    const t = today();
    if (isRole('doctor')) {
      const q = { 'eq.visit_date': t, 'in.status': 'waiting,in_visit', limit: 200 }; if (role === 'doctor' && App.user.doctor_id) q['eq.doctor_id'] = App.user.doctor_id;
      const w = await API.list('visits', q); set('dr-queue', w.length);
      if (role === 'doctor') {
        const res = await API.list('lab_requests', { 'eq.status': 'approved', 'eq.doctor_id': App.user.doctor_id || 0, from: isoDate(addDays(new Date(), -2)), limit: 20 });
        res.forEach(r => items.push({ cls: 'info', ic: '⚗', title: `نتیجه آزمایش: ${r.full_name}`, text: `${r.lab_code} · ${r.tests || ''}`, go: () => openPatientFile(r.patient_id) }));
      }
    }
    if (isRole('pharmacy')) {
      const rx = await API.list('prescriptions', { 'in.status': 'new,partial', from: isoDate(addDays(new Date(), -3)), limit: 200 }); set('rx-inbox', rx.length);
      if (rx.length && role !== 'admin') items.push({ cls: 'warn', ic: 'Rx', title: `${rx.length} نسخه منتظر تحویل`, text: 'نسخه‌های رسیده از داکتران', go: () => go('rx-inbox') });
    }
    if (isRole('lab')) {
      const lr = await API.list('lab_requests', { 'in.status': 'requested,received,completed', limit: 300 }); set('lab-inbox', lr.length);
      const req = lr.filter(x => x.status === 'requested').length;
      if (req && role !== 'admin') items.push({ cls: 'warn', ic: '⚗', title: `${req} درخواست آزمایش جدید`, text: 'منتظر پذیرش', go: () => go('lab-inbox') });
    }
    if (isRole('reception')) {
      try { const pend = await API.get('/api/cashier/pending'); const n2 = pend.sales.filter(x => x.balance > 0.001).length + pend.labs.length + pend.visits.filter(v => v.balance > 0.001).length + pend.admissions.filter(a => a.status === 'admitted' || a.balance > 0.001).length; set('cashier', n2); } catch (_) { }
      const refunds = await API.list('visits', { 'lt.balance': -0.001, 'ne.status': 'cancelled', limit: 50 });
      set('visits', refunds.length);
      refunds.forEach(v => items.push({ cls: 'warn', ic: '؋', title: `بازپرداخت تخفیف داکتر: ${v.full_name}`, text: `${money(-v.balance)} ${currency()} — ${v.visit_no}`, go: () => go('visits') }));
      const res = await API.list('visits', { 'eq.visit_date': t, 'eq.status': 'reserved', limit: 100 });
      if (res.length) items.push({ cls: 'info', ic: '◷', title: `${res.length} وقت رزرو شده برای امروز`, text: 'هنگام رسیدن مریض «حاضر شد» را بزنید', go: () => go('reservations') });
    }
    if (isRole('stock')) {
      const low = await API.list('medicines', { 'eq.active': 1, order: 'stock', limit: 400 });
      const lows = low.filter(m => m.stock <= m.reorder_level && (m.stock > 0 || m.buy_price > 0));
      if (lows.length) items.push({ cls: 'bad', ic: '▣', title: `${lows.length} دوا رو به اتمام`, text: lows.slice(0, 4).map(m => m.name).join('، '), go: () => go('medicines', { filter: 'low' }) });
      const warn = Number(App.settings.expiry_warn_days || 90); const lim = isoDate(addDays(new Date(), warn)).slice(0, 7);
      const exp = low.filter(m => m.next_expiry && m.next_expiry.slice(0, 7) <= lim);
      if (exp.length) items.push({ cls: 'bad', ic: '⌛', title: `${exp.length} دوا نزدیک به تاریخ انقضا`, text: exp.slice(0, 4).map(m => `${m.name} (${m.next_expiry})`).join('، '), go: () => go('medicines', { filter: 'expiring' }) });
      const due = await API.list('purchases', { 'gt.balance': 0.001, limit: 300 });
      const overdue = due.filter(p => p.due_date && p.due_date <= t);
      if (overdue.length) items.push({ cls: 'warn', ic: '؋', title: `${overdue.length} فاکتور سررسید شده`, text: `باقی: ${money(overdue.reduce((a, p) => a + p.balance, 0))} ${currency()}`, go: () => go('purchases', { status: 'open' }) });
    }
  } catch (e) { console.warn(e); }
  App.alerts = items;
  const b = $('#alertsBadge'); b.textContent = items.length; b.classList.toggle('hidden', !items.length);
}, 400);
function showAlerts() {
  const items = App.alerts || [];
  const m = modal({ title: 'هشدارها و یادآوری‌ها', body: items.length ? items.map((x, i) => `<div class="alertItem" data-i="${i}" style="cursor:pointer"><div class="alertIcon ${x.cls}">${x.ic}</div><div><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div></div>`).join('') : '<div class="empty">هشدار جدیدی وجود ندارد ✓</div>' });
  $$('.alertItem', m.el).forEach(el => el.onclick = () => { m.close(); items[Number(el.dataset.i)].go(); });
}

// ---------- global search ----------
const globalSearch = debounce(async () => {
  const q = $('#globalSearch').value.trim(); const box = $('#globalResults');
  if (q.length < 2) { box.classList.add('hidden'); return; }
  const role = App.user.role; const out = [];
  try {
    const up = q.toUpperCase();
    if (/^(RX|R)?-?\d+$/.test(up) && isRole('pharmacy', 'doctor')) {
      const r = await API.list('prescriptions', { q: up.replace(/^R(X)?-?/, ''), limit: 5 });
      r.filter(x => x.rx_code.includes(up.replace(/^RX-?/, '')) || x.rx_code === up).forEach(x => out.push({ code: x.rx_code, text: `نسخه — ${x.full_name}`, extra: statusPill(RX_STATUS, x.status), go: () => role === 'doctor' ? openPatientFile(x.patient_id) : go('pos', { code: x.rx_code }) }));
    }
    if (/^(LB|L)?-?\d+$/.test(up) && isRole('lab', 'doctor')) {
      const r = await API.list('lab_requests', { q: up.replace(/^L(B)?-?/, ''), limit: 5 });
      r.filter(x => x.lab_code.includes(up.replace(/^LB-?/, ''))).forEach(x => out.push({ code: x.lab_code, text: `آزمایش — ${x.full_name}`, extra: statusPill(LAB_STATUS, x.status), go: () => role === 'doctor' ? openPatientFile(x.patient_id) : openLabWork(x.id) }));
    }
    const ps = await API.list('patients', { q, limit: 10 });
    ps.forEach(p => out.push({ code: p.code, text: `${p.full_name} <small class="muted">ولد ${esc(p.father_name || '—')}</small>`, extra: `<small class="muted ltr">${esc(p.phone || '')}</small>`,
      go: () => isRole('doctor') ? openPatientFile(p.id) : isRole('reception') ? go('reception', { patient_id: p.id }) : isRole('lab') ? go('lab-walkin', { patient_id: p.id }) : openPatientBasic(p.id) }));
  } catch (e) { console.warn(e); }
  box.innerHTML = out.length ? out.map((r, i) => `<div class="ddItem" data-i="${i}"><span class="code">${esc(r.code)}</span><span style="flex:1">${r.text}</span>${r.extra || ''}</div>`).join('') : '<div class="empty">چیزی پیدا نشد</div>';
  box.classList.remove('hidden');
  $$('.ddItem', box).forEach(el => el.onmousedown = (e) => { e.preventDefault(); box.classList.add('hidden'); $('#globalSearch').value = ''; out[Number(el.dataset.i)].go(); });
}, 250);

async function openPatientBasic(id) {
  const p = await API.get('/api/patient-basic/' + id);
  modal({ title: 'مریض ' + p.code, size: 'wide', body: `<div class="ptHead">${patientHeadHTML(p)}</div>
    <div class="tableWrap" style="margin-top:12px"><table class="t"><thead><tr><th>تاریخ</th><th>رسید</th><th>خدمت</th><th>داکتر</th><th>نوبت</th><th>وضعیت</th><th>فیس</th></tr></thead>
    <tbody>${p.visits.map(v => `<tr><td>${fmtDate(v.visit_date)}</td><td class="codeTag">${esc(v.visit_no)}</td><td>${esc(v.service_name)}</td><td>${esc(v.doctor_name || '—')}</td><td class="c">${v.turn_no || ''}</td><td>${statusPill(VISIT_STATUS, v.status)}</td><td>${money(v.net)}</td></tr>`).join('') || emptyRow(7)}</tbody></table></div>` });
}
function patientHeadHTML(p) {
  return `<div class="ptAvatar ${p.sex === 'F' ? 'f' : ''}">${esc((p.full_name || '?').charAt(0))}</div>
    <div class="grow"><div class="ptName">${esc(p.full_name)} <small class="muted">ولد ${esc(p.father_name || '—')}</small></div>
    <div class="ptMeta"><span class="codeTag">${esc(p.code)}</span><span>${sexFa(p.sex)}</span><span>${esc(ageLabel(p.birth_date))}</span>${p.phone ? `<span class="ltr">${esc(p.phone)}</span>` : ''}${p.blood_group ? `<span>گروپ خون: ${esc(p.blood_group)}</span>` : ''}${p.address ? `<span>${esc(p.address)}</span>` : ''}</div></div>`;
}

function tickClock() { const d = new Date(); $('#clock').textContent = `${WEEKDAYS[d.getDay()]} ${fmtDate(d)} · ${fmtTime(d)}`; }

// ---------- boot ----------
(async function boot() {
  detectStation();
  try { document.fonts.load('700 20px Nastaliq', 'سلام'); document.fonts.load('700 14px Vazirmatn', 'سلام'); } catch (_) { }
  $('#gsIcon').innerHTML = icon('search', 16);
  $('#alertsIcon').innerHTML = icon('bell', 16);
  $('#loginForm').addEventListener('submit', doLogin);
  $('#logoutBtn').onclick = logout;
  $('#alertsBtn').onclick = showAlerts;
  $('#themeBtn').onclick = () => Theme.cycle();
  $('#userChip').onclick = () => changePasswordDlg(false);
  $('#globalSearch').addEventListener('input', globalSearch);
  $('#globalSearch').addEventListener('blur', () => setTimeout(() => $('#globalResults').classList.add('hidden'), 200));
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#globalSearch').focus(); } });
  $('#loginUser').value = localGet('last_user', App.station === 'admin' ? 'admin' : '');
  $('#loginServer').innerHTML = `سرور: <span class="ltr">${esc(location.host)}</span>${window.native && window.native.changeServer && App.station !== 'admin' ? ' · <a href="#" id="chgServer">تغییر سرور</a>' : ''}`;
  const cs = $('#chgServer'); if (cs) cs.onclick = (e) => { e.preventDefault(); window.native.changeServer(); };
  tickClock(); setInterval(tickClock, 30000);
  setInterval(() => refreshCounts(), 60000);
  try {
    const ping = await API.get('/api/ping');
    $('#loginClinic').textContent = ping.name || $('#loginClinic').textContent;
    App.firstRun = ping.first_run;
  } catch (e) { $('#loginErr').textContent = e.message; }
  if (API.token) {
    try { App.user = await API.get('/api/me'); if (App.station && App.user.station !== App.station && App.user.role !== 'admin' && App.user.role !== App.station) throw new Error('station'); return await startSession(); }
    catch (_) { API.setToken(''); App.user = null; }
  }
  if (App.firstRun) $('#loginHint').innerHTML = 'ورود اول: کاربر <b>admin</b> و رمز <b>1234</b>';
  ($('#loginUser').value ? $('#loginPass') : $('#loginUser')).focus();
})();
