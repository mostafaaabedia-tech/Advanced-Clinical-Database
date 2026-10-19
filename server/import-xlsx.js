// Import of the clinic's existing Excel book (Database.xlsx):
//   stock                      → medicine purchase factors (summary, no item lines)
//   مصارف                      → expenses / other factors
//   حسابات ماهوار دواخانه       → daily pharmacy & laboratory totals + withdrawals
//   Medicines                  → medicines with opening stock
'use strict';
const XLSX = require('xlsx');

// ---- solar (Hijri Shamsi / Afghan) date → ISO gregorian ----
const pfmt = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' });
function solarOf(d) { const p = pfmt.formatToParts(d); const g = k => Number((p.find(x => x.type === k) || {}).value); return [g('year'), g('month'), g('day')]; }
function solarToISO(y, m, d) {
  if (!(y > 1300 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const offset = (m <= 6 ? (m - 1) * 31 : 186 + (m - 7) * 30) + (d - 1);
  const g = new Date(y + 621, 2, 21, 12); g.setDate(g.getDate() + offset);
  for (let i = 0; i < 6; i++) {
    const [sy, sm, sd] = solarOf(g);
    const diff = ((y - sy) * 372 + (m - sm) * 31 + (d - sd));
    if (!diff) return iso(g);
    g.setDate(g.getDate() + Math.sign(diff) * Math.min(Math.abs(diff), 31));
  }
  // day 31 in a 30-day month etc. → clamp to the last valid day
  return d > 29 ? solarToISO(y, m, d - 1) : null;
}
const iso = (g) => `${g.getFullYear()}-${String(g.getMonth() + 1).padStart(2, '0')}-${String(g.getDate()).padStart(2, '0')}`;

// parses "10/5/1405", "1405/5/10", Excel serial numbers, JS dates; ctx = {y, m} for day-only cells
function parseDate(v, ctx) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return iso(v);
  const s = String(v).trim().replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
  let m = s.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})$/);
  if (m) {
    let y = Number(m[3]); if (y < 1000) y = ctx.y || (y < 100 ? 1400 + y : 1405);
    ctx.y = y; ctx.m = Number(m[2]);
    return y > 1900 ? `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : solarToISO(y, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]); ctx.y = y; ctx.m = Number(m[2]);
    return y > 1900 ? `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : solarToISO(y, Number(m[2]), Number(m[3]));
  }
  m = s.match(/(\d{1,2})\s*$/);  // "d1-8", "10" → day of the context month
  if (m && ctx.y && ctx.m && Number(m[1]) <= 31) return solarToISO(ctx.y, ctx.m, Number(m[1]));
  return null;
}
const num = (v) => { if (v === null || v === undefined || v === '') return 0; const x = Number(String(v).replace(/[,\s]/g, '')); return isFinite(x) ? x : 0; };
const txt = (v) => (v === null || v === undefined) ? '' : String(v).trim();
const norm = (s) => txt(s).replace(/\s+/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک');

function sheetRows(wb, nameTest) {
  const name = wb.SheetNames.find(n => nameTest(norm(n)));
  if (!name) return null;
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
}
// header row → column index finder
function headerIndex(rows, must) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = rows[i].map(norm);
    if (must.every(m => h.some(c => c.includes(m)))) return { row: i, col: (...keys) => { for (const k of keys) { const j = h.findIndex(c => c.includes(k)); if (j >= 0) return j; } return -1; } };
  }
  return null;
}
// first full date in the sheet gives the month for day-only rows at the top
function initialContext(rows, col) {
  for (const r of rows) {
    const m = txt(r[col]).match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/);
    if (m) { let y = Number(m[3]), mo = Number(m[2]) - 1; if (mo < 1) { mo = 12; y--; } return { y, m: mo }; }
  }
  return {};
}

