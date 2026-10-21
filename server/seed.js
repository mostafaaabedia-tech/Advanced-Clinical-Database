// Default data: settings, admin user, clinic doctors (from the clinic letterhead), services,
// a starter medicine list (from the Ahmadi prescription book) and the full laboratory catalog.
'use strict';
const crypto = require('crypto');
const labCatalog = require('./lab-catalog');

const LIST = (...a) => a.join('\n');

// prescription pick-lists in English (printed as: 1 × 4 / day · After meal · 5 days)
const RX_EN_LISTS = {
  rx_units: ['mg', 'g', 'mcg', 'ml', 'IU', '%', 'mg/5ml', 'mg/ml', 'mcg/ml', 'IU/ml', 'mg/g', 'units', 'mmol'],
  rx_frequencies: ['1 / day', '2 / day', '3 / day', '4 / day', 'every 4 h', 'every 6 h', 'every 8 h', 'every 12 h', 'every morning', 'every night', 'alternate days', 'every 3rd day', 'once a week', 'twice a week', 'when needed (PRN)', 'once (STAT)'],
  rx_timings: ['After meal', 'Before meal', 'With meal', 'Empty stomach', 'At bedtime', 'In the morning', '30 min before meal'],
  rx_routes: ['Oral', 'Sublingual', 'IM', 'IV', 'SC', 'Topical', 'Vaginal', 'Rectal', 'Inhalation', 'Eye', 'Ear', 'Nasal'],
  rx_duration_units: ['days', 'nights', 'weeks', 'months', 'alternate days', 'every 2 days', 'selected dates'],
  rx_doses: ['1', '½', '1½', '2', '3', '¼', '2.5 ml', '5 ml', '7.5 ml', '10 ml', '15 ml', '1 drop', '2 drops', '3 drops', '1 puff', '2 puffs', '1 sachet', '1 ampoule', '1 vial', 'apply thin layer']
};
// the Persian lists of earlier versions → replaced by the English ones (custom entries a user added are kept)
const RX_OLD_LISTS = {
  rx_units: ['mg', 'ml', 'g', 'mcg', 'IU', '%', 'mg/5ml'],
  rx_frequencies: ['روزانه یک بار', 'روزانه دو بار', 'روزانه سه بار', 'روزانه چهار بار', 'هر ۶ ساعت', 'هر ۸ ساعت', 'هر ۱۲ ساعت', 'صبح‌ها', 'شب‌ها', 'یک روز در میان', 'هفته یک بار', 'در صورت ضرورت', 'یک دفعه'],
  rx_timings: ['بعد از غذا', 'قبل از غذا', 'همراه غذا', 'ناشتا', 'قبل از خواب'],
  rx_routes: ['خوراکی', 'زیر زبانی', 'عضلی (IM)', 'وریدی (IV)', 'زیر جلدی', 'موضعی', 'مهبلی', 'مقعدی', 'استنشاقی', 'چشمی', 'گوش', 'بینی'],
  rx_duration_units: ['روز', 'هفته', 'ماه']
};
const DEFAULT_SETTINGS = {
  clinic_name: 'کلینیک OPD سلامت خانواده',
  clinic_name_en: 'Family Health OPD Clinic',
  clinic_logo_text: 'سلامت خانواده',
  clinic_logo: '',                                  // custom logo (data URL) — empty = built-in logo
  clinic_address: 'آدرس معاینه خانه: مقابل شفاخانه نور (چشم) هرات، جاده امام بخاری (رح) ۲۹ (جمنازیوم نور)',
  clinic_phones: LIST('0708 56 01 51', '0792 23 21 62', '0792 32 34 87'),
  currency: 'AFN',
  calendar: 'solar',
  patient_prefix: 'P-', visit_prefix: 'V-', rx_prefix: 'RX-', lab_prefix: 'LB-', sale_prefix: 'PH-', purchase_prefix: 'F-',
  turn_scope: 'doctor',                             // doctor | service | clinic
  default_markup: '30',
  allow_negative_stock: '0',
  expiry_warn_days: '90',
  station_lock: '1',                                // users may only log in at their own station (admin anywhere)
  rx_page: 'A5',
  rx_footer: 'در مراجعه بعدی نسخه خود را به همرای داشته باشید.',
  rx_watermark: '1',
  rx_header_mode: 'full',                           // full | preprinted (leave space for printed letterhead)
  rx_header_space_mm: '60',
  rx_default_print: JSON.stringify({ patient: 1, vitals: 0, complaint: 0, diagnosis: 0, history: 0, allergies: 0, notes: 0, impression: 0, labs: 1, next_visit: 1, print_note: 1, barcode: 1 }),
  receipt_width: '80',
  receipt_footer: 'صحت و سلامتی شما آرزوی ماست',
  lab_report_footer: 'نتایج باید توسط داکتر معالج تفسیر شود.',
  lab_signature: 'Laboratory Technologist',
  auto_backup: '1', backup_keep: '30',
  rx_forms: LIST('Tablet', 'Capsule', 'Syrup', 'Suspension', 'Drops', 'Injection', 'Infusion', 'Sachet', 'Cream', 'Ointment', 'Gel', 'Lotion',
    'Suppository', 'Vaginal Tablet', 'Inhaler', 'Nebulizer', 'Spray', 'Eye Drops', 'Ear Drops', 'Nasal Drops', 'Powder', 'Patch', 'Mouthwash', 'Elixir', 'Lozenge', 'Solution', 'Emulsion'),
  rx_units: LIST(...RX_EN_LISTS.rx_units),
  rx_frequencies: LIST(...RX_EN_LISTS.rx_frequencies),
  rx_timings: LIST(...RX_EN_LISTS.rx_timings),
  rx_routes: LIST(...RX_EN_LISTS.rx_routes),
  rx_duration_units: LIST(...RX_EN_LISTS.rx_duration_units),
  rx_doses: LIST(...RX_EN_LISTS.rx_doses),
  fa_typing: '1',
  expense_categories: LIST('معاش کارمندان', 'بل برق', 'انترنت / وایفای', 'کرایه', 'قرطاسیه', 'نظافت', 'مواد سونوگرافی', 'مواد مصرفی', 'ترانسپورت', 'ترمیمات', 'شخصی', 'برگشتی', 'سایر'),
  medicine_categories: LIST('انتی بیوتیک', 'مسکن و ضد التهاب', 'ویتامین و مکمل', 'گوارشی', 'تنفسی و حساسیت', 'قلبی و فشار خون', 'دیابت', 'زنانه و ولادی', 'اطفال', 'سیروم و پیچکاری', 'پوستی', 'چشم و گوش', 'عصبی', 'سایر'),
  medicine_units: LIST('عدد', 'تابلیت', 'کپسول', 'بوتل', 'ورق', 'قطی', 'امپول', 'ویال', 'تیوب', 'ساشه', 'بسته'),
  // v2
  cashier_mode: 'central',                          // central = all money (doctor fees, laboratory, pharmacy, beds) is received at reception | mixed = sections may also receive
  admission_prefix: 'IP-',
  doctor_work_types: LIST('متخصص', 'داکتر عمومی', 'سونولوژیست', 'جراح', 'قابله', 'نرس', 'تکنالوژست', 'مشاور'),
  lab_units: LIST('عدد', 'ml', 'تست', 'کیت', 'بسته', 'بوتل', 'قطی', 'جوره'),
  cdss_enabled: '1',                                // allergy / interaction / duplicate warnings for doctors
  dup_lab_days: '7',
  backup_extra_dir: '',                             // second backup folder (USB / network drive)
  // laboratory report print settings
  lab_font: 'Vazirmatn', lab_font_size: '12', lab_font_weight: 'normal', lab_line_height: '1.5', lab_row_padding: '3',
  lab_result_align: 'left', lab_grid: 'grid', lab_section_align: 'left', lab_patient_lang: 'fa', lab_show_print_time: '0', lab_show_signature: '1',
  lab_letter_spacing: '0', lab_arrows: '1', lab_color_names: '1', lab_row_shade: '1', lab_diff_side: '1', lab_flags_box: '1',
  lab_sign_left: 'Lab Technician', lab_sign_right: 'Lab in charge', lab_show_kit: '0', lab_show_prev: '0',
  // laboratory reception / answer rules (from the lab's old program)
  lab_answer_days: '1',                             // default answer date = today + N days (urgent → today)
  lab_warn_repeat_day: '1',                         // warn when the same test was registered for the patient the same day
  lab_discount_reason_required: '0',                // a discount needs a reason and the name of who gave it
  lab_warn_dup_tazkira: '1',                        // warn when another patient has the same national ID (tazkira)
  lab_prev_months: '6',                             // previous answers shown in result entry (months back)
  lab_hide_cancelled: '1', lab_lock_approved: '1',
  lab_receipt_answer_date: '1', lab_receipt_weekday: '1', lab_receipt_mobile: '1',
  lab_label_lab_name: '1', lab_label_urgent: '1', lab_label_en_digits: '1', lab_label_archive: '0', lab_label_datetime: '1',
  lab_discount_reasons: 'کارمند کلینیک\nفامیل کارمند\nمریض بی‌بضاعت\nسفارش داکتر\nتخفیف مدیر',
  // prescription print settings
  rx_font: 'Vazirmatn', rx_font_size: '13.5', rx_font_weight: 'normal', rx_line_height: '1.6'
};
const DEPARTMENTS = ['اطفال', 'نسائی و ولادی', 'داخله', 'سونوگرافی', 'عمومی'];

