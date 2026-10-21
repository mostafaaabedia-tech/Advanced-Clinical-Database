// Generic, permission-checked list / get / save / delete for simple tables.
// Each station role only sees and changes what it needs; admin can do everything.
'use strict';

const ALL = ['admin', 'stock', 'reception', 'doctor', 'pharmacy', 'lab'];

const RESOURCES = {
  patients: { table: 'patients', read: ALL, write: ['reception', 'doctor', 'lab', 'pharmacy'], del: [], search: ['code', 'full_name', 'father_name', 'phone', 'tazkira'], order: 'id DESC', custom: 'patient' },
  doctors: { table: 'doctors', view: 'v_doctors', read: ALL, write: ['reception'], del: [], search: ['name', 'title', 'specialty', 'work_type', 'department_name'], order: 'sort, id',
    cols: ['name', 'title', 'specialty', 'header_lines', 'name_en', 'phone', 'visit_fee', 'on_letterhead', 'letterhead_side', 'color', 'active', 'sort', 'notes', 'department_id', 'work_type', 'room'] },
  medical_departments: { table: 'medical_departments', read: ALL, write: ['reception'], del: [], search: ['name'], order: 'sort, id', cols: ['name', 'sort', 'active'] },
  doctor_schedules: { table: 'doctor_schedules', read: ALL, write: [], del: [], order: 'doctor_id, weekday' },
  sale_payments: { table: 'sale_payments', read: ['pharmacy', 'stock', 'reception'], write: [], del: [], order: 'id DESC', dateCol: 'DATE(created_at)' },
  patient_deposits: { table: 'patient_deposits', read: ['reception', 'stock'], write: [], del: [], order: 'id DESC', dateCol: 'DATE(created_at)' },
  cash_closes: { table: 'cash_closes', read: ['reception', 'stock'], write: [], del: [], order: 'id DESC', dateCol: 'date' },
  lab_items: { table: 'lab_items', read: ['lab', 'stock'], write: ['lab', 'stock'], del: [], search: ['name', 'supplier', 'notes'], order: 'name', cols: ['name', 'unit', 'reorder_level', 'cost', 'expiry', 'supplier', 'active', 'notes'] },
  lab_item_moves: { table: 'lab_item_moves', read: ['lab', 'stock'], write: [], del: [], order: 'id DESC', dateCol: 'date' },
  lab_test_items: { table: 'lab_test_items', read: ALL, write: [], del: [], order: 'test_id' },
  lab_reception_types: { table: 'lab_reception_types', read: ALL, write: ['lab', 'reception'], del: [], search: ['name', 'code', 'org_name'], order: 'sort, id', cols: ['name', 'code', 'price_basis', 'patient_pct', 'increase_pct', 'discount_pct', 'max_tests', 'required_fields', 'org_name', 'notes', 'active', 'sort'] },
  lab_referrers: { table: 'lab_referrers', read: ALL, write: ['lab', 'reception'], del: [], search: ['name', 'council_no', 'specialty', 'phone', 'clinic'], order: 'name', cols: ['name', 'council_no', 'specialty', 'phone', 'clinic', 'discount_pct', 'active'] },
  lab_kits: { table: 'lab_kits', read: ALL, write: [], del: [], order: 'test_id, id' },
  wards: { table: 'wards', read: ALL, write: ['reception'], del: [], order: 'sort, id', cols: ['name', 'daily_rate', 'sort', 'active'] },
  beds: { table: 'beds', read: ALL, write: ['reception'], del: [], order: 'sort, id', cols: ['ward_id', 'name', 'sort', 'active'] },
  admissions: { table: 'admissions', view: 'v_admissions', read: ['reception', 'doctor', 'stock'], write: [], del: [], search: ['adm_no', 'patient_code', 'full_name', 'father_name', 'doctor_name', 'diagnosis'], order: 'id DESC', dateCol: 'DATE(admitted_at)' },
  services: { table: 'services', read: ALL, write: ['reception'], del: [], search: ['code', 'name'], order: 'sort, id',
    cols: ['code', 'name', 'fee', 'needs_doctor', 'default_doctor_id', 'color', 'active', 'sort'] },
  visits: { table: 'visits', view: 'v_visits', read: ['reception', 'doctor', 'stock'], write: [], del: [], search: ['visit_no', 'patient_code', 'full_name', 'father_name', 'phone', 'service_name'], order: 'visit_date DESC, id DESC', dateCol: 'visit_date' },
  visit_payments: { table: 'visit_payments', read: ['reception', 'stock'], write: [], del: [], order: 'id DESC', dateCol: 'DATE(created_at)' },
  encounters: { table: 'encounters', read: ['doctor'], write: [], del: [], order: 'id DESC', dateCol: 'date' },
  prescriptions: { table: 'prescriptions', view: 'v_prescriptions', read: ['doctor', 'pharmacy', 'stock'], write: [], del: [], search: ['rx_code', 'patient_code', 'full_name', 'father_name', 'doctor_name'], order: 'id DESC', dateCol: 'date' },
  prescription_items: { table: 'prescription_items', read: ['doctor', 'pharmacy', 'stock'], write: [], del: [], order: 'sort, id' },
  rx_templates: { table: 'rx_templates', read: ['doctor'], write: ['doctor'], del: ['doctor'], search: ['name', 'diagnosis'], order: 'name', cols: ['doctor_id', 'name', 'diagnosis', 'items'], own: 'doctor_id' },
  lab_departments: { table: 'lab_departments', read: ALL, write: ['lab'], del: [], order: 'sort, id', cols: ['code', 'name', 'name_fa', 'sort'] },
  lab_tests: { table: 'lab_tests', read: ALL, write: [], del: [], search: ['code', 'name', 'name_fa', 'num_code'], order: 'sort, id' },
  lab_panel_items: { table: 'lab_panel_items', read: ALL, write: [], del: [], order: 'panel_id, sort' },
  lab_ranges: { table: 'lab_ranges', read: ALL, write: [], del: [], order: 'test_id, id' },
  lab_requests: { table: 'lab_requests', view: 'v_lab_requests', read: ['lab', 'doctor', 'stock', 'reception'], write: [], del: [], search: ['lab_code', 'patient_code', 'full_name', 'father_name', 'phone', 'tests', 'tazkira', 'doctor_name'], order: 'id DESC', dateCol: 'date' },
  medicines: { table: 'medicines', view: 'v_medicine_stock', read: ALL, write: ['stock'], del: [], search: ['code', 'name', 'generic', 'barcode', 'company'], order: 'name', custom: 'medicine' },
  batches: { table: 'batches', read: ['stock', 'pharmacy'], write: [], del: [], order: "(expiry IS NULL OR expiry=''), expiry, id" },
  stock_moves: { table: 'stock_moves', read: ['stock'], write: [], del: [], order: 'id DESC', dateCol: 'date' },
  suppliers: { table: 'suppliers', read: ['stock'], write: ['stock'], del: ['stock'], search: ['name', 'phone', 'contact'], order: 'name', cols: ['name', 'phone', 'address', 'contact', 'notes', 'active'] },
  purchases: { table: 'purchases', view: 'v_purchases', read: ['stock'], write: [], del: [], search: ['ref_no', 'factor_no', 'supplier_name', 'receiver', 'notes'], order: 'date DESC, id DESC', dateCol: 'date' },
  purchase_payments: { table: 'purchase_payments', read: ['stock'], write: [], del: [], order: 'date DESC, id DESC', dateCol: 'date' },
  sales: { table: 'sales', view: 'v_sales', read: ['pharmacy', 'stock', 'reception'], write: [], del: [], search: ['sale_code', 'rx_code', 'patient_name', 'patient_code'], order: 'id DESC', dateCol: 'date' },
  expenses: { table: 'expenses', view: 'v_expenses', read: ['stock'], write: ['stock'], del: ['stock'], search: ['item', 'category', 'by_whom', 'vendor', 'factor_no', 'note'], order: 'date DESC, id DESC', dateCol: 'date',
    cols: ['date', 'category', 'item', 'qty', 'unit_price', 'amount', 'paid', 'section', 'factor_no', 'vendor', 'by_whom', 'note'] },
  withdrawals: { table: 'withdrawals', read: ['stock', 'pharmacy', 'reception'], write: ['stock', 'pharmacy', 'reception'], del: ['stock'], search: ['by_whom', 'note'], order: 'date DESC, id DESC', dateCol: 'date',
    cols: ['date', 'section', 'kind', 'amount', 'by_whom', 'note'] },
  legacy_daily: { table: 'legacy_daily', key: 'date', read: ['stock'], write: ['stock'], del: ['stock'], order: 'date DESC', dateCol: 'date', cols: ['date', 'pharmacy_sales', 'lab_income', 'note'] },
  audit_log: { table: 'audit_log', read: [], write: [], del: [], search: ['username', 'action', 'entity', 'detail', 'station'], order: 'id DESC', dateCol: 'DATE(at)' }
};

