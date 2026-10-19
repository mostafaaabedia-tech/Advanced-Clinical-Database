// Fill a database with realistic demo data for training / screenshots.
// Usage: node scripts/demo-data.js <dataDir> [Database.xlsx]
// Users created: reception, dr.abedi, dr.khatibi, pharmacy, stock, lab (password 1111) — admin / 1234
'use strict';
const path = require('path');
const fs = require('fs');
const { ClinicDatabase } = require('../server/db');
const { makeOps } = require('../server/ops');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data'));
const xlsx = process.argv[3];
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

(async () => {
  const db = await new ClinicDatabase(path.join(dir, 'clinic.sqlite')).open();
  const ops = makeOps(db, null);
  const admin = db.get("SELECT * FROM users WHERE username='admin'");
  const A = db.publicUser(admin);
  const docs = db.all('SELECT * FROM doctors ORDER BY sort');
  const mk = (username, role, full_name, doctor_id) => { if (!db.get('SELECT id FROM users WHERE username=?', [username])) db.createUser({ username, role, full_name, password: '1111', doctor_id }); db.run('UPDATE users SET must_change=0 WHERE username=?', [username]); return db.publicUser(db.get('SELECT * FROM users WHERE username=?', [username])); };
  const U = { reception: mk('reception', 'reception', 'خانم صمدی'), dr1: mk('dr.abedi', 'doctor', 'داکتر میرویس عابدی', docs[0].id), dr2: mk('dr.khatibi', 'doctor', 'داکتر عادله خطیبی', docs[1].id),
    pharmacy: mk('pharmacy', 'pharmacy', 'مصطفی'), stock: mk('stock', 'stock', 'مصطفی مصباح عابدی'), lab: mk('lab', 'lab', 'خانم غلامی') };
  db.run("UPDATE users SET must_change=0 WHERE username='admin'");

  if (xlsx && fs.existsSync(xlsx)) { const { importWorkbook } = require('../server/import-xlsx'); console.log('excel', importWorkbook(db, ops, fs.readFileSync(xlsx), U.stock)); }

  // ---- stock: purchase factors with prices ----
  const meds = db.all('SELECT * FROM medicines ORDER BY id');
  const price = { 'Paracetamol': 2, 'Ibuprofen': 3, 'Amoxicillin': 6, 'Azithromycin': 18, 'Ciprofloxacin': 8, 'Metronidazole': 3, 'Cetirizine': 3, 'Omeprazole': 5, 'ORS': 10, 'Domperidone': 3,
    'Zinc': 45, 'Paracetamol Syrup': 40, 'Ibuprofen Syrup': 55, 'Amoxicillin Syrup': 70, 'Co-Amoxiclav': 22, 'Co-Amoxiclav Syrup': 160, 'Cefixime': 20, 'Cefixime Syrup': 150, 'Cotrimoxazole Syrup': 45, 'Metronidazole Syrup': 45,
    'Salbutamol Syrup': 35, 'Cetirizine Syrup': 45, 'Vitamin D3 Drops': 120, 'Iron Syrup': 80, 'Multivitamin Syrup': 90, 'Ferrous + Folic Acid': 3, 'Folic Acid': 1, 'Calcium + D3': 5, 'Mefenamic Acid': 4, 'Dydrogesterone': 25,
    'Methyldopa': 6, 'Clotrimazole Vaginal': 30, 'Normal Saline 0.9%': 60, 'Ringer Lactate': 70, 'Ceftriaxone': 55, 'Dexamethasone Inj': 15, 'Albendazole': 12, 'Hyoscine Butylbromide': 4, 'Drotaverine': 5, 'Montelukast': 9 };
  const sups = ['خواجه', 'ایدکم', 'عمده فروشی اعتماد', 'ادویه جیلانی', 'عمده فروشی جاوید صعود'];
  const first = new Date(); first.setDate(first.getDate() - 50);
  const stocked = meds.filter(m => price[m.name]);
  for (let f = 0; f < 4; f++) {
    const items = stocked.filter((_, i) => i % 4 === f).map(m => ({ medicine_id: m.id, qty: /Syrup|Drops|Infusion|Inj|Vaginal|Ceftriaxone/.test(m.name) ? 60 : 400, buy_price: price[m.name], markup_pct: pick([20, 25, 30, 30, 35]), batch_no: 'B' + (100 + f), expiry: pick(['2027-03', '2027-08', '2026-12', '2028-01']) }));
    const p = ops.savePurchase({ factor_no: String(1390 + f * 7), supplier_name: sups[f], date: iso(first), receiver: 'مصطفی', pay_type: f === 2 ? 'installment' : f === 3 ? 'credit' : 'cash', paid: f === 2 ? 3000 : f === 3 ? 0 : undefined, items, due_date: f > 1 ? iso(new Date(Date.now() + 10 * 864e5)) : null }, U.stock);
    if (f < 2) ops.addPurchasePayment(p.id, { amount: p.net - p.paid, date: iso(first), paid_by: 'مصطفی' }, U.stock);
  }
  // ---- daily activity ----
  const names = [['احمد', 'محمود', 'M'], ['فاطمه', 'علی', 'F'], ['زهرا', 'حسین', 'F'], ['محمد', 'رحیم', 'M'], ['مریم', 'کریم', 'F'], ['یوسف', 'غلام', 'M'], ['سارا', 'نبی', 'F'], ['عمر', 'قادر', 'M'], ['حلیمه', 'جمیل', 'F'], ['بلال', 'نادر', 'M'], ['آمنه', 'صابر', 'F'], ['حمید', 'سلیم', 'M'], ['نرگس', 'عزیز', 'F'], ['مصطفی', 'شفیق', 'M']];
  const dx1 = [['Acute gastroenteritis', ['ORS', 'Zinc', 'Paracetamol Syrup']], ['Upper respiratory tract infection (URTI)', ['Amoxicillin Syrup', 'Paracetamol Syrup', 'Cetirizine Syrup']], ['Pneumonia', ['Co-Amoxiclav Syrup', 'Salbutamol Syrup']], ['Iron deficiency anemia', ['Iron Syrup', 'Multivitamin Syrup']], ['Otitis media', ['Cefixime Syrup', 'Ibuprofen Syrup']]];
  const dx2 = [['Pregnancy — routine ANC', ['Ferrous + Folic Acid', 'Calcium + D3']], ['Vaginitis', ['Clotrimazole Vaginal', 'Metronidazole']], ['Dysmenorrhea', ['Mefenamic Acid', 'Hyoscine Butylbromide']], ['Threatened abortion', ['Dydrogesterone', 'Folic Acid']], ['Urinary tract infection (UTI)', ['Ciprofloxacin', 'Paracetamol']]];
  const byName = (n) => db.get('SELECT * FROM v_medicine_stock WHERE name=?', [n]);
  const tests = Object.fromEntries(db.all("SELECT id, code FROM lab_tests WHERE code IN ('CBC','ESR','CRP','GLUF','URINE','STOOL','HGB','BHCG','WIDAL','TSH')").map(t => [t.code, t.id]));
  const opd = db.get("SELECT * FROM services WHERE code='OPD'"), us = db.get("SELECT * FROM services WHERE code='US'");
  const pts = [];
  for (let back = 45; back >= 0; back--) {
    const day = new Date(); day.setDate(day.getDate() - back); const D = iso(day);
    const n = back === 0 ? 9 : 5 + Math.floor(rnd() * 7);
    const startIds = { visit: db.scalar('SELECT IFNULL(MAX(id),0) FROM visits'), vp: db.scalar('SELECT IFNULL(MAX(id),0) FROM visit_payments'), enc: db.scalar('SELECT IFNULL(MAX(id),0) FROM encounters'), rx: db.scalar('SELECT IFNULL(MAX(id),0) FROM prescriptions'), sale: db.scalar('SELECT IFNULL(MAX(id),0) FROM sales'), mv: db.scalar('SELECT IFNULL(MAX(id),0) FROM stock_moves'), lab: db.scalar('SELECT IFNULL(MAX(id),0) FROM lab_requests'), lp: db.scalar('SELECT IFNULL(MAX(id),0) FROM lab_payments') };
    for (let k = 0; k < n; k++) {
      const twoDoc = rnd() < .45; const doc = twoDoc ? docs[1] : docs[0];
      let patient;
      if (pts.length > 10 && rnd() < .3) patient = { id: pick(pts) };
      else { const [nm, fa, sx] = twoDoc ? pick(names.filter(x => x[2] === 'F')) : pick(names); patient = { full_name: nm + (rnd() < .5 ? '' : ' ' + pick(['جان', 'گل', ''])).trim(), father_name: fa, sex: sx, age_years: twoDoc ? 18 + Math.floor(rnd() * 25) : Math.floor(rnd() * 12), age_months: Math.floor(rnd() * 11), phone: '07' + Math.floor(10000000 + rnd() * 89999999), address: pick(['هرات، جاده امام بخاری', 'هرات، شهرنو', 'انجیل', 'گذره', 'هرات، جبرئیل']) }; }
      const svc = rnd() < .18 ? us : opd;
      const v = ops.createVisit({ patient, service_id: svc.id, doctor_id: doc.id, discount: rnd() < .1 ? 50 : 0 }, U.reception);
      if (!pts.includes(v.patient_id)) pts.push(v.patient_id);
      if (back === 0 && k >= 5) continue;                      // still waiting today
      const user = doc.id === docs[0].id ? U.dr1 : U.dr2;
      const [dx, list] = pick(doc.id === docs[0].id ? dx1 : dx2);
      const items = list.map(nm => { const m = byName(nm); const syr = /Syrup|Drops/.test(m.form + m.name); return { medicine_id: m.id, name: m.name, form: m.form, strength: m.strength, dose: syr ? '5 ml' : '1', frequency: pick(['روزانه دو بار', 'روزانه سه بار', 'هر ۸ ساعت']), timing: 'بعد از غذا', duration: pick([3, 5, 7]), duration_unit: 'روز', qty: syr ? 1 : pick([10, 14, 20]) }; });
      const labIds = rnd() < .35 ? (doc.id === docs[0].id ? [tests.CBC, pick([tests.STOOL, tests.URINE, tests.CRP])] : [tests.CBC, pick([tests.BHCG, tests.URINE, tests.TSH])]).filter(Boolean) : [];
      const enc = ops.saveEncounter({ visit_id: v.id, bp_sys: 100 + Math.floor(rnd() * 40), bp_dia: 60 + Math.floor(rnd() * 25), pulse: 70 + Math.floor(rnd() * 40), temp: 36.5 + Math.round(rnd() * 25) / 10, weight: twoDoc ? 50 + Math.floor(rnd() * 30) : 8 + Math.floor(rnd() * 25),
        complaint: pick(['تب و سرفه', 'اسهال', 'درد شکم', 'ضعف و بی‌اشتهایی', 'معاینه دوره‌ای']), diagnosis: dx, finish: 1, rx: { items, discount_pct: rnd() < .1 ? 10 : 0 }, lab: { test_ids: labIds }, visit_discount: rnd() < .05 ? 100 : 0 }, user);
      if (enc.rx && !(back === 0 && k >= 3)) { const rx = ops.getRx(enc.rx.rx_code); try { ops.createSale({ prescription_id: rx.id, discount_pct: rx.discount_pct, items: rx.items.filter(i => i.match).map(i => ({ medicine_id: i.match.id, qty: i.qty, rx_item_id: i.id })) }, U.pharmacy); } catch (e) { } }
      if (enc.lab && !(back === 0 && k >= 2)) {
        const r = ops.receiveLab(enc.lab.id, {}, U.lab);
        const results = r.tests.filter(t => t.result_type === 'numeric').map(t => { const lo = t.ref_low ?? 1, hi = t.ref_high ?? (lo * 2 || 10); const val = Math.round((lo + (hi - lo) * (rnd() * 1.3 - .1)) * 10) / 10; return { test_id: t.id, value: String(val), flag: val < lo ? 'L' : val > hi ? 'H' : null, unit: t.unit, ref: `${t.ref_low ?? ''} - ${t.ref_high ?? ''}` }; });
        r.tests.filter(t => t.result_type === 'option').forEach(t => results.push({ test_id: t.id, value: JSON.parse(t.options || '[]')[0]?.replace(/^\d+=/, '') || 'Negative', unit: t.unit, ref: t.ref_text }));
        ops.saveLabResults(r.id, { results, status: 'approved' }, U.lab);
      }
    }
    // other pharmacy walk-in sales
    for (let k = 0; k < 3; k++) { const m = byName(pick(['Paracetamol', 'ORS', 'Cetirizine', 'Omeprazole', 'Ibuprofen'])); try { ops.createSale({ patient_name: 'مشتری', items: [{ medicine_id: m.id, qty: pick([5, 10, 20]) }] }, U.pharmacy); } catch (e) { } }
    if (back % 6 === 0) db.insert('expenses', { date: D, category: pick(['قرطاسیه', 'نظافت', 'مواد سونوگرافی']), item: pick(['ورق A4', 'ژل سونوگرافی', 'دستمال کاغذی', 'قلم خودکار']), qty: '2', unit_price: 250, amount: 500, paid: 500, section: 'clinic', by_whom: 'مصطفی', created_by: U.stock.id });
    if (back % 15 === 3) db.insert('expenses', { date: D, category: 'معاش کارمندان', item: 'معاش خانم صمدی', qty: '1 ماه', unit_price: 6000, amount: 6000, paid: 6000, section: 'clinic', by_whom: 'مصطفی', created_by: U.stock.id });
    if (back % 2 === 0) db.insert('withdrawals', { date: D, section: 'pharmacy', kind: 'business', amount: 500 + Math.floor(rnd() * 15) * 100, by_whom: 'mostafa', created_by: U.stock.id });
    // back-date everything created for this day
    const t = `${D} 0${8 + Math.floor(rnd() * 2)}:${String(10 + Math.floor(rnd() * 49)).padStart(2, '0')}:00`;
    db.run('UPDATE visits SET visit_date=?, created_at=?, checked_in_at=?, finished_at=CASE WHEN finished_at IS NULL THEN NULL ELSE ? END WHERE id>?', [D, t, t, t, startIds.visit]);
    db.run('UPDATE visit_payments SET created_at=? WHERE id>?', [t, startIds.vp]);
    db.run('UPDATE encounters SET date=?, created_at=? WHERE id>?', [D, t, startIds.enc]);
    db.run('UPDATE prescriptions SET date=?, created_at=?, sent_at=?, dispensed_at=CASE WHEN dispensed_at IS NULL THEN NULL ELSE ? END WHERE id>?', [D, t, t, t, startIds.rx]);
    db.run('UPDATE sales SET date=?, created_at=? WHERE id>?', [D, t, startIds.sale]);
    db.run('UPDATE stock_moves SET date=?, at=? WHERE id>? AND kind<>\'purchase\'', [D, t, startIds.mv]);
    db.run("UPDATE lab_requests SET date=?, created_at=?, received_at=CASE WHEN received_at IS NULL THEN NULL ELSE ? END, approved_at=CASE WHEN approved_at IS NULL THEN NULL ELSE ? END, completed_at=CASE WHEN completed_at IS NULL THEN NULL ELSE ? END WHERE id>?", [D, t, t, t, t, startIds.lab]);
    db.run('UPDATE lab_payments SET created_at=? WHERE id>?', [t, startIds.lp]);
  }
  db.run("UPDATE stock_moves SET date=? WHERE kind='purchase'", [iso(first)]);
  db.saveNow(); db.close();
  console.log('demo data ready in', dir);
})().catch(e => { console.error(e); process.exit(1); });
