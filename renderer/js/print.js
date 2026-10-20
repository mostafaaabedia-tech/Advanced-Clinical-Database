/* Printable documents: prescription on the clinic letterhead, receipts (reception / pharmacy / laboratory),
   laboratory report, purchase factor and generic reports. */
'use strict';

const PAGE_MM = { A4: [210, 297], A5: [148, 210] };
const labelSize = () => [cssNum(App.settings.lab_label_w, 50, 20, 120), cssNum(App.settings.lab_label_h, 25, 10, 80)];

// ---------- print flow ----------
async function printDoc(html, { size = 'A4', title = 'document' } = {}) {
  const area = $('#printArea');
  area.innerHTML = html;
  area.dataset.size = size;
  const [lw, lh] = labelSize();
  $('#pageStyle').textContent = size === 'receipt' ? `@page { size: ${App.settings.receipt_width || 80}mm auto; margin: 0 }` : size === 'label' ? `@page { size: ${lw}mm ${lh}mm; margin: 0 }` : `@page { size: ${size} portrait; margin: 0 }`;
  await new Promise(r => setTimeout(r, 120));
  try { await document.fonts.ready; } catch (_) { }
  try {
    if (window.native && window.native.print) {
      const kind = size === 'receipt' ? 'receipt' : size === 'label' ? 'label' : 'page';
      const r = await window.native.print({ silent: localGet('silent_' + kind, '0') === '1', deviceName: localGet('printer_' + kind, '') || undefined, pageSize: size === 'receipt' ? undefined : size === 'label' ? { width: lw * 1000, height: lh * 1000 } : size });
      if (r && r.success === false && r.reason && r.reason !== 'cancelled') toast('چاپ انجام نشد: ' + r.reason, 'bad');
    } else window.print();
  } finally { setTimeout(() => { area.innerHTML = ''; }, 500); }
}
async function savePdf(html, { size = 'A4', title = 'document' } = {}) {
  if (!(window.native && window.native.pdf)) return printDoc(html, { size, title });
  const area = $('#printArea'); area.innerHTML = html; area.dataset.size = size;
  $('#pageStyle').textContent = size === 'receipt' ? `@page { size: ${App.settings.receipt_width || 80}mm 200mm; margin: 0 }` : `@page { size: ${size} portrait; margin: 0 }`;
  await new Promise(r => setTimeout(r, 120));
  try { const p = await window.native.pdf({ name: title, pageSize: size === 'receipt' ? 'A5' : size }); if (p) toast('PDF ذخیره شد', 'good'); }
  finally { setTimeout(() => { area.innerHTML = ''; }, 500); }
}
// preview dialog with print / PDF buttons
function previewDoc(html, { size = 'A4', title = 'سند', extraFoot = '', onPrinted } = {}) {
  const m = modal({ title: 'پیش‌نمایش چاپ — ' + esc(title), size: 'xwide',
    body: `<div class="docPreview size-${size}">${html}</div>`,
    foot: `<button class="btn primary" data-pr>${icon('print')} چاپ</button>${window.native && window.native.pdf ? `<button class="btn" data-pdf>${icon('pdf')} ذخیره PDF</button>` : ''}${extraFoot}<button class="btn" data-x>بستن</button>` });
  $('[data-pr]', m.el).onclick = async () => { await printDoc(html, { size, title }); onPrinted && onPrinted(); };
  const pdf = $('[data-pdf]', m.el); if (pdf) pdf.onclick = () => savePdf(html, { size, title });
  $('[data-x]', m.el).onclick = m.close;
  setTimeout(() => $('[data-pr]', m.el).focus(), 50);
  return m;
}

