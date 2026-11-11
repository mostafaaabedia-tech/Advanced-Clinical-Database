# UI audit: opens every page (and every tab of it) of every station at several window sizes, in light and dark,
# and reports script errors, sideways overflow, clipped texts and elements outside the page.
# Usage: python3 scripts/ui_audit.py http://localhost:8770 out_dir [shots]
import sys, os, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8770'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'scripts/out'
SHOTS = len(sys.argv) > 3
os.makedirs(OUT, exist_ok=True)
USERS = {'admin': ('admin', '1234'), 'stock': ('stock', '1111'), 'reception': ('reception', '1111'), 'doctor': ('dr.khatibi', '1111'), 'pharmacy': ('pharmacy', '1111'), 'lab': ('lab', '1111')}
SIZES = [(1366, 768), (1024, 700)]
problems, errors = [], []

CHECK = """() => {
  const v = document.querySelector('#view'); const out = [];
  const vr = v.getBoundingClientRect();
  if (v.scrollWidth > v.clientWidth + 2) out.push('view scrolls sideways by ' + (v.scrollWidth - v.clientWidth) + 'px');
  if (document.documentElement.scrollWidth > innerWidth + 2) out.push('window scrolls sideways');
  const sb = document.querySelector('#sidebar'); if (sb && sb.scrollWidth > sb.clientWidth + 2) out.push('sidebar overflows');
  const tb = document.querySelector('#topbar'); if (tb && tb.scrollWidth > tb.clientWidth + 2) out.push('topbar overflows by ' + (tb.scrollWidth - tb.clientWidth));
  const scrollable = (el) => { for (let p = el.parentElement; p && p !== v; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  const seen = new Set();
  for (const el of v.querySelectorAll('.card, .kpi, .btn, .chip, .tabs, .bar, table, input, select, canvas, .grid, .tableWrap')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if ((r.left < vr.left - 2 || r.right > vr.right + 2) && !scrollable(el)) { const k = el.className + '|' + (el.id || ''); if (!seen.has(k)) { seen.add(k); out.push('outside page: <' + el.tagName.toLowerCase() + ' class="' + el.className + '" id="' + el.id + '"> ' + Math.round(r.left - vr.left) + '..' + Math.round(r.right - vr.right)); } }
  }
  for (const el of v.querySelectorAll('.btn, .chip, .kpi .val, .kpi .lbl, .tabs > button, h2, .pill, .tag')) {
    if (!el.offsetParent) continue; const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'visible') { const k = 'clip|' + el.className + '|' + el.textContent.trim().slice(0, 20); if (!seen.has(k)) { seen.add(k); out.push('clipped text: <' + el.tagName.toLowerCase() + ' class="' + el.className + '"> ' + el.textContent.trim().slice(0, 40)); } }
  }
  // texts with too little contrast against their own background (catches light text on light, dark on dark)
  const lum = (c) => { const m = c.match(/[\\d.]+/g); if (!m) return null; const a = m.length > 3 ? Number(m[3]) : 1; const f = (x) => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }; return { l: .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]), a }; };
  const bgOf = (el) => { for (let p = el; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.backgroundImage !== 'none') return null; const b = lum(cs.backgroundColor); if (b && b.a > .9) return b.l; } return null; };
  let low = 0; const lows = [];
  for (const el of v.querySelectorAll('td, th, label span, .lbl, .val, h2, h3, p, .btn, .chip, .muted, .small, button')) {
    if (!el.offsetParent || !el.textContent.trim() || el.children.length > 2) continue;
    const f = lum(getComputedStyle(el).color), b = bgOf(el); if (!f || b == null || f.a < .5) continue;
    const c = (Math.max(f.l, b) + .05) / (Math.min(f.l, b) + .05);
    if (c < 2.2) { low++; if (lows.length < 3) lows.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' «' + el.textContent.trim().slice(0, 18) + '» ' + c.toFixed(1)); }
  }
  if (low) out.push('low contrast ×' + low + ': ' + lows.join(' ; '));
  return out;
}"""

def audit(pg, role, page, label):
  for p in pg.evaluate(CHECK): problems.append(f'[{role}/{label}] {page}: {p}')

with sync_playwright() as p:
  b = p.chromium.launch()
  for role, (user, pw) in USERS.items():
    for theme in ('light', 'dark'):
      ctx = b.new_context(viewport={'width': SIZES[0][0], 'height': SIZES[0][1]}, locale='fa-IR')
      pg = ctx.new_page()
      cur = {'page': ''}
      pg.on('pageerror', lambda e: errors.append(f'[{role}/{theme}] {cur["page"]} pageerror: {e}'))
      pg.on('console', lambda m: errors.append(f'[{role}/{theme}] {cur["page"]} console: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
      pg.add_init_script("window.print = () => {}; window.open = () => null; try { localStorage.setItem('acdb_motion','off'); localStorage.setItem('acdb_theme','%s') } catch(_) {}" % theme)
      pg.goto(f'{BASE}/?station={role}')
      pg.fill('#loginUser', user); pg.fill('#loginPass', pw); pg.click('#loginForm button[type=submit]')
      pg.wait_for_selector('#app:not(.hidden)', timeout=8000); pg.wait_for_timeout(600)
      pg.evaluate("window.confirmDlg = async () => true; window.canSee = () => true")
      pg.evaluate("document.documentElement.dataset.theme = '%s'" % theme)
      pages = pg.evaluate("NAV.filter(n => App.user.role === 'admin' || n[3].includes(App.user.role)).map(n => n[0]).filter((x, i, a) => a.indexOf(x) === i && Pages[x])")
      for page in pages:
        cur['page'] = page
        for (w, h) in (SIZES if theme == 'light' else SIZES[:1]):
          pg.set_viewport_size({'width': w, 'height': h})
          try:
            pg.evaluate(f"go('{page}')"); pg.wait_for_timeout(650)
          except Exception as e:
            errors.append(f'[{role}] {page}: {e}'); continue
          audit(pg, role, page, f'{theme} {w}')
          if SHOTS and w == SIZES[0][0]: pg.screenshot(path=f'{OUT}/{role}-{page}-{theme}.png')
          if w == SIZES[0][0]:
            n = pg.evaluate("document.querySelectorAll('#view .tabs > button').length")
            for i in range(min(n, 12)):
              try:
                t = pg.evaluate(f"(() => {{ const b = document.querySelectorAll('#view .tabs > button')[{i}]; if (!b || b.classList.contains('on') || !b.offsetParent) return ''; b.click(); return b.textContent.trim().slice(0, 20); }})()")
                if not t: continue
                pg.wait_for_timeout(450); audit(pg, role, page + ' › ' + t, f'{theme} {w}')
                if SHOTS and theme == 'light': pg.screenshot(path=f'{OUT}/{role}-{page}-tab{i}.png')
              except Exception as e:
                errors.append(f'[{role}] {page} tab {i}: {e}')
            pg.evaluate("document.querySelectorAll('#modals .modalBack').forEach(m => m.remove())")
      ctx.close()
  b.close()
uniq = sorted(set(problems))
print('\n'.join(uniq)); print('problems', len(uniq))
print(json.dumps(sorted(set(errors)), ensure_ascii=False, indent=1)); print('errors', len(set(errors)))
