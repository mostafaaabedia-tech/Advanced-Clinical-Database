/* v1.4 — new features found in other clinic systems:
   reception: WhatsApp reminders (reservations, next visits, vaccines, ready lab results, patients who did not come back), patient card,
   patient documents (scans / photos / PDF), vaccination card, WHO growth chart, children's dose calculator, medical certificates;
   doctor: favourite medicines; pharmacy & stock: expiry / dead stock, controlled medicines register, return to the company,
   dispensing labels, ABC–VED analysis, physical stock count, department requests, purchase orders. */
'use strict';

// ================================================================ helpers
const enDigits = (s) => String(s ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
function waNumber(phone) {
  let d = enDigits(phone).replace(/[^\d+]/g, '');
  if (!d) return '';
  const cc = String(App.settings.whatsapp_country || '93').replace(/\D/g, '');
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return cc + d.slice(1);
  return d.length <= 9 ? cc + d : d;
}
function fillMsg(key, vars) { return String(App.settings[key] || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? ''); }
function openWhatsApp(phone, text) {
  const n = waNumber(phone); if (!n) { toast('شماره تلفن مریض ثبت نشده', 'bad'); return false; }
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(text), '_blank');
  return true;
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('متن کاپی شد', 'good'); } catch (_) { promptDlg('متن پیام', { value: t, textarea: true }); } }
const ageMonths = (birth, at) => { const b = toDate(birth), a = toDate(at || new Date()); return b && a ? (a - b) / 86400000 / 30.4375 : null; };

