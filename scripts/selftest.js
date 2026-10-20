// End-to-end API test: reception → doctor → pharmacy / laboratory → stock reports.
// Usage: node scripts/selftest.js [path/to/Database.xlsx]
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { createServer } = require('../server');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acdb-test-'));
let base, srv;
async function call(token, method, url, body) {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.error); e.status = r.status; throw e; }
  return j.data;
}
const login = async (u, p, station) => (await call(null, 'POST', '/api/login', { username: u, password: p, station })).token;
const ok = (m) => console.log('  ✓', m);

(async () => {
  srv = await createServer({ dataDir: dir, port: 0 + 8790, discovery: false, log: () => { } });
  base = `http://127.0.0.1:${srv.port}`;
  console.log('server', base, dir);
  const A = await login('admin', '1234', 'admin');
  const boot = await call(A, 'GET', '/api/bootstrap');
  assert.equal(boot.doctors.length, 2); ok('bootstrap: 2 doctors, ' + boot.services.length + ' services');

  // users for every station
  const drAbedi = boot.doctors[0];
  for (const [u, role, extra] of [['reception', 'reception'], ['dr', 'doctor', { doctor_id: drAbedi.id }], ['pharm', 'pharmacy'], ['stock', 'stock'], ['lab', 'lab']])
    await call(A, 'POST', '/api/users/save', { username: u, password: '1111', full_name: u, role, active: 1, ...(extra || {}) });
  ok('users created');
  await assert.rejects(login('pharm', '1111', 'doctor'), /اجازه ورود/); ok('station lock works');
  const R = await login('reception', '1111', 'reception'), D = await login('dr', '1111', 'doctor'), P = await login('pharm', '1111', 'pharmacy'), S = await login('stock', '1111', 'stock'), L = await login('lab', '1111', 'lab');
  await assert.rejects(call(P, 'GET', '/api/reports/dashboard'), /دسترسی/); ok('pharmacy cannot open stock dashboard');

  // stock: purchase factor with two medicines, 30% markup, partial payment
  const meds = await call(S, 'GET', '/api/list/medicines?q=Paracetamol');
  const para = meds.find(m => m.name === 'Paracetamol'); const amox = (await call(S, 'GET', '/api/list/medicines?q=Amoxicillin')).find(m => m.name === 'Amoxicillin');
  const pur = await call(S, 'POST', '/api/purchases/save', { factor_no: 'A-77', supplier_name: 'خواجه', date: srv.ops.today(), receiver: 'مصطفی', pay_type: 'installment', paid: 500,
    items: [{ medicine_id: para.id, qty: 100, bonus: 0, buy_price: 5, markup_pct: 30, batch_no: 'B1', expiry: '2027-06' }, { medicine_id: amox.id, qty: 50, buy_price: 10, markup_pct: 20, expiry: '2027-01' }] });
  assert.equal(pur.net, 1000); assert.equal(pur.paid, 500); assert.equal(pur.pay_status, 'partial');
  const para2 = await call(S, 'GET', '/api/medicine/' + para.id); assert.equal(para2.stock, 100); assert.equal(para2.sell_price, 6.5);
  ok(`purchase ${pur.ref_no}: net ${pur.net}, paid ${pur.paid}, paracetamol stock ${para2.stock} sell ${para2.sell_price}`);
  const pur2 = await call(S, 'POST', '/api/purchases/pay/' + pur.id, { amount: 300, date: srv.ops.today(), paid_by: 'مصطفی' });
  assert.equal(pur2.balance, 200); ok('installment paid, balance 200');

  // reception: new patient + OPD visit → turn 1
  const opd = boot.services.find(s => s.code === 'OPD');
  const v = await call(R, 'POST', '/api/visits/create', { patient: { full_name: 'احمد', father_name: 'محمود', sex: 'M', age_years: 30, phone: '0700000000' }, service_id: opd.id, doctor_id: drAbedi.id, fee: 300, discount: 50 });
  assert.equal(v.turn_no, 1); assert.equal(v.net, 250); assert.equal(v.paid, 250);
  const v2 = await call(R, 'POST', '/api/visits/create', { patient: { full_name: 'فاطمه', father_name: 'علی', sex: 'F', age_years: 25 }, service_name: 'حجامت', fee: 200, save_service: 1 });
  assert.equal(v2.turn_no, 1); ok(`visit ${v.visit_no} turn ${v.turn_no} (${v.patient_code}); custom service visit turn ${v2.turn_no}`);
  const res = await call(R, 'POST', '/api/visits/create', { patient_id: v.patient_id, service_id: opd.id, doctor_id: drAbedi.id, visit_date: '2030-01-01', reserve: 1, reserved_time: '09:30' });
  assert.equal(res.status, 'reserved'); ok('reservation created for a future date');

  // doctor: queue, encounter with prescription + lab request + discount
  const queue = await call(D, 'GET', `/api/list/visits?eq.visit_date=${srv.ops.today()}&eq.doctor_id=${drAbedi.id}`);
  assert.ok(queue.find(q => q.id === v.id)); ok('doctor sees the visit in the queue');
  const cbc = (await call(D, 'GET', '/api/list/lab_tests?q=CBC')).find(t => t.code === 'CBC');
  const hb = (await call(D, 'GET', '/api/list/lab_tests?q=HGB')).find(t => t.code === 'HGB');
  const enc = await call(D, 'POST', '/api/encounter/save', { visit_id: v.id, bp_sys: 120, bp_dia: 80, pulse: 76, temp: 37.2, weight: 70, complaint: 'سردردی', diagnosis: 'Tension headache',
    print_opts: { vitals: 1 }, visit_discount: 50,
    rx: { discount_pct: 10, items: [{ medicine_id: para.id, name: 'Paracetamol', form: 'Tablet', strength: '500', unit: 'mg', dose: '1', frequency: 'روزانه سه بار', timing: 'بعد از غذا', duration: 5, duration_unit: 'روز', qty: 15 },
      { medicine_id: amox.id, name: 'Amoxicillin', form: 'Capsule', strength: '500', unit: 'mg', dose: '1', frequency: 'هر ۸ ساعت', duration: 7, duration_unit: 'روز', qty: 21 }] },
    lab: { test_ids: [cbc.id], discount_pct: 0 } });
  assert.ok(enc.rx.rx_code.startsWith('RX-')); assert.ok(enc.lab.lab_code.startsWith('LB-'));
  ok(`encounter saved → ${enc.rx.rx_code} / ${enc.lab.lab_code}`);
  const vv = await call(R, 'GET', '/api/get/visits/' + v.id); assert.equal(vv.balance, -50); ok('doctor discount → refund 50 due at reception');
  await call(R, 'POST', '/api/visits/pay/' + v.id, { amount: -50, note: 'تخفیف داکتر' });

  // pharmacy: open by numeric code, dispense with doctor discount
  const num = enc.rx.rx_code.replace(/\D/g, '');
  const rx = await call(P, 'GET', '/api/rx/' + Number(num));
  assert.equal(rx.items.length, 2); assert.equal(rx.items[0].match.id, para.id);
  const sale = await call(P, 'POST', '/api/sales/create', { prescription_id: rx.id, discount_pct: rx.discount_pct, items: rx.items.map(i => ({ medicine_id: i.match.id, qty: i.qty, rx_item_id: i.id })) });
  // 15*6.5 = 97.5 ; amox sell 12 *21 = 252 → 349.5 ; -10% = 314.55
  assert.equal(sale.subtotal, 349.5); assert.equal(sale.net, 314.55); assert.equal(sale.cost, 15 * 5 + 21 * 10);
  ok(`sale ${sale.sale_code}: subtotal ${sale.subtotal} net ${sale.net} cost ${sale.cost} profit ${sale.profit}`);
  const rxAfter = await call(P, 'GET', '/api/rx/' + enc.rx.rx_code); assert.equal(rxAfter.status, 'dispensed'); ok('prescription marked dispensed');
  await assert.rejects(call(D, 'POST', '/api/encounter/save', { id: enc.encounter_id, visit_id: v.id, rx: { items: [{ name: 'X' }] } }), /تحویل/); ok('dispensed prescription is locked for the doctor');
  await assert.rejects(call(P, 'POST', '/api/sales/create', { items: [{ medicine_id: para.id, qty: 1000 }] }), /موجودی کافی نیست/); ok('stock shortage blocked');
  const ret = await call(P, 'POST', '/api/sales/return/' + sale.id, { items: [{ sale_item_id: sale.items[0].id, qty: 5 }], note: 'برگشت' });
  assert.equal(ret.status, 'partial_return'); const para3 = await call(S, 'GET', '/api/medicine/' + para.id); assert.equal(para3.stock, 90);
  ok(`return 5 → stock ${para3.stock}, returned ${ret.returned}`);
  // edit purchase quantity, cannot drop below sold
  await assert.rejects(call(S, 'POST', '/api/purchases/save', { ...pur, items: [{ ...pur.items[0], qty: 5 }, pur.items[1]] }), /کمتر از مقدار فروخته/); ok('purchase edit below sold qty blocked');

  // central cashier: the pharmacy sale above was not paid at the pharmacy → reception collects it
  assert.equal(sale.paid, 0); ok('central cashier: pharmacy sale waits for payment at reception');
  const pend = await call(R, 'GET', '/api/cashier/pending');
  assert.ok(pend.sales.find(x => x.id === sale.id)); assert.ok(pend.labs.find(x => x.lab_code === enc.lab.lab_code)); ok('reception sees pharmacy + lab bills');
  const saleBal = (await call(R, 'GET', '/api/get/sales/' + sale.id)).balance;
  await call(R, 'POST', '/api/cashier/pay', { kind: 'sale', id: sale.id, amount: saleBal });
  assert.equal((await call(P, 'GET', '/api/sales/' + sale.id)).balance, 0); ok(`reception collected pharmacy bill ${saleBal}`);
  await assert.rejects(call(P, 'POST', '/api/sales/pay/' + sale.id, { amount: 1 }), /صندوق/); ok('pharmacy cannot take money in central mode');

  // laboratory materials (reagents) used automatically per test
  const item = await call(L, 'POST', '/api/save/lab_items', { name: 'CBC reagent', unit: 'تست', reorder_level: 5 });
  await call(L, 'POST', '/api/lab/items/move', { item_id: item, qty: 100, kind: 'in', unit_cost: 10 });
  const cbcFull = (await call(L, 'GET', '/api/lab/catalog')).tests.find(t => t.code === 'CBC');
  await call(L, 'POST', '/api/lab/test/save', { id: cbcFull.id, items: [{ item_id: item, qty: 1 }] });

  // laboratory: billed at reception (clinic reception ↔ lab reception), results at the lab
  const lr = await call(L, 'GET', '/api/lab/req/' + enc.lab.lab_code);
  const labBill = await call(R, 'POST', '/api/cashier/pay', { kind: 'lab', id: lr.id, amount: lr.subtotal, discount: 0 });
  const rec = labBill.data;
  assert.equal(rec.status, 'received'); assert.equal(rec.paid, rec.net);
  assert.equal((await call(L, 'GET', '/api/lab/items/' + item)).stock, 99); ok('lab billed & paid at reception, reagent stock 100 → 99');
  const results = rec.tests.filter(t => t.result_type === 'numeric').map(t => ({ test_id: t.id, value: t.code === 'HGB' ? '9.5' : '5', flag: t.code === 'HGB' ? 'L' : null }));
  const done = await call(L, 'POST', '/api/lab/results/' + rec.id, { results, status: 'approved' });
  assert.equal(done.status, 'approved'); ok(`lab ${done.lab_code}: received ${rec.net}, ${results.length} results approved`);
  const file = await call(D, 'GET', '/api/patient-file/' + v.patient_id);
  assert.ok(file.labs[0].results.length >= results.length); assert.equal(file.prescriptions.length, 1); ok('doctor sees lab results + prescription in patient file');
  const walk = await call(L, 'POST', '/api/lab/walkin', { patient: { full_name: 'کریم', sex: 'M', age_years: 40 }, test_ids: [hb.id] });
  ok('walk-in lab request ' + walk.lab_code);
  const rwalk = await call(R, 'POST', '/api/lab/walkin', { patient: { full_name: 'نسیمه', sex: 'F', age_years: 3, age_months: 4 }, test_ids: [cbc.id] });
  const rpaid = await call(R, 'POST', '/api/lab/receive/' + rwalk.id, {});
  assert.equal(rpaid.paid, rpaid.net); assert.equal((await call(L, 'GET', '/api/lab/items/' + item)).stock, 98); ok('lab registration at reception with payment ' + rwalk.lab_code);
  await call(L, 'POST', '/api/lab/receive/' + walk.id, {}); await call(L, 'POST', '/api/lab/cancel/' + walk.id, { reason: 'test' }); ok('lab cancel returns materials');
  await assert.rejects(call(R, 'POST', '/api/lab/results/' + rec.id, { results: [] }), /دسترسی/); ok('reception cannot enter lab results');

  // deposits, in-patients (beds), day accounts, cash close
  await call(R, 'POST', '/api/cashier/deposit', { patient_id: v.patient_id, amount: 1000 });
  const board = await call(R, 'GET', '/api/ipd/board'); const bed = board[0].beds[0];
  const adm = await call(R, 'POST', '/api/ipd/admit', { patient_id: v.patient_id, doctor_id: drAbedi.id, bed_id: bed.id, diagnosis: 'Dehydration', deposit: 500 });
  await assert.rejects(call(R, 'POST', '/api/ipd/admit', { patient: { full_name: 'x' }, bed_id: bed.id }), /خالی نیست/);
  await call(D, 'POST', '/api/ipd/charge/' + adm.id, { name: 'سیروم', amount: 300 });
  const bed2 = board[0].beds[1]; await call(R, 'POST', '/api/ipd/transfer/' + adm.id, { bed_id: bed2.id });
  const dis = await call(R, 'POST', '/api/ipd/discharge/' + adm.id, { discount: 0 });
  assert.equal(dis.status, 'discharged'); assert.ok(dis.net >= 1300);
  const payAdm = await call(R, 'POST', '/api/cashier/pay', { kind: 'admission', id: adm.id, amount: dis.net - dis.paid - 200 });
  await call(R, 'POST', '/api/cashier/pay', { kind: 'admission', id: adm.id, amount: 200, from_deposit: 1 });
  const acc = await call(R, 'GET', '/api/cashier/patient/' + v.patient_id);
  assert.equal(acc.deposit, 800); assert.equal(acc.admissions[0].balance, 0); ok(`in-patient ${adm.adm_no}: bed + charges ${dis.net}, paid (deposit left ${acc.deposit})`);
  const tday = srv.ops.today();
  const day = await call(R, 'GET', '/api/cashier/day?from=' + tday);
  assert.ok(day.totals.sale > 0 && day.totals.lab > 0 && day.totals.visit > 0 && day.totals.admission > 0); ok(`reception day accounts: all ${day.totals.all} (fees ${day.totals.visit}, lab ${day.totals.lab}, pharmacy ${day.totals.sale}, beds ${day.totals.admission})`);
  const close = await call(R, 'POST', '/api/cashier/close', { counted: day.totals.net, handed_to: 'مدیر' }); assert.equal(close.difference, 0); ok('cash close recorded');

  // doctors load & schedule, queue display, reorder suggestions, alternatives
  await call(A, 'POST', '/api/doctors/schedule/' + drAbedi.id, { rows: [{ weekday: new Date().getDay(), start_time: '08:00', end_time: '12:00', max_patients: 20 }] });
  const load = await call(R, 'GET', '/api/doctor-load'); assert.equal(load.find(d => d.id === drAbedi.id).max_patients, 20); ok('doctor schedule & load');
  await call(D, 'POST', '/api/visits/call/' + v.id); const disp = await call(R, 'GET', '/api/queue/display'); ok('queue display groups: ' + disp.groups.length);
  const reo = await call(S, 'GET', '/api/stock/reorder'); assert.ok(reo.length > 0); ok('purchase suggestions: ' + reo.length);
  await call(A, 'POST', '/api/save/medical_departments', { name: 'جلدی' }); await call(R, 'POST', '/api/save/doctors', { name: 'تست', title: 'دوکتور', department_id: 1, work_type: 'داکتر عمومی' }); ok('departments & doctors added');

  // expenses, withdrawals, reports
  await call(S, 'POST', '/api/save/expenses', { item: 'بل برق', category: 'بل برق', amount: 2000, by_whom: 'مصطفی' });
  await call(P, 'POST', '/api/save/withdrawals', { section: 'pharmacy', amount: 100, by_whom: 'mostafa' });
  const t = srv.ops.today();
  const days = await call(S, 'GET', `/api/reports/days?from=${t}&to=${t}`);
  const d0 = days[0];
  assert.equal(d0.ph_sales, 314.55); assert.equal(d0.reception, 450 - 50); assert.equal(d0.expenses, 2000); assert.equal(d0.wd_pharmacy, 100); assert.ok(d0.ipd > 0);
  ok(`daily: reception ${d0.reception}, pharmacy ${d0.ph_net} (profit ${d0.ph_profit}), lab ${d0.lab_total}, expenses ${d0.expenses}, cash left ${d0.cash_left}`);
  const pd = await call(P, 'GET', `/api/reports/days?from=${t}&to=${t}`); assert.equal(pd[0].expenses, undefined); ok('pharmacy gets only its own daily figures');
  const dash = await call(A, 'GET', '/api/reports/dashboard'); assert.ok(dash.stock.items > 0); ok('admin dashboard');
  const msales = await call(S, 'GET', `/api/reports/medicine-sales?from=${t}&to=${t}`); assert.equal(msales.length, 2); ok('medicine sales report');
  const sup = await call(S, 'GET', '/api/reports/suppliers'); assert.equal(sup[0].balance, 200); ok('supplier ledger balance 200');

  // excel import
  const xl = process.argv[2];
  if (xl && fs.existsSync(xl)) {
    const sum = await call(S, 'POST', '/api/import/excel', { data: fs.readFileSync(xl).toString('base64'), name: path.basename(xl) });
    ok('excel import: ' + JSON.stringify(sum));
    const again = await call(S, 'POST', '/api/import/excel', { data: fs.readFileSync(xl).toString('base64') });
    assert.equal(again.purchases + again.expenses + again.daily, 0); ok('re-import skips duplicates');
  }
  const net = await call(A, 'GET', '/api/network'); ok('network info: ' + net.addresses.map(a => a.address).join(','));
  await srv.close();
  console.log('ALL TESTS PASSED');
})().catch(async e => { console.error('FAILED:', e.stack || e); try { await srv?.close(); } catch (_) { } process.exit(1); });