// ---------- shared pieces ----------
const logoSrc = () => App.settings.clinic_logo || 'img/logo.png';
const phones = () => listSetting('clinic_phones');
function clinicLetterhead() {
  const s = App.settings;
  const docs = App.doctors.filter(d => d.active && d.on_letterhead);
  const right = docs.find(d => d.letterhead_side !== 'left') || docs[0];
  const left = docs.find(d => d !== right && d.letterhead_side === 'left') || docs.find(d => d !== right);
  const block = (d, side) => d ? `<div class="lhDoc ${side}"><div class="lhDocName" style="color:${esc(d.color || '#0f7a3a')}">${esc(d.title || '')} ${esc(d.name)}</div>
    <div class="lhDocLines">${String(d.header_lines || d.specialty || '').split(/\r?\n/).filter(Boolean).map(l => `<div>${esc(l)}</div>`).join('')}</div></div>` : '<div class="lhDoc"></div>';
  const title = esc(s.clinic_name || '').replace(/OPD/, '<span class="opd">OPD</span>');
  return `<div class="lh"><div class="lhTitle">${title}</div>
    <div class="lhRow">${block(right, 'right')}<div class="lhLogo"><img src="${logoSrc()}" alt=""><div class="lhLogoText">${esc(s.clinic_logo_text || '')}</div></div>${block(left, 'left')}</div>
    <div class="lhRule"></div></div>`;
}
function clinicFooter(extra = '') {
  const s = App.settings;
  return `<div class="lhFoot">${extra}<div class="lhPhones"><span class="ph">☎</span>${phones().map(p => `<span class="phone ltr">${esc(p)}</span>`).join('')}</div>
    <div class="lhAddr">${esc(s.clinic_address || '')}</div></div>`;
}
function smallHead(title) {
  const s = App.settings;
  return `<div class="rcHead"><img src="${logoSrc()}" alt=""><div class="rcClinic">${esc(s.clinic_name || '')}</div>${title ? `<div class="rcTitle">${esc(title)}</div>` : ''}</div>`;
}
function rcRow(label, value, cls = '') { return `<div class="rcRow ${cls}"><span>${label}</span><b>${value}</b></div>`; }
function rcFooter() { return `<div class="rcFoot">${phones().slice(0, 2).map(p => `<span class="ltr">${esc(p)}</span>`).join(' · ')}<br>${esc(App.settings.receipt_footer || '')}<br><small>چاپ: ${esc(fmtDateTimeNum(new Date()))} · ${esc(App.user?.full_name || App.user?.username || '')}</small></div>`; }
// payment lines of a receipt: in "central cashier" mode an unpaid balance is collected at the reception
function rcPayRows(net, paid) {
  const due = r2(net - paid);
  if (due <= 0.001) return rcRow('پرداخت شد', money(paid)) + (due < -0.001 ? rcRow('قابل بازپرداخت', money(-due), 'bad') : '');
  const central = (App.settings.cashier_mode || 'central') === 'central';
  return (paid ? rcRow('پرداخت شد', money(paid)) : '') + rcRow('باقی', money(due), 'bad') + (central ? `<div class="rcPayAt">پرداخت در صندوق پذیرش ← ${money(due)} ${esc(currency())}</div>` : '');
}
// fonts offered for printed documents (Windows fonts are used when installed on that computer)
const PRINT_FONTS = ['Vazirmatn', 'Nastaliq', 'B Nazanin', 'B Lotus', 'B Mitra', 'B Titr', 'B Yekan', 'B Zar', 'IRANSans', 'Tahoma', 'Arial', 'Calibri', 'Cambria', 'Segoe UI', 'Times New Roman', 'Georgia', 'Verdana', 'Viner Hand ITC', 'Consolas'];
const cssFont = (f) => { f = String(f || '').replace(/['";{}<>]/g, '').trim(); return f ? `'${f}'` : 'Vazirmatn'; };
const cssNum = (v, d, min, max) => { const n = Number(v); return isFinite(n) && n >= min && n <= max ? n : d; };
function bc(code, h = 30) { try { return barcodeSVG(code, { height: h, module: 1.15 }); } catch (_) { return ''; } }

// ---------- prescription (letterhead) ----------
// data: { enc, rx (with items), lab (with items), patient, visit, doctor, opts }
function rxDocHTML({ enc = {}, rx, lab, patient, visit, doctor, opts }) {
  const s = App.settings;
  const o = { ...JSON.parse(s.rx_default_print || '{}'), ...(opts || {}) };
  const size = s.rx_page === 'A4' ? 'A4' : 'A5';
  const preprinted = s.rx_header_mode === 'preprinted';
  const vit = [];
  if (enc.bp_sys || enc.bp_dia) vit.push(['B.P', `${enc.bp_sys || '—'}/${enc.bp_dia || '—'} mmHg`]);
  if (enc.pulse) vit.push(['PR', enc.pulse + ' /min']);
  if (enc.resp_rate) vit.push(['RR', enc.resp_rate + ' /min']);
  if (enc.temp) vit.push(['T', enc.temp + ' °C']);
  if (enc.spo2) vit.push(['SpO₂', enc.spo2 + ' %']);
  if (enc.blood_sugar) vit.push(['BS', enc.blood_sugar + ' mg/dL']);
  if (enc.height) vit.push(['Ht', enc.height + ' cm']);
  if (enc.head_circ) vit.push(['HC', enc.head_circ + ' cm']);
  const clin = [];
  if (o.complaint && enc.complaint) clin.push(['شکایت', enc.complaint]);
  if (o.history && (enc.history || patient.chronic_diseases || patient.past_history)) clin.push(['سابقه', [enc.history, patient.chronic_diseases, patient.past_history].filter(Boolean).join(' — ')]);
  if (o.allergies && patient.allergies) clin.push(['حساسیت', patient.allergies]);
  if (o.diagnosis && (enc.diagnosis || enc.diagnosis_code)) clin.push(['Diagnosis', [enc.diagnosis, enc.diagnosis_code ? `(ICD-10: ${enc.diagnosis_code})` : ''].filter(Boolean).join(' ')]);
  if (o.impression && enc.impression) clin.push(['Impression', enc.impression]);
  if (o.notes && enc.notes) clin.push(['یادداشت', enc.notes]);
  const items = rx?.items || [];
  const labItems = (o.labs && lab?.items) ? lab.items : [];
  const dName = doctor ? doctorName(doctor) : (rx?.doctor_name ? doctorName({ title: rx.doctor_title, name: rx.doctor_name }) : '');
  const ptRow = (l, v, cls = '') => `<div class="rxPt ${cls}"><span>${l}</span><b>${v || '—'}</b></div>`;
  return `<div class="doc rxDoc size-${size} ${preprinted ? 'preprinted' : ''}" style="--hs:${Number(s.rx_header_space_mm) || 60}mm">
    ${s.rx_watermark === '1' ? `<div class="wm"><img src="${logoSrc()}" alt=""><div>${esc(s.clinic_logo_text || '')}</div></div>` : ''}
    ${preprinted ? '<div class="lhSpace"></div>' : clinicLetterhead()}
    <div class="rxBody" style="font-family:${cssFont(s.rx_font)}, Vazirmatn, Tahoma, sans-serif;font-size:${cssNum(s.rx_font_size, 13.5, 8, 24)}px;font-weight:${s.rx_font_weight === 'bold' ? 700 : 400};line-height:${cssNum(s.rx_line_height, 1.6, 1, 3)}">
      <div class="rxPtBox">
        ${ptRow('نام مریض', esc(patient.full_name), 'w2')}${ptRow('ولد', esc(patient.father_name))}${ptRow('سن', esc(ageLabel(patient.birth_date)))}${ptRow('جنس', sexFa(patient.sex))}
        ${ptRow('کد مریض', `<span class="ltr">${esc(patient.code)}</span>`)}${o.weight !== 0 && (enc.weight || visit?.weight) ? ptRow('وزن', `<span class="ltr">${esc(enc.weight || visit.weight)} kg</span>`) : ''}${o.weight !== 0 && (enc.height || visit?.height) ? ptRow('قد', `<span class="ltr">${esc(enc.height || visit.height)} cm</span>`) : ''}${ptRow('تاریخ', `<span class="ltr">${esc(fmtDateNum(rx?.date || enc.date || new Date()))}</span>`)}
        ${rx ? ptRow('کد نسخه', `<span class="ltr rxCode">${esc(rx.rx_code)}</span>`) : ''}
        ${o.barcode && rx ? `<div class="rxBarcode">${bc(rx.rx_code, 26)}</div>` : ''}
      </div>
      ${o.vitals && vit.length ? `<div class="rxVitals">${vit.map(([k, v]) => `<span><b>${k}:</b> <span class="ltr">${esc(v)}</span></span>`).join('')}</div>` : ''}
      ${clin.length ? `<div class="rxClin">${clin.map(([k, v]) => `<div><b>${esc(k)}:</b> <span>${esc(v)}</span></div>`).join('')}</div>` : ''}
      ${items.length ? `<div class="rxSym">R<sub>x</sub></div>
      <table class="rxTable"><thead><tr><th>#</th><th class="en">Medicine</th><th>شکل</th><th>قوت</th><th>مقدار</th><th>دفعات مصرف</th><th>زمان</th><th>مدت</th><th>تعداد</th></tr></thead>
      <tbody>${items.map((it, i) => `<tr><td class="c">${i + 1}</td><td class="en med">${esc(it.name)}</td><td class="en">${esc(it.form || '')}</td><td class="en">${esc([it.strength, it.unit].filter(Boolean).join(' '))}</td>
        <td class="c">${esc(it.dose || '')}</td><td>${esc(it.frequency || '')}${it.route ? ` <small>(${esc(it.route)})</small>` : ''}</td><td>${esc(it.timing || '')}</td><td>${it.duration ? `${esc(fmtNum(it.duration))} ${esc(it.duration_unit || '')}` : ''}</td><td class="c"><b>${it.qty ? esc(fmtNum(it.qty)) : ''}</b></td></tr>
        ${it.note ? `<tr class="noteRow"><td></td><td colspan="8">↲ ${esc(it.note)}</td></tr>` : ''}`).join('')}</tbody></table>` : ''}
      ${o.print_note && (enc.print_note || rx?.note) ? `<div class="rxNote"><b>توصیه داکتر:</b> ${esc([enc.print_note, rx?.note].filter(Boolean).join(' — '))}</div>` : ''}
      ${labItems.length ? `<div class="rxLabs"><b>آزمایش‌های لازم ${lab.lab_code ? `<span class="ltr">(${esc(lab.lab_code)})</span>` : ''}:</b> <span class="en">${labItems.map(x => esc(x.name)).join(' · ')}</span></div>` : ''}
      ${o.next_visit && enc.next_visit ? `<div class="rxNext"><b>مراجعه بعدی:</b> ${esc(fmtDate(enc.next_visit))}</div>` : ''}
      <div class="rxSign"><div>داکتر معالج: <b>${esc(dName)}</b></div><div class="sig">امضا و مهر</div></div>
    </div>
    ${preprinted ? '' : clinicFooter(`<div class="rxFootNote">${esc(s.rx_footer || '')}</div>`)}
  </div>`;
}

// ---------- reception receipt ----------
function visitReceiptHTML(v) {
  const d = doctorById(v.doctor_id);
  return `<div class="doc receipt" style="--rw:${App.settings.receipt_width || 80}mm">${smallHead('رسید پذیرش و نوبت')}
    <div class="turnBox"><small>نمبر نوبت</small><b>${v.turn_no || '—'}</b>${v.status === 'reserved' ? `<small>رزرو برای ${esc(fmtDate(v.visit_date))}${v.reserved_time ? ' ساعت ' + esc(v.reserved_time) : ''}</small>` : ''}</div>
    ${rcRow('کد مریض', `<span class="ltr">${esc(v.patient_code)}</span>`)}${rcRow('نام', esc(v.full_name))}${rcRow('ولد', esc(v.father_name || '—'))}
    ${rcRow('سن / جنس', `${esc(ageLabel(v.birth_date))} / ${sexFa(v.sex)}`)}${rcRow('خدمت', esc(v.service_name))}${d ? rcRow('داکتر', esc(doctorName(d))) : ''}
    ${rcRow('تاریخ', `<span class="ltr">${esc(fmtDateNum(v.visit_date))} ${esc(fmtTime(v.created_at))}</span>`)}
    <div class="rcLine"></div>
    ${rcRow('فیس', money(v.fee) + ' ' + currency())}${v.discount ? rcRow('تخفیف', money(v.discount)) : ''}${v.doctor_discount ? rcRow('تخفیف داکتر', money(v.doctor_discount)) : ''}
    ${rcRow('قابل پرداخت', money(v.net) + ' ' + currency(), 'big')}${rcRow('پرداخت شد', money(v.paid))}${v.net - v.paid > 0.001 ? rcRow('باقی', money(v.net - v.paid), 'bad') : ''}
    <div class="rcCode">${bc(v.patient_code, 28)}<div class="small">رسید ${esc(v.visit_no)}</div></div>
    ${rcFooter()}</div>`;
}

// ---------- pharmacy receipts (two copies) ----------
function saleReceiptHTML(sale, copy) {
  const patient = copy === 'patient';
  const items = sale.items || [];
  return `<div class="doc receipt" style="--rw:${App.settings.receipt_width || 80}mm">${smallHead('رسید دواخانه — ' + (patient ? 'نسخه مریض' : 'نسخه دواخانه'))}
    ${rcRow('کد فروش', `<span class="ltr">${esc(sale.sale_code)}</span>`)}${sale.rx_code ? rcRow('کد نسخه', `<span class="ltr">${esc(sale.rx_code)}</span>`) : ''}
    ${rcRow('مریض', esc(sale.patient_name || 'مشتری'))}${sale.patient_code ? rcRow('کد مریض', `<span class="ltr">${esc(sale.patient_code)}</span>`) : ''}${sale.doctor_name ? rcRow('داکتر', esc(sale.doctor_name)) : ''}
    ${rcRow('تاریخ', `<span class="ltr">${esc(fmtDateNum(sale.date))} ${esc(fmtTime(sale.created_at))}</span>`)}
    <table class="rcItems"><thead><tr><th>دوا</th><th>تعداد</th><th>قیمت</th><th>جمع</th></tr></thead><tbody>
    ${items.map(i => `<tr><td class="en">${esc(i.name)}${!patient && i.med_code ? ` <small>#${i.med_code}</small>` : ''}</td><td class="c">${fmtNum(i.qty)}</td><td class="c">${money(i.price)}</td><td class="c">${money(i.total)}</td></tr>
      ${patient && (i.dose || i.frequency || i.timing) ? `<tr class="use"><td colspan="4">طریقه مصرف: ${esc([i.dose ? i.dose + ' ' + (i.unit || '') : '', i.frequency, i.timing, i.duration ? i.duration + ' ' + (i.duration_unit || '') : ''].filter(Boolean).join(' · '))}${i.rx_note ? ' — ' + esc(i.rx_note) : ''}</td></tr>` : ''}
      ${i.returned_qty ? `<tr class="use"><td colspan="4">برگشت: ${fmtNum(i.returned_qty)}</td></tr>` : ''}`).join('')}
    </tbody></table>
    ${rcRow('جمع کل', money(sale.subtotal))}${sale.discount ? rcRow(`تخفیف (${fmtNum(sale.discount_pct, 0)}٪)`, money(sale.discount)) : ''}
    ${rcRow('قابل پرداخت', money(sale.net) + ' ' + currency(), 'big')}${sale.returned ? rcRow('مبلغ برگشتی', money(sale.returned), 'bad') : ''}${rcPayRows(sale.net - (sale.returned || 0), sale.paid)}
    <div class="rcCode">${bc(sale.sale_code, 26)}</div>
    ${patient ? '' : `<div class="rcSign"><span>تحویل دهنده: ${esc(sale.seller || '')}</span><span>امضا: ............</span></div>`}
    ${rcFooter()}</div>`;
}
function saleReceiptsHTML(sale) { return saleReceiptHTML(sale, 'pharmacy') + saleReceiptHTML(sale, 'patient'); }

// ---------- laboratory receipts (two copies) & report ----------
function labReceiptHTML(r, copy) {
  const patient = copy === 'patient';
  const tat = Math.max(...(r.items || []).map(i => 0), 0);
  return `<div class="doc receipt" style="--rw:${App.settings.receipt_width || 80}mm">${smallHead('رسید لابراتوار — ' + (patient ? 'نسخه مریض' : 'نسخه لابراتوار'))}
    ${rcRow('کد لابراتوار', `<span class="ltr">${esc(r.lab_code)}</span>`)}${rcRow('کد مریض', `<span class="ltr">${esc(r.patient_code)}</span>`)}
    ${rcRow('نام', esc(r.full_name))}${rcRow('ولد', esc(r.father_name || '—'))}${rcRow('سن / جنس', `${esc(ageLabel(r.birth_date))} / ${sexFa(r.sex)}`)}
    ${r.doctor_name ? rcRow('داکتر', esc(r.doctor_name)) : ''}${rcRow('تاریخ', `<span class="ltr">${esc(fmtDateTimeNum(r.received_at || r.created_at))}</span>`)}
    <table class="rcItems"><thead><tr><th>آزمایش</th>${patient ? '' : '<th>نمونه</th>'}<th>قیمت</th></tr></thead><tbody>
    ${(r.items || []).map(i => `<tr><td class="en">${esc((labTestCode(i.test_id) ? labTestCode(i.test_id) + ' — ' : '') + i.name)}</td>${patient ? '' : `<td class="en small">${esc((r.tests || []).find(t => t.id === i.test_id || t.panel_id === i.test_id)?.sample || '')}</td>`}<td class="c">${money(i.price)}</td></tr>`).join('')}
    </tbody></table>
    ${rcRow('جمع کل', money(r.subtotal))}${r.discount ? rcRow('تخفیف', money(r.discount)) : ''}${rcRow('قابل پرداخت', money(r.net) + ' ' + currency(), 'big')}${rcPayRows(r.net, r.paid)}
    <div class="rcCode">${bc(r.lab_code, 26)}</div>
    ${patient ? '<div class="rcNote">لطفاً این رسید را هنگام گرفتن نتایج همراه داشته باشید.</div>' : ''}
    ${rcFooter()}</div>`;
}
function labTestCode(id) { try { return (typeof LabCat !== 'undefined' && LabCat && LabCat.byId.get(id)?.code) || ''; } catch (_) { return ''; } }
// sample tube labels: one label per sample type (blood, urine, stool …) with name, lab code barcode and test codes
function tubeLabelsHTML(r) {
  const [w, h] = labelSize();
  const bySample = new Map();
  for (const it of r.items || []) {
    const t = (r.tests || []).find(x => x.id === it.test_id || x.panel_id === it.test_id);
    const smp = (t && t.sample) || 'Sample';
    if (!bySample.has(smp)) bySample.set(smp, []);
    bySample.get(smp).push(labTestCode(it.test_id) || it.name);
  }
  const n = Math.max(1, Number(App.settings.lab_label_copies) || 1);
  return [...bySample.entries()].flatMap(([smp, codes]) => Array.from({ length: n }, () => `<div class="doc tubeLabel" style="width:${w}mm;height:${h}mm">
    <div class="tlTop"><b>${esc(r.full_name)}</b><span>${esc(ageLabel(r.birth_date))} ${r.sex === 'F' ? 'F' : 'M'}</span></div>
    <div class="tlCode">${bc(r.lab_code, Math.max(14, h * 1.6))}</div>
    <div class="tlBot"><span class="ltr">${esc(r.lab_code)}</span><span class="ltr">${esc(smp)}</span><span class="ltr">${esc(fmtDateNum(r.received_at || r.created_at))}</span></div>
    <div class="tlTests ltr">${esc(codes.join(' '))}</div></div>`)).join('');
}
function labReceiptsHTML(r) { return labReceiptHTML(r, 'lab') + labReceiptHTML(r, 'patient'); }

// laboratory report: font / size / weight / paragraph / grid / section alignment come from the settings;
// letterhead and patient box repeat on every page, the clinic address stays at the bottom of every page.
function labReportHTML(r) {
  const s = App.settings;
  const res = new Map((r.results || []).map(x => [x.test_id, x]));
  const birth = r.patient?.birth_date || r.birth_date, sex = r.patient?.sex || r.sex;
  const ageDays = ageParts(birth)?.days ?? null;
  const groups = new Map();
  for (const t of r.tests || []) {
    const v = res.get(t.id); if (!v || v.value === null || v.value === '') continue;
    // flag and normal range are taken from the CURRENT ranges, so edits to the ranges always apply
    let flag = v.flag, ref = v.ref;
    if (typeof resolveRange === 'function') { const rg = resolveRange(t, sex, ageDays); flag = computeFlag(t, v.value, rg); ref = refDisplay(t, rg) || v.ref || ''; }
    const panel = t.panel_id ? (r.items || []).find(i => i.test_id === t.panel_id) : null;
    const g = panel ? panel.name : (t.dept_name || 'Tests');
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ t, v, flag, ref });
  }
  const grid = ['grid', 'lines', 'none'].includes(s.lab_grid) ? s.lab_grid : 'grid';
  const al = (x, d) => ['left', 'center', 'right'].includes(x) ? x : d;
  const vars = `--lf:${cssFont(s.lab_font)};--lfs:${cssNum(s.lab_font_size, 12, 8, 22)}px;--lfw:${s.lab_font_weight === 'bold' ? 700 : 400};--llh:${cssNum(s.lab_line_height, 1.5, 1, 3)};--lrp:${cssNum(s.lab_row_padding, 3, 0, 14)}px;--lra:${al(s.lab_result_align, 'left')};--lsa:${al(s.lab_section_align, 'left')}`;
  const cls = (f) => ['H', 'HH', 'A'].includes(f) ? 'abn' : ['L', 'LL'].includes(f) ? 'low' : '';
  const sec = [...groups.entries()].map(([g, rows]) => `<div class="rSec"><h3>${esc(g)}</h3><table class="rt2"><thead><tr><th style="width:36%">Test</th><th>Result</th><th>Unit</th><th>Reference range</th></tr></thead><tbody>
    ${rows.map(({ t, v, flag, ref }) => `<tr><td>${esc(t.name)}</td><td class="v ${cls(flag)} ${t.result_type === 'memo' ? 'memo' : ''}">${esc(v.value)}${flag ? ` <span class="f">${esc(flag)}</span>` : ''}</td><td>${esc(v.unit || t.unit || '')}</td><td>${esc(ref || '')}</td></tr>
      ${v.note ? `<tr class="cmt"><td colspan="4">↲ ${esc(v.note)}</td></tr>` : ''}`).join('')}</tbody></table></div>`).join('');
  const fa = s.lab_patient_lang !== 'en';
  const ref = r.doctor_name || (r.source === 'walkin' ? (fa ? 'مراجعه مستقیم' : 'Self') : '—');
  const ptBox = fa
    ? `<div class="ptBoxFa lbf"><div><span>نام مریض:</span> <b>${esc(r.full_name)}</b></div><div><span>ولد:</span> <b>${esc(r.father_name || '—')}</b></div><div><span>کد لابراتوار:</span> <b class="ltr">${esc(r.lab_code)}</b></div>
      <div><span>سن / جنس:</span> <b>${esc(ageLabel(birth))} / ${sexFa(sex)}</b></div><div><span>کد مریض:</span> <b class="ltr">${esc(r.patient_code)}</b></div><div><span>تاریخ:</span> <b class="ltr">${esc(fmtDateNum(r.received_at || r.created_at))}</b></div>
      <div><span>داکتر معالج:</span> <b>${esc(ref)}</b></div><div><span>تاریخ نتیجه:</span> <b class="ltr">${esc(fmtDateNum(r.approved_at || r.completed_at || new Date()))}</b></div><div>${bc(r.lab_code, 20)}</div></div>`
    : `<div class="ptBoxEn lbf"><div><span>Name:</span> <b>${esc(r.full_name)}</b></div><div><span>Father:</span> <b>${esc(r.father_name || '—')}</b></div><div><span>Lab No:</span> <b>${esc(r.lab_code)}</b></div>
      <div><span>Age / Sex:</span> <b>${esc(ageLabel(birth))} / ${sex === 'F' ? 'Female' : 'Male'}</b></div><div><span>Patient ID:</span> <b>${esc(r.patient_code)}</b></div><div><span>Date:</span> <b>${esc(fmtDateNum(r.received_at || r.created_at))}</b></div>
      <div><span>Ref. Doctor:</span> <b>${esc(ref)}</b></div><div><span>Reported:</span> <b>${esc(fmtDateNum(r.approved_at || r.completed_at || new Date()))}</b></div><div>${bc(r.lab_code, 20)}</div></div>`;
  return `<div class="doc labDoc labDoc2 size-A4 grid-${grid}" style="${vars};position:relative">
    <table class="pageTable"><thead><tr><td>${clinicLetterhead()}<div class="docTitle">LABORATORY REPORT</div>${ptBox}</td></tr></thead>
    <tbody><tr><td class="lbf">${sec || '<p class="muted">No results.</p>'}
      ${r.report_note ? `<div class="rSec"><h3>Comment</h3><div class="commentBox">${esc(r.report_note)}</div></div>` : ''}
      ${s.lab_show_signature !== '0' ? `<div class="signRow"><div>${esc(s.lab_signature || 'Laboratory')}</div><div>Pathologist</div></div>` : ''}
      ${s.lab_report_footer ? `<div class="labFootNote">${esc(s.lab_report_footer)}</div>` : ''}
      ${s.lab_show_print_time === '1' ? `<div class="docSub" style="margin-top:3mm">${esc(fmtDateTimeNum(new Date()))}</div>` : ''}</td></tr></tbody>
    <tfoot><tr><td><div class="footSpace"></div></td></tr></tfoot></table>
    <div class="labFoot">${clinicFooter()}</div></div>`;
}

// ---------- generic payment receipt (central cashier, deposits, beds) ----------
function payReceiptHTML({ title = 'رسید پرداخت', code, name, pcode, rows = [], amount = 0, method, due, deposit }) {
  return `<div class="doc receipt" style="--rw:${App.settings.receipt_width || 80}mm">${smallHead(title)}
    ${code ? rcRow('کد بل', `<span class="ltr">${esc(code)}</span>`) : ''}${pcode ? rcRow('کد مریض', `<span class="ltr">${esc(pcode)}</span>`) : ''}${name ? rcRow('نام', esc(name)) : ''}
    ${rows.map(([l, v]) => rcRow(esc(l), v)).join('')}
    ${rcRow('تاریخ', `<span class="ltr">${esc(fmtDateTimeNum(new Date()))}</span>`)}
    <div class="rcLine"></div>
    ${rcRow(amount < 0 ? 'بازپرداخت به مریض' : 'مبلغ دریافت شد', money(Math.abs(amount)) + ' ' + currency(), 'big')}${method ? rcRow('طریقه', esc(method === 'deposit' ? 'از پول امانت' : (PAY_METHODS[method] || method))) : ''}
    ${due !== undefined && due !== null ? (due > 0.001 ? rcRow('باقی', money(due), 'bad') : rcRow('وضعیت', 'تصفیه شد ✓')) : ''}
    ${deposit ? rcRow('پول امانت باقی‌مانده', money(deposit)) : ''}
    ${code ? `<div class="rcCode">${bc(code, 24)}</div>` : ''}${rcFooter()}</div>`;
}

// ---------- in-patient bill ----------
function admissionBillHTML(a) {
  const running = a.status === 'admitted';
  const bedTot = running ? a.bed_running : a.bed_total, extra = a.extra_running ?? a.extra_total;
  const net = r2(Math.max(0, bedTot + extra - (a.discount || 0)));
  const p = a.patient || a;
  return `<div class="doc size-A4 plainDoc">${clinicLetterhead()}
    <div class="docTitle rtl">${running ? 'صورت حساب جاری بستر' : 'صورت حساب رخصت از بستر'} <span class="ltr">${esc(a.adm_no)}</span></div>
    <div class="infoGrid"><div>نام مریض: <b>${esc(a.full_name)}</b></div><div>ولد: <b>${esc(a.father_name || '—')}</b></div><div>کد مریض: <b class="ltr">${esc(a.patient_code)}</b></div>
      <div>سن / جنس: <b>${esc(ageLabel(p.birth_date))} / ${sexFa(p.sex)}</b></div><div>داکتر: <b>${esc(a.doctor_name || '—')}</b></div><div>تشخیص: <b>${esc(a.diagnosis || '—')}</b></div>
      <div>تاریخ بستری: <b class="ltr">${esc(fmtDateTimeNum(a.admitted_at))}</b></div><div>تاریخ رخصت: <b class="ltr">${esc(a.discharged_at ? fmtDateTimeNum(a.discharged_at) : '—')}</b></div></div>
    <table class="rt rtl"><thead><tr><th>تخت</th><th>اطاق</th><th>از</th><th>تا</th><th>روز</th><th>نرخ روزانه</th><th>جمع</th></tr></thead>
    <tbody>${(a.beds || []).map(b => { const d = b.days ?? b.calc_days ?? 0; return `<tr><td>${esc(b.bed)}</td><td>${esc(b.ward)}</td><td class="ltr">${esc(fmtDateTimeNum(b.start_at))}</td><td class="ltr">${esc(b.end_at ? fmtDateTimeNum(b.end_at) : 'جاری')}</td><td>${fmtNum(d)}</td><td>${money(b.rate)}</td><td>${money(d * b.rate)}</td></tr>`; }).join('')}</tbody></table>
    ${(a.charges || []).length ? `<h4 class="rtl">خدمات و مصارف دیگر</h4><table class="rt rtl"><thead><tr><th>#</th><th>شرح</th><th>تاریخ</th><th>مبلغ</th></tr></thead><tbody>${a.charges.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.name)}</td><td class="ltr">${esc(fmtDateNum(c.created_at))}</td><td>${money(c.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
    <div class="totGrid"><div>جمع تخت: <b>${money(bedTot)}</b></div><div>خدمات دیگر: <b>${money(extra)}</b></div>${a.discount ? `<div>تخفیف: <b>${money(a.discount)}</b></div>` : ''}<div>قابل پرداخت: <b>${money(net)}</b></div><div>پرداخت شده: <b>${money(a.paid)}</b></div><div>باقی: <b>${money(net - a.paid)}</b></div></div>
    ${(a.payments || []).length ? `<h4 class="rtl">پرداخت‌ها</h4><table class="rt rtl"><thead><tr><th>تاریخ</th><th>مبلغ</th><th>طریقه</th><th>توسط</th><th>یادداشت</th></tr></thead><tbody>${a.payments.map(x => `<tr><td class="ltr">${esc(fmtDateTimeNum(x.created_at))}</td><td>${money(x.amount)}</td><td>${esc(x.method === 'deposit' ? 'از امانت' : (PAY_METHODS[x.method] || x.method || ''))}</td><td>${esc(x.user_name || '')}</td><td>${esc(x.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}
    <div class="rxSign"><div>صندوق پذیرش: <b>${esc(App.user?.full_name || '')}</b></div><div class="sig">امضا و مهر</div></div>
    ${clinicFooter()}</div>`;
}

// ---------- purchase factor & generic table report ----------
function purchaseDocHTML(p) {
  return `<div class="doc size-A4 plainDoc">${clinicLetterhead()}
    <div class="docTitle rtl">فاکتور خرید دوا ${esc(p.ref_no)}</div>
    <div class="infoGrid"><div>کمپنی / آورنده: <b>${esc(p.supplier_name || '—')}</b></div><div>شماره فاکتور: <b class="ltr">${esc(p.factor_no || '—')}</b></div><div>تاریخ: <b class="ltr">${esc(fmtDateNum(p.date))}</b></div>
    <div>تحویل گیرنده: <b>${esc(p.receiver || '—')}</b></div><div>نوع پرداخت: <b>${esc(PAY_TYPES[p.pay_type] || p.pay_type)}</b></div><div>وضعیت: <b>${esc((PAY_STATUS[p.pay_status] || [''])[0])}</b></div></div>
    ${p.has_items ? `<table class="rt rtl"><thead><tr><th>#</th><th>کد</th><th>دوا</th><th>بچ</th><th>انقضا</th><th>تعداد</th><th>بونس</th><th>قیمت خرید</th><th>مفاد٪</th><th>قیمت فروش</th><th>جمع</th></tr></thead>
    <tbody>${(p.items || []).map((i, k) => `<tr><td>${k + 1}</td><td>${i.med_code}</td><td class="en">${esc(i.name)} ${esc(i.strength || '')}</td><td>${esc(i.batch_no || '')}</td><td class="ltr">${esc(i.expiry || '')}</td><td>${fmtNum(i.qty)}</td><td>${fmtNum(i.bonus) || ''}</td><td>${money(i.buy_price)}</td><td>${fmtNum(i.markup_pct)}</td><td>${money(i.sell_price)}</td><td>${money(i.total)}</td></tr>`).join('')}</tbody></table>` : ''}
    <div class="totGrid"><div>جمع: <b>${money(p.subtotal)}</b></div><div>تخفیف: <b>${money(p.discount)}</b></div><div>مبلغ فاکتور: <b>${money(p.net)}</b></div><div>پرداخت شده: <b>${money(p.paid)}</b></div><div>باقی: <b>${money(p.balance)}</b></div></div>
    ${(p.payments || []).length ? `<h4 class="rtl">پرداخت‌ها / اقساط</h4><table class="rt rtl"><thead><tr><th>تاریخ</th><th>مبلغ</th><th>توسط</th><th>یادداشت</th></tr></thead><tbody>${p.payments.map(x => `<tr><td class="ltr">${esc(fmtDateNum(x.date))}</td><td>${money(x.amount)}</td><td>${esc(x.paid_by || '')}</td><td>${esc(x.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}
    ${p.notes ? `<p class="rtl">یادداشت: ${esc(p.notes)}</p>` : ''}
    ${clinicFooter()}</div>`;
}
function reportDocHTML(title, inner, sub = '') {
  return `<div class="doc size-A4 plainDoc">${clinicLetterhead()}<div class="docTitle rtl">${esc(title)}</div>${sub ? `<div class="docSub">${sub}</div>` : ''}<div class="rtl repBody">${inner}</div>
    <div class="docSub">چاپ: ${esc(fmtDateTimeNum(new Date()))} — ${esc(App.user?.full_name || '')}</div></div>`;
}
