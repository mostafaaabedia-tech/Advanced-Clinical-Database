/* v1.5: money details behind the dashboard numbers, admin summaries (laboratory / pharmacy), patients sent from the
   reception to the laboratory, and the header (letterhead) designer of every section. */
'use strict';

// ================================================================ details of one section's money (click on a number)
const DETAIL_KINDS = { visit: 'فیس داکتران (پذیرش)', lab: 'لابراتوار', sale: 'دواخانه', admission: 'بستر', expenses: 'مصارف', withdrawals: 'برداشت‌ها', income: 'عاید کل به تفکیک روز' };
async function sectionDetails(kind, from, to) {
  if (kind === 'deposit') kind = 'admission';
  const title = DETAIL_KINDS[kind] || kind;
  let head = '', body = '', tot = '', rows = [];
  if (kind === 'income') {
    rows = await API.get('/api/reports/days', { from, to });
    const T = (k) => rows.reduce((a, d) => a + (d[k] || 0), 0);
    head = '<tr><th>تاریخ</th><th>فیس پذیرش</th><th>دواخانه</th><th>لابراتوار</th><th>بستر</th><th>مجموع</th><th>مصارف</th><th>برداشت‌ها</th></tr>';
    body = rows.map(d => `<tr><td class="nowrap">${weekday(d.date)} ${fmtDate(d.date)}</td><td>${money(d.reception)}</td><td>${money(d.ph_net)}</td><td>${money(d.lab_total)}</td><td>${money(d.ipd || 0)}</td><td><b>${money((d.reception || 0) + (d.ph_net || 0) + (d.lab_total || 0) + (d.ipd || 0))}</b></td><td class="neg">${money(d.expenses)}</td><td class="neg">${money(d.withdrawals)}</td></tr>`).join('');
    tot = `<tr><td>مجموع</td><td>${money(T('reception'))}</td><td>${money(T('ph_net'))}</td><td>${money(T('lab_total'))}</td><td>${money(T('ipd'))}</td><td><b>${money(T('reception') + T('ph_net') + T('lab_total') + T('ipd'))}</b></td><td>${money(T('expenses'))}</td><td>${money(T('withdrawals'))}</td></tr>`;
  } else {
    rows = await API.get('/api/details', { kind, from, to });
    const T = (k) => rows.reduce((a, d) => a + (Number(d[k]) || 0), 0);
    const hasPaid = rows.some(r => 'paid' in r), hasDisc = rows.some(r => 'discount' in r);
    head = `<tr><th>تاریخ</th><th>کد</th><th>مریض / شخص</th><th>${kind === 'sale' ? 'کد نسخه' : 'شرح'}</th>${rows.some(r => r.doctor_name !== undefined) ? '<th>داکتر</th>' : ''}${hasDisc ? '<th>تخفیف</th>' : ''}<th>مبلغ</th>${hasPaid ? '<th>پرداخت</th><th>باقی</th>' : ''}</tr>`;
    body = rows.map(r => `<tr><td class="nowrap">${fmtDate(r.date)}</td><td class="codeTag">${esc(r.code ?? '')}</td><td>${esc(r.full_name || '')} <small class="muted">${esc(r.patient_code || '')}</small></td><td class="small">${esc(r.detail || (r.section ? (SECTIONS[r.section] || r.section) : ''))}</td>${r.doctor_name !== undefined ? `<td>${esc(r.doctor_name || '')}</td>` : ''}${hasDisc ? `<td>${r.discount ? money(r.discount) : ''}</td>` : ''}<td class="money">${money(r.net)}</td>${hasPaid ? `<td>${money(r.paid)}</td><td class="${r.net - r.paid > 0.001 ? 'neg' : ''}">${money(r2(r.net - r.paid))}</td>` : ''}</tr>`).join('');
    const cols = head.split('<th>').length - 1;
    tot = `<tr><td colspan="${cols - (hasPaid ? 3 : 1) - (hasDisc ? 1 : 0)}">مجموع (${rows.length})</td>${hasDisc ? `<td>${money(T('discount'))}</td>` : ''}<td><b>${money(T('net'))}</b></td>${hasPaid ? `<td>${money(T('paid'))}</td><td>${money(T('net') - T('paid'))}</td>` : ''}</tr>`;
  }
  const table = `<table class="t"><thead>${head}</thead><tbody>${body || `<tr><td colspan="9" class="empty">موردی نیست</td></tr>`}</tbody><tfoot>${tot}</tfoot></table>`;
  const m = modal({ title: `${esc(title)} — ${fmtDate(from)}${from !== to ? ' تا ' + fmtDate(to) : ''}`, size: 'xwide', body: `<div class="tableWrap" style="max-height:65vh">${table}</div>`,
    foot: `<button class="btn" data-pr>${icon('print')} چاپ</button><button class="btn" data-x>بستن</button>` });
  $('[data-x]', m.el).onclick = m.close;
  $('[data-pr]', m.el).onclick = () => previewDoc(reportDocHTML(title, table.replace(/class="t"/, 'class="rt"'), `${fmtDate(from)} — ${fmtDate(to)}`), { title });
}
// dashboard numbers become clickable: kinds in the order of the boxes
function kpiDetails(root, sel, kinds, from, to) {
  $$(sel, root).forEach((el, i) => { const k = kinds[i]; if (!k) return; el.classList.add('clickable'); el.title = 'برای دیدن همه مبالغ کلیک کنید'; el.onclick = () => sectionDetails(k, typeof from === 'function' ? from() : from, typeof to === 'function' ? to() : to).catch(errToast); });
}

