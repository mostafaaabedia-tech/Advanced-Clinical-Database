# v1.6 workflow test: every station is its own program (the admin sees only that section there, never the admin panel),
# the functions page (switches, menus, opening a page of another station to hide its buttons / tabs), the admin
# dashboard header, the narrow menu, folding menu groups, menu search and the automatic idle lock.
# Usage: python3 scripts/ui_flow8.py http://localhost:8770 out_dir
import sys, os, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8770'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'scripts/out'
os.makedirs(OUT, exist_ok=True)
errors, checks = [], []

def ok(cond, label):
  checks.append(('✓' if cond else '✗') + ' ' + label)
  if not cond: errors.append('check failed: ' + label)

def station(b, st, user, pw, expect_fail=False):
  ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='fa-IR')
  pg = ctx.new_page()
  pg.on('pageerror', lambda e: errors.append(f'[{st}] pageerror: {e}'))
  pg.on('console', lambda m: errors.append(f'[{st}] console: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
  pg.add_init_script("window.print = () => {}; try { localStorage.setItem('acdb_motion','off') } catch(_) {}")
  pg.goto(f'{BASE}/?station={st}')
  pg.fill('#loginUser', user); pg.fill('#loginPass', pw); pg.click('#loginForm button[type=submit]')
  if expect_fail:
    pg.wait_for_timeout(1200); return ctx, pg
  pg.wait_for_selector('#app:not(.hidden)', timeout=8000); pg.wait_for_timeout(800)
  pg.evaluate("window.confirmDlg = async () => true")
  return ctx, pg

def shot(pg, name):
  pg.wait_for_timeout(500); pg.screenshot(path=f'{OUT}/{name}.png')

def api(pg, js):
  return pg.evaluate(f"(async()=>{{ {js} }})()")

with sync_playwright() as p:
  b = p.chromium.launch()
  ctx, ad = station(b, 'admin', 'admin', '1234')
  api(ad, "await API.post('/api/settings', { nav_config: '', page_layout: '', station_lock_admin: '1', idle_logout_min: '0', dash_hero: '1' }); await loadBootstrap(); renderNav(); V16.afterNav(); return 1")
  ad.evaluate("go('admin-dash')"); ad.wait_for_timeout(1800)

  # ---- admin panel look
  ok(ad.evaluate("document.documentElement.dataset.view") == 'admin', 'admin program shows the admin panel')
  ok(ad.query_selector('.admHero') is not None and ad.evaluate("document.querySelectorAll('.admSec').length") == 3, 'dashboard header and section titles')
  ok(ad.evaluate("document.querySelectorAll('.admSt span').length") == 6, 'stations shown on the dashboard header')
  shot(ad, 'f8-01-admin-dashboard')
  ad.click('.admQuick [data-go=users]'); ad.wait_for_timeout(900)
  ok(ad.evaluate("App.page") == 'users', 'dashboard shortcut opens the page')
  # no menu label is broken in two lines
  tall = ad.evaluate("[...document.querySelectorAll('#sidebar .navItem')].filter(x => x.offsetHeight > 60).length")
  ok(tall == 0, 'menu items are one line each')
  # fold a group
  n0 = ad.evaluate("[...document.querySelectorAll('#sidebar .navItem')].filter(x => x.offsetParent).length")
  ad.evaluate("[...document.querySelectorAll('#sidebar .navGroup')].find(g => g.textContent.trim() === 'پذیرش').click()"); ad.wait_for_timeout(200)
  n1 = ad.evaluate("[...document.querySelectorAll('#sidebar .navItem')].filter(x => x.offsetParent).length")
  ok(n1 < n0, f'menu group folds ({n0} → {n1})')
  ad.evaluate("[...document.querySelectorAll('#sidebar .navGroup')].find(g => g.textContent.trim() === 'پذیرش').click()"); ad.wait_for_timeout(200)
  # narrow menu
  ad.click('#navToggle'); ad.wait_for_timeout(300)
  ok(ad.evaluate("document.querySelector('#sidebar').offsetWidth") < 80, 'narrow menu')
  shot(ad, 'f8-02-narrow-menu')
  ad.click('#navToggle'); ad.wait_for_timeout(300)
  ok(ad.evaluate("document.querySelector('#sidebar').offsetWidth") > 150, 'wide menu again')
  # menu search
  ad.fill('#globalSearch', 'پشتیبان'); ad.wait_for_timeout(900)
  ok('صفحه' in ad.evaluate("document.querySelector('#globalResults').innerText"), 'search finds pages of the menu')
  ad.evaluate("document.querySelector('#globalResults .ddItem').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))"); ad.wait_for_timeout(900)
  ok(ad.evaluate("App.page") == 'backup', 'search result opens the page')

  # ---- functions page
  ad.evaluate("go('features')"); ad.wait_for_timeout(900)
  n = ad.evaluate("document.querySelectorAll('.sw[data-k]').length"); ok(n >= 15, f'function switches ({n})')
  shot(ad, 'f8-03-functions')
  was = ad.evaluate("document.querySelector('.sw[data-k=lab_report_qr]').checked")
  ad.click('.sw[data-k=lab_report_qr]'); ad.wait_for_timeout(700)
  ok(api(ad, "const s = await API.get('/api/bootstrap'); return (s.settings || {}).lab_report_qr") == ('0' if was else '1'), 'switch saved at once')
  ad.click('.sw[data-k=lab_report_qr]'); ad.wait_for_timeout(700)
  # menus tab → open a laboratory page inside the admin program and hide one of its buttons
  ad.click('#ftT [data-t=menu]'); ad.wait_for_timeout(500)
  ad.click('#navRoles [data-role=lab]'); ad.wait_for_timeout(300)
  shot(ad, 'f8-04-menus')
  ad.click('.navCfgRow[data-p="lab-inbox"] [data-peek]'); ad.wait_for_timeout(1500)
  ok(ad.evaluate("App.page") == 'lab-inbox' and ad.evaluate("document.documentElement.classList.contains('lyEdit')"), 'page of another station opened in arrange mode')
  nb = ad.evaluate("document.querySelectorAll('#view .btn > .lyTools').length"); ok(nb >= 1, f'buttons can be hidden ({nb})')
  key = ad.evaluate("(() => { const b = [...document.querySelectorAll('#view .pageHead .btn')].find(x => x.querySelector('.lyTools')); b.querySelector('[data-lyt=hide]').click(); return b.dataset.lyKey; })()")
  shot(ad, 'f8-05-arrange-buttons')
  ad.click('.lyBar [data-ly=save]'); ad.wait_for_timeout(1000)
  ad.evaluate("go('users')"); ad.wait_for_timeout(600)
  ad.evaluate("go('lab-inbox')"); ad.wait_for_timeout(700)
  ok(ad.evaluate("App.page") != 'lab-inbox', 'the laboratory page is not part of the admin menu afterwards')

  # ---- laboratory program: button hidden; the admin cannot log in
  ctx2, lb = station(b, 'lab', 'lab', '1111')
  ok(lb.evaluate("document.documentElement.dataset.view") == 'lab', 'laboratory program shows the laboratory')
  disp = lb.evaluate(f"(() => {{ const b = document.querySelector('#view [data-ly-key=\"{key}\"]'); return b ? getComputedStyle(b).display : 'missing'; }})()")
  ok(disp == 'none', f'button hidden by the admin is hidden in the laboratory ({key}: {disp})')
  ok(lb.query_selector('#layoutBtn') is None, 'no arrange button outside the admin panel')
  ctx2.close()
  ctx3, x = station(b, 'lab', 'admin', '1234', expect_fail=True)
  ok('اجازه ورود ندارد' in x.evaluate("document.getElementById('loginErr').textContent"), 'admin name and password do not open the laboratory program')
  ctx3.close()
  # even when the admin is allowed there, he gets the laboratory only — never the admin panel
  api(ad, "await API.post('/api/settings', { station_lock_admin: '0' }); return 1")
  ctx4, al = station(b, 'lab', 'admin', '1234')
  nav = al.evaluate("[...document.querySelectorAll('#sidebar .navItem')].map(x => x.dataset.page)")
  ok('lab-inbox' in nav and not any(p in nav for p in ['admin-dash', 'users', 'settings', 'features', 'backup', 'cashier', 'pos']), f'admin in the laboratory program sees only the laboratory ({len(nav)} pages)')
  ok(al.evaluate("App.page") == 'lab-inbox' and al.query_selector('#layoutBtn') is None and al.query_selector('.admHero') is None, 'no admin panel in the laboratory program')
  al.evaluate("go('users')"); al.wait_for_timeout(700)
  ok(al.evaluate("App.page") != 'users', 'admin pages cannot be opened in the laboratory program')
  shot(al, 'f8-06-admin-in-lab-program')
  # a login made in one program is not taken over by another program
  tok = al.evaluate("API.token")
  pg2 = ctx4.new_page(); pg2.goto(f'{BASE}/?station=reception'); pg2.wait_for_timeout(1500)
  ok(pg2.evaluate("document.getElementById('app').classList.contains('hidden')"), 'another program asks for its own login')
  ctx4.close()

  # ---- idle lock
  api(ad, "await API.post('/api/settings', { station_lock_admin: '1', idle_logout_min: '1' }); App.settings.idle_logout_min = '1'; return 1")
  ad.evaluate("V16.last = Date.now() - 2 * 60000"); ad.wait_for_timeout(22000)
  ok(ad.evaluate("document.getElementById('app').classList.contains('hidden')") and 'بی‌کاری' in ad.evaluate("document.getElementById('loginErr').textContent"), 'program locks itself after being idle')
  ad.fill('#loginUser', 'admin'); ad.fill('#loginPass', '1234'); ad.click('#loginForm button[type=submit]'); ad.wait_for_timeout(1500)
  api(ad, "await API.post('/api/settings', { idle_logout_min: '0', page_layout: '', nav_config: '' }); return 1")
  ctx.close(); b.close()
print('\n'.join(checks))
print(json.dumps(errors, ensure_ascii=False, indent=1)); print('errors', len(errors))
