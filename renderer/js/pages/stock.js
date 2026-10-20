/* Stock & accounts station: medicines & codes, purchase factors (with installments), suppliers, expenses (other factors),
   withdrawals, daily accounts, monthly profit, per-medicine sales, Excel import */
'use strict';

const sumBy = (rows, k) => rows.reduce((a, r) => a + (Number(typeof k === 'function' ? k(r) : r[k]) || 0), 0);
function monthsAgg(days, months) {
  return months.map(m => {
    const rows = days.filter(d => d.date >= m.range[0] && d.date <= m.range[1]);
    const o = { ...m };
    ['reception', 'ph_net', 'ph_sales', 'ph_returns', 'ph_cost', 'ph_profit', 'legacy_ph', 'lab_total', 'expenses', 'withdrawals', 'wd_personal', 'purchases', 'supplier_paid', 'ph_count', 'visits', 'lab_count', 'ipd', 'wd_reception'].forEach(k => o[k] = r2(sumBy(rows, k)));
    o.net_profit = r2(o.ph_profit + o.lab_total + o.reception + o.ipd - o.expenses);
    return o;
  });
}

// ================================================================ stock dashboard
Pages['stock-dash'] = {
  async render(view) {
    const months = lastMonths(12);
    view.innerHTML = `<div class="pageHead"><div><h1>داشبورد انبار و حسابات</h1><p>فروش، مفاد، موجودی، طلبات کمپنی‌ها و مصارف — به‌روز از همه بخش‌ها.</p></div>
      <div class="toolbar"><button class="btn primary" data-act="newP">${icon('truck')} فاکتور خرید جدید</button><button class="btn" data-act="newE">${icon('receipt')} مصرف جدید</button></div></div>
      <div class="grid g4" id="k1"></div><div class="grid g4" id="k2" style="margin-top:16px"></div>
      <div class="grid g-21" style="margin-top:16px"><div class="card"><h2>فروش، مفاد و مصارف در ۱۲ ماه</h2><div id="lg"></div><div class="chartBox tall"><canvas id="c1"></canvas></div></div>
        <div class="card"><h2>${icon('alert', 15)} نیاز به توجه</h2><div id="att"></div></div></div>
      <div class="grid g2"><div class="card"><h2>فروش روزانه دواخانه (۳۰ روز)</h2><div class="chartBox"><canvas id="c2"></canvas></div></div><div class="card"><h2>پرفروش‌ترین دواها (این ماه)</h2><div id="top"></div></div></div>`;
    const [dash, days, meds, open] = await Promise.all([API.get('/api/reports/dashboard'), API.get('/api/reports/days', { from: months[0].range[0], to: today() }),
      API.list('medicines', { 'eq.active': 1, limit: 5000 }), API.list('purchases', { 'gt.balance': 0.001, order: 'due_date', limit: 200 })]);
    const t = dash.today_row || {}, M = dash.month;
    $('#k1', view).innerHTML = kpi('فروش دواخانه امروز', money(t.ph_net || 0), { ic: 'pill', cls: 'good', sub: `مفاد: ${money(t.ph_profit || 0)}` }) + kpi('لابراتوار امروز', money(t.lab_total || 0), { ic: 'flask', sub: `${t.lab_count || 0} پذیرش` })
      + kpi('فیس پذیرش امروز', money(t.reception || 0), { ic: 'ticket', sub: `${t.visits || 0} مریض` }) + kpi('مصارف امروز', money(t.expenses || 0), { ic: 'receipt', cls: 'bad' });
    $('#k2', view).innerHTML = kpi('فروش دواخانه این ماه', money(M.ph_net), { ic: 'trend', cls: 'good', sub: `مفاد ناخالص: ${money(M.ph_profit)}` }) + kpi('عاید کل این ماه', money(M.income), { ic: 'money', cls: 'violet', sub: `مصارف: ${money(M.expenses)}` })
      + kpi('ارزش موجودی (خرید)', money(dash.stock.cost_value), { ic: 'box', sub: `به قیمت فروش: ${money(dash.stock.sale_value)}` }) + kpi('طلب کمپنی‌ها (باقی)', money(dash.supplier_debt.s), { ic: 'truck', cls: 'warn', sub: `${dash.supplier_debt.c} فاکتور` });
    const agg = monthsAgg(days, months);
    $('#lg', view).innerHTML = legendHTML([{ label: 'فروش دواخانه' }, { label: 'مفاد دواخانه' }, { label: 'لابراتوار' }, { label: 'مصارف' }]);
    barChart($('#c1', view), agg.map(m => m.short), [{ label: 'فروش دواخانه', data: agg.map(m => m.ph_net) }, { label: 'مفاد دواخانه', data: agg.map(m => m.ph_profit) }, { label: 'لابراتوار', data: agg.map(m => m.lab_total) }, { label: 'مصارف', data: agg.map(m => m.expenses), type: 'line' }], { money: true });
    const d30 = []; for (let i = 29; i >= 0; i--) d30.push(isoDate(addDays(new Date(), -i)));
    barChart($('#c2', view), d30.map(d => fmtDateNum(d).slice(5)), [{ label: 'فروش', data: d30.map(d => (days.find(x => x.date === d) || {}).ph_net || 0) }], { money: true });
    const warn = Number(App.settings.expiry_warn_days || 90); const lim = isoDate(addDays(new Date(), warn)).slice(0, 7);
    const low = meds.filter(m => m.stock <= m.reorder_level && (m.stock > 0 || m.buy_price > 0)), exp = meds.filter(m => m.next_expiry && m.next_expiry.slice(0, 7) <= lim);
    $('#att', view).innerHTML = [
      ...open.filter(p => p.due_date && p.due_date <= isoDate(addDays(new Date(), 7))).map(p => `<div class="alertItem"><div class="alertIcon warn">؋</div><div><b>سررسید ${fmtDate(p.due_date)} — ${esc(p.supplier_name)}</b><span>فاکتور ${esc(p.factor_no || p.ref_no)} · باقی ${money(p.balance)}</span></div></div>`),
      ...low.slice(0, 10).map(m => `<div class="alertItem"><div class="alertIcon bad">▣</div><div><b>${esc(m.name)} رو به اتمام</b><span>موجود ${fmtNum(m.stock)} (حد ${fmtNum(m.reorder_level)})</span></div></div>`),
      ...exp.slice(0, 10).map(m => `<div class="alertItem"><div class="alertIcon bad">⌛</div><div><b>${esc(m.name)} — انقضا ${esc(m.next_expiry)}</b><span>موجود ${fmtNum(m.stock)}</span></div></div>`)
    ].join('') || '<div class="empty">همه چیز مرتب است ✓</div>';
    const [mf] = currentMonthRange();
    const top = (await API.get('/api/reports/medicine-sales', { from: mf, to: today() })).slice(0, 10);
    $('#top', view).innerHTML = `<table class="t"><thead><tr><th>دوا</th><th>تعداد</th><th>فروش</th><th>مفاد</th></tr></thead><tbody>${top.map(r => `<tr><td class="en">${esc(r.name)}</td><td>${fmtNum(r.qty)}</td><td>${money(r.revenue)}</td><td class="pos">${money(r.profit)}</td></tr>`).join('') || emptyRow(4)}</tbody></table>`;
    actions(view, { newP: () => openPurchase(null, () => go('stock-dash')), newE: () => expenseDialog(null, () => go('stock-dash')) });
  },
  onEvent(m) { if (m.type.startsWith('sale') || m.type.startsWith('purchase')) reloadPage(); }
};

