/* Doctor station: queue, visit (vitals, examination, prescription, lab request, discount, print options), patient file */
'use strict';

let LabCat = null;   // laboratory catalog cache
async function loadLabCatalog(force) {
  if (LabCat && !force) return LabCat;
  const c = await API.get('/api/lab/catalog');
  c.byId = new Map(c.tests.map(t => [t.id, t]));
  c.deptById = new Map(c.departments.map(d => [d.id, d]));
  c.components = new Map(); c.panel_items.forEach(p => { if (!c.components.has(p.panel_id)) c.components.set(p.panel_id, []); c.components.get(p.panel_id).push(p.test_id); });
  c.ranges = c.ranges.reduce((m, r) => { if (!m.has(r.test_id)) m.set(r.test_id, []); m.get(r.test_id).push(r); return m; }, new Map());
  c.kits = c.kits || []; c.reception_types = c.reception_types || []; c.referrers = c.referrers || [];
  c.rtById = new Map(c.reception_types.map(x => [x.id, x]));
  return (LabCat = c);
}
const QUICK_TESTS = ['CBC', 'ESR', 'CRP', 'GLUF', 'GLUR', 'HBA1C', 'URINE', 'STOOL', 'LFT', 'RFT', 'LIPID', 'TSH', 'TFT', 'HBSAG', 'HCV', 'HIV', 'WIDAL', 'MP', 'HPYLAG', 'BGRH', 'BHCG', 'UPT', 'VITD', 'FERR', 'UA', 'RF', 'ASO'];

function myDoctorId() { return App.user.role === 'doctor' ? App.user.doctor_id : (Number(localGet('admin_doctor', '')) || App.doctors[0]?.id); }

// ================================================================ queue
Pages['dr-queue'] = {
  async render(view) {
    const isAdmin = App.user.role !== 'doctor';
    view.innerHTML = `<div class="pageHead"><div><h1>صف مریضان ${App.user.doctor ? '— ' + esc(doctorName(App.user.doctor)) : ''}</h1><p>مریضانی که پذیرش برای شما نوبت داده است. با کلیک روی مریض، صفحه ویزیت و نسخه باز می‌شود.</p></div>
      <div class="toolbar">${isAdmin ? `<select id="q_dr" style="width:auto">${opt(App.doctors.map(d => [d.id, doctorName(d)]), myDoctorId())}</select>` : ''}
        <button class="btn primary lg" data-act="next">${icon('next')} مریض بعدی</button><button class="btn" data-act="walk">${icon('plus')} ویزیت بدون نوبت</button></div></div>
      <div class="grid g3" id="qK"></div>
      <div class="queueCols" style="margin-top:16px"><div class="qCol"><h3>در انتظار <small id="cW"></small></h3><div id="qW"></div></div><div class="qCol"><h3>نزد داکتر <small id="cI"></small></h3><div id="qI"></div></div><div class="qCol"><h3>ویزیت شده امروز <small id="cD"></small></h3><div id="qD"></div></div></div>
      <div class="card" id="qAdmBox" style="margin-top:16px"><div class="cardHead"><h2>${icon('bed')} مریضان بستری <small id="cA" class="muted"></small></h2><button class="btn sm" data-act="ipd">${icon('bed', 13)} بستر و تخت‌ها</button></div><div id="qA"></div></div>`;
    let rows = [];
    const dr = () => isAdmin ? Number($('#q_dr', view).value) : App.user.doctor_id;
    const item = (v) => `<div class="qItem ${v.status}" data-id="${v.id}"><div class="qNo">${v.turn_no || '—'}</div><div class="grow"><b>${esc(v.full_name)}</b><small>ولد ${esc(v.father_name || '—')} · ${esc(ageLabel(v.birth_date))} · ${sexFa(v.sex)} · ${esc(v.service_name)}${v.note ? ' · ' + esc(v.note) : ''}</small></div>${['waiting', 'in_visit'].includes(v.status) ? `<button class="btn sm ghost" data-call="${v.id}" title="صدا زدن در صفحه نمایش (TV)">${icon('megaphone', 14)}</button>` : ''}<small class="muted ltr">${fmtTime(v.checked_in_at || v.created_at)}</small></div>`;
    const load = async () => {
      const q = { 'eq.visit_date': today(), order: 'turn_no', limit: 500 }; if (dr()) q['eq.doctor_id'] = dr();
      rows = (await API.list('visits', q)).filter(v => !['cancelled', 'reserved', 'no_show'].includes(v.status));
      const W = rows.filter(v => v.status === 'waiting'), I = rows.filter(v => v.status === 'in_visit'), D = rows.filter(v => v.status === 'done');
      $('#qW', view).innerHTML = W.map(item).join('') || '<div class="empty">کسی در انتظار نیست</div>';
      $('#qI', view).innerHTML = I.map(item).join('') || '<div class="empty">—</div>';
      $('#qD', view).innerHTML = D.map(item).join('') || '<div class="empty">—</div>';
      $('#cW', view).textContent = W.length; $('#cI', view).textContent = I.length; $('#cD', view).textContent = D.length;
      $('#qK', view).innerHTML = kpi('در انتظار', W.length, { ic: 'clock', cls: 'warn' }) + kpi('ویزیت شده امروز', D.length, { ic: 'check', cls: 'good' }) + kpi('مجموع مریضان امروز', rows.length, { ic: 'users' });
      const aq = { 'eq.status': 'admitted', limit: 100 }; if (dr()) aq['eq.doctor_id'] = dr();
      const adm = await API.list('admissions', aq).catch(() => []);
      $('#cA', view).textContent = adm.length; $('#qAdmBox', view).classList.toggle('hidden', !adm.length);
      $('#qA', view).innerHTML = `<div class="bedGrid">${adm.map(a => `<div class="bedCard busy" data-adm="${a.id}"><div class="bn"><span>${esc(a.bed_name || '')}</span><span class="codeTag">${esc(a.adm_no)}</span></div><b>${esc(a.full_name)}</b><small class="muted">${esc(ageLabel(a.birth_date))} · ${sexFa(a.sex)} · از ${fmtDate(a.admitted_at)}</small><div class="mini">${esc(a.diagnosis || '')}</div>
        <div class="bar" style="margin-top:6px"><button class="btn sm" data-admvisit="${a.patient_id}">${icon('rx', 13)} ویزیت / نسخه</button></div></div>`).join('')}</div>`;
    };
    view.addEventListener('click', (e) => {
      const c = e.target.closest('[data-call]'); if (c) { e.stopPropagation(); API.post('/api/visits/call/' + c.dataset.call).then(x => toast(`نوبت ${x.turn} صدا زده شد`, 'good')).then(load).catch(errToast); return; }
      const av = e.target.closest('[data-admvisit]'); if (av) { go('encounter', { patient_id: Number(av.dataset.admvisit) }); return; }
      const ad = e.target.closest('[data-adm]'); if (ad) { admissionDlg(Number(ad.dataset.adm), load).catch(errToast); return; }
      const q = e.target.closest('.qItem'); if (q) go('encounter', { visit_id: Number(q.dataset.id) });
    });
    if (isAdmin) $('#q_dr', view).onchange = () => { localSet('admin_doctor', $('#q_dr', view).value); load(); };
    actions(view, {
      ipd: () => go('ipd'),
      next: async () => { const w = rows.find(v => v.status === 'waiting'); if (!w) return toast('مریضی در انتظار نیست'); await API.post('/api/visits/call/' + w.id).catch(() => API.post('/api/visits/status/' + w.id, { status: 'in_visit' })); go('encounter', { visit_id: w.id }); },
      walk: async () => {
        const m = modal({ title: 'ویزیت بدون نوبت — انتخاب مریض', body: `<div class="searchBox"><input id="wk_q" placeholder="کد مریض، نام یا تلفن…"></div><div class="muted small" style="margin-top:8px">مریض باید قبلاً در سیستم ثبت شده باشد (پذیرش). برای مریض جدید از دکمه زیر استفاده کنید.</div>`,
          foot: `<button class="btn" id="wk_new">${icon('plus')} ثبت مریض جدید</button>` });
        patientSearch($('#wk_q', m.el), (p) => { m.close(); go('encounter', { patient_id: p.id }); });
        $('#wk_new', m.el).onclick = () => { m.close(); editPatient(null, async () => { const r = await API.list('patients', { limit: 1 }); if (r[0]) go('encounter', { patient_id: r[0].id }); }); };
      }
    });
    await load(); this._load = load;
  },
  onEvent(m) { if ((m.type.startsWith('visit') || m.type.startsWith('ipd')) && this._load) this._load(); }
};

