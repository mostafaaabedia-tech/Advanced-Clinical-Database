// SQLite database layer (sql.js / WebAssembly — no native build, works on Windows 7 32/64-bit).
// The database lives in memory on the server PC and is flushed to disk atomically after every change.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js/dist/sql-wasm.js');
const { TABLES, VIEWS, SCHEMA_VERSION } = require('./schema');
const seed = require('./seed');

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 60000, 32, 'sha256').toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  const h = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
}
function normalize(params) {
  if (params == null) return [];
  if (!Array.isArray(params)) {
    if (typeof params === 'object') {
      const o = {};
      for (const [k, v] of Object.entries(params)) o[k] = v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v;
      return o;
    }
    params = [params];
  }
  return params.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v !== null && typeof v === 'object') ? JSON.stringify(v) : v);
}

class ClinicDatabase {
  constructor(file, opts = {}) {
    this.file = file;
    this.wasmPath = opts.wasmPath;
    this.db = null;
    this.saveTimer = null;
    this.onSaved = opts.onSaved || null;
  }

  async open() {
    const SQL = await initSqlJs(this.wasmPath ? { locateFile: () => this.wasmPath } : undefined);
    this.SQL = SQL;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.db = fs.existsSync(this.file) ? new SQL.Database(fs.readFileSync(this.file)) : new SQL.Database();
    this.prepareDb();
    this.saveNow();
    return this;
  }
  prepareDb() {
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(TABLES);
    this.migrate();
    this.db.exec(VIEWS);
    seed.ensureDefaults(this);
  }

