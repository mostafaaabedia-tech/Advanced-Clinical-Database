// Default laboratory test catalog (seeded on first run).
// Reference ranges are common adult reference intervals in conventional units.
// IMPORTANT: every laboratory must verify ranges against its own analyzer / kit inserts
// and adjust prices — both are editable inside the app (Tests & Prices).

const departments = [
  ['HEM', 'Hematology', 'هماتولوژی'],
  ['COAG', 'Coagulation', 'انعقاد خون'],
  ['BIO', 'Clinical Biochemistry', 'بیوشیمی'],
  ['ELEC', 'Electrolytes & Minerals', 'الکترولیت‌ها و املاح'],
  ['DIAB', 'Diabetes', 'دیابت'],
  ['CARD', 'Cardiac Markers', 'مارکرهای قلبی'],
  ['END', 'Endocrinology / Hormones', 'هورمون‌ها'],
  ['TUM', 'Tumor Markers', 'مارکرهای تومور'],
  ['VIT', 'Vitamins & Nutrition', 'ویتامین‌ها'],
  ['IMM', 'Immunology & Inflammation', 'ایمونولوژی'],
  ['SER', 'Serology / Infectious Diseases', 'سرولوژی و بیماری‌های عفونی'],
  ['AUTO', 'Autoimmune', 'اتوایمیون'],
  ['ALL', 'Allergy', 'حساسیت'],
  ['URI', 'Urinalysis', 'ادرار'],
  ['STL', 'Stool Examination', 'مدفوع'],
  ['MIC', 'Microbiology', 'میکروبیولوژی'],
  ['BB', 'Blood Bank', 'بانک خون'],
  ['FLU', 'Body Fluids', 'مایعات بدن'],
  ['SEM', 'Andrology / Semen', 'منی'],
  ['TDM', 'Drug Monitoring & Toxicology', 'سطح دارو و سم‌شناسی'],
  ['MOL', 'Molecular Diagnostics (PCR)', 'تشخیص مولکولی'],
  ['ABG', 'Blood Gases', 'گازهای خون'],
  ['PATH', 'Histopathology & Cytology', 'پاتولوژی و سیتولوژی']
];

const sampleTypes = [
  ['EDTA', 'Whole Blood (EDTA)', 'خون کامل (EDTA)', 'Lavender cap'],
  ['SER', 'Serum', 'سرم', 'Red / Yellow cap'],
  ['CIT', 'Plasma (Citrate)', 'پلاسما (سیترات)', 'Light blue cap'],
  ['FLU', 'Plasma (Fluoride)', 'پلاسما (فلوراید)', 'Grey cap'],
  ['HEP', 'Plasma (Heparin)', 'پلاسما (هپارین)', 'Green cap'],
  ['ART', 'Arterial Blood', 'خون شریانی', 'Heparinized syringe'],
  ['UR', 'Urine (Random)', 'ادرار', 'Urine cup'],
  ['U24', 'Urine (24 hours)', 'ادرار ۲۴ ساعته', '24h container'],
  ['ST', 'Stool', 'مدفوع', 'Stool cup'],
  ['CSF', 'Cerebrospinal Fluid', 'مایع مغزی نخاعی', 'Sterile tube'],
  ['SEM', 'Semen', 'منی', 'Sterile cup'],
  ['SWB', 'Swab', 'سواب', 'Swab + transport medium'],
  ['SPT', 'Sputum', 'خلط', 'Sterile cup'],
  ['BF', 'Body Fluid', 'مایع بدن', 'Sterile tube'],
  ['TIS', 'Tissue', 'بافت', 'Formalin container'],
  ['NPS', 'Nasopharyngeal Swab', 'سواب بینی-حلق', 'VTM tube'],
  ['BLD', 'Whole Blood', 'خون کامل', 'Blood culture bottle']
];

// ---- helpers ----
const POSNEG = ['Negative', 'Positive'];
const REACT = ['Non-Reactive', 'Reactive'];
const DETECT = ['Not Detected', 'Detected'];
const GRADE = ['Negative', 'Trace', '1+', '2+', '3+', '4+'];
const SEEN = ['Not seen', 'Seen'];

const tests = [];
const panels = [];

function days(a) {
  if (a === null || a === undefined || a === '') return null;
  if (typeof a === 'number') return Math.round(a * 365.25);
  const m = String(a).match(/^(\d+(?:\.\d+)?)([dmy])$/);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2] === 'd' ? Math.round(v) : m[2] === 'm' ? Math.round(v * 30.44) : Math.round(v * 365.25);
}

// t(code, name, dept, sample, unit, low, high, price, opts)
// opts: fa, r:[[sex,ageFrom,ageTo,low,high,text]], crit:[lo,hi], type, opt:[...], text, f (formula),
//       dec, ord:false (not orderable alone), method, tat, cost
function t(code, name, dept, sample, unit, low, high, price, o = {}) {
  tests.push({
    code, name, dept, sample, unit: unit || null,
    low: low ?? null, high: high ?? null, price: price || 0,
    name_fa: o.fa || null,
    result_type: o.type || (o.opt ? 'option' : 'numeric'),
    options: o.opt ? JSON.stringify(o.opt) : null,
    ref_text: o.text ?? (o.opt ? o.opt[0] : null),
    critical_low: o.crit ? o.crit[0] ?? null : null,
    critical_high: o.crit ? o.crit[1] ?? null : null,
    formula: o.f || null,
    decimals: o.dec ?? null,
    orderable: o.ord === false ? 0 : 1,
    method: o.method || null,
    tat_hours: o.tat || 24,
    cost: o.cost || 0,
    ranges: (o.r || []).map(([sex, from, to, lo, hi, text]) => ({
      sex, age_min_days: days(from), age_max_days: days(to), low: lo ?? null, high: hi ?? null, text: text || null
    }))
  });
}
// p(code, name, dept, sample, price, [component codes], opts)
function p(code, name, dept, sample, price, items, o = {}) {
  panels.push({ code, name, dept, sample, price, items, name_fa: o.fa || null, tat_hours: o.tat || 24, method: o.method || null });
}
const NO = { ord: false };
const C = (x) => ({ ...NO, ...x });           // component only (not sold alone)
const TXT = (x = {}) => ({ type: 'text', ...x });
const MEMO = (x = {}) => ({ type: 'memo', ...x });

// =====================================================================
// HEMATOLOGY
// =====================================================================
t('WBC', 'WBC (Total Leukocyte Count)', 'HEM', 'EDTA', '10³/µL', 4.0, 11.0, 0, C({ crit: [2, 30], dec: 1, r: [['A', '0d', '30d', 9, 30], ['A', '30d', 2, 6, 17.5], ['A', 2, 12, 5, 14.5]] }));
t('RBC', 'RBC (Erythrocyte Count)', 'HEM', 'EDTA', '10⁶/µL', 4.1, 5.9, 0, C({ dec: 2, r: [['M', 12, null, 4.5, 5.9], ['F', 12, null, 4.1, 5.1], ['A', 0, 12, 4.0, 5.2]] }));
t('HGB', 'Hemoglobin (Hb)', 'HEM', 'EDTA', 'g/dL', 12.0, 17.5, 150, { fa: 'هموگلوبین', crit: [7, 20], dec: 1, r: [['A', '0d', '30d', 14, 24], ['A', '30d', 1, 10, 14], ['A', 1, 12, 11.5, 15.5], ['M', 12, null, 13.5, 17.5], ['F', 12, null, 12.0, 15.5]] });
t('HCT', 'Hematocrit (HCT / PCV)', 'HEM', 'EDTA', '%', 36, 53, 0, C({ crit: [20, 60], dec: 1, r: [['A', '0d', '30d', 44, 64], ['A', '30d', 12, 34, 45], ['M', 12, null, 41, 53], ['F', 12, null, 36, 46]] }));
t('MCV', 'MCV', 'HEM', 'EDTA', 'fL', 80, 100, 0, C({ f: '{HCT}*10/{RBC}', dec: 1 }));
t('MCH', 'MCH', 'HEM', 'EDTA', 'pg', 27, 33, 0, C({ f: '{HGB}*10/{RBC}', dec: 1 }));
t('MCHC', 'MCHC', 'HEM', 'EDTA', 'g/dL', 32, 36, 0, C({ f: '{HGB}*100/{HCT}', dec: 1 }));
t('RDWCV', 'RDW-CV', 'HEM', 'EDTA', '%', 11.5, 14.5, 0, C({ dec: 1 }));
t('RDWSD', 'RDW-SD', 'HEM', 'EDTA', 'fL', 39, 46, 0, C({ dec: 1 }));
t('PLT', 'Platelet Count', 'HEM', 'EDTA', '10³/µL', 150, 450, 150, { fa: 'پلاکت', crit: [20, 1000], dec: 0 });
t('MPV', 'MPV', 'HEM', 'EDTA', 'fL', 7.5, 11.5, 0, C({ dec: 1 }));
t('PDW', 'PDW', 'HEM', 'EDTA', 'fL', 9, 17, 0, C({ dec: 1 }));
t('PCT', 'Plateletcrit (PCT)', 'HEM', 'EDTA', '%', 0.17, 0.35, 0, C({ dec: 2 }));
t('NEUT%', 'Neutrophils %', 'HEM', 'EDTA', '%', 40, 75, 0, C({ dec: 1 }));
t('LYMPH%', 'Lymphocytes %', 'HEM', 'EDTA', '%', 20, 45, 0, C({ dec: 1, r: [['A', '0d', 12, 25, 60]] }));
t('MONO%', 'Monocytes %', 'HEM', 'EDTA', '%', 2, 10, 0, C({ dec: 1 }));
t('EOS%', 'Eosinophils %', 'HEM', 'EDTA', '%', 1, 6, 0, C({ dec: 1 }));
t('BASO%', 'Basophils %', 'HEM', 'EDTA', '%', 0, 1, 0, C({ dec: 1 }));
t('DIFFT', 'Differential Total', 'HEM', 'EDTA', '%', 100, 100, 0, C({ f: '{NEUT%}+{LYMPH%}+{MONO%}+{EOS%}+{BASO%}', dec: 0 }));
t('NEUT#', 'Neutrophils (Absolute)', 'HEM', 'EDTA', '10³/µL', 2.0, 7.5, 0, C({ f: '{WBC}*{NEUT%}/100', dec: 2, crit: [0.5, null] }));
t('LYMPH#', 'Lymphocytes (Absolute)', 'HEM', 'EDTA', '10³/µL', 1.0, 4.0, 0, C({ f: '{WBC}*{LYMPH%}/100', dec: 2 }));
t('MONO#', 'Monocytes (Absolute)', 'HEM', 'EDTA', '10³/µL', 0.2, 1.0, 0, C({ f: '{WBC}*{MONO%}/100', dec: 2 }));
t('EOS#', 'Eosinophils (Absolute)', 'HEM', 'EDTA', '10³/µL', 0.02, 0.5, 0, C({ f: '{WBC}*{EOS%}/100', dec: 2 }));
t('BASO#', 'Basophils (Absolute)', 'HEM', 'EDTA', '10³/µL', 0, 0.1, 0, C({ f: '{WBC}*{BASO%}/100', dec: 2 }));
p('CBC', 'Complete Blood Count (CBC + Differential)', 'HEM', 'EDTA', 300,
  ['WBC', 'RBC', 'HGB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDWCV', 'RDWSD', 'PLT', 'MPV', 'PDW', 'PCT',
   'NEUT%', 'LYMPH%', 'MONO%', 'EOS%', 'BASO%', 'DIFFT', 'NEUT#', 'LYMPH#', 'MONO#', 'EOS#', 'BASO#'], { fa: 'آزمایش کامل خون' });
