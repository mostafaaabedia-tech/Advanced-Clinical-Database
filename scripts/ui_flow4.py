# v1.3 workflow test: prescription pick-lists, drug search, English sig, selected dates, previous medicines,
# Persian typing in patient names, foldable test buttons, withdrawals by type, monthly account, doctors' daily turns.
# Usage: python3 scripts/ui_flow4.py http://localhost:8770 out_dir
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
  pg.on('console', lambda m: errors.append(f'[{st}] console: {m.text}') if m.type == 'error' else None)
  pg.add_init_script("window.print = () => { window.__printed = (window.__printed||0)+1; };")
  pg.goto(f'{BASE}/?station={st}')
  pg.fill('#loginUser', user); pg.fill('#loginPass', pw); pg.click('#loginForm button[type=submit]')
  pg.wait_for_selector('#app:not(.hidden)', timeout=8000); pg.wait_for_timeout(700)
  pg.evaluate("window.confirmDlg = async () => true")
  return ctx, pg

def shot(pg, name, full=False):
  pg.wait_for_timeout(450)
  if full: pg.add_style_tag(content='html,body{overflow:visible!important;height:auto!important} #app{height:auto!important} #view{overflow:visible!important} .stickyFoot{position:static!important}')
  pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def api(pg, js):
  return pg.evaluate(f"(async()=>{{ {js} }})()")