// ================================================================ reminders (reception / doctor)
const REM_TABS = [
  ['reservations', 'نوبت‌های رزرو', 'msg_reservation', 'reservation', 'calendar'],
  ['nextVisits', 'مراجعه بعدی', 'msg_visit', 'visit', 'steth'],
  ['vaccines', 'واکسین اطفال', 'msg_vaccine', 'vaccine', 'shield'],
  ['labs', 'نتایج آماده آزمایش', 'msg_lab', 'lab', 'flask'],
  ['lapsed', 'مریضانی که نیامدند', 'msg_lapsed', 'lapsed', 'alert']
];
Pages.reminders = {
  async render(view) {
    let tab = 'reservations', data = null;
    view.innerHTML = `<div class="pageHead"><div><h1>یادآوری مریضان (واتس‌اپ)</h1><p>پیام آماده با نام مریض، داکتر و تاریخ — با یک کلیک در واتس‌اپ باز می‌شود. متن پیام‌ها در تنظیمات قابل تغییر است.</p></div>
      <div class="toolbar"><label class="field" style="margin:0"><span>چند روز آینده</span><select id="rmD" style="width:auto">${opt([[1, 'فردا'], [3, '۳ روز'], [7, '۷ روز'], [14, '۲ هفته'], [30, '۱ ماه']], 3)}</select></label><button class="btn" data-act="reload">${icon('refresh')} تازه</button></div></div>
      <div class="grid g5" id="rmK" style="margin-bottom:14px"></div><div class="tabs" id="rmT">${REM_TABS.map(t => `<button data-t="${t[0]}">${icon(t[4], 14)} ${t[1]} <span class="cnt" data-c="${t[0]}"></span></button>`).join('')}</div>
      <div class="card"><div class="tableWrap" id="rmB"></div></div>`;
    const vars = (r, t) => ({ name: r.full_name, doctor: r.doctor || '', date: fmtDate(r.date), time: r.time || '', clinic: App.settings.clinic_name || '', vaccine: r.vaccine || '', code: r.lab_code || '' });
    const draw = () => {
      const t = REM_TABS.find(x => x[0] === tab); const rows = data[tab] || [];
      $$('#rmT button', view).forEach(b => b.classList.toggle('on', b.dataset.t === tab));
      $('#rmB', view).innerHTML = `<table class="t"><thead><tr><th>تاریخ</th><th>مریض</th><th>تلفن</th><th>جزئیات</th><th>وضعیت</th><th></th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.sent ? 'muted' : ''}">
        <td class="nowrap">${weekday(r.date)} ${fmtDate(r.date)}${r.time ? ` <b class="ltr">${esc(r.time)}</b>` : ''}${r.overdue ? ' ' + pill('گذشته', 'bad') : ''}</td>
        <td><b>${esc(r.full_name)}</b> <small class="muted">${esc(r.father_name || '')}</small> <span class="codeTag small">${esc(r.code)}</span></td><td class="ltr">${esc(r.phone || '—')}</td>
        <td>${esc(r.doctor || r.vaccine || r.lab_code || r.service_name || '')}${r.diagnosis ? ` <small class="muted en">${esc(r.diagnosis)}</small>` : ''}</td><td>${r.sent ? pill('فرستاده شد', 'good') : pill('نفرستاده', '')}</td>
        <td class="nowrap"><button class="btn sm success" data-wa="${i}" ${r.phone ? '' : 'disabled'}>${icon('send', 13)} واتس‌اپ</button> <button class="btn sm ghost" data-cp="${i}" title="کاپی متن">${icon('copy', 13)}</button> <button class="btn sm ghost" data-ok="${i}" title="علامت فرستاده شد">${icon('check', 13)}</button>
          ${tab === 'lapsed' && isRole('reception') ? `<button class="btn sm" data-res="${i}">${icon('calendar', 13)} نوبت</button>` : ''}${tab === 'vaccines' ? `<button class="btn sm" data-vac="${i}">${icon('shield', 13)} کارت</button>` : ''}</td></tr>`).join('') || emptyRow(6, 'موردی نیست ✓')}</tbody></table>`;
      view._t = t; view._rows = rows; view._vars = vars;
    };
    const load = async () => {
      data = await API.get('/api/reminders', { days: $('#rmD', view).value });
      REM_TABS.forEach(t => { const c = $(`[data-c="${t[0]}"]`, view); const n = (data[t[0]] || []).filter(r => !r.sent).length; c.textContent = n || ''; });
      $('#rmK', view).innerHTML = REM_TABS.map(t => kpi(t[1], (data[t[0]] || []).length, { ic: t[4], sub: `${(data[t[0]] || []).filter(r => r.sent).length} فرستاده شده`, cls: t[0] === 'lapsed' ? 'warn' : '' })).join('');
      draw();
    };
    $('#rmT', view).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
    $('#rmD', view).onchange = load;
    $('#rmB', view).onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return; const i = Number(b.dataset.wa ?? b.dataset.cp ?? b.dataset.ok ?? b.dataset.res ?? b.dataset.vac); const r = view._rows[i], t = view._t; if (!r) return;
      const text = fillMsg(t[2], vars(r, t));
      const mark = async () => { await API.post('/api/reminders/sent', { kind: t[3], ref_id: r.ref_id, patient_id: r.patient_id }); r.sent = true; draw(); };
      try {
        if (b.dataset.wa !== undefined) { if (openWhatsApp(r.phone, text)) await mark(); }
        if (b.dataset.cp !== undefined) copyText(text);
        if (b.dataset.ok !== undefined) await mark();
        if (b.dataset.res !== undefined) go('reception', { patient_id: r.patient_id });
        if (b.dataset.vac !== undefined) vaccineDialog({ id: r.patient_id, full_name: r.full_name, code: r.code, birth_date: r.birth_date, sex: r.sex, phone: r.phone }, load);
      } catch (err) { errToast(err); }
    };
    actions(view, { reload: load });
    await load();
  }
};

// ================================================================ patient tools (buttons shown in the patient file, reception patient box and the doctor's visit)
function patientToolsHTML(p, where) {
  const a = ageParts(p.birth_date); const kid = a && a.y < 6, child = a && a.y < 15;
  const B = (k, ic, l, cls = '') => `<button type="button" class="btn ${where === 'enc' ? '' : 'sm'} ${cls}" data-pt="${k}">${icon(ic, 14)} ${l}</button>`;
  return `<span class="ptTools">${B('docs', 'file', 'اسناد و عکس‌ها')}${isRole('reception', 'doctor') ? B('vacc', 'shield', 'واکسین', kid ? 'violet' : '') : ''}${isRole('reception', 'doctor') && (kid || !a) ? B('growth', 'trend', 'چارت رشد') : ''}
    ${isRole('doctor') && (child || !a) ? B('dose', 'percent', 'دوز اطفال') : ''}${isRole('doctor') ? B('cert', 'file', 'تصدیق / ارجاع') : ''}${isRole('reception', 'doctor') ? B('card', 'barcode', 'کارت مریض') : ''}</span>`;
}
function bindPatientTools(root, p, ctx) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pt]'); if (!b || !root.contains(b)) return;
    try {
      const k = b.dataset.pt;
      if (k === 'docs') patientDocsDialog(p);
      if (k === 'vacc') vaccineDialog(p);
      if (k === 'growth') growthDialog(p, ctx);
      if (k === 'dose') pedsDoseDialog(p, ctx);
      if (k === 'cert') certificateDialog(p, ctx);
      if (k === 'card') printPatientCard(p);
    } catch (err) { errToast(err); }
  });
}

// ---------------- patient card (86 × 54 mm, like a bank card)
function patientCardHTML(p) {
  const s = App.settings;
  return `<div class="doc pCard"><div class="pcHead"><img src="${logoSrc()}" alt=""><div><b>${esc(s.clinic_name || '')}</b><small class="ltr">${esc(phones()[0] || '')}</small></div></div>
    <div class="pcBody"><div class="pcInfo"><div class="pcName">${esc(p.full_name)}</div><div>ولد: ${esc(p.father_name || '—')}</div><div>${sexFa(p.sex)} · ${esc(ageLabel(p.birth_date))}${p.blood_group ? ' · خون ' + esc(p.blood_group) : ''}</div>${p.phone ? `<div class="ltr">${esc(p.phone)}</div>` : ''}</div>
    <div class="pcQr">${qrSVG(p.code, 2)}</div></div><div class="pcBar">${bc(p.code, 22)}</div></div>`;
}
function printPatientCard(p) { previewDoc(patientCardHTML(p), { size: 'card', title: 'کارت ' + p.code }); }

// ---------------- documents (scanned papers, photos, outside reports)
async function patientDocsDialog(p) {
  const m = modal({ title: 'اسناد مریض — ' + esc(p.full_name) + ' <span class="codeTag small">' + esc(p.code) + '</span>', size: 'xwide', body: `<div class="bar" style="margin-bottom:10px">
      <input id="pdTitle" placeholder="عنوان (مثلاً: راپور سونوگرافی بیرونی، عکس X-Ray…)" style="flex:1"><select id="pdKind" style="width:auto">${opt(['راپور بیرونی', 'عکس / رادیولوژی', 'نسخه قبلی', 'سند شخصی', 'سایر'], 'راپور بیرونی')}</select>
      <button class="btn primary" id="pdUp">${icon('upload')} انتخاب فایل (عکس یا PDF)</button></div><div class="docGrid" id="pdG"></div>`, foot: `<button class="btn" data-close>بستن</button>` });
  $('[data-close]', m.el.querySelector('.modalFoot')).onclick = m.close;
  const url = (d) => `/api/patient-docs/file/${d.id}?token=${encodeURIComponent(API.token)}`;
  const load = async () => {
    const list = await API.get('/api/patient-docs/' + p.id);
    $('#pdG', m.el).innerHTML = list.map(d => `<div class="docTile pop"><a href="#" data-view="${d.id}">${/^image/.test(d.mime) ? `<img src="${url(d)}" alt="" loading="lazy">` : `<div class="pdfIc">PDF</div>`}</a>
      <div class="dtInfo"><b>${esc(d.title)}</b><small>${esc(d.kind || '')} · ${fmtDate(d.created_at)} · ${Math.max(1, Math.round(d.size / 1024))} KB</small></div>
      ${isRole('reception', 'doctor') ? `<button class="btn sm ghost dangerText" data-del="${d.id}">${icon('trash', 13)}</button>` : ''}</div>`).join('') || '<div class="empty">سندی ثبت نشده — عکس یا PDF راپورهای بیرونی را اضافه کنید.</div>';
    m._list = list;
  };
  $('#pdUp', m.el).onclick = async () => {
    const f = await pickFile('image/*,application/pdf'); if (!f) return;
    if (f.size > 15 * 1024 * 1024) return toast('فایل بزرگ‌تر از ۱۵ میگابایت است', 'bad');
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    await busy($('#pdUp', m.el), async () => { await API.post('/api/patient-docs/upload', { patient_id: p.id, title: $('#pdTitle', m.el).value.trim() || f.name, name: f.name, kind: $('#pdKind', m.el).value, data }); $('#pdTitle', m.el).value = ''; toast('سند اضافه شد', 'good'); await load(); }).catch(errToast);
  };
  $('#pdG', m.el).onclick = async (e) => {
    const v = e.target.closest('[data-view]'), d = e.target.closest('[data-del]');
    if (v) { e.preventDefault(); const x = m._list.find(y => y.id === Number(v.dataset.view)); if (/^image/.test(x.mime)) modal({ title: esc(x.title), size: 'xwide', body: `<div style="text-align:center"><img src="${url(x)}" style="max-width:100%;max-height:75vh;border-radius:10px"></div>` }); else window.open(location.origin + url(x), '_blank'); }
    if (d && await confirmDlg('این سند حذف شود؟', { danger: true })) { await API.post('/api/patient-docs/del/' + d.dataset.del); load(); }
  };
  await load();
}

// ---------------- vaccination card
async function vaccineDialog(p, after) {
  const m = modal({ title: 'کارت واکسین — ' + esc(p.full_name), size: 'xwide', body: '<div id="vxB"><div class="empty">…</div></div>', foot: `<button class="btn" id="vx_plan">${icon('calendar')} ساختن برنامه از تاریخ تولد</button><button class="btn" id="vx_pr">${icon('print')} چاپ کارت</button><button class="btn" data-x>بستن</button>`, onClose: after });
  $('[data-x]', m.el).onclick = m.close;
  let d = null;
  const load = async () => {
    d = await API.get('/api/vaccinations/' + p.id);
    const t = today();
    $('#vxB', m.el).innerHTML = `${d.birth_date ? `<div class="infoBox">تاریخ تولد: <b>${fmtDate(d.birth_date)}</b> · سن: ${esc(ageLabel(d.birth_date))}</div>` : '<div class="warnBox">تاریخ تولد مریض ثبت نشده؛ تاریخ واکسین‌ها حساب نمی‌شود.</div>'}
      <div class="tableWrap"><table class="t"><thead><tr><th>واکسین</th><th>تاریخ مقرر</th><th>تاریخ تطبیق</th><th>نمبر بچ</th><th>یادداشت</th><th>وضعیت</th><th></th></tr></thead><tbody>${d.list.map((v, i) => `<tr data-i="${i}">
        <td class="en"><b>${esc(v.vaccine)}</b></td><td>${v.due_date ? fmtDate(v.due_date) : '—'}</td><td>${dateInput('g' + i, v.given_date || '', 'data-f="given_date"')}</td>
        <td><input data-f="batch" class="ltr" value="${esc(v.batch || '')}" style="width:110px"></td><td><input data-f="note" value="${esc(v.note || '')}"></td>
        <td>${v.given_date ? pill('تطبیق شد', 'good') : v.due_date && v.due_date < t ? pill('ناوقت', 'bad') : v.due_date && v.due_date <= isoDate(addDays(new Date(), 14)) ? pill('نزدیک', 'warn') : pill('آینده', '')}</td>
        <td class="nowrap"><button class="btn sm" data-today="${i}">امروز</button> <button class="btn sm primary" data-save="${i}">${icon('check', 13)}</button></td></tr>`).join('') || emptyRow(7, 'برنامه واکسین در تنظیمات خالی است')}</tbody></table></div>`;
  };
  $('#vxB', m.el).onclick = async (e) => {
    const s = e.target.closest('[data-save]'), td = e.target.closest('[data-today]');
    if (td) { setDateInput($(`tr[data-i="${td.dataset.today}"] [data-f=given_date]`, m.el), today()); return; }
    if (!s) return; const tr = s.closest('tr'), v = d.list[Number(s.dataset.save)];
    try { await API.post('/api/vaccinations/save', { patient_id: p.id, vaccine: v.vaccine, due_date: v.due_date, given_date: dateOf($('[data-f=given_date]', tr)), batch: $('[data-f=batch]', tr).value, note: $('[data-f=note]', tr).value }); toast('ثبت شد', 'good'); load(); } catch (err) { errToast(err); }
  };
  $('#vx_plan', m.el).onclick = async () => { try { await API.post('/api/vaccinations/plan/' + p.id); toast('برنامه واکسین ساخته شد؛ در یادآوری‌ها دیده می‌شود', 'good'); load(); } catch (err) { errToast(err); } };
  $('#vx_pr', m.el).onclick = () => previewDoc(`<div class="doc size-A5 plainDoc">${smallHead('کارت واکسین')}<div class="infoGrid" style="grid-template-columns:repeat(2,1fr)"><div>نام: <b>${esc(p.full_name)}</b></div><div>کد: <b>${esc(p.code)}</b></div><div>تاریخ تولد: <b>${fmtDate(d.birth_date)}</b></div><div>جنس: <b>${sexFa(p.sex)}</b></div></div>
    <table class="rt"><tr><th>Vaccine</th><th>تاریخ مقرر</th><th>تاریخ تطبیق</th><th>Batch</th></tr>${d.list.map(v => `<tr><td class="en">${esc(v.vaccine)}</td><td>${v.due_date ? fmtDateNum(v.due_date) : ''}</td><td>${v.given_date ? fmtDateNum(v.given_date) : ''}</td><td class="ltr">${esc(v.batch || '')}</td></tr>`).join('')}</table></div>`, { size: 'A5', title: 'کارت واکسین' });
  await load();
}

// ---------------- WHO growth chart (0–5 years): weight, length/height and head circumference for age with −3…+3 SD lines
function lmsValue([L, M, S], z) { return Math.abs(L) < 1e-9 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L); }
function lmsZ([L, M, S], x) { return Math.abs(L) < 1e-9 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S); }
function growthAt(tbl, months) { const i = Math.max(0, Math.min(tbl.length - 1, Math.floor(months))), j = Math.min(tbl.length - 1, i + 1), f = Math.max(0, Math.min(1, months - i)); return tbl[i].map((v, k) => v + (tbl[j][k] - v) * f); }
async function growthDialog(p, ctx) {
  const g = await API.get('/api/patient-growth/' + p.id);
  const pts = g.points.slice();
  if (ctx && ctx.patient) { const v = (k) => Number($(`#vit [name="${k}"]`, document)?.value) || null; const w = v('weight'), h = v('height'), hc = v('head_circ'); if (w || h || hc) pts.push({ date: today(), weight: w, height: h, head_circ: hc }); }
  if (!g.birth_date) return toast('تاریخ تولد مریض ثبت نشده', 'bad');
  const sex = g.sex === 'F' ? 'F' : 'M';
  const KINDS = [['wfa', 'وزن برای سن', 'weight', 'kg'], ['lhfa', 'قد برای سن', 'height', 'cm'], ['hcfa', 'دور سر برای سن', 'head_circ', 'cm']];
  const m = modal({ title: `چارت رشد WHO — ${esc(p.full_name)} (${sex === 'F' ? 'دختر' : 'پسر'})`, size: 'xwide', body: `<div class="tabs" id="grT">${KINDS.map((k, i) => `<button data-k="${k[0]}" class="${i ? '' : 'on'}">${k[1]}</button>`).join('')}</div>
    <div class="chartBox" style="height:380px"><canvas id="grC"></canvas></div><div class="tableWrap" id="grTb" style="margin-top:10px"></div><div class="mini muted">خطوط: میانه (0) و ±2 و ±3 انحراف معیار — معیار رشد اطفال WHO تا ۵ سالگی.</div>`, onClose: () => { try { chart && chart.destroy(); } catch (_) { } } });
  let chart = null;
  const draw = (k) => {
    const [key, label, field, unit] = KINDS.find(x => x[0] === k); const tbl = WHO_GROWTH[key][sex];
    const xs = Array.from({ length: 61 }, (_, i) => i);
    const line = (z, color, dash) => ({ label: (z > 0 ? '+' : '') + z + ' SD', data: xs.map(x => ({ x, y: +lmsValue(tbl[x], z).toFixed(2) })), borderColor: color, borderWidth: z === 0 ? 2 : 1.2, borderDash: dash, pointRadius: 0, fill: false, tension: .3 });
    const mine = pts.filter(x => x[field]).map(x => ({ x: +ageMonths(g.birth_date, x.date).toFixed(2), y: x[field], date: x.date })).filter(x => x.x >= 0 && x.x <= 60.5);
    try { chart && chart.destroy(); } catch (_) { }
    chart = new Chart($('#grC', m.el), { type: 'line', data: { datasets: [line(3, '#e34948', [4, 3]), line(2, '#eda100', []), line(0, '#1baf7a', []), line(-2, '#eda100', []), line(-3, '#e34948', [4, 3]),
      { label: 'مریض', data: mine, borderColor: '#2a78d6', backgroundColor: '#2a78d6', pointRadius: 5, pointHoverRadius: 7, borderWidth: 2.5, showLine: true, fill: false }] },
      options: { parsing: false, animation: { duration: 500 }, scales: { x: { type: 'linear', min: 0, max: 60, title: { display: true, text: 'سن (ماه)' }, ticks: { stepSize: 6 } }, y: { title: { display: true, text: unit } } }, plugins: { legend: { display: true, position: 'bottom' } } } });
    $('#grTb', m.el).innerHTML = `<table class="t"><thead><tr><th>تاریخ</th><th>سن (ماه)</th><th>${label} (${unit})</th><th>Z-score</th><th>وضعیت</th></tr></thead><tbody>${mine.map(x => { const z = lmsZ(growthAt(tbl, x.x), x.y); const st = z < -3 ? ['شدید پایین', 'bad'] : z < -2 ? ['پایین', 'warn'] : z > 3 ? ['شدید بالا', 'bad'] : z > 2 ? ['بالا', 'warn'] : ['نارمل', 'good'];
      return `<tr><td>${fmtDate(x.date)}</td><td>${x.x.toFixed(1)}</td><td>${x.y}</td><td class="ltr">${z.toFixed(2)}</td><td>${pill(st[0], st[1])}</td></tr>`; }).join('') || emptyRow(5, 'اندازه‌ای ثبت نشده (در علایم حیاتی ویزیت وزن / قد / دور سر را بنویسید)')}</tbody></table>`;
  };
  $('#grT', m.el).onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; $$('#grT button', m.el).forEach(x => x.classList.toggle('on', x === b)); draw(b.dataset.k); };
  draw('wfa');
}

