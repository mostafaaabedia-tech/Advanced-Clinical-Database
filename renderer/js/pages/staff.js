/* Staff (کارمندان): employees with salary and working hours, attendance (check in / out, device import),
   hourly leave during work time and daily leave, advances taken from the salary, monthly payroll with the remaining of last month.
   Used by the reception and the admin. */
'use strict';

const STAFF_SEC = [['reception', 'پذیرش'], ['doctor', 'داکتر / ویزیت'], ['pharmacy', 'دواخانه'], ['lab', 'لابراتوار'], ['stock', 'انبار و حسابات'], ['clinic', 'خدمات / عمومی'], ['admin', 'مدیریت']];
const LEAVE_KIND = { hourly: 'ساعتی (در وقت کار)', daily: 'روزانه', sick: 'مریضی', annual: 'سالانه' };
const ATT_STATUS = { present: ['حاضر', 'good'], absent: ['غیرحاضر', 'bad'], leave: ['رخصتی', 'warn'], holiday: ['تعطیل', 'info'] };
const WD = [[6, 'شنبه'], [0, 'یکشنبه'], [1, 'دوشنبه'], [2, 'سه‌شنبه'], [3, 'چهارشنبه'], [4, 'پنجشنبه'], [5, 'جمعه']];
const hm = (m) => { m = Math.round(Number(m) || 0); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} ساعت${r ? ' و ' + r + ' دقیقه' : ''}` : `${r} دقیقه`; };
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const curMonth = () => { const m = monthKey(new Date()); return { key: m.key, label: m.label, range: currentMonthRange() }; };
function monthChoices(n = 13) { return lastMonths(n).reverse(); }

function staffForm(s, after) {
  s = s || { salary: 0, work_start: '08:00', work_end: '16:00', work_days: '601234', active: 1, hire_date: today() };
  const days = String(s.work_days || '');
  const m = modal({ title: s.id ? 'ویرایش کارمند — ' + esc(s.name) : 'کارمند جدید', size: 'wide', body: `<div class="formGrid" id="sfF">
    <label class="field span2"><span>نام و تخلص <em>*</em></span><input name="name" value="${esc(s.name || '')}" data-fa></label>
    <label class="field"><span>ولد</span><input name="father_name" value="${esc(s.father_name || '')}" data-fa></label>
    <label class="field"><span>کد کارمند (همان کد دستگاه حاضری)</span><input name="code" class="ltr" value="${esc(s.code || '')}"></label>
    <label class="field"><span>وظیفه</span><input name="position" value="${esc(s.position || '')}" placeholder="نرس، کاشیر، لابرانت…"></label>
    <label class="field"><span>بخش</span><select name="section">${opt(STAFF_SEC, s.section, { empty: '—' })}</select></label>
    <label class="field"><span>شماره تلفن</span><input name="phone" class="ltr" value="${esc(s.phone || '')}"></label>
    <label class="field"><span>نمبر تذکره</span><input name="tazkira" class="ltr" value="${esc(s.tazkira || '')}"></label>
    <label class="field"><span>معاش ماهانه (${esc(currency())})</span><input name="salary" type="number" min="0" value="${esc(s.salary || 0)}"></label>
    <label class="field"><span>تاریخ شروع کار</span>${dateInput('hire_date', s.hire_date)}</label>
    <label class="field"><span>شروع وقت کار</span><input name="work_start" type="time" value="${esc(s.work_start || '08:00')}"></label>
    <label class="field"><span>ختم وقت کار</span><input name="work_end" type="time" value="${esc(s.work_end || '16:00')}"></label>
    <div class="field full"><span>روزهای کاری</span><div class="chips" id="sfDays">${WD.map(([d, l]) => `<button type="button" class="chip ${days.includes(String(d)) ? 'on' : ''}" data-d="${d}">${l}</button>`).join('')}</div></div>
    <label class="field full"><span>یادداشت</span><input name="notes" value="${esc(s.notes || '')}"></label>
    <label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> فعال (هنوز کار می‌کند)</label></div>`,
    foot: `<button class="btn primary" id="sf_ok">${icon('check')} ذخیره</button><button class="btn" data-x>انصراف</button>` });
  $('#sfDays', m.el).onclick = (e) => { const b = e.target.closest('[data-d]'); if (b) b.classList.toggle('on'); };
  $('[data-x]', m.el).onclick = m.close;
  $('#sf_ok', m.el).onclick = () => busy($('#sf_ok', m.el), async () => {
    const v = formValues($('#sfF', m.el)); if (s.id) v.id = s.id;
    v.work_days = $$('#sfDays .chip.on', m.el).map(b => b.dataset.d).join('');
    await API.post('/api/staff/save', v); toast('ذخیره شد', 'good'); m.close(); after && after();
  }).catch(errToast);
}

function leaveDialog(staff, after, date) {
  const m = modal({ title: 'رخصتی — ' + esc(staff.name), body: `<div class="formGrid" id="lvF">
    <label class="field"><span>نوع رخصتی</span><select name="kind" id="lvK">${opt(Object.entries(LEAVE_KIND), 'hourly')}</select></label>
    <label class="field"><span>تاریخ</span>${dateInput('date', date || today())}</label>
    <label class="field lvH"><span>از ساعت</span><input name="from_time" type="time" value="${nowHM()}"></label>
    <label class="field lvH"><span>تا ساعت</span><input name="to_time" type="time" value="${esc(staff.work_end || '16:00')}"></label>
    <label class="field lvD hidden"><span>تا تاریخ</span>${dateInput('date_to', date || today())}</label>
    <label class="field"><span>با معاش؟</span><select name="paid">${opt([['0', 'بدون معاش (از معاش کم شود)'], ['1', 'با معاش']], App.settings.staff_hourly_paid === '1' ? '1' : '0')}</select></label>
    <label class="field full"><span>علت</span><input name="reason" placeholder="کار شخصی، مریضی، …"></label></div>
    <div class="mini muted" id="lvInfo" style="margin-top:6px">وقت کار: ${esc(staff.work_start)} تا ${esc(staff.work_end)}</div>`,
    foot: `<button class="btn primary" id="lv_ok">ثبت رخصتی</button><button class="btn" data-x>انصراف</button>` });
  const sync = () => { const h = $('#lvK', m.el).value === 'hourly'; $$('.lvH', m.el).forEach(x => x.classList.toggle('hidden', !h)); $$('.lvD', m.el).forEach(x => x.classList.toggle('hidden', h)); };
  $('#lvK', m.el).onchange = () => { sync(); $('[name=paid]', m.el).value = $('#lvK', m.el).value === 'hourly' ? (App.settings.staff_hourly_paid === '1' ? '1' : '0') : '1'; };
  sync();
  $('[data-x]', m.el).onclick = m.close;
  $('#lv_ok', m.el).onclick = () => busy($('#lv_ok', m.el), async () => { const v = formValues($('#lvF', m.el)); v.staff_id = staff.id; v.paid = Number(v.paid); const r = await API.post('/api/staff/leave', v); toast(`رخصتی ثبت شد (${hm(r.minutes)})`, 'good'); m.close(); after && after(); }).catch(errToast);
}

function advanceDialog(staff, after, month) {
  const months = monthChoices(4);
  const m = modal({ title: 'برداشت از معاش — ' + esc(staff.name), body: `<div class="formGrid" id="adF">
    <label class="field"><span>مبلغ</span><input name="amount" type="number" min="0"></label>
    <label class="field"><span>از معاش کدام ماه</span><select name="month">${opt(months.map(x => [x.key, x.label]), month || curMonth().key)}</select></label>
    <label class="field"><span>تاریخ</span>${dateInput('date', today())}</label>
    <label class="field"><span>پول از کدام صندوق</span><select name="source">${opt([['reception', 'صندوق پذیرش'], ['pharmacy', 'صندوق دواخانه'], ['lab', 'پول لابراتوار'], ['', 'هیچ‌کدام (فقط ثبت)']], 'reception')}</select></label>
    <label class="field full"><span>یادداشت</span><input name="note"></label></div>
    <div class="mini muted" style="margin-top:6px">این مبلغ در معاش همان ماه کم می‌شود و در برداشت‌های صندوق انتخاب شده هم ثبت می‌شود.</div>`,
    foot: `<button class="btn primary" id="ad_ok">ثبت برداشت</button><button class="btn" data-x>انصراف</button>` });
  $('[data-x]', m.el).onclick = m.close;
  $('#ad_ok', m.el).onclick = () => busy($('#ad_ok', m.el), async () => { const v = formValues($('#adF', m.el)); v.staff_id = staff.id; await API.post('/api/staff/advance', v); toast('برداشت از معاش ثبت شد', 'good'); m.close(); after && after(); }).catch(errToast);
}

// ---------------------------------------------------------------- staff list
Pages.staff = {
  async render(view) {
    view.innerHTML = `<div class="pageHead"><div><h1>کارمندان</h1><p>کارمند جدید، معاش، وقت کار و روزهای کاری — برداشت از معاش و رخصتی از همین‌جا.</p></div>
      <div class="toolbar"><button class="btn primary" data-act="new">${icon('plus')} کارمند جدید</button><button class="btn" data-act="att">${icon('clock')} حاضری امروز</button><button class="btn" data-act="pay">${icon('money')} معاشات</button></div></div>
      <div class="grid g4" id="stK" style="margin-bottom:14px"></div>
      <div class="card"><div class="tableWrap"><table class="t"><thead><tr><th>نام</th><th>وظیفه / بخش</th><th>تلفن</th><th>معاش</th><th>وقت کار</th><th>برداشت این ماه</th><th>وضعیت</th><th></th></tr></thead><tbody id="stB"></tbody></table></div></div>`;
    const load = async () => {
      const cm = curMonth();
      const [list, adv] = await Promise.all([API.get('/api/staff'), API.get('/api/staff/advances', { month: cm.key })]);
      const advOf = (id) => adv.filter(a => a.staff_id === id).reduce((x, a) => x + a.amount, 0);
      const act = list.filter(s => s.active);
      $('#stK', view).innerHTML = kpi('کارمندان فعال', act.length, { ic: 'users' }) + kpi('مجموع معاشات ماهانه', money(act.reduce((a, s) => a + s.salary, 0)), { ic: 'money', cls: 'violet', sub: currency() }) + kpi('برداشت از معاش این ماه', money(adv.reduce((a, x) => a + x.amount, 0)), { ic: 'wallet', cls: 'warn', sub: cm.label }) + kpi('بخش‌ها', new Set(act.map(s => s.section).filter(Boolean)).size, { ic: 'list' });
      $('#stB', view).innerHTML = list.map(s => `<tr class="${s.active ? '' : 'muted'}"><td><b>${esc(s.name)}</b> <small class="muted">${esc(s.father_name || '')}</small>${s.code ? ` <span class="codeTag small">${esc(s.code)}</span>` : ''}</td>
        <td>${esc(s.position || '')} <small class="muted">${esc((STAFF_SEC.find(x => x[0] === s.section) || [])[1] || '')}</small></td><td class="ltr">${esc(s.phone || '')}</td><td class="money">${money(s.salary)}</td>
        <td class="ltr nowrap">${esc(s.work_start)} – ${esc(s.work_end)}</td><td class="${advOf(s.id) ? 'neg' : ''}">${advOf(s.id) ? money(advOf(s.id)) : ''}</td><td>${s.active ? pill('فعال', 'good') : pill('غیرفعال', '')}</td>
        <td class="nowrap"><button class="btn sm" data-act="adv" data-id="${s.id}">${icon('wallet', 13)} برداشت</button> <button class="btn sm" data-act="leave" data-id="${s.id}">${icon('clock', 13)} رخصتی</button> <button class="btn sm" data-act="edit" data-id="${s.id}">${icon('edit', 13)}</button></td></tr>`).join('') || emptyRow(8, 'هنوز کارمندی ثبت نشده');
      view._list = list;
    };
    const one = (b) => (view._list || []).find(s => s.id === Number(b.dataset.id));
    actions(view, { new: () => staffForm(null, load), edit: (b) => staffForm(one(b), load), adv: (b) => advanceDialog(one(b), load), leave: (b) => leaveDialog(one(b), load), att: () => go('attendance'), pay: () => go('payroll') });
    await load();
  }
};

// ---------------------------------------------------------------- attendance (day board + monthly report)
Pages.attendance = {
  async render(view, params) {
    let tab = params.tab || 'day';
    view.innerHTML = `<div class="pageHead"><div><h1>حاضری کارمندان</h1><p>ورود و خروج با یک کلیک (ساعت دقیق ثبت می‌شود)، رخصتی ساعتی در وقت کار، غیرحاضری — و گزارش ماهانه.</p></div>
      <div class="toolbar"><button class="btn" data-act="import">${icon('upload')} وارد کردن از دستگاه حاضری</button><button class="btn" data-act="print">${icon('print')} چاپ</button></div></div>
      <div class="tabs" id="atT"><button data-t="day">حاضری روز</button><button data-t="month">گزارش ماهانه</button><button data-t="leaves">رخصتی‌ها</button></div><div id="atBody"></div>`;
    const body = () => $('#atBody', view);
    const drawTabs = () => $$('#atT button', view).forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    const dayUI = async () => {
      body().innerHTML = `<div class="filterBar"><label class="field"><span>تاریخ</span>${dateInput('d', params.date || today(), 'id="atD"')}</label><span class="clockBig" id="atClock">${nowHM()}</span></div>
        <div class="grid g4" id="atK" style="margin-bottom:14px"></div><div class="staffBoard" id="atB"></div>`;
      const load = async () => {
        const date = dateOf($('#atD', view)) || today();
        const rows = await API.get('/api/staff/day', { date });
        const st = (r) => r.att ? r.att.status : (r.leaves.some(l => l.kind !== 'hourly') ? 'leave' : null);
        $('#atK', view).innerHTML = kpi('حاضر', rows.filter(r => st(r) === 'present').length, { ic: 'check', cls: 'good' }) + kpi('هنوز نیامده', rows.filter(r => r.workday && !st(r)).length, { ic: 'clock', cls: 'warn' }) + kpi('غیرحاضر', rows.filter(r => st(r) === 'absent').length, { ic: 'x', cls: 'bad' }) + kpi('رخصتی', rows.filter(r => st(r) === 'leave' || r.leaves.length).length, { ic: 'calendar', cls: 'info' });
        $('#atB', view).innerHTML = rows.map(r => { const a = r.att; const s = st(r); const lv = r.leaves;
          return `<div class="staffCard ${s || (r.workday ? 'none' : 'off')}"><div class="scHead"><div class="avatar">${esc((r.name || '?').trim()[0])}</div><div><b>${esc(r.name)}</b><div class="mini muted">${esc(r.position || '')} · ${esc(r.work_start)}–${esc(r.work_end)}</div></div>${s ? pill(ATT_STATUS[s][0], ATT_STATUS[s][1]) : r.workday ? pill('ثبت نشده', '') : pill('روز رخصتی', 'info')}</div>
            <div class="scTimes"><div><small>ورود</small><b class="ltr">${esc(a?.check_in || '—')}</b>${a?.late_min ? `<span class="neg mini">${a.late_min} دقیقه ناوقت</span>` : ''}</div><div><small>خروج</small><b class="ltr">${esc(a?.check_out || '—')}</b>${a?.early_min ? `<span class="neg mini">${a.early_min} دقیقه زود</span>` : ''}</div></div>
            ${lv.length ? `<div class="scLeaves">${lv.map(l => `<div>${icon('clock', 12)} ${esc(LEAVE_KIND[l.kind])} ${l.kind === 'hourly' ? `<span class="ltr">${esc(l.from_time)}–${esc(l.to_time)}</span>` : ''} · ${hm(l.minutes)} ${l.paid ? '' : '<small class="neg">(بدون معاش)</small>'} ${l.reason ? '· ' + esc(l.reason) : ''} <a href="#" data-lvdel="${l.id}" title="حذف">×</a></div>`).join('')}</div>` : ''}
            <div class="scBtns"><button class="btn sm success" data-in="${r.id}">${icon('next', 13)} ورود</button><button class="btn sm" data-out="${r.id}">${icon('logout', 13)} خروج</button><button class="btn sm" data-lv="${r.id}">${icon('clock', 13)} رخصتی</button>
              <button class="btn sm ghost" data-abs="${r.id}">غیرحاضر</button><button class="btn sm ghost" data-ed="${r.id}">${icon('edit', 13)}</button></div></div>`; }).join('') || '<div class="card empty">کارمندی ثبت نشده — از صفحه «کارمندان» اضافه کنید.</div>';
        view._rows = rows; view._html = `<table class="rt"><tr><th>نام</th><th>وضعیت</th><th>ورود</th><th>خروج</th><th>ناوقت</th><th>رخصتی</th></tr>${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.att ? ATT_STATUS[r.att.status][0] : '')}</td><td>${esc(r.att?.check_in || '')}</td><td>${esc(r.att?.check_out || '')}</td><td>${r.att?.late_min || ''}</td><td>${r.leaves.map(l => hm(l.minutes)).join('، ')}</td></tr>`).join('')}</table>`;
      };
      $('#atD', view).addEventListener('change', load);
      const tick = setInterval(() => { const c = $('#atClock', view); if (!c) return clearInterval(tick); c.textContent = nowHM(); }, 15000);
      $('#atB', view).onclick = async (e) => {
        const date = dateOf($('#atD', view)) || today(); const b = e.target.closest('button,a'); if (!b) return;
        const id = Number(b.dataset.in || b.dataset.out || b.dataset.lv || b.dataset.abs || b.dataset.ed || 0); const r = (view._rows || []).find(x => x.id === id);
        try {
          if (b.dataset.in) { await API.post('/api/staff/check', { staff_id: id, action: 'in', date }); toast(`${r.name}: ورود ${nowHM()}`, 'good'); }
          else if (b.dataset.out) { await API.post('/api/staff/check', { staff_id: id, action: 'out', date }); toast(`${r.name}: خروج ${nowHM()}`, 'good'); }
          else if (b.dataset.abs) { await API.post('/api/staff/check', { staff_id: id, action: 'absent', date }); }
          else if (b.dataset.lv) return leaveDialog(r, load, date);
          else if (b.dataset.lvdel) { e.preventDefault(); if (await confirmDlg('این رخصتی حذف شود؟')) await API.post('/api/staff/leave-del/' + b.dataset.lvdel); }
          else if (b.dataset.ed) return editAtt(r, date, load);
          load();
        } catch (err) { errToast(err); }
      };
      await load(); view._reload = load;
    };
    const editAtt = (r, date, after) => {
      const a = r.att || {};
      const m = modal({ title: 'اصلاح حاضری — ' + esc(r.name), body: `<div class="formGrid" id="eaF"><label class="field"><span>وضعیت</span><select name="status">${opt(Object.entries(ATT_STATUS).map(([k, v]) => [k, v[0]]), a.status || 'present')}</select></label>
        <label class="field"><span>ساعت ورود</span><input type="time" name="check_in" value="${esc(a.check_in || '')}"></label><label class="field"><span>ساعت خروج</span><input type="time" name="check_out" value="${esc(a.check_out || '')}"></label>
        <label class="field full"><span>یادداشت</span><input name="note" value="${esc(a.note || '')}"></label></div>`,
        foot: `<button class="btn primary" id="ea_ok">ذخیره</button><button class="btn dangerText" id="ea_clr">پاک کردن حاضری این روز</button>` });
      $('#ea_ok', m.el).onclick = () => busy($('#ea_ok', m.el), async () => { await API.post('/api/staff/check', { staff_id: r.id, date, action: 'edit', ...formValues($('#eaF', m.el)) }); m.close(); after(); }).catch(errToast);
      $('#ea_clr', m.el).onclick = async () => { await API.post('/api/staff/check', { staff_id: r.id, date, action: 'clear' }); m.close(); after(); };
    };
    const monthUI = async () => {
      const months = monthChoices();
      body().innerHTML = `<div class="filterBar"><label class="field"><span>ماه</span><select id="amM">${opt(months.map((x, i) => [i, x.label]), 0)}</select></label></div><div class="card"><div class="tableWrap" id="amOut"></div></div>`;
      const load = async () => {
        const m = months[Number($('#amM', view).value) || 0];
        const rows = await API.get('/api/staff/attendance-report', { from: m.range[0], to: m.range[1] });
        $('#amOut', view).innerHTML = `<table class="t"><thead><tr><th>کارمند</th><th>روز کاری</th><th>حاضر</th><th>غیرحاضر</th><th>رخصتی روزانه</th><th>ثبت نشده</th><th>ناوقت آمدن</th><th>زود رفتن</th><th>رخصتی ساعتی</th><th>بدون معاش</th><th>ساعات کار</th></tr></thead><tbody>
          ${rows.map(r => `<tr><td><b>${esc(r.staff.name)}</b> <small class="muted">${esc(r.staff.position || '')}</small></td><td>${r.work_days}</td><td class="pos">${r.present}</td><td class="neg">${r.absent || ''}</td><td>${r.leave_days || ''}</td><td class="muted">${r.no_record || ''}</td>
            <td>${r.late_min ? hm(r.late_min) : ''}</td><td>${r.early_min ? hm(r.early_min) : ''}</td><td>${r.hourly_leave_min ? hm(r.hourly_leave_min) : ''}</td><td class="neg">${r.unpaid_leave_min ? hm(r.unpaid_leave_min) : ''}</td><td>${r.worked_min ? hm(r.worked_min) : ''}</td></tr>`).join('') || emptyRow(11)}</tbody></table>`;
        view._html = `<p>${esc(m.label)}</p><table class="rt">${$('#amOut table', view).innerHTML}</table>`;
      };
      $('#amM', view).onchange = load; await load();
    };
    const leavesUI = async () => {
      const [mf, mt] = currentMonthRange();
      body().innerHTML = `<div class="filterBar"><label class="field"><span>از</span>${dateInput('f', mf, 'id="lvFrom"')}</label><label class="field"><span>تا</span>${dateInput('t', mt, 'id="lvTo"')}</label></div><div class="card"><div class="tableWrap" id="lvOut"></div></div>`;
      const load = async () => {
        const rows = await API.get('/api/staff/leaves', { from: dateOf($('#lvFrom', view)), to: dateOf($('#lvTo', view)) });
        $('#lvOut', view).innerHTML = `<table class="t"><thead><tr><th>تاریخ</th><th>کارمند</th><th>نوع</th><th>وقت</th><th>مدت</th><th>معاش</th><th>علت</th><th>اجازه</th><th></th></tr></thead><tbody>
          ${rows.map(l => `<tr><td class="nowrap">${fmtDate(l.date)}${l.date_to && l.date_to !== l.date ? ' — ' + fmtDate(l.date_to) : ''}</td><td><b>${esc(l.name)}</b></td><td>${esc(LEAVE_KIND[l.kind])}</td><td class="ltr">${l.kind === 'hourly' ? esc(l.from_time + '–' + l.to_time) : ''}</td><td>${hm(l.minutes)}</td><td>${l.paid ? 'با معاش' : pill('بدون معاش', 'warn')}</td><td>${esc(l.reason || '')}</td><td class="small">${esc(l.approved_by || '')}</td><td><button class="btn sm dangerText" data-del="${l.id}">${icon('trash', 13)}</button></td></tr>`).join('') || emptyRow(9)}</tbody></table>`;
        view._html = `<table class="rt">${$('#lvOut table', view).innerHTML.replace(/<button[\s\S]*?<\/button>/g, '')}</table>`;
      };
      $$('#lvFrom, #lvTo', view).forEach(e => e.addEventListener('change', load));
      $('#lvOut', view).onclick = async (e) => { const b = e.target.closest('[data-del]'); if (b && await confirmDlg('حذف شود؟')) { await API.post('/api/staff/leave-del/' + b.dataset.del); load(); } };
      await load();
    };
    const show = async () => { drawTabs(); if (tab === 'day') await dayUI(); else if (tab === 'month') await monthUI(); else await leavesUI(); };
    $('#atT', view).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; show().catch(errToast); } };
    actions(view, {
      print: () => previewDoc(reportDocHTML('حاضری کارمندان', view._html || ''), { title: 'حاضری' }),
      import: () => {
        const m = modal({ title: 'وارد کردن حاضری از دستگاه', size: 'wide', body: `<p class="mini">فایل CSV / متن دستگاه حاضری را انتخاب کنید یا متن را بچسبانید. هر سطر: <b class="ltr">کد کارمند (یا نام), تاریخ ساعت</b> — مثلاً <span class="ltr">12, 2026-10-21 07:58</span>. اولین ساعت هر روز = ورود، آخرین = خروج.</p>
          <input type="file" id="imF" accept=".csv,.txt,.dat,.log"><textarea id="imT" rows="10" class="ltr" style="margin-top:8px" placeholder="12,2026-10-21 07:58&#10;12,2026-10-21 16:05"></textarea>`, foot: `<button class="btn primary" id="im_ok">وارد کردن</button>` });
        $('#imF', m.el).onchange = async (e) => { const f = e.target.files[0]; if (f) $('#imT', m.el).value = await f.text(); };
        $('#im_ok', m.el).onclick = () => busy($('#im_ok', m.el), async () => { const r = await API.post('/api/staff/import-attendance', { text: $('#imT', m.el).value }); toast(`${r.days} روز حاضری وارد شد${r.skipped ? ` · ${r.skipped} سطر شناخته نشد` : ''}`, 'good'); m.close(); show(); }).catch(errToast);
      }
    });
    await show();
  },
  onEvent(m) { if (m.type === 'staff:attendance' && $('#atB')) reloadPage(); }
};