// ================================================================ medicines
Pages.medicines = {
  async render(view, params) {
    const canEdit = isRole('stock');
    view.innerHTML = `<div class="pageHead"><div><h1>دواها، کد و موجودی</h1><p>هر دوا یک کد عددی دارد که در دواخانه تایپ یا اسکن می‌شود. قیمت فروش از قیمت خرید + فیصدی مفاد حساب می‌شود.</p></div>
      <div class="toolbar">${canEdit ? `<button class="btn primary" data-act="new">${icon('plus')} دوای جدید</button>` : ''}<button class="btn" data-act="csv">${icon('download')} CSV</button><button class="btn" data-act="print">${icon('print')} لیست قیمت</button></div></div>
      <div class="filterBar"><label class="field grow"><span>جستجو</span><input id="m_q" placeholder="نام، کد، جنریک، کمپنی، بارکود…"></label>
        <label class="field"><span>کتگوری</span><select id="m_cat">${opt(listSetting('medicine_categories'), '', { empty: 'همه' })}</select></label>
        <label class="field"><span>فیلتر</span><select id="m_f">${opt([['instock', 'موجود'], ['low', 'رو به اتمام'], ['out', 'تمام شده'], ['expiring', 'نزدیک انقضا'], ['inactive', 'غیرفعال']], params.filter || '', { empty: 'همه' })}</select></label></div>
      <div class="grid g4" id="mK" style="margin-bottom:16px"></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>کد</th><th>نام دوا</th><th>شکل / قوت</th><th>کمپنی</th><th>موجود</th><th>قیمت خرید</th><th>مفاد٪</th><th>قیمت فروش</th><th>انقضای نزدیک</th>${canEdit ? '<th>ارزش موجودی</th>' : ''}<th></th></tr></thead><tbody id="mB"></tbody></table></div></div>`;
    let all = [], rows = [];
    const warn = Number(App.settings.expiry_warn_days || 90); const lim = isoDate(addDays(new Date(), warn)).slice(0, 7);
    const load = async () => { all = await API.list('medicines', { limit: 20000 }); filter(); };
    const filter = () => {
      const q = $('#m_q', view).value.trim().toLowerCase(), c = $('#m_cat', view).value, f = $('#m_f', view).value;
      rows = all.filter(m => (f === 'inactive' ? !m.active : m.active) && (!c || m.category === c)
        && (!q || String(m.code).startsWith(q) || [m.name, m.generic, m.company, m.barcode].some(x => String(x || '').toLowerCase().includes(q)))
        && (!f || f === 'inactive' || (f === 'instock' && m.stock > 0) || (f === 'low' && m.stock <= m.reorder_level && m.stock > 0) || (f === 'out' && m.stock <= 0) || (f === 'expiring' && m.next_expiry && m.next_expiry.slice(0, 7) <= lim)));
      $('#mB', view).innerHTML = rows.slice(0, 1500).map(m => `<tr data-id="${m.id}"><td class="codeTag"><b>${m.code}</b></td><td class="en"><b>${esc(m.name)}</b>${m.generic && m.generic !== m.name ? `<br><small class="muted">${esc(m.generic)}</small>` : ''}</td>
        <td class="en">${esc([m.form, m.strength].filter(Boolean).join(' · '))}</td><td>${esc(m.company || '')}</td>
        <td class="${m.stock <= 0 ? 'neg' : m.stock <= m.reorder_level ? 'neg' : 'pos'}"><b>${fmtNum(m.stock)}</b> <small>${esc(m.unit || '')}</small></td>
        <td>${money(m.buy_price)}</td><td>${fmtNum(m.markup_pct)}</td><td class="money">${money(m.sell_price)}</td>
        <td class="${m.next_expiry && m.next_expiry.slice(0, 7) <= lim ? 'neg' : ''} ltr">${esc(m.next_expiry || '')}</td>${canEdit ? `<td>${money(m.stock_cost)}</td>` : ''}
        <td class="nowrap"><button class="btn sm" data-act="card" data-id="${m.id}">${icon('eye', 14)} کارت</button>${canEdit ? ` <button class="btn sm" data-act="edit" data-id="${m.id}">${icon('edit', 14)}</button> <button class="btn sm" data-act="adj" data-id="${m.id}">± موجودی</button>` : ''}</td></tr>`).join('') || emptyRow(11);
      const act = all.filter(m => m.active);
      $('#mK', view).innerHTML = kpi('تعداد دواها', act.length, { ic: 'pill', sub: `${act.filter(m => m.stock > 0).length} موجود` }) + kpi('رو به اتمام / تمام', `${act.filter(m => m.stock <= m.reorder_level && m.stock > 0).length} / ${act.filter(m => m.stock <= 0).length}`, { ic: 'alert', cls: 'warn' })
        + kpi('نزدیک انقضا', act.filter(m => m.next_expiry && m.next_expiry.slice(0, 7) <= lim).length, { ic: 'clock', cls: 'bad', sub: `${warn} روز آینده` }) + (canEdit ? kpi('ارزش موجودی', money(sumBy(act, 'stock_cost')), { ic: 'box', cls: 'good', sub: `فروش: ${money(sumBy(act, m => m.stock * m.sell_price))}` }) : kpi('نتیجه فیلتر', rows.length, { ic: 'list' }));
    };
    $('#m_q', view).addEventListener('input', debounce(filter, 200)); $$('#m_cat, #m_f', view).forEach(el => el.addEventListener('change', filter));
    const byId = (b) => all.find(m => m.id === Number(b.dataset.id));
    actions(view, {
      new: () => medicineDialog(null, load), edit: (b) => medicineDialog(byId(b), load), card: (b) => medicineCard(Number(b.dataset.id)), adj: (b) => adjustDialog(byId(b), load),
      csv: () => exportCSV('medicines', rows, [['code', 'کد'], ['name', 'نام'], ['generic', 'جنریک'], ['form', 'شکل'], ['strength', 'قوت'], ['company', 'کمپنی'], ['category', 'کتگوری'], ['stock', 'موجود'], ['unit', 'واحد'], ['buy_price', 'قیمت خرید'], ['markup_pct', 'مفاد٪'], ['sell_price', 'قیمت فروش'], ['next_expiry', 'انقضا']]),
      print: () => previewDoc(reportDocHTML('لیست دواها و قیمت فروش', `<table class="rt"><thead><tr><th>کد</th><th>دوا</th><th>شکل / قوت</th><th>موجود</th><th>قیمت فروش</th></tr></thead><tbody>${rows.map(m => `<tr><td>${m.code}</td><td class="en">${esc(m.name)}</td><td class="en">${esc([m.form, m.strength].filter(Boolean).join(' '))}</td><td>${fmtNum(m.stock)}</td><td>${money(m.sell_price)}</td></tr>`).join('')}</tbody></table>`), { title: 'لیست قیمت' })
    });
    await load(); this._load = load;
  },
  onEvent(m) { if ((m.type.startsWith('sale') || m.type.startsWith('purchase')) && this._load) this._load(); }
};
function medicineDialog(m, after) {
  const isNew = !m; m = m || { markup_pct: App.settings.default_markup || 30, reorder_level: 5, active: 1, unit: 'عدد' };
  const dlg = modal({ title: isNew ? 'دوای جدید' : `ویرایش دوا — کد ${m.code}`, size: 'wide', body: `<div class="formGrid" id="mdF">
    <label class="field"><span>کد دوا <span class="hint">(خالی = خودکار)</span></span><input name="code" type="number" value="${esc(m.code || '')}"></label>
    <label class="field span2"><span>نام دوا (تجارتی) <em>*</em></span><input name="name" class="en" value="${esc(m.name || '')}"></label>
    <label class="field"><span>نام جنریک</span><input name="generic" class="en" value="${esc(m.generic || '')}"></label>
    <label class="field"><span>شکل</span><input name="form" class="en" list="mdForms" value="${esc(m.form || '')}"></label>
    <label class="field"><span>قوت</span><input name="strength" class="en" value="${esc(m.strength || '')}" placeholder="500 mg"></label>
    <label class="field"><span>واحد فروش</span><input name="unit" list="mdUnits" value="${esc(m.unit || '')}"></label>
    <label class="field"><span>کمپنی</span><input name="company" value="${esc(m.company || '')}"></label>
    <label class="field"><span>کتگوری</span><input name="category" list="mdCats" value="${esc(m.category || '')}"></label>
    <label class="field"><span>بارکود</span><input name="barcode" class="ltr" value="${esc(m.barcode || '')}"></label>
    <label class="field"><span>جای نگهداری (قفسه)</span><input name="location" value="${esc(m.location || '')}"></label>
    <label class="field"><span>حد هشدار موجودی</span><input name="reorder_level" type="number" value="${esc(m.reorder_level)}"></label>
    <label class="field"><span>قیمت خرید (یک واحد)</span><input name="buy_price" type="number" step="any" id="md_buy" value="${esc(m.buy_price || 0)}"></label>
    <label class="field"><span>فیصدی مفاد ٪</span><input name="markup_pct" type="number" step="any" id="md_mk" value="${esc(m.markup_pct)}"></label>
    <label class="field"><span>قیمت فروش</span><input name="sell_price" type="number" step="any" id="md_sell" value="${esc(m.sell_price || 0)}"></label>
    ${isNew ? `<label class="field"><span>موجودی اولیه</span><input name="opening_qty" type="number" value="0"></label><label class="field"><span>تاریخ انقضا</span><input name="opening_expiry" type="month"></label>` : ''}
    <label class="check" style="align-self:end"><input type="checkbox" name="active" ${m.active ? 'checked' : ''}> فعال</label>
    <label class="field full"><span>یادداشت</span><input name="notes" value="${esc(m.notes || '')}"></label></div>
    <div class="chips" style="margin-top:8px">${[10, 15, 20, 25, 30, 40, 50].map(p => `<button type="button" class="chip" data-mk="${p}">${p}٪</button>`).join('')}</div>
    ${datalist('mdForms', listSetting('rx_forms'))}${datalist('mdUnits', listSetting('medicine_units'))}${datalist('mdCats', listSetting('medicine_categories'))}`,
    foot: `<button class="btn primary" id="md_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
  const recalc = () => { const b = Number($('#md_buy', dlg.el).value) || 0, k = Number($('#md_mk', dlg.el).value) || 0; const s = b * (1 + k / 100); $('#md_sell', dlg.el).value = s >= 10 ? Math.ceil(s) : Math.round(s * 10) / 10; };
  $('#md_buy', dlg.el).oninput = recalc; $('#md_mk', dlg.el).oninput = recalc;
  $('#md_sell', dlg.el).oninput = () => { const b = Number($('#md_buy', dlg.el).value) || 0, s = Number($('#md_sell', dlg.el).value) || 0; if (b) $('#md_mk', dlg.el).value = Math.round((s / b - 1) * 1000) / 10; };
  $$('[data-mk]', dlg.el).forEach(c => c.onclick = () => { $('#md_mk', dlg.el).value = c.dataset.mk; recalc(); });
  $('[data-x]', dlg.el).onclick = dlg.close;
  $('#md_ok', dlg.el).onclick = () => busy($('#md_ok', dlg.el), async () => {
    const v = formValues($('#mdF', dlg.el)); if (!isNew) v.id = m.id;
    const id = await API.save('medicines', v); toast('ذخیره شد', 'good'); dlg.close(); after && after(id);
  }).catch(errToast);
  return dlg;
}
async function medicineCard(id) {
  const m = await API.get('/api/medicine/' + id);
  const KIND = { purchase: 'خرید', sale: 'فروش', return: 'برگشت', adjust: 'تعدیل', expired: 'تاریخ تیر', damaged: 'خراب', opening: 'موجودی اولیه', purchase_edit: 'ویرایش فاکتور' };
  modal({ title: `کارت دوا — ${esc(m.name)} (کد ${m.code})`, size: 'xwide', body: `
    <div class="grid g4">${kpi('موجود', fmtNum(m.stock) + ' ' + esc(m.unit || ''), { ic: 'box' })}${kpi('قیمت فروش', money(m.sell_price), { ic: 'money' })}${kpi('قیمت خرید', money(m.buy_price), { ic: 'truck' })}${kpi('ارزش موجودی', money(m.stock_cost), { ic: 'wallet' })}</div>
    <div class="secTitle">بچ‌ها (Batches) — فروش به ترتیب نزدیک‌ترین انقضا</div>
    <div class="tableWrap"><table class="t"><thead><tr><th>بچ</th><th>انقضا</th><th>ورود</th><th>باقی</th><th>قیمت تمام شد</th><th>منبع</th><th>فاکتور</th><th>کمپنی</th></tr></thead><tbody>
    ${(m.batches || []).map(b => `<tr class="${b.qty_left <= 0 ? 'muted' : ''}"><td>${esc(b.batch_no || '—')}</td><td class="ltr">${esc(b.expiry || '')}</td><td>${fmtNum(b.qty_in)}</td><td><b>${fmtNum(b.qty_left)}</b></td><td>${money(b.buy_price)}</td><td>${esc({ purchase: 'خرید', opening: 'اولیه', adjust: 'تعدیل' }[b.source] || b.source)}</td><td>${esc(b.ref_no || '')} ${esc(b.factor_no || '')}</td><td>${esc(b.supplier || '')}</td></tr>`).join('') || emptyRow(8)}</tbody></table></div>
    <div class="secTitle">گردش موجودی</div>
    <div class="tableWrap" style="max-height:340px"><table class="t"><thead><tr><th>تاریخ</th><th>نوع</th><th>مقدار</th><th>قیمت تمام شد</th><th>قیمت فروش</th><th>مرجع</th><th>کاربر</th><th>یادداشت</th></tr></thead><tbody>
    ${(m.moves || []).map(x => `<tr><td>${fmtDateTime(x.at)}</td><td>${esc(KIND[x.kind] || x.kind)}</td><td class="${x.qty < 0 ? 'neg' : 'pos'}">${x.qty > 0 ? '+' : ''}${fmtNum(x.qty)}</td><td>${x.unit_cost != null ? money(x.unit_cost) : ''}</td><td>${x.unit_price != null ? money(x.unit_price) : ''}</td><td>${esc(x.ref_type || '')} ${x.ref_id || ''}</td><td>${esc(x.user_name || '')}</td><td>${esc(x.note || '')}</td></tr>`).join('') || emptyRow(8)}</tbody></table></div>` });
}
function adjustDialog(m, after) {
  const dlg = modal({ title: `تعدیل موجودی — ${esc(m.name)}`, body: `<div class="sum"><span>موجود فعلی: <b>${fmtNum(m.stock)}</b></span></div><div class="formGrid" id="adF" style="margin-top:12px">
    <label class="field"><span>نوع</span><select name="kind">${opt([['opening', 'موجودی اولیه / افزایش'], ['adjust', 'تعدیل (شمارش)'], ['expired', 'تاریخ تیر (کم کردن)'], ['damaged', 'خراب / ضایع (کم کردن)']], 'opening')}</select></label>
    <label class="field"><span>مقدار <span class="hint">(+ افزایش، − کاهش)</span></span><input name="qty" type="number" step="any"></label>
    <label class="field"><span>قیمت تمام شد (برای افزایش)</span><input name="unit_cost" type="number" step="any" value="${m.buy_price}"></label>
    <label class="field"><span>بچ</span><input name="batch_no"></label><label class="field"><span>انقضا</span><input name="expiry" type="month"></label>
    <label class="field full"><span>یادداشت</span><input name="note"></label></div>`,
    foot: `<button class="btn primary" id="ad_ok">ثبت</button><button class="btn" data-x>انصراف</button>` });
  $('[data-x]', dlg.el).onclick = dlg.close;
  $('#ad_ok', dlg.el).onclick = () => busy($('#ad_ok', dlg.el), async () => {
    const v = formValues($('#adF', dlg.el)); let q = Number(v.qty) || 0;
    if (['expired', 'damaged'].includes(v.kind) && q > 0) q = -q;
    const r = await API.post('/api/stock/adjust', { ...v, qty: q, medicine_id: m.id }); toast(`موجودی جدید: ${fmtNum(r.stock)}`, 'good'); dlg.close(); after && after();
  }).catch(errToast);
}

// ================================================================ purchases (medicine factors)
Pages.purchases = {
  async render(view, params) {
    const months = lastMonths(3);
    view.innerHTML = `<div class="pageHead"><div><h1>فاکتورهای خرید دوا</h1><p>هر فاکتور: کمپنی، شماره فاکتور، اقلام با قیمت خرید و فیصدی مفاد، و وضعیت پرداخت (نقد، قسطی یا پرداخت نشده). همه قابل ویرایش است.</p></div>
      <div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} فاکتور جدید</button><button class="btn" data-act="csv">${icon('download')} CSV</button><button class="btn" data-act="print">${icon('print')} چاپ لیست</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', params.status === 'open' ? '' : months[0].range[0], 'id="p_from"')}</label><label class="field"><span>تا</span>${dateInput('to', today(), 'id="p_to"')}</label>
        <label class="field"><span>کمپنی</span><select id="p_sup"><option value="">همه</option></select></label>
        <label class="field"><span>وضعیت پرداخت</span><select id="p_st">${opt([['open', 'باقی‌دار (قسطی/پرداخت نشده)'], ['paid', 'پرداخت شد'], ['partial', 'قسطی / ناقص'], ['unpaid', 'پرداخت نشده']], params.status || '', { empty: 'همه' })}</select></label>
        <label class="field grow"><span>جستجو</span><input id="p_q" placeholder="شماره فاکتور، کمپنی، تحویل گیرنده…"></label></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>شماره</th><th>تاریخ</th><th>شماره فاکتور</th><th>کمپنی / آورنده</th><th>تحویل گیرنده</th><th>اقلام</th><th>مبلغ فاکتور</th><th>پرداخت شده</th><th>باقی</th><th>نوع</th><th>وضعیت</th><th>سررسید</th><th>رسید</th><th></th></tr></thead><tbody id="pB"></tbody><tfoot id="pF"></tfoot></table></div></div>`;
    const sups = await API.list('suppliers', { limit: 2000 });
    $('#p_sup', view).innerHTML = '<option value="">همه</option>' + sups.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    let rows = [];
    const load = async () => {
      const q = { from: dateOf($('#p_from', view)), to: dateOf($('#p_to', view)), q: $('#p_q', view).value.trim(), limit: 5000 };
      if ($('#p_sup', view).value) q['eq.supplier_id'] = $('#p_sup', view).value;
      const stv = $('#p_st', view).value; if (stv === 'open') q['gt.balance'] = 0.001; else if (stv) q['eq.pay_status'] = stv;
      rows = await API.list('purchases', q);
      $('#pB', view).innerHTML = rows.map(p => `<tr class="clickable" data-id="${p.id}"><td class="codeTag">${esc(p.ref_no)}</td><td>${fmtDate(p.date)}</td><td class="ltr">${esc(p.factor_no || '—')}</td><td><b>${esc(p.supplier_name || '—')}</b></td><td>${esc(p.receiver || '')}</td>
        <td class="c">${p.has_items ? p.item_count : '<small class="muted">بدون اقلام</small>'}</td><td class="money">${money(p.net)}</td><td>${money(p.paid)}</td><td class="${p.balance > 0.001 ? 'neg' : ''}">${p.balance > 0.001 ? money(p.balance) : '—'}</td>
        <td>${esc(PAY_TYPES[p.pay_type] || '')}</td><td>${statusPill(PAY_STATUS, p.pay_status)}</td><td class="${p.due_date && p.due_date <= today() && p.balance > 0 ? 'neg' : ''}">${p.due_date ? fmtDate(p.due_date) : ''}</td><td>${p.received ? 'بلی' : '<span class="neg">خیر</span>'}</td>
        <td class="nowrap">${p.balance > 0.001 ? `<button class="btn sm success" data-act="pay" data-id="${p.id}">${icon('money', 14)} پرداخت</button>` : ''}</td></tr>`).join('') || emptyRow(14);
      $('#pF', view).innerHTML = `<tr><td colspan="6">مجموع ${rows.length} فاکتور</td><td>${money(sumBy(rows, 'net'))}</td><td>${money(sumBy(rows, 'paid'))}</td><td>${money(sumBy(rows, 'balance'))}</td><td colspan="5"></td></tr>`;
    };
    $$('#p_from, #p_to, #p_sup, #p_st', view).forEach(el => el.addEventListener('change', load)); $('#p_q', view).addEventListener('input', debounce(load, 300));
    view.addEventListener('click', (e) => { const tr = e.target.closest('tr.clickable'); if (tr && !e.target.closest('button')) openPurchase(Number(tr.dataset.id), load); });
    actions(view, {
      new: () => openPurchase(null, load), pay: (b) => paymentDialog(Number(b.dataset.id), load),
      csv: () => exportCSV('purchases', rows, [['ref_no', 'شماره'], ['date', 'تاریخ'], ['factor_no', 'شماره فاکتور'], ['supplier_name', 'کمپنی'], ['receiver', 'تحویل گیرنده'], ['net', 'مبلغ فاکتور'], ['paid', 'پرداخت'], ['balance', 'باقی'], [r => PAY_STATUS[r.pay_status]?.[0], 'وضعیت'], [r => r.received ? 'بلی' : 'خیر', 'رسید شد']]),
      print: () => previewDoc(reportDocHTML('لیست فاکتورهای خرید', `<table class="rt"><thead><tr><th>شماره</th><th>تاریخ</th><th>فاکتور</th><th>کمپنی</th><th>مبلغ</th><th>پرداخت</th><th>باقی</th><th>وضعیت</th></tr></thead><tbody>${rows.map(p => `<tr><td>${esc(p.ref_no)}</td><td>${esc(fmtDateNum(p.date))}</td><td>${esc(p.factor_no || '')}</td><td>${esc(p.supplier_name || '')}</td><td>${money(p.net)}</td><td>${money(p.paid)}</td><td>${money(p.balance)}</td><td>${esc(PAY_STATUS[p.pay_status]?.[0] || '')}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4">مجموع</td><td>${money(sumBy(rows, 'net'))}</td><td>${money(sumBy(rows, 'paid'))}</td><td>${money(sumBy(rows, 'balance'))}</td><td></td></tr></tfoot></table>`), { title: 'فاکتورها' })
    });
    await load();
  }
};

