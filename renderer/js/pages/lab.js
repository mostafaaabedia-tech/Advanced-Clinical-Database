/* Laboratory station: requests from doctors (by lab code), billing with two receipts, results entry, report, test catalog & prices */
'use strict';

// ---------- formula engine (safe, no eval) & reference ranges ----------
const FORMULA_FN = {
  pow: Math.pow, min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log10: Math.log10,
  round: (x, d = 0) => { const f = Math.pow(10, d); return Math.round(x * f) / f; },
  egfr: (scr, age, female) => { const k = female ? 0.7 : 0.9, a = female ? -0.241 : -0.302; return 142 * Math.pow(Math.min(scr / k, 1), a) * Math.pow(Math.max(scr / k, 1), -1.2) * Math.pow(0.9938, age) * (female ? 1.012 : 1); }
};
function evalFormula(formula, values, vars = {}) {
  let missing = false;
  const src = String(formula).replace(/\{([^}]+)\}/g, (_, code) => { const v = values[String(code).toUpperCase()]; if (v === null || v === undefined || !isFinite(v)) { missing = true; return '0'; } return `(${v})`; });
  if (missing) return null;
  let i = 0; const s = src.replace(/\s+/g, '');
  const peek = () => s[i];
  const expect = (c) => { if (s[i] !== c) throw new Error('Formula error'); i++; };
  function primary() {
    if (peek() === '(') { i++; const v = expr(); expect(')'); return v; }
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    const m = s.slice(i).match(/^(\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i); if (m) { i += m[1].length; return Number(m[1]); }
    const id = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (id) {
      i += id[0].length; const name = id[0];
      if (peek() === '(') { i++; const args = []; if (peek() !== ')') { args.push(expr()); while (peek() === ',') { i++; args.push(expr()); } } expect(')'); const fn = FORMULA_FN[name]; if (!fn) throw new Error('fn'); return fn(...args); }
      if (!(name in vars)) throw new Error('var'); return Number(vars[name]);
    }
    throw new Error('Formula error');
  }
  function factor() { let b = primary(); while (peek() === '^') { i++; b = Math.pow(b, factor()); } return b; }
  function term() { let v = factor(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : v / r; } return v; }
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; }
  try { const v = expr(); return i < s.length || !isFinite(v) ? null : v; } catch (_) { return null; }
}
function resolveRange(t, sex, ageDays) {
  const rs = (t.ranges || []).filter(r => (r.sex === 'A' || r.sex === sex) && (r.age_min_days === null || ageDays === null || ageDays >= r.age_min_days) && (r.age_max_days === null || ageDays === null || ageDays < r.age_max_days));
  const span = (x) => (x.age_max_days ?? 1e7) - (x.age_min_days ?? 0);
  rs.sort((a, b) => (b.sex !== 'A') - (a.sex !== 'A') || span(a) - span(b));
  const r = rs[0];
  let out = r ? { low: num(r.low), high: num(r.high), text: r.text, alarm_low: num(r.alarm_low), alarm_high: num(r.alarm_high), crit_low: num(r.crit_low), crit_high: num(r.crit_high), min_valid: num(r.min_valid), max_valid: num(r.max_valid) }
    : { low: num(t.ref_low), high: num(t.ref_high), text: null };
  // a range written only as text ("4.5 - 11", "< 200") is used for the H / L flag too
  if (out.low === null && out.high === null) { const pr = parseRangeText(r ? r.text : t.ref_text); if (pr) out = { ...out, ...pr }; }
  return out;
}
function parseRangeText(txt) {
  const s = String(txt || '').replace(/٫/g, '.').replace(/(\d),(\d{3})/g, '$1$2').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).trim();
  let m = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:-|–|—|~|to)\s*(-?\d+(?:\.\d+)?)\s*[a-zA-Z/%µ.]*$/i); if (m) return { low: Number(m[1]), high: Number(m[2]) };
  m = s.match(/^(?:<|≤|<=|up\s*to|less\s*than)\s*(\d+(?:\.\d+)?)/i); if (m) return { low: null, high: Number(m[1]) };
  m = s.match(/^(?:>|≥|>=|more\s*than)\s*(\d+(?:\.\d+)?)/i); if (m) return { low: Number(m[1]), high: null };
  return null;
}
// value outside the "danger" (alarm) range or outside what is possible for the test
function alarmOf(t, value, r) {
  const n = num(String(value ?? '').trim().replace(/^[<>]=?\s*/, '')); if (t.result_type !== 'numeric' || n === null) return '';
  const minv = r.min_valid ?? t.possible_low, maxv = r.max_valid ?? t.possible_high;
  if ((minv != null && n < minv) || (maxv != null && n > maxv)) return 'impossible';
  if ((r.alarm_low != null && n < r.alarm_low) || (r.alarm_high != null && n > r.alarm_high)) return 'alarm';
  return '';
}
function refDisplay(t, r) {
  if (r.text) return r.text;
  const lo = r.low, hi = r.high;
  if (lo != null && hi != null) return lo === hi ? String(lo) : `${lo} - ${hi}`;
  if (lo != null) return `≥ ${lo}`; if (hi != null) return `≤ ${hi}`;
  return t.ref_text || '';
}
function computeFlag(t, value, r) {
  const v = String(value ?? '').trim(); if (!v) return null;
  if (t.result_type === 'numeric') {
    const n = num(v.replace(/^[<>]=?\s*/, '')); if (n === null) return null;
    const cl = r.crit_low ?? t.critical_low, ch = r.crit_high ?? t.critical_high;
    if (cl != null && n < cl) return 'LL'; if (ch != null && n > ch) return 'HH';
    if (r.low != null && n < r.low) return 'L'; if (r.high != null && n > r.high) return 'H'; return null;
  }
  if (t.result_type === 'option' && t.ref_text) {
    const opts = JSON.parse(t.options || '[]').map(x => String(x).replace(/^\s*\d+\s*=\s*/, ''));
    const normals = String(t.ref_text).split(/\s*[\/|]\s*/).map(x => x.toLowerCase());
    if (opts.some(o => o.toLowerCase() === v.toLowerCase()) && !normals.includes(v.toLowerCase())) return 'A';
  }
  return null;
}

// ================================================================ inbox
Pages['lab-inbox'] = {
  async render(view, params) {
    let tab = params.tab || 'requested';
    view.innerHTML = `<div class="pageHead"><div><h1>درخواست‌های آزمایش</h1><p>درخواست‌های داکتران با کد لابراتوار به‌صورت زنده می‌رسد. کد را از رسید/نسخه مریض وارد کنید یا روی درخواست کلیک کنید.</p></div>
      <div class="toolbar"><div class="codeEntry"><input id="lbCode" placeholder="کد لابراتوار (مثلاً 45 یا LB-00045)" style="font-size:16px;width:260px"><button class="btn primary" data-act="open">${icon('search')} باز کردن</button></div><button class="btn" data-act="walk">${icon('plus')} مریض بیرونی</button></div></div>
      <div class="tabs" id="lTabs"><button data-t="requested">جدید (منتظر پذیرش)</button><button data-t="received">در حال انجام</button><button data-t="completed">منتظر تأیید</button><button data-t="approved">تأیید شده امروز</button></div>
      <div class="inbox" id="lb"></div>`;
    const load = async () => {
      $$('#lTabs button', view).forEach(b => b.classList.toggle('on', b.dataset.t === tab));
      const q = tab === 'approved' ? { 'in.status': 'approved,delivered', 'ge.approved_at': today(), limit: 300 } : { 'eq.status': tab, order: 'id', limit: 300 };
      const rows = await API.list('lab_requests', q);
      $('#lb', view).innerHTML = rows.map(r => `<div class="rxCard ${r.status === 'requested' ? 'new' : ''}" data-id="${r.id}" style="cursor:pointer">
        <div style="min-width:110px;text-align:center"><div class="rxCode">${esc(r.lab_code)}</div><small class="muted">${fmtTime(r.created_at)} · ${fmtDate(r.date)}</small></div>
        <div class="grow"><b>${esc(r.full_name)}</b> <small class="muted">ولد ${esc(r.father_name || '—')} · ${esc(r.patient_code)} · ${esc(ageLabel(r.birth_date))} · ${sexFa(r.sex)}</small>
          <div class="mini en">${esc(r.tests || '')}</div><div class="mini">${esc(r.doctor_name || (r.source === 'walkin' ? 'مریض بیرونی' : ''))}${r.discount_pct ? ` · <b class="pos">تخفیف داکتر ${fmtNum(r.discount_pct)}٪</b>` : ''}${r.note ? ' · ' + esc(r.note) : ''}</div></div>
        ${r.urgent ? pill('عاجل', 'bad') : ''}${statusPill(LAB_STATUS, r.status)}<b class="money">${money(r.net || r.subtotal)}</b></div>`).join('') || '<div class="card empty">موردی وجود ندارد ✓</div>';
    };
    $('#lTabs', view).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; load(); } };
    view.addEventListener('click', (e) => { const c = e.target.closest('.rxCard'); if (c) openLabWork(Number(c.dataset.id)); });
    const openCode = async () => { const c = $('#lbCode', view).value.trim(); if (!c) return; const r = await API.get('/api/lab/req/' + encodeURIComponent(c)); openLabWork(r.id); };
    $('#lbCode', view).addEventListener('keydown', (e) => { if (e.key === 'Enter') openCode().catch(errToast); });
    actions(view, { open: openCode, walk: () => go('lab-walkin') });
    await load(); this._load = load;
  },
  onEvent(m) { if (m.type.startsWith('lab') && this._load) this._load(); }
};
function openLabWork(id) { go('lab-work', { id }); }