t('ESR', 'ESR (Westergren)', 'HEM', 'EDTA', 'mm/1st hr', 0, 20, 100, { fa: 'سرعت رسوب', r: [['M', 0, 50, 0, 15], ['M', 50, null, 0, 20], ['F', 0, 50, 0, 20], ['F', 50, null, 0, 30]] });
t('RETIC', 'Reticulocyte Count', 'HEM', 'EDTA', '%', 0.5, 2.5, 200, { dec: 1 });
t('AEC', 'Absolute Eosinophil Count', 'HEM', 'EDTA', 'cells/µL', 40, 440, 200);
t('PBS', 'Peripheral Blood Smear (Morphology)', 'HEM', 'EDTA', null, null, null, 350, MEMO({ text: 'Normocytic normochromic RBCs' }));
t('MP', 'Malaria Parasite (Blood Film)', 'HEM', 'EDTA', null, null, null, 150, { opt: ['Not seen', 'P. vivax seen', 'P. falciparum seen', 'Mixed infection seen'] });
t('SICK', 'Sickling Test', 'HEM', 'EDTA', null, null, null, 250, { opt: POSNEG });
t('G6PD', 'G6PD (Quantitative)', 'HEM', 'EDTA', 'U/g Hb', 4.6, 13.5, 700, { dec: 1 });
t('G6PDQ', 'G6PD Screening (Qualitative)', 'HEM', 'EDTA', null, null, null, 400, { opt: ['Normal activity', 'Deficient'] });
t('HBA', 'HbA', 'HEM', 'EDTA', '%', 95, 98, 0, C({ dec: 1 }));
t('HBA2', 'HbA2', 'HEM', 'EDTA', '%', 2.0, 3.5, 0, C({ dec: 1 }));
t('HBF', 'HbF', 'HEM', 'EDTA', '%', 0, 2, 0, C({ dec: 1 }));
t('HBS', 'HbS', 'HEM', 'EDTA', '%', 0, 0, 0, C({ dec: 1 }));
t('HBEINT', 'Electrophoresis Interpretation', 'HEM', 'EDTA', null, null, null, 0, C({ type: 'memo', text: 'Normal hemoglobin pattern' }));
p('HBEP', 'Hemoglobin Electrophoresis', 'HEM', 'EDTA', 1800, ['HBA', 'HBA2', 'HBF', 'HBS', 'HBEINT'], { tat: 72 });
t('OSMFRAG', 'Osmotic Fragility Test', 'HEM', 'EDTA', null, null, null, 800, MEMO({ text: 'Normal' }));
t('LECELL', 'LE Cell Test', 'HEM', 'EDTA', null, null, null, 400, { opt: ['Not seen', 'Seen'] });

// =====================================================================
// COAGULATION
// =====================================================================
t('BT', 'Bleeding Time (BT)', 'COAG', 'EDTA', 'min', 2, 7, 100, { dec: 1 });
t('CT', 'Clotting Time (CT)', 'COAG', 'EDTA', 'min', 5, 11, 100, { dec: 1 });
p('BTCT', 'Bleeding & Clotting Time', 'COAG', 'EDTA', 180, ['BT', 'CT']);
t('PT', 'Prothrombin Time (PT)', 'COAG', 'CIT', 'sec', 11, 13.5, 250, { dec: 1, crit: [null, 30] });
t('INR', 'INR', 'COAG', 'CIT', null, 0.8, 1.2, 0, C({ f: 'pow({PT}/PTC,ISI)', dec: 2, crit: [null, 5], text: 'Therapeutic (warfarin): 2.0 - 3.0' }));
p('PTINR', 'PT / INR', 'COAG', 'CIT', 300, ['PT', 'INR']);
t('APTT', 'APTT (PTT)', 'COAG', 'CIT', 'sec', 25, 35, 300, { dec: 1, crit: [null, 100] });
t('TT', 'Thrombin Time (TT)', 'COAG', 'CIT', 'sec', 14, 19, 400, { dec: 1 });
t('FIB', 'Fibrinogen', 'COAG', 'CIT', 'mg/dL', 200, 400, 600, { crit: [100, null] });
t('DDIM', 'D-Dimer', 'COAG', 'CIT', 'µg/mL FEU', 0, 0.5, 900, { dec: 2 });
t('FDP', 'Fibrin Degradation Products (FDP)', 'COAG', 'CIT', 'µg/mL', 0, 10, 800);
t('F8', 'Factor VIII Activity', 'COAG', 'CIT', '%', 50, 150, 2500, { tat: 72 });
t('F9', 'Factor IX Activity', 'COAG', 'CIT', '%', 50, 150, 2500, { tat: 72 });
t('VWF', 'von Willebrand Factor Antigen', 'COAG', 'CIT', '%', 50, 160, 2500, { tat: 72 });
t('PROTC', 'Protein C Activity', 'COAG', 'CIT', '%', 70, 140, 2500, { tat: 72 });
t('PROTS', 'Protein S Activity', 'COAG', 'CIT', '%', 60, 140, 2500, { tat: 72 });
t('AT3', 'Antithrombin III', 'COAG', 'CIT', '%', 80, 120, 2500, { tat: 72 });
t('LUPAC', 'Lupus Anticoagulant (dRVVT)', 'COAG', 'CIT', null, null, null, 2500, { opt: ['Not detected', 'Detected'], tat: 72 });
p('COAGP', 'Coagulation Profile', 'COAG', 'CIT', 1100, ['PT', 'INR', 'APTT', 'FIB']);

// =====================================================================
// DIABETES
// =====================================================================
t('GLUF', 'Glucose (Fasting)', 'DIAB', 'FLU', 'mg/dL', 70, 99, 80, { fa: 'قند ناشتا', crit: [40, 450], text: 'Normal 70-99 | Prediabetes 100-125 | Diabetes ≥126' });
t('GLUR', 'Glucose (Random)', 'DIAB', 'FLU', 'mg/dL', 70, 140, 80, { fa: 'قند تصادفی', crit: [40, 450] });
t('GLU2H', 'Glucose (2h Postprandial)', 'DIAB', 'FLU', 'mg/dL', 70, 140, 80, { crit: [40, 450] });
t('GTT0', 'GTT - Fasting', 'DIAB', 'FLU', 'mg/dL', 70, 99, 0, C({}));
t('GTT1', 'GTT - 1 hour', 'DIAB', 'FLU', 'mg/dL', null, 180, 0, C({}));
t('GTT2', 'GTT - 2 hours', 'DIAB', 'FLU', 'mg/dL', null, 140, 0, C({}));
p('GTT', 'Oral Glucose Tolerance Test (75 g)', 'DIAB', 'FLU', 350, ['GTT0', 'GTT1', 'GTT2']);
t('GCT', 'Glucose Challenge Test (50 g, 1h)', 'DIAB', 'FLU', 'mg/dL', null, 140, 200);
t('HBA1C', 'HbA1c (Glycated Hemoglobin)', 'DIAB', 'EDTA', '%', 4.0, 5.6, 600, { fa: 'قند سه ماهه', dec: 1, text: 'Normal <5.7 | Prediabetes 5.7-6.4 | Diabetes ≥6.5' });
t('EAG', 'Estimated Average Glucose (eAG)', 'DIAB', 'EDTA', 'mg/dL', null, 117, 0, C({ f: '28.7*{HBA1C}-46.7', dec: 0 }));
p('HBA1CP', 'HbA1c with eAG', 'DIAB', 'EDTA', 600, ['HBA1C', 'EAG']);
t('INS', 'Insulin (Fasting)', 'DIAB', 'SER', 'µIU/mL', 2.6, 24.9, 800, { dec: 1 });
t('HOMA', 'HOMA-IR', 'DIAB', 'SER', null, null, 2.5, 0, C({ f: '{GLUF}*{INS}/405', dec: 2 }));
p('INSR', 'Insulin Resistance (Glucose + Insulin + HOMA-IR)', 'DIAB', 'SER', 900, ['GLUF', 'INS', 'HOMA']);
t('CPEP', 'C-Peptide', 'DIAB', 'SER', 'ng/mL', 1.1, 4.4, 1000, { dec: 2 });
t('FRUCT', 'Fructosamine', 'DIAB', 'SER', 'µmol/L', 205, 285, 800);
t('KETS', 'Ketones (Serum, β-hydroxybutyrate)', 'DIAB', 'SER', 'mmol/L', 0, 0.6, 500, { dec: 2 });

// =====================================================================
// CLINICAL BIOCHEMISTRY
// =====================================================================
// Liver
t('TBIL', 'Bilirubin Total', 'BIO', 'SER', 'mg/dL', 0.1, 1.2, 150, { dec: 2, crit: [null, 15], r: [['A', '0d', '2d', 0, 8.7], ['A', '2d', '6d', 0, 12], ['A', '6d', '30d', 0, 1.5]] });
t('DBIL', 'Bilirubin Direct', 'BIO', 'SER', 'mg/dL', 0, 0.3, 150, { dec: 2 });
t('IBIL', 'Bilirubin Indirect', 'BIO', 'SER', 'mg/dL', 0.1, 1.0, 0, C({ f: '{TBIL}-{DBIL}', dec: 2 }));
p('BILP', 'Bilirubin (Total, Direct, Indirect)', 'BIO', 'SER', 250, ['TBIL', 'DBIL', 'IBIL']);
t('ALT', 'ALT (SGPT)', 'BIO', 'SER', 'U/L', 7, 56, 150, { r: [['M', 12, null, 7, 55], ['F', 12, null, 7, 45]] });
t('AST', 'AST (SGOT)', 'BIO', 'SER', 'U/L', 10, 40, 150);
t('ALP', 'Alkaline Phosphatase (ALP)', 'BIO', 'SER', 'U/L', 44, 147, 200, { r: [['A', 0, 1, 80, 470], ['A', 1, 10, 100, 390], ['A', 10, 18, 50, 500], ['A', 18, null, 44, 147]] });
t('GGT', 'Gamma GT (GGT)', 'BIO', 'SER', 'U/L', 5, 61, 250, { r: [['M', 0, null, 8, 61], ['F', 0, null, 5, 36]] });
t('TP', 'Total Protein', 'BIO', 'SER', 'g/dL', 6.0, 8.3, 150, { dec: 1 });
t('ALB', 'Albumin', 'BIO', 'SER', 'g/dL', 3.5, 5.0, 150, { dec: 1 });
t('GLOB', 'Globulin', 'BIO', 'SER', 'g/dL', 2.0, 3.5, 0, C({ f: '{TP}-{ALB}', dec: 1 }));
t('AGR', 'A/G Ratio', 'BIO', 'SER', null, 1.1, 2.5, 0, C({ f: '{ALB}/({TP}-{ALB})', dec: 2 }));
p('LFT', 'Liver Function Tests (LFT)', 'BIO', 'SER', 900,
  ['TBIL', 'DBIL', 'IBIL', 'ALT', 'AST', 'ALP', 'GGT', 'TP', 'ALB', 'GLOB', 'AGR'], { fa: 'تست‌های کبدی' });
