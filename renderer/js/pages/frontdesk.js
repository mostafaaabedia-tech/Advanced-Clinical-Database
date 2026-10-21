/* Front desk (reception): central cashier for every section (doctor fees, laboratory, pharmacy, beds, deposits),
   laboratory registration linked to the lab reception, in-patient beds, waiting-room display and the day's accounts. */
'use strict';

const BILL_KINDS = { visit: ['فیس داکتر', 'kind-visit'], lab: ['لابراتوار', 'kind-lab'], sale: ['دواخانه', 'kind-sale'], admission: ['بستر', 'kind-admission'], deposit: ['امانت', 'kind-deposit'] };
const kindTag = (k) => `<span class="kindTag ${BILL_KINDS[k]?.[1] || ''}">${esc(BILL_KINDS[k]?.[0] || k)}</span>`;
const payMethodFa = (m) => m === 'deposit' ? 'از پول امانت' : (PAY_METHODS[m] || m || '');
const labDueOf = (r) => r.status === 'requested' ? r2(r.subtotal - r2(r.subtotal * (r.discount_pct || 0) / 100) - r.paid) : r2(r.net - r.paid);

// one pending row (visit / lab / sale / admission) → a bill for the cashier
function billOf(kind, r) {
  const b = { kind, id: r.id, patient_id: r.patient_id, name: r.full_name || r.patient_name || 'مشتری', father: r.father_name || '', pcode: r.patient_code || '', raw: r, paid: r.paid };
  if (kind === 'visit') Object.assign(b, { code: r.visit_no, date: r.visit_date, detail: `${r.service_name || ''}${r.doctor_name ? ' — ' + doctorName({ title: r.doctor_title, name: r.doctor_name }) : ''}${r.turn_no ? ' · نوبت ' + r.turn_no : ''}`, net: r.net, due: r2(r.net - r.paid) });
  if (kind === 'lab') Object.assign(b, { code: r.lab_code, date: r.date, detail: r.tests || '', net: r.status === 'requested' ? r2(r.subtotal - r2(r.subtotal * (r.discount_pct || 0) / 100)) : r.net, due: labDueOf(r), toBill: r.status === 'requested', sub: r.doctor_name ? 'داکتر: ' + r.doctor_name : (r.source === 'walkin' ? 'مراجعه مستقیم' : '') });
  if (kind === 'sale') Object.assign(b, { code: r.sale_code, date: r.date, detail: `${r.rx_code ? 'نسخه ' + r.rx_code : 'فروش آزاد'} · ${r.item_count || 0} قلم دوا${r.doctor_name ? ' — ' + r.doctor_name : ''}`, net: r2(r.net - (r.returned || 0)), due: r.balance });
  if (kind === 'admission') Object.assign(b, { code: r.adm_no, date: String(r.admitted_at || '').slice(0, 10), detail: `${r.bed_name || ''}${r.status === 'admitted' ? ' · بستری (جاری)' : ' · رخصت شده'}`, net: r.net, due: r.balance, running: r.status === 'admitted' });
  return b;
}
function billCardHTML(b, { btn = true } = {}) {
  const refund = b.due < -0.001;
  return `<div class="billCard" data-kind="${b.kind}" data-id="${b.id}">${kindTag(b.kind)}
    <div class="grow"><div><b>${esc(b.name)}</b> ${b.father ? `<small class="muted">ولد ${esc(b.father)}</small>` : ''} ${b.pcode ? `<span class="codeTag">${esc(b.pcode)}</span>` : ''}</div>
      <div class="mini"><span class="codeTag">${esc(b.code || '')}</span> ${fmtDate(b.date)} · <span class="${b.kind === 'lab' ? 'en' : ''}">${esc(b.detail || '')}</span></div>
      ${b.sub ? `<div class="mini muted">${esc(b.sub)}</div>` : ''}</div>
    ${b.toBill ? pill('بل نشده', 'warn') : ''}${b.running ? pill('جاری', 'violet') : ''}${refund ? pill('بازپرداخت', 'bad') : ''}
    <div class="amt ${refund ? 'neg' : ''}">${money(Math.abs(b.due))}<small class="muted" style="display:block;font-size:11px;font-weight:400">از ${money(b.net)}</small></div>
    ${btn ? `<button class="btn ${refund ? '' : 'success'}" data-pay>${icon('cash', 16)} ${refund ? 'بازپرداخت' : 'دریافت'}</button>` : ''}</div>`;
}

// receipt(s) to print after a payment
async function printAfterPay(kind, data, amount, method, deposit) {
  if (localGet('cashier_autoprint', '1') !== '1') return;
  if (kind === 'visit') return printDoc(visitReceiptHTML(data), { size: 'receipt', title: data.visit_no });
  if (kind === 'lab') return printDoc(labReceiptsHTML(data), { size: 'receipt', title: data.lab_code });
  if (kind === 'sale') return printDoc(saleReceiptHTML(data, 'patient'), { size: 'receipt', title: data.sale_code });
  if (kind === 'admission') return printDoc(payReceiptHTML({ title: 'رسید پرداخت بستر', code: data.adm_no, name: data.full_name, pcode: data.patient_code, rows: [['تخت', esc(data.bed_name || '')]], amount, method, due: r2(data.net - data.paid), deposit }), { size: 'receipt', title: data.adm_no });
}

