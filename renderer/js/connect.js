'use strict';
(function () {
  const q = new URLSearchParams(location.search);
  const names = { admin: 'مدیریت', stock: 'انبار و حسابات', reception: 'پذیرش و نوبت', doctor: 'داکتر', pharmacy: 'دواخانه', lab: 'لابراتوار' };
  const colors = { admin: '#0f4c81', stock: '#5b3cc4', reception: '#04704f', doctor: '#0b5e8e', pharmacy: '#0e6b75', lab: '#9a4d0b' };
  const st = q.get('station') || (window.native && window.native.station) || '';
  const $ = (s) => document.querySelector(s);
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  try { const m = localStorage.getItem('acdb_theme') || 'auto'; document.documentElement.dataset.theme = m === 'dark' || (m === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; } catch (_) { }
  $('#st').textContent = 'ایستگاه: ' + (names[st] || st);
  if (colors[st]) { document.documentElement.style.setProperty('--brand', colors[st]); document.documentElement.style.setProperty('--brand-2', colors[st]); }
  if (q.get('msg')) { $('#msg').textContent = q.get('msg'); $('#msg').classList.remove('hidden'); }
  $('#url').value = (q.get('server') || '').replace(/^https?:\/\//, '');
  const connect = async (u) => {
    $('#err').textContent = ''; $('#go').disabled = true;
    try { await window.native.connect(u); } catch (e) { $('#err').textContent = String(e.message || e).replace(/^Error.*?: /, ''); }
    $('#go').disabled = false;
  };
  $('#go').onclick = () => connect($('#url').value);
  $('#url').addEventListener('keydown', (e) => { if (e.key === 'Enter') connect($('#url').value); });
  const scan = async () => {
    try {
      const list = await window.native.discover();
      $('#list').innerHTML = list.length ? list.map((s, i) => `<div class="selRow" style="cursor:pointer" data-u="${esc(s.url)}"><b style="flex:1">${esc(s.name || 'Clinic server')}</b><span class="ltr muted">${esc(s.url.replace('http://', ''))}</span><span class="muted">${esc(s.host || '')}</span><button class="btn sm primary">اتصال</button></div>`).join('')
        : '<div class="empty" style="padding:14px">سروری پیدا نشد — مطمئن شوید برنامه مدیر روشن است و هر دو کمپیوتر در یک شبکه هستند.</div>';
      document.querySelectorAll('[data-u]').forEach(el => el.onclick = () => connect(el.dataset.u));
    } catch (e) { }
  };
  scan(); setInterval(scan, 4000);
})();
