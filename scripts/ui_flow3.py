# Workflow test of the laboratory functions taken from the lab's previous program:
# reception types / insurance share, outside referrers, fasting / urgent / clinical notes, answer date, previous answers,
# kits with alarm / critical / possible ranges, report layout (arrows, differential side column), statistics and doctors' income.
# Usage: python3 scripts/ui_flow3.py http://localhost:8770 out_dir
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

def doc_shot(pg, name):
  el = pg.query_selector('.docPreview .doc') or pg.query_selector('.docPreview')
  if el: el.screenshot(path=f'{OUT}/{name}.png')

def api(pg, js):
  return pg.evaluate(f"(async()=>{{ {js} }})()")

with sync_playwright() as p:
  b = p.chromium.launch()

  # ---------------- lab setup: insurance reception type active, an outside referrer
  ctx, lb = station(b, 'lab', 'lab', '1111')
  api(lb, "const c = await loadLabCatalog(true); const ins = c.reception_types.find(x => x.code === 'INS'); await API.save('lab_reception_types', { id: ins.id, active: 1, required_fields: '[]' }); return 1")
  lb.evaluate("go('lab-setup')"); lb.wait_for_timeout(1000)
  lb.click('[data-act=newR]'); lb.wait_for_timeout(400)
  lb.fill('#rfF [name=name]', 'دوکتور عبدالرحیم احمدی'); lb.fill('#rfF [name=council_no]', 'MC-2041'); lb.fill('#rfF [name=specialty]', 'داخله')
  lb.click('#rf_ok'); lb.wait_for_timeout(900); shot(lb, 'f3-01-lab-setup')
  # kit + ranges for FBS
  lb.evaluate("go('lab-tests')"); lb.wait_for_timeout(1000); lb.fill('#tq', 'GLUF'); lb.wait_for_timeout(400)
  lb.click('#tb [data-act=edit]'); lb.wait_for_timeout(900)
  lb.click('#ltT [data-t=ranges]'); lb.wait_for_timeout(200)
  lb.click('#ltKitNew'); lb.wait_for_timeout(400)
  lb.fill('#kF [name=name]', 'Pars Azmun — FBS'); lb.fill('#kF [name=lot_no]', 'L-0925'); lb.fill('#kF [name=expiry]', '2027-06-30'); lb.fill('#kF [name=method]', 'GOD-PAP')
  lb.click('#k_ok'); lb.wait_for_timeout(1500)
  rows = lb.query_selector_all('#ltR tr[data-ri]')
  if rows:
    r0 = rows[-1]
    for k, v in [('alarm_low', '50'), ('alarm_high', '200'), ('crit_low', '40'), ('crit_high', '450'), ('min_valid', '5'), ('max_valid', '1500')]:
      r0.query_selector(f'[data-k={k}]').fill(v)
  shot(lb, 'f3-02-kit-ranges')
  lb.click('#ltT [data-t=ready]'); lb.fill('#ltDef', '92'); lb.fill('#ltReady', 'Hemolyzed sample\nRepeat test')
  lb.click('#ltT [data-t=more]'); lb.fill('#ltTat', '0'); lb.fill('#ltTube', 'Fluoride (خاکستری)')
  shot(lb, 'f3-03-test-more')
  lb.click('#lt_ok'); lb.wait_for_timeout(1500)
  kit = api(lb, "const c = await loadLabCatalog(true); const t = c.tests.find(x => x.code === 'GLUF'); return { kit: t.active_kit_id, ranges: (c.ranges.get(t.id) || []).filter(r => r.kit_id === t.active_kit_id).length, def: t.default_answer }")
  ok(kit['kit'] and kit['ranges'] > 0 and kit['def'] == '92', f"FBS kit active with {kit['ranges']} ranges, default answer {kit['def']}")
  ctx.close()

  # ---------------- reception: insurance patient referred by an outside doctor, fasting + urgent + clinical notes
  ctx, rc = station(b, 'reception', 'reception', '1111')
  rc.evaluate("go('rc-lab')"); rc.wait_for_timeout(1300)
  rc.fill('#rlPt [name=full_name]', 'اقبال'); rc.fill('#rlPt [name=father_name]', 'رمضان'); rc.fill('#rlPt [data-a=y]', '40'); rc.fill('#rlPt [name=tazkira]', '1402-0099'); rc.fill('#rlPt [name=phone]', '0799000111')
  ins_id = api(rc, "const c = await loadLabCatalog(); return c.reception_types.find(x => x.code === 'INS').id")
  rc.select_option('#rlR [data-lf=reception_type_id]', str(ins_id))
  rc.fill('#rlR [data-lf=referrer]', 'دوکتور عبدالرحیم احمدی'); rc.select_option('#rlR [data-lf=fasting]', 'fast'); rc.check('#rlR [data-lf=urgent]')
  rc.fill('#rlR [data-lf=clinical_notes]', 'Anemia? follow-up')
  for code in ['CBC', 'GLUF', 'CRP']:
    rc.fill('#rlQ', code); rc.keyboard.press('Enter'); rc.wait_for_timeout(150)
  rc.wait_for_timeout(400); shot(rc, 'f3-04-rc-lab-insurance', True)
  org = rc.evaluate("document.querySelector('#rlOrg').textContent")
  ok(org not in ('', '0'), 'organisation share shown at reception: ' + org)
  rc.click('[data-act=save][data-print]'); rc.wait_for_timeout(1800)
  req = api(rc, "const r = await API.list('lab_requests', { limit: 1 }); return r[0]")
  ok(req['fasting'] == 'fast' and req['urgent'] == 1 and req['org_share'] > 0 and req['answer_date'] and req['doctor_name'] == 'دوکتور عبدالرحیم احمدی', f"request {req['lab_code']}: fast, urgent, org share {req['org_share']}, answer {req['answer_date']}, referrer {req['doctor_name']}")
  rc.evaluate(f"(async()=>{{ const r = await API.get('/api/lab/req/x', {{ id: {req['id']} }}); previewDoc(labReceiptsHTML(r), {{ size: 'receipt' }}); }})()"); rc.wait_for_timeout(1000)
  doc_shot(rc, 'f3-05-lab-receipt')
  ctx.close()

  # ---------------- lab: results with Enter, default answers, approve → report; second request shows previous answers
  ctx, lb = station(b, 'lab', 'lab', '1111')
  lb.evaluate(f"go('lab-work', {{ id: {req['id']} }})"); lb.wait_for_timeout(1300)
  if lb.query_selector('#dTabs [data-pg=all]'): lb.click('#dTabs [data-pg=all]'); lb.wait_for_timeout(300)
  vals = {'WBC': '10.9', 'RBC': '4.29', 'HGB': '10.9', 'HCT': '33.2', 'PLT': '521', 'NEUT%': '54', 'LYMPH%': '39', 'MONO%': '5', 'EOS%': '2', 'BASO%': '0', 'CRP': '<6.0', 'GLUF': '480'}
  api(lb, f"const v = {json.dumps(vals)}; const r = await API.get('/api/lab/req/x', {{ id: {req['id']} }}); document.querySelectorAll('[data-tid]').forEach(el => {{ const t = r.tests.find(x => x.id === Number(el.dataset.tid)); if (t && v[t.code] !== undefined && !el.readOnly) {{ el.value = v[t.code]; }} }}); document.querySelector('#workBody').dispatchEvent(new Event('input')); return 1")
  shot(lb, 'f3-06-results', True)
  crit = lb.evaluate("[...document.querySelectorAll('tr.crit td.nm')].map(x => x.textContent.trim().slice(0, 20))")
  ok(any('Glucose' in c or 'GLU' in c or 'Fasting' in c for c in crit), 'FBS 480 marked critical (kit range): ' + ', '.join(crit))
  lb.click('[data-act=saveRes][data-st=approved]'); lb.wait_for_timeout(1500)
  if lb.query_selector('#cc_ok'):   # v1.4: critical results ask who was told
    checks.append('✓ critical value call dialog shown'); lb.click('#cc_ok'); lb.wait_for_timeout(800)
  lb.click('[data-act=report]'); lb.wait_for_timeout(1500); doc_shot(lb, 'f3-07-lab-report')
  rep = lb.evaluate("document.querySelector('.docPreview')?.innerText || ''")
  ok('Differential' in rep and 'Fast' in rep and 'Anemia' in rep, 'report has differential side column, Fast box and clinical notes')
  lb.keyboard.press('Escape')
  # second request for the same patient → Prev Res
  rid2 = api(lb, f"const r = await API.post('/api/lab/walkin', {{ patient_id: {req['patient_id']}, test_ids: [ (await loadLabCatalog()).tests.find(t => t.code === 'GLUF').id ] }}); await API.post('/api/lab/receive/' + r.id, {{ paid: 0 }}); return r.id")
  lb.evaluate(f"go('lab-work', {{ id: {rid2} }})"); lb.wait_for_timeout(1300)
  prev = lb.evaluate("document.querySelector('td.prevC')?.textContent || ''")
  ok('480' in prev, 'previous answer shown in Prev 1: ' + prev)
  lb.click('[data-act=defaults]'); lb.wait_for_timeout(300)
  dv = lb.evaluate("[...document.querySelectorAll('input[data-tid]')].map(x => x.value).join(',')")
  ok('92' in dv, 'default answer filled: ' + dv)
  lb.click('[data-trend]'); lb.wait_for_timeout(1200); shot(lb, 'f3-08-trend'); lb.keyboard.press('Escape')
  shot(lb, 'f3-09-prev-results')
  # reports
  lb.evaluate("go('lab-reports')"); lb.wait_for_timeout(1500); shot(lb, 'f3-10-stats', True)
  for kind in ['shares', 'discounts', 'hours', 'tests']:
    lb.select_option('#sKind', kind); lb.wait_for_timeout(600); shot(lb, f'f3-11-stats-{kind}')
  lb.select_option('#sKind', 'standard'); lb.click('[data-act=print]'); lb.wait_for_timeout(1200); doc_shot(lb, 'f3-12-stats-print'); lb.keyboard.press('Escape')
  lb.click('#rpT [data-t=income]'); lb.wait_for_timeout(1500); shot(lb, 'f3-13-doctor-income', True)
  inc = lb.evaluate("document.querySelector('#iOut')?.innerText || ''")
  ok('MC-2041' in inc, 'referring doctor income lists the outside doctor with council number')
  ctx.close()
  b.close()
print('\n'.join(checks))
print(json.dumps(errors, ensure_ascii=False, indent=1)); print('errors', len(errors))
