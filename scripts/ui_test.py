# UI smoke test: logs in at every station, opens every page, collects JS errors and takes screenshots.
# Usage: python3 scripts/ui_test.py http://localhost:8770 out_dir
import sys, os, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8770'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'scripts/out'
ONLY = sys.argv[3].split(',') if len(sys.argv) > 3 else None
os.makedirs(OUT, exist_ok=True)

STATIONS = {
  'admin': ('admin', '1234', ['admin-dash', 'network', 'users', 'setup', 'settings', 'audit', 'backup', 'local']),
  'reception': ('reception', '1111', ['reception', 'visits', 'reservations', 'patients', 'cashier', 'rc-lab', 'ipd', 'rc-cash', 'qdisplay', 'local']),
  'doctor': ('dr.abedi', '1111', ['dr-queue', 'encounter', 'rx-list', 'templates', 'dr-stats', 'patients', 'ipd', 'qdisplay']),
  'pharmacy': ('pharmacy', '1111', ['rx-inbox', 'pos', 'sales', 'ph-daily', 'medicines', 'med-sales', 'reorder']),
  'stock': ('stock', '1111', ['stock-dash', 'medicines', 'purchases', 'suppliers', 'expenses', 'withdrawals', 'daily', 'monthly', 'med-sales', 'reorder', 'lab-items', 'import', 'sales']),
  'lab': ('lab', '1111', ['lab-inbox', 'lab-walkin', 'lab-list', 'lab-tests', 'lab-items', 'lab-sales', 'lab-reports', 'lab-setup']),
}
errors = []
with sync_playwright() as p:
  b = p.chromium.launch()
  for st, (u, pw, pages) in STATIONS.items():
    if ONLY and st not in ONLY: continue
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='fa-IR')
    pg = ctx.new_page()
    pg.on('console', lambda m, st=st: errors.append(f'[{st}] console.{m.type}: {m.text}') if m.type in ('error',) else None)
    pg.on('pageerror', lambda e, st=st: errors.append(f'[{st}] pageerror: {e}'))
    pg.goto(f'{BASE}/?station={st}')
    pg.fill('#loginUser', u); pg.fill('#loginPass', pw); pg.click('#loginForm button[type=submit]')
    pg.wait_for_selector('#app:not(.hidden)', timeout=8000)
    pg.wait_for_timeout(900)
    for name in pages:
      pg.evaluate(f"go('{name}')")
      pg.wait_for_timeout(1100)
      pg.screenshot(path=f'{OUT}/{st}-{name}.png', full_page=False)
      err = pg.evaluate("document.querySelector('#view .card h2')?.textContent === 'خطا' ? document.querySelector('#view').innerText.slice(0,200) : ''")
      if err: errors.append(f'[{st}] page {name}: {err}')
    ctx.close()
  b.close()
print(json.dumps(errors, ensure_ascii=False, indent=1))
print('errors:', len(errors))