// ---------------------------------------------------------------- payroll
Pages.payroll = {
  async render(view) {
    const months = monthChoices();
    view.innerHTML = `<div class="pageHead"><div><h1>معاشات کارمندان</h1><p>معاش ماه = معاش اصلی − (غیرحاضری + رخصتی بدون معاش) + اضافه‌کاری / پاداش − برداشت از معاش + باقی ماه قبل.</p></div>
      <div class="toolbar"><select id="pyM" style="width:auto">${opt(months.map((x, i) => [i, x.label]), 0)}</select><button class="btn primary" data-act="calcAll">${icon('refresh')} حساب و ذخیره همه</button><button class="btn" data-act="print">${icon('print')} چاپ</button><button class="btn" data-act="csv">${icon('download')} CSV</button></div></div>
      <div class="grid g4" id="pyK" style="margin-bottom:14px"></div>
      <div class="card"><div class="tableWrap"><table class="t" id="pyT"></table></div></div>
      <div class="card"><h2>${icon('wallet')} برداشت‌های معاش این ماه</h2><div class="tableWrap" id="pyAdv"></div></div>`;
    let rows = [], m = null;
    const load = async () => {
      m = months[Number($('#pyM', view).value) || 0];
      [rows, view._adv] = await Promise.all([API.get('/api/staff/payroll', { month: m.key, from: m.range[0], to: m.range[1] }), API.get('/api/staff/advances', { month: m.key })]);
      const val = (r) => r.saved || r.calc;
      $('#pyT', view).innerHTML = `<thead><tr><th>کارمند</th><th>معاش اصلی</th><th>روز کاری / حاضر</th><th>غیرحاضر</th><th>رخصتی بدون معاش</th><th>کسر</th><th>پاداش</th><th>برداشت از معاش</th><th>باقی ماه قبل</th><th>قابل پرداخت</th><th>پرداخت شده</th><th>باقی</th><th></th></tr></thead>
        <tbody>${rows.map(r => { const v = val(r); const left = r2(v.net - (r.saved?.paid || 0)); const changed = r.saved && Math.abs(r.saved.net - r.calc.net) > 0.01;
          return `<tr><td><b>${esc(r.staff.name)}</b> <small class="muted">${esc(r.staff.position || '')}</small>${r.saved ? '' : ' ' + pill('حساب نشده', '')}${changed ? ' ' + pill('تغییر کرده — دوباره حساب کنید', 'warn') : ''}</td><td class="money">${money(v.base)}</td><td>${v.work_days} / ${v.present_days}</td><td class="neg">${v.absent_days || ''}</td><td class="neg">${v.unpaid_leave_min ? hm(v.unpaid_leave_min) : ''}</td>
            <td class="neg">${v.deduction ? money(v.deduction) : ''}</td><td>${v.bonus ? money(v.bonus) : ''}</td><td class="neg">${v.advances ? money(v.advances) : ''}</td><td class="${v.carry_in < 0 ? 'neg' : ''}">${v.carry_in ? money(v.carry_in) : ''}</td>
            <td class="money"><b>${money(v.net)}</b></td><td class="pos">${r.saved?.paid ? money(r.saved.paid) : ''}</td><td class="${left > 0.001 ? 'neg' : ''}"><b>${r.saved ? money(left) : ''}</b></td>
            <td class="nowrap"><button class="btn sm" data-calc="${r.staff.id}">${icon('refresh', 13)} حساب</button> ${r.saved ? `<button class="btn sm success" data-pay="${r.saved.id}">${icon('money', 13)} پرداخت</button>` : ''} <button class="btn sm ghost" data-adv="${r.staff.id}" title="برداشت از معاش">${icon('wallet', 13)}</button> ${r.saved ? `<button class="btn sm ghost" data-slip="${r.staff.id}" title="چاپ فیش معاش">${icon('print', 13)}</button>` : ''}</td></tr>`; }).join('') || emptyRow(13, 'کارمندی ثبت نشده')}</tbody>`;
      const T = (k) => rows.reduce((a, r) => a + ((r.saved || r.calc)[k] || 0), 0), paid = rows.reduce((a, r) => a + (r.saved?.paid || 0), 0);
      $('#pyK', view).innerHTML = kpi('مجموع معاشات اصلی', money(T('base')), { ic: 'money', sub: m.label }) + kpi('برداشت از معاش', money(T('advances')), { ic: 'wallet', cls: 'warn' }) + kpi('قابل پرداخت', money(T('net')), { ic: 'cash', cls: 'violet' }) + kpi('باقی پرداخت نشده', money(T('net') - paid), { ic: 'alert', cls: T('net') - paid > 0.001 ? 'bad' : 'good' });
      $('#pyAdv', view).innerHTML = `<table class="t"><thead><tr><th>تاریخ</th><th>کارمند</th><th>مبلغ</th><th>صندوق</th><th>یادداشت</th><th>توسط</th><th></th></tr></thead><tbody>${(view._adv || []).map(a => `<tr><td>${fmtDate(a.date)}</td><td>${esc(a.name)}</td><td class="money">${money(a.amount)}</td><td>${esc(SECTIONS[a.source] || '—')}</td><td>${esc(a.note || '')}</td><td class="small">${esc(a.given_by || '')}</td><td><button class="btn sm dangerText" data-advdel="${a.id}">${icon('trash', 13)}</button></td></tr>`).join('') || emptyRow(7)}</tbody></table>`;
    };
    const calc = async (sid, bonus) => { const r = rows.find(x => x.staff.id === sid); await API.post('/api/staff/payroll/save', { staff_id: sid, month: m.key, from: m.range[0], to: m.range[1], bonus: bonus ?? (r?.saved?.bonus || 0) }); };
    view.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-calc],[data-pay],[data-adv],[data-advdel],[data-slip]'); if (!b) return;
      try {
        if (b.dataset.calc) {
          const r = rows.find(x => x.staff.id === Number(b.dataset.calc));
          const bonus = await promptDlg('حساب معاش — ' + r.staff.name, { label: 'اضافه‌کاری / پاداش این ماه (اختیاری)', value: r.saved?.bonus || 0, type: 'number' }); if (bonus === null) return;
          await calc(r.staff.id, Number(bonus) || 0); toast('معاش حساب و ذخیره شد', 'good'); load();
        }
        if (b.dataset.pay) {
          const r = rows.find(x => x.saved && x.saved.id === Number(b.dataset.pay)); const left = r2(r.saved.net - r.saved.paid);
          const mm = modal({ title: 'پرداخت معاش — ' + esc(r.staff.name), body: `<div class="formGrid" id="ppF"><label class="field"><span>مبلغ (باقی ${money(left)})</span><input name="amount" type="number" value="${Math.max(0, left)}"></label>
            <label class="field"><span>از صندوق</span><select name="source">${opt([['reception', 'صندوق پذیرش'], ['pharmacy', 'صندوق دواخانه'], ['lab', 'پول لابراتوار'], ['', 'هیچ‌کدام (فقط ثبت)']], 'reception')}</select></label>
            <label class="field"><span>تاریخ</span>${dateInput('date', today())}</label><label class="field full"><span>یادداشت</span><input name="note"></label></div>`, foot: `<button class="btn success" id="pp_ok">ثبت پرداخت</button>` });
          $('#pp_ok', mm.el).onclick = () => busy($('#pp_ok', mm.el), async () => { await API.post('/api/staff/payroll/pay', { payroll_id: r.saved.id, ...formValues($('#ppF', mm.el)) }); toast('پرداخت شد', 'good'); mm.close(); load(); }).catch(errToast);
        }
        if (b.dataset.adv) { const r = rows.find(x => x.staff.id === Number(b.dataset.adv)); advanceDialog(r.staff, load, m.key); }
        if (b.dataset.advdel) { if (await confirmDlg('این برداشت از معاش حذف شود؟ (از برداشت‌های صندوق هم حذف می‌شود)', { danger: true })) { await API.post('/api/staff/advance-del/' + b.dataset.advdel); load(); } }
        if (b.dataset.slip) { const r = rows.find(x => x.staff.id === Number(b.dataset.slip)); previewDoc(paySlipHTML(r, m), { size: 'A5', title: 'فیش معاش' }); }
      } catch (err) { errToast(err); }
    });
    $('#pyM', view).onchange = load;
    actions(view, {
      calcAll: (b) => busy(b, async () => { for (const r of rows) await calc(r.staff.id); toast('معاش همه کارمندان حساب شد', 'good'); await load(); }),
      print: () => previewDoc(reportDocHTML('معاشات کارمندان — ' + m.label, `<table class="rt">${$('#pyT', view).innerHTML.replace(/<button[\s\S]*?<\/button>/g, '').replace(/<span class="pill[^>]*>[^<]*<\/span>/g, '')}</table>`), { title: 'معاشات' }),
      csv: () => exportCSV('payroll-' + m.key, rows.map(r => ({ name: r.staff.name, ...(r.saved || r.calc), paid: r.saved?.paid || 0 })), [['name', 'کارمند'], ['base', 'معاش'], ['absent_days', 'غیرحاضر'], ['unpaid_leave_min', 'رخصتی بدون معاش (دقیقه)'], ['deduction', 'کسر'], ['bonus', 'پاداش'], ['advances', 'برداشت'], ['carry_in', 'باقی ماه قبل'], ['net', 'قابل پرداخت'], ['paid', 'پرداخت شده']])
    });
    await load();
  }
};
function paySlipHTML(r, m) {
  const v = r.saved || r.calc;
  const row = (l, x, cls = '') => `<tr class="${cls}"><td>${l}</td><td style="text-align:left">${x}</td></tr>`;
  return `<div class="doc size-A5 plainDoc">${smallHead('فیش معاش — ' + m.label)}
    <div class="infoGrid" style="grid-template-columns:repeat(2,1fr)"><div>نام: <b>${esc(r.staff.name)}</b></div><div>وظیفه: <b>${esc(r.staff.position || '')}</b></div><div>ماه: <b>${esc(m.label)}</b></div><div>روز کاری / حاضر: <b>${v.work_days} / ${v.present_days}</b></div></div>
    <table class="rt">${row('معاش اصلی', money(v.base))}${row('کسر غیرحاضری و رخصتی بدون معاش', '− ' + money(v.deduction))}${row('اضافه‌کاری / پاداش', '+ ' + money(v.bonus))}${row('برداشت از معاش', '− ' + money(v.advances))}${row('باقی ماه قبل', money(v.carry_in))}${row('<b>قابل پرداخت</b>', '<b>' + money(v.net) + ' ' + currency() + '</b>')}${row('پرداخت شده', money(r.saved?.paid || 0))}${row('<b>باقی</b>', '<b>' + money(v.net - (r.saved?.paid || 0)) + '</b>')}</table>
    <div class="signRow" style="margin-top:14mm"><div>امضای کارمند</div><div>امضای مسئول</div></div></div>`;
}