// ================================================================ work on one request: bill → results → approve
Pages['lab-work'] = {
  async render(view, params) {
    const cat = await loadLabCatalog();
    let r = await API.get('/api/lab/req/x', { id: params.id });
    const draw = () => {
      const p = r.patient; const ageDays = ageParts(p.birth_date)?.days ?? null;
      const steps = ['requested', 'received', 'completed', 'approved', 'delivered'];
      const curI = steps.indexOf(r.status);
      view.innerHTML = `<div class="pageHead"><div class="ptHead">${patientHeadHTML(p)}</div>
        <div class="toolbar"><span class="rxCode" style="font-size:18px">${esc(r.lab_code)}</span>${statusPill(LAB_STATUS, r.status)}<button class="btn" data-act="back">${icon('arrow')} بازگشت</button></div></div>
        <div class="steps" style="margin-bottom:14px">${steps.map((s, i) => `<span class="${i < curI ? 'done' : i === curI ? 'cur' : ''}">${LAB_STATUS[s][0]}</span>`).join('')}</div>
        <div class="sum" style="margin-bottom:14px"><span>داکتر: <b>${esc(r.doctor_name || (r.source === 'walkin' ? 'مریض بیرونی' : '—'))}</b></span><span>تاریخ: <b>${fmtDate(r.date)}</b></span>${r.urgent ? pill('عاجل', 'bad') : ''}${r.note ? `<span>یادداشت داکتر: ${esc(r.note)}</span>` : ''}
          <span>مبلغ: <b>${money(r.net || r.subtotal)}</b></span><span>پرداخت: <b>${money(r.paid)}</b></span>${r.net - r.paid > 0.001 && r.status !== 'requested' ? `<span class="neg">باقی: <b>${money(r.net - r.paid)}</b></span>` : ''}</div>
        <div id="workBody"></div>`;
      if (r.status === 'requested') return drawBilling(ageDays);
      drawResults(ageDays);
    };
    // ---------- billing ----------
    const central = (App.settings.cashier_mode || 'central') === 'central' && App.user.station === 'lab';
    const drawBilling = () => {
      const sel = r.items.map(i => i.test_id);
      $('#workBody', view).innerHTML = `<div class="recGrid"><div><div class="card"><h2>${icon('flask')} آزمایش‌ها</h2>
        <div class="searchBox" style="margin-bottom:10px"><input id="tq" placeholder="افزودن آزمایش: کد، نام یا نمبر…"></div><div class="selList" id="tl"></div><div id="bWarn"></div></div>
        <div class="card"><h2>${icon('list')} معلومات پذیرش</h2>${labReceptionFieldsHTML('bR', { ...r, referrer_name: r.referrer_id ? r.doctor_name : r.referrer }, cat)}</div></div>
        <div class="card"><h2>${icon('money')} فیس و رسید</h2><div class="totals"><div><span>جمع کل</span><b id="bSub"></b></div><div id="bOrgRow" class="hidden"><span>سهم مؤسسه / بیمه</span><b id="bOrg"></b></div>
          <div><span>تخفیف ٪ ${r.discount_pct ? `<small class="pos">(داکتر: ${fmtNum(r.discount_pct)}٪)</small>` : ''}</span><span class="bar"><input type="number" id="bPct" value="${r.discount_pct || 0}" style="width:70px"> <small>یا مبلغ</small> <input type="number" id="bAmt" style="width:90px"></span></div><div><span>قابل پرداخت</span><b id="bNet"></b></div></div>
          ${central ? `<div class="infoBox" style="margin-top:10px">${icon('cash', 15)} فیس در <b>صندوق پذیرش</b> گرفته می‌شود — بعد از پذیرش، بل به صندوق می‌رود.</div><input type="hidden" id="bPaid"><input type="hidden" id="bPm" value="cash">`
            : `<div class="formGrid" style="margin-top:10px"><label class="field"><span>دریافت شده</span><input type="number" id="bPaid"></label><label class="field"><span>طریقه</span><select id="bPm">${opt(Object.entries(PAY_METHODS), 'cash')}</select></label></div>`}
          <div class="stack" style="margin-top:12px"><button class="btn primary lg" data-act="receive" data-print="1" style="justify-content:center">${icon('print')} ${central ? 'پذیرش، ارسال بل به صندوق و چاپ دو رسید' : 'پذیرش، دریافت فیس و چاپ دو رسید'}</button><button class="btn" data-act="receive" style="justify-content:center">${icon('check')} پذیرش بدون چاپ</button>
          <button class="btn dangerText" data-act="cancel" style="justify-content:center">${icon('x')} لغو درخواست</button></div></div></div>`;
      const rf = bindLabReceptionFields(view, 'bR', cat, { onChange: () => calc() }); rf.touchAnswer();
      const calc = () => {
        const pc = labPriceCalc(cat, sel, rf.rtId(), $('#bPct', view).value, $('#bAmt', view).value);
        const sub = pc.sub, disc = pc.discount;
        $('#bSub', view).textContent = money(sub); $('#bNet', view).textContent = money(pc.net) + ' ' + currency();
        $('#bOrg', view).textContent = money(pc.org); $('#bOrgRow', view).classList.toggle('hidden', !pc.org);
        if (!central && !$('#bPaid', view).dataset.t) $('#bPaid', view).value = pc.net;
        rf.setAnswerDate(labAnswerDateCalc(cat, sel, rf.urgent()));
        const w = labReceptionWarnings(cat, sel, r.patient, rf.rtId());
        $('#bWarn', view).innerHTML = w.length ? `<div class="cdss">${w.map(x => `<div>⚠ ${esc(x)}</div>`).join('')}</div>` : '';
        void sub; void disc;
        $('#tl', view).innerHTML = sel.map(id => { const t = cat.byId.get(id); return `<div class="selRow"><span class="codeTag" title="${esc(t.name)}">${t.num_code || ''} ${esc(t.code)}</span><span class="nm muted small">${t.is_panel ? 'پنل' : ''}</span><b>${money(t.price)}</b><button class="btn ghost icon" data-rm="${id}">${icon('x', 14)}</button></div>`; }).join('') || '<div class="empty">آزمایشی نیست</div>';
      };
      autocomplete($('#tq', view), { fetch: async (q) => { const s = q.toLowerCase(); return cat.tests.filter(t => t.active && t.orderable && (String(t.num_code) === q || t.code.toLowerCase().includes(s) || t.name.toLowerCase().includes(s))).slice(0, 20); },
        render: (t) => `<span class="code">${t.num_code || ''} ${esc(t.code)}</span><span class="nm">${esc(t.name)}</span><span class="pr">${money(t.price)}</span>`, pick: (t) => { if (!sel.includes(t.id)) sel.push(t.id); $('#tq', view).value = ''; calc(); } });
      $('#tl', view).onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { sel.splice(sel.indexOf(Number(b.dataset.rm)), 1); calc(); } };
      $('#bPct', view).oninput = () => { $('#bAmt', view).value = ''; calc(); }; $('#bAmt', view).oninput = calc; $('#bPaid', view).oninput = (e) => e.target.dataset.t = 1;
      view._receive = (btn, print) => busy(btn, async () => {
        const pc = labPriceCalc(cat, sel, rf.rtId(), $('#bPct', view).value, $('#bAmt', view).value);
        if (!rf.discountOk(pc.discount)) throw new Error('برای تخفیف، دلیل تخفیف و نام تخفیف دهنده را بنویسید');
        if (!(await labPreSaveChecks(r.patient_id, sel, r.id))) return;
        r = await API.post('/api/lab/receive/' + r.id, { ...rf.value(), test_ids: sel, discount: $('#bAmt', view).value === '' ? undefined : $('#bAmt', view).value, discount_pct: $('#bPct', view).value, paid: central ? undefined : $('#bPaid', view).value, pay_method: $('#bPm', view).value });
        toast(central && r.net - r.paid > 0.001 ? `پذیرش شد — ${r.lab_code} · ${money(r.net - r.paid)} در صندوق پذیرش پرداخت شود` : `پذیرش شد — ${r.lab_code}`, 'good');
        if (print) await printDoc(labReceiptsHTML(r), { size: 'receipt', title: r.lab_code });
        draw();
      });
      calc();
    };
    // ---------- results ----------
    const drawResults = (ageDays) => {
      const sex = r.patient.sex; const res = new Map((r.results || []).map(x => [x.test_id, x]));
      const locked = ['approved', 'delivered'].includes(r.status);
      // one page per department (Haematology, Biochemistry, Hormones …); tests stay grouped by panel inside a page
      const pages = new Map();
      for (const t of r.tests) {
        const pk = t.page_dept || t.dept_name || 'Tests';
        if (!pages.has(pk)) pages.set(pk, { name: pk, fa: t.page_dept_fa || '', sort: t.page_sort ?? 99, groups: new Map() });
        const panel = t.panel_id ? r.items.find(i => i.test_id === t.panel_id) : null; const g = panel ? panel.name : (t.dept_name || 'Tests');
        const P = pages.get(pk); if (!P.groups.has(g)) P.groups.set(g, []); P.groups.get(g).push(t);
      }
      const plist = [...pages.values()].sort((a, b) => a.sort - b.sort);
      let cur = Math.min(view._page || 0, Math.max(0, plist.length - 1));
      const input = (t) => {
        const v = res.get(t.id)?.value ?? '';
        if (t.formula) return `<input data-tid="${t.id}" class="calc" value="${esc(v)}" readonly title="محاسبه خودکار">`;
        if (t.result_type === 'option') { const o = JSON.parse(t.options || '[]').map(x => String(x).replace(/^\s*\d+\s*=\s*/, '')); return `<select data-tid="${t.id}" class="optSel" ${locked ? 'disabled' : ''}><option value=""></option>${o.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}${v && !o.includes(v) ? `<option selected>${esc(v)}</option>` : ''}</select>`; }
        const ra = (() => { try { return JSON.parse(t.ready_answers || '[]'); } catch (_) { return []; } })();
        if (t.result_type === 'memo') return `<textarea data-tid="${t.id}" rows="2" style="direction:ltr" ${locked ? 'readonly' : ''}>${esc(v)}</textarea>`;
        return `<input data-tid="${t.id}" value="${esc(v)}" ${locked ? 'readonly' : ''} autocomplete="off" ${ra.length ? `list="ra_${t.id}"` : ''} ${t.numeric_only ? 'inputmode="decimal"' : ''}>${ra.length ? `<datalist id="ra_${t.id}">${ra.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
      };
      const hasPrev = r.tests.some(t => (r.prev || {})[t.id]?.length);
      const prevCells = (t) => hasPrev ? [0, 1, 2, 3].map(i => { const p = ((r.prev || {})[t.id] || [])[i]; return `<td class="prevC ${p && p.flag ? 'f-' + esc(p.flag) : ''}" title="${p ? esc(fmtDate(p.date) + ' · ' + p.lab_code) : ''}">${p ? esc(p.value) + (p.flag ? ` <small>${esc(p.flag)}</small>` : '') : ''}</td>`; }).join('') : '';
      const prevHead = hasPrev ? [1, 2, 3, 4].map(i => `<th class="prevC">Prev ${i}</th>`).join('') : '';
      const row = (t) => { const rg = resolveRange(t, sex, ageDays); const note = res.get(t.id)?.note || '';
        return `<tr data-row="${t.id}"><td class="nm">${esc(t.name)}${t.kit ? `<div class="mini muted">Kit: ${esc(t.kit.name)}${t.kit.lot_no ? ' · Lot ' + esc(t.kit.lot_no) : ''}${t.kit.expiry ? ' · Exp ' + esc(t.kit.expiry) : ''}</div>` : ''}${t.sendout_lab ? `<div class="mini muted">ارسالی: ${esc(t.sendout_lab)}</div>` : ''}</td><td class="val">${input(t)}</td><td><span class="flag" data-flag="${t.id}"></span></td><td>${esc(t.unit || '')}</td><td class="muted">${esc(refDisplay(t, rg))}</td>${prevCells(t)}
          <td class="c nowrap"><button type="button" class="btn ghost icon" data-trend="${t.id}" title="نمودار سابقه این آزمایش" tabindex="-1">${icon('chart', 13)}</button><button type="button" class="btn ghost icon cmtBtn ${note ? 'on' : ''}" data-cmt="${t.id}" title="نظر / توضیح برای داکتر" tabindex="-1">${icon('edit', 13)}</button></td></tr>
          <tr class="cmtRow ${note ? '' : 'hidden'}" data-cmtrow="${t.id}"><td></td><td colspan="${5 + (hasPrev ? 4 : 0)}"><input data-note="${t.id}" value="${esc(note)}" placeholder="نظر برای داکتر — زیر همین آزمایش در راپور چاپ می‌شود" style="direction:rtl" ${locked ? 'readonly' : ''}></td></tr>`; };
      const fl = { fast: 'ناشتا (Fast)', nonfast: 'غیر ناشتا' }[r.fasting]; const sf = (SAMPLE_FLAGS.find(x => x[0] === r.sample_flag) || [])[1];
      $('#workBody', view).innerHTML = `${locked ? '<div class="infoBox">نتایج تأیید شده و برای داکتر فرستاده شده است.</div>' : ''}
        <div class="sum labInfo" style="margin-bottom:10px">${r.reception ? `<span>نوع پذیرش: <b>${esc(r.reception.name)}</b></span>` : ''}${fl ? `<span><b>${fl}</b></span>` : ''}${r.urgent ? pill('عاجل', 'bad') : ''}${r.pregnant ? pill('حامله', 'violet') : ''}${sf && r.sample_flag ? pill(sf, 'warn') : ''}
          ${r.answer_date ? `<span>تاریخ جوابدهی: <b>${fmtDate(r.answer_date)}</b></span>` : ''}${r.clinical_notes ? `<span>Clinical notes: <b class="en">${esc(r.clinical_notes)}</b></span>` : ''}
          <span>پذیرش: <b>${esc(r.received_by_name || r.created_by_name || '—')}</b></span>${r.checked_by_name ? `<span>Checked by: <b>${esc(r.checked_by_name)}</b></span>` : ''}${r.approved_by_name ? `<span>تأیید: <b>${esc(r.approved_by_name)}</b></span>` : ''}${r.print_count ? `<span>چاپ: <b>${r.print_count}</b></span>` : ''}</div>
        <div class="bar" style="margin-bottom:10px;flex-wrap:wrap">${r.sampled_at ? pill('نمونه گرفته شد · ' + fmtTime(r.sampled_at), 'good') : `<button class="btn sm" data-act="sample">${icon('check', 13)} نمونه گرفته شد</button>`}<button class="btn sm" data-act="labels">${icon('barcode', 13)} چاپ لیبل تیوب‌ها</button>${locked ? '' : `<button class="btn sm" data-act="defaults">${icon('check', 13)} جواب‌های پیش‌فرض</button>`}
          <span class="grow"></span>${r.prev_id ? `<button class="btn sm" data-nav="${r.prev_id}" title="پذیرش قبلی">${icon('arrow', 13)} قبلی</button>` : ''}${r.next_id ? `<button class="btn sm" data-nav="${r.next_id}" title="پذیرش بعدی">بعدی ←</button>` : ''}</div>
        ${plist.length > 1 ? `<div class="deptTabs" id="dTabs">${plist.map((p, i) => `<button type="button" data-pg="${i}" class="${i === cur ? 'on' : ''}">${esc(p.name)}<span class="cnt" data-cnt="${i}"></span></button>`).join('')}<button type="button" data-pg="all">همه</button></div>` : ''}
        ${plist.map((p, i) => `<div class="deptPage ${i === cur || plist.length === 1 ? 'on' : ''}" data-page="${i}">${[...p.groups.entries()].map(([g, list]) => `<div class="resGroup"><div class="resGroupHead"><span>${esc(g)}</span><small class="muted">${esc(list[0]?.sample || '')}</small></div>
          <table class="res"><thead><tr><th>Test</th><th>Result</th><th>Flag</th><th>Unit</th><th>Reference</th>${prevHead}<th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`).join('')}
          ${plist.length > 1 && i < plist.length - 1 ? `<div class="mini muted" style="text-align:left">Enter در آخرین خانه ← صفحه بعد (${esc(plist[i + 1].name)})</div>` : ''}</div>`).join('')}
        <label class="field"><span>یادداشت راپور (Comment)</span><textarea id="repNote" rows="2" style="direction:ltr" ${locked ? 'readonly' : ''}>${esc(r.report_note || '')}</textarea></label>
        <div class="stickyFoot">
          ${locked ? `<button class="btn" data-act="reopen">${icon('edit')} باز کردن برای اصلاح</button>` : `<button class="btn" data-act="saveRes" data-st="">${icon('check')} ذخیره</button><button class="btn" data-act="saveRes" data-st="completed">${icon('check')} تکمیل نتایج</button><button class="btn success lg" data-act="saveRes" data-st="approved">${icon('send')} تأیید نهایی و ارسال به داکتر</button>`}
          <button class="btn primary" data-act="report">${icon('print')} چاپ راپور</button><button class="btn" data-act="receipt">${icon('receipt')} رسیدها</button>
          ${r.net - r.paid > 0.001 && !central ? `<button class="btn success" data-act="pay">${icon('money')} دریافت باقی ${money(r.net - r.paid)}</button>` : ''}${r.net - r.paid > 0.001 && central ? `<span class="pill warn">باقی ${money(r.net - r.paid)} — صندوق پذیرش</span>` : ''}
          ${r.status === 'approved' ? `<button class="btn" data-act="deliver">${icon('check')} تحویل به مریض</button>` : ''}</div>`;
      const byId = new Map(r.tests.map(t => [t.id, t]));
      const showPage = (pg) => {
        cur = pg === 'all' ? cur : Number(pg); view._page = cur;
        $$('#dTabs [data-pg]', view).forEach(b => b.classList.toggle('on', b.dataset.pg === String(pg)));
        $$('.deptPage', view).forEach(d => d.classList.toggle('on', pg === 'all' || d.dataset.page === String(pg)));
      };
      const tabs = $('#dTabs', view); if (tabs) tabs.onclick = (e) => { const b = e.target.closest('[data-pg]'); if (!b) return; showPage(b.dataset.pg); const f = $('.deptPage.on [data-tid]:not([readonly])', view); f && f.focus(); };
      const refresh = () => {
        const vals = {};
        $$('[data-tid]', view).forEach(el => { const t = byId.get(Number(el.dataset.tid)); const n = num(el.value); if (n !== null) vals[t.code.toUpperCase()] = n; });
        $$('[data-tid].calc', view).forEach(el => { const t = byId.get(Number(el.dataset.tid)); const v = evalFormula(t.formula, vals, { age: (ageDays || 0) / 365.25, female: sex === 'F' ? 1 : 0 }); el.value = v === null ? '' : fmtNum(v, t.decimals ?? 2); if (v !== null) vals[t.code.toUpperCase()] = v; });
        $$('[data-tid]', view).forEach(el => { const t = byId.get(Number(el.dataset.tid)); const f = computeFlag(t, el.value, resolveRange(t, sex, ageDays)); const fl = $(`[data-flag="${t.id}"]`, view); fl.textContent = f || ''; fl.className = 'flag ' + (f || ''); el.closest('tr').classList.toggle('abn', !!f); el.closest('tr').classList.toggle('crit', f === 'HH' || f === 'LL');
          const al = alarmOf(t, el.value, resolveRange(t, sex, ageDays)); el.classList.toggle('impossible', al === 'impossible'); el.closest('tr').classList.toggle('alarm', al === 'alarm'); el.title = al === 'impossible' ? 'این مقدار ممکن نیست — دوباره بررسی کنید' : al === 'alarm' ? 'در محدوده خطر' : ''; });
        $$('.deptPage', view).forEach(d => { const ins = $$('[data-tid]', d); const filled = ins.filter(x => String(x.value).trim()).length; const c = $(`[data-cnt="${d.dataset.page}"]`, view); if (c) { c.textContent = `${filled}/${ins.length}`; c.parentElement.classList.toggle('done', ins.length > 0 && filled === ins.length); } });
      };
      $('#workBody', view).addEventListener('input', refresh); $('#workBody', view).addEventListener('change', refresh);
      $('#workBody', view).addEventListener('click', (e) => {
        const nv = e.target.closest('[data-nav]'); if (nv) { go('lab-work', { id: Number(nv.dataset.nav) }); return; }
        const tg = e.target.closest('[data-trend]'); if (tg) { labTrendDialog(r.patient, byId.get(Number(tg.dataset.trend)), sex, ageDays).catch(errToast); return; }
        const b = e.target.closest('[data-cmt]'); if (!b) return; const tr = $(`[data-cmtrow="${b.dataset.cmt}"]`, view); tr.classList.toggle('hidden'); if (!tr.classList.contains('hidden')) $('input', tr).focus(); });
      $('#workBody', view).addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.target.matches('input[data-tid], select[data-tid], input[data-note]')) return;
        e.preventDefault();
        const page = e.target.closest('.deptPage');
        const inPage = $$('[data-tid]:not([readonly]):not([disabled])', page);
        const from = e.target.matches('[data-note]') ? $(`[data-tid="${e.target.dataset.note}"]`, view) : e.target;
        const i = inPage.indexOf(from);
        if (i >= 0 && i < inPage.length - 1) return inPage[i + 1].focus();
        const pi = Number(page.dataset.page);
        if (plist.length > 1 && pi < plist.length - 1 && !$('#dTabs [data-pg="all"].on', view)) { showPage(pi + 1); const f = $(`.deptPage[data-page="${pi + 1}"] [data-tid]:not([readonly]):not([disabled])`, view); if (f) f.focus(); return; }
        const all = $$('[data-tid]:not([readonly]):not([disabled])', view); const k = all.indexOf(from);
        if (k >= 0 && k < all.length - 1) all[k + 1].focus(); else $('#repNote', view).focus();
      });
      refresh();
      view._collect = () => $$('[data-tid]', view).map(el => { const t = byId.get(Number(el.dataset.tid)); const rg = resolveRange(t, sex, ageDays); return { test_id: t.id, value: el.value, flag: computeFlag(t, el.value, rg), unit: t.unit, ref: refDisplay(t, rg), note: $(`[data-note="${t.id}"]`, view)?.value || '' }; });
      setTimeout(() => $('.deptPage.on [data-tid]:not([readonly])', view)?.focus(), 50);
    };
    actions(view, {
      back: () => go('lab-inbox'), receive: (b) => view._receive(b, !!b.dataset.print),
      cancel: async () => { const why = await promptDlg('لغو درخواست آزمایش', { label: 'دلیل' }); if (why !== null) { await API.post('/api/lab/cancel/' + r.id, { reason: why }); toast('لغو شد'); go('lab-inbox'); } },
      saveRes: (b) => busy(b, async () => {
        if (b.dataset.st === 'approved' && !(await confirmDlg('نتایج تأیید و برای داکتر فرستاده شود؟'))) return;
        r = await API.post('/api/lab/results/' + r.id, { results: view._collect(), status: b.dataset.st || undefined, report_note: $('#repNote', view).value });
        toast(b.dataset.st === 'approved' ? 'تأیید شد و برای داکتر فرستاده شد' : 'ذخیره شد', 'good'); draw();
      }),
      reopen: async () => { r = await API.post('/api/lab/results/' + r.id, { results: [], status: 'received' }); draw(); },
      report: async () => { if (!['approved', 'delivered'].includes(r.status)) { r = await API.post('/api/lab/results/' + r.id, { results: view._collect(), report_note: $('#repNote', view).value }); } previewDoc(labReportHTML(r), { size: 'A4', title: r.lab_code, onPrinted: () => API.post('/api/lab/printed/' + r.id).catch(() => { }) }); },
      receipt: () => previewDoc(labReceiptsHTML(r), { size: 'receipt', title: r.lab_code }),
      defaults: () => { let k = 0; $$('[data-tid]', view).forEach(el => { const t = r.tests.find(x => x.id === Number(el.dataset.tid)); if (t && t.default_answer && !String(el.value).trim() && !el.readOnly) { el.value = t.default_answer; k++; } }); $('#workBody', view).dispatchEvent(new Event('input')); toast(k ? `${k} جواب پیش‌فرض نوشته شد` : 'آزمایشی با جواب پیش‌فرض خالی نمانده'); },
      sample: async () => {
        // keep what was typed: save the draft results before redrawing
        if (view._collect && !['approved', 'delivered'].includes(r.status)) await API.post('/api/lab/results/' + r.id, { results: view._collect(), report_note: $('#repNote', view)?.value });
        r = await API.post('/api/lab/sample/' + r.id); toast('زمان گرفتن نمونه ثبت شد', 'good'); draw();
        if (await confirmDlg('لیبل تیوب‌ها چاپ شود؟')) printDoc(tubeLabelsHTML(r), { size: 'label', title: r.lab_code });
      },
      labels: () => previewDoc(tubeLabelsHTML(r), { size: 'label', title: r.lab_code }),
      pay: async () => { const a = await promptDlg('دریافت باقی', { label: 'مبلغ', value: r.net - r.paid, type: 'number' }); if (a) { r = await API.post('/api/lab/pay/' + r.id, { amount: Number(a) }); draw(); } },
      deliver: async () => { r = await API.post('/api/lab/results/' + r.id, { results: [], status: 'delivered' }); draw(); }
    });
    draw();
  }
};

