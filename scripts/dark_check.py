# Dark mode check: opens every page of every station in dark mode (new look and classic) and lists visible elements
# that still have a light background (a "dark and white mixture"). Printed documents are ignored.
# Usage: python3 scripts/dark_check.py http://localhost:8770 out_dir [ui]
import sys, os, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8770'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'scripts/out'
UIS = sys.argv[3].split(',') if len(sys.argv) > 3 else ['simple', 'classic']
os.makedirs(OUT, exist_ok=True)
USERS = [('admin', 'admin', '1234'), ('reception', 'reception', '1111'), ('doctor', 'dr.khatibi', '1111'), ('pharmacy', 'pharmacy', '1111'), ('stock', 'stock', '1111'), ('lab', 'lab', '1111')]
FIND = r"""() => {
  const lum = (c) => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/); if (!m) return null; if (m[4] !== undefined && Number(m[4]) < 0.5) return null; return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255; };
  const out = [];
  for (const el of document.querySelectorAll('#app *, #modals *')) {
    if (el.closest('.doc, .docPreview, #printArea, svg, canvas, img, .qrBox, .tubeLabel, .lhLogo')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 24 || r.height < 14) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const L = lum(cs.backgroundColor); if (L !== null && L > 0.72) out.push((el.id ? '#' + el.id : el.tagName.toLowerCase()) + '.' + String(el.className || '').split(' ').filter(Boolean).slice(0, 3).join('.') + ' bg=' + cs.backgroundColor);
    const T = lum(cs.color), B = L; if (T !== null && T < 0.35 && el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) out.push('DARKTEXT ' + el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.') + ' color=' + cs.color + ' «' + el.textContent.trim().slice(0, 20) + '»');
  }
  return [...new Set(out)].slice(0, 25);
}"""
report = {}
with sync_playwright() as p:
  b = p.chromium.launch()
  for ui in UIS:
    for st, user, pw in USERS:
      ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='fa-IR', color_scheme='dark')
      pg = ctx.new_page()
      pg.add_init_script(f"try {{ localStorage.setItem('acdb_theme', 'dark'); localStorage.setItem('acdb_ui_mode', '{ui}'); localStorage.setItem('acdb_motion', 'off'); }} catch (_) {{}}")
      pg.goto(f'{BASE}/?station={st}')
      pg.fill('#loginUser', user); pg.fill('#loginPass', pw); pg.click('#loginForm button[type=submit]')
      pg.wait_for_selector('#app:not(.hidden)', timeout=8000); pg.wait_for_timeout(600)
      pages = pg.evaluate("[...new Set([...document.querySelectorAll('#sidebar .navItem')].map(x => x.dataset.page))]")
      for page in pages:
        try:
          pg.evaluate(f"go('{page}')"); pg.wait_for_timeout(900)
          bad = pg.evaluate(FIND)
          if bad: report[f'{ui}/{st}/{page}'] = bad
          if page in ('lab-inbox', 'reception', 'attendance', 'payroll', 'encounter', 'pos', 'stock-dash', 'admin-dash', 'settings'):
            pg.screenshot(path=f'{OUT}/{ui}-{st}-{page}.png')
        except Exception as e:
          report[f'{ui}/{st}/{page}'] = ['ERROR ' + str(e)[:120]]
      ctx.close()
  b.close()
print(json.dumps(report, ensure_ascii=False, indent=1))
print('pages with problems:', len(report))
