/* Core helpers shared by every station: DOM, API client, live events, dates (solar), dialogs */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (x) => (x === '' || x === null || x === undefined || !isFinite(Number(x))) ? null : Number(x);
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

const Pages = {};
const App = { user: null, settings: {}, doctors: [], services: [], page: null, params: {}, charts: [], station: '', online: false };

// ---------------- stations ----------------
const STATIONS = {
  admin: { name: 'مدیریت (Admin)', short: 'مدیر', color: '#0f4c81', color2: '#1769aa', icon: 'shield' },
  stock: { name: 'انبار و حسابات', short: 'انبار', color: '#5b3cc4', color2: '#6d4fe0', icon: 'box' },
  reception: { name: 'پذیرش و نوبت', short: 'پذیرش', color: '#04704f', color2: '#088a62', icon: 'ticket' },
  doctor: { name: 'داکتر', short: 'داکتر', color: '#0b5e8e', color2: '#1478b3', icon: 'steth' },
  pharmacy: { name: 'دواخانه', short: 'دواخانه', color: '#0e6b75', color2: '#12838f', icon: 'pill' },
  lab: { name: 'لابراتوار', short: 'لابراتوار', color: '#9a4d0b', color2: '#b45e12', icon: 'flask' }
};
const ROLES = { admin: 'مدیر سیستم', stock: 'انبار و حسابات', reception: 'پذیرش', doctor: 'داکتر', pharmacy: 'دواخانه', lab: 'لابراتوار' };

// ---------------- icons (inline SVG, stroke = currentColor) ----------------
const ICONS = {
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  shield: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5zM9 12l2 2 4-4',
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  ticket: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4zM13 5v14',
  steth: 'M5 3v5a4 4 0 0 0 8 0V3M9 12v3a5 5 0 0 0 10 0v-2M19 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  pill: 'M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7zM8.5 8.5l7 7',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10',
  users: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0',
  network: 'M12 3v6M12 9a2 2 0 1 0 0 4M5 21v-4h14v4M12 13v4M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4M19 17a2 2 0 1 0 0 4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  audit: 'M12 8v4l3 3M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', x: 'M18 6L6 18M6 6l12 12',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  pdf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15h6M9 11h2',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6', check: 'M20 6L9 17l-5-5', eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  money: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01', chart: 'M18 20V10M12 20V4M6 20v-6', trend: 'M3 3v18h18M7 15l4-4 3 3 6-6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', calendar: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18', clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  list: 'M9 5h10M9 12h10M9 19h10M4 5h.01M4 12h.01M4 19h.01', file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  receipt: 'M5 2v20l3-2 2 2 2-2 2 2 2-2 3 2V2l-3 2-2-2-2 2-2-2-2 2zM9 8h6M9 12h6M9 16h4', truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  wallet: 'M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z', percent: 'M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  rx: 'M5 3h6a4 4 0 0 1 0 8H5zM5 3v18M9 11l9 10M18 13l-5 6', star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  barcode: 'M3 5v14M7 5v14M10 5v14M14 5v14M17 5v14M21 5v14', heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z',
  arrow: 'M19 12H5M12 19l-7-7 7-7', next: 'M5 12h14M12 5l7 7-7 7', alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  database: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3', excel: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 12l4 5M12 12l-4 5'
};
function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ''}"/></svg>`;
}

// ---------------- API client ----------------
const API = {
  token: (() => { try { return localStorage.getItem('acdb_token') || ''; } catch (_) { return ''; } })(),
  setToken(t) { this.token = t || ''; try { t ? localStorage.setItem('acdb_token', t) : localStorage.removeItem('acdb_token'); } catch (_) { } },
  async req(method, url, body) {
    let r;
    try {
      r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { throw new Error('ارتباط با سرور (کمپیوتر مدیر) قطع است. شبکه را بررسی کنید.'); }
    let j; try { j = await r.json(); } catch (_) { throw new Error('پاسخ نامعتبر از سرور (' + r.status + ')'); }
    if (r.status === 401 && App.user) { onSessionLost(); }
    if (!j.ok) throw new Error(j.error || 'خطا');
    return j.data;
  },
  get(url, q) { const qs = q ? '?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : ''; return this.req('GET', url + qs); },
  post(url, body) { return this.req('POST', url, body || {}); },
  list(res, q) { return this.get('/api/list/' + res, q); },
  one(res, id) { return this.get(`/api/get/${res}/${id}`); },
  save(res, obj) { return this.post('/api/save/' + res, obj); },
  del(res, id) { return this.post(`/api/delete/${res}/${id}`); }
};

// ---------------- live events ----------------
let evtSource = null;
function connectEvents() {
  try { evtSource && evtSource.close(); } catch (_) { }
  if (!API.token) return;
  evtSource = new EventSource(`/api/events?token=${encodeURIComponent(API.token)}&station=${encodeURIComponent(App.station || 'browser')}`);
  evtSource.addEventListener('msg', (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } setOnline(true); onLiveEvent(m); });
  evtSource.onopen = () => setOnline(true);
  evtSource.onerror = () => setOnline(false);
}
function setOnline(v) {
  if (App.online === v) return; App.online = v;
  const el = $('#netState'); if (el) { el.className = 'netState ' + (v ? 'on' : 'off'); el.title = v ? 'متصل به سرور' : 'اتصال قطع است'; $('span', el).textContent = v ? 'متصل' : 'قطع'; }
}

// short notification sound (WebAudio)
let audioCtx = null;
function beep(kind = 'info') {
  if (localGet('sound', '1') !== '1') return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'bad' ? [440, 330] : kind === 'good' ? [660, 880] : [784, 1046];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * .16; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + .02); g.gain.exponentialRampToValueAtTime(0.0001, t + .15);
      o.start(t); o.stop(t + .16);
    });
  } catch (_) { }
}
function notify(title, body) {
  beep();
  toast(title + (body ? ' — ' + body : ''), 'info', 7000);
  try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: 'img/logo.png' }); } catch (_) { }
}

