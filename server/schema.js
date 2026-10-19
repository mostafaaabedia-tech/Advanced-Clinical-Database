// Advanced Clinical Database — SQLite schema
// One database (on the Admin / server PC) shared by every station over the local network.
const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);

-- ======================= users & security =======================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT,
  role TEXT NOT NULL,                       -- admin | stock | reception | doctor | pharmacy | lab
  doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  phone TEXT,
  pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  must_change INTEGER NOT NULL DEFAULT 0,
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station TEXT, ip TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), last_seen TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  user_id INTEGER, username TEXT, station TEXT, ip TEXT,
  action TEXT NOT NULL, entity TEXT, entity_id INTEGER, detail TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit_log(at);

-- ======================= clinic setup =======================
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                       -- e.g. میرویس عابدی
  title TEXT,                               -- e.g. پوهنمل دوکتور
  specialty TEXT,                           -- short specialty line
  header_lines TEXT,                        -- lines printed under the name on the letterhead
  name_en TEXT,
  phone TEXT,
  visit_fee REAL NOT NULL DEFAULT 0,
  on_letterhead INTEGER NOT NULL DEFAULT 1,
  letterhead_side TEXT DEFAULT 'right',     -- right | left
  color TEXT DEFAULT '#0f7a3a',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- OPD, US, ECG ...
  name TEXT NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  needs_doctor INTEGER NOT NULL DEFAULT 1,
  default_doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  color TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

-- ======================= patients =======================
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                -- patient code (P-10001)
  full_name TEXT NOT NULL,
  father_name TEXT,
  sex TEXT NOT NULL DEFAULT 'M' CHECK (sex IN ('M','F')),
  birth_date TEXT,                          -- estimated from age when unknown
  phone TEXT,
  address TEXT,
  tazkira TEXT,
  blood_group TEXT,
  allergies TEXT,
  chronic_diseases TEXT,                    -- illness history
  past_history TEXT,                        -- previous illnesses / surgeries / admissions
  family_history TEXT,
  current_medications TEXT,
  notes TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_patients_name ON patients(full_name);
CREATE INDEX IF NOT EXISTS ix_patients_phone ON patients(phone);

