/* v1.6: every station is its own program (the admin panel exists only in the admin program),
   one page to switch every function / page / tab / button on and off, a nicer admin panel,
   a narrow menu, menu search in Ctrl+K and automatic lock after being idle. */
'use strict';

// ---------------------------------------------------------------- functions that can be switched on / off
// [key, label, help, default]
const FEATURES = [
  ['عمومی و امنیت', 'shield', [
    ['station_lock', 'هر برنامه فقط کاربران بخش خودش', 'کاربر لابراتوار فقط در برنامه لابراتوار وارد می‌شود، کاربر پذیرش فقط در پذیرش و…', '1'],
    ['station_lock_admin', 'مدیر فقط در برنامه مدیریت', 'با نام و رمز مدیر در برنامه بخش‌های دیگر نمی‌توان وارد شد. اگر خاموش شود، مدیر در آن برنامه فقط همان بخش را می‌بیند، نه پنل مدیریت را.', '1'],
    ['auto_backup', 'پشتیبان خودکار روزانه', 'هر روز یک کاپی از دیتابیس روی کمپیوتر سرور ذخیره می‌شود.', '1'],
    ['dash_hero', 'سرصفحه رنگی داشبورد مدیریت', 'سلام، تاریخ، ایستگاه‌های آنلاین و دکمه‌های میان‌بر بالای داشبورد.', '1']
  ]],
  ['داکتر و نسخه', 'steth', [
    ['cdss_enabled', 'هشدار حساسیت، تداخل دوا و آزمایش تکراری', 'هنگام نوشتن نسخه به داکتر هشدار می‌دهد.', '1'],
    ['rx_watermark', 'لوگوی کمرنگ وسط نسخه', '', '1']
  ]],
  ['دواخانه و انبار', 'pill', [
    ['allow_negative_stock', 'اجازه فروش بیشتر از موجودی', 'اگر خاموش باشد دوایی که موجودی ندارد فروخته نمی‌شود.', '0']
  ]],
  ['لابراتوار', 'flask', [
    ['lab_report_qr', 'QR تأیید اصالت روی راپور', '', '0'],
    ['lab_autoverify', 'تأیید خودکار نتایج نارمل', 'وقتی همه نتایج نارمل است بدون تأیید دستی نهایی می‌شود.', '0'],
    ['lab_delta_on', 'هشدار تغییر زیاد از جواب قبلی (Delta)', '', '0'],
    ['lab_critical_dialog', 'فورم خبر دادن نتیجه بحرانی', 'بعد از نتیجه بحرانی می‌پرسد به چه کسی خبر داده شد.', '0'],
    ['lab_warn_repeat_day', 'هشدار آزمایش تکراری در یک روز', '', '1'],
    ['lab_warn_dup_tazkira', 'اخطار نمبر تذکره تکراری', '', '1'],
    ['lab_discount_reason_required', 'الزام نوشتن دلیل تخفیف', '', '0'],
    ['lab_lock_approved', 'قفل نتایج تأیید شده', 'نتیجه تأیید شده بدون «باز کردن» تغییر نمی‌کند.', '1'],
    ['lab_show_signature', 'جای امضا روی راپور', '', '1'],
    ['lab_arrows', 'فلش ▲▼ کنار نتیجه غیر نارمل', '', '1']
  ]]
];
const featOn = (key, def) => { const v = App.settings[key]; return v == null || v === '' ? def === '1' : v === '1'; };

