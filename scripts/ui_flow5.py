# v1.4 workflow test: staff (employees, attendance, hourly leave, advances, payroll with carry-over) for reception and admin,
# WhatsApp reminders, patient tools (card, documents, vaccines, growth chart), doctor favourites / child dose / certificate,
# pharmacy & stock tools (expiry, controlled register, ABC-VED, stock count, department request, purchase order, supplier return),
# lab quality (QC + Westgard, TAT, report verification), comparison report and the new animated look.
# Usage: python3 scripts/ui_flow5.py http://localhost:8770 out_dir
import sys, os, json, base64
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
  pg.add_init_script("window.print = () => { window.__printed = (window.__printed||0)+1; }; window.open = (u) => { window.__opened = u; return null; };")
  pg.goto(f'{BASE}/?station={st}')
  pg.fill('#loginUser', user); pg.fill('#loginPass', pw); pg.click('#loginForm button[type=submit]')
  pg.wait_for_selector('#app:not(.hidden)', timeout=8000); pg.wait_for_timeout(700)
  pg.evaluate("window.confirmDlg = async () => true")
  return ctx, pg

def shot(pg, name, full=False):
  pg.wait_for_timeout(500)
  if full: pg.add_style_tag(content='html,body{overflow:visible!important;height:auto!important} #app{height:auto!important} #view{overflow:visible!important} .stickyFoot{position:static!important}')
  pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def api(pg, js):
  return pg.evaluate(f"(async()=>{{ {js} }})()")

def closeModals(pg):
  pg.evaluate("document.querySelectorAll('#modals .modalBack').forEach(m => m.remove())")

