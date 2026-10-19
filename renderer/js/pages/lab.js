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
  const r = rs[0]; return r ? { low: r.low, high: r.high, text: r.text } : { low: t.ref_low, high: t.ref_high, text: null };
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
    if (t.critical_low != null && n < t.critical_low) return 'LL'; if (t.critical_high != null && n > t.critical_high) return 'HH';
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
    const drawBilling = () => {
      const sel = r.items.map(i => i.test_id);
      $('#workBody', view).innerHTML = `<div class="recGrid"><div class="card"><h2>${icon('flask')} آزمایش‌ها</h2>
        <div class="searchBox" style="margin-bottom:10px"><input id="tq" placeholder="افزودن آزمایش: کد، نام یا نمبر…"></div><div class="selList" id="tl"></div></div>
        <div class="card"><h2>${icon('money')} فیس و رسید</h2><div class="totals"><div><span>جمع کل</span><b id="bSub"></b></div>
          <div><span>تخفیف ٪ ${r.discount_pct ? `<small class="pos">(داکتر: ${fmtNum(r.discount_pct)}٪)</small>` : ''}</span><span class="bar"><input type="number" id="bPct" value="${r.discount_pct || 0}" style="width:70px"> <small>یا مبلغ</small> <input type="number" id="bAmt" style="width:90px"></span></div><div><span>قابل پرداخت</span><b id="bNet"></b></div></div>
          <div class="formGrid" style="margin-top:10px"><label class="field"><span>دریافت شده</span><input type="number" id="bPaid"></label><label class="field"><span>طریقه</span><select id="bPm">${opt(Object.entries(PAY_METHODS), 'cash')}</select></label></div>
          <div class="stack" style="margin-top:12px"><button class="btn primary lg" data-act="receive" data-print="1" style="justify-content:center">${icon('print')} پذیرش، دریافت فیس و چاپ دو رسید</button><button class="btn" data-act="receive" style="justify-content:center">${icon('check')} پذیرش بدون چاپ</button>
          <button class="btn dangerText" data-act="cancel" style="justify-content:center">${icon('x')} لغو درخواست</button></div></div></div>`;
      const calc = () => {
        const sub = sel.reduce((a, id) => a + (cat.byId.get(id)?.price || 0), 0);
        const disc = $('#bAmt', view).value !== '' ? Math.min(sub, Number($('#bAmt', view).value) || 0) : r2(sub * (Number($('#bPct', view).value) || 0) / 100);
        $('#bSub', view).textContent = money(sub); $('#bNet', view).textContent = money(sub - disc) + ' ' + currency();
        if (!$('#bPaid', view).dataset.t) $('#bPaid', view).value = r2(sub - disc);
        $('#tl', view).innerHTML = sel.map(id => { const t = cat.byId.get(id); return `<div class="selRow"><span class="codeTag">${t.num_code || ''} ${esc(t.code)}</span><span class="nm">${esc(t.name)}</span><b>${money(t.price)}</b><button class="btn ghost icon" data-rm="${id}">${icon('x', 14)}</button></div>`; }).join('') || '<div class="empty">آزمایشی نیست</div>';
      };
      autocomplete($('#tq', view), { fetch: async (q) => { const s = q.toLowerCase(); return cat.tests.filter(t => t.active && t.orderable && (String(t.num_code) === q || t.code.toLowerCase().includes(s) || t.name.toLowerCase().includes(s))).slice(0, 20); },
        render: (t) => `<span class="code">${t.num_code || ''} ${esc(t.code)}</span><span class="nm">${esc(t.name)}</span><span class="pr">${money(t.price)}</span>`, pick: (t) => { if (!sel.includes(t.id)) sel.push(t.id); $('#tq', view).value = ''; calc(); } });
      $('#tl', view).onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { sel.splice(sel.indexOf(Number(b.dataset.rm)), 1); calc(); } };
      $('#bPct', view).oninput = () => { $('#bAmt', view).value = ''; calc(); }; $('#bAmt', view).oninput = calc; $('#bPaid', view).oninput = (e) => e.target.dataset.t = 1;
      view._receive = (btn, print) => busy(btn, async () => {
        r = await API.post('/api/lab/receive/' + r.id, { test_ids: sel, discount: $('#bAmt', view).value === '' ? undefined : $('#bAmt', view).value, discount_pct: $('#bPct', view).value, paid: $('#bPaid', view).value, pay_method: $('#bPm', view).value });
        toast(`پذیرش شد — ${r.lab_code}`, 'good');
        if (print) await printDoc(labReceiptsHTML(r), { size: 'receipt', title: r.lab_code });
        draw();
      });
      calc();
    };
    // ---------- results ----------
    const drawResults = (ageDays) => {
      const sex = r.patient.sex; const res = new Map((r.results || []).map(x => [x.test_id, x]));
      const locked = ['approved', 'delivered'].includes(r.status);
      const groups = new Map();
      for (const t of r.tests) { const panel = t.panel_id ? r.items.find(i => i.test_id === t.panel_id) : null; const g = panel ? panel.name : (t.dept_name || 'Tests'); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(t); }
      const input = (t) => {
        const v = res.get(t.id)?.value ?? '';
        if (t.formula) return `<input data-tid="${t.id}" class="calc" value="${esc(v)}" readonly title="محاسبه خودکار">`;
        if (t.result_type === 'option') { const o = JSON.parse(t.options || '[]').map(x => String(x).replace(/^\s*\d+\s*=\s*/, '')); return `<select data-tid="${t.id}" class="optSel" ${locked ? 'disabled' : ''}><option value=""></option>${o.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}${v && !o.includes(v) ? `<option selected>${esc(v)}</option>` : ''}</select>`; }
        if (t.result_type === 'memo') return `<textarea data-tid="${t.id}" rows="2" style="direction:ltr" ${locked ? 'readonly' : ''}>${esc(v)}</textarea>`;
        return `<input data-tid="${t.id}" value="${esc(v)}" ${locked ? 'readonly' : ''} autocomplete="off">`;
      };
      $('#workBody', view).innerHTML = `${locked ? '<div class="infoBox">نتایج تأیید شده و برای داکتر فرستاده شده است.</div>' : ''}
        ${[...groups.entries()].map(([g, list]) => `<div class="resGroup"><div class="resGroupHead"><span>${esc(g)}</span><small class="muted">${esc(list[0]?.sample || '')}</small></div>
        <table class="res"><thead><tr><th>Test</th><th>Result</th><th>Flag</th><th>Unit</th><th>Reference</th></tr></thead><tbody>
        ${list.map(t => { const rg = resolveRange(t, sex, ageDays); return `<tr data-row="${t.id}"><td class="nm">${esc(t.name)}</td><td class="val">${input(t)}</td><td><span class="flag" data-flag="${t.id}"></span></td><td>${esc(t.unit || '')}</td><td class="muted">${esc(refDisplay(t, rg))}</td></tr>`; }).join('')}</tbody></table></div>`).join('')}
        <label class="field"><span>یادداشت راپور (Comment)</span><textarea id="repNote" rows="2" style="direction:ltr" ${locked ? 'readonly' : ''}>${esc(r.report_note || '')}</textarea></label>
        <div class="stickyFoot">
          ${locked ? `<button class="btn" data-act="reopen">${icon('edit')} باز کردن برای اصلاح</button>` : `<button class="btn" data-act="saveRes" data-st="">${icon('check')} ذخیره</button><button class="btn" data-act="saveRes" data-st="completed">${icon('check')} تکمیل نتایج</button><button class="btn success lg" data-act="saveRes" data-st="approved">${icon('send')} تأیید نهایی و ارسال به داکتر</button>`}
          <button class="btn primary" data-act="report">${icon('print')} چاپ راپور</button><button class="btn" data-act="receipt">${icon('receipt')} رسیدها</button>
          ${r.net - r.paid > 0.001 ? `<button class="btn success" data-act="pay">${icon('money')} دریافت باقی ${money(r.net - r.paid)}</button>` : ''}
          ${r.status === 'approved' ? `<button class="btn" data-act="deliver">${icon('check')} تحویل به مریض</button>` : ''}</div>`;
      const byId = new Map(r.tests.map(t => [t.id, t]));
      const refresh = () => {
        const vals = {};
        $$('[data-tid]', view).forEach(el => { const t = byId.get(Number(el.dataset.tid)); const n = num(el.value); if (n !== null) vals[t.code.toUpperCase()] = n; });
        $$('[data-tid].calc', view).forEach(el => { const t = byId.get(Number(el.dataset.tid)); const v = evalFormula(t.formula, vals, { age: (ageDays || 0) / 365.25, female: sex === 'F' ? 1 : 0 }); el.value = v === null ? '' : fmtNum(v, t.decimals ?? 2); if (v !== null) vals[t.code.toUpperCase()] = v; });
        $$('[data-tid]', view).forEach(el => { const t = byId.get(Number(el.dataset.tid)); const f = computeFlag(t, el.value, resolveRange(t, sex, ageDays)); const fl = $(`[data-flag="${t.id}"]`, view); fl.textContent = f || ''; fl.className = 'flag ' + (f || ''); el.closest('tr').classList.toggle('abn', !!f); el.closest('tr').classList.toggle('crit', f === 'HH' || f === 'LL'); });
      };
      $('#workBody', view).addEventListener('input', refresh); $('#workBody', view).addEventListener('change', refresh);
      $('#workBody', view).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[data-tid]')) { e.preventDefault(); const all = $$('[data-tid]:not([readonly])', view); const i = all.indexOf(e.target); all[i + 1]?.focus(); } });
      refresh();
      view._collect = () => $$('[data-tid]', view).map(el => { const t = byId.get(Number(el.dataset.tid)); const rg = resolveRange(t, sex, ageDays); return { test_id: t.id, value: el.value, flag: computeFlag(t, el.value, rg), unit: t.unit, ref: refDisplay(t, rg) }; });
      setTimeout(() => $('[data-tid]:not([readonly])', view)?.focus(), 50);
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
      report: async () => { if (!['approved', 'delivered'].includes(r.status)) { r = await API.post('/api/lab/results/' + r.id, { results: view._collect(), report_note: $('#repNote', view).value }); } previewDoc(labReportHTML(r), { size: 'A4', title: r.lab_code }); },
      receipt: () => previewDoc(labReceiptsHTML(r), { size: 'receipt', title: r.lab_code }),
      pay: async () => { const a = await promptDlg('دریافت باقی', { label: 'مبلغ', value: r.net - r.paid, type: 'number' }); if (a) { r = await API.post('/api/lab/pay/' + r.id, { amount: Number(a) }); draw(); } },
      deliver: async () => { r = await API.post('/api/lab/results/' + r.id, { results: [], status: 'delivered' }); draw(); }
    });
    draw();
  }
};

