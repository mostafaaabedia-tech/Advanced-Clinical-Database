/* Clinical decision support: ICD-10 codes for common diagnoses, allergy / interaction / duplicate warnings.
   These are reminders for the doctor — the doctor always decides. */
'use strict';

// common diagnoses in paediatrics, gynaecology / obstetrics and general OPD (ICD-10)
const ICD10 = [
  ['J06.9', 'Acute upper respiratory infection (URTI)'], ['J00', 'Common cold (acute nasopharyngitis)'], ['J02.9', 'Acute pharyngitis'], ['J03.9', 'Acute tonsillitis'],
  ['J20.9', 'Acute bronchitis'], ['J21.9', 'Acute bronchiolitis'], ['J18.9', 'Pneumonia, unspecified'], ['J45.9', 'Asthma'], ['J30.4', 'Allergic rhinitis'], ['J01.9', 'Acute sinusitis'],
  ['H66.9', 'Otitis media'], ['H10.9', 'Conjunctivitis'], ['A09', 'Gastroenteritis / infectious diarrhoea'], ['E86.0', 'Dehydration'], ['A06.0', 'Acute amoebic dysentery'],
  ['A03.9', 'Shigellosis (bacillary dysentery)'], ['B82.9', 'Intestinal parasitism'], ['B77.9', 'Ascariasis'], ['K59.0', 'Constipation'], ['K21.9', 'Gastro-oesophageal reflux disease'],
  ['K29.7', 'Gastritis'], ['K27.9', 'Peptic ulcer'], ['R10.4', 'Abdominal pain'], ['R11', 'Nausea and vomiting'], ['R50.9', 'Fever, unspecified'], ['A01.0', 'Typhoid fever'],
  ['A23.9', 'Brucellosis'], ['B54', 'Malaria'], ['B05.9', 'Measles'], ['B01.9', 'Varicella (chickenpox)'], ['N39.0', 'Urinary tract infection'], ['N10', 'Acute pyelonephritis'],
  ['D50.9', 'Iron deficiency anaemia'], ['D64.9', 'Anaemia, unspecified'], ['E44.0', 'Moderate protein-energy malnutrition'], ['E43', 'Severe acute malnutrition'], ['E55.0', 'Rickets (vitamin D deficiency)'],
  ['P59.9', 'Neonatal jaundice'], ['P36.9', 'Neonatal sepsis'], ['L20.9', 'Atopic dermatitis (eczema)'], ['L22', 'Diaper dermatitis'], ['B86', 'Scabies'], ['L01.0', 'Impetigo'], ['B35.9', 'Dermatophytosis (tinea)'],
  ['G40.9', 'Epilepsy'], ['R56.0', 'Febrile convulsions'], ['G44.2', 'Tension-type headache'], ['G43.9', 'Migraine'], ['I10', 'Essential hypertension'], ['E11.9', 'Type 2 diabetes mellitus'],
  ['E03.9', 'Hypothyroidism'], ['E05.9', 'Hyperthyroidism'], ['M54.5', 'Low back pain'], ['M79.1', 'Myalgia'],
  ['Z34.9', 'Normal pregnancy — antenatal care'], ['O20.0', 'Threatened abortion'], ['O03.9', 'Spontaneous abortion'], ['O21.0', 'Mild hyperemesis gravidarum'], ['O14.9', 'Pre-eclampsia'],
  ['O24.4', 'Gestational diabetes'], ['O99.0', 'Anaemia complicating pregnancy'], ['O23.4', 'Urinary infection in pregnancy'], ['O36.5', 'Fetal growth restriction (care for poor fetal growth)'],
  ['Z30.0', 'Contraceptive counselling'], ['Z39.2', 'Routine postpartum follow-up'], ['N76.0', 'Acute vaginitis'], ['B37.3', 'Vulvovaginal candidiasis'], ['N73.9', 'Pelvic inflammatory disease'],
  ['N94.6', 'Dysmenorrhoea'], ['N92.0', 'Heavy menstrual bleeding'], ['N91.2', 'Amenorrhoea'], ['E28.2', 'Polycystic ovary syndrome'], ['N97.9', 'Female infertility'], ['N95.1', 'Menopausal symptoms'],
  ['N83.2', 'Ovarian cyst'], ['D25.9', 'Uterine leiomyoma (fibroid)'], ['N60.1', 'Fibrocystic breast disease'], ['Z00.1', 'Routine child health examination'], ['Z23', 'Vaccination']
];

