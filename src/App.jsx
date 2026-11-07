import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ChartBox from './ChartBox.jsx';
import { N, fi, fp, sgn, sum, sumMonthly, LEVELS, levelOf, toCsv, download, loadCfg, saveCfg, demoRows, demoMonthly } from './lib.js';

const ENV_URL = import.meta.env.VITE_DATA_URL;
const ENV_TOKEN = import.meta.env.VITE_DATA_TOKEN;
const DEFAULTS = { url: '', refreshMin: 15, excellent: 90, good: 80, bad: 50 };
const PAGE = 15;

function useData(url, refreshMin, demo) {
  const [s, set] = useState({ status: 'idle', rows: [], monthly: [], at: null });
  const run = useCallback(() => {
    if (demo) { const d = demoRows(); set({ status: 'ok', rows: d, monthly: demoMonthly(d), at: new Date(), generated: 'demo' }); return; }
    if (!url) { set({ status: 'nourl', rows: [], at: null }); return; }
    const u = ENV_TOKEN ? url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(ENV_TOKEN) : url;
    set((p) => ({ ...p, status: p.rows.length ? 'refreshing' : 'loading' }));
    fetch(u).then((r) => r.json()).then((j) => {
      if (j.error) throw new Error(j.error);
      set({ status: 'ok', rows: j.rows || [], monthly: j.monthly || [], at: new Date(), generated: j.generated });
    }).catch((e) => set((p) => ({ ...p, status: 'error', msg: String(e.message || e) })));
  }, [url, demo]);
  useEffect(() => { run(); }, [run]);
  useEffect(() => {
    if (demo || !refreshMin || !url) return undefined;
    const id = setInterval(run, refreshMin * 60000);
    return () => clearInterval(id);
  }, [run, refreshMin, url, demo]);
  return { ...s, reload: run };
}

function Delta({ cur, prev, lowerBetter, pp }) {
  if (prev == null) return <span className="d muted">لا يوجد يوم سابق</span>;
  const d = cur - prev;
  const c = d === 0 ? 'muted' : (lowerBetter ? d < 0 : d > 0) ? 'ok' : 'bad';
  return <span className={'d ' + c}><span dir="ltr">{pp ? sgn(d) + ' نقطة' : (d > 0 ? '+' : '') + fi(d)}</span> عن اليوم السابق</span>;
}
const Badge = ({ lv }) => <span className={'chip ' + LEVELS[lv].cls}><i className={'fa-solid ' + LEVELS[lv].icon} />{LEVELS[lv].label}</span>;
const Heading = ({ tag, title, sub }) => (
  <div><div className="section-heading"><span className="tag">{tag}</span><h2>{title}</h2></div>{sub && <p className="section-sub">{sub}</p>}</div>
);

