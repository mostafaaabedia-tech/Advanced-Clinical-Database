/* Admin station (server PC): clinic dashboard, network of stations, users, doctors & services, settings, audit, backup;
   plus "this computer" settings available on every station */
'use strict';

// ================================================================ clinic dashboard
Pages['admin-dash'] = {
  async render(view) {
    const months = lastMonths(12);
    view.innerHTML = `<div class="pageHead"><div><h1>داشبورد کل کلینیک</h1><p>همه بخش‌ها در یک نگاه — پذیرش، داکتران، دواخانه، لابراتوار، انبار و حسابات.</p></div><div class="toolbar"><button class="btn" data-act="net">${icon('network')} شبکه</button></div></div>
      <div class="grid g4" id="k1"></div><div class="grid g4" id="k2" style="margin-top:16px"></div>
      <div class="grid g-21" style="margin-top:16px"><div class="card"><h2>عاید ماهانه به تفکیک بخش</h2><div id="lg"></div><div class="chartBox tall"><canvas id="c1"></canvas></div></div>
        <div class="card"><h2>${icon('network', 15)} ایستگاه‌های آنلاین</h2><div id="online"></div></div></div>
      <div class="grid g2"><div class="card"><h2>مریضان روزانه (۳۰ روز)</h2><div class="chartBox"><canvas id="c2"></canvas></div></div><div class="card"><h2>کارهای در جریان</h2><div id="pend"></div></div></div>`;
    const [dash, days, net] = await Promise.all([API.get('/api/reports/dashboard'), API.get('/api/reports/days', { from: months[0].range[0], to: today() }), API.get('/api/network')]);
    const t = dash.today_row || {}, M = dash.month, vs = dash.visits_by_status || {};
    $('#k1', view).innerHTML = kpi('مریضان امروز', (vs.waiting || 0) + (vs.in_visit || 0) + (vs.done || 0), { ic: 'users', sub: `در انتظار ${vs.waiting || 0} · نزد داکتر ${vs.in_visit || 0} · ویزیت شده ${vs.done || 0}` })
      + kpi('فیس پذیرش امروز', money(t.reception || 0), { ic: 'ticket', cls: 'good' }) + kpi('دواخانه امروز', money(t.ph_net || 0), { ic: 'pill', cls: 'good', sub: `مفاد ${money(t.ph_profit || 0)}` }) + kpi('لابراتوار امروز', money(t.lab_total || 0), { ic: 'flask', sub: `${t.lab_count || 0} مریض` });
    $('#k2', view).innerHTML = kpi('عاید کل این ماه', money(M.income), { ic: 'money', cls: 'violet', sub: `پذیرش ${money(M.reception)} · دواخانه ${money(M.ph_net)} · لابراتوار ${money(M.lab_total)}` })
      + kpi('مصارف این ماه', money(M.expenses), { ic: 'receipt', cls: 'bad' }) + kpi('مفاد خالص این ماه', money(r2(M.ph_profit + M.lab_total + M.reception - M.expenses)), { ic: 'trend', cls: 'good', sub: 'مفاد دواخانه + لابراتوار + پذیرش − مصارف' })
      + kpi('موجودی دواخانه', money(dash.stock.cost_value), { ic: 'box', sub: `${dash.stock.low} دوا رو به اتمام · ${dash.stock.expiring} نزدیک انقضا` });
    const agg = monthsAgg(days, months);
    $('#lg', view).innerHTML = legendHTML([{ label: 'پذیرش' }, { label: 'دواخانه' }, { label: 'لابراتوار' }, { label: 'مصارف' }]);
    barChart($('#c1', view), agg.map(m => m.short), [{ label: 'پذیرش', data: agg.map(m => m.reception) }, { label: 'دواخانه', data: agg.map(m => m.ph_net) }, { label: 'لابراتوار', data: agg.map(m => m.lab_total) }, { label: 'مصارف', data: agg.map(m => m.expenses), type: 'line' }], { money: true, stacked: false });
    const d30 = []; for (let i = 29; i >= 0; i--) d30.push(isoDate(addDays(new Date(), -i)));
    barChart($('#c2', view), d30.map(d => fmtDateNum(d).slice(5)), [{ label: 'مریضان', data: d30.map(d => (days.find(x => x.date === d) || {}).visits || 0) }]);
    $('#online', view).innerHTML = net.clients.length ? net.clients.map(c => `<div class="alertItem"><div class="alertIcon info">${icon(STATIONS[c.station]?.icon || 'user', 15)}</div><div><b>${esc(STATIONS[c.station]?.name || c.station)} — ${esc(c.user)}</b><span class="ltr">${esc(c.ip)}</span><span> · از ${fmtTime(c.since)}</span></div></div>`).join('') : '<div class="empty">هیچ ایستگاهی وصل نیست</div>';
    $('#pend', view).innerHTML = [
      ['نسخه‌های منتظر دواخانه', dash.rx_pending, 'rx-inbox'], ['آزمایش‌های در جریان', dash.lab_pending, 'lab-inbox'], ['بازپرداخت تخفیف داکتر', `${dash.refunds_due.c} (${money(dash.refunds_due.s)})`, 'visits'],
      ['طلب کمپنی‌ها', `${dash.supplier_debt.c} فاکتور — ${money(dash.supplier_debt.s)}`, 'purchases'], ['مصارف پرداخت نشده', `${dash.expenses_unpaid.c} — ${money(dash.expenses_unpaid.s)}`, 'expenses'],
      ['دواهای رو به اتمام', dash.stock.low, 'medicines'], ['دواهای نزدیک انقضا', dash.stock.expiring, 'medicines']
    ].map(([l, v, p]) => `<div class="alertItem" style="cursor:pointer" data-go="${p}"><div class="alertIcon info">${icon('next', 14)}</div><div><b>${esc(l)}</b><span>${esc(String(v))}</span></div></div>`).join('');
    view.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go, g.dataset.go === 'purchases' ? { status: 'open' } : {}); });
    actions(view, { net: () => go('network') });
  },
  onEvent(m) { if (m.type === 'presence' || m.type.startsWith('sale') || m.type.startsWith('visit')) reloadPage(); }
};