// ================================================================ encounter (visit + prescription + lab)
function timesPerDay(f) { return rxTimesPerDay(f); }
function doseNum(d) { const s = String(d || '').replace('½', '0.5').replace('¼', '0.25').replace('¾', '0.75').trim(); const m = s.match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?/); if (!m) return null; return m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]); }
function autoQty(it) {
  const countable = /Tablet|Capsule|Sachet|Suppository|Vaginal|Injection|Lozenge/i.test(it.form || '');
  if (!countable) return it.qty || 1;
  if (/یک دفعه|STAT/i.test(it.frequency || '')) return Math.ceil(doseNum(it.dose) || 1);
  const u = rxEn(it.duration_unit || '');
  let t = timesPerDay(it.frequency); const d = doseNum(it.dose) || 1, days = rxDays(it);
  if (t && /alternate/i.test(u)) t = t / 2; else if (t && /every 2 days|every 3rd/i.test(u)) t = t / 3;
  if (/date/i.test(u) && t) t = Math.max(t, 1);
  if (!t || !days) return it.qty || '';
  return Math.ceil(d * t * days);
}

Pages.encounter = {
  async render(view, params) {
    const cat = await loadLabCatalog();
    let visit = null, enc = null, patient = null;
    if (params.encounter_id) { enc = await API.get('/api/encounter/' + params.encounter_id); visit = enc.visit; }
    else if (params.visit_id) {
      visit = await API.one('visits', params.visit_id);
      const eid = await API.get('/api/encounter-by-visit/' + params.visit_id);
      if (eid) enc = await API.get('/api/encounter/' + eid);
      if (visit && visit.status === 'waiting') { try { await API.post('/api/visits/status/' + visit.id, { status: 'in_visit' }); visit.status = 'in_visit'; } catch (_) { } }
    }
    const pid = params.patient_id || visit?.patient_id || enc?.patient_id;
    if (!pid) {
      view.innerHTML = `<div class="pageHead"><div><h1>ویزیت، نسخه و آزمایش</h1><p>مریض را از صف انتخاب کنید یا جستجو کنید.</p></div></div>
        <div class="card"><div class="searchBox"><input id="enc_q" placeholder="کد مریض، نام یا تلفن…" autofocus></div><div class="bar" style="margin-top:12px"><button class="btn" data-act="queue">${icon('list')} رفتن به صف</button></div></div>`;
      patientSearch($('#enc_q', view), (p) => go('encounter', { patient_id: p.id }));
      actions(view, { queue: () => go('dr-queue') });
      return;
    }
    const file = await API.get('/api/patient-file/' + pid);
    patient = file.patient;
    const enRx = (i) => ({ ...i, frequency: rxEn(i.frequency), timing: rxEn(i.timing), duration_unit: rxEn(i.duration_unit), route: rxEn(i.route) });
    const rxItems = (enc?.rx?.items || []).map(enRx);
    const labIds = (enc?.lab?.items || []).map(i => i.test_id);
    const rxLocked = enc?.rx && !['new', 'cancelled'].includes(enc.rx.status);
    const labLocked = enc?.lab && enc.lab.status !== 'requested';
    const defOpts = JSON.parse(App.settings.rx_default_print || '{}');
    const opts = { ...defOpts, ...JSON.parse(localGet('rx_print_' + (App.user.doctor_id || 0), '{}')), ...(enc?.print_opts ? JSON.parse(enc.print_opts) : {}) };
    const E = enc || {};
    const forms = listSetting('rx_forms'), units = listSetting('rx_units'), freqs = listSetting('rx_frequencies'), timings = listSetting('rx_timings'), durs = listSetting('rx_duration_units'), routes = listSetting('rx_routes'), doses = listSetting('rx_doses');
    const v = (k) => E[k] ?? '';
    const visitDiscount = visit ? visit.doctor_discount || 0 : 0;

    view.innerHTML = `
      <div class="pageHead"><div class="ptHead">${patientHeadHTML(patient)}</div>
        <div class="toolbar">${visit ? `<span class="pill info">نوبت ${visit.turn_no || '—'} · ${esc(visit.service_name)}</span>${['waiting', 'in_visit'].includes(visit.status) ? `<button class="btn sm" data-act="call" title="اعلام نوبت در صفحه نمایش">${icon('megaphone', 14)} صدا زدن</button>` : ''}` : ''}${enc ? `<span class="pill">ویزیت #${enc.id}</span>` : '<span class="pill warn">ویزیت جدید</span>'}
          <button class="btn" data-act="file">${icon('file')} پرونده کامل</button><button class="btn" data-act="editPt">${icon('edit')} مشخصات</button></div></div>
      ${visit?.note ? `<div class="infoBox">یادداشت پذیرش: ${esc(visit.note)}</div>` : ''}
      ${patient.allergies ? `<div class="warnBox">${icon('alert', 15)} حساسیت: <b>${esc(patient.allergies)}</b></div>` : ''}
      <div id="savedBanner">${params.saved || ''}</div>
      <div class="encGrid">
        <div>
          <div class="card"><h2>${icon('heart')} علایم حیاتی</h2>
            <div class="vitals" id="vit">
              ${[['bp_sys', 'فشار (سیستول)', 'mmHg'], ['bp_dia', 'فشار (دیاستول)', 'mmHg'], ['pulse', 'نبض PR', '/min'], ['resp_rate', 'تنفس RR', '/min'], ['temp', 'حرارت T', '°C'], ['weight', 'وزن', 'kg'], ['height', 'قد', 'cm'], ['spo2', 'SpO₂', '%'], ['blood_sugar', 'قند خون', 'mg/dL'], ['head_circ', 'دور سر', 'cm']]
                .map(([k, l, u]) => `<label class="field"><span>${l} <small class="muted">${u}</small></span><input name="${k}" type="number" step="any" value="${esc(v(k) || (k === 'weight' && visit?.weight ? visit.weight : '') || (k === 'height' && visit?.height ? visit.height : ''))}"></label>`).join('')}
            </div><div class="mini" id="bmiBox" style="margin-top:6px"></div></div>
          <div class="card"><h2>${icon('steth')} شکایت، معاینه و تشخیص</h2>
            <div class="formGrid" id="clin">
              <label class="field span2"><span>شکایت اصلی</span><textarea name="complaint" rows="2">${esc(v('complaint'))}</textarea></label>
              <label class="field span2"><span>تاریخچه مریضی فعلی</span><textarea name="history" rows="2">${esc(v('history'))}</textarea></label>
              <label class="field span2"><span>معاینه فزیکی</span><textarea name="exam" rows="2">${esc(v('exam'))}</textarea></label>
              <label class="field"><span>تشخیص (Diagnosis)</span><input name="diagnosis" class="en" value="${esc(v('diagnosis'))}" list="dxList"></label>
              <label class="field"><span>کد ICD-10 <small class="muted">(کد یا نام را بنویسید)</small></span><input name="diagnosis_code" class="ltr" value="${esc(v('diagnosis_code'))}" list="icdList" placeholder="J06.9"></label>
              <label class="field span2"><span>Impression</span><input name="impression" class="en" value="${esc(v('impression'))}"></label>
              <label class="field span2"><span>یادداشت داکتر <small class="muted">(فقط در صورت انتخاب چاپ می‌شود)</small></span><textarea name="notes" rows="2">${esc(v('notes'))}</textarea></label>
              <label class="field full"><span>یادداشت خصوصی <small class="muted">(هرگز چاپ نمی‌شود)</small></span><input name="private_notes" value="${esc(v('private_notes'))}"></label>
            </div></div>
        </div>
        <div>
          <div class="card"><div class="cardHead"><h2>${icon('print')} چاپ نسخه — چه چیزی روی کاغذ باشد؟</h2></div>
            <div class="printOpts" id="pOpts">
              ${[['patient', 'مشخصات مریض', 1], ['vitals', 'علایم حیاتی (BP, PR, RR, T)'], ['complaint', 'شکایت'], ['diagnosis', 'تشخیص'], ['impression', 'Impression'], ['history', 'سابقه مریضی'], ['allergies', 'حساسیت‌ها'], ['notes', 'یادداشت داکتر'], ['labs', 'آزمایش‌های درخواستی'], ['next_visit', 'تاریخ مراجعه بعدی'], ['print_note', 'توصیه داکتر'], ['barcode', 'بارکود کد نسخه']]
                .map(([k, l, fixed]) => `<label class="check"><input type="checkbox" data-opt="${k}" ${fixed ? 'checked disabled' : opts[k] ? 'checked' : ''}> ${l}</label>`).join('')}
            </div>
            <label class="field" style="margin-top:10px"><span>یادداشت اضافه روی نسخه (در صورت نیاز)</span><textarea id="printNote" rows="2">${esc(v('print_note'))}</textarea></label>
            <label class="field" style="margin-top:10px"><span>مراجعه بعدی</span>${dateInput('next_visit', E.next_visit, 'id="nextVisit"')}</label>
            <div class="bar" style="margin-top:6px">${[3, 7, 14, 30].map(d => `<button type="button" class="chip" data-nv="${d}">${d} روز</button>`).join('')}</div>
          </div>
          ${visit ? `<div class="card"><h2>${icon('percent')} تخفیف فیس ویزیت</h2>
            <div class="formGrid"><label class="field"><span>فیس: ${money(visit.fee - visit.discount)} — مبلغ تخفیف</span><input type="number" id="visDisc" min="0" value="${visitDiscount}"></label>
            <label class="field"><span>دلیل</span><input id="visDiscNote" value="${esc(visit.doctor_discount_note || '')}"></label></div>
            <div class="mini">تخفیف داکتر به پذیرش اطلاع داده می‌شود تا پول به مریض مسترد شود. این معلومات روی نسخه مریض چاپ نمی‌شود.</div></div>` : ''}
          <div class="card"><div class="cardHead"><h2>${icon('user')} پرونده صحی مریض</h2></div>
            <div class="stack" id="ptMed">
              <label class="field"><span>حساسیت‌ها</span><input name="allergies" value="${esc(patient.allergies || '')}"></label>
              <label class="field"><span>امراض مزمن / سابقه مریضی</span><textarea name="chronic_diseases" rows="2">${esc(patient.chronic_diseases || '')}</textarea></label>
              <label class="field"><span>سابقه قبلی</span><textarea name="past_history" rows="2">${esc(patient.past_history || '')}</textarea></label>
              <label class="field"><span>سابقه فامیلی</span><input name="family_history" value="${esc(patient.family_history || '')}"></label>
              <label class="field"><span>دواهای فعلی</span><input name="current_medications" value="${esc(patient.current_medications || '')}"></label>
              <label class="field"><span>گروپ خون</span><select name="blood_group">${opt(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], patient.blood_group, { empty: '—' })}</select></label>
            </div></div>
          <div class="card"><div class="cardHead"><h2>${icon('clock')} سوابق</h2><div class="tabs" id="hTabs" style="margin:0;border:0"><button class="on" data-h="enc">ویزیت‌ها</button><button data-h="rx">داروها</button><button data-h="lab">آزمایش‌ها</button></div></div><div id="hist"></div></div>
        </div>
      </div>
      <div class="encWide">
          <div class="card"><div class="cardHead"><h2>${icon('rx')} نسخه (Rx) ${enc?.rx ? `<span class="rxCode">${esc(enc.rx.rx_code)}</span> ${statusPill(RX_STATUS, enc.rx.status)}` : ''}</h2>
            <div class="bar"><select id="tplSel" style="width:auto"><option value="">قالب نسخه…</option></select><button class="btn sm" data-act="saveTpl">${icon('star', 14)} ذخیره به عنوان قالب</button>
            <label class="field" style="flex-direction:row;align-items:center;gap:6px"><span>تخفیف دواخانه٪</span><input type="number" id="rxDisc" min="0" max="100" style="width:70px" value="${enc?.rx?.discount_pct || 0}"></label></div></div>
            ${rxLocked ? `<div class="warnBox">این نسخه توسط دواخانه ${enc.rx.status === 'dispensed' ? 'تحویل' : 'قسماً تحویل'} شده و قابل تغییر نیست.</div>` : ''}
            <div id="cdssRx"></div>
            <div class="rxItems"><div class="rxItem head"><span>#</span><span>دوا (Medicine)</span><span>شکل</span><span>قوت</span><span>واحد</span><span>مقدار</span><span>دفعات مصرف</span><span>زمان</span><span>مدت</span><span>واحد مدت</span><span>تعداد</span><span></span></div>
              <div id="rxRows"></div>
              ${rxLocked ? '' : `<div class="rxAdd"><div class="searchBox"><input id="medQ" placeholder="نام یا کد دوا را بنویسید و Enter بزنید… (دوای خارج از لیست هم قابل نوشتن است)" autocomplete="off"></div></div>`}</div>
            <label class="field" style="margin-top:10px"><span>توصیه / یادداشت نسخه (روی نسخه چاپ می‌شود)</span><input id="rxNote" value="${esc(enc?.rx?.note || '')}"></label>
          </div>
          <div class="card"><div class="cardHead"><h2>${icon('flask')} درخواست آزمایش ${enc?.lab ? `<span class="rxCode">${esc(enc.lab.lab_code)}</span> ${statusPill(LAB_STATUS, enc.lab.status)}` : ''}</h2>
            <div class="bar"><label class="check"><input type="checkbox" id="labUrg" ${enc?.lab?.urgent ? 'checked' : ''}> عاجل</label>
            <label class="field" style="flex-direction:row;align-items:center;gap:6px"><span>تخفیف لابراتوار٪</span><input type="number" id="labDisc" min="0" max="100" style="width:70px" value="${enc?.lab?.discount_pct || 0}"></label></div></div>
            ${labLocked ? `<div class="warnBox">این درخواست در لابراتوار پذیرش شده و قابل تغییر نیست.</div>` : `
            <div class="searchBox" style="margin-bottom:10px"><input id="testQ" placeholder="جستجوی آزمایش: نام، کد یا نمبر (مثلاً 401 یا CBC)…" autocomplete="off"></div>
            <div class="pickWrap" data-fold="doctor"><button type="button" class="btn sm ghost foldBtn" data-foldbtn="doctor">${icon('list', 13)} <span class="fShow">نمایش دکمه‌های آزمایش</span><span class="fHide">پنهان کردن دکمه‌ها</span></button><div class="pickBody testPick">${QUICK_TESTS.map(c => cat.tests.find(t => t.code === c && t.active && t.orderable)).filter(Boolean).map(t => `<button type="button" class="chip" data-tid="${t.id}">${esc(t.code)}</button>`).join('')}</div></div>`}
            <div class="selTests" id="selTests"></div><div id="cdssLab"></div>
            <label class="field" style="margin-top:10px"><span>یادداشت برای لابراتوار</span><input id="labNote" value="${esc(enc?.lab?.note || '')}"></label>
          </div>
      </div>
      <div class="stickyFoot">
        <button class="btn primary lg" data-act="save" data-mode="print">${icon('print')} ذخیره و چاپ نسخه</button>
        <button class="btn lg" data-act="save">${icon('check')} ذخیره <span class="kbd">Ctrl+S</span></button>
        ${visit ? `<button class="btn success lg" data-act="save" data-mode="finish">${icon('next')} ختم ویزیت و مریض بعدی</button>` : ''}
        <button class="btn lg" data-act="preview">${icon('eye')} پیش‌نمایش نسخه</button>
      </div>
      ${datalist('dxList', ['Upper respiratory tract infection (URTI)', 'Acute gastroenteritis', 'Pneumonia', 'Bronchiolitis', 'Otitis media', 'Tonsillitis / Pharyngitis', 'Urinary tract infection (UTI)', 'Iron deficiency anemia', 'Malnutrition', 'Typhoid fever', 'Brucellosis', 'Hypertension', 'Diabetes mellitus type 2', 'Gastritis / PUD', 'Pregnancy — routine ANC', 'Threatened abortion', 'Pre-eclampsia', 'Vaginitis', 'PCOS', 'Dysmenorrhea', 'Asthma', 'Allergic rhinitis', 'Tension headache', 'Migraine', ...ICD10.map(x => x[1])].filter((x, i, a) => a.indexOf(x) === i))}
      <datalist id="icdList">${ICD10.map(([c, n]) => `<option value="${esc(c)}">${esc(n)}</option>`).join('')}</datalist>
      ${datalist('formList', forms)}${datalist('unitList', units)}${datalist('freqList', freqs)}${datalist('timeList', timings)}${datalist('durList', durs)}${datalist('routeList', routes)}`;

    // ---------- prescription rows ----------
    const rowsEl = $('#rxRows', view);
    const drawRx = () => {
      rowsEl.innerHTML = rxItems.map((it, i) => `<div class="rxItem" data-i="${i}">
        <span class="idx">${i + 1}</span>
        <div><input class="medName" data-f="name" value="${esc(it.name)}" ${rxLocked ? 'readonly' : ''}><div class="stockHint">${it.medicine_id ? (it._stock === undefined ? '' : it._stock > 0 ? `<span class="pos">موجود: ${fmtNum(it._stock)}</span>` : `<span class="neg">در دواخانه موجود نیست</span>${(it._alts || []).length && !rxLocked ? ` · جایگزین: ${it._alts.map((a, k) => `<a href="#" class="altHint" data-alt="${i}:${k}">${esc(a.name)} ${esc(a.strength || '')} (${fmtNum(a.stock)})</a>`).join('، ')}` : ''}`) : '<span class="muted">خارج از لیست دواخانه</span>'}</div></div>
        <input data-f="form" data-combo="form" value="${esc(it.form || '')}" class="en" autocomplete="off">
        <input data-f="strength" value="${esc(it.strength || '')}" class="en">
        <input data-f="unit" data-combo="unit" value="${esc(it.unit || '')}" class="en" autocomplete="off">
        <input data-f="dose" data-combo="dose" value="${esc(it.dose || '')}" class="ltr" placeholder="1" autocomplete="off">
        <input data-f="frequency" data-combo="freq" value="${esc(it.frequency || '')}" class="en" autocomplete="off" placeholder="1 / day">
        <input data-f="timing" data-combo="timing" value="${esc(it.timing || '')}" class="en" autocomplete="off">
        <input data-f="duration" type="number" value="${esc(it.duration ?? '')}" ${/date/i.test(it.duration_unit || '') ? 'readonly title="تعداد روزهای انتخاب شده"' : ''}>
        <input data-f="duration_unit" data-combo="dur" value="${esc(it.duration_unit || 'days')}" class="en" autocomplete="off">
        <input data-f="qty" type="number" value="${esc(it.qty ?? '')}" title="تعداد برای دواخانه">
        ${rxLocked ? '<span></span>' : `<button class="btn ghost icon" data-del="${i}" title="حذف">${icon('trash', 15)}</button>`}
        <div class="rxNoteIn"><span class="sigPrev en" title="روی نسخه این‌طور چاپ می‌شود">${esc([rxSigEn(it), rxEn(it.timing), rxDurationEn(it)].filter(Boolean).join(' · '))}</span>${/date/i.test(it.duration_unit || '') ? `<button type="button" class="btn sm" data-dates="${i}">${icon('calendar', 13)} تاریخ‌ها (${String(it.dates || '').split(',').filter(Boolean).length})</button>` : ''}<input data-f="note" placeholder="یادداشت این دوا (مثلاً: with plenty of water…)" value="${esc(it.note || '')}"></div>
      </div>`).join('') || '<div class="empty" style="padding:16px">دوایی اضافه نشده</div>';
      if (rxLocked) $$('input', rowsEl).forEach(i => i.readOnly = true);
      runCdss();
    };
    // ---------- clinical decision support: allergy / interaction / duplicate warnings ----------
    let cdssReady = false;
    const runCdss = () => {
      if (!cdssReady) return;
      const allergies = $('#ptMed [name="allergies"]', view)?.value ?? patient.allergies;
      const rxW = cdssCheck({ items: rxItems.filter(x => x.name).map(x => ({ name: x.name, generic: x._generic || x.generic })), patient: { allergies } });
      const labW = cdssCheck({ testIds: selTests.filter(id => !labIds.includes(id)), recentLabs: file.labs.filter(l => l.id !== enc?.lab?.id && l.status !== 'cancelled'), catalog: cat });
      const box = (w) => w.length ? `<div class="cdss">${w.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : '';
      const a = $('#cdssRx', view), b = $('#cdssLab', view); if (a) a.innerHTML = box(rxW); if (b) b.innerHTML = box(labW);
    };
    rowsEl.addEventListener('input', (e) => {
      const r = e.target.closest('.rxItem'); if (!r) return; const it = rxItems[Number(r.dataset.i)]; const f = e.target.dataset.f; if (!f) return;
      it[f] = e.target.value;
      if (f === 'qty') it._qtyTouched = true;
      if (f === 'name') it.medicine_id = null;
      if (['dose', 'frequency', 'duration', 'duration_unit', 'form'].includes(f) && !it._qtyTouched) { const q = autoQty(it); if (q !== '' && q !== it.qty) { it.qty = q; $('[data-f="qty"]', r).value = q; } }
      const sp = $('.sigPrev', r); if (sp) sp.textContent = [rxSigEn(it), rxEn(it.timing), rxDurationEn(it)].filter(Boolean).join(' · ');
    });
    rowsEl.addEventListener('change', (e) => {
      if (e.target.dataset.f !== 'duration_unit') return;
      const i = Number(e.target.closest('.rxItem').dataset.i), it = rxItems[i];
      if (/date/i.test(it.duration_unit)) pickRxDates(it, () => drawRx()); else drawRx();
    });
    rowsEl.addEventListener('click', (e) => {
      const d = e.target.closest('[data-del]'); if (d) { rxItems.splice(Number(d.dataset.del), 1); drawRx(); return; }
      const dt = e.target.closest('[data-dates]'); if (dt) { pickRxDates(rxItems[Number(dt.dataset.dates)], () => drawRx()); return; }
      const al = e.target.closest('[data-alt]'); if (al) { e.preventDefault(); const [i, k] = al.dataset.alt.split(':').map(Number); const it = rxItems[i], m = it._alts[k]; Object.assign(it, { medicine_id: m.id, name: m.name, form: m.form || it.form, _stock: m.stock, _generic: m.generic, _alts: [] }); drawRx(); toast('جایگزین شد: ' + m.name, 'good'); }
    });
    rowsEl.addEventListener('change', (e) => { if (e.target.dataset.f === 'name') runCdss(); });
    const addMed = (m) => {
      const last = rxItems[rxItems.length - 1];
      const it = m ? { medicine_id: m.id, name: m.name, form: m.form || '', strength: (m.strength || '').replace(/\s*(mg|ml|g|mcg|IU|%)$/i, ''), unit: ((m.strength || '').match(/(mg|ml|g|mcg|IU|%)$/i) || [])[1] || '', dose: '1', frequency: '', timing: 'After meal', duration: last?.duration || 5, duration_unit: last && !/date/i.test(last.duration_unit) ? last.duration_unit : 'days', qty: '', note: '', _stock: m.stock, _generic: m.generic }
        : { medicine_id: null, name: $('#medQ', view).value.trim(), form: '', strength: '', unit: '', dose: '1', frequency: '', timing: 'After meal', duration: 5, duration_unit: 'days', qty: '', note: '' };
      if (/Syrup|Suspension|Drops/i.test(it.form)) { it.unit = it.unit || 'ml'; it.dose = '5 ml'; it.qty = 1; }
      if (!it.name) return;
      rxItems.push(it); drawRx(); $('#medQ', view).value = '';
      if (m && m.stock <= 0) API.get('/api/medicine-alternatives/' + m.id).then(a => { it._alts = a; drawRx(); }).catch(() => { });
      setTimeout(() => $(`.rxItem[data-i="${rxItems.length - 1}"] [data-f="frequency"]`, view)?.focus(), 30);
    };
    if (!rxLocked) {
      const ac = autocomplete($('#medQ', view), {
        fetch: (q) => API.get('/api/medicine-search', { q }),
        render: (m) => `<span class="code">${m.code}</span><span class="nm">${esc(m.name)} <small class="muted">${esc([m.form, m.strength].filter(Boolean).join(' · '))}</small></span><small class="${m.stock > 0 ? 'pos' : 'neg'}">موجود ${fmtNum(m.stock)}</small>`,
        pick: addMed
      });
      $('#medQ', view).addEventListener('keydown', (e) => { if (e.key === 'Enter' && $('#medQ', view).value.trim()) { setTimeout(() => { if ($('#medQ', view).value.trim()) { ac.close(); addMed(null); } }, 200); } });
    }
    // stock info for existing items
    (async () => { for (const it of rxItems) if (it.medicine_id) { try { const m = await API.get('/api/medicine/' + it.medicine_id); it._stock = m.stock; it._generic = m.generic; if (m.stock <= 0 && !rxLocked) it._alts = await API.get('/api/medicine-alternatives/' + m.id).catch(() => []); } catch (_) { } } drawRx(); })();
    drawRx();
    comboFields(view, { form: forms, unit: units, dose: doses, freq: freqs, timing: timings, dur: durs, route: routes }, (el) => {
      // after a choice go to the next box of the same row
      const r = el.closest('.rxItem'); if (!r) return; const ins = $$('input[data-f]', r).filter(x => !x.readOnly); const nx = ins[ins.indexOf(el) + 1]; if (nx) nx.focus();
    });

    // ---------- templates ----------
    const loadTpl = async () => { const t = await API.list('rx_templates'); $('#tplSel', view).innerHTML = '<option value="">قالب نسخه…</option>' + t.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join(''); view._tpl = t; };
    loadTpl();
    $('#tplSel', view).onchange = () => {
      const t = (view._tpl || []).find(x => x.id === Number($('#tplSel', view).value)); if (!t) return;
      if (rxLocked) return toast('نسخه قفل است', 'bad');
      JSON.parse(t.items || '[]').forEach(i => rxItems.push({ ...enRx(i), _qtyTouched: !!i.qty }));
      if (t.diagnosis && !$('[name=diagnosis]', view).value) $('[name=diagnosis]', view).value = t.diagnosis;
      drawRx(); $('#tplSel', view).value = '';
    };

    // ---------- lab tests ----------
    const selTests = [...labIds];
    const drawTests = () => {
      $('#selTests', view).innerHTML = selTests.map(id => { const t = cat.byId.get(id); return t ? `<span>${esc(t.code)} — ${esc(t.name)} <small class="muted">${money(t.price)}</small>${labLocked ? '' : `<button type="button" data-rm="${id}">×</button>`}</span>` : ''; }).join('') || '<small class="muted">آزمایشی انتخاب نشده</small>';
      $$('.testPick .chip', view).forEach(c => c.classList.toggle('on', selTests.includes(Number(c.dataset.tid))));
      const tot = selTests.reduce((a, id) => a + (cat.byId.get(id)?.price || 0), 0);
      if (selTests.length) $('#selTests', view).insertAdjacentHTML('beforeend', `<small class="muted" style="align-self:center">جمع: ${money(tot)} ${currency()}</small>`);
      runCdss();
    };
    const toggleTest = (id) => { if (labLocked) return; const i = selTests.indexOf(id); i >= 0 ? selTests.splice(i, 1) : selTests.push(id); drawTests(); };
    if (!labLocked) {
      autocomplete($('#testQ', view), {
        fetch: async (q) => { const s = q.toLowerCase(); return cat.tests.filter(t => t.active && t.orderable && (String(t.num_code) === q || t.code.toLowerCase().includes(s) || t.name.toLowerCase().includes(s) || (t.name_fa || '').includes(q))).slice(0, 20); },
        render: (t) => `<span class="code">${t.num_code || ''} ${esc(t.code)}</span><span class="nm">${esc(t.name)}${t.is_panel ? ' <small class="pill info">پنل</small>' : ''}</span><span class="pr">${money(t.price)}</span>`,
        pick: (t) => { if (!selTests.includes(t.id)) selTests.push(t.id); drawTests(); $('#testQ', view).value = ''; }
      });
      $('.testPick', view).onclick = (e) => { const c = e.target.closest('[data-tid]'); if (c) toggleTest(Number(c.dataset.tid)); };
    }
    $('#selTests', view).onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) toggleTest(Number(b.dataset.rm)); };
    drawTests();

    // ---------- history ----------
    const drawHist = (tab) => {
      const h = $('#hist', view);
      if (tab === 'lab') {
        h.innerHTML = file.labs.map(r => `<div class="histItem"><div class="hh"><b>${fmtDate(r.date)} · <span class="ltr">${esc(r.lab_code)}</span></b>${statusPill(LAB_STATUS, r.status)}</div>
          ${r.results.length ? `<table class="labMini">${r.results.map(x => `<tr><td>${esc(x.name)}</td><td class="v ${esc(x.flag || '')}">${esc(x.value)} ${x.flag ? `<small>${esc(x.flag)}</small>` : ''}</td><td class="muted">${esc(x.unit || '')}</td><td class="muted">${esc(x.ref || '')}</td></tr>${x.note ? `<tr><td colspan="4" class="mini" style="direction:rtl;text-align:right">↲ ${esc(x.note)}</td></tr>` : ''}`).join('')}</table>${r.report_note ? `<div class="mini">نظر لابراتوار: ${esc(r.report_note)}</div>` : ''}` : `<div class="mini en">${esc(r.tests || '')}</div>`}</div>`).join('') || '<div class="empty">آزمایشی ثبت نشده</div>';
        return;
      }
      if (tab === 'rx') {
        const list = file.prescriptions.filter(r => r.id !== enc?.rx?.id && r.status !== 'cancelled');
        h.innerHTML = list.map(r => `<div class="histItem"><div class="hh"><b>${fmtDate(r.date)} · <span class="ltr rxCode" style="font-size:12px">${esc(r.rx_code)}</span></b>${statusPill(RX_STATUS, r.status)}</div>
          ${r.doctor_name ? `<div class="mini muted">${esc(doctorName({ title: r.doctor_title, name: r.doctor_name }))}</div>` : ''}
          <table class="labMini rxHist">${r.items.map(i => `<tr><td class="en"><b>${esc(i.name)}</b> <small>${esc([i.form, [i.strength, i.unit].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</small></td>
            <td class="en">${esc([rxSigEn(i), rxEn(i.timing), rxDurationEn(i)].filter(Boolean).join(' · '))}</td><td>${rxLocked ? '' : `<button class="btn ghost icon" data-addone="${r.id}:${i.id}" title="افزودن همین دوا به نسخه فعلی">${icon('plus', 13)}</button>`}</td></tr>`).join('')}</table>
          ${rxLocked ? '' : `<div class="bar" style="margin-top:6px"><button class="btn sm" data-repeat="${r.id}">${icon('copy', 13)} تکرار همه داروهای این نسخه</button></div>`}</div>`).join('') || '<div class="empty">داروی قبلی ثبت نشده</div>';
        return;
      }
      h.innerHTML = file.encounters.filter(x => x.id !== enc?.id).map(e => { const rx = file.prescriptions.find(r => r.encounter_id === e.id); return `<div class="histItem"><div class="hh"><b>${fmtDate(e.date)}</b><small class="muted">${esc(doctorName({ title: e.doctor_title, name: e.doctor_name }))}</small></div>
        ${e.diagnosis ? `<div><b>Dx:</b> <span class="en">${esc(e.diagnosis)}</span></div>` : ''}${e.complaint ? `<div class="mini">${esc(e.complaint)}</div>` : ''}
        ${e.bp_sys || e.weight ? `<div class="mini">${e.bp_sys ? `BP ${e.bp_sys}/${e.bp_dia || ''} ` : ''}${e.weight ? `· وزن ${e.weight}kg ` : ''}${e.temp ? `· T ${e.temp}` : ''}</div>` : ''}
        ${rx ? `<ul class="en">${rx.items.map(i => `<li>${esc(i.name)} ${esc(i.strength || '')}${esc(i.unit || '')} — ${esc([rxSigEn(i), rxEn(i.timing), rxDurationEn(i)].filter(Boolean).join(' · '))}</li>`).join('')}</ul><div class="bar" style="margin-top:6px"><button class="btn sm" data-repeat="${rx.id}">${icon('copy', 13)} تکرار این نسخه</button><span class="rxCode" style="font-size:12px">${esc(rx.rx_code)}</span>${statusPill(RX_STATUS, rx.status)}</div>` : ''}</div>`; }).join('') || '<div class="empty">ویزیت قبلی ندارد</div>';
    };
    $('#hTabs', view).onclick = (e) => { const b = e.target.closest('[data-h]'); if (!b) return; $$('#hTabs button', view).forEach(x => x.classList.toggle('on', x === b)); drawHist(b.dataset.h); };
    $('#hist', view).onclick = (e) => {
      const one = e.target.closest('[data-addone]');
      if (one) {
        if (rxLocked) return toast('نسخه فعلی قفل است', 'bad');
        const [rid, iid] = one.dataset.addone.split(':').map(Number); const i = file.prescriptions.find(r => r.id === rid)?.items.find(x => x.id === iid); if (!i) return;
        rxItems.push(enRx({ medicine_id: i.medicine_id, name: i.name, form: i.form, strength: i.strength, unit: i.unit, dose: i.dose, frequency: i.frequency, timing: i.timing, route: i.route, duration: i.duration, duration_unit: i.duration_unit, dates: i.dates, qty: i.qty, note: i.note, _qtyTouched: true }));
        drawRx(); toast(i.name + ' اضافه شد', 'good'); return;
      }
      const b = e.target.closest('[data-repeat]'); if (!b) return;
      if (rxLocked) return toast('نسخه فعلی قفل است', 'bad');
      const rx = file.prescriptions.find(r => r.id === Number(b.dataset.repeat));
      rx.items.forEach(i => rxItems.push(enRx({ medicine_id: i.medicine_id, name: i.name, form: i.form, strength: i.strength, unit: i.unit, dose: i.dose, frequency: i.frequency, timing: i.timing, route: i.route, duration: i.duration, duration_unit: i.duration_unit, dates: i.dates, qty: i.qty, note: i.note, _qtyTouched: true })));
      drawRx(); toast('نسخه قبلی اضافه شد', 'good');
    };
    drawHist('enc');

    // ---------- BMI, ICD-10, decision support ----------
    const bmiUpd = () => { const w = $('#vit [name="weight"]', view).value, h = $('#vit [name="height"]', view).value; const b = bmi(w, h); const ap = ageParts(patient.birth_date);
      $('#bmiBox', view).innerHTML = b ? `BMI: <b>${b}</b> ${ap && ap.y >= 18 ? `<span class="pill ${b < 18.5 ? 'warn' : b < 25 ? 'good' : b < 30 ? 'warn' : 'bad'}">${b < 18.5 ? 'کم‌وزن' : b < 25 ? 'نارمل' : b < 30 ? 'اضافه وزن' : 'چاقی'}</span>` : '<small class="muted">(اطفال: با چارت رشد مقایسه شود)</small>'}` : ''; };
    $('#vit', view).addEventListener('input', bmiUpd); bmiUpd();
    const dxIn = $('[name="diagnosis"]', view), icdIn = $('[name="diagnosis_code"]', view);
    icdIn.addEventListener('change', () => { const q = icdIn.value.trim().toLowerCase(); if (!q) return; const hit = ICD10.find(([c]) => c.toLowerCase() === q) || ICD10.find(([, n]) => n.toLowerCase() === q) || (q.length > 3 ? ICD10.find(([, n]) => n.toLowerCase().includes(q)) : null); if (hit) { icdIn.value = hit[0]; if (!dxIn.value.trim()) dxIn.value = hit[1]; } });
    dxIn.addEventListener('change', () => { if (icdIn.value.trim()) return; const hit = ICD10.find(([, n]) => n.toLowerCase() === dxIn.value.trim().toLowerCase()); if (hit) icdIn.value = hit[0]; });
    $('#ptMed [name="allergies"]', view).addEventListener('input', debounce(runCdss, 300));
    cdssReady = true; runCdss();

    // ---------- print options / next visit ----------
    $$('[data-nv]', view).forEach(b => b.onclick = () => setDateInput($('#nextVisit', view), isoDate(addDays(new Date(), Number(b.dataset.nv)))));
    const collectOpts = () => { const o = { patient: 1 }; $$('[data-opt]', view).forEach(c => o[c.dataset.opt] = c.checked ? 1 : 0); return o; };
    $('#pOpts', view).addEventListener('change', () => localSet('rx_print_' + (App.user.doctor_id || 0), JSON.stringify(collectOpts())));

    // ---------- save ----------
    let encId = enc?.id || null;
    const payload = (finish) => {
      const vit = formValues($('#vit', view)), clin = formValues($('#clin', view));
      const p = { id: encId || undefined, visit_id: visit?.id, patient_id: patient.id, ...vit, ...clin, print_note: $('#printNote', view).value, next_visit: dateOf($('#nextVisit', view)) || '',
        print_opts: collectOpts(), patient_update: formValues($('#ptMed', view)), finish: finish ? 1 : 0 };
      if (App.user.role !== 'doctor') p.doctor_id = visit?.doctor_id || myDoctorId();
      if (!rxLocked) p.rx = { items: rxItems.map(({ _stock, _qtyTouched, id, prescription_id, sort, ...x }) => x), note: $('#rxNote', view).value, discount_pct: $('#rxDisc', view).value };
      else p.rx = { items: enc.rx.items, note: $('#rxNote', view).value };
      if (!labLocked) p.lab = { test_ids: selTests, note: $('#labNote', view).value, urgent: $('#labUrg', view).checked, discount_pct: $('#labDisc', view).value };
      if (visit) { p.visit_discount = $('#visDisc', view).value || 0; p.visit_discount_note = $('#visDiscNote', view).value; }
      return p;
    };
    const buildDoc = async () => {
      const e = await API.get('/api/encounter/' + encId);
      return rxDocHTML({ enc: e, rx: e.rx, lab: e.lab, patient: { ...patient, ...formValues($('#ptMed', view)) }, visit, doctor: doctorById(e.doctor_id), opts: collectOpts() });
    };
    const save = async (btn, mode) => busy(btn, async () => {
      const r = await API.post('/api/encounter/save', payload(mode === 'finish'));
      encId = r.encounter_id;
      const parts = [];
      if (r.rx) parts.push(`نسخه <b class="rxCode">${esc(r.rx.rx_code)}</b> به دواخانه فرستاده شد`);
      if (r.lab) parts.push(`درخواست آزمایش <b class="rxCode">${esc(r.lab.lab_code)}</b> به لابراتوار فرستاده شد`);
      $('#savedBanner', view).innerHTML = `<div class="infoBox">${icon('check', 15)} ذخیره شد. ${parts.join(' · ')}</div>`;
      toast('ویزیت ذخیره شد', 'good');
      if (mode === 'print' || mode === 'finish') {
        if (r.rx || mode === 'print') await printDoc(await buildDoc(), { size: App.settings.rx_page === 'A4' ? 'A4' : 'A5', title: r.rx?.rx_code || 'prescription' });
      }
      if (mode === 'finish') {
        const q = { 'eq.visit_date': today(), 'eq.status': 'waiting', order: 'turn_no', limit: 1 }; const did = visit?.doctor_id || App.user.doctor_id; if (did) q['eq.doctor_id'] = did;
        const next = (await API.list('visits', q))[0];
        if (next && await confirmDlg(`مریض بعدی: <b>${esc(next.full_name)}</b> (نوبت ${next.turn_no}) — باز شود؟`)) go('encounter', { visit_id: next.id });
        else go('dr-queue');
        return;
      }
      if (!enc) go('encounter', { encounter_id: encId, saved: $('#savedBanner', view).innerHTML });
    });
    actions(view, {
      save: (b) => save(b, b.dataset.mode),
      preview: async () => { if (!encId) await save(null, 'none'); previewDoc(await buildDoc(), { size: App.settings.rx_page === 'A4' ? 'A4' : 'A5', title: 'نسخه' }); },
      file: () => openPatientFile(patient.id),
      call: async () => { const x = await API.post('/api/visits/call/' + visit.id); toast(`نوبت ${x.turn} در صفحه نمایش اعلام شد`, 'good'); },
      editPt: () => editPatient(patient, () => go('encounter', params)),
      saveTpl: async () => {
        if (!rxItems.length) return toast('ابتدا دوا اضافه کنید', 'bad');
        const name = await promptDlg('ذخیره قالب نسخه', { label: 'نام قالب (مثلاً: اسهال اطفال، UTI خانم‌ها)', value: $('[name=diagnosis]', view).value });
        if (!name) return;
        await API.save('rx_templates', { name, diagnosis: $('[name=diagnosis]', view).value, items: JSON.stringify(rxItems.map(({ _stock, _qtyTouched, id, prescription_id, sort, ...x }) => x)) });
        toast('قالب ذخیره شد', 'good'); loadTpl();
      }
    });
    view.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save($('[data-act="save"]:not([data-mode])', view), 'none'); } });
  }
};