// clinic doctors as printed on the letterhead
const DOCTORS = [
  { name: 'میرویس عابدی', title: 'پوهنمل دوکتور', specialty: 'متخصص داخله اطفال و الترا سونولوژیست', letterhead_side: 'right', color: '#0f7a3a', visit_fee: 300, sort: 1,
    header_lines: LIST('ترینر متخصص داخله - اطفال، نوزادان و تغذیه اطفال', 'استاد اکمال تخصص در شفاخانه اطفال هرات', 'الترا سونولوژیست', 'تحصیلات عالی در کشور هندوستان', 'کانسولتانت داخله اطفال', 'با بیست سال تجربه کاری') },
  { name: 'عادله خطیبی', title: 'پوهنیار دوکتورس', specialty: 'متخصص و جراح نسائی ولادی', letterhead_side: 'left', color: '#0f7a3a', visit_fee: 300, sort: 2,
    header_lines: LIST('ترینر ملی تنظیم خانواده', 'متخصص و جراح نسائی ولادی', 'استاد فاکولته طب') }
];

const SERVICES = [
  ['OPD', 'معاینه OPD', 300, 1, '#1769aa'],
  ['US', 'سونوگرافی (الترا سوند)', 500, 1, '#6941c6'],
  ['ECG', 'ای سی جی (ECG)', 300, 0, '#087f5b'],
  ['INJ', 'تزریقات / سیروم', 100, 0, '#b7791f'],
  ['DRS', 'پانسمان', 100, 0, '#c0362c'],
  ['FUP', 'مراجعه مجدد (بدون فیس)', 0, 1, '#475569']
];