// ================================================================ walk-in patient (no doctor request)
Pages['lab-walkin'] = {
  async render(view, params) {
    const cat = await loadLabCatalog(true);
    const sel = []; let dep = 'all';
    const orderable = cat.tests.filter(t => t.active && (t.orderable || t.is_panel));
    const deps = cat.departments.filter(d => orderable.some(t => t.department_id === d.id));
    view.innerHTML = `<div class="pageHead"><div><h1>پذیرش مریض بیرونی</h1><p>برای مریضی که نسخه داکتر کلینیک ندارد (یا از بیرون آمده). کد لابراتوار ساخته می‌شود.</p></div></div>
      <div class="recGrid"><div class="card"><h2>${icon('user')} مریض</h2>${ptPickerHTML('wPt')}
        <div class="secTitle" style="margin-top:12px">${icon('steth', 15)} داکتر کلینیک (اگر از کلینیک فرستاده شده)</div>${doctorPickerHTML('wDr', { placeholder: 'بیرونی / بدون داکتر' })}
        <div class="secTitle" style="margin-top:12px">${icon('flask', 15)} معلومات پذیرش</div>${labReceptionFieldsHTML('wR', {}, cat)}</div>
      <div class="card"><h2>${icon('flask')} آزمایش‌ها <small class="muted">— مخفف آزمایش؛ موس را نگه دارید تا نام کامل دیده شود</small></h2><div class="searchBox"><input id="wt" placeholder="مخفف، نام یا نمبر آزمایش… (Enter = افزودن)" autocomplete="off"></div>
        <div class="pickWrap" data-fold="walkin"><button type="button" class="btn sm ghost foldBtn" data-foldbtn="walkin">${icon('list', 13)} <span class="fShow">نمایش دکمه‌های آزمایش</span><span class="fHide">پنهان کردن دکمه‌ها</span></button><div class="pickBody">
        <div class="deptTabs" id="wDeps" style="position:static;margin-top:10px"><button data-dep="all" class="on">همه</button>${deps.map(d => `<button data-dep="${d.id}" title="${esc(d.name_fa || '')}">${esc(d.name || d.code)}</button>`).join('')}</div>
        <div class="testChips" id="wChips"></div></div></div>
        <div class="selList" id="wl" style="margin-top:10px"></div><div id="wWarn"></div><div class="totals"><div><span>جمع</span><b id="wsum">0</b></div><div><span>سهم مریض</span><b id="wnet">0</b></div></div>
        <button class="btn primary lg" data-act="create" style="margin-top:12px">${icon('next')} ثبت و رفتن به پذیرش و فیس</button></div></div>`;
    let calcFn = null;
    const pt = bindPtPicker(view, 'wPt', { onPick: () => calcFn && calcFn() }); const dr = bindDoctorPicker(view, 'wDr', { selected: '' });
    const rf = bindLabReceptionFields(view, 'wR', cat, { onChange: () => calcFn && calcFn() }); rf.touchAnswer();
    const chips = () => {
      const q = $('#wt', view).value.trim().toLowerCase();
      $('#wChips', view).innerHTML = orderable.filter(t => (dep === 'all' || t.department_id === Number(dep)) && (!q || t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || String(t.num_code) === q))
        .map(t => `<button type="button" class="chip ${sel.includes(t.id) ? 'on' : ''}" data-tid="${t.id}" title="${esc(t.name)} — ${money(t.price)}">${esc(t.code)}</button>`).join('') || '<span class="muted">آزمایشی پیدا نشد</span>';
    };
    const drawSel = calcFn = () => {
      $('#wl', view).innerHTML = sel.map(id => { const t = cat.byId.get(id); return `<div class="selRow"><span class="codeTag" title="${esc(t.name)}">${esc(t.code)}</span><span class="nm muted small">${t.is_panel ? 'پنل' : ''}${t.sendout_lab ? ' · ارسالی' : ''}</span><b>${money(t.price)}</b><button class="btn ghost icon" data-rm="${id}">${icon('x', 14)}</button></div>`; }).join('');
      const pc = labPriceCalc(cat, sel, rf.rtId()); $('#wsum', view).textContent = money(pc.sub); $('#wnet', view).textContent = money(pc.net);
      rf.setAnswerDate(sel.length ? labAnswerDateCalc(cat, sel, rf.urgent()) : '');
      const w = labReceptionWarnings(cat, sel, { sex: pt.patient ? pt.patient.sex : $('#wPt [name=sex]', view).value }, rf.rtId());
      $('#wWarn', view).innerHTML = w.length ? `<div class="cdss">${w.map(x => `<div>⚠ ${esc(x)}</div>`).join('')}</div>` : '';
      chips();
    };
    const toggle = (id) => { const i = sel.indexOf(id); i >= 0 ? sel.splice(i, 1) : sel.push(id); drawSel(); };
    if (params.patient_id) pt.set(await API.one('patients', params.patient_id));
    $('#wDeps', view).onclick = (e) => { const b = e.target.closest('[data-dep]'); if (!b) return; dep = b.dataset.dep; $$('#wDeps button', view).forEach(x => x.classList.toggle('on', x === b)); chips(); };
    $('#wt', view).addEventListener('input', chips);
    $('#wt', view).addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const q = e.target.value.trim().toLowerCase(); const t = orderable.find(x => x.code.toLowerCase() === q || String(x.num_code) === q) || orderable.find(x => x.code.toLowerCase().startsWith(q)); if (t) { if (!sel.includes(t.id)) toggle(t.id); e.target.value = ''; chips(); } });
    view.addEventListener('click', (e) => { const c = e.target.closest('#wChips [data-tid]'); if (c) toggle(Number(c.dataset.tid)); const rm = e.target.closest('[data-rm]'); if (rm) toggle(Number(rm.dataset.rm)); });
    actions(view, {
      create: (b) => busy(b, async () => {
        const who = pt.value(); if (!sel.length) throw new Error('آزمایش انتخاب نشده');
        if (!(await labPreSaveChecks(who.patient_id, sel, null, who.patient))) return;
        const r = await API.post('/api/lab/walkin', { ...who, ...rf.value(), test_ids: sel, doctor_id: dr.get() || null });
        openLabWork(r.id);
      })
    });
    drawSel();
  }
};