t('LDH', 'LDH (Lactate Dehydrogenase)', 'BIO', 'SER', 'U/L', 140, 280, 300);
t('AMY', 'Amylase', 'BIO', 'SER', 'U/L', 28, 100, 300);
t('LIP', 'Lipase', 'BIO', 'SER', 'U/L', 13, 60, 400);
p('PANC', 'Pancreatic Enzymes (Amylase + Lipase)', 'BIO', 'SER', 600, ['AMY', 'LIP']);
t('NH3', 'Ammonia', 'BIO', 'HEP', 'µmol/L', 11, 32, 900, { crit: [null, 100] });
t('LACT', 'Lactate', 'BIO', 'FLU', 'mmol/L', 0.5, 2.2, 700, { dec: 1, crit: [null, 4] });
t('CERU', 'Ceruloplasmin', 'BIO', 'SER', 'mg/dL', 20, 60, 1000);
t('ACE', 'Angiotensin Converting Enzyme (ACE)', 'BIO', 'SER', 'U/L', 8, 52, 1200);
t('CHE', 'Cholinesterase (Pseudo)', 'BIO', 'SER', 'U/L', 5300, 12900, 800);
t('OSM', 'Osmolality (Serum)', 'BIO', 'SER', 'mOsm/kg', 275, 295, 600);
// Kidney
t('UREA', 'Urea', 'BIO', 'SER', 'mg/dL', 15, 45, 120, { fa: 'یوریا' });
t('BUN', 'BUN (Blood Urea Nitrogen)', 'BIO', 'SER', 'mg/dL', 7, 20, 0, C({ f: '{UREA}*0.467', dec: 1 }));
t('CREA', 'Creatinine', 'BIO', 'SER', 'mg/dL', 0.6, 1.3, 120, { fa: 'کریاتینین', dec: 2, crit: [null, 10], r: [['A', 0, 12, 0.3, 0.7], ['M', 12, null, 0.7, 1.3], ['F', 12, null, 0.6, 1.1]] });
t('UA', 'Uric Acid', 'BIO', 'SER', 'mg/dL', 2.4, 7.0, 150, { fa: 'یوریک اسید', dec: 1, r: [['M', 12, null, 3.4, 7.0], ['F', 12, null, 2.4, 6.0]] });
t('EGFR', 'eGFR (CKD-EPI 2021)', 'BIO', 'SER', 'mL/min/1.73m²', 90, null, 0, C({ f: 'egfr({CREA},AGE,FEMALE)', dec: 0, text: '≥90 Normal | 60-89 Mild ↓ | 30-59 Moderate ↓ | 15-29 Severe ↓ | <15 Kidney failure' }));
t('BUNCR', 'BUN / Creatinine Ratio', 'BIO', 'SER', null, 10, 20, 0, C({ f: '{UREA}*0.467/{CREA}', dec: 1 }));
p('RFT', 'Renal Function Tests (RFT / KFT)', 'BIO', 'SER', 450, ['UREA', 'BUN', 'CREA', 'UA', 'EGFR', 'BUNCR'], { fa: 'تست‌های کلیوی' });
t('CYSC', 'Cystatin C', 'BIO', 'SER', 'mg/L', 0.6, 1.0, 1200, { dec: 2 });
// Lipids
t('CHOL', 'Cholesterol Total', 'BIO', 'SER', 'mg/dL', null, 200, 150, { fa: 'کلسترول', text: 'Desirable <200 | Borderline 200-239 | High ≥240' });
t('TG', 'Triglycerides', 'BIO', 'SER', 'mg/dL', null, 150, 150, { fa: 'تری‌گلیسرید', text: 'Normal <150 | Borderline 150-199 | High 200-499' });
t('HDL', 'HDL Cholesterol', 'BIO', 'SER', 'mg/dL', 40, null, 200, { r: [['M', 0, null, 40, null, '> 40'], ['F', 0, null, 50, null, '> 50']] });
t('LDL', 'LDL Cholesterol (Calculated)', 'BIO', 'SER', 'mg/dL', null, 130, 0, C({ f: '{CHOL}-{HDL}-{TG}/5', dec: 0, text: 'Optimal <100 | Near optimal 100-129 | Borderline 130-159 | High ≥160' }));
t('VLDL', 'VLDL Cholesterol', 'BIO', 'SER', 'mg/dL', 5, 40, 0, C({ f: '{TG}/5', dec: 0 }));
t('NHDL', 'Non-HDL Cholesterol', 'BIO', 'SER', 'mg/dL', null, 130, 0, C({ f: '{CHOL}-{HDL}', dec: 0 }));
t('CHR', 'Cholesterol / HDL Ratio', 'BIO', 'SER', null, null, 5.0, 0, C({ f: '{CHOL}/{HDL}', dec: 2 }));
p('LIPID', 'Lipid Profile', 'BIO', 'SER', 650, ['CHOL', 'TG', 'HDL', 'LDL', 'VLDL', 'NHDL', 'CHR'], { fa: 'پروفایل چربی' });
t('LDLD', 'LDL Cholesterol (Direct)', 'BIO', 'SER', 'mg/dL', null, 130, 300);
t('LPA', 'Lipoprotein (a)', 'BIO', 'SER', 'mg/dL', null, 30, 1200);
t('APOA1', 'Apolipoprotein A1', 'BIO', 'SER', 'mg/dL', 104, 225, 1000, { r: [['M', 0, null, 104, 202], ['F', 0, null, 108, 225]] });
t('APOB', 'Apolipoprotein B', 'BIO', 'SER', 'mg/dL', 55, 140, 1000);
// Proteins
t('SPEALB', 'Albumin fraction', 'BIO', 'SER', '%', 55.8, 66.1, 0, C({ dec: 1 }));
t('SPEA1', 'Alpha-1 globulin', 'BIO', 'SER', '%', 2.9, 4.9, 0, C({ dec: 1 }));
t('SPEA2', 'Alpha-2 globulin', 'BIO', 'SER', '%', 7.1, 11.8, 0, C({ dec: 1 }));
t('SPEB', 'Beta globulin', 'BIO', 'SER', '%', 8.4, 13.1, 0, C({ dec: 1 }));
t('SPEG', 'Gamma globulin', 'BIO', 'SER', '%', 11.1, 18.8, 0, C({ dec: 1 }));
t('SPEINT', 'SPE Interpretation', 'BIO', 'SER', null, null, null, 0, C({ type: 'memo', text: 'No monoclonal band detected' }));
p('SPE', 'Serum Protein Electrophoresis', 'BIO', 'SER', 2000, ['TP', 'SPEALB', 'SPEA1', 'SPEA2', 'SPEB', 'SPEG', 'SPEINT'], { tat: 72 });

// =====================================================================
// ELECTROLYTES & MINERALS
// =====================================================================
t('NA', 'Sodium (Na⁺)', 'ELEC', 'SER', 'mmol/L', 136, 145, 150, { crit: [120, 160] });
t('K', 'Potassium (K⁺)', 'ELEC', 'SER', 'mmol/L', 3.5, 5.1, 150, { dec: 1, crit: [2.5, 6.5] });
t('CL', 'Chloride (Cl⁻)', 'ELEC', 'SER', 'mmol/L', 98, 107, 150, { crit: [80, 120] });
t('HCO3', 'Bicarbonate (Total CO₂)', 'ELEC', 'SER', 'mmol/L', 22, 29, 200, { crit: [10, 40] });
t('AGAP', 'Anion Gap', 'ELEC', 'SER', 'mmol/L', 8, 16, 0, C({ f: '{NA}-({CL}+{HCO3})', dec: 0 }));
p('ELECP', 'Electrolytes (Na, K, Cl, HCO₃)', 'ELEC', 'SER', 500, ['NA', 'K', 'CL', 'HCO3', 'AGAP'], { fa: 'الکترولیت‌ها' });
t('CA', 'Calcium (Total)', 'ELEC', 'SER', 'mg/dL', 8.6, 10.3, 150, { dec: 1, crit: [6.0, 13.0] });
t('ICA', 'Calcium (Ionized)', 'ELEC', 'SER', 'mg/dL', 4.6, 5.3, 400, { dec: 2, crit: [3.2, 6.2] });
t('PHOS', 'Phosphorus (Inorganic)', 'ELEC', 'SER', 'mg/dL', 2.5, 4.5, 150, { dec: 1, crit: [1.0, null], r: [['A', 0, 12, 4.0, 7.0]] });
t('MG', 'Magnesium', 'ELEC', 'SER', 'mg/dL', 1.7, 2.2, 250, { dec: 1, crit: [1.0, 4.7] });
t('ZN', 'Zinc', 'ELEC', 'SER', 'µg/dL', 60, 120, 900);
t('CU', 'Copper', 'ELEC', 'SER', 'µg/dL', 70, 140, 900);
t('FE', 'Iron (Serum)', 'ELEC', 'SER', 'µg/dL', 50, 175, 250, { r: [['M', 0, null, 65, 175], ['F', 0, null, 50, 170]] });
t('TIBC', 'TIBC', 'ELEC', 'SER', 'µg/dL', 250, 450, 300);
t('UIBC', 'UIBC', 'ELEC', 'SER', 'µg/dL', 150, 375, 0, C({ f: '{TIBC}-{FE}', dec: 0 }));
t('TSAT', 'Transferrin Saturation', 'ELEC', 'SER', '%', 20, 50, 0, C({ f: '{FE}*100/{TIBC}', dec: 0 }));
t('FERR', 'Ferritin', 'ELEC', 'SER', 'ng/mL', 11, 336, 600, { fa: 'فریتین', r: [['M', 0, null, 24, 336], ['F', 0, null, 11, 307]] });
t('TRF', 'Transferrin', 'ELEC', 'SER', 'mg/dL', 200, 360, 700);
p('IRON', 'Iron Profile (Fe, TIBC, UIBC, TSAT, Ferritin)', 'ELEC', 'SER', 1000, ['FE', 'TIBC', 'UIBC', 'TSAT', 'FERR']);
p('BONE', 'Bone Profile (Ca, P, ALP, Mg)', 'ELEC', 'SER', 600, ['CA', 'PHOS', 'ALP', 'MG']);

