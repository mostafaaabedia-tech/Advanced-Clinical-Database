// v1.5: patients sent from the reception to the laboratory, admin summaries (laboratory / pharmacy),
// money details behind every dashboard number, and headers (letterheads) designed by each section.
'use strict';
const { today } = require('./ops');

const TABLES_V15 = `
CREATE TABLE IF NOT EXISTS lab_referrals (
  id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id), visit_id INTEGER, doctor_id INTEGER,
  note TEXT, status TEXT NOT NULL DEFAULT 'open',          -- open | done | cancelled
  lab_request_id INTEGER, sent_by TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), done_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_labref_status ON lab_referrals(status);
`;

// who may change which header (the admin may change all of them)
const HEADER_KEYS = {
  hdr_rx: ['admin'], hdr_rx_foot: ['admin'],
  hdr_report: ['admin'], hdr_report_foot: ['admin'],
  hdr_lab: ['lab'], hdr_lab_foot: ['lab'],
  hdr_receipt_reception: ['reception'], hdr_receipt_pharmacy: ['pharmacy'], hdr_receipt_lab: ['lab']
};

// keep formatting, drop anything that could run code
function cleanHtml(html) {
  let s = String(html || '');
  if (s.length > 3 * 1024 * 1024) throw new Error('سربرگ خیلی بزرگ است (عکس کوچک‌تر انتخاب کنید)');
  s = s.replace(/<\s*(script|iframe|object|embed|link|meta|style|form|input|button|textarea|select)\b[\s\S]*?(<\s*\/\s*\1\s*>|\/?>)/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/(href|src)\s*=\s*("|')\s*(javascript|vbscript):[^"']*\2/gi, '$1=$2#$2');
  s = s.replace(/url\(\s*['"]?\s*javascript:[^)]*\)/gi, '');
  return s.trim();
}

function registerV15({ route, need, db, ops, audit, bus, ROLES, UserError }) {
  const fail = (m) => { throw new UserError(m); };
  const str = (v) => (v === undefined || v === null ? null : String(v).trim() || null);
  const isoOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
  const emit = (type, data, roles) => bus.emit({ type, data, roles });
  const range = (q) => { const t = today(); const from = isoOk(q.from) ? q.from : t; return [from, isoOk(q.to) ? q.to : from]; };

  // ===================================================================== reception → laboratory
  route('POST', '/api/lab/refer', ({ user, body, req }) => {
    need(user, 'reception', 'doctor');
    let p = null;
    if (body.patient_id) p = db.get('SELECT * FROM patients WHERE id=?', [Number(body.patient_id)]);
    else if (body.patient_code) { const c = String(body.patient_code).trim(); p = db.get('SELECT * FROM patients WHERE code=? OR code=? OR CAST(id AS TEXT)=?', [c, 'P-' + c, c]); }
    if (!p) fail('مریض با این کد پیدا نشد');
    const open = db.get("SELECT id FROM lab_referrals WHERE patient_id=? AND status='open' AND DATE(created_at)=DATE('now','localtime')", [p.id]);
    if (open) fail('این مریض امروز قبلاً به لابراتوار فرستاده شده و هنوز پذیرش نشده');
    const id = db.insert('lab_referrals', { patient_id: p.id, visit_id: Number(body.visit_id) || null, doctor_id: Number(body.doctor_id) || null, note: str(body.note), sent_by: user.full_name || user.username, created_by: user.id });
    emit('lab:referral', { id, patient_id: p.id, full_name: p.full_name, code: p.code, note: str(body.note) }, ['lab', 'admin']);
    audit(user, 'refer', 'lab_referral', id, p.code, req);
    return { id, patient: { id: p.id, code: p.code, full_name: p.full_name } };
  });
  route('GET', '/api/lab/referrals', ({ user, query }) => {
    need(user, 'lab', 'reception');
    const st = ['open', 'done', 'cancelled'].includes(query.status) ? query.status : 'open';
    return db.all(`SELECT f.*, p.code, p.full_name, p.father_name, p.sex, p.birth_date, p.phone, d.name doctor_name, r.lab_code FROM lab_referrals f JOIN patients p ON p.id=f.patient_id
      LEFT JOIN doctors d ON d.id=f.doctor_id LEFT JOIN lab_requests r ON r.id=f.lab_request_id WHERE f.status=? ${st === 'open' ? '' : "AND DATE(f.created_at) >= DATE('now','localtime','-7 days')"} ORDER BY f.id DESC LIMIT 300`, [st]);
  });
  route('POST', '/api/lab/referral-done/:id', ({ user, params, body }) => {
    need(user, 'lab');
    db.run("UPDATE lab_referrals SET status='done', lab_request_id=?, done_at=datetime('now','localtime') WHERE id=?", [Number(body.lab_request_id) || null, Number(params.id)]);
    emit('lab:referral', { id: Number(params.id), done: 1 }, ['lab', 'reception', 'admin']); return true;
  });
  route('POST', '/api/lab/referral-cancel/:id', ({ user, params }) => {
    need(user, 'lab', 'reception');
    db.run("UPDATE lab_referrals SET status='cancelled', done_at=datetime('now','localtime') WHERE id=? AND status='open'", [Number(params.id)]);
    emit('lab:referral', { id: Number(params.id), cancelled: 1 }, ['lab', 'reception', 'admin']); return true;
  });

  // ===================================================================== admin: laboratory summary
  // received tests with their price, patients and number of tests, and the reagents (used and bought, with factor numbers)
  route('GET', '/api/admin/lab-summary', ({ user, query }) => {
    need(user, 'stock');
    const [from, to] = range(query);
    const reqs = db.all(`SELECT r.id, r.lab_code, r.date, r.status, r.subtotal, r.discount, r.net, r.paid, p.code patient_code, p.full_name, p.father_name,
      (SELECT GROUP_CONCAT(t.code, ' ') FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id WHERE i.request_id=r.id) tests,
      (SELECT COUNT(*) FROM lab_request_items i WHERE i.request_id=r.id) n_tests
      FROM lab_requests r JOIN patients p ON p.id=r.patient_id WHERE r.status NOT IN ('requested','cancelled') AND r.date BETWEEN ? AND ? ORDER BY r.date, r.id`, [from, to]);
    const byTest = db.all(`SELECT t.code, t.name, COUNT(*) n, SUM(i.price) amount FROM lab_request_items i JOIN lab_requests r ON r.id=i.request_id JOIN lab_tests t ON t.id=i.test_id
      WHERE r.status NOT IN ('requested','cancelled') AND r.date BETWEEN ? AND ? GROUP BY t.id ORDER BY n DESC`, [from, to]);
    const used = db.all(`SELECT li.name, li.unit, -SUM(m.qty) qty, -SUM(m.qty * IFNULL(m.unit_cost, li.cost)) value FROM lab_item_moves m JOIN lab_items li ON li.id=m.item_id
      WHERE m.kind IN ('use','expired') AND m.date BETWEEN ? AND ? GROUP BY li.id ORDER BY value DESC`, [from, to]);
    const bought = db.all(`SELECT m.date, li.name, li.unit, m.qty, m.unit_cost, (m.qty * IFNULL(m.unit_cost,0)) value, m.factor_no, m.supplier, m.note FROM lab_item_moves m JOIN lab_items li ON li.id=m.item_id
      WHERE m.kind='in' AND m.date BETWEEN ? AND ? ORDER BY m.date, m.id`, [from, to]);
    const stock = db.all('SELECT name, unit, stock, reorder_level, expiry FROM lab_items WHERE active=1 ORDER BY name');
    const T = (k) => r2(reqs.reduce((a, r) => a + (r[k] || 0), 0));
    return { from, to, reqs, byTest, used, bought, stock, totals: { requests: reqs.length, patients: new Set(reqs.map(r => r.patient_code)).size, tests: reqs.reduce((a, r) => a + r.n_tests, 0), subtotal: T('subtotal'), discount: T('discount'), net: T('net'), paid: T('paid'), bought: r2(bought.reduce((a, b) => a + b.value, 0)), used: r2(used.reduce((a, b) => a + b.value, 0)) } };
  });

  // ===================================================================== admin: pharmacy summary with shortage warnings (pharmacy and laboratory)
  route('GET', '/api/admin/pharmacy-summary', ({ user, query }) => {
    need(user, 'stock', 'pharmacy');
    const [from, to] = range(query);
    const lim = Math.max(0, Number(db.getSetting('low_stock_alert', '3')) || 3);
    const byMed = db.all(`SELECT m.code, m.name, m.strength, m.unit, SUM(si.qty - si.returned_qty) qty, SUM(si.total * (si.qty - si.returned_qty) / CASE WHEN si.qty > 0 THEN si.qty ELSE 1 END) amount
      FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN medicines m ON m.id=si.medicine_id WHERE s.status<>'void' AND s.date BETWEEN ? AND ? GROUP BY si.medicine_id ORDER BY qty DESC`, [from, to]);
    const byDay = db.all(`SELECT s.date, COUNT(*) sales, SUM(s.net) net, SUM(s.paid) paid FROM sales s WHERE s.status<>'void' AND s.date BETWEEN ? AND ? GROUP BY s.date ORDER BY s.date`, [from, to]);
    const sales = db.all(`SELECT id, sale_code, rx_code, date, patient_name, net, paid FROM v_sales WHERE status<>'void' AND date BETWEEN ? AND ? ORDER BY id DESC LIMIT 2000`, [from, to]);
    const meds = db.all('SELECT id, code, name, strength, unit, stock, reorder_level, stock_cost, next_expiry FROM v_medicine_stock WHERE active=1 ORDER BY name');
    const low = meds.filter(m => m.stock <= Math.max(lim, m.reorder_level || 0));
    const labLow = db.all('SELECT id, name, unit, stock, reorder_level FROM lab_items WHERE active=1 ORDER BY name').filter(i => i.stock <= Math.max(lim, i.reorder_level || 0));
    return { from, to, limit: lim, byMed, byDay, sales, meds, low, labLow, totals: { net: r2(byDay.reduce((a, d) => a + d.net, 0)), count: byDay.reduce((a, d) => a + d.sales, 0), stock_value: r2(meds.reduce((a, m) => a + (m.stock_cost || 0), 0)) } };
  });

  // ===================================================================== every amount behind a dashboard number
  route('GET', '/api/details', ({ user, query }) => {
    need(user, 'stock', 'reception');
    const [from, to] = range(query); const k = String(query.kind || '');
    if (k === 'visit') return db.all(`SELECT visit_no code, visit_date date, patient_code, full_name, doctor_name, service_name detail, net, paid FROM v_visits WHERE status NOT IN ('cancelled','reserved') AND visit_date BETWEEN ? AND ? ORDER BY id`, [from, to]);
    if (k === 'lab') return db.all(`SELECT lab_code code, date, patient_code, full_name, doctor_name, tests detail, subtotal, discount, net, paid FROM v_lab_requests WHERE status NOT IN ('requested','cancelled') AND date BETWEEN ? AND ? ORDER BY id`, [from, to]);
    if (k === 'sale') return db.all(`SELECT sale_code code, date, patient_code, patient_name full_name, rx_code detail, net, paid, profit FROM v_sales WHERE status<>'void' AND date BETWEEN ? AND ? ORDER BY id`, [from, to]);
    if (k === 'admission') return db.all(`SELECT adm_no code, DATE(admitted_at) date, patient_code, full_name, doctor_name, bed_name detail, net, paid FROM v_admissions WHERE DATE(admitted_at) BETWEEN ? AND ? ORDER BY id`, [from, to]);
    if (k === 'expenses') { need(user, 'stock'); return db.all('SELECT id code, date, item full_name, category detail, amount net, paid FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date, id', [from, to]); }
    if (k === 'withdrawals') return db.all('SELECT id code, date, person full_name, section, kind, note detail, amount net FROM withdrawals WHERE date BETWEEN ? AND ? ORDER BY date, id', [from, to]);
    fail('نوع نامعتبر');
  });

  // ===================================================================== headers (letterheads) of every section
  route('GET', '/api/headers', ({ user }) => {
    need(user, ...ROLES);
    const out = {}; for (const k of Object.keys(HEADER_KEYS)) out[k] = db.getSetting(k, '') || '';
    return { keys: out, doctors: db.all('SELECT id, name, title, header_html, footer_html FROM doctors ORDER BY sort, id') };
  });
  route('POST', '/api/headers/save', ({ user, body, req }) => {
    need(user, ...ROLES);
    let html; try { html = cleanHtml(body.html); } catch (e) { fail(e.message); }
    if (body.doctor_id) {
      const did = Number(body.doctor_id);
      if (user.role !== 'admin' && !(user.role === 'doctor' && user.doctor_id === did)) fail('فقط سربرگ خودتان را می‌توانید تغییر دهید');
      db.run(`UPDATE doctors SET ${body.foot ? 'footer_html' : 'header_html'}=? WHERE id=?`, [html || null, did]);
      emit('setup:update', {}, null);
    } else {
      const k = String(body.key || ''); const who = HEADER_KEYS[k]; if (!who) fail('نوع سربرگ نامعتبر');
      if (user.role !== 'admin' && !who.includes(user.role)) fail('اجازه تغییر این سربرگ را ندارید');
      db.setSetting(k, html);
      emit('settings:update', {}, null);
    }
    audit(user, 'header', 'settings', null, String(body.key || 'doctor ' + body.doctor_id), req);
    return true;
  });
}

module.exports = { TABLES_V15, registerV15, cleanHtml, HEADER_KEYS };