// ================================================================ walk-in patient (no doctor request)
Pages['lab-walkin'] = {
  async render(view, params) {
    const cat = await loadLabCatalog();
    const sel = []; let patient = null; let sex = 'M';
    view.innerHTML = `<div class="pageHead"><div><h1>پذیرش مریض بیرونی</h1><p>برای مریضی که نسخه داکتر کلینیک ندارد (یا از بیرون آمده). کد لابراتوار ساخته می‌شود.</p></div></div>
      <div class="recGrid"><div class="card"><h2>${icon('user')} مریض</h2><div class="searchBox" style="margin-bottom:10px"><input id="wq" placeholder="جستجوی مریض قبلی…"></div><div id="wpt"></div>
        <div class="recForm" id="wf"><label class="field c3"><span>نام <em>*</em></span><input name="full_name"></label><label class="field c3"><span>ولد</span><input name="father_name"></label>
        <label class="field c2"><span>جنس</span><select name="sex">${opt([['M', 'مذکر'], ['F', 'مونث']], 'M')}</select></label><label class="field c2"><span>سن (سال)</span><input name="age_years" type="number"></label><label class="field c2"><span>تلفن</span><input name="phone" class="ltr"></label></div>
        <label class="field" style="margin-top:10px"><span>داکتر ارجاع دهنده</span><select id="wdr">${opt(App.doctors.map(d => [d.id, doctorName(d)]), '', { empty: 'بیرونی / بدون داکتر' })}</select></label></div>
      <div class="card"><h2>${icon('flask')} آزمایش‌ها</h2><div class="searchBox"><input id="wt" placeholder="کد، نام یا نمبر آزمایش…"></div>
        <div class="testPick" style="margin-top:10px">${QUICK_TESTS.map(c => cat.tests.find(t => t.code === c && t.active)).filter(Boolean).map(t => `<button type="button" class="chip" data-tid="${t.id}">${esc(t.code)}</button>`).join('')}</div>
        <div class="selList" id="wl" style="margin-top:10px"></div><div class="totals"><div><span>جمع</span><b id="wsum">0</b></div></div>
        <button class="btn primary lg" data-act="create" style="margin-top:12px">${icon('next')} ثبت و رفتن به پذیرش و فیس</button></div></div>`;
    const drawSel = () => { $('#wl', view).innerHTML = sel.map(id => { const t = cat.byId.get(id); return `<div class="selRow"><span class="codeTag">${esc(t.code)}</span><span class="nm">${esc(t.name)}</span><b>${money(t.price)}</b><button class="btn ghost icon" data-rm="${id}">${icon('x', 14)}</button></div>`; }).join(''); $('#wsum', view).textContent = money(sel.reduce((a, id) => a + cat.byId.get(id).price, 0)); $$('.testPick .chip', view).forEach(c => c.classList.toggle('on', sel.includes(Number(c.dataset.tid)))); };
    const pickPt = (p) => { patient = p; $('#wpt', view).innerHTML = `<div class="ptHead" style="margin-bottom:8px">${patientHeadHTML(p)}<button class="btn sm" id="wclr">${icon('x', 13)}</button></div>`; $('#wf', view).classList.add('hidden'); $('#wclr', view).onclick = () => { patient = null; $('#wpt', view).innerHTML = ''; $('#wf', view).classList.remove('hidden'); }; };
    patientSearch($('#wq', view), pickPt);
    if (params.patient_id) pickPt(await API.one('patients', params.patient_id));
    autocomplete($('#wt', view), { fetch: async (q) => { const s = q.toLowerCase(); return cat.tests.filter(t => t.active && t.orderable && (String(t.num_code) === q || t.code.toLowerCase().includes(s) || t.name.toLowerCase().includes(s))).slice(0, 20); },
      render: (t) => `<span class="code">${t.num_code || ''} ${esc(t.code)}</span><span class="nm">${esc(t.name)}</span><span class="pr">${money(t.price)}</span>`, pick: (t) => { if (!sel.includes(t.id)) sel.push(t.id); $('#wt', view).value = ''; drawSel(); } });
    view.addEventListener('click', (e) => { const c = e.target.closest('.testPick [data-tid]'); if (c) { const id = Number(c.dataset.tid); const i = sel.indexOf(id); i >= 0 ? sel.splice(i, 1) : sel.push(id); drawSel(); } const rm = e.target.closest('[data-rm]'); if (rm) { sel.splice(sel.indexOf(Number(rm.dataset.rm)), 1); drawSel(); } });
    actions(view, {
      create: (b) => busy(b, async () => {
        const f = formValues($('#wf', view));
        if (!patient && !f.full_name.trim()) throw new Error('نام مریض را بنویسید');
        const r = await API.post('/api/lab/walkin', { patient_id: patient?.id, patient: patient ? undefined : f, test_ids: sel, doctor_id: $('#wdr', view).value || null });
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
Pages['lab-tests'] = {
  async render(view) {
    const cat = await loadLabCatalog(true);
    let dep = cat.departments[0]?.id;
    view.innerHTML = `<div class="pageHead"><div><h1>لیست آزمایش‌ها و قیمت</h1><p>قیمت را مستقیم در جدول تغییر دهید (خودکار ذخیره می‌شود). ${cat.tests.length} آزمایش و پنل.</p></div><div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} آزمایش جدید</button></div></div>
      <div class="split"><div class="card" style="padding:8px"><div class="deptList" id="dl"></div></div>
      <div class="card"><div class="filterBar"><label class="field grow"><span>جستجو در همه</span><input id="tq"></label></div><div class="tableWrap"><table class="t"><thead><tr><th>نمبر</th><th>کد</th><th>نام</th><th>نمونه</th><th>واحد</th><th>محدوده نارمل</th><th>قیمت</th><th>فعال</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div></div>`;
    const drawDeps = () => { $('#dl', view).innerHTML = cat.departments.map(d => `<button class="${d.id === dep ? 'on' : ''}" data-dep="${d.id}">${esc(d.name_fa || d.name)} <small>${cat.tests.filter(t => t.department_id === d.id).length}</small></button>`).join(''); };
    const drawTests = () => {
      const q = $('#tq', view).value.trim().toLowerCase();
      const list = cat.tests.filter(t => q ? (t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || String(t.num_code) === q) : t.department_id === dep).filter(t => t.orderable || t.is_panel || q);
      $('#tb', view).innerHTML = list.map(t => `<tr><td class="codeTag">${t.num_code || ''}</td><td class="codeTag">${esc(t.code)}</td><td class="en"><b>${esc(t.name)}</b>${t.is_panel ? ` <small class="pill info">پنل · ${(cat.components.get(t.id) || []).length}</small>` : ''}</td><td class="small en">${esc(t.sample || '')}</td><td class="en">${esc(t.unit || '')}</td><td class="en small">${esc(t.ref_text || (t.ref_low != null || t.ref_high != null ? `${t.ref_low ?? ''} - ${t.ref_high ?? ''}` : ''))}</td>
        <td><input class="priceInput" type="number" data-price="${t.id}" value="${t.price}"></td><td><input type="checkbox" data-active="${t.id}" ${t.active ? 'checked' : ''}></td><td><button class="btn sm" data-act="edit" data-id="${t.id}">${icon('edit', 14)}</button></td></tr>`).join('') || emptyRow(9);
    };
    $('#dl', view).onclick = (e) => { const b = e.target.closest('[data-dep]'); if (b) { dep = Number(b.dataset.dep); $('#tq', view).value = ''; drawDeps(); drawTests(); } };
    $('#tq', view).addEventListener('input', debounce(drawTests, 200));
    $('#tb', view).addEventListener('change', async (e) => {
      const p = e.target.dataset.price, a = e.target.dataset.active;
      try {
        if (p) { await API.post('/api/lab/test/save', { id: Number(p), price: e.target.value }); cat.byId.get(Number(p)).price = Number(e.target.value); e.target.classList.add('changed'); toast('قیمت ذخیره شد', 'good'); }
        if (a) { await API.post('/api/lab/test/save', { id: Number(a), active: e.target.checked }); cat.byId.get(Number(a)).active = e.target.checked ? 1 : 0; }
      } catch (err) { errToast(err); }
    });
    const edit = (t) => {
      t = t || { result_type: 'numeric', active: 1, orderable: 1, department_id: dep, price: 0 };
      const ranges = (cat.ranges.get(t.id) || []);
      const m = modal({ title: t.id ? 'ویرایش آزمایش ' + esc(t.code) : 'آزمایش جدید', size: 'wide', body: `<div class="formGrid" id="ltF">
        <label class="field"><span>کد <em>*</em></span><input name="code" class="ltr" value="${esc(t.code || '')}"></label><label class="field span2"><span>نام <em>*</em></span><input name="name" class="en" value="${esc(t.name || '')}"></label>
        <label class="field"><span>نمبر</span><input name="num_code" type="number" value="${esc(t.num_code || '')}"></label>
        <label class="field"><span>بخش</span><select name="department_id">${opt(cat.departments.map(d => [d.id, d.name_fa || d.name]), t.department_id)}</select></label>
        <label class="field"><span>نوع نتیجه</span><select name="result_type">${opt([['numeric', 'عددی'], ['option', 'انتخابی'], ['text', 'متن'], ['memo', 'متن طولانی']], t.result_type)}</select></label>
        <label class="field"><span>نمونه</span><input name="sample" class="en" value="${esc(t.sample || '')}"></label><label class="field"><span>واحد</span><input name="unit" class="en" value="${esc(t.unit || '')}"></label>
        <label class="field"><span>نارمل پایین</span><input name="ref_low" type="number" step="any" value="${esc(t.ref_low ?? '')}"></label><label class="field"><span>نارمل بالا</span><input name="ref_high" type="number" step="any" value="${esc(t.ref_high ?? '')}"></label>
        <label class="field span2"><span>نارمل (متن)</span><input name="ref_text" class="en" value="${esc(t.ref_text || '')}"></label>
        <label class="field span2"><span>گزینه‌ها (برای انتخابی، با کامه)</span><input id="ltOpts" class="en" value="${esc(JSON.parse(t.options || '[]').join(', '))}"></label>
        <label class="field"><span>قیمت</span><input name="price" type="number" value="${esc(t.price)}"></label><label class="field"><span>قیمت تمام شد</span><input name="cost" type="number" value="${esc(t.cost || 0)}"></label>
        <label class="check"><input type="checkbox" name="orderable" ${t.orderable ? 'checked' : ''}> قابل درخواست جداگانه</label><label class="check"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> فعال</label></div>
        ${ranges.length ? `<div class="mini" style="margin-top:8px">این آزمایش ${ranges.length} محدوده نارمل مخصوص سن/جنس دارد که حفظ می‌شود.</div>` : ''}`,
        foot: `<button class="btn primary" id="lt_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
      $('[data-x]', m.el).onclick = m.close;
      $('#lt_ok', m.el).onclick = () => busy($('#lt_ok', m.el), async () => {
        const v = formValues($('#ltF', m.el)); if (t.id) v.id = t.id;
        const o = $('#ltOpts', m.el).value.split(',').map(s => s.trim()).filter(Boolean); v.options = o.length ? JSON.stringify(o) : '';
        await API.post('/api/lab/test/save', v); toast('ذخیره شد', 'good'); m.close(); Object.assign(cat, await loadLabCatalog(true)); drawDeps(); drawTests();
      }).catch(errToast);
    };
    actions(view, { new: () => edit(), edit: (b) => edit(cat.byId.get(Number(b.dataset.id))) });
    drawDeps(); drawTests();
  }
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
