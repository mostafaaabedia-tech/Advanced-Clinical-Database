/* v1.4 — laboratory quality and management reports:
   internal quality control (Levey-Jennings chart + Westgard rules), critical value call log, turnaround time (TAT),
   report authenticity check (QR on the report), and the comparison report (this month / last month / same month last year). */
'use strict';

// ================================================================ critical value notification (called after saving HH / LL results)
function criticalCallDialog(r, list) {
  if (!list || !list.length) return;
  const m = modal({ title: `${icon('alert', 16)} نتیجه بحرانی — اطلاع فوری به داکتر`, size: 'wide', body: `<div class="warnBox">نتایج زیر در حد بحرانی است. به داکتر معالج اطلاع دهید و ثبت کنید چه کسی، چه وقت و چگونه خبر شد.</div>
    <table class="t"><thead><tr><th>آزمایش</th><th>نتیجه</th><th>علامت</th></tr></thead><tbody>${list.map(x => `<tr><td class="en"><b>${esc(x.test?.name || x.test?.code || '#' + x.test_id)}</b></td><td class="ltr"><b>${esc(x.value)}</b> ${esc(x.unit || '')}</td><td>${pill(x.flag, 'bad')}</td></tr>`).join('')}</tbody></table>
    <div class="formGrid" id="ccF" style="margin-top:10px"><label class="field span2"><span>به چه کسی اطلاع داده شد</span><input name="notified_to" value="${esc(r.doctor_name || '')}"></label>
      <label class="field"><span>طریقه</span><select name="method">${opt(['تلفن', 'حضوری', 'واتس‌اپ', 'سیستم (پیام)'], 'تلفن')}</select></label>
      <label class="check"><input type="checkbox" name="read_back" checked> نتیجه توسط شنونده دوباره خوانده شد (Read-back)</label>
      <label class="field full"><span>یادداشت</span><input name="note"></label></div>`, foot: `<button class="btn danger" id="cc_ok">${icon('check')} ثبت اطلاع</button><button class="btn" data-x>بعداً</button>` });
  $('[data-x]', m.el).onclick = m.close;
  $('#cc_ok', m.el).onclick = () => busy($('#cc_ok', m.el), async () => {
    const v = formValues($('#ccF', m.el)); if (!v.notified_to.trim()) throw new Error('نام شخصی که خبر شد را بنویسید');
    for (const x of list) await API.post('/api/lab/critical-call', { request_id: r.id, test_id: x.test_id, value: x.value, flag: x.flag, ...v });
    toast('اطلاع نتیجه بحرانی ثبت شد', 'good'); m.close();
  }).catch(errToast);
}

