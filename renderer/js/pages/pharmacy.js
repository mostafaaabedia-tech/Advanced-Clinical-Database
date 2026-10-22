/* Pharmacy station: prescriptions inbox, dispensing by prescription code (POS), sales, returns, daily totals */
'use strict';

// ================================================================ inbox
Pages['rx-inbox'] = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>نسخه‌های رسیده از داکتران</h1><p>نسخه‌ها از طریق شبکه به‌صورت زنده می‌رسند. روی نسخه کلیک کنید یا کد نسخه را در صفحه فروش وارد کنید.</p></div>
      <div class="toolbar"><button class="btn primary lg" data-act="pos">${icon('pill')} فروش / وارد کردن کد</button></div></div>
      <div class="tabs" id="ibTabs"><button class="on" data-t="open">منتظر تحویل</button><button data-t="done">تحویل شده امروز</button></div>
      <div class="inbox" id="ib"></div>`;
    let tab = 'open';
    const load = async () => {
      const q = tab === 'open' ? { 'in.status': 'new,partial', from: isoDate(addDays(new Date(), -7)), order: 'id', limit: 300 } : { 'eq.status': 'dispensed', 'ge.dispensed_at': today(), order: 'id desc', limit: 300 };
      const rows = await API.list('prescriptions', q);
      $('#ib', view).innerHTML = rows.map(r => `<div class="rxCard ${r.status}" data-code="${esc(r.rx_code)}" style="cursor:pointer">
        <div style="min-width:110px;text-align:center"><div class="rxCode">${esc(r.rx_code)}</div><small class="muted">${esc(fmtTime(r.created_at))} · ${fmtDate(r.date)}</small></div>
        <div class="grow"><b>${esc(r.full_name)}</b> <small class="muted">ولد ${esc(r.father_name || '—')} · ${esc(r.patient_code)}</small><div class="mini">${esc(doctorName({ title: r.doctor_title, name: r.doctor_name }))} · ${r.item_count} قلم دوا${r.discount_pct ? ` · <b class="pos">تخفیف داکتر ${fmtNum(r.discount_pct)}٪</b>` : ''}</div></div>
        ${statusPill(RX_STATUS, r.status)}<button class="btn primary">${icon('next', 15)} باز کردن</button></div>`).join('') || `<div class="card empty">${tab === 'open' ? 'نسخه منتظر وجود ندارد ✓' : 'امروز نسخه‌ای تحویل نشده'}</div>`;
    };
    $('#ibTabs', view).onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; $$('#ibTabs button', view).forEach(x => x.classList.toggle('on', x === b)); load(); };
    view.addEventListener('click', (e) => { const c = e.target.closest('.rxCard'); if (c) go('pos', { code: c.dataset.code }); });
    actions(view, { pos: () => go('pos') });
    await load(); this._load = load;
  },
  onEvent(m) { if ((m.type.startsWith('rx') || m.type.startsWith('sale')) && this._load) this._load(); }
};

// ================================================================ POS / dispensing
// central cashier: the pharmacy station only bills; the money is collected at the reception
const centralPharmacy = () => (App.settings.cashier_mode || 'central') === 'central' && App.user?.station === 'pharmacy';
Pages.pos = {
  async render(view, params) {
    const st = { rx: null, lines: [], walkin: !params.code };
    const central = centralPharmacy();
    view.innerHTML = `<div class="pageHead"><div><h1>فروش و تحویل نسخه</h1><p>کد نسخه را بنویسید یا بارکود نسخه را اسکن کنید. سیستم دواها، موجودی و قیمت را حساب می‌کند. برای فروش آزاد، دوا را مستقیم جستجو کنید.</p></div>
      <div class="toolbar"><button class="btn" data-act="inbox">${icon('bell')} نسخه‌های رسیده</button><button class="btn" data-act="clear">${icon('refresh')} فروش جدید</button></div></div>
      <div class="posGrid">
        <div>
          <div class="card"><div class="codeEntry"><input id="rxCode" placeholder="کد نسخه — مثلاً 12 یا RX-00012" autocomplete="off" value="${esc(params.code || '')}"><button class="btn primary lg" data-act="load">${icon('search')} باز کردن نسخه</button></div>
            <div id="rxHead" style="margin-top:12px"></div></div>
          <div class="card"><div class="cardHead"><h2>${icon('pill')} اقلام</h2><div class="searchBox" style="min-width:320px"><input id="addMed" placeholder="افزودن دوا: نام، کد دوا یا بارکود…" autocomplete="off"></div></div>
            <div class="tableWrap"><table class="t posT"><thead><tr><th>#</th><th>نسخه داکتر</th><th>دوای دواخانه</th><th>موجود</th><th>تعداد</th><th>قیمت</th><th>جمع</th><th></th></tr></thead><tbody id="lines"></tbody></table></div></div>
        </div>
        <div>
          <div class="card" style="position:sticky;top:0">
            <h2>${icon('money')} حساب</h2>
            <label class="field" id="ptNameBox"><span>نام مشتری (برای فروش آزاد)</span><input id="ptName"></label>
            <div class="totals">
              <div><span>جمع کل</span><b id="tSub">0</b></div>
              <div><span>تخفیف ٪ <small id="drDisc" class="muted"></small></span><span class="bar"><input type="number" id="dPct" min="0" max="100" value="0" style="width:70px"> <small>یا مبلغ</small> <input type="number" id="dAmt" min="0" style="width:90px"></span></div>
              <div><span>قابل پرداخت</span><b id="tNet">0</b></div>
            </div>
            <div class="bigTotal" id="bigNet">0</div>
            <div class="formGrid" style="margin-top:10px">
              ${central ? `<div class="infoBox full">${icon('cash', 15)} پول در <b>صندوق پذیرش</b> گرفته می‌شود. بعد از ثبت، بل با کد فروش به صندوق می‌رود؛ وقتی پرداخت شد اینجا خبر می‌آید.</div><input type="hidden" id="paid" value=""><input type="hidden" id="pm" value="cash">`
                : `<label class="field"><span>دریافت شده</span><input type="number" id="paid"></label>
              <label class="field"><span>طریقه</span><select id="pm">${opt(Object.entries(PAY_METHODS), 'cash')}</select></label>`}
              <label class="field full"><span>یادداشت</span><input id="note"></label>
            </div>
            <div class="sum" id="change"></div>
            <div class="stack" style="margin-top:12px">
              <button class="btn primary lg" data-act="sell" data-print="1" style="justify-content:center">${icon('print')} ${central ? 'ثبت، ارسال به صندوق و چاپ دو رسید' : 'ثبت فروش و چاپ دو رسید'} <span class="kbd">F9</span></button>
              <button class="btn" data-act="sell" style="justify-content:center">${icon('check')} ثبت بدون چاپ</button>
            </div>
          </div>
        </div>
      </div>`;
    const linesEl = $('#lines', view);
    const draw = () => {
      linesEl.innerHTML = st.lines.map((l, i) => {
        const short = l.med && l.qty > l.med.stock;
        return `<tr class="${short ? 'short' : ''}" data-i="${i}"><td class="c"><input type="checkbox" data-f="on" ${l.on ? 'checked' : ''} style="width:auto"></td>
          <td>${l.rx ? `<div class="en"><b>${esc(l.rx.name)}</b> <small>${esc([l.rx.form, l.rx.strength, l.rx.unit].filter(Boolean).join(' '))}</small></div><small class="muted en">${esc([rxSigEn(l.rx), rxEn(l.rx.timing), rxDurationEn(l.rx)].filter(Boolean).join(' · '))}${l.rx.qty ? ' — تعداد نسخه: ' + fmtNum(l.rx.qty) : ''}${l.dispensed ? ' — قبلاً: ' + fmtNum(l.dispensed) : ''}</small>` : '<small class="muted">اضافه (بدون نسخه)</small>'}</td>
          <td class="medCell">${l.med ? `<b>${esc(l.med.name)}</b> <small class="muted">#${l.med.code} ${esc(l.med.strength || '')}</small>` : '<span class="neg">در لیست دواخانه پیدا نشد</span>'}<br><button class="btn sm ghost" data-pick="${i}">${icon('search', 12)} ${l.med ? 'تغییر' : 'انتخاب دوا'}</button>
            ${(!l.med || l.med.stock <= 0) && (l.alts || []).length ? `<div class="altHint">جایگزین موجود (همان ماده): ${l.alts.map((a, k) => `<a href="#" data-alt="${i}:${k}">${esc(a.name)} ${esc(a.strength || '')} (${fmtNum(a.stock)})</a>`).join(' · ')}</div>` : ''}
            ${l.med && l.med.stock <= 0 && !l.alts ? `<a href="#" class="altHint" data-findalt="${i}">جستجوی جایگزین</a>` : ''}</td>
          <td class="${l.med && l.med.stock > 0 ? 'pos' : 'neg'}">${l.med ? fmtNum(l.med.stock) + ' ' + esc(l.med.unit || '') : '—'}</td>
          <td><input type="number" data-f="qty" value="${l.qty}" min="0"></td><td><input type="number" data-f="price" value="${l.price}" min="0" ${isRole('stock') || App.user.role === 'pharmacy' ? '' : 'readonly'}></td>
          <td class="money">${money(l.on ? l.qty * l.price : 0)}</td><td><button class="btn ghost icon" data-rm="${i}">${icon('x', 14)}</button></td></tr>`;
      }).join('') || emptyRow(8, 'کد نسخه را وارد کنید یا دوا اضافه کنید');
      calc();
    };
    const calc = () => {
      const sub = r2(st.lines.filter(l => l.on && l.med).reduce((a, l) => a + l.qty * l.price, 0));
      let disc = $('#dAmt', view).value !== '' ? Math.min(sub, Number($('#dAmt', view).value) || 0) : r2(sub * (Number($('#dPct', view).value) || 0) / 100);
      const net = r2(sub - disc);
      $('#tSub', view).textContent = money(sub); $('#tNet', view).textContent = money(net); $('#bigNet', view).textContent = money(net) + ' ' + currency();
      if (central) { $('#change', view).innerHTML = `<span>قابل پرداخت در صندوق پذیرش: <b>${money(net)}</b></span>`; st.net = net; st.disc = disc; st.sub = sub; return; }
      if (!$('#paid', view).dataset.touched) $('#paid', view).value = net;
      const paid = Number($('#paid', view).value) || 0;
      $('#change', view).innerHTML = paid > net ? `<span>باقی برای مشتری: <b class="pos">${money(paid - net)}</b></span>` : paid < net ? `<span>باقی‌مانده (قرض): <b class="neg">${money(net - paid)}</b></span>` : '<span>حساب تصفیه</span>';
      st.net = net; st.disc = disc; st.sub = sub;
    };
    linesEl.addEventListener('input', (e) => {
      const tr = e.target.closest('tr[data-i]'); if (!tr) return; const l = st.lines[Number(tr.dataset.i)]; const f = e.target.dataset.f;
      if (f === 'qty') l.qty = Number(e.target.value) || 0; if (f === 'price') l.price = Number(e.target.value) || 0; if (f === 'on') l.on = e.target.checked;
      const cells = tr.children; cells[6].textContent = money(l.on ? l.qty * l.price : 0); tr.classList.toggle('short', !!(l.med && l.qty > l.med.stock)); calc();
    });
    linesEl.addEventListener('change', (e) => { if (e.target.dataset.f === 'on') { st.lines[Number(e.target.closest('tr').dataset.i)].on = e.target.checked; draw(); } });
    linesEl.addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-rm]'); if (rm) { st.lines.splice(Number(rm.dataset.rm), 1); draw(); return; }
      const alt = e.target.closest('[data-alt]'); if (alt) { e.preventDefault(); const [i, k] = alt.dataset.alt.split(':').map(Number); const l = st.lines[i]; const med = l.alts[k]; Object.assign(l, { med, price: med.sell_price, on: true, qty: Math.min(l.qty || 1, med.stock) || 1 }); toast('جایگزین شد: ' + med.name, 'good'); draw(); return; }
      const fa = e.target.closest('[data-findalt]'); if (fa) { e.preventDefault(); const l = st.lines[Number(fa.dataset.findalt)]; l.alts = await API.get('/api/medicine-alternatives/' + l.med.id).catch(() => []); if (!l.alts.length) toast('دوای جایگزین با همان ماده (generic) موجود نیست', 'warn'); draw(); return; }
      const pk = e.target.closest('[data-pick]'); if (pk) {
        const i = Number(pk.dataset.pick);
        const m = modal({ title: 'انتخاب دوا از دواخانه', body: `<div class="searchBox"><input id="pk_q" value="${esc(st.lines[i].rx?.name || '')}" placeholder="نام یا کد دوا"></div><div id="pk_r" style="margin-top:10px"></div>` });
        const run = async () => { const r = await API.get('/api/medicine-search', { q: $('#pk_q', m.el).value.trim() || 'a' }); $('#pk_r', m.el).innerHTML = `<table class="t"><tbody>${r.map((x, k) => `<tr class="clickable" data-k="${k}"><td class="codeTag">${x.code}</td><td class="en"><b>${esc(x.name)}</b> ${esc(x.form || '')} ${esc(x.strength || '')}</td><td class="${x.stock > 0 ? 'pos' : 'neg'}">${fmtNum(x.stock)}</td><td>${money(x.sell_price)}</td></tr>`).join('') || emptyRow(4)}</tbody></table>`; m._r = r; };
        $('#pk_q', m.el).addEventListener('input', debounce(run, 250)); run();
        $('#pk_r', m.el).onclick = (ev) => { const tr = ev.target.closest('[data-k]'); if (!tr) return; const med = m._r[Number(tr.dataset.k)]; Object.assign(st.lines[i], { med, price: med.sell_price, on: true }); m.close(); draw(); };
      }
    });
    const addLine = (med, qty = 1) => {
      const ex = st.lines.find(l => !l.rx && l.med && l.med.id === med.id); if (ex) ex.qty += qty;
      else st.lines.push({ rx: null, med, qty, price: med.sell_price, on: true });
      draw(); $('#addMed', view).value = '';
    };
    autocomplete($('#addMed', view), {
      fetch: (q) => API.get('/api/medicine-search', { q }),
      render: (m) => `<span class="code">${m.code}</span><span class="nm">${esc(m.name)} <small class="muted">${esc([m.form, m.strength].filter(Boolean).join(' · '))}</small></span><small class="${m.stock > 0 ? 'pos' : 'neg'}">موجود ${fmtNum(m.stock)}</small><span class="pr">${money(m.sell_price)}</span>`,
      pick: (m) => addLine(m)
    });
    const loadRx = async (code) => {
      code = String(code || '').trim(); if (!code) return;
      const rx = await API.get('/api/rx/' + encodeURIComponent(code));
      st.rx = rx; st.walkin = false;
      st.lines = rx.items.map(it => { const left = Math.max(0, (Number(it.qty) || 1) - (it.dispensed || 0)); return { rx: it, med: it.match, qty: it.match && it.match.stock > 0 ? Math.min(left, it.match.stock) : left, price: it.match ? it.match.sell_price : 0, on: !!it.match && left > 0 && it.match.stock > 0, dispensed: it.dispensed, alts: it.alternatives }; });
      $('#rxCode', view).value = rx.rx_code;
      $('#rxHead', view).innerHTML = `<div class="ptHead">${patientHeadHTML(rx.patient)}<div style="text-align:center"><div class="rxCode">${esc(rx.rx_code)}</div>${statusPill(RX_STATUS, rx.status)}</div></div>
        <div class="sum"><span>داکتر: <b>${esc(doctorName({ title: rx.doctor_title, name: rx.doctor_name }))}</b></span><span>تاریخ: <b>${fmtDate(rx.date)}</b></span>${rx.discount_pct ? `<span>تخفیف داکتر: <b class="pos">${fmtNum(rx.discount_pct)}٪</b></span>` : ''}${rx.note ? `<span>توصیه: ${esc(rx.note)}</span>` : ''}
        ${rx.sales.length ? `<span>فروش قبلی: ${rx.sales.map(s => `<b class="codeTag">${esc(s.sale_code)}</b>`).join(' ')}</span>` : ''}</div>
        ${rx.status === 'dispensed' ? '<div class="warnBox" style="margin:10px 0 0">این نسخه قبلاً کامل تحویل شده است.</div>' : ''}${rx.patient?.allergies ? `<div class="warnBox" style="margin:10px 0 0">حساسیت مریض: <b>${esc(rx.patient.allergies)}</b></div>` : ''}`;
      $('#ptNameBox', view).classList.add('hidden');
      $('#dPct', view).value = rx.discount_pct || 0; $('#dAmt', view).value = '';
      $('#drDisc', view).textContent = rx.discount_pct ? `(داکتر: ${fmtNum(rx.discount_pct)}٪)` : '';
      delete $('#paid', view).dataset.touched;
      draw();
    };
    const sell = (btn, print) => busy(btn, async () => {
      const items = st.lines.filter(l => l.on && l.med && l.qty > 0).map(l => ({ medicine_id: l.med.id, qty: l.qty, price: l.price, rx_item_id: l.rx?.id || null }));
      if (!items.length) throw new Error('هیچ دوایی برای فروش انتخاب نشده');
      const short = st.lines.filter(l => l.on && l.med && l.qty > l.med.stock);
      if (short.length && App.settings.allow_negative_stock !== '1') throw new Error(`موجودی کافی نیست: ${short.map(l => `${l.med.name} (موجود ${fmtNum(l.med.stock)})`).join('، ')} — تعداد را کم کنید یا تیک آن را بردارید.`);
      if (short.length && !(await confirmDlg(`موجودی ${short.map(l => esc(l.med.name)).join('، ')} کافی نیست. ادامه می‌دهید؟`))) return;
      const ctrl = st.lines.filter(l => l.on && l.med && l.qty > 0 && l.med.controlled);
      if (ctrl.length && !st.rx && !(await confirmDlg(`${icon('alert', 15)} دوای کنترل شده (${ctrl.map(l => esc(l.med.name)).join('، ')}) بدون نسخه داکتر فروخته می‌شود و در دفتر دواهای کنترل شده ثبت می‌شود. ادامه می‌دهید؟`, { danger: true }))) return;
      const sale = await API.post('/api/sales/create', { prescription_id: st.rx?.id, patient_name: st.rx ? undefined : $('#ptName', view).value, items,
        discount_pct: $('#dAmt', view).value === '' ? $('#dPct', view).value : undefined, discount: $('#dAmt', view).value === '' ? undefined : $('#dAmt', view).value,
        paid: $('#paid', view).value, pay_method: $('#pm', view).value, note: $('#note', view).value });
      toast(central && sale.balance > 0.001 ? `فروش ${sale.sale_code} ثبت شد — ${money(sale.balance)} ${currency()} در صندوق پذیرش پرداخت شود` : `فروش ${sale.sale_code} ثبت شد — ${money(sale.net)} ${currency()}`, 'good');
      if (print) await printDoc(saleReceiptsHTML(sale), { size: 'receipt', title: sale.sale_code });
      else if (typeof salePreview === 'function') salePreview(sale); else previewDoc(saleReceiptsHTML(sale), { size: 'receipt', title: sale.sale_code });
      go('pos');
    });
    $('#rxCode', view).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadRx($('#rxCode', view).value).catch(errToast); } });
    $('#dPct', view).oninput = () => { $('#dAmt', view).value = ''; calc(); }; $('#dAmt', view).oninput = calc;
    $('#paid', view).oninput = (e) => { e.target.dataset.touched = '1'; calc(); };
    view.addEventListener('keydown', (e) => { if (e.key === 'F9') { e.preventDefault(); $('[data-act="sell"][data-print]', view).click(); } });
    actions(view, { load: () => loadRx($('#rxCode', view).value), sell: (b) => sell(b, !!b.dataset.print), clear: () => go('pos'), inbox: () => go('rx-inbox') });
    draw();
    if (params.code) await loadRx(params.code).catch(errToast); else $('#rxCode', view).focus();
  }
};

// ================================================================ sales list & returns
Pages.sales = {
  async render(view) {
    const seeProfit = isRole('stock');
    view.innerHTML = `<div class="pageHead"><div><h1>لیست فروشات دواخانه</h1><p>همه فروشات با کد، چاپ دوباره رسیدها و برگشت دوا.</p></div><div class="toolbar"><button class="btn" data-act="csv">${icon('download')} CSV</button></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', today(), 'id="s_from"')}</label><label class="field"><span>تا</span>${dateInput('to', today(), 'id="s_to"')}</label>
      <label class="field"><span>نوع</span><select id="s_kind">${opt([['rx', 'با نسخه'], ['free', 'بدون نسخه']], '', { empty: 'همه' })}</select></label><label class="field grow"><span>جستجو</span><input id="s_q" placeholder="کد فروش، کد نسخه، نام مریض…"></label></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>کد فروش</th><th>تاریخ</th><th>کد نسخه</th><th>مریض</th><th>اقلام</th><th>جمع</th><th>تخفیف</th><th>خالص</th><th>برگشت</th><th>پرداخت</th>${seeProfit ? '<th>مفاد</th>' : ''}<th>فروشنده</th><th>وضعیت</th><th></th></tr></thead><tbody id="sB"></tbody></table></div><div class="sum" id="sS"></div></div>`;
    let rows = [];
    const load = async () => {
      const q = { from: dateOf($('#s_from', view)), to: dateOf($('#s_to', view)), q: $('#s_q', view).value.trim(), limit: 5000 };
      if ($('#s_kind', view).value === 'rx') q['notnull.rx_code'] = 1; if ($('#s_kind', view).value === 'free') q['null.rx_code'] = 1;
      rows = await API.list('sales', q);
      $('#sB', view).innerHTML = rows.map(s => `<tr><td class="codeTag">${esc(s.sale_code)}</td><td>${fmtDate(s.date)} <small class="muted">${fmtTime(s.created_at)}</small></td><td class="codeTag">${esc(s.rx_code || '—')}</td><td>${esc(s.patient_name || '—')}</td><td class="c">${s.item_count}</td>
        <td>${money(s.subtotal)}</td><td>${s.discount ? money(s.discount) : ''}</td><td class="money">${money(s.net)}</td><td class="neg">${s.returned ? money(s.returned) : ''}</td><td>${s.balance > 0.001 ? `${pill(s.paid ? 'باقی ' + money(s.balance) : 'پرداخت نشده', s.paid ? 'warn' : 'bad')}` : s.balance < -0.001 ? pill('قابل بازپرداخت ' + money(-s.balance), 'bad') : pill('پرداخت شد', 'good')}</td>${seeProfit ? `<td class="${s.profit >= 0 ? 'pos' : 'neg'}">${money(s.profit)}</td>` : ''}<td>${esc(s.seller || '')}</td>
        <td>${s.status === 'done' ? '' : pill(s.status === 'returned' ? 'برگشت کامل' : 'برگشت قسمی', 'warn')}</td><td class="nowrap"><button class="btn sm" data-act="view" data-id="${s.id}">${icon('receipt', 14)} رسید</button> <button class="btn sm" data-act="ret" data-id="${s.id}">برگشت</button>${!centralPharmacy() && Math.abs(s.balance) > 0.001 && isRole('pharmacy', 'stock') ? ` <button class="btn sm success" data-act="pay" data-id="${s.id}" data-bal="${s.balance}">${icon('cash', 14)}</button>` : ''}</td></tr>`).join('') || emptyRow(14);
      const tot = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
      $('#sS', view).innerHTML = `<span>تعداد: <b>${rows.length}</b></span><span>پرداخت نشده: <b class="neg">${money(rows.reduce((a, r) => a + Math.max(0, r.balance), 0))}</b></span><span>فروش خالص: <b>${money(tot('net'))}</b></span><span>برگشتی: <b>${money(tot('returned'))}</b></span><span>بعد از برگشت: <b>${money(tot('net') - tot('returned'))}</b></span>${seeProfit ? `<span>مفاد: <b class="pos">${money(tot('profit'))}</b></span>` : ''}`;
    };
    $$('#s_from, #s_to, #s_kind', view).forEach(el => el.addEventListener('change', load)); $('#s_q', view).addEventListener('input', debounce(load, 300));
    actions(view, {
      view: async (b) => { const s = await API.get('/api/sales/' + b.dataset.id); if (typeof salePreview === 'function') return salePreview(s); previewDoc(saleReceiptsHTML(s), { size: 'receipt', title: s.sale_code }); },
      ret: async (b) => returnDialog(Number(b.dataset.id), load),
      pay: async (b) => { const a = await promptDlg('دریافت باقی فروش', { label: 'مبلغ (منفی = بازپرداخت)', value: b.dataset.bal, type: 'number' }); if (a) { await API.post('/api/sales/pay/' + b.dataset.id, { amount: Number(a), method: 'cash' }); toast('ثبت شد', 'good'); load(); } },
      csv: () => exportCSV('pharmacy-sales', rows, [['sale_code', 'کد فروش'], ['date', 'تاریخ'], ['rx_code', 'کد نسخه'], ['patient_name', 'مریض'], ['subtotal', 'جمع'], ['discount', 'تخفیف'], ['net', 'خالص'], ['returned', 'برگشت'], ...(seeProfit ? [['cost', 'قیمت تمام شد'], ['profit', 'مفاد']] : []), ['seller', 'فروشنده']])
    });
    await load(); this._load = load;
  },
  onEvent(m) { if (m.type.startsWith('sale') && this._load) this._load(); }
};
async function returnDialog(id, after) {
  const s = await API.get('/api/sales/' + id);
  const m = modal({ title: 'برگشت دوا — ' + esc(s.sale_code), size: 'wide', body: `<div class="infoBox">مقدار برگشتی هر دوا را بنویسید. دوا به همان بچ در موجودی برگشت داده می‌شود و مبلغ (بعد از تخفیف) از فروش کم می‌شود.</div>
    <table class="t"><thead><tr><th>دوا</th><th>فروخته</th><th>قبلاً برگشت</th><th>قیمت</th><th>برگشت</th></tr></thead><tbody>${s.items.map(i => `<tr><td class="en">${esc(i.name)}</td><td>${fmtNum(i.qty)}</td><td>${fmtNum(i.returned_qty)}</td><td>${money(i.price)}</td><td><input type="number" min="0" max="${i.qty - i.returned_qty}" data-si="${i.id}" value="0" style="width:90px"></td></tr>`).join('')}</tbody></table>
    <label class="field" style="margin-top:10px"><span>دلیل برگشت</span><input id="rt_note"></label>`,
    foot: `<button class="btn primary" id="rt_ok">ثبت برگشت</button><button class="btn" data-x>انصراف</button>` });
  $('[data-x]', m.el).onclick = m.close;
  $('#rt_ok', m.el).onclick = () => busy($('#rt_ok', m.el), async () => {
    const items = $$('[data-si]', m.el).map(i => ({ sale_item_id: Number(i.dataset.si), qty: Number(i.value) || 0 })).filter(x => x.qty > 0);
    if (!items.length) throw new Error('مقدار برگشتی را وارد کنید');
    const r = await API.post('/api/sales/return/' + id, { items, note: $('#rt_note', m.el).value });
    toast(`برگشت ثبت شد — مجموع برگشتی ${money(r.returned)}`, 'good'); m.close(); after && after();
  }).catch(errToast);
}

// ================================================================ pharmacy daily totals
Pages['ph-daily'] = {
  async render(view) {
    const [mf] = currentMonthRange();
    view.innerHTML = `<div class="pageHead"><div><h1>فروش روزانه دواخانه</h1><p>مجموع فروش همه نسخه‌ها و فروش آزاد در هر روز، برگشتی‌ها و برداشت‌ها.</p></div>
      <div class="toolbar"><button class="btn primary" data-act="wd">${icon('wallet')} ثبت برداشت</button><button class="btn" data-act="print">${icon('print')} چاپ</button></div></div>
      <div class="grid g4" id="pK"></div>
      <div class="filterBar" style="margin-top:16px"><label class="field"><span>از</span>${dateInput('from', mf, 'id="d_from"')}</label><label class="field"><span>تا</span>${dateInput('to', today(), 'id="d_to"')}</label></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>تاریخ</th><th>روز</th><th>تعداد فروش</th><th>فروش</th><th>برگشتی</th><th>فروش خالص</th><th>برداشت</th><th>باقی</th></tr></thead><tbody id="dB"></tbody><tfoot id="dF"></tfoot></table></div></div>`;
    let html = '';
    const load = async () => {
      const from = dateOf($('#d_from', view)), to = dateOf($('#d_to', view));
      const [rows, td] = await Promise.all([API.get('/api/reports/days', { from, to }), API.get('/api/reports/days', { from: today(), to: today() })]);
      const t0 = td[0] || {};
      $('#pK', view).innerHTML = kpi('فروش امروز', money(t0.ph_net || 0), { ic: 'money', cls: 'good', sub: `${t0.ph_count || 0} فروش` }) + kpi('برگشتی امروز', money(t0.ph_returns || 0), { ic: 'refresh', cls: 'warn' }) + kpi('برداشت امروز', money(t0.wd_pharmacy || 0), { ic: 'wallet', cls: 'bad' }) + kpi('باقی امروز', money((t0.ph_net || 0) - (t0.wd_pharmacy || 0)), { ic: 'wallet', cls: 'violet', sub: currency() });
      const list = rows.filter(r => r.ph_net || r.ph_count || r.wd_pharmacy).reverse();
      $('#dB', view).innerHTML = list.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${weekday(r.date)}</td><td>${r.ph_count || (r.legacy_ph ? 'اکسل' : 0)}</td><td>${money(r.ph_sales + (r.legacy_ph || 0))}</td><td class="neg">${r.ph_returns ? money(r.ph_returns) : ''}</td><td class="money">${money(r.ph_net)}</td><td class="neg">${r.wd_pharmacy ? money(r.wd_pharmacy) : ''}</td><td>${money(r.ph_net - r.wd_pharmacy)}</td></tr>`).join('') || emptyRow(8);
      const S = (k) => list.reduce((a, r) => a + (r[k] || 0), 0);
      $('#dF', view).innerHTML = `<tr><td colspan="2">مجموع</td><td>${S('ph_count')}</td><td>${money(S('ph_sales') + S('legacy_ph'))}</td><td>${money(S('ph_returns'))}</td><td>${money(S('ph_net'))}</td><td>${money(S('wd_pharmacy'))}</td><td>${money(S('ph_net') - S('wd_pharmacy'))}</td></tr>`;
      html = `<p>از ${fmtDate(from)} تا ${fmtDate(to)}</p><table class="rt">${$('thead', view).outerHTML}${$('#dB', view).outerHTML}${$('#dF', view).outerHTML}</table>`;
    };
    $$('#d_from, #d_to', view).forEach(el => el.addEventListener('change', load));
    actions(view, { wd: () => withdrawalDialog('pharmacy', load), print: () => previewDoc(reportDocHTML('فروش روزانه دواخانه', html), { title: 'فروش روزانه' }) });
    await load(); this._load = load;
  },
  onEvent(m) { if (m.type.startsWith('sale') && this._load) this._load(); }
};
// withdrawal types of each section
const WD_KINDS = {
  pharmacy: [['personal', 'برداشت شخصی'], ['factor', 'پرداخت فاکتور (کمپنی)'], ['person', 'برای شخص (معاش، قرض…)'], ['salary', 'معاش / پیش‌پرداخت کارمند'], ['business', 'سایر مصارف']],
  lab: [['personal', 'برداشت شخصی'], ['external', 'معاینات بیرونی (آزمایش ارسالی)'], ['salary', 'معاش / پیش‌پرداخت کارمند'], ['business', 'سایر']],
  reception: [['personal', 'برداشت شخصی'], ['salary', 'معاش / پیش‌پرداخت کارمند'], ['business', 'سایر']]
};
const wdKindName = (sec, k) => (WD_KINDS[sec] || []).concat([['business', 'عادی'], ['personal', 'شخصی']]).find(x => x[0] === k)?.[1] || k || 'عادی';
// sections a station may take money from
const wdSectionsFor = () => App.user.role === 'pharmacy' ? ['pharmacy'] : App.user.role === 'reception' ? ['lab', 'reception'] : ['pharmacy', 'lab', 'reception'];
function withdrawalDialog(section, after, row) {
  const secs = wdSectionsFor();
  row = row || { date: today(), section: secs.includes(section) ? section : secs[0], kind: 'personal' };
  const m = modal({ title: row.id ? 'ویرایش برداشت' : 'ثبت برداشت از صندوق', size: 'wide', body: `<div class="formGrid" id="wdF">
    <label class="field"><span>تاریخ</span>${dateInput('date', row.date)}</label>
    <label class="field"><span>از صندوق</span><select name="section">${opt(secs.map(s => [s, SECTIONS[s]]), row.section)}</select></label>
    <label class="field"><span>نوع برداشت</span><select name="kind" id="wdKind"></select></label>
    <label class="field"><span>مبلغ</span><input type="number" name="amount" min="0" value="${esc(row.amount || '')}"></label>
    <label class="field hidden" id="wdFac"><span>فاکتور خرید (باقی‌دار)</span><select name="purchase_id" id="wdPur"><option value="">— انتخاب فاکتور —</option></select></label>
    <label class="field" id="wdPer"><span id="wdPerL">برای چه کسی</span><input name="person" value="${esc(row.person || '')}" placeholder="نام شخص / کمپنی / لابراتوار بیرونی"></label>
    <label class="field"><span>برداشت توسط</span><input name="by_whom" value="${esc(row.by_whom || App.user.full_name || '')}"></label>
    <label class="field full"><span>یادداشت / علت</span><input name="note" value="${esc(row.note || '')}"></label></div>
    <div class="mini muted" id="wdHint" style="margin-top:8px"></div>`,
    foot: `<button class="btn primary" id="wd_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
  const secSel = $('[name="section"]', m.el), kindSel = $('#wdKind', m.el);
  let purchases = null;
  const loadPur = async () => {
    if (purchases) return; purchases = await API.get('/api/open-purchases').catch(() => []);
    if (row.purchase_id && !purchases.some(p => p.id === row.purchase_id)) purchases.unshift({ id: row.purchase_id, ref_no: row.factor_no || '#' + row.purchase_id, supplier_name: row.person || '', balance: 0 });
    $('#wdPur', m.el).innerHTML = '<option value="">— انتخاب فاکتور —</option>' + purchases.map(p => `<option value="${p.id}" ${p.id === row.purchase_id ? 'selected' : ''}>${esc(p.factor_no || p.ref_no)} · ${esc(p.supplier_name || '')} · باقی ${money(p.balance)}</option>`).join('');
  };
  const sync = () => {
    const sec = secSel.value, cur = kindSel.value || row.kind;
    kindSel.innerHTML = opt(WD_KINDS[sec], WD_KINDS[sec].some(k => k[0] === cur) ? cur : WD_KINDS[sec][0][0]);
    const k = kindSel.value;
    $('#wdFac', m.el).classList.toggle('hidden', k !== 'factor');
    $('#wdPerL', m.el).textContent = k === 'factor' ? 'کمپنی' : k === 'external' ? 'لابراتوار بیرونی / آزمایش' : k === 'personal' ? 'برای چه کسی (شخصی)' : 'برای چه کسی';
    $('#wdHint', m.el).textContent = k === 'factor' ? 'این مبلغ به‌عنوان پرداخت همین فاکتور هم ثبت می‌شود (در حساب ماهوار زیر «فاکتورها» حساب می‌شود، دوباره از فروش کم نمی‌شود).'
      : k === 'external' ? 'پولی که برای آزمایش‌های ارسالی به لابراتوار بیرونی داده شده.' : '';
    if (k === 'factor') loadPur();
  };
  secSel.onchange = sync; kindSel.onchange = sync; sync();
  $('#wdPur', m.el).onchange = () => { const p = (purchases || []).find(x => x.id === Number($('#wdPur', m.el).value)); if (p) { $('[name="person"]', m.el).value = p.supplier_name || ''; if (!$('[name="amount"]', m.el).value) $('[name="amount"]', m.el).value = p.balance; } };
  $('[data-x]', m.el).onclick = m.close;
  $('#wd_ok', m.el).onclick = () => busy($('#wd_ok', m.el), async () => { const v = formValues($('#wdF', m.el)); if (row.id) v.id = row.id; await API.save('withdrawals', v); toast('ثبت شد', 'good'); m.close(); after && after(); }).catch(errToast);
}
