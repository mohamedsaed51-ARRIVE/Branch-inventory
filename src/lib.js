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

// تجميع شهري تجريبي مشتق من البيانات التجريبية اليومية (غير حقيقي)
export function demoMonthly(rows) {
  const out = [];
  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
  months.forEach((m) => {
    const mr = rows.filter((r) => r.date.startsWith(m));
    [...new Set(mr.map((r) => r.branch))].forEach((b) => {
      const br = mr.filter((r) => r.branch === b);
      const total = Math.round(Math.max(...br.map((r) => N(r.total))) * 1.8);
      const avg = br.reduce((a, r) => a + N(r.rate), 0) / br.length;
      const no_audit = Math.round(total * 0.01);
      const upd = Math.round(total * avg / 100);
      const not_upd = Math.max(0, total - upd - no_audit);
      const noReplyBranch = br.some((r) => N(r.no_reply) > 0);
      out.push({ month: m, branch: b, closed: Math.round(total * 0.2), total, upd, not_upd, no_audit, no_branch_reply: noReplyBranch ? Math.round(total * 0.9) : Math.round(total * 0.03), conflict: Math.round(not_upd * 0.05), last: br[br.length - 1].date, days: br.length });
    });
  });
  return out;
}
export function sumMonthly(rows) {
  const t = { total: 0, upd: 0, not_upd: 0, no_audit: 0, no_branch_reply: 0, conflict: 0, closed: 0 };
  rows.forEach((r) => Object.keys(t).forEach((k) => { t[k] += N(r[k]); }));
  const hasClosed = rows.some((r) => r.closed != null);
  const pc = (v) => (t.total ? (v / t.total) * 100 : 0);
  return { ...t, rate: pc(t.upd), p_not: pc(t.not_upd), p_no_audit: pc(t.no_audit), p_no_branch: pc(t.no_branch_reply), p_conflict: pc(t.conflict), p_closed: pc(t.closed), hasClosed };
}

// الجمعة إجازة: لا تُحسب يومًا ناقصًا (0 = الأحد ... 5 = الجمعة)
export const OFF_DAY = 5;
export const isOff = (d) => new Date(d + 'T00:00:00Z').getUTCDay() === OFF_DAY;
export const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
// أيام العمل الناقصة (بدون الجمعة) بين تاريخين غير شاملين
export function missingWorkDays(a, b) {
  const out = [];
  for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) if (!isOff(d)) out.push(d);
  return out;
}

// ملخص متابعة تجريبي للمعاينة فقط (غير حقيقي)
export function demoFollow(rows) {
  const branches = [...new Set(rows.map((r) => r.branch))].sort();
  const bl = branches.map((b, i) => {
    const total = 60 + i * 9, closed = Math.round(total * (0.12 + (i % 4) * 0.06)), missing = (i * 3 + 2) % 11, open = Math.round(total * 0.35), ended = total - closed - missing - open;
    return { branch: b, total, open, closed, missing, ended, repeated: Math.round(total * 0.3), avg_resp: Math.round((0.4 + (i % 5) * 0.5) * 10) / 10 };
  });
  const S = (k) => bl.reduce((a, b) => a + b[k], 0), n = S('total'), r1 = (v) => Math.round(v * 10) / 10;
  const mk = (len, fn) => Array.from({ length: len }, (_, i) => fn(i));
  return {
    asOf: rows.map((r) => r.date).sort().pop(),
    kpi: { total: n, open: S('open'), closed: S('closed'), missing: S('missing'), ended: S('ended'), close_rate: r1(S('closed') / n * 100), missing_rate: r1(S('missing') / n * 100), repeated_rate: r1(S('repeated') / n * 100), avg_appearances: 2.2, avg_response_days: 1.4, avg_close_days: 2.1, oldest_open_days: 12 },
    branches: bl,
    lists: {
      missing: mk(8, (i) => ({ awb: 'DEMO-M' + (1000 + i), branch: branches[i % branches.length], status: 'in transit', last_seen: rows[0].date, missing_days: 8 - i, a_status: 'مفتوح' })),
      open: mk(8, (i) => ({ awb: 'DEMO-O' + (2000 + i), branch: branches[(i + 2) % branches.length], status: 'قيد التوصيل', open_days: 12 - i, a_status: 'تحت المراجعة' })),
      repeated: mk(8, (i) => ({ awb: 'DEMO-R' + (3000 + i), branch: branches[(i + 4) % branches.length], days: 9 - i, status: 'in transit' }))
    }
  };
}
