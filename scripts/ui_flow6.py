# v1.5 workflow test: menus switched on/off per station, page layout editing (hide / move tabs and cards, chart type),
# lab walk-in with the discount on the same page, reception → laboratory referral and payment message, daily accounts
# print chooser, admin laboratory / pharmacy summaries, all withdrawals, header designer, clickable dashboard numbers,
# station-only login and the laboratory as before (no delta / critical dialog / QR by default).
# Usage: python3 scripts/ui_flow6.py http://localhost:8770 out_dir
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
  pg.add_init_script("window.print = () => { window.__printed = (window.__printed||0)+1; }; try { localStorage.setItem('acdb_motion','off') } catch(_) {}")
  pg.goto(f'{BASE}/?station={st}')
  pg.fill('#loginUser', user); pg.fill('#loginPass', pw); pg.click('#loginForm button[type=submit]')
  if expect_fail:
    pg.wait_for_timeout(1200); return ctx, pg
  pg.wait_for_selector('#app:not(.hidden)', timeout=8000); pg.wait_for_timeout(700)
  pg.evaluate("window.confirmDlg = async () => true")
  return ctx, pg

def shot(pg, name, full=False):
  pg.wait_for_timeout(500)
  if full: pg.add_style_tag(content='html,body{overflow:visible!important;height:auto!important} #app{height:auto!important} #view{overflow:visible!important} .stickyFoot{position:static!important}')
  pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def api(pg, js):
  return pg.evaluate(f"(async()=>{{ {js} }})()")

def close_modals(pg):
  pg.evaluate("document.querySelectorAll('#modals .modalBack').forEach(m => m.remove())")

