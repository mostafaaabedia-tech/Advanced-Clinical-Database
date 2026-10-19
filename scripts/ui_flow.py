# Workflow test across stations (reception → doctor → pharmacy → lab) with screenshots of the printed documents.
import sys, os, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8770'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'scripts/out'
os.makedirs(OUT, exist_ok=True)
errors = []

def station(b, st, user, pw):
  ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='fa-IR')
  pg = ctx.new_page()
  pg.on('pageerror', lambda e: errors.append(f'[{st}] pageerror: {e}'))
  pg.on('console', lambda m: errors.append(f'[{st}] console: {m.text}') if m.type == 'error' else None)
  pg.add_init_script("window.print = () => { window.__printed = (window.__printed||0)+1; }")
  pg.goto(f'{BASE}/?station={st}')
  pg.fill('#loginUser', user); pg.fill('#loginPass', pw); pg.click('#loginForm button[type=submit]')
  pg.wait_for_selector('#app:not(.hidden)', timeout=8000); pg.wait_for_timeout(700)
  return ctx, pg

def shot(pg, name, full=False):
  pg.wait_for_timeout(500)
  if full: pg.add_style_tag(content='html,body{overflow:visible!important;height:auto!important} #app{height:auto!important} #view{overflow:visible!important} .stickyFoot{position:static!important}')
  pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)