// local (per computer) preferences
function localGet(k, d) { try { const v = localStorage.getItem('acdb_' + k); return v === null ? d : v; } catch (_) { return d; } }
function localSet(k, v) { try { localStorage.setItem('acdb_' + k, v); } catch (_) { } }

// ---------------- formatting ----------------
const SOLAR_MONTHS = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];
const GREG_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

function money(x) { const n = Number(x || 0); return n.toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function moneyC(x) { return `${money(x)} <small class="muted">${esc(currency())}</small>`; }
function currency() { const c = App.settings.currency || 'AFN'; return c === 'AFN' ? 'افغانی' : c; }
function fmtNum(v, dec) { const n = num(v); if (n === null) return v ?? ''; return dec === null || dec === undefined ? String(+n.toFixed(4)) : n.toFixed(dec); }
const pad2 = (n) => String(n).padStart(2, '0');

function toDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const str = String(s);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(str) ? str + 'T12:00:00' : str.replace(' ', 'T'));
  return isNaN(d) ? null : d;
}
const _pfmt = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' });
function solarParts(d) { const p = _pfmt.formatToParts(d); const g = k => Number((p.find(x => x.type === k) || {}).value); return { y: g('year'), m: g('month'), d: g('day') }; }
function solarToDate(y, m, d) {
  if (!(y > 1200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const g = new Date(y + 621, 2, 21, 12); g.setDate(g.getDate() + (m <= 6 ? (m - 1) * 31 : 186 + (m - 7) * 30) + (d - 1));
  for (let i = 0; i < 6; i++) {
    const s = solarParts(g); const diff = (y - s.y) * 372 + (m - s.m) * 31 + (d - s.d);
    if (!diff) return g;
    g.setDate(g.getDate() + Math.sign(diff) * Math.min(Math.abs(diff), 31));
  }
  return null;
}
const useSolar = () => (App.settings.calendar || 'solar') === 'solar';
function isoDate(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function today() { return isoDate(new Date()); }
function addDays(d, n) { const x = new Date(toDate(d)); x.setDate(x.getDate() + n); return x; }
function fmtDate(s) {
  const d = toDate(s); if (!d) return '';
  if (useSolar()) { const p = solarParts(d); return `${p.d} ${SOLAR_MONTHS[p.m - 1]} ${p.y}`; }
  return `${d.getDate()} ${GREG_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateNum(s) {
  const d = toDate(s); if (!d) return '';
  if (useSolar()) { const p = solarParts(d); return `${p.y}/${pad2(p.m)}/${pad2(p.d)}`; }
  return isoDate(d);
}
function fmtTime(s) { const d = toDate(s); return d ? d.toTimeString().slice(0, 5) : ''; }
function fmtDateTime(s) { const d = toDate(s); return d ? `${fmtDate(d)} ${fmtTime(d)}` : ''; }
function fmtDateTimeNum(s) { const d = toDate(s); return d ? `${fmtDateNum(d)} ${fmtTime(d)}` : ''; }
function weekday(s) { const d = toDate(s); return d ? WEEKDAYS[d.getDay()] : ''; }
// parse what a user typed: 1405/7/27, 27/7/1405, 2026-10-19 → ISO
function parseDateInput(v) {
  const s = String(v || '').trim().replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
  if (!s) return '';
  let m = s.match(/^(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})$/);
  if (m) { const y = +m[1]; if (y > 1900) return `${y}-${pad2(m[2])}-${pad2(m[3])}`; const d = solarToDate(y, +m[2], +m[3]); return d ? isoDate(d) : null; }
  m = s.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})$/);
  if (m) { const y = +m[3]; if (y > 1900) return `${y}-${pad2(m[2])}-${pad2(m[1])}`; const d = solarToDate(y, +m[2], +m[1]); return d ? isoDate(d) : null; }
  return null;
}
// month bucket according to the chosen calendar
function monthKey(s) {
  const d = toDate(s); if (!d) return null;
  if (useSolar()) { const p = solarParts(d); return { key: `${p.y}-${pad2(p.m)}`, label: `${SOLAR_MONTHS[p.m - 1]} ${p.y}`, short: SOLAR_MONTHS[p.m - 1] }; }
  return { key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: `${GREG_MONTHS[d.getMonth()]} ${d.getFullYear()}`, short: GREG_MONTHS[d.getMonth()] };
}
function monthRange(key) {
  const [y, m] = key.split('-').map(Number);
  if (useSolar()) {
    const s = solarToDate(y, m, 1); const e = m === 12 ? solarToDate(y + 1, 1, 1) : solarToDate(y, m + 1, 1);
    return [isoDate(s), isoDate(addDays(e, -1))];
  }
  return [`${y}-${pad2(m)}-01`, isoDate(new Date(y, m, 0, 12))];
}
function currentMonthRange() { return monthRange(monthKey(new Date()).key); }
function lastMonths(n) {
  const out = []; const cur = monthKey(new Date()).key.split('-').map(Number);
  let [y, m] = cur;
  for (let i = 0; i < n; i++) { out.unshift(`${y}-${pad2(m)}`); m--; if (m < 1) { m = 12; y--; } }
  return out.map(k => { const [s] = monthRange(k); return { ...monthKey(s), range: monthRange(k) }; });
}

// ---------------- age ----------------
function ageParts(birth, at = new Date()) {
  const b = toDate(birth); if (!b) return null;
  const a = toDate(at); let y = a.getFullYear() - b.getFullYear(), m = a.getMonth() - b.getMonth(), d = a.getDate() - b.getDate();
  if (d < 0) { m--; d += 30; } if (m < 0) { y--; m += 12; }
  return { y, m, d, days: Math.floor((a - b) / 86400000) };
}
// children (under 15) show years and months, babies months and days
function ageLabel(birth) {
  const p = ageParts(birth); if (!p) return '—';
  if (p.y >= 15) return `${p.y} سال`;
  if (p.y >= 1) return `${p.y} سال${p.m ? ' و ' + p.m + ' ماه' : ''}`;
  if (p.m >= 1) return `${p.m} ماه${p.d ? ' و ' + p.d + ' روز' : ''}`;
  return `${Math.max(0, p.days)} روز`;
}
function ageGroup(birth) {
  const p = ageParts(birth); if (!p) return '';
  if (p.days <= 28) return 'نوزاد'; if (p.y < 2) return 'شیرخوار'; if (p.y < 15) return 'طفل'; if (p.y >= 60) return 'سالمند'; return 'بزرگسال';
}
const sexFa = s => s === 'F' ? 'مونث' : 'مذکر';

// ---------------- UI: toast / modal / confirm ----------------
function toast(msg, type = '', ms) {
  const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), ms || (type === 'bad' ? 6000 : 3200));
}
function errToast(e) { console.error(e); toast(String(e && e.message || e).replace(/^Error:\s*/, ''), 'bad'); }

function modal({ title, body = '', size = '', foot = '', onClose } = {}) {
  const back = document.createElement('div'); back.className = 'modalBack';
  back.innerHTML = `<div class="modal ${size}" role="dialog"><div class="modalHead"><h3>${title}</h3><button class="btn ghost icon" data-close>${icon('x')}</button></div>
    <div class="modalBody">${body}</div>${foot ? `<div class="modalFoot">${foot}</div>` : ''}</div>`;
  $('#modals').appendChild(back);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape' && back === $('#modals').lastElementChild) close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) back.dataset.down = '1'; });
  back.addEventListener('mouseup', (e) => { if (e.target === back && back.dataset.down) close(); delete back.dataset.down; });
  $('[data-close]', back).onclick = close;
  setTimeout(() => { const f = $('[autofocus], input:not([type=hidden]):not([readonly]):not([type=checkbox]), select, textarea', $('.modalBody', back)); f && f.focus(); }, 30);
  return { el: back, body: $('.modalBody', back), close };
}
function confirmDlg(message, { okText = 'بله', danger = false } = {}) {
  return new Promise(resolve => {
    const m = modal({ title: 'تأیید', body: `<p style="margin:0;line-height:1.9">${message}</p>`,
      foot: `<button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${okText}</button><button class="btn" data-no>انصراف</button>`, onClose: () => resolve(false) });
    $('[data-ok]', m.el).onclick = () => { resolve(true); m.close(); };
    $('[data-no]', m.el).onclick = () => m.close();
    setTimeout(() => $('[data-ok]', m.el).focus(), 40);
  });
}
function promptDlg(title, { label = '', value = '', type = 'text', okText = 'تأیید', textarea = false } = {}) {
  return new Promise(resolve => {
    const m = modal({ title, body: `<label class="field"><span>${label}</span>${textarea ? `<textarea id="pd_val" rows="3">${esc(value)}</textarea>` : `<input type="${type}" id="pd_val" value="${esc(value)}">`}</label>`,
      foot: `<button class="btn primary" data-ok>${okText}</button><button class="btn" data-no>انصراف</button>`, onClose: () => resolve(null) });
    let done = false;
    const ok = () => { if (done) return; done = true; const v = $('#pd_val', m.el).value; m.close(); resolve(v); };
    $('[data-ok]', m.el).onclick = ok; $('[data-no]', m.el).onclick = () => m.close();
    $('#pd_val', m.el).addEventListener('keydown', e => { if (e.key === 'Enter' && !textarea) ok(); });
  });
}

// delegate clicks on [data-act] inside root
function actions(root, map) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = map[el.dataset.act];
    if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch(errToast); }
  });
}
function formValues(root) {
  const o = {};
  $$('[name]', root).forEach(el => {
    if (el.type === 'checkbox') o[el.name] = el.checked ? 1 : 0;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.classList.contains('sdate')) o[el.name] = parseDateInput(el.value) || '';
    else o[el.name] = el.value;
  });
  return o;
}
// busy button helper
async function busy(btn, fn) {
  if (!btn) return fn();
  if (btn.disabled) return;
  btn.disabled = true; btn.classList.add('busy');
  try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('busy'); }
}

// ---------------- date picker (solar / gregorian) ----------------
function dateInput(name, iso, attrs = '') {
  return `<input class="sdate" name="${name}" value="${esc(iso ? fmtDateNum(iso) : '')}" placeholder="${useSolar() ? '۱۴۰۵/۰۷/۲۷' : 'YYYY-MM-DD'}" autocomplete="off" ${attrs}>`;
}
function setDateInput(el, iso) { el.value = iso ? fmtDateNum(iso) : ''; el.dispatchEvent(new Event('change', { bubbles: true })); }
function dateOf(el) { return parseDateInput(el.value) || ''; }
(function datePicker() {
  let pop = null, target = null, view = null;
  const close = () => { pop && pop.remove(); pop = null; target = null; };
  function render() {
    const solar = useSolar();
    const { y, m } = view;
    const first = solar ? solarToDate(y, m, 1) : new Date(y, m - 1, 1, 12);
    const nextFirst = solar ? (m === 12 ? solarToDate(y + 1, 1, 1) : solarToDate(y, m + 1, 1)) : new Date(y, m, 1, 12);
    const len = Math.round((nextFirst - first) / 86400000);
    const startDow = (first.getDay() + 1) % 7; // Saturday first
    const sel = parseDateInput(target.value); const tday = today();
    let cells = '';
    for (let i = 0; i < startDow; i++) cells += '<span></span>';
    for (let d = 1; d <= len; d++) {
      const iso = isoDate(addDays(first, d - 1));
      cells += `<button type="button" data-iso="${iso}" class="${iso === sel ? 'on' : ''} ${iso === tday ? 'today' : ''}">${d}</button>`;
    }
    pop.innerHTML = `<div class="dpHead"><button type="button" data-nav="-1">‹</button><b>${solar ? SOLAR_MONTHS[m - 1] : GREG_MONTHS[m - 1]} ${y}</b><button type="button" data-nav="1">›</button></div>
      <div class="dpGrid dpDow">${(solar ? ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] : ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr']).map(x => `<span>${x}</span>`).join('')}</div>
      <div class="dpGrid">${cells}</div><div class="dpFoot"><button type="button" data-iso="${tday}">امروز</button><button type="button" data-clear>پاک</button></div>`;
  }
  document.addEventListener('focusin', (e) => {
    const el = e.target; if (!el.classList || !el.classList.contains('sdate') || el.readOnly) return;
    if (target === el) return; close(); target = el;
    const d = toDate(parseDateInput(el.value) || today());
    view = useSolar() ? (({ y, m }) => ({ y, m }))(solarParts(d)) : { y: d.getFullYear(), m: d.getMonth() + 1 };
    pop = document.createElement('div'); pop.className = 'datePop';
    document.body.appendChild(pop); render();
    const r = el.getBoundingClientRect();
    pop.style.top = Math.min(window.innerHeight - 300, r.bottom + 4) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 260, r.left)) + 'px';
    pop.addEventListener('mousedown', ev => ev.preventDefault());
    pop.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.nav) { view.m += Number(b.dataset.nav); if (view.m < 1) { view.m = 12; view.y--; } if (view.m > 12) { view.m = 1; view.y++; } render(); return; }
      if (b.dataset.clear !== undefined) { setDateInput(target, ''); close(); return; }
      if (b.dataset.iso) { setDateInput(target, b.dataset.iso); const t = target; close(); t.blur(); }
    });
  });
  document.addEventListener('focusout', (e) => { if (e.target === target) setTimeout(() => { if (document.activeElement !== target) { const v = target && target.value; if (target && v && parseDateInput(v) === null) target.classList.add('invalid'); else target && target.classList.remove('invalid'); close(); } }, 120); });
  window.addEventListener('resize', close);
})();

// ---------------- CSV export ----------------
function toCSV(rows, cols) {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map(c => q(c[1])).join(','), ...rows.map(r => cols.map(c => q(typeof c[0] === 'function' ? c[0](r) : r[c[0]])).join(','))].join('\r\n');
}
function downloadText(name, text, type = 'text/csv') {
  const blob = new Blob(['﻿' + text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function exportCSV(name, rows, cols) { downloadText(name + '.csv', toCSV(rows, cols)); toast('فایل CSV دانلود شد (قابل باز کردن در Excel)', 'good'); }
function fileToBase64(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(file); });
}
function pickFile(accept) {
  return new Promise(resolve => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept || ''; i.style.display = 'none';
    i.onchange = () => { resolve(i.files[0] || null); i.remove(); }; document.body.appendChild(i); i.click();
  });
}

// ---------------- small UI builders ----------------
function kpi(label, value, { sub = '', cls = '', ic = '' } = {}) {
  return `<div class="kpi ${cls}"><div class="lbl">${ic ? icon(ic, 14) : ''}${label}</div><div class="val">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}
function pill(text, cls = '') { return `<span class="pill ${cls}">${esc(text)}</span>`; }
function emptyRow(cols, text = 'موردی پیدا نشد') { return `<tr><td colspan="${cols}" class="empty">${text}</td></tr>`; }
function opt(list, sel, { empty } = {}) {
  return (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') + list.map(x => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
}
function listSetting(key) { return String(App.settings[key] || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean); }
function datalist(id, items) { return `<datalist id="${id}">${items.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`; }
function doctorName(d) { if (!d) return ''; return `${d.title ? d.title + ' ' : ''}${d.name}`; }
function doctorById(id) { return App.doctors.find(d => d.id === Number(id)); }
function statusPill(map, s) { const x = map[s] || [s, '']; return `<span class="pill ${x[1]}">${esc(x[0])}</span>`; }
const VISIT_STATUS = { reserved: ['رزرو', 'violet'], waiting: ['در انتظار', 'warn'], in_visit: ['نزد داکتر', 'info'], done: ['ویزیت شد', 'good'], cancelled: ['لغو', 'bad'], no_show: ['نیامد', ''] };
const RX_STATUS = { new: ['جدید', 'warn'], partial: ['قسمی تحویل', 'info'], dispensed: ['تحویل شد', 'good'], cancelled: ['لغو', 'bad'] };
const LAB_STATUS = { requested: ['درخواست شده', 'warn'], received: ['پذیرش شد', 'info'], completed: ['نتایج تکمیل', 'violet'], approved: ['تأیید شد', 'good'], delivered: ['تحویل شد', 'good'], cancelled: ['لغو', 'bad'] };
const PAY_STATUS = { paid: ['پرداخت شد', 'good'], partial: ['قسطی / ناقص', 'warn'], unpaid: ['پرداخت نشده', 'bad'] };
const PAY_TYPES = { cash: 'نقد', installment: 'قسطی', credit: 'قرض (بعداً)' };
const PAY_METHODS = { cash: 'نقد', card: 'کارت', transfer: 'حواله' };
const SECTIONS = { clinic: 'کلینیک', pharmacy: 'دواخانه', lab: 'لابراتوار', reception: 'پذیرش', personal: 'شخصی' };

// search-as-you-type dropdown for an input; fetch(q) → rows; render(row) → html; pick(row)
function autocomplete(input, { fetch: fetchFn, render, pick, min = 1, delay = 160 }) {
  const box = document.createElement('div'); box.className = 'dropdown hidden';
  input.parentElement.style.position = 'relative'; input.parentElement.appendChild(box);
  let rows = [], active = -1;
  const show = (r) => {
    rows = r; active = r.length ? 0 : -1;
    box.innerHTML = r.length ? r.map((x, i) => `<div class="ddItem ${i === 0 ? 'active' : ''}" data-i="${i}">${render(x)}</div>`).join('') : '<div class="empty" style="padding:12px">چیزی پیدا نشد</div>';
    box.classList.remove('hidden');
  };
  const run = debounce(async () => {
    const q = input.value.trim(); if (q.length < min) { box.classList.add('hidden'); return; }
    try { show(await fetchFn(q)); } catch (e) { errToast(e); }
  }, delay);
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (box.classList.contains('hidden')) return;
    const items = $$('.ddItem', box);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, Math.min(items.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1))); items.forEach((el, i) => el.classList.toggle('active', i === active)); items[active]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && active >= 0 && rows[active]) { e.preventDefault(); e.stopPropagation(); box.classList.add('hidden'); pick(rows[active]); }
    else if (e.key === 'Escape') box.classList.add('hidden');
  });
  box.addEventListener('mousedown', (e) => { e.preventDefault(); const it = e.target.closest('.ddItem'); if (it) { box.classList.add('hidden'); pick(rows[Number(it.dataset.i)]); } });
  input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 150));
  return { close: () => box.classList.add('hidden'), refresh: run };
}