// ---------------- children's dose calculator (mg/kg) — settings "peds_doses"
function pedsDoseList() {
  return listSetting('peds_doses').map(l => { const p = l.split('|').map(x => x.trim()).filter(x => x !== ''); if (p.length < 4) return null; const [mgkg, perDay, max] = p.slice(-3).map(Number); return { names: p.slice(0, -3), mgkg, perDay, max }; }).filter(x => x && x.mgkg > 0);
}
function pedsDoseDialog(p, ctx) {
  const list = pedsDoseList(); if (!list.length) return toast('لیست دوز اطفال در تنظیمات خالی است', 'bad');
  const w0 = Number($('#vit [name="weight"]')?.value) || '';
  const m = modal({ title: 'محاسبه دوز اطفال — ' + esc(p.full_name), size: 'wide', body: `<div class="formGrid" id="pdF">
    <label class="field"><span>وزن (kg)</span><input id="pdW" type="number" step="0.1" value="${esc(w0)}"></label>
    <label class="field"><span>دوا</span><select id="pdM">${list.map((x, i) => `<option value="${i}">${esc(x.names.join(' / '))}</option>`).join('')}</select></label>
    <label class="field"><span>mg/kg هر بار</span><input id="pdK" type="number" step="any"></label><label class="field"><span>دفعات در روز</span><input id="pdN" type="number"></label>
    <label class="field"><span>حداکثر mg هر بار</span><input id="pdX" type="number" step="any"></label>
    <label class="field"><span>شربت: mg در 5 ml (اختیاری)</span><input id="pdS" type="number" step="any" placeholder="مثلاً 125 یا 250"></label></div>
    <div class="doseOut" id="pdO"></div><div class="mini muted" style="margin-top:8px">${icon('alert', 13)} این فقط کمک محاسبه است؛ دوز نهایی را داکتر با توجه به حالت مریض، وظیفه گرده و جگر تعیین می‌کند. اعداد از لیست تنظیمات کلینیک است.</div>`,
    foot: `${ctx && ctx.rxItems && !ctx.rxLocked ? `<button class="btn primary" id="pd_add">${icon('plus')} افزودن به نسخه</button>` : ''}<button class="btn" data-x>بستن</button>` });
  $('[data-x]', m.el).onclick = m.close;
  const fill = () => { const d = list[Number($('#pdM', m.el).value)]; $('#pdK', m.el).value = d.mgkg; $('#pdN', m.el).value = d.perDay; $('#pdX', m.el).value = d.max; calc(); };
  let res = null;
  const calc = () => {
    const w = Number($('#pdW', m.el).value), k = Number($('#pdK', m.el).value), n = Number($('#pdN', m.el).value) || 1, mx = Number($('#pdX', m.el).value) || Infinity, st = Number($('#pdS', m.el).value);
    if (!(w > 0) || !(k > 0)) { $('#pdO', m.el).innerHTML = '<span class="muted">وزن را وارد کنید</span>'; res = null; return; }
    const mg = Math.min(w * k, mx), capped = w * k > mx, ml = st > 0 ? mg / (st / 5) : null;
    res = { mg: +mg.toFixed(1), n, ml: ml ? Math.round(ml * 10) / 10 : null };
    $('#pdO', m.el).innerHTML = `<div class="doseBig"><b>${res.mg}</b> mg <small>هر بار</small>${ml ? ` = <b>${res.ml}</b> ml` : ''}</div><div>${n} بار در روز · مجموع روزانه <b>${+(mg * n).toFixed(1)}</b> mg</div>${capped ? `<div class="neg mini">به حداکثر دوز (${mx} mg) محدود شد</div>` : ''}`;
  };
  $('#pdM', m.el).onchange = fill; $$('#pdW, #pdK, #pdN, #pdX, #pdS', m.el).forEach(x => x.addEventListener('input', calc)); fill();
  const add = $('#pd_add', m.el);
  if (add) add.onclick = () => {
    if (!res) return toast('وزن را وارد کنید', 'bad');
    const d = list[Number($('#pdM', m.el).value)], st = Number($('#pdS', m.el).value);
    const it = { medicine_id: null, name: d.names[0], form: st > 0 ? 'Syrup' : '', strength: st > 0 ? `${st}mg/5` : '', unit: st > 0 ? 'ml' : 'mg', dose: res.ml ? `${res.ml} ml` : `${res.mg} mg`, frequency: `${res.n} / day`, timing: 'After meal', duration: 5, duration_unit: 'days', qty: st > 0 ? 1 : '', note: `${d.mgkg} mg/kg · ${$('#pdW', m.el).value} kg` };
    ctx.rxItems.push(it); ctx.drawRx(); toast(d.names[0] + ' به نسخه اضافه شد', 'good'); m.close();
  };
}

