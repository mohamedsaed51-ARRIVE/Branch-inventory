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
      out.push({ month: m, branch: b, total, upd, not_upd, no_audit, no_branch_reply: noReplyBranch ? Math.round(total * 0.9) : Math.round(total * 0.03), conflict: Math.round(not_upd * 0.05), last: br[br.length - 1].date, days: br.length });
    });
  });
  return out;
}
export function sumMonthly(rows) {
  const t = { total: 0, upd: 0, not_upd: 0, no_audit: 0, no_branch_reply: 0, conflict: 0 };
  rows.forEach((r) => Object.keys(t).forEach((k) => { t[k] += N(r[k]); }));
  const pc = (v) => (t.total ? (v / t.total) * 100 : 0);
  return { ...t, rate: pc(t.upd), p_not: pc(t.not_upd), p_no_audit: pc(t.no_audit), p_no_branch: pc(t.no_branch_reply), p_conflict: pc(t.conflict) };
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

/* ---------- التفصيلي (تجميع_تفصيلي) ---------- */
export const GROUPS = ['قيد التوصيل', 'مرتجعات إلى الرئيسي', 'مرتجعات إلى الفروع', 'مرتجعات أخرى', 'في الطريق للتاجر', 'تأجيل', 'مشاكل وتعذر التسليم', 'تواصل واتساب', 'محاولات التسليم', 'إعادة توزيع وتحويل', 'أخرى'];
export const isReturnGroup = (g) => g.startsWith('مرتجعات');
const DKEYS = ['total', 'upd', 'not_upd', 'other', 'a0', 'a2', 'a3', 'a5', 'nd', 'cod', 'cod_not', 'r_none', 'r_done', 'r_main', 'r_rep', 'r_close', 'r_other', 'conflict', 'neg_cod'];

// مصفوفات الويب آب -> كائنات
export function detailObjects(detail, cols) {
  const c = cols && cols.length ? cols : ['date', 'branch', 'grp', ...DKEYS, 'source'];
  return (detail || []).map((r) => { const o = {}; c.forEach((k, i) => { o[k] = r[i]; }); return o; });
}

// إجمالي صفوف تفصيلية. ageMin: حد «متأخرة» وقيمه 2 أو 3 أو 5 فقط لأن التجميع بشرائح العمر (0-1، 2، 3-4، 5+)
export function sumD(rows, ageMin = 3) {
  const t = {}; DKEYS.forEach((k) => { t[k] = 0; });
  rows.forEach((r) => DKEYS.forEach((k) => { t[k] += N(r[k]); }));
  t.late = lateOf(t, ageMin);
  t.returns = rows.filter((r) => isReturnGroup(r.grp)).reduce((a, r) => a + N(r.total), 0);
  t.returns_main = rows.filter((r) => r.grp === 'مرتجعات إلى الرئيسي').reduce((a, r) => a + N(r.total), 0);
  const pc = (v) => (t.total ? (v / t.total) * 100 : 0);
  t.rate = pc(t.upd); t.p_late = pc(t.late); t.p_ret = pc(t.returns); t.p_none = pc(t.r_none);
  return t;
}
export const AGE_OPTS = [[2, 'يومان فأكثر'], [3, '3 أيام فأكثر'], [5, '5 أيام فأكثر']];
export function lateOf(t, ageMin) { return (ageMin <= 2 ? N(t.a2) : 0) + (ageMin <= 3 ? N(t.a3) : 0) + N(t.a5); }

// تجميع حسب مفتاح (فرع / مجموعة / تاريخ)
export function groupBy(rows, keyFn) {
  const m = new Map();
  rows.forEach((r) => { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
  return m;
}

// بيانات تفصيلية تجريبية مشتقة من اليومي التجريبي (غير حقيقية)
export function demoDetail(rows) {
  let s = 7771;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mix = [['قيد التوصيل', .44], ['مرتجعات إلى الرئيسي', .22], ['مرتجعات إلى الفروع', .04], ['في الطريق للتاجر', .04], ['تأجيل', .05], ['مشاكل وتعذر التسليم', .08], ['تواصل واتساب', .04], ['محاولات التسليم', .04], ['إعادة توزيع وتحويل', .03], ['أخرى', .02]];
  const out = [];
  rows.forEach((r) => {
    let left = N(r.total), leftU = N(r.upd);
    mix.forEach(([g, w], i) => {
      const t = i === mix.length - 1 ? left : Math.min(left, Math.round(N(r.total) * w * (0.8 + rnd() * 0.4)));
      left -= t;
      const u = Math.min(t, Math.round(t * (N(r.rate) / 100)));
      const nu = t - u;
      const old = r.branch === 'الزقازيق' || r.branch === 'الهرم' ? 0.25 : 0.04;
      const a5 = Math.round(nu * old * .2), a3 = Math.round(nu * old), a2 = Math.round(t * .03);
      const none = r.branch === 'قليوب' ? t : Math.round(t * .01);
      const done = Math.round(u * .45);
      const main = isReturnGroup(g) ? Math.round(t * .8) : Math.round(t * .05);
      const rest = Math.max(0, t - none - done - main);
      const rep = Math.round(rest * .5), cl = Math.round(rest * .3);
      out.push({ date: r.date, branch: r.branch, grp: g, total: t, upd: u, not_upd: nu, other: 0, a0: Math.max(0, t - a2 - a3 - a5), a2, a3, a5, nd: 0,
        cod: t * 330, cod_not: nu * 380, r_none: none, r_done: done, r_main: main, r_rep: rep, r_close: cl, r_other: Math.max(0, rest - rep - cl), conflict: Math.round(nu * .02), neg_cod: 0, source: 'demo' });
    });
  });
  return out;
}