// ================================================================ admin: laboratory in one page
Pages['adm-lab'] = {
  async render(view) {
    const [mf] = currentMonthRange();
    view.innerHTML = `<div class="pageHead"><div><h1>لابراتوار — خلاصه برای مدیر</h1><p>فقط آزمایش‌های پذیرش شده با قیمت، مریضان و تعداد آزمایش‌ها، و ریجنت‌ها (مصرف و خرید با نمبر فاکتور).</p></div>
      <div class="toolbar"><button class="btn" data-act="print">${icon('print')} چاپ</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('f', mf, 'id="alF"')}</label><label class="field"><span>تا</span>${dateInput('t', today(), 'id="alT"')}</label></div>
      <div class="grid g4" id="alK"></div>
      <div class="card" style="margin-top:16px"><h2>${icon('flask')} آزمایش‌های پذیرش شده</h2><div class="tableWrap" style="max-height:480px" id="alR"></div></div>
      <div class="grid g2"><div class="card"><h2>${icon('chart')} تعداد و قیمت هر آزمایش</h2><div class="tableWrap" style="max-height:420px" id="alT2"></div></div>
        <div class="card"><h2>${icon('box')} ریجنت‌ها: مصرف و موجودی</h2><div class="tableWrap" style="max-height:420px" id="alU"></div></div></div>
      <div class="card"><h2>${icon('truck')} خرید ریجنت (با نمبر فاکتور)</h2><div class="tableWrap" id="alB"></div></div>`;
    let d = null;
    const load = async () => {
      d = await API.get('/api/admin/lab-summary', { from: dateOf($('#alF', view)), to: dateOf($('#alT', view)) }); const t = d.totals;
      $('#alK', view).innerHTML = kpi('مریضان', t.patients, { ic: 'users', sub: `${t.requests} پذیرش` }) + kpi('تعداد آزمایش', t.tests, { ic: 'flask' }) + kpi('قیمت آزمایش‌ها', money(t.net), { ic: 'money', cls: 'good', sub: `جمع ${money(t.subtotal)} · تخفیف ${money(t.discount)}` }) + kpi('ریجنت', money(t.bought), { ic: 'box', cls: 'warn', sub: `خرید · مصرف ${money(t.used)}` });
      kpiDetails(view, '#alK .kpi', ['lab', 'lab', 'lab', null], () => d.from, () => d.to);
      $('#alR', view).innerHTML = `<table class="t"><thead><tr><th>تاریخ</th><th>کد</th><th>مریض</th><th>آزمایش‌ها</th><th>تعداد</th><th>قیمت</th><th>تخفیف</th><th>خالص</th><th>پرداخت</th></tr></thead><tbody>${d.reqs.map(r => `<tr><td>${fmtDate(r.date)}</td><td class="codeTag">${esc(r.lab_code)}</td><td>${esc(r.full_name)} <small class="muted">${esc(r.patient_code)}</small></td><td class="en small">${esc(r.tests || '')}</td><td>${r.n_tests}</td><td>${money(r.subtotal)}</td><td>${r.discount ? money(r.discount) : ''}</td><td class="money">${money(r.net)}</td><td class="${r.net - r.paid > 0.001 ? 'neg' : ''}">${money(r.paid)}</td></tr>`).join('') || emptyRow(9)}</tbody>
        <tfoot><tr><td colspan="4">مجموع</td><td>${t.tests}</td><td>${money(t.subtotal)}</td><td>${money(t.discount)}</td><td>${money(t.net)}</td><td>${money(t.paid)}</td></tr></tfoot></table>`;
      $('#alT2', view).innerHTML = `<table class="t"><thead><tr><th>آزمایش</th><th>تعداد</th><th>مبلغ</th></tr></thead><tbody>${d.byTest.map(x => `<tr><td class="en"><b>${esc(x.code)}</b> <small>${esc(x.name)}</small></td><td>${x.n}</td><td>${money(x.amount)}</td></tr>`).join('') || emptyRow(3)}</tbody></table>`;
      const lim = Number(App.settings.low_stock_alert || 3);
      $('#alU', view).innerHTML = `<table class="t"><thead><tr><th>ریجنت</th><th>مصرف</th><th>ارزش</th><th>موجودی</th></tr></thead><tbody>${d.stock.map(it => { const u = d.used.find(x => x.name === it.name); const low = it.stock <= Math.max(lim, it.reorder_level || 0);
        return `<tr><td>${esc(it.name)}</td><td>${u ? fmtNum(u.qty) + ' ' + esc(it.unit || '') : ''}</td><td>${u ? money(u.value) : ''}</td><td class="${low ? 'neg' : ''}"><b>${fmtNum(it.stock)}</b> ${low ? pill('کمبود', 'bad') : ''}</td></tr>`; }).join('') || emptyRow(4)}</tbody></table>`;
      $('#alB', view).innerHTML = `<table class="t"><thead><tr><th>تاریخ</th><th>نمبر فاکتور</th><th>کمپنی</th><th>ریجنت</th><th>مقدار</th><th>قیمت واحد</th><th>مجموع</th></tr></thead><tbody>${d.bought.map(b => `<tr><td>${fmtDate(b.date)}</td><td class="ltr">${esc(b.factor_no || '—')}</td><td>${esc(b.supplier || '')}</td><td>${esc(b.name)}</td><td>${fmtNum(b.qty)} ${esc(b.unit || '')}</td><td>${money(b.unit_cost)}</td><td class="money">${money(b.value)}</td></tr>`).join('') || emptyRow(7, 'در این بازه ریجنت خریده نشده')}</tbody></table>`;
    };
    $$('#alF, #alT', view).forEach(e => e.addEventListener('change', load));
    actions(view, { print: () => previewDoc(reportDocHTML('لابراتوار — خلاصه مدیر', [$('#alR', view), $('#alT2', view), $('#alU', view), $('#alB', view)].map(e => e.innerHTML.replace(/class="t"/g, 'class="rt"').replace(/<span class="pill[^>]*>([^<]*)<\/span>/g, '($1)')).join('<br>'), `${fmtDate(d.from)} — ${fmtDate(d.to)}`), { title: 'لابراتوار' }) });
    await load();
  }
};

// ================================================================ admin (and pharmacy): sales and shortages
Pages['adm-pharmacy'] = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>دواخانه — فروش، موجودی و کمبودها</h1><p>دواهای فروخته شده روزانه و ماهانه، موجودی دواخانه و هشدار کمبود دواخانه و مواد لابراتوار (وقتی ${esc(App.settings.low_stock_alert || 3)} یا کمتر مانده).</p></div>
      <div class="toolbar"><div class="chips" id="apP"><button class="chip on" data-p="day">امروز</button><button class="chip" data-p="month">این ماه</button></div><button class="btn" data-act="print">${icon('print')} چاپ</button></div></div>
      <div class="grid g4" id="apK"></div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h2>${icon('alert')} کمبود دواخانه</h2><div class="tableWrap" style="max-height:360px" id="apL"></div></div><div class="card"><h2>${icon('alert')} کمبود مواد لابراتوار</h2><div class="tableWrap" style="max-height:360px" id="apLL"></div></div></div>
      <div class="grid g2"><div class="card"><h2>${icon('pill')} دواهای فروخته شده</h2><div class="tableWrap" style="max-height:480px" id="apM"></div></div><div class="card"><h2>${icon('receipt')} فروشات (با کد نسخه)</h2><div class="tableWrap" style="max-height:480px" id="apS"></div></div></div>
      <div class="card"><h2>${icon('box')} موجودی دواخانه</h2><div class="filterBar" style="margin:0 0 8px"><label class="field grow"><span>جستجو</span><input id="apQ"></label></div><div class="tableWrap" style="max-height:480px" id="apStock"></div></div>`;
    let per = 'day', d = null;
    const rng = () => per === 'day' ? [today(), today()] : currentMonthRange();
    const drawStock = () => { const q = $('#apQ', view).value.trim().toLowerCase(); const lim = d.limit;
      $('#apStock', view).innerHTML = `<table class="t"><thead><tr><th>کد</th><th>دوا</th><th>موجودی</th><th>حد هشدار</th><th>ارزش</th><th>انقضا</th></tr></thead><tbody>${d.meds.filter(m => !q || (m.name + ' ' + m.code).toLowerCase().includes(q)).slice(0, 800).map(m => { const low = m.stock <= Math.max(lim, m.reorder_level || 0); return `<tr><td class="codeTag">${m.code}</td><td class="en"><b>${esc(m.name)}</b> ${esc(m.strength || '')}</td><td class="${low ? 'neg' : 'pos'}"><b>${fmtNum(m.stock)}</b> <small>${esc(m.unit || '')}</small></td><td>${fmtNum(Math.max(lim, m.reorder_level || 0))}</td><td>${money(m.stock_cost)}</td><td class="ltr">${esc(m.next_expiry || '')}</td></tr>`; }).join('') || emptyRow(6)}</tbody></table>`; };
    const load = async () => {
      const [from, to] = rng(); d = await API.get('/api/admin/pharmacy-summary', { from, to });
      $('#apK', view).innerHTML = kpi(per === 'day' ? 'فروش امروز' : 'فروش این ماه', money(d.totals.net), { ic: 'cash', cls: 'good', sub: `${d.totals.count} فروش` }) + kpi('اقلام فروخته شده', d.byMed.reduce((a, x) => a + (x.qty || 0), 0), { ic: 'pill' }) + kpi('کمبود دواخانه', d.low.length, { ic: 'alert', cls: d.low.length ? 'bad' : 'good' }) + kpi('کمبود لابراتوار', d.labLow.length, { ic: 'flask', cls: d.labLow.length ? 'bad' : 'good' });
      kpiDetails(view, '#apK .kpi', ['sale', 'sale'], from, to);
      $('#apL', view).innerHTML = `<table class="t"><thead><tr><th>دوا</th><th>باقی</th></tr></thead><tbody>${d.low.map(m => `<tr><td class="en">${esc(m.name)} ${esc(m.strength || '')}</td><td class="neg"><b>${fmtNum(m.stock)}</b> ${esc(m.unit || '')}</td></tr>`).join('') || emptyRow(2, 'کمبودی نیست ✓')}</tbody></table>`;
      $('#apLL', view).innerHTML = `<table class="t"><thead><tr><th>مواد</th><th>باقی</th></tr></thead><tbody>${d.labLow.map(i => `<tr><td>${esc(i.name)}</td><td class="neg"><b>${fmtNum(i.stock)}</b> ${esc(i.unit || '')}</td></tr>`).join('') || emptyRow(2, 'کمبودی نیست ✓')}</tbody></table>`;
      $('#apM', view).innerHTML = `<table class="t"><thead><tr><th>دوا</th><th>تعداد</th><th>مبلغ</th></tr></thead><tbody>${d.byMed.map(x => `<tr><td class="en"><b>${esc(x.name || '—')}</b> ${esc(x.strength || '')}</td><td>${fmtNum(x.qty)} <small>${esc(x.unit || '')}</small></td><td>${money(x.amount)}</td></tr>`).join('') || emptyRow(3)}</tbody></table>`;
      $('#apS', view).innerHTML = `<table class="t"><thead><tr><th>کد فروش</th><th>کد نسخه</th><th>مریض</th><th>تاریخ</th><th>مبلغ</th></tr></thead><tbody>${d.sales.map(x => `<tr><td class="codeTag">${esc(x.sale_code)}</td><td class="ltr">${esc(x.rx_code || '—')}</td><td>${esc(x.patient_name || '')}</td><td>${fmtDate(x.date)}</td><td class="money">${money(x.net)}</td></tr>`).join('') || emptyRow(5)}</tbody></table>`;
      drawStock();
    };
    $('#apP', view).onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; per = b.dataset.p; $$('#apP .chip', view).forEach(x => x.classList.toggle('on', x === b)); load().catch(errToast); };
    $('#apQ', view).addEventListener('input', debounce(drawStock, 200));
    actions(view, { print: () => previewDoc(reportDocHTML('دواخانه — فروش و کمبودها', ['#apL', '#apLL', '#apM', '#apS'].map(s => $(s, view).innerHTML.replace(/class="t"/g, 'class="rt"')).join('<br>'), per === 'day' ? fmtDate(today()) : 'این ماه'), { title: 'دواخانه' }) });
    await load();
  }
};

// ================================================================ reception → laboratory (the laboratory registers the tests itself)
function referDialog(p, { visit_id, doctor_id } = {}) {
  const m = modal({ title: 'فرستادن مریض به لابراتوار', body: `${p ? `<div class="ptHead" style="margin-bottom:10px">${patientHeadHTML(p)}</div>` : `<label class="field"><span>کد مریض یا نام</span><input id="rfQ" placeholder="مثلاً P-10045 یا 10045" autocomplete="off"></label><div id="rfPt" class="mini" style="margin:6px 0"></div>`}
    <label class="field"><span>یادداشت برای لابراتوار (اختیاری)</span><input id="rfN" placeholder="مثلاً: CBC و قند خون، ناشتا"></label>
    <div class="infoBox" style="margin-top:10px">${icon('flask', 15)} پیام به لابراتوار می‌رود؛ لابراتوار خودش آزمایش‌ها را پذیرش می‌کند. ${(App.settings.cashier_mode || 'central') === 'central' ? 'بل آزمایش بعداً در «صندوق مرکزی» پرداخت می‌شود و لابراتوار از پرداخت یا باقی‌ماندن پول خبر می‌شود.' : ''}</div>`,
    foot: `<button class="btn primary" id="rf_ok">${icon('send')} فرستادن به لابراتوار</button>` });
  let pick = p || null;
  if (!p) patientSearch($('#rfQ', m.el), (x) => { pick = x; $('#rfPt', m.el).innerHTML = `${icon('check', 13)} <b>${esc(x.full_name)}</b> ولد ${esc(x.father_name || '—')} · <span class="codeTag small">${esc(x.code)}</span>`; });
  $('#rf_ok', m.el).onclick = () => busy($('#rf_ok', m.el), async () => {
    const body = pick ? { patient_id: pick.id } : { patient_code: $('#rfQ', m.el).value.trim() };
    if (!pick && !body.patient_code) throw new Error('کد مریض را بنویسید');
    const r = await API.post('/api/lab/refer', { ...body, visit_id, doctor_id, note: $('#rfN', m.el).value });
    toast(`${r.patient.full_name} به لابراتوار فرستاده شد`, 'good'); m.close();
  }).catch(errToast);
}
async function labReferralsHTML() {
  const list = await API.get('/api/lab/referrals', { status: 'open' }).catch(() => []);
  return { n: list.length, html: list.map(f => `<div class="rxCard new" data-ref="${f.id}"><div style="min-width:110px;text-align:center"><div class="rxCode">${esc(f.code)}</div><small class="muted">${fmtTime(f.created_at)} · ${fmtDate(f.created_at)}</small></div>
    <div class="grow"><b>${esc(f.full_name)}</b> <small class="muted">ولد ${esc(f.father_name || '—')} · ${esc(ageLabel(f.birth_date))} · ${sexFa(f.sex)}</small><div class="mini">از پذیرش: ${esc(f.sent_by || '')}${f.doctor_name ? ' · داکتر ' + esc(f.doctor_name) : ''}${f.note ? ' · <b>' + esc(f.note) + '</b>' : ''}</div></div>
    <button class="btn primary" data-refgo="${f.id}" data-pid="${f.patient_id}" data-did="${f.doctor_id || ''}">${icon('flask', 14)} پذیرش آزمایش</button><button class="btn ghost dangerText" data-refx="${f.id}" title="لغو">${icon('x', 14)}</button></div>`).join('') || '<div class="card empty">مریضی از پذیرش فرستاده نشده ✓</div>' };
}

// ================================================================ headers (letterheads) designer — like the header of a Word document
const HDR_KINDS = [
  ['hdr_rx', 'سربرگ نسخه (همه داکتران)', 'admin', 'rx'], ['hdr_rx_foot', 'پاورقی نسخه', 'admin', 'rx'],
  ['doctor', 'سربرگ نسخه همین داکتر', 'doctor', 'rx'], ['doctor_foot', 'پاورقی نسخه همین داکتر', 'doctor', 'rx'],
  ['hdr_lab', 'سربرگ راپور لابراتوار (هر صفحه)', 'lab', 'lab'], ['hdr_lab_foot', 'پاورقی راپور لابراتوار', 'lab', 'lab'],
  ['hdr_report', 'سربرگ گزارش‌ها و تصدیق‌ها', 'admin', 'report'], ['hdr_report_foot', 'پاورقی گزارش‌ها', 'admin', 'report'],
  ['hdr_receipt_reception', 'سر رسید پذیرش و صندوق', 'reception', 'receipt'], ['hdr_receipt_pharmacy', 'سر رسید دواخانه', 'pharmacy', 'receipt'], ['hdr_receipt_lab', 'سر رسید لابراتوار', 'lab', 'receipt']
];
const HDR_FIELDS = [['{clinic}', 'نام کلینیک'], ['{clinic_en}', 'نام انگلیسی'], ['{logo}', 'لوگو'], ['{phones}', 'تلفن‌ها'], ['{address}', 'آدرس'], ['{doctor}', 'نام داکتر'], ['{doctor_lines}', 'مشخصات داکتر'], ['{date}', 'تاریخ']];
Pages.headers = {
  async render(view) {
    const role = App.user.role;
    const kinds = HDR_KINDS.filter(k => role === 'admin' || k[2] === role);
    const data = await API.get('/api/headers');
    const docs = role === 'admin' ? data.doctors : data.doctors.filter(d => d.id === App.user.doctor_id);
    let kind = kinds[0][0], docId = docs[0]?.id || null;
    view.innerHTML = `<div class="pageHead"><div><h1>سربرگ نسخه، راپور و رسید</h1><p>مثل سربرگ برنامه Word: متن، فونت، اندازه، رنگ، جای چپ / راست / وسط، لوگو و عکس، جدول سه‌ستونه و خط. هر بخش سربرگ خودش را دارد؛ اگر خالی باشد سربرگ عادی کلینیک چاپ می‌شود.</p></div></div>
      <div class="chips hdrKinds" id="hdK">${kinds.map(k => `<button type="button" class="chip ${k[0] === kind ? 'on' : ''}" data-k="${k[0]}">${esc(k[1])}</button>`).join('')}</div>
      <div class="bar hidden" id="hdDocBar" style="margin:8px 0"><span>داکتر:</span><select id="hdDoc" style="width:auto">${opt(docs.map(d => [d.id, doctorName(d)]), docId)}</select></div>
      <div class="card" style="margin-top:10px"><div class="hdrTools" id="hdT">
        <select data-cmd="fontName" title="فونت">${PRINT_FONTS.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('')}</select>
        <select data-cmd="fontSize" title="اندازه">${[['1', 'خیلی کوچک'], ['2', 'کوچک'], ['3', 'عادی'], ['4', 'متوسط'], ['5', 'بزرگ'], ['6', 'خیلی بزرگ'], ['7', 'عنوان']].map(([v, l]) => `<option value="${v}" ${v === '3' ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button type="button" class="btn" data-cmd="bold" title="ضخیم"><b>B</b></button><button type="button" class="btn" data-cmd="italic" title="کج"><i>I</i></button><button type="button" class="btn" data-cmd="underline" title="زیرخط"><u>U</u></button>
        <input type="color" data-cmd="foreColor" value="#0f7a3a" title="رنگ متن"><span class="sep"></span>
        <button type="button" class="btn" data-cmd="justifyRight" title="راست">⇥</button><button type="button" class="btn" data-cmd="justifyCenter" title="وسط">≡</button><button type="button" class="btn" data-cmd="justifyLeft" title="چپ">⇤</button><span class="sep"></span>
        <button type="button" class="btn" data-ins="table3" title="جدول سه ستونه: راست / وسط / چپ">${icon('list', 13)} سه ستون</button><button type="button" class="btn" data-ins="hr" title="خط افقی">— خط</button>
        <button type="button" class="btn" data-ins="img">${icon('upload', 13)} عکس / لوگو</button>
        <select data-ins="field" title="افزودن معلومات"><option value="">+ معلومات</option>${HDR_FIELDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><span class="sep"></span>
        <button type="button" class="btn" data-cmd="undo" title="برگشت">↶</button><button type="button" class="btn" data-cmd="redo" title="دوباره">↷</button>
        <button type="button" class="btn" data-ins="seed" title="سربرگ فعلی کلینیک را برای تغییر بیاور">${icon('copy', 13)} شروع از سربرگ فعلی</button><button type="button" class="btn dangerText" data-ins="clear" title="سربرگ عادی کلینیک چاپ شود">پاک (پیش‌فرض)</button></div>
        <div class="hdrPaper" id="hdPaper"><div class="hdrEdit" id="hdE" contenteditable="true"></div></div>
        <div class="bar" style="margin-top:12px"><button class="btn primary" data-act="save">${icon('check')} ذخیره سربرگ</button><button class="btn" data-act="preview">${icon('eye')} پیش‌نمایش روی ورق</button><span class="muted small">{clinic}، {phones} و … هنگام چاپ با معلومات واقعی پر می‌شود.</span></div></div>`;
    const ed = $('#hdE', view);
    const kOf = () => HDR_KINDS.find(k => k[0] === kind);
    const isDoc = () => kind === 'doctor' || kind === 'doctor_foot';
    const cur = () => isDoc() ? ((docs.find(d => d.id === Number(docId)) || {})[kind === 'doctor' ? 'header_html' : 'footer_html'] || '') : (data.keys[kind] || '');
    const load = () => {
      $('#hdDocBar', view).classList.toggle('hidden', !isDoc());
      const k = kOf(); $('#hdPaper', view).style.width = k[3] === 'receipt' ? `${App.settings.receipt_width || 80}mm` : '210mm'; $('#hdPaper', view).style.zoom = k[3] === 'receipt' ? 1.2 : .8;
      ed.innerHTML = cur() || '<p style="text-align:center;color:#888">— خالی: سربرگ عادی کلینیک چاپ می‌شود. «شروع از سربرگ فعلی» را بزنید یا بنویسید —</p>';
      ed.dataset.empty = cur() ? '' : '1';
    };
    ed.addEventListener('focus', () => { if (ed.dataset.empty) { ed.innerHTML = ''; ed.dataset.empty = ''; } });
    try { document.execCommand('styleWithCSS', false, true); } catch (_) { }
    const exec = (c, v) => { ed.focus(); document.execCommand(c, false, v); };
    $('#hdT', view).addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });   // keep the selection in the editor
    $('#hdT', view).addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.cmd) return exec(b.dataset.cmd);
      const a = b.dataset.ins;
      if (a === 'hr') exec('insertHTML', '<hr style="border:0;border-top:2px solid #c0362c;margin:2mm 0">');
      if (a === 'table3') exec('insertHTML', `<table style="width:100%;border-collapse:collapse"><tr><td style="width:38%;text-align:right;vertical-align:middle"><b style="font-size:18px">{doctor}</b><br>{doctor_lines}</td><td style="width:24%;text-align:center">{logo}</td><td style="width:38%;text-align:left;vertical-align:middle">…</td></tr></table><p></p>`);
      if (a === 'img') { const f = await pickFile('image/*'); if (!f) return; if (f.size > 1.5 * 1024 * 1024) return toast('عکس بزرگ‌تر از ۱.۵ میگابایت است', 'bad'); const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }); exec('insertHTML', `<img src="${url}" style="max-height:28mm">`); }
      if (a === 'seed') { const k = kOf(); const d = isDoc() ? docs.find(x => x.id === Number(docId)) : null; const base = k[3] === 'receipt' ? smallHeadDefault('') : /_foot|foot$/.test(kind) ? footDefault() : defaultLetterhead(); ed.innerHTML = base; ed.dataset.empty = ''; void d; }
      if (a === 'clear') { if (await confirmDlg('این سربرگ پاک شود و سربرگ عادی کلینیک چاپ شود؟')) { ed.innerHTML = ''; ed.dataset.empty = ''; await save(); load(); } }
    });
    $('#hdT', view).addEventListener('change', (e) => { const s = e.target.closest('select,input[type=color]'); if (!s) return; if (s.dataset.cmd) exec(s.dataset.cmd, s.value); if (s.dataset.ins === 'field' && s.value) { exec('insertText', s.value); s.value = ''; } });
    const html = () => ed.dataset.empty ? '' : ed.innerHTML.trim();
    const save = async () => {
      const body = isDoc() ? { doctor_id: Number(docId), foot: kind === 'doctor_foot' ? 1 : 0, html: html() } : { key: kind, html: html() };
      await API.post('/api/headers/save', body);
      if (isDoc()) { const d = docs.find(x => x.id === Number(docId)); d[kind === 'doctor' ? 'header_html' : 'footer_html'] = body.html; const ad = App.doctors.find(x => x.id === d.id); if (ad) ad[kind === 'doctor' ? 'header_html' : 'footer_html'] = body.html; }
      else { data.keys[kind] = body.html; App.settings[kind] = body.html; }
      toast('سربرگ ذخیره شد', 'good');
    };
    $('#hdK', view).onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; $$('#hdK .chip', view).forEach(x => x.classList.toggle('on', x === b)); load(); };
    $('#hdDoc', view).onchange = (e) => { docId = Number(e.target.value); load(); };
    actions(view, {
      save: (b) => busy(b, save),
      preview: async () => {
        // show it on a sample page without saving
        const k = kOf(); const tmpKey = isDoc() ? null : kind; const old = tmpKey ? App.settings[tmpKey] : null; const d = docs.find(x => x.id === Number(docId)); const ad = d && App.doctors.find(x => x.id === d.id); const oldD = ad ? { h: ad.header_html, f: ad.footer_html } : null;
        if (tmpKey) App.settings[tmpKey] = html(); else if (ad) ad[kind === 'doctor' ? 'header_html' : 'footer_html'] = html();
        try {
          const sample = k[3] === 'receipt' ? `<div class="doc receipt" style="--rw:${App.settings.receipt_width || 80}mm">${smallHead('رسید نمونه', kind.replace('hdr_receipt_', ''))}${rcRow('مریض', 'نمونه')}${rcRow('مبلغ', money(500))}${rcFooter()}</div>`
            : k[3] === 'rx' ? `<div class="doc rxDoc size-A5">${clinicLetterhead('rx', ad || null)}<div class="rxBody" style="min-height:120mm;padding:8mm"><p>محتوای نسخه…</p></div>${clinicFooter('', 'rx', ad || null)}</div>`
            : `<div class="doc size-A4 plainDoc">${clinicLetterhead(k[3])}<div class="docTitle rtl">${k[3] === 'lab' ? 'LABORATORY REPORT' : 'گزارش نمونه'}</div><div style="min-height:150mm"></div>${clinicFooter('', k[3])}</div>`;
          previewDoc(sample, { size: k[3] === 'receipt' ? 'receipt' : k[3] === 'rx' ? 'A5' : 'A4', title: 'پیش‌نمایش سربرگ' });
        } finally { if (tmpKey) App.settings[tmpKey] = old; else if (ad && oldD) { ad.header_html = oldD.h; ad.footer_html = oldD.f; } }
      }
    });
    load();
  }
};
// built-in parts used to start a custom header
function smallHeadDefault(title) { const a = App.settings.hdr_receipt_reception; App.settings.hdr_receipt_reception = ''; try { return smallHead(title); } finally { App.settings.hdr_receipt_reception = a; } }
function footDefault() { const s = App.settings; return `<div class="lhPhones"><span class="ph">☎</span>${phones().map(p => `<span class="phone ltr">${esc(p)}</span>`).join('')}</div><div class="lhAddr">${esc(s.clinic_address || '')}</div>`; }

