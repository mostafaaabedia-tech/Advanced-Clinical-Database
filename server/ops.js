// Domain operations — every multi-table change happens here inside one transaction.
'use strict';

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const n = (x, d = 0) => { const v = Number(x); return isFinite(v) ? v : d; };
const str = (x) => (x === undefined || x === null) ? null : (String(x).trim() || null);
const pad2 = (x) => String(x).padStart(2, '0');
function today() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function nowStr() { const d = new Date(); return `${today()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
function isoOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
class UserError extends Error { constructor(m) { super(m); this.user = true; } }
const fail = (m) => { throw new UserError(m); };

function birthFromAge(years, months, days) {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  d.setFullYear(d.getFullYear() - n(years)); d.setMonth(d.getMonth() - n(months)); d.setDate(d.getDate() - n(days));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function roundPrice(x) { const v = Number(x) || 0; return v >= 10 ? Math.ceil(v) : Math.round(v * 10) / 10; }

function makeOps(db, bus) {
  const emit = (type, data, roles, extra = {}) => bus && bus.emit({ type, data, roles, ...extra });
  const setting = (k, d) => db.getSetting(k, d);

  // =================================================================== patients
  const PATIENT_FIELDS = ['full_name', 'father_name', 'sex', 'birth_date', 'phone', 'address', 'tazkira', 'blood_group', 'allergies', 'chronic_diseases',
    'past_history', 'family_history', 'current_medications', 'notes', 'emergency_name', 'emergency_phone', 'insurance', 'insurance_no'];
  function savePatient(p, user) {
    p = p || {};
    const row = {};
    for (const f of PATIENT_FIELDS) if (f in p) row[f] = str(p[f]);
    if (p.age_years !== undefined || p.age_months !== undefined || p.age_days !== undefined) {
      if (n(p.age_years) || n(p.age_months) || n(p.age_days)) row.birth_date = birthFromAge(p.age_years, p.age_months, p.age_days);
    }
    if (row.sex && !['M', 'F'].includes(row.sex)) row.sex = 'M';
    if (p.id) {
      if (!db.get('SELECT id FROM patients WHERE id=?', [p.id])) fail('مریض پیدا نشد');
      if ('full_name' in row && !row.full_name) fail('نام مریض الزامی است');
      row.updated_at = nowStr();
      db.update('patients', p.id, row);
      return p.id;
    }
    if (!row.full_name) fail('نام مریض الزامی است');
    row.code = db.nextCode('patient');
    row.sex = row.sex || 'M';
    row.created_by = user?.id || null;
    return db.insert('patients', row);
  }

  // =================================================================== reception
  function queueKey(doctorId, serviceId) {
    const scope = setting('turn_scope', 'doctor');
    if (scope === 'clinic') return 'c';
    if (scope === 'service') return 's' + (serviceId || 0);
    return doctorId ? 'd' + doctorId : 's' + (serviceId || 0);
  }
  function nextTurn(date, key) { return n(db.scalar('SELECT MAX(turn_no) FROM visits WHERE visit_date=? AND queue_key=?', [date, key])) + 1; }

  function createVisit(v, user) {
    return db.transaction(() => {
      let patientId = v.patient_id || v.patient?.id;
      if (v.patient) patientId = savePatient({ ...v.patient, id: patientId || undefined }, user);
      if (!patientId) fail('مریض را انتخاب یا ثبت کنید');
      let service = v.service_id ? db.get('SELECT * FROM services WHERE id=?', [v.service_id]) : null;
      let serviceName = service ? service.name : str(v.service_name);
      if (!serviceName) fail('نوع خدمت را انتخاب کنید یا بنویسید');
      if (!service && v.save_service) {
        const code = (str(v.service_code) || serviceName).toUpperCase().replace(/\s+/g, '_').slice(0, 20);
        const exists = db.get('SELECT * FROM services WHERE code=? OR name=?', [code, serviceName]);
        if (exists) service = exists;
        else { const id = db.insert('services', { code, name: serviceName, fee: n(v.fee), needs_doctor: v.doctor_id ? 1 : 0, sort: 99 }); service = db.get('SELECT * FROM services WHERE id=?', [id]); }
      }
      const doctorId = v.doctor_id ? Number(v.doctor_id) : null;
      if (service && service.needs_doctor && !doctorId) fail('برای این خدمت، داکتر را انتخاب کنید');
      const date = isoOk(v.visit_date) ? v.visit_date : today();
      const reserved = !!v.reserve || date > today();
      const key = queueKey(doctorId, service?.id);
      const fee = n(v.fee, service ? service.fee : 0), discount = Math.min(fee, Math.max(0, n(v.discount)));
      const net = r2(fee - discount);
      const paid = v.paid === undefined || v.paid === null || v.paid === '' ? (reserved ? 0 : net) : Math.max(0, n(v.paid));
      const id = db.insert('visits', {
        visit_no: db.nextCode('visit'), patient_id: patientId, doctor_id: doctorId, service_id: service?.id || null, service_name: serviceName,
        visit_date: date, reserved_time: str(v.reserved_time), queue_key: key, turn_no: nextTurn(date, key),
        status: reserved ? 'reserved' : 'waiting', fee, discount, net, paid, pay_method: v.pay_method || 'cash',
        age_text: str(v.age_text), weight: v.weight ? n(v.weight) : null, height: v.height ? n(v.height) : null, note: str(v.note), created_by: user?.id || null,
        checked_in_at: reserved ? null : nowStr()
      });
      if (paid > 0) db.insert('visit_payments', { visit_id: id, amount: paid, method: v.pay_method || 'cash', note: 'پرداخت هنگام پذیرش', station: 'reception', created_by: user?.id || null });
      const row = db.get('SELECT * FROM v_visits WHERE id=?', [id]);
      emit('visit:new', row, ['reception', 'doctor', 'admin'], { doctor_id: doctorId });
      return row;
    });
  }
  function updateVisit(id, v, user) {
    return db.transaction(() => {
      const old = db.get('SELECT * FROM visits WHERE id=?', [id]); if (!old) fail('پذیرش پیدا نشد');
      const row = {};
      if ('fee' in v) row.fee = Math.max(0, n(v.fee));
      if ('discount' in v) row.discount = Math.max(0, n(v.discount));
      if ('note' in v) row.note = str(v.note);
      if ('reserved_time' in v) row.reserved_time = str(v.reserved_time);
      if ('weight' in v) row.weight = v.weight ? n(v.weight) : null;
      if ('height' in v) row.height = v.height ? n(v.height) : null;
      if ('doctor_id' in v || 'service_id' in v || 'visit_date' in v) {
        const doctorId = 'doctor_id' in v ? (v.doctor_id ? Number(v.doctor_id) : null) : old.doctor_id;
        const serviceId = 'service_id' in v ? (v.service_id ? Number(v.service_id) : null) : old.service_id;
        const date = isoOk(v.visit_date) ? v.visit_date : old.visit_date;
        const key = queueKey(doctorId, serviceId);
        Object.assign(row, { doctor_id: doctorId, service_id: serviceId, visit_date: date });
        if (key !== old.queue_key || date !== old.visit_date) Object.assign(row, { queue_key: key, turn_no: nextTurn(date, key) });
        if (serviceId && serviceId !== old.service_id) row.service_name = db.scalar('SELECT name FROM services WHERE id=?', [serviceId]) || old.service_name;
      }
      if ('service_name' in v && !row.service_id && !old.service_id) row.service_name = str(v.service_name) || old.service_name;
      const fee = row.fee ?? old.fee, disc = row.discount ?? old.discount;
      row.net = r2(Math.max(0, fee - disc - old.doctor_discount));
      db.update('visits', id, row);
      const out = db.get('SELECT * FROM v_visits WHERE id=?', [id]);
      emit('visit:update', out, ['reception', 'doctor', 'admin'], { doctor_id: out.doctor_id });
      return out;
    });
  }
  function setVisitStatus(id, status, user, reason) {
    const allowed = ['reserved', 'waiting', 'in_visit', 'done', 'cancelled', 'no_show'];
    if (!allowed.includes(status)) fail('وضعیت نامعتبر');
    const old = db.get('SELECT * FROM visits WHERE id=?', [id]); if (!old) fail('پذیرش پیدا نشد');
    const row = { status };
    if (status === 'waiting' && !old.checked_in_at) row.checked_in_at = nowStr();
    if (status === 'waiting' && old.status === 'reserved' && old.visit_date !== today()) {
      // reservation arriving on another day: move it to today with a new turn
      const key = old.queue_key; row.visit_date = today(); row.turn_no = nextTurn(today(), key);
    }
    if (status === 'in_visit') row.called_at = nowStr();
    if (status === 'done') row.finished_at = nowStr();
    if (status === 'cancelled') row.cancelled_reason = str(reason);
    db.update('visits', id, row);
    const out = db.get('SELECT * FROM v_visits WHERE id=?', [id]);
    emit('visit:update', out, ['reception', 'doctor', 'admin'], { doctor_id: out.doctor_id });
    return out;
  }
  function payVisit(id, amount, method, note, user, station) {
    return db.transaction(() => {
      const v = db.get('SELECT * FROM visits WHERE id=?', [id]); if (!v) fail('پذیرش پیدا نشد');
      const a = r2(amount); if (!a) fail('مبلغ را وارد کنید');
      db.insert('visit_payments', { visit_id: id, amount: a, method: method || 'cash', note: str(note), station: station || user?.station || null, created_by: user?.id || null });
      db.update('visits', id, { paid: r2(v.paid + a) });
      const out = db.get('SELECT * FROM v_visits WHERE id=?', [id]);
      emit('visit:update', out, ['reception', 'admin'], { doctor_id: out.doctor_id });
      return out;
    });
  }

  // =================================================================== doctor
  function patientFile(patientId) {
    const patient = db.get('SELECT * FROM patients WHERE id=?', [patientId]); if (!patient) fail('مریض پیدا نشد');
    const visits = db.all('SELECT * FROM v_visits WHERE patient_id=? ORDER BY visit_date DESC, id DESC LIMIT 100', [patientId]);
    const encounters = db.all(`SELECT e.*, d.name doctor_name, d.title doctor_title FROM encounters e LEFT JOIN doctors d ON d.id=e.doctor_id
      WHERE e.patient_id=? ORDER BY e.date DESC, e.id DESC LIMIT 100`, [patientId]);
    const rx = db.all('SELECT * FROM v_prescriptions WHERE patient_id=? ORDER BY id DESC LIMIT 100', [patientId]);
    const rxItems = rx.length ? db.all(`SELECT * FROM prescription_items WHERE prescription_id IN (${rx.map(r => r.id).join(',')}) ORDER BY sort, id`) : [];
    rx.forEach(r => r.items = rxItems.filter(i => i.prescription_id === r.id));
    const labs = labRequestsFull(db.all('SELECT * FROM v_lab_requests WHERE patient_id=? ORDER BY id DESC LIMIT 100', [patientId]));
    return { patient, visits, encounters, prescriptions: rx, labs };
  }
  function labRequestsFull(reqs) {
    if (!reqs.length) return reqs;
    const ids = reqs.map(r => r.id).join(',');
    const items = db.all(`SELECT i.*, t.code, t.is_panel FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id WHERE i.request_id IN (${ids}) ORDER BY i.sort, i.id`);
    const results = db.all(`SELECT r.*, t.code, t.name, t.result_type, t.unit tunit FROM lab_results r JOIN lab_tests t ON t.id=r.test_id WHERE r.request_id IN (${ids})`);
    reqs.forEach(r => { r.items = items.filter(i => i.request_id === r.id); r.results = results.filter(x => x.request_id === r.id); });
    return reqs;
  }

  const ENC_FIELDS = ['bp_sys', 'bp_dia', 'pulse', 'resp_rate', 'temp', 'weight', 'height', 'spo2', 'blood_sugar', 'head_circ',
    'complaint', 'history', 'exam', 'diagnosis', 'diagnosis_code', 'impression', 'notes', 'private_notes', 'print_note', 'next_visit'];
  const NUMERIC_ENC = new Set(['bp_sys', 'bp_dia', 'pulse', 'resp_rate', 'temp', 'weight', 'height', 'spo2', 'blood_sugar', 'head_circ']);
  const RX_ITEM_FIELDS = ['medicine_id', 'name', 'form', 'strength', 'unit', 'dose', 'frequency', 'timing', 'route', 'duration', 'duration_unit', 'dates', 'qty', 'note'];
  const rxSig = (items) => JSON.stringify((items || []).map(i => RX_ITEM_FIELDS.map(f => i[f] == null || i[f] === '' ? null : String(i[f]))));

  function saveEncounter(p, user) {
    const result = db.transaction(() => {
      const visit = p.visit_id ? db.get('SELECT * FROM visits WHERE id=?', [p.visit_id]) : null;
      const patientId = Number(p.patient_id || visit?.patient_id); if (!patientId) fail('مریض مشخص نیست');
      if (!db.get('SELECT id FROM patients WHERE id=?', [patientId])) fail('مریض پیدا نشد');
      const doctorId = user.role === 'doctor' ? (user.doctor_id || visit?.doctor_id || null) : (p.doctor_id || visit?.doctor_id || user.doctor_id || null);
      if (p.patient_update) savePatient({ ...p.patient_update, id: patientId }, user);

      const enc = {};
      for (const f of ENC_FIELDS) if (f in p) enc[f] = NUMERIC_ENC.has(f) ? (p[f] === '' || p[f] == null ? null : n(p[f])) : str(p[f]);
      if ('print_opts' in p) enc.print_opts = JSON.stringify(p.print_opts || {});
      let encId = p.id ? Number(p.id) : (visit ? db.scalar('SELECT id FROM encounters WHERE visit_id=? ORDER BY id DESC LIMIT 1', [visit.id]) : null);
      if (encId) {
        const old = db.get('SELECT * FROM encounters WHERE id=?', [encId]); if (!old) fail('ویزیت پیدا نشد');
        if (user.role === 'doctor' && old.doctor_id && user.doctor_id && old.doctor_id !== user.doctor_id) fail('این ویزیت مربوط به داکتر دیگری است');
        db.update('encounters', encId, { ...enc, updated_at: nowStr() });
      } else {
        encId = db.insert('encounters', { ...enc, visit_id: visit?.id || null, patient_id: patientId, doctor_id: doctorId, date: today(), created_by: user.id });
      }
      if (enc.weight && visit) db.update('visits', visit.id, { weight: enc.weight });
      if (enc.height && visit) db.update('visits', visit.id, { height: enc.height });

      // ---- prescription (pharmacy code) ----
      let rxOut = null;
      if (p.rx) {
        const items = (p.rx.items || []).filter(i => str(i.name));
        const existing = db.get('SELECT * FROM prescriptions WHERE encounter_id=? ORDER BY id DESC LIMIT 1', [encId]);
        const oldItems = existing ? db.all('SELECT * FROM prescription_items WHERE prescription_id=? ORDER BY sort, id', [existing.id]) : [];
        const changed = rxSig(items) !== rxSig(oldItems);
        if (existing && existing.status !== 'new' && existing.status !== 'cancelled') {
          if (changed) fail(`نسخه ${existing.rx_code} قبلاً توسط دواخانه تحویل شده و قابل تغییر نیست. برای دوای جدید، نسخه جدید بنویسید.`);
          db.update('prescriptions', existing.id, { note: str(p.rx.note) });
          rxOut = existing;
        } else if (!items.length) {
          if (existing) { db.run('DELETE FROM prescriptions WHERE id=?', [existing.id]); emit('rx:update', { id: existing.id, rx_code: existing.rx_code, status: 'deleted' }, ['pharmacy', 'admin']); }
        } else {
          let rxId;
          const head = { note: str(p.rx.note), discount_pct: Math.min(100, Math.max(0, n(p.rx.discount_pct))), doctor_id: doctorId, updated_at: nowStr() };
          if (existing) { rxId = existing.id; db.update('prescriptions', rxId, { ...head, status: 'new' }); db.run('DELETE FROM prescription_items WHERE prescription_id=?', [rxId]); }
          else rxId = db.insert('prescriptions', { ...head, rx_code: db.nextCode('rx'), encounter_id: encId, patient_id: patientId, date: today(), sent_at: nowStr(), created_by: user.id });
          items.forEach((it, i) => {
            const row = { prescription_id: rxId, sort: i + 1 };
            for (const f of RX_ITEM_FIELDS) row[f] = ['medicine_id', 'duration', 'qty'].includes(f) ? (it[f] === '' || it[f] == null ? null : n(it[f])) : str(it[f]);
            if (row.medicine_id && !db.get('SELECT id FROM medicines WHERE id=?', [row.medicine_id])) row.medicine_id = null;
            db.insert('prescription_items', row);
          });
          rxOut = db.get('SELECT * FROM v_prescriptions WHERE id=?', [rxId]);
          if (!existing || changed) emit(existing ? 'rx:update' : 'rx:new', rxOut, ['pharmacy', 'admin', 'stock']);
        }
      }

      // ---- laboratory request (lab code) ----
      let labOut = null;
      if (p.lab) {
        const ids = [...new Set((p.lab.test_ids || []).map(Number).filter(Boolean))];
        const existing = db.get("SELECT * FROM lab_requests WHERE encounter_id=? AND status<>'cancelled' ORDER BY id DESC LIMIT 1", [encId]);
        const oldIds = existing ? db.all('SELECT test_id FROM lab_request_items WHERE request_id=? ORDER BY sort, id', [existing.id]).map(r => r.test_id) : [];
        const changed = JSON.stringify(ids) !== JSON.stringify(oldIds);
        if (existing && existing.status !== 'requested') {
          if (changed) fail(`درخواست آزمایش ${existing.lab_code} قبلاً در لابراتوار پذیرش شده و قابل تغییر نیست.`);
          labOut = existing;
        } else if (!ids.length) {
          if (existing) { db.run('DELETE FROM lab_requests WHERE id=?', [existing.id]); emit('lab:update', { id: existing.id, lab_code: existing.lab_code, status: 'deleted' }, ['lab', 'admin']); }
        } else {
          const head = { note: str(p.lab.note), urgent: p.lab.urgent ? 1 : 0, discount_pct: Math.min(100, Math.max(0, n(p.lab.discount_pct))), doctor_id: doctorId };
          let reqId;
          if (existing) { reqId = existing.id; db.update('lab_requests', reqId, head); }
          else reqId = db.insert('lab_requests', { ...head, lab_code: db.nextCode('lab'), encounter_id: encId, patient_id: patientId, date: today(), created_by: user.id });
          setLabItems(reqId, ids);
          labOut = db.get('SELECT * FROM v_lab_requests WHERE id=?', [reqId]);
          if (!existing || changed) emit(existing ? 'lab:update' : 'lab:new', labOut, ['lab', 'admin']);
        }
      }

      // ---- doctor discount on the visit fee ----
      if (visit && 'visit_discount' in p) {
        const dd = Math.max(0, Math.min(visit.fee - visit.discount, n(p.visit_discount)));
        db.update('visits', visit.id, { doctor_discount: dd, doctor_discount_note: str(p.visit_discount_note), net: r2(visit.fee - visit.discount - dd) });
      }
      if (visit && p.finish) db.update('visits', visit.id, { status: 'done', finished_at: nowStr() });
      else if (visit && visit.status === 'waiting') db.update('visits', visit.id, { status: 'in_visit', called_at: visit.called_at || nowStr() });
      if (visit) { const v = db.get('SELECT * FROM v_visits WHERE id=?', [visit.id]); emit('visit:update', v, ['reception', 'doctor', 'admin'], { doctor_id: v.doctor_id }); }

      return { encounter_id: encId, rx: rxOut ? { id: rxOut.id, rx_code: rxOut.rx_code, status: rxOut.status } : null, lab: labOut ? { id: labOut.id, lab_code: labOut.lab_code, status: labOut.status } : null };
    });
    return result;
  }

  // =================================================================== pharmacy
  function findByCode(table, col, code) {
    const c = String(code || '').trim(); if (!c) return null;
    let row = db.get(`SELECT * FROM ${table} WHERE ${col} = ? COLLATE NOCASE`, [c]);
    if (!row && /^\d+$/.test(c)) row = db.get(`SELECT * FROM ${table} WHERE CAST(SUBSTR(${col}, LENGTH(RTRIM(${col}, '0123456789')) + 1) AS INTEGER) = ? ORDER BY id DESC LIMIT 1`, [Number(c)]);
    return row;
  }
  function medicineStock(id) { return db.get('SELECT * FROM v_medicine_stock WHERE id=?', [id]); }
  function matchMedicine(item) {
    if (item.medicine_id) { const m = medicineStock(item.medicine_id); if (m) return m; }
    const name = String(item.name || '').trim(); if (!name) return null;
    return db.get('SELECT * FROM v_medicine_stock WHERE active=1 AND name = ? COLLATE NOCASE ORDER BY stock DESC LIMIT 1', [name])
      || db.get('SELECT * FROM v_medicine_stock WHERE active=1 AND (name LIKE ? OR generic LIKE ?) ORDER BY stock DESC LIMIT 1', [name + '%', name + '%']);
  }
  // same generic medicine with stock — suggested when the prescribed brand is out of stock
  function alternatives(medId) {
    const m = db.get('SELECT * FROM medicines WHERE id=?', [medId]); if (!m || !m.generic) return [];
    return db.all("SELECT * FROM v_medicine_stock WHERE active=1 AND id<>? AND stock>0 AND LOWER(TRIM(generic))=LOWER(TRIM(?)) ORDER BY (IFNULL(strength,'')=?) DESC, stock DESC LIMIT 5", [m.id, m.generic, m.strength || '']);
  }
  function alternativesByName(name) {
    const nm = String(name || '').trim(); if (!nm) return [];
    return db.all("SELECT * FROM v_medicine_stock WHERE active=1 AND stock>0 AND (LOWER(generic) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?)) ORDER BY stock DESC LIMIT 5", ['%' + nm.split(' ')[0] + '%', '%' + nm.split(' ')[0] + '%']);
  }
  function getRx(code) {
    const rx0 = findByCode('prescriptions', 'rx_code', code); if (!rx0) fail('نسخه با این کد پیدا نشد');
    const rx = db.get('SELECT * FROM v_prescriptions WHERE id=?', [rx0.id]);
    rx.items = db.all('SELECT * FROM prescription_items WHERE prescription_id=? ORDER BY sort, id', [rx.id]);
    const dispensed = {};
    db.all(`SELECT si.rx_item_id, SUM(si.qty - si.returned_qty) q FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.prescription_id=? AND s.status<>'void' GROUP BY si.rx_item_id`, [rx.id])
      .forEach(r => dispensed[r.rx_item_id] = r.q);
    rx.items.forEach(i => { i.match = matchMedicine(i); i.dispensed = dispensed[i.id] || 0; i.alternatives = i.match && i.match.stock <= 0 ? alternatives(i.match.id) : (!i.match ? alternativesByName(i.name) : []); });
    rx.sales = db.all('SELECT * FROM v_sales WHERE prescription_id=? ORDER BY id DESC', [rx.id]);
    rx.patient = db.get('SELECT * FROM patients WHERE id=?', [rx.patient_id]);
    return rx;
  }

  function allocate(medicineId, qty) {
    const batches = db.all("SELECT * FROM batches WHERE medicine_id=? AND qty_left > 0 ORDER BY (expiry IS NULL OR expiry=''), expiry, id", [medicineId]);
    const alloc = []; let left = qty, cost = 0;
    for (const b of batches) {
      if (left <= 0) break;
      const take = Math.min(left, b.qty_left);
      alloc.push([b.id, take, b.buy_price]); cost += take * b.buy_price; left = r2(left - take);
    }
    return { alloc, cost, missing: left };
  }

  function createSale(s, user) {
    return db.transaction(() => {
      const items = (s.items || []).filter(i => n(i.qty) > 0);
      if (!items.length) fail('هیچ دوایی برای فروش انتخاب نشده');
      const allowNeg = setting('allow_negative_stock', '0') === '1';
      let rx = null;
      if (s.prescription_id) { rx = db.get('SELECT * FROM prescriptions WHERE id=?', [s.prescription_id]); if (!rx) fail('نسخه پیدا نشد'); if (rx.status === 'cancelled') fail('این نسخه لغو شده است'); }
      const lines = []; let subtotal = 0, costTotal = 0;
      for (const it of items) {
        const m = medicineStock(it.medicine_id); if (!m) fail('دوا پیدا نشد: ' + (it.name || it.medicine_id));
        const qty = n(it.qty);
        const price = it.price === undefined || it.price === null || it.price === '' ? m.sell_price : n(it.price);
        const { alloc, cost, missing } = allocate(m.id, qty);
        if (missing > 0 && !allowNeg) fail(`موجودی کافی نیست: ${m.name} (موجود ${r2(m.stock)} ${m.unit || ''}، درخواست ${qty})`);
        const lineCost = cost + missing * (m.buy_price || 0);
        const total = r2(qty * price);
        lines.push({ m, it, qty, price, total, alloc, lineCost: r2(lineCost) });
        subtotal += total; costTotal += lineCost;
      }
      subtotal = r2(subtotal);
      const pct = Math.min(100, Math.max(0, n(s.discount_pct)));
      const discount = s.discount !== undefined && s.discount !== '' && s.discount !== null ? Math.min(subtotal, Math.max(0, n(s.discount))) : r2(subtotal * pct / 100);
      const net = r2(subtotal - discount);
      const centralPh = setting('cashier_mode', 'central') === 'central' && user.station === 'pharmacy';
      const paid = s.paid === undefined || s.paid === null || s.paid === '' ? (centralPh ? 0 : net) : Math.max(0, n(s.paid));
      const date = today();
      const saleId = db.insert('sales', {
        sale_code: db.nextCode('sale'), prescription_id: rx?.id || null, rx_code: rx?.rx_code || null,
        patient_id: rx?.patient_id || s.patient_id || null, patient_name: str(s.patient_name) || (rx ? db.scalar('SELECT full_name FROM patients WHERE id=?', [rx.patient_id]) : null),
        doctor_id: rx?.doctor_id || null, date, subtotal, discount_pct: subtotal ? r2(discount * 100 / subtotal) : 0, discount, net, paid,
        cost: r2(costTotal), pay_method: s.pay_method || 'cash', note: str(s.note), created_by: user.id
      });
      if (paid > 0) db.insert('sale_payments', { sale_id: saleId, amount: paid, method: s.pay_method || 'cash', note: 'پرداخت هنگام فروش', station: user.station || 'pharmacy', created_by: user.id });
      for (const L of lines) {
        db.insert('sale_items', { sale_id: saleId, medicine_id: L.m.id, rx_item_id: L.it.rx_item_id || null, name: L.m.name, qty: L.qty, price: L.price, total: L.total, cost: L.lineCost, alloc: JSON.stringify(L.alloc) });
        for (const [bid, q, c] of L.alloc) {
          db.run('UPDATE batches SET qty_left = qty_left - ? WHERE id=?', [q, bid]);
          db.insert('stock_moves', { date, medicine_id: L.m.id, batch_id: bid, kind: 'sale', qty: -q, unit_cost: c, unit_price: L.price, ref_type: 'sale', ref_id: saleId, user_id: user.id });
        }
        const allocated = L.alloc.reduce((a, x) => a + x[1], 0);
        if (L.qty - allocated > 0.0001) db.insert('stock_moves', { date, medicine_id: L.m.id, kind: 'sale', qty: -(L.qty - allocated), unit_cost: L.m.buy_price, unit_price: L.price, ref_type: 'sale', ref_id: saleId, note: 'بدون موجودی', user_id: user.id });
      }
      if (rx) updateRxStatus(rx.id);
      const out = saleFull(saleId);
      emit('sale:new', { id: saleId, sale_code: out.sale_code, net: out.net, rx_code: out.rx_code }, ['stock', 'admin', 'pharmacy']);
      if (rx) emit('rx:update', db.get('SELECT * FROM v_prescriptions WHERE id=?', [rx.id]), ['pharmacy', 'doctor', 'admin'], { doctor_id: rx.doctor_id });
      lowStockCheck(lines.map(l => l.m.id));
      return out;
    });
  }
  function updateRxStatus(rxId) {
    const items = db.all('SELECT id, qty FROM prescription_items WHERE prescription_id=?', [rxId]);
    const disp = {}; db.all(`SELECT si.rx_item_id, SUM(si.qty - si.returned_qty) q FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.prescription_id=? AND s.status<>'void' GROUP BY si.rx_item_id`, [rxId]).forEach(r => disp[r.rx_item_id] = r.q);
    const any = Object.values(disp).some(q => q > 0);
    const all = items.every(i => (disp[i.id] || 0) > 0 && (!i.qty || disp[i.id] >= i.qty - 0.0001));
    const status = !any ? 'new' : all ? 'dispensed' : 'partial';
    db.update('prescriptions', rxId, { status, dispensed_at: any ? nowStr() : null });
  }
  function saleFull(id) {
    const s = db.get('SELECT * FROM v_sales WHERE id=?', [id]); if (!s) fail('فروش پیدا نشد');
    s.items = db.all(`SELECT si.*, m.code med_code, m.form, m.strength, m.unit, pi.dose, pi.frequency, pi.timing, pi.duration, pi.duration_unit, pi.note rx_note, pi.route
      FROM sale_items si LEFT JOIN medicines m ON m.id=si.medicine_id LEFT JOIN prescription_items pi ON pi.id=si.rx_item_id WHERE si.sale_id=? ORDER BY si.id`, [id]);
    s.patient = s.patient_id ? db.get('SELECT * FROM patients WHERE id=?', [s.patient_id]) : null;
    return s;
  }
  function returnSale(id, items, note, user) {
    return db.transaction(() => {
      const s = db.get('SELECT * FROM sales WHERE id=?', [id]); if (!s) fail('فروش پیدا نشد');
      if (s.status === 'void') fail('این فروش قبلاً باطل شده');
      const ratio = s.subtotal ? (s.net / s.subtotal) : 1;
      let refund = 0, refundCost = 0; const date = today();
      for (const r of items || []) {
        const si = db.get('SELECT * FROM sale_items WHERE id=? AND sale_id=?', [r.sale_item_id, id]); if (!si) continue;
        const q = Math.min(n(r.qty), si.qty - si.returned_qty); if (q <= 0) continue;
        // put back into the same batches (last allocated first)
        const alloc = JSON.parse(si.alloc || '[]'); let left = q; let cost = 0;
        const already = si.returned_qty; let skip = already;
        for (const a of alloc.slice().reverse()) {
          let avail = a[1]; if (skip > 0) { const s2 = Math.min(skip, avail); avail -= s2; skip -= s2; }
          if (left <= 0 || avail <= 0) continue;
          const take = Math.min(left, avail);
          db.run('UPDATE batches SET qty_left = qty_left + ? WHERE id=?', [take, a[0]]);
          db.insert('stock_moves', { date, medicine_id: si.medicine_id, batch_id: a[0], kind: 'return', qty: take, unit_cost: a[2], unit_price: r2(si.price * ratio), ref_type: 'sale', ref_id: id, note: str(note), user_id: user.id });
          cost += take * a[2]; left -= take;
        }
        if (left > 0) {
          const unitCost = si.qty ? si.cost / si.qty : 0;
          db.insert('stock_moves', { date, medicine_id: si.medicine_id, kind: 'return', qty: left, unit_cost: unitCost, unit_price: r2(si.price * ratio), ref_type: 'sale', ref_id: id, note: str(note), user_id: user.id });
          cost += left * unitCost;
        }
        db.update('sale_items', si.id, { returned_qty: si.returned_qty + q });
        refund += q * si.price * ratio; refundCost += cost;
      }
      if (!refund && !refundCost) fail('مقدار برگشتی را وارد کنید');
      const left = db.scalar('SELECT SUM(qty - returned_qty) FROM sale_items WHERE sale_id=?', [id]);
      db.update('sales', id, { returned: r2(s.returned + refund), returned_cost: r2(s.returned_cost + refundCost), status: left > 0.0001 ? 'partial_return' : 'returned' });
      if (s.prescription_id) updateRxStatus(s.prescription_id);
      emit('sale:update', { id }, ['stock', 'admin', 'pharmacy']);
      return saleFull(id);
    });
  }

  // =================================================================== stock & purchases
  function nextMedicineCode() { return Math.max(1000, n(db.scalar('SELECT MAX(code) FROM medicines'))) + 1; }
  function saveMedicine(m, user) {
    const F = ['barcode', 'name', 'generic', 'form', 'strength', 'unit', 'company', 'category', 'location', 'notes'];
    const N = ['buy_price', 'markup_pct', 'sell_price', 'reorder_level'];
    const row = {};
    for (const f of F) if (f in m) row[f] = str(m[f]);
    for (const f of N) if (f in m) row[f] = Math.max(0, n(m[f]));
    if ('active' in m) row.active = m.active ? 1 : 0;
    if ('code' in m && m.code !== '' && m.code != null) {
      row.code = Math.floor(n(m.code)); if (!row.code) fail('کد دوا باید عدد باشد');
      const dup = db.get('SELECT id, name FROM medicines WHERE code=? AND id<>?', [row.code, m.id || 0]);
      if (dup) fail(`کد ${row.code} قبلاً برای «${dup.name}» استفاده شده`);
    }
    if ('buy_price' in row && !('sell_price' in m) && 'markup_pct' in row) row.sell_price = roundPrice(row.buy_price * (1 + row.markup_pct / 100));
    if (m.id) {
      if ('name' in row && !row.name) fail('نام دوا الزامی است');
      db.update('medicines', m.id, row); return m.id;
    }
    if (!row.name) fail('نام دوا الزامی است');
    if (!row.code) row.code = nextMedicineCode();
    if (!('markup_pct' in row)) row.markup_pct = n(setting('default_markup', '30'));
    const id = db.insert('medicines', row);
    if (n(m.opening_qty) > 0) adjustStock({ medicine_id: id, qty: m.opening_qty, kind: 'opening', unit_cost: row.buy_price || 0, expiry: m.opening_expiry, batch_no: m.opening_batch }, user);
    return id;
  }

  function supplierId(p) {
    if (p.supplier_id) return Number(p.supplier_id);
    const name = str(p.supplier_name); if (!name) return null;
    const ex = db.get('SELECT id FROM suppliers WHERE name=?', [name]);
    return ex ? ex.id : db.insert('suppliers', { name });
  }
  function itemQty(it) { return n(it.qty) + n(it.bonus); }
  function unitCost(it) { const q = itemQty(it); return q ? r2(n(it.qty) * n(it.buy_price) / q * 10000) / 10000 : n(it.buy_price); }

  function savePurchase(p, user) {
    return db.transaction(() => {
      const date = isoOk(p.date) ? p.date : today();
      const head = {
        factor_no: str(p.factor_no), supplier_id: supplierId(p), date, receiver: str(p.receiver), discount: Math.max(0, n(p.discount)),
        pay_type: ['cash', 'installment', 'credit'].includes(p.pay_type) ? p.pay_type : 'cash', due_date: isoOk(p.due_date) ? p.due_date : null,
        received: p.received === undefined ? 1 : (p.received ? 1 : 0), notes: str(p.notes), has_items: p.has_items === 0 || p.has_items === false ? 0 : 1, updated_at: nowStr()
      };
      let pid = p.id ? Number(p.id) : null;
      const old = pid ? db.get('SELECT * FROM purchases WHERE id=?', [pid]) : null;
      if (pid && !old) fail('فاکتور پیدا نشد');
      if (pid) db.update('purchases', pid, head);
      else pid = db.insert('purchases', { ...head, ref_no: db.nextCode('purchase'), created_by: user.id });

      if (head.has_items) {
        const items = (p.items || []).filter(i => i.medicine_id && itemQty(i) > 0);
        const oldItems = db.all('SELECT * FROM purchase_items WHERE purchase_id=?', [pid]);
        const keep = new Set(items.filter(i => i.id).map(i => Number(i.id)));
        // removed lines
        for (const oi of oldItems.filter(o => !keep.has(o.id))) {
          const b = db.get('SELECT * FROM batches WHERE purchase_item_id=?', [oi.id]);
          if (b && b.qty_left < b.qty_in - 0.0001) fail(`از «${db.scalar('SELECT name FROM medicines WHERE id=?', [oi.medicine_id])}» این فاکتور قبلاً فروخته شده؛ حذف ممکن نیست (فقط می‌توانید مقدار را کم کنید).`);
          if (b) { db.run('DELETE FROM batches WHERE id=?', [b.id]); db.insert('stock_moves', { date: today(), medicine_id: oi.medicine_id, batch_id: b.id, kind: 'purchase_edit', qty: -b.qty_in, unit_cost: b.buy_price, ref_type: 'purchase', ref_id: pid, note: 'حذف از فاکتور', user_id: user.id }); }
          db.run('DELETE FROM purchase_items WHERE id=?', [oi.id]);
        }
        for (const it of items) {
          const med = db.get('SELECT * FROM medicines WHERE id=?', [it.medicine_id]); if (!med) fail('دوا پیدا نشد');
          const markup = it.markup_pct === '' || it.markup_pct == null ? med.markup_pct : n(it.markup_pct);
          const sell = it.sell_price === '' || it.sell_price == null || !n(it.sell_price) ? roundPrice(n(it.buy_price) * (1 + markup / 100)) : n(it.sell_price);
          const row = { purchase_id: pid, medicine_id: med.id, batch_no: str(it.batch_no), expiry: str(it.expiry), qty: n(it.qty), bonus: n(it.bonus),
            buy_price: n(it.buy_price), markup_pct: markup, sell_price: sell, total: r2(n(it.qty) * n(it.buy_price)) };
          const total = itemQty(it), cost = unitCost(it);
          if (it.id) {
            const oi = oldItems.find(o => o.id === Number(it.id)); if (!oi) fail('ردیف فاکتور پیدا نشد');
            const b = db.get('SELECT * FROM batches WHERE purchase_item_id=?', [oi.id]);
            if (b && oi.medicine_id !== med.id && b.qty_left < b.qty_in - 0.0001) fail('دوای این ردیف قبلاً فروخته شده؛ تغییر نوع دوا ممکن نیست.');
            db.update('purchase_items', oi.id, row);
            if (b) {
              const delta = total - b.qty_in;
              if (b.qty_left + delta < -0.0001) fail(`مقدار جدید «${med.name}» کمتر از مقدار فروخته شده است.`);
              db.update('batches', b.id, { medicine_id: med.id, batch_no: row.batch_no, expiry: row.expiry, qty_in: total, qty_left: r2(b.qty_left + delta), buy_price: cost });
              if (Math.abs(delta) > 0.0001 || oi.medicine_id !== med.id) db.insert('stock_moves', { date: today(), medicine_id: med.id, batch_id: b.id, kind: 'purchase_edit', qty: delta, unit_cost: cost, ref_type: 'purchase', ref_id: pid, note: 'ویرایش فاکتور', user_id: user.id });
            }
          } else {
            const iid = db.insert('purchase_items', row);
            const bid = db.insert('batches', { medicine_id: med.id, purchase_item_id: iid, batch_no: row.batch_no, expiry: row.expiry, qty_in: total, qty_left: total, buy_price: cost, source: 'purchase' });
            db.insert('stock_moves', { date, medicine_id: med.id, batch_id: bid, kind: 'purchase', qty: total, unit_cost: cost, ref_type: 'purchase', ref_id: pid, user_id: user.id });
          }
          // latest purchase defines the medicine's price
          db.update('medicines', med.id, { buy_price: n(it.buy_price), markup_pct: markup, sell_price: sell, company: med.company || str(p.company) });
        }
        const subtotal = r2(db.scalar('SELECT IFNULL(SUM(total),0) FROM purchase_items WHERE purchase_id=?', [pid]));
        db.update('purchases', pid, { subtotal, net: r2(Math.max(0, subtotal - head.discount)) });
      } else {
        db.update('purchases', pid, { subtotal: r2(n(p.net) + head.discount), net: r2(n(p.net)) });
      }
      if (!old && n(p.paid) > 0) db.insert('purchase_payments', { purchase_id: pid, date, amount: r2(p.paid), method: p.pay_method || 'cash', paid_by: str(p.receiver), note: 'پرداخت هنگام خرید', created_by: user.id });
      recomputePurchase(pid);
      emit('purchase:update', { id: pid }, ['stock', 'admin']);
      return purchaseFull(pid);
    });
  }
  function recomputePurchase(pid) {
    const paid = r2(db.scalar('SELECT IFNULL(SUM(amount),0) FROM purchase_payments WHERE purchase_id=?', [pid]));
    db.update('purchases', pid, { paid });
  }
  function purchaseFull(id) {
    const p = db.get('SELECT * FROM v_purchases WHERE id=?', [id]); if (!p) fail('فاکتور پیدا نشد');
    p.items = db.all(`SELECT i.*, m.name, m.code med_code, m.form, m.strength, m.unit, b.qty_left, b.id batch_id FROM purchase_items i JOIN medicines m ON m.id=i.medicine_id
      LEFT JOIN batches b ON b.purchase_item_id=i.id WHERE i.purchase_id=? ORDER BY i.id`, [id]);
    p.payments = db.all('SELECT pp.*, u.full_name user_name FROM purchase_payments pp LEFT JOIN users u ON u.id=pp.created_by WHERE pp.purchase_id=? ORDER BY pp.date, pp.id', [id]);
    return p;
  }
  function addPurchasePayment(pid, pay, user) {
    return db.transaction(() => {
      if (!db.get('SELECT id FROM purchases WHERE id=?', [pid])) fail('فاکتور پیدا نشد');
      const a = r2(pay.amount); if (!a) fail('مبلغ را وارد کنید');
      if (pay.id) db.update('purchase_payments', pay.id, { date: isoOk(pay.date) ? pay.date : today(), amount: a, method: pay.method || 'cash', paid_by: str(pay.paid_by), note: str(pay.note) });
      else db.insert('purchase_payments', { purchase_id: pid, date: isoOk(pay.date) ? pay.date : today(), amount: a, method: pay.method || 'cash', paid_by: str(pay.paid_by), note: str(pay.note), created_by: user.id });
      recomputePurchase(pid);
      emit('purchase:update', { id: pid }, ['stock', 'admin']);
      return purchaseFull(pid);
    });
  }
  function deletePurchasePayment(payId) {
    return db.transaction(() => {
      const pp = db.get('SELECT * FROM purchase_payments WHERE id=?', [payId]); if (!pp) fail('پرداخت پیدا نشد');
      db.run('DELETE FROM purchase_payments WHERE id=?', [payId]); recomputePurchase(pp.purchase_id);
      return purchaseFull(pp.purchase_id);
    });
  }
  function deletePurchase(pid, user) {
    return db.transaction(() => {
      const p = db.get('SELECT * FROM purchases WHERE id=?', [pid]); if (!p) fail('فاکتور پیدا نشد');
      const used = db.get('SELECT b.id FROM batches b JOIN purchase_items i ON i.id=b.purchase_item_id WHERE i.purchase_id=? AND b.qty_left < b.qty_in - 0.0001', [pid]);
      if (used) fail('از دواهای این فاکتور فروخته شده؛ حذف کامل ممکن نیست.');
      for (const b of db.all('SELECT b.* FROM batches b JOIN purchase_items i ON i.id=b.purchase_item_id WHERE i.purchase_id=?', [pid])) {
        db.insert('stock_moves', { date: today(), medicine_id: b.medicine_id, batch_id: b.id, kind: 'purchase_edit', qty: -b.qty_in, unit_cost: b.buy_price, ref_type: 'purchase', ref_id: pid, note: 'حذف فاکتور ' + p.ref_no, user_id: user.id });
        db.run('DELETE FROM batches WHERE id=?', [b.id]);
      }
      db.run('DELETE FROM purchases WHERE id=?', [pid]);
      emit('purchase:update', { id: pid }, ['stock', 'admin']);
      return true;
    });
  }

  // qty > 0 adds stock (opening / adjust), qty < 0 removes (adjust / expired / damaged)
  function adjustStock(a, user) {
    return db.transaction(() => {
      const m = db.get('SELECT * FROM medicines WHERE id=?', [a.medicine_id]); if (!m) fail('دوا پیدا نشد');
      const qty = n(a.qty); if (!qty) fail('مقدار را وارد کنید');
      const kind = ['opening', 'adjust', 'expired', 'damaged'].includes(a.kind) ? a.kind : 'adjust';
      const date = isoOk(a.date) ? a.date : today();
      if (qty > 0) {
        const cost = a.unit_cost === undefined || a.unit_cost === '' ? m.buy_price : n(a.unit_cost);
        const bid = db.insert('batches', { medicine_id: m.id, batch_no: str(a.batch_no), expiry: str(a.expiry), qty_in: qty, qty_left: qty, buy_price: cost, source: kind === 'opening' ? 'opening' : 'adjust' });
        db.insert('stock_moves', { date, medicine_id: m.id, batch_id: bid, kind, qty, unit_cost: cost, note: str(a.note), user_id: user.id });
      } else {
        let left = -qty;
        const list = a.batch_id ? db.all('SELECT * FROM batches WHERE id=? AND medicine_id=?', [a.batch_id, m.id])
          : db.all("SELECT * FROM batches WHERE medicine_id=? AND qty_left>0 ORDER BY (expiry IS NULL OR expiry=''), expiry, id", [m.id]);
        for (const b of list) {
          if (left <= 0) break;
          const take = Math.min(left, b.qty_left); if (take <= 0) continue;
          db.run('UPDATE batches SET qty_left = qty_left - ? WHERE id=?', [take, b.id]);
          db.insert('stock_moves', { date, medicine_id: m.id, batch_id: b.id, kind, qty: -take, unit_cost: b.buy_price, note: str(a.note), user_id: user.id });
          left -= take;
        }
        if (left > 0.0001) fail(`موجودی کافی نیست (کمبود ${r2(left)})`);
      }
      lowStockCheck([m.id]);
      return medicineStock(m.id);
    });
  }
  function lowStockCheck(ids) {
    for (const id of ids) {
      const m = medicineStock(id);
      if (m && m.active && m.stock <= m.reorder_level) emit('stock:low', { id: m.id, name: m.name, stock: m.stock, reorder_level: m.reorder_level }, ['stock', 'admin', 'pharmacy']);
    }
  }

  // =================================================================== laboratory
  // reception type (free / insurance contract): price basis, increase %, patient share (franchise) and default discount
  function receptionType(id) { return (id && db.get('SELECT * FROM lab_reception_types WHERE id=?', [id])) || { id: null, price_basis: 'free', patient_pct: 100, increase_pct: 0, discount_pct: 0 }; }
  function labTestPrice(t, rt) {
    let pr = rt.price_basis === 'insurance' && t.price_ins != null ? n(t.price_ins) : n(t.price);
    if (n(rt.increase_pct)) pr = roundPrice(pr * (1 + n(rt.increase_pct) / 100));
    return r2(pr);
  }
  function setLabItems(reqId, testIds) {
    const req0 = db.get('SELECT * FROM lab_requests WHERE id=?', [reqId]);
    const rt = receptionType(req0.reception_type_id);
    if (rt.max_tests && testIds.length > rt.max_tests) fail(`در نوع پذیرش «${rt.name}» حداکثر ${rt.max_tests} آزمایش مجاز است`);
    db.run('DELETE FROM lab_request_items WHERE request_id=?', [reqId]);
    testIds.forEach((tid, i) => {
      const t = db.get('SELECT * FROM lab_tests WHERE id=?', [tid]); if (!t) fail('آزمایش پیدا نشد');
      const price = labTestPrice(t, rt);
      db.insert('lab_request_items', { request_id: reqId, test_id: t.id, name: t.name, price, org_share: r2(price * (100 - n(rt.patient_pct, 100)) / 100), cost: t.cost, sendout_lab: t.sendout_lab || null, sort: i + 1 });
    });
    recalcLabTotals(reqId);
  }
  function recalcLabTotals(reqId, discountAmount) {
    const sub = r2(db.scalar('SELECT IFNULL(SUM(price),0) FROM lab_request_items WHERE request_id=?', [reqId]));
    const org = r2(db.scalar('SELECT IFNULL(SUM(org_share),0) FROM lab_request_items WHERE request_id=?', [reqId]));
    const cost = r2(db.scalar('SELECT IFNULL(SUM(cost),0) FROM lab_request_items WHERE request_id=?', [reqId]));
    const sendout = db.scalar("SELECT COUNT(*) FROM lab_request_items WHERE request_id=? AND IFNULL(sendout_lab,'')<>''", [reqId]) ? 1 : 0;
    const req = db.get('SELECT * FROM lab_requests WHERE id=?', [reqId]);
    const share = r2(sub - org);                                                   // the patient's part
    const pct = req.discount_pct || receptionType(req.reception_type_id).discount_pct || 0;
    const discount = discountAmount !== undefined ? Math.min(share, Math.max(0, discountAmount)) : req.status === 'requested' ? r2(share * pct / 100) : Math.min(share, req.discount);
    db.update('lab_requests', reqId, { subtotal: sub, org_share: org, cost, discount, net: r2(share - discount), sendout });
  }
  // extra reception fields of the laboratory (fasting, clinical notes, flags, answer date, referrer, discount reason …)
  const LAB_HEAD_FIELDS = ['fasting', 'clinical_notes', 'sample_flag', 'answer_date', 'referrer', 'discount_reason', 'discount_by', 'note'];
  function labHead(p) {
    const row = {};
    for (const f of LAB_HEAD_FIELDS) if (f in p) row[f] = str(p[f]);
    for (const f of ['pregnant', 'urgent']) if (f in p) row[f] = p[f] ? 1 : 0;
    if ('reception_type_id' in p) row.reception_type_id = p.reception_type_id ? Number(p.reception_type_id) : null;
    if ('referrer_id' in p) row.referrer_id = p.referrer_id ? Number(p.referrer_id) : null;
    if (row.answer_date && !isoOk(row.answer_date)) delete row.answer_date;
    return row;
  }
  function checkReceptionType(rtId, patientId) {
    const rt = receptionType(rtId); if (!rt.id) return;
    if (!rt.active) fail(`نوع پذیرش «${rt.name}» غیرفعال است`);
    let req = []; try { req = JSON.parse(rt.required_fields || '[]'); } catch (_) { }
    const p = db.get('SELECT * FROM patients WHERE id=?', [patientId]) || {};
    const names = { tazkira: 'نمبر تذکره', phone: 'شماره تلفن', birth_date: 'سن', father_name: 'ولد', address: 'آدرس', insurance_no: 'شماره بیمه' };
    const miss = req.filter(f => !String(p[f] || '').trim());
    if (miss.length) fail(`برای «${rt.name}» این معلومات مریض لازم است: ${miss.map(f => names[f] || f).join('، ')}`);
  }
  function labFull(idOrCode) {
    const r0 = typeof idOrCode === 'number' ? db.get('SELECT * FROM lab_requests WHERE id=?', [idOrCode]) : findByCode('lab_requests', 'lab_code', idOrCode);
    if (!r0) fail('درخواست آزمایش با این کد پیدا نشد');
    const r = labRequestsFull([db.get('SELECT * FROM v_lab_requests WHERE id=?', [r0.id])])[0];
    r.patient = db.get('SELECT * FROM patients WHERE id=?', [r.patient_id]);
    r.payments = db.all('SELECT * FROM lab_payments WHERE request_id=? ORDER BY id', [r.id]);
    // tests to fill: panels expand to their components
    const testIds = [];
    for (const it of r.items) {
      if (it.is_panel) db.all('SELECT pi.test_id FROM lab_panel_items pi JOIN lab_tests t ON t.id=pi.test_id WHERE pi.panel_id=? AND t.active=1 ORDER BY pi.sort', [it.test_id]).forEach(x => testIds.push([x.test_id, it.test_id]));
      else testIds.push([it.test_id, null]);
    }
    const ids = [...new Set(testIds.map(x => x[0]))];
    r.tests = ids.length ? db.all(`SELECT t.*, d.name dept_name, d.name_fa dept_name_fa, d.sort dept_sort FROM lab_tests t LEFT JOIN lab_departments d ON d.id=t.department_id WHERE t.id IN (${ids.join(',')})`) : [];
    const resKit = new Map(db.all('SELECT test_id, kit_id FROM lab_results WHERE request_id=?', [r.id]).map(x => [x.test_id, x.kit_id]));
    r.tests.forEach(t => {
      const kitId = resKit.get(t.id) || t.active_kit_id || null;
      t.kit = kitId ? db.get('SELECT * FROM lab_kits WHERE id=?', [kitId]) : null;
      t.panel_id = (testIds.find(x => x[0] === t.id) || [])[1]; t.ranges = db.all('SELECT * FROM lab_ranges WHERE test_id=? AND (kit_id IS NULL OR kit_id=?)', [t.id, kitId || 0]);
      if (t.ranges.some(x => x.kit_id)) t.ranges = t.ranges.filter(x => x.kit_id);   // the kit's own ranges replace the general ones
      if (t.panel_id) { const pt = db.get('SELECT t.department_id, d.name, d.name_fa, d.sort FROM lab_tests t LEFT JOIN lab_departments d ON d.id=t.department_id WHERE t.id=?', [t.panel_id]); if (pt) Object.assign(t, { page_dept: pt.name, page_dept_fa: pt.name_fa, page_sort: pt.sort }); }
      if (!t.page_dept) Object.assign(t, { page_dept: t.dept_name, page_dept_fa: t.dept_name_fa, page_sort: t.dept_sort });
    });
    r.tests.sort((a, b) => testIds.findIndex(x => x[0] === a.id) - testIds.findIndex(x => x[0] === b.id));
    r.prev = labPrevResults(r.patient_id, ids, r.id);
    r.reception = r.reception_type_id ? db.get('SELECT * FROM lab_reception_types WHERE id=?', [r.reception_type_id]) : null;
    const uname = (id) => id ? db.scalar('SELECT full_name FROM users WHERE id=?', [id]) : null;
    r.received_by_name = uname(r.received_by); r.checked_by_name = uname(r.checked_by); r.approved_by_name = uname(r.approved_by); r.sampled_by_name = uname(r.sampled_by); r.created_by_name = uname(r.created_by);
    r.prev_id = db.scalar("SELECT MAX(id) FROM lab_requests WHERE id<? AND status NOT IN ('cancelled','requested')", [r.id]);
    r.next_id = db.scalar("SELECT MIN(id) FROM lab_requests WHERE id>? AND status NOT IN ('cancelled','requested')", [r.id]);
    return r;
  }
  // last 4 answers of each test for this patient (within the configured months) → "Prev Res 1-4" columns
  function labPrevResults(patientId, testIds, excludeReq) {
    if (!testIds.length) return {};
    const months = Math.max(0, n(setting('lab_prev_months', '6'), 6));
    const from = (() => { const d = new Date(); d.setMonth(d.getMonth() - (months || 120)); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; })();
    const rows = db.all(`SELECT x.test_id, x.value, x.flag, x.unit, r.date, r.lab_code, r.id request_id FROM lab_results x JOIN lab_requests r ON r.id=x.request_id
      WHERE r.patient_id=? AND r.id<>? AND r.status NOT IN ('cancelled') AND r.date>=? AND x.test_id IN (${testIds.map(Number).join(',')}) AND IFNULL(x.value,'')<>'' ORDER BY r.date DESC, r.id DESC`, [patientId, excludeReq || 0, from]);
    const out = {};
    for (const x of rows) { (out[x.test_id] = out[x.test_id] || []); if (out[x.test_id].length < 4) out[x.test_id].push(x); }
    return out;
  }
  // full history of one test for one patient (trend chart)
  function labTestHistory(patientId, testId) {
    return db.all(`SELECT x.value, x.flag, x.unit, x.ref, r.date, r.lab_code FROM lab_results x JOIN lab_requests r ON r.id=x.request_id
      WHERE r.patient_id=? AND x.test_id=? AND r.status<>'cancelled' AND IFNULL(x.value,'')<>'' ORDER BY r.date, r.id`, [patientId, testId]);
  }
  function createLabWalkin(p, user) {
    return db.transaction(() => {
      let patientId = p.patient_id;
      if (p.patient) patientId = savePatient({ ...p.patient, id: patientId || undefined }, user);
      if (!patientId) fail('مریض را انتخاب یا ثبت کنید');
      const ids = [...new Set((p.test_ids || []).map(Number).filter(Boolean))]; if (!ids.length) fail('آزمایش انتخاب نشده');
      const head = labHead(p);
      checkReceptionType(head.reception_type_id, patientId);
      const reqId = db.insert('lab_requests', { ...head, lab_code: db.nextCode('lab'), patient_id: patientId, doctor_id: p.doctor_id || null, date: today(), source: 'walkin', created_by: user.id });
      setLabItems(reqId, ids);
      emit('lab:new', db.get('SELECT * FROM v_lab_requests WHERE id=?', [reqId]), ['lab', 'admin']);
      return reqId;
    });
  }
  function receiveLab(id, p, user, station) {
    return db.transaction(() => {
      const r0 = db.get('SELECT * FROM lab_requests WHERE id=?', [id]); if (!r0) fail('درخواست پیدا نشد');
      if (r0.status === 'cancelled') fail('این درخواست لغو شده');
      const head = labHead(p);
      if (Object.keys(head).length) {
        if ('reception_type_id' in head && head.reception_type_id !== r0.reception_type_id) checkReceptionType(head.reception_type_id, r0.patient_id);
        db.update('lab_requests', id, head);
        if ('reception_type_id' in head && head.reception_type_id !== r0.reception_type_id && !p.test_ids) setLabItems(id, db.all('SELECT test_id FROM lab_request_items WHERE request_id=? ORDER BY sort, id', [id]).map(x => x.test_id));
      }
      const r = db.get('SELECT * FROM lab_requests WHERE id=?', [id]);
      if (p.test_ids) {
        const ids = [...new Set(p.test_ids.map(Number).filter(Boolean))]; if (!ids.length) fail('حداقل یک آزمایش لازم است');
        const old = db.all('SELECT test_id FROM lab_request_items WHERE request_id=? ORDER BY sort, id', [id]).map(x => x.test_id);
        if (JSON.stringify(old) !== JSON.stringify(ids) || 'reception_type_id' in head) setLabItems(id, ids);
      }
      const sub = db.scalar('SELECT IFNULL(SUM(price),0) FROM lab_request_items WHERE request_id=?', [id]);
      const share = r2(sub - n(db.scalar('SELECT IFNULL(SUM(org_share),0) FROM lab_request_items WHERE request_id=?', [id])));
      const pct = n(p.discount_pct ?? (r.discount_pct || receptionType(r.reception_type_id).discount_pct));
      let discount = p.discount !== undefined && p.discount !== '' && p.discount !== null ? n(p.discount) : r2(share * pct / 100);
      discount = Math.min(share, Math.max(0, discount));
      const rr = db.get('SELECT * FROM lab_requests WHERE id=?', [id]);
      if (discount > 0.001 && setting('lab_discount_reason_required', '0') === '1' && !rr.discount_reason && !rr.discount_pct && !receptionType(rr.reception_type_id).discount_pct) fail('برای تخفیف، دلیل و نام تخفیف دهنده را بنویسید');
      const net = r2(share - discount);
      const row = { subtotal: r2(sub), discount, net, pay_method: p.pay_method || r.pay_method };
      if (r.status === 'requested') Object.assign(row, { status: 'received', received_at: nowStr(), received_by: user.id });
      if (!rr.answer_date) row.answer_date = labAnswerDate(id, rr.urgent);
      db.update('lab_requests', id, row);
      const central = setting('cashier_mode', 'central') === 'central' && (station || user.station) === 'lab';
      const pay = p.paid === undefined || p.paid === null || p.paid === '' ? (r.status === 'requested' && !central ? net - r.paid : 0) : n(p.paid);
      if (pay) { db.insert('lab_payments', { request_id: id, amount: r2(pay), method: p.pay_method || 'cash', station: station || user.station || null, created_by: user.id }); db.update('lab_requests', id, { paid: r2(r.paid + pay) }); }
      applyLabConsumption(id, user);
      const out = labFull(id);
      emit('lab:update', { id, lab_code: out.lab_code, status: out.status }, ['lab', 'admin', 'doctor'], { doctor_id: out.doctor_id });
      return out;
    });
  }
  // answer date = today + max turnaround of the tests (or the setting); urgent → today; skip days the tests are not done
  function labAnswerDate(reqId, urgent) {
    const d = new Date(); if (urgent) return today();
    const tats = db.all('SELECT t.tat_days, t.tat_hours, t.weekdays FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id WHERE i.request_id=?', [reqId]);
    let days = Math.max(n(setting('lab_answer_days', '1')), ...tats.map(t => t.tat_days != null ? n(t.tat_days) : t.tat_hours ? Math.ceil(n(t.tat_hours) / 24) : 0));
    d.setDate(d.getDate() + Math.ceil(days));
    const wd = tats.map(t => String(t.weekdays || '')).filter(Boolean);
    for (let k = 0; k < 7 && wd.length && !wd.every(w => w.includes(String(d.getDay()))); k++) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function payLab(id, amount, method, user, station) {
    return db.transaction(() => {
      const r = db.get('SELECT * FROM lab_requests WHERE id=?', [id]); if (!r) fail('درخواست پیدا نشد');
      const a = r2(amount); if (!a) fail('مبلغ را وارد کنید');
      db.insert('lab_payments', { request_id: id, amount: a, method: method || 'cash', station: station || user.station || null, created_by: user.id });
      db.update('lab_requests', id, { paid: r2(r.paid + a) });
      return labFull(id);
    });
  }
  function saveLabResults(id, p, user) {
    return db.transaction(() => {
      const r = db.get('SELECT * FROM lab_requests WHERE id=?', [id]); if (!r) fail('درخواست پیدا نشد');
      if (r.status === 'requested') fail('ابتدا درخواست را پذیرش (و فیس را دریافت) کنید');
      if (['approved', 'delivered'].includes(r.status) && (p.results || []).some(x => str(x.value) !== null) && p.status !== 'received' && setting('lab_lock_approved', '1') === '1') fail('نتایج تأیید شده؛ اول «باز کردن برای اصلاح» را بزنید');
      for (const x of p.results || []) {
        const val = str(x.value);
        if (val === null) { db.run('DELETE FROM lab_results WHERE request_id=? AND test_id=?', [id, x.test_id]); continue; }
        const t = db.get('SELECT * FROM lab_tests WHERE id=?', [x.test_id]) || {};
        const numv = Number(String(val).replace(/^[<>]=?\s*/, ''));
        if (t.numeric_only && t.result_type === 'numeric' && !isFinite(numv)) fail(`نتیجه «${t.name}» باید عدد باشد`);
        if (t.result_type === 'numeric' && isFinite(numv) && ((t.possible_low != null && numv < t.possible_low) || (t.possible_high != null && numv > t.possible_high))) fail(`نتیجه «${t.name}» (${val}) خارج از محدوده ممکن است (${t.possible_low ?? ''} – ${t.possible_high ?? ''})`);
        const kit = db.scalar('SELECT kit_id FROM lab_results WHERE request_id=? AND test_id=?', [id, x.test_id]) || t.active_kit_id || null;
        db.run(`INSERT INTO lab_results(request_id,test_id,value,flag,unit,ref,note,entered_by,kit_id) VALUES(?,?,?,?,?,?,?,?,?)
          ON CONFLICT(request_id,test_id) DO UPDATE SET value=excluded.value, flag=excluded.flag, unit=excluded.unit, ref=excluded.ref, note=excluded.note, entered_by=excluded.entered_by, kit_id=excluded.kit_id, entered_at=datetime('now','localtime')`,
          [id, x.test_id, val, str(x.flag), str(x.unit), str(x.ref), str(x.note), user.id, kit]);
      }
      const row = {};
      if ('report_note' in p) row.report_note = str(p.report_note);
      if (p.status === 'completed' && ['received', 'completed'].includes(r.status)) Object.assign(row, { status: 'completed', completed_at: nowStr(), checked_by: user.id });
      if (p.status === 'approved') Object.assign(row, { status: 'approved', approved_at: nowStr(), approved_by: user.id, completed_at: r.completed_at || nowStr(), checked_by: r.checked_by || user.id });
      if (p.status === 'delivered') Object.assign(row, { status: 'delivered', delivered_at: nowStr() });
      if (p.status === 'received' && ['completed', 'approved'].includes(r.status)) Object.assign(row, { status: 'received', approved_at: null, approved_by: null });
      if (Object.keys(row).length) db.update('lab_requests', id, row);
      const out = labFull(id);
      if (row.status === 'approved') emit('lab:result', { id, lab_code: out.lab_code, patient_id: out.patient_id, full_name: out.full_name }, ['doctor', 'admin', 'lab'], { doctor_id: out.doctor_id });
      else emit('lab:update', { id, lab_code: out.lab_code, status: out.status }, ['lab', 'admin']);
      return out;
    });
  }
  function saveLabTest(t, user) {
    return db.transaction(() => {
      const F = ['code', 'name', 'name_fa', 'sample', 'result_type', 'options', 'unit', 'ref_text', 'formula',
        'weekdays', 'sample_amount', 'tube', 'tube_sep', 'loinc', 'machine_code', 'sendout_lab', 'default_answer', 'ready_answers', 'sex_only', 'description', 'report_name'];
      const N = ['ref_low', 'ref_high', 'critical_low', 'critical_high', 'decimals', 'num_code', 'department_id', 'tat_hours',
        'tat_days', 'price_ins', 'sendout_cost', 'possible_low', 'possible_high', 'active_kit_id', 'sort'];
      const row = {};
      for (const f of F) if (f in t) row[f] = str(t[f]);
      for (const f of N) if (f in t) row[f] = t[f] === '' || t[f] == null ? null : n(t[f]);
      for (const f of ['price', 'cost']) if (f in t) row[f] = Math.max(0, n(t[f]));
      for (const f of ['active', 'orderable', 'is_panel', 'numeric_only', 'critical_report', 'side_column']) if (f in t) row[f] = t[f] ? 1 : 0;
      let id = t.id ? Number(t.id) : null;
      if (row.code) { const dup = db.get('SELECT id FROM lab_tests WHERE code=? AND id<>?', [row.code, id || 0]); if (dup) fail('این کد آزمایش تکراری است'); }
      if (id) db.update('lab_tests', id, row);
      else { if (!row.code || !row.name) fail('کد و نام آزمایش الزامی است'); id = db.insert('lab_tests', { result_type: 'numeric', ...row }); }
      if (Array.isArray(t.components)) {
        db.run('DELETE FROM lab_panel_items WHERE panel_id=?', [id]);
        t.components.forEach((cid, i) => db.insert('lab_panel_items', { panel_id: id, test_id: Number(cid), sort: i + 1 }));
      }
      if (Array.isArray(t.items)) {
        db.run('DELETE FROM lab_test_items WHERE test_id=?', [id]);
        for (const it of t.items) if (it.item_id && n(it.qty) > 0) db.run('INSERT OR REPLACE INTO lab_test_items(test_id,item_id,qty) VALUES(?,?,?)', [id, Number(it.item_id), n(it.qty)]);
      }
      if (Array.isArray(t.ranges)) {
        db.run('DELETE FROM lab_ranges WHERE test_id=?', [id]);
        const nv = (x) => x === '' || x === undefined || x === null ? null : n(x);
        for (const r of t.ranges) db.insert('lab_ranges', { test_id: id, sex: ['M', 'F'].includes(r.sex) ? r.sex : 'A', age_min_days: nv(r.age_min_days), age_max_days: nv(r.age_max_days), low: nv(r.low), high: nv(r.high), text: str(r.text),
          kit_id: r.kit_id ? Number(r.kit_id) : null, alarm_low: nv(r.alarm_low), alarm_high: nv(r.alarm_high), crit_low: nv(r.crit_low), crit_high: nv(r.crit_high), min_valid: nv(r.min_valid), max_valid: nv(r.max_valid) });
      }
      return id;
    });
  }


  // =================================================================== laboratory: kits, re-flagging, reports
  function saveLabKit(k, user) {
    return db.transaction(() => {
      const t = db.get('SELECT id FROM lab_tests WHERE id=?', [k.test_id]); if (!t) fail('آزمایش پیدا نشد');
      if (k.remove) { db.run('DELETE FROM lab_ranges WHERE kit_id=?', [k.remove]); db.run('DELETE FROM lab_kits WHERE id=?', [k.remove]); db.run('UPDATE lab_tests SET active_kit_id=NULL WHERE active_kit_id=?', [k.remove]); return null; }
      const row = { test_id: t.id, name: str(k.name) || 'Kit', lot_no: str(k.lot_no), expiry: str(k.expiry), method: str(k.method), company: str(k.company) };
      let id = k.id ? Number(k.id) : null;
      if (id) db.update('lab_kits', id, row); else id = db.insert('lab_kits', row);
      if (k.copy_ranges_from !== undefined && !k.id) {                       // a new kit starts with the ranges in use
        const src = k.copy_ranges_from ? db.all('SELECT * FROM lab_ranges WHERE test_id=? AND kit_id=?', [t.id, k.copy_ranges_from]) : db.all('SELECT * FROM lab_ranges WHERE test_id=? AND kit_id IS NULL', [t.id]);
        for (const r of src) { const { id: _x, ...rest } = r; db.insert('lab_ranges', { ...rest, kit_id: id }); }
        if (!src.length) {                                                 // no age / sex rows yet: start from the general normal range
          const tt = db.get('SELECT * FROM lab_tests WHERE id=?', [t.id]);
          db.insert('lab_ranges', { test_id: t.id, kit_id: id, sex: 'A', low: tt.ref_low, high: tt.ref_high, text: tt.ref_text, crit_low: tt.critical_low, crit_high: tt.critical_high, min_valid: tt.possible_low, max_valid: tt.possible_high });
        }
      }
      if (k.active) { db.run('UPDATE lab_kits SET active=0 WHERE test_id=?', [t.id]); db.update('lab_kits', id, { active: 1 }); db.update('lab_tests', t.id, { active_kit_id: id }); }
      else if (k.active === false || k.active === 0) { db.update('lab_kits', id, { active: 0 }); db.run('UPDATE lab_tests SET active_kit_id=NULL WHERE id=? AND active_kit_id=?', [t.id, id]); }
      return db.get('SELECT * FROM lab_kits WHERE id=?', [id]);
    });
  }
  // server copy of the range / flag logic (same as the result-entry screen)
  function ageDaysAt(birth, at) { if (!birth) return null; const b = new Date(birth + 'T12:00:00'), a = new Date(String(at).slice(0, 10) + 'T12:00:00'); return Math.max(0, Math.round((a - b) / 864e5)); }
  function rangeFor(test, ranges, sex, ageDays) {
    const rs = ranges.filter(r => (r.sex === 'A' || r.sex === sex) && (r.age_min_days == null || ageDays == null || ageDays >= r.age_min_days) && (r.age_max_days == null || ageDays == null || ageDays < r.age_max_days));
    const span = (x) => (x.age_max_days ?? 1e7) - (x.age_min_days ?? 0);
    rs.sort((a, b) => (b.sex !== 'A') - (a.sex !== 'A') || span(a) - span(b));
    return rs[0] || { low: test.ref_low, high: test.ref_high, text: test.ref_text, crit_low: test.critical_low, crit_high: test.critical_high };
  }
  function flagFor(test, value, rg) {
    const v = Number(String(value ?? '').trim().replace(/^[<>]=?\s*/, '')); if (test.result_type !== 'numeric' || !isFinite(v) || String(value).trim() === '') return null;
    const cl = rg.crit_low ?? test.critical_low, ch = rg.crit_high ?? test.critical_high;
    if (cl != null && v < cl) return 'LL'; if (ch != null && v > ch) return 'HH';
    if (rg.low != null && v < rg.low) return 'L'; if (rg.high != null && v > rg.high) return 'H'; return null;
  }
  function refText(test, rg) { if (rg.text) return rg.text; if (rg.low != null && rg.high != null) return `${rg.low} - ${rg.high}`; if (rg.low != null) return `≥ ${rg.low}`; if (rg.high != null) return `≤ ${rg.high}`; return test.ref_text || ''; }
  // "apply the changed normal ranges to the answers of a date range" (by reception or answer date)
  function applyRanges(p, user) {
    return db.transaction(() => {
      const t = db.get('SELECT * FROM lab_tests WHERE id=?', [p.test_id]); if (!t) fail('آزمایش پیدا نشد');
      if (!isoOk(p.from) || !isoOk(p.to)) fail('بازه تاریخ نامعتبر');
      const kit = t.active_kit_id || null;
      let ranges = db.all('SELECT * FROM lab_ranges WHERE test_id=? AND (kit_id IS NULL OR kit_id=?)', [t.id, kit || 0]); if (ranges.some(x => x.kit_id)) ranges = ranges.filter(x => x.kit_id);
      const col = p.basis === 'answer' ? 'DATE(IFNULL(r.approved_at, r.completed_at))' : 'r.date';
      const rows = db.all(`SELECT x.id, x.value, r.date, p.sex, p.birth_date FROM lab_results x JOIN lab_requests r ON r.id=x.request_id JOIN patients p ON p.id=r.patient_id WHERE x.test_id=? AND ${col} BETWEEN ? AND ?`, [t.id, p.from, p.to]);
      let changed = 0;
      for (const x of rows) { const rg = rangeFor(t, ranges, x.sex, ageDaysAt(x.birth_date, x.date)); db.run('UPDATE lab_results SET flag=?, ref=?, kit_id=? WHERE id=?', [flagFor(t, x.value, rg), refText(t, rg), kit, x.id]); changed++; }
      return { changed };
    });
  }
  // tests of these ids already registered for the patient today (warning "repeated test in one day")
  function labRepeatCheck(patientId, testIds, excludeId, days) {
    if (!patientId || !testIds.length) return [];
    const from = (() => { const d = new Date(); d.setDate(d.getDate() - (n(days) || 0)); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; })();
    return db.all(`SELECT i.test_id, i.name, r.lab_code, r.date FROM lab_request_items i JOIN lab_requests r ON r.id=i.request_id WHERE r.patient_id=? AND r.id<>? AND r.status<>'cancelled' AND r.date>=? AND i.test_id IN (${testIds.map(Number).join(',')})`, [patientId, excludeId || 0, from]);
  }
  // patient statistics (آمار مراجعین) with the filters of the lab's previous program
  function labStats(f) {
    const w = ['r.date BETWEEN ? AND ?'], P = [isoOk(f.from) ? f.from : today(), isoOk(f.to) ? f.to : (isoOk(f.from) ? f.from : today())];
    if (f.time_from) { w.push("substr(r.created_at,12,5) >= ?"); P.push(f.time_from); }
    if (f.time_to) { w.push("substr(r.created_at,12,5) <= ?"); P.push(f.time_to); }
    if (f.no_from) { w.push("CAST(substr(r.lab_code, length(rtrim(r.lab_code,'0123456789'))+1) AS INTEGER) >= ?"); P.push(n(f.no_from)); }
    if (f.no_to) { w.push("CAST(substr(r.lab_code, length(rtrim(r.lab_code,'0123456789'))+1) AS INTEGER) <= ?"); P.push(n(f.no_to)); }
    if (f.cancelled === 'only') w.push("r.status='cancelled'"); else if (f.cancelled !== 'all') w.push("r.status<>'cancelled'");
    if (f.billed !== 'all') w.push("r.status<>'requested'");
    if (f.pay === 'settled') w.push('ABS(r.net - r.paid) <= 0.001'); if (f.pay === 'debtor') w.push('r.net - r.paid > 0.001'); if (f.pay === 'creditor') w.push('r.paid - r.net > 0.001');
    if (f.urgent === '1') w.push('r.urgent=1'); if (f.urgent === '0') w.push('IFNULL(r.urgent,0)=0');
    if (f.answer === 'complete') w.push("r.status IN ('completed','approved','delivered')"); if (f.answer === 'incomplete') w.push("r.status IN ('requested','received')");
    if (f.discount === '1') w.push('r.discount > 0'); if (f.discount === '0') w.push('IFNULL(r.discount,0) = 0');
    if (f.discount_by) { w.push('r.discount_by = ?'); P.push(f.discount_by); }
    if (f.discount_reason) { w.push('r.discount_reason = ?'); P.push(f.discount_reason); }
    if (f.sex) { w.push('p.sex = ?'); P.push(f.sex); }
    if (f.source) { w.push('r.source = ?'); P.push(f.source); }
    if (f.sendout === '1') w.push('IFNULL(r.sendout,0)=1'); if (f.sendout === '0') w.push('IFNULL(r.sendout,0)=0');
    if (f.reception_type_id) { w.push('r.reception_type_id = ?'); P.push(Number(f.reception_type_id)); }
    if (f.user_id) { w.push('r.created_by = ?'); P.push(Number(f.user_id)); }
    const list = (k) => String(f[k] || '').split(',').map(Number).filter(Boolean);
    if (list('doctor_ids').length || list('referrer_ids').length) { const a = []; if (list('doctor_ids').length) a.push(`r.doctor_id IN (${list('doctor_ids').join(',')})`); if (list('referrer_ids').length) a.push(`r.referrer_id IN (${list('referrer_ids').join(',')})`); w.push('(' + a.join(' OR ') + ')'); }
    if (f.specialty) { w.push('(rf.specialty = ? OR md.name = ?)'); P.push(f.specialty, f.specialty); }
    if (list('dept_ids').length) w.push(`EXISTS (SELECT 1 FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id WHERE i.request_id=r.id AND t.department_id IN (${list('dept_ids').join(',')}))`);
    if (list('test_ids').length) w.push(`EXISTS (SELECT 1 FROM lab_request_items i WHERE i.request_id=r.id AND i.test_id IN (${list('test_ids').join(',')}))`);
    const W = w.join(' AND ');
    const FROM = `FROM lab_requests r JOIN patients p ON p.id=r.patient_id LEFT JOIN doctors d ON d.id=r.doctor_id LEFT JOIN medical_departments md ON md.id=d.department_id LEFT JOIN lab_referrers rf ON rf.id=r.referrer_id LEFT JOIN lab_reception_types rt ON rt.id=r.reception_type_id LEFT JOIN users u ON u.id=r.created_by`;
    const rows = db.all(`SELECT r.id, r.lab_code, r.date, r.created_at, r.status, r.urgent, r.source, r.subtotal, IFNULL(r.org_share,0) org_share, r.discount, r.discount_reason, r.discount_by, r.net, r.paid, (r.net - r.paid) balance,
      p.code patient_code, p.full_name, p.father_name, p.sex, p.tazkira, p.phone, COALESCE(d.name, rf.name, r.referrer) doctor_name, COALESCE(rf.specialty, md.name) specialty, rt.name reception_type, u.full_name user_name,
      (SELECT GROUP_CONCAT(t.code, ' ') FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id WHERE i.request_id=r.id) tests
      ${FROM} WHERE ${W} ORDER BY r.id`, P);
    const ids = rows.map(r => r.id); const IN = ids.length ? ids.join(',') : '0';
    const pays = db.all(`SELECT method, SUM(amount) s, COUNT(*) c FROM lab_payments WHERE request_id IN (${IN}) GROUP BY method`);
    const sum = (k) => r2(rows.reduce((a, r) => a + (r[k] || 0), 0));
    const totals = { count: rows.length, subtotal: sum('subtotal'), org_share: sum('org_share'), patient_share: r2(sum('subtotal') - sum('org_share')), discount: sum('discount'), net: sum('net'), paid: sum('paid'), balance: sum('balance'),
      cash: r2(pays.filter(x => x.method !== 'card' && x.method !== 'transfer').reduce((a, x) => a + x.s, 0)), card: r2(pays.filter(x => x.method === 'card').reduce((a, x) => a + x.s, 0)), transfer: r2(pays.filter(x => x.method === 'transfer').reduce((a, x) => a + x.s, 0)) };
    const group = (keyFn) => { const m = new Map(); for (const r of rows) { const k = keyFn(r) || '—'; const o = m.get(k) || { key: k, count: 0, subtotal: 0, discount: 0, net: 0, paid: 0 }; o.count++; o.subtotal = r2(o.subtotal + r.subtotal); o.discount = r2(o.discount + r.discount); o.net = r2(o.net + r.net); o.paid = r2(o.paid + r.paid); m.set(k, o); } return [...m.values()]; };
    const byHour = group(r => String(r.created_at || '').slice(11, 13) + ':00').sort((a, b) => a.key.localeCompare(b.key));
    const byDay = group(r => r.date).sort((a, b) => a.key.localeCompare(b.key));
    const discounts = group(r => r.discount > 0 ? `${r.discount_by || 'نامشخص'} — ${r.discount_reason || 'بدون دلیل'}` : null).filter(x => x.key !== '—').sort((a, b) => b.discount - a.discount);
    const byType = group(r => r.reception_type || 'عادی');
    const byTest = db.all(`SELECT t.id, t.code, t.name, d.name dept, COUNT(*) count, SUM(i.price) revenue, SUM(IFNULL(i.org_share,0)) org FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id LEFT JOIN lab_departments d ON d.id=t.department_id WHERE i.request_id IN (${IN}) GROUP BY t.id ORDER BY count DESC`);
    const repeated = db.all(`SELECT p.code patient_code, p.full_name, t.code, t.name, COUNT(*) times, GROUP_CONCAT(r.lab_code, ' ') codes FROM lab_request_items i JOIN lab_requests r ON r.id=i.request_id JOIN patients p ON p.id=r.patient_id JOIN lab_tests t ON t.id=i.test_id
      WHERE i.request_id IN (${IN}) GROUP BY r.patient_id, i.test_id HAVING COUNT(*) > 1 ORDER BY times DESC`);
    const sampled = rows.filter(r => db.scalar('SELECT sampled_at FROM lab_requests WHERE id=?', [r.id])).length;
    return { rows, totals, pays, byHour, byDay, discounts, byType, byTest, repeated, sampled };
  }
  // income of referring doctors (clinic doctors and outside referrers) + monthly trend of referred patients
  function labDoctorIncome(f) {
    const from = isoOk(f.from) ? f.from : today(), to = isoOk(f.to) ? f.to : from;
    const w = ["r.status NOT IN ('cancelled','requested')", 'r.date BETWEEN ? AND ?'], P = [from, to];
    if (f.source) { w.push('r.source=?'); P.push(f.source); }
    if (f.dept_id) { w.push('EXISTS (SELECT 1 FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id WHERE i.request_id=r.id AND t.department_id=?)'); P.push(Number(f.dept_id)); }
    const rows = db.all(`SELECT CASE WHEN r.doctor_id IS NOT NULL THEN 'd' || r.doctor_id WHEN r.referrer_id IS NOT NULL THEN 'r' || r.referrer_id WHEN IFNULL(r.referrer,'')<>'' THEN 'n' || r.referrer ELSE '-' END k,
      COALESCE(d.title || ' ' || d.name, d.name, rf.name, NULLIF(r.referrer,''), 'مراجعه مستقیم') name, rf.council_no, COALESCE(rf.specialty, md.name, d.specialty) specialty,
      COUNT(DISTINCT r.patient_id) patients, COUNT(*) requests,
      SUM(r.subtotal) income, SUM(r.discount) discount, SUM(r.net) net, SUM(r.paid) paid
      FROM lab_requests r LEFT JOIN doctors d ON d.id=r.doctor_id LEFT JOIN medical_departments md ON md.id=d.department_id LEFT JOIN lab_referrers rf ON rf.id=r.referrer_id
      WHERE ${w.join(' AND ')} GROUP BY k ORDER BY income DESC`, P);
    rows.forEach(r => { r.tests = db.scalar(`SELECT COUNT(*) FROM lab_request_items i JOIN lab_requests r ON r.id=i.request_id WHERE ${w.join(' AND ')} AND (CASE WHEN r.doctor_id IS NOT NULL THEN 'd' || r.doctor_id WHEN r.referrer_id IS NOT NULL THEN 'r' || r.referrer_id WHEN IFNULL(r.referrer,'')<>'' THEN 'n' || r.referrer ELSE '-' END)=?`, [...P, r.k]); });
    const trend = db.all(`SELECT r.date, CASE WHEN r.doctor_id IS NOT NULL THEN 'd' || r.doctor_id WHEN r.referrer_id IS NOT NULL THEN 'r' || r.referrer_id WHEN IFNULL(r.referrer,'')<>'' THEN 'n' || r.referrer ELSE '-' END k, COUNT(*) c, SUM(r.subtotal) s
      FROM lab_requests r WHERE r.status NOT IN ('cancelled','requested') AND r.date BETWEEN ? AND ? GROUP BY r.date, k`, [f.trend_from || from, f.trend_to || to]);
    return { rows, trend };
  }

  // =================================================================== central cashier (reception)
  function paySale(id, amount, method, note, user, station) {
    return db.transaction(() => {
      const s = db.get('SELECT * FROM sales WHERE id=?', [id]); if (!s) fail('فروش پیدا نشد');
      const a = r2(amount); if (!a) fail('مبلغ را وارد کنید');
      db.insert('sale_payments', { sale_id: id, amount: a, method: method || 'cash', note: str(note), station: station || user.station || null, created_by: user.id });
      db.update('sales', id, { paid: r2(s.paid + a) });
      const out = saleFull(id);
      emit('sale:paid', { id, sale_code: out.sale_code, rx_code: out.rx_code, patient_name: out.patient_name, paid: out.paid, net: out.net, balance: out.balance }, ['pharmacy', 'stock', 'admin', 'reception']);
      return out;
    });
  }
  function depositBalance(patientId) { return r2(db.scalar('SELECT IFNULL(SUM(amount),0) FROM patient_deposits WHERE patient_id=?', [patientId])); }
  function addDeposit(patientId, amount, method, note, user, ref) {
    const a = r2(amount); if (!a) fail('مبلغ را وارد کنید');
    if (!db.get('SELECT id FROM patients WHERE id=?', [patientId])) fail('مریض پیدا نشد');
    if (a < 0 && depositBalance(patientId) + a < -0.001) fail('پول امانت مریض کافی نیست (موجود ' + depositBalance(patientId) + ')');
    db.insert('patient_deposits', { patient_id: patientId, amount: a, method: method || 'cash', note: str(note), ref_type: ref?.type || null, ref_id: ref?.id || null, station: user.station || null, created_by: user.id });
    return depositBalance(patientId);
  }
  // kind: visit | lab | sale | admission — amount may be negative (refund). from_deposit uses the patient's advance money.
  function cashierPay(p, user) {
    return db.transaction(() => {
      const st = user.station === 'browser' ? 'reception' : (user.station || 'reception');
      const id = Number(p.id); let amount = r2(p.amount); const method = p.from_deposit ? 'deposit' : (p.method || 'cash');
      const pid = { visit: 'SELECT patient_id FROM visits WHERE id=?', lab: 'SELECT patient_id FROM lab_requests WHERE id=?', sale: 'SELECT patient_id FROM sales WHERE id=?', admission: 'SELECT patient_id FROM admissions WHERE id=?' }[p.kind];
      if (!pid) fail('نوع بل نامعتبر');
      const patientId = db.scalar(pid, [id]);
      if (p.from_deposit) { if (!patientId) fail('این بل به مریض ثبت شده وصل نیست'); addDeposit(patientId, -amount, 'deposit', 'استفاده از پول امانت', user, { type: p.kind, id }); }
      let out;
      if (p.kind === 'visit') out = payVisit(id, amount, method, p.note, user, st);
      else if (p.kind === 'lab') {
        const r = db.get('SELECT * FROM lab_requests WHERE id=?', [id]); if (!r) fail('درخواست پیدا نشد');
        if (r.status === 'requested') out = receiveLab(id, { discount: p.discount, discount_pct: p.discount_pct, test_ids: p.test_ids, paid: amount, pay_method: method }, user, st);
        else out = payLab(id, amount, method, user, st);
        emit('lab:paid', { id, lab_code: out.lab_code, paid: out.paid, net: out.net }, ['lab', 'admin', 'reception']);
      }
      else if (p.kind === 'sale') out = paySale(id, amount, method, p.note, user, st);
      else out = payAdmission(id, amount, method, p.note, user, st);
      return { kind: p.kind, id, data: out, deposit: patientId ? depositBalance(patientId) : 0 };
    });
  }
  function cashierPending() {
    refreshRunningAdmissions();
    return {
      visits: db.all("SELECT * FROM v_visits WHERE status NOT IN ('cancelled') AND ABS(net - paid) > 0.001 ORDER BY visit_date DESC, id DESC LIMIT 300"),
      labs: db.all("SELECT * FROM v_lab_requests WHERE status<>'cancelled' AND (status='requested' OR net - paid > 0.001) ORDER BY id DESC LIMIT 300"),
      sales: db.all("SELECT * FROM v_sales WHERE status<>'void' AND ABS(net - returned - paid) > 0.001 ORDER BY id DESC LIMIT 300"),
      admissions: db.all("SELECT * FROM v_admissions WHERE status<>'cancelled' AND (status='admitted' OR ABS(net - paid) > 0.001) ORDER BY id DESC LIMIT 100")
    };
  }
  function patientAccount(patientId) {
    const patient = db.get('SELECT * FROM patients WHERE id=?', [patientId]); if (!patient) fail('مریض پیدا نشد');
    refreshRunningAdmissions();
    const P = [patientId];
    const visits = db.all('SELECT * FROM v_visits WHERE patient_id=? ORDER BY id DESC LIMIT 200', P);
    const labs = db.all("SELECT * FROM v_lab_requests WHERE patient_id=? AND status<>'cancelled' ORDER BY id DESC LIMIT 200", P);
    const sales = db.all("SELECT * FROM v_sales WHERE patient_id=? AND status<>'void' ORDER BY id DESC LIMIT 200", P);
    const admissions = db.all("SELECT * FROM v_admissions WHERE patient_id=? AND status<>'cancelled' ORDER BY id DESC LIMIT 50", P);
    const payments = db.all(`SELECT * FROM (
      SELECT 'visit' kind, vp.amount, vp.method, vp.note, vp.created_at, v.visit_no code, u.full_name user_name FROM visit_payments vp JOIN visits v ON v.id=vp.visit_id LEFT JOIN users u ON u.id=vp.created_by WHERE v.patient_id=?
      UNION ALL SELECT 'lab', lp.amount, lp.method, lp.note, lp.created_at, r.lab_code, u.full_name FROM lab_payments lp JOIN lab_requests r ON r.id=lp.request_id LEFT JOIN users u ON u.id=lp.created_by WHERE r.patient_id=?
      UNION ALL SELECT 'sale', sp.amount, sp.method, sp.note, sp.created_at, s.sale_code, u.full_name FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id LEFT JOIN users u ON u.id=sp.created_by WHERE s.patient_id=?
      UNION ALL SELECT 'admission', ap.amount, ap.method, ap.note, ap.created_at, a.adm_no, u.full_name FROM admission_payments ap JOIN admissions a ON a.id=ap.admission_id LEFT JOIN users u ON u.id=ap.created_by WHERE a.patient_id=?
      UNION ALL SELECT 'deposit', d.amount, d.method, d.note, d.created_at, '', u.full_name FROM patient_deposits d LEFT JOIN users u ON u.id=d.created_by WHERE d.patient_id=?
    ) ORDER BY created_at DESC LIMIT 300`, [patientId, patientId, patientId, patientId, patientId]);
    const due = r2(visits.reduce((a, v) => a + (v.status === 'cancelled' ? 0 : v.balance), 0) + labs.reduce((a, l) => a + l.balance, 0)
      + sales.reduce((a, x) => a + x.balance, 0) + admissions.reduce((a, x) => a + x.balance, 0));
    return { patient, visits, labs, sales, admissions, payments, deposit: depositBalance(patientId), due };
  }
  // every payment of the day, from every section (reception / pharmacy / laboratory / beds / deposits)
  function cashierDay(from, to) {
    if (!isoOk(from)) fail('تاریخ نامعتبر'); to = isoOk(to) ? to : from;
    const P = [from, to];
    const payments = db.all(`SELECT * FROM (
      SELECT 'visit' kind, vp.id, vp.amount, vp.method, vp.note, vp.station, vp.created_at, v.visit_no code, p.full_name, p.code patient_code, IFNULL(d.name, v.service_name) detail, v.doctor_id, u.full_name user_name
        FROM visit_payments vp JOIN visits v ON v.id=vp.visit_id JOIN patients p ON p.id=v.patient_id LEFT JOIN doctors d ON d.id=v.doctor_id LEFT JOIN users u ON u.id=vp.created_by WHERE DATE(vp.created_at) BETWEEN ? AND ?
      UNION ALL SELECT 'lab', lp.id, lp.amount, lp.method, lp.note, lp.station, lp.created_at, r.lab_code, p.full_name, p.code, NULL, r.doctor_id, u.full_name
        FROM lab_payments lp JOIN lab_requests r ON r.id=lp.request_id JOIN patients p ON p.id=r.patient_id LEFT JOIN users u ON u.id=lp.created_by WHERE DATE(lp.created_at) BETWEEN ? AND ?
      UNION ALL SELECT 'sale', sp.id, sp.amount, sp.method, sp.note, sp.station, sp.created_at, s.sale_code, IFNULL(p.full_name, s.patient_name), p.code, s.rx_code, s.doctor_id, u.full_name
        FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id LEFT JOIN patients p ON p.id=s.patient_id LEFT JOIN users u ON u.id=sp.created_by WHERE DATE(sp.created_at) BETWEEN ? AND ?
      UNION ALL SELECT 'admission', ap.id, ap.amount, ap.method, ap.note, ap.station, ap.created_at, a.adm_no, p.full_name, p.code, NULL, a.doctor_id, u.full_name
        FROM admission_payments ap JOIN admissions a ON a.id=ap.admission_id JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=ap.created_by WHERE DATE(ap.created_at) BETWEEN ? AND ?
      UNION ALL SELECT 'deposit', dp.id, dp.amount, dp.method, dp.note, dp.station, dp.created_at, '', p.full_name, p.code, NULL, NULL, u.full_name
        FROM patient_deposits dp JOIN patients p ON p.id=dp.patient_id LEFT JOIN users u ON u.id=dp.created_by WHERE DATE(dp.created_at) BETWEEN ? AND ? AND dp.method<>'deposit'
    ) ORDER BY created_at`, [...P, ...P, ...P, ...P, ...P]);
    const cash = payments.filter(x => x.method !== 'deposit');
    const sum = (f) => r2(cash.filter(f).reduce((a, x) => a + x.amount, 0));
    const byDoctor = db.all(`SELECT d.id, d.name, d.title, COUNT(DISTINCT v.id) visits, IFNULL(SUM(vp.amount),0) amount FROM visit_payments vp JOIN visits v ON v.id=vp.visit_id LEFT JOIN doctors d ON d.id=v.doctor_id
      WHERE DATE(vp.created_at) BETWEEN ? AND ? AND IFNULL(vp.method,'')<>'deposit' GROUP BY d.id ORDER BY amount DESC`, P);
    const withdrawals = db.all('SELECT * FROM withdrawals WHERE date BETWEEN ? AND ? ORDER BY id', P);
    const expenses = r2(db.scalar('SELECT IFNULL(SUM(paid),0) FROM expenses WHERE date BETWEEN ? AND ?', P));
    const totals = { visit: sum(x => x.kind === 'visit'), lab: sum(x => x.kind === 'lab'), sale: sum(x => x.kind === 'sale'), admission: sum(x => x.kind === 'admission'), deposit: sum(x => x.kind === 'deposit'),
      refunds: r2(-cash.filter(x => x.amount < 0).reduce((a, x) => a + x.amount, 0)), at_reception: sum(x => !x.station || x.station === 'reception' || x.station === 'browser' || x.station === 'admin'),
      at_sections: sum(x => x.station && !['reception', 'browser', 'admin'].includes(x.station)) };
    totals.all = r2(totals.visit + totals.lab + totals.sale + totals.admission + totals.deposit);
    totals.withdrawals = r2(withdrawals.reduce((a, w) => a + w.amount, 0));
    totals.expenses = expenses;
    totals.net = r2(totals.all - totals.withdrawals - expenses);
    const closes = db.all('SELECT c.*, u.full_name user_name FROM cash_closes c LEFT JOIN users u ON u.id=c.created_by WHERE c.date BETWEEN ? AND ? ORDER BY c.id', P);
    const open = cashierPending();
    const outstanding = { visits: r2(open.visits.filter(v => v.balance > 0).reduce((a, v) => a + v.balance, 0)), refunds_due: r2(-open.visits.filter(v => v.balance < 0).reduce((a, v) => a + v.balance, 0)),
      labs: r2(open.labs.reduce((a, l) => a + (l.status === 'requested' ? 0 : l.balance), 0)), labs_to_bill: open.labs.filter(l => l.status === 'requested').length,
      sales: r2(open.sales.reduce((a, x) => a + Math.max(0, x.balance), 0)), admissions: r2(open.admissions.reduce((a, x) => a + Math.max(0, x.balance), 0)) };
    return { from, to, payments, totals, byDoctor, withdrawals, closes, outstanding };
  }
  function cashClose(p, user) {
    const d = isoOk(p.date) ? p.date : today();
    const day = cashierDay(d, d);
    const expected = r2(p.expected ?? day.totals.net);
    const counted = r2(p.counted);
    const id = db.insert('cash_closes', { date: d, station: user.station || 'reception', expected, counted, difference: r2(counted - expected), handed_to: str(p.handed_to), note: str(p.note), created_by: user.id });
    return db.get('SELECT * FROM cash_closes WHERE id=?', [id]);
  }

  // =================================================================== laboratory materials (reagents) & automatic use per test
  function labItemMove(m, user) {
    return db.transaction(() => {
      const it = db.get('SELECT * FROM lab_items WHERE id=?', [m.item_id]); if (!it) fail('مواد پیدا نشد');
      let qty = n(m.qty); if (!qty) fail('مقدار را وارد کنید');
      const kind = ['in', 'adjust', 'expired', 'use', 'return'].includes(m.kind) ? m.kind : 'adjust';
      if (['expired', 'use'].includes(kind) && qty > 0) qty = -qty;
      db.insert('lab_item_moves', { date: isoOk(m.date) ? m.date : today(), item_id: it.id, qty, kind, unit_cost: m.unit_cost === '' || m.unit_cost == null ? it.cost : n(m.unit_cost), note: str(m.note), user_id: user.id });
      const row = { stock: r2(it.stock + qty) };
      if (kind === 'in' && m.unit_cost !== '' && m.unit_cost != null) row.cost = n(m.unit_cost);
      if (kind === 'in' && m.expiry) row.expiry = str(m.expiry);
      db.update('lab_items', it.id, row);
      return db.get('SELECT * FROM lab_items WHERE id=?', [it.id]);
    });
  }
  // brings the materials used by one lab request in line with its tests (idempotent: posts only the difference)
  function applyLabConsumption(reqId, user) {
    const r = db.get('SELECT * FROM lab_requests WHERE id=?', [reqId]); if (!r) return;
    const want = new Map();
    if (!['requested', 'cancelled'].includes(r.status)) {
      const testIds = [];
      for (const it of db.all('SELECT i.test_id, t.is_panel FROM lab_request_items i JOIN lab_tests t ON t.id=i.test_id WHERE i.request_id=?', [reqId])) {
        testIds.push(it.test_id);
        if (it.is_panel) db.all('SELECT pi.test_id FROM lab_panel_items pi JOIN lab_tests t ON t.id=pi.test_id WHERE pi.panel_id=? AND t.active=1', [it.test_id]).forEach(x => testIds.push(x.test_id));
      }
      for (const tid of testIds) for (const c of db.all('SELECT * FROM lab_test_items WHERE test_id=?', [tid])) want.set(c.item_id, r2((want.get(c.item_id) || 0) + c.qty));
    }
    const have = new Map(db.all("SELECT item_id, -SUM(qty) q FROM lab_item_moves WHERE ref_type='lab_request' AND ref_id=? GROUP BY item_id", [reqId]).map(x => [x.item_id, x.q]));
    const ids = new Set([...want.keys(), ...have.keys()]);
    for (const itemId of ids) {
      const diff = r2((want.get(itemId) || 0) - (have.get(itemId) || 0));
      if (Math.abs(diff) < 0.0001) continue;
      const it = db.get('SELECT * FROM lab_items WHERE id=?', [itemId]); if (!it) continue;
      db.insert('lab_item_moves', { date: today(), item_id: itemId, qty: -diff, kind: diff > 0 ? 'use' : 'return', unit_cost: it.cost, ref_type: 'lab_request', ref_id: reqId, note: r.lab_code, user_id: user?.id || null });
      db.update('lab_items', itemId, { stock: r2(it.stock - diff) });
      const after = it.stock - diff;
      if (diff > 0 && it.reorder_level > 0 && after <= it.reorder_level) emit('labitem:low', { id: it.id, name: it.name, stock: r2(after) }, ['lab', 'stock', 'admin']);
    }
  }

  // =================================================================== in-patients (beds)
  function admissionDays(startAt, endAt) {
    const h = (new Date(String(endAt).replace(' ', 'T')) - new Date(String(startAt).replace(' ', 'T'))) / 3600000;
    return Math.max(0, Math.ceil((h - 2) / 24));            // part of a day after 2 hours counts as a day
  }
  function admissionFull(id) {
    const a = db.get('SELECT * FROM v_admissions WHERE id=?', [id]); if (!a) fail('بستری پیدا نشد');
    a.beds = db.all('SELECT ab.*, b.name bed, w.name ward FROM admission_beds ab JOIN beds b ON b.id=ab.bed_id JOIN wards w ON w.id=b.ward_id WHERE ab.admission_id=? ORDER BY ab.id', [id]);
    const now = nowStr();
    a.beds.forEach(b => { b.calc_days = b.days ?? Math.max(0, admissionDays(b.start_at, b.end_at || now)); });
    if (a.status === 'admitted' && a.beds.length && !a.beds.some(b => b.calc_days > 0)) a.beds[0].calc_days = 1;
    a.charges = db.all('SELECT c.*, u.full_name user_name FROM admission_charges c LEFT JOIN users u ON u.id=c.created_by WHERE admission_id=? ORDER BY id', [id]);
    a.payments = db.all('SELECT p.*, u.full_name user_name FROM admission_payments p LEFT JOIN users u ON u.id=p.created_by WHERE admission_id=? ORDER BY id', [id]);
    a.bed_running = r2(a.beds.reduce((s2, b) => s2 + b.calc_days * b.rate, 0));
    a.extra_running = r2(a.charges.reduce((s2, c) => s2 + c.amount, 0));
    a.patient = db.get('SELECT * FROM patients WHERE id=?', [a.patient_id]);
    return a;
  }
  function recomputeAdmission(id) {
    const a = admissionFull(id);
    const bed = a.status === 'admitted' ? a.bed_running : a.bed_total;
    const row = { bed_total: bed, extra_total: a.extra_running, net: r2(Math.max(0, bed + a.extra_running - a.discount)) };
    if (row.bed_total !== a.bed_total || row.extra_total !== a.extra_total || row.net !== a.net) db.update('admissions', id, row);
  }
  // bed days keep running while the patient is admitted: bring the stored totals up to date
  function refreshRunningAdmissions() { for (const a of db.all("SELECT id FROM admissions WHERE status='admitted'")) recomputeAdmission(a.id); }
  function bedFree(bedId) { return !db.get("SELECT ab.id FROM admission_beds ab JOIN admissions a ON a.id=ab.admission_id WHERE ab.bed_id=? AND ab.end_at IS NULL AND a.status='admitted'", [bedId]); }
  function admit(p, user) {
    return db.transaction(() => {
      let patientId = p.patient_id;
      if (p.patient) patientId = savePatient({ ...p.patient, id: patientId || undefined }, user);
      if (!patientId) fail('مریض را انتخاب یا ثبت کنید');
      if (db.get("SELECT id FROM admissions WHERE patient_id=? AND status='admitted'", [patientId])) fail('این مریض همین حالا بستری است');
      const bed = db.get('SELECT b.*, w.daily_rate FROM beds b JOIN wards w ON w.id=b.ward_id WHERE b.id=?', [p.bed_id]); if (!bed) fail('تخت را انتخاب کنید');
      if (!bedFree(bed.id)) fail('این تخت خالی نیست');
      const now = nowStr();
      const prefix = setting('admission_prefix', 'IP-');
      let no; for (let i = 0; i < 100; i++) { no = prefix + String(db.nextCounter('admission')).padStart(5, '0'); if (!db.get('SELECT id FROM admissions WHERE adm_no=?', [no])) break; }
      const id = db.insert('admissions', { adm_no: no, patient_id: patientId, doctor_id: p.doctor_id || null, admitted_at: now, diagnosis: str(p.diagnosis), notes: str(p.notes), created_by: user.id });
      db.insert('admission_beds', { admission_id: id, bed_id: bed.id, rate: p.rate === undefined || p.rate === '' ? bed.daily_rate : n(p.rate), start_at: now });
      if (n(p.deposit) > 0) { db.insert('admission_payments', { admission_id: id, amount: r2(p.deposit), method: p.method || 'cash', note: 'پیش‌پرداخت بستر', station: user.station || 'reception', created_by: user.id }); db.update('admissions', id, { paid: r2(p.deposit) }); }
      recomputeAdmission(id);
      const out = admissionFull(id);
      emit('ipd:update', { id, adm_no: no, full_name: out.full_name }, ['reception', 'doctor', 'admin'], { doctor_id: out.doctor_id });
      return out;
    });
  }
  function transferBed(id, bedId, user) {
    return db.transaction(() => {
      const a = db.get('SELECT * FROM admissions WHERE id=?', [id]); if (!a || a.status !== 'admitted') fail('بستری فعال پیدا نشد');
      const bed = db.get('SELECT b.*, w.daily_rate FROM beds b JOIN wards w ON w.id=b.ward_id WHERE b.id=?', [bedId]); if (!bed) fail('تخت پیدا نشد');
      if (!bedFree(bed.id)) fail('این تخت خالی نیست');
      const now = nowStr();
      db.run('UPDATE admission_beds SET end_at=? WHERE admission_id=? AND end_at IS NULL', [now, id]);
      db.insert('admission_beds', { admission_id: id, bed_id: bed.id, rate: bed.daily_rate, start_at: now });
      recomputeAdmission(id); emit('ipd:update', { id }, ['reception', 'doctor', 'admin']);
      return admissionFull(id);
    });
  }
  function addAdmissionCharge(id, c, user) {
    return db.transaction(() => {
      const a = db.get('SELECT * FROM admissions WHERE id=?', [id]); if (!a) fail('بستری پیدا نشد');
      if (c.remove) db.run('DELETE FROM admission_charges WHERE id=? AND admission_id=?', [c.remove, id]);
      else { if (!str(c.name) || !n(c.amount)) fail('نام و مبلغ را وارد کنید'); db.insert('admission_charges', { admission_id: id, name: str(c.name), amount: r2(c.amount), created_by: user.id }); }
      recomputeAdmission(id); return admissionFull(id);
    });
  }
  function dischargeAdmission(id, p, user) {
    return db.transaction(() => {
      const a = admissionFull(id); if (a.status !== 'admitted') fail('این مریض قبلاً رخصت شده');
      const now = nowStr();
      // allow the receptionist to correct the number of days of each bed before closing
      for (const b of a.beds) {
        const days = p.days && p.days[b.id] !== undefined && p.days[b.id] !== '' ? n(p.days[b.id]) : b.calc_days;
        db.update('admission_beds', b.id, { end_at: b.end_at || now, days });
      }
      const bedTotal = r2(db.scalar('SELECT IFNULL(SUM(days*rate),0) FROM admission_beds WHERE admission_id=?', [id]));
      db.update('admissions', id, { status: 'discharged', discharged_at: now, bed_total: bedTotal, discount: Math.max(0, n(p.discount)), notes: str(p.notes) ?? a.notes });
      recomputeAdmission(id);
      const out = admissionFull(id);
      emit('ipd:update', { id, status: 'discharged' }, ['reception', 'doctor', 'admin']);
      return out;
    });
  }
  function payAdmission(id, amount, method, note, user, station) {
    return db.transaction(() => {
      const a = db.get('SELECT * FROM admissions WHERE id=?', [id]); if (!a) fail('بستری پیدا نشد');
      const amt = r2(amount); if (!amt) fail('مبلغ را وارد کنید');
      db.insert('admission_payments', { admission_id: id, amount: amt, method: method || 'cash', note: str(note), station: station || user.station || null, created_by: user.id });
      db.update('admissions', id, { paid: r2(a.paid + amt) });
      return admissionFull(id);
    });
  }
  function ipdBoard() {
    const wards = db.all('SELECT * FROM wards WHERE active=1 ORDER BY sort, id');
    const beds = db.all('SELECT * FROM beds WHERE active=1 ORDER BY sort, id');
    const occ = db.all(`SELECT ab.bed_id, a.id admission_id, a.adm_no, a.admitted_at, a.diagnosis, p.full_name, p.father_name, p.code patient_code, p.sex, p.birth_date, d.name doctor_name
      FROM admission_beds ab JOIN admissions a ON a.id=ab.admission_id JOIN patients p ON p.id=a.patient_id LEFT JOIN doctors d ON d.id=a.doctor_id WHERE ab.end_at IS NULL AND a.status='admitted'`);
    const om = new Map(occ.map(o => [o.bed_id, o]));
    return wards.map(w => ({ ...w, beds: beds.filter(b => b.ward_id === w.id).map(b => ({ ...b, occupant: om.get(b.id) || null })) }));
  }

  // =================================================================== stock: purchase suggestions (auto reorder)
  function reorderSuggestions() {
    const from = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; })();
    const sold = new Map(db.all("SELECT si.medicine_id id, SUM(si.qty - si.returned_qty) q FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.date >= ? AND s.status<>'void' GROUP BY si.medicine_id", [from]).map(r => [r.id, r.q]));
    return db.all('SELECT * FROM v_medicine_stock WHERE active=1 AND (stock <= reorder_level) ORDER BY name').map(m => {
      const per30 = r2(sold.get(m.id) || 0);
      const suggest = Math.max(Math.ceil(per30 * 1.2 - m.stock), Math.ceil(m.reorder_level * 3 - m.stock), 1);
      const last = db.get('SELECT p.supplier_id, s.name supplier_name, i.buy_price, p.date FROM purchase_items i JOIN purchases p ON p.id=i.purchase_id LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE i.medicine_id=? ORDER BY p.date DESC, p.id DESC LIMIT 1', [m.id]);
      return { ...m, sold_30: per30, suggest, last_supplier_id: last?.supplier_id || null, last_supplier: last?.supplier_name || null, last_buy: last?.buy_price ?? m.buy_price };
    });
  }

  // =================================================================== doctors: schedule & load for a date
  function doctorLoad(date) {
    date = isoOk(date) ? date : today();
    const wd = new Date(date + 'T12:00:00').getDay();
    const counts = new Map(db.all("SELECT doctor_id, COUNT(*) c FROM visits WHERE visit_date=? AND status NOT IN ('cancelled','no_show') GROUP BY doctor_id", [date]).map(r => [r.doctor_id, r.c]));
    const waiting = new Map(db.all("SELECT doctor_id, COUNT(*) c FROM visits WHERE visit_date=? AND status='waiting' GROUP BY doctor_id", [date]).map(r => [r.doctor_id, r.c]));
    const sched = db.all('SELECT * FROM doctor_schedules');
    return db.all('SELECT * FROM v_doctors ORDER BY sort, id').map(d => {
      const mine = sched.filter(x => x.doctor_id === d.id);
      const today_s = mine.filter(x => x.weekday === wd);
      return { ...d, schedule: mine, works_today: !mine.length || today_s.length > 0, today_schedule: today_s, max_patients: today_s.reduce((a, x) => a + (x.max_patients || 0), 0) || null, booked: counts.get(d.id) || 0, waiting: waiting.get(d.id) || 0 };
    });
  }
  function saveDoctorSchedule(doctorId, rows) {
    return db.transaction(() => {
      db.run('DELETE FROM doctor_schedules WHERE doctor_id=?', [doctorId]);
      for (const r of rows || []) if (r.weekday !== undefined && r.weekday !== '') db.insert('doctor_schedules', { doctor_id: doctorId, weekday: Number(r.weekday), start_time: str(r.start_time), end_time: str(r.end_time), max_patients: r.max_patients ? n(r.max_patients) : null });
      return db.all('SELECT * FROM doctor_schedules WHERE doctor_id=? ORDER BY weekday', [doctorId]);
    });
  }
  // =================================================================== waiting-room display
  function queueDisplay() {
    const rows = db.all("SELECT v.id, v.turn_no, v.status, v.called_at, v.doctor_id, v.service_name, p.full_name, d.name doctor_name, d.title doctor_title, d.room FROM visits v JOIN patients p ON p.id=v.patient_id LEFT JOIN doctors d ON d.id=v.doctor_id WHERE v.visit_date=? AND v.status IN ('waiting','in_visit') ORDER BY v.turn_no", [today()]);
    const groups = new Map();
    for (const r of rows) {
      const k = r.doctor_id ? 'd' + r.doctor_id : 's' + r.service_name;
      if (!groups.has(k)) groups.set(k, { key: k, title: r.doctor_id ? `${r.doctor_title || ''} ${r.doctor_name}`.trim() : r.service_name, room: r.room || '', current: null, waiting: [] });
      const g = groups.get(k);
      const name = String(r.full_name || '').split(' ')[0];
      if (r.status === 'in_visit') { if (!g.current || (r.called_at || '') > (g.current.called_at || '')) g.current = { turn: r.turn_no, name, called_at: r.called_at }; }
      else g.waiting.push({ turn: r.turn_no, name });
    }
    return [...groups.values()];
  }
  function callVisit(id, user) {
    const v = db.get('SELECT v.*, p.full_name, d.name doctor_name, d.title doctor_title, d.room FROM visits v JOIN patients p ON p.id=v.patient_id LEFT JOIN doctors d ON d.id=v.doctor_id WHERE v.id=?', [id]); if (!v) fail('پذیرش پیدا نشد');
    db.update('visits', id, { status: v.status === 'waiting' || v.status === 'in_visit' ? 'in_visit' : v.status, called_at: nowStr() });
    const data = { id, turn: v.turn_no, name: String(v.full_name || '').split(' ')[0], doctor: `${v.doctor_title || ''} ${v.doctor_name || v.service_name}`.trim(), room: v.room || '', doctor_id: v.doctor_id };
    emit('queue:call', data, undefined);
    emit('visit:update', db.get('SELECT * FROM v_visits WHERE id=?', [id]), ['reception', 'doctor', 'admin'], { doctor_id: v.doctor_id });
    return data;
  }

  // =================================================================== reports
  function dayRange(from, to) {
    const out = []; const d = new Date(from + 'T12:00:00'); const e = new Date(to + 'T12:00:00');
    for (let i = 0; d <= e && i < 3700; i++) { out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`); d.setDate(d.getDate() + 1); }
    return out;
  }
  // per-day figures for every section (cash basis for income, accrual for sales)
  function reportDays(from, to) {
    if (!isoOk(from) || !isoOk(to)) fail('بازه تاریخ نامعتبر');
    const P = [from, to];
    const map = new Map();
    const row = (d) => { if (!map.has(d)) map.set(d, { date: d, ph_cash: 0, ipd: 0, visits: 0, reception: 0, ph_sales: 0, ph_returns: 0, ph_cost: 0, ph_count: 0, lab_income: 0, lab_billed: 0, lab_count: 0, expenses: 0, wd_pharmacy: 0, wd_lab: 0, wd_reception: 0, wd_personal: 0, purchases: 0, supplier_paid: 0, legacy_ph: 0, legacy_lab: 0,
      wd_ph_personal: 0, wd_ph_factor: 0, wd_ph_other: 0, wd_lab_personal: 0, wd_lab_external: 0, wd_lab_other: 0, wd_rc_personal: 0, wd_rc_other: 0, lab_purchases: 0, wd_by: '' }); return map.get(d); };
    const add = (sql, f) => db.all(sql, P).forEach(r => f(row(r.d), r));
    add("SELECT visit_date d, COUNT(*) c FROM visits WHERE visit_date BETWEEN ? AND ? AND status NOT IN ('cancelled','reserved') GROUP BY d", (o, r) => o.visits = r.c);
    add('SELECT DATE(created_at) d, SUM(amount) s FROM visit_payments WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY d', (o, r) => o.reception = r.s);
    add("SELECT date d, SUM(net) s, SUM(cost) c, COUNT(*) n FROM sales WHERE date BETWEEN ? AND ? AND status<>'void' GROUP BY d", (o, r) => { o.ph_sales = r.s; o.ph_cost = r.c; o.ph_count = r.n; });
    add("SELECT date d, SUM(qty*unit_price) s, SUM(qty*unit_cost) c FROM stock_moves WHERE kind='return' AND date BETWEEN ? AND ? GROUP BY d", (o, r) => { o.ph_returns = r.s; o.ph_cost -= r.c; });
    add('SELECT DATE(created_at) d, SUM(amount) s FROM lab_payments WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY d', (o, r) => o.lab_income = r.s);
    add("SELECT DATE(received_at) d, SUM(net) s, COUNT(*) n FROM lab_requests WHERE received_at IS NOT NULL AND DATE(received_at) BETWEEN ? AND ? AND status<>'cancelled' GROUP BY d", (o, r) => { o.lab_billed = r.s; o.lab_count = r.n; });
    add('SELECT date d, SUM(amount) s FROM expenses WHERE date BETWEEN ? AND ? GROUP BY d', (o, r) => o.expenses = r.s);
    add("SELECT date d, SUM(CASE WHEN kind='personal' THEN amount ELSE 0 END) p, SUM(CASE WHEN kind<>'personal' AND section='pharmacy' THEN amount ELSE 0 END) ph, SUM(CASE WHEN kind<>'personal' AND section='lab' THEN amount ELSE 0 END) lb, SUM(CASE WHEN kind<>'personal' AND section='reception' THEN amount ELSE 0 END) rc FROM withdrawals WHERE date BETWEEN ? AND ? GROUP BY d",
      (o, r) => { o.wd_personal = r.p; o.wd_pharmacy = r.ph; o.wd_lab = r.lb; o.wd_reception = r.rc; });
    // withdrawals of every section by type (personal / purchase factor / external lab tests / other)
    add(`SELECT date d, SUM(CASE WHEN section='pharmacy' AND kind='personal' THEN amount ELSE 0 END) php, SUM(CASE WHEN section='pharmacy' AND kind='factor' THEN amount ELSE 0 END) phf,
      SUM(CASE WHEN section='pharmacy' AND kind NOT IN ('personal','factor') THEN amount ELSE 0 END) pho, SUM(CASE WHEN section='lab' AND kind='personal' THEN amount ELSE 0 END) lp,
      SUM(CASE WHEN section='lab' AND kind='external' THEN amount ELSE 0 END) le, SUM(CASE WHEN section='lab' AND kind NOT IN ('personal','external') THEN amount ELSE 0 END) lo,
      SUM(CASE WHEN section='reception' AND kind='personal' THEN amount ELSE 0 END) rp, SUM(CASE WHEN section='reception' AND kind<>'personal' THEN amount ELSE 0 END) ro,
      GROUP_CONCAT(DISTINCT by_whom) bw FROM withdrawals WHERE date BETWEEN ? AND ? GROUP BY d`,
      (o, r) => { o.wd_ph_personal = r.php; o.wd_ph_factor = r.phf; o.wd_ph_other = r.pho; o.wd_lab_personal = r.lp; o.wd_lab_external = r.le; o.wd_lab_other = r.lo; o.wd_rc_personal = r.rp; o.wd_rc_other = r.ro; o.wd_by = r.bw || ''; });
    add("SELECT date d, SUM(qty * IFNULL(unit_cost,0)) s FROM lab_item_moves WHERE kind='in' AND date BETWEEN ? AND ? GROUP BY d", (o, r) => o.lab_purchases = r.s);
    add('SELECT date d, SUM(net) s FROM purchases WHERE date BETWEEN ? AND ? GROUP BY d', (o, r) => o.purchases = r.s);
    add("SELECT DATE(created_at) d, SUM(amount) s FROM sale_payments WHERE DATE(created_at) BETWEEN ? AND ? AND IFNULL(method,'')<>'deposit' GROUP BY d", (o, r) => o.ph_cash = r.s);
    add("SELECT DATE(created_at) d, SUM(amount) s FROM admission_payments WHERE DATE(created_at) BETWEEN ? AND ? AND IFNULL(method,'')<>'deposit' GROUP BY d", (o, r) => o.ipd = r.s);
    add('SELECT date d, SUM(amount) s FROM purchase_payments WHERE date BETWEEN ? AND ? GROUP BY d', (o, r) => o.supplier_paid = r.s);
    add('SELECT date d, pharmacy_sales s, lab_income l FROM legacy_daily WHERE date BETWEEN ? AND ?', (o, r) => { o.legacy_ph = r.s; o.legacy_lab = r.l; });
    const out = [...map.values()].sort((a, b) => a.date < b.date ? -1 : 1);
    for (const o of out) {
      for (const k of Object.keys(o)) if (k !== 'date' && k !== 'wd_by') o[k] = r2(o[k]);
      o.ph_net = r2(o.ph_sales - o.ph_returns + o.legacy_ph);           // pharmacy sales after returns (+ imported history)
      o.ph_profit = r2(o.ph_sales - o.ph_returns - o.ph_cost);
      o.lab_total = r2(o.lab_income + o.legacy_lab);
      o.income = r2(o.reception + o.ph_net + o.lab_total + o.ipd);
      o.withdrawals = r2(o.wd_pharmacy + o.wd_lab + o.wd_reception + o.wd_personal);
      o.cash_left = r2(o.income - o.withdrawals - o.expenses);
    }
    return out;
  }
  function medicineSales(from, to) {
    return db.all(`SELECT m.id, m.code, m.name, m.form, m.strength, m.unit, SUM(si.qty - si.returned_qty) qty,
      SUM((si.qty - si.returned_qty) * si.price * CASE WHEN s.subtotal>0 THEN s.net/s.subtotal ELSE 1 END) revenue,
      SUM(CASE WHEN si.qty>0 THEN si.cost * (si.qty - si.returned_qty) / si.qty ELSE 0 END) cost, COUNT(DISTINCT s.id) sales
      FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN medicines m ON m.id=si.medicine_id
      WHERE s.date BETWEEN ? AND ? AND s.status<>'void' GROUP BY m.id ORDER BY revenue DESC`, [from, to]).map(r => ({ ...r, revenue: r2(r.revenue), cost: r2(r.cost), profit: r2(r.revenue - r.cost) }));
  }
  function supplierLedger() {
    return db.all(`SELECT s.*, IFNULL(SUM(p.net),0) total, IFNULL(SUM(p.paid),0) paid, IFNULL(SUM(p.net - p.paid),0) balance, COUNT(p.id) factors, MAX(p.date) last_date
      FROM suppliers s LEFT JOIN purchases p ON p.supplier_id=s.id GROUP BY s.id ORDER BY balance DESC, s.name`);
  }
  function doctorStats(from, to) {
    return db.all(`SELECT d.id, d.name, d.title,
      (SELECT COUNT(*) FROM visits v WHERE v.doctor_id=d.id AND v.visit_date BETWEEN ? AND ? AND v.status NOT IN ('cancelled','reserved')) visits,
      (SELECT IFNULL(SUM(v.net),0) FROM visits v WHERE v.doctor_id=d.id AND v.visit_date BETWEEN ? AND ? AND v.status NOT IN ('cancelled','reserved')) fees,
      (SELECT COUNT(*) FROM prescriptions r WHERE r.doctor_id=d.id AND r.date BETWEEN ? AND ?) rx,
      (SELECT COUNT(*) FROM lab_requests l WHERE l.doctor_id=d.id AND l.date BETWEEN ? AND ?) labs,
      (SELECT IFNULL(SUM(s.net - s.returned),0) FROM sales s WHERE s.doctor_id=d.id AND s.date BETWEEN ? AND ? AND s.status<>'void') rx_sales
      FROM doctors d WHERE d.active=1 ORDER BY d.sort`, [from, to, from, to, from, to, from, to, from, to]);
  }
  // patients / turns of every doctor per day
  function doctorDaily(from, to, doctorId) {
    if (!isoOk(from) || !isoOk(to)) fail('بازه تاریخ نامعتبر');
    const w = ['v.visit_date BETWEEN ? AND ?', 'v.doctor_id IS NOT NULL'], P = [from, to];
    if (doctorId) { w.push('v.doctor_id=?'); P.push(Number(doctorId)); }
    return db.all(`SELECT v.visit_date date, v.doctor_id, d.name, d.title,
      SUM(v.status NOT IN ('cancelled')) turns, MAX(CASE WHEN v.status<>'cancelled' THEN v.turn_no END) last_turn,
      SUM(v.status='done') done, SUM(v.status IN ('waiting','in_visit')) waiting, SUM(v.status='reserved') reserved, SUM(v.status='no_show') no_show, SUM(v.status='cancelled') cancelled,
      SUM(CASE WHEN v.status NOT IN ('cancelled','reserved') AND NOT EXISTS (SELECT 1 FROM visits x WHERE x.patient_id=v.patient_id AND x.id<v.id AND x.status<>'cancelled') THEN 1 ELSE 0 END) new_patients,
      IFNULL(SUM(CASE WHEN v.status NOT IN ('cancelled','reserved') THEN v.net END),0) fees, IFNULL(SUM(CASE WHEN v.status NOT IN ('cancelled','reserved') THEN v.paid END),0) paid,
      IFNULL(SUM(v.doctor_discount),0) dr_discount
      FROM visits v JOIN doctors d ON d.id=v.doctor_id WHERE ${w.join(' AND ')} GROUP BY v.visit_date, v.doctor_id ORDER BY v.visit_date DESC, d.sort, d.name`, P);
  }
  // withdrawal (برداشت) with its type; a pharmacy withdrawal for a purchase factor is also recorded as a payment of that factor
  function saveWithdrawal(d, user) {
    return db.transaction(() => {
      const SEC = { pharmacy: 'دواخانه', lab: 'لابراتوار', reception: 'پذیرش' };
      const section = SEC[d.section] ? d.section : 'pharmacy';
      if (user.role === 'pharmacy' && section !== 'pharmacy') fail('دواخانه فقط برداشت دواخانه را ثبت می‌کند');
      if (user.role === 'reception' && section === 'pharmacy') fail('پذیرش برداشت دواخانه را ثبت نمی‌کند');
      const old = d.id ? db.get('SELECT * FROM withdrawals WHERE id=?', [d.id]) : null;
      if (d.id && !old) fail('برداشت پیدا نشد');
      const amount = r2(d.amount); if (!(amount > 0)) fail('مبلغ را وارد کنید');
      const kind = str(d.kind) || 'business';
      const date = isoOk(d.date) ? d.date : today();
      const pid = kind === 'factor' ? (Number(d.purchase_id) || null) : null;
      if (kind === 'factor' && !pid) fail('فاکتور را انتخاب کنید');
      const pur = pid ? db.get('SELECT * FROM v_purchases WHERE id=?', [pid]) : null;
      if (pid && !pur) fail('فاکتور پیدا نشد');
      if (pur) { const already = old && old.purchase_id === pid ? (old.amount || 0) : 0; if (amount > r2(pur.net - pur.paid + already) + 0.01) fail(`مبلغ بیشتر از باقی فاکتور است (باقی: ${r2(pur.net - pur.paid + already)})`); }
      const row = { date, section, kind, amount, by_whom: str(d.by_whom), person: str(d.person) || (pur ? str(pur.supplier_name) : null), note: str(d.note), purchase_id: pid, factor_no: pur ? (pur.factor_no || pur.ref_no) : str(d.factor_no) };
      let ppId = old?.purchase_payment_id || null;
      if (ppId && (!pid || old.purchase_id !== pid)) { const pp = db.get('SELECT * FROM purchase_payments WHERE id=?', [ppId]); db.run('DELETE FROM purchase_payments WHERE id=?', [ppId]); if (pp) recomputePurchase(pp.purchase_id); ppId = null; }
      if (pid) {
        const pay = { date, amount, method: 'cash', paid_by: row.by_whom, note: `برداشت از صندوق ${SEC[section]}${row.note ? ' — ' + row.note : ''}` };
        if (ppId) db.update('purchase_payments', ppId, pay); else ppId = db.insert('purchase_payments', { purchase_id: pid, ...pay, created_by: user.id });
        recomputePurchase(pid);
        emit('purchase:update', { id: pid }, ['stock', 'admin']);
      }
      row.purchase_payment_id = ppId;
      let id;
      if (old) { db.update('withdrawals', old.id, row); id = old.id; } else id = db.insert('withdrawals', { ...row, created_by: user.id });
      db.audit(user, old ? 'update' : 'create', 'withdrawals', id, JSON.stringify(row).slice(0, 400));
      return id;
    });
  }
  function deleteWithdrawal(id, user) {
    return db.transaction(() => {
      const w = db.get('SELECT * FROM withdrawals WHERE id=?', [id]); if (!w) return false;
      if (user.role !== 'admin' && user.role !== 'stock') {
        if ((user.role === 'pharmacy' && w.section !== 'pharmacy') || (user.role === 'reception' && w.section === 'pharmacy')) fail('دسترسی ندارید');
        if (w.date !== today()) fail('فقط برداشت‌های امروز را می‌توانید حذف کنید');
      }
      if (w.purchase_payment_id) { const pp = db.get('SELECT * FROM purchase_payments WHERE id=?', [w.purchase_payment_id]); db.run('DELETE FROM purchase_payments WHERE id=?', [w.purchase_payment_id]); if (pp) recomputePurchase(pp.purchase_id); }
      db.run('DELETE FROM withdrawals WHERE id=?', [id]);
      db.audit(user, 'delete', 'withdrawals', id, JSON.stringify(w).slice(0, 400));
      return true;
    });
  }
  function stockSummary() {
    const warn = n(setting('expiry_warn_days', '90'));
    const lim = new Date(); lim.setDate(lim.getDate() + warn);
    const limStr = `${lim.getFullYear()}-${pad2(lim.getMonth() + 1)}`;
    return db.get(`SELECT COUNT(*) items, SUM(stock>0) in_stock, SUM(stock<=reorder_level) low, IFNULL(SUM(stock_cost),0) cost_value, IFNULL(SUM(stock*sell_price),0) sale_value,
      SUM(next_expiry IS NOT NULL AND SUBSTR(next_expiry,1,7) <= ?) expiring FROM v_medicine_stock WHERE active=1`, [limStr]);
  }
  function dashboard() {
    const t = today();
    const d = new Date(); const monthStart = (() => {
      // first day of the current solar month
      const fmt = new Intl.DateTimeFormat('en-US-u-ca-persian', { day: 'numeric' });
      const day = Number(fmt.formatToParts(d).find(p => p.type === 'day').value);
      const s = new Date(d); s.setDate(s.getDate() - (day - 1));
      return `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`;
    })();
    const days = reportDays(monthStart, t);
    const sum = (k, rows = days) => r2(rows.reduce((a, r) => a + (r[k] || 0), 0));
    const todayRow = days.find(r => r.date === t) || {};
    const visits = db.all("SELECT status, COUNT(*) c FROM visits WHERE visit_date=? GROUP BY status", [t]);
    return {
      today: t, month_start: monthStart,
      today_row: todayRow,
      month: { reception: sum('reception'), ph_net: sum('ph_net'), ph_profit: sum('ph_profit'), lab_total: sum('lab_total'), ipd: sum('ipd'), expenses: sum('expenses'), income: sum('income'), withdrawals: sum('withdrawals'), purchases: sum('purchases') },
      admitted: db.scalar("SELECT COUNT(*) FROM admissions WHERE status='admitted'"),
      cashier_pending: db.get("SELECT (SELECT COUNT(*) FROM v_sales WHERE status<>'void' AND net-returned-paid>0.001) sales, (SELECT COUNT(*) FROM lab_requests WHERE status='requested') labs, (SELECT COUNT(*) FROM visits WHERE status<>'cancelled' AND net-paid>0.001) visits"),
      lab_items_low: db.scalar('SELECT COUNT(*) FROM lab_items WHERE active=1 AND reorder_level>0 AND stock<=reorder_level'),
      visits_by_status: Object.fromEntries(visits.map(v => [v.status, v.c])),
      rx_pending: db.scalar("SELECT COUNT(*) FROM prescriptions WHERE status IN ('new','partial') AND date >= date('now','localtime','-7 days')"),
      lab_pending: db.scalar("SELECT COUNT(*) FROM lab_requests WHERE status IN ('requested','received','completed')"),
      refunds_due: db.get("SELECT COUNT(*) c, IFNULL(SUM(paid - net),0) s FROM visits WHERE paid - net > 0.001 AND status<>'cancelled'"),
      supplier_debt: db.get('SELECT COUNT(*) c, IFNULL(SUM(net - paid),0) s FROM purchases WHERE net - paid > 0.001'),
      expenses_unpaid: db.get('SELECT COUNT(*) c, IFNULL(SUM(amount - paid),0) s FROM expenses WHERE amount - paid > 0.001'),
      stock: stockSummary()
    };
  }

  return {
    UserError, today, nowStr, savePatient, createVisit, updateVisit, setVisitStatus, payVisit,
    patientFile, saveEncounter, getRx, createSale, saleFull, returnSale, findByCode,
    saveMedicine, savePurchase, purchaseFull, addPurchasePayment, deletePurchasePayment, deletePurchase, adjustStock,
    labFull, createLabWalkin, receiveLab, payLab, saveLabResults, saveLabTest, labRequestsFull,
    reportDays, medicineSales, supplierLedger, doctorStats, doctorDaily, saveWithdrawal, deleteWithdrawal, stockSummary, dashboard, medicineStock, dayRange,
    alternatives, paySale, addDeposit, depositBalance, cashierPay, cashierPending, patientAccount, cashierDay, cashClose,
    labItemMove, applyLabConsumption, admit, transferBed, addAdmissionCharge, dischargeAdmission, payAdmission, admissionFull, ipdBoard,
    reorderSuggestions, doctorLoad, saveDoctorSchedule, queueDisplay, callVisit,
    saveLabKit, applyRanges, labRepeatCheck, labStats, labDoctorIncome, labTestHistory, labPrevResults, recalcLabTotals
  };
}

module.exports = { makeOps, UserError, today, nowStr, birthFromAge };