-- reception: turns, reservations and fees
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  visit_no TEXT NOT NULL UNIQUE,            -- receipt code (V-000123)
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER REFERENCES doctors(id),
  service_id INTEGER REFERENCES services(id),
  service_name TEXT NOT NULL,
  visit_date TEXT NOT NULL,                 -- YYYY-MM-DD
  reserved_time TEXT,                       -- HH:MM for reservations
  queue_key TEXT NOT NULL,                  -- turn numbering group (d<doctor> / s<service>)
  turn_no INTEGER,
  status TEXT NOT NULL DEFAULT 'waiting',   -- reserved | waiting | in_visit | done | cancelled | no_show
  fee REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,         -- reception discount
  doctor_discount REAL NOT NULL DEFAULT 0,  -- discount granted by the doctor (refund at reception)
  doctor_discount_note TEXT,
  net REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  pay_method TEXT DEFAULT 'cash',
  age_text TEXT,
  weight REAL,
  note TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  checked_in_at TEXT, called_at TEXT, finished_at TEXT, cancelled_reason TEXT
);
CREATE INDEX IF NOT EXISTS ix_visits_date ON visits(visit_date);
CREATE INDEX IF NOT EXISTS ix_visits_patient ON visits(patient_id);
CREATE TABLE IF NOT EXISTS visit_payments (
  id INTEGER PRIMARY KEY, visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  amount REAL NOT NULL, method TEXT DEFAULT 'cash', note TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ======================= doctor =======================
CREATE TABLE IF NOT EXISTS encounters (
  id INTEGER PRIMARY KEY,
  visit_id INTEGER REFERENCES visits(id) ON DELETE SET NULL,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER REFERENCES doctors(id),
  date TEXT NOT NULL,
  bp_sys INTEGER, bp_dia INTEGER, pulse INTEGER, resp_rate INTEGER, temp REAL,
  weight REAL, height REAL, spo2 INTEGER, blood_sugar REAL, head_circ REAL,
  complaint TEXT, history TEXT, exam TEXT, diagnosis TEXT, impression TEXT,
  notes TEXT,                               -- doctor notes (not printed unless chosen)
  private_notes TEXT,                       -- never printed
  print_note TEXT,                          -- extra note printed on the prescription
  print_opts TEXT,                          -- JSON: which sections are printed
  next_visit TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_enc_patient ON encounters(patient_id);

CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY,
  rx_code TEXT NOT NULL UNIQUE,             -- pharmacy code (RX-00012)
  encounter_id INTEGER REFERENCES encounters(id) ON DELETE SET NULL,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER REFERENCES doctors(id),
  date TEXT NOT NULL,
  note TEXT,
  discount_pct REAL NOT NULL DEFAULT 0,     -- pharmacy discount granted by the doctor
  status TEXT NOT NULL DEFAULT 'new',       -- new | dispensed | partial | cancelled
  sent_at TEXT, dispensed_at TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_rx_patient ON prescriptions(patient_id);
CREATE TABLE IF NOT EXISTS prescription_items (
  id INTEGER PRIMARY KEY,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_id INTEGER REFERENCES medicines(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  form TEXT, strength TEXT, unit TEXT,
  dose TEXT,                                -- amount each time (1, ½, 5 ml …)
  frequency TEXT, timing TEXT, route TEXT,
  duration REAL, duration_unit TEXT,
  qty REAL,                                 -- total quantity to dispense
  note TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rx_templates (
  id INTEGER PRIMARY KEY, doctor_id INTEGER, name TEXT NOT NULL, diagnosis TEXT, items TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ======================= laboratory =======================
CREATE TABLE IF NOT EXISTS lab_departments (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, name_fa TEXT, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lab_tests (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  num_code INTEGER,
  name TEXT NOT NULL, name_fa TEXT,
  department_id INTEGER REFERENCES lab_departments(id),
  sample TEXT,
  is_panel INTEGER NOT NULL DEFAULT 0,
  orderable INTEGER NOT NULL DEFAULT 1,
  result_type TEXT NOT NULL DEFAULT 'numeric',  -- numeric | text | option | memo
  options TEXT, unit TEXT, decimals INTEGER,
  ref_low REAL, ref_high REAL, ref_text TEXT, critical_low REAL, critical_high REAL,
  formula TEXT,
  price REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0,
  tat_hours INTEGER, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lab_panel_items (
  panel_id INTEGER NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (panel_id, test_id)
);
CREATE TABLE IF NOT EXISTS lab_ranges (
  id INTEGER PRIMARY KEY, test_id INTEGER NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,
  sex TEXT NOT NULL DEFAULT 'A', age_min_days INTEGER, age_max_days INTEGER, low REAL, high REAL, text TEXT
);
CREATE TABLE IF NOT EXISTS lab_requests (
  id INTEGER PRIMARY KEY,
  lab_code TEXT NOT NULL UNIQUE,            -- laboratory code (LB-00045)
  encounter_id INTEGER REFERENCES encounters(id) ON DELETE SET NULL,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER REFERENCES doctors(id),
  date TEXT NOT NULL,
  note TEXT, urgent INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'doctor',     -- doctor | walkin
  status TEXT NOT NULL DEFAULT 'requested',  -- requested | received | completed | approved | delivered | cancelled
  discount_pct REAL NOT NULL DEFAULT 0,      -- granted by the doctor
  subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, net REAL NOT NULL DEFAULT 0, paid REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  pay_method TEXT DEFAULT 'cash',
  received_at TEXT, received_by INTEGER, completed_at TEXT, approved_at TEXT, approved_by INTEGER, delivered_at TEXT,
  report_note TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_labreq_patient ON lab_requests(patient_id);
CREATE INDEX IF NOT EXISTS ix_labreq_date ON lab_requests(date);
CREATE TABLE IF NOT EXISTS lab_request_items (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES lab_tests(id),
  name TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lab_results (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES lab_tests(id),
  value TEXT, flag TEXT, unit TEXT, ref TEXT, note TEXT,
  entered_by INTEGER, entered_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (request_id, test_id)
);
CREATE TABLE IF NOT EXISTS lab_payments (
  id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,
  amount REAL NOT NULL, method TEXT DEFAULT 'cash', note TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ======================= pharmacy & stock =======================
CREATE TABLE IF NOT EXISTS medicines (
  id INTEGER PRIMARY KEY,
  code INTEGER NOT NULL UNIQUE,             -- medicine code typed at the pharmacy (1001, 1002 …)
  barcode TEXT,
  name TEXT NOT NULL,                       -- brand / trade name
  generic TEXT,
  form TEXT, strength TEXT, unit TEXT,      -- unit of sale: عدد / بوتل / ورق …
  company TEXT, category TEXT, location TEXT,
  buy_price REAL NOT NULL DEFAULT 0,        -- last purchase price (per unit)
  markup_pct REAL NOT NULL DEFAULT 30,
  sell_price REAL NOT NULL DEFAULT 0,       -- current sale price (per unit)
  reorder_level REAL NOT NULL DEFAULT 5,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_med_name ON medicines(name);
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, phone TEXT, address TEXT, contact TEXT, notes TEXT,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
-- purchase factors (medicine only)
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY,
  ref_no TEXT NOT NULL UNIQUE,              -- internal number (F-00001)
  factor_no TEXT,                           -- the supplier's factor / invoice number
  supplier_id INTEGER REFERENCES suppliers(id),
  date TEXT NOT NULL,
  receiver TEXT,                            -- تحویل گیرنده
  subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, net REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  pay_type TEXT NOT NULL DEFAULT 'cash',    -- cash | installment | credit
  due_date TEXT,
  received INTEGER NOT NULL DEFAULT 1,      -- رسید شد
  has_items INTEGER NOT NULL DEFAULT 1,     -- 0 = imported/summary factor without item lines
  notes TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_purch_date ON purchases(date);
CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id),
  batch_no TEXT, expiry TEXT,
  qty REAL NOT NULL DEFAULT 0, bonus REAL NOT NULL DEFAULT 0,
  buy_price REAL NOT NULL DEFAULT 0, markup_pct REAL NOT NULL DEFAULT 0, sell_price REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS purchase_payments (
  id INTEGER PRIMARY KEY, purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  date TEXT NOT NULL, amount REAL NOT NULL, method TEXT DEFAULT 'cash', paid_by TEXT, note TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  purchase_item_id INTEGER REFERENCES purchase_items(id) ON DELETE SET NULL,
  batch_no TEXT, expiry TEXT,
  qty_in REAL NOT NULL DEFAULT 0, qty_left REAL NOT NULL DEFAULT 0,
  buy_price REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'purchase',  -- purchase | opening | adjust | return
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_batches_med ON batches(medicine_id);
CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now','localtime')), date TEXT NOT NULL,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  batch_id INTEGER, kind TEXT NOT NULL,      -- purchase | sale | return | adjust | expired | opening | purchase_edit
  qty REAL NOT NULL, unit_cost REAL, unit_price REAL,
  ref_type TEXT, ref_id INTEGER, note TEXT, user_id INTEGER
);
CREATE INDEX IF NOT EXISTS ix_moves_med ON stock_moves(medicine_id);
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY,
  sale_code TEXT NOT NULL UNIQUE,           -- PH-000321
  prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
  rx_code TEXT,
  patient_id INTEGER REFERENCES patients(id),
  patient_name TEXT, doctor_id INTEGER,
  date TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0, discount_pct REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0, paid REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0,
  returned REAL NOT NULL DEFAULT 0, returned_cost REAL NOT NULL DEFAULT 0,
  pay_method TEXT DEFAULT 'cash', status TEXT NOT NULL DEFAULT 'done', note TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_sales_date ON sales(date);
CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  medicine_id INTEGER REFERENCES medicines(id),
  rx_item_id INTEGER,
  name TEXT NOT NULL, qty REAL NOT NULL, price REAL NOT NULL, total REAL NOT NULL,
  cost REAL NOT NULL DEFAULT 0, returned_qty REAL NOT NULL DEFAULT 0,
  alloc TEXT                                -- JSON [[batch_id, qty, unit_cost], ...]
);

-- other factors / expenses (مصارف) — separate from medicine factors
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT,                            -- معاش / بل برق / قرطاسیه / ...
  item TEXT NOT NULL,                       -- جنس
  qty TEXT,                                 -- تعداد (free text: 2 کیلو، 1 ماه …)
  unit_price REAL,
  amount REAL NOT NULL DEFAULT 0,           -- مجموع
  paid REAL NOT NULL DEFAULT 0,
  section TEXT NOT NULL DEFAULT 'clinic',   -- clinic | pharmacy | lab | personal
  factor_no TEXT, vendor TEXT,
  by_whom TEXT,                             -- توسط
  note TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_exp_date ON expenses(date);
-- cash withdrawals (برداشت) from the daily income
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'pharmacy', -- pharmacy | lab | reception
  kind TEXT NOT NULL DEFAULT 'business',    -- business | personal
  amount REAL NOT NULL,
  by_whom TEXT, note TEXT,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_wd_date ON withdrawals(date);
-- daily totals imported from the old Excel book (before the system was used)
CREATE TABLE IF NOT EXISTS legacy_daily (
  date TEXT PRIMARY KEY,
  pharmacy_sales REAL NOT NULL DEFAULT 0, lab_income REAL NOT NULL DEFAULT 0, note TEXT
);

-- ======================= reporting views =======================
DROP VIEW IF EXISTS v_medicine_stock;
CREATE VIEW v_medicine_stock AS
  SELECT m.*,
    IFNULL((SELECT SUM(b.qty_left) FROM batches b WHERE b.medicine_id = m.id), 0) AS stock,
    IFNULL((SELECT SUM(b.qty_left * b.buy_price) FROM batches b WHERE b.medicine_id = m.id), 0) AS stock_cost,
    (SELECT MIN(b.expiry) FROM batches b WHERE b.medicine_id = m.id AND b.qty_left > 0 AND b.expiry IS NOT NULL AND b.expiry <> '') AS next_expiry
  FROM medicines m;

DROP VIEW IF EXISTS v_purchases;
CREATE VIEW v_purchases AS
  SELECT p.*, s.name AS supplier_name, (p.net - p.paid) AS balance,
    CASE WHEN p.net - p.paid <= 0.001 THEN 'paid' WHEN p.paid > 0 THEN 'partial' ELSE 'unpaid' END AS pay_status,
    (SELECT COUNT(*) FROM purchase_items i WHERE i.purchase_id = p.id) AS item_count
  FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id;

DROP VIEW IF EXISTS v_visits;
CREATE VIEW v_visits AS
  SELECT v.*, p.code AS patient_code, p.full_name, p.father_name, p.sex, p.birth_date, p.phone,
    d.name AS doctor_name, d.title AS doctor_title, (v.net - v.paid) AS balance
  FROM visits v JOIN patients p ON p.id = v.patient_id LEFT JOIN doctors d ON d.id = v.doctor_id;

DROP VIEW IF EXISTS v_prescriptions;
CREATE VIEW v_prescriptions AS
  SELECT r.*, p.code AS patient_code, p.full_name, p.father_name, p.sex, p.birth_date, p.phone,
    d.name AS doctor_name, d.title AS doctor_title,
    (SELECT COUNT(*) FROM prescription_items i WHERE i.prescription_id = r.id) AS item_count
  FROM prescriptions r JOIN patients p ON p.id = r.patient_id LEFT JOIN doctors d ON d.id = r.doctor_id;

DROP VIEW IF EXISTS v_lab_requests;
CREATE VIEW v_lab_requests AS
  SELECT r.*, p.code AS patient_code, p.full_name, p.father_name, p.sex, p.birth_date, p.phone,
    d.name AS doctor_name, (r.net - r.paid) AS balance,
    (SELECT GROUP_CONCAT(i.name, ' · ') FROM lab_request_items i WHERE i.request_id = r.id) AS tests
  FROM lab_requests r JOIN patients p ON p.id = r.patient_id LEFT JOIN doctors d ON d.id = r.doctor_id;

DROP VIEW IF EXISTS v_sales;
CREATE VIEW v_sales AS
  SELECT s.*, (s.net - s.returned) AS net_after_return, ROUND((s.net - s.returned) - (s.cost - s.returned_cost), 2) AS profit,
    p.code AS patient_code, d.name AS doctor_name, u.full_name AS seller,
    (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id) AS item_count
  FROM sales s LEFT JOIN patients p ON p.id = s.patient_id LEFT JOIN doctors d ON d.id = s.doctor_id LEFT JOIN users u ON u.id = s.created_by;

DROP VIEW IF EXISTS v_expenses;
CREATE VIEW v_expenses AS SELECT e.*, (e.amount - e.paid) AS balance FROM expenses e;
`;

module.exports = { SCHEMA, SCHEMA_VERSION };