// =====================================================================
// CARDIAC MARKERS
// =====================================================================
t('CK', 'CK Total (CPK)', 'CARD', 'SER', 'U/L', 26, 308, 300, { r: [['M', 0, null, 39, 308], ['F', 0, null, 26, 192]] });
t('CKMB', 'CK-MB', 'CARD', 'SER', 'U/L', 0, 24, 400);
t('TROPI', 'Troponin I (Quantitative)', 'CARD', 'SER', 'ng/mL', 0, 0.04, 900, { dec: 3, crit: [null, 0.4] });
t('TROPQ', 'Troponin I (Rapid)', 'CARD', 'SER', null, null, null, 500, { opt: POSNEG });
t('HSTNT', 'hs-Troponin T', 'CARD', 'SER', 'ng/L', 0, 14, 1200);
t('NTBNP', 'NT-proBNP', 'CARD', 'SER', 'pg/mL', 0, 125, 1800, { r: [['A', 75, null, 0, 450]] });
t('BNP', 'BNP', 'CARD', 'SER', 'pg/mL', 0, 100, 1600);
t('MYO', 'Myoglobin', 'CARD', 'SER', 'ng/mL', 25, 72, 800);
t('HSCRP', 'hs-CRP', 'CARD', 'SER', 'mg/L', 0, 3, 500, { dec: 2, text: 'Low risk <1 | Average 1-3 | High >3' });
t('HCY', 'Homocysteine', 'CARD', 'SER', 'µmol/L', 5, 15, 1200, { dec: 1 });
p('CARDP', 'Cardiac Profile (CK, CK-MB, Troponin I, LDH)', 'CARD', 'SER', 1700, ['CK', 'CKMB', 'TROPI', 'LDH']);

// =====================================================================
// ENDOCRINOLOGY
// =====================================================================
t('TSH', 'TSH', 'END', 'SER', 'µIU/mL', 0.27, 4.2, 350, { dec: 2 });
t('FT4', 'Free T4 (FT4)', 'END', 'SER', 'ng/dL', 0.93, 1.7, 350, { dec: 2 });
t('FT3', 'Free T3 (FT3)', 'END', 'SER', 'pg/mL', 2.0, 4.4, 350, { dec: 2 });
t('T4', 'Total T4', 'END', 'SER', 'µg/dL', 5.1, 14.1, 300, { dec: 1 });
t('T3', 'Total T3', 'END', 'SER', 'ng/dL', 80, 200, 300);
p('TFT', 'Thyroid Function Tests (T3, T4, TSH)', 'END', 'SER', 850, ['T3', 'T4', 'TSH'], { fa: 'تست تیروئید' });
p('FTFT', 'Free Thyroid Profile (FT3, FT4, TSH)', 'END', 'SER', 950, ['FT3', 'FT4', 'TSH']);
t('ATPO', 'Anti-TPO Antibodies', 'END', 'SER', 'IU/mL', 0, 34, 900);
t('ATG', 'Anti-Thyroglobulin Antibodies', 'END', 'SER', 'IU/mL', 0, 115, 900);
t('TG2', 'Thyroglobulin', 'END', 'SER', 'ng/mL', 3.5, 77, 1000, { dec: 1 });
t('TRAB', 'TSH Receptor Antibodies (TRAb)', 'END', 'SER', 'IU/L', 0, 1.75, 1800, { dec: 2 });
t('FSH', 'FSH', 'END', 'SER', 'mIU/mL', null, null, 450, { dec: 2, r: [['M', 0, null, 1.5, 12.4], ['F', 0, null, null, null, 'Follicular 3.5-12.5 | Ovulation 4.7-21.5 | Luteal 1.7-7.7 | Postmenopause 25.8-134.8']] });
t('LH', 'LH', 'END', 'SER', 'mIU/mL', null, null, 450, { dec: 2, r: [['M', 0, null, 1.7, 8.6], ['F', 0, null, null, null, 'Follicular 2.4-12.6 | Ovulation 14.0-95.6 | Luteal 1.0-11.4 | Postmenopause 7.7-58.5']] });
t('E2', 'Estradiol (E2)', 'END', 'SER', 'pg/mL', null, null, 500, { r: [['M', 0, null, 25.8, 60.7], ['F', 0, null, null, null, 'Follicular 12.5-166 | Ovulation 85.8-498 | Luteal 43.8-211 | Postmenopause <54.7']] });
t('PROG', 'Progesterone', 'END', 'SER', 'ng/mL', null, null, 500, { dec: 2, r: [['M', 0, null, 0.2, 1.4], ['F', 0, null, null, null, 'Follicular 0.2-1.5 | Luteal 1.7-27.0 | Postmenopause 0.1-0.8']] });
t('PRL', 'Prolactin', 'END', 'SER', 'ng/mL', 4.0, 23.3, 450, { dec: 1, r: [['M', 0, null, 4.0, 15.2], ['F', 0, null, 4.8, 23.3]] });
t('TESTO', 'Testosterone (Total)', 'END', 'SER', 'ng/dL', null, null, 550, { r: [['M', 18, null, 264, 916], ['F', 18, null, 15, 70]] });
t('FTESTO', 'Testosterone (Free)', 'END', 'SER', 'pg/mL', null, null, 1000, { dec: 1, r: [['M', 18, null, 46, 224], ['F', 18, null, 0.2, 5.0]] });
t('SHBG', 'SHBG', 'END', 'SER', 'nmol/L', null, null, 1100, { r: [['M', 0, null, 18.3, 54.1], ['F', 0, null, 32.4, 128]] });
t('DHEAS', 'DHEA-S', 'END', 'SER', 'µg/dL', null, null, 900, { r: [['M', 20, 40, 160, 449], ['M', 40, null, 34, 340], ['F', 20, 40, 65, 380], ['F', 40, null, 19, 230]] });
t('AMH', 'Anti-Müllerian Hormone (AMH)', 'END', 'SER', 'ng/mL', null, null, 2000, { dec: 2, text: 'Female 20-29y: 1.5-9.5 | 30-39y: 0.7-6.0 | 40-45y: 0.1-3.0' });
t('BHCG', 'β-hCG (Quantitative)', 'END', 'SER', 'mIU/mL', null, 5, 600, { text: 'Non-pregnant <5 | Pregnancy: rises with gestational age' });
t('OHP17', '17-OH Progesterone', 'END', 'SER', 'ng/mL', 0.2, 2.0, 1500, { dec: 2 });
t('ANDRO', 'Androstenedione', 'END', 'SER', 'ng/mL', 0.3, 3.1, 1500, { dec: 2 });
t('CORTAM', 'Cortisol (Morning)', 'END', 'SER', 'µg/dL', 6.2, 19.4, 700, { dec: 1 });
t('CORTPM', 'Cortisol (Evening)', 'END', 'SER', 'µg/dL', 2.3, 11.9, 700, { dec: 1 });
t('ACTH', 'ACTH', 'END', 'EDTA', 'pg/mL', 7.2, 63.3, 1500, { dec: 1 });
t('GH', 'Growth Hormone (GH)', 'END', 'SER', 'ng/mL', null, 10, 1000, { dec: 2 });
t('IGF1', 'IGF-1 (Somatomedin C)', 'END', 'SER', 'ng/mL', null, null, 1800, { text: 'Age dependent — see kit insert' });
t('PTH', 'Parathyroid Hormone (Intact PTH)', 'END', 'EDTA', 'pg/mL', 15, 65, 1200, { dec: 1 });
t('CALCT', 'Calcitonin', 'END', 'SER', 'pg/mL', null, null, 1500, { dec: 1, r: [['M', 0, null, 0, 8.4], ['F', 0, null, 0, 5.0]] });
t('ALDO', 'Aldosterone', 'END', 'SER', 'ng/dL', 3, 16, 1800, { dec: 1 });
t('RENIN', 'Renin (Direct)', 'END', 'EDTA', 'µIU/mL', 4.4, 46.1, 1800, { dec: 1 });
p('FHORM', 'Female Hormone Panel (FSH, LH, E2, PRL, Progesterone)', 'END', 'SER', 2000, ['FSH', 'LH', 'E2', 'PRL', 'PROG']);
p('MHORM', 'Male Hormone Panel (Testosterone, FSH, LH, PRL)', 'END', 'SER', 1700, ['TESTO', 'FSH', 'LH', 'PRL']);
p('PCOS', 'PCOS Panel (LH, FSH, Testosterone, DHEA-S, PRL, Insulin)', 'END', 'SER', 3000, ['LH', 'FSH', 'TESTO', 'DHEAS', 'PRL', 'INS']);

// =====================================================================
// TUMOR MARKERS
// =====================================================================
t('PSA', 'PSA Total', 'TUM', 'SER', 'ng/mL', 0, 4.0, 600, { dec: 2 });
t('FPSA', 'PSA Free', 'TUM', 'SER', 'ng/mL', null, null, 0, C({ dec: 2 }));
t('PSAR', 'Free / Total PSA Ratio', 'TUM', 'SER', '%', 25, null, 0, C({ f: '{FPSA}*100/{PSA}', dec: 0 }));
p('PSAP', 'PSA Profile (Total, Free, Ratio)', 'TUM', 'SER', 1100, ['PSA', 'FPSA', 'PSAR']);
t('CEA', 'CEA', 'TUM', 'SER', 'ng/mL', 0, 5.0, 700, { dec: 2, text: '<5.0 (smokers <10)' });
t('AFP', 'Alpha-Fetoprotein (AFP)', 'TUM', 'SER', 'ng/mL', 0, 10, 700, { dec: 1 });
t('CA125', 'CA 125', 'TUM', 'SER', 'U/mL', 0, 35, 900, { dec: 1 });
t('CA199', 'CA 19-9', 'TUM', 'SER', 'U/mL', 0, 37, 900, { dec: 1 });
t('CA153', 'CA 15-3', 'TUM', 'SER', 'U/mL', 0, 31, 900, { dec: 1 });
t('CA724', 'CA 72-4', 'TUM', 'SER', 'U/mL', 0, 6.9, 1200, { dec: 1 });
t('B2M', 'Beta-2 Microglobulin', 'TUM', 'SER', 'mg/L', 0.8, 2.2, 1200, { dec: 2 });
t('NSE', 'Neuron Specific Enolase (NSE)', 'TUM', 'SER', 'ng/mL', 0, 16.3, 1500, { dec: 1 });
t('CYFRA', 'CYFRA 21-1', 'TUM', 'SER', 'ng/mL', 0, 3.3, 1500, { dec: 2 });
t('HE4', 'HE4', 'TUM', 'SER', 'pmol/L', 0, 70, 2000, { dec: 1 });