// allergy words → medicines (generic / brand words) that should raise a warning
const ALLERGY_CLASSES = [
  [/penicill|پنسلین|amoxi|ampi/i, /amoxi|ampicill|penicill|co-amoxiclav|augmentin|cloxacill|clavulan/i, 'پنسلین'],
  [/cephalo|سفالو|cef/i, /cef|ceph/i, 'سفالوسپورین'],
  [/sulfa|سلفا|cotrim/i, /cotrimoxazole|sulfamethoxazole|trimethoprim|sulfa/i, 'سلفا'],
  [/nsaid|aspirin|اسپرین|ibuprofen|diclofenac/i, /ibuprofen|diclofenac|mefenamic|aspirin|naproxen|piroxicam|ketorolac/i, 'ضد التهاب غیر استروئیدی (NSAID)'],
  [/macrolide|azithro|erythro|clarithro/i, /azithro|erythro|clarithro|zetro/i, 'ماکرولید'],
  [/quinolone|cipro|levoflox/i, /ciproflox|levoflox|ofloxacin|norflox|moxiflox/i, 'کینولون'],
  [/metronidazol|tinidazol/i, /metronidazol|tinidazol|secnidazol/i, 'نیتروایمیدازول']
];
// well-known interactions (by generic keywords) — short Persian advice
const INTERACTIONS = [
  [/ciproflox|levoflox|doxycycl|tetracycl/i, /antacid|aluminium|magnesium|calcium|ferrous|iron|zinc/i, 'جذب انتی‌بیوتیک با انتاسید / کلسیم / آهن / زینک کم می‌شود — حداقل ۲ ساعت فاصله داده شود.'],
  [/clarithro|erythro/i, /atorvastatin|simvastatin/i, 'خطر آسیب عضلات (میوپاتی) — استاتین را موقتاً قطع یا دوز را کم کنید.'],
  [/fluconazol|ketoconazol/i, /atorvastatin|simvastatin/i, 'خطر میوپاتی با استاتین.'],
  [/domperidon/i, /clarithro|erythro|azithro|fluconazol|ketoconazol|ondansetron/i, 'خطر طولانی شدن QT (اختلال ریتم قلب).'],
  [/ondansetron/i, /azithro|clarithro|fluconazol/i, 'خطر طولانی شدن QT.'],
  [/ibuprofen|diclofenac|mefenamic|naproxen|aspirin/i, /prednisolon|dexamethason|betamethason|hydrocortison/i, 'NSAID با کورتیکواستروئید: خطر زخم و خونریزی معده.'],
  [/ibuprofen|diclofenac|mefenamic|naproxen/i, /losartan|captopril|enalapril|lisinopril/i, 'NSAID اثر داروی فشار را کم و خطر آسیب کلیه را زیاد می‌کند.'],
  [/diazepam|clonazepam|alprazolam/i, /phenobarbital|chlorpheniramine|hydroxyzine|promethazine/i, 'خواب‌آوری و ضعف تنفس شدیدتر می‌شود.'],
  [/metronidazol/i, /warfarin/i, 'اثر وارفارین زیاد می‌شود (خطر خونریزی).'],
  [/sodium valproate|valpro/i, /phenobarbital/i, 'تغییر سطح خونی داروهای ضد تشنج — نظارت شود.']
];
const NSAIDS = /ibuprofen|diclofenac|mefenamic|naproxen|aspirin|piroxicam|ketorolac/i;

// items: [{name, generic?}] ; patient: {allergies}; labs: [{test_id, date}] ; returns array of warning strings
function cdssCheck({ items = [], patient = {}, testIds = [], recentLabs = [], catalog = null }) {
  if (App.settings.cdss_enabled === '0') return [];
  const out = [];
  const label = (i) => `${i.name}${i.generic && i.generic !== i.name ? ' (' + i.generic + ')' : ''}`;
  const txt = (i) => `${i.name || ''} ${i.generic || ''}`;
  const allergy = String(patient.allergies || '').trim();
  if (allergy) for (const i of items) {
    const t = txt(i);
    const direct = allergy.split(/[،,;\/\n]+/).map(s => s.trim()).filter(s => s.length > 2).some(a => t.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(String(i.generic || '').toLowerCase() || '@@'));
    const cls = ALLERGY_CLASSES.find(([a, m]) => a.test(allergy) && m.test(t));
    if (direct || cls) out.push(`⚠ حساسیت: مریض به «${allergy}» حساسیت دارد — ${label(i)}${cls ? ' (گروه ' + cls[2] + ')' : ''}`);
  }
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const A = txt(items[a]), B = txt(items[b]);
    const ga = String(items[a].generic || items[a].name || '').toLowerCase().trim(), gb = String(items[b].generic || items[b].name || '').toLowerCase().trim();
    if (ga && ga === gb) out.push(`⚠ دوای تکراری: ${label(items[a])} و ${label(items[b])} یک ماده دارند.`);
    else if (NSAIDS.test(A) && NSAIDS.test(B)) out.push(`⚠ دو داروی NSAID هم‌زمان: ${items[a].name} + ${items[b].name} — خطر خونریزی معده.`);
    for (const [x, y, msg] of INTERACTIONS) if ((x.test(A) && y.test(B)) || (x.test(B) && y.test(A))) out.push(`⚠ تداخل: ${items[a].name} + ${items[b].name} — ${msg}`);
  }
  const days = Number(App.settings.dup_lab_days || 7);
  if (catalog && testIds.length && recentLabs.length) {
    const lim = isoDate(addDays(new Date(), -days));
    for (const id of testIds) {
      const prev = recentLabs.find(l => l.date >= lim && (l.items || []).some(it => it.test_id === id));
      if (prev) { const t = catalog.byId.get(id); out.push(`ℹ آزمایش تکراری: ${t ? t.code : id} در ${fmtDate(prev.date)} (${prev.lab_code}) هم درخواست شده بود.`); }
    }
  }
  return [...new Set(out)];
}