// ================================================================ QC
Pages['lab-qc'] = {
  async render(view) {
    let tab = 'qc';
    const cat = await loadLabCatalog();
    view.innerHTML = `<div class="pageHead"><div><h1>کنترل کیفیت لابراتوار (QC)</h1><p>نتیجه کنترل‌های روزانه را ثبت کنید؛ چارت Levey-Jennings و قوانین Westgard (1-3s، 2-2s، R-4s، 4-1s، 10x) خودکار بررسی می‌شود.</p></div>
      <div class="toolbar"><button class="btn primary" data-act="mat">${icon('plus')} ماده کنترل جدید</button></div></div>
      <div class="tabs" id="qcT"><button data-t="qc" class="on">${icon('chart', 14)} کنترل‌ها و چارت</button><button data-t="calls">${icon('alert', 14)} دفتر نتایج بحرانی</button></div><div id="qcB"></div>`;
    const qcUI = async () => {
      const mats = await API.get('/api/lab/qc');
      $('#qcB', view).innerHTML = mats.length ? `<div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>آزمایش</th><th>کنترل / سطح</th><th>Lot</th><th>Mean ± SD</th><th>آخرین</th><th>نتیجه امروز</th><th></th></tr></thead><tbody>${mats.map(q => { const last = q.results[q.results.length - 1];
        return `<tr class="${q.active ? '' : 'muted'}"><td class="en"><b>${esc(q.code)}</b> ${esc(q.test_name)}</td><td>${esc(q.name)} ${q.level ? pill(q.level, 'info') : ''}</td><td class="ltr">${esc(q.lot_no || '')} ${q.expiry ? `<small>${esc(q.expiry)}</small>` : ''}</td><td class="ltr">${fmtNum(q.mean)} ± ${fmtNum(q.sd)} ${esc(q.unit || q.test_unit || '')}</td>
          <td>${last ? `<span class="ltr">${fmtNum(last.value)}</span> ${last.rule ? pill(last.rule, last.accepted ? 'warn' : 'bad') : pill('OK', 'good')}` : '—'}</td>
          <td class="nowrap"><input type="number" step="any" data-v="${q.id}" style="width:100px"> <button class="btn sm primary" data-add="${q.id}">${icon('check', 13)} ثبت</button></td>
          <td class="nowrap"><button class="btn sm" data-lj="${q.id}">${icon('trend', 13)} چارت</button> <button class="btn sm ghost" data-ed="${q.id}">${icon('edit', 13)}</button></td></tr>`; }).join('')}</tbody></table></div></div><div class="card" id="ljBox"><div class="empty">برای دیدن چارت Levey-Jennings روی «چارت» کلیک کنید.</div></div>`
        : '<div class="card empty">ماده کنترلی ثبت نشده. «ماده کنترل جدید» را بزنید (آزمایش، سطح Normal / High، Mean و SD از برگه کیت کنترل).</div>';
      view._mats = mats;
      if (mats.length) lj(mats[0]);
    };
    const lj = (q) => {
      destroyCharts();
      const res = q.results; const box = $('#ljBox', view); if (!box) return;
      box.innerHTML = `<h2 class="en">${icon('trend')} Levey-Jennings — ${esc(q.code)} · ${esc(q.name)} ${esc(q.level || '')}</h2><div class="chartBox" style="height:300px"><canvas id="ljC"></canvas></div>
        <div class="tableWrap" style="margin-top:8px"><table class="t"><thead><tr><th>تاریخ</th><th>مقدار</th><th>Z</th><th>قانون</th><th>اقدام</th><th></th></tr></thead><tbody>${res.slice().reverse().slice(0, 40).map(x => `<tr><td>${fmtDate(x.date)}</td><td class="ltr">${fmtNum(x.value)}</td><td class="ltr">${((x.value - q.mean) / q.sd).toFixed(2)}</td><td>${x.rule ? pill(x.rule, x.accepted ? 'warn' : 'bad') : pill('OK', 'good')}</td><td class="small">${esc(x.action || '')}</td><td><button class="btn sm ghost dangerText" data-rdel="${x.id}">${icon('trash', 12)}</button></td></tr>`).join('') || emptyRow(6, 'هنوز نتیجه‌ای ثبت نشده')}</tbody></table></div>`;
      const lb = res.map(x => fmtDateNum(x.date).slice(5)), N = res.length;
      const flat = (k, color, dash) => ({ type: 'line', label: (k > 0 ? '+' : '') + k + 'SD', data: Array(N).fill(q.mean + k * q.sd), borderColor: color, borderDash: dash, borderWidth: k === 0 ? 1.6 : 1, pointRadius: 0, fill: false });
      const c = new Chart($('#ljC', box), { type: 'line', data: { labels: lb, datasets: [flat(3, '#e34948', [5, 3]), flat(2, '#eda100', [3, 3]), flat(1, '#c7ced8', [2, 3]), flat(0, '#1baf7a', []), flat(-1, '#c7ced8', [2, 3]), flat(-2, '#eda100', [3, 3]), flat(-3, '#e34948', [5, 3]),
        { label: q.code, data: res.map(x => x.value), borderColor: '#2a78d6', borderWidth: 2, pointRadius: 4, pointBackgroundColor: res.map(x => x.rule ? (x.accepted ? '#eda100' : '#e34948') : '#2a78d6'), fill: false, tension: 0 }] },
        options: { scales: { y: { suggestedMin: q.mean - 3.5 * q.sd, suggestedMax: q.mean + 3.5 * q.sd } }, plugins: { legend: { display: false } } } });
      App.charts.push(c);
    };
    const callsUI = async () => {
      const [f] = currentMonthRange();
      $('#qcB', view).innerHTML = `<div class="filterBar"><label class="field"><span>از</span>${dateInput('f', f, 'id="clF"')}</label><label class="field"><span>تا</span>${dateInput('t', today(), 'id="clT"')}</label></div><div class="card"><div class="tableWrap" id="clB"></div></div>`;
      const load = async () => { const l = await API.get('/api/lab/critical-calls', { from: dateOf($('#clF', view)), to: dateOf($('#clT', view)) });
        $('#clB', view).innerHTML = `<table class="t"><thead><tr><th>وقت</th><th>کد</th><th>مریض</th><th>آزمایش</th><th>نتیجه</th><th>به</th><th>طریقه</th><th>Read-back</th><th>ثبت توسط</th></tr></thead><tbody>${l.map(c => `<tr><td class="nowrap">${fmtDateTime(c.at)}</td><td class="codeTag">${esc(c.lab_code)}</td><td>${esc(c.full_name)}</td><td class="en">${esc(c.code || '')} ${esc(c.test_name || '')}</td><td class="ltr"><b>${esc(c.value)}</b> ${pill(c.flag, 'bad')}</td><td>${esc(c.notified_to || '')}</td><td>${esc(c.method || '')}</td><td>${c.read_back ? '✓' : ''}</td><td class="small">${esc(c.user_name || '')}</td></tr>`).join('') || emptyRow(9)}</tbody></table>`; };
      $$('#clF, #clT', view).forEach(e => e.addEventListener('change', load)); await load();
    };
    const show = () => { $$('#qcT button', view).forEach(b => b.classList.toggle('on', b.dataset.t === tab)); return tab === 'qc' ? qcUI() : callsUI(); };
    $('#qcT', view).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; show().catch(errToast); } };
    const matDialog = (q) => {
      q = q || { active: 1 };
      const tests = cat.tests.filter(t => t.result_type === 'numeric' && !t.is_panel);
      const m = modal({ title: q.id ? 'ویرایش ماده کنترل' : 'ماده کنترل جدید', size: 'wide', body: `<div class="formGrid" id="qmF">
        <label class="field span2"><span>آزمایش</span><select name="test_id">${opt(tests.map(t => [t.id, `${t.code} — ${t.name}`]), q.test_id)}</select></label>
        <label class="field"><span>نام کنترل</span><input name="name" class="en" value="${esc(q.name || 'Control')}"></label><label class="field"><span>سطح</span><select name="level">${opt(['Normal', 'Abnormal', 'Low', 'High', 'Level 1', 'Level 2', 'Level 3'], q.level || 'Normal')}</select></label>
        <label class="field"><span>Lot</span><input name="lot_no" class="ltr" value="${esc(q.lot_no || '')}"></label><label class="field"><span>انقضا</span><input name="expiry" type="month" value="${esc(q.expiry || '')}"></label>
        <label class="field"><span>Mean</span><input name="mean" type="number" step="any" value="${esc(q.mean ?? '')}"></label><label class="field"><span>SD</span><input name="sd" type="number" step="any" value="${esc(q.sd ?? '')}"></label>
        <label class="check"><input type="checkbox" name="active" ${q.active ? 'checked' : ''}> فعال</label></div>`, foot: `<button class="btn primary" id="qm_ok">ذخیره</button>` });
      $('#qm_ok', m.el).onclick = () => busy($('#qm_ok', m.el), async () => { await API.post('/api/lab/qc/material', { id: q.id, ...formValues($('#qmF', m.el)) }); m.close(); show(); }).catch(errToast);
    };
    view.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-add],[data-lj],[data-ed],[data-rdel]'); if (!b) return; const mats = view._mats || [];
      try {
        if (b.dataset.add) { const inp = $(`[data-v="${b.dataset.add}"]`, view); if (inp.value === '') return inp.focus(); const r = await API.post('/api/lab/qc/result', { material_id: Number(b.dataset.add), value: inp.value });
          if (r.rule && !r.accepted) { const act = await promptDlg(`رد شد — قانون ${r.rule}`, { label: 'اقدام اصلاحی (کالیبره، کنترل تازه، کیت جدید…)' }); if (act) { await API.post('/api/lab/qc/result-action/' + r.id, { action: act }); toast('اقدام اصلاحی ثبت شد', 'good'); } } else toast(r.rule ? `هشدار ${r.rule} — قبول با احتیاط` : 'کنترل قبول شد ✓', r.rule ? 'warn' : 'good');
          await show(); lj((view._mats || []).find(x => x.id === Number(b.dataset.add))); }
        if (b.dataset.lj) lj(mats.find(x => x.id === Number(b.dataset.lj)));
        if (b.dataset.ed) matDialog(mats.find(x => x.id === Number(b.dataset.ed)));
        if (b.dataset.rdel && await confirmDlg('این نتیجه کنترل حذف شود؟')) { await API.post('/api/lab/qc/result-del/' + b.dataset.rdel); show(); }
      } catch (err) { errToast(err); }
    });
    actions(view, { mat: () => matDialog() });
    await show();
  }
};