with sync_playwright() as p:
  b = p.chromium.launch()

  # ---------------- station lock: the admin cannot open another station's program
  ctx, x = station(b, 'lab', 'admin', '1234', expect_fail=True)
  ok('اجازه ورود ندارد' in x.evaluate("document.getElementById('loginErr').textContent"), 'admin user cannot open the laboratory program')
  ctx.close()

  # ---------------- admin: smaller menu, settings → menus, layout editing, summaries
  ctx, ad = station(b, 'admin', 'admin', '1234')
  api(ad, "await API.post('/api/settings', { nav_config: '', page_layout: '' }); await loadBootstrap(); renderNav(); return 1")
  nav = ad.evaluate("[...document.querySelectorAll('#sidebar .navItem')].map(x => x.dataset.page)")
  ok('pos' not in nav and 'lab-inbox' not in nav and 'adm-lab' in nav and 'adm-pharmacy' in nav and 'cashier' in nav and 'all-wd' in nav, f'admin menu is reduced ({len(nav)} pages)')
  ok(len(nav) == len(set(nav)), 'no duplicated menu items')
  shot(ad, 'f6-01-admin-menu')
  ad.evaluate("go('settings')"); ad.wait_for_timeout(900); ad.click('#stT [data-t=menus]'); ad.wait_for_timeout(400)
  ad.click('#navRoles [data-role=pharmacy]'); ad.wait_for_timeout(300)
  ad.uncheck('.navCfgRow[data-p="ph-month"] [data-vis]'); ad.click('.navCfgRow[data-p="sales"] [data-mv="-1"]'); ad.wait_for_timeout(200)
  shot(ad, 'f6-02-settings-menus')
  ad.click('[data-act=save]'); ad.wait_for_timeout(1200)
  cfg = api(ad, "return JSON.parse(App.settings.nav_config || '{}').pharmacy")
  ok(cfg and 'ph-month' in cfg['hidden'], 'pharmacy menu item switched off in settings')
  # page layout: hide one KPI and one tab on the cash page, switch chart type on the dashboard
  ad.evaluate("go('admin-dash')"); ad.wait_for_timeout(1500)
  ad.click('#layoutBtn'); ad.wait_for_timeout(400)
  n_tools = ad.evaluate("document.querySelectorAll('.lyTools').length"); ok(n_tools > 5, f'layout tools shown on the page ({n_tools})')
  ad.evaluate("[...document.querySelectorAll('.card')].find(c => c.querySelector('canvas')).querySelector('.lyTools [data-lyt=chart]').click()"); ad.wait_for_timeout(300)
  ad.evaluate("document.querySelector('#k2 .kpi:nth-child(2) .lyTools [data-lyt=hide]').click()"); ad.wait_for_timeout(200)
  ad.evaluate("document.querySelector('#k1 .kpi:nth-child(2) .lyTools [data-lyt=up]').click()"); ad.wait_for_timeout(200)
  shot(ad, 'f6-03-layout-edit')
  ad.click('.lyBar [data-ly=save]'); ad.wait_for_timeout(1000)
  ad.evaluate("go('admin-dash')"); ad.wait_for_timeout(1500)
  hidden = ad.evaluate("getComputedStyle(document.querySelector('#k2 .kpi:nth-child(2)')).display")
  ok(hidden == 'none', 'hidden number box stays hidden after reload')
  first = ad.evaluate("document.querySelector('#k1 .kpi .lbl').textContent")
  ok('فیس' in first, f'moved box is first: {first}')
  typ = ad.evaluate("App.charts.find(c => c.canvas.id === 'c1').data.datasets[0].type")
  ok(typ == 'line', f'chart switched to lines ({typ})')
  shot(ad, 'f6-04-dashboard-arranged')
  ad.click('#k1 .kpi:nth-child(1)'); ad.wait_for_timeout(1200)
  ok(ad.query_selector('.modalBack table.t') is not None, 'click on a money box opens all amounts of that section')
  shot(ad, 'f6-05-kpi-details'); close_modals(ad)
  # settings: hidden parts can be shown again
  ad.evaluate("go('settings')"); ad.wait_for_timeout(900); ad.click('#stT [data-t=menus]'); ad.wait_for_timeout(300)
  ok(ad.evaluate("document.querySelectorAll('[data-lyshow]').length") >= 1, 'hidden parts listed in settings')
  ad.click('[data-lyshow]'); ad.wait_for_timeout(800)
  api(ad, "await API.post('/api/settings', { page_layout: '' }); return 1")
  ad.evaluate("go('adm-lab')"); ad.wait_for_timeout(1300); shot(ad, 'f6-06-admin-lab', True)
  ok(ad.evaluate("document.querySelectorAll('#alR tbody tr').length") >= 1, 'admin laboratory summary lists received tests')
  ad.evaluate("go('adm-pharmacy')"); ad.wait_for_timeout(1300); ad.click('#apP [data-p=month]'); ad.wait_for_timeout(900); shot(ad, 'f6-07-admin-pharmacy', True)
  ok(ad.evaluate("document.querySelectorAll('#apStock tbody tr').length") >= 1, 'admin pharmacy stock with shortage warnings')
  ad.evaluate("go('all-wd')"); ad.wait_for_timeout(1000); shot(ad, 'f6-08-all-withdrawals')
  # header designer
  ad.evaluate("go('headers')"); ad.wait_for_timeout(1000)
  ad.click('#hdT [data-ins=table3]'); ad.wait_for_timeout(200)
  ad.click('#hdE'); ad.keyboard.press('Control+End'); ad.keyboard.type('Tel: 0700 000 000')
  shot(ad, 'f6-09-header-designer')
  ad.click('[data-act=save]'); ad.wait_for_timeout(800)
  ok(bool(api(ad, "const h = await API.get('/api/headers'); return h.keys.hdr_rx")), 'prescription header saved')
  ad.click('[data-act=preview]'); ad.wait_for_timeout(900)
  el = ad.query_selector('.docPreview .doc')
  if el: el.screenshot(path=f'{OUT}/f6-10-header-preview.png')
  close_modals(ad)
  api(ad, "await API.post('/api/headers/save', { key: 'hdr_rx', html: '' }); return 1")
  ctx.close()

  # ---------------- reception: no lab reception; send a patient to the lab; daily accounts print chooser
  ctx, rc = station(b, 'reception', 'reception', '1111')
  nav = rc.evaluate("[...document.querySelectorAll('#sidebar .navItem')].map(x => x.dataset.page)")
  ok('rc-lab' not in nav and 'lab-setup' not in nav and 'all-wd' in nav, 'reception menu: lab reception removed, all withdrawals added')
  pid = api(rc, "const r = await API.list('patients', { limit: 5 }); return r[0].id")
  api(rc, f"await API.post('/api/lab/referral-cancel/0').catch(()=>0); return 1")
  rc.evaluate(f"API.get('/api/patient-basic/{pid}').then(p => referDialog(p))"); rc.wait_for_timeout(600)
  rc.fill('#rfN', 'CBC و قند خون'); shot(rc, 'f6-11-refer'); rc.click('#rf_ok'); rc.wait_for_timeout(900)
  rc.evaluate("go('rc-cash')"); rc.wait_for_timeout(1300)
  rc.click('#cSecPick [data-sec=lab]'); rc.wait_for_timeout(300)
  ok(rc.evaluate("document.querySelectorAll('#cK2 .kpi').length") == 1, 'daily accounts can show only the laboratory')
  shot(rc, 'f6-12-daily-lab-only', True)
  rc.click('[data-act=print]'); rc.wait_for_timeout(500); shot(rc, 'f6-13-print-chooser'); rc.click('#pp_ok'); rc.wait_for_timeout(900)
  txt = rc.evaluate("document.querySelector('.docPreview').innerText")
  ok('پرداخت‌ها' not in txt.split('\n')[0:3] and 'لیست همه پرداخت' not in txt and 'لابراتوار' in txt, 'printed sheet without the payments list, only chosen section')
  el = rc.query_selector('.docPreview .doc')
  if el: el.screenshot(path=f'{OUT}/f6-14-daily-print.png')
  close_modals(rc)
  ctx.close()

  # ---------------- laboratory: referral arrives; walk-in with discount on the same page; doctors' income charts
  ctx, lb = station(b, 'lab', 'lab', '1111')
  lb.evaluate("go('lab-inbox', { tab: 'ref' })"); lb.wait_for_timeout(1200)
  ok(lb.query_selector('[data-refgo]') is not None, 'patient sent from the reception is in the lab inbox')
  shot(lb, 'f6-15-lab-referrals')
  lb.click('[data-refgo]'); lb.wait_for_timeout(1500)
  lb.click('#wt'); lb.keyboard.type('CBC'); lb.keyboard.press('Enter'); lb.wait_for_timeout(300)
  lb.fill('#wPct', '10'); lb.dispatch_event('#wPct', 'input'); lb.wait_for_timeout(300)
  ok(lb.query_selector('#wPct') is not None and lb.query_selector('[data-act=createRecv]') is not None, 'discount is on the same page as the test prices')
  shot(lb, 'f6-16-walkin-discount')
  lb.click('[data-act=createRecv]:not([data-print])'); lb.wait_for_timeout(1800)
  st = lb.evaluate("document.querySelector('.pageHead .pill')?.textContent || ''")
  ok('پذیرش' in st or 'received' in st, f'registered and received in one step ({st})')
  left = api(lb, "const r = await API.get('/api/lab/referrals', { status: 'open' }); return r.length")
  ok(left == 0, 'referral marked done')
  lb.evaluate("go('lab-reports')"); lb.wait_for_timeout(1200); lb.click('#rpT [data-t=income]'); lb.wait_for_timeout(1800)
  ds = lb.evaluate("App.charts.map(c => c.data.datasets.length)")
  ok(len(ds) >= 2 and max(ds) >= 3, f'doctor income chart has separate income / discount / net series ({ds})')
  shot(lb, 'f6-17-doctor-income', True)
  nav = lb.evaluate("[...document.querySelectorAll('#sidebar .navItem')].map(x => x.dataset.page)")
  ok('lab-qc' not in nav and 'verify' not in nav, 'laboratory menu like before (QC / TAT / verify switched off)')
  ok(lb.evaluate("App.settings.lab_delta_on") != '1' and lb.evaluate("App.settings.lab_report_qr") != '1', 'delta check and QR are off by default')
  ctx.close()
  ctx, ad = station(b, 'admin', 'admin', '1234')
  ad.evaluate("(async()=>{ await API.post('/api/settings', { nav_config: '', page_layout: '' }); })()"); ad.wait_for_timeout(500)
  ctx.close()
  b.close()
print('\n'.join(checks))
print(json.dumps(errors, ensure_ascii=False, indent=1)); print('errors', len(errors))