// ================================================================ patient file
async function openPatientFile(id) {
  const f = await API.get('/api/patient-file/' + id);
  const p = f.patient;
  const m = modal({ title: 'پرونده مریض — ' + esc(p.code), size: 'xwide', body: `
    <div class="ptHead">${patientHeadHTML(p)}<div class="bar"><button class="btn primary" data-a="visit">${icon('rx')} ویزیت / نسخه جدید</button><button class="btn" data-a="edit">${icon('edit')} ویرایش</button></div></div>
    <div class="grid g4" style="margin:12px 0">${kpi('مراجعات', f.visits.length, { ic: 'calendar' })}${kpi('ویزیت داکتر', f.encounters.length, { ic: 'steth' })}${kpi('نسخه‌ها', f.prescriptions.length, { ic: 'rx' })}${kpi('آزمایش‌ها', f.labs.length, { ic: 'flask' })}</div>
    <div class="tabs" id="pfTabs"><button class="on" data-t="sum">خلاصه</button><button data-t="enc">ویزیت‌ها و نسخه‌ها</button><button data-t="lab">نتایج آزمایش</button><button data-t="vit">روند علایم حیاتی</button><button data-t="vis">مراجعات (پذیرش)</button></div>
    <div id="pfBody"></div>` });
  const body = $('#pfBody', m.el);
  const show = (t) => {
    destroyCharts();
    if (t === 'sum') body.innerHTML = `<div class="grid g2">${[['حساسیت‌ها', p.allergies], ['امراض مزمن / سابقه مریضی', p.chronic_diseases], ['سابقه قبلی', p.past_history], ['سابقه فامیلی', p.family_history], ['دواهای فعلی', p.current_medications], ['یادداشت', p.notes]]
      .map(([l, v]) => `<div class="card" style="margin:0"><b>${l}</b><div style="margin-top:6px;white-space:pre-wrap">${esc(v || '—')}</div></div>`).join('')}</div>`;
    if (t === 'enc') body.innerHTML = f.encounters.map(e => { const rx = f.prescriptions.find(r => r.encounter_id === e.id); const lab = f.labs.find(l => l.encounter_id === e.id); return `<div class="histItem"><div class="hh"><b>${weekday(e.date)} ${fmtDate(e.date)} — ${esc(doctorName({ title: e.doctor_title, name: e.doctor_name }))}</b><span>${App.user.role !== 'doctor' || !e.doctor_id || e.doctor_id === App.user.doctor_id ? `<button class="btn sm" data-open="${e.id}">${icon('edit', 13)} باز کردن</button> ` : ''}${rx ? `<button class="btn sm" data-print="${e.id}">${icon('print', 13)} چاپ نسخه</button>` : ''}</span></div>
      <div class="grid g3" style="gap:8px">${e.complaint ? `<div><b>شکایت:</b> ${esc(e.complaint)}</div>` : ''}${e.diagnosis ? `<div><b>Dx:</b> <span class="en">${esc(e.diagnosis)}${e.diagnosis_code ? ' (' + esc(e.diagnosis_code) + ')' : ''}</span></div>` : ''}${e.exam ? `<div><b>معاینه:</b> ${esc(e.exam)}</div>` : ''}
      ${e.bp_sys ? `<div>BP: <span class="ltr">${e.bp_sys}/${e.bp_dia || ''}</span></div>` : ''}${e.weight ? `<div>وزن: ${e.weight} kg</div>` : ''}${e.temp ? `<div>T: ${e.temp} °C</div>` : ''}${e.notes ? `<div><b>یادداشت:</b> ${esc(e.notes)}</div>` : ''}${e.private_notes ? `<div class="muted"><b>خصوصی:</b> ${esc(e.private_notes)}</div>` : ''}</div>
      ${rx ? `<div style="margin-top:6px"><span class="rxCode">${esc(rx.rx_code)}</span> ${statusPill(RX_STATUS, rx.status)}<ul class="en">${rx.items.map(i => `<li>${esc(i.name)} ${esc(i.strength || '')}${esc(i.unit || '')} · ${esc([rxSigEn(i), rxEn(i.timing), rxDurationEn(i)].filter(Boolean).join(' · '))} — #${fmtNum(i.qty)}</li>`).join('')}</ul></div>` : ''}
      ${lab ? `<div class="mini" style="margin-top:4px">آزمایش: <span class="ltr">${esc(lab.lab_code)}</span> ${statusPill(LAB_STATUS, lab.status)} <span class="en">${esc(lab.tests || '')}</span></div>` : ''}</div>`; }).join('') || '<div class="empty">ویزیتی ثبت نشده</div>';
    if (t === 'lab') body.innerHTML = f.labs.map(r => `<div class="histItem"><div class="hh"><b>${fmtDate(r.date)} · <span class="ltr">${esc(r.lab_code)}</span> · ${esc(r.doctor_name || '')}</b><span>${statusPill(LAB_STATUS, r.status)} ${['approved', 'delivered'].includes(r.status) ? `<button class="btn sm" data-labrep="${r.id}">${icon('print', 13)} راپور</button>` : ''}</span></div>
      ${r.results.length ? `<table class="labMini">${r.results.map(x => `<tr><td>${esc(x.name)}</td><td class="v ${esc(x.flag || '')}">${esc(x.value)} ${x.flag ? `<small>${esc(x.flag)}</small>` : ''}</td><td class="muted">${esc(x.unit || '')}</td><td class="muted">${esc(x.ref || '')}</td></tr>${x.note ? `<tr><td colspan="4" class="mini" style="direction:rtl;text-align:right">↲ ${esc(x.note)}</td></tr>` : ''}`).join('')}</table>${r.report_note ? `<div class="mini">نظر لابراتوار: ${esc(r.report_note)}</div>` : ''}` : `<div class="mini en">${esc(r.tests || '')} — منتظر نتیجه</div>`}</div>`).join('') || '<div class="empty">آزمایشی ثبت نشده</div>';
    if (t === 'vis') body.innerHTML = `<div class="tableWrap"><table class="t"><thead><tr><th>تاریخ</th><th>رسید</th><th>خدمت</th><th>داکتر</th><th>نوبت</th><th>وضعیت</th><th>فیس</th></tr></thead><tbody>${f.visits.map(v => `<tr><td>${fmtDate(v.visit_date)}</td><td class="codeTag">${esc(v.visit_no)}</td><td>${esc(v.service_name)}</td><td>${esc(v.doctor_name || '—')}</td><td class="c">${v.turn_no || ''}</td><td>${statusPill(VISIT_STATUS, v.status)}</td><td>${money(v.net)}</td></tr>`).join('') || emptyRow(7)}</tbody></table></div>`;
    if (t === 'vit') {
      const es = f.encounters.slice().reverse().filter(e => e.weight || e.bp_sys || e.temp);
      body.innerHTML = es.length ? `<div class="grid g2"><div class="card"><h2>وزن (kg)</h2><div class="chartBox short"><canvas id="cW"></canvas></div></div><div class="card"><h2>فشار خون سیستولیک</h2><div class="chartBox short"><canvas id="cB"></canvas></div></div></div>` : '<div class="empty">علایم حیاتی ثبت نشده</div>';
      if (es.length) { const lb = es.map(e => fmtDateNum(e.date)); trendChart($('#cW', body), lb, es.map(e => e.weight ?? null), { label: 'وزن', unit: 'kg' }); trendChart($('#cB', body), lb, es.map(e => e.bp_sys ?? null), { label: 'BP', unit: 'mmHg', low: 90, high: 140 }); }
    }
  };
  $('#pfTabs', m.el).onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; $$('#pfTabs button', m.el).forEach(x => x.classList.toggle('on', x === b)); show(b.dataset.t); };
  m.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'visit') { m.close(); go('encounter', { patient_id: p.id }); }
    if (a === 'edit') { m.close(); editPatient(p, () => openPatientFile(p.id)); }
    const o = e.target.closest('[data-open]'); if (o) { m.close(); go('encounter', { encounter_id: Number(o.dataset.open) }); }
    const pr = e.target.closest('[data-print]');
    if (pr) { try { const en = await API.get('/api/encounter/' + pr.dataset.print); previewDoc(rxDocHTML({ enc: en, rx: en.rx, lab: en.lab, patient: p, visit: en.visit, doctor: doctorById(en.doctor_id), opts: en.print_opts ? JSON.parse(en.print_opts) : undefined }), { size: App.settings.rx_page === 'A4' ? 'A4' : 'A5', title: en.rx?.rx_code || 'نسخه' }); } catch (err) { errToast(err); } }
    const lr = e.target.closest('[data-labrep]');
    if (lr) { try { const r = await API.get('/api/lab/req/x', { id: lr.dataset.labrep }); previewDoc(labReportHTML(r), { size: 'A4', title: r.lab_code }); } catch (err) { errToast(err); } }
  });
  show('sum');
}