// ================================================================ turnaround time
Pages['lab-tat'] = {
  async render(view) {
    const [f] = currentMonthRange();
    view.innerHTML = `<div class="pageHead"><div><h1>زمان جوابدهی آزمایش (TAT)</h1><p>از پذیرش تا نمونه، تکمیل نتایج و تأیید — و آزمایش‌هایی که از وقت مقرر (TAT هر آزمایش) دیرتر شده‌اند.</p></div><div class="toolbar"><button class="btn" data-act="print">${icon('print')} چاپ</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('f', f, 'id="tF"')}</label><label class="field"><span>تا</span>${dateInput('t', today(), 'id="tT"')}</label><label class="check"><input type="checkbox" id="tLate"> فقط دیر شده‌ها</label></div>
      <div class="grid g4" id="tK" style="margin-bottom:14px"></div><div class="card"><div class="tableWrap" id="tB"></div></div>`;
    const mins = (a, b) => a && b ? Math.max(0, (new Date(b.replace(' ', 'T')) - new Date(a.replace(' ', 'T'))) / 60000) : null;
    const dur = (m) => m === null ? '—' : m < 60 ? Math.round(m) + ' دقیقه' : m < 1440 ? (m / 60).toFixed(1) + ' ساعت' : (m / 1440).toFixed(1) + ' روز';
    const load = async () => {
      const rows = (await API.get('/api/lab/tat', { from: dateOf($('#tF', view)), to: dateOf($('#tT', view)) })).map(r => { const start = r.received_at || r.created_at; const end = r.approved_at || r.completed_at; const tot = mins(start, end); const lim = (r.tat_hours || 24) * 60;
        return { ...r, t_sample: mins(start, r.sampled_at), t_result: mins(r.sampled_at || start, r.completed_at), t_total: tot, late: tot !== null ? tot > lim : (mins(start, new Date().toISOString().slice(0, 19).replace('T', ' ')) > lim && !['approved', 'delivered'].includes(r.status)), lim }; });
      const done = rows.filter(r => r.t_total !== null), late = rows.filter(r => r.late);
      const avg = (k) => { const l = rows.filter(r => r[k] !== null); return l.length ? l.reduce((a, r) => a + r[k], 0) / l.length : null; };
      const sorted = done.map(r => r.t_total).sort((a, b) => a - b); const p90 = sorted.length ? sorted[Math.floor(sorted.length * 0.9) - (sorted.length * 0.9 % 1 === 0 ? 1 : 0)] ?? sorted[sorted.length - 1] : null;
      $('#tK', view).innerHTML = kpi('درخواست‌ها', rows.length, { ic: 'flask', sub: `${done.length} تأیید شده` }) + kpi('میانگین کل', dur(avg('t_total')), { ic: 'clock' }) + kpi('۹۰٪ آزمایش‌ها تا', dur(p90), { ic: 'trend', cls: 'violet' }) + kpi('دیر شده', `${late.length} (${rows.length ? Math.round(late.length / rows.length * 100) : 0}٪)`, { ic: 'alert', cls: late.length ? 'bad' : 'good' });
      const list = $('#tLate', view).checked ? late : rows;
      $('#tB', view).innerHTML = `<table class="t"><thead><tr><th>کد</th><th>تاریخ</th><th>مریض</th><th>آزمایش‌ها</th><th>تا نمونه</th><th>تا نتیجه</th><th>کل (تا تأیید)</th><th>حد</th><th>وضعیت</th></tr></thead><tbody>${list.map(r => `<tr class="${r.late ? 'lateRow' : ''}"><td class="codeTag">${esc(r.lab_code)}</td><td>${fmtDate(r.date)}</td><td>${esc(r.full_name)} ${r.urgent ? pill('عاجل', 'bad') : ''}</td><td class="en small">${esc(r.tests || '')}</td><td>${dur(r.t_sample)}</td><td>${dur(r.t_result)}</td><td><b>${dur(r.t_total)}</b></td><td class="small">${dur(r.lim)}</td><td>${r.late ? pill('دیر', 'bad') : statusPill(LAB_STATUS, r.status)}</td></tr>`).join('') || emptyRow(9)}</tbody></table>`;
    };
    $$('#tF, #tT', view).forEach(e => e.addEventListener('change', load)); $('#tLate', view).onchange = load;
    actions(view, { print: () => previewDoc(reportDocHTML('زمان جوابدهی آزمایش (TAT)', $('#tK', view).innerText.replace(/\n+/g, ' · ') + `<table class="rt">${$('#tB table', view).innerHTML.replace(/<span class="pill[^>]*>([^<]*)<\/span>/g, '$1')}</table>`), { title: 'TAT' }) });
    await load();
  }
};

