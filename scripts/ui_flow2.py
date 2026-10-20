# Workflow test of the central cashier, laboratory reception, lab materials, beds, decision support, display and dark mode.
# Usage: python3 scripts/ui_flow2.py http://localhost:8770 out_dir
import sys, os, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8770'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'scripts/out'
os.makedirs(OUT, exist_ok=True)
errors, checks = [], []

def ok(cond, label):
  checks.append(('✓' if cond else '✗') + ' ' + label)
  if not cond: errors.append('check failed: ' + label)

def station(b, st, user, pw, dark=False):
  ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='fa-IR', color_scheme='dark' if dark else 'light')
  pg = ctx.new_page()
  pg.on('pageerror', lambda e: errors.append(f'[{st}] pageerror: {e}'))
  pg.on('console', lambda m: errors.append(f'[{st}] console: {m.text}') if m.type == 'error' else None)
  pg.add_init_script("window.print = () => { window.__printed = (window.__printed||0)+1; }; window.__dlg = true;")
  pg.goto(f'{BASE}/?station={st}')
  pg.fill('#loginUser', user); pg.fill('#loginPass', pw); pg.click('#loginForm button[type=submit]')
  pg.wait_for_selector('#app:not(.hidden)', timeout=8000); pg.wait_for_timeout(700)
  pg.evaluate("window.confirmDlg = async () => true")
  return ctx, pg

def shot(pg, name, full=False):
  pg.wait_for_timeout(450)
  if full: pg.add_style_tag(content='html,body{overflow:visible!important;height:auto!important} #app{height:auto!important} #view{overflow:visible!important} .stickyFoot{position:static!important}')
  pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def doc_shot(pg, name):
  el = pg.query_selector('.docPreview')
  if el: el.screenshot(path=f'{OUT}/{name}.png')

def api(pg, js):
  return pg.evaluate(f"(async()=>{{ {js} }})()")