// ================================================================ prescriptions written
Pages['rx-list'] = {
  async render(view) {
    const [from, to] = currentMonthRange();
    view.innerHTML = `<div class="pageHead"><div><h1>نسخه‌های نوشته شده</h1><p>همه نسخه‌ها با کد دواخانه و وضعیت تحویل.</p></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', from, 'id="x_from"')}</label><label class="field"><span>تا</span>${dateInput('to', to, 'id="x_to"')}</label>
      <label class="field"><span>وضعیت</span><select id="x_st">${opt(Object.entries(RX_STATUS).map(([k, v]) => [k, v[0]]), '', { empty: 'همه' })}</select></label><label class="field grow"><span>جستجو</span><input id="x_q"></label></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>کد نسخه</th><th>تاریخ</th><th>مریض</th><th>کد مریض</th><th>داکتر</th><th>دواها</th><th>تخفیف٪</th><th>وضعیت</th><th></th></tr></thead><tbody id="xB"></tbody></table></div></div>`;
    const load = async () => {
      const q = { from: dateOf($('#x_from', view)), to: dateOf($('#x_to', view)), q: $('#x_q', view).value.trim(), limit: 2000 };
      if ($('#x_st', view).value) q['eq.status'] = $('#x_st', view).value;
      if (App.user.role === 'doctor' && App.user.doctor_id) q['eq.doctor_id'] = App.user.doctor_id;
      const rows = await API.list('prescriptions', q);
      $('#xB', view).innerHTML = rows.map(r => `<tr><td class="rxCode">${esc(r.rx_code)}</td><td>${fmtDate(r.date)}</td><td><b>${esc(r.full_name)}</b> <small class="muted">ولد ${esc(r.father_name || '')}</small></td><td class="codeTag">${esc(r.patient_code)}</td><td>${esc(r.doctor_name || '')}</td><td class="c">${r.item_count}</td><td class="c">${fmtNum(r.discount_pct) || ''}</td><td>${statusPill(RX_STATUS, r.status)}</td>
        <td class="nowrap"><button class="btn sm" data-act="file" data-id="${r.patient_id}">${icon('file', 14)} پرونده</button> ${r.encounter_id ? `<button class="btn sm" data-act="open" data-id="${r.encounter_id}">${icon('edit', 14)}</button>` : ''}</td></tr>`).join('') || emptyRow(9);
    };
    $$('#x_from, #x_to, #x_st', view).forEach(el => el.addEventListener('change', load)); $('#x_q', view).addEventListener('input', debounce(load, 300));
    actions(view, { file: (b) => openPatientFile(Number(b.dataset.id)), open: (b) => go('encounter', { encounter_id: Number(b.dataset.id) }) });
    await load();
  }
};