// =====================================================================
// VITAMINS
// =====================================================================
t('VITD', 'Vitamin D (25-OH)', 'VIT', 'SER', 'ng/mL', 30, 100, 1100, { fa: 'ویتامین دی', dec: 1, text: 'Deficiency <20 | Insufficiency 20-29 | Sufficient 30-100 | Toxicity >150' });
t('VITB12', 'Vitamin B12', 'VIT', 'SER', 'pg/mL', 197, 771, 800);
t('FOL', 'Folate (Folic Acid)', 'VIT', 'SER', 'ng/mL', 3.9, 26.8, 800, { dec: 1 });
t('VITA', 'Vitamin A (Retinol)', 'VIT', 'SER', 'µg/dL', 30, 80, 1800);
t('VITE', 'Vitamin E (Tocopherol)', 'VIT', 'SER', 'mg/L', 5.5, 17, 1800, { dec: 1 });
t('VITB1', 'Vitamin B1 (Thiamine)', 'VIT', 'EDTA', 'nmol/L', 70, 180, 2000);
t('VITB6', 'Vitamin B6', 'VIT', 'SER', 'µg/L', 5, 50, 2000, { dec: 1 });
p('ANEMIA', 'Anemia Panel (CBC, Iron Profile, B12, Folate)', 'HEM', 'SER', 2500, ['CBC', 'IRON', 'VITB12', 'FOL']);

// =====================================================================
// IMMUNOLOGY / INFLAMMATION
// =====================================================================
t('CRP', 'C-Reactive Protein (Quantitative)', 'IMM', 'SER', 'mg/L', 0, 6, 300, { dec: 1 });
t('CRPQ', 'CRP (Qualitative)', 'IMM', 'SER', null, null, null, 150, { opt: POSNEG });
t('ASO', 'ASO Titer', 'IMM', 'SER', 'IU/mL', 0, 200, 300);
t('RF', 'Rheumatoid Factor (Quantitative)', 'IMM', 'SER', 'IU/mL', 0, 14, 300);
t('RFQ', 'RA Factor (Latex)', 'IMM', 'SER', null, null, null, 150, { opt: POSNEG });
t('PCT2', 'Procalcitonin', 'IMM', 'SER', 'ng/mL', 0, 0.05, 1500, { dec: 2, text: '<0.5 low risk of sepsis | >2 high risk' });
t('IL6', 'Interleukin-6', 'IMM', 'SER', 'pg/mL', 0, 7, 2000, { dec: 1 });
t('IGG', 'Immunoglobulin G (IgG)', 'IMM', 'SER', 'mg/dL', 700, 1600, 800);
t('IGA', 'Immunoglobulin A (IgA)', 'IMM', 'SER', 'mg/dL', 70, 400, 800);
t('IGM', 'Immunoglobulin M (IgM)', 'IMM', 'SER', 'mg/dL', 40, 230, 800);
p('IGP', 'Immunoglobulins (IgG, IgA, IgM)', 'IMM', 'SER', 2000, ['IGG', 'IGA', 'IGM']);
t('C3', 'Complement C3', 'IMM', 'SER', 'mg/dL', 90, 180, 800);
t('C4', 'Complement C4', 'IMM', 'SER', 'mg/dL', 10, 40, 800);

// =====================================================================
// SEROLOGY / INFECTIOUS DISEASES
// =====================================================================
t('HBSAG', 'HBsAg (Hepatitis B surface antigen)', 'SER', 'SER', null, null, null, 250, { fa: 'هپاتیت B', opt: POSNEG });
t('AHBS', 'Anti-HBs (Quantitative)', 'SER', 'SER', 'mIU/mL', 10, null, 600, { text: '<10 Non-immune | ≥10 Immune' });
t('HBEAG', 'HBeAg', 'SER', 'SER', null, null, null, 500, { opt: POSNEG });
t('AHBE', 'Anti-HBe', 'SER', 'SER', null, null, null, 500, { opt: POSNEG });
t('AHBCT', 'Anti-HBc Total', 'SER', 'SER', null, null, null, 500, { opt: POSNEG });
t('AHBCM', 'Anti-HBc IgM', 'SER', 'SER', null, null, null, 700, { opt: POSNEG });
p('HBVP', 'Hepatitis B Profile', 'SER', 'SER', 2500, ['HBSAG', 'AHBS', 'HBEAG', 'AHBE', 'AHBCT', 'AHBCM']);
t('HCV', 'Anti-HCV Antibody', 'SER', 'SER', null, null, null, 300, { fa: 'هپاتیت C', opt: POSNEG });
t('HAVM', 'Hepatitis A IgM', 'SER', 'SER', null, null, null, 700, { opt: POSNEG });
t('HEVM', 'Hepatitis E IgM', 'SER', 'SER', null, null, null, 800, { opt: POSNEG });
t('HIV', 'HIV 1/2 Antibody / p24 Ag', 'SER', 'SER', null, null, null, 300, { opt: REACT });
p('VIRAL', 'Viral Screening (HBsAg, HCV, HIV)', 'SER', 'SER', 750, ['HBSAG', 'HCV', 'HIV']);
t('VDRL', 'VDRL / RPR', 'SER', 'SER', null, null, null, 200, { opt: REACT });
t('TPHA', 'TPHA (Treponema pallidum)', 'SER', 'SER', null, null, null, 500, { opt: REACT });
t('HPYAB', 'H. pylori Antibody (Serum)', 'SER', 'SER', null, null, null, 300, { opt: POSNEG });
t('WTO', 'S. Typhi O', 'SER', 'SER', 'titer', null, null, 0, C({ opt: ['< 1:20', '1:20', '1:40', '1:80', '1:160', '1:320', '1:640'], text: '< 1:80' }));
t('WTH', 'S. Typhi H', 'SER', 'SER', 'titer', null, null, 0, C({ opt: ['< 1:20', '1:20', '1:40', '1:80', '1:160', '1:320', '1:640'], text: '< 1:80' }));
t('WPAH', 'S. Paratyphi AH', 'SER', 'SER', 'titer', null, null, 0, C({ opt: ['< 1:20', '1:20', '1:40', '1:80', '1:160', '1:320', '1:640'], text: '< 1:80' }));
t('WPBH', 'S. Paratyphi BH', 'SER', 'SER', 'titer', null, null, 0, C({ opt: ['< 1:20', '1:20', '1:40', '1:80', '1:160', '1:320', '1:640'], text: '< 1:80' }));
p('WIDAL', 'Widal Test (Typhoid)', 'SER', 'SER', 300, ['WTO', 'WTH', 'WPAH', 'WPBH'], { fa: 'ویدال' });
t('TYPHI', 'Typhidot (IgM / IgG)', 'SER', 'SER', null, null, null, 400, { opt: ['Negative', 'IgM Positive', 'IgG Positive', 'IgM & IgG Positive'] });
t('BRUA', 'Brucella abortus', 'SER', 'SER', 'titer', null, null, 0, C({ opt: ['< 1:20', '1:20', '1:40', '1:80', '1:160', '1:320', '1:640'], text: '< 1:80' }));
t('BRUM', 'Brucella melitensis', 'SER', 'SER', 'titer', null, null, 0, C({ opt: ['< 1:20', '1:20', '1:40', '1:80', '1:160', '1:320', '1:640'], text: '< 1:80' }));
p('BRUC', 'Brucella Agglutination (Wright)', 'SER', 'SER', 400, ['BRUA', 'BRUM']);
t('BRUG', 'Brucella IgG (ELISA)', 'SER', 'SER', null, null, null, 800, { opt: POSNEG });
t('BRUMM', 'Brucella IgM (ELISA)', 'SER', 'SER', null, null, null, 800, { opt: POSNEG });
t('TOXG', 'Toxoplasma IgG', 'SER', 'SER', 'IU/mL', null, 8, 600, { text: '<8 Negative | ≥8 Positive' });
t('TOXM', 'Toxoplasma IgM', 'SER', 'SER', null, null, null, 600, { opt: POSNEG });
t('RUBG', 'Rubella IgG', 'SER', 'SER', 'IU/mL', 10, null, 600, { text: '≥10 Immune' });
t('RUBM', 'Rubella IgM', 'SER', 'SER', null, null, null, 600, { opt: POSNEG });
t('CMVG', 'CMV IgG', 'SER', 'SER', null, null, null, 600, { opt: POSNEG });
t('CMVM', 'CMV IgM', 'SER', 'SER', null, null, null, 600, { opt: POSNEG });
t('HSVG', 'HSV 1/2 IgG', 'SER', 'SER', null, null, null, 600, { opt: POSNEG });
t('HSVM', 'HSV 1/2 IgM', 'SER', 'SER', null, null, null, 600, { opt: POSNEG });
p('TORCH', 'TORCH Panel (IgG & IgM)', 'SER', 'SER', 4000, ['TOXG', 'TOXM', 'RUBG', 'RUBM', 'CMVG', 'CMVM', 'HSVG', 'HSVM'], { tat: 48 });
t('DENNS1', 'Dengue NS1 Antigen', 'SER', 'SER', null, null, null, 600, { opt: POSNEG });
t('DENG', 'Dengue IgG', 'SER', 'SER', null, null, null, 500, { opt: POSNEG });
t('DENM', 'Dengue IgM', 'SER', 'SER', null, null, null, 500, { opt: POSNEG });
p('DENGUE', 'Dengue Panel (NS1, IgG, IgM)', 'SER', 'SER', 1300, ['DENNS1', 'DENG', 'DENM']);
t('MALAG', 'Malaria Antigen (Pf/Pv Rapid)', 'SER', 'EDTA', null, null, null, 300, { opt: ['Negative', 'P. falciparum Positive', 'P. vivax Positive', 'Mixed Positive'] });
t('LEISH', 'Leishmania (rK39)', 'SER', 'SER', null, null, null, 600, { opt: POSNEG });
t('EBVM', 'EBV VCA IgM', 'SER', 'SER', null, null, null, 900, { opt: POSNEG });
t('EBVG', 'EBV VCA IgG', 'SER', 'SER', null, null, null, 900, { opt: POSNEG });
t('MONO', 'Infectious Mononucleosis (Monospot)', 'SER', 'SER', null, null, null, 400, { opt: POSNEG });
t('MEASM', 'Measles IgM', 'SER', 'SER', null, null, null, 900, { opt: POSNEG });
t('VZVG', 'Varicella Zoster IgG', 'SER', 'SER', null, null, null, 900, { opt: POSNEG });
t('COVAG', 'SARS-CoV-2 Antigen (Rapid)', 'SER', 'NPS', null, null, null, 400, { opt: POSNEG });
t('COVG', 'SARS-CoV-2 IgG Antibody', 'SER', 'SER', null, null, null, 600, { opt: POSNEG });
t('QFT', 'QuantiFERON-TB Gold', 'SER', 'BLD', null, null, null, 4500, { opt: ['Negative', 'Positive', 'Indeterminate'], tat: 72 });
t('TBAB', 'TB Antibody (Rapid)', 'SER', 'SER', null, null, null, 400, { opt: POSNEG });
t('CHLG', 'Chlamydia trachomatis IgG', 'SER', 'SER', null, null, null, 900, { opt: POSNEG });
t('HYDAT', 'Hydatid (Echinococcus) IgG', 'SER', 'SER', null, null, null, 900, { opt: POSNEG });
t('AMOEB', 'Entamoeba histolytica IgG', 'SER', 'SER', null, null, null, 900, { opt: POSNEG });