  // ---------- low level ----------
  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(normalize(params));
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally { stmt.free(); }
  }
  get(sql, params = []) { return this.all(sql, params)[0] || null; }
  scalar(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try { stmt.bind(normalize(params)); return stmt.step() ? stmt.get()[0] : null; } finally { stmt.free(); }
  }
  run(sql, params = []) {
    this.db.run(sql, normalize(params));
    const changes = this.db.getRowsModified();
    const lastId = this.scalar('SELECT last_insert_rowid()');
    this.markDirty();
    return { changes, lastId };
  }
  insert(table, obj) {
    const keys = Object.keys(obj);
    return this.run(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`, keys.map(k => obj[k])).lastId;
  }
  update(table, id, obj) {
    const keys = Object.keys(obj); if (!keys.length) return 0;
    return this.run(`UPDATE ${table} SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`, [...keys.map(k => obj[k]), id]).changes;
  }
  transaction(fn) {
    if (this.inTx) return fn();
    this.db.exec('BEGIN'); this.inTx = true;
    try { const r = fn(); this.db.exec('COMMIT'); this.inTx = false; this.markDirty(); return r; }
    catch (e) { this.inTx = false; try { this.db.exec('ROLLBACK'); } catch (_) { } throw e; }
  }
  columns(table) { return this.all(`PRAGMA table_info(${table})`).map(c => c.name); }
  addColumn(table, col, def) { if (!this.columns(table).includes(col)) this.db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); }

  // ---------- persistence ----------
  markDirty() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 300);
  }
  saveNow() {
    clearTimeout(this.saveTimer);
    if (!this.db) return;
    const data = this.db.export();
    this.db.exec('PRAGMA foreign_keys = ON;');      // export() resets pragmas in sql.js
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(data));
    fs.renameSync(tmp, this.file);
    this.onSaved && this.onSaved();
  }
  exportBytes() { const b = this.db.export(); this.db.exec('PRAGMA foreign_keys = ON;'); return Buffer.from(b); }
  close() { if (this.db) { this.saveNow(); this.db.close(); this.db = null; } }
  restoreFrom(buffer) {
    const test = new this.SQL.Database(buffer);
    let ok = false;
    try { ok = !!test.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('patients','visits','medicines')")[0]?.values?.length; } catch (_) { }
    test.close();
    if (!ok) throw new Error('این فایل پشتیبان دیتابیس کلینیک نیست');
    this.db.close();
    this.db = new this.SQL.Database(buffer);
    this.prepareDb();
    this.saveNow();
  }

  migrate() {
    const v = Number(this.scalarSafe("SELECT value FROM settings WHERE key='schema_version'") || 0);
    // columns added after the first release (safe to run on every start)
    const add = (t, c, d) => this.addColumn(t, c, d);
    add('doctors', 'department_id', 'INTEGER'); add('doctors', 'work_type', 'TEXT'); add('doctors', 'room', 'TEXT');
    add('patients', 'emergency_name', 'TEXT'); add('patients', 'emergency_phone', 'TEXT'); add('patients', 'insurance', 'TEXT'); add('patients', 'insurance_no', 'TEXT');
    add('visits', 'height', 'REAL');
    add('encounters', 'diagnosis_code', 'TEXT');
    add('visit_payments', 'station', 'TEXT'); add('lab_payments', 'station', 'TEXT');
    add('lab_requests', 'sampled_at', 'TEXT'); add('lab_requests', 'sampled_by', 'INTEGER');
    // v3 laboratory
    for (const [c, d] of [['tat_days', 'REAL'], ['weekdays', 'TEXT'], ['sample_amount', 'TEXT'], ['tube', 'TEXT'], ['tube_sep', 'TEXT'], ['loinc', 'TEXT'], ['machine_code', 'TEXT'], ['price_ins', 'REAL'],
      ['sendout_lab', 'TEXT'], ['sendout_cost', 'REAL'], ['default_answer', 'TEXT'], ['ready_answers', 'TEXT'], ['numeric_only', 'INTEGER'], ['critical_report', 'INTEGER'], ['sex_only', 'TEXT'],
      ['possible_low', 'REAL'], ['possible_high', 'REAL'], ['side_column', 'INTEGER'], ['description', 'TEXT'], ['active_kit_id', 'INTEGER'], ['report_name', 'TEXT']]) add('lab_tests', c, d);
    for (const [c, d] of [['kit_id', 'INTEGER'], ['alarm_low', 'REAL'], ['alarm_high', 'REAL'], ['crit_low', 'REAL'], ['crit_high', 'REAL'], ['min_valid', 'REAL'], ['max_valid', 'REAL']]) add('lab_ranges', c, d);
    for (const [c, d] of [['fasting', 'TEXT'], ['clinical_notes', 'TEXT'], ['pregnant', 'INTEGER'], ['sample_flag', 'TEXT'], ['answer_date', 'TEXT'], ['reception_type_id', 'INTEGER'], ['org_share', 'REAL'],
      ['referrer_id', 'INTEGER'], ['referrer', 'TEXT'], ['discount_reason', 'TEXT'], ['discount_by', 'TEXT'], ['print_count', 'INTEGER'], ['checked_by', 'INTEGER'], ['sendout', 'INTEGER']]) add('lab_requests', c, d);
    add('lab_request_items', 'org_share', 'REAL'); add('lab_request_items', 'sendout_lab', 'TEXT');
    add('lab_results', 'kit_id', 'INTEGER');
    if (v < SCHEMA_VERSION) {
      if (v >= 1 && v < 2) {
        // pharmacy payments were a single number before v2 → keep them as payment rows for the cash reports
        this.db.run("INSERT INTO sale_payments(sale_id, amount, method, note, station, created_by, created_at) SELECT id, paid, pay_method, 'پرداخت هنگام فروش', 'pharmacy', created_by, created_at FROM sales WHERE paid > 0 AND id NOT IN (SELECT sale_id FROM sale_payments)");
      }
      this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version',?)", [String(SCHEMA_VERSION)]);
    }
  }
  scalarSafe(sql) { try { return this.scalar(sql); } catch (_) { return null; } }

  // ---------- settings & counters ----------
  getSetting(key, def = null) { const r = this.get('SELECT value FROM settings WHERE key=?', [key]); return r ? r.value : def; }
  setSetting(key, value) { this.run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [key, value == null ? '' : String(value)]); }
  allSettings() { const o = {}; for (const r of this.all('SELECT key, value FROM settings')) o[r.key] = r.value; return o; }
  nextCounter(name) {
    this.db.run('INSERT OR IGNORE INTO counters(name, value) VALUES(?, 0)', [name]);
    this.db.run('UPDATE counters SET value = value + 1 WHERE name = ?', [name]);
    return this.scalar('SELECT value FROM counters WHERE name = ?', [name]);
  }
  // codes: patient P-10001, visit V-000001, prescription RX-00001, lab LB-00001, sale PH-000001, purchase F-00001
  nextCode(kind) {
    const cfg = { patient: ['patient_prefix', 'P-', 10000, 5], visit: ['visit_prefix', 'V-', 0, 6], rx: ['rx_prefix', 'RX-', 0, 5],
      lab: ['lab_prefix', 'LB-', 0, 5], sale: ['sale_prefix', 'PH-', 0, 6], purchase: ['purchase_prefix', 'F-', 0, 5] }[kind];
    const [key, defPrefix, base, pad] = cfg;
    const prefix = this.getSetting(key, defPrefix);
    const table = { patient: ['patients', 'code'], visit: ['visits', 'visit_no'], rx: ['prescriptions', 'rx_code'], lab: ['lab_requests', 'lab_code'], sale: ['sales', 'sale_code'], purchase: ['purchases', 'ref_no'] }[kind];
    for (let i = 0; i < 1000; i++) {
      const n = base + this.nextCounter(kind);
      const code = prefix + String(n).padStart(pad, '0');
      if (!this.scalar(`SELECT 1 FROM ${table[0]} WHERE ${table[1]} = ?`, [code])) return code;
    }
    throw new Error('Could not allocate code ' + kind);
  }

  // ---------- users ----------
  login(username, password) {
    const u = this.get('SELECT * FROM users WHERE username = ? AND active = 1', [String(username || '').trim()]);
    if (!u || !verifyPassword(password, u.pass_hash, u.pass_salt)) return null;
    this.run("UPDATE users SET last_login = datetime('now','localtime') WHERE id = ?", [u.id]);
    return this.publicUser(u);
  }
  publicUser(u) {
    if (!u) return null;
    const d = u.doctor_id ? this.get('SELECT id, name, title FROM doctors WHERE id=?', [u.doctor_id]) : null;
    return { id: u.id, username: u.username, full_name: u.full_name, role: u.role, doctor_id: u.doctor_id || null, doctor: d, must_change: u.must_change };
  }
  setPassword(userId, password) {
    const { hash, salt } = hashPassword(password);
    this.run('UPDATE users SET pass_hash=?, pass_salt=?, must_change=0 WHERE id=?', [hash, salt, userId]);
  }
  checkPassword(userId, password) {
    const u = this.get('SELECT pass_hash, pass_salt FROM users WHERE id=?', [userId]);
    return !!u && verifyPassword(password, u.pass_hash, u.pass_salt);
  }
  createUser({ username, full_name, role, password, doctor_id, phone }) {
    const { hash, salt } = hashPassword(password);
    return this.insert('users', { username: String(username).trim(), full_name, role, doctor_id: doctor_id || null, phone: phone || null, pass_hash: hash, pass_salt: salt, must_change: 1 });
  }
  audit(user, action, entity, entityId, detail, extra = {}) {
    this.db.run('INSERT INTO audit_log(user_id, username, station, ip, action, entity, entity_id, detail) VALUES(?,?,?,?,?,?,?,?)',
      normalize([user?.id || null, user?.username || null, extra.station || null, extra.ip || null, action, entity || null, entityId || null, detail == null ? null : String(detail).slice(0, 2000)]));
    this.markDirty();
  }
}

module.exports = { ClinicDatabase, hashPassword, verifyPassword, normalize };