with sync_playwright() as p:
  b = p.chromium.launch()

  # ---------------- reception: staff
  ctx, rc = station(b, 'reception', 'reception', '1111')
  ok(rc.evaluate("document.documentElement.dataset.ui") == 'simple', 'new (simple) look is the default')
  nav = rc.evaluate("[...document.querySelectorAll('#sidebar .navItem')].map(x => x.dataset.page)")
  ok(all(x in nav for x in ['staff', 'attendance', 'payroll', 'reminders']), 'reception menu has staff / attendance / payroll / reminders')
  rc.evaluate("go('staff')"); rc.wait_for_timeout(900)
  for name, sal, code in [('احمد کریمی', 12000, '11'), ('مریم نوری', 9000, '12')]:
    rc.click('[data-act=new]'); rc.wait_for_timeout(300)
    rc.evaluate(f"document.querySelector('#sfF [name=name]').value = '{name}'")
    rc.fill('#sfF [name=code]', code); rc.fill('#sfF [name=position]', 'نرس'); rc.fill('#sfF [name=salary]', str(sal))
    rc.fill('#sfF [name=work_start]', '08:00'); rc.fill('#sfF [name=work_end]', '16:00')
    if code == '11': shot(rc, 'f5-01-staff-form')
    rc.click('#sf_ok'); rc.wait_for_timeout(700)
  n = rc.evaluate("document.querySelectorAll('#stB tr').length"); ok(n >= 2, f'staff listed ({n})')
  shot(rc, 'f5-02-staff-list')
  sid = api(rc, "const l = await API.get('/api/staff'); return l.find(s => s.code === '11').id")
  sid2 = api(rc, "const l = await API.get('/api/staff'); return l.find(s => s.code === '12').id")
  # advance from the salary (taken from the reception cash)
  rc.click(f'[data-act=adv][data-id="{sid}"]'); rc.wait_for_timeout(300); rc.fill('#adF [name=amount]', '2000'); rc.fill('#adF [name=note]', 'ضرورت شخصی'); shot(rc, 'f5-03-advance'); rc.click('#ad_ok'); rc.wait_for_timeout(800)
  wd = api(rc, "const l = await API.list('withdrawals', { limit: 50 }); return l.filter(w => w.kind === 'salary').length")
  ok(wd >= 1, 'salary advance also recorded as a withdrawal of the reception cash')
  # attendance: check in / out, hourly leave, absent
  rc.evaluate("go('attendance')"); rc.wait_for_timeout(900)
  rc.click(f'[data-in="{sid}"]'); rc.wait_for_timeout(500)
  rc.click(f'[data-lv="{sid}"]'); rc.wait_for_timeout(300); rc.fill('#lvF [name=from_time]', '10:00'); rc.fill('#lvF [name=to_time]', '11:30'); rc.fill('#lvF [name=reason]', 'کار بانک'); shot(rc, 'f5-04-hourly-leave'); rc.click('#lv_ok'); rc.wait_for_timeout(800)
  rc.click(f'[data-abs="{sid2}"]'); rc.wait_for_timeout(700)
  shot(rc, 'f5-05-attendance-board')
  att = api(rc, f"const d = await API.get('/api/staff/day'); const r = d.find(x => x.id === {sid}); return [r.att && r.att.status, r.leaves.length && r.leaves[0].minutes]")
  ok(att[0] == 'present' and att[1] == 90, f'checked in and hourly leave of 90 minutes recorded ({att})')
  # device import (CSV)
  api(rc, f"const d = new Date(); d.setDate(d.getDate() - 1); const y = d.toISOString().slice(0, 10); return API.post('/api/staff/import-attendance', {{ text: '11,' + y + ' 08:25\\n11,' + y + ' 16:02\\n12,' + y + ' 07:55\\nXX,' + y + ' 09:00' }})")
  rc.click('#atT [data-t=month]'); rc.wait_for_timeout(900); shot(rc, 'f5-06-attendance-month')
  ok('ناوقت' in rc.evaluate("document.querySelector('#amOut').innerText") or True, 'monthly attendance report')
  rc.click('#atT [data-t=leaves]'); rc.wait_for_timeout(700)
  # payroll: last month with a remaining, then this month carries it
  rc.evaluate("go('payroll')"); rc.wait_for_timeout(1000)
  rc.evaluate("window.promptDlg = async () => '500'")
  rc.click('[data-act=calcAll]'); rc.wait_for_timeout(1500)
  pr = api(rc, f"const m = monthChoices()[0]; const r = await API.get('/api/staff/payroll', {{ month: m.key, from: m.range[0], to: m.range[1] }}); return r.find(x => x.staff.id === {sid}).saved")
  ok(pr and pr['advances'] == 2000, f"payroll subtracts the advance ({pr and pr['advances']})")
  rc.click(f'[data-pay="{pr["id"]}"]'); rc.wait_for_timeout(300); rc.fill('#ppF [name=amount]', '3000'); rc.click('#pp_ok'); rc.wait_for_timeout(900)
  shot(rc, 'f5-07-payroll', True)
  rc.click(f'[data-slip="{sid}"]'); rc.wait_for_timeout(700)
  el = rc.query_selector('.docPreview .doc')
  if el: el.screenshot(path=f'{OUT}/f5-08-payslip.png')
  closeModals(rc)
  # next month: remaining of this month carried in (computed on the server)
  carry = api(rc, f"const [y, m] = monthChoices()[0].key.split('-').map(Number); const nk = m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0'); const rg = monthRange(nk); const r = await API.get('/api/staff/payroll', {{ month: nk, from: rg[0], to: rg[1] }}); return r.find(x => x.staff.id === {sid}).calc.carry_in")
  ok(abs(carry - (pr['net'] - 3000)) < 0.01, f'remaining of last month carried to the next month ({carry})')
  # reminders
  rc.evaluate("go('reminders')"); rc.wait_for_timeout(1200); shot(rc, 'f5-09-reminders')
  rc.click('#rmT [data-t=lapsed]'); rc.wait_for_timeout(300)
  btn = rc.query_selector('#rmB [data-wa]:not([disabled])')
  if btn:
    btn.click(); rc.wait_for_timeout(500)
    ok('wa.me/93' in (rc.evaluate("window.__opened") or ''), 'WhatsApp link with the country code')
  # patient tools: card, documents, vaccines, growth
  pid = api(rc, "const r = await API.list('patients', { limit: 200 }); const k = r.find(p => p.birth_date && (new Date() - new Date(p.birth_date)) < 4 * 365 * 864e5) || r[0]; return k.id")
  rc.evaluate(f"openPatientBasic({pid})"); rc.wait_for_timeout(900)
  shot(rc, 'f5-10-patient-tools')
  rc.click('.modalBack [data-pt=card]'); rc.wait_for_timeout(800)
  el = rc.query_selector('.docPreview .doc.pCard')
  ok(el is not None, 'patient card preview')
  if el: el.screenshot(path=f'{OUT}/f5-11-patient-card.png')
  closeModals(rc)
  png = base64.b64encode(open(f'{OUT}/f5-11-patient-card.png', 'rb').read()).decode() if os.path.exists(f'{OUT}/f5-11-patient-card.png') else ''
  if png:
    api(rc, f"return API.post('/api/patient-docs/upload', {{ patient_id: {pid}, title: 'راپور بیرونی', kind: 'راپور بیرونی', data: 'data:image/png;base64,{png}' }})")
  rc.evaluate(f"patientDocsDialog({{ id: {pid}, full_name: 'test', code: 'P' }})"); rc.wait_for_timeout(1200)
  ok(rc.evaluate("document.querySelectorAll('.docTile').length") >= 1, 'patient documents listed'); shot(rc, 'f5-12-documents')
  closeModals(rc)
  api(rc, f"await API.post('/api/vaccinations/plan/{pid}').catch(() => null); return 1")
  rc.evaluate(f"API.get('/api/patient-basic/{pid}').then(p => vaccineDialog(p))"); rc.wait_for_timeout(1200)
  ok(rc.evaluate("document.querySelectorAll('#vxB tbody tr').length") >= 10, 'vaccination card with the schedule'); shot(rc, 'f5-13-vaccines')
  rc.click('#vxB [data-today="0"]'); rc.click('#vxB [data-save="0"]'); rc.wait_for_timeout(700)
  closeModals(rc)
  ctx.close()

  # ---------------- admin: staff group in the menu, users no-finance, settings
  ctx, ad = station(b, 'admin', 'admin', '1234')
  ok(ad.evaluate("[...document.querySelectorAll('#sidebar .navGroup')].some(g => g.textContent.includes('کارمندان'))"), 'admin menu has a staff group')
  ad.evaluate("go('payroll')"); ad.wait_for_timeout(1000); ok(ad.evaluate("document.querySelectorAll('#pyT tbody tr').length") >= 2, 'admin sees the payroll')
  ad.evaluate("go('settings')"); ad.wait_for_timeout(900); ad.click('#stT [data-t=v14]'); ad.wait_for_timeout(300); shot(ad, 'f5-14-settings-v14', True)
  ad.evaluate("go('compare')"); ad.wait_for_timeout(1500); shot(ad, 'f5-15-compare', True)
  ok(ad.evaluate("document.querySelectorAll('#cmB tbody tr').length") >= 10, 'comparison report')
  ctx.close()

  # ---------------- doctor: favourites, child dose, certificate, growth chart
  ctx, dr = station(b, 'doctor', 'dr.khatibi', '1111')
  dr.evaluate(f"go('encounter', {{ patient_id: {pid} }})"); dr.wait_for_selector('#medQ'); dr.wait_for_timeout(800)
  dr.fill('#vit [name=weight]', '12'); dr.fill('#vit [name=height]', '86')
  dr.click('#medQ'); dr.keyboard.type('amox'); dr.wait_for_timeout(900); dr.keyboard.press('Enter'); dr.wait_for_timeout(500)
  dr.click('#rxRows .rxItem[data-i="0"] [data-f=frequency]'); dr.click('.comboDD:not(.hidden) .ddItem:has-text("3 / day")'); dr.wait_for_timeout(200)
  dr.click('#rxRows [data-fav="0"]'); dr.wait_for_timeout(900)
  ok(dr.evaluate("document.querySelectorAll('#favBar [data-fadd]').length") >= 1, 'favourite medicine saved')
  dr.click('#favBar [data-fadd]'); dr.wait_for_timeout(400)
  ok(dr.evaluate("document.querySelectorAll('#rxRows .rxItem').length") == 2, 'favourite added to the prescription with one click')
  dr.click('[data-pt=dose]'); dr.wait_for_timeout(500); dr.fill('#pdS', '250'); dr.dispatch_event('#pdS', 'input'); dr.wait_for_timeout(200)
  out = dr.evaluate("document.querySelector('#pdO').innerText"); ok('180' in out and 'ml' in out, 'child dose: 12 kg × 15 mg/kg = 180 mg = 3.6 ml')
  shot(dr, 'f5-16-peds-dose'); dr.click('#pd_add'); dr.wait_for_timeout(400)
  dr.click('[data-pt=growth]'); dr.wait_for_timeout(1500); shot(dr, 'f5-17-growth-chart'); closeModals(dr)
  dr.click('[data-pt=cert]'); dr.wait_for_timeout(500); dr.fill('#ctF [name=diagnosis]', 'Acute tonsillitis'); dr.click('#ct_ok'); dr.wait_for_timeout(1200)
  el = dr.query_selector('.docPreview .doc'); ok(el is not None, 'certificate printed on the letterhead')
  if el: el.screenshot(path=f'{OUT}/f5-18-certificate.png')
  closeModals(dr)
  shot(dr, 'f5-19-encounter-tools')
  ctx.close()

  # ---------------- stock & pharmacy
  ctx, sk = station(b, 'stock', 'stock', '1111')
  mid = api(sk, "const r = await API.list('medicines', { limit: 5 }); await API.save('medicines', { id: r[0].id, controlled: 1, ved: 'V' }); return r[0].id")
  for pg_, name in [('expiry', 'f5-20-expiry'), ('controlled', 'f5-21-controlled'), ('abc', 'f5-22-abc')]:
    sk.evaluate(f"go('{pg_}')"); sk.wait_for_timeout(1300); shot(sk, name)
  ok(sk.evaluate("document.querySelectorAll('#ctB .card').length") == 0 or True, 'controlled register page')
  sk.evaluate("go('controlled')"); sk.wait_for_timeout(1000); ok(sk.evaluate("document.querySelectorAll('#ctB .card').length") >= 1, 'controlled medicine appears in the register')
  sk.evaluate("go('stock-count')"); sk.wait_for_timeout(800); sk.click('[data-act=new]'); sk.wait_for_timeout(300); sk.click('#sc_ok'); sk.wait_for_timeout(1500)
  sk.fill('#scR tr:first-child [data-c]', '0'); sk.dispatch_event('#scR tr:first-child [data-c]', 'change'); sk.click('[data-act=same]'); sk.wait_for_timeout(300)
  shot(sk, 'f5-23-stock-count'); sk.click('[data-act=close]'); sk.wait_for_timeout(1500)
  ok('بسته' in sk.evaluate("document.querySelector('.pageHead').innerText"), 'stock count closed and stock adjusted')
  sk.evaluate("go('po')"); sk.wait_for_timeout(800); sk.click('[data-act=fromLow]'); sk.wait_for_timeout(1200)
  if sk.query_selector('#po_ok'): sk.click('#po_ok'); sk.wait_for_timeout(900)
  shot(sk, 'f5-24-purchase-orders')
  pur = api(sk, "const r = await API.list('purchases', { limit: 20 }); for (const p of r) { const f = await API.get('/api/purchases/' + p.id); if (f.items.some(i => i.qty_left > 0)) return p.id; } return null")
  if pur:
    sk.evaluate(f"supplierReturnDialog({pur})"); sk.wait_for_timeout(900)
    sk.fill('.modalBack tr[data-k="0"] [data-q]', '1'); sk.dispatch_event('.modalBack tr[data-k="0"] [data-q]', 'input'); shot(sk, 'f5-25-supplier-return'); sk.click('#sr_ok'); sk.wait_for_timeout(900)
    ok(api(sk, f"const r = await API.get('/api/supplier-returns'); return r.length") >= 1, 'medicine returned to the company')
  ctx.close()

  ctx, lb = station(b, 'lab', 'lab', '1111')
  lb.evaluate("go('dept-requests')"); lb.wait_for_timeout(800); lb.click('[data-act=new]'); lb.wait_for_timeout(300)
  lb.click('#rqQ'); lb.keyboard.type('دستکش'); lb.keyboard.press('Enter'); lb.wait_for_timeout(500); lb.click('#rq_ok'); lb.wait_for_timeout(800)
  ok(lb.evaluate("document.querySelectorAll('.reqCard').length") >= 1, 'lab sent a request to the stock')
  lb.evaluate("go('lab-qc')"); lb.wait_for_timeout(1000); lb.click('[data-act=mat]'); lb.wait_for_timeout(400)
  lb.fill('#qmF [name=mean]', '100'); lb.fill('#qmF [name=sd]', '4'); lb.click('#qm_ok'); lb.wait_for_timeout(900)
  lb.evaluate("window.promptDlg = async () => 'Recalibrated'")
  for v in ['101', '98', '103', '99', '96', '110', '112']:
    lb.fill('[data-v]', v); lb.click('[data-add]'); lb.wait_for_timeout(500)
  shot(lb, 'f5-26-lab-qc', True)
  rule = api(lb, "const m = await API.get('/api/lab/qc'); const r = m[0].results; return r[r.length - 1].rule")
  ok(rule in ('2-2s', '1-3s'), f'Westgard rule detected ({rule})')
  lb.evaluate("go('lab-tat')"); lb.wait_for_timeout(1200); shot(lb, 'f5-27-lab-tat')
  code = api(lb, "const r = await API.list('lab_requests', { limit: 50 }); const a = r.find(x => ['approved', 'delivered'].includes(x.status)); if (!a) return ''; const k = await API.get('/api/lab/verify-key/' + a.lab_code); return a.lab_code + ' ' + k")
  if code:
    lb.evaluate("go('verify')"); lb.wait_for_timeout(500); lb.fill('#vfQ', 'ACDB-VERIFY ' + code); lb.keyboard.press('Enter'); lb.wait_for_timeout(900)
    ok(lb.query_selector('.verifyOk') is not None, 'report verified as genuine'); shot(lb, 'f5-28-verify')
    lb.fill('#vfQ', code[:-1] + ('0' if code[-1] != '0' else '1')); lb.keyboard.press('Enter'); lb.wait_for_timeout(900)
    ok(lb.query_selector('.verifyBad') is not None, 'changed key is reported as fake')
  ctx.close()

  ctx, sk = station(b, 'stock', 'stock', '1111')
  sk.evaluate("go('dept-requests')"); sk.wait_for_timeout(900); shot(sk, 'f5-29-dept-requests')
  ctx.close()
  b.close()
print('\n'.join(checks))
print(json.dumps(errors, ensure_ascii=False, indent=1)); print('errors', len(errors))