// ================================================================ network
Pages.network = {
  async render(view) {
    const n = await API.get('/api/network');
    const by = (st) => n.clients.filter(c => c.station === st);
    const node = (st, extra = '') => { const on = by(st); const s = STATIONS[st]; return `<div class="netNode ${on.length ? 'online' : ''}" style="border-top:4px solid ${s.color}"><span class="dot"></span>${icon(s.icon, 22)}<b>${esc(s.name)}</b>${extra}<small>${on.length ? `${on.length} وصل` : 'آفلاین'}</small>${on.map(c => `<div class="who">${esc(c.user)} · <span class="ltr">${esc(c.ip)}</span></div>`).join('')}</div>`; };
    const urls = n.addresses.map(a => `http://${a.address}:${n.port}`);
    view.innerHTML = `<div class="pageHead"><div><h1>شبکه و ایستگاه‌ها</h1><p>ساختار شبکه: مدیر (سرور) در بالا، انبار و حسابات بعد از آن، و پذیرش، داکتر، دواخانه و لابراتوار در پایین — همه از طریق WiFi / شبکه محلی.</p></div><div class="toolbar"><button class="btn" data-act="r">${icon('refresh')} تازه‌سازی</button></div></div>
      <div class="card"><div class="netMap">
        ${node('admin', `<small>سرور دیتابیس · ${esc(n.hostname)}</small>`)}
        <div class="netLink"></div>${node('stock')}
        <div class="netRow">${['reception', 'doctor', 'pharmacy', 'lab'].map(s => node(s)).join('')}</div>
      </div></div>
      <div class="grid g2"><div class="card"><h2>${icon('database', 16)} سرور</h2>
        <div class="sum" style="flex-direction:column;gap:6px"><span>آدرس اتصال ایستگاه‌ها: ${urls.map(u => `<b class="ltr">${esc(u)}</b>`).join(' ، ') || '<b>شبکه پیدا نشد</b>'}</span><span>پورت: <b>${n.port}</b> · نسخه: <b>${esc(n.version)}</b></span>
        <span>روشن از: <b>${fmtDateTime(n.started)}</b> · آخرین ذخیره: <b>${n.last_save ? fmtTime(n.last_save) : '—'}</b></span><span>اندازه دیتابیس: <b>${(n.db_size / 1024 / 1024).toFixed(2)} MB</b></span><span class="small ltr">${esc(n.db_file)}</span></div>
        <div class="infoBox" style="margin-top:12px;line-height:2">برای وصل کردن کمپیوترهای دیگر: برنامه مخصوص هر بخش را نصب کنید؛ سرور را خودکار پیدا می‌کند. اگر پیدا نکرد، آدرس بالا را وارد کنید.<br>
        در هر دستگاه دیگر (حتی موبایل) می‌توانید در مرورگر آدرس بالا را باز کنید: مثلاً <b class="ltr">${esc(urls[0] || 'http://IP:8750')}/?station=pharmacy</b><br>
        اگر ویندوز «Firewall» سوال کرد، گزینه Allow را انتخاب کنید.</div></div>
      <div class="card"><h2>${icon('users', 16)} کاربران متصل (${n.clients.length})</h2><div class="tableWrap"><table class="t"><thead><tr><th>ایستگاه</th><th>کاربر</th><th>نقش</th><th>IP</th><th>از ساعت</th></tr></thead><tbody>
        ${n.clients.map(c => `<tr><td>${esc(STATIONS[c.station]?.name || c.station)}</td><td>${esc(c.user)}</td><td>${esc(ROLES[c.role] || c.role)}</td><td class="ltr">${esc(c.ip)}</td><td>${fmtTime(c.since)}</td></tr>`).join('') || emptyRow(5, 'کسی وصل نیست')}</tbody></table></div>
        <div class="secTitle">آخرین ورودها</div><div class="tableWrap" style="max-height:240px"><table class="t"><tbody>${n.sessions.map(s => `<tr><td>${esc(s.full_name || s.username)}</td><td>${esc(STATIONS[s.station]?.short || s.station)}</td><td class="ltr">${esc(s.ip || '')}</td><td>${fmtDateTime(s.last_seen)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
    actions(view, { r: () => go('network') });
  },
  onEvent(m) { if (m.type === 'presence') reloadPage(); }
};

// ================================================================ users
Pages.users = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>کاربران و دسترسی</h1><p>هر کاربر یک نقش دارد و (با قفل ایستگاه) فقط در کمپیوتر همان بخش وارد می‌شود. مدیر به همه بخش‌ها دسترسی دارد.</p></div><div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} کاربر جدید</button></div></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>نام کاربری</th><th>نام کامل</th><th>نقش / بخش</th><th>پروفایل داکتر</th><th>تلفن</th><th>وضعیت</th><th>آخرین ورود</th><th></th></tr></thead><tbody id="uB"></tbody></table></div></div>
      <div class="card"><h2>دسترسی هر نقش</h2><table class="t"><tbody>
        <tr><td><b>مدیر</b></td><td>همه بخش‌ها + کاربران، تنظیمات، شبکه، پشتیبان، تغییر همه اطلاعات</td></tr>
        <tr><td><b>انبار و حسابات</b></td><td>دواها و موجودی، فاکتورهای خرید و اقساط، کمپنی‌ها، مصارف، برداشت‌ها، حسابات روزانه، مفاد ماهانه، گزارش فروش دواخانه و لابراتوار</td></tr>
        <tr><td><b>پذیرش</b></td><td>ثبت مریض، نوبت، رزرو، فیس و رسید</td></tr><tr><td><b>داکتر</b></td><td>صف مریضان، پرونده، ویزیت، نسخه، درخواست آزمایش، تخفیف</td></tr>
        <tr><td><b>دواخانه</b></td><td>نسخه‌های رسیده، فروش با کد نسخه، دو رسید، برگشت، فروش روزانه</td></tr><tr><td><b>لابراتوار</b></td><td>درخواست‌ها با کد، فیس و دو رسید، ثبت نتایج و ارسال به داکتر، قیمت آزمایش‌ها</td></tr></tbody></table></div>`;
    let rows = [];
    const load = async () => {
      rows = await API.get('/api/users');
      $('#uB', view).innerHTML = rows.map(u => `<tr><td class="ltr"><b>${esc(u.username)}</b></td><td>${esc(u.full_name || '')}</td><td><span class="pill" style="border-color:${STATIONS[u.role]?.color};color:${STATIONS[u.role]?.color}">${esc(ROLES[u.role] || u.role)}</span></td><td>${esc(u.doctor_name || '')}</td><td class="ltr">${esc(u.phone || '')}</td>
        <td>${u.active ? pill('فعال', 'good') : pill('غیرفعال', 'bad')}${u.must_change ? ' ' + pill('تغییر رمز لازم', 'warn') : ''}</td><td>${u.last_login ? fmtDateTime(u.last_login) : '—'}</td>
        <td class="nowrap"><button class="btn sm" data-act="edit" data-id="${u.id}">${icon('edit', 14)}</button> ${u.id !== App.user.id ? `<button class="btn sm dangerText" data-act="del" data-id="${u.id}">${icon('trash', 14)}</button>` : ''}</td></tr>`).join('');
    };
    const edit = (u) => {
      u = u || { role: 'reception', active: 1 };
      const m = modal({ title: u.id ? 'ویرایش کاربر ' + esc(u.username) : 'کاربر جدید', body: `<div class="formGrid" id="usF">
        <label class="field"><span>نام کاربری <em>*</em></span><input name="username" class="ltr" value="${esc(u.username || '')}" ${u.id ? 'readonly' : ''}></label>
        <label class="field"><span>نام کامل</span><input name="full_name" value="${esc(u.full_name || '')}"></label>
        <label class="field"><span>نقش / بخش</span><select name="role" id="us_role">${opt(Object.entries(ROLES), u.role)}</select></label>
        <label class="field" id="us_drBox"><span>پروفایل داکتر</span><select name="doctor_id">${opt(App.doctors.map(d => [d.id, doctorName(d)]), u.doctor_id, { empty: '—' })}</select></label>
        <label class="field"><span>تلفن</span><input name="phone" class="ltr" value="${esc(u.phone || '')}"></label>
        <label class="field"><span>${u.id ? 'رمز جدید (اختیاری)' : 'رمز عبور <em>*</em>'}</span><input name="password" type="password"></label>
        <label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> فعال</label></div>`,
        foot: `<button class="btn primary" id="us_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
      const tog = () => $('#us_drBox', m.el).classList.toggle('hidden', $('#us_role', m.el).value !== 'doctor'); $('#us_role', m.el).onchange = tog; tog();
      $('[data-x]', m.el).onclick = m.close;
      $('#us_ok', m.el).onclick = () => busy($('#us_ok', m.el), async () => { const v = formValues($('#usF', m.el)); if (u.id) v.id = u.id; await API.post('/api/users/save', v); toast('ذخیره شد', 'good'); m.close(); load(); }).catch(errToast);
    };
    actions(view, { new: () => edit(), edit: (b) => edit(rows.find(r => r.id === Number(b.dataset.id))), del: async (b) => { if (await confirmDlg('این کاربر حذف شود؟', { danger: true })) { await API.post('/api/users/delete/' + b.dataset.id); load(); } } });
    await load();
  }
};

