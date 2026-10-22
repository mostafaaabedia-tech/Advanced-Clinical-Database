# v1.5 laboratory requests of the lab (newborn / child / man / woman, earlier lab visits, answer codes, ✱ star,
# delete a wrong registration, profit per test, monthly material report, low-material warning, WhatsApp / Telegram,
# urine microscopy beside, doctor by number) and the reception being told about laboratory bills.
# Usage: python3 scripts/ui_flow7.py http://localhost:8770 out_dir
import sys, os, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8770'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'scripts/out'
os.makedirs(OUT, exist_ok=True)
errors, checks = [], []

def ok(cond, label):
  checks.append(('✓' if cond else '✗') + ' ' + label)
  if not cond: errors.append('check failed: ' + label)

def station(b, st, user, pw):
  ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='fa-IR')
  pg = ctx.new_page()
  pg.on('pageerror', lambda e: errors.append(f'[{st}] pageerror: {e}'))
  pg.on('console', lambda m: errors.append(f'[{st}] console: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
  pg.add_init_script("window.print = () => {}; window.open = (u) => { window.__opened = u; return null; }; try { localStorage.setItem('acdb_motion','off') } catch(_) {}")
  pg.goto(f'{BASE}/?station={st}')
  pg.fill('#loginUser', user); pg.fill('#loginPass', pw); pg.click('#loginForm button[type=submit]')
  pg.wait_for_selector('#app:not(.hidden)', timeout=8000); pg.wait_for_timeout(700)
  pg.evaluate("window.confirmDlg = async () => true")
  return ctx, pg

def shot(pg, name, full=False):
  pg.wait_for_timeout(500)
  pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def api(pg, js):
  return pg.evaluate(f"(async()=>{{ {js} }})()")

with sync_playwright() as p:
  b = p.chromium.launch()
  ctx, lb = station(b, 'lab', 'lab', '1111')
  # newborn / child / man / woman
  lb.evaluate("go('lab-walkin')"); lb.wait_for_timeout(1200)
  opts = lb.evaluate("[...document.querySelectorAll('#wPt [data-sexcat] option')].map(o => o.textContent)")
  ok(opts[:2] == ['نوزاد (پسر)', 'نوزاد (دختر)'] and 'آقا' in opts and 'خانم' in opts, f'patient groups: {opts}')
  lb.fill('#wPt [name=full_name]', 'Baby Test'); lb.fill('#wPt [data-a=d]', '10'); lb.dispatch_event('#wPt [data-a=d]', 'input'); lb.wait_for_timeout(200)
  ok(lb.evaluate("document.querySelector('#wPt [data-sexcat]').value") == 'nbM', 'age of 10 days selects newborn')
  lb.select_option('#wPt [data-sexcat]', 'nbF'); ok(lb.evaluate("document.querySelector('#wPt [name=sex]').value") == 'F', 'newborn girl sets the sex')
  # earlier lab visits of a known patient
  pid = api(lb, "const r = await API.list('lab_requests', { limit: 50 }); return r[0].patient_id")
  lb.evaluate(f"go('lab-walkin', {{ patient_id: {pid} }})"); lb.wait_for_timeout(1500)
  ok(lb.query_selector('.prevLabs') is not None, 'earlier laboratory visits of the patient shown')
  shot(lb, 'f7-01-walkin-history')
  # urine with answer codes and stars
  lb.click('#wt'); lb.keyboard.type('URINE'); lb.keyboard.press('Enter'); lb.wait_for_timeout(300)
  lb.click('[data-act=createRecv]:not([data-print])'); lb.wait_for_timeout(2000)
  lb.click('[data-act=starAll]'); lb.wait_for_timeout(200)
  ucol = api(lb, "const c = await loadLabCatalog(); return c.tests.find(t => t.code === 'UCOL').id")
  sel = f'[data-tid="{ucol}"]'
  lb.fill(sel, '2'); lb.focus(sel); lb.keyboard.press('Enter'); lb.wait_for_timeout(200)
  ok(lb.evaluate(f"document.querySelector('{sel}').value") == 'Yellow', 'answer code 2 → Yellow')
  lb.click('[data-act=saveRes][data-st=completed]'); lb.wait_for_timeout(1500)
  rid = lb.evaluate("App.params.id")
  html = api(lb, f"const r = await API.get('/api/lab/req/x', {{ id: {rid} }}); return labReportHTML(r)")
  ok('Yellow' in html and 'Microscopic Examination' not in html and '*' not in html.split('Yellow')[1][:200], 'starred tests are not on the report')
  shot(lb, 'f7-02-urine-codes')
  lb.click('[data-act=share]'); lb.wait_for_timeout(500); lb.fill('#shPh', '0700123456'); lb.click('#sh_wa'); lb.wait_for_timeout(300)
  ok('wa.me/93700123456' in (lb.evaluate("window.__opened") or ''), 'results sent to WhatsApp')
  lb.click('#sh_tg'); ok('t.me/share' in (lb.evaluate("window.__opened") or ''), 'results sent to Telegram')
  lb.evaluate("document.querySelectorAll('#modals .modalBack').forEach(m => m.remove())")
  # urine microscopy beside: fill RBC
  api(lb, f"const c = await loadLabCatalog(); const id = c.tests.find(t => t.code === 'URBC').id; await API.post('/api/lab/results/' + {rid}, {{ results: [{{ test_id: id, value: '0-2' }}], status: 'received' }}).catch(()=>0); return 1")
  html = api(lb, f"const r = await API.get('/api/lab/req/x', {{ id: {rid} }}); return labReportHTML(r)")
  ok('Microscopic Examination' in html, 'urine microscopy printed beside the physical / chemical part')
  # delete a wrong registration
  w = api(lb, "const c = await loadLabCatalog(); const t = c.tests.find(x => x.code === 'CBC'); const r = await API.post('/api/lab/walkin', { patient: { full_name: 'Wrong Entry', sex: 'M', age_years: 30 }, test_ids: [t.id] }); return r.id")
  lb.evaluate("go('lab-list')"); lb.wait_for_timeout(1200)
  lb.click(f'[data-lbdel="{w}"]'); lb.wait_for_timeout(900)
  ok(api(lb, f"try {{ await API.get('/api/lab/req/x', {{ id: {w} }}); return false; }} catch (e) {{ return true; }}"), 'wrong registration deleted')
  # profit per test, material report, low warning
  lb.evaluate("go('lab-sales')"); lb.wait_for_timeout(1300)
  ok('مفاد' in lb.evaluate("document.querySelector('#lsT').innerText"), 'profit per test')
  lb.evaluate("go('lab-items')"); lb.wait_for_timeout(1000); lb.click('[data-act=usage]'); lb.wait_for_timeout(1000)
  ok('اول دوره' in lb.evaluate("document.querySelector('#uB').innerText"), 'monthly material report with start and end')
  shot(lb, 'f7-03-material-report')
  lb.evaluate("document.querySelectorAll('#modals .modalBack').forEach(m => m.remove())")
  api(lb, "const it = (await API.list('lab_items', { limit: 5 }))[0]; await API.post('/api/lab/items/move', { item_id: it.id, kind: 'adjust', qty: -(it.stock - 1) }); return 1")
  lb.evaluate("go('lab-inbox')"); lb.wait_for_timeout(1200)
  ok(lb.query_selector('#lLow .warnBox') is not None, 'low materials warning on the lab inbox')
  shot(lb, 'f7-04-low-warning')
  # doctor picker by number
  lb.evaluate("go('lab-walkin')"); lb.wait_for_timeout(1000); lb.click('#wDr .drPickBtn'); lb.wait_for_timeout(200)
  did = lb.evaluate("App.doctors.find(d => d.active).id"); lb.fill('#wDr .drPickQ', str(did)); lb.wait_for_timeout(200)
  ok(lb.evaluate("document.querySelectorAll('#wDr .drPickItem').length") == 1, 'doctor found by number')
  ctx.close()
  b.close()
print('\n'.join(checks))
print(json.dumps(errors, ensure_ascii=False, indent=1)); print('errors', len(errors))