with sync_playwright() as p:
  b = p.chromium.launch()

  # ---------------- admin: central cashier mode, lab print settings preview, materials
  ctx, ad = station(b, 'admin', 'admin', '1234')
  api(ad, "await API.post('/api/settings', { cashier_mode: 'central', lab_grid: 'grid', lab_patient_lang: 'fa', lab_font: 'Vazirmatn', lab_font_weight: 'normal', lab_section_align: 'center' }); await loadBootstrap(); return 1")
  ad.evaluate("go('settings')"); ad.wait_for_timeout(900); ad.click('#stT [data-t=lab]'); ad.wait_for_timeout(300); shot(ad, 'f2-01-settings-lab')
  ad.click('[data-act=labPrev]'); ad.wait_for_timeout(1200); doc_shot(ad, 'f2-02-lab-report-sample')
  ad.keyboard.press('Escape')
  ad.evaluate("go('setup')"); ad.wait_for_timeout(1200); shot(ad, 'f2-03-setup', True)
  ctx.close()

  # ---------------- lab: materials store + CBC uses 1 unit of reagent; edit HB normal range
  ctx, lb = station(b, 'lab', 'lab', '1111')
  item_id = api(lb, "const id = await API.save('lab_items', { name: 'CBC Reagent (Diluent)', unit: 'test', reorder_level: 5, cost: 12, active: 1 }); await API.post('/api/lab/items/move', { item_id: id, qty: 100, kind: 'in' }); return id")
  cbc = api(lb, "const c = await loadLabCatalog(true); return c.tests.find(t => t.code === 'CBC').id")
  api(lb, f"await API.post('/api/lab/test/save', {{ id: {cbc}, items: [{{ item_id: {item_id}, qty: 1 }}] }}); return 1")
  lb.evaluate("go('lab-items')"); lb.wait_for_timeout(1000); shot(lb, 'f2-04-lab-items')
  lb.evaluate("go('lab-tests')"); lb.wait_for_timeout(1000)
  lb.fill('#tq', 'HGB'); lb.wait_for_timeout(500)
  lb.click('#tb [data-act=edit]'); lb.wait_for_timeout(1000); shot(lb, 'f2-05-lab-test-edit')
  lb.keyboard.press('Escape')
  ctx.close()

  # ---------------- reception: child patient with age in years + months, height, doctor picker
  ctx, rc = station(b, 'reception', 'reception', '1111')
  rc.fill('#f_name', 'سهیل'); rc.fill('[name=father_name]', 'نجیب'); rc.fill('[data-age=rcAge] [data-a=y]', '2'); rc.fill('[data-age=rcAge] [data-a=m]', '4')
  rc.fill('[name=weight]', '12.5'); rc.fill('[name=height]', '88')
  rc.click('#rcDr .drPickBtn'); rc.wait_for_timeout(400); shot(rc, 'f2-06-doctor-picker')
  rc.click('#rcDr .drPickItem:has-text("عابدی")'); rc.wait_for_timeout(300)
  rc.click('[data-act=save]:not([data-print])'); rc.wait_for_timeout(1200)
  child = api(rc, "const r = await API.list('patients', { q: 'سهیل', limit: 1 }); return r[0]")
  ok(child and child['birth_date'], 'child patient saved with birth date ' + str(child and child['birth_date']))
  ok(api(rc, f"return ageLabel('{child['birth_date']}')").startswith('2'), 'age label for child: ' + api(rc, f"return ageLabel('{child['birth_date']}')"))
  ctx.close()

  # ---------------- doctor: allergy warning, interaction, ICD-10, lab request with CBC, call
  ctx, dr = station(b, 'doctor', 'dr.abedi', '1111')
  dr.click('#qW .qItem:last-child'); dr.wait_for_selector('#vit'); dr.wait_for_timeout(900)
  dr.fill('#ptMed [name=allergies]', 'Penicillin')
  for q in ['Amoxi', 'Cipro']:
    dr.fill('#medQ', q); dr.wait_for_timeout(800); dr.keyboard.press('Enter'); dr.wait_for_timeout(600)
  dr.fill('[name=diagnosis_code]', 'J06.9'); dr.dispatch_event('[name=diagnosis_code]', 'change'); dr.wait_for_timeout(200)
  dr.click('.testPick [data-tid]:has-text("CBC")'); dr.wait_for_timeout(300)
  cd = dr.evaluate("document.querySelector('#cdssRx')?.innerText || ''")
  ok('حساسیت' in cd, 'CDSS allergy warning shown: ' + cd[:120].replace('\n', ' | '))
  ok(dr.evaluate("document.querySelector('[name=diagnosis]').value") != '', 'ICD-10 code filled the diagnosis')
  shot(dr, 'f2-07-doctor-cdss', True)
  dr.click('.stickyFoot [data-act=save]:not([data-mode])'); dr.wait_for_timeout(1500)
  rxcode = dr.evaluate("document.querySelector('#savedBanner .rxCode')?.textContent")
  labcode = dr.evaluate("document.querySelectorAll('#savedBanner .rxCode')[1]?.textContent")
  ok(bool(rxcode) and bool(labcode), f'prescription {rxcode} and lab request {labcode} sent')
  ctx.close()

  # ---------------- pharmacy (central cashier): bill only
  ctx, ph = station(b, 'pharmacy', 'pharmacy', '1111')
  ph.evaluate("go('pos')"); ph.wait_for_timeout(600)
  ph.fill('#rxCode', rxcode); ph.keyboard.press('Enter'); ph.wait_for_timeout(1300)
  ok(ph.query_selector('#paid[type=hidden]') is not None, 'pharmacy POS hides the payment field in central mode')
  shot(ph, 'f2-08-pharmacy-central')
  ph.click('[data-act=sell]:not([data-print])'); ph.wait_for_timeout(1500)
  doc_shot(ph, 'f2-09-pharmacy-receipt-pay-at-reception')
  ok('صندوق' in (ph.evaluate("document.querySelector('.docPreview')?.innerText") or ''), 'pharmacy receipt says "pay at reception"')
  ctx.close()

  # ---------------- lab: central billing, department pages, Enter → next page, comment, sample + labels
  ctx, lb = station(b, 'lab', 'lab', '1111')
  lid = api(lb, f"const r = await API.get('/api/lab/req/{labcode}'); return r.id")
  lb.evaluate(f"go('lab-work', {{ id: {lid} }})"); lb.wait_for_timeout(1200); shot(lb, 'f2-10-lab-billing-central')
  lb.click('[data-act=receive]:not([data-print])'); lb.wait_for_timeout(1500)
  pages = lb.evaluate("document.querySelectorAll('.deptPage').length")
  first = lb.query_selector('.deptPage.on input[data-tid]:not([readonly])')
  if first:
    first.click()
    for v in ['10.5', '7.1', '4.2', '12.1', '38', '250']:
      lb.keyboard.type(v); lb.keyboard.press('Enter'); lb.wait_for_timeout(80)
  lb.click('.deptPage.on [data-cmt]'); lb.wait_for_timeout(200)
  lb.fill('.deptPage.on tr.cmtRow:not(.hidden) input[data-note]', 'نمونه همولایز بود — تکرار شود')
  shot(lb, 'f2-11-lab-results-pages', True)
  ok(pages >= 1, f'lab results split into {pages} department page(s)')
  lb.click('[data-act=sample]'); lb.wait_for_timeout(1200)
  lb.click('[data-act=labels]'); lb.wait_for_timeout(900); doc_shot(lb, 'f2-12-tube-labels'); lb.keyboard.press('Escape')
  lb.click('[data-act=saveRes][data-st=approved]'); lb.wait_for_timeout(1500)
  lb.click('[data-act=report]'); lb.wait_for_timeout(1500); doc_shot(lb, 'f2-13-lab-report-v2')
  rep = lb.evaluate("document.querySelector('.docPreview')?.innerText || ''")
  ok('همولایز' in rep, 'test comment printed on the report')
  stock = api(lb, f"const it = await API.get('/api/lab/items/{item_id}'); return it.stock")
  ok(stock == 99, f'CBC reagent consumed automatically (stock {stock})')
  ctx.close()

  # ---------------- reception: central cashier collects pharmacy + lab, lab registration, beds, day accounts
  ctx, rc = station(b, 'reception', 'reception', '1111')
  rc.evaluate("go('cashier')"); rc.wait_for_timeout(1200); shot(rc, 'f2-14-cashier')
  n_before = api(rc, "const d = await API.get('/api/cashier/pending'); return d.sales.length + d.labs.length")
  rc.click('#caTabs [data-t=sale]'); rc.wait_for_timeout(300)
  rc.click('#caList .billCard:first-child [data-pay]'); rc.wait_for_timeout(1000); shot(rc, 'f2-15-cashier-pay-sale')
  rc.click('#cpOk'); rc.wait_for_timeout(1500)
  rc.click('#caTabs [data-t=lab]'); rc.wait_for_timeout(300)
  rc.click('#caList .billCard:first-child [data-pay]'); rc.wait_for_timeout(1000); rc.click('#cpOk'); rc.wait_for_timeout(1500)
  n_after = api(rc, "const d = await API.get('/api/cashier/pending'); return d.sales.length + d.labs.length")
  ok(n_after == n_before - 2, f'cashier collected pharmacy + lab bills ({n_before} → {n_after})')
  # patient account
  rc.click('#caTabs [data-t=all]'); rc.wait_for_timeout(300)
  rc.click('#caList .billCard:first-child .grow'); rc.wait_for_timeout(1200); shot(rc, 'f2-16-patient-account'); rc.keyboard.press('Escape')
  # lab registration at reception (abbreviation chips)
  rc.evaluate("go('rc-lab')"); rc.wait_for_timeout(1200)
  rc.fill('#rlPt [name=full_name]', 'نسرین'); rc.fill('#rlPt [name=father_name]', 'قادر'); rc.select_option('#rlPt [name=sex]', 'F'); rc.fill('#rlPt [data-a=y]', '31')
  rc.fill('#rlQ', 'CBC'); rc.keyboard.press('Enter'); rc.fill('#rlQ', 'TSH'); rc.keyboard.press('Enter'); rc.wait_for_timeout(300)
  shot(rc, 'f2-17-rc-lab')
  rc.click('[data-act=save][data-print]'); rc.wait_for_timeout(1800)
  last = api(rc, "const r = await API.list('lab_requests', { limit: 1 }); return r[0]")
  ok(last['full_name'] == 'نسرین' and last['status'] == 'received' and abs(last['net'] - last['paid']) < 0.01, f"lab registered & paid at reception: {last['lab_code']} {last['status']} {last['paid']}/{last['net']}")
  stock = api(rc, f"return 0")
  # beds
  rc.evaluate("go('ipd')"); rc.wait_for_timeout(1000)
  rc.click('.bedCard[data-free]'); rc.wait_for_timeout(800)
  rc.fill('#adPt [name=full_name]', 'گل‌افروز'); rc.fill('#adPt [data-a=y]', '24'); rc.select_option('#adPt [name=sex]', 'F'); rc.fill('#adDx', 'Hyperemesis'); rc.fill('#adDep', '500')
  rc.click('#adOk'); rc.wait_for_timeout(1500); shot(rc, 'f2-18-ipd-board')
  rc.click('.bedCard.busy'); rc.wait_for_timeout(1000)
  rc.fill('#amCn', 'سیروم'); rc.fill('#amCa', '350'); rc.click('#amCadd'); rc.wait_for_timeout(900)
  shot(rc, 'f2-19-admission')
  rc.click('[data-a=discharge]'); rc.wait_for_timeout(1500); doc_shot(rc, 'f2-20-admission-bill')
  rc.keyboard.press('Escape'); rc.wait_for_timeout(300); rc.keyboard.press('Escape'); rc.wait_for_timeout(300)
  adm = api(rc, "const r = await API.list('admissions', { limit: 1 }); return r[0]")
  ok(adm['status'] == 'discharged' and adm['net'] >= 1350, f"admission discharged net {adm['net']} paid {adm['paid']}")
  # day accounts + cash close
  rc.evaluate("go('rc-cash')"); rc.wait_for_timeout(1500); shot(rc, 'f2-21-day-accounts', True)
  day = api(rc, "const d = await API.get('/api/cashier/day', { from: today() }); return d.totals")
  ok(day['lab'] > 0 and day['sale'] > 0 and day['admission'] > 0, f"day accounts include lab {day['lab']}, pharmacy {day['sale']}, beds {day['admission']}")
  rc.fill('#cClose [name=counted]', str(day['net'])); rc.click('[data-act=close]'); rc.wait_for_timeout(1000)
  # queue display + call
  rc.evaluate("go('qdisplay')"); rc.wait_for_timeout(1000); shot(rc, 'f2-22-qdisplay')
  token = rc.evaluate("API.token")
  ctx.close()

  ctx = b.new_context(viewport={'width': 1366, 'height': 768}, locale='fa-IR')
  tv = ctx.new_page(); tv.on('pageerror', lambda e: errors.append(f'[display] pageerror: {e}'))
  tv.add_init_script(f"localStorage.setItem('acdb_display_token', '{token}')")
  tv.goto(f'{BASE}/display.html'); tv.wait_for_timeout(1500); tv.screenshot(path=f'{OUT}/f2-23-display.png')
  vid = tv.evaluate("""(async()=>{ const r = await fetch('/api/list/visits?eq.status=waiting&limit=1', { headers: { Authorization: 'Bearer ' + localStorage.getItem('acdb_display_token') } }).then(r=>r.json()); return r.data[0]?.id })()""")
  if vid:
    tv.evaluate(f"fetch('/api/visits/call/{vid}', {{ method: 'POST', headers: {{ Authorization: 'Bearer ' + localStorage.getItem('acdb_display_token'), 'Content-Type': 'application/json' }}, body: '{{}}' }})")
    tv.wait_for_timeout(1500); tv.screenshot(path=f'{OUT}/f2-24-display-call.png')
    ok(tv.evaluate("!document.querySelector('#call').classList.contains('hidden')"), 'display shows the called turn')
  ctx.close()

  # ---------------- dark mode screenshots
  for st, u, pw, pg_ in [('reception', 'reception', '1111', 'cashier'), ('lab', 'lab', '1111', 'lab-inbox'), ('doctor', 'dr.abedi', '1111', 'dr-queue')]:
    ctx, d = station(b, st, u, pw, dark=True)
    d.evaluate(f"go('{pg_}')"); d.wait_for_timeout(1200); shot(d, f'f2-25-dark-{st}')
    ok(d.evaluate("document.documentElement.dataset.theme") == 'dark', f'dark mode active at {st}')
    ctx.close()
  # ---------------- stock: reorder suggestions
  ctx, sk = station(b, 'stock', 'stock', '1111')
  sk.evaluate("go('reorder')"); sk.wait_for_timeout(1200); shot(sk, 'f2-26-reorder')
  sk.click('[data-act=factor]'); sk.wait_for_timeout(1200); shot(sk, 'f2-27-reorder-factor')
  ctx.close()
  b.close()
print('\n'.join(checks))
print(json.dumps(errors, ensure_ascii=False, indent=1)); print('errors', len(errors))