// ---------------- medical certificate / sick leave / referral letter (printed on the letterhead)
const CERT_KINDS = { sick: 'تصدیق رخصتی مریضی', fit: 'تصدیق صحی', referral: 'ارجاع (Referral)' };
function certificateDialog(p, ctx) {
  const dx = $('[name="diagnosis"]')?.value || '';
  const m = modal({ title: 'تصدیق و ارجاع — ' + esc(p.full_name), size: 'wide', body: `<div class="formGrid" id="ctF">
    <label class="field"><span>نوع</span><select name="kind" id="ctK">${opt(Object.entries(CERT_KINDS), 'sick')}</select></label><label class="field"><span>تاریخ</span>${dateInput('date', today())}</label>
    <label class="field ctS"><span>رخصتی از تاریخ</span>${dateInput('from', today())}</label><label class="field ctS"><span>تعداد روز</span><input name="days" type="number" value="3" min="1"></label>
    <label class="field ctR hidden span2"><span>ارجاع به (داکتر / شفاخانه / بخش)</span><input name="to"></label>
    <label class="field span2"><span>تشخیص / علت</span><input name="diagnosis" class="en" value="${esc(dx)}"></label>
    <label class="field full"><span>متن / توضیحات</span><textarea name="body" rows="3"></textarea></label></div>
    <div class="tableWrap" id="ctList" style="margin-top:10px"></div>`, foot: `<button class="btn primary" id="ct_ok">${icon('print')} ذخیره و چاپ</button><button class="btn" data-x>بستن</button>` });
  const sync = () => { const k = $('#ctK', m.el).value; $$('.ctS', m.el).forEach(x => x.classList.toggle('hidden', k !== 'sick')); $$('.ctR', m.el).forEach(x => x.classList.toggle('hidden', k !== 'referral')); };
  $('#ctK', m.el).onchange = sync; sync(); $('[data-x]', m.el).onclick = m.close;
  const drawList = async () => { const l = await API.get('/api/certificates/' + p.id).catch(() => []); $('#ctList', m.el).innerHTML = l.length ? `<table class="t"><thead><tr><th>تاریخ</th><th>نوع</th><th>داکتر</th><th></th></tr></thead><tbody>${l.map(c => `<tr><td>${fmtDate(c.date)}</td><td>${esc(CERT_KINDS[c.kind] || c.kind)}</td><td>${esc(c.doctor_name || '')}</td><td><button class="btn sm" data-re="${c.id}">${icon('print', 13)}</button></td></tr>`).join('')}</tbody></table>` : ''; m._l = l; };
  $('#ctList', m.el).onclick = (e) => { const b = e.target.closest('[data-re]'); if (!b) return; const c = m._l.find(x => x.id === Number(b.dataset.re)); previewDoc(certificateHTML(p, { ...JSON.parse(c.data || '{}'), kind: c.kind, date: c.date }, doctorById(c.doctor_id)), { size: 'A5', title: CERT_KINDS[c.kind] }); };
  $('#ct_ok', m.el).onclick = () => busy($('#ct_ok', m.el), async () => {
    const v = formValues($('#ctF', m.el));
    await API.post('/api/certificates/save', { patient_id: p.id, encounter_id: ctx && ctx.enc ? ctx.enc() : null, kind: v.kind, date: v.date, data: v });
    const doc = doctorById(App.user.doctor_id) || (ctx && ctx.visit ? doctorById(ctx.visit.doctor_id) : null);
    previewDoc(certificateHTML(p, v, doc), { size: 'A5', title: CERT_KINDS[v.kind] }); drawList();
  }).catch(errToast);
  drawList();
}
function certificateHTML(p, v, doctor) {
  const to = v.from && v.days ? isoDate(addDays(v.from, Number(v.days) - 1)) : '';
  const body = v.kind === 'sick' ? `بدینوسیله تصدیق می‌شود که محترم/محترمه <b>${esc(p.full_name)}</b> ولد/بنت <b>${esc(p.father_name || '—')}</b> (کد <bdi>${esc(p.code)}</bdi>، سن ${esc(ageLabel(p.birth_date))}) به تاریخ ${fmtDate(v.date)} معاینه گردید. نامبرده به علت مریضی${v.diagnosis ? ` (<bdi class="en">${esc(v.diagnosis)}</bdi>)` : ''} به مدت <b>${esc(v.days)}</b> روز از تاریخ <b>${fmtDate(v.from)}</b> الی <b>${fmtDate(to)}</b> به استراحت ضرورت دارد.`
    : v.kind === 'fit' ? `بدینوسیله تصدیق می‌شود که محترم/محترمه <b>${esc(p.full_name)}</b> ولد/بنت <b>${esc(p.father_name || '—')}</b> (کد <bdi>${esc(p.code)}</bdi>، سن ${esc(ageLabel(p.birth_date))}) به تاریخ ${fmtDate(v.date)} معاینه گردید و از نظر صحی سالم می‌باشد${v.diagnosis ? ` (<bdi class="en">${esc(v.diagnosis)}</bdi>)` : ''}.`
    : `محترم <b>${esc(v.to || '…')}</b><br>مریض <b>${esc(p.full_name)}</b> ولد/بنت <b>${esc(p.father_name || '—')}</b> (کد <bdi>${esc(p.code)}</bdi>، سن ${esc(ageLabel(p.birth_date))}، ${sexFa(p.sex)}) جهت معاینه و تداوی بیشتر خدمت شما معرفی می‌گردد.${v.diagnosis ? `<br>تشخیص ابتدایی: <bdi class="en">${esc(v.diagnosis)}</bdi>` : ''}`;
  return `<div class="doc size-A5 certDoc">${clinicLetterhead()}<div class="certBody"><h2>${esc(CERT_KINDS[v.kind] || '')}</h2><div class="certDate">تاریخ: ${fmtDate(v.date)}</div><p>${body}</p>${v.body ? `<p>${esc(v.body).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="certSign"><div>${doctor ? esc(doctorName(doctor)) : ''}<br><small>امضا و مهر داکتر</small></div></div></div>${clinicFooter()}</div>`;
}

// ================================================================ doctor: favourite medicines + patient tools inside the visit
function encounterExtras(view, ctx) {
  bindPatientTools(view, ctx.patient, ctx);
  const add = $('.rxAdd', view); if (!add || ctx.rxLocked) return;
  const bar = document.createElement('div'); bar.className = 'favBar'; bar.id = 'favBar'; add.after(bar);
  const F = ['medicine_id', 'name', 'form', 'strength', 'unit', 'dose', 'frequency', 'timing', 'route', 'duration', 'duration_unit', 'note'];
  const draw = async () => {
    const favs = await API.get('/api/dr-favorites').catch(() => []); bar._f = favs;
    bar.innerHTML = favs.length ? `<span class="mini muted">${icon('star', 13)} دواهای من:</span>${favs.map(f => `<button type="button" class="chip favChip" data-fadd="${f.id}" title="${esc([rxSigEn(f), rxEn(f.timing), rxDurationEn(f)].filter(Boolean).join(' · '))}"><span class="en">${esc(f.name)} ${esc(f.strength || '')}</span><span class="x" data-fdel="${f.id}" title="حذف از لیست">×</span></button>`).join('')}`
      : `<span class="mini muted">${icon('star', 13)} با ستاره کنار هر دوای نسخه، آن را (با دوز و دفعات) به «دواهای من» اضافه کنید تا دفعه بعد با یک کلیک نوشته شود.</span>`;
  };
  bar.onclick = async (e) => {
    const d = e.target.closest('[data-fdel]'); if (d) { e.stopPropagation(); await API.post('/api/dr-favorites/del/' + d.dataset.fdel).catch(errToast); return draw(); }
    const a = e.target.closest('[data-fadd]'); if (!a) return; const f = bar._f.find(x => x.id === Number(a.dataset.fadd)); if (!f) return;
    const it = {}; F.forEach(k => it[k] = f[k] ?? ''); it.qty = ''; if (typeof autoQty === 'function') { const q = autoQty(it); if (q !== '') it.qty = q; }
    ctx.rxItems.push(ctx.enRx(it)); ctx.drawRx(); toast(f.name + ' اضافه شد', 'good');
  };
  $('#rxRows', view).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fav]'); if (!b) return; const it = ctx.rxItems[Number(b.dataset.fav)]; if (!it || !it.name) return;
    const row = {}; F.forEach(k => row[k] = it[k] ?? '');
    try { await API.post('/api/dr-favorites/save', row); b.classList.add('on'); toast(it.name + ' به دواهای من اضافه شد', 'good'); draw(); } catch (err) { errToast(err); }
  });
  draw();
}

// ================================================================ pharmacy: dispensing labels (morning / noon / evening / night)
function dispenseLabelsHTML(sale) {
  const S = App.settings;
  const slots = (n) => n >= 4 ? [1, 1, 1, 1] : n === 3 ? [1, 1, 0, 1] : n === 2 ? [1, 0, 0, 1] : n === 1 ? [1, 0, 0, 0] : [0, 0, 0, 0];
  return (sale.items || []).filter(i => i.qty - (i.returned_qty || 0) > 0).map(i => {
    const n = rxTimesPerDay(i.frequency) || 0, sl = slots(n), dose = String(i.dose || '').trim() || '1';
    const sig = [rxSigEn(i), rxEn(i.timing), rxDurationEn(i)].filter(Boolean).join(' · ');
    return `<div class="doc dLabel"><div class="dlHead"><b>${esc(S.clinic_name || '')}</b><span class="ltr">${esc(phones()[0] || '')}</span></div>
      <div class="dlName en"><b>${esc(i.name)}</b> ${esc(i.strength || '')} <small>${esc(i.form || '')}</small><span class="dlQty">#${fmtNum(i.qty)}</span></div>
      <div class="dlPt">${esc(sale.patient_name || '')} · ${esc(fmtDateNum(sale.date))}</div>
      <div class="dlSlots">${['صبح', 'چاشت', 'عصر', 'شب'].map((l, k) => `<div class="${sl[k] ? 'on' : ''}"><small>${l}</small><b class="ltr">${sl[k] ? esc(dose) : '—'}</b></div>`).join('')}</div>
      ${sig ? `<div class="dlSig en">${esc(sig)}</div>` : ''}${i.rx_note ? `<div class="dlNote en">${esc(i.rx_note)}</div>` : ''}</div>`;
  }).join('') || '<div class="empty">دوایی نیست</div>';
}
function salePreview(sale) {
  const m = previewDoc(saleReceiptsHTML(sale), { size: 'receipt', title: sale.sale_code, extraFoot: `<button class="btn" data-dlbl>${icon('barcode')} لیبل مصرف دواها</button>` });
  $('[data-dlbl]', m.el).onclick = () => previewDoc(dispenseLabelsHTML(sale), { size: 'card', title: 'لیبل ' + sale.sale_code });
  return m;
}

// ================================================================ stock: return medicines to the company (from a purchase factor)
async function supplierReturnDialog(pid, after) {
  const p = await API.get('/api/purchases/' + pid);
  const items = p.items.filter(i => i.batch_id && i.qty_left > 0);
  const m = modal({ title: 'برگشت دوا به کمپنی — ' + esc(p.factor_no || p.ref_no) + ' · ' + esc(p.supplier_name || ''), size: 'xwide', body: items.length ? `<div class="tableWrap"><table class="t"><thead><tr><th>دوا</th><th>بچ / انقضا</th><th>قیمت خرید</th><th>باقی در انبار</th><th>تعداد برگشتی</th><th>مبلغ</th></tr></thead><tbody>
    ${items.map((i, k) => `<tr data-k="${k}"><td class="en"><b>${esc(i.name)}</b> ${esc(i.strength || '')}</td><td class="ltr">${esc(i.batch_no || '')} ${esc(i.expiry || '')}</td><td class="money">${money(i.buy_price)}</td><td>${fmtNum(i.qty_left)}</td><td><input type="number" min="0" max="${i.qty_left}" data-q style="width:90px"></td><td class="money" data-a></td></tr>`).join('')}</tbody></table></div>
    <div class="formGrid" id="srF" style="margin-top:10px"><label class="field"><span>تاریخ</span>${dateInput('date', today())}</label><label class="field span2"><span>علت (انقضا نزدیک، خراب، اشتباه…)</span><input name="note"></label></div>
    <div class="sum" style="margin-top:10px"><span>مجموع برگشتی: <b id="srT">0</b> ${esc(currency())}</span><span class="mini muted">از باقی فاکتور کم می‌شود (طلب کمپنی کم می‌شود)، دوا از انبار خارج می‌شود.</span></div>` : '<div class="empty">از این فاکتور دوایی در انبار باقی نمانده</div>',
    foot: items.length ? `<button class="btn primary" id="sr_ok">${icon('check')} ثبت برگشت</button><button class="btn" data-x>انصراف</button>` : '' });
  if (!items.length) return;
  $('[data-x]', m.el).onclick = m.close;
  m.el.addEventListener('input', () => { let t = 0; $$('tr[data-k]', m.el).forEach(tr => { const i = items[Number(tr.dataset.k)], q = Math.min(Number($('[data-q]', tr).value) || 0, i.qty_left); $('[data-a]', tr).textContent = q ? money(q * i.buy_price) : ''; t += q * i.buy_price; }); $('#srT', m.el).textContent = money(t); });
  $('#sr_ok', m.el).onclick = () => busy($('#sr_ok', m.el), async () => {
    const list = $$('tr[data-k]', m.el).map(tr => ({ batch_id: items[Number(tr.dataset.k)].batch_id, qty: Number($('[data-q]', tr).value) || 0 })).filter(x => x.qty > 0);
    if (!list.length) throw new Error('تعداد برگشتی را بنویسید');
    const r = await API.post('/api/supplier-return/' + pid, { items: list, ...formValues($('#srF', m.el)) });
    toast(`برگشت ثبت شد — ${money(r.amount)} از طلب کمپنی کم شد`, 'good'); m.close(); after && after();
  }).catch(errToast);
}

// ================================================================ stock: expiry & dead stock
Pages.expiry = {
  async render(view) {
    let tab = 'exp';
    view.innerHTML = `<div class="pageHead"><div><h1>تاریخ انقضا و دواهای بی‌حرکت</h1><p>دواهایی که تاریخ‌شان نزدیک است (برای فروش زودتر یا برگشت به کمپنی) و دواهایی که مدتی فروش نشده و پول را بند کرده‌اند.</p></div>
      <div class="toolbar"><button class="btn" data-act="print">${icon('print')} چاپ</button><button class="btn" data-act="csv">${icon('download')} CSV</button></div></div>
      <div class="tabs" id="exT"><button data-t="exp" class="on">${icon('alert', 14)} نزدیک به انقضا</button><button data-t="dead">${icon('box', 14)} بی‌حرکت (فروش نشده)</button></div>
      <div class="filterBar"><div class="chips" id="exD"></div></div><div class="grid g3" id="exK" style="margin-bottom:14px"></div><div class="card"><div class="tableWrap" id="exB"></div></div>`;
    let days = 90, rows = [];
    const load = async () => {
      $('#exD', view).innerHTML = (tab === 'exp' ? [[0, 'گذشته'], [30, '۳۰ روز'], [60, '۶۰ روز'], [90, '۹۰ روز'], [180, '۶ ماه']] : [[60, '۲ ماه'], [90, '۳ ماه'], [180, '۶ ماه'], [365, '۱ سال']]).map(([d, l]) => `<button class="chip ${d === days ? 'on' : ''}" data-d="${d}">${l}</button>`).join('');
      const t = today();
      if (tab === 'exp') {
        rows = await API.get('/api/stock/expiry', { days: days || 1 }); if (!days) rows = rows.filter(r => (r.expiry.length === 7 ? r.expiry + '-28' : r.expiry) < t);
        const val = rows.reduce((a, r) => a + r.value, 0), past = rows.filter(r => (r.expiry.length === 7 ? r.expiry + '-28' : r.expiry) < t);
        $('#exK', view).innerHTML = kpi('بچ‌ها', rows.length, { ic: 'box' }) + kpi('ارزش (قیمت خرید)', money(val), { ic: 'money', cls: 'warn', sub: currency() }) + kpi('تاریخ گذشته', past.length, { ic: 'alert', cls: past.length ? 'bad' : 'good' });
        $('#exB', view).innerHTML = `<table class="t"><thead><tr><th>کد</th><th>دوا</th><th>بچ</th><th>انقضا</th><th>باقی</th><th>ارزش</th><th>روز مانده</th></tr></thead><tbody>${rows.map(r => { const e = r.expiry.length === 7 ? r.expiry + '-28' : r.expiry; const dl = Math.round((toDate(e) - toDate(t)) / 86400000);
          return `<tr><td class="codeTag">${r.code}</td><td class="en"><b>${esc(r.name)}</b> ${esc(r.strength || '')} <small>${esc(r.form || '')}</small></td><td class="ltr">${esc(r.batch_no || '')}</td><td class="ltr">${esc(r.expiry)}</td><td>${fmtNum(r.qty_left)} <small>${esc(r.unit || '')}</small></td><td class="money">${money(r.value)}</td><td>${dl < 0 ? pill('گذشته', 'bad') : pill(dl + ' روز', dl <= 30 ? 'bad' : dl <= 90 ? 'warn' : '')}</td></tr>`; }).join('') || emptyRow(7, 'موردی نیست ✓')}</tbody></table>`;
      } else {
        rows = await API.get('/api/stock/dead', { days });
        $('#exK', view).innerHTML = kpi('دواهای بی‌حرکت', rows.length, { ic: 'box' }) + kpi('پول بند شده', money(rows.reduce((a, r) => a + r.stock_cost, 0)), { ic: 'money', cls: 'warn', sub: currency() }) + kpi('هیچ‌وقت فروش نشده', rows.filter(r => !r.last_sale).length, { ic: 'alert' });
        $('#exB', view).innerHTML = `<table class="t"><thead><tr><th>کد</th><th>دوا</th><th>موجودی</th><th>ارزش</th><th>آخرین فروش</th><th>نزدیک‌ترین انقضا</th></tr></thead><tbody>${rows.map(r => `<tr><td class="codeTag">${r.code}</td><td class="en"><b>${esc(r.name)}</b> ${esc(r.strength || '')}</td><td>${fmtNum(r.stock)} <small>${esc(r.unit || '')}</small></td><td class="money">${money(r.stock_cost)}</td><td>${r.last_sale ? fmtDate(r.last_sale) : pill('هرگز', '')}</td><td class="ltr">${esc(r.next_expiry || '')}</td></tr>`).join('') || emptyRow(6, 'موردی نیست ✓')}</tbody></table>`;
      }
    };
    $('#exT', view).onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; days = 90; $$('#exT button', view).forEach(x => x.classList.toggle('on', x === b)); load().catch(errToast); };
    $('#exD', view).onclick = (e) => { const b = e.target.closest('[data-d]'); if (!b) return; days = Number(b.dataset.d); load().catch(errToast); };
    actions(view, {
      print: () => previewDoc(reportDocHTML(tab === 'exp' ? 'دواهای نزدیک به انقضا' : 'دواهای بی‌حرکت', `<table class="rt">${$('#exB table', view).innerHTML.replace(/<span class="pill[^>]*>([^<]*)<\/span>/g, '$1')}</table>`), { title: 'انقضا' }),
      csv: () => exportCSV(tab === 'exp' ? 'expiry' : 'dead-stock', rows, tab === 'exp' ? [['code', 'کد'], ['name', 'دوا'], ['strength', 'قوت'], ['batch_no', 'بچ'], ['expiry', 'انقضا'], ['qty_left', 'باقی'], ['value', 'ارزش']] : [['code', 'کد'], ['name', 'دوا'], ['stock', 'موجودی'], ['stock_cost', 'ارزش'], ['last_sale', 'آخرین فروش']])
    });
    await load();
  }
};