// ================================================================ laboratory: send results to the doctor (WhatsApp / Telegram) and low-materials warning
function labShareDialog(r) {
  const doc = r.doctor_id ? doctorById(r.doctor_id) : null;
  const lines = (r.tests || []).map(t => { const x = (r.results || []).find(y => y.test_id === t.id); return x && String(x.value).trim() && String(x.value).trim() !== '*' ? `• ${t.code || t.name}: ${x.value} ${x.unit || t.unit || ''}${x.flag ? ' (' + x.flag + ')' : ''}` : null; }).filter(Boolean);
  const p = r.patient || {};
  const text = `${App.settings.clinic_name || ''}\nنتایج آزمایش ${r.lab_code}\nمریض: ${p.full_name || r.full_name || ''} — ${ageLabel(p.birth_date || r.birth_date)}\n${lines.join('\n')}${r.report_note ? '\nComment: ' + r.report_note : ''}`;
  const m = modal({ title: 'فرستادن نتایج — ' + esc(r.lab_code), size: 'wide', body: `<div class="formGrid"><label class="field"><span>به</span><select id="shTo">${opt([['doctor', 'داکتر' + (doc ? ' — ' + doctorName(doc) : r.doctor_name ? ' — ' + r.doctor_name : '')], ['patient', 'مریض']], 'doctor')}</select></label>
    <label class="field"><span>شماره تلفن (واتس‌اپ)</span><input id="shPh" class="ltr" value="${esc(doc?.phone || '')}"></label></div>
    <label class="field" style="margin-top:8px"><span>متن پیام</span><textarea id="shT" rows="9" dir="auto">${esc(text)}</textarea></label><div class="mini muted">تلگرام: پیام آماده باز می‌شود و مخاطب را در تلگرام انتخاب می‌کنید.</div>`,
    foot: `<button class="btn success" id="sh_wa">${icon('send')} واتس‌اپ</button><button class="btn" id="sh_tg">${icon('send')} تلگرام</button><button class="btn" id="sh_cp">${icon('copy')} کاپی متن</button>` });
  $('#shTo', m.el).onchange = (e) => { $('#shPh', m.el).value = e.target.value === 'patient' ? (p.phone || r.phone || '') : (doc?.phone || ''); };
  $('#sh_wa', m.el).onclick = () => openWhatsApp($('#shPh', m.el).value, $('#shT', m.el).value);
  $('#sh_tg', m.el).onclick = () => window.open('https://t.me/share/url?url=' + encodeURIComponent(' ') + '&text=' + encodeURIComponent($('#shT', m.el).value), '_blank');
  $('#sh_cp', m.el).onclick = () => copyText($('#shT', m.el).value);
}
async function labLowBanner(view) {
  const box = $('#lLow', view); if (!box) return;
  const lim = Number(App.settings.low_stock_alert || 3);
  const items = (await API.list('lab_items', { limit: 2000 })).filter(i => i.active && i.stock <= Math.max(lim, i.reorder_level || 0));
  box.innerHTML = items.length ? `<div class="warnBox" style="margin-bottom:10px">${icon('alert', 15)} مواد رو به تمام: ${items.slice(0, 12).map(i => `<b>${esc(i.name)}</b> (${fmtNum(i.stock)} ${esc(i.unit || '')})`).join('، ')}${items.length > 12 ? ` و ${items.length - 12} قلم دیگر` : ''} — <a href="#" data-golow>موجودی مواد</a></div>` : '';
  const a = $('[data-golow]', box); if (a) a.onclick = (e) => { e.preventDefault(); go('lab-items'); };
}