with sync_playwright() as p:
  b = p.chromium.launch()

  # ---------------- doctor
  ctx, dr = station(b, 'doctor', 'dr.khatibi', '1111')
  pid = api(dr, "const r = await API.list('patients', { limit: 50 }); return r[0].id")
  dr.evaluate(f"go('encounter', {{ patient_id: {pid} }})"); dr.wait_for_selector('#medQ'); dr.wait_for_timeout(800)
  dr.click('#medQ'); dr.keyboard.type('par'); dr.wait_for_timeout(900)
  n = dr.evaluate("document.querySelectorAll('.floatDD:not(.hidden) .ddItem').length")
  ok(n > 0, f'drug search shows the medicines ({n})'); shot(dr, 'f4-01-drug-search')
  dr.keyboard.press('Enter'); dr.wait_for_timeout(600)
  dr.click('#rxRows .rxItem[data-i="0"] [data-f=frequency]'); dr.wait_for_timeout(400)
  nf = dr.evaluate("document.querySelectorAll('.comboDD:not(.hidden) .ddItem').length")
  ok(nf >= 10, f'frequency list shows every option on click ({nf})'); shot(dr, 'f4-02-frequency-list')
  dr.click('.comboDD:not(.hidden) .ddItem:has-text("4 / day")'); dr.wait_for_timeout(400)
  dr.click('#rxRows .rxItem[data-i="0"] [data-f=unit]'); dr.wait_for_timeout(300)
  nu = dr.evaluate("document.querySelectorAll('.comboDD:not(.hidden) .ddItem').length"); ok(nu >= 8, f'unit list shows all units ({nu})')
  dr.keyboard.press('Escape')
  dr.click('#rxRows .rxItem[data-i="0"] [data-f=duration_unit]'); dr.wait_for_timeout(300); shot(dr, 'f4-03-duration-units')
  dr.click('.comboDD:not(.hidden) .ddItem:has-text("selected dates")'); dr.wait_for_timeout(600)
  dr.click('.modalBack [data-gap="2"]'); dr.wait_for_timeout(200); shot(dr, 'f4-04-dates'); dr.click('#rdOk'); dr.wait_for_timeout(500)
  sig = dr.evaluate("document.querySelector('#rxRows .rxItem[data-i=\"0\"] .sigPrev').textContent")
  ok('× 4 / day' in sig, 'English sig preview: ' + sig)
  dr.click('#medQ'); dr.keyboard.type('amox'); dr.wait_for_timeout(900); dr.keyboard.press('Enter'); dr.wait_for_timeout(500)
  dr.click('#rxRows .rxItem[data-i="1"] [data-f=frequency]'); dr.click('.comboDD:not(.hidden) .ddItem:has-text("3 / day")'); dr.wait_for_timeout(200)
  dr.fill('#rxRows .rxItem[data-i="1"] [data-f=note]', 'with plenty of water')
  dr.click('#hTabs [data-h=rx]'); dr.wait_for_timeout(400)
  shot(dr, 'f4-05-encounter', True)
  dr.evaluate("document.querySelector('#hTabs').scrollIntoView()"); shot(dr, 'f4-06-history-medicines')
  # fold the test buttons
  dr.click('[data-foldbtn=doctor]'); dr.wait_for_timeout(200)
  ok(dr.evaluate("getComputedStyle(document.querySelector('.pickWrap[data-fold=doctor] .pickBody')).display") == 'none', 'doctor test buttons can be hidden')
  dr.click('[data-foldbtn=doctor]')
  dr.click('.stickyFoot [data-act=save]:not([data-mode])'); dr.wait_for_timeout(1500)
  dr.click('[data-act=preview]'); dr.wait_for_timeout(1500)
  el = dr.query_selector('.docPreview .doc')
  if el: el.screenshot(path=f'{OUT}/f4-07-prescription.png')
  txt = dr.evaluate("document.querySelector('.docPreview')?.innerText || ''")
  ok('Dose × Frequency' in txt and '× 4 / day' in txt and 'After meal' in txt, 'prescription printed in English')
  ctx.close()

  # ---------------- reception: Persian typing with an English keyboard, foldable lab test buttons
  ctx, rc = station(b, 'reception', 'reception', '1111')
  rc.evaluate("go('reception')"); rc.wait_for_timeout(900)
  rc.click('#f_name'); rc.keyboard.type('lvdl hpln'); rc.wait_for_timeout(200)
  v = rc.evaluate("document.getElementById('f_name').value")
  ok(v == 'مریم احمد', 'Persian typed with English keys in the name: ' + v)
  rc.click('#ptForm [name=phone]'); rc.keyboard.type('0799'); ok(rc.evaluate("document.querySelector('#ptForm [name=phone]').value") == '0799', 'phone stays in digits')
  shot(rc, 'f4-08-reception-persian')
  rc.evaluate("go('rc-lab')"); rc.wait_for_timeout(1200)
  rc.click('[data-foldbtn=rclab]'); rc.wait_for_timeout(200); shot(rc, 'f4-09-rclab-folded')
  ok(rc.evaluate("getComputedStyle(document.querySelector('.pickWrap[data-fold=rclab] .pickBody')).display") == 'none', 'lab reception test buttons can be hidden')
  rc.click('[data-foldbtn=rclab]')
  rc.evaluate("go('all-wd')"); rc.wait_for_timeout(900)   # v1.5: all withdrawals in one page
  rc.click('[data-act=new]'); rc.wait_for_timeout(400)
  rc.select_option('#wdF [name=section]', 'lab'); rc.select_option('#wdKind', 'external'); rc.fill('#wdF [name=amount]', '300'); rc.fill('#wdF [name=person]', 'لابراتوار مرکزی'); rc.fill('#wdF [name=note]', 'Vitamin D ارسالی')
  shot(rc, 'f4-10-withdrawal-lab'); rc.click('#wd_ok'); rc.wait_for_timeout(900)
  rc.click('[data-act=new]'); rc.wait_for_timeout(300); rc.select_option('#wdF [name=section]', 'lab'); rc.select_option('#wdKind', 'personal'); rc.fill('#wdF [name=amount]', '500'); rc.click('#wd_ok'); rc.wait_for_timeout(900)
  shot(rc, 'f4-11-rc-withdrawals')
  ok('معاینات بیرونی' in rc.evaluate("document.querySelector('#wK').innerText"), 'reception withdrawals split: personal / external tests')
  rc.evaluate("go('rc-month')"); rc.wait_for_timeout(1200); shot(rc, 'f4-12-rc-month', True)
  rc.evaluate("go('dr-daily')"); rc.wait_for_timeout(1200); shot(rc, 'f4-13-doctor-daily', True)
  ok(rc.evaluate("document.querySelectorAll('#ddT tbody tr').length") >= 1, 'doctors daily turns listed')
  ctx.close()

  # ---------------- pharmacy: withdrawal for a factor
  ctx, ph = station(b, 'pharmacy', 'pharmacy', '1111')
  ph.evaluate("go('ph-wd')"); ph.wait_for_timeout(900)
  ph.click('[data-act=new]'); ph.wait_for_timeout(300); ph.select_option('#wdKind', 'factor'); ph.wait_for_timeout(800)
  nopt = ph.evaluate("document.querySelectorAll('#wdPur option').length")
  ok(nopt > 1, f'open factors offered ({nopt - 1})')
  if nopt > 1:
    ph.select_option('#wdPur', index=1); ph.wait_for_timeout(200); ph.fill('#wdF [name=amount]', '100')
  shot(ph, 'f4-14-withdrawal-factor'); ph.click('#wd_ok'); ph.wait_for_timeout(900)
  ph.click('[data-act=new]'); ph.wait_for_timeout(300); ph.select_option('#wdKind', 'person'); ph.fill('#wdF [name=person]', 'احمد (معاش)'); ph.fill('#wdF [name=amount]', '2000'); ph.click('#wd_ok'); ph.wait_for_timeout(900)
  shot(ph, 'f4-15-ph-withdrawals')
  ph.evaluate("go('ph-month')"); ph.wait_for_timeout(1200); shot(ph, 'f4-16-ph-month', True)
  ok('مبلغ فاکتورهای خرید' in ph.evaluate("document.body.innerText"), 'pharmacy monthly account: sales − factors − withdrawals')
  ctx.close()

  # ---------------- stock: monthly account of every section
  ctx, sk = station(b, 'stock', 'stock', '1111')
  sk.evaluate("go('month-account')"); sk.wait_for_timeout(1500); shot(sk, 'f4-17-month-account', True)
  ok('باقی کل ماه' in sk.evaluate("document.body.innerText"), 'monthly account with the total left')
  sk.evaluate("go('withdrawals')"); sk.wait_for_timeout(1000); shot(sk, 'f4-18-withdrawals-all')
  ctx.close()
  b.close()
print('\n'.join(checks))
print(json.dumps(errors, ensure_ascii=False, indent=1)); print('errors', len(errors))