export default function App() {
  const [cfg, setCfg] = useState(() => ({ ...DEFAULTS, ...loadCfg('bi_cfg', {}) }));
  const [theme, setTheme] = useState(() => loadCfg('bi_theme', 'light'));
  const [demoOn, setDemoOn] = useState(() => new URLSearchParams(location.search).get('demo') === '1');
  const [showSet, setShowSet] = useState(false);
  const url = cfg.url || ENV_URL || '';
  const { status, rows, monthly, at, msg, generated, reload } = useData(url, cfg.refreshMin, demoOn);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); saveCfg('bi_theme', theme); }, [theme]);

  const dates = useMemo(() => [...new Set(rows.map((r) => r.date))].sort(), [rows]);
  const allBranches = useMemo(() => [...new Set(rows.map((r) => r.branch))].sort(), [rows]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sel, setSel] = useState([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState({ k: 'date', dir: -1 });
  const [cmp, setCmp] = useState({ on: false, a: '', b: '' });
  const [month, setMonth] = useState('');
  const [copied, setCopied] = useState('');
  const th = { excellent: +cfg.excellent, good: +cfg.good, bad: +cfg.bad };

  useEffect(() => { setFrom(''); setTo(''); }, [rows.length]);
  const dFrom = from || dates[Math.max(0, dates.length - 14)] || '';
  const dTo = to || dates[dates.length - 1] || '';

  const branchOk = (r) => (!sel.length || sel.includes(r.branch)) && (!q || r.branch.includes(q));
  const inRange = rows.filter((r) => r.date >= dFrom && r.date <= dTo && branchOk(r));
  const rangeDates = [...new Set(inRange.map((r) => r.date))].sort();
  const snap = rangeDates[rangeDates.length - 1];
  const prevDate = [...new Set(rows.filter(branchOk).map((r) => r.date))].sort().filter((d) => d < snap).pop();
  const snapRows = inRange.filter((r) => r.date === snap);
  const prevRows = prevDate ? rows.filter((r) => r.date === prevDate && branchOk(r)) : null;
  const T = sum(snapRows), P = prevRows ? sum(prevRows) : null;
  const prevBy = new Map((prevRows || []).map((r) => [r.branch, r]));

  const months = [...new Set(monthly.map((r) => r.month))].sort();
  const curMonth = months.includes(month) ? month : months[months.length - 1];
  const monthRows = monthly.filter((r) => r.month === curMonth && branchOk(r));
  const M = sumMonthly(monthRows);
  const prevMonth = months[months.indexOf(curMonth) - 1];
  const MP = prevMonth ? sumMonthly(monthly.filter((r) => r.month === prevMonth && branchOk(r))) : null;
  const monthLast = monthRows.map((r) => r.last).sort().pop();
  const monthDays = Math.max(0, ...monthRows.map((r) => N(r.days)));

  const reset = () => { setFrom(''); setTo(''); setSel([]); setQ(''); setPage(0); };
  const exportCsv = () => download('branch-inventory.csv', toCsv(inRange, [
    { h: 'التاريخ', k: 'date' }, { h: 'الفرع', k: 'branch' }, { h: 'الشحنات', k: 'total' }, { h: 'تم التحديث', k: 'upd' }, { h: 'لم يتم التحديث', k: 'not_upd' },
    { h: 'غير محدد', k: 'other' }, { h: 'نسبة التحديث %', k: 'rate' }, { h: 'تحصيل غير محدّث', k: 'cod_not' }, { h: 'بدون رد', k: 'no_reply' }]));
  const fullscreen = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch { /* ignore */ } };

  /* ---------- حالات ما قبل العرض ---------- */
  const header = (
    <>
      <div className="top"><div className="top-inner">
        <div className="brand"><h1>لوحة متابعة جرد الفروع</h1><p>ARRIVE — الإدارة المالية والتدقيق الداخلي</p></div>
        <div className="hbtns">
          <button className="hbtn" onClick={reload}><i className="fa-solid fa-rotate" />تحديث</button>
          <button className="hbtn" onClick={() => setCmp((c) => ({ ...c, on: !c.on, a: c.a || prevDate || dates[0] || '', b: c.b || snap || '' }))}><i className="fa-solid fa-right-left" />وضع المقارنة</button>
          <button className="hbtn" onClick={exportCsv}><i className="fa-solid fa-file-csv" />تصدير</button>
          <button className="hbtn" onClick={() => setShowSet(true)}><i className="fa-solid fa-gear" />إعدادات</button>
          <button className="hbtn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><i className={'fa-solid ' + (theme === 'dark' ? 'fa-sun' : 'fa-moon')} />{theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</button>
        </div>
      </div></div>
      {demoOn && <div className="demo"><i className="fa-solid fa-flask" /> وضع تجريبي: البيانات المعروضة غير حقيقية ولا تعبّر عن أي فرع</div>}
    </>
  );
  const modal = showSet && <Settings cfg={cfg} url={url} onClose={() => setShowSet(false)} onSave={(c) => { setCfg(c); saveCfg('bi_cfg', c); setShowSet(false); }} />;

  if (status === 'nourl' || status === 'idle') {
    return (<>{header}{modal}<div className="empty"><h2>لم يتم ضبط مصدر البيانات بعد</h2>
      <p>افتح «إعدادات» وأضف رابط Apps Script (ينتهي بـ <b className="fi">/exec</b>)، أو أضف متغير البيئة في Vercel:</p>
      <pre>VITE_DATA_URL=https://script.google.com/macros/s/XXXX/exec</pre>
      <button className="btn" onClick={() => setDemoOn(true)}>معاينة ببيانات تجريبية</button></div></>);
  }
  if (status === 'loading') return <>{header}{modal}<div className="empty muted">جارٍ تحميل البيانات…</div></>;
  if (status === 'error' && !rows.length) return <>{header}{modal}<div className="empty"><h2 className="bad">تعذر تحميل البيانات</h2><p>{msg}</p><button className="btn" onClick={reload}>إعادة المحاولة الآن</button></div></>;
  if (!rows.length) return <>{header}{modal}<div className="empty"><p>لا توجد صفوف في ورقة تجميع_الجرد بعد. شغّل التجميع في الشيت.</p></div></>;

  /* ---------- حسابات ---------- */
  const board = snapRows.map((r) => {
    const p = prevBy.get(r.branch);
    return { ...r, lv: levelOf(+r.rate, th), d: p ? +r.rate - +p.rate : null };
  }).sort((a, b) => a.rate - b.rate);

  const alerts = [];
  board.forEach((r) => {
    if (r.lv === 'critical') alerts.push({ c: 's-violation', i: 'fa-circle-exclamation', t: `${r.branch}: نسبة التحديث ${fp(r.rate)} أقل من ${th.bad}%` });
    if (r.d != null && r.d <= -10) alerts.push({ c: 's-action', i: 'fa-arrow-trend-down', t: `${r.branch}: تراجع ${Math.abs(r.d).toFixed(1)} نقطة عن اليوم السابق` });
    if (N(r.no_reply) > 0) alerts.push({ c: 's-violation', i: 'fa-comment-slash', t: `${r.branch}: ${fi(r.no_reply)} شحنة بدون رد من الفرع` });
  });
  const recent = dates.slice(Math.max(0, dates.indexOf(snap) - 14), dates.indexOf(snap));
  const missing = [...new Set(rows.filter((r) => recent.includes(r.date)).map((r) => r.branch))].filter((b) => (!sel.length || sel.includes(b)) && !snapRows.some((r) => r.branch === b));
  if (missing.length) alerts.push({ c: 's-action', i: 'fa-eye-slash', t: `فروع ظهرت في الأيام السابقة وغائبة عن ${snap}: ${missing.join('، ')}` });
  const unaudited = rangeDates.filter((d) => inRange.filter((r) => r.date === d).every((r) => N(r.other) === N(r.total)));
  if (unaudited.length) alerts.push({ c: 's-violation', i: 'fa-clipboard-question', t: `أيام بلا نتيجة جرد: ${unaudited.join('، ')}` });
  const gaps = [];
  for (let i = 1; i < dates.length; i++) { const g = Math.round((new Date(dates[i]) - new Date(dates[i - 1])) / 864e5); if (g > 1) gaps.push(`${dates[i - 1]} ← ${dates[i]}`); }
  if (gaps.length) alerts.push({ c: 's-progress', i: 'fa-calendar-xmark', t: `أيام ناقصة بين الأوراق: ${gaps.join('، ')}` });

  const actions = board.filter((r) => r.lv === 'critical' || r.lv === 'attention').sort((a, b) => N(b.cod_not) - N(a.cod_not)).map((r) => {
    const reasons = [`${fi(r.not_upd)} شحنة غير محدّثة`, `تحصيل ${fi(r.cod_not)} ج.م`];
    const acts = [r.lv === 'critical' ? 'طلب خطة تصحيح وموعد تقفيل من الفرع' : 'متابعة الشحنات غير المحدّثة مع الفرع'];
    if (N(r.no_reply)) { reasons.push(`${fi(r.no_reply)} بدون رد`); acts.push('طلب رد الفرع على الجرد'); }
    return { ...r, reasons, acts };
  });
  const copyActions = async () => {
    const txt = `ملخص جرد ${snap}\n` + actions.map((a) => `- ${a.branch}: ${a.reasons.join('، ')} | المقترح: ${a.acts.join('، ')} | المسؤول: [  ] | الموعد: [  ]`).join('\n');
    try { await navigator.clipboard.writeText(txt); setCopied('تم النسخ'); } catch { setCopied('تعذر النسخ'); }
    setTimeout(() => setCopied(''), 2500);
  };

  const big = board.filter((r) => N(r.total) >= 50);
  const worst = big.slice(0, 3), best = [...big].reverse().slice(0, 3);
  const totNot = N(T.not_upd);
  const top3Share = totNot ? [...board].sort((a, b) => N(b.not_upd) - N(a.not_upd)).slice(0, 3).reduce((s, r) => s + N(r.not_upd), 0) / totNot * 100 : 0;
  const maxCod = [...board].sort((a, b) => N(b.cod_not) - N(a.cod_not))[0];
  const dropper = board.filter((r) => r.d != null).sort((a, b) => a.d - b.d)[0];
  const riser = board.filter((r) => r.d != null).sort((a, b) => b.d - a.d)[0];
  const insights = [];
  if (worst[0]) insights.push(`أضعف فرع في ${snap}: ${worst[0].branch} بنسبة تحديث ${fp(worst[0].rate)}.`);
  if (totNot) insights.push(`أكثر 3 فروع في غير المحدّث تمثل ${top3Share.toFixed(0)}% من الشحنات غير المحدّثة.`);
  if (maxCod && N(maxCod.cod_not)) insights.push(`أكبر تحصيل غير محدّث عند ${maxCod.branch}: ${fi(maxCod.cod_not)} ج.م.`);
  if (riser && riser.d > 0) insights.push(`أكبر تحسن: ${riser.branch} (${sgn(riser.d)} نقطة).`);
  if (dropper && dropper.d < 0) insights.push(`أكبر تراجع: ${dropper.branch} (${sgn(dropper.d)} نقطة).`);

  /* مخططات */
  const cv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#0837C9';
  const byNot = [...board].sort((a, b) => N(b.not_upd) - N(a.not_upd));
  const byCod = [...board].sort((a, b) => N(b.cod_not) - N(a.cod_not));
  const trendDates = rangeDates;
  const overall = trendDates.map((d) => +sum(inRange.filter((r) => r.date === d)).rate.toFixed(1));
  const weak = worst.map((w) => w.branch);
  const lineCols = [cv('--chart-2'), cv('--status-action'), cv('--status-violation')];
  const trendSets = [{ label: 'الإجمالي', data: overall, borderColor: cv('--chart-1'), backgroundColor: cv('--chart-1'), tension: .25, borderWidth: 3, pointRadius: 3 }].concat(
    weak.map((b, i) => ({ label: b, data: trendDates.map((d) => { const r = inRange.find((x) => x.date === d && x.branch === b); return r ? +(+r.rate).toFixed(1) : null; }), borderColor: lineCols[i], backgroundColor: lineCols[i], tension: .25, borderWidth: 2, pointRadius: 2, spanGaps: true })));

  /* جدول السجل */
  const histCols = [['date', 'التاريخ'], ['branch', 'الفرع'], ['total', 'الشحنات'], ['rate', 'نسبة التحديث'], ['not_upd', 'غير محدّثة'], ['cod_not', 'تحصيل غير محدّث'], ['no_reply', 'بدون رد']];
  const hist = [...inRange].sort((a, b) => { const x = sort.k === 'branch' ? a.branch : N(a[sort.k]) || a[sort.k]; const y = sort.k === 'branch' ? b.branch : N(b[sort.k]) || b[sort.k]; return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  const pages = Math.max(1, Math.ceil(hist.length / PAGE));
  const pg = Math.min(page, pages - 1);

  /* المقارنة */
  const cmpSum = (d) => sum(rows.filter((r) => r.date === d && branchOk(r)));
  const A = cmp.on ? cmpSum(cmp.a) : null, B = cmp.on ? cmpSum(cmp.b) : null;

  const connLabel = status === 'error' ? 'خطأ في الاتصال' : demoOn ? 'تجريبي' : status === 'refreshing' ? 'جارٍ التحديث' : 'متصل';
  const connCls = status === 'error' ? 's-violation' : demoOn ? 's-action' : 's-success';

  return (
    <>
      {header}{modal}
      <div className="page">
        <div className="meta">
          <span className={'chip ' + connCls}><span className="dot" />{connLabel}</span>
          <span>آخر تحديث للبيانات: <b className="fi">{generated && generated !== 'demo' ? generated.slice(0, 16).replace('T', ' ') + ' UTC' : at ? at.toLocaleString('en-GB') : '—'}</b></span>
          <span>تاريخ الجرد المعروض: <b className="fi">{snap}</b></span>
          <span>السجلات: <b className="fi">{fi(rows.length)}</b></span>
          <span>الفروع: <b className="fi">{allBranches.length}</b></span>
          <span>نتيجة الجرد مستنتجة من عمود «تعليق الأوديت»</span>
        </div>

        <div className="control">
          <div>المعروض بعد الفلاتر: <b className="fi">{fi(inRange.length)}</b> صف
            {alerts.length > 0 && <span className="chip s-violation" style={{ marginInlineStart: 10 }}><i className="fa-solid fa-bell" />{alerts.length} تنبيه</span>}
          </div>
          <div className="qa">
            <button className="qa-btn" onClick={reload}><i className="fa-solid fa-rotate" />تحديث</button>
            <button className="qa-btn" onClick={reset}><i className="fa-solid fa-filter-circle-xmark" />إعادة تصفية</button>
            <button className="qa-btn" onClick={exportCsv}><i className="fa-solid fa-file-csv" />تصدير CSV</button>
            <button className="qa-btn" onClick={() => window.print()}><i className="fa-solid fa-print" />طباعة</button>
            <button className="qa-btn" onClick={fullscreen}><i className="fa-solid fa-expand" />ملء الشاشة</button>
          </div>
        </div>

        <div className="filters">
          <div className="fgrid">
            {months.length > 0 && <div className="fgroup"><label htmlFor="f-month">الشهر (للكروت الشهرية)</label><select id="f-month" value={curMonth} onChange={(e) => setMonth(e.target.value)}>{[...months].reverse().map((m) => <option key={m}>{m}</option>)}</select></div>}
            <div className="fgroup"><label htmlFor="f-from">من تاريخ</label><select id="f-from" value={dFrom} onChange={(e) => { setFrom(e.target.value); setPage(0); }}>{dates.map((d) => <option key={d}>{d}</option>)}</select></div>
            <div className="fgroup"><label htmlFor="f-to">إلى تاريخ</label><select id="f-to" value={dTo} onChange={(e) => { setTo(e.target.value); setPage(0); }}>{[...dates].reverse().map((d) => <option key={d}>{d}</option>)}</select></div>
            <div className="fgroup"><label htmlFor="f-q">بحث بالفرع</label><input id="f-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="اسم الفرع" /></div>
          </div>
          <div className="fgroup" style={{ marginTop: 10 }}><label>الفروع</label>
            <div className="multi">{allBranches.map((b) => <button key={b} className={sel.includes(b) ? 'on' : ''} onClick={() => { setSel(sel.includes(b) ? sel.filter((x) => x !== b) : [...sel, b]); setPage(0); }}>{b}</button>)}</div></div>
          <div className="active-filters">
            {(from || to) && <span className="afchip">الفترة: {dFrom} ← {dTo}<button aria-label="إزالة" onClick={() => { setFrom(''); setTo(''); }}>✕</button></span>}
            {sel.map((b) => <span className="afchip" key={b}>{b}<button aria-label="إزالة" onClick={() => setSel(sel.filter((x) => x !== b))}>✕</button></span>)}
            {q && <span className="afchip">بحث: {q}<button aria-label="إزالة" onClick={() => setQ('')}>✕</button></span>}
          </div>
        </div>

        {!snapRows.length ? <div className="panel"><p>لا توجد بيانات تطابق الفلاتر الحالية.</p></div> : (<>
        <Heading tag="الشهر" title={`المؤشرات الشهرية — \u200E${curMonth || '—'}\u200E`} sub={curMonth ? `كل شحنة تُحسب مرة واحدة في الشهر بآخر نتيجة أوديت مسجلة لها. أيام الجرد: ${monthDays}، آخر جرد: ${monthLast}.` : 'لا توجد بيانات شهرية'} />
        {!monthRows.length ? (
          <div className="panel"><p><i className="fa-solid fa-triangle-exclamation warn" /> الكروت الشهرية تحتاج ورقة <b>تجميع_شهري</b> من السكريبت المحدّث (apps-script/ArriveAuditSummary.gs و WebApp.gs) ثم «إعادة بناء كاملة». لم أعرض أرقامًا شهرية تقديرية.</p></div>
        ) : (<>
        <div className="kpi-row">
          <div className="kpi"><span className="l">شحنات الشهر (فريدة)</span><span className="v">{fi(M.total)}</span><span className="d muted">100% — كل شحنة مرة واحدة</span></div>
          <div className={'kpi ' + (M.rate >= th.good ? 'accent-ok' : M.rate >= th.bad ? 'accent-warn' : 'accent-bad')}><span className="l">نسبة التحديث <span className="chip s-progress">حسب الأوديت</span></span><span className="v">{fp(M.rate)}</span>
            <span className="d muted">تم التحديث {fi(M.upd)} من {fi(M.total)}{MP ? ` — الشهر السابق ${fp(MP.rate)}` : ''}</span></div>
          <div className="kpi accent-warn"><span className="l">غير محدّثة <span className="chip s-progress">حسب الأوديت</span></span><span className="v">{fi(M.not_upd)}</span><span className="d muted">{fp(M.p_not)} من الشحنات</span></div>
          <div className="kpi accent-bad"><span className="l">بدون رد الفرع <span className="chip s-action">حسب الفرع</span></span><span className="v">{fi(M.no_branch_reply)}</span><span className="d muted">{fp(M.p_no_branch)} من الشحنات (عمود رد الفرع فارغ)</span></div>
          <div className="kpi accent-teal"><span className="l">بدون رد الأوديت <span className="chip s-progress">حسب الأوديت</span></span><span className="v">{fi(M.no_audit)}</span><span className="d muted">{fp(M.p_no_audit)} من الشحنات (تعليق الأوديت فارغ أو غير مطابق)</span></div>
        </div>
        <p className="section-sub" style={{ marginTop: 8 }}>
          <b>الأساس:</b> «حسب الأوديت» = عمود تعليق الأوديت («تم…» = محدّثة، «لم يتم…» = غير محدّثة، الفارغ = بدون رد الأوديت). «حسب الفرع» = عمود رد الفرع (الفارغ = بدون رد). النسب كلها من شحنات الشهر الفريدة. حالة «إغلاق رد الأوديت» لا يوجد لها عمود في الشيت بعد، والبديل المعروض هو «بدون رد الأوديت».
        </p>
        <div className="panel tscroll" style={{ marginTop: 8 }}><table>
          <thead><tr><th>الفرع</th><th>الشحنات</th><th>نسبة التحديث (أوديت)</th><th>غير محدّثة</th><th>بدون رد الفرع</th><th>بدون رد الأوديت</th><th>تعارض</th></tr></thead>
          <tbody>{[...monthRows].sort((a, b) => (N(a.upd) / (N(a.total) || 1)) - (N(b.upd) / (N(b.total) || 1))).map((r) => {
            const t = N(r.total) || 1; const rate = N(r.upd) / t * 100;
            return <tr key={r.branch}><td>{r.branch}</td><td className="n">{fi(r.total)}</td><td className="n"><b>{fp(rate)}</b></td>
              <td className="n">{fi(r.not_upd)} <small className="muted">({fp(N(r.not_upd) / t * 100)})</small></td>
              <td className="n">{fi(r.no_branch_reply)} <small className="muted">({fp(N(r.no_branch_reply) / t * 100)})</small></td>
              <td className="n">{fi(r.no_audit)} <small className="muted">({fp(N(r.no_audit) / t * 100)})</small></td>
              <td className="n">{fi(r.conflict)}</td></tr>;
          })}</tbody>
        </table></div>
        <p className="section-sub">«تعارض» = رد الفرع «تم التحديث» لكن الأوديت يقول «لم يتم التحديث».</p>
        </>)}

        <Heading tag="أداء" title="صحة الفروع" sub={`ممتاز ≥ ${th.excellent}% — جيد ≥ ${th.good}% — يحتاج انتباه ≥ ${th.bad}% — حرج أقل من ذلك (حدود للعرض وليست سياسة معتمدة)`} />
        <div className="panel tscroll"><table>
          <thead><tr><th>الفرع</th><th>الشحنات</th><th>نسبة التحديث</th><th>التغيير (نقطة)</th><th>غير محدّثة</th><th>تحصيل غير محدّث</th><th>بدون رد</th><th>المستوى</th></tr></thead>
          <tbody>{board.map((r) => (
            <tr key={r.branch}><td>{r.branch}</td><td className="n">{fi(r.total)}</td><td className="n"><b>{fp(r.rate)}</b></td>
              <td className={'n ' + (r.d == null ? 'muted' : r.d > 0 ? 'ok' : r.d < 0 ? 'bad' : 'muted')} dir="ltr" style={{ textAlign: 'right' }}>{r.d == null ? '—' : sgn(r.d)}</td>
              <td className="n">{fi(r.not_upd)}</td><td className="n">{fi(r.cod_not)}</td><td className="n">{fi(N(r.no_reply))}</td><td><Badge lv={r.lv} /></td></tr>))}</tbody>
        </table></div>

        <Heading tag="اتجاهات" title="الاتجاهات والتوزيعات" />
        <div className="panel-grid">
          <div className="panel"><h3>اتجاه نسبة التحديث</h3><p className="panel-sub">الإجمالي وأضعف 3 فروع في {snap}</p>
            <div className="chart-wrap tall"><ChartBox type="line" theme={theme} labels={trendDates} datasets={trendSets} pct /></div></div>
          <div className="panel"><h3>نتيجة الجرد حسب الفرع</h3><p className="panel-sub">محدّث / غير محدّث / غير محدد</p>
            <div className="chart-wrap tall"><ChartBox type="bar" theme={theme} horizontal stacked labels={byNot.map((r) => r.branch)} datasets={[
              { label: 'تم التحديث', data: byNot.map((r) => N(r.upd)), backgroundColor: cv('--status-success') },
              { label: 'لم يتم التحديث', data: byNot.map((r) => N(r.not_upd)), backgroundColor: cv('--status-violation') },
              { label: 'غير محدد', data: byNot.map((r) => N(r.other)), backgroundColor: cv('--chart-4') }]} /></div></div>
          <div className="panel"><h3>التحصيل غير المحدّث حسب الفرع</h3><p className="panel-sub">جنيه مصري</p>
            <div className="chart-wrap"><ChartBox type="bar" theme={theme} legend={false} labels={byCod.map((r) => r.branch)} datasets={[{ label: 'تحصيل غير محدّث', data: byCod.map((r) => N(r.cod_not)), backgroundColor: cv('--chart-1') }]} /></div></div>
          <div className="panel"><h3>توزيع نتيجة الجرد</h3><p className="panel-sub">إجمالي {snap}</p>
            <div className="chart-wrap"><ChartBox type="doughnut" theme={theme} labels={['تم التحديث', 'لم يتم التحديث', 'غير محدد']} datasets={[{ data: [T.upd, T.not_upd, T.other], backgroundColor: [cv('--status-success'), cv('--status-violation'), cv('--chart-4')], borderWidth: 0 }]} /></div></div>
        </div>

        <Heading tag="استثناءات" title="مركز التنبيهات" sub="محسوبة آليًا من البيانات" />
        <div className="panel">{alerts.length === 0 ? <p className="ok"><i className="fa-solid fa-circle-check" /> لا توجد تنبيهات في هذه الفترة</p> :
          alerts.map((a, i) => <div className={'alert ' + a.c} key={i}><i className={'fa-solid ' + a.i} /><span>{a.t}</span></div>)}</div>

        <Heading tag="إجراءات" title="مركز الإجراءات" sub="إجراءات مقترحة من قواعد عامة وليست قرارات معتمدة. المسؤول والموعد تحددهما الإدارة." />
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="qa-btn" onClick={copyActions}><i className="fa-solid fa-copy" />{copied || 'نسخ ملخص الإجراءات'}</button></div>
          {actions.length === 0 && <p className="ok">لا توجد فروع تحت الحدود في {snap}.</p>}
          {actions.map((a, i) => (
            <div className={'act ' + a.lv} key={a.branch}>
              <div className="h"><b>{i + 1}. {a.branch}</b><Badge lv={a.lv} /></div>
              <div className="reasons">{a.reasons.map((x) => <span key={x}>{x}</span>)}</div>
              <div className="muted">المقترح: {a.acts.join('، ')}</div>
            </div>))}
        </div>

        <Heading tag="رؤى" title="رؤى للإدارة" sub="مبنية على قواعد آلية وليست ذكاءً اصطناعيًا" />
        <div className="panel-grid">
          <div className="panel"><h3>أبرز الملاحظات</h3>{insights.map((t) => <div className="insight" key={t}><i className="fa-solid fa-lightbulb" /><span>{t}</span></div>)}</div>
          <div className="panel"><h3>أفضل وأضعف أداء</h3><p className="panel-sub">فروع 50 شحنة فأكثر</p>
            <b className="warn">الأضعف</b>{worst.map((r) => <div className="perf" key={r.branch}><span>{r.branch}</span><b className="n bad">{fp(r.rate)}</b></div>)}
            <b className="ok" style={{ display: 'block', marginTop: 8 }}>الأفضل</b>{best.map((r) => <div className="perf" key={r.branch}><span>{r.branch}</span><b className="n ok">{fp(r.rate)}</b></div>)}</div>
        </div>

        {cmp.on && (<>
          <Heading tag="Compare" title="وضع المقارنة" sub="قارن يومين بنفس الفلاتر الحالية" />
          <div className="panel">
            <div className="fgrid">
              <div className="fgroup"><label htmlFor="c-a">اليوم الأول</label><select id="c-a" value={cmp.a} onChange={(e) => setCmp({ ...cmp, a: e.target.value })}>{dates.map((d) => <option key={d}>{d}</option>)}</select></div>
              <div className="fgroup"><label htmlFor="c-b">اليوم الثاني</label><select id="c-b" value={cmp.b} onChange={(e) => setCmp({ ...cmp, b: e.target.value })}>{dates.map((d) => <option key={d}>{d}</option>)}</select></div>
              <div><button className="qa-btn" onClick={() => setCmp({ ...cmp, a: cmp.b, b: cmp.a })}><i className="fa-solid fa-right-left" />تبديل</button> <button className="qa-btn" onClick={() => setCmp({ ...cmp, on: false })}>إغلاق</button></div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="cmp-row"><b>المؤشر</b><b className="fi">{cmp.a}</b><b className="fi">{cmp.b}</b></div>
              {[['إجمالي الشحنات', 'total', false], ['نسبة التحديث', 'rate', false], ['غير محدّثة', 'not_upd', true], ['تحصيل غير محدّث', 'cod_not', true], ['بدون رد', 'no_reply', true]].map(([l, k, lb]) => {
                const d = B[k] - A[k]; const good = lb ? d < 0 : d > 0;
                return <div className="cmp-row" key={k}><span>{l}</span><span className="n">{k === 'rate' ? fp(A[k]) : fi(A[k])}</span>
                  <span className="n">{k === 'rate' ? fp(B[k]) : fi(B[k])} <small className={d === 0 ? 'muted' : good ? 'ok' : 'bad'} dir="ltr">({k === 'rate' ? sgn(d) + ' نقطة' : (d > 0 ? '+' : '') + fi(d)})</small></span></div>;
              })}
            </div>
          </div>
        </>)}

        <Heading tag="سجل" title="سجل الجرد اليومي" sub="كل يوم وفرع ضمن الفلاتر" />
        <div className="panel">
          <div className="tscroll"><table>
            <thead><tr>{histCols.map(([k, h]) => <th key={k} onClick={() => setSort({ k, dir: sort.k === k ? -sort.dir : -1 })}>{h}{sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
            <tbody>{hist.slice(pg * PAGE, pg * PAGE + PAGE).map((r) => (
              <tr key={r.date + r.branch}><td className="n">{r.date}</td><td>{r.branch}</td><td className="n">{fi(r.total)}</td><td className="n">{fp(r.rate)}</td><td className="n">{fi(r.not_upd)}</td><td className="n">{fi(r.cod_not)}</td><td className="n">{fi(N(r.no_reply))}</td></tr>))}</tbody>
          </table></div>
          <div className="pager"><span>صفحة {pg + 1} من {pages} — {fi(hist.length)} صف</span>
            <span><button className="qa-btn" disabled={pg === 0} onClick={() => setPage(pg - 1)}>السابق</button> <button className="qa-btn" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>التالي</button></span></div>
        </div>
        </>)}

        <div className="foot">
          <b>التعريفات:</b> نسبة التحديث = الشحنات المحدّثة ÷ إجمالي شحنات الفرع. التحصيل غير المحدّث = مجموع مبلغ التحصيل الموجب للشحنات غير المحدّثة. «تم التحديث» = تعليق الأوديت يبدأ بـ«تم»، «لم يتم التحديث» = يحتوي «لم يتم». مستويات الصحة ومقترحات الإجراءات للعرض وتحتاج اعتماد الإدارة.
        </div>
      </div>
    </>
  );
}

function Settings({ cfg, url, onSave, onClose }) {
  const [c, setC] = useState({ ...cfg });
  const set = (k, v) => setC({ ...c, [k]: v });
  return (
    <div className="modal-bg" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="إعدادات مصدر البيانات">
      <h3>إعدادات مصدر البيانات</h3>
      <div className="fgroup"><label htmlFor="s-url">رابط Apps Script (ينتهي بـ /exec)</label><input id="s-url" dir="ltr" value={c.url} placeholder={url || 'https://script.google.com/macros/s/…/exec'} onChange={(e) => set('url', e.target.value.trim())} /></div>
      <div className="fgroup"><label htmlFor="s-ref">التحديث التلقائي</label><select id="s-ref" value={c.refreshMin} onChange={(e) => set('refreshMin', +e.target.value)}>{[[0, 'إيقاف'], [5, 'كل 5 دقائق'], [15, 'كل 15 دقيقة'], [30, 'كل 30 دقيقة'], [60, 'كل ساعة']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="fgrid">
        <div className="fgroup"><label htmlFor="s-e">ممتاز من %</label><input id="s-e" type="number" min="0" max="100" value={c.excellent} onChange={(e) => set('excellent', +e.target.value)} /></div>
        <div className="fgroup"><label htmlFor="s-g">جيد من %</label><input id="s-g" type="number" min="0" max="100" value={c.good} onChange={(e) => set('good', +e.target.value)} /></div>
        <div className="fgroup"><label htmlFor="s-b">حرج أقل من %</label><input id="s-b" type="number" min="0" max="100" value={c.bad} onChange={(e) => set('bad', +e.target.value)} /></div>
      </div>
      <p className="muted" style={{ fontSize: '.8rem' }}>الإعدادات تُحفظ في هذا المتصفح فقط. حدود المستويات للعرض وليست سياسة معتمدة.</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn sec" onClick={onClose}>إلغاء</button><button className="btn" onClick={() => onSave(c)}>حفظ والاتصال</button></div>
    </div></div>
  );
}
