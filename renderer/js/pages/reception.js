/* Reception: registration, turns (نوبت), reservations, fees, patients, cash */
'use strict';

function serviceFee(svc, dr) {
  if (!svc) return 0;
  if (svc.needs_doctor && dr && Number(dr.visit_fee) > 0 && /^OPD$/i.test(svc.code)) return Number(dr.visit_fee);
  return Number(svc.fee || 0);
}
function queueKeyClient(doctorId, serviceId) {
  const scope = App.settings.turn_scope || 'doctor';
  if (scope === 'clinic') return 'c';
  if (scope === 'service') return 's' + (serviceId || 0);
  return doctorId ? 'd' + doctorId : 's' + (serviceId || 0);
}

// ================================================================ new visit
Pages.reception = {
  async render(view, params) {
    const st = { patient: null, svc: null, dr: null, custom: false, reserve: !!params.reserve };
    const svcs = App.services.filter(s => s.active);
    const docs = App.doctors.filter(d => d.active);
    view.innerHTML = `
      <div class="pageHead"><div><h1>${st.reserve ? 'وقت‌دهی (رزرو)' : 'پذیرش و نوبت‌دهی'}</h1><p>نام مریض را ثبت کنید، نوع خدمت و داکتر را انتخاب کنید، فیس را بگیرید و رسید نوبت را چاپ کنید. رسید با کد مریض به صف داکتر فرستاده می‌شود.</p></div>
        <div class="toolbar"><button class="btn" data-act="toVisits">${icon('list')} صف امروز</button><button class="btn" data-act="toRes">${icon('calendar')} رزروها</button></div></div>
      <div class="recGrid">
        <div>
          <div class="card">
            <div class="cardHead"><h2>${icon('user')} مریض</h2><div class="bar"><span id="ptBadge"></span><button class="btn sm" data-act="newPt">${icon('plus', 14)} مریض جدید</button></div></div>
            <div class="searchBox" style="margin-bottom:12px"><input id="ptSearch" placeholder="جستجوی مریض قبلی: کد مریض، نام یا شماره تلفن…" autocomplete="off"></div>
            <div class="recForm" id="ptForm">
              <label class="field c3"><span>نام مریض <em>*</em></span><input name="full_name" id="f_name" autocomplete="off"></label>
              <label class="field c3"><span>ولد (نام پدر)</span><input name="father_name" autocomplete="off"></label>
              <label class="field c2"><span>جنس</span><div class="chips" id="sexChips"><button type="button" class="chip on" data-sex="M">مذکر</button><button type="button" class="chip" data-sex="F">مونث</button></div></label>
              <div class="field c4" style="grid-column:span 4"><span>سن <span class="hint">(برای اطفال ماه و روز هم بنویسید)</span></span>${ageInputHTML('rcAge')}</div>
              <label class="field c3"><span>شماره تلفن</span><input name="phone" class="ltr" autocomplete="off"></label>
              <label class="field c3"><span>آدرس</span><input name="address" autocomplete="off"></label>
              <label class="field c1"><span>وزن (kg)</span><input name="weight" type="number" step="0.1"></label>
              <label class="field c1"><span>قد (cm)</span><input name="height" type="number" step="0.5"></label>
              <div class="field c1" style="justify-content:flex-end"><small class="muted" id="bmiHint"></small></div>
              <details class="c6" style="grid-column:1/-1"><summary class="muted small" style="cursor:pointer">معلومات بیشتر: شخص تماس اضطراری، بیمه، تذکره</summary>
                <div class="formGrid" style="margin-top:8px"><label class="field"><span>شخص تماس اضطراری</span><input name="emergency_name"></label><label class="field"><span>تلفن اضطراری</span><input name="emergency_phone" class="ltr"></label>
                <label class="field"><span>بیمه</span><input name="insurance"></label><label class="field"><span>شماره بیمه</span><input name="insurance_no" class="ltr"></label><label class="field"><span>تذکره</span><input name="tazkira"></label></div></details>
            </div>
          </div>
          <div class="card">
            <div class="cardHead"><h2>${icon('ticket')} نوع خدمت</h2><small class="muted">OPD، سونوگرافی (US) یا خدمت دیگر</small></div>
            <div class="svcChips" id="svcChips">${svcs.map(s => `<button type="button" class="svcChip" data-svc="${s.id}"><b>${esc(s.name)}</b><small>${esc(s.code)} · ${money(s.fee)}</small></button>`).join('')}
              <button type="button" class="svcChip add" data-svc="custom">${icon('plus')} خدمت دیگر…</button></div>
            <div class="formGrid hidden" id="customSvc" style="margin-top:12px">
              <label class="field span2"><span>نام خدمت (دستی)</span><input id="cs_name" placeholder="مثلاً: حجامت، پانسمان، مشوره…"></label>
              <label class="check" style="align-self:end"><input type="checkbox" id="cs_save"> ذخیره در لیست خدمات</label>
            </div>
            <div class="secTitle" style="margin-top:16px">${icon('steth', 15)} داکتر <small class="muted">— بخش، نوع کار و تعداد نوبت هر داکتر در لیست دیده می‌شود</small></div>
            ${doctorPickerHTML('rcDr')}
          </div>
        </div>
        <div>
          <div class="card">
            <div class="cardHead"><h2>${icon('money')} فیس و نوبت</h2>
              <div class="chips"><button type="button" class="chip ${st.reserve ? '' : 'on'}" data-mode="now">نوبت امروز</button><button type="button" class="chip ${st.reserve ? 'on' : ''}" data-mode="reserve">رزرو برای روز دیگر</button></div></div>
            <div class="formGrid ${st.reserve ? '' : 'hidden'}" id="resBox" style="margin-bottom:12px">
              <label class="field"><span>تاریخ رزرو</span>${dateInput('visit_date', isoDate(addDays(new Date(), 1)), 'id="f_date"')}</label>
              <label class="field"><span>ساعت</span><input type="time" id="f_time" value="09:00"></label>
            </div>
            <div class="grid g2" style="align-items:center">
              <div class="turnPreview"><small>نمبر نوبت</small><b id="turnNo">—</b><small id="turnFor" class="muted"></small></div>
              <div class="stack">
                <label class="field"><span>فیس</span><input type="number" id="f_fee" min="0"></label>
                <label class="field"><span>تخفیف</span><input type="number" id="f_disc" min="0" value="0"></label>
              </div>
            </div>
            <div class="totals"><div><span>قابل پرداخت</span><b id="f_net">0</b></div></div>
            <div class="formGrid" style="margin-top:12px">
              <label class="field"><span>پرداخت شده</span><input type="number" id="f_paid" min="0"></label>
              <label class="field"><span>طریقه پرداخت</span><select id="f_method">${opt(Object.entries(PAY_METHODS), 'cash')}</select></label>
              <label class="field full"><span>یادداشت برای داکتر</span><input id="f_note" placeholder="اختیاری"></label>
            </div>
            <div class="bar" style="margin-top:14px">
              <button class="btn primary lg" data-act="save" data-print="1">${icon('print')} ثبت و چاپ رسید <span class="kbd">F9</span></button>
              <button class="btn lg" data-act="save">${icon('check')} فقط ثبت</button>
            </div>
          </div>
          <div class="card" id="ptHist"><h2>${icon('clock')} سوابق مراجعه</h2><div class="muted small">مریض را جستجو کنید تا سوابق قبلی نمایش داده شود.</div></div>
        </div>
      </div>`;

    const f = $('#ptForm', view);
    const F = (n) => $(`[name="${n}"]`, f);
    let sex = 'M';
    let todayVisits = [];
    const loadToday = async () => {
      todayVisits = await API.list('visits', { 'eq.visit_date': st.reserve ? (dateOf($('#f_date', view)) || today()) : today(), limit: 2000 });
      updateTurn();
    };
    const updateTurn = () => {
      const key = queueKeyClient(st.dr?.id, st.svc?.id);
      const max = Math.max(0, ...todayVisits.filter(v => v.queue_key === key).map(v => v.turn_no || 0));
      $('#turnNo', view).textContent = (st.svc || st.custom) ? max + 1 : '—';
      $('#turnFor', view).textContent = st.dr ? doctorName(st.dr) : (st.svc ? st.svc.name : '');
    };
    const calc = () => {
      const fee = Number($('#f_fee', view).value) || 0, disc = Math.min(fee, Number($('#f_disc', view).value) || 0);
      $('#f_net', view).textContent = money(fee - disc) + ' ' + currency();
      if (!$('#f_paid', view).dataset.touched) $('#f_paid', view).value = st.reserve ? 0 : fee - disc;
    };
    const setFee = () => { $('#f_fee', view).value = st.custom ? ($('#f_fee', view).value || 0) : serviceFee(st.svc, st.dr); calc(); updateTurn(); };
    const setSex = (s) => { sex = s; $$('#sexChips .chip', view).forEach(c => c.classList.toggle('on', c.dataset.sex === s)); };
    const fillPatient = async (p) => {
      st.patient = p;
      F('full_name').value = p.full_name || ''; F('father_name').value = p.father_name || ''; F('phone').value = p.phone || ''; F('address').value = p.address || '';
      ['emergency_name', 'emergency_phone', 'insurance', 'insurance_no', 'tazkira'].forEach(k => F(k).value = p[k] || '');
      setAgeInput(f, 'rcAge', p.birth_date);
      setSex(p.sex || 'M');
      $('#ptBadge', view).innerHTML = `<span class="pill info">مریض قبلی · ${esc(p.code)}</span>`;
      $('#ptSearch', view).value = '';
      const b = await API.get('/api/patient-basic/' + p.id);
      $('#ptHist', view).innerHTML = `<h2>${icon('clock')} سوابق مراجعه — ${esc(p.full_name)}</h2>${b.visits.length ? `<div class="tableWrap"><table class="t"><thead><tr><th>تاریخ</th><th>خدمت</th><th>داکتر</th><th>نوبت</th><th>وضعیت</th><th>فیس</th></tr></thead><tbody>
        ${b.visits.slice(0, 8).map(v => `<tr><td>${fmtDate(v.visit_date)}</td><td>${esc(v.service_name)}</td><td>${esc(v.doctor_name || '—')}</td><td class="c">${v.turn_no || ''}</td><td>${statusPill(VISIT_STATUS, v.status)}</td><td>${money(v.net)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="muted small">اولین مراجعه</div>'}`;
      // suggest the doctor of the last visit
      const last = b.visits.find(v => v.doctor_name);
      if (last && !st.dr) { const d = App.doctors.find(x => x.name === last.doctor_name); if (d) drPick.set(d.id); }
    };
    const clearPatient = () => {
      st.patient = null; ['full_name', 'father_name', 'phone', 'address', 'weight', 'height', 'emergency_name', 'emergency_phone', 'insurance', 'insurance_no', 'tazkira'].forEach(k => F(k).value = ''); setAgeInput(f, 'rcAge', null); setSex('M');
      $('#ptBadge', view).innerHTML = '<span class="pill">مریض جدید</span>';
      $('#ptHist', view).innerHTML = `<h2>${icon('clock')} سوابق مراجعه</h2><div class="muted small">مریض را جستجو کنید تا سوابق قبلی نمایش داده شود.</div>`;
      $('#f_name', view).focus();
    };
    const pickSvc = (id) => {
      st.custom = id === 'custom'; st.svc = st.custom ? null : App.services.find(s => s.id === Number(id));
      $$('#svcChips .svcChip', view).forEach(c => c.classList.toggle('on', c.dataset.svc === String(id)));
      $('#customSvc', view).classList.toggle('hidden', !st.custom);
      if (st.custom) { $('#cs_name', view).focus(); $('#f_fee', view).value = ''; }
      if (st.svc && st.svc.default_doctor_id && !st.dr) drPick.set(st.svc.default_doctor_id);
      setFee();
    };
    const drPick = bindDoctorPicker(view, 'rcDr', { onPick: (d) => { st.dr = d; setFee(); } });
    // defaults
    clearPatient(); $('#ptBadge', view).innerHTML = '<span class="pill">مریض جدید</span>';
    const opd = svcs.find(s => /^OPD$/i.test(s.code)) || svcs[0]; if (opd) pickSvc(opd.id);
    if (docs.length === 1) drPick.set(docs[0].id);
    bindAgeInput(f, 'rcAge');
    const bmiUpd = () => { const b = bmi(F('weight').value, F('height').value); $('#bmiHint', view).textContent = b ? 'BMI ' + b : ''; };
    F('weight').addEventListener('input', bmiUpd); F('height').addEventListener('input', bmiUpd);
    await loadToday();
    if (params.patient_id) { const p = await API.one('patients', params.patient_id); if (p) await fillPatient(p); }

    patientSearch($('#ptSearch', view), fillPatient);
    $('#sexChips', view).onclick = (e) => { const b = e.target.closest('[data-sex]'); if (b) setSex(b.dataset.sex); };
    $('#svcChips', view).onclick = (e) => { const b = e.target.closest('[data-svc]'); if (b) pickSvc(b.dataset.svc); };
    $('#f_fee', view).oninput = calc; $('#f_disc', view).oninput = calc;
    $('#f_paid', view).oninput = (e) => e.target.dataset.touched = '1';
    $$('[data-mode]', view).forEach(b => b.onclick = () => {
      st.reserve = b.dataset.mode === 'reserve'; $$('[data-mode]', view).forEach(x => x.classList.toggle('on', x === b));
      $('#resBox', view).classList.toggle('hidden', !st.reserve); delete $('#f_paid', view).dataset.touched; calc(); loadToday(); drPick.refreshLoad(st.reserve ? dateOf($('#f_date', view)) : today());
    });
    $('#f_date', view).addEventListener('change', () => { loadToday(); drPick.refreshLoad(dateOf($('#f_date', view))); });
    // patient name typed for a new patient → search hint
    const save = async (btn, print) => busy(btn, async () => {
      const pv = formValues(f);
      if (!pv.full_name.trim()) { $('#f_name', view).focus(); throw new Error('نام مریض را وارد کنید'); }
      if (!st.svc && !st.custom) throw new Error('نوع خدمت را انتخاب کنید');
      if (st.custom && !$('#cs_name', view).value.trim()) throw new Error('نام خدمت را بنویسید');
      const payload = {
        patient: { ...(st.patient ? { id: st.patient.id } : {}), full_name: pv.full_name, father_name: pv.father_name, sex, phone: pv.phone, address: pv.address,
          emergency_name: pv.emergency_name, emergency_phone: pv.emergency_phone, insurance: pv.insurance, insurance_no: pv.insurance_no, tazkira: pv.tazkira,
          ...(ageValue(f, 'rcAge') || {}) },
        service_id: st.svc?.id, service_name: st.custom ? $('#cs_name', view).value.trim() : undefined, save_service: st.custom && $('#cs_save', view).checked ? 1 : 0,
        doctor_id: st.dr?.id || null, fee: $('#f_fee', view).value, discount: $('#f_disc', view).value, paid: $('#f_paid', view).value, pay_method: $('#f_method', view).value,
        note: $('#f_note', view).value, weight: pv.weight, height: pv.height, reserve: st.reserve ? 1 : 0, visit_date: st.reserve ? dateOf($('#f_date', view)) : undefined, reserved_time: st.reserve ? $('#f_time', view).value : undefined
      };
      const v = await API.post('/api/visits/create', payload);
      toast(`ثبت شد — نوبت ${v.turn_no} · کد مریض ${v.patient_code}`, 'good');
      if (st.custom && payload.save_service) loadBootstrap().catch(() => { });
      if (print) await printDoc(visitReceiptHTML(v), { size: 'receipt', title: v.visit_no });
      go('reception', { reserve: st.reserve });
    });
    actions(view, {
      newPt: () => clearPatient(), save: (b) => save(b, !!b.dataset.print),
      toVisits: () => go('visits'), toRes: () => go('reservations')
    });
    view.addEventListener('keydown', (e) => { if (e.key === 'F9') { e.preventDefault(); $('[data-act="save"][data-print]', view).click(); } });
    $('#f_name', view).focus();
  },
};

// ================================================================ visits list / today queue
Pages.visits = {
  async render(view, params) {
    const st = { date: params.date || today(), doctor: params.doctor || '', status: params.status || '', q: '' };
    view.innerHTML = `
      <div class="pageHead"><div><h1>صف امروز و لیست پذیرش‌ها</h1><p>نوبت‌ها، وضعیت مریضان نزد داکتر، چاپ دوباره رسید، دریافت باقی فیس و بازپرداخت تخفیف داکتر.</p></div>
        <div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} پذیرش جدید</button><button class="btn" data-act="csv">${icon('download')} CSV</button></div></div>
      <div class="filterBar">
        <label class="field"><span>تاریخ</span>${dateInput('date', st.date, 'id="v_date"')}</label>
        <label class="field"><span>داکتر</span><select id="v_dr">${opt(App.doctors.map(d => [d.id, doctorName(d)]), st.doctor, { empty: 'همه' })}</select></label>
        <label class="field"><span>وضعیت</span><select id="v_st">${opt(Object.entries(VISIT_STATUS).map(([k, v]) => [k, v[0]]), st.status, { empty: 'همه' })}</select></label>
        <label class="field grow"><span>جستجو</span><input id="v_q" placeholder="نام، کد مریض، رسید…"></label>
        <label class="check"><input type="checkbox" id="v_bal"> فقط باقی‌دار / بازپرداخت</label>
      </div>
      <div class="queueCols" id="qCols" style="margin-bottom:16px"></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>نوبت</th><th>تاریخ</th><th>رسید</th><th>کد مریض</th><th>نام / ولد</th><th>خدمت</th><th>داکتر</th><th>وضعیت</th><th>فیس</th><th>پرداخت</th><th>باقی</th><th></th></tr></thead><tbody id="vBody"></tbody></table></div><div class="sum" id="vSum"></div></div>`;
    let rows = [];
    const load = async () => {
      const q = { limit: 3000 };
      const d = dateOf($('#v_date', view)); if (d) q['eq.visit_date'] = d;
      if ($('#v_dr', view).value) q['eq.doctor_id'] = $('#v_dr', view).value;
      if ($('#v_st', view).value) q['eq.status'] = $('#v_st', view).value;
      if ($('#v_q', view).value.trim()) q.q = $('#v_q', view).value.trim();
      if ($('#v_bal', view).checked) { delete q['eq.visit_date']; q['ne.balance'] = 0; q['ne.status'] = 'cancelled'; }
      rows = await API.list('visits', { ...q, order: 'turn_no' });
      if ($('#v_bal', view).checked) rows = rows.filter(r => Math.abs(r.balance) > 0.001);
      draw();
    };
    const draw = () => {
      // queue columns per doctor / service
      const groups = new Map();
      for (const v of rows.filter(r => r.status !== 'cancelled')) { const k = v.doctor_id ? doctorName({ title: v.doctor_title, name: v.doctor_name }) : v.service_name; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(v); }
      $('#qCols', view).innerHTML = [...groups.entries()].map(([k, list]) => `<div class="qCol"><h3><span>${esc(k)}</span><small class="muted">${list.filter(v => v.status === 'waiting').length} در انتظار · ${list.length} کل</small></h3>
        ${list.sort((a, b) => (a.turn_no || 0) - (b.turn_no || 0)).map(v => `<div class="qItem ${v.status}" data-id="${v.id}"><div class="qNo">${v.turn_no || '—'}</div><div class="grow"><b>${esc(v.full_name)}</b><small>ولد ${esc(v.father_name || '—')} · ${esc(v.patient_code)}${v.reserved_time ? ' · ساعت ' + esc(v.reserved_time) : ''}</small></div>${statusPill(VISIT_STATUS, v.status)}</div>`).join('')}</div>`).join('') || '';
      $('#vBody', view).innerHTML = rows.map(v => `<tr data-id="${v.id}"><td class="c"><b>${v.turn_no || '—'}</b></td><td class="nowrap">${fmtDate(v.visit_date)}${v.reserved_time ? ` <small class="muted ltr">${esc(v.reserved_time)}</small>` : ''}</td><td class="codeTag">${esc(v.visit_no)}</td><td class="codeTag">${esc(v.patient_code)}</td>
        <td><b>${esc(v.full_name)}</b> <small class="muted">ولد ${esc(v.father_name || '—')}</small></td><td>${esc(v.service_name)}</td><td>${esc(v.doctor_name || '—')}</td><td>${statusPill(VISIT_STATUS, v.status)}</td>
        <td>${money(v.net)}${v.doctor_discount ? ` <small class="pill violet">تخفیف داکتر ${money(v.doctor_discount)}</small>` : ''}</td><td>${money(v.paid)}</td>
        <td class="${v.balance > 0.001 ? 'neg' : v.balance < -0.001 ? 'pos' : ''}">${Math.abs(v.balance) > 0.001 ? (v.balance > 0 ? money(v.balance) : 'بازپرداخت ' + money(-v.balance)) : '—'}</td>
        <td class="nowrap"><button class="btn sm" data-act="menu" data-id="${v.id}">عملیات ▾</button></td></tr>`).join('') || emptyRow(12);
      const act = rows.filter(r => r.status !== 'cancelled');
      $('#vSum', view).innerHTML = `<span>تعداد: <b>${act.length}</b></span><span>فیس خالص: <b>${money(act.reduce((a, r) => a + r.net, 0))}</b></span><span>دریافت شده: <b>${money(act.reduce((a, r) => a + r.paid, 0))}</b></span><span>در انتظار: <b>${act.filter(r => r.status === 'waiting').length}</b></span><span>ویزیت شده: <b>${act.filter(r => r.status === 'done').length}</b></span>`;
    };
    const visitMenu = (id) => {
      const v = rows.find(r => r.id === id); if (!v) return;
      const m = modal({ title: `${esc(v.full_name)} — نوبت ${v.turn_no || '—'}`, body: `<div class="ptHead">${patientHeadHTML({ ...v, code: v.patient_code })}</div>
        <div class="sum"><span>خدمت: <b>${esc(v.service_name)}</b></span><span>داکتر: <b>${esc(v.doctor_name || '—')}</b></span><span>وضعیت: ${statusPill(VISIT_STATUS, v.status)}</span><span>فیس: <b>${money(v.net)}</b></span><span>پرداخت: <b>${money(v.paid)}</b></span>
        ${v.doctor_discount ? `<span>تخفیف داکتر: <b>${money(v.doctor_discount)}</b> ${esc(v.doctor_discount_note || '')}</span>` : ''}</div>
        <div class="bar" style="margin-top:14px;flex-wrap:wrap">
          <button class="btn primary" data-a="print">${icon('print')} چاپ رسید</button>
          ${v.status === 'reserved' ? `<button class="btn success" data-a="checkin">${icon('check')} مریض حاضر شد</button>` : ''}
          ${v.balance > 0.001 ? `<button class="btn success" data-a="pay">${icon('money')} دریافت باقی (${money(v.balance)})</button>` : ''}
          ${v.balance < -0.001 ? `<button class="btn" data-a="refund">${icon('money')} بازپرداخت ${money(-v.balance)}</button>` : ''}
          <button class="btn" data-a="edit">${icon('edit')} ویرایش فیس / داکتر</button>
          <button class="btn" data-a="lab">${icon('flask')} آزمایش لابراتوار</button><button class="btn" data-a="account">${icon('cash')} حساب کامل مریض</button>
          ${['waiting', 'in_visit'].includes(v.status) ? `<button class="btn" data-a="call">${icon('megaphone')} صدا زدن (TV)</button>` : ''}
          ${['waiting', 'reserved'].includes(v.status) ? `<button class="btn" data-a="noshow">نیامد</button><button class="btn dangerText" data-a="cancel">${icon('x')} لغو نوبت</button>` : ''}
        </div>` });
      const done = () => { m.close(); load(); };
      $('.bar', m.el).onclick = (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
        (async () => {
          if (a === 'print') return printDoc(visitReceiptHTML(v), { size: 'receipt', title: v.visit_no });
          if (a === 'checkin') { const r = await API.post('/api/visits/status/' + v.id, { status: 'waiting' }); toast('مریض به صف اضافه شد — نوبت ' + r.turn_no, 'good'); done(); if (await confirmDlg('رسید نوبت چاپ شود؟')) printDoc(visitReceiptHTML(r), { size: 'receipt' }); }
          if (a === 'pay') { const amt = await promptDlg('دریافت باقی فیس', { label: 'مبلغ', value: v.balance, type: 'number' }); if (amt) { await API.post('/api/visits/pay/' + v.id, { amount: Number(amt), method: 'cash' }); toast('دریافت شد', 'good'); done(); } }
          if (a === 'refund') { if (await confirmDlg(`مبلغ ${money(-v.balance)} ${currency()} (تخفیف داکتر) به مریض مسترد شود؟`)) { await API.post('/api/visits/pay/' + v.id, { amount: v.balance, method: 'cash', note: 'بازپرداخت تخفیف داکتر' }); toast('بازپرداخت ثبت شد', 'good'); done(); } }
          if (a === 'noshow') { await API.post('/api/visits/status/' + v.id, { status: 'no_show' }); done(); }
          if (a === 'cancel') { const r = await promptDlg('لغو نوبت', { label: 'دلیل لغو' }); if (r !== null) { await API.post('/api/visits/status/' + v.id, { status: 'cancelled', reason: r }); if (v.paid > 0 && await confirmDlg(`فیس ${money(v.paid)} پس داده شود؟`)) await API.post('/api/visits/pay/' + v.id, { amount: -v.paid, note: 'لغو نوبت' }); done(); } }
          if (a === 'edit') { m.close(); editVisit(v, load); }
          if (a === 'lab') { m.close(); go('rc-lab', { patient_id: v.patient_id, doctor_id: v.doctor_id }); }
          if (a === 'account') { m.close(); patientAccountDlg(v.patient_id, load); }
          if (a === 'call') { await API.post('/api/visits/call/' + v.id); toast('نوبت ' + v.turn_no + ' در صفحه نمایش اعلام شد', 'good'); done(); }
        })().catch(errToast);
      };
    };
    $$('#v_date, #v_dr, #v_st, #v_bal', view).forEach(el => el.addEventListener('change', load));
    $('#v_q', view).addEventListener('input', debounce(load, 300));
    view.addEventListener('click', (e) => { const q = e.target.closest('.qItem'); if (q) visitMenu(Number(q.dataset.id)); });
    actions(view, { menu: (b) => visitMenu(Number(b.dataset.id)), new: () => go('reception'),
      csv: () => exportCSV('visits-' + (dateOf($('#v_date', view)) || 'all'), rows, [['turn_no', 'نوبت'], ['visit_no', 'رسید'], ['patient_code', 'کد مریض'], ['full_name', 'نام'], ['father_name', 'ولد'], ['service_name', 'خدمت'], ['doctor_name', 'داکتر'], [r => VISIT_STATUS[r.status]?.[0], 'وضعیت'], ['net', 'فیس'], ['paid', 'پرداخت'], ['visit_date', 'تاریخ']]) });
    await load();
    this._load = load;
  },
  onEvent(m) { if (m.type.startsWith('visit') && this._load) this._load(); }
};

function editVisit(v, after) {
  const m = modal({ title: 'ویرایش پذیرش ' + esc(v.visit_no), body: `<div class="formGrid">
    <label class="field"><span>خدمت</span><select id="e_svc">${opt(App.services.map(s => [s.id, s.name]), v.service_id, { empty: v.service_id ? undefined : v.service_name })}</select></label>
    <label class="field"><span>داکتر</span><select id="e_dr">${opt(App.doctors.map(d => [d.id, doctorName(d)]), v.doctor_id, { empty: 'بدون داکتر' })}</select></label>
    <label class="field"><span>تاریخ</span>${dateInput('d', v.visit_date, 'id="e_date"')}</label>
    <label class="field"><span>ساعت (رزرو)</span><input type="time" id="e_time" value="${esc(v.reserved_time || '')}"></label>
    <label class="field"><span>فیس</span><input type="number" id="e_fee" value="${v.fee}"></label>
    <label class="field"><span>تخفیف</span><input type="number" id="e_disc" value="${v.discount}"></label>
    <label class="field full"><span>یادداشت</span><input id="e_note" value="${esc(v.note || '')}"></label></div>
    <div class="infoBox" style="margin-top:12px">اگر داکتر یا تاریخ تغییر کند، نمبر نوبت جدید داده می‌شود.</div>`,
    foot: `<button class="btn primary" id="e_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
  $('[data-x]', m.el).onclick = m.close;
  $('#e_ok', m.el).onclick = () => busy($('#e_ok', m.el), async () => {
    const body = { fee: $('#e_fee', m.el).value, discount: $('#e_disc', m.el).value, note: $('#e_note', m.el).value, reserved_time: $('#e_time', m.el).value, doctor_id: $('#e_dr', m.el).value || null, visit_date: dateOf($('#e_date', m.el)) };
    if ($('#e_svc', m.el).value) body.service_id = $('#e_svc', m.el).value;
    const r = await API.post('/api/visits/update/' + v.id, body);
    toast('ذخیره شد — نوبت ' + r.turn_no, 'good'); m.close(); after && after();
  }).catch(errToast);
}

// ================================================================ reservations
Pages.reservations = {
  async render(view) {
    const from = today(), to = isoDate(addDays(new Date(), 30));
    view.innerHTML = `<div class="pageHead"><div><h1>وقت‌دهی / رزرو</h1><p>نوبت‌های رزرو شده برای روزهای آینده. هنگام آمدن مریض «حاضر شد» را بزنید تا به صف داکتر برود.</p></div>
      <div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} رزرو جدید</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', from, 'id="r_from"')}</label><label class="field"><span>تا</span>${dateInput('to', to, 'id="r_to"')}</label>
      <label class="field"><span>داکتر</span><select id="r_dr">${opt(App.doctors.map(d => [d.id, doctorName(d)]), '', { empty: 'همه' })}</select></label></div><div id="rList"></div>`;
    const load = async () => {
      const q = { 'eq.status': 'reserved', from: dateOf($('#r_from', view)), to: dateOf($('#r_to', view)), order: 'visit_date', limit: 2000 };
      if ($('#r_dr', view).value) q['eq.doctor_id'] = $('#r_dr', view).value;
      const rows = await API.list('visits', q);
      const byDay = new Map(); rows.forEach(r => { if (!byDay.has(r.visit_date)) byDay.set(r.visit_date, []); byDay.get(r.visit_date).push(r); });
      $('#rList', view).innerHTML = [...byDay.entries()].map(([d, list]) => `<div class="card"><div class="cardHead"><h2>${icon('calendar', 16)} ${weekday(d)} ${fmtDate(d)}</h2><span class="pill violet">${list.length} رزرو</span></div>
        <div class="tableWrap"><table class="t"><thead><tr><th>نوبت</th><th>ساعت</th><th>نام / ولد</th><th>کد</th><th>تلفن</th><th>خدمت</th><th>داکتر</th><th>پرداخت</th><th></th></tr></thead><tbody>
        ${list.sort((a, b) => (a.reserved_time || '').localeCompare(b.reserved_time || '') || a.turn_no - b.turn_no).map(r => `<tr><td class="c"><b>${r.turn_no}</b></td><td class="ltr">${esc(r.reserved_time || '')}</td><td><b>${esc(r.full_name)}</b> <small class="muted">ولد ${esc(r.father_name || '—')}</small></td><td class="codeTag">${esc(r.patient_code)}</td>
          <td class="ltr">${esc(r.phone || '')}</td><td>${esc(r.service_name)}</td><td>${esc(r.doctor_name || '—')}</td><td>${money(r.paid)} / ${money(r.net)}</td>
          <td class="nowrap"><button class="btn sm success" data-act="in" data-id="${r.id}">حاضر شد</button> <button class="btn sm" data-act="pr" data-id="${r.id}">${icon('print', 14)}</button> <button class="btn sm" data-act="ed" data-id="${r.id}">${icon('edit', 14)}</button> <button class="btn sm dangerText" data-act="cx" data-id="${r.id}">${icon('x', 14)}</button></td></tr>`).join('')}
        </tbody></table></div></div>`).join('') || '<div class="card empty">رزروی در این بازه وجود ندارد</div>';
      view._rows = rows;
    };
    const find = (b) => view._rows.find(r => r.id === Number(b.dataset.id));
    actions(view, {
      new: () => go('reception', { reserve: 1 }),
      in: async (b) => { const v = find(b); const r = await API.post('/api/visits/status/' + v.id, { status: 'waiting' }); toast(`${v.full_name} به صف اضافه شد — نوبت ${r.turn_no}`, 'good'); if (v.net - v.paid > 0.001 && await confirmDlg(`فیس ${money(v.net - v.paid)} دریافت شود؟`)) await API.post('/api/visits/pay/' + v.id, { amount: v.net - v.paid }); const v2 = await API.one('visits', v.id); printDoc(visitReceiptHTML(v2), { size: 'receipt' }); load(); },
      pr: (b) => printDoc(visitReceiptHTML(find(b)), { size: 'receipt' }),
      ed: (b) => editVisit(find(b), load),
      cx: async (b) => { const v = find(b); if (await confirmDlg(`رزرو ${esc(v.full_name)} لغو شود؟`, { danger: true })) { await API.post('/api/visits/status/' + v.id, { status: 'cancelled', reason: 'لغو رزرو' }); load(); } }
    });
    $$('#r_from, #r_to, #r_dr', view).forEach(el => el.addEventListener('change', load));
    await load();
  }
};

// ================================================================ patients
Pages.patients = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>مریضان</h1><p>فایل همه مریضان با کد مریض. ${isRole('doctor') ? 'برای دیدن پرونده کامل روی مریض کلیک کنید.' : ''}</p></div>
      <div class="toolbar">${isRole('reception', 'doctor') ? `<button class="btn primary" data-act="new">${icon('plus')} مریض جدید</button>` : ''}</div></div>
      <div class="filterBar"><label class="field grow"><span>جستجو</span><input id="p_q" placeholder="کد مریض، نام، ولد، تلفن…" autofocus></label></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>کد</th><th>نام</th><th>ولد</th><th>جنس</th><th>سن</th><th>تلفن</th><th>آدرس</th><th>ثبت</th><th></th></tr></thead><tbody id="pBody"></tbody></table></div>
      <div class="bar" style="margin-top:10px"><button class="btn sm" data-act="more">نمایش بیشتر</button><small class="muted" id="pCount"></small></div></div>`;
    let limit = 100;
    const load = async () => {
      const r = await API.list('patients', { q: $('#p_q', view).value.trim(), limit, count: 1 });
      $('#pBody', view).innerHTML = r.rows.map(p => `<tr class="clickable" data-id="${p.id}"><td class="codeTag">${esc(p.code)}</td><td><b>${esc(p.full_name)}</b></td><td>${esc(p.father_name || '')}</td><td>${sexFa(p.sex)}</td><td>${esc(ageLabel(p.birth_date))}</td>
        <td class="ltr">${esc(p.phone || '')}</td><td>${esc(p.address || '')}</td><td>${fmtDate(p.created_at)}</td><td class="nowrap">${isRole('reception') ? `<button class="btn sm" data-act="visit" data-id="${p.id}">${icon('ticket', 14)} نوبت</button> ` : ''}<button class="btn sm" data-act="edit" data-id="${p.id}">${icon('edit', 14)}</button> <button class="btn sm ghost" data-act="card" data-id="${p.id}" title="کارت مریض">${icon('barcode', 14)}</button></td></tr>`).join('') || emptyRow(9);
      $('#pCount', view).textContent = `${r.rows.length} از ${r.total}`;
    };
    $('#p_q', view).addEventListener('input', debounce(() => { limit = 100; load(); }, 300));
    view.addEventListener('click', (e) => { const tr = e.target.closest('tr.clickable'); if (tr && !e.target.closest('button')) { const id = Number(tr.dataset.id); isRole('doctor') ? openPatientFile(id) : openPatientBasic(id); } });
    actions(view, { more: () => { limit += 200; load(); }, new: () => editPatient(null, load), edit: async (b) => editPatient(await API.one('patients', b.dataset.id), load), visit: (b) => go('reception', { patient_id: Number(b.dataset.id) }), card: async (b) => printPatientCard(await API.get('/api/patient-basic/' + b.dataset.id)) });
    await load();
  }
};

function editPatient(p, after) {
  p = p || { sex: 'M' };
  const a = ageParts(p.birth_date);
  const full = isRole('doctor');
  const m = modal({ title: p.id ? 'ویرایش مریض ' + esc(p.code) : 'مریض جدید', size: 'wide', body: `<div class="formGrid" id="epF">
    <label class="field"><span>نام <em>*</em></span><input name="full_name" value="${esc(p.full_name || '')}"></label>
    <label class="field"><span>ولد</span><input name="father_name" value="${esc(p.father_name || '')}"></label>
    <label class="field"><span>جنس</span><select name="sex">${opt([['M', 'مذکر'], ['F', 'مونث']], p.sex)}</select></label>
    <div class="field span2"><span>سن (سال / ماه / روز)</span>${ageInputHTML('epAge', p.birth_date)}</div>
    <label class="field"><span>یا تاریخ تولد</span>${dateInput('birth_date', '', 'id="ep_birth"')}</label>
    <label class="field"><span>تلفن</span><input name="phone" class="ltr" value="${esc(p.phone || '')}"></label>
    <label class="field"><span>تذکره</span><input name="tazkira" value="${esc(p.tazkira || '')}"></label>
    <label class="field"><span>گروپ خون</span><select name="blood_group">${opt(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], p.blood_group, { empty: '—' })}</select></label>
    <label class="field full"><span>آدرس</span><input name="address" value="${esc(p.address || '')}"></label>
    <label class="field"><span>شخص تماس اضطراری</span><input name="emergency_name" value="${esc(p.emergency_name || '')}"></label><label class="field"><span>تلفن اضطراری</span><input name="emergency_phone" class="ltr" value="${esc(p.emergency_phone || '')}"></label>
    <label class="field"><span>بیمه</span><input name="insurance" value="${esc(p.insurance || '')}"></label><label class="field"><span>شماره بیمه</span><input name="insurance_no" class="ltr" value="${esc(p.insurance_no || '')}"></label>
    ${full ? `<label class="field full"><span>حساسیت‌ها (Allergies)</span><input name="allergies" value="${esc(p.allergies || '')}"></label>
    <label class="field span2"><span>امراض مزمن / سابقه مریضی</span><textarea name="chronic_diseases">${esc(p.chronic_diseases || '')}</textarea></label>
    <label class="field span2"><span>سابقه قبلی (عملیات، بستری…)</span><textarea name="past_history">${esc(p.past_history || '')}</textarea></label>
    <label class="field span2"><span>سابقه فامیلی</span><textarea name="family_history">${esc(p.family_history || '')}</textarea></label>
    <label class="field span2"><span>دواهای فعلی</span><textarea name="current_medications">${esc(p.current_medications || '')}</textarea></label>` : ''}
    <label class="field full"><span>یادداشت</span><textarea name="notes">${esc(p.notes || '')}</textarea></label></div>`,
    foot: `<button class="btn primary" id="ep_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
  bindAgeInput(m.el, 'epAge');
  const origAge = JSON.stringify(ageValue(m.el, 'epAge'));
  $('[data-x]', m.el).onclick = m.close;
  $('#ep_ok', m.el).onclick = () => busy($('#ep_ok', m.el), async () => {
    const v = formValues($('#epF', m.el)); if (p.id) v.id = p.id;
    if (!v.birth_date) { delete v.birth_date; const av = ageValue(m.el, 'epAge'); if (av && JSON.stringify(av) !== origAge) Object.assign(v, av); }
    await API.save('patients', v); toast('ذخیره شد', 'good'); m.close(); after && after();
  }).catch(errToast);
}