// ================================================================ doctors & services
Pages.setup = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>داکتران، خدمات و فیس</h1><p>معلومات داکتران روی سرخط نسخه چاپ می‌شود. خدمات (OPD، سونوگرافی…) و فیس آن‌ها در پذیرش استفاده می‌شود.</p></div></div>
      <div class="card"><div class="cardHead"><h2>${icon('steth')} داکتران</h2><button class="btn primary sm" data-act="newD">${icon('plus', 14)} داکتر جدید</button></div><div class="tableWrap"><table class="t"><thead><tr><th>عنوان و نام</th><th>تخصص</th><th>فیس ویزیت</th><th>روی سرخط</th><th>سمت</th><th>وضعیت</th><th></th></tr></thead><tbody id="dB"></tbody></table></div></div>
      <div class="card"><div class="cardHead"><h2>${icon('ticket')} خدمات پذیرش</h2><button class="btn primary sm" data-act="newS">${icon('plus', 14)} خدمت جدید</button></div><div class="tableWrap"><table class="t"><thead><tr><th>کد</th><th>نام</th><th>فیس</th><th>نیاز به داکتر</th><th>داکتر پیش‌فرض</th><th>وضعیت</th><th></th></tr></thead><tbody id="sB"></tbody></table></div></div>`;
    const load = async () => {
      await loadBootstrap();
      $('#dB', view).innerHTML = App.doctors.map(d => `<tr><td><b style="color:${esc(d.color)}">${esc(doctorName(d))}</b></td><td>${esc(d.specialty || '')}</td><td>${money(d.visit_fee)}</td><td>${d.on_letterhead ? 'بلی' : 'خیر'}</td><td>${d.letterhead_side === 'left' ? 'چپ' : 'راست'}</td><td>${d.active ? pill('فعال', 'good') : pill('غیرفعال', 'bad')}</td><td><button class="btn sm" data-act="editD" data-id="${d.id}">${icon('edit', 14)}</button></td></tr>`).join('');
      $('#sB', view).innerHTML = App.services.map(s => `<tr><td class="codeTag">${esc(s.code)}</td><td><b>${esc(s.name)}</b></td><td>${money(s.fee)}</td><td>${s.needs_doctor ? 'بلی' : 'خیر'}</td><td>${esc(doctorName(doctorById(s.default_doctor_id)) || '—')}</td><td>${s.active ? pill('فعال', 'good') : pill('غیرفعال', 'bad')}</td><td><button class="btn sm" data-act="editS" data-id="${s.id}">${icon('edit', 14)}</button></td></tr>`).join('');
    };
    const editD = (d) => {
      d = d || { active: 1, on_letterhead: 1, letterhead_side: 'right', color: '#0f7a3a', visit_fee: 0, sort: App.doctors.length + 1 };
      const m = modal({ title: d.id ? 'ویرایش داکتر' : 'داکتر جدید', size: 'wide', body: `<div class="formGrid" id="drF">
        <label class="field"><span>عنوان (پوهنمل دوکتور، دوکتور…)</span><input name="title" value="${esc(d.title || '')}"></label><label class="field"><span>نام <em>*</em></span><input name="name" value="${esc(d.name || '')}"></label>
        <label class="field span2"><span>تخصص (کوتاه)</span><input name="specialty" value="${esc(d.specialty || '')}"></label>
        <label class="field full"><span>سطرهای زیر نام روی سرخط نسخه (هر سطر جدا)</span><textarea name="header_lines" rows="5">${esc(d.header_lines || '')}</textarea></label>
        <label class="field"><span>فیس ویزیت OPD</span><input name="visit_fee" type="number" value="${esc(d.visit_fee)}"></label><label class="field"><span>تلفن</span><input name="phone" class="ltr" value="${esc(d.phone || '')}"></label>
        <label class="field"><span>سمت روی سرخط</span><select name="letterhead_side">${opt([['right', 'راست'], ['left', 'چپ']], d.letterhead_side)}</select></label><label class="field"><span>رنگ نام</span><input name="color" type="color" value="${esc(d.color || '#0f7a3a')}"></label>
        <label class="field"><span>ترتیب</span><input name="sort" type="number" value="${esc(d.sort || 0)}"></label>
        <label class="check"><input type="checkbox" name="on_letterhead" ${d.on_letterhead ? 'checked' : ''}> روی سرخط نسخه</label><label class="check"><input type="checkbox" name="active" ${d.active ? 'checked' : ''}> فعال</label></div>`,
        foot: `<button class="btn primary" id="dr_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
      $('[data-x]', m.el).onclick = m.close;
      $('#dr_ok', m.el).onclick = () => busy($('#dr_ok', m.el), async () => { const v = formValues($('#drF', m.el)); if (d.id) v.id = d.id; if (!v.name) throw new Error('نام الزامی است'); await API.save('doctors', v); m.close(); load(); }).catch(errToast);
    };
    const editS = (s) => {
      s = s || { active: 1, needs_doctor: 1, fee: 0, sort: App.services.length + 1 };
      const m = modal({ title: s.id ? 'ویرایش خدمت' : 'خدمت جدید', body: `<div class="formGrid" id="svF">
        <label class="field"><span>کد (OPD, US…) <em>*</em></span><input name="code" class="ltr" value="${esc(s.code || '')}"></label><label class="field"><span>نام <em>*</em></span><input name="name" value="${esc(s.name || '')}"></label>
        <label class="field"><span>فیس</span><input name="fee" type="number" value="${esc(s.fee)}"></label><label class="field"><span>داکتر پیش‌فرض</span><select name="default_doctor_id">${opt(App.doctors.map(d => [d.id, doctorName(d)]), s.default_doctor_id, { empty: '—' })}</select></label>
        <label class="field"><span>ترتیب</span><input name="sort" type="number" value="${esc(s.sort || 0)}"></label>
        <label class="check"><input type="checkbox" name="needs_doctor" ${s.needs_doctor ? 'checked' : ''}> نیاز به داکتر</label><label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> فعال</label></div>`,
        foot: `<button class="btn primary" id="sv_ok">ذخیره</button><button class="btn" data-x>انصراف</button>` });
      $('[data-x]', m.el).onclick = m.close;
      $('#sv_ok', m.el).onclick = () => busy($('#sv_ok', m.el), async () => { const v = formValues($('#svF', m.el)); if (s.id) v.id = s.id; if (!v.code || !v.name) throw new Error('کد و نام الزامی است'); await API.save('services', v); m.close(); load(); }).catch(errToast);
    };
    actions(view, { newD: () => editD(), editD: (b) => editD(doctorById(b.dataset.id)), newS: () => editS(), editS: (b) => editS(App.services.find(s => s.id === Number(b.dataset.id))) });
    await load();
  }
};