// ---------------------------------------------------------------- pay one bill
async function cashierPayDlg(kind, id, after) {
  let d, cat = null, sel = [];
  if (kind === 'visit') d = await API.one('visits', id);
  else if (kind === 'lab') { [d, cat] = await Promise.all([API.get('/api/lab/req/x', { id }), loadLabCatalog()]); sel = d.items.map(i => i.test_id); }
  else if (kind === 'sale') d = await API.get('/api/sales/' + id);
  else d = await API.get('/api/ipd/' + id);
  const pid = d.patient_id;
  const dep = pid ? (await API.get('/api/cashier/patient/' + pid).catch(() => ({ deposit: 0 }))).deposit : 0;
  const name = d.full_name || d.patient_name || 'مشتری', code = d.visit_no || d.lab_code || d.sale_code || d.adm_no;
  let net, paid = d.paid;
  if (kind === 'visit' || kind === 'lab') net = d.net;
  else if (kind === 'sale') net = r2(d.net - (d.returned || 0));
  else if (kind === 'admission') net = r2(Math.max(0, (d.status === 'admitted' ? d.bed_running : d.bed_total) + d.extra_running - (d.discount || 0)));
  const billing = kind === 'lab' && d.status === 'requested';
  let detail = '';
  if (kind === 'visit') detail = `<div class="sum"><span>خدمت: <b>${esc(d.service_name)}</b></span><span>داکتر: <b>${esc(d.doctor_name || '—')}</b></span><span>فیس: <b>${money(d.fee)}</b></span>${d.discount ? `<span>تخفیف: <b>${money(d.discount)}</b></span>` : ''}${d.doctor_discount ? `<span class="pos">تخفیف داکتر: <b>${money(d.doctor_discount)}</b> ${esc(d.doctor_discount_note || '')}</span>` : ''}</div>`;
  if (kind === 'sale') detail = `<table class="t"><thead><tr><th>دوا</th><th>تعداد</th><th>قیمت</th><th>جمع</th></tr></thead><tbody>${d.items.map(i => `<tr><td class="en">${esc(i.name)}</td><td>${fmtNum(i.qty - (i.returned_qty || 0))}</td><td>${money(i.price)}</td><td>${money(i.total)}</td></tr>`).join('')}</tbody></table>
    <div class="sum"><span>جمع: <b>${money(d.subtotal)}</b></span>${d.discount ? `<span>تخفیف: <b>${money(d.discount)}</b></span>` : ''}${d.returned ? `<span class="neg">برگشت: <b>${money(d.returned)}</b></span>` : ''}<span>نسخه: <b class="ltr">${esc(d.rx_code || '—')}</b></span><span>فروشنده: <b>${esc(d.seller || '')}</b></span></div>`;
  if (kind === 'admission') detail = `<div class="sum"><span>تخت: <b>${esc(d.bed_name || '')}</b></span><span>روزها: <b>${fmtNum(d.beds.reduce((a, b) => a + (b.days ?? b.calc_days ?? 0), 0))}</b></span><span>جمع تخت: <b>${money(d.status === 'admitted' ? d.bed_running : d.bed_total)}</b></span><span>خدمات دیگر: <b>${money(d.extra_running)}</b></span>${d.discount ? `<span>تخفیف: <b>${money(d.discount)}</b></span>` : ''}${d.status === 'admitted' ? pill('هنوز بستری است — مبلغ جاری', 'violet') : ''}</div>`;
  const m = modal({ title: `${kindTag(kind)} ${esc(name)} — <span class="ltr">${esc(code)}</span>`, size: billing || kind === 'sale' ? 'wide' : '', body: `
    ${d.patient_code ? `<div class="mini" style="margin-bottom:8px">کد مریض <span class="codeTag">${esc(d.patient_code)}</span> ${d.father_name ? '· ولد ' + esc(d.father_name) : ''}</div>` : ''}
    ${billing ? `<div class="secTitle">${icon('flask', 15)} آزمایش‌ها <small class="muted">— مریض نخواست؟ با × حذف کنید</small></div><div class="selList" id="cpTests"></div>
      <div class="formGrid" style="margin-top:8px"><label class="field"><span>تخفیف ٪ ${d.discount_pct ? `<small class="pos">(داکتر: ${fmtNum(d.discount_pct)}٪)</small>` : ''}</span><input type="number" id="cpPct" value="${d.discount_pct || 0}"></label><label class="field"><span>یا تخفیف (مبلغ)</span><input type="number" id="cpDisc"></label></div>` : detail}
    <div class="totals" style="margin-top:10px"><div><span>قابل پرداخت</span><b id="cpNet"></b></div><div><span>پرداخت شده</span><b>${money(paid)}</b></div><div><span>باقی</span><b id="cpDue"></b></div></div>
    <div class="formGrid" style="margin-top:10px"><label class="field"><span id="cpAmtL">مبلغ دریافت</span><input type="number" id="cpAmt" class="big" step="any"></label>
      <label class="field"><span>طریقه</span><select id="cpPm">${opt(Object.entries(PAY_METHODS), 'cash')}</select></label>
      ${dep > 0.001 ? `<label class="check" style="align-self:end"><input type="checkbox" id="cpDep"> از پول امانت مریض (${money(dep)})</label>` : ''}
      <label class="check" style="align-self:end"><input type="checkbox" id="cpPrint" ${localGet('cashier_autoprint', '1') === '1' ? 'checked' : ''}> چاپ رسید</label></div>`,
    foot: `<button class="btn success lg" id="cpOk">${icon('check')} ثبت پرداخت</button><button class="btn" data-x>انصراف</button>` });
  $('[data-x]', m.el).onclick = m.close;
  const amt = $('#cpAmt', m.el);
  const calc = () => {
    if (billing) {
      net = labPriceCalc(cat, sel, d.reception_type_id, $('#cpPct', m.el).value, $('#cpDisc', m.el).value).net;
      $('#cpTests', m.el).innerHTML = sel.map(tid => { const t = cat.byId.get(tid); return `<div class="selRow"><span class="codeTag">${esc(t?.code || '')}</span><span class="nm en">${esc(t?.name || '')}</span><b>${money(t?.price || 0)}</b><button class="btn ghost icon" data-rm="${tid}" title="حذف">${icon('x', 14)}</button></div>`; }).join('') || '<div class="empty">هیچ آزمایشی نماند — درخواست را لغو کنید</div>';
    }
    const due = r2(net - paid);
    $('#cpNet', m.el).textContent = money(net) + ' ' + currency(); $('#cpDue', m.el).textContent = money(due);
    $('#cpAmtL', m.el).textContent = due < 0 ? 'مبلغ بازپرداخت (منفی)' : 'مبلغ دریافت';
    if (!amt.dataset.t) amt.value = due;
  };
  if (billing) {
    $('#cpTests', m.el).onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { sel.splice(sel.indexOf(Number(b.dataset.rm)), 1); calc(); } };
    $('#cpPct', m.el).oninput = () => { $('#cpDisc', m.el).value = ''; calc(); }; $('#cpDisc', m.el).oninput = calc;
  }
  amt.oninput = () => { amt.dataset.t = 1; };
  amt.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#cpOk', m.el).click(); });
  calc(); setTimeout(() => amt.focus(), 60);
  $('#cpOk', m.el).onclick = () => busy($('#cpOk', m.el), async () => {
    const a = r2(amt.value);
    if (billing && !sel.length) throw new Error('حداقل یک آزمایش لازم است');
    if (!a && !billing) throw new Error('مبلغ را وارد کنید');
    const fromDep = !!$('#cpDep', m.el)?.checked;
    if (fromDep && a > dep + 0.001) throw new Error('پول امانت کافی نیست');
    const body = { kind, id, amount: a, method: $('#cpPm', m.el).value, from_deposit: fromDep };
    if (billing) Object.assign(body, { test_ids: sel, discount: $('#cpDisc', m.el).value === '' ? undefined : $('#cpDisc', m.el).value, discount_pct: $('#cpPct', m.el).value });
    const wantPrint = $('#cpPrint', m.el).checked;
    const r = await API.post('/api/cashier/pay', body);
    toast(a < 0 ? `بازپرداخت ${money(-a)} ثبت شد` : `${money(a)} ${currency()} دریافت شد`, 'good'); beep('good');
    m.close();
    localSet('cashier_autoprint', wantPrint ? '1' : '0');
    if (wantPrint) await printAfterPay(kind, r.data, a, body.method, r.deposit);
    after && after(r);
  });
}

// ---------------------------------------------------------------- full account of one patient (all sections) + deposits
async function patientAccountDlg(patientId, after) {
  const acc = await API.get('/api/cashier/patient/' + patientId);
  const p = acc.patient;
  const open = [...acc.visits.filter(v => v.status !== 'cancelled' && Math.abs(v.balance) > 0.001).map(v => billOf('visit', v)), ...acc.labs.filter(l => l.status === 'requested' || l.balance > 0.001).map(l => billOf('lab', l)),
    ...acc.sales.filter(x => Math.abs(x.balance) > 0.001).map(x => billOf('sale', x)), ...acc.admissions.filter(x => x.status === 'admitted' || Math.abs(x.balance) > 0.001).map(x => billOf('admission', x))];
  const m = modal({ title: 'حساب کامل مریض', size: 'xwide', body: `<div class="ptHead">${patientHeadHTML(p)}</div>
    <div class="grid g4" style="margin:12px 0">${kpi('باقی‌داری همه بخش‌ها', money(acc.due), { ic: 'cash', cls: acc.due > 0 ? 'bad' : 'good' })}${kpi('پول امانت (پیش‌پرداخت)', money(acc.deposit), { ic: 'wallet', cls: 'violet' })}${kpi('بل‌های باز', open.length, { ic: 'receipt' })}${kpi('پرداخت‌ها', acc.payments.length, { ic: 'list' })}</div>
    <div class="cashGrid"><div><div class="cardHead"><h2>بل‌های باز</h2>${open.filter(b => b.due > 0.001).length > 1 ? `<button class="btn success" id="paAll">${icon('cash')} دریافت همه (${money(open.filter(b => b.due > 0).reduce((a, b) => a + b.due, 0))})</button>` : ''}</div>
      <div id="paOpen">${open.map(b => billCardHTML(b)).join('') || '<div class="empty card">همه حساب‌ها تصفیه است ✓</div>'}</div></div>
      <div><div class="card"><h2>${icon('wallet')} پول امانت</h2><p class="mini">پولی که مریض پیش‌پرداخت می‌کند (مثلاً برای بستر) و بعداً از آن کم می‌شود.</p>
        <div class="formGrid"><label class="field"><span>مبلغ</span><input type="number" id="paDepAmt"></label><label class="field"><span>طریقه</span><select id="paDepPm">${opt(Object.entries(PAY_METHODS), 'cash')}</select></label><label class="field span2"><span>یادداشت</span><input id="paDepNote"></label></div>
        <div class="bar" style="margin-top:8px"><button class="btn success" id="paDepIn">${icon('plus')} دریافت امانت</button>${acc.deposit > 0 ? `<button class="btn" id="paDepOut">${icon('arrow')} پس دادن امانت</button>` : ''}</div></div>
      <div class="card" style="margin-top:12px"><h2>آخرین پرداخت‌ها</h2><div class="tableWrap" style="max-height:300px"><table class="t"><thead><tr><th>تاریخ</th><th>بخش</th><th>کد</th><th>مبلغ</th><th>طریقه</th></tr></thead><tbody>
        ${acc.payments.slice(0, 60).map(x => `<tr><td class="nowrap">${fmtDateTime(x.created_at)}</td><td>${kindTag(x.kind)}</td><td class="codeTag">${esc(x.code || '')}</td><td class="${x.amount < 0 ? 'neg' : ''}">${money(x.amount)}</td><td>${esc(payMethodFa(x.method))}</td></tr>`).join('') || emptyRow(5)}</tbody></table></div></div></div></div>` });
  const reopen = () => { m.close(); patientAccountDlg(patientId, after); after && after(); };
  $('#paOpen', m.el).onclick = (e) => { const c = e.target.closest('.billCard'); if (c) cashierPayDlg(c.dataset.kind, Number(c.dataset.id), reopen).catch(errToast); };
  const all = $('#paAll', m.el);
  if (all) all.onclick = () => busy(all, async () => {
    const list = open.filter(b => b.due > 0.001);
    if (!(await confirmDlg(`همه ${list.length} بل باز (${money(list.reduce((a, b) => a + b.due, 0))} ${currency()}) نقد دریافت شود؟`))) return;
    for (const b of list) await API.post('/api/cashier/pay', { kind: b.kind, id: b.id, amount: b.due, method: 'cash' });
    toast('همه بل‌ها دریافت شد', 'good');
    await printDoc(payReceiptHTML({ title: 'رسید پرداخت (همه بخش‌ها)', name: p.full_name, pcode: p.code, rows: list.map(b => [BILL_KINDS[b.kind][0] + ' ' + (b.code || ''), money(b.due)]), amount: list.reduce((a, b) => a + b.due, 0), method: 'cash', due: 0 }), { size: 'receipt', title: p.code });
    reopen();
  });
  const dep = (sign) => async () => {
    const a = Number($('#paDepAmt', m.el).value); if (!a) throw new Error('مبلغ را وارد کنید');
    const bal = await API.post('/api/cashier/deposit', { patient_id: patientId, amount: sign * a, method: $('#paDepPm', m.el).value, note: $('#paDepNote', m.el).value || (sign > 0 ? 'پیش‌پرداخت' : 'پس دادن امانت') });
    toast('ثبت شد — امانت باقی‌مانده ' + money(bal), 'good');
    await printDoc(payReceiptHTML({ title: sign > 0 ? 'رسید پول امانت' : 'رسید پس دادن امانت', name: p.full_name, pcode: p.code, amount: sign * a, method: $('#paDepPm', m.el).value, deposit: bal }), { size: 'receipt', title: p.code });
    reopen();
  };
  $('#paDepIn', m.el).onclick = () => dep(1)().catch(errToast);
  const out = $('#paDepOut', m.el); if (out) out.onclick = () => dep(-1)().catch(errToast);
}

