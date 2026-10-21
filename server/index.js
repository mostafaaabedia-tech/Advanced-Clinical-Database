// Clinic server: runs on the Admin PC. Serves the database API, the user interface and live events
// to every station on the local network (WiFi / LAN), and announces itself so stations find it automatically.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const dgram = require('dgram');
const { ClinicDatabase } = require('./db');
const { makeOps } = require('./ops');
const { makeResources, allowed } = require('./resources');

const APP_ID = 'ACDB';
const DISCOVERY_PORT = 41234;
const ROLES = ['admin', 'stock', 'reception', 'doctor', 'pharmacy', 'lab'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.wav': 'audio/wav' };
const PUBLIC_SETTINGS_DENY = new Set(['server_id']);

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' || a.family === 4) if (!a.internal) out.push({ name, address: a.address, netmask: a.netmask });
  return out;
}
function broadcastAddr(a) {
  const ip = a.address.split('.').map(Number), m = a.netmask.split('.').map(Number);
  return ip.map((x, i) => (x & m[i]) | (~m[i] & 255)).join('.');
}

async function createServer(opts = {}) {
  const dataDir = opts.dataDir || path.join(process.cwd(), 'data');
  const port = Number(opts.port || process.env.ACDB_PORT || 8750);
  const staticDir = opts.staticDir || path.join(__dirname, '..', 'renderer');
  const backupDir = path.join(dataDir, 'backups');
  const version = opts.version || require('../package.json').version;
  const log = opts.log || ((...a) => console.log('[server]', ...a));
  const startedAt = new Date();
  let lastSave = null;

  const db = await new ClinicDatabase(path.join(dataDir, 'clinic.sqlite'), { wasmPath: opts.wasmPath, onSaved: () => { lastSave = new Date(); } }).open();

  // ---------------- live events (Server-Sent Events) ----------------
  const clients = new Map();   // id → { res, user, station, ip, since, last }
  const bus = {
    emit(evt) {
      const payload = `event: msg\ndata: ${JSON.stringify({ type: evt.type, data: evt.data, doctor_id: evt.doctor_id || null, at: Date.now() })}\n\n`;
      for (const c of clients.values()) {
        const role = c.user.role;
        if (role !== 'admin' && evt.roles && !evt.roles.includes(role)) continue;
        if (role === 'doctor' && evt.doctor_id && c.user.doctor_id && evt.doctor_id !== c.user.doctor_id && evt.type.startsWith('visit')) continue;
        try { c.res.write(payload); } catch (_) { }
      }
    }
  };
  const ops = makeOps(db, bus);
  const res$ = makeResources(db, ops);
  const presence = () => [...clients.values()].map(c => ({ id: c.id, station: c.station, user: c.user.full_name || c.user.username, username: c.user.username, role: c.user.role, ip: c.ip, since: c.since, last: c.last }));
  const presenceChanged = () => bus.emit({ type: 'presence', data: presence(), roles: ['admin'] });
  setInterval(() => { for (const c of clients.values()) { try { c.res.write(`: ping ${Date.now()}\n\n`); } catch (_) { } } }, 20000).unref();

  // ---------------- sessions ----------------
  const sessionCache = new Map();
  function authUser(req, url) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : (url.searchParams.get('token') || '');
    if (!token) return null;
    let s = sessionCache.get(token);
    if (!s) {
      const row = db.get('SELECT s.*, u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?', [token]);
      if (!row || !row.active) return null;
      s = { token, user_id: row.user_id, station: row.station };
      sessionCache.set(token, s);
    }
    const u = db.get('SELECT * FROM users WHERE id=? AND active=1', [s.user_id]);
    if (!u) { sessionCache.delete(token); return null; }
    const pu = db.publicUser(u); pu.station = s.station; pu.token = token;
    return pu;
  }

  // ---------------- backups ----------------
  function autoBackup(force) {
    try {
      if (!force && db.getSetting('auto_backup', '1') !== '1') return null;
      fs.mkdirSync(backupDir, { recursive: true });
      const day = ops.today();
      const target = path.join(backupDir, force ? `clinic-${day}-${Date.now()}.sqlite` : `clinic-${day}.sqlite`);
      if (force || !fs.existsSync(target)) {
        fs.writeFileSync(target, db.exportBytes());
        const extra = db.getSetting('backup_extra_dir', '');   // second copy on a USB / network drive
        if (extra) { try { fs.mkdirSync(extra, { recursive: true }); fs.copyFileSync(target, path.join(extra, path.basename(target))); } catch (e) { log('extra backup failed', e.message); } }
      }
      const keep = Math.max(3, Number(db.getSetting('backup_keep', '30')) || 30);
      const files = fs.readdirSync(backupDir).filter(f => /^clinic-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();
      files.slice(0, Math.max(0, files.length - keep)).forEach(f => fs.unlinkSync(path.join(backupDir, f)));
      return target;
    } catch (e) { log('backup failed', e.message); return null; }
  }
  autoBackup();
  setInterval(() => autoBackup(), 60 * 60 * 1000).unref();

  // ---------------- helpers ----------------
  const UserError = ops.UserError;
  const need = (user, ...roles) => { if (!user) throw Object.assign(new UserError('لطفاً دوباره وارد شوید'), { status: 401 }); if (user.role !== 'admin' && !roles.includes(user.role)) throw Object.assign(new UserError('شما به این بخش دسترسی ندارید'), { status: 403 }); };
  const audit = (user, action, entity, id, detail, req) => db.audit(user, action, entity, id, detail, { station: user?.station, ip: clientIp(req) });
  const clientIp = (req) => String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const publicSettings = () => { const s = db.allSettings(); for (const k of PUBLIC_SETTINGS_DENY) delete s[k]; return s; };
  function readBody(req, limit = 40 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      req.on('data', c => { size += c.length; if (size > limit) { reject(new UserError('فایل خیلی بزرگ است')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { const raw = Buffer.concat(chunks).toString('utf8'); if (!raw) return resolve({}); try { resolve(JSON.parse(raw)); } catch (e) { reject(new UserError('Invalid JSON')); } });
      req.on('error', reject);
    });
  }
  const send = (res, status, obj, headers = {}) => {
    const body = Buffer.from(JSON.stringify(obj));
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', ...headers });
    res.end(body);
  };
  const filterDays = (rows, role) => {
    if (role === 'admin' || role === 'stock') return rows;
    const keep = { pharmacy: ['ph_sales', 'ph_returns', 'ph_net', 'ph_count', 'legacy_ph', 'wd_pharmacy', 'wd_ph_personal', 'wd_ph_factor', 'wd_ph_other', 'purchases', 'supplier_paid', 'wd_by'],
      reception: ['visits', 'reception', 'wd_reception', 'wd_rc_personal', 'wd_rc_other', 'lab_income', 'lab_billed', 'lab_count', 'lab_total', 'legacy_lab', 'wd_lab', 'wd_lab_personal', 'wd_lab_external', 'wd_lab_other', 'lab_purchases', 'wd_by'],
      lab: ['lab_income', 'lab_billed', 'lab_count', 'lab_total', 'legacy_lab', 'wd_lab', 'wd_lab_personal', 'wd_lab_external', 'wd_lab_other', 'lab_purchases'], doctor: ['visits'] }[role] || [];
    return rows.map(r => { const o = { date: r.date }; keep.forEach(k => o[k] = r[k]); return o; });
  };

  // ---------------- API routes ----------------
  const routes = [];
  const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

  route('GET', '/api/ping', () => ({ app: APP_ID, name: db.getSetting('clinic_name'), version, time: new Date().toISOString(), id: db.getSetting('server_id'), first_run: !!db.get("SELECT 1 x FROM users WHERE username='admin' AND must_change=1") }));
  route('POST', '/api/login', async ({ body, req }) => {
    const u = db.login(body.username, body.password);
    if (!u) throw new UserError('نام کاربری یا رمز عبور نادرست است');
    const station = ROLES.includes(body.station) ? body.station : null;
    if (station && db.getSetting('station_lock', '1') === '1' && u.role !== 'admin' && u.role !== station) {
      const names = { admin: 'مدیر', stock: 'انبار و حسابات', reception: 'پذیرش', doctor: 'داکتر', pharmacy: 'دواخانه', lab: 'لابراتوار' };
      throw new UserError(`این کاربر مربوط به بخش «${names[u.role]}» است و در این کمپیوتر (${names[station]}) اجازه ورود ندارد.`);
    }
    const token = crypto.randomBytes(24).toString('hex');
    db.insert('sessions', { token, user_id: u.id, station: station || 'browser', ip: clientIp(req), last_seen: ops.nowStr() });
    db.audit(u, 'login', 'user', u.id, '', { station: station || 'browser', ip: clientIp(req) });
    return { token, user: { ...u, station: station || 'browser' } };
  });
  route('POST', '/api/logout', ({ user }) => { if (user) { db.run('DELETE FROM sessions WHERE token=?', [user.token]); sessionCache.delete(user.token); } return true; });
  route('GET', '/api/me', ({ user }) => { need(user, ...ROLES); return user; });
  route('POST', '/api/change-password', ({ user, body }) => {
    need(user, ...ROLES);
    if (!db.checkPassword(user.id, body.old)) throw new UserError('رمز فعلی نادرست است');
    if (String(body.new || '').length < 4) throw new UserError('رمز جدید باید حداقل ۴ حرف باشد');
    db.setPassword(user.id, body.new); return true;
  });
  route('GET', '/api/bootstrap', ({ user }) => {
    need(user, ...ROLES);
    return { user, settings: publicSettings(), doctors: db.all('SELECT * FROM v_doctors ORDER BY sort, id'), services: db.all('SELECT * FROM services ORDER BY sort, id'),
      departments: db.all('SELECT * FROM medical_departments ORDER BY sort, id'),
      server: { version, name: db.getSetting('clinic_name'), addresses: lanAddresses().map(a => a.address), port } };
  });

  // generic resources
  route('GET', '/api/list/:res', ({ user, params, query }) => { need(user, ...ROLES); return res$.list(params.res, query, user); });
  route('GET', '/api/get/:res/:id', ({ user, params }) => { need(user, ...ROLES); return res$.get(params.res, params.id, user); });
  route('POST', '/api/save/:res', ({ user, params, body, req }) => { need(user, ...ROLES); const id = res$.save(params.res, body, user); if (['doctors', 'services', 'medical_departments'].includes(params.res)) bus.emit({ type: 'setup:update', data: { res: params.res } }); return id; });
  route('POST', '/api/delete/:res/:id', ({ user, params }) => { need(user, ...ROLES); return res$.remove(params.res, params.id, user); });

  // users (admin)
  route('GET', '/api/users', ({ user }) => { need(user); return db.all('SELECT u.id, u.username, u.full_name, u.role, u.doctor_id, u.phone, u.active, u.must_change, u.last_login, u.created_at, d.name doctor_name FROM users u LEFT JOIN doctors d ON d.id=u.doctor_id ORDER BY u.id'); });
  route('POST', '/api/users/save', ({ user, body, req }) => {
    need(user);
    if (!ROLES.includes(body.role)) throw new UserError('نقش نامعتبر');
    if (body.role === 'doctor' && !body.doctor_id) throw new UserError('برای کاربر داکتر، پروفایل داکتر را انتخاب کنید');
    if (body.id) {
      if (Number(body.id) === user.id && (body.role !== 'admin' || !body.active)) throw new UserError('نمی‌توانید نقش یا فعال بودن حساب خودتان را تغییر دهید');
      db.update('users', body.id, { full_name: body.full_name || null, role: body.role, doctor_id: body.doctor_id || null, phone: body.phone || null, active: body.active ? 1 : 0 });
      if (body.password) { if (String(body.password).length < 4) throw new UserError('رمز باید حداقل ۴ حرف باشد'); db.setPassword(body.id, body.password); db.run('UPDATE users SET must_change=1 WHERE id=?', [body.id]); }
      if (!body.active) { db.run('DELETE FROM sessions WHERE user_id=?', [body.id]); sessionCache.clear(); }
      audit(user, 'update', 'user', body.id, body.username, req); return body.id;
    }
    if (!body.username || !body.password) throw new UserError('نام کاربری و رمز الزامی است');
    if (String(body.password).length < 4) throw new UserError('رمز باید حداقل ۴ حرف باشد');
    if (db.get('SELECT id FROM users WHERE username=?', [String(body.username).trim()])) throw new UserError('این نام کاربری قبلاً ثبت شده');
    const id = db.createUser(body); audit(user, 'create', 'user', id, body.username + ' / ' + body.role, req); return id;
  });
  route('POST', '/api/users/delete/:id', ({ user, params, req }) => {
    need(user); if (Number(params.id) === user.id) throw new UserError('نمی‌توانید حساب خودتان را حذف کنید');
    db.run('DELETE FROM users WHERE id=?', [params.id]); sessionCache.clear(); audit(user, 'delete', 'user', params.id, '', req); return true;
  });
  route('POST', '/api/settings', ({ user, body, req }) => {
    need(user);
    db.transaction(() => { for (const [k, v] of Object.entries(body || {})) if (!PUBLIC_SETTINGS_DENY.has(k)) db.setSetting(k, v); });
    audit(user, 'update', 'settings', null, Object.keys(body || {}).join(','), req);
    bus.emit({ type: 'settings:update', data: {} }); return true;
  });

  // reception
  route('POST', '/api/visits/create', ({ user, body, req }) => { need(user, 'reception'); const v = ops.createVisit(body, user); audit(user, 'create', 'visit', v.id, v.visit_no, req); return v; });
  route('POST', '/api/visits/update/:id', ({ user, body, params, req }) => { need(user, 'reception'); const v = ops.updateVisit(Number(params.id), body, user); audit(user, 'update', 'visit', v.id, JSON.stringify(body), req); return v; });
  route('POST', '/api/visits/status/:id', ({ user, body, params, req }) => {
    need(user, 'reception', 'doctor');
    if (user.role === 'doctor' && !['in_visit', 'done', 'waiting', 'no_show'].includes(body.status)) throw new UserError('دسترسی ندارید');
    const v = ops.setVisitStatus(Number(params.id), body.status, user, body.reason); audit(user, 'status', 'visit', v.id, body.status, req); return v;
  });
  route('POST', '/api/visits/pay/:id', ({ user, body, params, req }) => { need(user, 'reception'); const v = ops.payVisit(Number(params.id), body.amount, body.method, body.note, user); audit(user, 'pay', 'visit', v.id, String(body.amount), req); return v; });
  route('GET', '/api/visits/:id/payments', ({ user, params }) => { need(user, 'reception', 'stock'); return db.all('SELECT vp.*, u.full_name user_name FROM visit_payments vp LEFT JOIN users u ON u.id=vp.created_by WHERE visit_id=? ORDER BY id', [params.id]); });

  // doctor
  route('GET', '/api/patient-file/:id', ({ user, params }) => { need(user, 'doctor'); return ops.patientFile(Number(params.id)); });
  route('GET', '/api/patient-basic/:id', ({ user, params }) => {
    need(user, ...ROLES);
    const p = db.get('SELECT id, code, full_name, father_name, sex, birth_date, phone, address, blood_group FROM patients WHERE id=?', [params.id]);
    if (!p) throw new UserError('مریض پیدا نشد');
    p.visits = db.all('SELECT id, visit_no, visit_date, turn_no, service_name, doctor_name, status, net, paid FROM v_visits WHERE patient_id=? ORDER BY id DESC LIMIT 30', [params.id]);
    return p;
  });
  route('GET', '/api/encounter/:id', ({ user, params }) => {
    need(user, 'doctor');
    const e = db.get('SELECT e.*, d.name doctor_name, d.title doctor_title FROM encounters e LEFT JOIN doctors d ON d.id=e.doctor_id WHERE e.id=?', [params.id]); if (!e) throw new UserError('ویزیت پیدا نشد');
    e.rx = db.get('SELECT * FROM v_prescriptions WHERE encounter_id=? ORDER BY id DESC LIMIT 1', [e.id]);
    if (e.rx) e.rx.items = db.all('SELECT * FROM prescription_items WHERE prescription_id=? ORDER BY sort, id', [e.rx.id]);
    const lab = db.get("SELECT * FROM v_lab_requests WHERE encounter_id=? AND status<>'cancelled' ORDER BY id DESC LIMIT 1", [e.id]);
    e.lab = lab ? ops.labRequestsFull([lab])[0] : null;
    e.visit = e.visit_id ? db.get('SELECT * FROM v_visits WHERE id=?', [e.visit_id]) : null;
    return e;
  });
  route('GET', '/api/encounter-by-visit/:id', ({ user, params }) => { need(user, 'doctor'); return db.scalar('SELECT id FROM encounters WHERE visit_id=? ORDER BY id DESC LIMIT 1', [params.id]); });
  route('POST', '/api/encounter/save', ({ user, body, req }) => { need(user, 'doctor'); const r = ops.saveEncounter(body, user); audit(user, 'save', 'encounter', r.encounter_id, [r.rx?.rx_code, r.lab?.lab_code].filter(Boolean).join(' '), req); return r; });
  route('GET', '/api/medicine-search', ({ user, query }) => {
    need(user, ...ROLES);
    const q = String(query.q || '').trim(); if (!q) return [];
    if (/^\d+$/.test(q)) return db.all('SELECT * FROM v_medicine_stock WHERE active=1 AND (code=? OR barcode=? OR CAST(code AS TEXT) LIKE ?) ORDER BY code LIMIT 30', [Number(q), q, q + '%']);
    return db.all("SELECT * FROM v_medicine_stock WHERE active=1 AND (name LIKE ? OR generic LIKE ? OR barcode=?) ORDER BY (name LIKE ?) DESC, stock>0 DESC, name LIMIT 30", ['%' + q + '%', '%' + q + '%', q, q + '%']);
  });

  // pharmacy
  route('GET', '/api/rx/:code', ({ user, params }) => { need(user, 'pharmacy', 'stock', 'doctor'); return ops.getRx(decodeURIComponent(params.code)); });
  route('POST', '/api/sales/create', ({ user, body, req }) => { need(user, 'pharmacy'); const s = ops.createSale(body, user); audit(user, 'create', 'sale', s.id, `${s.sale_code} ${s.net}`, req); return s; });
  route('GET', '/api/sales/:id', ({ user, params }) => { need(user, 'pharmacy', 'stock', 'reception'); return ops.saleFull(Number(params.id)); });
  route('POST', '/api/sales/return/:id', ({ user, body, params, req }) => { need(user, 'pharmacy', 'stock'); const s = ops.returnSale(Number(params.id), body.items, body.note, user); audit(user, 'return', 'sale', s.id, JSON.stringify(body.items), req); return s; });

  // stock
  route('POST', '/api/stock/adjust', ({ user, body, req }) => { need(user, 'stock'); const m = ops.adjustStock(body, user); audit(user, 'adjust', 'medicine', m.id, `${body.kind} ${body.qty}`, req); return m; });
  route('GET', '/api/medicine/:id', ({ user, params }) => {
    need(user, ...ROLES);
    const m = ops.medicineStock(Number(params.id)); if (!m) throw new UserError('دوا پیدا نشد');
    if (['admin', 'stock', 'pharmacy'].includes(user.role)) {
      m.batches = db.all("SELECT b.*, p.ref_no, p.factor_no, s.name supplier FROM batches b LEFT JOIN purchase_items i ON i.id=b.purchase_item_id LEFT JOIN purchases p ON p.id=i.purchase_id LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE b.medicine_id=? ORDER BY b.qty_left>0 DESC, (b.expiry IS NULL OR b.expiry=''), b.expiry, b.id", [m.id]);
      m.moves = db.all('SELECT sm.*, u.full_name user_name FROM stock_moves sm LEFT JOIN users u ON u.id=sm.user_id WHERE medicine_id=? ORDER BY sm.id DESC LIMIT 300', [m.id]);
    }
    return m;
  });
  route('POST', '/api/purchases/save', ({ user, body, req }) => { need(user, 'stock'); const p = ops.savePurchase(body, user); audit(user, body.id ? 'update' : 'create', 'purchase', p.id, `${p.ref_no} ${p.factor_no || ''} ${p.net}`, req); return p; });
  route('GET', '/api/purchases/:id', ({ user, params }) => { need(user, 'stock'); return ops.purchaseFull(Number(params.id)); });
  route('POST', '/api/purchases/pay/:id', ({ user, body, params, req }) => { need(user, 'stock'); const p = ops.addPurchasePayment(Number(params.id), body, user); audit(user, 'pay', 'purchase', p.id, String(body.amount), req); return p; });
  route('POST', '/api/purchases/payment-delete/:id', ({ user, params, req }) => { need(user, 'stock'); const p = ops.deletePurchasePayment(Number(params.id)); audit(user, 'delete_payment', 'purchase', p.id, params.id, req); return p; });
  route('POST', '/api/purchases/delete/:id', ({ user, params, req }) => { need(user, 'stock'); ops.deletePurchase(Number(params.id), user); audit(user, 'delete', 'purchase', params.id, '', req); return true; });

  // reports
  route('GET', '/api/reports/days', ({ user, query }) => { need(user, 'stock', 'pharmacy', 'reception', 'lab', 'doctor'); return filterDays(ops.reportDays(query.from, query.to), user.role); });
  route('GET', '/api/reports/doctor-daily', ({ user, query }) => { need(user, 'stock', 'reception', 'doctor'); return ops.doctorDaily(query.from, query.to, user.role === 'doctor' ? (user.doctor_id || -1) : query.doctor_id); });
  route('GET', '/api/open-purchases', ({ user }) => { need(user, 'stock', 'pharmacy'); return db.all("SELECT id, ref_no, factor_no, supplier_name, date, net, paid, (net - paid) balance FROM v_purchases WHERE net - paid > 0.001 ORDER BY date DESC LIMIT 300"); });
  route('GET', '/api/reports/dashboard', ({ user }) => { need(user, 'stock'); return ops.dashboard(); });
  route('GET', '/api/reports/medicine-sales', ({ user, query }) => { need(user, 'stock', 'pharmacy'); return ops.medicineSales(query.from, query.to); });
  route('GET', '/api/reports/suppliers', ({ user }) => { need(user, 'stock'); return ops.supplierLedger(); });
  route('GET', '/api/reports/doctors', ({ user, query }) => { need(user, 'stock', 'doctor'); return ops.doctorStats(query.from, query.to); });
  route('GET', '/api/reports/stock', ({ user }) => { need(user, 'stock', 'pharmacy'); return ops.stockSummary(); });
  route('GET', '/api/reports/lab-tests', ({ user, query }) => {
    need(user, 'lab', 'stock');
    return db.all(`SELECT t.id, t.code, t.name, COUNT(*) n, SUM(i.price) revenue, SUM(i.cost) cost FROM lab_request_items i JOIN lab_requests r ON r.id=i.request_id JOIN lab_tests t ON t.id=i.test_id
      WHERE r.status NOT IN ('requested','cancelled') AND DATE(r.received_at) BETWEEN ? AND ? GROUP BY t.id ORDER BY n DESC`, [query.from, query.to]);
  });

  // laboratory
  route('GET', '/api/lab/catalog', ({ user }) => {
    need(user, ...ROLES);
    return { departments: db.all('SELECT * FROM lab_departments ORDER BY sort, id'), tests: db.all('SELECT * FROM lab_tests ORDER BY sort, id'), test_items: db.all('SELECT ti.*, li.name item_name, li.unit FROM lab_test_items ti JOIN lab_items li ON li.id=ti.item_id'),
      panel_items: db.all('SELECT * FROM lab_panel_items ORDER BY panel_id, sort'), ranges: db.all('SELECT * FROM lab_ranges'), kits: db.all('SELECT * FROM lab_kits ORDER BY test_id, id'),
      reception_types: db.all('SELECT * FROM lab_reception_types ORDER BY sort, id'), referrers: db.all('SELECT * FROM lab_referrers WHERE active=1 ORDER BY name') };
  });
  route('GET', '/api/lab/req/:code', ({ user, params, query }) => { need(user, 'lab', 'doctor', 'stock', 'reception'); return ops.labFull(query.id ? Number(query.id) : decodeURIComponent(params.code)); });
  route('POST', '/api/lab/walkin', ({ user, body, req }) => { need(user, 'lab', 'reception'); const id = ops.createLabWalkin(body, user); audit(user, 'create', 'lab_request', id, 'walk-in', req); return ops.labFull(id); });
  route('POST', '/api/lab/receive/:id', ({ user, body, params, req }) => { need(user, 'lab', 'reception'); const r = ops.receiveLab(Number(params.id), body, user); audit(user, 'receive', 'lab_request', r.id, `${r.lab_code} ${r.net}`, req); return r; });
  route('POST', '/api/lab/pay/:id', ({ user, body, params, req }) => { need(user, 'lab', 'reception'); const r = ops.payLab(Number(params.id), body.amount, body.method, user); audit(user, 'pay', 'lab_request', r.id, String(body.amount), req); return r; });
  route('POST', '/api/lab/results/:id', ({ user, body, params, req }) => { need(user, 'lab'); const r = ops.saveLabResults(Number(params.id), body, user); audit(user, 'results', 'lab_request', r.id, body.status || '', req); return r; });
  route('POST', '/api/lab/cancel/:id', ({ user, body, params, req }) => {
    need(user, 'lab', 'reception');
    const r = db.get('SELECT * FROM lab_requests WHERE id=?', [params.id]); if (!r) throw new UserError('درخواست پیدا نشد');
    if (r.paid > 0) throw new UserError('ابتدا پول پرداخت شده را مسترد کنید (پرداخت منفی)');
    if (user.role === 'reception' && !['requested', 'received'].includes(r.status)) throw new UserError('نتایج این آزمایش ثبت شده؛ فقط لابراتوار می‌تواند لغو کند');
    db.update('lab_requests', r.id, { status: 'cancelled', report_note: body.reason || r.report_note }); ops.applyLabConsumption(r.id, user); audit(user, 'cancel', 'lab_request', r.id, body.reason, req);
    bus.emit({ type: 'lab:update', data: { id: r.id, status: 'cancelled' }, roles: ['lab', 'admin'] }); return true;
  });
  route('POST', '/api/lab/test/save', ({ user, body, req }) => { need(user, 'lab'); const id = ops.saveLabTest(body, user); audit(user, body.id ? 'update' : 'create', 'lab_test', id, body.code || '', req); return id; });


  // central cashier at reception: doctor fees, laboratory, pharmacy, beds, deposits
  route('POST', '/api/sales/pay/:id', ({ user, body, params, req }) => {
    need(user, 'reception', 'pharmacy', 'stock');
    if (user.role === 'pharmacy' && db.getSetting('cashier_mode', 'central') === 'central') throw new UserError('پرداخت فقط در صندوق پذیرش گرفته می‌شود (تنظیمات: صندوق مرکزی)');
    const s2 = ops.paySale(Number(params.id), body.amount, body.method, body.note, user); audit(user, 'pay', 'sale', s2.id, String(body.amount), req); return s2;
  });
  route('GET', '/api/cashier/pending', ({ user }) => { need(user, 'reception', 'stock'); return ops.cashierPending(); });
  route('GET', '/api/cashier/patient/:id', ({ user, params }) => { need(user, 'reception', 'stock'); return ops.patientAccount(Number(params.id)); });
  route('POST', '/api/cashier/pay', ({ user, body, req }) => { need(user, 'reception'); const r = ops.cashierPay(body, user); audit(user, 'cashier_pay', body.kind, body.id, `${body.amount} ${body.method || ''}`, req); return r; });
  route('POST', '/api/cashier/deposit', ({ user, body, req }) => { need(user, 'reception'); const b = db.transaction(() => ops.addDeposit(Number(body.patient_id), body.amount, body.method, body.note, user)); audit(user, 'deposit', 'patient', body.patient_id, String(body.amount), req); return b; });
  route('GET', '/api/cashier/day', ({ user, query }) => { need(user, 'reception', 'stock'); return ops.cashierDay(query.from || ops.today(), query.to); });
  route('POST', '/api/cashier/close', ({ user, body, req }) => { need(user, 'reception'); const c = ops.cashClose(body, user); audit(user, 'cash_close', 'cash', c.id, `${c.expected} / ${c.counted}`, req); return c; });

  // laboratory: kits, ranges re-applied, repeat check, statistics, referring doctors' income, history
  route('POST', '/api/lab/kit/save', ({ user, body, req }) => { need(user, 'lab'); const k = ops.saveLabKit(body, user); audit(user, body.remove ? 'delete' : 'save', 'lab_kit', body.remove || k?.id, `${body.name || ''} ${body.lot_no || ''}`, req); return k; });
  route('POST', '/api/lab/apply-ranges', ({ user, body, req }) => { need(user, 'lab'); const r = ops.applyRanges(body, user); audit(user, 'apply_ranges', 'lab_test', body.test_id, `${body.from}..${body.to} ${r.changed}`, req); return r; });
  route('GET', '/api/lab/repeat-check', ({ user, query }) => { need(user, 'lab', 'reception', 'doctor'); return ops.labRepeatCheck(Number(query.patient_id), String(query.test_ids || '').split(',').map(Number).filter(Boolean), Number(query.exclude || 0), query.days); });
  route('GET', '/api/lab/stats', ({ user, query }) => { need(user, 'lab', 'stock', 'reception'); return ops.labStats(query); });
  route('GET', '/api/lab/doctor-income', ({ user, query }) => { need(user, 'lab', 'stock', 'reception'); return ops.labDoctorIncome(query); });
  route('GET', '/api/lab/history', ({ user, query }) => { need(user, 'lab', 'doctor'); return ops.labTestHistory(Number(query.patient_id), Number(query.test_id)); });
  route('POST', '/api/lab/printed/:id', ({ user, params }) => { need(user, 'lab', 'reception', 'doctor'); db.run('UPDATE lab_requests SET print_count = IFNULL(print_count,0) + 1 WHERE id=?', [Number(params.id)]); return true; });
  route('GET', '/api/patients/dup-tazkira', ({ user, query }) => { need(user, ...ROLES); const t = String(query.tazkira || '').trim(); if (!t) return []; return db.all('SELECT id, code, full_name, father_name FROM patients WHERE tazkira=? AND id<>?', [t, Number(query.id || 0)]); });

  // laboratory: sample taken, materials store
  route('POST', '/api/lab/sample/:id', ({ user, params, req }) => { need(user, 'lab'); db.update('lab_requests', Number(params.id), { sampled_at: ops.nowStr(), sampled_by: user.id }); audit(user, 'sample', 'lab_request', params.id, '', req); return ops.labFull(Number(params.id)); });
  route('POST', '/api/lab/items/move', ({ user, body, req }) => { need(user, 'lab', 'stock'); const it = ops.labItemMove(body, user); audit(user, 'lab_item_' + (body.kind || 'adjust'), 'lab_item', it.id, String(body.qty), req); return it; });
  route('GET', '/api/lab/items/:id', ({ user, params }) => {
    need(user, 'lab', 'stock');
    const it = db.get('SELECT * FROM lab_items WHERE id=?', [params.id]); if (!it) throw new UserError('مواد پیدا نشد');
    it.moves = db.all('SELECT m.*, u.full_name user_name FROM lab_item_moves m LEFT JOIN users u ON u.id=m.user_id WHERE item_id=? ORDER BY m.id DESC LIMIT 400', [it.id]);
    it.tests = db.all('SELECT ti.qty, t.id, t.code, t.name FROM lab_test_items ti JOIN lab_tests t ON t.id=ti.test_id WHERE ti.item_id=?', [it.id]);
    return it;
  });
  route('GET', '/api/lab/items-usage', ({ user, query }) => {
    need(user, 'lab', 'stock');
    return db.all(`SELECT li.id, li.name, li.unit, li.stock, li.cost, IFNULL(SUM(CASE WHEN m.qty<0 THEN -m.qty ELSE 0 END),0) used, IFNULL(SUM(CASE WHEN m.qty>0 AND m.kind='in' THEN m.qty ELSE 0 END),0) received
      FROM lab_items li LEFT JOIN lab_item_moves m ON m.item_id=li.id AND m.date BETWEEN ? AND ? GROUP BY li.id ORDER BY used DESC`, [query.from || '0000', query.to || '9999']);
  });

  // in-patients (beds)
  route('GET', '/api/ipd/board', ({ user }) => { need(user, 'reception', 'doctor', 'stock'); return ops.ipdBoard(); });
  route('GET', '/api/ipd/:id', ({ user, params }) => { need(user, 'reception', 'doctor', 'stock'); return ops.admissionFull(Number(params.id)); });
  route('POST', '/api/ipd/admit', ({ user, body, req }) => { need(user, 'reception'); const a = ops.admit(body, user); audit(user, 'admit', 'admission', a.id, a.adm_no, req); return a; });
  route('POST', '/api/ipd/transfer/:id', ({ user, body, params, req }) => { need(user, 'reception'); const a = ops.transferBed(Number(params.id), Number(body.bed_id), user); audit(user, 'transfer', 'admission', a.id, String(body.bed_id), req); return a; });
  route('POST', '/api/ipd/charge/:id', ({ user, body, params, req }) => { need(user, 'reception', 'doctor'); const a = ops.addAdmissionCharge(Number(params.id), body, user); audit(user, 'charge', 'admission', a.id, `${body.name || ''} ${body.amount || ''}`, req); return a; });
  route('POST', '/api/ipd/discharge/:id', ({ user, body, params, req }) => { need(user, 'reception'); const a = ops.dischargeAdmission(Number(params.id), body, user); audit(user, 'discharge', 'admission', a.id, a.adm_no, req); return a; });

  // stock: purchase suggestions, alternatives
  route('GET', '/api/stock/reorder', ({ user }) => { need(user, 'stock', 'pharmacy'); return ops.reorderSuggestions(); });
  route('GET', '/api/medicine-alternatives/:id', ({ user, params }) => { need(user, ...ROLES); return ops.alternatives(Number(params.id)); });

  // doctors: load & weekly schedule; waiting-room display
  route('GET', '/api/doctor-load', ({ user, query }) => { need(user, ...ROLES); return ops.doctorLoad(query.date); });
  route('POST', '/api/doctors/schedule/:id', ({ user, body, params, req }) => { need(user, 'reception'); const r = ops.saveDoctorSchedule(Number(params.id), body.rows); audit(user, 'schedule', 'doctor', params.id, JSON.stringify(body.rows || []).slice(0, 300), req); bus.emit({ type: 'setup:update', data: { res: 'doctors' } }); return r; });
  route('GET', '/api/queue/display', ({ user }) => { need(user, ...ROLES); return { groups: ops.queueDisplay(), clinic: db.getSetting('clinic_name'), time: new Date().toISOString() }; });
  route('POST', '/api/visits/call/:id', ({ user, params, req }) => { need(user, 'doctor', 'reception'); const r = ops.callVisit(Number(params.id), user); audit(user, 'call', 'visit', params.id, String(r.turn), req); return r; });

  // admin: network, backup, import, audit
  route('GET', '/api/network', ({ user }) => {
    need(user);
    let size = 0; try { size = fs.statSync(db.file).size; } catch (_) { }
    return { clients: presence(), addresses: lanAddresses(), port, hostname: os.hostname(), started: startedAt, last_save: lastSave, db_file: db.file, db_size: size, version,
      users_by_role: db.all('SELECT role, COUNT(*) c FROM users WHERE active=1 GROUP BY role'), sessions: db.all('SELECT s.station, s.ip, s.last_seen, u.username, u.full_name, u.role FROM sessions s JOIN users u ON u.id=s.user_id ORDER BY s.last_seen DESC LIMIT 50') };
  });
  route('GET', '/api/backups', ({ user }) => { need(user); fs.mkdirSync(backupDir, { recursive: true }); return fs.readdirSync(backupDir).filter(f => f.endsWith('.sqlite')).sort().reverse().map(f => ({ name: f, size: fs.statSync(path.join(backupDir, f)).size, at: fs.statSync(path.join(backupDir, f)).mtime })); });
  route('POST', '/api/backups/now', ({ user, req }) => { need(user, 'stock'); const f = autoBackup(true); audit(user, 'backup', 'database', null, f, req); return path.basename(f || ''); });
  route('POST', '/api/backups/restore', ({ user, body, req }) => {
    need(user);
    let buf;
    if (body.name) { const f = path.join(backupDir, path.basename(String(body.name))); if (!fs.existsSync(f)) throw new UserError('فایل پیدا نشد'); buf = fs.readFileSync(f); }
    else if (body.data) buf = Buffer.from(String(body.data), 'base64');
    else throw new UserError('فایلی انتخاب نشده');
    autoBackup(true);
    db.restoreFrom(buf); sessionCache.clear();
    audit(user, 'restore', 'database', null, body.name || 'upload', req);
    bus.emit({ type: 'reload', data: {} });
    return true;
  });
  route('POST', '/api/import/excel', ({ user, body, req }) => {
    need(user, 'stock');
    if (!body.data) throw new UserError('فایل اکسل انتخاب نشده');
    autoBackup(true);
    const { importWorkbook } = require('./import-xlsx');
    const sum = importWorkbook(db, ops, Buffer.from(String(body.data), 'base64'), user);
    audit(user, 'import', 'excel', null, body.name || '', req);
    return sum;
  });

  // ---------------- HTTP server ----------------
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' }); return res.end(); }
    if (url.pathname === '/api/events') return events(req, res, url);
    if (url.pathname === '/api/backup/download') {
      const user = authUser(req, url);
      if (!user || !['admin', 'stock'].includes(user.role)) return send(res, 403, { ok: false, error: 'Forbidden' });
      const buf = db.exportBytes(); audit(user, 'download_backup', 'database', null, '', req);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="clinic-backup-${ops.today()}.sqlite"`, 'Content-Length': buf.length });
      return res.end(buf);
    }
    if (url.pathname.startsWith('/api/')) {
      const r = routes.find(x => x.method === req.method && x.re.test(url.pathname));
      if (!r) return send(res, 404, { ok: false, error: 'Not found' });
      try {
        const params = url.pathname.match(r.re).groups || {};
        const body = req.method === 'POST' ? await readBody(req) : {};
        const user = authUser(req, url);
        const query = Object.fromEntries(url.searchParams);
        const data = await r.fn({ req, res, user, params, body, query, url });
        return send(res, 200, { ok: true, data });
      } catch (e) {
        if (!(e instanceof UserError)) log('error', req.method, url.pathname, e.stack || e);
        const msg = e instanceof UserError ? e.message : (/UNIQUE constraint/.test(e.message) ? 'این مورد تکراری است' : /FOREIGN KEY/.test(e.message) ? 'این مورد در جای دیگر استفاده شده و قابل حذف نیست' : 'خطای سرور: ' + e.message);
        return send(res, e.status || (e instanceof UserError ? 400 : 500), { ok: false, error: msg });
      }
    }
    return serveStatic(url.pathname, res);
  }
  function events(req, res, url) {
    const user = authUser(req, url);
    if (!user) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const id = crypto.randomBytes(6).toString('hex');
    const c = { id, res, user, station: url.searchParams.get('station') || user.station || 'browser', ip: clientIp(req), since: new Date(), last: new Date() };
    clients.set(id, c);
    db.run('UPDATE sessions SET last_seen=? WHERE token=?', [ops.nowStr(), user.token]);
    res.write(`event: msg\ndata: ${JSON.stringify({ type: 'hello', data: { id } })}\n\n`);
    presenceChanged();
    req.on('close', () => { clients.delete(id); presenceChanged(); });
  }
  function serveStatic(p, res) {
    let rel = decodeURIComponent(p).replace(/\\/g, '/');
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(staticDir, rel));
    if (!file.startsWith(path.normalize(staticDir))) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': /\.(woff2|png|jpg)$/.test(file) ? 'max-age=86400' : 'no-cache' });
      res.end(buf);
    });
  }

  const server = http.createServer((req, res) => { handle(req, res).catch(e => { log('fatal', e); try { send(res, 500, { ok: false, error: e.message }); } catch (_) { } }); });
  server.keepAliveTimeout = 65000;
  const sockets = new Set();
  server.on('connection', (sock) => { sockets.add(sock); sock.on('close', () => sockets.delete(sock)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, opts.host || '0.0.0.0', resolve); });
  log(`listening on port ${port} — ${lanAddresses().map(a => a.address).join(', ') || 'localhost'}`);

  // ---------------- discovery (UDP broadcast) ----------------
  let udp = null, announceTimer = null;
  if (opts.discovery !== false) {
    try {
      udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const msg = () => Buffer.from(JSON.stringify({ app: APP_ID, port, name: db.getSetting('clinic_name'), host: os.hostname(), id: db.getSetting('server_id'), version }));
      udp.on('message', (m, rinfo) => { if (String(m) === APP_ID + '?') udp.send(msg(), rinfo.port, rinfo.address); });
      udp.on('error', (e) => log('discovery error', e.message));
      udp.bind(DISCOVERY_PORT, () => {
        try { udp.setBroadcast(true); } catch (_) { }
        const announce = () => {
          const m = msg();
          const targets = new Set(['255.255.255.255', ...lanAddresses().map(broadcastAddr)]);
          for (const t of targets) udp.send(m, DISCOVERY_PORT + 1, t, () => { });
        };
        announce(); announceTimer = setInterval(announce, 3000); announceTimer.unref();
      });
    } catch (e) { log('discovery disabled', e.message); }
  }

  return {
    port, db, ops, server, dataDir, backupDir,
    addresses: () => lanAddresses(),
    close: () => new Promise(r => {
      clearInterval(announceTimer); try { udp && udp.close(); } catch (_) { }
      for (const c of clients.values()) try { c.res.end(); } catch (_) { }
      let done = false; const fin = () => { if (done) return; done = true; try { db.close(); } catch (_) { } r(); };
      server.close(fin);
      for (const sock of sockets) try { sock.destroy(); } catch (_) { }   // keep-alive connections would otherwise block close()
      setTimeout(fin, 1000);
    })
  };
}

module.exports = { createServer, APP_ID, DISCOVERY_PORT };