// patient search (code / name / phone)
function patientSearch(input, onPick) {
  return autocomplete(input, {
    fetch: (q) => API.list('patients', { q, limit: 15 }),
    render: (p) => `<span class="code">${esc(p.code)}</span><span style="flex:1">${esc(p.full_name)} <small class="muted">ولد ${esc(p.father_name || '—')}</small></span><small class="muted">${esc(ageLabel(p.birth_date))} · ${sexFa(p.sex)}</small><small class="muted ltr">${esc(p.phone || '')}</small>`,
    pick: onPick
  });
}
// quick numeric input that selects on focus
document.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches('input[type=number], input.selAll')) setTimeout(() => { try { e.target.select(); } catch (_) { } }, 0); });


// ---------------- theme: light / dark / auto + accent colour (per computer) ----------------
const Theme = {
  mode() { return localGet('theme', 'auto'); },
  dark() { const m = this.mode(); return m === 'dark' || (m === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); },
  apply() {
    const dark = this.dark();
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const st = STATIONS[App.station] || STATIONS.admin;
    let accent = localGet('accent_' + (App.station || 'browser'), '') || App.settings['color_' + (App.station || 'admin')] || '';
    if (!/^#[0-9a-f]{6}$/i.test(accent)) accent = '';
    setAccent(accent || st.color, accent ? mixColor(accent, '#ffffff', .12) : st.color2);
    if (window.Chart) { Chart.defaults.color = dark ? '#cbd5e1' : '#475569'; if (typeof CH !== 'undefined') { CH.grid = dark ? '#273244' : '#eef1f5'; CH.text = dark ? '#cbd5e1' : '#475569'; CH.surface = dark ? '#111827' : '#ffffff'; } }
    const b = document.getElementById('themeBtn'); if (b) b.innerHTML = icon(dark ? 'sun' : 'moon', 16);
  },
  cycle() { const order = ['light', 'dark', 'auto']; const m = order[(order.indexOf(this.mode()) + 1) % 3]; localSet('theme', m); this.apply(); toast({ light: 'حالت روشن', dark: 'حالت تاریک', auto: 'خودکار (مطابق ویندوز)' }[m]); if (App.page && Pages[App.page]) reloadPage(); }
};
function mixColor(hex, to, t) { return '#' + [1, 3, 5].map(i => { const a = parseInt(hex.substr(i, 2), 16), b = parseInt(to.substr(i, 2), 16); return Math.round(a + (b - a) * t).toString(16).padStart(2, '0'); }).join(''); }
function setAccent(c1, c2) {
  const r = document.documentElement.style; const dark = document.documentElement.dataset.theme === 'dark';
  r.setProperty('--brand', c1); r.setProperty('--brand-2', c2 || c1);
  r.setProperty('--brand-soft', dark ? mixColor(c2 || c1, '#0f172a', .78) : mixColor(c2 || c1, '#ffffff', .9));
  r.setProperty('--brand-ink', dark ? mixColor(c1, '#ffffff', .55) : mixColor(c1, '#000000', .25));
  r.setProperty('--brand-dark', mixColor(c1, '#000000', .3));
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => Theme.apply()); } catch (_) { }
ICONS.sun = 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4';
ICONS.moon = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z';
ICONS.bed = 'M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9';
ICONS.tv = 'M2 7h20v12H2zM17 2l-5 5-5-5';
ICONS.cash = 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01';
ICONS.cart = 'M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM20 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6';
ICONS.megaphone = 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8';