// ================================================================ central cashier
Pages.cashier = {
  async render(view) {
    let tab = 'all', data = null;
    view.innerHTML = `<div class="pageHead"><div><h1>صندوق مرکزی</h1><p>همه پول‌ها اینجا گرفته می‌شود: فیس داکتر، لابراتوار، دواخانه، بستر و باقی‌داری‌ها. بل‌ها از همه بخش‌ها زنده می‌رسند.</p></div>
      <div class="toolbar"><div class="codeEntry"><input id="caCode" placeholder="کد رسید / لابراتوار / فروش / نسخه / مریض…" style="width:300px;font-size:15px"><button class="btn primary" data-act="find">${icon('search')} پیدا کردن</button></div>
      <button class="btn" data-act="patient">${icon('user')} حساب مریض</button><button class="btn" data-act="day">${icon('money')} حسابات روز</button></div></div>
      <div class="grid g4" id="caK"></div>
      <div class="tabs" id="caTabs" style="margin-top:14px"></div>
      <div class="filterBar"><label class="field grow"><span>جستجو در بل‌ها</span><input id="caQ" placeholder="نام، کد مریض، کد بل…"></label></div>
      <div id="caList"></div>`;
    const bills = () => data ? [...data.visits.map(v => billOf('visit', v)), ...data.labs.map(l => billOf('lab', l)), ...data.sales.map(x => billOf('sale', x)), ...data.admissions.map(x => billOf('admission', x))] : [];
    const draw = () => {
      const all = bills();
      const tabs = [['all', 'همه'], ['visit', 'فیس داکتر'], ['lab', 'لابراتوار'], ['sale', 'دواخانه'], ['admission', 'بستر']];
      $('#caTabs', view).innerHTML = tabs.map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l} <small>${(k === 'all' ? all : all.filter(b => b.kind === k)).length}</small></button>`).join('');
      const q = $('#caQ', view).value.trim().toLowerCase();
      const list = all.filter(b => (tab === 'all' || b.kind === tab) && (!q || [b.name, b.pcode, b.code, b.father].some(x => String(x || '').toLowerCase().includes(q))))
        .sort((a, b) => String(b.raw.created_at || b.date || '').localeCompare(String(a.raw.created_at || a.date || '')));
      $('#caList', view).innerHTML = list.map(b => billCardHTML(b)).join('') || '<div class="card empty">بل باز وجود ندارد ✓</div>';
      const sum = (k) => r2(all.filter(b => b.kind === k && b.due > 0).reduce((a, b) => a + b.due, 0));
      $('#caK', view).innerHTML = kpi('فیس داکتر (باقی)', money(sum('visit')), { ic: 'steth', cls: 'info' }) + kpi('لابراتوار', money(sum('lab')), { ic: 'flask', cls: 'warn', sub: `${all.filter(b => b.toBill).length} بل نشده` }) + kpi('دواخانه', money(sum('sale')), { ic: 'pill', cls: 'good' }) + kpi('بستر', money(sum('admission')), { ic: 'bed', cls: 'violet' });
    };
    const load = async () => { data = await API.get('/api/cashier/pending'); draw(); };
    $('#caTabs', view).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
    $('#caQ', view).addEventListener('input', debounce(draw, 150));
    $('#caList', view).onclick = (e) => {
      const c = e.target.closest('.billCard'); if (!c) return;
      const b = bills().find(x => x.kind === c.dataset.kind && x.id === Number(c.dataset.id));
      if (e.target.closest('[data-pay]') || !b?.patient_id) return cashierPayDlg(c.dataset.kind, Number(c.dataset.id), load).catch(errToast);
      patientAccountDlg(b.patient_id, load).catch(errToast);
    };
    const find = async () => {
      const c = $('#caCode', view).value.trim(); if (!c) return;
      const C = c.toUpperCase();
      const all = bills();
      const numOf = (x) => Number(String(x || '').replace(/\D/g, '')) || -1;
      let hit = all.find(b => String(b.code || '').toUpperCase() === C || String(b.raw.rx_code || '').toUpperCase() === C);
      if (!hit && /^\d+$/.test(C)) { const hits = all.filter(b => numOf(b.code) === Number(C)); if (hits.length === 1) hit = hits[0]; else if (hits.length > 1) { $('#caQ', view).value = ''; tab = 'all'; draw(); toast('چند بل با این نمبر هست — کد کامل را بنویسید (مثلاً LB-' + C + ')', 'warn'); return; } }
      if (hit) { $('#caCode', view).value = ''; return cashierPayDlg(hit.kind, hit.id, load); }
      const ps = await API.list('patients', { q: c, limit: 2 });
      if (ps.length === 1 || (ps[0] && String(ps[0].code).toUpperCase() === C)) { $('#caCode', view).value = ''; return patientAccountDlg(ps[0].id, load); }
      toast('بل باز با این کد پیدا نشد — شاید قبلاً پرداخت شده', 'warn');
    };
    $('#caCode', view).addEventListener('keydown', (e) => { if (e.key === 'Enter') find().catch(errToast); });
    actions(view, {
      find, day: () => go('rc-cash'),
      patient: () => {
        const m = modal({ title: 'حساب مریض', body: `<div class="searchBox"><input id="paq" placeholder="کد مریض، نام یا تلفن…" autocomplete="off"></div>` });
        patientSearch($('#paq', m.el), (p) => { m.close(); patientAccountDlg(p.id, load).catch(errToast); }); setTimeout(() => $('#paq', m.el).focus(), 50);
      }
    });
    await load(); this._load = debounce(load, 400);
    setTimeout(() => $('#caCode', view)?.focus(), 50);
  },
  onEvent(m) { if (this._load && /^(visit|lab|sale|ipd|rx)/.test(m.type)) this._load(); }
};

// ---------------------------------------------------------------- small patient picker (search an old patient or write a new one)
function ptPickerHTML(pfx) {
  return `<div id="${pfx}"><div class="searchBox" style="margin-bottom:10px"><input data-pp="q" placeholder="جستجوی مریض قبلی: کد، نام یا تلفن…" autocomplete="off"></div><div data-pp="sel"></div>
    <div class="recForm" data-pp="form"><label class="field c3"><span>نام <em>*</em></span><input name="full_name" autocomplete="off"></label><label class="field c3"><span>ولد</span><input name="father_name" autocomplete="off"></label>
      <label class="field c2"><span>جنس</span><select name="sex">${opt([['M', 'مذکر'], ['F', 'مونث']], 'M')}</select></label><div class="field c4" style="grid-column:span 4"><span>سن (سال / ماه / روز)</span>${ageInputHTML(pfx + 'Age', '', { compact: true })}</div>
      <label class="field c3"><span>تلفن</span><input name="phone" class="ltr" autocomplete="off"></label><label class="field c3"><span>نمبر تذکره (کد ملی)</span><input name="tazkira" class="ltr" autocomplete="off"></label>
      <label class="field c6" style="grid-column:1/-1"><span>آدرس</span><input name="address" autocomplete="off"></label></div></div>`;
}
function bindPtPicker(root, pfx, { onPick } = {}) {
  const box = $('#' + pfx, root); let patient = null;
  const form = $('[data-pp="form"]', box), sel = $('[data-pp="sel"]', box);
  bindAgeInput(box, pfx + 'Age');
  const set = (p) => {
    patient = p || null;
    if (p) { sel.innerHTML = `<div class="ptHead" style="margin-bottom:8px">${patientHeadHTML(p)}<button type="button" class="btn sm" data-pp="clr">${icon('x', 13)} مریض دیگر</button></div>`; form.classList.add('hidden'); $('[data-pp="clr"]', sel).onclick = () => set(null); }
    else { sel.innerHTML = ''; form.classList.remove('hidden'); }
    onPick && onPick(patient);
  };
  patientSearch($('[data-pp="q"]', box), set);
  return {
    set, get patient() { return patient; },
    value() {
      if (patient) return { patient_id: patient.id };
      const f = formValues(form); if (!String(f.full_name || '').trim()) throw new Error('نام مریض را بنویسید یا مریض قبلی را انتخاب کنید');
      return { patient: { ...f, ...(ageValue(box, pfx + 'Age') || {}) } };
    },
    reset() { set(null); $$('input', form).forEach(i => { i.value = ''; }); $$('[data-a]', box).forEach(i => { i.value = ''; }); }
  };
}

// ================================================================ laboratory registration at the reception (linked to the lab reception only)
Pages['rc-lab'] = {
  async render(view, params) {
    const cat = await loadLabCatalog(true);
    const sel = []; let dep = 'all';
    const orderable = cat.tests.filter(t => t.active && (t.orderable || t.is_panel));
    const deps = cat.departments.filter(d => orderable.some(t => t.department_id === d.id));
    view.innerHTML = `<div class="pageHead"><div><h1>پذیرش لابراتوار</h1><p>مریض بیرونی یا مریض کلینیک را برای آزمایش ثبت کنید؛ پول همین‌جا گرفته می‌شود و درخواست فوراً به پذیرش لابراتوار می‌رسد. (نتایج فقط در لابراتوار ثبت می‌شود)</p></div>
      <div class="toolbar"><button class="btn" data-act="cashier">${icon('cash')} صندوق مرکزی</button></div></div>
      <div class="recGrid"><div><div class="card"><h2>${icon('user')} مریض</h2>${ptPickerHTML('rlPt')}
          <div class="secTitle" style="margin-top:12px">${icon('steth', 15)} داکتر ارجاع دهنده</div>${doctorPickerHTML('rlDr', { placeholder: 'بیرونی / بدون داکتر' })}
          <label class="field" style="margin-top:10px"><span>یادداشت</span><input id="rlNote" placeholder="یادداشت برای لابراتوار…"></label>
          <div class="secTitle" style="margin-top:12px">${icon('flask', 15)} معلومات پذیرش لابراتوار</div>${labReceptionFieldsHTML('rlR', {}, cat)}</div>
        <div class="card"><div class="cardHead"><h2>${icon('list')} ثبت‌های لابراتوار امروز</h2><span class="muted small">${fmtDate(today())}</span></div><div id="rlToday"></div></div></div>
        <div class="card"><h2>${icon('flask')} آزمایش‌ها <small class="muted">— فقط مخفف آزمایش؛ موس را نگه دارید تا نام کامل دیده شود</small></h2>
          <div class="searchBox"><input id="rlQ" placeholder="مخفف، نام یا نمبر آزمایش… (Enter = افزودن)" autocomplete="off"></div>
          <div class="pickWrap" data-fold="rclab"><button type="button" class="btn sm ghost foldBtn" data-foldbtn="rclab">${icon('list', 13)} <span class="fShow">نمایش دکمه‌های آزمایش</span><span class="fHide">پنهان کردن دکمه‌ها</span></button><div class="pickBody">
          <div class="deptTabs" id="rlDeps" style="position:static;margin-top:10px"><button data-dep="all" class="on">همه</button>${deps.map(d => `<button data-dep="${d.id}" title="${esc(d.name_fa || '')}">${esc(d.name || d.code)}</button>`).join('')}</div>
          <div class="testChips" id="rlChips"></div></div></div>
          <div class="selList" id="rlSel" style="margin-top:12px"></div>
          <div id="rlWarn"></div>
          <div class="totals"><div><span>جمع کل</span><b id="rlSub">0</b></div><div id="rlOrgRow" class="hidden"><span>سهم مؤسسه / بیمه</span><b id="rlOrg">0</b></div>
            <div><span>تخفیف ٪</span><span class="bar"><input type="number" id="rlPct" value="0" style="width:70px"> <small>یا مبلغ</small> <input type="number" id="rlDisc" style="width:90px"></span></div>
            <div><span>قابل پرداخت (سهم مریض)</span><b id="rlNet">0</b></div></div>
          <div class="formGrid" style="margin-top:10px"><label class="field"><span>دریافت شده</span><input type="number" id="rlPaid" class="big"></label><label class="field"><span>طریقه</span><select id="rlPm">${opt(Object.entries(PAY_METHODS), 'cash')}</select></label></div>
          <div class="stack" style="margin-top:12px"><button class="btn primary lg" data-act="save" data-print="1" style="justify-content:center">${icon('print')} ثبت، دریافت پول و چاپ رسید</button>
            <button class="btn" data-act="save" data-later="1" style="justify-content:center">${icon('send')} ثبت و ارسال به لابراتوار (پرداخت بعداً در صندوق)</button></div></div></div>`;
    let calcFn = null;
    const pt = bindPtPicker(view, 'rlPt', { onPick: () => calcFn && calcFn() });
    const drPick = bindDoctorPicker(view, 'rlDr', { selected: params.doctor_id || '' });
    const rf = bindLabReceptionFields(view, 'rlR', cat, { onChange: () => calcFn && calcFn() }); rf.touchAnswer();
    if (params.patient_id) pt.set(await API.one('patients', params.patient_id));
    const chips = () => {
      const q = $('#rlQ', view).value.trim().toLowerCase();
      const list = orderable.filter(t => (dep === 'all' || t.department_id === Number(dep)) && (!q || t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || String(t.num_code) === q));
      $('#rlChips', view).innerHTML = list.map(t => `<button type="button" class="chip ${sel.includes(t.id) ? 'on' : ''}" data-tid="${t.id}" title="${esc(t.name)} — ${money(t.price)}">${esc(t.code)}</button>`).join('') || '<span class="muted">آزمایشی پیدا نشد</span>';
    };
    const calc = calcFn = () => {
      const pc = labPriceCalc(cat, sel, rf.rtId(), $('#rlPct', view).value, $('#rlDisc', view).value);
      $('#rlSub', view).textContent = money(pc.sub); $('#rlNet', view).textContent = money(pc.net) + ' ' + currency();
      $('#rlOrg', view).textContent = money(pc.org); $('#rlOrgRow', view).classList.toggle('hidden', !pc.org);
      if (!$('#rlPaid', view).dataset.t) $('#rlPaid', view).value = pc.net;
      rf.setAnswerDate(sel.length ? labAnswerDateCalc(cat, sel, rf.urgent()) : '');
      const sex = pt.patient ? pt.patient.sex : $('#rlPt [name=sex]', view).value;
      const w = labReceptionWarnings(cat, sel, { sex }, rf.rtId());
      $('#rlWarn', view).innerHTML = w.length ? `<div class="cdss">${w.map(x => `<div>⚠ ${esc(x)}</div>`).join('')}</div>` : '';
      $('#rlSel', view).innerHTML = sel.map(id => { const t = cat.byId.get(id); return `<div class="selRow"><span class="codeTag" title="${esc(t.name)}">${esc(t.code)}</span><span class="nm muted small en">${t.is_panel ? 'پنل · ' + (cat.components.get(t.id) || []).length + ' آزمایش' : ''}</span><b>${money(t.price)}</b><button class="btn ghost icon" data-rm="${id}">${icon('x', 14)}</button></div>`; }).join('') || '<div class="empty">آزمایش انتخاب نشده</div>';
      chips();
    };
    const toggle = (id) => { const i = sel.indexOf(id); i >= 0 ? sel.splice(i, 1) : sel.push(id); calc(); };
    $('#rlDeps', view).onclick = (e) => { const b = e.target.closest('[data-dep]'); if (!b) return; dep = b.dataset.dep; $$('#rlDeps button', view).forEach(x => x.classList.toggle('on', x === b)); chips(); };
    $('#rlChips', view).onclick = (e) => { const c = e.target.closest('[data-tid]'); if (c) toggle(Number(c.dataset.tid)); };
    $('#rlSel', view).onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) toggle(Number(b.dataset.rm)); };
    $('#rlQ', view).addEventListener('input', chips);
    $('#rlQ', view).addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const q = e.target.value.trim().toLowerCase(); const t = orderable.find(x => x.code.toLowerCase() === q || String(x.num_code) === q) || orderable.find(x => x.code.toLowerCase().startsWith(q)); if (t) { if (!sel.includes(t.id)) toggle(t.id); e.target.value = ''; chips(); } });
    $('#rlPct', view).oninput = () => { $('#rlDisc', view).value = ''; calc(); }; $('#rlDisc', view).oninput = calc; $('#rlPaid', view).oninput = (e) => { e.target.dataset.t = 1; };
    const loadToday = async () => {
      const rows = await API.list('lab_requests', { from: today(), to: today(), limit: 300 });
      $('#rlToday', view).innerHTML = `<div class="tableWrap" style="max-height:340px"><table class="t"><thead><tr><th>کد</th><th>تاریخ</th><th>مریض</th><th>آزمایش‌ها</th><th>مبلغ</th><th>باقی</th><th>وضعیت</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr><td class="codeTag">${esc(r.lab_code)}</td><td class="nowrap">${fmtDate(r.date)} <small class="muted ltr">${fmtTime(r.created_at)}</small></td><td><b>${esc(r.full_name)}</b> <small class="muted">${esc(r.patient_code)}</small></td><td class="en small">${esc(r.tests || '')}</td>
          <td>${money(r.status === 'requested' ? r.subtotal : r.net)}</td><td class="${labDueOf(r) > 0.001 ? 'neg' : ''}">${money(labDueOf(r))}</td><td>${statusPill(LAB_STATUS, r.status)}</td>
          <td class="nowrap">${r.status !== 'cancelled' && labDueOf(r) > 0.001 ? `<button class="btn sm success" data-lpay="${r.id}">${icon('cash', 13)}</button>` : ''}${r.status !== 'requested' && r.status !== 'cancelled' ? `<button class="btn sm" data-lrc="${r.id}" title="رسید">${icon('receipt', 13)}</button>` : ''}${['requested', 'received'].includes(r.status) && !r.paid ? `<button class="btn sm dangerText" data-lcx="${r.id}" title="لغو">${icon('x', 13)}</button>` : ''}</td></tr>`).join('') || emptyRow(8)}</tbody></table></div>`;
    };
    $('#rlToday', view).onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      (async () => {
        if (b.dataset.lpay) await cashierPayDlg('lab', Number(b.dataset.lpay), loadToday);
        if (b.dataset.lrc) { const r = await API.get('/api/lab/req/x', { id: b.dataset.lrc }); previewDoc(labReceiptsHTML(r), { size: 'receipt', title: r.lab_code }); }
        if (b.dataset.lcx) { const why = await promptDlg('لغو درخواست آزمایش', { label: 'دلیل' }); if (why !== null) { await API.post('/api/lab/cancel/' + b.dataset.lcx, { reason: why }); toast('لغو شد'); loadToday(); } }
      })().catch(errToast);
    };
    actions(view, {
      cashier: () => go('cashier'),
      save: (b) => busy(b, async () => {
        const who = pt.value(); if (!sel.length) throw new Error('آزمایش انتخاب نشده');
        const pc = labPriceCalc(cat, sel, rf.rtId(), $('#rlPct', view).value, $('#rlDisc', view).value);
        if (!rf.discountOk(pc.discount)) throw new Error('برای تخفیف، دلیل تخفیف و نام تخفیف دهنده را بنویسید');
        if (!(await labPreSaveChecks(who.patient_id, sel, null, who.patient))) return;
        let r = await API.post('/api/lab/walkin', { ...who, ...rf.value(), test_ids: sel, doctor_id: drPick.get() || null, note: $('#rlNote', view).value });
        const disc = { discount: $('#rlDisc', view).value === '' ? undefined : $('#rlDisc', view).value, discount_pct: $('#rlPct', view).value, test_ids: sel };
        if (b.dataset.later) {
          r = await API.post('/api/lab/receive/' + r.id, { ...disc, paid: 0 });
          toast(`ثبت و به لابراتوار فرستاده شد — ${r.lab_code} (پرداخت در صندوق)`, 'good');
        } else {
          const paid = Number($('#rlPaid', view).value) || 0;
          const res = await API.post('/api/cashier/pay', { kind: 'lab', id: r.id, amount: paid, method: $('#rlPm', view).value, ...disc });
          r = res.data; toast(`ثبت شد — ${r.lab_code}`, 'good');
          if (b.dataset.print) await printDoc(labReceiptsHTML(r), { size: 'receipt', title: r.lab_code });
        }
        $$('#rlR [data-lf]', view).forEach(el => { if (el.type === 'checkbox') el.checked = false; else if (el.tagName === 'SELECT') el.selectedIndex = 0; else { el.value = ''; delete el.dataset.t; } });
        sel.length = 0; pt.reset(); drPick.set('', false); $('#rlNote', view).value = ''; $('#rlPct', view).value = 0; $('#rlDisc', view).value = ''; delete $('#rlPaid', view).dataset.t; calc(); loadToday();
      })
    });
    calc(); await loadToday(); this._load = debounce(loadToday, 400);
  },
  onEvent(m) { if (this._load && m.type.startsWith('lab')) this._load(); }
};

