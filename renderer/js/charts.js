/* Chart helpers (Chart.js) — validated categorical palette, thin marks, recessive axes */
'use strict';

const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const CH = { grid: '#eef1f5', axis: '#94a3b8', text: '#475569', surface: '#ffffff' };

if (window.Chart) {
  Chart.defaults.font.family = "'Vazirmatn','Segoe UI',Tahoma,sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = CH.text;
  Chart.defaults.animation.duration = 350;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = '#172033';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.rtl = true;
  Chart.defaults.plugins.tooltip.textDirection = 'rtl';
  Chart.defaults.maintainAspectRatio = false;
}

function destroyCharts() { App.charts.forEach(c => { try { c.destroy(); } catch (_) {} }); App.charts = []; }

function axisOpts(fmt) {
  return {
    x: { grid: { display: false }, border: { color: CH.grid }, ticks: { color: CH.text, maxRotation: 0, autoSkip: true } },
    y: { beginAtZero: true, grid: { color: CH.grid }, border: { display: false }, ticks: { color: CH.axis, callback: v => fmt ? fmt(v) : compact(v), maxTicksLimit: 6 } }
  };
}
function compact(v) { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'; return v; }

// datasets: [{label, data, color?, type?}]
function barChart(canvas, labels, datasets, { stacked = false, money: isMoney = false, horizontal = false, onClick } = {}) {
  const fmt = isMoney ? (v) => compact(v) : null;
  const ds = datasets.map((d, i) => ({
    label: d.label, data: d.data, type: d.type || 'bar',
    backgroundColor: d.color || SERIES[i % SERIES.length], borderColor: d.type === 'line' ? (d.color || SERIES[i]) : CH.surface,
    borderWidth: d.type === 'line' ? 2 : (stacked ? { top: 2 } : 0), borderRadius: d.type === 'line' ? 0 : 4, borderSkipped: 'start',
    maxBarThickness: 28, categoryPercentage: .7, barPercentage: .9,
    pointRadius: d.type === 'line' ? 3 : 0, pointHoverRadius: 5, pointBackgroundColor: d.color || SERIES[i], pointBorderColor: CH.surface, pointBorderWidth: 2,
    tension: .25, order: d.type === 'line' ? 0 : 1, yAxisID: 'y', fill: false
  }));
  const scales = axisOpts(fmt);
  if (stacked) { scales.x.stacked = true; scales.y.stacked = true; }
  if (horizontal) { const t = scales.x; scales.x = { ...scales.y, ticks: { ...scales.y.ticks } }; scales.y = { ...t, ticks: { ...t.ticks, color: CH.text } }; }
  const c = new Chart(canvas, {
    type: 'bar', data: { labels, datasets: ds },
    options: {
      indexAxis: horizontal ? 'y' : 'x', scales, interaction: { mode: horizontal ? 'nearest' : 'index', intersect: horizontal },
      plugins: { tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${isMoney ? money(ctx.parsed[horizontal ? 'x' : 'y']) + ' ' + currency() : money(ctx.parsed[horizontal ? 'x' : 'y'])}` } } },
      onClick: onClick ? (e, els) => { if (els[0]) onClick(els[0].index); } : undefined
    }
  });
  App.charts.push(c); return c;
}

// numeric trend with optional reference band [low, high]
function trendChart(canvas, labels, values, { label = '', low = null, high = null, unit = '' } = {}) {
  const ds = [{ label, data: values, borderColor: SERIES[0], backgroundColor: SERIES[0], borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: CH.surface, pointBorderWidth: 2, tension: .2, spanGaps: true }];
  const scales = axisOpts(); scales.y.beginAtZero = false;
  const nums = values.filter(v => v !== null && isFinite(v));
  const lo = Math.min(...nums, low ?? Infinity), hi = Math.max(...nums, high ?? -Infinity);
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
  scales.y.suggestedMin = lo - pad; scales.y.suggestedMax = hi + pad;
  // reference band: soft fill between low and high + dashed limits
  const band = {
    id: 'refBand',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: a, scales: { y } } = chart; if (!a) return;
      ctx.save();
      const yH = high !== null ? y.getPixelForValue(high) : a.top, yL = low !== null ? y.getPixelForValue(low) : a.bottom;
      ctx.fillStyle = 'rgba(27,175,122,.08)'; ctx.fillRect(a.left, Math.max(a.top, yH), a.right - a.left, Math.min(a.bottom, yL) - Math.max(a.top, yH));
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
      if (high !== null) { ctx.strokeStyle = '#e34948'; ctx.beginPath(); ctx.moveTo(a.left, yH); ctx.lineTo(a.right, yH); ctx.stroke(); }
      if (low !== null) { ctx.strokeStyle = '#2a78d6'; ctx.beginPath(); ctx.moveTo(a.left, yL); ctx.lineTo(a.right, yL); ctx.stroke(); }
      ctx.restore();
    }
  };
  const c = new Chart(canvas, { type: 'line', data: { labels, datasets: ds }, plugins: [band], options: { scales, interaction: { mode: 'index', intersect: false },
    plugins: { tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} ${unit}` } } } } });
  App.charts.push(c); return c;
}

function legendHTML(items) { return `<div class="legendRow">${items.map((x, i) => `<span><i style="background:${x.color || SERIES[i]}"></i>${esc(x.label)}</span>`).join('')}</div>`; }