// starter medicine list (names as written on the boxes) — prices are set when stock arrives
const MEDICINES = [
  // from the Ahmadi prescription book
  ['Paracetamol', 'Paracetamol', 'Tablet', '500 mg'], ['Ibuprofen', 'Ibuprofen', 'Tablet', '400 mg'], ['Amoxicillin', 'Amoxicillin', 'Capsule', '500 mg'],
  ['Azithromycin', 'Azithromycin', 'Tablet', '250 mg'], ['Ciprofloxacin', 'Ciprofloxacin', 'Tablet', '500 mg'], ['Metronidazole', 'Metronidazole', 'Tablet', '400 mg'],
  ['Cetirizine', 'Cetirizine', 'Tablet', '10 mg'], ['Loratadine', 'Loratadine', 'Tablet', '10 mg'], ['Omeprazole', 'Omeprazole', 'Capsule', '20 mg'],
  ['Pantoprazole', 'Pantoprazole', 'Tablet', '40 mg'], ['ORS', 'Oral Rehydration Salts', 'Sachet', '20.5 g/1L'], ['Domperidone', 'Domperidone', 'Tablet', '10 mg'],
  ['Ondansetron', 'Ondansetron', 'Tablet', '4 mg'], ['Drotaverine', 'Drotaverine', 'Tablet', '80 mg'], ['Hyoscine Butylbromide', 'Hyoscine Butylbromide', 'Tablet', '10 mg'],
  ['Amlodipine', 'Amlodipine', 'Tablet', '5 mg'], ['Losartan', 'Losartan', 'Tablet', '50 mg'], ['Atorvastatin', 'Atorvastatin', 'Tablet', '10 mg'],
  ['Metformin', 'Metformin', 'Tablet', '500 mg'], ['Salbutamol Inhaler', 'Salbutamol', 'Inhaler', '100 mcg/dose'], ['Montelukast', 'Montelukast', 'Tablet', '10 mg'],
  ['Betamethasone', 'Betamethasone', 'Tablet', '0.5 mg'], ['Multivitamin', 'Multivitamin', 'Tablet', ''], ['Ranitidine', 'Ranitidine', 'Tablet', '150 mg'],
  ['Clarithromycin', 'Clarithromycin', 'Tablet', '500 mg'], ['Doxycycline', 'Doxycycline', 'Capsule', '100 mg'], ['Calcium + D3', 'Calcium + Vitamin D3', 'Tablet', '500 mg / 400 IU'],
  ['Folic Acid', 'Folic Acid', 'Tablet', '5 mg'], ['Ferrous Sulfate', 'Iron', 'Tablet', '325 mg'], ['Chlorpheniramine', 'Chlorpheniramine', 'Tablet', '4 mg'],
  ['Hydroxyzine', 'Hydroxyzine', 'Tablet', '25 mg'], ['Prednisolone', 'Prednisolone', 'Tablet', '5 mg'], ['Hydrocortisone Inj', 'Hydrocortisone', 'Injection', '100 mg'],
  ['Diazepam', 'Diazepam', 'Tablet', '5 mg'], ['Clonazepam', 'Clonazepam', 'Tablet', '0.5 mg'], ['Phenobarbital', 'Phenobarbital', 'Tablet', '30 mg'],
  ['Sodium Valproate', 'Sodium Valproate', 'Tablet', '200 mg'], ['Levetiracetam', 'Levetiracetam', 'Tablet', '500 mg'], ['Cefixime', 'Cefixime', 'Tablet', '200 mg'],
  ['Ceftriaxone', 'Ceftriaxone', 'Injection', '1 g'], ['Fluconazole', 'Fluconazole', 'Tablet', '150 mg'], ['Miconazole', 'Miconazole', 'Cream', '2%'],
  ['Nystatin', 'Nystatin', 'Suspension', '100,000 IU/ml'], ['Albendazole', 'Albendazole', 'Tablet', '400 mg'], ['Mebendazole', 'Mebendazole', 'Tablet', '100 mg'],
  ['Antacid (Al+Mg)', 'Aluminium + Magnesium Hydroxide', 'Syrup', '10 ml'], ['Loperamide', 'Loperamide', 'Tablet', '2 mg'], ['Bisacodyl', 'Bisacodyl', 'Tablet', '5 mg'],
  ['Senna', 'Senna', 'Tablet', '15 mg'], ['Zetro', 'Azithromycin', 'Syrup', '200 mg/5ml'], ['Furazolidone', 'Furazolidone', 'Syrup', ''], ['Zinc', 'Zinc Sulfate', 'Syrup', '20 mg/5ml'],
  // common paediatric & gynaecology items
  ['Paracetamol Syrup', 'Paracetamol', 'Syrup', '120 mg/5ml'], ['Ibuprofen Syrup', 'Ibuprofen', 'Suspension', '100 mg/5ml'], ['Amoxicillin Syrup', 'Amoxicillin', 'Suspension', '250 mg/5ml'],
  ['Co-Amoxiclav', 'Amoxicillin + Clavulanic acid', 'Tablet', '625 mg'], ['Co-Amoxiclav Syrup', 'Amoxicillin + Clavulanic acid', 'Suspension', '228 mg/5ml'],
  ['Cefixime Syrup', 'Cefixime', 'Suspension', '100 mg/5ml'], ['Cotrimoxazole Syrup', 'Sulfamethoxazole + Trimethoprim', 'Suspension', '240 mg/5ml'],
  ['Metronidazole Syrup', 'Metronidazole', 'Suspension', '200 mg/5ml'], ['Salbutamol Syrup', 'Salbutamol', 'Syrup', '2 mg/5ml'], ['Cetirizine Syrup', 'Cetirizine', 'Syrup', '5 mg/5ml'],
  ['Domperidone Syrup', 'Domperidone', 'Suspension', '5 mg/5ml'], ['Ondansetron Syrup', 'Ondansetron', 'Syrup', '4 mg/5ml'], ['Iron Syrup', 'Ferrous', 'Syrup', ''],
  ['Vitamin D3 Drops', 'Cholecalciferol', 'Drops', '400 IU'], ['Multivitamin Syrup', 'Multivitamin', 'Syrup', ''], ['Normal Saline Nasal Drops', 'Sodium Chloride', 'Nasal Drops', '0.9%'],
  ['Dexamethasone Inj', 'Dexamethasone', 'Injection', '4 mg'], ['Gentamicin Inj', 'Gentamicin', 'Injection', '80 mg'], ['Diclofenac', 'Diclofenac', 'Tablet', '50 mg'],
  ['Diclofenac Inj', 'Diclofenac', 'Injection', '75 mg'], ['Mefenamic Acid', 'Mefenamic Acid', 'Capsule', '250 mg'], ['Tranexamic Acid', 'Tranexamic Acid', 'Tablet', '500 mg'],
  ['Dydrogesterone', 'Dydrogesterone', 'Tablet', '10 mg'], ['Methyldopa', 'Methyldopa', 'Tablet', '250 mg'], ['Ferrous + Folic Acid', 'Ferrous + Folic Acid', 'Tablet', ''],
  ['Clotrimazole Vaginal', 'Clotrimazole', 'Vaginal Tablet', '500 mg'], ['Metronidazole Vaginal', 'Metronidazole', 'Vaginal Tablet', '500 mg'],
  ['Normal Saline 0.9%', 'Sodium Chloride', 'Infusion', '500 ml'], ['Ringer Lactate', 'Ringer Lactate', 'Infusion', '500 ml'], ['Dextrose 5%', 'Dextrose', 'Infusion', '500 ml'],
  ['Cefuroxime', 'Cefuroxime', 'Tablet', '500 mg'], ['Esomeprazole', 'Esomeprazole', 'Capsule', '40 mg'], ['Famotidine', 'Famotidine', 'Tablet', '20 mg']
];