Pages.features = {
  async render(view, params) {
    const tab = params.tab || 'fn';
    view.innerHTML = `<div class="pageHead"><div><h1>قابلیت‌ها و بخش‌ها</h1><p>هر چیزی را که لازم ندارید خاموش کنید تا برنامه ساده‌تر شود؛ هر وقت خواستید از همین‌جا دوباره روشن کنید. چیزی پاک نمی‌شود.</p></div></div>
      <div class="tabs" id="ftT"><button data-t="fn" class="${tab === 'fn' ? 'on' : ''}">${icon('check', 14)} قابلیت‌ها</button><button data-t="menu" class="${tab === 'menu' ? 'on' : ''}">${icon('list', 14)} صفحه‌های هر ایستگاه و داخل صفحه‌ها</button></div>
      <div id="ftB"></div>`;
    const body = $('#ftB', view);
    const draw = (t) => {
      $$('#ftT button', view).forEach(b => b.classList.toggle('on', b.dataset.t === t));
      if (t === 'fn') {
        body.innerHTML = `<div class="featGrid">${FEATURES.map(([g, ic, list]) => `<div class="card"><h2>${icon(ic, 16)} ${esc(g)}</h2>${list.map(([k, l, h, d]) => `<label class="swRow"><span><b>${esc(l)}</b>${h ? `<small>${esc(h)}</small>` : ''}</span><input type="checkbox" class="sw" data-k="${k}" data-d="${d}" ${featOn(k, d) ? 'checked' : ''}></label>`).join('')}</div>`).join('')}
          <div class="card"><h2>${icon('clock', 16)} قفل خودکار و هشدار کمبود</h2>
            <label class="swRow"><span><b>قفل خودکار بعد از بی‌کاری (دقیقه)</b><small>اگر کسی این مدت با برنامه کار نکند، خودش خارج می‌شود و رمز می‌خواهد. صفر = خاموش.</small></span><input type="number" min="0" max="600" class="numIn" data-num="idle_logout_min" value="${esc(App.settings.idle_logout_min || '0')}"></label>
            <label class="swRow"><span><b>هشدار کمبود از چند عدد</b><small>وقتی موجودی دوا یا مواد لابراتوار به این عدد برسد هشدار می‌دهد.</small></span><input type="number" min="0" max="1000" class="numIn" data-num="low_stock_alert" value="${esc(App.settings.low_stock_alert || '3')}"></label>
          </div></div>`;
      } else {
        body.innerHTML = `<div class="card"><div class="bar" style="margin-bottom:10px"><button class="btn primary" id="ftSave">${icon('check', 14)} ذخیره منوها</button><span class="muted small">دکمه «داخل صفحه» همان صفحه را باز می‌کند تا تب‌ها، دکمه‌ها، عددها و چارت‌هایش را پنهان یا جابجا کنید.</span></div>${navSettingsHTML()}</div>`;
        bindNavSettings(body);
        $('#ftSave', body).onclick = async () => {
          try { const v = $('#navCfgIn', body).value; await API.post('/api/settings', { nav_config: v }); App.settings.nav_config = v; renderNav(); V16.afterNav(); $$('#sidebar .navItem').forEach(b => b.classList.toggle('on', b.dataset.page === 'features')); toast('منوها ذخیره شد', 'good'); } catch (e) { errToast(e); }
        };
      }
    };
    $('#ftT', view).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) draw(b.dataset.t); };
    body.addEventListener('change', async (e) => {
      const sw = e.target.closest('.sw[data-k]'), num = e.target.closest('[data-num]'); if (!sw && !num) return;
      const k = sw ? sw.dataset.k : num.dataset.num, v = sw ? (sw.checked ? '1' : '0') : String(Math.max(0, Number(num.value) || 0));
      try { await API.post('/api/settings', { [k]: v }); App.settings[k] = v; toast(sw ? (sw.checked ? 'روشن شد' : 'خاموش شد') : 'ذخیره شد', 'good'); }
      catch (err) { errToast(err); if (sw) sw.checked = !sw.checked; }
    });
    draw(tab);
  }
};