// ================================================================ list
Pages['lab-list'] = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>آزمایش‌ها و نتایج</h1><p>همه درخواست‌ها و نتایج با کد لابراتوار.</p></div><div class="toolbar"><button class="btn" data-act="csv">${icon('download')} CSV</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', isoDate(addDays(new Date(), -7)), 'id="l_from"')}</label><label class="field"><span>تا</span>${dateInput('to', today(), 'id="l_to"')}</label>
      <label class="field"><span>وضعیت</span><select id="l_st">${opt(Object.entries(LAB_STATUS).map(([k, v]) => [k, v[0]]), '', { empty: 'همه' })}</select></label><label class="field grow"><span>جستجو</span><input id="l_q"></label></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>کد</th><th>تاریخ</th><th>مریض</th><th>داکتر</th><th>آزمایش‌ها</th><th>مبلغ</th><th>پرداخت</th><th>وضعیت</th></tr></thead><tbody id="lB"></tbody></table></div><div class="sum" id="lS"></div></div>`;
    let rows = [];
    const load = async () => {
      const q = { from: dateOf($('#l_from', view)), to: dateOf($('#l_to', view)), q: $('#l_q', view).value.trim(), limit: 5000 }; if ($('#l_st', view).value) q['eq.status'] = $('#l_st', view).value;
      rows = await API.list('lab_requests', q);
      $('#lB', view).innerHTML = rows.map(r => `<tr class="clickable" data-id="${r.id}"><td class="rxCode" style="font-size:13px">${esc(r.lab_code)}</td><td>${fmtDate(r.date)}</td><td><b>${esc(r.full_name)}</b> <small class="muted">${esc(r.patient_code)}</small></td><td>${esc(r.doctor_name || '—')}</td><td class="en small">${esc(r.tests || '')}</td><td>${money(r.net || r.subtotal)}</td><td>${money(r.paid)}</td><td>${statusPill(LAB_STATUS, r.status)}</td></tr>`).join('') || emptyRow(8);
      const act = rows.filter(r => !['requested', 'cancelled'].includes(r.status));
      $('#lS', view).innerHTML = `<span>تعداد: <b>${rows.length}</b></span><span>پذیرش شده: <b>${act.length}</b></span><span>مبلغ: <b>${money(sumBy(act, 'net'))}</b></span><span>دریافت: <b>${money(sumBy(act, 'paid'))}</b></span>`;
    };
    $$('#l_from, #l_to, #l_st', view).forEach(el => el.addEventListener('change', load)); $('#l_q', view).addEventListener('input', debounce(load, 300));
    view.addEventListener('click', (e) => { const tr = e.target.closest('tr.clickable'); if (tr) openLabWork(Number(tr.dataset.id)); });
    actions(view, { csv: () => exportCSV('lab-requests', rows, [['lab_code', 'کد'], ['date', 'تاریخ'], ['patient_code', 'کد مریض'], ['full_name', 'نام'], ['doctor_name', 'داکتر'], ['tests', 'آزمایش‌ها'], ['net', 'مبلغ'], ['paid', 'پرداخت'], [r => LAB_STATUS[r.status]?.[0], 'وضعیت']]) });
    await load();
  }
};

// ================================================================ catalog & prices
const AGE_UNITS = [['d', 'روز', 1], ['m', 'ماه', 30.4375], ['y', 'سال', 365.25]];
function daysToAge(d) {
  if (d === null || d === undefined || d === '') return ['', 'y'];
  d = Number(d); if (!d) return [0, 'd'];
  if (d % 365.25 < 1 || d % 365 === 0) return [Math.round(d / 365.25), 'y'];
  if (d >= 28 && (d / 30.4375) % 1 < 0.05) return [Math.round(d / 30.4375), 'm'];
  return [d, 'd'];
}
const ageToDays = (v, u) => v === '' || v === null || v === undefined ? null : Math.round(Number(v) * (AGE_UNITS.find(x => x[0] === u) || AGE_UNITS[2])[2]);
Pages['lab-tests'] = {
  async render(view) {
    const cat = await loadLabCatalog(true);
    let dep = cat.departments[0]?.id;
    const partOf = () => { const m = new Map(); cat.panel_items.forEach(p => { if (!m.has(p.test_id)) m.set(p.test_id, []); m.get(p.test_id).push(p.panel_id); }); return m; };
    let parents = partOf();
    view.innerHTML = `<div class="pageHead"><div><h1>لیست آزمایش‌ها و قیمت</h1><p>قیمت را مستقیم در جدول تغییر دهید. آزمایشی که «فعال» نباشد (مثلاً GFR یا Diff تکراری داخل CBC) در درخواست و نتایج دیده نمی‌شود. ${cat.tests.length} آزمایش و پنل.</p></div><div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} آزمایش جدید</button></div></div>
      <div class="split"><div class="card" style="padding:8px"><div class="deptList" id="dl"></div></div>
      <div class="card"><div class="filterBar"><label class="field grow"><span>جستجو در همه</span><input id="tq"></label><label class="field"><span>نمایش</span><select id="tShow">${opt([['all', 'همه (با اجزای پنل)'], ['main', 'فقط آزمایش‌ها و پنل‌ها'], ['inactive', 'فقط غیرفعال']], 'all')}</select></label></div>
      <div class="tableWrap"><table class="t"><thead><tr><th>نمبر</th><th>کد</th><th>نام</th><th>نوع</th><th>نمونه</th><th>واحد</th><th>محدوده نارمل</th><th>قیمت</th><th>فعال</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div></div>`;
    const drawDeps = () => { $('#dl', view).innerHTML = cat.departments.map(d => `<button class="${d.id === dep ? 'on' : ''}" data-dep="${d.id}">${esc(d.name_fa || d.name)} <small>${cat.tests.filter(t => t.department_id === d.id).length}</small></button>`).join(''); };
    const rangeText = (t) => { const rs = cat.ranges.get(t.id) || []; if (rs.length) { const r0 = rs.find(r => r.sex === 'A' && r.age_min_days == null && r.age_max_days == null) || rs[0]; return `${refDisplay(t, { low: r0.low, high: r0.high, text: r0.text })}${rs.length > 1 ? ` <small class="pill">+${rs.length - 1}</small>` : ''}`; } return esc(t.ref_text || (t.ref_low != null || t.ref_high != null ? `${t.ref_low ?? ''} - ${t.ref_high ?? ''}` : '')); };
    const drawTests = () => {
      const q = $('#tq', view).value.trim().toLowerCase(), show = $('#tShow', view).value;
      const list = cat.tests.filter(t => q ? (t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || String(t.num_code) === q) : t.department_id === dep)
        .filter(t => show === 'all' || (show === 'main' ? (t.orderable || t.is_panel) : !t.active));
      $('#tb', view).innerHTML = list.map(t => { const par = (parents.get(t.id) || []).map(id => cat.byId.get(id)?.code).filter(Boolean);
        return `<tr class="${t.active ? '' : 'muted'}"><td class="codeTag">${t.num_code || ''}</td><td class="codeTag">${esc(t.code)}</td><td class="en"><b>${esc(t.name)}</b>${t.formula ? ' <small class="pill">فرمول</small>' : ''}</td>
        <td class="small">${t.is_panel ? `<span class="pill info">پنل · ${(cat.components.get(t.id) || []).length}</span>` : par.length ? `<span class="pill">جزء ${esc(par.join('، '))}</span>` : 'آزمایش'}</td><td class="small en">${esc(t.sample || '')}</td><td class="en">${esc(t.unit || '')}</td><td class="en small">${rangeText(t)}</td>
        <td>${t.orderable || t.is_panel ? `<input class="priceInput" type="number" data-price="${t.id}" value="${t.price}">` : '<small class="muted">—</small>'}</td><td><input type="checkbox" data-active="${t.id}" ${t.active ? 'checked' : ''}></td><td><button class="btn sm" data-act="edit" data-id="${t.id}">${icon('edit', 14)}</button></td></tr>`; }).join('') || emptyRow(10);
    };
    $('#dl', view).onclick = (e) => { const b = e.target.closest('[data-dep]'); if (b) { dep = Number(b.dataset.dep); $('#tq', view).value = ''; drawDeps(); drawTests(); } };
    $('#tq', view).addEventListener('input', debounce(drawTests, 200)); $('#tShow', view).addEventListener('change', drawTests);
    $('#tb', view).addEventListener('change', async (e) => {
      const p = e.target.dataset.price, a = e.target.dataset.active;
      try {
        if (p) { await API.post('/api/lab/test/save', { id: Number(p), price: e.target.value }); cat.byId.get(Number(p)).price = Number(e.target.value); e.target.classList.add('changed'); toast('قیمت ذخیره شد', 'good'); }
        if (a) { await API.post('/api/lab/test/save', { id: Number(a), active: e.target.checked }); cat.byId.get(Number(a)).active = e.target.checked ? 1 : 0; toast(e.target.checked ? 'فعال شد' : 'غیرفعال شد — در درخواست و نتایج دیده نمی‌شود', 'good'); drawTests(); }
      } catch (err) { errToast(err); }
    });
    const edit = async (t) => {
      t = t || { result_type: 'numeric', active: 1, orderable: 1, department_id: dep, price: 0 };
      const items = await API.list('lab_items', { limit: 1000 }).catch(() => []);
      const ranges = (cat.ranges.get(t.id) || []).map(r => ({ ...r }));
      const comps = [...(cat.components.get(t.id) || [])];
      const mats = (cat.test_items || []).filter(x => x.test_id === t.id).map(x => ({ item_id: x.item_id, qty: x.qty }));
      let kits = (cat.kits || []).filter(k => k.test_id === t.id);
      let kitSel = t.active_kit_id || (kits.find(k => ranges.some(r => r.kit_id === k.id)) || {}).id || 0;      // 0 = general ranges (no kit)
      const ready = (() => { try { return JSON.parse(t.ready_answers || '[]'); } catch (_) { return []; } })();
      const wd = String(t.weekdays || '');
      const WDO = [6, 0, 1, 2, 3, 4, 5];
      const m = modal({ title: t.id ? 'ویرایش آزمایش ' + esc(t.code) : 'آزمایش جدید', size: 'xwide', body: `
        <div class="tabs" id="ltT"><button class="on" data-t="main">مشخصات</button><button data-t="ranges">محدوده نارمل و کیت</button><button data-t="ready">جواب‌های آماده</button><button data-t="more">نمونه، ارسال، نرخ و روزها</button><button data-t="panel">اجزای پنل</button><button data-t="mats">مواد مصرفی</button></div>
        <div data-p="main"><div class="formGrid" id="ltF">
        <label class="field"><span>کد (نام اختصاری) <em>*</em></span><input name="code" class="ltr" value="${esc(t.code || '')}"></label><label class="field span2"><span>نام کامل <em>*</em></span><input name="name" class="en" value="${esc(t.name || '')}"></label>
        <label class="field"><span>نمبر (کد آزمایش)</span><input name="num_code" type="number" value="${esc(t.num_code || '')}"></label><label class="field"><span>نام فارسی</span><input name="name_fa" value="${esc(t.name_fa || '')}"></label>
        <label class="field"><span>نام روی راپور (اختیاری)</span><input name="report_name" class="en" value="${esc(t.report_name || '')}" placeholder="مثلاً W.B.C."></label>
        <label class="field"><span>بخش</span><select name="department_id">${opt(cat.departments.map(d => [d.id, d.name_fa || d.name]), t.department_id)}</select></label>
        <label class="field"><span>ترتیب در راپور</span><input name="sort" type="number" value="${esc(t.sort ?? 0)}"></label>
        <label class="field"><span>نوع نتیجه</span><select name="result_type">${opt([['numeric', 'عددی'], ['option', 'انتخابی (کیفی)'], ['text', 'متن'], ['memo', 'متن طولانی']], t.result_type)}</select></label>
        <label class="field"><span>واحد</span><input name="unit" class="en" value="${esc(t.unit || '')}" list="ltUnits"></label><label class="field"><span>اعشار</span><input name="decimals" type="number" value="${esc(t.decimals ?? '')}"></label>
        <label class="field"><span>نارمل پایین (عمومی)</span><input name="ref_low" type="number" step="any" value="${esc(t.ref_low ?? '')}"></label><label class="field"><span>نارمل بالا (عمومی)</span><input name="ref_high" type="number" step="any" value="${esc(t.ref_high ?? '')}"></label>
        <label class="field span2"><span>نارمل (متن، مثلاً Negative یا Up to 6)</span><input name="ref_text" class="en" value="${esc(t.ref_text || '')}"></label>
        <label class="field"><span>بحرانی پایین (عمومی)</span><input name="critical_low" type="number" step="any" value="${esc(t.critical_low ?? '')}"></label><label class="field"><span>بحرانی بالا (عمومی)</span><input name="critical_high" type="number" step="any" value="${esc(t.critical_high ?? '')}"></label>
        <label class="field"><span>کمترین مقدار ممکن</span><input name="possible_low" type="number" step="any" value="${esc(t.possible_low ?? '')}"></label><label class="field"><span>بیشترین مقدار ممکن</span><input name="possible_high" type="number" step="any" value="${esc(t.possible_high ?? '')}"></label>
        <label class="field span2"><span>گزینه‌ها (برای انتخابی، با کامه)</span><input id="ltOpts" class="en" value="${esc(JSON.parse(t.options || '[]').join(', '))}"></label>
        <label class="field span2"><span>فرمول (مثلاً {TCHOL}-{HDL}-{TG}/5)</span><input name="formula" class="ltr" value="${esc(t.formula || '')}"></label>
        <label class="field"><span>قیمت (نرخ آزاد)</span><input name="price" type="number" value="${esc(t.price)}"></label><label class="field"><span>نرخ بیمه</span><input name="price_ins" type="number" value="${esc(t.price_ins ?? '')}" placeholder="مثل نرخ آزاد"></label>
        <label class="field"><span>قیمت تمام شد</span><input name="cost" type="number" value="${esc(t.cost || 0)}"></label>
        <label class="field span2"><span>شرح / توضیح آزمایش</span><input name="description" value="${esc(t.description || '')}"></label>
        <label class="check"><input type="checkbox" name="orderable" ${t.orderable ? 'checked' : ''}> قابل درخواست جداگانه</label><label class="check"><input type="checkbox" name="is_panel" id="ltPanel" ${t.is_panel ? 'checked' : ''}> پنل (چند آزمایش)</label>
        <label class="check"><input type="checkbox" name="numeric_only" ${t.numeric_only ? 'checked' : ''}> فقط عدد قبول شود</label><label class="check"><input type="checkbox" name="critical_report" ${t.critical_report ? 'checked' : ''}> گزارش بحرانی (اطلاع فوری به داکتر)</label>
        <label class="check"><input type="checkbox" name="side_column" ${t.side_column ? 'checked' : ''}> در ستون کنار راپور (مثل Differential)</label><label class="check"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> فعال</label></div></div>
        <div data-p="ranges" class="hidden">
          <div class="bar" style="flex-wrap:wrap;margin-bottom:8px"><label class="field" style="min-width:260px"><span>کیت (ری‌ایجنت)</span><select id="ltKit"></select></label>
            <button type="button" class="btn sm" id="ltKitNew">${icon('plus', 13)} کیت جدید</button><button type="button" class="btn sm" id="ltKitEdit">${icon('edit', 13)} ویرایش کیت</button><button type="button" class="btn sm success" id="ltKitAct">${icon('check', 13)} کیت فعال</button><button type="button" class="btn sm dangerText" id="ltKitDel">${icon('trash', 13)}</button></div>
          <div class="mini" id="ltKitInfo" style="margin-bottom:6px"></div>
          <div class="tableWrap"><table class="t rangeGrid wideRange" id="ltR"><thead><tr><th rowspan="2">جنس</th><th rowspan="2">از سن</th><th rowspan="2">تا سن</th><th colspan="2">محدوده نارمل</th><th colspan="2">محدوده خطر</th><th colspan="2">محدوده بحران</th><th colspan="2">محدوده ممکن</th><th rowspan="2">نارمل متنی</th><th rowspan="2"></th></tr>
            <tr><th>حداقل</th><th>حداکثر</th><th>حداقل</th><th>حداکثر</th><th>حداقل</th><th>حداکثر</th><th>حداقل</th><th>حداکثر</th></tr></thead><tbody></tbody></table></div>
          <button type="button" class="btn sm" id="ltRadd" style="margin-top:6px">${icon('plus', 13)} سطر محدوده</button>
          ${t.id ? `<div class="card" style="margin-top:12px"><b>اعمال محدوده‌های فعلی روی جواب‌های ثبت شده</b><div class="bar" style="margin-top:6px;flex-wrap:wrap"><span>از</span>${dateInput('ap_from', today(), 'id="apFrom" style="width:120px"')}<span>تا</span>${dateInput('ap_to', today(), 'id="apTo" style="width:120px"')}
            <select id="apBasis" style="width:auto">${opt([['reception', 'بر اساس تاریخ پذیرش'], ['answer', 'بر اساس تاریخ جوابدهی']], 'reception')}</select><button type="button" class="btn sm" id="apGo">اعمال</button></div><div class="mini muted">اول تغییرات را ذخیره کنید؛ بعد H / L و نارمل جواب‌های این بازه دوباره حساب می‌شود.</div></div>` : ''}</div>
        <div data-p="ready" class="hidden"><div class="formGrid"><label class="field span2"><span>جواب پیش‌فرض (با دکمه «جواب‌های پیش‌فرض» نوشته می‌شود)</span><input id="ltDef" class="en" value="${esc(t.default_answer || '')}"></label>
          <label class="field full"><span>جواب‌های آماده (هر سطر یکی — هنگام نوشتن نتیجه پیشنهاد می‌شود)</span><textarea id="ltReady" rows="8" class="en">${esc(ready.join('\n'))}</textarea></label></div></div>
        <div data-p="more" class="hidden"><div class="formGrid">
          <label class="field"><span>نمونه</span><input id="ltSample" class="en" value="${esc(t.sample || '')}" list="ltSamples"></label><label class="field"><span>مقدار نمونه</span><input id="ltSamAmt" value="${esc(t.sample_amount || '')}" placeholder="مثلاً 2 ml"></label>
          <label class="field"><span>لوله اصلی</span><input id="ltTube" value="${esc(t.tube || '')}" list="ltTubes"></label><label class="field"><span>لوله تفکیکی</span><input id="ltTubeSep" value="${esc(t.tube_sep || '')}" list="ltTubes"></label>
          <label class="field"><span>مدت جوابدهی (روز)</span><input id="ltTat" type="number" step="0.5" value="${esc(t.tat_days ?? '')}"></label>
          <label class="field"><span>فقط برای</span><select id="ltSex">${opt([['', 'همه'], ['F', 'خانم‌ها'], ['M', 'آقایان']], t.sex_only || '')}</select></label>
          <div class="field span2"><span>روزهای انجام آزمایش <small class="muted">(خالی = همه روزها)</small></span><div class="chips" id="ltWd">${WDO.map(d => `<button type="button" class="chip ${wd.includes(String(d)) ? 'on' : ''}" data-wd="${d}">${WEEKDAYS[d]}</button>`).join('')}</div></div>
          <label class="field"><span>کد LOINC</span><input id="ltLoinc" class="ltr" value="${esc(t.loinc || '')}"></label><label class="field"><span>کد دستگاه (کد مجازی)</span><input id="ltMach" class="ltr" value="${esc(t.machine_code || '')}"></label>
          <label class="field"><span>لابراتوار ارسالی (Send-out)</span><input id="ltSend" value="${esc(t.sendout_lab || '')}" placeholder="خالی = در همین لابراتوار"></label><label class="field"><span>نرخ ارسال</span><input id="ltSendC" type="number" value="${esc(t.sendout_cost ?? '')}"></label></div></div>
        <div data-p="panel" class="hidden"><div id="ltCompBox"><label class="check"><input type="checkbox" id="ltPanel2" ${t.is_panel ? 'checked' : ''}> این آزمایش پنل است</label><input id="ltCq" placeholder="جستجو…" style="margin:6px 0"><div class="compList" id="ltComp"></div></div></div>
        <div data-p="mats" class="hidden"><div class="mini" style="margin-bottom:6px">هنگام ثبت آزمایش خودکار از موجودی مواد لابراتوار کم می‌شود.</div>
          <table class="t" id="ltM"><thead><tr><th>مواد</th><th>مقدار</th><th></th></tr></thead><tbody></tbody></table><button type="button" class="btn sm" id="ltMadd" style="margin-top:6px" ${items.length ? '' : 'disabled title="اول در صفحه موجودی مواد لابراتوار مواد اضافه کنید"'}>${icon('plus', 13)} مواد</button></div>
        ${datalist('ltUnits', listSetting('lab_units'))}${datalist('ltSamples', ['Blood', 'Serum', 'Plasma', 'EDTA Blood', 'Whole Blood (EDTA)', 'Citrate Blood', 'Urine', 'Urine (Random)', 'Stool', 'CSF', 'Swab', 'Semen', 'Sputum'])}${datalist('ltTubes', ['EDTA (بنفش)', 'Citrate (آبی)', 'Clot / Gel (زرد / سرخ)', 'Heparin (سبز)', 'Fluoride (خاکستری)', 'ظرف ادرار', 'ظرف مدفوع'])}`,
        foot: `<button class="btn primary" id="lt_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
      $('#ltT', m.el).onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; $$('#ltT button', m.el).forEach(x => x.classList.toggle('on', x === b)); $$('[data-p]', m.el).forEach(p => p.classList.toggle('hidden', p.dataset.p !== b.dataset.t)); };
      $('#ltWd', m.el).onclick = (e) => { const b = e.target.closest('[data-wd]'); if (b) b.classList.toggle('on'); };
      // ---- kits & ranges
      const kitLabel = (k) => `${k.name}${k.lot_no ? ' · Lot ' + k.lot_no : ''}${k.active ? ' (فعال)' : ''}`;
      const drawKits = () => {
        $('#ltKit', m.el).innerHTML = `<option value="0">محدوده عمومی (بدون کیت)</option>` + kits.map(k => `<option value="${k.id}" ${k.id === kitSel ? 'selected' : ''}>${esc(kitLabel(k))}</option>`).join('');
        const k = kits.find(x => x.id === kitSel);
        $('#ltKitInfo', m.el).innerHTML = k ? `کیت: <b>${esc(k.name)}</b>${k.company ? ' · ' + esc(k.company) : ''} · Lot No: <b class="ltr">${esc(k.lot_no || '—')}</b> · تاریخ انقضا: <b class="${k.expiry && k.expiry < today() ? 'neg' : ''}">${esc(k.expiry || '—')}</b> · Method: <b>${esc(k.method || '—')}</b> ${k.active ? pill('فعال', 'good') : ''}` : '<span class="muted">محدوده‌های عمومی وقتی استفاده می‌شوند که کیت فعال محدوده جدا نداشته باشد.</span>';
        ['#ltKitEdit', '#ltKitAct', '#ltKitDel'].forEach(id => { $(id, m.el).disabled = !k; });
      };
      const R = () => ranges.filter(r => (r.kit_id || 0) === kitSel);
      const drawR = () => { $('#ltR tbody', m.el).innerHTML = R().map((r) => { const i = ranges.indexOf(r); const [a1, u1] = daysToAge(r.age_min_days), [a2, u2] = daysToAge(r.age_max_days); const un = (u) => opt(AGE_UNITS.map(x => [x[0], x[1]]), u); const nb = (k) => `<td><input data-k="${k}" type="number" step="any" value="${esc(r[k] ?? '')}"></td>`;
        return `<tr data-ri="${i}"><td><select data-k="sex">${opt([['A', 'همه'], ['M', 'مرد'], ['F', 'زن']], r.sex || 'A')}</select></td><td class="nowrap"><input data-k="a1" type="number" step="any" value="${esc(a1)}"><select data-k="u1">${un(u1)}</select></td><td class="nowrap"><input data-k="a2" type="number" step="any" value="${esc(a2)}"><select data-k="u2">${un(u2)}</select></td>
          ${['low', 'high', 'alarm_low', 'alarm_high', 'crit_low', 'crit_high', 'min_valid', 'max_valid'].map(nb).join('')}<td><input data-k="text" class="en" value="${esc(r.text || '')}"></td><td><button type="button" class="btn ghost icon" data-rr="${i}">${icon('x', 13)}</button></td></tr>`; }).join('') || emptyRow(13, 'سطری نیست — نارمل عمومی تب «مشخصات» استفاده می‌شود'); };
      const readR = () => $$('#ltR tr[data-ri]', m.el).forEach(tr => { const r = ranges[Number(tr.dataset.ri)]; const g = (k) => $(`[data-k="${k}"]`, tr).value;
        Object.assign(r, { sex: g('sex'), age_min_days: ageToDays(g('a1'), g('u1')), age_max_days: ageToDays(g('a2'), g('u2')), text: g('text') });
        ['low', 'high', 'alarm_low', 'alarm_high', 'crit_low', 'crit_high', 'min_valid', 'max_valid'].forEach(k => { r[k] = g(k); }); });
      $('#ltRadd', m.el).onclick = () => { readR(); ranges.push({ sex: 'A', age_min_days: null, age_max_days: null, low: '', high: '', text: '', kit_id: kitSel || null }); drawR(); };
      $('#ltR', m.el).onclick = (e) => { const b = e.target.closest('[data-rr]'); if (b) { readR(); ranges.splice(Number(b.dataset.rr), 1); drawR(); } };
      $('#ltKit', m.el).onchange = (e) => { readR(); kitSel = Number(e.target.value) || 0; drawKits(); drawR(); };
      const kitDlg = (k) => new Promise((resolve) => {
        if (!t.id) { toast('اول آزمایش را ذخیره کنید', 'warn'); return resolve(null); }
        k = k || {};
        const km = modal({ title: k.id ? 'ویرایش کیت' : 'کیت جدید', body: `<div class="formGrid" id="kF"><label class="field span2"><span>نام / شرح کیت <em>*</em></span><input name="name" value="${esc(k.name || '')}" placeholder="مثلاً: Pars Azmun — FBS بر اساس سن"></label>
          <label class="field"><span>کمپنی</span><input name="company" value="${esc(k.company || '')}"></label><label class="field"><span>Lot No.</span><input name="lot_no" class="ltr" value="${esc(k.lot_no || '')}"></label>
          <label class="field"><span>تاریخ انقضا</span><input name="expiry" type="date" value="${esc(k.expiry || '')}"></label><label class="field"><span>Method</span><input name="method" class="en" value="${esc(k.method || '')}"></label>
          ${k.id ? '' : '<label class="check"><input type="checkbox" name="copy" checked> محدوده‌های فعلی برای این کیت کاپی شود</label>'}<label class="check"><input type="checkbox" name="active" ${k.active || !k.id ? 'checked' : ''}> کیت فعال (برای جواب‌های جدید)</label></div>`,
          foot: `<button class="btn primary" id="k_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
        $('[data-x]', km.el).onclick = () => { km.close(); resolve(null); };
        $('#k_ok', km.el).onclick = () => busy($('#k_ok', km.el), async () => {
          const v = formValues($('#kF', km.el)); if (!v.name.trim()) throw new Error('نام کیت را بنویسید');
          const body = { ...v, id: k.id, test_id: t.id, active: v.active ? 1 : false }; if (!k.id && v.copy) body.copy_ranges_from = kitSel || 0; delete body.copy;
          const saved = await API.post('/api/lab/kit/save', body); km.close(); resolve(saved);
        }).catch(errToast);
      });
      const reloadKits = async (selId) => { const c = await loadLabCatalog(true); Object.assign(cat, c); kits = (c.kits || []).filter(k => k.test_id === t.id); const fresh = (c.ranges.get(t.id) || []).map(r => ({ ...r })); ranges.length = 0; ranges.push(...fresh); if (selId !== undefined) kitSel = selId; drawKits(); drawR(); };
      $('#ltKitNew', m.el).onclick = async () => { readR(); const k = await kitDlg(null); if (k) { toast('کیت ذخیره شد', 'good'); await reloadKits(k.id); } };
      $('#ltKitEdit', m.el).onclick = async () => { const k = await kitDlg(kits.find(x => x.id === kitSel)); if (k) reloadKits(k.id); };
      $('#ltKitAct', m.el).onclick = () => API.post('/api/lab/kit/save', { ...kits.find(x => x.id === kitSel), test_id: t.id, active: 1 }).then(() => { toast('کیت فعال شد', 'good'); return reloadKits(kitSel); }).catch(errToast);
      $('#ltKitDel', m.el).onclick = async () => { if (!(await confirmDlg('این کیت و محدوده‌هایش حذف شود؟', { danger: true }))) return; await API.post('/api/lab/kit/save', { test_id: t.id, remove: kitSel }).catch(errToast); reloadKits(0); };
      const ap = $('#apGo', m.el); if (ap) ap.onclick = () => busy(ap, async () => { const r = await API.post('/api/lab/apply-ranges', { test_id: t.id, from: dateOf($('#apFrom', m.el)), to: dateOf($('#apTo', m.el)), basis: $('#apBasis', m.el).value }); toast(`${r.changed} جواب دوباره حساب شد`, 'good'); }).catch(errToast);
      // ---- panel components
      const drawC = () => { const q = ($('#ltCq', m.el).value || '').toLowerCase(); const depId = Number($('[name="department_id"]', m.el).value); const pool = cat.tests.filter(x => x.id !== t.id && !x.is_panel).sort((a, b) => (b.department_id === depId) - (a.department_id === depId));
        $('#ltComp', m.el).innerHTML = [...comps.map(id => cat.byId.get(id)).filter(Boolean), ...pool.filter(x => !comps.includes(x.id))].filter(x => !q || comps.includes(x.id) || x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)).slice(0, 300)
          .map(x => `<label class="${x.active ? '' : 'muted'}"><input type="checkbox" data-comp="${x.id}" ${comps.includes(x.id) ? 'checked' : ''}> <b>${esc(x.code)}</b> ${esc(x.name)}${x.active ? '' : ' (غیرفعال)'}</label>`).join(''); };
      $('#ltComp', m.el).onchange = (e) => { const id = Number(e.target.dataset.comp); if (!id) return; const i = comps.indexOf(id); if (e.target.checked && i < 0) comps.push(id); if (!e.target.checked && i >= 0) comps.splice(i, 1); };
      $('#ltCq', m.el).addEventListener('input', debounce(drawC, 150));
      const syncPanel = (v) => { $('#ltPanel', m.el).checked = v; $('#ltPanel2', m.el).checked = v; };
      $('#ltPanel', m.el).onchange = (e) => syncPanel(e.target.checked); $('#ltPanel2', m.el).onchange = (e) => syncPanel(e.target.checked);
      // ---- materials
      const drawM = () => { $('#ltM tbody', m.el).innerHTML = mats.map((x, i) => `<tr data-mi="${i}"><td><select data-k="item">${opt(items.map(it => [it.id, `${it.name}${it.unit ? ' (' + it.unit + ')' : ''}`]), x.item_id)}</select></td><td><input data-k="qty" type="number" step="any" value="${esc(x.qty)}" style="width:90px"></td><td><button type="button" class="btn ghost icon" data-rm2="${i}">${icon('x', 13)}</button></td></tr>`).join('') || emptyRow(3, 'مواد تعریف نشده'); };
      const readM = () => $$('#ltM tr[data-mi]', m.el).forEach(tr => { const x = mats[Number(tr.dataset.mi)]; x.item_id = Number($('[data-k="item"]', tr).value); x.qty = $('[data-k="qty"]', tr).value; });
      $('#ltMadd', m.el).onclick = () => { readM(); mats.push({ item_id: items[0]?.id, qty: 1 }); drawM(); };
      $('#ltM', m.el).onclick = (e) => { const b = e.target.closest('[data-rm2]'); if (b) { readM(); mats.splice(Number(b.dataset.rm2), 1); drawM(); } };
      drawKits(); drawR(); drawC(); drawM();
      $('[data-x]', m.el).onclick = m.close;
      $('#lt_ok', m.el).onclick = () => busy($('#lt_ok', m.el), async () => {
        readR(); readM();
        const v = formValues($('#ltF', m.el)); if (t.id) v.id = t.id;
        const o = $('#ltOpts', m.el).value.split(',').map(x => x.trim()).filter(Boolean); v.options = o.length ? JSON.stringify(o) : '';
        Object.assign(v, { sample: $('#ltSample', m.el).value, sample_amount: $('#ltSamAmt', m.el).value, tube: $('#ltTube', m.el).value, tube_sep: $('#ltTubeSep', m.el).value, tat_days: $('#ltTat', m.el).value, sex_only: $('#ltSex', m.el).value,
          loinc: $('#ltLoinc', m.el).value, machine_code: $('#ltMach', m.el).value, sendout_lab: $('#ltSend', m.el).value, sendout_cost: $('#ltSendC', m.el).value, default_answer: $('#ltDef', m.el).value,
          weekdays: $$('#ltWd .chip.on', m.el).map(b => b.dataset.wd).sort().join(''),
          ready_answers: JSON.stringify($('#ltReady', m.el).value.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) });
        if (v.weekdays.length === 7) v.weekdays = '';
        v.ranges = ranges.filter(r => [r.low, r.high, r.alarm_low, r.alarm_high, r.crit_low, r.crit_high, r.min_valid, r.max_valid].some(x => x !== '' && x != null) || String(r.text || '').trim());
        v.is_panel = $('#ltPanel', m.el).checked ? 1 : 0;
        if (v.is_panel) v.components = comps;
        v.items = mats.filter(x => x.item_id && Number(x.qty) > 0);
        await API.post('/api/lab/test/save', v); toast('ذخیره شد — محدوده‌های نارمل جدید در نتایج و راپور اعمال می‌شود', 'good'); m.close();
        Object.assign(cat, await loadLabCatalog(true)); parents = partOf(); drawDeps(); drawTests();
      }).catch(errToast);
    };
    actions(view, { new: () => edit(), edit: (b) => edit(cat.byId.get(Number(b.dataset.id))) });
    drawDeps(); drawTests();
  }
};

// ================================================================ laboratory materials (reagents, tubes, strips …)
Pages['lab-items'] = {
  async render(view) {
    const [mf] = currentMonthRange();
    view.innerHTML = `<div class="pageHead"><div><h1>موجودی مواد لابراتوار</h1><p>ری‌ایجنت، تیوب، استریپ و کیت‌ها. هر آزمایشی که مواد برایش تعریف شده باشد، هنگام ثبت در پذیرش خودکار از موجودی کم می‌شود؛ لغو آزمایش آن را برمی‌گرداند.</p></div>
      <div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} مواد جدید</button><button class="btn" data-act="usage">${icon('chart')} گزارش مصرف</button></div></div>
      <div class="grid g4" id="liK"></div>
      <div class="card" style="margin-top:14px"><div class="filterBar"><label class="field grow"><span>جستجو</span><input id="liQ"></label><label class="check" style="align-self:end"><input type="checkbox" id="liLow"> فقط کمبودها</label></div>
      <div class="tableWrap"><table class="t"><thead><tr><th>نام</th><th>واحد</th><th>موجودی</th><th>حد سفارش</th><th>قیمت واحد</th><th>ارزش</th><th>انقضا</th><th>فروشنده</th><th></th></tr></thead><tbody id="liB"></tbody></table></div></div>`;
    let rows = [];
    const load = async () => {
      rows = await API.list('lab_items', { limit: 2000 });
      const low = rows.filter(r => r.active && r.reorder_level > 0 && r.stock <= r.reorder_level);
      const soon = rows.filter(r => r.expiry && r.expiry <= isoDate(addDays(new Date(), 60)));
      $('#liK', view).innerHTML = kpi('اقلام', rows.filter(r => r.active).length, { ic: 'box' }) + kpi('کمبود', low.length, { ic: 'bell', cls: low.length ? 'bad' : 'good' }) + kpi('نزدیک به انقضا (۶۰ روز)', soon.length, { ic: 'calendar', cls: soon.length ? 'warn' : '' }) + kpi('ارزش موجودی', money(rows.reduce((a, r) => a + Math.max(0, r.stock) * r.cost, 0)), { ic: 'money', cls: 'violet' });
      draw();
    };
    const draw = () => {
      const q = $('#liQ', view).value.trim().toLowerCase(), lowOnly = $('#liLow', view).checked;
      const list = rows.filter(r => (!q || [r.name, r.supplier, r.notes].some(x => String(x || '').toLowerCase().includes(q))) && (!lowOnly || (r.reorder_level > 0 && r.stock <= r.reorder_level)));
      $('#liB', view).innerHTML = list.map(r => `<tr class="${r.active ? '' : 'muted'} ${r.reorder_level > 0 && r.stock <= r.reorder_level ? 'short' : ''}"><td><b>${esc(r.name)}</b></td><td>${esc(r.unit || '')}</td><td class="${r.stock <= 0 ? 'neg' : ''}"><b>${fmtNum(r.stock)}</b></td><td>${fmtNum(r.reorder_level)}</td><td>${money(r.cost)}</td><td>${money(Math.max(0, r.stock) * r.cost)}</td>
        <td class="${r.expiry && r.expiry <= today() ? 'neg' : ''}">${r.expiry ? fmtDate(r.expiry) : ''}</td><td>${esc(r.supplier || '')}</td>
        <td class="nowrap"><button class="btn sm success" data-act="in" data-id="${r.id}">${icon('plus', 13)} ورود</button> <button class="btn sm" data-act="out" data-id="${r.id}">مصرف / تعدیل</button> <button class="btn sm" data-act="hist" data-id="${r.id}">${icon('list', 13)}</button> <button class="btn sm" data-act="edit" data-id="${r.id}">${icon('edit', 13)}</button></td></tr>`).join('') || emptyRow(9, 'موادی ثبت نشده');
    };
    $('#liQ', view).addEventListener('input', debounce(draw, 150)); $('#liLow', view).addEventListener('change', draw);
    const editItem = (it) => {
      it = it || { active: 1, stock: 0, reorder_level: 0, cost: 0 };
      const m = modal({ title: it.id ? 'ویرایش مواد' : 'مواد جدید', body: `<div class="formGrid" id="liF"><label class="field span2"><span>نام <em>*</em></span><input name="name" value="${esc(it.name || '')}"></label><label class="field"><span>واحد (ml، test، عدد…)</span><input name="unit" value="${esc(it.unit || '')}"></label>
        <label class="field"><span>حد سفارش (هشدار کمبود)</span><input name="reorder_level" type="number" step="any" value="${esc(it.reorder_level)}"></label><label class="field"><span>قیمت واحد</span><input name="cost" type="number" step="any" value="${esc(it.cost)}"></label>
        <label class="field"><span>تاریخ انقضا</span>${dateInput('expiry', it.expiry)}</label><label class="field"><span>فروشنده / کمپنی</span><input name="supplier" value="${esc(it.supplier || '')}"></label>
        ${it.id ? '' : '<label class="field"><span>موجودی اول</span><input id="liStart" type="number" step="any" value="0"></label>'}
        <label class="check"><input type="checkbox" name="active" ${it.active ? 'checked' : ''}> فعال</label><label class="field full"><span>یادداشت</span><input name="notes" value="${esc(it.notes || '')}"></label></div>`,
        foot: `<button class="btn primary" id="li_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
      $('[data-x]', m.el).onclick = m.close;
      $('#li_ok', m.el).onclick = () => busy($('#li_ok', m.el), async () => {
        const v = formValues($('#liF', m.el)); if (it.id) v.id = it.id; if (!v.name) throw new Error('نام الزامی است');
        const id = await API.save('lab_items', v);
        const st0 = Number($('#liStart', m.el)?.value || 0); if (!it.id && st0) await API.post('/api/lab/items/move', { item_id: id, qty: st0, kind: 'in', note: 'موجودی اول' });
        toast('ذخیره شد', 'good'); m.close(); load();
      }).catch(errToast);
    };
    const move = (it, kind) => {
      const m = modal({ title: (kind === 'in' ? 'ورود مواد — ' : 'مصرف / تعدیل — ') + esc(it.name), body: `<div class="formGrid" id="mvF">
        ${kind === 'in' ? '' : `<label class="field"><span>نوع</span><select name="kind">${opt([['use', 'مصرف دستی'], ['expired', 'انقضا / ضایع'], ['adjust', 'تعدیل (شمارش)']], 'use')}</select></label>`}
        <label class="field"><span>مقدار ${kind === 'in' ? '' : '(تعدیل: + یا −)'}</span><input name="qty" type="number" step="any"></label><label class="field"><span>تاریخ</span>${dateInput('date', today())}</label>
        ${kind === 'in' ? `<label class="field"><span>قیمت واحد</span><input name="unit_cost" type="number" step="any" value="${esc(it.cost)}"></label><label class="field"><span>تاریخ انقضا</span>${dateInput('expiry', it.expiry)}</label>` : ''}
        <label class="field full"><span>یادداشت</span><input name="note"></label></div><div class="mini">موجودی فعلی: <b>${fmtNum(it.stock)} ${esc(it.unit || '')}</b></div>`,
        foot: `<button class="btn primary" id="mv_ok">ثبت</button><button class="btn" data-x>انصراف</button>` });
      $('[data-x]', m.el).onclick = m.close;
      $('#mv_ok', m.el).onclick = () => busy($('#mv_ok', m.el), async () => { const v = formValues($('#mvF', m.el)); const r2x = await API.post('/api/lab/items/move', { item_id: it.id, kind: v.kind || kind, ...v }); toast(`ثبت شد — موجودی ${fmtNum(r2x.stock)}`, 'good'); m.close(); load(); }).catch(errToast);
    };
    const KIND = { in: ['ورود', 'good'], use: ['مصرف', ''], return: ['برگشت', 'info'], adjust: ['تعدیل', 'warn'], expired: ['انقضا', 'bad'] };
    actions(view, {
      new: () => editItem(), edit: (b) => editItem(rows.find(r => r.id === Number(b.dataset.id))),
      in: (b) => move(rows.find(r => r.id === Number(b.dataset.id)), 'in'), out: (b) => move(rows.find(r => r.id === Number(b.dataset.id)), 'out'),
      hist: async (b) => {
        const it = await API.get('/api/lab/items/' + b.dataset.id);
        modal({ title: 'گردش ' + esc(it.name), size: 'wide', body: `${it.tests.length ? `<div class="mini" style="margin-bottom:8px">مصرف در آزمایش‌ها: ${it.tests.map(t => `<b class="en">${esc(t.code)}</b> (${fmtNum(t.qty)})`).join('، ')}</div>` : ''}
          <div class="tableWrap" style="max-height:60vh"><table class="t"><thead><tr><th>تاریخ</th><th>نوع</th><th>مقدار</th><th>مرجع</th><th>کاربر</th><th>یادداشت</th></tr></thead><tbody>${it.moves.map(x => `<tr><td>${fmtDate(x.date)} <small class="muted ltr">${fmtTime(x.at)}</small></td><td>${statusPill(KIND, x.kind)}</td><td class="${x.qty < 0 ? 'neg' : 'pos'}">${fmtNum(x.qty)}</td><td class="codeTag">${esc(x.ref_type === 'lab_request' ? x.note : '')}</td><td>${esc(x.user_name || '')}</td><td>${esc(x.ref_type ? '' : x.note || '')}</td></tr>`).join('') || emptyRow(6)}</tbody></table></div>` });
      },
      usage: async () => {
        const m = modal({ title: 'گزارش مصرف مواد', size: 'wide', body: `<div class="filterBar">${dateInput('from', mf, 'id="u_from" style="width:120px"')}${dateInput('to', today(), 'id="u_to" style="width:120px"')}</div><div id="uB"></div>`, foot: `<button class="btn" id="uPr">${icon('print')} چاپ</button><button class="btn" data-x>بستن</button>` });
        const run = async () => { const r = await API.get('/api/lab/items-usage', { from: dateOf($('#u_from', m.el)), to: dateOf($('#u_to', m.el)) }); $('#uB', m.el).innerHTML = `<table class="t rt rtl"><thead><tr><th>مواد</th><th>مصرف</th><th>ورود</th><th>موجودی</th><th>ارزش مصرف</th></tr></thead><tbody>${r.map(x => `<tr><td>${esc(x.name)} <small class="muted">${esc(x.unit || '')}</small></td><td>${fmtNum(x.used)}</td><td>${fmtNum(x.received)}</td><td>${fmtNum(x.stock)}</td><td>${money(x.used * x.cost)}</td></tr>`).join('') || emptyRow(5)}</tbody></table>`; };
        $$('#u_from, #u_to', m.el).forEach(el => el.addEventListener('change', run)); await run();
        $('[data-x]', m.el).onclick = m.close;
        $('#uPr', m.el).onclick = () => previewDoc(reportDocHTML('گزارش مصرف مواد لابراتوار', `<p>${fmtDate(dateOf($('#u_from', m.el)))} تا ${fmtDate(dateOf($('#u_to', m.el)))}</p>${$('#uB', m.el).innerHTML}`), { title: 'مصرف مواد' });
      }
    });
    await load(); this._load = debounce(load, 500);
  },
  onEvent(m) { if (this._load && /^(lab|labitem)/.test(m.type)) this._load(); }
};