async function openPurchase(id, after, prefill) {
  const p = id ? await API.get('/api/purchases/' + id) : { date: today(), pay_type: 'cash', received: 1, has_items: 1, discount: 0, items: [], payments: [], ...(prefill || {}) };
  const sups = await API.list('suppliers', { limit: 2000 });
  const items = (p.items || []).map(i => ({ ...i }));
  const defMk = Number(App.settings.default_markup || 30);
  const m = modal({ title: id ? `فاکتور ${esc(p.ref_no)} — ${esc(p.supplier_name || '')}` : 'فاکتور خرید جدید', size: 'xwide', body: `
    <div class="formGrid" id="phF">
      <label class="field span2"><span>کمپنی / آورنده <em>*</em></span><input name="supplier_name" list="supList" value="${esc(p.supplier_name || '')}" autocomplete="off"></label>
      <label class="field"><span>شماره فاکتور</span><input name="factor_no" class="ltr" value="${esc(p.factor_no || '')}"></label>
      <label class="field"><span>تاریخ</span>${dateInput('date', p.date)}</label>
      <label class="field"><span>تحویل گیرنده</span><input name="receiver" value="${esc(p.receiver || App.user.full_name || '')}"></label>
      <label class="field"><span>نوع پرداخت</span><select name="pay_type" id="ph_pt">${opt(Object.entries(PAY_TYPES), p.pay_type)}</select></label>
      <label class="field"><span>سررسید (برای قسط/قرض)</span>${dateInput('due_date', p.due_date)}</label>
      <label class="check" style="align-self:end"><input type="checkbox" name="received" ${p.received ? 'checked' : ''}> رسید شد (اجناس تحویل گرفته شد)</label>
      <label class="check" style="align-self:end"><input type="checkbox" id="ph_items" ${p.has_items ? 'checked' : ''}> فاکتور با اقلام (افزایش موجودی)</label>
    </div>
    <div id="phItemsBox" class="${p.has_items ? '' : 'hidden'}">
      <div class="secTitle">${icon('pill', 15)} اقلام فاکتور <small class="muted">— قیمت فروش = قیمت خرید + فیصدی مفاد (قابل تغییر)</small></div>
      <div class="tableWrap"><table class="t posT"><thead><tr><th>کد</th><th>دوا</th><th>بچ</th><th>انقضا</th><th>تعداد</th><th>بونس</th><th>قیمت خرید</th><th>مفاد٪</th><th>قیمت فروش</th><th>جمع</th><th></th></tr></thead><tbody id="phRows"></tbody></table></div>
      <div class="bar" style="margin-top:8px"><div class="searchBox" style="flex:1"><input id="phAdd" placeholder="افزودن دوا به فاکتور: نام یا کد…" autocomplete="off"></div><button class="btn" id="phNewMed">${icon('plus')} دوای جدید</button>
        <label class="field" style="flex-direction:row;align-items:center;gap:6px"><span>مفاد پیش‌فرض٪</span><input type="number" id="phMk" value="${defMk}" style="width:70px"></label></div>
    </div>
    <div class="grid g3" style="margin-top:14px;align-items:end">
      <label class="field"><span>تخفیف فاکتور</span><input type="number" id="phDisc" value="${p.discount || 0}"></label>
      <label class="field ${p.has_items ? 'hidden' : ''}" id="phNetBox"><span>مبلغ فاکتور <em>*</em></span><input type="number" id="phNet" value="${p.has_items ? '' : (p.net || '')}"></label>
      ${id ? '' : `<label class="field"><span>پرداخت هنگام خرید</span><input type="number" id="phPaid" value=""></label>`}
    </div>
    <div class="sum" id="phSum"></div>
    <label class="field" style="margin-top:10px"><span>یادداشت</span><input id="phNotes" value="${esc(p.notes || '')}"></label>
    ${id ? `<div class="secTitle">${icon('money', 15)} پرداخت‌ها و اقساط</div><div id="phPays"></div>` : ''}
    ${datalist('supList', sups.map(s => s.name))}`,
    foot: `<button class="btn primary" id="ph_ok">${icon('check')} ذخیره فاکتور</button>${id ? `<button class="btn success" id="ph_pay">${icon('money')} ثبت پرداخت / قسط</button><button class="btn" id="ph_pr">${icon('print')} چاپ</button><button class="btn dangerText" id="ph_del">${icon('trash')} حذف</button>` : ''}<button class="btn" data-x>بستن</button>` });
  const rowsEl = $('#phRows', m.el);
  const sell = (it) => { const s = (Number(it.buy_price) || 0) * (1 + (Number(it.markup_pct) || 0) / 100); return s >= 10 ? Math.ceil(s) : Math.round(s * 10) / 10; };
  const draw = () => {
    rowsEl.innerHTML = items.map((it, i) => `<tr data-i="${i}"><td class="codeTag">${it.med_code || ''}</td><td class="medCell"><b>${esc(it.name)}</b> <small class="muted">${esc(it.strength || '')}</small>${it.id && it.qty_left !== undefined && it.qty_left < it.qty + it.bonus ? `<br><small class="warn">فروخته: ${fmtNum(it.qty + it.bonus - it.qty_left)}</small>` : ''}</td>
      <td><input data-f="batch_no" value="${esc(it.batch_no || '')}" style="width:80px"></td><td><input data-f="expiry" type="month" value="${esc(it.expiry || '')}" style="width:130px"></td>
      <td><input data-f="qty" type="number" value="${it.qty}"></td><td><input data-f="bonus" type="number" value="${it.bonus || 0}" style="width:60px"></td><td><input data-f="buy_price" type="number" step="any" value="${it.buy_price}"></td>
      <td><input data-f="markup_pct" type="number" step="any" value="${it.markup_pct}" style="width:60px"></td><td><input data-f="sell_price" type="number" step="any" value="${it.sell_price}"></td><td class="money">${money(it.qty * it.buy_price)}</td>
      <td><button class="btn ghost icon" data-rm="${i}">${icon('x', 14)}</button></td></tr>`).join('') || emptyRow(11, 'دوا اضافه کنید');
    calc();
  };
  const calc = () => {
    const hasItems = $('#ph_items', m.el).checked;
    const sub = hasItems ? r2(sumBy(items, it => it.qty * it.buy_price)) : Number($('#phNet', m.el).value) || 0;
    const disc = Number($('#phDisc', m.el).value) || 0; const net = hasItems ? r2(sub - disc) : sub;
    const paid = id ? p.paid : Number($('#phPaid', m.el)?.value) || 0;
    $('#phSum', m.el).innerHTML = `${hasItems ? `<span>جمع اقلام: <b>${money(sub)}</b></span><span>تعداد اقلام: <b>${items.length}</b></span>` : ''}<span>مبلغ فاکتور: <b>${money(net)}</b></span><span>پرداخت شده: <b>${money(paid)}</b></span><span>باقی: <b class="${net - paid > 0 ? 'neg' : 'pos'}">${money(net - paid)}</b></span>`
      + (hasItems ? `<span>ارزش فروش: <b>${money(sumBy(items, it => (it.qty + (Number(it.bonus) || 0)) * it.sell_price))}</b></span><span>مفاد پیش‌بینی: <b class="pos">${money(sumBy(items, it => (it.qty + (Number(it.bonus) || 0)) * it.sell_price) - net)}</b></span>` : '');
  };
  rowsEl.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return; const it = items[Number(tr.dataset.i)]; const f = e.target.dataset.f; if (!f) return;
    it[f] = ['batch_no', 'expiry'].includes(f) ? e.target.value : Number(e.target.value) || 0;
    if (f === 'buy_price' || f === 'markup_pct') { it.sell_price = sell(it); $('[data-f="sell_price"]', tr).value = it.sell_price; }
    if (f === 'sell_price' && it.buy_price) { it.markup_pct = Math.round((it.sell_price / it.buy_price - 1) * 1000) / 10; $('[data-f="markup_pct"]', tr).value = it.markup_pct; }
    tr.children[9].textContent = money(it.qty * it.buy_price); calc();
  });
  rowsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { items.splice(Number(b.dataset.rm), 1); draw(); } });
  const addMed = (med) => {
    items.push({ medicine_id: med.id, med_code: med.code, name: med.name, strength: med.strength, batch_no: '', expiry: '', qty: 1, bonus: 0, buy_price: med.buy_price || 0, markup_pct: Number($('#phMk', m.el).value) || med.markup_pct || defMk, sell_price: 0 });
    const it = items[items.length - 1]; it.sell_price = it.buy_price ? sell(it) : med.sell_price;
    draw(); $('#phAdd', m.el).value = '';
    setTimeout(() => { const inp = $(`tr[data-i="${items.length - 1}"] [data-f="qty"]`, m.el); inp && inp.focus(); }, 30);
  };
  autocomplete($('#phAdd', m.el), { fetch: (q) => API.get('/api/medicine-search', { q }), render: (x) => `<span class="code">${x.code}</span><span class="nm">${esc(x.name)} <small class="muted">${esc([x.form, x.strength].filter(Boolean).join(' · '))}</small></span><small>موجود ${fmtNum(x.stock)}</small>`, pick: addMed });
  $('#phNewMed', m.el).onclick = () => medicineDialog(null, async (newId) => { const med = await API.get('/api/medicine/' + newId); addMed(med); });
  $('#ph_items', m.el).onchange = () => { const on = $('#ph_items', m.el).checked; $('#phItemsBox', m.el).classList.toggle('hidden', !on); $('#phNetBox', m.el).classList.toggle('hidden', on); calc(); };
  $('#phDisc', m.el).oninput = calc; $('#phNet', m.el).oninput = calc; if ($('#phPaid', m.el)) $('#phPaid', m.el).oninput = calc;
  $('#ph_pt', m.el).onchange = () => { if ($('#phPaid', m.el) && $('#ph_pt', m.el).value !== 'cash') $('#phPaid', m.el).value = 0; calc(); };
  const drawPays = () => {
    if (!id) return;
    $('#phPays', m.el).innerHTML = `<table class="t"><thead><tr><th>تاریخ</th><th>مبلغ</th><th>طریقه</th><th>پرداخت توسط</th><th>یادداشت</th><th>ثبت</th><th></th></tr></thead><tbody>${p.payments.map(x => `<tr><td>${fmtDate(x.date)}</td><td class="money">${money(x.amount)}</td><td>${esc(PAY_METHODS[x.method] || x.method || '')}</td><td>${esc(x.paid_by || '')}</td><td>${esc(x.note || '')}</td><td class="mini">${esc(x.user_name || '')}</td>
      <td class="nowrap"><button class="btn sm" data-pe="${x.id}">${icon('edit', 13)}</button> <button class="btn sm dangerText" data-pd="${x.id}">${icon('trash', 13)}</button></td></tr>`).join('') || emptyRow(7, 'پرداختی ثبت نشده')}</tbody></table>`;
  };
  if (id) {
    drawPays();
    $('#phPays', m.el).onclick = async (e) => {
      const d = e.target.closest('[data-pd]'), ed = e.target.closest('[data-pe]');
      try {
        if (d && await confirmDlg('این پرداخت حذف شود؟', { danger: true })) { Object.assign(p, await API.post('/api/purchases/payment-delete/' + d.dataset.pd)); drawPays(); calc(); after && after(); }
        if (ed) paymentDialog(id, async () => { Object.assign(p, await API.get('/api/purchases/' + id)); drawPays(); calc(); after && after(); }, p.payments.find(x => x.id === Number(ed.dataset.pe)));
      } catch (err) { errToast(err); }
    };
    $('#ph_pay', m.el).onclick = () => paymentDialog(id, async () => { Object.assign(p, await API.get('/api/purchases/' + id)); drawPays(); calc(); after && after(); });
    $('#ph_pr', m.el).onclick = async () => previewDoc(purchaseDocHTML(await API.get('/api/purchases/' + id)), { title: p.ref_no });
    $('#ph_del', m.el).onclick = async () => { if (await confirmDlg(`فاکتور ${esc(p.ref_no)} کاملاً حذف شود؟ موجودی دواهای آن هم کم می‌شود.`, { danger: true, okText: 'حذف' })) { try { await API.post('/api/purchases/delete/' + id); toast('حذف شد', 'good'); m.close(); after && after(); } catch (e) { errToast(e); } } };
  }
  $('[data-x]', m.el).onclick = m.close;
  $('#ph_ok', m.el).onclick = () => busy($('#ph_ok', m.el), async () => {
    const h = formValues($('#phF', m.el));
    if (!h.supplier_name.trim()) throw new Error('نام کمپنی / آورنده را بنویسید');
    const hasItems = $('#ph_items', m.el).checked;
    if (hasItems && !items.length) throw new Error('حداقل یک دوا اضافه کنید یا «فاکتور با اقلام» را خاموش کنید');
    const sup = sups.find(s => s.name === h.supplier_name.trim());
    const body = { ...h, id: id || undefined, supplier_id: sup?.id, has_items: hasItems ? 1 : 0, discount: $('#phDisc', m.el).value, net: $('#phNet', m.el).value, notes: $('#phNotes', m.el).value,
      paid: $('#phPaid', m.el)?.value, items: items.map(i => ({ id: i.id, medicine_id: i.medicine_id, batch_no: i.batch_no, expiry: i.expiry, qty: i.qty, bonus: i.bonus, buy_price: i.buy_price, markup_pct: i.markup_pct, sell_price: i.sell_price })) };
    const r = await API.post('/api/purchases/save', body);
    toast(`فاکتور ${r.ref_no} ذخیره شد`, 'good'); m.close(); after && after();
  }).catch(errToast);
  draw();
}
async function paymentDialog(pid, after, pay) {
  const p = await API.get('/api/purchases/' + pid);
  pay = pay || { date: today(), amount: p.balance, method: 'cash', paid_by: App.user.full_name || '' };
  const m = modal({ title: `${pay.id ? 'ویرایش پرداخت' : 'پرداخت / قسط'} — ${esc(p.supplier_name || '')} (${esc(p.factor_no || p.ref_no)})`, body: `<div class="sum"><span>مبلغ فاکتور: <b>${money(p.net)}</b></span><span>پرداخت شده: <b>${money(p.paid)}</b></span><span>باقی: <b class="neg">${money(p.balance)}</b></span></div>
    <div class="formGrid" id="ppF" style="margin-top:12px"><label class="field"><span>تاریخ</span>${dateInput('date', pay.date)}</label><label class="field"><span>مبلغ</span><input type="number" name="amount" value="${esc(pay.amount)}"></label>
    <label class="field"><span>طریقه</span><select name="method">${opt(Object.entries(PAY_METHODS), pay.method)}</select></label><label class="field"><span>پرداخت توسط</span><input name="paid_by" value="${esc(pay.paid_by || '')}"></label>
    <label class="field full"><span>یادداشت</span><input name="note" value="${esc(pay.note || '')}"></label></div>`,
    foot: `<button class="btn primary" id="pp_ok">ثبت پرداخت</button><button class="btn" data-x>انصراف</button>` });
  $('[data-x]', m.el).onclick = m.close;
  $('#pp_ok', m.el).onclick = () => busy($('#pp_ok', m.el), async () => { const v = formValues($('#ppF', m.el)); if (pay.id) v.id = pay.id; await API.post('/api/purchases/pay/' + pid, v); toast('پرداخت ثبت شد', 'good'); m.close(); after && after(); }).catch(errToast);
}