// ================================================================ in-patients: beds board, admission, charges, discharge
Pages.ipd = {
  async render(view) {
    const canEdit = isRole('reception');
    view.innerHTML = `<div class="pageHead"><div><h1>بستر و تخت‌ها</h1><p>تخت‌های خالی و پُر، بستری کردن، انتقال، خدمات اضافی، رخصت و صورت حساب. روزهای تخت خودکار حساب می‌شود.</p></div>
      <div class="toolbar">${canEdit ? `<button class="btn" data-act="beds">${icon('settings')} اطاق‌ها و تخت‌ها</button>` : ''}<button class="btn" data-act="hist">${icon('list')} بستری‌های قبلی</button></div></div>
      <div class="grid g4" id="ipK"></div><div id="ipBoard" style="margin-top:14px"></div>`;
    const load = async () => {
      const [wards, open] = await Promise.all([API.get('/api/ipd/board'), API.list('admissions', { 'eq.status': 'admitted', limit: 200 })]);
      const beds = wards.flatMap(w => w.beds), busyB = beds.filter(b => b.occupant);
      const om = new Map(open.map(a => [a.id, a]));
      $('#ipK', view).innerHTML = kpi('همه تخت‌ها', beds.length, { ic: 'bed' }) + kpi('بستری', busyB.length, { ic: 'users', cls: 'violet' }) + kpi('تخت خالی', beds.length - busyB.length, { ic: 'check', cls: 'good' }) + kpi('باقی بستری‌ها', money(open.reduce((a, x) => a + Math.max(0, x.balance), 0)), { ic: 'cash', cls: 'warn' });
      $('#ipBoard', view).innerHTML = wards.map(w => `<div class="card"><div class="cardHead"><h2>${icon('bed')} ${esc(w.name)}</h2><small class="muted">نرخ روزانه ${money(w.daily_rate)} · ${w.beds.filter(b => b.occupant).length}/${w.beds.length} پُر</small></div>
        <div class="bedGrid">${w.beds.map(b => { const o = b.occupant; const a = o && om.get(o.admission_id); const days = o ? Math.max(1, Math.ceil((Date.now() - toDate(o.admitted_at)) / 864e5)) : 0;
          return o ? `<div class="bedCard busy" data-adm="${o.admission_id}"><div class="bn"><span>${esc(b.name)}</span><span class="codeTag">${esc(o.adm_no)}</span></div><b>${esc(o.full_name)}</b><small class="muted">ولد ${esc(o.father_name || '—')} · ${esc(ageLabel(o.birth_date))} · ${sexFa(o.sex)}</small>
            <div class="mini">${esc(o.doctor_name || '')}${o.diagnosis ? ' · ' + esc(o.diagnosis) : ''}</div><div class="bn" style="margin-top:4px"><span>روز ${days}</span>${a ? `<b class="${a.balance > 0 ? 'neg' : 'pos'}">باقی ${money(a.balance)}</b>` : ''}</div></div>`
            : `<div class="bedCard" data-free="${b.id}"><div class="bn"><span>${esc(b.name)}</span>${pill('خالی', 'good')}</div>${canEdit ? `<div class="muted" style="margin-top:14px;text-align:center">${icon('plus', 14)} بستری کردن مریض</div>` : ''}</div>`; }).join('') || '<div class="muted">تخت ندارد</div>'}</div></div>`).join('') || `<div class="card empty">هنوز اطاق و تخت تعریف نشده. ${canEdit ? 'از دکمه «اطاق‌ها و تخت‌ها» اضافه کنید.' : ''}</div>`;
      this._wards = wards;
    };
    $('#ipBoard', view).onclick = (e) => {
      const c = e.target.closest('.bedCard'); if (!c) return;
      if (c.dataset.adm) admissionDlg(Number(c.dataset.adm), load).catch(errToast);
      else if (canEdit) admitDlg(Number(c.dataset.free), this._wards, load);
    };
    actions(view, {
      beds: () => wardsDlg(load),
      hist: async () => {
        const rows = await API.list('admissions', { limit: 300 });
        const m = modal({ title: 'بستری‌ها', size: 'xwide', body: `<div class="tableWrap"><table class="t"><thead><tr><th>کد</th><th>مریض</th><th>داکتر</th><th>بستری</th><th>رخصت</th><th>تخت</th><th>مبلغ</th><th>باقی</th><th>وضعیت</th></tr></thead><tbody>
          ${rows.map(a => `<tr class="clickable" data-id="${a.id}"><td class="codeTag">${esc(a.adm_no)}</td><td><b>${esc(a.full_name)}</b> <small class="muted">${esc(a.patient_code)}</small></td><td>${esc(a.doctor_name || '—')}</td><td class="nowrap">${fmtDateTime(a.admitted_at)}</td><td class="nowrap">${a.discharged_at ? fmtDateTime(a.discharged_at) : '—'}</td><td>${esc(a.bed_name || '')}</td><td>${money(a.net)}</td><td class="${a.balance > 0.001 ? 'neg' : ''}">${money(a.balance)}</td><td>${pill({ admitted: 'بستری', discharged: 'رخصت', cancelled: 'لغو' }[a.status] || a.status, a.status === 'admitted' ? 'violet' : '')}</td></tr>`).join('') || emptyRow(9)}</tbody></table></div>` });
        $('tbody', m.el).onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) { m.close(); admissionDlg(Number(tr.dataset.id), load).catch(errToast); } };
      }
    });
    await load(); this._load = debounce(load, 400);
  },
  onEvent(m) { if (this._load && /^(ipd|visit)/.test(m.type)) this._load(); }
};
function admitDlg(bedId, wards, after) {
  const bed = wards.flatMap(w => w.beds.map(b => ({ ...b, ward: w }))).find(b => b.id === bedId);
  const m = modal({ title: `بستری کردن — ${esc(bed?.name || '')} (${esc(bed?.ward?.name || '')})`, size: 'wide', body: `${ptPickerHTML('adPt')}
    <div class="formGrid" style="margin-top:10px"><div class="field span2"><span>داکتر معالج</span>${doctorPickerHTML('adDr')}</div>
      <label class="field span2"><span>تشخیص / علت بستری</span><input id="adDx"></label>
      <label class="field"><span>نرخ روزانه تخت</span><input type="number" id="adRate" value="${bed?.ward?.daily_rate || 0}"></label>
      <label class="field"><span>پیش‌پرداخت</span><input type="number" id="adDep" value="0"></label><label class="field"><span>طریقه</span><select id="adPm">${opt(Object.entries(PAY_METHODS), 'cash')}</select></label>
      <label class="field full"><span>یادداشت</span><input id="adNote"></label></div>`,
    foot: `<button class="btn primary" id="adOk">${icon('bed')} بستری و چاپ</button><button class="btn" data-x>انصراف</button>` });
  const pt = bindPtPicker(m.el, 'adPt'); const dr = bindDoctorPicker(m.el, 'adDr');
  $('[data-x]', m.el).onclick = m.close;
  $('#adOk', m.el).onclick = () => busy($('#adOk', m.el), async () => {
    const a = await API.post('/api/ipd/admit', { ...pt.value(), bed_id: bedId, doctor_id: dr.get() || null, diagnosis: $('#adDx', m.el).value, rate: $('#adRate', m.el).value, deposit: $('#adDep', m.el).value, method: $('#adPm', m.el).value, notes: $('#adNote', m.el).value });
    toast(`بستری شد — ${a.adm_no}`, 'good'); m.close(); after && after();
    if (a.paid > 0) await printDoc(payReceiptHTML({ title: 'رسید پیش‌پرداخت بستر', code: a.adm_no, name: a.full_name, pcode: a.patient_code, rows: [['تخت', esc(a.bed_name || '')]], amount: a.paid, method: $('#adPm', m.el).value }), { size: 'receipt', title: a.adm_no });
  }).catch(errToast);
}
async function admissionDlg(id, after) {
  let a = await API.get('/api/ipd/' + id);
  const canEdit = isRole('reception');
  const m = modal({ title: `بستری ${esc(a.adm_no)}`, size: 'xwide', body: '<div id="amB"></div>', foot: '<button class="btn" data-x>بستن</button>' });
  $('[data-x]', m.el).onclick = () => { m.close(); after && after(); };
  const draw = () => {
    const running = a.status === 'admitted';
    const bedTot = running ? a.bed_running : a.bed_total;
    const net = r2(Math.max(0, bedTot + a.extra_running - (a.discount || 0)));
    $('#amB', m.el).innerHTML = `<div class="ptHead">${patientHeadHTML(a.patient)}<div>${pill(running ? 'بستری' : 'رخصت شده', running ? 'violet' : 'good')}</div></div>
      <div class="sum" style="margin:10px 0"><span>داکتر: <b>${esc(a.doctor_name || '—')}</b></span><span>تشخیص: <b>${esc(a.diagnosis || '—')}</b></span><span>بستری: <b>${fmtDateTime(a.admitted_at)}</b></span>${a.discharged_at ? `<span>رخصت: <b>${fmtDateTime(a.discharged_at)}</b></span>` : ''}</div>
      <div class="grid g4">${kpi('جمع تخت', money(bedTot), { ic: 'bed' })}${kpi('خدمات دیگر', money(a.extra_running), { ic: 'plus' })}${kpi('قابل پرداخت', money(net), { ic: 'receipt', cls: 'info', sub: a.discount ? 'تخفیف ' + money(a.discount) : '' })}${kpi('باقی', money(net - a.paid), { ic: 'cash', cls: net - a.paid > 0.001 ? 'bad' : 'good', sub: 'پرداخت ' + money(a.paid) })}</div>
      <div class="grid g2" style="margin-top:12px"><div class="card"><h2>تخت‌ها</h2><table class="t"><thead><tr><th>تخت</th><th>از</th><th>تا</th><th>روز</th><th>نرخ</th><th>جمع</th></tr></thead><tbody>
        ${a.beds.map(b => `<tr><td>${esc(b.bed)} <small class="muted">${esc(b.ward)}</small></td><td class="nowrap">${fmtDateTime(b.start_at)}</td><td class="nowrap">${b.end_at ? fmtDateTime(b.end_at) : 'جاری'}</td><td>${running && !b.end_at ? `<input type="number" step="0.5" data-days="${b.id}" value="${b.calc_days}" style="width:70px" title="روزها برای رخصت">` : fmtNum(b.days ?? b.calc_days)}</td><td>${money(b.rate)}</td><td>${money((b.days ?? b.calc_days) * b.rate)}</td></tr>`).join('')}</tbody></table>
        ${running && a.beds.length > 1 ? `<div class="mini">روزهای تخت‌های قبلی هم قبل از رخصت قابل اصلاح است:</div><div class="bar">${a.beds.filter(b => b.end_at).map(b => `<label class="small">${esc(b.bed)} <input type="number" step="0.5" data-days="${b.id}" value="${b.calc_days}" style="width:64px"></label>`).join('')}</div>` : ''}</div>
        <div class="card"><h2>خدمات و مصارف (دوا، سیروم، پانسمان، عملیات…)</h2><table class="t"><thead><tr><th>شرح</th><th>تاریخ</th><th>مبلغ</th><th></th></tr></thead><tbody>
          ${a.charges.map(c => `<tr><td>${esc(c.name)}</td><td class="nowrap">${fmtDate(c.created_at)}</td><td>${money(c.amount)}</td><td>${running ? `<button class="btn ghost icon" data-rmc="${c.id}">${icon('x', 13)}</button>` : ''}</td></tr>`).join('') || emptyRow(4, 'خدمتی ثبت نشده')}</tbody></table>
          ${running ? `<div class="bar" style="margin-top:8px"><input id="amCn" placeholder="شرح" list="amChargeList" style="flex:1"><input id="amCa" type="number" placeholder="مبلغ" style="width:110px"><button class="btn" id="amCadd">${icon('plus')} افزودن</button></div>${datalist('amChargeList', ['سیروم', 'پیچکاری', 'پانسمان', 'دوا', 'آکسیجن', 'نبولایزر', 'ولادت نارمل', 'عملیات', 'فیس داکتر', 'غذا'])}` : ''}</div></div>
      ${a.payments.length ? `<div class="card" style="margin-top:12px"><h2>پرداخت‌ها</h2><table class="t"><thead><tr><th>تاریخ</th><th>مبلغ</th><th>طریقه</th><th>توسط</th><th>یادداشت</th></tr></thead><tbody>${a.payments.map(x => `<tr><td>${fmtDateTime(x.created_at)}</td><td>${money(x.amount)}</td><td>${esc(payMethodFa(x.method))}</td><td>${esc(x.user_name || '')}</td><td>${esc(x.note || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="stickyFoot">
        <button class="btn" data-a="bill">${icon('print')} صورت حساب</button>
        ${canEdit && Math.abs(net - a.paid) > 0.001 ? `<button class="btn success" data-a="pay">${icon('cash')} دریافت پول</button>` : ''}
        ${canEdit && running ? `<button class="btn" data-a="move">${icon('arrow')} انتقال به تخت دیگر</button><label class="small">تخفیف <input type="number" id="amDisc" value="${a.discount || 0}" style="width:90px"></label><button class="btn primary" data-a="discharge">${icon('check')} رخصت</button>` : ''}
      </div>`;
  };
  $('#amB', m.el).onclick = (e) => {
    const t = e.target.closest('[data-a],[data-rmc],#amCadd'); if (!t) return;
    (async () => {
      if (t.id === 'amCadd') { a = await API.post('/api/ipd/charge/' + id, { name: $('#amCn', m.el).value, amount: $('#amCa', m.el).value }); return draw(); }
      if (t.dataset.rmc) { if (await confirmDlg('این خدمت حذف شود؟')) { a = await API.post('/api/ipd/charge/' + id, { remove: Number(t.dataset.rmc) }); draw(); } return; }
      const act = t.dataset.a;
      if (act === 'bill') return previewDoc(admissionBillHTML(a), { size: 'A4', title: a.adm_no });
      if (act === 'pay') return cashierPayDlg('admission', id, async () => { a = await API.get('/api/ipd/' + id); draw(); });
      if (act === 'move') {
        const wards = await API.get('/api/ipd/board');
        const free = wards.flatMap(w => w.beds.filter(b => !b.occupant).map(b => [b.id, `${b.name} — ${w.name} (${money(w.daily_rate)})`]));
        if (!free.length) throw new Error('تخت خالی وجود ندارد');
        const mm = modal({ title: 'انتقال به تخت دیگر', body: `<label class="field"><span>تخت خالی</span><select id="mvB">${opt(free)}</select></label>`, foot: `<button class="btn primary" id="mvOk">انتقال</button><button class="btn" data-x>انصراف</button>` });
        $('[data-x]', mm.el).onclick = mm.close;
        $('#mvOk', mm.el).onclick = () => busy($('#mvOk', mm.el), async () => { a = await API.post('/api/ipd/transfer/' + id, { bed_id: $('#mvB', mm.el).value }); mm.close(); draw(); toast('منتقل شد', 'good'); }).catch(errToast);
        return;
      }
      if (act === 'discharge') {
        const days = {}; $$('[data-days]', m.el).forEach(i => { days[i.dataset.days] = i.value; });
        if (!(await confirmDlg('مریض رخصت شود؟ صورت حساب نهایی ساخته می‌شود.'))) return;
        a = await API.post('/api/ipd/discharge/' + id, { days, discount: $('#amDisc', m.el).value });
        toast('رخصت شد', 'good'); draw();
        previewDoc(admissionBillHTML(a), { size: 'A4', title: a.adm_no });
      }
    })().catch(errToast);
  };
  draw();
}
async function wardsDlg(after) {
  const m = modal({ title: 'اطاق‌ها و تخت‌ها', size: 'wide', body: '<div id="wdB"></div>', foot: `<button class="btn" id="wdNew">${icon('plus')} اطاق جدید</button><button class="btn" data-x>بستن</button>` });
  const load = async () => {
    const [wards, beds] = await Promise.all([API.list('wards', { limit: 200 }), API.list('beds', { limit: 500 })]);
    $('#wdB', m.el).innerHTML = wards.map(w => `<div class="card" style="margin-bottom:10px"><div class="formGrid" data-ward="${w.id}"><label class="field"><span>نام اطاق</span><input name="name" value="${esc(w.name)}"></label><label class="field"><span>نرخ روزانه تخت</span><input name="daily_rate" type="number" value="${w.daily_rate}"></label><label class="field"><span>ترتیب</span><input name="sort" type="number" value="${w.sort}"></label><label class="check"><input type="checkbox" name="active" ${w.active ? 'checked' : ''}> فعال</label></div>
      <div class="bar" style="margin-top:8px;flex-wrap:wrap">${beds.filter(b => b.ward_id === w.id).map(b => `<span class="chip ${b.active ? '' : 'off'}" data-bed="${b.id}" title="کلیک = تغییر نام / غیرفعال">${esc(b.name)}</span>`).join('')}<button class="btn sm" data-addbed="${w.id}">${icon('plus', 13)} تخت</button><button class="btn sm primary" data-saveward="${w.id}">${icon('check', 13)} ذخیره اطاق</button></div></div>`).join('') || '<div class="empty">اطاقی نیست</div>';
    m._beds = beds;
  };
  $('#wdB', m.el).onclick = (e) => {
    const b = e.target.closest('[data-addbed],[data-saveward],[data-bed]'); if (!b) return;
    (async () => {
      if (b.dataset.saveward) { const v = formValues($(`[data-ward="${b.dataset.saveward}"]`, m.el)); v.id = Number(b.dataset.saveward); await API.save('wards', v); toast('ذخیره شد', 'good'); }
      if (b.dataset.addbed) { const n = m._beds.filter(x => x.ward_id === Number(b.dataset.addbed)).length + 1; const name = await promptDlg('تخت جدید', { label: 'نام / شماره تخت', value: 'تخت ' + n }); if (!name) return; await API.save('beds', { ward_id: Number(b.dataset.addbed), name, sort: n, active: 1 }); }
      if (b.dataset.bed) { const bd = m._beds.find(x => x.id === Number(b.dataset.bed)); const name = await promptDlg('تخت', { label: 'نام (خالی = غیرفعال کردن)', value: bd.name }); if (name === null) return; await API.save('beds', name ? { id: bd.id, name, active: 1 } : { id: bd.id, active: bd.active ? 0 : 1 }); }
      await load(); after && after();
    })().catch(errToast);
  };
  $('#wdNew', m.el).onclick = async () => { const name = await promptDlg('اطاق جدید', { label: 'نام اطاق (مثلاً: اطاق ولادت، VIP)' }); if (!name) return; await API.save('wards', { name, daily_rate: 0, sort: 0, active: 1 }).catch(errToast); load(); after && after(); };
  $('[data-x]', m.el).onclick = m.close;
  await load();
}

// ================================================================ waiting-room display (TV) & calling patients
Pages.qdisplay = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>صفحه نمایش نوبت (TV)</h1><p>این صفحه را روی تلویزیون/مانیتور سالون انتظار باز کنید. وقتی داکتر یا پذیرش «صدا زدن» را بزند، نمبر نوبت با صدا اعلام می‌شود.</p></div>
      <div class="toolbar"><button class="btn primary" data-act="open">${icon('tv')} باز کردن صفحه نمایش</button></div></div>
      <div class="card"><h2>صدا زدن مریض</h2><div id="qdG"></div></div>`;
    const load = async () => {
      const r = await API.get('/api/queue/display');
      const visits = await API.list('visits', { from: today(), to: today(), 'in.status': 'waiting,in_visit', limit: 500 });
      $('#qdG', view).innerHTML = r.groups.map(g => `<div class="card" style="margin-bottom:10px"><div class="cardHead"><h2>${esc(g.title)} ${g.room ? `<small class="muted">اطاق ${esc(g.room)}</small>` : ''}</h2><span>نزد داکتر: <b>${g.current ? g.current.turn + ' — ' + esc(g.current.name) : '—'}</b></span></div>
        <div class="bar" style="flex-wrap:wrap">${visits.filter(v => (g.key === 'd' + v.doctor_id || g.key === 's' + v.service_name) && v.status === 'waiting').sort((a, b) => a.turn_no - b.turn_no).map(v => `<button class="btn sm" data-call="${v.id}" title="${esc(v.full_name)}">${icon('megaphone', 13)} ${v.turn_no} · ${esc(String(v.full_name).split(' ')[0])}</button>`).join('') || '<span class="muted">کسی منتظر نیست</span>'}</div></div>`).join('') || '<div class="empty">امروز کسی در صف نیست</div>';
    };
    $('#qdG', view).onclick = (e) => { const b = e.target.closest('[data-call]'); if (b) API.post('/api/visits/call/' + b.dataset.call).then(x => { toast(`نوبت ${x.turn} اعلام شد`, 'good'); load(); }).catch(errToast); };
    actions(view, { open: () => { const w = window.open('display.html', 'acdb_display', 'width=1280,height=720'); if (!w) toast('پنجره باز نشد — اجازه پاپ‌آپ را بدهید', 'warn'); } });
    await load(); this._load = debounce(load, 400);
  },
  onEvent(m) { if (this._load && /^(visit|queue)/.test(m.type)) this._load(); }
};

// ================================================================ the day's accounts at the reception + cash hand-over
Pages['rc-cash'] = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>حسابات روز و تحویل صندوق</h1><p>همه پول‌های گرفته شده امروز از همه بخش‌ها (فیس داکتر، لابراتوار، دواخانه، بستر و امانت)، برداشت‌ها و باقی‌داری‌ها؛ در آخر روز صندوق را تحویل دهید.</p></div>
      <div class="toolbar"><button class="btn" data-act="wd">${icon('wallet')} برداشت از صندوق</button><button class="btn" data-act="print">${icon('print')} چاپ</button><button class="btn" data-act="csv">${icon('download')} CSV</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', today(), 'id="c_from"')}</label><label class="field"><span>تا</span>${dateInput('to', today(), 'id="c_to"')}</label></div>
      <div class="grid g4" id="cK"></div><div class="grid g4" id="cK2" style="margin-top:12px"></div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h2>به تفکیک بخش</h2><div id="cSec"></div></div><div class="card"><h2>باقی‌داری‌ها (تا این لحظه)</h2><div id="cOut"></div></div></div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h2>فیس به تفکیک داکتر</h2><div id="cDr"></div></div><div class="card"><h2>به تفکیک خدمت</h2><div id="cSvc"></div></div></div>
      <div class="card" style="margin-top:16px"><div class="cardHead"><h2>تحویل صندوق (بستن روز)</h2></div><div class="formGrid" id="cClose"><label class="field"><span>پول شمرده شده در صندوق</span><input name="counted" type="number"></label><label class="field"><span>تحویل به</span><input name="handed_to"></label><label class="field span2"><span>یادداشت</span><input name="note"></label></div>
        <div class="bar" style="margin-top:8px"><span id="cExp" class="muted"></span><button class="btn primary" data-act="close">${icon('check')} ثبت تحویل صندوق</button></div><div id="cCloses" style="margin-top:10px"></div></div>
      <div class="card" style="margin-top:16px"><h2>همه پرداخت‌ها</h2><div class="filterBar"><label class="field"><span>بخش</span><select id="c_kind">${opt(Object.entries(BILL_KINDS).map(([k, v]) => [k, v[0]]), '', { empty: 'همه' })}</select></label><label class="field grow"><span>جستجو</span><input id="c_q"></label></div><div class="tableWrap" style="max-height:520px"><table class="t"><thead><tr><th>ساعت</th><th>بخش</th><th>کد</th><th>مریض</th><th>شرح</th><th>مبلغ</th><th>طریقه</th><th>ایستگاه</th><th>کاربر</th></tr></thead><tbody id="cPays"></tbody></table></div></div>`;
    let day = null, visits = [];
    const STN = (s) => STATIONS[s]?.name || (s === 'browser' || !s ? 'پذیرش' : s);
    const drawPays = () => {
      const k = $('#c_kind', view).value, q = $('#c_q', view).value.trim().toLowerCase();
      const rows = day.payments.filter(x => (!k || x.kind === k) && (!q || [x.full_name, x.code, x.patient_code, x.detail].some(v => String(v || '').toLowerCase().includes(q))));
      $('#cPays', view).innerHTML = rows.map(x => `<tr><td class="nowrap">${day.from === day.to ? fmtTime(x.created_at) : fmtDateTime(x.created_at)}</td><td>${kindTag(x.kind)}</td><td class="codeTag">${esc(x.code || '')}</td><td>${esc(x.full_name || '')} <small class="muted">${esc(x.patient_code || '')}</small></td><td class="small">${esc(x.detail || x.note || '')}</td><td class="${x.amount < 0 ? 'neg' : ''}"><b>${money(x.amount)}</b></td><td>${esc(payMethodFa(x.method))}</td><td>${esc(STN(x.station))}</td><td>${esc(x.user_name || '')}</td></tr>`).join('') || emptyRow(9);
    };
    const load = async () => {
      const from = dateOf($('#c_from', view)), to = dateOf($('#c_to', view)) || from;
      [day, visits] = await Promise.all([API.get('/api/cashier/day', { from, to }), API.list('visits', { from, to, 'ne.status': 'cancelled', limit: 10000 })]);
      const t = day.totals, o = day.outstanding;
      $('#cK', view).innerHTML = kpi('مجموع دریافت (همه بخش‌ها)', money(t.all), { ic: 'cash', cls: 'good', sub: currency() }) + kpi('برداشت‌ها و مصارف', money(t.withdrawals + t.expenses), { ic: 'wallet', cls: 'warn' }) + kpi('صندوق خالص', money(t.net), { ic: 'money', cls: 'violet' }) + kpi('بازپرداخت‌ها', money(t.refunds), { ic: 'percent', cls: 'bad' });
      $('#cK2', view).innerHTML = kpi('فیس داکتر', money(t.visit), { ic: 'steth', cls: 'info', sub: `${visits.filter(v => v.status !== 'reserved').length} مریض` }) + kpi('لابراتوار', money(t.lab), { ic: 'flask' }) + kpi('دواخانه', money(t.sale), { ic: 'pill' }) + kpi('بستر و امانت', money(t.admission + t.deposit), { ic: 'bed' });
      const secRows = [['visit', t.visit], ['lab', t.lab], ['sale', t.sale], ['admission', t.admission], ['deposit', t.deposit]];
      $('#cSec', view).innerHTML = `<table class="t"><thead><tr><th>بخش</th><th>تعداد پرداخت</th><th>مبلغ</th></tr></thead><tbody>${secRows.map(([k, v]) => `<tr><td>${kindTag(k)}</td><td>${day.payments.filter(x => x.kind === k).length}</td><td><b>${money(v)}</b></td></tr>`).join('')}
        <tr><td>دریافت در پذیرش</td><td></td><td>${money(t.at_reception)}</td></tr>${t.at_sections ? `<tr><td>دریافت در خود بخش‌ها</td><td></td><td>${money(t.at_sections)}</td></tr>` : ''}
        ${day.withdrawals.map(w => `<tr class="neg"><td>برداشت ${esc(wdKindName(w.section, w.kind))}${w.person ? ' — ' + esc(w.person) : ''}: ${esc(w.by_whom || '')} ${esc(w.note || '')}</td><td>${esc(SECTIONS[w.section] || w.section || '')}</td><td>-${money(w.amount)}</td></tr>`).join('')}${t.expenses ? `<tr class="neg"><td>مصارف (انبار و حسابات)</td><td></td><td>-${money(t.expenses)}</td></tr>` : ''}
        <tr><td><b>صندوق خالص</b></td><td></td><td><b>${money(t.net)}</b></td></tr></tbody></table>`;
      $('#cOut', view).innerHTML = `<table class="t"><tbody><tr><td>باقی فیس داکتر</td><td><b>${money(o.visits)}</b></td></tr>${o.refunds_due ? `<tr><td>قابل بازپرداخت (تخفیف داکتر)</td><td class="neg">${money(o.refunds_due)}</td></tr>` : ''}<tr><td>لابراتوار (باقی)</td><td><b>${money(o.labs)}</b> ${o.labs_to_bill ? `<small class="muted">+ ${o.labs_to_bill} درخواست بل نشده</small>` : ''}</td></tr>
        <tr><td>دواخانه (باقی)</td><td><b>${money(o.sales)}</b></td></tr><tr><td>بستر (باقی)</td><td><b>${money(o.admissions)}</b></td></tr></tbody></table><button class="btn sm" data-act="cashier" style="margin-top:8px">${icon('cash', 13)} رفتن به صندوق مرکزی</button>`;
      $('#cDr', view).innerHTML = `<table class="t"><thead><tr><th>داکتر</th><th>مریض</th><th>دریافت فیس</th></tr></thead><tbody>${day.byDoctor.map(d => `<tr><td>${esc(d.name ? doctorName(d) : 'بدون داکتر')}</td><td>${d.visits}</td><td>${money(d.amount)}</td></tr>`).join('') || emptyRow(3)}</tbody></table>`;
      const act = visits.filter(v => v.status !== 'reserved');
      const g = new Map(); act.forEach(v => { const k2 = v.service_name || '—'; const x = g.get(k2) || { n: 0, s: 0 }; x.n++; x.s += v.net; g.set(k2, x); });
      $('#cSvc', view).innerHTML = `<table class="t"><thead><tr><th>خدمت</th><th>تعداد</th><th>فیس</th></tr></thead><tbody>${[...g.entries()].sort((a, b) => b[1].s - a[1].s).map(([k2, x]) => `<tr><td>${esc(k2)}</td><td>${x.n}</td><td>${money(x.s)}</td></tr>`).join('') || emptyRow(3)}</tbody></table>`;
      $('#cExp', view).innerHTML = `باید در صندوق باشد: <b>${money(t.net - day.payments.filter(x => x.method && x.method !== 'cash' && x.method !== 'deposit').reduce((a, x) => a + x.amount, 0))}</b> ${currency()} <small>(فقط نقد)</small>`;
      $('#cCloses', view).innerHTML = day.closes.length ? `<table class="t"><thead><tr><th>زمان</th><th>باید باشد</th><th>شمرده شد</th><th>تفاوت</th><th>تحویل به</th><th>توسط</th><th>یادداشت</th></tr></thead><tbody>${day.closes.map(c => `<tr><td>${fmtDateTime(c.created_at)}</td><td>${money(c.expected)}</td><td>${money(c.counted)}</td><td class="${Math.abs(c.difference) > 0.001 ? 'neg' : 'pos'}">${money(c.difference)}</td><td>${esc(c.handed_to || '')}</td><td>${esc(c.user_name || '')}</td><td>${esc(c.note || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="muted small">امروز صندوق تحویل نشده</div>';
      drawPays();
    };
    $$('#c_from, #c_to', view).forEach(el => el.addEventListener('change', load));
    $('#c_kind', view).addEventListener('change', drawPays); $('#c_q', view).addEventListener('input', debounce(drawPays, 200));
    const cashExpected = () => r2(day.totals.net - day.payments.filter(x => x.method && x.method !== 'cash' && x.method !== 'deposit').reduce((a, x) => a + x.amount, 0));
    actions(view, {
      cashier: () => go('cashier'),
      close: (b) => busy(b, async () => {
        const v = formValues($('#cClose', view)); if (v.counted === '') throw new Error('پول شمرده شده را بنویسید');
        const c = await API.post('/api/cashier/close', { ...v, date: day.to, expected: cashExpected() });
        toast(Math.abs(c.difference) > 0.001 ? `ثبت شد — تفاوت ${money(c.difference)}` : 'صندوق تحویل شد ✓', Math.abs(c.difference) > 0.001 ? 'warn' : 'good');
        $$('input', $('#cClose', view)).forEach(i => { i.value = ''; }); load();
      }),
      wd: () => withdrawalDialog('reception', load),
      print: () => {
        const html = `<p>بازه: ${fmtDate(day.from)} تا ${fmtDate(day.to)}</p><h3>به تفکیک بخش</h3>${$('#cSec', view).innerHTML}<h3>باقی‌داری‌ها</h3>${$('#cOut', view).innerHTML.replace(/<button[\s\S]*?<\/button>/g, '')}<h3>داکتران</h3>${$('#cDr', view).innerHTML}<h3>خدمات</h3>${$('#cSvc', view).innerHTML}
          <h3>پرداخت‌ها</h3><table class="rt rtl"><thead><tr><th>زمان</th><th>بخش</th><th>کد</th><th>مریض</th><th>مبلغ</th><th>طریقه</th></tr></thead><tbody>${day.payments.map(x => `<tr><td>${fmtDateTimeNum(x.created_at)}</td><td>${esc(BILL_KINDS[x.kind]?.[0] || x.kind)}</td><td>${esc(x.code || '')}</td><td>${esc(x.full_name || '')}</td><td>${money(x.amount)}</td><td>${esc(payMethodFa(x.method))}</td></tr>`).join('')}</tbody></table>`;
        previewDoc(reportDocHTML('حسابات روز — صندوق پذیرش', html), { title: 'حسابات روز' });
      },
      csv: () => exportCSV('cashier-' + day.from, day.payments, [['created_at', 'زمان'], [x => BILL_KINDS[x.kind]?.[0] || x.kind, 'بخش'], ['code', 'کد'], ['patient_code', 'کد مریض'], ['full_name', 'نام'], ['detail', 'شرح'], ['amount', 'مبلغ'], [x => payMethodFa(x.method), 'طریقه'], [x => STN(x.station), 'ایستگاه'], ['user_name', 'کاربر']])
    });
    await load(); this._load = debounce(load, 800);
  },
  onEvent(m) { if (this._load && /^(visit|lab:paid|sale:paid|ipd)/.test(m.type)) this._load(); }
};