function rand(n) { return crypto.randomBytes(n).toString('hex'); }

function ensureDefaults(db) {
  db.transaction(() => {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) db.db.run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', [k, v]);
    if (!db.scalar('SELECT value FROM settings WHERE key=?', ['server_id'])) db.db.run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', ['server_id', rand(6)]);

    if (!db.scalar('SELECT COUNT(*) FROM doctors')) {
      for (const d of DOCTORS) db.insert('doctors', d);
    }
    if (!db.scalar('SELECT COUNT(*) FROM medical_departments')) {
      DEPARTMENTS.forEach((name, i) => db.insert('medical_departments', { name, sort: i + 1 }));
      const dep = (n) => db.scalar('SELECT id FROM medical_departments WHERE name=?', [n]);
      for (const d of db.all('SELECT * FROM doctors WHERE department_id IS NULL')) {
        const t = `${d.specialty || ''} ${d.header_lines || ''}`;
        const id = /نسائی|ولادی/.test(t) ? dep('نسائی و ولادی') : /اطفال/.test(t) ? dep('اطفال') : /داخله/.test(t) ? dep('داخله') : null;
        db.update('doctors', d.id, { department_id: id, work_type: d.work_type || 'متخصص' });
      }
    }
    if (!db.scalar('SELECT COUNT(*) FROM wards')) {
      const w = db.insert('wards', { name: 'اطاق بستر', daily_rate: 1000, sort: 1 });
      for (let i = 1; i <= 4; i++) db.insert('beds', { ward_id: w, name: 'تخت ' + i, sort: i });
    }
    if (!db.scalar('SELECT COUNT(*) FROM services')) {
      SERVICES.forEach(([code, name, fee, needs, color], i) => db.insert('services', { code, name, fee, needs_doctor: needs, color, sort: i + 1 }));
    }
    if (!db.scalar('SELECT COUNT(*) FROM users')) {
      // first run: one administrator (admin / 1234 → must change)
      const { hashPassword } = require('./db');
      const { hash, salt } = hashPassword('1234');
      db.insert('users', { username: 'admin', full_name: 'مدیر سیستم', role: 'admin', pass_hash: hash, pass_salt: salt, must_change: 1 });
    }
    if (!db.scalar('SELECT COUNT(*) FROM medicines')) {
      const markup = Number(db.getSetting('default_markup', '30')) || 30;
      MEDICINES.forEach(([name, generic, form, strength], i) =>
        db.insert('medicines', { code: 1001 + i, name, generic, form, strength, unit: unitForForm(form), markup_pct: markup, reorder_level: 5 }));
    }
    if (!db.scalar('SELECT COUNT(*) FROM lab_tests')) seedLabCatalog(db);
    if (!db.scalar('SELECT COUNT(*) FROM lab_reception_types')) {
      db.insert('lab_reception_types', { name: 'عادی (آزاد)', code: 'FREE', price_basis: 'free', patient_pct: 100, sort: 1 });
      db.insert('lab_reception_types', { name: 'بیمه (۷۰٪ سهم مؤسسه)', code: 'INS', price_basis: 'insurance', patient_pct: 30, org_name: 'بیمه', required_fields: JSON.stringify(['tazkira', 'phone']), sort: 2, active: 0 });
      db.insert('lab_reception_types', { name: 'کارمند کلینیک', code: 'STAFF', price_basis: 'free', patient_pct: 100, discount_pct: 50, sort: 3 });
    }
    // prescription lists in English (v1.3)
    if (db.getSetting('rx_lists_en', '0') !== '1') {
      for (const [k, list] of Object.entries(RX_EN_LISTS)) {
        const cur = String(db.getSetting(k, '') || '').split('\n').map(x => x.trim()).filter(Boolean);
        const custom = cur.filter(x => !(RX_OLD_LISTS[k] || []).includes(x) && !list.includes(x));
        db.db.run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [k, [...list, ...custom].join('\n')]);
      }
      db.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('rx_lists_en','1')");
    }
    // differential counts print in the side column of the CBC (like the lab's previous report)
    if (db.getSetting('lab_side_seeded', '0') !== '1') {
      db.db.run("UPDATE lab_tests SET side_column=1 WHERE side_column IS NULL AND code IN ('NEUT%','LYMPH%','MONO%','EOS%','BASO%','BAND%')");
      db.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('lab_side_seeded','1')");
    }
  });
}