// ================================================================ suppliers
Pages.suppliers = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>کمپنی‌ها و طلبات</h1><p>مجموع خرید، پرداخت و باقی (قرض) هر کمپنی یا آورنده.</p></div><div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} کمپنی جدید</button></div></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>نام</th><th>تلفن</th><th>شخص تماس</th><th>فاکتورها</th><th>مجموع خرید</th><th>پرداخت شده</th><th>باقی</th><th>آخرین خرید</th><th></th></tr></thead><tbody id="sB"></tbody><tfoot id="sF"></tfoot></table></div></div>`;
    let rows = [];
    const load = async () => {
      rows = await API.get('/api/reports/suppliers');
      $('#sB', view).innerHTML = rows.map(s => `<tr><td><b>${esc(s.name)}</b></td><td class="ltr">${esc(s.phone || '')}</td><td>${esc(s.contact || '')}</td><td class="c">${s.factors}</td><td>${money(s.total)}</td><td>${money(s.paid)}</td><td class="${s.balance > 0.001 ? 'neg' : ''}"><b>${s.balance > 0.001 ? money(s.balance) : '—'}</b></td><td>${s.last_date ? fmtDate(s.last_date) : ''}</td>
        <td class="nowrap"><button class="btn sm" data-act="factors" data-id="${s.id}">${icon('list', 14)} فاکتورها</button> <button class="btn sm" data-act="edit" data-id="${s.id}">${icon('edit', 14)}</button></td></tr>`).join('') || emptyRow(9);
      $('#sF', view).innerHTML = `<tr><td colspan="4">مجموع</td><td>${money(sumBy(rows, 'total'))}</td><td>${money(sumBy(rows, 'paid'))}</td><td>${money(sumBy(rows, 'balance'))}</td><td colspan="2"></td></tr>`;
    };
    const edit = (s) => {
      s = s || {};
      const m = modal({ title: s.id ? 'ویرایش کمپنی' : 'کمپنی جدید', body: `<div class="formGrid" id="suF"><label class="field span2"><span>نام <em>*</em></span><input name="name" value="${esc(s.name || '')}"></label><label class="field"><span>تلفن</span><input name="phone" class="ltr" value="${esc(s.phone || '')}"></label>
        <label class="field"><span>شخص تماس</span><input name="contact" value="${esc(s.contact || '')}"></label><label class="field full"><span>آدرس</span><input name="address" value="${esc(s.address || '')}"></label><label class="field full"><span>یادداشت</span><input name="notes" value="${esc(s.notes || '')}"></label></div>`,
        foot: `<button class="btn primary" id="su_ok">ذخیره</button>${s.id ? `<button class="btn dangerText" id="su_del">حذف</button>` : ''}<button class="btn" data-x>انصراف</button>` });
      $('[data-x]', m.el).onclick = m.close;
      $('#su_ok', m.el).onclick = () => busy($('#su_ok', m.el), async () => { const v = formValues($('#suF', m.el)); if (s.id) v.id = s.id; if (!v.name) throw new Error('نام الزامی است'); await API.save('suppliers', v); m.close(); load(); }).catch(errToast);
      if (s.id) $('#su_del', m.el).onclick = async () => { if (await confirmDlg('حذف شود؟', { danger: true })) { try { await API.del('suppliers', s.id); m.close(); load(); } catch (e) { errToast(e); } } };
    };
    actions(view, { new: () => edit(), edit: (b) => edit(rows.find(r => r.id === Number(b.dataset.id))), factors: (b) => go('purchases', {}).then(() => { $('#p_sup').value = b.dataset.id; $('#p_from').value = ''; $('#p_sup').dispatchEvent(new Event('change')); }) });
    await load();
  }
};

// ================================================================ expenses (other factors)
function expenseDialog(e, after) {
  e = e || { date: today(), section: 'clinic', paid: '' };
  const m = modal({ title: e.id ? 'ویرایش مصرف' : 'ثبت مصرف / فاکتور دیگر', size: 'wide', body: `<div class="formGrid" id="exF">
    <label class="field"><span>تاریخ</span>${dateInput('date', e.date)}</label>
    <label class="field"><span>کتگوری</span><input name="category" list="exCats" value="${esc(e.category || '')}"></label>
    <label class="field span2"><span>جنس / شرح <em>*</em></span><input name="item" value="${esc(e.item || '')}"></label>
    <label class="field"><span>تعداد</span><input name="qty" value="${esc(e.qty || '')}" placeholder="2 / 1 ماه / 2 کیلو"></label>
    <label class="field"><span>قیمت</span><input name="unit_price" type="number" step="any" value="${esc(e.unit_price ?? '')}"></label>
    <label class="field"><span>مجموع (مبلغ) <em>*</em></span><input name="amount" type="number" step="any" id="ex_amt" value="${esc(e.amount ?? '')}"></label>
    <label class="field"><span>پرداخت شده</span><input name="paid" type="number" step="any" id="ex_paid" value="${esc(e.paid ?? '')}" placeholder="= مجموع"></label>
    <label class="field"><span>بخش</span><select name="section">${opt(Object.entries(SECTIONS).filter(([k]) => k !== 'reception'), e.section)}</select></label>
    <label class="field"><span>توسط</span><input name="by_whom" value="${esc(e.by_whom || App.user.full_name || '')}"></label>
    <label class="field"><span>فروشنده / دکان</span><input name="vendor" value="${esc(e.vendor || '')}"></label>
    <label class="field"><span>شماره فاکتور</span><input name="factor_no" value="${esc(e.factor_no || '')}"></label>
    <label class="field full"><span>یادداشت</span><input name="note" value="${esc(e.note || '')}"></label></div>${datalist('exCats', listSetting('expense_categories'))}`,
    foot: `<button class="btn primary" id="ex_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
  const f = $('#exF', m.el);
  const F = (n) => $(`[name="${n}"]`, f);
  const autoAmt = () => { const q = parseFloat(F('qty').value), p = parseFloat(F('unit_price').value); if (!e.id && q && p && !F('amount').dataset.touched) F('amount').value = r2(q * p); };
  F('qty').oninput = autoAmt; F('unit_price').oninput = autoAmt; F('amount').oninput = () => F('amount').dataset.touched = 1;
  $('[data-x]', m.el).onclick = m.close;
  $('#ex_ok', m.el).onclick = () => busy($('#ex_ok', m.el), async () => {
    const v = formValues(f); if (e.id) v.id = e.id; if (!v.amount && v.unit_price) v.amount = v.unit_price;
    if (v.paid === '') v.paid = v.amount;
    await API.save('expenses', v); toast('ذخیره شد', 'good'); m.close(); after && after();
  }).catch(errToast);
}
Pages.expenses = {
  async render(view) {
    const [mf, mt] = currentMonthRange();
    view.innerHTML = `<div class="pageHead"><div><h1>مصارف و فاکتورهای دیگر</h1><p>فاکتورها و مصارف غیر دوایی: معاشات، بل برق، وایفای، قرطاسیه، مواد سونوگرافی… (جدا از فاکتورهای دوا).</p></div>
      <div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} مصرف جدید</button><button class="btn" data-act="csv">${icon('download')} CSV</button><button class="btn" data-act="print">${icon('print')} چاپ</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', mf, 'id="e_from"')}</label><label class="field"><span>تا</span>${dateInput('to', mt, 'id="e_to"')}</label>
        <label class="field"><span>کتگوری</span><select id="e_cat">${opt(listSetting('expense_categories'), '', { empty: 'همه' })}</select></label>
        <label class="field"><span>بخش</span><select id="e_sec">${opt(Object.entries(SECTIONS), '', { empty: 'همه' })}</select></label>
        <label class="check"><input type="checkbox" id="e_unp"> فقط پرداخت نشده</label><label class="field grow"><span>جستجو</span><input id="e_q"></label></div>
      <div class="grid g-21"><div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>تاریخ</th><th>کتگوری</th><th>جنس / شرح</th><th>تعداد</th><th>قیمت</th><th>مجموع</th><th>پرداخت</th><th>باقی</th><th>توسط</th><th>بخش</th><th></th></tr></thead><tbody id="eB"></tbody><tfoot id="eF"></tfoot></table></div></div>
      <div class="card"><h2>به تفکیک کتگوری</h2><div class="chartBox short"><canvas id="eC"></canvas></div><div id="eCat"></div></div></div>`;
    let rows = [];
    const load = async () => {
      const q = { from: dateOf($('#e_from', view)), to: dateOf($('#e_to', view)), q: $('#e_q', view).value.trim(), limit: 10000 };
      if ($('#e_cat', view).value) q['eq.category'] = $('#e_cat', view).value; if ($('#e_sec', view).value) q['eq.section'] = $('#e_sec', view).value; if ($('#e_unp', view).checked) q['gt.balance'] = 0.001;
      rows = await API.list('expenses', q);
      $('#eB', view).innerHTML = rows.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.category || '')}</td><td><b>${esc(e.item)}</b>${e.vendor ? ` <small class="muted">${esc(e.vendor)}</small>` : ''}</td><td>${esc(e.qty || '')}</td><td>${e.unit_price != null ? money(e.unit_price) : ''}</td><td class="money">${money(e.amount)}</td><td>${money(e.paid)}</td><td class="${e.balance > 0.001 ? 'neg' : ''}">${e.balance > 0.001 ? money(e.balance) : ''}</td><td>${esc(e.by_whom || '')}</td><td>${esc(SECTIONS[e.section] || '')}</td>
        <td class="nowrap"><button class="btn sm" data-act="edit" data-id="${e.id}">${icon('edit', 14)}</button> <button class="btn sm dangerText" data-act="del" data-id="${e.id}">${icon('trash', 14)}</button></td></tr>`).join('') || emptyRow(11);
      $('#eF', view).innerHTML = `<tr><td colspan="5">مجموع ${rows.length}</td><td>${money(sumBy(rows, 'amount'))}</td><td>${money(sumBy(rows, 'paid'))}</td><td>${money(sumBy(rows, 'balance'))}</td><td colspan="3"></td></tr>`;
      const cats = new Map(); rows.forEach(e => cats.set(e.category || 'سایر', (cats.get(e.category || 'سایر') || 0) + e.amount));
      const cs = [...cats.entries()].sort((a, b) => b[1] - a[1]);
      destroyCharts(); barChart($('#eC', view), cs.map(c => c[0]), [{ label: 'مصرف', data: cs.map(c => r2(c[1])) }], { money: true, horizontal: true });
      $('#eCat', view).innerHTML = `<table class="t">${cs.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${money(v)}</td></tr>`).join('')}</table>`;
    };
    $$('#e_from, #e_to, #e_cat, #e_sec, #e_unp', view).forEach(el => el.addEventListener('change', load)); $('#e_q', view).addEventListener('input', debounce(load, 300));
    actions(view, {
      new: () => expenseDialog(null, load), edit: (b) => expenseDialog(rows.find(r => r.id === Number(b.dataset.id)), load),
      del: async (b) => { if (await confirmDlg('این مصرف حذف شود؟', { danger: true })) { await API.del('expenses', b.dataset.id); load(); } },
      csv: () => exportCSV('expenses', rows, [['date', 'تاریخ'], ['category', 'کتگوری'], ['item', 'جنس'], ['qty', 'تعداد'], ['unit_price', 'قیمت'], ['amount', 'مجموع'], ['paid', 'پرداخت'], ['by_whom', 'توسط'], ['section', 'بخش']]),
      print: () => previewDoc(reportDocHTML('مصارف', `<table class="rt"><thead><tr><th>تاریخ</th><th>کتگوری</th><th>جنس</th><th>تعداد</th><th>قیمت</th><th>مجموع</th><th>توسط</th></tr></thead><tbody>${rows.map(e => `<tr><td>${esc(fmtDateNum(e.date))}</td><td>${esc(e.category || '')}</td><td>${esc(e.item)}</td><td>${esc(e.qty || '')}</td><td>${e.unit_price != null ? money(e.unit_price) : ''}</td><td>${money(e.amount)}</td><td>${esc(e.by_whom || '')}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="5">مجموع</td><td>${money(sumBy(rows, 'amount'))}</td><td></td></tr></tfoot></table>`, `${fmtDate(dateOf($('#e_from', view)))} — ${fmtDate(dateOf($('#e_to', view)))}`), { title: 'مصارف' })
    });
    await load();
  }
};

// ================================================================ withdrawals
Pages.withdrawals = {
  async render(view) {
    const [mf, mt] = currentMonthRange();
    view.innerHTML = `<div class="pageHead"><div><h1>برداشت‌ها</h1><p>پول برداشته شده از صندوق دواخانه، لابراتوار و پذیرش (عادی یا شخصی).</p></div><div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} برداشت جدید</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', mf, 'id="w_from"')}</label><label class="field"><span>تا</span>${dateInput('to', mt, 'id="w_to"')}</label><label class="field"><span>بخش</span><select id="w_sec">${opt([['pharmacy', 'دواخانه'], ['lab', 'لابراتوار'], ['reception', 'پذیرش']], '', { empty: 'همه' })}</select></label></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>تاریخ</th><th>بخش</th><th>نوع</th><th>مبلغ</th><th>برداشت توسط</th><th>یادداشت</th><th></th></tr></thead><tbody id="wB"></tbody><tfoot id="wF"></tfoot></table></div></div>`;
    let rows = [];
    const load = async () => {
      const q = { from: dateOf($('#w_from', view)), to: dateOf($('#w_to', view)), limit: 10000 }; if ($('#w_sec', view).value) q['eq.section'] = $('#w_sec', view).value;
      rows = await API.list('withdrawals', q);
      $('#wB', view).innerHTML = rows.map(w => `<tr><td>${fmtDate(w.date)}</td><td>${esc(SECTIONS[w.section] || w.section)}</td><td>${w.kind === 'personal' ? pill('شخصی', 'warn') : 'عادی'}</td><td class="money">${money(w.amount)}</td><td>${esc(w.by_whom || '')}</td><td>${esc(w.note || '')}</td>
        <td class="nowrap"><button class="btn sm" data-act="edit" data-id="${w.id}">${icon('edit', 14)}</button> <button class="btn sm dangerText" data-act="del" data-id="${w.id}">${icon('trash', 14)}</button></td></tr>`).join('') || emptyRow(7);
      $('#wF', view).innerHTML = `<tr><td colspan="3">مجموع</td><td>${money(sumBy(rows, 'amount'))}</td><td colspan="3">شخصی: ${money(sumBy(rows.filter(r => r.kind === 'personal'), 'amount'))}</td></tr>`;
    };
    $$('#w_from, #w_to, #w_sec', view).forEach(el => el.addEventListener('change', load));
    actions(view, { new: () => withdrawalDialog('pharmacy', load), edit: (b) => withdrawalDialog(null, load, rows.find(r => r.id === Number(b.dataset.id))), del: async (b) => { if (await confirmDlg('حذف شود؟', { danger: true })) { await API.del('withdrawals', b.dataset.id); load(); } } });
    await load();
  }
};

// ================================================================ daily accounts (حسابات روزانه)
Pages.daily = {
  async render(view) {
    const [mf, mt] = currentMonthRange();
    view.innerHTML = `<div class="pageHead"><div><h1>حسابات روزانه</h1><p>مثل دفتر «حسابات ماهوار»: فروش دواخانه، لابراتوار، فیس پذیرش، برداشت‌ها و مصارف هر روز — همه خودکار از سیستم.</p></div>
      <div class="toolbar"><button class="btn" data-act="wd">${icon('wallet')} ثبت برداشت</button><button class="btn" data-act="csv">${icon('download')} CSV</button><button class="btn" data-act="print">${icon('print')} چاپ</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', mf, 'id="d_from"')}</label><label class="field"><span>تا</span>${dateInput('to', mt, 'id="d_to"')}</label>
        <div class="chips">${lastMonths(4).reverse().map(m => `<button type="button" class="chip" data-m="${m.range[0]}|${m.range[1]}">${esc(m.label)}</button>`).join('')}</div></div>
      <div class="grid g4" id="dK" style="margin-bottom:16px"></div>
      <div class="card"><div class="tableWrap"><table class="t" id="dT"><thead><tr><th>تاریخ</th><th>فروشات دواخانه</th><th>برداشتی دواخانه</th><th>برداشت توسط</th><th>لابراتوار</th><th>برداشتی لابراتوار</th><th>برداشت شخصی</th><th>فیس پذیرش</th><th>بستر</th><th>مصارف</th><th>مفاد دواخانه</th><th>باقی بعد از برداشت</th></tr></thead><tbody id="dB"></tbody><tfoot id="dF"></tfoot></table></div></div>`;
    let rows = [], wds = [];
    const load = async () => {
      const from = dateOf($('#d_from', view)), to = dateOf($('#d_to', view));
      [rows, wds] = await Promise.all([API.get('/api/reports/days', { from, to }), API.list('withdrawals', { from, to, limit: 10000 })]);
      rows = rows.filter(r => r.income || r.withdrawals || r.expenses);
      const by = (d) => [...new Set(wds.filter(w => w.date === d && w.by_whom).map(w => w.by_whom))].join('، ');
      $('#dB', view).innerHTML = rows.map(r => `<tr><td>${fmtDateNum(r.date)} <small class="muted">${weekday(r.date)}</small></td><td class="money">${money(r.ph_net)}</td><td class="neg">${r.wd_pharmacy ? money(r.wd_pharmacy) : ''}</td><td>${esc(by(r.date))}</td><td>${money(r.lab_total)}</td><td class="neg">${r.wd_lab ? money(r.wd_lab) : ''}</td><td class="neg">${r.wd_personal ? money(r.wd_personal) : ''}</td>
        <td>${money(r.reception)}</td><td>${r.ipd ? money(r.ipd) : ''}</td><td class="neg">${r.expenses ? money(r.expenses) : ''}</td><td class="pos">${r.ph_profit ? money(r.ph_profit) : ''}</td><td class="money">${money(r.cash_left)}</td></tr>`).join('') || emptyRow(12);
      const S = (k) => r2(sumBy(rows, k));
      $('#dF', view).innerHTML = `<tr><td>مجموع</td><td>${money(S('ph_net'))}</td><td>${money(S('wd_pharmacy'))}</td><td></td><td>${money(S('lab_total'))}</td><td>${money(S('wd_lab'))}</td><td>${money(S('wd_personal'))}</td><td>${money(S('reception'))}</td><td>${money(S('ipd'))}</td><td>${money(S('expenses'))}</td><td>${money(S('ph_profit'))}</td><td>${money(S('cash_left'))}</td></tr>`;
      $('#dK', view).innerHTML = kpi('فروشات دواخانه', money(S('ph_net')), { ic: 'pill', cls: 'good' }) + kpi('لابراتوار', money(S('lab_total')), { ic: 'flask' }) + kpi('مجموع برداشت‌ها', money(S('withdrawals')), { ic: 'wallet', cls: 'warn' }) + kpi('باقی بعد از برداشت و مصارف', money(S('cash_left')), { ic: 'money', cls: 'violet' });
    };
    $$('#d_from, #d_to', view).forEach(el => el.addEventListener('change', load));
    $$('[data-m]', view).forEach(c => c.onclick = () => { const [a, b] = c.dataset.m.split('|'); setDateInput($('#d_from', view), a); setDateInput($('#d_to', view), b); });
    actions(view, {
      wd: () => withdrawalDialog('pharmacy', load),
      csv: () => exportCSV('daily-accounts', rows, [[r => fmtDateNum(r.date), 'تاریخ'], ['ph_net', 'فروشات دواخانه'], ['wd_pharmacy', 'برداشتی دواخانه'], ['lab_total', 'لابراتوار'], ['wd_lab', 'برداشتی لابراتوار'], ['wd_personal', 'برداشت شخصی'], ['reception', 'فیس پذیرش'], ['ipd', 'بستر'], ['expenses', 'مصارف'], ['ph_profit', 'مفاد دواخانه'], ['cash_left', 'باقی']]),
      print: () => previewDoc(reportDocHTML('حسابات روزانه', `<table class="rt">${$('#dT', view).innerHTML}</table>`, `${fmtDate(dateOf($('#d_from', view)))} — ${fmtDate(dateOf($('#d_to', view)))}`), { title: 'حسابات روزانه' })
    });
    await load();
  }
};

// ================================================================ monthly report & profit
Pages.monthly = {
  async render(view) {
    const months = lastMonths(12);
    view.innerHTML = `<div class="pageHead"><div><h1>گزارش ماهانه و مفاد</h1><p>فروش کل دواخانه، قیمت تمام شد، مفاد، عاید لابراتوار و پذیرش، مصارف و مفاد خالص هر ماه.</p></div><div class="toolbar"><button class="btn" data-act="csv">${icon('download')} CSV</button><button class="btn" data-act="print">${icon('print')} چاپ</button></div></div>
      <div class="grid g4" id="mK"></div>
      <div class="card" style="margin-top:16px"><h2>مفاد خالص ماهانه</h2><div id="lg"></div><div class="chartBox tall"><canvas id="mC"></canvas></div></div>
      <div class="card"><div class="tableWrap"><table class="t" id="mT"><thead><tr><th>ماه</th><th>فروش دواخانه</th><th>قیمت تمام شد</th><th>مفاد دواخانه</th><th>فیصدی مفاد</th><th>لابراتوار</th><th>پذیرش</th><th>بستر</th><th>مصارف</th><th>مفاد خالص</th><th>خرید دوا</th><th>پرداخت به کمپنی‌ها</th><th>برداشت‌ها</th></tr></thead><tbody id="mB"></tbody><tfoot id="mF"></tfoot></table></div></div>
      <div class="card"><div class="cardHead"><h2>پرفروش‌ترین دواهای ماه</h2><select id="mSel" style="width:auto">${months.slice().reverse().map(m => `<option value="${m.range[0]}|${m.range[1]}">${esc(m.label)}</option>`).join('')}</select></div><div id="mTop"></div></div>`;
    const days = await API.get('/api/reports/days', { from: months[0].range[0], to: months[months.length - 1].range[1] });
    const agg = monthsAgg(days, months);
    const cur = agg[agg.length - 1], prev = agg[agg.length - 2] || {};
    const delta = (a, b) => b ? `<span class="delta ${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / (b || 1) * 100))}٪ نسبت به ماه قبل</span>` : '';
    $('#mK', view).innerHTML = kpi('فروش دواخانه این ماه', money(cur.ph_net), { ic: 'pill', cls: 'good', sub: delta(cur.ph_net, prev.ph_net) }) + kpi('مفاد دواخانه این ماه', money(cur.ph_profit), { ic: 'trend', sub: cur.ph_net ? `${Math.round(cur.ph_profit / Math.max(1, cur.ph_sales - cur.ph_returns) * 100)}٪ مفاد` : '' })
      + kpi('مصارف این ماه', money(cur.expenses), { ic: 'receipt', cls: 'bad', sub: delta(cur.expenses, prev.expenses) }) + kpi('مفاد خالص این ماه', money(cur.net_profit), { ic: 'money', cls: 'violet', sub: 'دواخانه + لابراتوار + پذیرش + بستر − مصارف' });
    $('#lg', view).innerHTML = legendHTML([{ label: 'مفاد دواخانه' }, { label: 'لابراتوار' }, { label: 'پذیرش' }, { label: 'مصارف' }, { label: 'مفاد خالص' }]);
    barChart($('#mC', view), agg.map(m => m.short), [{ label: 'مفاد دواخانه', data: agg.map(m => m.ph_profit) }, { label: 'لابراتوار', data: agg.map(m => m.lab_total) }, { label: 'پذیرش', data: agg.map(m => m.reception) }, { label: 'مصارف', data: agg.map(m => -m.expenses) }, { label: 'مفاد خالص', data: agg.map(m => m.net_profit), type: 'line' }], { money: true });
    $('#mB', view).innerHTML = agg.slice().reverse().map(m => `<tr><td><b>${esc(m.label)}</b></td><td class="money">${money(m.ph_net)}</td><td>${money(m.ph_cost)}</td><td class="pos">${money(m.ph_profit)}</td><td>${m.ph_sales ? Math.round(m.ph_profit / Math.max(1, m.ph_sales - m.ph_returns) * 100) + '٪' : ''}</td><td>${money(m.lab_total)}</td><td>${money(m.reception)}</td><td>${money(m.ipd)}</td><td class="neg">${money(m.expenses)}</td><td class="money ${m.net_profit >= 0 ? 'pos' : 'neg'}">${money(m.net_profit)}</td><td>${money(m.purchases)}</td><td>${money(m.supplier_paid)}</td><td>${money(m.withdrawals)}</td></tr>`).join('');
    const S = (k) => sumBy(agg, k);
    $('#mF', view).innerHTML = `<tr><td>۱۲ ماه</td><td>${money(S('ph_net'))}</td><td>${money(S('ph_cost'))}</td><td>${money(S('ph_profit'))}</td><td></td><td>${money(S('lab_total'))}</td><td>${money(S('reception'))}</td><td>${money(S('ipd'))}</td><td>${money(S('expenses'))}</td><td>${money(S('net_profit'))}</td><td>${money(S('purchases'))}</td><td>${money(S('supplier_paid'))}</td><td>${money(S('withdrawals'))}</td></tr>`;
    const loadTop = async () => { const [a, b] = $('#mSel', view).value.split('|'); const r = (await API.get('/api/reports/medicine-sales', { from: a, to: b })).slice(0, 20); $('#mTop', view).innerHTML = `<table class="t"><thead><tr><th>دوا</th><th>تعداد</th><th>فروش</th><th>قیمت تمام شد</th><th>مفاد</th></tr></thead><tbody>${r.map(x => `<tr><td class="en">${esc(x.name)}</td><td>${fmtNum(x.qty)}</td><td>${money(x.revenue)}</td><td>${money(x.cost)}</td><td class="pos">${money(x.profit)}</td></tr>`).join('') || emptyRow(5)}</tbody></table>`; };
    $('#mSel', view).onchange = loadTop; loadTop();
    actions(view, {
      csv: () => exportCSV('monthly-report', agg, [['label', 'ماه'], ['ph_net', 'فروش دواخانه'], ['ph_cost', 'قیمت تمام شد'], ['ph_profit', 'مفاد دواخانه'], ['lab_total', 'لابراتوار'], ['reception', 'پذیرش'], ['ipd', 'بستر'], ['expenses', 'مصارف'], ['net_profit', 'مفاد خالص'], ['purchases', 'خرید دوا'], ['supplier_paid', 'پرداخت به کمپنی'], ['withdrawals', 'برداشت']]),
      print: () => previewDoc(reportDocHTML('گزارش ماهانه و مفاد', `<table class="rt">${$('#mT', view).innerHTML}</table>`), { title: 'گزارش ماهانه' })
    });
  }
};

// ================================================================ per-medicine sales
Pages['med-sales'] = {
  async render(view) {
    const [mf] = currentMonthRange(); const full = isRole('stock');
    view.innerHTML = `<div class="pageHead"><div><h1>فروش ${full ? 'و مفاد ' : ''}هر دوا</h1><p>تعداد فروخته شده و مجموع فروش هر دوا در بازه انتخاب شده.</p></div><div class="toolbar"><button class="btn" data-act="csv">${icon('download')} CSV</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', mf, 'id="ms_from"')}</label><label class="field"><span>تا</span>${dateInput('to', today(), 'id="ms_to"')}</label></div>
      <div class="grid g-12"><div class="card"><h2>۱۰ دوای پرفروش</h2><div class="chartBox tall"><canvas id="msC"></canvas></div></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>کد</th><th>دوا</th><th>تعداد</th><th>دفعات فروش</th><th>فروش</th>${full ? '<th>قیمت تمام شد</th><th>مفاد</th><th>٪</th>' : ''}</tr></thead><tbody id="msB"></tbody><tfoot id="msF"></tfoot></table></div></div></div>`;
    let rows = [];
    const load = async () => {
      rows = await API.get('/api/reports/medicine-sales', { from: dateOf($('#ms_from', view)), to: dateOf($('#ms_to', view)) });
      $('#msB', view).innerHTML = rows.map(r => `<tr><td class="codeTag">${r.code}</td><td class="en"><b>${esc(r.name)}</b> <small class="muted">${esc(r.strength || '')}</small></td><td>${fmtNum(r.qty)} <small>${esc(r.unit || '')}</small></td><td>${r.sales}</td><td class="money">${money(r.revenue)}</td>${full ? `<td>${money(r.cost)}</td><td class="pos">${money(r.profit)}</td><td>${r.revenue ? Math.round(r.profit / r.revenue * 100) : 0}٪</td>` : ''}</tr>`).join('') || emptyRow(8);
      $('#msF', view).innerHTML = `<tr><td colspan="4">مجموع</td><td>${money(sumBy(rows, 'revenue'))}</td>${full ? `<td>${money(sumBy(rows, 'cost'))}</td><td>${money(sumBy(rows, 'profit'))}</td><td></td>` : ''}</tr>`;
      destroyCharts(); const t = rows.slice(0, 10);
      barChart($('#msC', view), t.map(r => r.name), [{ label: 'فروش', data: t.map(r => r.revenue) }, ...(full ? [{ label: 'مفاد', data: t.map(r => r.profit) }] : [])], { money: true, horizontal: true });
    };
    $$('#ms_from, #ms_to', view).forEach(el => el.addEventListener('change', load));
    actions(view, { csv: () => exportCSV('medicine-sales', rows, [['code', 'کد'], ['name', 'دوا'], ['qty', 'تعداد'], ['revenue', 'فروش'], ...(full ? [['cost', 'قیمت تمام شد'], ['profit', 'مفاد']] : [])]) });
    await load();
  }
};

// ================================================================ Excel import
Pages.import = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>ورود اطلاعات از اکسل</h1><p>فایل اکسل قبلی کلینیک (Database.xlsx) را وارد کنید تا سوابق قبلی در گزارش‌ها حساب شود.</p></div></div>
      <div class="card"><h2>${icon('excel')} چه چیزهایی وارد می‌شود؟</h2>
        <table class="t"><thead><tr><th>شیت اکسل</th><th>وارد می‌شود به</th></tr></thead><tbody>
        <tr><td><b>stock</b> (شماره، تاریخ، شماره فاکتور، مبلغ فاکتور، کمپانی، تحویل گیرنده، باقیات، وضعیت، رسید)</td><td>فاکتورهای خرید دوا (بدون اقلام) + وضعیت پرداخت</td></tr>
        <tr><td><b>مصارف</b> (تاریخ، جنس، تعداد، قیمت، مجموع، توسط)</td><td>مصارف و فاکتورهای دیگر</td></tr>
        <tr><td><b>حسابات ماهوار دواخانه</b> (فروشات، برداشتی‌ها، لابراتوار…)</td><td>فروش روزانه قبلی + برداشت‌ها</td></tr>
        <tr><td><b>Medicines</b> (اسم دارو، کمپانی، انقضاء، تعداد، قیمت خرید، مفاد، قیمت فروش…)</td><td>لیست دواها + موجودی اولیه</td></tr></tbody></table>
        <div class="infoBox" style="margin-top:12px">ردیف‌های تکراری دوباره وارد نمی‌شوند؛ قبل از ورود، از دیتابیس پشتیبان گرفته می‌شود. تاریخ‌ها شمسی (مثل 10/5/1405) خوانده می‌شوند.</div>
        <button class="btn primary lg" data-act="pick">${icon('upload')} انتخاب فایل اکسل…</button><div id="impRes" style="margin-top:14px"></div></div>`;
    actions(view, {
      pick: async (b) => {
        const f = await pickFile('.xlsx,.xlsm,.xls'); if (!f) return;
        await busy(b, async () => {
          const data = await fileToBase64(f);
          const s = await API.post('/api/import/excel', { data, name: f.name });
          $('#impRes', view).innerHTML = `<div class="sum"><span>شیت‌ها: <b>${esc(s.sheets.join('، ') || '—')}</b></span><span>فاکتور خرید: <b>${s.purchases}</b></span><span>مصارف: <b>${s.expenses}</b></span><span>روزهای فروش: <b>${s.daily}</b></span><span>برداشت: <b>${s.withdrawals}</b></span><span>دوا: <b>${s.medicines}</b></span><span class="muted">رد شده/تکراری: ${s.skipped}</span></div>`;
          toast('ورود اطلاعات انجام شد', 'good');
        });
      }
    });
  }
};

// ================================================================ automatic re-order suggestions → purchase order / factor
Pages.reorder = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>سفارش خرید (کمبودها)</h1><p>دواهایی که موجودی آن‌ها به حد سفارش رسیده؛ مقدار پیشنهادی از فروش ۳۰ روز گذشته حساب می‌شود. سفارش را چاپ کنید یا مستقیم فاکتور خرید بسازید.</p></div>
      <div class="toolbar"><button class="btn" data-act="print">${icon('print')} چاپ سفارش</button>${isRole('stock') ? `<button class="btn primary" data-act="factor">${icon('truck')} ساختن فاکتور خرید از انتخاب‌ها</button>` : ''}</div></div>
      <div class="filterBar"><label class="field"><span>کمپنی (آخرین خرید)</span><select id="roSup"></select></label><label class="field grow"><span>جستجو</span><input id="roQ"></label></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th><input type="checkbox" id="roAll" checked></th><th>کد</th><th>دوا</th><th>موجودی</th><th>حد سفارش</th><th>فروش ۳۰ روز</th><th>مقدار سفارش</th><th>آخرین قیمت خرید</th><th>جمع</th><th>آخرین کمپنی</th></tr></thead><tbody id="roB"></tbody><tfoot id="roF"></tfoot></table></div></div>`;
    const rows = await API.get('/api/stock/reorder');
    const st = new Map(rows.map(r => [r.id, { on: true, qty: r.suggest }]));
    const sups = [...new Set(rows.map(r => r.last_supplier).filter(Boolean))];
    $('#roSup', view).innerHTML = opt(sups, '', { empty: 'همه' });
    const visible = () => { const q = $('#roQ', view).value.trim().toLowerCase(), sp = $('#roSup', view).value; return rows.filter(r => (!sp || r.last_supplier === sp) && (!q || [r.name, r.generic, String(r.code)].some(x => String(x || '').toLowerCase().includes(q)))); };
    const draw = () => {
      const list = visible();
      $('#roB', view).innerHTML = list.map(r => { const x = st.get(r.id); return `<tr data-id="${r.id}" class="${r.stock <= 0 ? 'short' : ''}"><td><input type="checkbox" data-on ${x.on ? 'checked' : ''}></td><td class="codeTag">${r.code}</td><td class="en"><b>${esc(r.name)}</b> <small class="muted">${esc([r.form, r.strength].filter(Boolean).join(' '))}</small></td>
        <td class="${r.stock <= 0 ? 'neg' : ''}">${fmtNum(r.stock)}</td><td>${fmtNum(r.reorder_level)}</td><td>${fmtNum(r.sold_30)}</td><td><input type="number" data-qty value="${x.qty}" style="width:90px"></td><td>${money(r.last_buy)}</td><td class="money">${money(x.qty * (r.last_buy || 0))}</td><td>${esc(r.last_supplier || '—')}</td></tr>`; }).join('') || emptyRow(10, 'کمبودی نیست ✓');
      const sel = list.filter(r => st.get(r.id).on);
      $('#roF', view).innerHTML = `<tr><td colspan="6">${sel.length} قلم انتخاب شده</td><td></td><td></td><td>${money(sel.reduce((a, r) => a + st.get(r.id).qty * (r.last_buy || 0), 0))}</td><td></td></tr>`;
    };
    $('#roB', view).addEventListener('input', (e) => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; const x = st.get(Number(tr.dataset.id)); if (e.target.matches('[data-qty]')) x.qty = Number(e.target.value) || 0; if (e.target.matches('[data-on]')) x.on = e.target.checked; draw(); });
    $('#roAll', view).onchange = (e) => { visible().forEach(r => { st.get(r.id).on = e.target.checked; }); draw(); };
    $('#roSup', view).onchange = draw; $('#roQ', view).addEventListener('input', debounce(draw, 200));
    const chosen = () => visible().filter(r => st.get(r.id).on && st.get(r.id).qty > 0);
    actions(view, {
      print: () => { const list = chosen(); previewDoc(reportDocHTML('سفارش خرید دوا' + ($('#roSup', view).value ? ' — ' + $('#roSup', view).value : ''), `<table class="rt rtl"><thead><tr><th>#</th><th>کد</th><th>دوا</th><th>موجودی</th><th>مقدار سفارش</th><th>قیمت تخمینی</th><th>جمع</th></tr></thead><tbody>${list.map((r, i) => `<tr><td>${i + 1}</td><td>${r.code}</td><td class="en">${esc(r.name)} ${esc(r.strength || '')}</td><td>${fmtNum(r.stock)}</td><td><b>${fmtNum(st.get(r.id).qty)}</b></td><td>${money(r.last_buy)}</td><td>${money(st.get(r.id).qty * (r.last_buy || 0))}</td></tr>`).join('')}</tbody></table>`, fmtDate(today())), { title: 'سفارش خرید' }); },
      factor: () => {
        const list = chosen(); if (!list.length) throw new Error('دوایی انتخاب نشده');
        const mk = Number(App.settings.default_markup || 30);
        const items = list.map(r => ({ medicine_id: r.id, med_code: r.code, name: r.name, strength: r.strength, batch_no: '', expiry: '', qty: st.get(r.id).qty, bonus: 0, buy_price: r.last_buy || 0, markup_pct: r.markup_pct || mk, sell_price: r.sell_price }));
        openPurchase(null, () => go('reorder'), { supplier_name: $('#roSup', view).value || list[0].last_supplier || '', items, notes: 'از سفارش خرید (کمبودها)' });
      }
    });
    draw();
  }
};
