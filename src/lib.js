export const N = (v) => (v == null || v === '' ? 0 : +v);
export const fi = (v) => Number(v).toLocaleString('en-US');
export const fp = (v) => Number(v).toFixed(1) + '%';
export const sgn = (d, f = 1) => (d > 0 ? '+' : '') + d.toFixed(f);

export function sum(rows) {
  const t = { total: 0, upd: 0, not_upd: 0, other: 0, cod_not: 0, no_reply: 0 };
  rows.forEach((r) => Object.keys(t).forEach((k) => { t[k] += N(r[k]); }));
  t.rate = t.total ? (t.upd / t.total) * 100 : 0;
  return t;
}

// مستويات الصحة (الحدود افتراضية للعرض وليست سياسة معتمدة)
export const LEVELS = {
  excellent: { label: 'ممتاز', icon: 'fa-circle-check', cls: 's-success' },
  good: { label: 'جيد', icon: 'fa-circle-info', cls: 's-progress' },
  attention: { label: 'يحتاج انتباه', icon: 'fa-triangle-exclamation', cls: 's-action' },
  critical: { label: 'حرج', icon: 'fa-circle-exclamation', cls: 's-violation' }
};
export function levelOf(rate, th) {
  if (rate >= th.excellent) return 'excellent';
  if (rate >= th.good) return 'good';
  if (rate >= th.bad) return 'attention';
  return 'critical';
}

export function toCsv(rows, cols) {
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return '﻿' + [cols.map((c) => esc(c.h)).join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c.k])).join(','))).join('\n');
}
export function download(name, text) {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  } catch { /* ignore */ }
}

export function loadCfg(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } }
export function saveCfg(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }

// بيانات تجريبية للمعاينة فقط (غير حقيقية)
export function demoRows() {
  let s = 20261105;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const br = { 'المنصورة': .8, 'الشروق': .86, 'أكتوبر': .84, 'الزقازيق': .56, 'الهرم': .3, 'قليوب': .14, 'العجوزة': .95, 'طنطا': .5, 'المعادي': .7 };
  const rows = [];
  for (let d = 0; d < 14; d++) {
    const dt = new Date(Date.UTC(2026, 9, 23 + d)).toISOString().slice(0, 10);
    if (d === 5) continue;
    Object.keys(br).forEach((b) => {
      if (b === 'المعادي' && d > 10) return;
      const t = 100 + Math.floor(rnd() * 150);
      const u = Math.round(t * Math.min(1, Math.max(0, br[b] + (rnd() - .5) * .12 + d * (b === 'الهرم' ? .008 : 0))));
      rows.push({ date: dt, branch: b, total: t, upd: u, not_upd: t - u, other: 0, rate: Math.round((u / t) * 1000) / 10, cod_not: (t - u) * 380, no_reply: b === 'قليوب' ? t : 0, source: 'demo' });
    });
  }
  return rows;
}