// ================================================================ controlled medicines register
const MOVE_KIND = { purchase: 'خرید', sale: 'فروش', return: 'برگشت مریض', adjust: 'اصلاح موجودی', supplier_return: 'برگشت به کمپنی', opening: 'موجودی اول', void: 'باطل فروش' };
Pages.controlled = {
  async render(view) {
    const [f, t] = currentMonthRange();
    view.innerHTML = `<div class="pageHead"><div><h1>دفتر دواهای کنترل شده</h1><p>هر ورود و خروج دواهای نارکوتیک / روانی با موجودی باقی، نام مریض، داکتر و کد نسخه. دوا را در فورم دوا «کنترل شده» علامت بزنید.</p></div>
      <div class="toolbar"><button class="btn" data-act="print">${icon('print')} چاپ دفتر</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('f', f, 'id="ctF"')}</label><label class="field"><span>تا</span>${dateInput('t', t, 'id="ctT"')}</label></div><div id="ctB"></div>`;
    const load = async () => {
      const list = await API.get('/api/stock/controlled', { from: dateOf($('#ctF', view)), to: dateOf($('#ctT', view)) });
      $('#ctB', view).innerHTML = list.map(x => `<div class="card"><h2 class="en">${icon('shield')} ${esc(x.medicine.name)} ${esc(x.medicine.strength || '')} <small class="muted">کد ${x.medicine.code} · موجودی فعلی ${fmtNum(x.medicine.stock)}</small></h2>
        <div class="tableWrap"><table class="t"><thead><tr><th>تاریخ</th><th>نوع</th><th>ورود</th><th>خروج</th><th>باقی</th><th>مریض / کد نسخه</th><th>داکتر</th><th>کاربر</th><th>یادداشت</th></tr></thead><tbody>
        <tr class="muted"><td colspan="4">موجودی اول دوره</td><td><b>${fmtNum(x.opening)}</b></td><td colspan="4"></td></tr>
        ${x.moves.map(mv => `<tr><td>${fmtDate(mv.date)}</td><td>${esc(MOVE_KIND[mv.kind] || mv.kind)}</td><td class="pos">${mv.qty > 0 ? fmtNum(mv.qty) : ''}</td><td class="neg">${mv.qty < 0 ? fmtNum(-mv.qty) : ''}</td><td><b>${fmtNum(mv.balance)}</b></td>
          <td>${esc(mv.patient_name || '')} ${mv.rx_code ? `<span class="codeTag small">${esc(mv.rx_code)}</span>` : mv.sale_code ? `<span class="codeTag small">${esc(mv.sale_code)}</span> ${pill('بدون نسخه', 'warn')}` : ''}</td><td>${esc(mv.doctor_name || '')}</td><td class="small">${esc(mv.user_name || '')}</td><td class="small">${esc(mv.note || '')}</td></tr>`).join('')}</tbody></table></div></div>`).join('')
        || '<div class="card empty">هیچ دوایی «کنترل شده» علامت نخورده. در صفحه «دواها» دوا را ویرایش و گزینه «دوای کنترل شده» را فعال کنید.</div>';
    };
    $$('#ctF, #ctT', view).forEach(e => e.addEventListener('change', load));
    actions(view, { print: () => previewDoc(reportDocHTML('دفتر دواهای کنترل شده', $('#ctB', view).innerHTML.replace(/<span class="pill[^>]*>([^<]*)<\/span>/g, '($1)').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/class="t"/g, 'class="rt"'), `${fmtDate(dateOf($('#ctF', view)))} — ${fmtDate(dateOf($('#ctT', view)))}`), { title: 'دفتر کنترل شده' }) });
    await load();
  }
};

// ================================================================ ABC – VED analysis
Pages.abc = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>تحلیل ABC و VED</h1><p>A = دواهایی که ۷۰٪ پول مصرف را می‌گیرند (کنترل دقیق)، B = ۲۰٪ بعدی، C = بقیه. VED = حیاتی / ضروری / مطلوب — دواهای V هیچ‌وقت نباید تمام شوند.</p></div>
      <div class="toolbar"><select id="abD" style="width:auto">${opt([[90, '۳ ماه اخیر'], [180, '۶ ماه اخیر'], [365, '۱ سال اخیر']], 365)}</select><button class="btn" data-act="csv">${icon('download')} CSV</button></div></div>
      <div class="grid g-21"><div class="card"><div class="filterBar" style="margin:0 0 8px"><label class="field grow"><span>جستجو</span><input id="abQ"></label><label class="field"><span>گروه</span><select id="abF">${opt([['', 'همه'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['V', 'V بدون موجودی کافی']], '')}</select></label></div><div class="tableWrap" id="abB"></div></div>
      <div class="card"><h2>${icon('chart')} ماتریس ABC × VED</h2><div id="abM"></div><div class="mini muted" style="margin-top:8px">AV، AE، BV و CV: همیشه موجود نگه دارید. CD: کم خرید کنید.</div></div></div>`;
    let rows = [];
    const draw = () => {
      const q = $('#abQ', view).value.trim().toLowerCase(), f = $('#abF', view).value;
      const list = rows.filter(r => (!q || (r.name + ' ' + r.code).toLowerCase().includes(q)) && (!f || (f === 'V' ? r.ved === 'V' && r.stock <= 0 : r.abc === f)));
      $('#abB', view).innerHTML = `<table class="t"><thead><tr><th>ABC</th><th>کد</th><th>دوا</th><th>مصرف</th><th>ارزش مصرف</th><th>٪ تجمعی</th><th>موجودی</th><th>VED</th></tr></thead><tbody>${list.slice(0, 600).map(r => `<tr><td>${pill(r.abc, r.abc === 'A' ? 'bad' : r.abc === 'B' ? 'warn' : '')}</td><td class="codeTag">${r.code}</td><td class="en"><b>${esc(r.name)}</b> ${esc(r.strength || '')}</td><td>${fmtNum(r.qty)}</td><td class="money">${money(r.value)}</td><td>${r.cum_pct}%</td><td class="${r.stock <= 0 ? 'neg' : ''}">${fmtNum(r.stock)}</td>
        <td>${isRole('stock') ? `<select data-ved="${r.id}" style="width:70px">${opt([['V', 'V'], ['E', 'E'], ['D', 'D']], r.ved, { empty: '—' })}</select>` : esc(r.ved || '—')}</td></tr>`).join('') || emptyRow(8)}</tbody></table>`;
      const cell = (a, v) => rows.filter(r => r.abc === a && (r.ved || '') === v);
      $('#abM', view).innerHTML = `<table class="t matrix"><thead><tr><th></th><th>V حیاتی</th><th>E ضروری</th><th>D مطلوب</th><th>تعیین نشده</th></tr></thead><tbody>${['A', 'B', 'C'].map(a => `<tr><th>${a}</th>${['V', 'E', 'D', ''].map(v => { const c = cell(a, v); return `<td class="${['AV', 'AE', 'BV', 'CV'].includes(a + v) ? 'hot' : ''}"><b>${c.length}</b><small>${money(c.reduce((x, r) => x + r.value, 0))}</small></td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
    };
    const load = async () => { rows = await API.get('/api/stock/abc', { days: $('#abD', view).value }); draw(); };
    $('#abD', view).onchange = load; $('#abQ', view).addEventListener('input', debounce(draw, 250)); $('#abF', view).onchange = draw;
    view.addEventListener('change', async (e) => { const s = e.target.closest('[data-ved]'); if (!s) return; try { await API.post('/api/stock/ved', { id: Number(s.dataset.ved), ved: s.value }); const r = rows.find(x => x.id === Number(s.dataset.ved)); r.ved = s.value || null; draw(); toast('ذخیره شد', 'good'); } catch (err) { errToast(err); } });
    actions(view, { csv: () => exportCSV('abc-ved', rows, [['abc', 'ABC'], ['ved', 'VED'], ['code', 'کد'], ['name', 'دوا'], ['qty', 'مصرف'], ['value', 'ارزش'], ['cum_pct', '٪ تجمعی'], ['stock', 'موجودی']]) });
    await load();
  }
};

// ================================================================ physical stock count
Pages['stock-count'] = {
  async render(view, params) {
    if (params.id) return this.one(view, params.id);
    view.innerHTML = `<div class="pageHead"><div><h1>شمارش فزیکی انبار</h1><p>لیست شمارش بسازید، تعداد واقعی هر دوا را بنویسید؛ هنگام بستن، تفاوت با سیستم خودکار اصلاح و ثبت می‌شود.</p></div>
      <div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} شمارش جدید</button></div></div><div class="card"><div class="tableWrap" id="scB"></div></div>`;
    const list = await API.get('/api/stock-counts');
    $('#scB', view).innerHTML = `<table class="t"><thead><tr><th>#</th><th>تاریخ</th><th>عنوان</th><th>اقلام</th><th>شمرده شده</th><th>ارزش تفاوت</th><th>وضعیت</th><th></th></tr></thead><tbody>${list.map(c => `<tr class="clickable" data-open="${c.id}"><td>${c.id}</td><td>${fmtDate(c.date)}</td><td>${esc(c.title)}</td><td>${c.items}</td><td>${c.counted}</td><td class="${c.diff_value < 0 ? 'neg' : 'pos'}">${money(c.diff_value)}</td><td>${c.status === 'open' ? pill('باز', 'warn') : pill('بسته شد', 'good')}</td><td><button class="btn sm">${icon('eye', 13)} باز کردن</button></td></tr>`).join('') || emptyRow(8, 'هنوز شمارشی نشده')}</tbody></table>`;
    $('#scB', view).onclick = (e) => { const tr = e.target.closest('[data-open]'); if (tr) go('stock-count', { id: Number(tr.dataset.open) }); };
    actions(view, {
      new: () => {
        const m = modal({ title: 'شمارش جدید', body: `<div class="formGrid" id="scF"><label class="field span2"><span>عنوان</span><input name="title" value="شمارش ${fmtDate(today())}"></label>
          <label class="field"><span>کتگوری (اختیاری)</span><select name="category">${opt(listSetting('medicine_categories'), '', { empty: 'همه دواها' })}</select></label><label class="check"><input type="checkbox" name="only_stock" checked> فقط دواهای موجود</label></div>`, foot: `<button class="btn primary" id="sc_ok">ساختن لیست</button>` });
        $('#sc_ok', m.el).onclick = () => busy($('#sc_ok', m.el), async () => { const id = await API.post('/api/stock-counts/new', formValues($('#scF', m.el))); m.close(); go('stock-count', { id }); }).catch(errToast);
      }
    });
  },
  async one(view, id) {
    const c = await API.get('/api/stock-counts/' + id); const open = c.status === 'open';
    view.innerHTML = `<div class="pageHead"><div><h1>${esc(c.title)}</h1><p>${fmtDate(c.date)} · ${c.items.length} قلم · ${open ? 'باز — تعداد واقعی را بنویسید (خالی = شمرده نشده)' : 'بسته شده'}</p></div>
      <div class="toolbar"><button class="btn" data-act="back">${icon('arrow')} لیست شمارش‌ها</button>${open ? `<button class="btn" data-act="same">همه = سیستم</button><button class="btn primary" data-act="save">${icon('check')} ذخیره</button><button class="btn danger" data-act="close">بستن و اصلاح موجودی</button>` : ''}<button class="btn" data-act="print">${icon('print')} چاپ فورم شمارش</button></div></div>
      <div class="filterBar"><label class="field grow"><span>جستجو / بارکود</span><input id="scQ" autofocus></label><label class="check"><input type="checkbox" id="scDiff"> فقط تفاوت‌ها</label></div>
      <div class="grid g4" id="scK" style="margin-bottom:12px"></div><div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>قفسه</th><th>کد</th><th>دوا</th><th>سیستم</th><th>شمارش</th><th>تفاوت</th><th>ارزش تفاوت</th></tr></thead><tbody id="scR"></tbody></table></div></div>`;
    const val = (i) => i.counted_qty === null || i.counted_qty === undefined || i.counted_qty === '' ? null : Number(i.counted_qty);
    const kpis = () => { const done = c.items.filter(i => val(i) !== null); const dv = done.reduce((a, i) => a + (val(i) - i.system_qty) * i.unit_cost, 0);
      $('#scK', view).innerHTML = kpi('شمرده شده', `${done.length} / ${c.items.length}`, { ic: 'check' }) + kpi('با تفاوت', done.filter(i => Math.abs(val(i) - i.system_qty) > 0.0001).length, { ic: 'alert', cls: 'warn' }) + kpi('کمبود (ارزش)', money(done.reduce((a, i) => a + Math.min(0, (val(i) - i.system_qty) * i.unit_cost), 0)), { ic: 'minus', cls: 'bad' }) + kpi('خالص تفاوت', money(dv), { ic: 'money', cls: dv < 0 ? 'bad' : 'good' }); };
    const draw = () => {
      const q = $('#scQ', view).value.trim().toLowerCase(), od = $('#scDiff', view).checked;
      $('#scR', view).innerHTML = c.items.map((i, k) => ({ i, k })).filter(({ i }) => (!q || (i.name + ' ' + i.code).toLowerCase().includes(q)) && (!od || (val(i) !== null && Math.abs(val(i) - i.system_qty) > 0.0001))).slice(0, 800).map(({ i, k }) => { const d = val(i) === null ? null : r2(val(i) - i.system_qty);
        return `<tr data-k="${k}"><td>${esc(i.location || '')}</td><td class="codeTag">${i.code}</td><td class="en"><b>${esc(i.name)}</b> ${esc(i.strength || '')}</td><td>${fmtNum(i.system_qty)}</td><td>${open ? `<input type="number" step="any" data-c value="${val(i) ?? ''}" style="width:90px">` : fmtNum(val(i) ?? '')}</td><td class="${d < 0 ? 'neg' : d > 0 ? 'pos' : ''}">${d === null ? '' : d}</td><td class="money">${d ? money(d * i.unit_cost) : ''}</td></tr>`; }).join('') || emptyRow(7);
      kpis();
    };
    $('#scQ', view).addEventListener('input', debounce(draw, 200)); $('#scDiff', view).onchange = draw;
    $('#scR', view).addEventListener('change', (e) => { const inp = e.target.closest('[data-c]'); if (!inp) return; const i = c.items[Number(inp.closest('tr').dataset.k)]; i.counted_qty = inp.value === '' ? null : Number(inp.value); i._dirty = true; const d = val(i) === null ? null : r2(val(i) - i.system_qty); const tr = inp.closest('tr'); tr.cells[5].textContent = d ?? ''; tr.cells[5].className = d < 0 ? 'neg' : d > 0 ? 'pos' : ''; tr.cells[6].textContent = d ? money(d * i.unit_cost) : ''; kpis(); });
    $('#scR', view).addEventListener('keydown', (e) => { if (e.key !== 'Enter' || !e.target.matches('[data-c]')) return; e.preventDefault(); const all = $$('[data-c]', view); const k = all.indexOf(e.target); if (all[k + 1]) all[k + 1].focus(); });
    const save = async () => { const items = c.items.filter(i => i._dirty).map(i => ({ medicine_id: i.medicine_id, counted_qty: i.counted_qty })); if (items.length) await API.post(`/api/stock-counts/${c.id}/set`, { items }); c.items.forEach(i => delete i._dirty); };
    actions(view, {
      back: () => go('stock-count'),
      same: () => { c.items.forEach(i => { if (val(i) === null) { i.counted_qty = i.system_qty; i._dirty = true; } }); draw(); },
      save: (b) => busy(b, async () => { await save(); toast('ذخیره شد', 'good'); }),
      close: async (b) => { await save(); const n = c.items.filter(i => val(i) !== null && Math.abs(val(i) - i.system_qty) > 0.0001).length; if (!(await confirmDlg(`شمارش بسته شود؟ موجودی ${n} دوا اصلاح می‌شود. این کار برگشت ندارد.`, { danger: true }))) return; const r = await API.post(`/api/stock-counts/${c.id}/close`); toast(`${r.adjusted} دوا اصلاح شد`, 'good'); go('stock-count', { id: c.id }); },
      print: () => previewDoc(reportDocHTML(c.title, `<table class="rt"><tr><th>قفسه</th><th>کد</th><th>دوا</th><th>سیستم</th><th>شمارش</th></tr>${c.items.map(i => `<tr><td>${esc(i.location || '')}</td><td>${i.code}</td><td class="en">${esc(i.name)} ${esc(i.strength || '')}</td><td>${fmtNum(i.system_qty)}</td><td>${val(i) ?? ''}</td></tr>`).join('')}</table>`), { title: 'شمارش' })
    });
    draw();
  }
};

// ================================================================ department requests (lab / pharmacy / reception / doctor → stock)
const REQ_STATUS = { open: ['در انتظار', 'warn'], partial: ['قسمی تحویل', 'info'], issued: ['تحویل شد', 'good'], rejected: ['رد شد', 'bad'] };
Pages['dept-requests'] = {
  async render(view) {
    const stockSide = isRole('stock');
    view.innerHTML = `<div class="pageHead"><div><h1>درخواست از انبار</h1><p>${stockSide ? 'درخواست‌های بخش‌ها — تحویل دهید یا رد کنید؛ موجودی خودکار کم می‌شود.' : 'مواد یا دوای مورد نیاز بخش خود را از انبار بخواهید.'}</p></div>
      <div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} درخواست جدید</button><select id="drS" style="width:auto">${opt(Object.entries(REQ_STATUS).map(([k, v]) => [k, v[0]]), '', { empty: 'همه' })}</select></div></div><div id="drB"></div>`;
    const load = async () => {
      const list = await API.get('/api/dept-requests', { status: $('#drS', view).value });
      $('#drB', view).innerHTML = list.map(r => `<div class="card reqCard"><div class="hh"><b><span class="codeTag">${esc(r.req_no || '#' + r.id)}</span> ${esc(SECTIONS[r.section] || ({ doctor: 'داکتر', stock: 'انبار' })[r.section] || r.section)} · ${fmtDate(r.date)} · ${esc(r.requested_by || '')}</b><span>${statusPill(REQ_STATUS, r.status)}
        ${stockSide && ['open', 'partial'].includes(r.status) ? `<button class="btn sm success" data-iss="${r.id}">${icon('check', 13)} تحویل</button> <button class="btn sm dangerText" data-rej="${r.id}">رد</button>` : ''}</span></div>
        <table class="t"><thead><tr><th>قلم</th><th>مقدار</th><th>تحویل شده</th>${stockSide ? '<th>موجودی انبار</th>' : ''}</tr></thead><tbody>${r.items.map(i => `<tr><td>${esc(i.name)} ${i.med_code ? `<span class="codeTag small">${i.med_code}</span>` : ''}</td><td>${fmtNum(i.qty)} ${esc(i.unit || '')}</td><td class="${i.qty_issued >= i.qty ? 'pos' : ''}">${fmtNum(i.qty_issued)}</td>${stockSide ? `<td>${i.medicine_id ? fmtNum(i.stock) : ''}</td>` : ''}</tr>`).join('')}</tbody></table>
        ${r.note ? `<div class="mini">یادداشت: ${esc(r.note)}</div>` : ''}${r.reply ? `<div class="mini">جواب انبار: ${esc(r.reply)} ${r.issued_by ? '— ' + esc(r.issued_by) : ''}</div>` : ''}</div>`).join('') || '<div class="card empty">درخواستی نیست</div>';
      view._list = list;
    };
    $('#drS', view).onchange = load;
    $('#drB', view).onclick = async (e) => {
      const iss = e.target.closest('[data-iss]'), rej = e.target.closest('[data-rej]');
      const r = (view._list || []).find(x => x.id === Number((iss || rej)?.dataset.iss || (iss || rej)?.dataset.rej)); if (!r) return;
      if (rej) { const why = await promptDlg('رد درخواست', { label: 'علت' }); if (why === null) return; await API.post('/api/dept-requests/issue/' + r.id, { reject: 1, reply: why }).catch(errToast); return load(); }
      const m = modal({ title: 'تحویل درخواست ' + esc(r.req_no), size: 'wide', body: `<table class="t"><thead><tr><th>قلم</th><th>خواسته</th><th>قبلاً</th><th>موجودی</th><th>تحویل حالا</th></tr></thead><tbody>${r.items.map(i => `<tr data-id="${i.id}"><td>${esc(i.name)}</td><td>${fmtNum(i.qty)}</td><td>${fmtNum(i.qty_issued)}</td><td>${i.medicine_id ? fmtNum(i.stock) : '—'}</td><td><input type="number" step="any" value="${Math.max(0, r2(i.qty - i.qty_issued))}" style="width:90px"></td></tr>`).join('')}</tbody></table>
        <label class="field" style="margin-top:10px"><span>یادداشت</span><input id="isN"></label><div class="mini muted">دوا از موجودی انبار کم می‌شود؛ مواد لابراتوار به موجودی لابراتوار اضافه می‌شود.</div>`, foot: `<button class="btn success" id="is_ok">${icon('check')} ثبت تحویل</button>` });
      $('#is_ok', m.el).onclick = () => busy($('#is_ok', m.el), async () => { await API.post('/api/dept-requests/issue/' + r.id, { items: $$('tr[data-id]', m.el).map(tr => ({ id: Number(tr.dataset.id), qty_issued: Number($('input', tr).value) || 0 })), reply: $('#isN', m.el).value }); toast('تحویل ثبت شد', 'good'); m.close(); load(); }).catch(errToast);
    };
    actions(view, { new: () => deptRequestDialog(load) });
    await load();
  },
  onEvent(m) { if (m.type.startsWith('request:')) reloadPage(); }
};
function deptRequestDialog(after) {
  const items = [];
  const labSide = isRole('lab') && App.user.role !== 'admin';
  const m = modal({ title: 'درخواست جدید از انبار', size: 'wide', body: `<div class="searchBox"><input id="rqQ" placeholder="${labSide ? 'نام مواد لابراتوار یا دوا…' : 'نام یا کد دوا… (یا هر چیز دیگر و Enter)'}" autocomplete="off"></div>
    <table class="t" style="margin-top:8px"><thead><tr><th>قلم</th><th>واحد</th><th>مقدار</th><th></th></tr></thead><tbody id="rqR"></tbody></table>
    ${isRole('stock') ? `<label class="field" style="margin-top:8px"><span>بخش درخواست کننده</span><select id="rqSec">${opt([['clinic', 'کلینیک'], ['lab', 'لابراتوار'], ['pharmacy', 'دواخانه'], ['reception', 'پذیرش'], ['doctor', 'داکتر']], 'clinic')}</select></label>` : ''}
    <label class="field" style="margin-top:8px"><span>یادداشت</span><input id="rqN"></label>`, foot: `<button class="btn primary" id="rq_ok">${icon('send')} فرستادن به انبار</button>` });
  const draw = () => { $('#rqR', m.el).innerHTML = items.map((i, k) => `<tr data-k="${k}"><td>${esc(i.name)}</td><td><input data-f="unit" value="${esc(i.unit || '')}" style="width:80px"></td><td><input type="number" data-f="qty" value="${i.qty}" style="width:80px"></td><td><button class="btn ghost icon" data-d="${k}">${icon('trash', 14)}</button></td></tr>`).join('') || emptyRow(4, 'قلمی اضافه نشده'); };
  const add = (x) => { items.push(x); draw(); $('#rqQ', m.el).value = ''; setTimeout(() => $(`tr[data-k="${items.length - 1}"] [data-f=qty]`, m.el)?.select(), 30); };
  let labItems = null;
  const rqAc = autocomplete($('#rqQ', m.el), {
    fetch: async (q) => { const meds = await API.get('/api/medicine-search', { q }).catch(() => []); if (isRole('lab', 'stock')) { labItems = labItems || await API.list('lab_items', { limit: 1000 }).catch(() => []); } const li = (labItems || []).filter(x => x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10).map(x => ({ ...x, _lab: 1 })); return labSide ? [...li, ...meds] : [...meds, ...li]; },
    render: (x) => x._lab ? `<span class="code">LAB</span><span class="nm">${esc(x.name)}</span><small class="muted">${esc(x.unit || '')}</small>` : `<span class="code">${x.code}</span><span class="nm en">${esc(x.name)} <small>${esc(x.strength || '')}</small></span><small>موجود ${fmtNum(x.stock)}</small>`,
    pick: (x) => add(x._lab ? { lab_item_id: x.id, name: x.name, unit: x.unit, qty: 1 } : { medicine_id: x.id, name: [x.name, x.strength].filter(Boolean).join(' '), unit: x.unit, qty: 1 })
  });
  // anything not in the lists: type it and press Enter
  $('#rqQ', m.el).addEventListener('keydown', (e) => { if (e.key === 'Enter' && $('#rqQ', m.el).value.trim()) setTimeout(() => { const v = $('#rqQ', m.el).value.trim(); if (v) { rqAc.close(); add({ name: v, unit: '', qty: 1 }); } }, 200); });
  $('#rqR', m.el).addEventListener('input', (e) => { const tr = e.target.closest('tr[data-k]'); if (tr && e.target.dataset.f) items[Number(tr.dataset.k)][e.target.dataset.f] = e.target.value; });
  $('#rqR', m.el).onclick = (e) => { const d = e.target.closest('[data-d]'); if (d) { items.splice(Number(d.dataset.d), 1); draw(); } };
  $('#rq_ok', m.el).onclick = () => busy($('#rq_ok', m.el), async () => { await API.post('/api/dept-requests/save', { items, note: $('#rqN', m.el).value, section: $('#rqSec', m.el)?.value }); toast('درخواست به انبار فرستاده شد', 'good'); m.close(); after && after(); }).catch(errToast);
  draw();
}

// ================================================================ purchase orders (before the factor arrives)
const PO_STATUS = { draft: ['پیش‌نویس', ''], sent: ['فرستاده شد', 'info'], partial: ['قسمی رسید', 'warn'], received: ['کامل رسید', 'good'], cancelled: ['لغو', 'bad'] };
Pages.po = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>سفارش خرید (Purchase Order)</h1><p>سفارش را به کمپنی بفرستید، وقتی فاکتور رسید آن را به سفارش وصل کنید تا معلوم شود چه رسیده و چه باقی مانده.</p></div>
      <div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} سفارش جدید</button><button class="btn" data-act="fromLow">${icon('cart')} سفارش از کمبودها</button></div></div><div id="poB"></div>`;
    const load = async () => {
      const list = await API.get('/api/purchase-orders'); view._list = list;
      $('#poB', view).innerHTML = list.map(o => { const got = o.items.reduce((a, i) => a + Math.min(i.received, i.qty), 0), all = o.items.reduce((a, i) => a + i.qty, 0);
        return `<div class="card reqCard"><div class="hh"><b><span class="codeTag">${esc(o.po_no || '#' + o.id)}</span> ${esc(o.supplier_name || '—')} · ${fmtDate(o.date)}${o.expected_date ? ' · انتظار ' + fmtDate(o.expected_date) : ''}</b>
        <span>${statusPill(PO_STATUS, o.status)} <span class="mini">${all ? Math.round(got / all * 100) : 0}٪ رسیده</span> <button class="btn sm" data-ed="${o.id}">${icon('edit', 13)}</button> <button class="btn sm" data-pr="${o.id}">${icon('print', 13)}</button> <button class="btn sm" data-ln="${o.id}">${icon('truck', 13)} وصل فاکتور</button>
        <select data-st="${o.id}" style="width:auto">${opt(Object.entries(PO_STATUS).map(([k, v]) => [k, v[0]]), o.status)}</select></span></div>
        <div class="progress"><div style="width:${all ? Math.round(got / all * 100) : 0}%"></div></div>
        <table class="t"><thead><tr><th>دوا</th><th>سفارش</th><th>رسیده</th><th>باقی</th><th>قیمت</th><th>مجموع</th></tr></thead><tbody>${o.items.map(i => `<tr><td class="en">${esc(i.name)}</td><td>${fmtNum(i.qty)}</td><td class="pos">${fmtNum(i.received)}</td><td class="${i.qty - i.received > 0 ? 'neg' : ''}">${fmtNum(Math.max(0, i.qty - i.received))}</td><td>${money(i.price)}</td><td class="money">${money(i.qty * i.price)}</td></tr>`).join('')}</tbody></table>
        <div class="sum"><span>مجموع: <b>${money(o.total)}</b></span>${o.factors.length ? `<span>فاکتورها: ${o.factors.map(f => `<span class="codeTag small">${esc(f.factor_no || f.ref_no)}</span>`).join(' ')}</span>` : ''}${o.note ? `<span>${esc(o.note)}</span>` : ''}</div></div>`; }).join('') || '<div class="card empty">سفارشی ثبت نشده</div>';
    };
    view.addEventListener('change', async (e) => { const s = e.target.closest('[data-st]'); if (!s) return; await API.post('/api/purchase-orders/status/' + s.dataset.st, { status: s.value }).catch(errToast); load(); });
    $('#poB', view).onclick = async (e) => {
      const b = e.target.closest('[data-ed],[data-pr],[data-ln]'); if (!b) return; const o = view._list.find(x => x.id === Number(b.dataset.ed || b.dataset.pr || b.dataset.ln));
      if (b.dataset.ed) poDialog(o, load);
      if (b.dataset.pr) previewDoc(poDocHTML(o), { title: o.po_no });
      if (b.dataset.ln) {
        const pur = await API.list('purchases', { limit: 60 });
        const m = modal({ title: 'وصل کردن فاکتور به ' + esc(o.po_no), body: `<label class="field"><span>فاکتور خرید</span><select id="lnP">${pur.map(p => `<option value="${p.id}">${esc(p.factor_no || p.ref_no)} · ${esc(p.supplier_name || '')} · ${fmtDate(p.date)} · ${money(p.net)}</option>`).join('')}</select></label>`, foot: `<button class="btn primary" id="ln_ok">وصل کن</button>` });
        $('#ln_ok', m.el).onclick = async () => { await API.post('/api/purchase-orders/link', { po_id: o.id, purchase_id: Number($('#lnP', m.el).value) }).catch(errToast); m.close(); load(); };
      }
    };
    actions(view, {
      new: () => poDialog(null, load),
      fromLow: async () => { const low = await API.get('/api/stock/reorder'); if (!low.length) return toast('کمبودی نیست ✓'); const bySup = low[0].last_supplier_id; poDialog({ supplier_id: bySup, items: low.filter(x => !bySup || x.last_supplier_id === bySup || !x.last_supplier_id).map(x => ({ medicine_id: x.id, name: [x.name, x.strength].filter(Boolean).join(' '), qty: x.suggest || Math.max(1, x.reorder_level * 2 - x.stock), price: x.last_buy || x.buy_price || 0 })) }, load); }
    });
    await load();
  }
};
async function poDialog(o, after) {
  o = o || {}; const items = (o.items || []).map(i => ({ medicine_id: i.medicine_id, name: i.name, qty: i.qty, price: i.price }));
  const sups = await API.list('suppliers', { limit: 500 }).catch(() => []);
  const m = modal({ title: o.id ? 'ویرایش سفارش ' + esc(o.po_no) : 'سفارش خرید جدید', size: 'xwide', body: `<div class="formGrid" id="poF"><label class="field"><span>کمپنی</span><select name="supplier_id">${opt(sups.map(s => [s.id, s.name]), o.supplier_id, { empty: '—' })}</select></label>
    <label class="field"><span>تاریخ</span>${dateInput('date', o.date || today())}</label><label class="field"><span>تاریخ انتظار رسیدن</span>${dateInput('expected_date', o.expected_date || '')}</label><label class="field"><span>وضعیت</span><select name="status">${opt(Object.entries(PO_STATUS).map(([k, v]) => [k, v[0]]), o.status || 'draft')}</select></label>
    <label class="field full"><span>یادداشت</span><input name="note" value="${esc(o.note || '')}"></label></div>
    <div class="searchBox" style="margin-top:10px"><input id="poQ" placeholder="دوا را جستجو و اضافه کنید…" autocomplete="off"></div>
    <table class="t" style="margin-top:8px"><thead><tr><th>دوا</th><th>تعداد</th><th>قیمت</th><th>مجموع</th><th></th></tr></thead><tbody id="poR"></tbody><tfoot><tr><td colspan="3">مجموع</td><td id="poT" class="money"></td><td></td></tr></tfoot></table>`, foot: `<button class="btn primary" id="po_ok">${icon('check')} ذخیره</button>` });
  const draw = () => { $('#poR', m.el).innerHTML = items.map((i, k) => `<tr data-k="${k}"><td class="en">${esc(i.name)}</td><td><input type="number" data-f="qty" value="${i.qty}" style="width:80px"></td><td><input type="number" step="any" data-f="price" value="${i.price}" style="width:90px"></td><td class="money" data-t>${money(i.qty * i.price)}</td><td><button class="btn ghost icon" data-d="${k}">${icon('trash', 14)}</button></td></tr>`).join('') || emptyRow(5); tot(); };
  const tot = () => $('#poT', m.el).textContent = money(items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.price) || 0), 0));
  autocomplete($('#poQ', m.el), { fetch: (q) => API.get('/api/medicine-search', { q }), render: (x) => `<span class="code">${x.code}</span><span class="nm en">${esc(x.name)} <small>${esc(x.strength || '')}</small></span><small>موجود ${fmtNum(x.stock)}</small>`, pick: (x) => { if (!x) return; items.push({ medicine_id: x.id, name: [x.name, x.strength].filter(Boolean).join(' '), qty: Math.max(1, (x.reorder_level || 5) * 2 - x.stock), price: x.buy_price || 0 }); draw(); $('#poQ', m.el).value = ''; } });
  $('#poR', m.el).addEventListener('input', (e) => { const tr = e.target.closest('tr[data-k]'); if (!tr || !e.target.dataset.f) return; const i = items[Number(tr.dataset.k)]; i[e.target.dataset.f] = Number(e.target.value) || 0; $('[data-t]', tr).textContent = money(i.qty * i.price); tot(); });
  $('#poR', m.el).onclick = (e) => { const d = e.target.closest('[data-d]'); if (d) { items.splice(Number(d.dataset.d), 1); draw(); } };
  $('#po_ok', m.el).onclick = () => busy($('#po_ok', m.el), async () => { await API.post('/api/purchase-orders/save', { id: o.id, ...formValues($('#poF', m.el)), items }); toast('سفارش ذخیره شد', 'good'); m.close(); after && after(); }).catch(errToast);
  draw();
}
function poDocHTML(o) {
  return reportDocHTML('سفارش خرید ' + (o.po_no || ''), `<div class="infoGrid" style="grid-template-columns:repeat(3,1fr)"><div>کمپنی: <b>${esc(o.supplier_name || '')}</b></div><div>تاریخ: <b>${fmtDate(o.date)}</b></div><div>انتظار: <b>${o.expected_date ? fmtDate(o.expected_date) : '—'}</b></div></div>
    <table class="rt"><tr><th>#</th><th>Medicine</th><th>Qty</th><th>Price</th><th>Total</th></tr>${o.items.map((i, k) => `<tr><td>${k + 1}</td><td class="en">${esc(i.name)}</td><td>${fmtNum(i.qty)}</td><td>${money(i.price)}</td><td>${money(i.qty * i.price)}</td></tr>`).join('')}<tr><td colspan="4"><b>مجموع</b></td><td><b>${money(o.total)}</b></td></tr></table>${o.note ? `<p>${esc(o.note)}</p>` : ''}`);
}

// ================================================================ new look: KPI numbers count up when a page opens
function countUp(root) {
  if (document.documentElement.dataset.ui !== 'simple' || document.documentElement.dataset.motion === 'off') return;
  try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (_) { }
  $$('.kpi .val', root).forEach(el => {
    const txt = el.textContent.trim(); if (!/^-?[\d,]+(\.\d+)?$/.test(txt) || el.children.length) return;
    const target = Number(txt.replace(/,/g, '')); if (!isFinite(target) || Math.abs(target) < 2) return;
    const dec = (txt.split('.')[1] || '').length, t0 = performance.now(), D = 650;
    const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); el.textContent = (target * e).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); if (k < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = txt; };
    requestAnimationFrame(step);
  });
}