// ================================================================ prescription wording in English (Sig: 1 × 4 / day)
// old Persian list values (saved in earlier prescriptions) are translated when printed
const RX_EN = {
  'روزانه یک بار': '1 / day', 'روزانه دو بار': '2 / day', 'روزانه سه بار': '3 / day', 'روزانه چهار بار': '4 / day',
  'هر ۶ ساعت': 'every 6 h', 'هر ۸ ساعت': 'every 8 h', 'هر ۱۲ ساعت': 'every 12 h', 'هر ۴ ساعت': 'every 4 h', 'صبح‌ها': 'every morning', 'شب‌ها': 'every night',
  'یک روز در میان': 'alternate days', 'دو روز در میان': 'every 3rd day', 'هفته یک بار': 'once a week', 'هفته دو بار': 'twice a week', 'در صورت ضرورت': 'when needed (PRN)', 'یک دفعه': 'once (STAT)',
  'بعد از غذا': 'After meal', 'قبل از غذا': 'Before meal', 'همراه غذا': 'With meal', 'ناشتا': 'Empty stomach', 'قبل از خواب': 'At bedtime',
  'خوراکی': 'Oral', 'زیر زبانی': 'Sublingual', 'عضلی (IM)': 'IM', 'وریدی (IV)': 'IV', 'زیر جلدی': 'SC', 'موضعی': 'Topical', 'مهبلی': 'Vaginal', 'مقعدی': 'Rectal', 'استنشاقی': 'Inhalation', 'چشمی': 'Eye', 'گوش': 'Ear', 'بینی': 'Nasal',
  'روز': 'days', 'شب': 'nights', 'هفته': 'weeks', 'ماه': 'months'
};
const rxEn = (v) => { const s = String(v ?? '').trim(); return RX_EN[s] || s; };
// times per day of a frequency (English or Persian)
const FREQ_PER_DAY = [[/^\s*(\d+)\s*(?:×|x)?\s*\/\s*day/i, null], [/every\s*4\s*h/i, 6], [/every\s*6\s*h/i, 4], [/every\s*8\s*h/i, 3], [/every\s*12\s*h/i, 2], [/morning|night|once a day|daily|1\s*\/\s*day/i, 1],
  [/alternate/i, 1 / 2], [/every 3rd day|every 2 days/i, 1 / 3], [/twice a week/i, 2 / 7], [/once a week|weekly/i, 1 / 7]];
function rxTimesPerDay(f) {
  const s = rxEn(f);
  for (const [re, n] of FREQ_PER_DAY) { const m = s.match(re); if (m) return n === null ? Number(m[1]) : n; }
  return null;
}
// how many days the medicine is taken, from duration + unit (alternate days, selected dates …)
function rxDays(it) {
  const u = rxEn(it.duration_unit || 'days').toLowerCase(), d = Number(it.duration || 0);
  if (/date/.test(u)) return String(it.dates || '').split(',').filter(Boolean).length;
  if (/week/.test(u)) return d * 7;
  if (/month/.test(u)) return d * 30;
  return d;
}
// "1 × 4 / day" · "5 ml every 8 h" · "1 · when needed (PRN)"
function rxSigEn(it) {
  const f = rxEn(it.frequency), dose = String(it.dose || '').trim() || '1';
  if (!f) return dose;
  const m = f.match(/^\s*(\d+)\s*\/\s*day/i);
  if (m) return `${dose} × ${m[1]} / day`;
  return `${dose} · ${f}`;
}
function rxDurationEn(it) {
  const u = rxEn(it.duration_unit || 'days');
  if (/date/i.test(u)) { const ds = String(it.dates || '').split(',').filter(Boolean); return ds.length ? ds.map(d => fmtDateNum(d).slice(5)).join(', ') : ''; }
  if (!it.duration) return '';
  const n = fmtNum(it.duration);
  if (/alternate|every 2 days|every 3rd/i.test(u)) return `${n} days (${u})`;
  return `${n} ${Number(it.duration) === 1 ? u.replace(/s$/, '') : u}`;
}