// ================================================================ lab sales
Pages['lab-sales'] = {
  async render(view) {
    const months = lastMonths(6); const [mf] = currentMonthRange();
    view.innerHTML = `<div class="pageHead"><div><h1>فروش لابراتوار</h1><p>عاید روزانه و ماهانه و تعداد هر آزمایش.</p></div></div>
      <div class="grid g4" id="lsK"></div>
      <div class="grid g2" style="margin-top:16px"><div class="card"><h2>عاید ماهانه</h2><div class="chartBox"><canvas id="lsC"></canvas></div></div>
      <div class="card"><div class="cardHead"><h2>آزمایش‌ها</h2><div class="bar">${dateInput('from', mf, 'id="ls_from" style="width:120px"')}${dateInput('to', today(), 'id="ls_to" style="width:120px"')}</div></div><div id="lsT"></div></div></div>`;
    const days = await API.get('/api/reports/days', { from: months[0].range[0], to: today() });
    const td = days.find(d => d.date === today()) || {};
    const agg = months.map(m => ({ ...m, v: r2(sumBy(days.filter(d => d.date >= m.range[0] && d.date <= m.range[1]), 'lab_total')), n: sumBy(days.filter(d => d.date >= m.range[0] && d.date <= m.range[1]), 'lab_count') }));
    $('#lsK', view).innerHTML = kpi('عاید امروز', money(td.lab_total || 0), { ic: 'money', cls: 'good' }) + kpi('مریضان امروز', td.lab_count || 0, { ic: 'users' }) + kpi('عاید این ماه', money(agg[agg.length - 1].v), { ic: 'trend', cls: 'violet' }) + kpi('مریضان این ماه', agg[agg.length - 1].n, { ic: 'flask' });
    barChart($('#lsC', view), agg.map(m => m.short), [{ label: 'عاید', data: agg.map(m => m.v) }], { money: true });
    const loadT = async () => {
      const rows = await API.get('/api/reports/lab-tests', { from: dateOf($('#ls_from', view)), to: dateOf($('#ls_to', view)) });
      $('#lsT', view).innerHTML = `<table class="t"><thead><tr><th>آزمایش</th><th>تعداد</th><th>فروش</th></tr></thead><tbody>${rows.map(r => `<tr><td class="en">${esc(r.code)} — ${esc(r.name)}</td><td>${r.n}</td><td>${money(r.revenue)}</td></tr>`).join('') || emptyRow(3)}</tbody></table>`;
    };
    $$('#ls_from, #ls_to', view).forEach(el => el.addEventListener('change', loadT)); loadT();
  }
};