// ---------------- age input: years / months / days (children & newborns) ----------------
function ageInputHTML(prefix, birth, { compact = false } = {}) {
  const p = ageParts(birth) || {};
  const v = (x) => (birth ? x : '');
  return `<div class="ageIn ${compact ? 'compact' : ''}" data-age="${prefix}">
    <label><input type="number" min="0" max="120" data-a="y" value="${esc(v(p.y ?? ''))}" placeholder="0"><span>سال</span></label>
    <label><input type="number" min="0" max="11" data-a="m" value="${esc(birth && p.y < 15 ? p.m : '')}" placeholder="0"><span>ماه</span></label>
    <label><input type="number" min="0" max="31" data-a="d" value="${esc(birth && p.y < 1 ? p.d : '')}" placeholder="0"><span>روز</span></label>
    <small class="ageHint"></small></div>`;
}
function bindAgeInput(root, prefix) {
  const box = $(`[data-age="${prefix}"]`, root); if (!box) return;
  const upd = () => { const a = ageValue(root, prefix); const hint = $('.ageHint', box); if (!a) { hint.textContent = ''; return; } const b = birthFromAgeParts(a.age_years, a.age_months, a.age_days); hint.textContent = `${ageGroup(b)} · ${ageLabel(b)}`; };
  box.addEventListener('input', upd); upd();
}
function ageValue(root, prefix) {
  const box = $(`[data-age="${prefix}"]`, root); if (!box) return null;
  const g = (k) => $(`[data-a="${k}"]`, box).value;
  if (g('y') === '' && g('m') === '' && g('d') === '') return null;
  return { age_years: Number(g('y')) || 0, age_months: Number(g('m')) || 0, age_days: Number(g('d')) || 0 };
}
function setAgeInput(root, prefix, birth) {
  const box = $(`[data-age="${prefix}"]`, root); if (!box) return;
  const p = ageParts(birth);
  $('[data-a="y"]', box).value = p ? p.y : ''; $('[data-a="m"]', box).value = p && p.y < 15 ? p.m : ''; $('[data-a="d"]', box).value = p && p.y < 1 ? p.d : '';
  box.dispatchEvent(new Event('input'));
}
function birthFromAgeParts(y, m, d) { const x = new Date(); x.setHours(12, 0, 0, 0); x.setFullYear(x.getFullYear() - (Number(y) || 0)); x.setMonth(x.getMonth() - (Number(m) || 0)); x.setDate(x.getDate() - (Number(d) || 0)); return isoDate(x); }
function bmi(w, h) { w = Number(w); h = Number(h); if (!w || !h) return null; return Math.round(w / Math.pow(h / 100, 2) * 10) / 10; }

