/* Minimal Code 128-B barcode generator → SVG (for sample tube labels & reports) */
'use strict';

const CODE128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];

function code128Pattern(text) {
  const codes = [104]; // Start B
  for (const ch of String(text)) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) continue;
    codes.push(c - 32);
  }
  let sum = codes[0];
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103, 106);
  return codes.map(c => CODE128[c]).join('');
}

function barcodeSVG(text, { height = 34, module = 1.4, showText = true } = {}) {
  const pat = code128Pattern(text);
  let x = 10 * module, bars = '';
  for (let i = 0; i < pat.length; i++) {
    const w = Number(pat[i]) * module;
    if (i % 2 === 0) bars += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`;
    x += w;
  }
  const width = x + 10 * module;
  const th = showText ? 11 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height + th}" viewBox="0 0 ${width.toFixed(2)} ${height + th}"><g fill="#000">${bars}</g>${showText ? `<text x="${(width / 2).toFixed(1)}" y="${height + 10}" font-size="10" text-anchor="middle" font-family="Consolas,monospace">${esc(text)}</text>` : ''}</svg>`;
}

if (typeof module !== 'undefined') module.exports = { code128Pattern, CODE128 };