// ================================================================ laboratory reception fields shared by the lab and the clinic reception
const SAMPLE_FLAGS = [['', '—'], ['no_sample', 'بدون نمونه (No Sample)'], ['new_sample', 'نمونه جدید (New Sample)'], ['cut_sample', 'نمونه ناقص (Cut Sample)'], ['outside', 'نمونه از بیرون آورده شده']];
const FASTING = [['', '—'], ['fast', 'ناشتا (Fast)'], ['nonfast', 'غیر ناشتا (Non Fast)']];
// price of the selected tests for a reception type: free / insurance rate, increase %, organisation share, discount
function labPriceCalc(cat, ids, rtId, discountPct, discountAmt) {
  const rt = cat.rtById.get(Number(rtId)) || { price_basis: 'free', patient_pct: 100, increase_pct: 0, discount_pct: 0 };
  let sub = 0, org = 0;
  for (const id of ids) {
    const t = cat.byId.get(id); if (!t) continue;
    let pr = rt.price_basis === 'insurance' && t.price_ins != null ? Number(t.price_ins) : Number(t.price || 0);
    if (Number(rt.increase_pct)) { pr = pr * (1 + Number(rt.increase_pct) / 100); pr = pr >= 10 ? Math.ceil(pr) : Math.round(pr * 10) / 10; }
    sub += pr; org += pr * (100 - Number(rt.patient_pct ?? 100)) / 100;
  }
  sub = r2(sub); org = r2(org); const share = r2(sub - org);
  const pct = discountPct !== undefined && discountPct !== '' && discountPct !== null ? Number(discountPct) : Number(rt.discount_pct || 0);
  const discount = discountAmt !== undefined && discountAmt !== '' && discountAmt !== null ? Math.min(share, Number(discountAmt) || 0) : r2(share * (pct || 0) / 100);
  return { sub, org, share, discount, net: r2(share - discount), rt };
}
// default answer date: today + the longest turnaround of the tests, moved to a weekday on which all the tests are done; urgent → today
function labAnswerDateCalc(cat, ids, urgent) {
  if (urgent) return today();
  let days = Number(App.settings.lab_answer_days || 1);
  const wds = [];
  for (const id of ids) { const t = cat.byId.get(id); if (!t) continue; days = Math.max(days, t.tat_days != null ? Number(t.tat_days) : t.tat_hours ? Math.ceil(t.tat_hours / 24) : 0); if (t.weekdays) wds.push(String(t.weekdays)); }
  const d = addDays(new Date(), Math.ceil(days));
  for (let k = 0; k < 7 && wds.length && !wds.every(w => w.includes(String(d.getDay()))); k++) d.setDate(d.getDate() + 1);
  return isoDate(d);
}
// warnings shown before registering (sex-only tests, not done today, send-out, maximum tests, reception type requirements)
function labReceptionWarnings(cat, ids, patient, rtId) {
  const out = []; const wd = new Date().getDay();
  const rt = cat.rtById.get(Number(rtId));
  for (const id of ids) {
    const t = cat.byId.get(id); if (!t) continue;
    if (t.sex_only && patient && patient.sex && t.sex_only !== patient.sex) out.push(`${t.code}: فقط برای ${t.sex_only === 'F' ? 'خانم‌ها' : 'آقایان'} است`);
    if (t.weekdays && !String(t.weekdays).includes(String(wd))) out.push(`${t.code}: امروز انجام نمی‌شود (روزهای انجام: ${String(t.weekdays).split('').map(x => WEEKDAYS[Number(x)]).join('، ')})`);
    if (t.sendout_lab) out.push(`${t.code}: به لابراتوار «${t.sendout_lab}» فرستاده می‌شود`);
  }
  if (rt && rt.max_tests && ids.length > rt.max_tests) out.push(`نوع پذیرش «${rt.name}»: حداکثر ${rt.max_tests} آزمایش`);
  return out;
}
function labReceptionFieldsHTML(pfx, r = {}, cat) {
  const rts = (cat.reception_types || []).filter(x => x.active || x.id === r.reception_type_id);
  const reasons = listSetting('lab_discount_reasons');
  return `<div class="formGrid labRecF" id="${pfx}">
    <label class="field"><span>نوع پذیرش</span><select data-lf="reception_type_id">${opt(rts.map(x => [x.id, x.name]), r.reception_type_id || (rts[0] && rts[0].id))}</select></label>
    <label class="field"><span>داکتر معرف بیرونی <small class="muted">(نظام طبی)</small></span><span class="inputGroup"><input data-lf="referrer" list="${pfx}_refs" value="${esc(r.referrer_name || r.referrer || '')}" placeholder="نام داکتر…"><button type="button" class="btn" data-newref title="داکتر معرف جدید">${icon('plus', 14)}</button></span></label>
    <label class="field"><span>ناشتا</span><select data-lf="fasting">${opt(FASTING, r.fasting || '')}</select></label>
    <label class="field"><span>وضعیت نمونه</span><select data-lf="sample_flag">${opt(SAMPLE_FLAGS, r.sample_flag || '')}</select></label>
    <label class="check"><input type="checkbox" data-lf="urgent" ${r.urgent ? 'checked' : ''}> عاجل (اورژانس)</label>
    <label class="check"><input type="checkbox" data-lf="pregnant" ${r.pregnant ? 'checked' : ''}> حامله</label>
    <label class="field"><span>تاریخ جوابدهی</span>${dateInput('answer_date', r.answer_date || '', `data-lf="answer_date" id="${pfx}_ad"`)}</label>
    <label class="field span2"><span>یادداشت کلینیکی (Clinical Notes)</span><input data-lf="clinical_notes" value="${esc(r.clinical_notes || '')}" placeholder="مثلاً: suspected anemia, on treatment…"></label>
    <label class="field"><span>دلیل تخفیف</span><input data-lf="discount_reason" list="${pfx}_dr" value="${esc(r.discount_reason || '')}"></label>
    <label class="field"><span>تخفیف دهنده</span><input data-lf="discount_by" value="${esc(r.discount_by || '')}"></label>
    <datalist id="${pfx}_refs">${(cat.referrers || []).map(x => `<option value="${esc(x.name)}">${esc([x.specialty, x.council_no].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>${datalist(pfx + '_dr', reasons)}</div>`;
}
function bindLabReceptionFields(root, pfx, cat, { onChange } = {}) {
  const box = $('#' + pfx, root);
  box.addEventListener('change', () => onChange && onChange());
  $('[data-newref]', box).onclick = () => labReferrerDialog(null, async (id) => { const c = await loadLabCatalog(true); Object.assign(cat, c); const x = c.referrers.find(y => y.id === id); $(`#${pfx}_refs`, root).innerHTML = c.referrers.map(y => `<option value="${esc(y.name)}">`).join(''); if (x) $('[data-lf="referrer"]', box).value = x.name; });
  return {
    value() {
      const g = (k) => $(`[data-lf="${k}"]`, box);
      const refName = g('referrer').value.trim(); const ref = (cat.referrers || []).find(x => x.name === refName);
      return { reception_type_id: Number(g('reception_type_id').value) || null, referrer_id: ref ? ref.id : null, referrer: ref ? null : (refName || null), fasting: g('fasting').value, sample_flag: g('sample_flag').value,
        urgent: g('urgent').checked ? 1 : 0, pregnant: g('pregnant').checked ? 1 : 0, answer_date: dateOf(g('answer_date')) || null, clinical_notes: g('clinical_notes').value, discount_reason: g('discount_reason').value, discount_by: g('discount_by').value };
    },
    rtId() { return Number($('[data-lf="reception_type_id"]', box).value) || null; },
    urgent() { return $('[data-lf="urgent"]', box).checked; },
    setAnswerDate(iso) { const el = $(`#${pfx}_ad`, root); if (!el.dataset.t) { el.value = iso ? fmtDateNum(iso) : ''; } },
    touchAnswer() { $(`#${pfx}_ad`, root).addEventListener('input', (e) => { e.target.dataset.t = 1; }); },
    discountOk(discount) {
      if (!(discount > 0.001) || App.settings.lab_discount_reason_required !== '1') return true;
      return !!($('[data-lf="discount_reason"]', box).value.trim() && $('[data-lf="discount_by"]', box).value.trim());
    }
  };
}
// before saving: same test registered for the patient today?  another patient with this tazkira?
async function labPreSaveChecks(patientId, ids, excludeId, newPatient) {
  const msgs = [];
  if (patientId && App.settings.lab_warn_repeat_day !== '0') {
    const rep = await API.get('/api/lab/repeat-check', { patient_id: patientId, test_ids: ids.join(','), exclude: excludeId || '' }).catch(() => []);
    if (rep.length) msgs.push('این آزمایش‌ها امروز هم برای همین مریض ثبت شده: ' + [...new Set(rep.map(x => `${x.name} (${x.lab_code})`))].join('، '));
  }
  if (newPatient && newPatient.tazkira && App.settings.lab_warn_dup_tazkira !== '0') {
    const d = await API.get('/api/patients/dup-tazkira', { tazkira: newPatient.tazkira }).catch(() => []);
    if (d.length) msgs.push(`نمبر تذکره ${newPatient.tazkira} قبلاً برای ${d.map(x => `${x.full_name} (${x.code})`).join('، ')} ثبت شده — شاید همان مریض است.`);
  }
  if (!msgs.length) return true;
  return confirmDlg(msgs.map(esc).join('<br><br>') + '<br><br>باز هم ثبت شود؟');
}
function labReferrerDialog(x, after) {
  x = x || { active: 1, discount_pct: 0 };
  const m = modal({ title: x.id ? 'ویرایش داکتر معرف' : 'داکتر معرف جدید', body: `<div class="formGrid" id="rfF">
    <label class="field span2"><span>نام <em>*</em></span><input name="name" value="${esc(x.name || '')}"></label><label class="field"><span>نمبر نظام طبی</span><input name="council_no" class="ltr" value="${esc(x.council_no || '')}"></label>
    <label class="field"><span>تخصص</span><input name="specialty" list="rfSp" value="${esc(x.specialty || '')}"></label><label class="field"><span>تلفن</span><input name="phone" class="ltr" value="${esc(x.phone || '')}"></label>
    <label class="field"><span>کلینیک / شفاخانه</span><input name="clinic" value="${esc(x.clinic || '')}"></label><label class="field"><span>تخفیف پیش‌فرض ٪</span><input name="discount_pct" type="number" value="${esc(x.discount_pct || 0)}"></label>
    <label class="check"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> فعال</label></div>
    ${datalist('rfSp', ['داکتر عمومی', 'داخله', 'داخله — اطفال', 'داخله — زنان', 'نسائی و ولادی', 'جراح عمومی', 'جراح مغز و اعصاب', 'قلب', 'جلدی', 'چشم', 'گوش، گلو و بینی', 'اورولوژی', 'دندان', 'رادیولوژی'])}`,
    foot: `<button class="btn primary" id="rf_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
  $('[data-x]', m.el).onclick = m.close;
  $('#rf_ok', m.el).onclick = () => busy($('#rf_ok', m.el), async () => { const v = formValues($('#rfF', m.el)); if (x.id) v.id = x.id; if (!v.name.trim()) throw new Error('نام الزامی است'); const id = await API.save('lab_referrers', v); m.close(); after && after(x.id || id); }).catch(errToast);
}

// history of one test of the patient as a chart (like the chart button of the previous program)
async function labTrendDialog(patient, t, sex, ageDays) {
  const rows = await API.get('/api/lab/history', { patient_id: patient.id, test_id: t.id });
  const m = modal({ title: `سابقه ${esc(t.name)} — ${esc(patient.full_name)}`, size: 'wide', body: rows.length ? `<div class="chartBox"><canvas id="trC"></canvas></div><table class="t" style="margin-top:10px"><thead><tr><th>تاریخ</th><th>کد</th><th>نتیجه</th><th>Flag</th><th>نارمل</th></tr></thead><tbody>${rows.slice().reverse().map(x => `<tr><td>${fmtDate(x.date)}</td><td class="codeTag">${esc(x.lab_code)}</td><td><b>${esc(x.value)}</b> ${esc(x.unit || t.unit || '')}</td><td>${x.flag ? `<span class="flag ${esc(x.flag)}">${esc(x.flag)}</span>` : ''}</td><td class="muted">${esc(x.ref || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">سابقه‌ای نیست</div>' });
  if (rows.length && t.result_type === 'numeric') { const rg = resolveRange(t, sex, ageDays); trendChart($('#trC', m.el), rows.map(x => fmtDateNum(x.date)), rows.map(x => num(String(x.value).replace(/^[<>]=?\s*/, ''))), { label: t.code, unit: t.unit || '', low: rg.low, high: rg.high }); }
  else if (rows.length) $('#trC', m.el).closest('.chartBox').remove();
}
