/* Laboratory: reception types (free / insurance contracts), outside referring doctors, patient statistics and referring doctors' income
   (functions of the laboratory's previous program) */
'use strict';

const REQ_FIELDS = [['tazkira', 'نمبر تذکره'], ['phone', 'شماره تلفن'], ['birth_date', 'سن'], ['father_name', 'ولد'], ['address', 'آدرس'], ['insurance_no', 'شماره بیمه']];

// ================================================================ reception types & referring doctors
Pages['lab-setup'] = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>انواع پذیرش و داکتران معرف</h1><p>نوع پذیرش (آزاد، بیمه، قرارداد) نرخ، سهم مریض و سهم مؤسسه را تعیین می‌کند. داکتران بیرونی که مریض می‌فرستند با نمبر نظام طبی ثبت می‌شوند.</p></div></div>
      <div class="card"><div class="cardHead"><h2>${icon('list')} انواع پذیرش / قراردادها</h2><button class="btn primary sm" data-act="newT">${icon('plus', 14)} نوع جدید</button></div><div class="tableWrap"><table class="t"><thead><tr><th>نام</th><th>کد</th><th>مبنای نرخ</th><th>سهم مریض ٪</th><th>سهم مؤسسه ٪</th><th>افزایش نرخ ٪</th><th>تخفیف ٪</th><th>حداکثر آزمایش</th><th>معلومات لازم</th><th>وضعیت</th><th></th></tr></thead><tbody id="tB"></tbody></table></div></div>
      <div class="card"><div class="cardHead"><h2>${icon('steth')} داکتران معرف بیرونی</h2><div class="bar"><input id="rQ" placeholder="جستجو…" style="width:200px"><button class="btn primary sm" data-act="newR">${icon('plus', 14)} داکتر معرف</button></div></div><div class="tableWrap"><table class="t"><thead><tr><th>نام</th><th>نظام طبی</th><th>تخصص</th><th>تلفن</th><th>کلینیک</th><th>تخفیف ٪</th><th>وضعیت</th><th></th></tr></thead><tbody id="rB"></tbody></table></div></div>`;
    let types = [], refs = [];
    const load = async () => {
      [types, refs] = await Promise.all([API.list('lab_reception_types', { limit: 200 }), API.list('lab_referrers', { limit: 2000 })]);
      $('#tB', view).innerHTML = types.map(x => { let rf = []; try { rf = JSON.parse(x.required_fields || '[]'); } catch (_) { }
        return `<tr><td><b>${esc(x.name)}</b>${x.org_name ? ` <small class="muted">${esc(x.org_name)}</small>` : ''}</td><td class="codeTag">${esc(x.code || '')}</td><td>${x.price_basis === 'insurance' ? 'نرخ بیمه' : 'نرخ آزاد'}</td><td>${fmtNum(x.patient_pct)}</td><td>${fmtNum(100 - x.patient_pct)}</td><td>${fmtNum(x.increase_pct) || ''}</td><td>${fmtNum(x.discount_pct) || ''}</td><td>${x.max_tests || ''}</td><td class="small">${rf.map(f => (REQ_FIELDS.find(y => y[0] === f) || [f, f])[1]).join('، ')}</td><td>${x.active ? pill('فعال', 'good') : pill('غیرفعال', 'bad')}</td><td><button class="btn sm" data-act="editT" data-id="${x.id}">${icon('edit', 14)}</button></td></tr>`; }).join('') || emptyRow(11);
      drawR();
    };
    const drawR = () => { const q = $('#rQ', view).value.trim().toLowerCase();
      $('#rB', view).innerHTML = refs.filter(x => !q || [x.name, x.council_no, x.specialty, x.phone].some(v => String(v || '').toLowerCase().includes(q))).map(x => `<tr><td><b>${esc(x.name)}</b></td><td class="ltr">${esc(x.council_no || '')}</td><td>${esc(x.specialty || '')}</td><td class="ltr">${esc(x.phone || '')}</td><td>${esc(x.clinic || '')}</td><td>${fmtNum(x.discount_pct) || ''}</td><td>${x.active ? pill('فعال', 'good') : pill('غیرفعال', 'bad')}</td><td><button class="btn sm" data-act="editR" data-id="${x.id}">${icon('edit', 14)}</button></td></tr>`).join('') || emptyRow(8); };
    $('#rQ', view).addEventListener('input', debounce(drawR, 150));
    const editT = (x) => {
      x = x || { price_basis: 'free', patient_pct: 100, increase_pct: 0, discount_pct: 0, active: 1, sort: types.length + 1 };
      let rf = []; try { rf = JSON.parse(x.required_fields || '[]'); } catch (_) { }
      const m = modal({ title: x.id ? 'ویرایش نوع پذیرش' : 'نوع پذیرش جدید', size: 'wide', body: `<div class="formGrid" id="rtF">
        <label class="field span2"><span>نام نوع پذیرش <em>*</em></span><input name="name" value="${esc(x.name || '')}" placeholder="مثلاً: عادی، بیمه سلامت، کارمندان…"></label><label class="field"><span>کد</span><input name="code" class="ltr" value="${esc(x.code || '')}"></label>
        <label class="field"><span>نام مؤسسه / بیمه</span><input name="org_name" value="${esc(x.org_name || '')}"></label>
        <label class="field"><span>مبنای محاسبه نرخ</span><select name="price_basis">${opt([['free', 'نرخ آزاد'], ['insurance', 'نرخ بیمه']], x.price_basis)}</select></label>
        <label class="field"><span>سهم مریض (فرانشیز) ٪</span><input name="patient_pct" type="number" value="${esc(x.patient_pct)}"></label>
        <label class="field"><span>افزایش بهای خدمات ٪</span><input name="increase_pct" type="number" value="${esc(x.increase_pct || 0)}"></label>
        <label class="field"><span>تخفیف مبلغ قابل پرداخت ٪</span><input name="discount_pct" type="number" value="${esc(x.discount_pct || 0)}"></label>
        <label class="field"><span>حداکثر تعداد آزمایش در هر پذیرش</span><input name="max_tests" type="number" value="${esc(x.max_tests || '')}"></label>
        <label class="field"><span>ترتیب</span><input name="sort" type="number" value="${esc(x.sort || 0)}"></label>
        <label class="field full"><span>یادداشت</span><input name="notes" value="${esc(x.notes || '')}"></label>
        <label class="check"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> فعال</label></div>
        <div class="secTitle">معلومات لازم در پذیرش (اجباری)</div><div class="chips" id="rtReq">${REQ_FIELDS.map(([k, l]) => `<button type="button" class="chip ${rf.includes(k) ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
        <div class="infoBox" style="margin-top:10px">مثال: بیمه‌ای که ۷۰٪ را می‌پردازد → سهم مریض ۳۰٪. سهم مؤسسه در «آمار مراجعین» جدا حساب می‌شود و مریض فقط سهم خودش را می‌پردازد.</div>`,
        foot: `<button class="btn primary" id="rt_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
      $('#rtReq', m.el).onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) b.classList.toggle('on'); };
      $('[data-x]', m.el).onclick = m.close;
      $('#rt_ok', m.el).onclick = () => busy($('#rt_ok', m.el), async () => {
        const v = formValues($('#rtF', m.el)); if (x.id) v.id = x.id; if (!v.name.trim()) throw new Error('نام الزامی است');
        if (Number(v.patient_pct) < 0 || Number(v.patient_pct) > 100) throw new Error('سهم مریض باید بین ۰ و ۱۰۰ باشد');
        v.required_fields = JSON.stringify($$('#rtReq .chip.on', m.el).map(b => b.dataset.f));
        await API.save('lab_reception_types', v); m.close(); await loadLabCatalog(true); load();
      }).catch(errToast);
    };
    actions(view, { newT: () => editT(), editT: (b) => editT(types.find(x => x.id === Number(b.dataset.id))),
      newR: () => labReferrerDialog(null, async () => { await loadLabCatalog(true); load(); }), editR: (b) => labReferrerDialog(refs.find(x => x.id === Number(b.dataset.id)), async () => { await loadLabCatalog(true); load(); }) });
    await load();
  }
};

// ================================================================ patient statistics & referring doctors' income
Pages['lab-reports'] = {
  async render(view, params) {
    const cat = await loadLabCatalog();
    let tab = params.tab || 'stats', data = null, inc = null;
    view.innerHTML = `<div class="pageHead"><div><h1>آمار مراجعین و درآمد داکتران معرف</h1><p>گزارش با شرط‌های مختلف: وضعیت پرداخت، عاجل، تخفیف، جنس، داکتر، نوع پذیرش، بخش و آزمایش، بازه ساعت و شماره پذیرش.</p></div>
      <div class="toolbar"><button class="btn" data-act="print">${icon('print')} چاپ</button><button class="btn" data-act="csv">${icon('download')} CSV</button></div></div>
      <div class="tabs" id="rpT"><button data-t="stats">آمار مراجعین</button><button data-t="income">درآمد پزشکان معرف</button></div>
      <div id="rpBody"></div>`;
    const drawTabs = () => $$('#rpT button', view).forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    // ---------------- patient statistics
    const statsUI = () => {
      const docs = [...App.doctors.map(d => ['d' + d.id, doctorName(d)]), ...cat.referrers.map(r => ['r' + r.id, r.name + (r.council_no ? ' (' + r.council_no + ')' : '')])];
      const specs = [...new Set([...cat.referrers.map(r => r.specialty), ...(App.departments || []).map(d => d.name)].filter(Boolean))];
      $('#rpBody', view).innerHTML = `<div class="card"><div class="formGrid statF" id="sF">
        <label class="field"><span>از تاریخ</span>${dateInput('from', today(), 'id="s_from"')}</label><label class="field"><span>تا تاریخ</span>${dateInput('to', today(), 'id="s_to"')}</label>
        <label class="field"><span>از ساعت</span><input type="time" name="time_from"></label><label class="field"><span>تا ساعت</span><input type="time" name="time_to"></label>
        <label class="field"><span>از شماره پذیرش</span><input name="no_from" type="number"></label><label class="field"><span>تا شماره</span><input name="no_to" type="number"></label>
        <label class="field"><span>وضعیت پرداخت</span><select name="pay">${opt([['', 'بدون شرط'], ['settled', 'تسویه'], ['debtor', 'بدهکار'], ['creditor', 'بستانکار']], '')}</select></label>
        <label class="field"><span>وضعیت مراجعه</span><select name="urgent">${opt([['', 'بدون شرط'], ['0', 'عادی'], ['1', 'اورژانس (عاجل)']], '')}</select></label>
        <label class="field"><span>وضعیت جواب</span><select name="answer">${opt([['', 'بدون شرط'], ['complete', 'کامل'], ['incomplete', 'ناقص']], '')}</select></label>
        <label class="field"><span>تخفیف</span><select name="discount">${opt([['', 'بدون شرط'], ['1', 'دارد'], ['0', 'ندارد']], '')}</select></label>
        <label class="field"><span>دلیل تخفیف</span><input name="discount_reason" list="sDr"></label><label class="field"><span>تخفیف دهنده</span><input name="discount_by"></label>
        <label class="field"><span>جنسیت</span><select name="sex">${opt([['', 'بدون شرط'], ['M', 'مرد'], ['F', 'زن']], '')}</select></label>
        <label class="field"><span>نوع پذیرش</span><select name="reception_type_id">${opt(cat.reception_types.map(x => [x.id, x.name]), '', { empty: 'همه' })}</select></label>
        <label class="field"><span>منبع</span><select name="source">${opt([['', 'همه'], ['doctor', 'از داکتر کلینیک'], ['walkin', 'مراجعه مستقیم / پذیرش']], '')}</select></label>
        <label class="field"><span>ارسالی (Send-out)</span><select name="sendout">${opt([['', 'بدون شرط'], ['1', 'ارسالی'], ['0', 'غیر ارسالی']], '')}</select></label>
        <label class="field"><span>ابطالی‌ها</span><select name="cancelled">${opt([['', 'بدون ابطالی'], ['only', 'فقط ابطالی'], ['all', 'همه']], '')}</select></label>
        <label class="field"><span>تخصص</span><select name="specialty">${opt(specs, '', { empty: 'همه' })}</select></label>
        <label class="field span2"><span>پزشک معرف</span><select id="sDoc" multiple size="4">${opt(docs, '')}</select></label>
        <label class="field span2"><span>بخش</span><select id="sDep" multiple size="4">${opt(cat.departments.map(d => [d.id, d.name]), '')}</select></label>
        <label class="field span2"><span>آزمایش</span><input id="sTest" list="sTests" placeholder="کد آزمایش‌ها با کامه: CBC, FBS"></label>
        ${datalist('sTests', cat.tests.filter(t => t.active).map(t => t.code))}${datalist('sDr', listSetting('lab_discount_reasons'))}</div>
        <div class="bar" style="margin-top:10px;flex-wrap:wrap"><span>نوع گزارش:</span><select id="sKind" style="width:auto">${opt([['standard', 'گزارش استاندارد (لیست + جمع کل)'], ['shares', 'سهم بیمار و سازمان + پرداخت شده و باقیمانده'], ['doctor', 'با نام پزشک معرف'], ['count', 'تعداد و میانگین پذیرش (روزانه)'], ['discounts', 'تخفیف‌ها به تفکیک تخفیف دهنده'], ['payments', 'پرداخت‌های نقد و کارت'], ['repeated', 'آزمایش‌های تکرار شده در پذیرش'], ['tests', 'آزمایش‌ها و بخش‌ها'], ['types', 'به تفکیک نوع پذیرش'], ['hours', 'تراکم پذیرش در ساعات مختلف']], 'standard')}</select>
          <button class="btn primary" data-act="run">${icon('search')} گزارش</button></div></div>
        <div id="sOut"></div>`;
      $('#sKind', view).onchange = () => data && drawStats();
    };
    const statsQuery = () => {
      const f = formValues($('#sF', view)); const q = { ...f, from: dateOf($('#s_from', view)), to: dateOf($('#s_to', view)) };
      delete q.undefined;
      const ds = [...$('#sDoc', view).selectedOptions].map(o => o.value);
      q.doctor_ids = ds.filter(x => x[0] === 'd').map(x => x.slice(1)).join(','); q.referrer_ids = ds.filter(x => x[0] === 'r').map(x => x.slice(1)).join(',');
      q.dept_ids = [...$('#sDep', view).selectedOptions].map(o => o.value).join(',');
      const codes = $('#sTest', view).value.split(/[,،\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
      q.test_ids = cat.tests.filter(t => codes.includes(t.code.toUpperCase())).map(t => t.id).join(',');
      Object.keys(q).forEach(k => { if (q[k] === '' || q[k] == null) delete q[k]; });
      return q;
    };
    const tot = (t) => `<div class="totBox"><table class="t"><tbody>
      <tr><td>تعداد مراجعین</td><td><b>${t.count}</b></td></tr><tr><td>جمع کل</td><td><b>${money(t.subtotal)}</b></td></tr><tr><td>سهم مؤسسه / بیمه</td><td>${money(t.org_share)}</td></tr><tr><td>سهم مراجعه کننده</td><td>${money(t.patient_share)}</td></tr>
      <tr><td>تخفیف آزمایشگاه</td><td>${money(t.discount)}</td></tr><tr><td>قابل پرداخت</td><td><b>${money(t.net)}</b></td></tr><tr><td>پرداخت شده نقدی</td><td>${money(t.cash)}</td></tr><tr><td>پرداخت شده کارت</td><td>${money(t.card)}</td></tr>${t.transfer ? `<tr><td>حواله</td><td>${money(t.transfer)}</td></tr>` : ''}
      <tr><td>پرداخت شده (نقد + کارت)</td><td><b>${money(t.paid)}</b></td></tr><tr><td>باقیمانده</td><td class="${t.balance > 0 ? 'neg' : ''}"><b>${money(t.balance)}</b></td></tr><tr><td>سهم سازمان + پرداخت شده + باقیمانده</td><td>${money(r2(t.org_share + t.paid + t.balance))}</td></tr></tbody></table></div>`;
    const grpTable = (rows, head = 'گروه') => `<table class="t"><thead><tr><th>${head}</th><th>تعداد</th><th>جمع کل</th><th>تخفیف</th><th>قابل پرداخت</th><th>پرداخت شده</th></tr></thead><tbody>${rows.map(g => `<tr><td>${esc(g.key)}</td><td>${g.count}</td><td>${money(g.subtotal)}</td><td>${money(g.discount)}</td><td>${money(g.net)}</td><td>${money(g.paid)}</td></tr>`).join('') || emptyRow(6)}</tbody></table>`;
    const drawStats = () => {
      const k = $('#sKind', view).value, d = data, t = d.totals;
      let main = '';
      const SHARES = k === 'shares', DOC = k === 'doctor';
      if (['standard', 'shares', 'doctor'].includes(k)) main = `<table class="t"><thead><tr><th>ردیف</th><th>پذیرش</th><th>تاریخ</th><th>نوع پذیرش</th><th>نام مراجعه کننده</th>${DOC ? '<th>پزشک معرف</th>' : ''}<th>جمع کل</th>${SHARES ? '<th>سهم سازمان</th><th>سهم مریض</th>' : ''}<th>تخفیف</th><th>قابل پرداخت</th><th>پرداخت شده</th><th>باقیمانده</th></tr></thead>
        <tbody>${d.rows.map((r, i) => `<tr class="${r.status === 'cancelled' ? 'muted' : ''}"><td>${i + 1}</td><td class="codeTag">${esc(r.lab_code)}</td><td class="nowrap">${fmtDateNum(r.date)} <small class="muted">${fmtTime(r.created_at)}</small></td><td>${esc(r.reception_type || 'عادی')}</td><td><b>${esc(r.full_name)}</b> <small class="muted">${esc(r.father_name || '')}</small>${r.urgent ? ' ' + pill('عاجل', 'bad') : ''}</td>${DOC ? `<td>${esc(r.doctor_name || '—')}</td>` : ''}
          <td>${money(r.subtotal)}</td>${SHARES ? `<td>${money(r.org_share)}</td><td>${money(r.subtotal - r.org_share)}</td>` : ''}<td>${r.discount ? money(r.discount) : '-'}</td><td>${money(r.net)}</td><td>${r.paid ? money(r.paid) : '-'}</td><td class="${r.balance > 0.001 ? 'neg' : ''}">${r.balance ? money(r.balance) : '-'}</td></tr>`).join('') || emptyRow(12)}</tbody></table>`;
      if (k === 'count') main = grpTable(d.byDay.map(g => ({ ...g, key: fmtDate(g.key) })), 'روز') + `<div class="sum"><span>میانگین پذیرش در روز: <b>${d.byDay.length ? (t.count / d.byDay.length).toFixed(1) : 0}</b></span><span>میانگین مبلغ هر پذیرش: <b>${money(t.count ? t.subtotal / t.count : 0)}</b></span><span>نمونه‌گیری در محل: <b>${d.sampled}</b></span></div>`;
      if (k === 'discounts') main = grpTable(d.discounts, 'تخفیف دهنده — دلیل');
      if (k === 'payments') main = `<table class="t"><thead><tr><th>طریقه</th><th>تعداد</th><th>مبلغ</th></tr></thead><tbody>${d.pays.map(p => `<tr><td>${esc(payMethodFa(p.method))}</td><td>${p.c}</td><td>${money(p.s)}</td></tr>`).join('') || emptyRow(3)}</tbody></table>`;
      if (k === 'repeated') main = `<table class="t"><thead><tr><th>کد مریض</th><th>نام</th><th>آزمایش</th><th>تکرار</th><th>پذیرش‌ها</th></tr></thead><tbody>${d.repeated.map(x => `<tr><td class="codeTag">${esc(x.patient_code)}</td><td>${esc(x.full_name)}</td><td class="en">${esc(x.code)} — ${esc(x.name)}</td><td><b>${x.times}</b></td><td class="ltr small">${esc(x.codes)}</td></tr>`).join('') || emptyRow(5, 'آزمایش تکراری نیست')}</tbody></table>`;
      if (k === 'tests') main = `<table class="t"><thead><tr><th>بخش</th><th>کد</th><th>آزمایش</th><th>تعداد</th><th>مبلغ</th><th>سهم مؤسسه</th></tr></thead><tbody>${d.byTest.map(x => `<tr><td>${esc(x.dept || '')}</td><td class="codeTag">${esc(x.code)}</td><td class="en">${esc(x.name)}</td><td>${x.count}</td><td>${money(x.revenue)}</td><td>${money(x.org)}</td></tr>`).join('') || emptyRow(6)}</tbody></table>`;
      if (k === 'types') main = grpTable(d.byType, 'نوع پذیرش');
      if (k === 'hours') main = `<div class="chartBox"><canvas id="hC"></canvas></div>` + grpTable(d.byHour, 'ساعت');
      $('#sOut', view).innerHTML = `<div class="grid g-21" style="margin-top:14px"><div class="card"><div class="tableWrap" style="max-height:640px">${main}</div></div><div class="card"><h2>جمع کل</h2>${tot(t)}</div></div>`;
      if (k === 'hours') { destroyCharts(); barChart($('#hC', view), d.byHour.map(x => x.key), [{ label: 'تعداد پذیرش', data: d.byHour.map(x => x.count) }]); }
    };
    // ---------------- referring doctors' income
    const incomeUI = () => {
      const months = lastMonths(12);
      $('#rpBody', view).innerHTML = `<div class="card"><div class="formGrid">
        <label class="field"><span>از تاریخ</span>${dateInput('from', currentMonthRange()[0], 'id="i_from"')}</label><label class="field"><span>تا تاریخ</span>${dateInput('to', today(), 'id="i_to"')}</label>
        <label class="field"><span>نوع آزمایشات (بخش)</span><select id="i_dep">${opt(cat.departments.map(d => [d.id, d.name]), '', { empty: 'بدون شرط' })}</select></label>
        <label class="field"><span>نوع پذیرش</span><select id="i_src">${opt([['', 'بدون شرط'], ['doctor', 'از داکتر کلینیک'], ['walkin', 'مراجعه مستقیم / پذیرش']], '')}</select></label>
        <label class="field"><span>مرتب سازی بر اساس</span><select id="i_sort">${opt([['income', 'درآمد'], ['patients', 'تعداد مراجعین'], ['council_no', 'نمبر نظام طبی']], 'income')}</select></label>
        <label class="field"><span>درصد نمایش مبالغ</span><input id="i_pct" type="number" value="100"></label>
        <label class="field span2"><span>جستجوی پزشک</span><input id="i_q"></label></div>
        <div class="bar" style="margin-top:10px"><button class="btn primary" data-act="runI">${icon('search')} تأیید</button></div></div>
        <div class="card" style="margin-top:14px"><h2>${icon('list')} درآمد، تخفیف و خالص هر پزشک</h2><div class="tableWrap" id="iOut"></div></div>
        <div class="grid g2"><div class="card"><h2>${icon('chart')} مقایسه پزشکان (درآمد · تخفیف · خالص)</h2><div class="chartBox tall"><canvas id="iD"></canvas></div><div class="mini muted">۱۲ پزشک اول همین لیست — هر رنگ یک مقدار جدا</div></div>
        <div class="card"><h2>${icon('trend')} روند ماهانه</h2><div class="bar" style="margin-bottom:8px"><select id="i_doc" style="width:auto"></select><select id="i_metric" style="width:auto">${opt([['money', 'درآمد · تخفیف · خالص'], ['c', 'تعداد معرفی'], ['s', 'فقط درآمد'], ['d', 'فقط تخفیف'], ['n', 'فقط خالص']], 'money')}</select></div><div class="chartBox tall"><canvas id="iC"></canvas></div><div class="mini muted">۱۲ ماه گذشته</div></div></div>`;
      $('#i_q', view).addEventListener('input', debounce(drawIncome, 150)); $('#i_sort', view).onchange = drawIncome; $('#i_pct', view).oninput = debounce(drawIncome, 200);
      $('#i_doc', view).onchange = drawTrend; $('#i_metric', view).onchange = drawTrend;
      view._months = months;
    };
    const drawIncome = () => {
      if (!inc) return;
      const q = $('#i_q', view).value.trim().toLowerCase(), pct = Number($('#i_pct', view).value || 100) / 100, sort = $('#i_sort', view).value;
      const rows = inc.rows.filter(r => !q || [r.name, r.council_no, r.specialty].some(v => String(v || '').toLowerCase().includes(q)))
        .sort((a, b) => sort === 'patients' ? b.patients - a.patients : sort === 'council_no' ? String(a.council_no || '~').localeCompare(String(b.council_no || '~')) : b.income - a.income);
      const S = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
      $('#iOut', view).innerHTML = `<table class="t"><thead><tr><th>پزشک معرف</th><th>نظام طبی</th><th>تخصص</th><th>مراجعین</th><th>پذیرش</th><th>آزمایش</th><th>درآمد</th><th>تخفیف</th><th>خالص</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="ltr">${esc(r.council_no || '')}</td><td>${esc(r.specialty || '')}</td><td>${r.patients}</td><td>${r.requests}</td><td>${r.tests}</td><td>${money(r.income * pct)}</td><td>${money(r.discount * pct)}</td><td>${money(r.net * pct)}</td></tr>`).join('') || emptyRow(9)}</tbody>
        <tfoot><tr><td colspan="3">مجموع</td><td>${S('patients')}</td><td>${S('requests')}</td><td>${S('tests')}</td><td>${money(S('income') * pct)}</td><td>${money(S('discount') * pct)}</td><td>${money(S('net') * pct)}</td></tr></tfoot></table>`;
      const cur = $('#i_doc', view).value;
      $('#i_doc', view).innerHTML = opt([['all', 'همه پزشکان'], ...inc.rows.map(r => [r.k, r.name])], cur || 'all');
      view._incRows = rows; view._pct = pct;
      drawTrend();
    };
    // two separate charts: doctors side by side (three separate bars each), and the monthly trend — never stacked on each other
    const drawTrend = () => {
      if (!inc) return;
      destroyCharts();
      const top = (view._incRows || inc.rows).slice(0, 12), pct = view._pct || 1;
      barChart($('#iD', view), top.map(r => r.name.length > 18 ? r.name.slice(0, 17) + '…' : r.name), [
        { label: 'درآمد', data: top.map(r => r2(r.income * pct)), color: '#2a78d6' }, { label: 'تخفیف', data: top.map(r => r2(r.discount * pct)), color: '#eb6834' }, { label: 'خالص', data: top.map(r => r2(r.net * pct)), color: '#1baf7a' }], { money: true });
      const k = $('#i_doc', view).value || 'all', months = view._months, metric = $('#i_metric', view).value || 'money';
      const sum = (m, f) => inc.trend.filter(x => (k === 'all' || x.k === k) && x.date >= m.range[0] && x.date <= m.range[1]).reduce((a, x) => a + (x[f] || 0), 0);
      const L = { c: 'تعداد معرفی', s: 'درآمد', d: 'تخفیف', n: 'خالص' }, C = { c: '#6250d6', s: '#2a78d6', d: '#eb6834', n: '#1baf7a' };
      const fields = metric === 'money' ? ['s', 'd', 'n'] : [metric];
      barChart($('#iC', view), months.map(m => m.short), fields.map(f => ({ label: L[f], data: months.map(m => r2(sum(m, f) * (f === 'c' ? 1 : pct))), color: C[f] })), { money: metric !== 'c' });
    };
    const runStats = async () => { data = await API.get('/api/lab/stats', statsQuery()); drawStats(); };
    const runIncome = async () => { const months = view._months; inc = await API.get('/api/lab/doctor-income', { from: dateOf($('#i_from', view)), to: dateOf($('#i_to', view)), dept_id: $('#i_dep', view).value, source: $('#i_src', view).value, trend_from: months[0].range[0], trend_to: today() }); drawIncome(); };
    const show = async () => { drawTabs(); if (tab === 'stats') { statsUI(); await runStats(); } else { incomeUI(); await runIncome(); } };
    $('#rpT', view).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; show().catch(errToast); } };
    const rpTitle = () => tab === 'stats' ? 'آمار مراجعین' : 'آمار درآمد کلی پزشکان معرف';
    actions(view, {
      run: () => runStats(), runI: () => runIncome(),
      print: () => {
        if (tab === 'stats' && data) {
          const kind = $('#sKind', view).selectedOptions[0].textContent;
          const head = `<p>از تاریخ ${fmtDate(dateOf($('#s_from', view)))} تا تاریخ ${fmtDate(dateOf($('#s_to', view)))} · ${esc(kind)}</p>`;
          const main = $('#sOut .tableWrap', view).innerHTML.replace(/<canvas[\s\S]*?<\/canvas>/g, '');
          previewDoc(reportDocHTML(rpTitle(), head + main + `<div style="page-break-before:always"></div><h3 style="text-align:center">جمع کل</h3>` + tot(data.totals)), { title: rpTitle() });
        } else if (inc) previewDoc(reportDocHTML(rpTitle(), `<p>از ${fmtDate(dateOf($('#i_from', view)))} تا ${fmtDate(dateOf($('#i_to', view)))}</p>` + $('#iOut', view).innerHTML), { title: rpTitle() });
      },
      csv: () => {
        if (tab === 'stats' && data) exportCSV('lab-patients', data.rows, [['lab_code', 'پذیرش'], ['date', 'تاریخ'], ['reception_type', 'نوع پذیرش'], ['patient_code', 'کد مریض'], ['full_name', 'نام'], ['father_name', 'ولد'], ['doctor_name', 'پزشک معرف'], ['tests', 'آزمایش‌ها'], ['subtotal', 'جمع کل'], ['org_share', 'سهم سازمان'], ['discount', 'تخفیف'], ['discount_reason', 'دلیل تخفیف'], ['discount_by', 'تخفیف دهنده'], ['net', 'قابل پرداخت'], ['paid', 'پرداخت شده'], ['balance', 'باقیمانده'], ['user_name', 'کاربر']]);
        else if (inc) exportCSV('lab-doctor-income', inc.rows, [['name', 'پزشک'], ['council_no', 'نظام طبی'], ['specialty', 'تخصص'], ['patients', 'مراجعین'], ['requests', 'پذیرش'], ['tests', 'آزمایش'], ['income', 'درآمد'], ['discount', 'تخفیف'], ['net', 'خالص']]);
      }
    });
    await show();
  }
};