// ================================================================ settings
Pages.settings = {
  async render(view) {
    await loadBootstrap();
    const s = App.settings; const po = JSON.parse(s.rx_default_print || '{}');
    const L = (k, label, rows = 6) => `<label class="field"><span>${label} <span class="hint">(هر سطر یک مورد)</span></span><textarea name="${k}" rows="${rows}">${esc(s[k] || '')}</textarea></label>`;
    view.innerHTML = `<div class="pageHead"><div><h1>تنظیمات و سرخط نسخه</h1><p>این تنظیمات برای همه ایستگاه‌ها اعمال می‌شود.</p></div><div class="toolbar"><button class="btn" data-act="preview">${icon('eye')} پیش‌نمایش نسخه</button><button class="btn primary" data-act="save">${icon('check')} ذخیره تنظیمات</button></div></div>
      <div class="tabs" id="stT"><button class="on" data-t="clinic">کلینیک و سرخط</button><button data-t="rx">نسخه و رسید</button><button data-t="codes">کدها و نوبت</button><button data-t="stock">دواخانه و انبار</button><button data-t="lists">لیست‌ها</button></div>
      <form id="stF" autocomplete="off">
      <div class="card" data-p="clinic"><div class="formGrid">
        <label class="field span2"><span>نام کلینیک</span><input name="clinic_name" value="${esc(s.clinic_name || '')}"></label><label class="field"><span>نام انگلیسی</span><input name="clinic_name_en" class="en" value="${esc(s.clinic_name_en || '')}"></label>
        <label class="field"><span>متن زیر لوگو</span><input name="clinic_logo_text" value="${esc(s.clinic_logo_text || '')}"></label>
        <label class="field full"><span>آدرس (پایین نسخه)</span><input name="clinic_address" value="${esc(s.clinic_address || '')}"></label>
        <label class="field"><span>شماره‌های تماس (هر سطر یکی)</span><textarea name="clinic_phones" rows="3" class="ltr">${esc(s.clinic_phones || '')}</textarea></label>
        <div class="field"><span>لوگو</span><div class="bar"><img id="logoPrev" src="${esc(s.clinic_logo || 'img/logo.png')}" style="height:64px;border:1px solid var(--line);border-radius:8px;padding:4px;background:#fff"><button type="button" class="btn sm" data-act="logo">${icon('upload', 14)} تغییر لوگو</button><button type="button" class="btn sm" data-act="logoReset">لوگوی اصلی</button></div><input type="hidden" name="clinic_logo" value="${esc(s.clinic_logo || '')}"></div>
        <label class="field"><span>واحد پول</span><select name="currency">${opt([['AFN', 'افغانی'], ['USD', 'USD'], ['IRR', 'ریال']], s.currency)}</select></label>
        <label class="field"><span>تقویم</span><select name="calendar">${opt([['solar', 'هجری شمسی (حمل، ثور…)'], ['gregorian', 'میلادی']], s.calendar)}</select></label></div>
        <div class="infoBox" style="margin-top:12px">نام و مشخصات داکتران روی سرخط از صفحه «داکتران، خدمات و فیس» تنظیم می‌شود.</div></div>
      <div class="card hidden" data-p="rx"><div class="formGrid">
        <label class="field"><span>اندازه کاغذ نسخه</span><select name="rx_page">${opt([['A5', 'A5'], ['A4', 'A4']], s.rx_page)}</select></label>
        <label class="field"><span>سرخط</span><select name="rx_header_mode">${opt([['full', 'چاپ کامل سرخط (کاغذ سفید)'], ['preprinted', 'کاغذ سرخط‌دار چاپی (فقط محتوا)']], s.rx_header_mode)}</select></label>
        <label class="field"><span>فاصله بالای کاغذ چاپی (mm)</span><input name="rx_header_space_mm" type="number" value="${esc(s.rx_header_space_mm || 60)}"></label>
        <label class="check"><input type="checkbox" name="rx_watermark" ${s.rx_watermark === '1' ? 'checked' : ''}> لوگوی کمرنگ وسط نسخه</label>
        <label class="field full"><span>متن پایین نسخه</span><input name="rx_footer" value="${esc(s.rx_footer || '')}"></label>
        <label class="field"><span>عرض رسید (mm)</span><select name="receipt_width">${opt([['80', '80 mm'], ['58', '58 mm']], s.receipt_width)}</select></label>
        <label class="field span2"><span>متن پایین رسیدها</span><input name="receipt_footer" value="${esc(s.receipt_footer || '')}"></label>
        <label class="field span2"><span>متن پایین راپور لابراتوار</span><input name="lab_report_footer" value="${esc(s.lab_report_footer || '')}"></label><label class="field"><span>امضای راپور</span><input name="lab_signature" class="en" value="${esc(s.lab_signature || '')}"></label></div>
        <div class="secTitle">بخش‌های پیش‌فرض روی نسخه مریض (داکتر هنگام ویزیت می‌تواند تغییر دهد)</div>
        <div class="printOpts" id="poBox">${[['vitals', 'علایم حیاتی'], ['complaint', 'شکایت'], ['diagnosis', 'تشخیص'], ['impression', 'Impression'], ['history', 'سابقه'], ['allergies', 'حساسیت'], ['notes', 'یادداشت داکتر'], ['labs', 'آزمایش‌ها'], ['next_visit', 'مراجعه بعدی'], ['print_note', 'توصیه'], ['barcode', 'بارکود']].map(([k, l]) => `<label class="check"><input type="checkbox" data-po="${k}" ${po[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
      <div class="card hidden" data-p="codes"><div class="formGrid">
        ${[['patient_prefix', 'پیشوند کد مریض'], ['visit_prefix', 'پیشوند رسید پذیرش'], ['rx_prefix', 'پیشوند کد نسخه (دواخانه)'], ['lab_prefix', 'پیشوند کد لابراتوار'], ['sale_prefix', 'پیشوند فروش دواخانه'], ['purchase_prefix', 'پیشوند فاکتور خرید']].map(([k, l]) => `<label class="field"><span>${l}</span><input name="${k}" class="ltr" value="${esc(s[k] || '')}"></label>`).join('')}
        <label class="field span2"><span>شماره‌گذاری نوبت</span><select name="turn_scope">${opt([['doctor', 'جدا برای هر داکتر (خدمات بدون داکتر جدا)'], ['service', 'جدا برای هر خدمت'], ['clinic', 'یک شماره برای کل کلینیک']], s.turn_scope)}</select></label>
        <label class="check"><input type="checkbox" name="station_lock" ${s.station_lock === '1' ? 'checked' : ''}> قفل ایستگاه: هر کاربر فقط در کمپیوتر بخش خودش وارد شود</label></div></div>
      <div class="card hidden" data-p="stock"><div class="formGrid">
        <label class="field"><span>فیصدی مفاد پیش‌فرض ٪</span><input name="default_markup" type="number" value="${esc(s.default_markup || 30)}"></label>
        <label class="field"><span>هشدار انقضا (روز قبل)</span><input name="expiry_warn_days" type="number" value="${esc(s.expiry_warn_days || 90)}"></label>
        <label class="check"><input type="checkbox" name="allow_negative_stock" ${s.allow_negative_stock === '1' ? 'checked' : ''}> اجازه فروش بیشتر از موجودی</label>
        <label class="check"><input type="checkbox" name="auto_backup" ${s.auto_backup === '1' ? 'checked' : ''}> پشتیبان خودکار روزانه</label>
        <label class="field"><span>تعداد پشتیبان‌های نگه داشته شده</span><input name="backup_keep" type="number" value="${esc(s.backup_keep || 30)}"></label></div></div>
      <div class="card hidden" data-p="lists"><div class="grid g3">${L('rx_forms', 'شکل دواها')}${L('rx_frequencies', 'دفعات مصرف')}${L('rx_timings', 'زمان مصرف')}${L('rx_units', 'واحد قوت')}${L('rx_routes', 'طریقه مصرف')}${L('rx_duration_units', 'واحد مدت', 3)}${L('expense_categories', 'کتگوری مصارف')}${L('medicine_categories', 'کتگوری دواها')}${L('medicine_units', 'واحد فروش دوا')}</div></div>
      </form>`;
    $('#stT', view).onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; $$('#stT button', view).forEach(x => x.classList.toggle('on', x === b)); $$('[data-p]', view).forEach(p => p.classList.toggle('hidden', p.dataset.p !== b.dataset.t)); };
    const collect = () => {
      const v = {}; $$('#stF [name]', view).forEach(el => v[el.name] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value);
      const o = { patient: 1 }; $$('[data-po]', view).forEach(c => o[c.dataset.po] = c.checked ? 1 : 0); v.rx_default_print = JSON.stringify(o);
      return v;
    };
    actions(view, {
      save: (b) => busy(b, async () => { await API.post('/api/settings', collect()); await loadBootstrap(); toast('تنظیمات ذخیره شد', 'good'); }),
      logo: async () => { const f = await pickFile('image/*'); if (!f) return; if (f.size > 700 * 1024) return toast('تصویر بزرگ است (حداکثر 700KB)', 'bad'); const d = 'data:' + f.type + ';base64,' + await fileToBase64(f); $('[name=clinic_logo]', view).value = d; $('#logoPrev', view).src = d; },
      logoReset: () => { $('[name=clinic_logo]', view).value = ''; $('#logoPrev', view).src = 'img/logo.png'; },
      preview: () => {
        const saved = App.settings; App.settings = { ...saved, ...collect() };
        const html = rxDocHTML({ enc: { bp_sys: 120, bp_dia: 80, pulse: 82, temp: 37.4, weight: 18, diagnosis: 'Acute gastroenteritis', complaint: 'اسهال و استفراغ از دو روز', print_note: 'مایعات زیاد بنوشد', next_visit: isoDate(addDays(new Date(), 5)) },
          rx: { rx_code: (App.settings.rx_prefix || 'RX-') + '00012', date: today(), items: [{ name: 'ORS', form: 'Sachet', strength: '20.5', unit: 'g', dose: '1', frequency: 'بعد از هر اسهال', timing: '', duration: 3, duration_unit: 'روز', qty: 10, note: 'در یک لیتر آب حل شود' }, { name: 'Zinc', form: 'Syrup', strength: '20', unit: 'mg/5ml', dose: '5 ml', frequency: 'روزانه یک بار', timing: 'بعد از غذا', duration: 10, duration_unit: 'روز', qty: 1 }, { name: 'Paracetamol Syrup', form: 'Syrup', strength: '120', unit: 'mg/5ml', dose: '7.5 ml', frequency: 'هر ۸ ساعت', timing: 'در صورت تب', duration: 3, duration_unit: 'روز', qty: 1 }] },
          lab: { lab_code: 'LB-00007', items: [{ name: 'CBC' }, { name: 'Stool Examination' }] }, patient: { full_name: 'احمد', father_name: 'محمود', sex: 'M', birth_date: isoDate(addDays(new Date(), -365 * 4)), code: 'P-10001' }, doctor: App.doctors[0], opts: JSON.parse(App.settings.rx_default_print) });
        App.settings = saved;
        previewDoc(html, { size: collect().rx_page === 'A4' ? 'A4' : 'A5', title: 'نمونه نسخه' });
      }
    });
  }
};

// ================================================================ audit log
Pages.audit = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>گزارش فعالیت‌ها</h1><p>چه کسی، از کدام کمپیوتر، چه تغییری داده است.</p></div></div>
      <div class="filterBar"><label class="field"><span>از</span>${dateInput('from', isoDate(addDays(new Date(), -2)), 'id="a_from"')}</label><label class="field"><span>تا</span>${dateInput('to', today(), 'id="a_to"')}</label><label class="field grow"><span>جستجو</span><input id="a_q" placeholder="کاربر، عملیات، بخش…"></label></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>زمان</th><th>کاربر</th><th>ایستگاه</th><th>IP</th><th>عملیات</th><th>بخش</th><th>جزئیات</th></tr></thead><tbody id="aB"></tbody></table></div></div>`;
    const load = async () => {
      const rows = await API.list('audit_log', { from: dateOf($('#a_from', view)), to: dateOf($('#a_to', view)), q: $('#a_q', view).value.trim(), limit: 2000 });
      $('#aB', view).innerHTML = rows.map(a => `<tr><td class="nowrap">${fmtDateTime(a.at)}</td><td>${esc(a.username || '')}</td><td>${esc(STATIONS[a.station]?.short || a.station || '')}</td><td class="ltr">${esc(a.ip || '')}</td><td>${esc(a.action)}</td><td>${esc(a.entity || '')} ${a.entity_id || ''}</td><td class="small" style="max-width:420px;word-break:break-all">${esc((a.detail || '').slice(0, 200))}</td></tr>`).join('') || emptyRow(7);
    };
    $$('#a_from, #a_to', view).forEach(el => el.addEventListener('change', load)); $('#a_q', view).addEventListener('input', debounce(load, 300));
    await load();
  }
};

// ================================================================ backup
Pages.backup = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>پشتیبان دیتابیس</h1><p>دیتابیس روی همین کمپیوتر (سرور) ذخیره است. هر روز خودکار پشتیبان گرفته می‌شود. یک کاپی را در فلش یا جای دیگر هم نگه دارید.</p></div>
      <div class="toolbar"><button class="btn primary" data-act="now">${icon('database')} پشتیبان همین حالا</button><a class="btn" id="dl" href="#">${icon('download')} دانلود فایل دیتابیس</a><button class="btn dangerText" data-act="up">${icon('upload')} بازگردانی از فایل…</button></div></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>فایل</th><th>اندازه</th><th>زمان</th><th></th></tr></thead><tbody id="bB"></tbody></table></div></div>`;
    $('#dl', view).onclick = (e) => { e.preventDefault(); const a = document.createElement('a'); a.href = '/api/backup/download?token=' + encodeURIComponent(API.token); a.download = ''; document.body.appendChild(a); a.click(); a.remove(); };
    const load = async () => {
      const rows = await API.get('/api/backups');
      $('#bB', view).innerHTML = rows.map(b => `<tr><td class="ltr">${esc(b.name)}</td><td>${(b.size / 1024).toFixed(0)} KB</td><td>${fmtDateTime(b.at)}</td><td><button class="btn sm dangerText" data-act="restore" data-name="${esc(b.name)}">بازگردانی</button></td></tr>`).join('') || emptyRow(4);
    };
    const restore = async (body) => {
      if (!(await confirmDlg('دیتابیس فعلی با این پشتیبان جایگزین می‌شود (قبل از آن یک پشتیبان گرفته می‌شود). همه ایستگاه‌ها دوباره بارگذاری می‌شوند. ادامه؟', { danger: true }))) return;
      await API.post('/api/backups/restore', body); toast('بازگردانی شد', 'good'); setTimeout(() => location.reload(), 900);
    };
    actions(view, {
      now: async () => { const f = await API.post('/api/backups/now'); toast('پشتیبان گرفته شد: ' + f, 'good'); load(); },
      restore: (b) => restore({ name: b.dataset.name }),
      up: async () => { const f = await pickFile('.sqlite,.db'); if (f) restore({ data: await fileToBase64(f) }); }
    });
    await load();
  }
};

// ================================================================ this computer (every station)
Pages.local = {
  async render(view) {
    const nat = window.native || null;
    let printers = [];
    if (nat && nat.printers) { try { printers = await nat.printers(); } catch (_) { } }
    const pOpt = (sel) => opt(printers.map(p => [p.name, p.displayName || p.name]), sel, { empty: 'پرینتر پیش‌فرض ویندوز' });
    view.innerHTML = `<div class="pageHead"><div><h1>تنظیمات این کمپیوتر</h1><p>این تنظیمات فقط برای همین کمپیوتر است.</p></div></div>
      <div class="grid g2"><div class="card"><h2>${icon('print')} پرینترها</h2>
        ${nat ? `<div class="formGrid"><label class="field span2"><span>پرینتر رسید (۸۰ میلی‌متر)</span><select id="pr_r">${pOpt(localGet('printer_receipt', ''))}</select></label><label class="check"><input type="checkbox" id="sl_r" ${localGet('silent_receipt', '0') === '1' ? 'checked' : ''}> چاپ مستقیم بدون پنجره</label>
          <label class="field span2"><span>پرینتر نسخه / راپور (A5 / A4)</span><select id="pr_p">${pOpt(localGet('printer_page', ''))}</select></label><label class="check"><input type="checkbox" id="sl_p" ${localGet('silent_page', '0') === '1' ? 'checked' : ''}> چاپ مستقیم بدون پنجره</label></div>`
        : '<div class="infoBox">در مرورگر، پرینتر در پنجره چاپ انتخاب می‌شود.</div>'}
        <div class="bar" style="margin-top:12px"><button class="btn" data-act="test">${icon('print')} چاپ آزمایشی رسید</button></div></div>
      <div class="card"><h2>${icon('settings')} عمومی</h2><label class="check"><input type="checkbox" id="snd" ${localGet('sound', '1') === '1' ? 'checked' : ''}> صدای اطلاع (نسخه / مریض / آزمایش جدید)</label>
        <div class="sum" style="flex-direction:column;gap:6px;margin-top:12px"><span>ایستگاه: <b>${esc(STATIONS[App.station]?.name || 'مرورگر')}</b></span><span>سرور: <b class="ltr">${esc(location.host)}</b></span><span>وضعیت: <b>${App.online ? 'متصل' : 'قطع'}</b></span>${nat ? `<span>نسخه برنامه: <b>${esc(nat.version || '')}</b></span>` : ''}</div>
        ${nat && nat.changeServer && App.station !== 'admin' ? `<button class="btn" style="margin-top:12px" data-act="srv">${icon('network')} تغییر آدرس سرور</button>` : ''}
        ${nat && nat.openData && App.station === 'admin' ? `<button class="btn" style="margin-top:12px" data-act="data">${icon('database')} باز کردن پوشه دیتابیس</button>` : ''}</div></div>`;
    const bind = (id, key, chk) => { const el = $('#' + id, view); if (el) el.onchange = () => { localSet(key, chk ? (el.checked ? '1' : '0') : el.value); toast('ذخیره شد', 'good'); }; };
    bind('pr_r', 'printer_receipt'); bind('pr_p', 'printer_page'); bind('sl_r', 'silent_receipt', 1); bind('sl_p', 'silent_page', 1); bind('snd', 'sound', 1);
    actions(view, {
      test: () => printDoc(`<div class="doc receipt">${smallHead('چاپ آزمایشی')}${rcRow('ایستگاه', esc(STATIONS[App.station]?.name || ''))}${rcRow('تاریخ', fmtDateTimeNum(new Date()))}${rcFooter()}</div>`, { size: 'receipt' }),
      srv: () => nat.changeServer(), data: () => nat.openData()
    });
  }
};