// ---------------------------------------------------------------- shell additions
const V16 = {
  started: false, last: Date.now(),
  start() {
    this.last = Date.now();
    // narrow menu (icons only) — remembered on this computer
    if (!$('#navToggle')) {
      const b = document.createElement('button'); b.className = 'topBtn'; b.id = 'navToggle'; b.title = 'باریک / پهن کردن منو'; b.innerHTML = icon('list', 16);
      b.onclick = () => { const m = !document.documentElement.classList.contains('navMini'); document.documentElement.classList.toggle('navMini', m); localSet('nav_mini', m ? '1' : '0'); };
      $('#topbar .brand').prepend(b);
    }
    document.documentElement.classList.toggle('navMini', localGet('nav_mini', '0') === '1');
    this.afterNav();
    if (this.started) return; this.started = true;
    // menu groups of the admin panel fold / unfold
    $('#sidebar').addEventListener('click', (e) => {
      const g = e.target.closest('.navGroup'); if (!g || !g.textContent.trim()) return;
      const f = new Set(JSON.parse(localGet('nav_fold', '[]'))); const k = g.textContent.trim(); f.has(k) ? f.delete(k) : f.add(k); localSet('nav_fold', JSON.stringify([...f])); this.afterNav();
    });
    // automatic lock after being idle (Settings → functions)
    const touch = () => { this.last = Date.now(); };
    ['mousedown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, touch, true));
    setInterval(() => {
      const min = Number(App.settings.idle_logout_min || 0); if (!App.user || !min) return;
      if (Date.now() - this.last > min * 60000) { logout().then(() => { $('#loginErr').textContent = 'برنامه به خاطر بی‌کاری قفل شد؛ دوباره وارد شوید.'; }); }
    }, 20000);
  },
  afterNav() {
    let f; try { f = new Set(JSON.parse(localGet('nav_fold', '[]'))); } catch (_) { f = new Set(); }
    let fold = false;
    for (const el of $('#sidebar').children) {
      if (el.classList.contains('navGroup')) { fold = !!el.textContent.trim() && f.has(el.textContent.trim()); el.classList.toggle('folded', fold); el.classList.toggle('canFold', !!el.textContent.trim()); }
      else if (el.classList.contains('navItem')) el.classList.toggle('navFolded', fold && !el.classList.contains('on'));
    }
  }
};

// ---------------------------------------------------------------- admin dashboard: header with greeting, stations and shortcuts
(() => {
  const P = Pages['admin-dash']; if (!P) return; const orig = P.render;
  P.render = async function (view, params) {
    await orig.call(this, view, params);
    if (!featOn('dash_hero', '1')) return;
    let net = { clients: [] }; try { net = await API.get('/api/network'); } catch (_) { }
    const on = (st) => net.clients.some(c => c.station === st);
    const h = new Date().getHours(); const hi = h < 12 ? 'صبح بخیر' : h < 17 ? 'روز بخیر' : 'شب بخیر';
    const quick = [['users', 'users', 'کاربران'], ['features', 'eye', 'قابلیت‌ها'], ['settings', 'settings', 'تنظیمات'], ['rc-cash', 'money', 'حسابات روز'], ['backup', 'database', 'پشتیبان'], ['network', 'network', 'شبکه']].filter(q => canSee(q[0]));
    const hero = document.createElement('div'); hero.className = 'admHero';
    hero.innerHTML = `<div class="admHi"><small>${hi}، ${esc(App.user.full_name || App.user.username)}</small><h1>${esc($('#brandName').textContent)}</h1><p>${esc(fmtDate(today()))} · ${net.clients.length} کمپیوتر وصل</p>
        <div class="admSt">${Object.keys(STATIONS).map(s => `<span class="${on(s) ? 'on' : ''}" title="${on(s) ? 'وصل' : 'آفلاین'}"><i></i>${esc(STATIONS[s].short)}</span>`).join('')}</div></div>
      <div class="admQuick">${quick.map(q => `<button type="button" data-go="${q[0]}">${icon(q[1], 20)}<span>${q[2]}</span></button>`).join('')}</div>`;
    const head = $('.pageHead', view); if (head) { head.classList.add('admHeadHidden'); head.after(hero); } else view.prepend(hero);
    const title = (el, t) => { if (el && !el.previousElementSibling?.classList.contains('admSec')) el.insertAdjacentHTML('beforebegin', `<div class="admSec">${t}</div>`); };
    title($('#k1', view), 'امروز'); title($('#k2', view), 'این ماه'); title($('#k2', view)?.nextElementSibling, 'وضعیت همین حالا');
  };
})();