// ================================================================ verify a printed lab report (QR / code + key)
Pages.verify = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>تأیید اصالت راپور</h1><p>QR پایین راپور لابراتوار را با بارکود‌خوان اسکن کنید یا کد و کلید را بنویسید (مثلاً <span class="ltr">LB-00045 3FA9C21B</span>) تا معلوم شود راپور جعلی یا تغییر داده شده نیست.</p></div></div>
      <div class="card"><div class="searchBox"><input id="vfQ" placeholder="ACDB-VERIFY LB-00045 3FA9C21B" class="ltr" autofocus></div><div class="bar" style="margin-top:10px"><button class="btn primary" data-act="go">${icon('search')} بررسی</button></div></div><div id="vfR"></div>`;
    const run = async () => {
      const q = $('#vfQ', view).value.trim(); if (!q) return;
      try {
        const r = await API.get('/api/verify', { q });
        $('#vfR', view).innerHTML = !r.found ? `<div class="card verifyBad pop">${icon('x', 22)} <b>راپوری با کد ${esc(r.code)} در سیستم نیست.</b></div>`
          : `<div class="card pop ${r.key_ok === false ? 'verifyBad' : 'verifyOk'}"><h2>${r.key_ok === false ? icon('alert') + ' کلید تأیید درست نیست — این راپور ممکن است جعلی باشد' : r.key_ok ? icon('check') + ' راپور اصل است' : icon('check') + ' راپور در سیستم موجود است (کلید وارد نشده)'}</h2>
            <div class="infoGrid" style="grid-template-columns:repeat(3,1fr)"><div>کد: <b class="ltr">${esc(r.request.lab_code)}</b></div><div>مریض: <b>${esc(r.request.full_name)}</b> <small>${esc(r.request.father_name || '')}</small></div><div>تاریخ: <b>${fmtDate(r.request.date)}</b></div><div>وضعیت: ${statusPill(LAB_STATUS, r.request.status)}</div><div>تأیید: ${r.request.approved_at ? fmtDateTime(r.request.approved_at) : '—'}</div></div>
            <table class="t" style="margin-top:10px"><thead><tr><th>Test</th><th>Result</th><th>Unit</th></tr></thead><tbody>${r.tests.map(t => `<tr><td class="en">${esc(t.code)} — ${esc(t.name)}</td><td class="ltr"><b>${esc(t.value)}</b> ${t.flag ? `<small>${esc(t.flag)}</small>` : ''}</td><td>${esc(t.unit || '')}</td></tr>`).join('')}</tbody></table>
            <div class="mini muted">نتایج بالا را با کاغذ راپور مقایسه کنید؛ اگر فرق داشت، راپور تغییر داده شده است.</div></div>`;
      } catch (e) { errToast(e); }
    };
    $('#vfQ', view).addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    actions(view, { go: run });
  }
};

// ================================================================ comparison report
Pages.compare = {
  async render(view) {
    const ms = lastMonths(13); const cur = ms[ms.length - 1], prev = ms[ms.length - 2], ly = ms[0];
    view.innerHTML = `<div class="pageHead"><div><h1>گزارش مقایسه‌ای</h1><p>این ماه در برابر ماه گذشته و همین ماه سال قبل — مراجعین، مریضان جدید و برگشتی، درآمد هر بخش، مصارف و برداشت‌ها.</p></div>
      <div class="toolbar"><select id="cmM" style="width:auto">${opt(ms.slice().reverse().map((m, i) => [ms.length - 1 - i, m.label]), ms.length - 1)}</select><button class="btn" data-act="print">${icon('print')} چاپ</button></div></div>
      <div class="card"><div class="tableWrap" id="cmB"></div></div><div class="card"><h2>${icon('chart')} درآمد بخش‌ها</h2><div class="chartBox"><canvas id="cmC"></canvas></div></div>`;
    const load = async () => {
      destroyCharts();
      const i = Number($('#cmM', view).value); const a = ms[i], b = ms[i - 1];
      const [y, mo] = a.key.split('-').map(Number); const lyKey = `${y - 1}-${String(mo).padStart(2, '0')}`; const lyR = monthRange(lyKey);
      const ranges = [{ label: a.label, from: a.range[0], to: a.range[1] }, ...(b ? [{ label: b.label, from: b.range[0], to: b.range[1] }] : []), { label: monthKey(lyR[0]).label, from: lyR[0], to: lyR[1] }];
      const r = await API.post('/api/reports/compare', { ranges });
      const ROWS = [['visits', 'مراجعات (ویزیت)', 0], ['patients', 'مریضان', 0], ['new_patients', 'مریضان جدید', 0], ['returning', 'مریضان برگشتی', 0], ['rx', 'نسخه‌ها', 0], ['labs', 'درخواست آزمایش', 0],
        ['reception', 'درآمد پذیرش (فیس)', 1], ['pharmacy', 'فروش دواخانه', 1], ['ph_profit', 'مفاد دواخانه', 1], ['lab', 'درآمد لابراتوار', 1], ['ipd', 'بستر', 1], ['income', 'مجموع درآمد', 1], ['expenses', 'مصارف', 1], ['withdrawals', 'برداشت‌ها', 1], ['purchases', 'خرید دوا', 1]];
      const ch = (x, y) => { if (!y) return x ? '<span class="pos">جدید</span>' : ''; const p = Math.round((x - y) / Math.abs(y) * 100); return `<span class="${p > 0 ? 'pos' : p < 0 ? 'neg' : 'muted'}">${p > 0 ? '▲' : p < 0 ? '▼' : ''} ${Math.abs(p)}٪</span>`; };
      $('#cmB', view).innerHTML = `<table class="t"><thead><tr><th></th>${r.map(x => `<th>${esc(x.label)}</th>`).join('')}<th>تغییر نسبت به ماه قبل</th><th>تغییر نسبت به سال قبل</th></tr></thead><tbody>${ROWS.map(([k, l, isM]) => `<tr class="${k === 'income' ? 'totRow' : ''}"><td><b>${l}</b></td>${r.map(x => `<td class="${isM ? 'money' : ''}">${isM ? money(x[k]) : fmtNum(x[k])}</td>`).join('')}<td>${r[1] && r.length > 2 ? ch(r[0][k], r[1][k]) : ''}</td><td>${ch(r[0][k], r[r.length - 1][k])}</td></tr>`).join('')}</tbody></table>`;
      barChart($('#cmC', view), ['پذیرش', 'دواخانه', 'لابراتوار', 'بستر'], r.map(x => ({ label: x.label, data: [x.reception, x.pharmacy, x.lab, x.ipd] })), { money: true });
      view._html = $('#cmB table', view).outerHTML.replace('class="t"', 'class="rt"');
    };
    $('#cmM', view).onchange = load;
    actions(view, { print: () => previewDoc(reportDocHTML('گزارش مقایسه‌ای', view._html), { title: 'مقایسه' }) });
    await load();
  }
};