// =====================================================================
// AUTOIMMUNE
// =====================================================================
t('ANA', 'ANA (Antinuclear Antibody, ELISA)', 'AUTO', 'SER', 'Index', null, 1.0, 900, { dec: 2, text: '<1.0 Negative | ≥1.0 Positive' });
t('ANAIF', 'ANA (IFA) Titer & Pattern', 'AUTO', 'SER', null, null, null, 1500, TXT({ text: 'Negative (<1:80)' }));
t('DSDNA', 'Anti-dsDNA', 'AUTO', 'SER', 'IU/mL', null, 25, 1200);
t('CCP', 'Anti-CCP', 'AUTO', 'SER', 'U/mL', null, 17, 1200);
t('CANCA', 'c-ANCA (PR3)', 'AUTO', 'SER', null, null, null, 1500, { opt: POSNEG });
t('PANCA', 'p-ANCA (MPO)', 'AUTO', 'SER', null, null, null, 1500, { opt: POSNEG });
t('TTGA', 'Anti-tTG IgA (Celiac)', 'AUTO', 'SER', 'U/mL', null, 20, 1200);
t('GLIA', 'Anti-Gliadin IgA', 'AUTO', 'SER', 'U/mL', null, 25, 1200);
t('ACLG', 'Anti-Cardiolipin IgG', 'AUTO', 'SER', 'GPL U/mL', null, 20, 1200);
t('ACLM', 'Anti-Cardiolipin IgM', 'AUTO', 'SER', 'MPL U/mL', null, 20, 1200);
t('B2GP', 'Anti-β2 Glycoprotein I', 'AUTO', 'SER', 'U/mL', null, 20, 1500);
t('ENA', 'ENA Profile (Sm, RNP, SSA, SSB, Scl-70, Jo-1)', 'AUTO', 'SER', null, null, null, 3500, MEMO({ text: 'All Negative', tat: 72 }));
t('ASMA', 'Anti-Smooth Muscle Antibody', 'AUTO', 'SER', null, null, null, 1500, { opt: POSNEG });
t('AMA', 'Anti-Mitochondrial Antibody', 'AUTO', 'SER', null, null, null, 1500, { opt: POSNEG });
t('HLAB27', 'HLA-B27', 'AUTO', 'EDTA', null, null, null, 2500, { opt: POSNEG, tat: 72 });

// =====================================================================
// ALLERGY
// =====================================================================
t('IGE', 'Total IgE', 'ALL', 'SER', 'IU/mL', 0, 100, 600);
t('ALLF', 'Allergy Panel - Food (Specific IgE)', 'ALL', 'SER', null, null, null, 4000, MEMO({ text: 'No significant sensitization', tat: 72 }));
t('ALLI', 'Allergy Panel - Inhalant (Specific IgE)', 'ALL', 'SER', null, null, null, 4000, MEMO({ text: 'No significant sensitization', tat: 72 }));

// =====================================================================
// URINALYSIS
// =====================================================================
t('UCOL', 'Colour', 'URI', 'UR', null, null, null, 0, C({ opt: ['Pale yellow', 'Yellow', 'Dark yellow', 'Amber', 'Orange', 'Red', 'Brown', 'Colourless'], text: 'Pale yellow / Yellow' }));
t('UAPP', 'Appearance', 'URI', 'UR', null, null, null, 0, C({ opt: ['Clear', 'Slightly turbid', 'Turbid', 'Cloudy'] }));
t('USG', 'Specific Gravity', 'URI', 'UR', null, 1.005, 1.030, 0, C({ dec: 3 }));
t('UPH', 'pH', 'URI', 'UR', null, 4.5, 8.0, 0, C({ dec: 1 }));
t('UPRO', 'Protein', 'URI', 'UR', null, null, null, 0, C({ opt: GRADE }));
t('UGLU', 'Glucose', 'URI', 'UR', null, null, null, 0, C({ opt: GRADE }));
t('UKET', 'Ketones', 'URI', 'UR', null, null, null, 0, C({ opt: GRADE }));
t('UBIL', 'Bilirubin', 'URI', 'UR', null, null, null, 0, C({ opt: ['Negative', '1+', '2+', '3+'] }));
t('UURO', 'Urobilinogen', 'URI', 'UR', null, null, null, 0, C({ opt: ['Normal', '1+', '2+', '3+'] }));
t('UBLD', 'Blood', 'URI', 'UR', null, null, null, 0, C({ opt: GRADE }));
t('UNIT', 'Nitrite', 'URI', 'UR', null, null, null, 0, C({ opt: POSNEG }));
t('ULEU', 'Leukocyte Esterase', 'URI', 'UR', null, null, null, 0, C({ opt: GRADE }));
t('URBC', 'RBC', 'URI', 'UR', '/HPF', null, null, 0, C({ opt: ['0-2', '2-4', '4-6', '6-8', '8-10', '10-15', '15-20', '20-30', 'Many', 'Full field'], text: '0-2' }));
t('UWBC', 'Pus Cells (WBC)', 'URI', 'UR', '/HPF', null, null, 0, C({ opt: ['0-2', '2-4', '4-6', '6-8', '8-10', '10-15', '15-20', '20-30', 'Many', 'Full field'], text: '0-2' }));
t('UEPI', 'Epithelial Cells', 'URI', 'UR', null, null, null, 0, C({ opt: ['Few', 'Moderate', 'Many'] }));
t('UCAST', 'Casts', 'URI', 'UR', '/LPF', null, null, 0, C({ opt: ['Not seen', 'Hyaline casts', 'Granular casts', 'RBC casts', 'WBC casts', 'Waxy casts'] }));
t('UCRY', 'Crystals', 'URI', 'UR', null, null, null, 0, C({ opt: ['Not seen', 'Calcium oxalate', 'Uric acid', 'Amorphous urates', 'Amorphous phosphates', 'Triple phosphate', 'Cystine'] }));
t('UBAC', 'Bacteria', 'URI', 'UR', null, null, null, 0, C({ opt: ['Not seen', 'Few', 'Moderate', 'Many'] }));
t('UYST', 'Yeast Cells', 'URI', 'UR', null, null, null, 0, C({ opt: SEEN }));
t('UTRI', 'Trichomonas vaginalis', 'URI', 'UR', null, null, null, 0, C({ opt: SEEN }));
t('UMUC', 'Mucus Threads', 'URI', 'UR', null, null, null, 0, C({ opt: ['Not seen', 'Few', 'Moderate', 'Many'] }));
t('UOTH', 'Other Findings', 'URI', 'UR', null, null, null, 0, C({ type: 'text', text: '' }));
p('URINE', 'Urine Routine Examination (R/E)', 'URI', 'UR', 150,
  ['UCOL', 'UAPP', 'USG', 'UPH', 'UPRO', 'UGLU', 'UKET', 'UBIL', 'UURO', 'UBLD', 'UNIT', 'ULEU',
   'URBC', 'UWBC', 'UEPI', 'UCAST', 'UCRY', 'UBAC', 'UYST', 'UTRI', 'UMUC', 'UOTH'], { fa: 'آزمایش ادرار' });
t('UPT', 'Pregnancy Test (Urine hCG)', 'URI', 'UR', null, null, null, 150, { fa: 'تست حاملگی', opt: POSNEG });
t('UMALB', 'Microalbumin (Urine)', 'URI', 'UR', 'mg/L', 0, 30, 500);
t('UCREA', 'Creatinine (Urine)', 'URI', 'UR', 'mg/dL', 20, 320, 0, C({}));
t('UACR', 'Albumin / Creatinine Ratio', 'URI', 'UR', 'mg/g', 0, 30, 0, C({ f: '{UMALB}*100/{UCREA}', dec: 0, text: '<30 Normal | 30-300 Moderately increased | >300 Severely increased' }));
p('ACR', 'Urine Albumin / Creatinine Ratio (ACR)', 'URI', 'UR', 700, ['UMALB', 'UCREA', 'UACR']);
t('U24VOL', '24h Urine Volume', 'URI', 'U24', 'mL', 800, 2000, 0, C({}));
t('U24PRO', 'Protein (24h Urine)', 'URI', 'U24', 'mg/24h', 0, 150, 500);
t('U24CRE', 'Creatinine (24h Urine)', 'URI', 'U24', 'mg/24h', 800, 2000, 400);
t('CRCL', 'Creatinine Clearance', 'URI', 'U24', 'mL/min', 90, 140, 700, { text: 'Enter value calculated from urine & serum creatinine' });
t('U24CA', 'Calcium (24h Urine)', 'URI', 'U24', 'mg/24h', 100, 300, 500);
t('U24UA', 'Uric Acid (24h Urine)', 'URI', 'U24', 'mg/24h', 250, 750, 500);
t('UNA', 'Sodium (Urine)', 'URI', 'UR', 'mmol/L', 40, 220, 300);
t('UK', 'Potassium (Urine)', 'URI', 'UR', 'mmol/L', 25, 125, 300);
t('BJP', 'Bence Jones Protein', 'URI', 'UR', null, null, null, 800, { opt: ['Not detected', 'Detected'] });
t('UCHYL', 'Chyluria Test', 'URI', 'UR', null, null, null, 300, { opt: POSNEG });