function unitForForm(form) {
  return ({ Tablet: 'تابلیت', Capsule: 'کپسول', Syrup: 'بوتل', Suspension: 'بوتل', Drops: 'بوتل', 'Nasal Drops': 'بوتل', Injection: 'امپول', Infusion: 'بوتل',
    Sachet: 'ساشه', Cream: 'تیوب', Ointment: 'تیوب', Gel: 'تیوب', Inhaler: 'عدد', 'Vaginal Tablet': 'تابلیت' })[form] || 'عدد';
}

function seedLabCatalog(db) {
  const c = labCatalog;
  c.departments.forEach(([code, name, fa], i) => db.db.run('INSERT OR IGNORE INTO lab_departments(code,name,name_fa,sort) VALUES(?,?,?,?)', [code, name, fa, i + 1]));
  const dep = {}; db.all('SELECT id, code FROM lab_departments').forEach(r => dep[r.code] = r.id);
  const sampleName = {}; c.sampleTypes.forEach(([code, name]) => sampleName[code] = name);
  let sort = 0;
  for (const x of c.tests) {
    sort += 10;
    const id = db.insert('lab_tests', { code: x.code, name: x.name, name_fa: x.name_fa, department_id: dep[x.dept], sample: sampleName[x.sample] || x.sample,
      is_panel: 0, orderable: x.orderable, result_type: x.result_type, options: x.options, unit: x.unit, decimals: x.decimals,
      ref_low: x.low, ref_high: x.high, ref_text: x.ref_text, critical_low: x.critical_low, critical_high: x.critical_high, formula: x.formula,
      price: x.price, cost: x.cost, tat_hours: x.tat_hours, sort });
    for (const r of x.ranges) db.insert('lab_ranges', { test_id: id, sex: r.sex, age_min_days: r.age_min_days, age_max_days: r.age_max_days, low: r.low, high: r.high, text: r.text });
  }
  for (const x of c.panels) {
    sort += 10;
    db.insert('lab_tests', { code: x.code, name: x.name, name_fa: x.name_fa, department_id: dep[x.dept], sample: sampleName[x.sample] || x.sample,
      is_panel: 1, orderable: 1, result_type: 'text', price: x.price, tat_hours: x.tat_hours, sort });
  }
  const ids = {}; db.all('SELECT id, code FROM lab_tests').forEach(r => ids[r.code.toUpperCase()] = r.id);
  for (const x of c.panels) x.items.forEach((code, i) => {
    const tid = ids[code.toUpperCase()];
    if (tid) db.db.run('INSERT OR IGNORE INTO lab_panel_items(panel_id,test_id,sort) VALUES(?,?,?)', [ids[x.code.toUpperCase()], tid, i + 1]);
  });
  // numeric codes per department (Hematology 401…, Coagulation 501…) — panels first
  const deps = db.all('SELECT id FROM lab_departments ORDER BY sort, id');
  deps.forEach((d, i) => {
    let n = 400 + i * 100;
    for (const r of db.all('SELECT id FROM lab_tests WHERE department_id=? ORDER BY is_panel DESC, orderable DESC, sort, id', [d.id])) db.db.run('UPDATE lab_tests SET num_code=? WHERE id=?', [++n, r.id]);
  });
}

module.exports = { ensureDefaults, DEFAULT_SETTINGS, unitForForm };