// ---------------- doctor picker: dropdown grouped by department, with search, load and "new doctor" ----------------
function doctorPickerHTML(id, { allowNone = true, placeholder = 'انتخاب داکتر…' } = {}) {
  return `<div class="drPick" id="${id}"><button type="button" class="drPickBtn"><span class="drPickVal muted">${esc(placeholder)}</span><span class="caret">▾</span></button>
    <div class="drPickPop hidden"><input class="drPickQ" placeholder="جستجوی داکتر، بخش یا نوع کار…"><div class="drPickList"></div>
    <div class="drPickFoot">${allowNone ? '<button type="button" class="btn sm ghost" data-none>بدون داکتر</button>' : ''}${isRole('reception') ? `<button type="button" class="btn sm" data-newdr>${icon('plus', 13)} داکتر جدید</button>` : ''}</div></div></div>`;
}
function bindDoctorPicker(root, id, { onPick, date, selected } = {}) {
  const box = $('#' + id, root); if (!box) return null;
  let load = [], cur = selected ? Number(selected) : null;
  const pop = $('.drPickPop', box), list = $('.drPickList', box), q = $('.drPickQ', box);
  const label = (d) => d ? `<b>${esc(doctorName(d))}</b> <small class="muted">${esc([d.department_name, d.work_type].filter(Boolean).join(' · '))}</small>` : '<span class="muted">بدون داکتر</span>';
  const set = (did, fire = true) => {
    cur = did ? Number(did) : null; const d = App.doctors.find(x => x.id === cur);
    $('.drPickVal', box).innerHTML = d ? label(d) : (did === '' || did === null ? '<span class="muted">بدون داکتر</span>' : '');
    $('.drPickVal', box).classList.toggle('muted', !d);
    pop.classList.add('hidden'); if (fire && onPick) onPick(d || null);
  };
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    const docs = App.doctors.filter(d => d.active && (!s || [d.name, d.title, d.specialty, d.department_name, d.work_type].some(x => String(x || '').toLowerCase().includes(s))));
    const groups = new Map(); docs.forEach(d => { const k = d.department_name || 'سایر'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); });
    list.innerHTML = [...groups.entries()].map(([g, ds]) => `<div class="drPickGroup">${esc(g)}</div>${ds.map(d => { const l = load.find(x => x.id === d.id) || {}; return `<div class="drPickItem ${d.id === cur ? 'on' : ''} ${l.works_today === false ? 'off' : ''}" data-id="${d.id}">
      <div class="grow"><b>${esc(doctorName(d))}</b><small>${esc([d.work_type, d.specialty].filter(Boolean).join(' · '))}${d.room ? ' · اطاق ' + esc(d.room) : ''}</small></div>
      <div class="drPickMeta">${l.works_today === false ? '<span class="pill bad">امروز نیست</span>' : ''}${l.max_patients ? `<span class="pill ${l.booked >= l.max_patients ? 'bad' : ''}">${l.booked}/${l.max_patients}</span>` : l.booked ? `<span class="pill">${l.booked} نوبت</span>` : ''}${l.waiting ? `<span class="pill warn">${l.waiting} منتظر</span>` : ''}<small class="muted">${money(d.visit_fee)}</small></div></div>`; }).join('')}`).join('') || '<div class="empty" style="padding:12px">داکتری پیدا نشد</div>';
  };
  const refreshLoad = async (dt) => { try { load = await API.get('/api/doctor-load', { date: dt || date || today() }); draw(); } catch (_) { } };
  $('.drPickBtn', box).onclick = () => { const open = pop.classList.contains('hidden'); $$('.drPickPop').forEach(p => p.classList.add('hidden')); if (open) { pop.classList.remove('hidden'); q.value = ''; draw(); refreshLoad(); setTimeout(() => q.focus(), 20); } };
  q.addEventListener('input', draw);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = $('.drPickItem', list); if (f) { e.preventDefault(); set(f.dataset.id); } } if (e.key === 'Escape') pop.classList.add('hidden'); });
  list.addEventListener('click', (e) => { const it = e.target.closest('.drPickItem'); if (it) set(it.dataset.id); });
  const none = $('[data-none]', box); if (none) none.onclick = () => set('');
  const nd = $('[data-newdr]', box); if (nd) nd.onclick = () => { pop.classList.add('hidden'); doctorDialog(null, async (newId) => { await loadBootstrap(); set(newId); }); };
  document.addEventListener('mousedown', (e) => { if (!box.contains(e.target)) pop.classList.add('hidden'); });
  if (selected !== undefined) set(selected, false);
  return { set, get: () => cur, refreshLoad };
}
// add / edit a doctor (name, title, department, type of work, fee, room, letterhead lines, weekly schedule)
function doctorDialog(d, after) {
  d = d || { active: 1, on_letterhead: 0, letterhead_side: 'right', color: '#0f7a3a', visit_fee: 0, sort: (App.doctors.length || 0) + 1, work_type: 'متخصص' };
  const deps = App.departments || [];
  const WD = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  const order = [6, 0, 1, 2, 3, 4, 5];
  const m = modal({ title: d.id ? 'ویرایش داکتر' : 'داکتر جدید', size: 'wide', body: `<div class="formGrid" id="drF">
    <label class="field"><span>عنوان (دوکتور، پوهنمل دوکتور…)</span><input name="title" value="${esc(d.title || '')}" list="drTitles"></label><label class="field"><span>نام <em>*</em></span><input name="name" value="${esc(d.name || '')}"></label>
    <label class="field"><span>بخش</span><div class="inputGroup"><select name="department_id" id="dr_dep">${opt(deps.map(x => [x.id, x.name]), d.department_id, { empty: '—' })}</select><button type="button" class="btn" id="dr_newdep" title="بخش جدید">${icon('plus', 14)}</button></div></label>
    <label class="field"><span>نوع کار</span><input name="work_type" list="drWork" value="${esc(d.work_type || '')}"></label>
    <label class="field span2"><span>تخصص (کوتاه)</span><input name="specialty" value="${esc(d.specialty || '')}"></label>
    <label class="field"><span>فیس ویزیت OPD</span><input name="visit_fee" type="number" value="${esc(d.visit_fee)}"></label><label class="field"><span>اطاق / شماره اتاق</span><input name="room" value="${esc(d.room || '')}"></label>
    <label class="field"><span>تلفن</span><input name="phone" class="ltr" value="${esc(d.phone || '')}"></label>
    <label class="field full"><span>سطرهای زیر نام روی سرخط نسخه (هر سطر جدا)</span><textarea name="header_lines" rows="3">${esc(d.header_lines || '')}</textarea></label>
    <label class="field"><span>سمت روی سرخط</span><select name="letterhead_side">${opt([['right', 'راست'], ['left', 'چپ']], d.letterhead_side)}</select></label><label class="field"><span>رنگ نام</span><input name="color" type="color" value="${esc(d.color || '#0f7a3a')}"></label>
    <label class="field"><span>ترتیب</span><input name="sort" type="number" value="${esc(d.sort || 0)}"></label>
    <label class="check"><input type="checkbox" name="on_letterhead" ${d.on_letterhead ? 'checked' : ''}> روی سرخط نسخه</label><label class="check"><input type="checkbox" name="active" ${d.active ? 'checked' : ''}> فعال</label></div>
    <div class="secTitle">${icon('calendar', 15)} اوقات کاری هفته <small class="muted">— خالی = همه روزها</small></div>
    <table class="t" id="drSch"><thead><tr><th>روز</th><th>کار می‌کند</th><th>از ساعت</th><th>تا ساعت</th><th>حداکثر مریض</th></tr></thead><tbody>${order.map(w => `<tr data-w="${w}"><td>${WD[w]}</td><td><input type="checkbox" data-on></td><td><input type="time" data-s></td><td><input type="time" data-e></td><td><input type="number" data-max style="width:90px"></td></tr>`).join('')}</tbody></table>
    ${datalist('drWork', listSetting('doctor_work_types'))}${datalist('drTitles', ['دوکتور', 'دوکتورس', 'پوهنمل دوکتور', 'پوهنیار دوکتورس', 'پوهندوی دوکتور', 'پوهاند دوکتور', 'قابله'])}`,
    foot: `<button class="btn primary" id="dr_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
  (async () => { if (!d.id) return; const rows = await API.list('doctor_schedules', { 'eq.doctor_id': d.id }); rows.forEach(r => { const tr = $(`#drSch tr[data-w="${r.weekday}"]`, m.el); if (!tr) return; $('[data-on]', tr).checked = true; $('[data-s]', tr).value = r.start_time || ''; $('[data-e]', tr).value = r.end_time || ''; $('[data-max]', tr).value = r.max_patients || ''; }); })().catch(() => { });
  $('#dr_newdep', m.el).onclick = async () => { const name = await promptDlg('بخش جدید', { label: 'نام بخش (مثلاً: جلدی، دندان، چشم)' }); if (!name) return; const id = await API.save('medical_departments', { name, sort: deps.length + 1 }); await loadBootstrap(); $('#dr_dep', m.el).innerHTML = opt((App.departments || []).map(x => [x.id, x.name]), id, { empty: '—' }); };
  $('[data-x]', m.el).onclick = m.close;
  $('#dr_ok', m.el).onclick = () => busy($('#dr_ok', m.el), async () => {
    const v = formValues($('#drF', m.el)); if (d.id) v.id = d.id; if (!v.name) throw new Error('نام الزامی است');
    const id = await API.save('doctors', v);
    const rows = $$('#drSch tr[data-w]', m.el).filter(tr => $('[data-on]', tr).checked).map(tr => ({ weekday: Number(tr.dataset.w), start_time: $('[data-s]', tr).value, end_time: $('[data-e]', tr).value, max_patients: $('[data-max]', tr).value }));
    await API.post('/api/doctors/schedule/' + id, { rows });
    toast('ذخیره شد', 'good'); m.close(); after && after(id);
  }).catch(errToast);
}