const allowed = (list, user) => user && (user.role === 'admin' || (list || []).includes(user.role));

function makeResources(db, ops) {
  const colCache = {};
  const colsOf = (name) => colCache[name] || (colCache[name] = db.all(`PRAGMA table_info(${name})`).map(c => c.name));

  function list(name, q, user) {
    const R = RESOURCES[name]; if (!R) throw new ops.UserError('منبع نامعتبر');
    if (!allowed(R.read, user)) throw new ops.UserError('دسترسی ندارید');
    const src = R.view || R.table; const cols = colsOf(src);
    const where = []; const params = [];
    if (q.q && R.search) {
      const terms = String(q.q).trim().split(/\s+/).slice(0, 5);
      for (const t of terms) { where.push('(' + R.search.map(c => `CAST(${c} AS TEXT) LIKE ?`).join(' OR ') + ')'); R.search.forEach(() => params.push('%' + t + '%')); }
    }
    for (const [k, v] of Object.entries(q)) {
      const m = k.match(/^(eq|ne|gt|lt|ge|le|in|null|notnull)\.([a-z_0-9]+)$/); if (!m || !cols.includes(m[2])) continue;
      const op = { eq: '=', ne: '<>', gt: '>', lt: '<', ge: '>=', le: '<=' }[m[1]];
      if (op) { where.push(`${m[2]} ${op} ?`); params.push(/^-?\d+(\.\d+)?$/.test(String(v)) && String(v).length < 15 && !/^0\d/.test(String(v)) ? Number(v) : v); }
      else if (m[1] === 'in') { const arr = String(v).split(',').filter(Boolean); if (arr.length) { where.push(`${m[2]} IN (${arr.map(() => '?').join(',')})`); params.push(...arr); } }
      else if (m[1] === 'null') where.push(`(${m[2]} IS NULL OR ${m[2]} = '')`);
      else if (m[1] === 'notnull') where.push(`(${m[2]} IS NOT NULL AND ${m[2]} <> '')`);
    }
    if (R.dateCol && q.from) { where.push(`${R.dateCol} >= ?`); params.push(q.from); }
    if (R.dateCol && q.to) { where.push(`${R.dateCol} <= ?`); params.push(q.to); }
    if (R.own && user.role === 'doctor') { where.push(`(${R.own} = ? OR ${R.own} IS NULL)`); params.push(user.doctor_id || 0); }
    let order = R.order;
    if (q.order) { const m = String(q.order).match(/^([a-z_0-9]+)( desc)?$/i); if (m && cols.includes(m[1])) order = m[1] + (m[2] ? ' DESC' : ''); }
    const limit = Math.min(Number(q.limit) || 500, 20000), offset = Math.max(0, Number(q.offset) || 0);
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const rows = db.all(`SELECT * FROM ${src}${w} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params);
    if (q.count) return { rows, total: db.scalar(`SELECT COUNT(*) FROM ${src}${w}`, params) };
    return rows;
  }
  function get(name, id, user) {
    const R = RESOURCES[name]; if (!R) throw new ops.UserError('منبع نامعتبر');
    if (!allowed(R.read, user)) throw new ops.UserError('دسترسی ندارید');
    return db.get(`SELECT * FROM ${R.view || R.table} WHERE ${R.key || 'id'} = ?`, [id]);
  }
  function save(name, data, user) {
    const R = RESOURCES[name]; if (!R) throw new ops.UserError('منبع نامعتبر');
    if (!allowed(R.write, user)) throw new ops.UserError('دسترسی ندارید');
    if (R.custom === 'patient') return ops.savePatient(data, user);
    if (R.custom === 'medicine') return ops.saveMedicine(data, user);
    const key = R.key || 'id';
    const row = {};
    for (const c of R.cols) if (c in data) row[c] = data[c] === '' ? null : (typeof data[c] === 'boolean' ? (data[c] ? 1 : 0) : data[c]);
    if (R.own && user.role === 'doctor') row[R.own] = user.doctor_id || null;
    if (R.table === 'expenses' || R.table === 'withdrawals') {
      if (!row.date && !data[key]) row.date = ops.today();
      if (R.table === 'expenses') { if (!data.id && !('paid' in data)) row.paid = row.amount; if (!row.item && !data.id) throw new ops.UserError('نام جنس / مصرف الزامی است'); }
      if (R.table === 'withdrawals' && !(Number(row.amount) > 0) && !data.id) throw new ops.UserError('مبلغ را وارد کنید');
    }
    const existing = data[key] !== undefined && data[key] !== null && data[key] !== '' ? db.get(`SELECT * FROM ${R.table} WHERE ${key} = ?`, [data[key]]) : null;
    if (existing) {
      if (R.own && user.role === 'doctor' && existing[R.own] && existing[R.own] !== user.doctor_id) throw new ops.UserError('دسترسی ندارید');
      const keys = Object.keys(row).filter(k => k !== key);
      if (keys.length) db.run(`UPDATE ${R.table} SET ${keys.map(k => k + '=?').join(',')} WHERE ${key} = ?`, [...keys.map(k => row[k]), data[key]]);
      if (R.table !== 'audit_log') db.audit(user, 'update', R.table, key === 'id' ? data[key] : null, JSON.stringify(row).slice(0, 500));
      return data[key];
    }
    if (key !== 'id') row[key] = data[key];
    if (colsOf(R.table).includes('created_by') && user) row.created_by = user.id;
    const id = db.insert(R.table, row);
    return key === 'id' ? id : data[key];
  }
  function remove(name, id, user) {
    const R = RESOURCES[name]; if (!R) throw new ops.UserError('منبع نامعتبر');
    if (!allowed(R.del, user)) throw new ops.UserError('دسترسی ندارید');
    const key = R.key || 'id';
    const old = db.get(`SELECT * FROM ${R.table} WHERE ${key} = ?`, [id]);
    if (!old) return false;
    if (R.own && user.role === 'doctor' && old[R.own] && old[R.own] !== user.doctor_id) throw new ops.UserError('دسترسی ندارید');
    if (R.table === 'suppliers' && db.scalar('SELECT COUNT(*) FROM purchases WHERE supplier_id=?', [id])) throw new ops.UserError('این تامین کننده فاکتور دارد؛ حذف ممکن نیست');
    db.run(`DELETE FROM ${R.table} WHERE ${key} = ?`, [id]);
    db.audit(user, 'delete', R.table, key === 'id' ? id : null, JSON.stringify(old).slice(0, 800));
    return true;
  }
  return { list, get, save, remove, RESOURCES };
}

module.exports = { makeResources, RESOURCES, allowed, ALL };
