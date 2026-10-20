/* Waiting-room display (TV): current and next turn of every doctor; a called turn is shown large with a chime. */
'use strict';
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let token = ''; try { token = localStorage.getItem('acdb_display_token') || localStorage.getItem('acdb_token') || ''; } catch (_) { }
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({ ok: false, error: 'خطا' }));
    if (!j.ok) { const e = new Error(j.error || 'خطا'); e.status = r.status; throw e; }
    return j.data;
  };
  const MONTHS = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];
  const WD = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  const sp = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' });
  const fa = { format: (d) => { const p = sp.formatToParts(d); const g = (k) => Number((p.find(x => x.type === k) || {}).value); return `${WD[d.getDay()]} ${g('day')} ${MONTHS[g('month') - 1] || ''} ${g('year')}`; } };
  const faT = { format: (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
  let clinic = '', groups = [], audio = null, hideT = null, es = null;

  function chime() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      [[659, 0], [523, .42], [659, 1.4], [523, 1.82]].forEach(([f, d]) => {
        const o = audio.createOscillator(), g = audio.createGain(); o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audio.destination);
        const t = audio.currentTime + d; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + .03); g.gain.exponentialRampToValueAtTime(0.0001, t + .9); o.start(t); o.stop(t + .95);
      });
    } catch (_) { }
  }
  function speak(c) {
    try {
      if (!window.speechSynthesis) return;
      const v = speechSynthesis.getVoices().find(x => /^fa/i.test(x.lang));
      if (!v) return;                                  // no Persian voice on this computer: chime only
      const u = new SpeechSynthesisUtterance(`نوبت ${c.turn}. ${c.name || ''}. ${c.room ? 'اطاق ' + c.room : c.doctor}`); u.voice = v; u.lang = v.lang; u.rate = .9;
      setTimeout(() => speechSynthesis.speak(u), 2300);
    } catch (_) { }
  }
  function showCall(c) {
    const el = $('#call'); if (!el) return;
    el.innerHTML = `<div class="box"><small>نمبر نوبت</small><b>${esc(c.turn)}</b><div>${esc(c.name || '')}</div><div class="rm">${esc(c.doctor || '')}${c.room ? ' — اطاق ' + esc(c.room) : ''}</div></div>`;
    el.classList.remove('hidden'); chime(); speak(c);
    clearTimeout(hideT); hideT = setTimeout(() => el.classList.add('hidden'), 9000);
    load();
  }
  function draw() {
    const g = $('#grid'); if (!g) return;
    g.innerHTML = groups.map(x => `<div class="dCard"><div><h2>${esc(x.title)}</h2>${x.room ? `<div class="room">اطاق ${esc(x.room)}</div>` : ''}</div>
      <div class="dNow ${x.current ? '' : 'none'}">${x.current ? `<small>نزد داکتر</small><b>${esc(x.current.turn)}</b><span>${esc(x.current.name)}</span>` : '<b>—</b>'}</div>
      <div class="dNext">${x.waiting.slice(0, 8).map(w => `<span>${esc(w.turn)}<em>${esc(w.name)}</em></span>`).join('') || '<span style="opacity:.5">کسی منتظر نیست</span>'}</div></div>`).join('') || '<div class="dEmpty">به کلینیک خوش آمدید 🌿</div>';
  }
  async function load() {
    try { const r = await api('GET', '/api/queue/display'); groups = r.groups; if (r.clinic && r.clinic !== clinic) { clinic = r.clinic; const h = $('#cName'); if (h) h.textContent = clinic; } draw(); }
    catch (e) { if (e.status === 401) { token = ''; try { localStorage.removeItem('acdb_display_token'); } catch (_) { } login(); } }
  }
  function tick() { const d = new Date(); const c = $('#clk'); if (c) c.innerHTML = `<b>${faT.format(d)}</b>${fa.format(d)}`; }
  function connect() {
    try { es && es.close(); } catch (_) { }
    es = new EventSource(`/api/events?token=${encodeURIComponent(token)}&station=display`);
    es.addEventListener('msg', (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } if (m.type === 'queue:call') showCall(m.data); else if (/^visit/.test(m.type)) load(); else if (m.type === 'reload') location.reload(); });
  }
  function board() {
    $('#root').innerHTML = `<div class="dHead"><img src="img/logo.png" alt=""><h1 id="cName">${esc(clinic || 'کلینیک')}</h1><div class="clk" id="clk"></div></div>
      <div class="dGrid" id="grid"></div><div class="dFoot"><span>لطفاً با اعلام نمبر نوبت خود به اطاق داکتر مراجعه کنید.</span><span>از صبر و همکاری شما سپاسگزاریم</span></div>
      <div class="dCall hidden" id="call"></div><button class="dSound" id="snd">🔊 برای فعال شدن صدا اینجا کلیک کنید</button>`;
    $('#snd').onclick = () => { chime(); $('#snd').remove(); try { document.documentElement.requestFullscreen(); } catch (_) { } };
    document.addEventListener('dblclick', () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (_) { } });
    // Electron and many TVs allow sound without a click
    try { const t = new (window.AudioContext || window.webkitAudioContext)(); if (t.state === 'running') { audio = t; $('#snd').remove(); } } catch (_) { }
    tick(); setInterval(tick, 15000); load(); setInterval(load, 15000); connect();
  }
  function login() {
    $('#root').innerHTML = `<form class="dLogin" id="lf"><h2 style="margin:0">ورود صفحه نمایش نوبت</h2><input id="lu" placeholder="نام کاربری" autocomplete="username"><input id="lp" type="password" placeholder="رمز" autocomplete="current-password"><button>ورود</button><div id="le" style="color:#fca5a5"></div></form>`;
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api('POST', '/api/login', { username: $('#lu').value, password: $('#lp').value }); token = r.token; try { localStorage.setItem('acdb_display_token', token); } catch (_) { } board(); }
      catch (err) { $('#le').textContent = err.message; }
    };
  }
  if (window.speechSynthesis) try { speechSynthesis.getVoices(); } catch (_) { }
  token ? board() : login();
})();