// =====================================================================
// STOOL
// =====================================================================
t('SCOL', 'Colour', 'STL', 'ST', null, null, null, 0, C({ opt: ['Brown', 'Yellow', 'Green', 'Black', 'Clay coloured', 'Red'] }));
t('SCONS', 'Consistency', 'STL', 'ST', null, null, null, 0, C({ opt: ['Formed', 'Semi-formed', 'Soft', 'Loose', 'Watery', 'Mucoid', 'Hard'] }));
t('SMUC', 'Mucus', 'STL', 'ST', null, null, null, 0, C({ opt: ['Absent', 'Present (+)', 'Present (++)', 'Present (+++)'] }));
t('SBLD', 'Blood (Visible)', 'STL', 'ST', null, null, null, 0, C({ opt: ['Absent', 'Present'] }));
t('SPUS', 'Pus Cells', 'STL', 'ST', '/HPF', null, null, 0, C({ opt: ['Nil', '0-2', '2-4', '4-6', '6-10', '10-20', 'Many', 'Full field'], text: 'Nil' }));
t('SRBC', 'RBC', 'STL', 'ST', '/HPF', null, null, 0, C({ opt: ['Nil', '0-2', '2-4', '4-6', '6-10', '10-20', 'Many', 'Full field'], text: 'Nil' }));
t('SOVA', 'Ova / Cysts / Parasites', 'STL', 'ST', null, null, null, 0, C({ opt: ['Not seen', 'Giardia lamblia cysts', 'Giardia lamblia trophozoites', 'Entamoeba histolytica cysts', 'Entamoeba histolytica trophozoites', 'Entamoeba coli cysts', 'Ascaris lumbricoides ova', 'Hymenolepis nana ova', 'Trichuris trichiura ova', 'Enterobius vermicularis ova', 'Taenia spp. ova', 'Hookworm ova', 'Strongyloides larvae'] }));
t('SFAT', 'Fat Globules', 'STL', 'ST', null, null, null, 0, C({ opt: ['Not seen', 'Few', 'Moderate', 'Many'] }));
t('SSTA', 'Starch Granules', 'STL', 'ST', null, null, null, 0, C({ opt: ['Not seen', 'Few', 'Moderate', 'Many'] }));
t('SVEG', 'Vegetable Fibres', 'STL', 'ST', null, null, null, 0, C({ opt: ['Not seen', 'Few', 'Moderate', 'Many'] }));
t('SYST', 'Yeast Cells', 'STL', 'ST', null, null, null, 0, C({ opt: SEEN }));
t('SOTH', 'Other Findings', 'STL', 'ST', null, null, null, 0, C({ type: 'text', text: '' }));
p('STOOL', 'Stool Routine Examination (R/E)', 'STL', 'ST', 150,
  ['SCOL', 'SCONS', 'SMUC', 'SBLD', 'SPUS', 'SRBC', 'SOVA', 'SFAT', 'SSTA', 'SVEG', 'SYST', 'SOTH'], { fa: 'آزمایش مدفوع' });
t('FOBT', 'Occult Blood (FOBT)', 'STL', 'ST', null, null, null, 250, { opt: POSNEG });
t('HPYST', 'H. pylori Antigen (Stool)', 'STL', 'ST', null, null, null, 450, { opt: POSNEG });
t('ROTA', 'Rotavirus Antigen', 'STL', 'ST', null, null, null, 450, { opt: POSNEG });
t('ADENO', 'Adenovirus Antigen (Stool)', 'STL', 'ST', null, null, null, 450, { opt: POSNEG });
t('CALP', 'Fecal Calprotectin', 'STL', 'ST', 'µg/g', 0, 50, 1800);
t('SRED', 'Reducing Substances', 'STL', 'ST', null, null, null, 250, { opt: ['Negative', 'Trace', '+', '++', '+++'] });

// =====================================================================
// MICROBIOLOGY
// =====================================================================
const CULT = (x = {}) => MEMO({ text: 'No growth after 48 hours of incubation', tat: 72, ...x });
t('UCS', 'Urine Culture & Sensitivity', 'MIC', 'UR', null, null, null, 700, CULT());
t('BCS', 'Blood Culture & Sensitivity', 'MIC', 'BLD', null, null, null, 1200, CULT({ text: 'No growth after 5 days of incubation', tat: 120 }));
t('SCS', 'Stool Culture & Sensitivity', 'MIC', 'ST', null, null, null, 800, CULT({ text: 'No Salmonella / Shigella isolated' }));
t('THCS', 'Throat Swab Culture & Sensitivity', 'MIC', 'SWB', null, null, null, 700, CULT({ text: 'Normal oropharyngeal flora' }));
t('SPCS', 'Sputum Culture & Sensitivity', 'MIC', 'SPT', null, null, null, 800, CULT());
t('PUSCS', 'Pus / Wound Culture & Sensitivity', 'MIC', 'SWB', null, null, null, 800, CULT());
t('HVSCS', 'High Vaginal Swab Culture', 'MIC', 'SWB', null, null, null, 800, CULT());
t('EARCS', 'Ear Swab Culture & Sensitivity', 'MIC', 'SWB', null, null, null, 700, CULT());
t('EYECS', 'Eye Swab Culture & Sensitivity', 'MIC', 'SWB', null, null, null, 700, CULT());
t('SEMCS', 'Semen Culture & Sensitivity', 'MIC', 'SEM', null, null, null, 800, CULT());
t('CSFCS', 'CSF Culture & Sensitivity', 'MIC', 'CSF', null, null, null, 1000, CULT());
t('FLCS', 'Body Fluid Culture & Sensitivity', 'MIC', 'BF', null, null, null, 900, CULT());
t('GRAM', 'Gram Stain', 'MIC', 'SWB', null, null, null, 250, MEMO({ text: 'No organisms seen', tat: 4 }));
t('AFB', 'AFB Smear (Ziehl-Neelsen)', 'MIC', 'SPT', null, null, null, 250, { opt: ['No AFB seen', 'Scanty', '1+', '2+', '3+'], tat: 24 });
t('KOH', 'KOH Mount (Fungal Elements)', 'MIC', 'SWB', null, null, null, 250, { opt: ['Not seen', 'Fungal hyphae seen', 'Yeast cells seen'] });
t('FUNGC', 'Fungal Culture', 'MIC', 'SWB', null, null, null, 1200, MEMO({ text: 'No fungal growth after 4 weeks', tat: 672 }));
t('WETM', 'Wet Mount (Vaginal Discharge)', 'MIC', 'SWB', null, null, null, 250, MEMO({ text: 'No Trichomonas or yeast seen' }));

// =====================================================================
// BLOOD BANK
// =====================================================================
t('ABO', 'ABO Blood Group', 'BB', 'EDTA', null, null, null, 0, C({ opt: ['A', 'B', 'AB', 'O'], text: '' }));
t('RH', 'Rh (D) Type', 'BB', 'EDTA', null, null, null, 0, C({ opt: ['Positive', 'Negative'], text: '' }));
p('BGRH', 'Blood Group & Rh', 'BB', 'EDTA', 100, ['ABO', 'RH'], { fa: 'گروپ خون' });
t('DCT', 'Direct Coombs Test (DAT)', 'BB', 'EDTA', null, null, null, 400, { opt: POSNEG });
t('ICT', 'Indirect Coombs Test (IAT)', 'BB', 'SER', null, null, null, 500, { opt: POSNEG });
t('XM', 'Cross Match', 'BB', 'EDTA', null, null, null, 500, { opt: ['Compatible', 'Incompatible'] });
t('ABSCR', 'Antibody Screening', 'BB', 'SER', null, null, null, 900, { opt: POSNEG });

// =====================================================================
// BODY FLUIDS
// =====================================================================
t('CSFAPP', 'CSF Appearance', 'FLU', 'CSF', null, null, null, 0, C({ opt: ['Clear, colourless', 'Turbid', 'Bloody', 'Xanthochromic'] }));
t('CSFPRO', 'CSF Protein', 'FLU', 'CSF', 'mg/dL', 15, 45, 0, C({}));
t('CSFGLU', 'CSF Glucose', 'FLU', 'CSF', 'mg/dL', 40, 70, 0, C({}));
t('CSFCC', 'CSF Cell Count', 'FLU', 'CSF', 'cells/µL', 0, 5, 0, C({}));
t('CSFDIF', 'CSF Differential', 'FLU', 'CSF', null, null, null, 0, C({ type: 'text', text: 'Lymphocytes predominant' }));
t('CSFGRAM', 'CSF Gram Stain', 'FLU', 'CSF', null, null, null, 0, C({ type: 'text', text: 'No organisms seen' }));
p('CSF', 'CSF Analysis (Routine)', 'FLU', 'CSF', 900, ['CSFAPP', 'CSFPRO', 'CSFGLU', 'CSFCC', 'CSFDIF', 'CSFGRAM']);
t('BFAPP', 'Fluid Appearance', 'FLU', 'BF', null, null, null, 0, C({ opt: ['Clear', 'Straw coloured', 'Turbid', 'Hemorrhagic', 'Purulent', 'Chylous'] }));
t('BFPRO', 'Fluid Protein', 'FLU', 'BF', 'g/dL', null, null, 0, C({ dec: 1 }));
t('BFGLU', 'Fluid Glucose', 'FLU', 'BF', 'mg/dL', null, null, 0, C({}));
t('BFLDH', 'Fluid LDH', 'FLU', 'BF', 'U/L', null, null, 0, C({}));
t('BFCC', 'Fluid Cell Count', 'FLU', 'BF', 'cells/µL', null, null, 0, C({}));
t('BFDIF', 'Fluid Differential', 'FLU', 'BF', null, null, null, 0, C({ type: 'text', text: '' }));
p('BFLUID', 'Pleural / Ascitic / Synovial Fluid Analysis', 'FLU', 'BF', 900, ['BFAPP', 'BFPRO', 'BFGLU', 'BFLDH', 'BFCC', 'BFDIF']);
t('ADA', 'Adenosine Deaminase (ADA)', 'FLU', 'BF', 'U/L', 0, 40, 900);