with sync_playwright() as p:
  b = p.chromium.launch()
  # ---------------- reception: new patient + OPD visit
  ctx, rc = station(b, 'reception', 'reception', '1111')
  rc.fill('#f_name', 'رحیمه'); rc.fill('[name=father_name]', 'عبدالله'); rc.click('#sexChips [data-sex=F]'); rc.fill('[name=age_years]', '27'); rc.fill('[name=phone]', '0790000001')
  rc.click('#drChips [data-dr]:nth-child(2)')
  rc.click('[data-act=save]:not([data-print])'); rc.wait_for_timeout(1200)
  rc.evaluate("go('visits')"); rc.wait_for_timeout(1000); shot(rc, 'flow-01-reception-queue')
  rc.click('#vBody tr:last-child [data-act=menu]'); rc.wait_for_timeout(500)
  rc.click('[data-a=print]'); rc.wait_for_timeout(500)
  html = rc.evaluate("visitReceiptHTML(App._lastV || {})") if False else None
  # receipt preview
  rc.keyboard.press('Escape')
  rc.evaluate("(async()=>{const r=await API.list('visits',{'eq.visit_date':today(),order:'id desc',limit:1}); previewDoc(visitReceiptHTML(r[0]),{size:'receipt'});})()"); rc.wait_for_timeout(900)
  shot(rc, 'flow-02-reception-receipt')
  ctx.close()

  # ---------------- doctor (Dr. Khatibi): encounter with prescription + lab
  ctx, dr = station(b, 'doctor', 'dr.khatibi', '1111')
  shot(dr, 'flow-03-doctor-queue')
  dr.click('#qW .qItem:last-child'); dr.wait_for_selector('#vit'); dr.wait_for_timeout(800)
  dr.fill('[name=bp_sys]', '118'); dr.fill('[name=bp_dia]', '76'); dr.fill('[name=pulse]', '84'); dr.fill('[name=temp]', '37.1'); dr.fill('[name=weight]', '62')
  dr.fill('[name=complaint]', 'درد زیر شکم و سوزش ادرار از سه روز'); dr.fill('[name=diagnosis]', 'Urinary tract infection (UTI)')
  for q in ['Cipro', 'Mefenamic']:
    dr.fill('#medQ', q); dr.wait_for_timeout(700); dr.keyboard.press('Enter'); dr.wait_for_timeout(500)
  rows = dr.query_selector_all('#rxRows .rxItem')
  dr.fill('#rxRows .rxItem[data-i="0"] [data-f=frequency]', 'روزانه دو بار'); dr.fill('#rxRows .rxItem[data-i="0"] [data-f=duration]', '5')
  dr.fill('#rxRows .rxItem[data-i="1"] [data-f=frequency]', 'روزانه سه بار'); dr.fill('#rxRows .rxItem[data-i="1"] [data-f=duration]', '3')
  dr.fill('#rxRows .rxItem[data-i="1"] [data-f=note]', 'در صورت درد')
  dr.fill('#medQ', 'Cranberry Extract'); dr.wait_for_timeout(700); dr.keyboard.press('Escape'); dr.keyboard.press('Enter'); dr.wait_for_timeout(500)
  dr.click('.testPick [data-tid]:has-text("URINE")'); dr.click('.testPick [data-tid]:has-text("CBC")')
  dr.fill('#rxDisc', '10'); dr.fill('#printNote', 'آب زیاد بنوشید'); dr.click('[data-nv="7"]')
  dr.check('[data-opt=diagnosis]'); dr.check('[data-opt=vitals]')
  shot(dr, 'flow-04-doctor-encounter', True)
  dr.click('.stickyFoot [data-act=save]:not([data-mode])'); dr.wait_for_timeout(1500)
  shot(dr, 'flow-05-doctor-saved')
  dr.click('[data-act=preview]'); dr.wait_for_timeout(1500)
  shot(dr, 'flow-06-prescription-print', False)
  el = dr.query_selector('.docPreview .doc')
  if el: el.screenshot(path=f'{OUT}/flow-06b-prescription-doc.png')
  rxcode = dr.evaluate("document.querySelector('#savedBanner .rxCode')?.textContent")
  print('rx code', rxcode)
  ctx.close()

  # ---------------- pharmacy: inbox → code → dispense
  ctx, ph = station(b, 'pharmacy', 'pharmacy', '1111')
  shot(ph, 'flow-07-pharmacy-inbox')
  ph.evaluate("go('pos')"); ph.wait_for_timeout(600)
  ph.fill('#rxCode', (rxcode or '').replace('RX-', '').lstrip('0')); ph.keyboard.press('Enter'); ph.wait_for_timeout(1200)
  shot(ph, 'flow-08-pharmacy-pos')
  ph.click('[data-act=sell]:not([data-print])'); ph.wait_for_timeout(1500)
  shot(ph, 'flow-09-pharmacy-receipts')
  ctx.close()

  # ---------------- lab: receive → results → approve → report
  ctx, lb = station(b, 'lab', 'lab', '1111')
  shot(lb, 'flow-10-lab-inbox')
  lb.click('#lb .rxCard:last-child'); lb.wait_for_timeout(1200)
  shot(lb, 'flow-11-lab-billing')
  lb.click('[data-act=receive]:not([data-print])'); lb.wait_for_timeout(1500)
  inputs = lb.query_selector_all('input[data-tid]:not([readonly])')
  vals = ['11.2', '4.3', '8.9', '34', '78', '26', '33', '210', '62', '30', '6', '2']
  for i, el in enumerate(inputs[:len(vals)]): el.fill(vals[i])
  for s in lb.query_selector_all('select[data-tid]')[:6]:
    opts = s.query_selector_all('option')
    if len(opts) > 1: s.select_option(index=1)
  shot(lb, 'flow-12-lab-results', True)
  lb.evaluate("window.confirmDlg = async () => true")
  lb.click('[data-act=saveRes][data-st=approved]'); lb.wait_for_timeout(1500)
  lb.click('[data-act=report]'); lb.wait_for_timeout(1500)
  el = lb.query_selector('.docPreview .doc')
  if el: el.screenshot(path=f'{OUT}/flow-13-lab-report.png')
  lb.keyboard.press('Escape'); lb.click('[data-act=receipt]'); lb.wait_for_timeout(800); shot(lb, 'flow-14-lab-receipts')
  ctx.close()

  # ---------------- stock: purchase dialog & monthly
  ctx, sk = station(b, 'stock', 'stock', '1111')
  sk.evaluate("go('purchases')"); sk.wait_for_timeout(1000); shot(sk, 'flow-15-purchases')
  sk.click('#pB tr.clickable:first-child'); sk.wait_for_timeout(1200); shot(sk, 'flow-16-purchase-open')
  sk.keyboard.press('Escape'); sk.evaluate("go('monthly')"); sk.wait_for_timeout(1500); shot(sk, 'flow-17-monthly', True)
  sk.evaluate("go('medicines')"); sk.wait_for_timeout(1200); shot(sk, 'flow-18-medicines')
  ctx.close()
  b.close()
print(json.dumps(errors, ensure_ascii=False, indent=1)); print('errors', len(errors))