function importWorkbook(db, ops, buffer, user, opts = {}) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sum = { purchases: 0, expenses: 0, daily: 0, withdrawals: 0, medicines: 0, skipped: 0, sheets: [] };
  const exists = (sql, p) => !!db.get(sql, p);
  db.transaction(() => {
    // ---------- purchase factors ----------
    const st = sheetRows(wb, n => n.toLowerCase() === 'stock' || n.includes('فاکتور'));
    if (st) {
      const H = headerIndex(st, ['فاکتور']);
      if (H) {
        sum.sheets.push('stock');
        const cDate = H.col('تاریخ'), cNo = H.col('شماره فاکتور'), cAmt = H.col('مبلغ فاکتور'), cSup = H.col('کمپانی', 'آورنده'), cRec = H.col('تحویل'), cBal = H.col('باقیات', 'باقی'), cStat = H.col('وضعیت'), cRecd = H.col('رسید');
        const ctx = initialContext(st.slice(H.row + 1), cDate); let lastDate = null;
        for (const r of st.slice(H.row + 1)) {
          const amount = num(r[cAmt]); const sup = txt(r[cSup]); const fno = txt(r[cNo]);
          if (!amount || (!sup && !fno)) { sum.skipped++; continue; }
          const date = parseDate(r[cDate], ctx) || lastDate; if (!date) { sum.skipped++; continue; }
          lastDate = date;
          if (exists('SELECT id FROM purchases p WHERE date=? AND IFNULL(factor_no,\'\')=? AND ABS(net-?)<0.01 AND IFNULL((SELECT name FROM suppliers s WHERE s.id=p.supplier_id),\'\')=?', [date, fno, amount, sup])) { sum.skipped++; continue; }
          const bal = cBal >= 0 ? num(r[cBal]) : 0;
          const status = norm(r[cStat]);
          const paid = status.includes('نشد') && !bal ? 0 : Math.max(0, amount - bal);
          ops.savePurchase({ has_items: 0, factor_no: fno || null, supplier_name: sup || 'نامشخص', date, receiver: txt(r[cRec]) || null, net: amount, paid,
            pay_type: paid >= amount ? 'cash' : 'credit', received: !norm(r[cRecd]).includes('خیر'), notes: 'ورود از اکسل' }, user);
          sum.purchases++;
        }
      }
    }
    // ---------- expenses (مصارف) ----------
    const ex = sheetRows(wb, n => n.includes('مصارف') || n.toLowerCase() === 'expenses');
    if (ex) {
      const H = headerIndex(ex, ['جنس']);
      if (H) {
        sum.sheets.push('مصارف');
        const cDate = H.col('تاریخ'), cItem = H.col('جنس'), cQty = H.col('تعداد'), cPrice = H.col('قیمت'), cTot = H.col('مجموع'), cBy = H.col('توسط');
        const ctx = initialContext(ex.slice(H.row + 1), cDate); let lastDate = null;
        for (const r of ex.slice(H.row + 1)) {
          const item = txt(r[cItem]); const amount = num(r[cTot]) || num(r[cPrice]);
          if (!item || !amount) { sum.skipped++; continue; }
          const date = parseDate(r[cDate], ctx) || lastDate; if (!date) { sum.skipped++; continue; }
          lastDate = date;
          if (exists('SELECT id FROM expenses WHERE date=? AND item=? AND ABS(amount-?)<0.01', [date, item, amount])) { sum.skipped++; continue; }
          const cat = /معاش/.test(item) ? 'معاش کارمندان' : /برق/.test(item) ? 'بل برق' : /وایفا|انترنت|wifi/i.test(item) ? 'انترنت / وایفای' : /شخصی/.test(item) ? 'شخصی'
            : /برگشت/.test(item) ? 'برگشتی' : /سونوگرافی/.test(item) ? 'مواد سونوگرافی' : /کاغذ|ورق|قلم|ماژیک|پلاستیک/.test(item) ? 'قرطاسیه' : /دستمال|جارو|طی/.test(item) ? 'نظافت' : 'سایر';
          db.insert('expenses', { date, category: cat, item, qty: txt(r[cQty]) || null, unit_price: num(r[cPrice]) || null, amount, paid: amount,
            section: cat === 'شخصی' ? 'personal' : 'clinic', by_whom: txt(r[cBy]) || null, note: 'ورود از اکسل', created_by: user.id });
          sum.expenses++;
        }
      }
    }
    // ---------- daily accounts ----------
    const dl = sheetRows(wb, n => n.includes('حسابات') || n.includes('ماهوار'));
    if (dl) {
      const H = headerIndex(dl, ['فروشات']);
      if (H) {
        sum.sheets.push('حسابات ماهوار');
        const cDate = H.col('تاریخ'), cSales = H.col('فروشات'), cWdPh = H.col('برداشتی های داروخانه', 'برداشتی های دواخانه'), cBy = H.col('برداشت توسط', 'توسط'),
          cLab = H.col('لابراتوار'), cWdLab = H.col('برداشتی های لابراتوار'), cPers = H.col('شخصی');
        const ctx = initialContext(dl.slice(H.row + 1), cDate);
        for (const r of dl.slice(H.row + 1)) {
          if (r[cDate] === null || r[cDate] === undefined || r[cDate] === '') { sum.skipped++; continue; }
          const date = parseDate(r[cDate], ctx); if (!date) { sum.skipped++; continue; }
          const sales = num(r[cSales]), lab = cLab >= 0 ? num(r[cLab]) : 0;
          if (!exists('SELECT date FROM legacy_daily WHERE date=?', [date])) {
            db.insert('legacy_daily', { date, pharmacy_sales: sales, lab_income: lab, note: 'ورود از اکسل' }); sum.daily++;
            const by = txt(r[cBy]) || null;
            const add = (amount, section, kind) => { if (amount > 0) { db.insert('withdrawals', { date, section, kind, amount, by_whom: by, note: 'ورود از اکسل', created_by: user.id }); sum.withdrawals++; } };
            add(num(r[cWdPh]), 'pharmacy', 'business');
            if (cWdLab >= 0) add(num(r[cWdLab]), 'lab', 'business');
            if (cPers >= 0) add(num(r[cPers]), 'lab', 'personal');
          } else sum.skipped++;
        }
      }
    }
    // ---------- medicines ----------
    const md = sheetRows(wb, n => n.toLowerCase() === 'medicines' || n.includes('ادویه') || n.includes('دواها'));
    if (md) {
      const H = headerIndex(md, ['اسم']);
      if (H) {
        sum.sheets.push('Medicines');
        const cName = H.col('اسم'), cComp = H.col('کمپانی'), cExp = H.col('انقضاء', 'انقضا'), cQty = H.col('تعداد'), cBuy = H.col('قیمت خرید', 'قیمت  خرید'), cMark = H.col('مفاد'), cSell = H.col('قیمت فروش'), cSup = H.col('فروشنده'), cF = H.col('شماره فاکتور');
        for (const r of md.slice(H.row + 1)) {
          const name = txt(r[cName]); if (!name) { sum.skipped++; continue; }
          const buy = num(r[cBuy]); let markup = num(r[cMark]); if (markup > 0 && markup <= 3) markup = markup * 100;
          const sell = num(r[cSell]) || (buy ? Math.ceil(buy * (1 + (markup || 30) / 100)) : 0);
          let m = db.get('SELECT * FROM medicines WHERE name=? COLLATE NOCASE', [name]);
          const id = ops.saveMedicine({ id: m?.id, name, company: txt(r[cComp]) || m?.company || null, buy_price: buy || m?.buy_price || 0, markup_pct: markup || m?.markup_pct || 30, sell_price: sell || m?.sell_price || 0 }, user);
          const qty = num(r[cQty]);
          if (qty > 0) {
            let exp = r[cExp]; if (exp instanceof Date) exp = iso(exp).slice(0, 7); else exp = txt(exp) || null;
            ops.adjustStock({ medicine_id: id, qty, kind: 'opening', unit_cost: buy, expiry: exp, note: 'موجودی اولیه از اکسل' + (txt(r[cSup]) ? ' — ' + txt(r[cSup]) : '') + (txt(r[cF]) ? ' فاکتور ' + txt(r[cF]) : '') }, user);
          }
          sum.medicines++;
        }
      }
    }
  });
  db.audit(user, 'import', 'excel', null, JSON.stringify(sum));
  return sum;
}

module.exports = { importWorkbook, solarToISO, parseDate };