// =====================================================================
// SEMEN ANALYSIS (WHO 2021 lower reference limits)
// =====================================================================
t('SVOL', 'Volume', 'SEM', 'SEM', 'mL', 1.4, null, 0, C({ dec: 1 }));
t('SPH', 'pH', 'SEM', 'SEM', null, 7.2, 8.0, 0, C({ dec: 1 }));
t('SLIQ', 'Liquefaction Time', 'SEM', 'SEM', 'min', null, 60, 0, C({}));
t('SVIS', 'Viscosity', 'SEM', 'SEM', null, null, null, 0, C({ opt: ['Normal', 'Increased'] }));
t('SCONC', 'Sperm Concentration', 'SEM', 'SEM', 'million/mL', 16, null, 0, C({ dec: 1 }));
t('STOT', 'Total Sperm Count', 'SEM', 'SEM', 'million/ejaculate', 39, null, 0, C({ f: '{SCONC}*{SVOL}', dec: 1 }));
t('SMOT', 'Total Motility (PR + NP)', 'SEM', 'SEM', '%', 42, null, 0, C({}));
t('SPR', 'Progressive Motility (PR)', 'SEM', 'SEM', '%', 30, null, 0, C({}));
t('SNP', 'Non-progressive Motility (NP)', 'SEM', 'SEM', '%', null, null, 0, C({}));
t('SIM', 'Immotile', 'SEM', 'SEM', '%', null, null, 0, C({}));
t('SMOR', 'Normal Morphology', 'SEM', 'SEM', '%', 4, null, 0, C({}));
t('SVIT', 'Vitality (Live sperm)', 'SEM', 'SEM', '%', 54, null, 0, C({}));
t('SWBC', 'Leukocytes (WBC)', 'SEM', 'SEM', 'million/mL', null, 1, 0, C({ dec: 1 }));
t('SAGG', 'Agglutination', 'SEM', 'SEM', null, null, null, 0, C({ opt: ['Absent', 'Present'] }));
p('SEMEN', 'Semen Analysis (WHO 2021)', 'SEM', 'SEM', 600, ['SVOL', 'SPH', 'SLIQ', 'SVIS', 'SCONC', 'STOT', 'SMOT', 'SPR', 'SNP', 'SIM', 'SMOR', 'SVIT', 'SWBC', 'SAGG'], { fa: 'تحلیل منی' });

// =====================================================================
// THERAPEUTIC DRUG MONITORING & TOXICOLOGY
// =====================================================================
t('DIG', 'Digoxin', 'TDM', 'SER', 'ng/mL', 0.8, 2.0, 1200, { dec: 2, crit: [null, 2.5] });
t('VALP', 'Valproic Acid', 'TDM', 'SER', 'µg/mL', 50, 100, 1200);
t('PHENY', 'Phenytoin', 'TDM', 'SER', 'µg/mL', 10, 20, 1200, { dec: 1 });
t('CARB', 'Carbamazepine', 'TDM', 'SER', 'µg/mL', 4, 12, 1200, { dec: 1 });
t('LITH', 'Lithium', 'TDM', 'SER', 'mmol/L', 0.6, 1.2, 900, { dec: 2, crit: [null, 1.5] });
t('THEO', 'Theophylline', 'TDM', 'SER', 'µg/mL', 10, 20, 1200, { dec: 1 });
t('VANC', 'Vancomycin (Trough)', 'TDM', 'SER', 'µg/mL', 10, 20, 1500, { dec: 1 });
t('TACRO', 'Tacrolimus', 'TDM', 'EDTA', 'ng/mL', 5, 15, 3000, { dec: 1 });
t('CYCLO', 'Cyclosporine', 'TDM', 'EDTA', 'ng/mL', 100, 400, 3000);
t('PARA', 'Paracetamol (Acetaminophen)', 'TDM', 'SER', 'µg/mL', 10, 30, 1200, { dec: 1 });
t('ETOH', 'Ethanol (Blood Alcohol)', 'TDM', 'SER', 'mg/dL', null, 10, 1200);
t('PB', 'Lead (Blood)', 'TDM', 'EDTA', 'µg/dL', null, 5, 2500, { dec: 1, r: [['A', 0, 18, null, 3.5]] });
t('DOPI', 'Opiates / Morphine', 'TDM', 'UR', null, null, null, 0, C({ opt: POSNEG }));
t('DAMP', 'Amphetamine', 'TDM', 'UR', null, null, null, 0, C({ opt: POSNEG }));
t('DMET', 'Methamphetamine', 'TDM', 'UR', null, null, null, 0, C({ opt: POSNEG }));
t('DTHC', 'Cannabinoids (THC)', 'TDM', 'UR', null, null, null, 0, C({ opt: POSNEG }));
t('DBZO', 'Benzodiazepines', 'TDM', 'UR', null, null, null, 0, C({ opt: POSNEG }));
t('DCOC', 'Cocaine', 'TDM', 'UR', null, null, null, 0, C({ opt: POSNEG }));
t('DTRA', 'Tramadol', 'TDM', 'UR', null, null, null, 0, C({ opt: POSNEG }));
t('DMTD', 'Methadone', 'TDM', 'UR', null, null, null, 0, C({ opt: POSNEG }));
p('DOA', 'Drugs of Abuse Screen (Urine)', 'TDM', 'UR', 1200, ['DOPI', 'DAMP', 'DMET', 'DTHC', 'DBZO', 'DCOC', 'DTRA', 'DMTD']);

// =====================================================================
// MOLECULAR (PCR)
// =====================================================================
t('HBVDNA', 'HBV DNA Viral Load (Quantitative PCR)', 'MOL', 'EDTA', 'IU/mL', null, null, 5500, TXT({ text: 'Not detected', tat: 120 }));
t('HCVRNA', 'HCV RNA Viral Load (Quantitative PCR)', 'MOL', 'EDTA', 'IU/mL', null, null, 5500, TXT({ text: 'Not detected', tat: 120 }));
t('HCVGT', 'HCV Genotyping', 'MOL', 'EDTA', null, null, null, 8000, TXT({ text: '', tat: 168 }));
t('HIVVL', 'HIV-1 RNA Viral Load', 'MOL', 'EDTA', 'copies/mL', null, null, 6000, TXT({ text: 'Not detected', tat: 120 }));
t('XPERT', 'GeneXpert MTB/RIF', 'MOL', 'SPT', null, null, null, 3500, { opt: ['MTB not detected', 'MTB detected, Rifampicin resistance not detected', 'MTB detected, Rifampicin resistance detected', 'Invalid / Error'], tat: 24 });
t('COVPCR', 'SARS-CoV-2 RT-PCR', 'MOL', 'NPS', null, null, null, 2500, { opt: DETECT, tat: 24 });
t('HPV', 'HPV DNA (High-risk)', 'MOL', 'SWB', null, null, null, 5000, { opt: DETECT, tat: 120 });
t('FVL', 'Factor V Leiden Mutation', 'MOL', 'EDTA', null, null, null, 5000, { opt: ['Not detected (Wild type)', 'Heterozygous', 'Homozygous'], tat: 168 });
t('JAK2', 'JAK2 V617F Mutation', 'MOL', 'EDTA', null, null, null, 6000, { opt: DETECT, tat: 168 });
t('BCRABL', 'BCR-ABL (Quantitative)', 'MOL', 'EDTA', '%IS', null, null, 9000, TXT({ text: 'Not detected', tat: 168 }));
t('THALM', 'Beta-Thalassemia Mutation Analysis', 'MOL', 'EDTA', null, null, null, 9000, MEMO({ text: '', tat: 336 }));

// =====================================================================
// BLOOD GASES
// =====================================================================
t('BGPH', 'pH', 'ABG', 'ART', null, 7.35, 7.45, 0, C({ dec: 2, crit: [7.2, 7.6] }));
t('PCO2', 'pCO₂', 'ABG', 'ART', 'mmHg', 35, 45, 0, C({ crit: [20, 70] }));
t('PO2', 'pO₂', 'ABG', 'ART', 'mmHg', 80, 100, 0, C({ crit: [40, null] }));
t('BGHCO3', 'HCO₃⁻ (Actual)', 'ABG', 'ART', 'mmol/L', 22, 26, 0, C({ dec: 1 }));
t('BE', 'Base Excess', 'ABG', 'ART', 'mmol/L', -2, 2, 0, C({ dec: 1 }));
t('SAO2', 'O₂ Saturation', 'ABG', 'ART', '%', 95, 100, 0, C({ dec: 1 }));
p('ABGP', 'Arterial Blood Gas (ABG)', 'ABG', 'ART', 1500, ['BGPH', 'PCO2', 'PO2', 'BGHCO3', 'BE', 'SAO2', 'LACT'], { tat: 1 });

// =====================================================================
// HISTOPATHOLOGY & CYTOLOGY
// =====================================================================
t('HPS', 'Histopathology - Small Biopsy', 'PATH', 'TIS', null, null, null, 2500, MEMO({ text: '', tat: 120 }));
t('HPL', 'Histopathology - Large Specimen', 'PATH', 'TIS', null, null, null, 4000, MEMO({ text: '', tat: 168 }));
t('PAP', 'Pap Smear (Cervical Cytology)', 'PATH', 'SWB', null, null, null, 1200, MEMO({ text: 'Negative for intraepithelial lesion or malignancy (NILM)', tat: 96 }));
t('FNAC', 'FNAC (Fine Needle Aspiration Cytology)', 'PATH', 'BF', null, null, null, 2000, MEMO({ text: '', tat: 72 }));
t('FCYT', 'Fluid Cytology', 'PATH', 'BF', null, null, null, 1500, MEMO({ text: 'No malignant cells seen', tat: 72 }));
t('BMA', 'Bone Marrow Aspiration', 'PATH', 'EDTA', null, null, null, 3500, MEMO({ text: '', tat: 120 }));

// ---- popular checkup packages ----
p('CHKBASIC', 'Basic Health Checkup (CBC, FBS, Lipid, LFT, RFT, Urine)', 'BIO', 'SER', 2200, ['CBC', 'GLUF', 'LIPID', 'LFT', 'RFT', 'URINE']);
p('CHKFULL', 'Comprehensive Checkup (Basic + TFT, HbA1c, Vit D, B12, Iron)', 'BIO', 'SER', 5500, ['CBC', 'GLUF', 'HBA1C', 'LIPID', 'LFT', 'RFT', 'ELECP', 'TFT', 'VITD', 'VITB12', 'IRON', 'URINE']);
p('ANC', 'Antenatal Profile (CBC, Blood Group, FBS, HBsAg, HCV, HIV, VDRL, Urine, TSH)', 'BIO', 'SER', 1800, ['CBC', 'BGRH', 'GLUF', 'HBSAG', 'HCV', 'HIV', 'VDRL', 'URINE', 'TSH']);
p('PREOP', 'Pre-operative Profile (CBC, BT/CT, PT/INR, Blood Group, FBS, Viral Screen, Creatinine)', 'BIO', 'SER', 1800, ['CBC', 'BTCT', 'PTINR', 'BGRH', 'GLUR', 'VIRAL', 'CREA']);
p('FEVER', 'Fever Profile (CBC, MP, Widal, CRP, Urine)', 'SER', 'SER', 900, ['CBC', 'MP', 'WIDAL', 'CRP', 'URINE']);
p('ARTH', 'Arthritis Profile (RF, CRP, ASO, Uric Acid, ESR, Anti-CCP)', 'IMM', 'SER', 2200, ['RF', 'CRP', 'ASO', 'UA', 'ESR', 'CCP']);

module.exports = { departments, sampleTypes, tests, panels };