// ================================================================ templates
Pages.templates = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>قالب‌های نسخه</h1><p>نسخه‌های پرکاربرد را یک بار بسازید و در ویزیت با یک کلیک اضافه کنید. (در صفحه ویزیت: «ذخیره به عنوان قالب»)</p></div></div><div id="tl" class="grid g3"></div>`;
    const load = async () => {
      const rows = await API.list('rx_templates');
      $('#tl', view).innerHTML = rows.map(t => `<div class="card" style="margin:0"><div class="cardHead"><h2>${icon('star', 15)} ${esc(t.name)}</h2><button class="btn sm dangerText" data-act="del" data-id="${t.id}">${icon('trash', 14)}</button></div>
        ${t.diagnosis ? `<div class="mini en">${esc(t.diagnosis)}</div>` : ''}<ul>${JSON.parse(t.items || '[]').map(i => `<li class="en">${esc(i.name)} ${esc(i.strength || '')}${esc(i.unit || '')} — ${esc(rxSigEn(i))}</li>`).join('')}</ul></div>`).join('') || '<div class="card empty">هنوز قالبی ذخیره نشده</div>';
    };
    actions(view, { del: async (b) => { if (await confirmDlg('این قالب حذف شود؟', { danger: true })) { await API.del('rx_templates', b.dataset.id); load(); } } });
    await load();
  }
};

// ================================================================ doctor statistics
Pages['dr-stats'] = {
  async render(view) {
    const months = lastMonths(6);
    view.innerHTML = `<div class="pageHead"><div><h1>آمار ویزیت‌ها</h1><p>تعداد مریضان، فیس، نسخه‌ها و آزمایش‌های درخواستی.</p></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', months[0].range[0], 'id="s_from"')}</label><label class="field"><span>تا</span>${dateInput('to', today(), 'id="s_to"')}</label></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>داکتر</th><th>ویزیت</th><th>فیس</th><th>نسخه</th><th>آزمایش</th><th>فروش نسخه‌ها در دواخانه</th></tr></thead><tbody id="sB"></tbody></table></div></div>
      <div class="grid g2"><div class="card"><h2>مریضان در هر ماه</h2><div class="chartBox"><canvas id="sC"></canvas></div></div>
      <div class="card"><h2>تشخیص‌های پرتکرار (ICD-10)</h2><div id="sDx"></div></div></div>`;
    const load = async () => {
      const from = dateOf($('#s_from', view)), to = dateOf($('#s_to', view));
      const rows = await API.get('/api/reports/doctors', { from, to });
      const mine = App.user.role === 'doctor' ? rows.filter(r => r.id === App.user.doctor_id) : rows;
      $('#sB', view).innerHTML = mine.map(r => `<tr><td><b>${esc(doctorName(r))}</b></td><td>${r.visits}</td><td>${money(r.fees)}</td><td>${r.rx}</td><td>${r.labs}</td><td>${money(r.rx_sales)}</td></tr>`).join('') || emptyRow(6);
      const q = { from: months[0].range[0], to: today(), 'ne.status': 'cancelled', limit: 50000 }; if (App.user.role === 'doctor') q['eq.doctor_id'] = App.user.doctor_id;
      const vs = (await API.list('visits', q)).filter(v => v.status !== 'reserved');
      destroyCharts();
      barChart($('#sC', view), months.map(m => m.label), [{ label: 'مریضان', data: months.map(m => vs.filter(v => v.visit_date >= m.range[0] && v.visit_date <= m.range[1]).length) }]);
      const eq = { from, to, limit: 50000 }; if (App.user.role === 'doctor') eq['eq.doctor_id'] = App.user.doctor_id;
      const encs = await API.list('encounters', eq).catch(() => []);
      const g = new Map(); encs.filter(e => e.diagnosis || e.diagnosis_code).forEach(e => { const k = e.diagnosis_code || String(e.diagnosis).trim().toLowerCase(); const o = g.get(k) || { code: e.diagnosis_code || '', name: e.diagnosis || (ICD10.find(x => x[0] === e.diagnosis_code) || [])[1] || '', n: 0 }; o.n++; g.set(k, o); });
      const top = [...g.values()].sort((a, b) => b.n - a.n).slice(0, 15);
      $('#sDx', view).innerHTML = `<table class="t"><thead><tr><th>کد</th><th>تشخیص</th><th>تعداد</th></tr></thead><tbody>${top.map(x => `<tr><td class="codeTag">${esc(x.code)}</td><td class="en">${esc(x.name)}</td><td><b>${x.n}</b></td></tr>`).join('') || emptyRow(3, 'تشخیصی ثبت نشده')}</tbody></table>`;
    };
    $$('#s_from, #s_to', view).forEach(el => el.addEventListener('change', load));
    await load();
  }
};

// choose the exact dates a medicine is taken (duration unit "selected dates")
function pickRxDates(it, done) {
  let ds = String(it.dates || '').split(',').filter(Boolean);
  const m = modal({ title: 'تاریخ‌های مصرف دوا — ' + esc(it.name || ''), body: `<div class="bar"><input type="date" id="rdD" value="${isoDate(new Date())}" style="width:auto"><button class="btn primary sm" id="rdAdd">${icon('plus', 13)} افزودن تاریخ</button>
      <span class="muted mini">یا سریع:</span>${[[1, 'هر روز'], [2, 'یک روز در میان'], [3, 'دو روز در میان'], [7, 'هفته‌وار']].map(([g, l]) => `<button class="chip" data-gap="${g}">${l}</button>`).join('')}<input type="number" id="rdN" value="5" min="1" max="60" style="width:60px" title="تعداد دفعات"></div>
      <div class="chips" id="rdList" style="margin-top:12px"></div>`,
    foot: `<button class="btn primary" id="rdOk">تأیید</button>` });
  const draw = () => { ds = [...new Set(ds)].sort(); $('#rdList', m.el).innerHTML = ds.map(d => `<span class="chip on">${esc(fmtDate(d))} <small>${esc(weekday(d))}</small> <a href="#" data-rm="${d}">×</a></span>`).join('') || '<span class="muted">هنوز تاریخی انتخاب نشده</span>'; };
  $('#rdAdd', m.el).onclick = () => { const v = $('#rdD', m.el).value; if (v) ds.push(v); draw(); };
  m.el.addEventListener('click', (e) => {
    const g = e.target.closest('[data-gap]'); if (g) { const n = Math.max(1, Number($('#rdN', m.el).value) || 1); const s = new Date(($('#rdD', m.el).value || isoDate(new Date())) + 'T12:00:00'); ds = Array.from({ length: n }, (_, k) => isoDate(addDays(s, k * Number(g.dataset.gap)))); draw(); }
    const r = e.target.closest('[data-rm]'); if (r) { e.preventDefault(); ds = ds.filter(x => x !== r.dataset.rm); draw(); }
  });
  $('#rdOk', m.el).onclick = () => { it.dates = ds.join(','); it.duration = ds.length; m.close(); done && done(); };
  draw();
}
