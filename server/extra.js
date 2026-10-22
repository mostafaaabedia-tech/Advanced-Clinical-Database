// v1.4 modules: staff (salary, advances, leave, attendance, payroll), reminders, patient documents, vaccinations,
// doctor favourites & certificates, pharmacy expiry / controlled register / supplier returns, ABC-VED, stock count,
// department requests, purchase orders, lab QC / critical calls / TAT, result verification, comparison report.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TABLES_EXTRA = `
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY, code TEXT, name TEXT NOT NULL, father_name TEXT, position TEXT, section TEXT, phone TEXT, tazkira TEXT,
  hire_date TEXT, salary REAL NOT NULL DEFAULT 0, work_start TEXT NOT NULL DEFAULT '08:00', work_end TEXT NOT NULL DEFAULT '16:00',
  work_days TEXT NOT NULL DEFAULT '601234',           -- JS weekdays (0 = Sunday … 6 = Saturday); Friday (5) off by default
  user_id INTEGER, active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS staff_attendance (
  id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE, date TEXT NOT NULL,
  check_in TEXT, check_out TEXT, status TEXT NOT NULL DEFAULT 'present',   -- present | absent | leave | holiday
  late_min INTEGER NOT NULL DEFAULT 0, early_min INTEGER NOT NULL DEFAULT 0, note TEXT, source TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), UNIQUE (staff_id, date)
);
CREATE TABLE IF NOT EXISTS staff_leaves (
  id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'hourly',                  -- hourly (during work time) | daily | sick | annual
  date TEXT NOT NULL, date_to TEXT, from_time TEXT, to_time TEXT, minutes INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 1, reason TEXT, approved_by TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS staff_advances (
  id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date TEXT NOT NULL, month TEXT NOT NULL, amount REAL NOT NULL, source TEXT, withdrawal_id INTEGER, note TEXT, given_by TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS staff_payroll (
  id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE, month TEXT NOT NULL, period_from TEXT, period_to TEXT,
  base REAL NOT NULL DEFAULT 0, work_days INTEGER, present_days INTEGER, absent_days REAL NOT NULL DEFAULT 0, unpaid_leave_min INTEGER NOT NULL DEFAULT 0,
  late_min INTEGER NOT NULL DEFAULT 0, deduction REAL NOT NULL DEFAULT 0, bonus REAL NOT NULL DEFAULT 0, advances REAL NOT NULL DEFAULT 0,
  carry_in REAL NOT NULL DEFAULT 0, net REAL NOT NULL DEFAULT 0, paid REAL NOT NULL DEFAULT 0, note TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), updated_at TEXT, UNIQUE (staff_id, month)
);
CREATE TABLE IF NOT EXISTS staff_payments (
  id INTEGER PRIMARY KEY, payroll_id INTEGER NOT NULL REFERENCES staff_payroll(id) ON DELETE CASCADE, staff_id INTEGER NOT NULL,
  date TEXT NOT NULL, amount REAL NOT NULL, source TEXT, withdrawal_id INTEGER, note TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS reminders_log (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ref_id INTEGER, patient_id INTEGER, channel TEXT, sent_by INTEGER, sent_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS patient_docs (
  id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE, title TEXT, kind TEXT,
  file TEXT NOT NULL, mime TEXT, size INTEGER, note TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS vaccinations (
  id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE, vaccine TEXT NOT NULL,
  due_date TEXT, given_date TEXT, batch TEXT, note TEXT, given_by TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (patient_id, vaccine)
);
CREATE TABLE IF NOT EXISTS dr_favorites (
  id INTEGER PRIMARY KEY, doctor_id INTEGER, medicine_id INTEGER, name TEXT NOT NULL, form TEXT, strength TEXT, unit TEXT, dose TEXT,
  frequency TEXT, timing TEXT, route TEXT, duration REAL, duration_unit TEXT, note TEXT, sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE, encounter_id INTEGER, doctor_id INTEGER,
  kind TEXT NOT NULL, date TEXT NOT NULL, data TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS supplier_returns (
  id INTEGER PRIMARY KEY, purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE, date TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0,
  items TEXT, payment_id INTEGER, note TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS stock_counts (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, title TEXT, status TEXT NOT NULL DEFAULT 'open', note TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), closed_at TEXT
);
CREATE TABLE IF NOT EXISTS stock_count_items (
  id INTEGER PRIMARY KEY, count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE, medicine_id INTEGER NOT NULL,
  system_qty REAL NOT NULL DEFAULT 0, counted_qty REAL, unit_cost REAL NOT NULL DEFAULT 0, UNIQUE (count_id, medicine_id)
);
CREATE TABLE IF NOT EXISTS dept_requests (
  id INTEGER PRIMARY KEY, req_no TEXT, section TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested',   -- requested | issued | partial | rejected
  note TEXT, reply TEXT, requested_by TEXT, issued_by TEXT, issued_at TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS dept_request_items (
  id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES dept_requests(id) ON DELETE CASCADE,
  medicine_id INTEGER, lab_item_id INTEGER, name TEXT NOT NULL, unit TEXT, qty REAL NOT NULL DEFAULT 0, qty_issued REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY, po_no TEXT, supplier_id INTEGER, date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',   -- draft | sent | partial | received | cancelled
  expected_date TEXT, note TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY, po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE, medicine_id INTEGER, name TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lab_qc_materials (
  id INTEGER PRIMARY KEY, test_id INTEGER NOT NULL, name TEXT NOT NULL, level TEXT, lot_no TEXT, expiry TEXT,
  mean REAL NOT NULL, sd REAL NOT NULL, unit TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS lab_qc_results (
  id INTEGER PRIMARY KEY, material_id INTEGER NOT NULL REFERENCES lab_qc_materials(id) ON DELETE CASCADE, date TEXT NOT NULL, run_at TEXT,
  value REAL NOT NULL, rule TEXT, accepted INTEGER NOT NULL DEFAULT 1, action TEXT, user_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS lab_critical_calls (
  id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL, test_id INTEGER, value TEXT, flag TEXT, notified_to TEXT, method TEXT,
  read_back INTEGER NOT NULL DEFAULT 0, note TEXT, user_id INTEGER, at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`;

function registerExtra({ route, need, db, ops, audit, bus, dataDir, ROLES, UserError }) {
  const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
  const n = (x, d = 0) => { const v = Number(x); return isFinite(v) ? v : d; };
  const str = (x) => (x === undefined || x === null) ? null : (String(x).trim() || null);
  const isoOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  const timeOk = (s) => /^\d{1,2}:\d{2}$/.test(String(s || ''));
  const fail = (m) => { throw new UserError(m); };
  const today = ops.today, nowStr = ops.nowStr;
  const emit = (type, data, roles) => bus.emit({ type, data, roles });
  const mins = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const setting = (k, d) => db.getSetting(k, d);
  const dayList = (from, to) => ops.dayRange(from, to);
  const STAFF_ROLES = ['reception'];

  // ===================================================================== staff
  route('GET', '/api/staff', ({ user }) => { need(user, ...STAFF_ROLES); return db.all('SELECT * FROM staff ORDER BY active DESC, name'); });
  route('POST', '/api/staff/save', ({ user, body, req }) => {
    need(user, ...STAFF_ROLES);
    const row = {};
    for (const f of ['code', 'name', 'father_name', 'position', 'section', 'phone', 'tazkira', 'hire_date', 'work_start', 'work_end', 'work_days', 'notes']) if (f in body) row[f] = str(body[f]);
    if ('salary' in body) row.salary = r2(body.salary);
    if ('active' in body) row.active = body.active ? 1 : 0;
    if ('user_id' in body) row.user_id = Number(body.user_id) || null;
    if (!body.id && !row.name) fail('نام کارمند الزامی است');
    if (row.work_start && !timeOk(row.work_start)) fail('ساعت شروع کار نادرست است');
    if (row.work_end && !timeOk(row.work_end)) fail('ساعت ختم کار نادرست است');
    let id = Number(body.id) || null;
    if (id) db.update('staff', id, row); else id = db.insert('staff', row);
    audit(user, body.id ? 'update' : 'create', 'staff', id, JSON.stringify(row).slice(0, 300), req);
    return db.get('SELECT * FROM staff WHERE id=?', [id]);
  });
  const staffOf = (id) => { const s = db.get('SELECT * FROM staff WHERE id=?', [id]); if (!s) fail('کارمند پیدا نشد'); return s; };
  const workMinutes = (s) => Math.max(60, mins(s.work_end) - mins(s.work_start));
  const isWorkDay = (s, date) => String(s.work_days || '601234').includes(String(new Date(date + 'T12:00:00').getDay()));

  // attendance of one day (with leaves)
  route('GET', '/api/staff/day', ({ user, query }) => {
    need(user, ...STAFF_ROLES);
    const date = isoOk(query.date) ? query.date : today();
    const staff = db.all('SELECT * FROM staff WHERE active=1 ORDER BY name');
    const att = db.all('SELECT * FROM staff_attendance WHERE date=?', [date]);
    const leaves = db.all('SELECT * FROM staff_leaves WHERE date<=? AND IFNULL(date_to, date)>=?', [date, date]);
    return staff.map(s => ({ ...s, workday: isWorkDay(s, date), att: att.find(a => a.staff_id === s.id) || null, leaves: leaves.filter(l => l.staff_id === s.id) }));
  });
  function setAttendance(staffId, date, patch, user, source) {
    const s = staffOf(staffId);
    const old = db.get('SELECT * FROM staff_attendance WHERE staff_id=? AND date=?', [s.id, date]);
    const row = { ...(old || {}), ...patch };
    row.late_min = row.check_in && row.status === 'present' ? Math.max(0, mins(row.check_in) - mins(s.work_start) - n(setting('staff_grace_min', '10'))) : 0;
    row.early_min = row.check_out && row.status === 'present' ? Math.max(0, mins(s.work_end) - mins(row.check_out)) : 0;
    const data = { status: row.status || 'present', check_in: row.check_in || null, check_out: row.check_out || null, late_min: row.late_min, early_min: row.early_min, note: str(row.note), source: source || row.source || 'manual' };
    if (old) db.update('staff_attendance', old.id, data); else db.insert('staff_attendance', { staff_id: s.id, date, ...data, created_by: user.id });
    return db.get('SELECT * FROM staff_attendance WHERE staff_id=? AND date=?', [s.id, date]);
  }
  route('POST', '/api/staff/check', ({ user, body }) => {
    need(user, ...STAFF_ROLES);
    const date = isoOk(body.date) ? body.date : today(), t = timeOk(body.time) ? body.time : hhmm();
    const a = body.action;
    const r = db.transaction(() => {
      if (a === 'in') return setAttendance(body.staff_id, date, { status: 'present', check_in: t }, user);
      if (a === 'out') { const old = db.get('SELECT * FROM staff_attendance WHERE staff_id=? AND date=?', [body.staff_id, date]); return setAttendance(body.staff_id, date, { status: 'present', check_in: old?.check_in || null, check_out: t }, user); }
      if (a === 'absent') return setAttendance(body.staff_id, date, { status: 'absent', check_in: null, check_out: null, note: body.note }, user);
      if (a === 'holiday') return setAttendance(body.staff_id, date, { status: 'holiday', check_in: null, check_out: null, note: body.note }, user);
      if (a === 'edit') return setAttendance(body.staff_id, date, { status: body.status || 'present', check_in: timeOk(body.check_in) ? body.check_in : null, check_out: timeOk(body.check_out) ? body.check_out : null, note: body.note }, user);
      if (a === 'clear') { db.run('DELETE FROM staff_attendance WHERE staff_id=? AND date=?', [body.staff_id, date]); return null; }
      fail('عمل نامعتبر');
    });
    emit('staff:attendance', { staff_id: body.staff_id, date }, ['reception', 'admin']);
    return r;
  });
  // import from an attendance device (CSV / text: code or name, date-time) — first time = in, last time = out
  route('POST', '/api/staff/import-attendance', ({ user, body, req }) => {
    need(user, ...STAFF_ROLES);
    const staff = db.all('SELECT * FROM staff');
    const byKey = new Map(); staff.forEach(s => { if (s.code) byKey.set(String(s.code).trim().toLowerCase(), s); byKey.set(String(s.name).trim().toLowerCase(), s); });
    const days = new Map(); let skipped = 0;
    for (const line of String(body.text || '').split(/\r?\n/)) {
      const parts = line.split(/[,;\t]/).map(x => x.trim()).filter(Boolean); if (parts.length < 2) continue;
      const s = byKey.get(parts[0].toLowerCase()); if (!s) { skipped++; continue; }
      const dt = parts.slice(1).join(' ').match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\D+(\d{1,2}):(\d{2})/); if (!dt) { skipped++; continue; }
      const d = `${dt[1]}-${dt[2].padStart(2, '0')}-${dt[3].padStart(2, '0')}`, t = `${dt[4].padStart(2, '0')}:${dt[5]}`;
      const k = s.id + '|' + d; const o = days.get(k) || { s, d, min: t, max: t }; if (t < o.min) o.min = t; if (t > o.max) o.max = t; days.set(k, o);
    }
    db.transaction(() => { for (const o of days.values()) setAttendance(o.s.id, o.d, { status: 'present', check_in: o.min, check_out: o.max !== o.min ? o.max : null }, user, 'device'); });
    audit(user, 'import', 'staff_attendance', null, `${days.size} days, skipped ${skipped}`, req);
    return { days: days.size, skipped };
  });
  // leave: hourly (during work time, exact minutes) or daily / sick / annual
  route('POST', '/api/staff/leave', ({ user, body, req }) => {
    need(user, ...STAFF_ROLES);
    const s = staffOf(body.staff_id);
    const kind = ['hourly', 'daily', 'sick', 'annual'].includes(body.kind) ? body.kind : 'hourly';
    const date = isoOk(body.date) ? body.date : today();
    let minutes = 0, date_to = null, from_time = null, to_time = null;
    if (kind === 'hourly') {
      if (!timeOk(body.from_time) || !timeOk(body.to_time)) fail('ساعت شروع و ختم رخصتی را وارد کنید');
      from_time = body.from_time; to_time = body.to_time;
      const a = Math.max(mins(from_time), mins(s.work_start)), b = Math.min(mins(to_time), mins(s.work_end));
      minutes = b - a; if (minutes <= 0) fail('رخصتی ساعتی باید در وقت کار باشد (' + s.work_start + ' تا ' + s.work_end + ')');
    } else {
      date_to = isoOk(body.date_to) && body.date_to >= date ? body.date_to : date;
      minutes = dayList(date, date_to).filter(d => isWorkDay(s, d)).length * workMinutes(s);
    }
    const row = { staff_id: s.id, kind, date, date_to, from_time, to_time, minutes, paid: body.paid === undefined ? (kind === 'hourly' && setting('staff_hourly_paid', '0') !== '1' ? 0 : 1) : (body.paid ? 1 : 0), reason: str(body.reason), approved_by: str(body.approved_by) || user.full_name || user.username };
    let id = Number(body.id) || null;
    if (id) db.update('staff_leaves', id, row); else id = db.insert('staff_leaves', { ...row, created_by: user.id });
    if (kind !== 'hourly') db.transaction(() => { for (const d of dayList(date, date_to)) if (isWorkDay(s, d)) setAttendance(s.id, d, { status: 'leave', check_in: null, check_out: null, note: row.reason }, user); });
    audit(user, 'leave', 'staff', s.id, JSON.stringify(row), req);
    emit('staff:attendance', { staff_id: s.id, date }, ['reception', 'admin']);
    return db.get('SELECT * FROM staff_leaves WHERE id=?', [id]);
  });
  route('POST', '/api/staff/leave-del/:id', ({ user, params }) => { need(user, ...STAFF_ROLES); db.run('DELETE FROM staff_leaves WHERE id=?', [Number(params.id)]); return true; });
  route('GET', '/api/staff/leaves', ({ user, query }) => {
    need(user, ...STAFF_ROLES);
    const w = ['IFNULL(l.date_to, l.date) >= ? AND l.date <= ?'], P = [isoOk(query.from) ? query.from : today(), isoOk(query.to) ? query.to : today()];
    if (query.staff_id) { w.push('l.staff_id=?'); P.push(Number(query.staff_id)); }
    return db.all(`SELECT l.*, s.name, s.position FROM staff_leaves l JOIN staff s ON s.id=l.staff_id WHERE ${w.join(' AND ')} ORDER BY l.date DESC, l.id DESC`, P);
  });

  // advance / withdrawal from the salary (optionally paid from a cash drawer → also a withdrawal of that section)
  function cashOut(section, amount, person, note, date, user) {
    if (!['reception', 'pharmacy', 'lab'].includes(section)) return null;
    return ops.saveWithdrawal({ section, kind: 'salary', amount, person, note, date, by_whom: user.full_name || user.username }, { ...user, role: 'admin' });
  }
  route('POST', '/api/staff/advance', ({ user, body, req }) => {
    need(user, ...STAFF_ROLES);
    const s = staffOf(body.staff_id);
    const amount = r2(body.amount); if (!(amount > 0)) fail('مبلغ را وارد کنید');
    if (!/^\d{4}-\d{2}$/.test(String(body.month || ''))) fail('ماه معاش را انتخاب کنید');
    const date = isoOk(body.date) ? body.date : today();
    const id = db.transaction(() => {
      const wid = cashOut(body.source, amount, s.name, `پیش‌پرداخت معاش ${body.month}${body.note ? ' — ' + body.note : ''}`, date, user);
      return db.insert('staff_advances', { staff_id: s.id, date, month: body.month, amount, source: str(body.source), withdrawal_id: wid, note: str(body.note), given_by: user.full_name || user.username, created_by: user.id });
    });
    audit(user, 'advance', 'staff', s.id, `${amount} ${body.month}`, req);
    return db.get('SELECT * FROM staff_advances WHERE id=?', [id]);
  });
  route('POST', '/api/staff/advance-del/:id', ({ user, params, req }) => {
    need(user, ...STAFF_ROLES);
    const a = db.get('SELECT * FROM staff_advances WHERE id=?', [Number(params.id)]); if (!a) return false;
    db.transaction(() => { if (a.withdrawal_id) ops.deleteWithdrawal(a.withdrawal_id, { ...user, role: 'admin' }); db.run('DELETE FROM staff_advances WHERE id=?', [a.id]); });
    audit(user, 'delete', 'staff_advances', a.id, JSON.stringify(a), req); return true;
  });
  route('GET', '/api/staff/advances', ({ user, query }) => {
    need(user, ...STAFF_ROLES);
    const w = [], P = [];
    if (query.month) { w.push('a.month=?'); P.push(query.month); }
    if (query.staff_id) { w.push('a.staff_id=?'); P.push(Number(query.staff_id)); }
    return db.all(`SELECT a.*, s.name FROM staff_advances a JOIN staff s ON s.id=a.staff_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY a.date DESC, a.id DESC LIMIT 2000`, P);
  });

  // payroll of one month: base − (absent days + unpaid leave + optional late) + bonus − advances + remaining of the previous month
  function computePay(s, month, from, to, bonus) {
    const workDays = dayList(from, to).filter(d => isWorkDay(s, d) && (!s.hire_date || d >= s.hire_date));
    const att = db.all('SELECT * FROM staff_attendance WHERE staff_id=? AND date BETWEEN ? AND ?', [s.id, from, to]);
    const leaves = db.all('SELECT * FROM staff_leaves WHERE staff_id=? AND date BETWEEN ? AND ?', [s.id, from, to]);
    const perDay = n(s.salary) / 30, perMin = perDay / workMinutes(s);
    const absent = att.filter(a => a.status === 'absent').length;
    const unpaidMin = leaves.filter(l => !l.paid).reduce((x, l) => x + n(l.minutes), 0);
    const late = att.reduce((x, a) => x + n(a.late_min) + n(a.early_min), 0);
    const lateDeduct = setting('staff_late_deduct', '0') === '1' ? late * perMin : 0;
    const deduction = r2(absent * perDay + unpaidMin * perMin + lateDeduct);
    const advances = r2(db.scalar('SELECT IFNULL(SUM(amount),0) FROM staff_advances WHERE staff_id=? AND month=?', [s.id, month]));
    const prev = db.get('SELECT * FROM staff_payroll WHERE staff_id=? AND month<? ORDER BY month DESC LIMIT 1', [s.id, month]);
    const carry = prev ? r2(prev.net - prev.paid) : 0;
    const present = att.filter(a => a.status === 'present').length;
    const net = r2(n(s.salary) - deduction + n(bonus) - advances + carry);
    return { staff_id: s.id, month, period_from: from, period_to: to, base: r2(s.salary), work_days: workDays.length, present_days: present, absent_days: absent, unpaid_leave_min: unpaidMin, late_min: late, deduction, bonus: r2(bonus), advances, carry_in: carry, net };
  }
  route('GET', '/api/staff/payroll', ({ user, query }) => {
    need(user, ...STAFF_ROLES);
    const { month, from, to } = query; if (!/^\d{4}-\d{2}$/.test(String(month || '')) || !isoOk(from) || !isoOk(to)) fail('ماه نامعتبر');
    const saved = db.all('SELECT * FROM staff_payroll WHERE month=?', [month]);
    return db.all('SELECT * FROM staff WHERE active=1 OR id IN (SELECT staff_id FROM staff_payroll WHERE month=?) ORDER BY name', [month]).map(s => {
      const sv = saved.find(x => x.staff_id === s.id);
      const calc = computePay(s, month, from, to, sv ? sv.bonus : 0);
      const pays = sv ? db.all('SELECT * FROM staff_payments WHERE payroll_id=? ORDER BY date, id', [sv.id]) : [];
      return { staff: s, calc, saved: sv || null, payments: pays };
    });
  });
  route('POST', '/api/staff/payroll/save', ({ user, body, req }) => {
    need(user, ...STAFF_ROLES);
    const s = staffOf(body.staff_id); const { month, from, to } = body;
    if (!/^\d{4}-\d{2}$/.test(String(month || '')) || !isoOk(from) || !isoOk(to)) fail('ماه نامعتبر');
    const c = computePay(s, month, from, to, n(body.bonus));
    const old = db.get('SELECT * FROM staff_payroll WHERE staff_id=? AND month=?', [s.id, month]);
    const row = { ...c, note: str(body.note), updated_at: nowStr() };
    if (old) db.update('staff_payroll', old.id, row); else db.insert('staff_payroll', { ...row, paid: 0, created_by: user.id });
    audit(user, 'payroll', 'staff', s.id, `${month} net ${c.net}`, req);
    return db.get('SELECT * FROM staff_payroll WHERE staff_id=? AND month=?', [s.id, month]);
  });
  route('POST', '/api/staff/payroll/pay', ({ user, body, req }) => {
    need(user, ...STAFF_ROLES);
    const p = db.get('SELECT p.*, s.name FROM staff_payroll p JOIN staff s ON s.id=p.staff_id WHERE p.id=?', [Number(body.payroll_id)]); if (!p) fail('ابتدا معاش این ماه را حساب و ذخیره کنید');
    const amount = r2(body.amount); if (!(amount > 0)) fail('مبلغ را وارد کنید');
    const date = isoOk(body.date) ? body.date : today();
    db.transaction(() => {
      const wid = cashOut(body.source, amount, p.name, `معاش ${p.month}`, date, user);
      db.insert('staff_payments', { payroll_id: p.id, staff_id: p.staff_id, date, amount, source: str(body.source), withdrawal_id: wid, note: str(body.note), created_by: user.id });
      db.update('staff_payroll', p.id, { paid: r2(p.paid + amount) });
    });
    audit(user, 'pay_salary', 'staff', p.staff_id, `${p.month} ${amount}`, req);
    return db.get('SELECT * FROM staff_payroll WHERE id=?', [p.id]);
  });
  route('POST', '/api/staff/payment-del/:id', ({ user, params }) => {
    need(user, ...STAFF_ROLES);
    const x = db.get('SELECT * FROM staff_payments WHERE id=?', [Number(params.id)]); if (!x) return false;
    db.transaction(() => { if (x.withdrawal_id) ops.deleteWithdrawal(x.withdrawal_id, { ...user, role: 'admin' }); db.run('DELETE FROM staff_payments WHERE id=?', [x.id]); db.run('UPDATE staff_payroll SET paid = paid - ? WHERE id=?', [x.amount, x.payroll_id]); });
    return true;
  });
  // monthly attendance summary
  route('GET', '/api/staff/attendance-report', ({ user, query }) => {
    need(user, ...STAFF_ROLES);
    const from = isoOk(query.from) ? query.from : today(), to = isoOk(query.to) ? query.to : from;
    return db.all('SELECT * FROM staff WHERE active=1 ORDER BY name').map(s => {
      const att = db.all('SELECT * FROM staff_attendance WHERE staff_id=? AND date BETWEEN ? AND ? ORDER BY date', [s.id, from, to]);
      const leaves = db.all('SELECT * FROM staff_leaves WHERE staff_id=? AND date BETWEEN ? AND ?', [s.id, from, to]);
      const workDays = dayList(from, to <= today() ? to : today()).filter(d => isWorkDay(s, d) && (!s.hire_date || d >= s.hire_date)).length;
      const worked = att.filter(a => a.check_in && a.check_out).reduce((x, a) => x + Math.max(0, mins(a.check_out) - mins(a.check_in)), 0);
      return { staff: s, work_days: workDays, present: att.filter(a => a.status === 'present').length, absent: att.filter(a => a.status === 'absent').length, leave_days: att.filter(a => a.status === 'leave').length,
        no_record: Math.max(0, workDays - att.length), late_min: att.reduce((x, a) => x + n(a.late_min), 0), early_min: att.reduce((x, a) => x + n(a.early_min), 0),
        hourly_leave_min: leaves.filter(l => l.kind === 'hourly').reduce((x, l) => x + n(l.minutes), 0), unpaid_leave_min: leaves.filter(l => !l.paid).reduce((x, l) => x + n(l.minutes), 0),
        worked_min: worked, days: att };
    });
  });

  // ===================================================================== reminders (WhatsApp messages prepared by the reception)
  route('GET', '/api/reminders', ({ user, query }) => {
    need(user, 'reception', 'doctor');
    const t = today(), days = Math.max(0, Math.min(60, n(query.days, 3)));
    const end = (() => { const d = new Date(t + 'T12:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); })();
    const sent = (kind) => new Set(db.all('SELECT ref_id FROM reminders_log WHERE kind=? AND DATE(sent_at) >= DATE(?, \'-30 days\')', [kind, t]).map(r => r.ref_id));
    const P = 'p.id patient_id, p.code, p.full_name, p.father_name, p.phone, p.sex, p.birth_date';
    const sv = sent('visit'), sr = sent('reservation'), sx = sent('vaccine'), sl = sent('lab'), sp = sent('lapsed');
    const reservations = db.all(`SELECT v.id ref_id, v.visit_date date, v.reserved_time time, v.service_name, d.name doctor, ${P} FROM visits v JOIN patients p ON p.id=v.patient_id LEFT JOIN doctors d ON d.id=v.doctor_id
      WHERE v.status='reserved' AND v.visit_date BETWEEN ? AND ? ORDER BY v.visit_date, v.reserved_time`, [t, end]).map(r => ({ ...r, sent: sr.has(r.ref_id) }));
    const nextVisits = db.all(`SELECT e.id ref_id, e.next_visit date, d.name doctor, ${P} FROM encounters e JOIN patients p ON p.id=e.patient_id LEFT JOIN doctors d ON d.id=e.doctor_id
      WHERE e.next_visit BETWEEN ? AND ? AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.patient_id=e.patient_id AND v.visit_date >= e.next_visit AND v.status<>'cancelled')
      AND e.id = (SELECT MAX(e2.id) FROM encounters e2 WHERE e2.patient_id=e.patient_id) ORDER BY e.next_visit`, [t, end]).map(r => ({ ...r, sent: sv.has(r.ref_id) }));
    const vaccines = db.all(`SELECT x.id ref_id, x.vaccine, x.due_date date, ${P} FROM vaccinations x JOIN patients p ON p.id=x.patient_id
      WHERE x.given_date IS NULL AND x.due_date <= ? ORDER BY x.due_date LIMIT 300`, [end]).map(r => ({ ...r, sent: sx.has(r.ref_id), overdue: r.date < t }));
    const labs = db.all(`SELECT r.id ref_id, r.lab_code, DATE(r.approved_at) date, ${P} FROM lab_requests r JOIN patients p ON p.id=r.patient_id
      WHERE r.status='approved' AND r.approved_at IS NOT NULL AND DATE(r.approved_at) >= DATE(?, '-7 days') ORDER BY r.approved_at DESC`, [t]).map(r => ({ ...r, sent: sl.has(r.ref_id) }));
    const lapsed = db.all(`SELECT e.id ref_id, e.next_visit date, d.name doctor, e.diagnosis, ${P} FROM encounters e JOIN patients p ON p.id=e.patient_id LEFT JOIN doctors d ON d.id=e.doctor_id
      WHERE e.next_visit < ? AND e.next_visit >= DATE(?, '-180 days') AND e.id = (SELECT MAX(e2.id) FROM encounters e2 WHERE e2.patient_id=e.patient_id)
      AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.patient_id=e.patient_id AND v.visit_date >= DATE(e.next_visit, '-3 days') AND v.status<>'cancelled') ORDER BY e.next_visit DESC`, [t, t]).map(r => ({ ...r, sent: sp.has(r.ref_id) }));
    return { reservations, nextVisits, vaccines, labs, lapsed };
  });
  route('POST', '/api/reminders/sent', ({ user, body }) => { need(user, 'reception', 'doctor'); db.insert('reminders_log', { kind: str(body.kind), ref_id: Number(body.ref_id) || null, patient_id: Number(body.patient_id) || null, channel: str(body.channel) || 'whatsapp', sent_by: user.id }); return true; });

  // ===================================================================== patient documents (files kept in the data folder)
  const docsDir = path.join(dataDir, 'docs');
  route('GET', '/api/patient-growth/:pid', ({ user, params }) => {
    need(user, 'reception', 'doctor');
    const p = db.get('SELECT id, code, full_name, sex, birth_date FROM patients WHERE id=?', [Number(params.pid)]); if (!p) fail('مریض پیدا نشد');
    p.points = db.all('SELECT date, weight, height, head_circ FROM encounters WHERE patient_id=? AND (weight IS NOT NULL OR height IS NOT NULL OR head_circ IS NOT NULL) ORDER BY date, id', [p.id]);
    return p;
  });
  route('GET', '/api/patient-docs/:pid', ({ user, params }) => { need(user, 'reception', 'doctor', 'lab'); return db.all('SELECT * FROM patient_docs WHERE patient_id=? ORDER BY id DESC', [Number(params.pid)]); });
  route('POST', '/api/patient-docs/upload', ({ user, body, req }) => {
    need(user, 'reception', 'doctor', 'lab');
    const pid = Number(body.patient_id); if (!db.get('SELECT id FROM patients WHERE id=?', [pid])) fail('مریض پیدا نشد');
    const m = String(body.data || '').match(/^data:([\w/+.-]+);base64,(.+)$/); if (!m) fail('فایل نامعتبر');
    const mime = m[1]; if (!/^(image\/(png|jpeg|jpg|gif|webp|bmp)|application\/pdf)$/.test(mime)) fail('فقط عکس یا PDF');
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 15 * 1024 * 1024) fail('فایل بزرگ‌تر از ۱۵ میگابایت است');
    fs.mkdirSync(docsDir, { recursive: true });
    const ext = mime === 'application/pdf' ? '.pdf' : '.' + mime.split('/')[1].replace('jpeg', 'jpg');
    const file = `${pid}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(docsDir, file), buf);
    const id = db.insert('patient_docs', { patient_id: pid, title: str(body.title) || str(body.name) || 'سند', kind: str(body.kind), file, mime, size: buf.length, note: str(body.note), created_by: user.id });
    audit(user, 'upload', 'patient_docs', id, file, req);
    return db.get('SELECT * FROM patient_docs WHERE id=?', [id]);
  });
  route('POST', '/api/patient-docs/del/:id', ({ user, params, req }) => {
    need(user, 'reception', 'doctor');
    const d = db.get('SELECT * FROM patient_docs WHERE id=?', [Number(params.id)]); if (!d) return false;
    db.run('DELETE FROM patient_docs WHERE id=?', [d.id]); try { fs.unlinkSync(path.join(docsDir, d.file)); } catch (_) { }
    audit(user, 'delete', 'patient_docs', d.id, d.file, req); return true;
  });
  function rawDoc(url, user, res) {
    if (!user || !['admin', 'reception', 'doctor', 'lab'].includes(user.role)) { res.writeHead(403); return res.end(); }
    const d = db.get('SELECT * FROM patient_docs WHERE id=?', [Number(url.pathname.split('/').pop())]);
    const f = d && path.join(docsDir, path.basename(d.file));
    if (!d || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': d.mime || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' });
    fs.createReadStream(f).pipe(res);
  }

  // ===================================================================== vaccinations (schedule from the settings, due dates from the birth date)
  const schedule = () => String(setting('vaccine_schedule', '') || '').split(/\r?\n/).map(l => l.split('|').map(x => x.trim())).filter(x => x[0]).map(([name, days]) => ({ name, days: n(days) }));
  route('GET', '/api/vaccinations/:pid', ({ user, params }) => {
    need(user, 'reception', 'doctor');
    const p = db.get('SELECT * FROM patients WHERE id=?', [Number(params.pid)]); if (!p) fail('مریض پیدا نشد');
    const have = db.all('SELECT * FROM vaccinations WHERE patient_id=?', [p.id]);
    const birth = p.birth_date;
    const due = (days) => { if (!isoOk(birth)) return null; const d = new Date(birth + 'T12:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
    const list = schedule().map(v => { const h = have.find(x => x.vaccine === v.name); return { vaccine: v.name, days: v.days, due_date: h?.due_date || due(v.days), ...(h || {}) }; });
    have.filter(h => !list.some(x => x.vaccine === h.vaccine)).forEach(h => list.push(h));
    return { birth_date: birth, list };
  });
  route('POST', '/api/vaccinations/save', ({ user, body }) => {
    need(user, 'reception', 'doctor');
    const pid = Number(body.patient_id); if (!db.get('SELECT id FROM patients WHERE id=?', [pid])) fail('مریض پیدا نشد');
    const vaccine = str(body.vaccine); if (!vaccine) fail('نام واکسین');
    const row = { due_date: isoOk(body.due_date) ? body.due_date : null, given_date: isoOk(body.given_date) ? body.given_date : null, batch: str(body.batch), note: str(body.note), given_by: body.given_date ? (str(body.given_by) || user.full_name || user.username) : null };
    const old = db.get('SELECT * FROM vaccinations WHERE patient_id=? AND vaccine=?', [pid, vaccine]);
    if (old) db.update('vaccinations', old.id, row); else db.insert('vaccinations', { patient_id: pid, vaccine, ...row, created_by: user.id });
    return true;
  });
  // keep the due dates of children in the table so the reminders list can find them
  route('POST', '/api/vaccinations/plan/:pid', ({ user, params }) => {
    need(user, 'reception', 'doctor');
    const p = db.get('SELECT * FROM patients WHERE id=?', [Number(params.pid)]); if (!p || !isoOk(p.birth_date)) fail('تاریخ تولد مریض معلوم نیست');
    db.transaction(() => { for (const v of schedule()) { const d = new Date(p.birth_date + 'T12:00:00'); d.setDate(d.getDate() + v.days); if (!db.get('SELECT id FROM vaccinations WHERE patient_id=? AND vaccine=?', [p.id, v.name])) db.insert('vaccinations', { patient_id: p.id, vaccine: v.name, due_date: d.toISOString().slice(0, 10), created_by: user.id }); } });
    return true;
  });

  // ===================================================================== doctor: favourite medicines, certificates
  route('GET', '/api/dr-favorites', ({ user }) => { need(user, 'doctor'); return db.all('SELECT * FROM dr_favorites WHERE doctor_id IS ? OR doctor_id IS NULL ORDER BY sort, name', [user.doctor_id || null]); });
  route('POST', '/api/dr-favorites/save', ({ user, body }) => {
    need(user, 'doctor');
    const f = ['medicine_id', 'name', 'form', 'strength', 'unit', 'dose', 'frequency', 'timing', 'route', 'duration', 'duration_unit', 'note'];
    const row = { doctor_id: user.doctor_id || null }; for (const k of f) row[k] = ['medicine_id', 'duration'].includes(k) ? (body[k] === '' || body[k] == null ? null : n(body[k])) : str(body[k]);
    if (!row.name) fail('نام دوا');
    const old = db.get('SELECT id FROM dr_favorites WHERE (doctor_id IS ?) AND name=? AND IFNULL(strength,\'\')=?', [row.doctor_id, row.name, row.strength || '']);
    if (old) db.update('dr_favorites', old.id, row); else db.insert('dr_favorites', row);
    return true;
  });
  route('POST', '/api/dr-favorites/del/:id', ({ user, params }) => { need(user, 'doctor'); db.run('DELETE FROM dr_favorites WHERE id=? AND (doctor_id IS ? OR ? = \'admin\')', [Number(params.id), user.doctor_id || null, user.role]); return true; });
  route('POST', '/api/certificates/save', ({ user, body }) => {
    need(user, 'doctor');
    const id = db.insert('certificates', { patient_id: Number(body.patient_id), encounter_id: Number(body.encounter_id) || null, doctor_id: user.doctor_id || Number(body.doctor_id) || null, kind: str(body.kind) || 'certificate', date: isoOk(body.date) ? body.date : today(), data: JSON.stringify(body.data || {}), created_by: user.id });
    return db.get('SELECT * FROM certificates WHERE id=?', [id]);
  });
  route('GET', '/api/certificates/:pid', ({ user, params }) => { need(user, 'doctor', 'reception'); return db.all('SELECT c.*, d.name doctor_name, d.title doctor_title FROM certificates c LEFT JOIN doctors d ON d.id=c.doctor_id WHERE c.patient_id=? ORDER BY c.id DESC', [Number(params.pid)]); });

  // ===================================================================== pharmacy & stock
  route('GET', '/api/stock/expiry', ({ user, query }) => {
    need(user, 'stock', 'pharmacy');
    const days = Math.max(1, Math.min(730, n(query.days, 90)));
    const d = new Date(); d.setDate(d.getDate() + days); const lim = d.toISOString().slice(0, 10);
    return db.all(`SELECT b.id batch_id, b.batch_no, b.expiry, b.qty_left, b.buy_price, (b.qty_left * b.buy_price) value, m.id, m.code, m.name, m.form, m.strength, m.unit, m.sell_price
      FROM batches b JOIN medicines m ON m.id=b.medicine_id WHERE b.qty_left > 0 AND b.expiry IS NOT NULL AND b.expiry <> '' AND SUBSTR(b.expiry || '-28', 1, 10) <= ? ORDER BY b.expiry`, [lim]);
  });
  route('GET', '/api/stock/dead', ({ user, query }) => {
    need(user, 'stock', 'pharmacy');
    const days = Math.max(7, Math.min(730, n(query.days, 90)));
    return db.all(`SELECT m.id, m.code, m.name, m.form, m.strength, m.unit, m.stock, m.stock_cost, m.next_expiry,
      (SELECT MAX(s.date) FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.medicine_id=m.id AND s.status<>'void') last_sale
      FROM v_medicine_stock m WHERE m.active=1 AND m.stock > 0 AND NOT EXISTS (SELECT 1 FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.medicine_id=m.id AND s.status<>'void' AND s.date >= DATE('now','localtime', ?))
      ORDER BY m.stock_cost DESC`, [`-${days} days`]);
  });
  // controlled medicines register: every movement with a running balance
  route('GET', '/api/stock/controlled', ({ user, query }) => {
    need(user, 'stock', 'pharmacy');
    const meds = db.all('SELECT * FROM v_medicine_stock WHERE controlled=1 ORDER BY name');
    const from = isoOk(query.from) ? query.from : '2000-01-01', to = isoOk(query.to) ? query.to : today();
    return meds.map(m => {
      const opening = n(db.scalar('SELECT IFNULL(SUM(qty),0) FROM stock_moves WHERE medicine_id=? AND date < ?', [m.id, from]));
      let bal = opening;
      const moves = db.all(`SELECT sm.*, s.sale_code, s.rx_code, s.patient_name, d.name doctor_name, u.full_name user_name FROM stock_moves sm
        LEFT JOIN sales s ON sm.ref_type='sale' AND s.id=sm.ref_id LEFT JOIN doctors d ON d.id=s.doctor_id LEFT JOIN users u ON u.id=sm.user_id
        WHERE sm.medicine_id=? AND sm.date BETWEEN ? AND ? ORDER BY sm.date, sm.id`, [m.id, from, to]).map(x => { bal = r2(bal + x.qty); return { ...x, balance: bal }; });
      return { medicine: m, opening: r2(opening), moves };
    });
  });
  // return medicines to the company: stock goes out of the batch, the factor balance goes down (credit)
  route('POST', '/api/supplier-return/:id', ({ user, params, body, req }) => {
    need(user, 'stock');
    const pid = Number(params.id);
    const p = db.get('SELECT * FROM v_purchases WHERE id=?', [pid]); if (!p) fail('فاکتور پیدا نشد');
    const items = (body.items || []).filter(x => n(x.qty) > 0); if (!items.length) fail('تعداد برگشتی را وارد کنید');
    const date = isoOk(body.date) ? body.date : today();
    const out = db.transaction(() => {
      let amount = 0; const list = [];
      for (const x of items) {
        const b = db.get('SELECT b.*, m.name FROM batches b JOIN medicines m ON m.id=b.medicine_id JOIN purchase_items i ON i.id=b.purchase_item_id WHERE b.id=? AND i.purchase_id=?', [Number(x.batch_id), pid]);
        if (!b) fail('بچ این فاکتور پیدا نشد'); const q = n(x.qty);
        if (q > b.qty_left + 0.0001) fail(`از «${b.name}» فقط ${b.qty_left} باقی مانده`);
        db.run('UPDATE batches SET qty_left = qty_left - ? WHERE id=?', [q, b.id]);
        db.insert('stock_moves', { date, medicine_id: b.medicine_id, batch_id: b.id, kind: 'supplier_return', qty: -q, unit_cost: b.buy_price, ref_type: 'purchase', ref_id: pid, note: str(body.note) || 'برگشت به کمپنی', user_id: user.id });
        amount += q * b.buy_price; list.push({ batch_id: b.id, medicine_id: b.medicine_id, name: b.name, qty: q, price: b.buy_price });
      }
      amount = r2(amount);
      const payId = db.insert('purchase_payments', { purchase_id: pid, date, amount, method: 'return', paid_by: user.full_name || user.username, note: 'برگشت دوا به کمپنی' + (body.note ? ' — ' + body.note : ''), created_by: user.id });
      ops.recomputePurchase(pid);
      const id = db.insert('supplier_returns', { purchase_id: pid, date, amount, items: JSON.stringify(list), payment_id: payId, note: str(body.note), created_by: user.id });
      return { id, amount };
    });
    audit(user, 'supplier_return', 'purchase', pid, JSON.stringify(out), req);
    return out;
  });
  route('GET', '/api/supplier-returns', ({ user, query }) => {
    need(user, 'stock');
    return db.all(`SELECT r.*, p.ref_no, p.factor_no, s.name supplier_name FROM supplier_returns r JOIN purchases p ON p.id=r.purchase_id LEFT JOIN suppliers s ON s.id=p.supplier_id
      ${query.purchase_id ? 'WHERE r.purchase_id=' + Number(query.purchase_id) : ''} ORDER BY r.id DESC LIMIT 500`);
  });
  // ABC (value of use in the last 12 months) × VED (vital / essential / desirable)
  route('GET', '/api/stock/abc', ({ user, query }) => {
    need(user, 'stock', 'pharmacy');
    const days = Math.max(30, Math.min(730, n(query.days, 365)));
    const rows = db.all(`SELECT m.id, m.code, m.name, m.form, m.strength, m.unit, m.ved, m.stock, m.stock_cost,
      IFNULL((SELECT SUM((si.qty - si.returned_qty)) FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.medicine_id=m.id AND s.status<>'void' AND s.date >= DATE('now','localtime', ?)),0) qty,
      IFNULL((SELECT SUM(si.cost * (si.qty - si.returned_qty) / CASE WHEN si.qty > 0 THEN si.qty ELSE 1 END) FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE si.medicine_id=m.id AND s.status<>'void' AND s.date >= DATE('now','localtime', ?)),0) value
      FROM v_medicine_stock m WHERE m.active=1 ORDER BY value DESC`, [`-${days} days`, `-${days} days`]);
    const total = rows.reduce((a, r) => a + r.value, 0) || 1; let cum = 0;
    rows.forEach(r => { cum += r.value; const pct = cum / total; r.cum_pct = r2(pct * 100); r.abc = r.value <= 0 ? 'C' : pct <= 0.7 + 1e-9 ? 'A' : pct <= 0.9 + 1e-9 ? 'B' : 'C'; r.value = r2(r.value); });
    return rows;
  });
  route('POST', '/api/stock/ved', ({ user, body }) => { need(user, 'stock'); db.run('UPDATE medicines SET ved=? WHERE id=?', [['V', 'E', 'D'].includes(body.ved) ? body.ved : null, Number(body.id)]); return true; });

  // physical stock count
  route('GET', '/api/stock-counts', ({ user }) => { need(user, 'stock'); return db.all(`SELECT c.*, (SELECT COUNT(*) FROM stock_count_items i WHERE i.count_id=c.id) items, (SELECT COUNT(*) FROM stock_count_items i WHERE i.count_id=c.id AND i.counted_qty IS NOT NULL) counted,
    (SELECT IFNULL(SUM((i.counted_qty - i.system_qty) * i.unit_cost),0) FROM stock_count_items i WHERE i.count_id=c.id AND i.counted_qty IS NOT NULL) diff_value FROM stock_counts c ORDER BY c.id DESC`); });
  route('POST', '/api/stock-counts/new', ({ user, body }) => {
    need(user, 'stock');
    return db.transaction(() => {
      const id = db.insert('stock_counts', { date: today(), title: str(body.title) || 'شمارش انبار', note: str(body.note), created_by: user.id });
      const w = ['active=1']; const P = [];
      if (body.category) { w.push('category=?'); P.push(body.category); }
      if (body.only_stock) w.push('stock > 0');
      for (const m of db.all(`SELECT id, stock, buy_price, stock_cost FROM v_medicine_stock WHERE ${w.join(' AND ')}`, P)) db.insert('stock_count_items', { count_id: id, medicine_id: m.id, system_qty: r2(m.stock), unit_cost: m.stock > 0 ? r2(m.stock_cost / m.stock) : n(m.buy_price) });
      return id;
    });
  });
  route('GET', '/api/stock-counts/:id', ({ user, params }) => {
    need(user, 'stock');
    const c = db.get('SELECT * FROM stock_counts WHERE id=?', [Number(params.id)]); if (!c) fail('شمارش پیدا نشد');
    c.items = db.all('SELECT i.*, m.code, m.name, m.form, m.strength, m.unit, m.location FROM stock_count_items i JOIN medicines m ON m.id=i.medicine_id WHERE i.count_id=? ORDER BY m.location, m.name', [c.id]);
    return c;
  });
  route('POST', '/api/stock-counts/:id/set', ({ user, params, body }) => {
    need(user, 'stock');
    const c = db.get('SELECT * FROM stock_counts WHERE id=?', [Number(params.id)]); if (!c || c.status !== 'open') fail('این شمارش بسته شده است');
    db.transaction(() => { for (const x of body.items || []) db.run('UPDATE stock_count_items SET counted_qty=? WHERE count_id=? AND medicine_id=?', [x.counted_qty === '' || x.counted_qty == null ? null : n(x.counted_qty), c.id, Number(x.medicine_id)]); });
    return true;
  });
  route('POST', '/api/stock-counts/:id/close', ({ user, params, req }) => {
    need(user, 'stock');
    const c = db.get('SELECT * FROM stock_counts WHERE id=?', [Number(params.id)]); if (!c || c.status !== 'open') fail('این شمارش بسته شده است');
    let adjusted = 0;
    // stock may have moved since the count was opened: adjust by (counted − system qty at opening) only
    for (const i of db.all('SELECT * FROM stock_count_items WHERE count_id=? AND counted_qty IS NOT NULL', [c.id])) {
      const diff = r2(i.counted_qty - i.system_qty); if (Math.abs(diff) < 0.0001) continue;
      try { ops.adjustStock({ medicine_id: i.medicine_id, qty: diff, kind: 'adjust', unit_cost: i.unit_cost, note: `شمارش فزیکی #${c.id}` }, user); adjusted++; } catch (e) { fail(`تطبیق «${i.medicine_id}» ممکن نشد: ${e.message}`); }
    }
    db.update('stock_counts', c.id, { status: 'closed', closed_at: nowStr() });
    audit(user, 'stock_count_close', 'stock_counts', c.id, `adjusted ${adjusted}`, req);
    return { adjusted };
  });

  // department requests (indent): lab / pharmacy / reception / doctor ask the stock; the stock issues
  route('GET', '/api/dept-requests', ({ user, query }) => {
    need(user, 'stock', 'lab', 'pharmacy', 'reception', 'doctor');
    const w = [], P = [];
    if (!['admin', 'stock'].includes(user.role)) { w.push('r.section=?'); P.push(user.role); }
    if (query.status) { w.push('r.status=?'); P.push(query.status); }
    const rows = db.all(`SELECT r.* FROM dept_requests r ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.id DESC LIMIT 300`, P);
    const ids = rows.map(r => r.id).join(',') || '0';
    const items = db.all(`SELECT i.*, m.code med_code, (SELECT IFNULL(SUM(qty_left),0) FROM batches b WHERE b.medicine_id=i.medicine_id) stock FROM dept_request_items i LEFT JOIN medicines m ON m.id=i.medicine_id WHERE i.request_id IN (${ids}) ORDER BY i.id`);
    rows.forEach(r => r.items = items.filter(i => i.request_id === r.id));
    return rows;
  });
  route('POST', '/api/dept-requests/save', ({ user, body, req }) => {
    need(user, 'stock', 'lab', 'pharmacy', 'reception', 'doctor');
    const items = (body.items || []).filter(i => str(i.name) && n(i.qty) > 0); if (!items.length) fail('حداقل یک قلم بنویسید');
    const section = ['admin', 'stock'].includes(user.role) ? (str(body.section) || 'clinic') : user.role;
    const id = db.transaction(() => {
      const id = db.insert('dept_requests', { section, date: today(), note: str(body.note), requested_by: user.full_name || user.username, created_by: user.id });
      db.update('dept_requests', id, { req_no: 'RQ-' + String(id).padStart(5, '0') });
      for (const i of items) db.insert('dept_request_items', { request_id: id, medicine_id: Number(i.medicine_id) || null, lab_item_id: Number(i.lab_item_id) || null, name: str(i.name), unit: str(i.unit), qty: n(i.qty) });
      return id;
    });
    emit('request:new', { id, section }, ['stock', 'admin']);
    audit(user, 'create', 'dept_requests', id, JSON.stringify(items).slice(0, 300), req);
    return id;
  });
  route('POST', '/api/dept-requests/issue/:id', ({ user, params, body, req }) => {
    need(user, 'stock');
    const r = db.get('SELECT * FROM dept_requests WHERE id=?', [Number(params.id)]); if (!r) fail('درخواست پیدا نشد');
    if (body.reject) { db.update('dept_requests', r.id, { status: 'rejected', reply: str(body.reply), issued_by: user.full_name || user.username, issued_at: nowStr() }); emit('request:update', { id: r.id, section: r.section }, [r.section, 'stock', 'admin']); return true; }
    db.transaction(() => {
      let all = true, any = false;
      for (const x of body.items || []) {
        const it = db.get('SELECT * FROM dept_request_items WHERE id=? AND request_id=?', [Number(x.id), r.id]); if (!it) continue;
        const q = n(x.qty_issued); if (q <= 0) { all = false; continue; }
        if (it.medicine_id) ops.adjustStock({ medicine_id: it.medicine_id, qty: -q, kind: 'adjust', note: `تحویل به ${r.section} (${r.req_no})` }, user);
        if (it.lab_item_id) ops.labItemMove({ item_id: it.lab_item_id, qty: q, kind: 'in', note: `از انبار (${r.req_no})` }, user);
        db.update('dept_request_items', it.id, { qty_issued: r2(it.qty_issued + q) });
        any = true; if (it.qty_issued + q < it.qty - 0.0001) all = false;
      }
      db.update('dept_requests', r.id, { status: all ? 'issued' : any ? 'partial' : r.status, reply: str(body.reply), issued_by: user.full_name || user.username, issued_at: nowStr() });
    });
    emit('request:update', { id: r.id, section: r.section }, [r.section, 'stock', 'admin']);
    audit(user, 'issue', 'dept_requests', r.id, JSON.stringify(body.items || []).slice(0, 300), req);
    return true;
  });

  // purchase orders
  route('GET', '/api/purchase-orders', ({ user }) => {
    need(user, 'stock');
    const rows = db.all('SELECT o.*, s.name supplier_name FROM purchase_orders o LEFT JOIN suppliers s ON s.id=o.supplier_id ORDER BY o.id DESC LIMIT 300');
    const ids = rows.map(r => r.id).join(',') || '0';
    const items = db.all(`SELECT i.*, m.code med_code, m.form, m.strength FROM purchase_order_items i LEFT JOIN medicines m ON m.id=i.medicine_id WHERE i.po_id IN (${ids}) ORDER BY i.id`);
    const recv = db.all(`SELECT p.po_id, pi.medicine_id, SUM(pi.qty + pi.bonus) q FROM purchase_items pi JOIN purchases p ON p.id=pi.purchase_id WHERE p.po_id IN (${ids}) GROUP BY p.po_id, pi.medicine_id`);
    rows.forEach(r => { r.items = items.filter(i => i.po_id === r.id).map(i => ({ ...i, received: (recv.find(x => x.po_id === r.id && x.medicine_id === i.medicine_id) || {}).q || 0 })); r.total = r2(r.items.reduce((a, i) => a + i.qty * i.price, 0)); r.factors = db.all('SELECT id, ref_no, factor_no, net FROM purchases WHERE po_id=?', [r.id]); });
    return rows;
  });
  route('POST', '/api/purchase-orders/save', ({ user, body, req }) => {
    need(user, 'stock');
    const items = (body.items || []).filter(i => str(i.name) && n(i.qty) > 0); if (!items.length) fail('حداقل یک دوا اضافه کنید');
    const row = { supplier_id: Number(body.supplier_id) || null, date: isoOk(body.date) ? body.date : today(), expected_date: isoOk(body.expected_date) ? body.expected_date : null, note: str(body.note), status: ['draft', 'sent', 'partial', 'received', 'cancelled'].includes(body.status) ? body.status : 'draft' };
    const id = db.transaction(() => {
      let id = Number(body.id) || null;
      if (id) { db.update('purchase_orders', id, row); db.run('DELETE FROM purchase_order_items WHERE po_id=?', [id]); }
      else { id = db.insert('purchase_orders', { ...row, created_by: user.id }); db.update('purchase_orders', id, { po_no: 'PO-' + String(id).padStart(5, '0') }); }
      for (const i of items) db.insert('purchase_order_items', { po_id: id, medicine_id: Number(i.medicine_id) || null, name: str(i.name), qty: n(i.qty), price: n(i.price) });
      return id;
    });
    audit(user, body.id ? 'update' : 'create', 'purchase_orders', id, '', req);
    return id;
  });
  route('POST', '/api/purchase-orders/status/:id', ({ user, params, body }) => { need(user, 'stock'); db.update('purchase_orders', Number(params.id), { status: body.status }); return true; });
  route('POST', '/api/purchase-orders/link', ({ user, body }) => { need(user, 'stock'); db.run('UPDATE purchases SET po_id=? WHERE id=?', [Number(body.po_id) || null, Number(body.purchase_id)]); return true; });

  // ===================================================================== laboratory: QC, critical calls, TAT, verification
  route('GET', '/api/lab/qc', ({ user, query }) => {
    need(user, 'lab');
    const mats = db.all('SELECT q.*, t.code, t.name test_name, t.unit test_unit FROM lab_qc_materials q JOIN lab_tests t ON t.id=q.test_id ORDER BY q.active DESC, t.code, q.level');
    const from = isoOk(query.from) ? query.from : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
    const res = db.all('SELECT * FROM lab_qc_results WHERE date >= ? ORDER BY date, id', [from]);
    mats.forEach(m => m.results = res.filter(r => r.material_id === m.id));
    return mats;
  });
  route('POST', '/api/lab/qc/material', ({ user, body }) => {
    need(user, 'lab');
    const row = { test_id: Number(body.test_id), name: str(body.name) || 'Control', level: str(body.level), lot_no: str(body.lot_no), expiry: str(body.expiry), mean: n(body.mean), sd: n(body.sd), unit: str(body.unit), active: body.active === undefined ? 1 : (body.active ? 1 : 0) };
    if (!row.test_id) fail('آزمایش را انتخاب کنید'); if (!(row.sd > 0)) fail('SD باید بیشتر از صفر باشد');
    if (body.id) db.update('lab_qc_materials', Number(body.id), row); else db.insert('lab_qc_materials', row);
    return true;
  });
  // Westgard rules on the last runs of one control material
  function westgard(mat, value) {
    const prev = db.all('SELECT value FROM lab_qc_results WHERE material_id=? ORDER BY date DESC, id DESC LIMIT 9', [mat.id]).map(r => (r.value - mat.mean) / mat.sd);
    const z = (value - mat.mean) / mat.sd, zs = [z, ...prev];
    if (Math.abs(z) > 3) return ['1-3s', 0];
    if (zs.length >= 2 && ((zs[0] > 2 && zs[1] > 2) || (zs[0] < -2 && zs[1] < -2))) return ['2-2s', 0];
    if (zs.length >= 2 && Math.abs(zs[0] - zs[1]) > 4 && Math.sign(zs[0]) !== Math.sign(zs[1])) return ['R-4s', 0];
    if (zs.length >= 4 && (zs.slice(0, 4).every(x => x > 1) || zs.slice(0, 4).every(x => x < -1))) return ['4-1s', 0];
    if (zs.length >= 10 && (zs.slice(0, 10).every(x => x > 0) || zs.slice(0, 10).every(x => x < 0))) return ['10x', 0];
    if (Math.abs(z) > 2) return ['1-2s', 1];
    return [null, 1];
  }
  route('POST', '/api/lab/qc/result', ({ user, body }) => {
    need(user, 'lab');
    const m = db.get('SELECT * FROM lab_qc_materials WHERE id=?', [Number(body.material_id)]); if (!m) fail('ماده کنترل پیدا نشد');
    const v = Number(body.value); if (!isFinite(v)) fail('مقدار را وارد کنید');
    const [rule, ok] = westgard(m, v);
    const id = db.insert('lab_qc_results', { material_id: m.id, date: isoOk(body.date) ? body.date : today(), run_at: nowStr(), value: v, rule, accepted: ok, action: str(body.action), user_id: user.id });
    return db.get('SELECT * FROM lab_qc_results WHERE id=?', [id]);
  });
  route('POST', '/api/lab/qc/result-action/:id', ({ user, params, body }) => { need(user, 'lab'); db.run('UPDATE lab_qc_results SET action=? WHERE id=?', [str(body.action), Number(params.id)]); return true; });
  route('POST', '/api/lab/qc/result-del/:id', ({ user, params }) => { need(user, 'lab'); db.run('DELETE FROM lab_qc_results WHERE id=?', [Number(params.id)]); return true; });
  route('POST', '/api/lab/critical-call', ({ user, body, req }) => {
    need(user, 'lab');
    const id = db.insert('lab_critical_calls', { request_id: Number(body.request_id), test_id: Number(body.test_id) || null, value: str(body.value), flag: str(body.flag), notified_to: str(body.notified_to), method: str(body.method), read_back: body.read_back ? 1 : 0, note: str(body.note), user_id: user.id });
    audit(user, 'critical_call', 'lab_requests', Number(body.request_id), `${body.value} → ${body.notified_to}`, req);
    return id;
  });
  route('GET', '/api/lab/critical-calls', ({ user, query }) => {
    need(user, 'lab', 'doctor');
    const from = isoOk(query.from) ? query.from : today(), to = isoOk(query.to) ? query.to : today();
    return db.all(`SELECT c.*, r.lab_code, p.full_name, t.code, t.name test_name, u.full_name user_name FROM lab_critical_calls c JOIN lab_requests r ON r.id=c.request_id JOIN patients p ON p.id=r.patient_id
      LEFT JOIN lab_tests t ON t.id=c.test_id LEFT JOIN users u ON u.id=c.user_id WHERE DATE(c.at) BETWEEN ? AND ? ORDER BY c.id DESC`, [from, to]);
  });
  route('GET', '/api/lab/tat', ({ user, query }) => {
    need(user, 'lab', 'reception');
    const from = isoOk(query.from) ? query.from : today(), to = isoOk(query.to) ? query.to : from;
    return db.all(`SELECT r.id, r.lab_code, r.date, r.status, r.urgent, r.answer_date, r.created_at, r.received_at, r.sampled_at, r.completed_at, r.approved_at, r.delivered_at, p.full_name,
      (SELECT GROUP_CONCAT(t.code, ' ') FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id WHERE i.request_id=r.id) tests,
      (SELECT MAX(IFNULL(t.tat_hours, 24)) FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id WHERE i.request_id=r.id) tat_hours
      FROM lab_requests r JOIN patients p ON p.id=r.patient_id WHERE r.date BETWEEN ? AND ? AND r.status NOT IN ('cancelled') ORDER BY r.id DESC`, [from, to]);
  });
  const verifyKey = (code) => crypto.createHmac('sha256', String(setting('server_id', 'acdb'))).update(String(code)).digest('hex').slice(0, 8).toUpperCase();
  route('GET', '/api/lab/verify-key/:code', ({ user, params }) => { need(user, 'lab', 'doctor', 'reception'); return verifyKey(decodeURIComponent(params.code)); });
  route('GET', '/api/verify', ({ user, query }) => {
    need(user, ...ROLES);
    const q = String(query.q || '').trim().toUpperCase().replace(/^ACDB[-:\s]*VERIFY[\s:]*/, '');
    const m = q.match(/([A-Z]+-\d+)[\s/|:-]*([0-9A-F]{8})?/); if (!m) fail('کد نامعتبر');
    const code = m[1], key = m[2] || null;
    const r = db.get('SELECT r.*, p.full_name, p.father_name, p.code patient_code FROM lab_requests r JOIN patients p ON p.id=r.patient_id WHERE r.lab_code=?', [code]);
    if (!r) return { found: false, code };
    return { found: true, code, key_ok: key ? key === verifyKey(code) : null, request: { id: r.id, lab_code: r.lab_code, date: r.date, status: r.status, full_name: r.full_name, father_name: r.father_name, patient_code: r.patient_code, approved_at: r.approved_at },
      tests: db.all('SELECT t.code, t.name, x.value, x.flag, x.unit FROM lab_results x JOIN lab_tests t ON t.id=x.test_id WHERE x.request_id=? ORDER BY t.code', [r.id]) };
  });

  // ===================================================================== comparison report (month vs previous month vs same month last year)
  route('POST', '/api/reports/compare', ({ user, body }) => {
    need(user, 'stock');
    if (user.no_finance) fail('دسترسی به گزارش مالی ندارید');
    return (body.ranges || []).filter(r => isoOk(r.from) && isoOk(r.to)).map(({ from, to, label }) => {
      const P = [from, to];
      const g = (sql) => n(db.scalar(sql, P));
      const visits = g("SELECT COUNT(*) FROM visits WHERE visit_date BETWEEN ? AND ? AND status NOT IN ('cancelled','reserved')");
      const patients = g("SELECT COUNT(DISTINCT patient_id) FROM visits WHERE visit_date BETWEEN ? AND ? AND status NOT IN ('cancelled','reserved')");
      const newPatients = g("SELECT COUNT(*) FROM patients WHERE DATE(created_at) BETWEEN ? AND ?");
      const days = ops.reportDays(from, to);
      const S = (k) => r2(days.reduce((a, d) => a + (d[k] || 0), 0));
      const fresh = n(db.scalar("SELECT COUNT(DISTINCT v.patient_id) FROM visits v JOIN patients p ON p.id=v.patient_id WHERE v.visit_date BETWEEN ? AND ? AND v.status NOT IN ('cancelled','reserved') AND DATE(p.created_at) BETWEEN ? AND ?", [from, to, from, to]));
      return { label, from, to, visits, patients, new_patients: newPatients, returning: Math.max(0, patients - fresh),
        rx: g('SELECT COUNT(*) FROM prescriptions WHERE date BETWEEN ? AND ?'), labs: g("SELECT COUNT(*) FROM lab_requests WHERE date BETWEEN ? AND ? AND status NOT IN ('requested','cancelled')"),
        reception: S('reception'), pharmacy: S('ph_net'), ph_profit: S('ph_profit'), lab: S('lab_total'), ipd: S('ipd'), expenses: S('expenses'), withdrawals: S('withdrawals'), purchases: S('purchases'),
        income: r2(S('reception') + S('ph_net') + S('lab_total') + S('ipd')) };
    });
  });

  return { rawDoc };
}

module.exports = { TABLES_EXTRA, registerExtra };
