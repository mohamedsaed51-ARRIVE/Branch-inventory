import React, { useEffect, useMemo, useState } from 'react';

const URL_ = import.meta.env.VITE_DATA_URL;
const TOKEN = import.meta.env.VITE_DATA_TOKEN;
const fi = (v) => Number(v).toLocaleString('en-US');
const fp = (v) => Number(v).toFixed(1) + '%';
const sgn = (d, f = 1) => (d > 0 ? '+' : '') + d.toFixed(f);

function load(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : Number(v); } catch { return def; } }
function save(k, v) { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } }

function useData() {
  const [s, set] = useState({ status: URL_ ? 'loading' : 'nourl', rows: [] });
  useEffect(() => {
    if (!URL_) return;
    const u = TOKEN ? URL_ + (URL_.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN) : URL_;
    fetch(u).then((r) => r.json()).then((j) => {
      if (j.error) throw new Error(j.error);
      set({ status: 'ok', rows: j.rows || [], generated: j.generated });
    }).catch((e) => set({ status: 'error', rows: [], msg: String(e.message || e) }));
  }, []);
  return s;
}

const N = (v) => (v == null || v === '' ? 0 : +v);
function sum(rows) {
  const t = { total: 0, upd: 0, not_upd: 0, cod_not: 0, no_reply: 0, returns: 0, aged: 0, no_pickup: 0 };
  rows.forEach((r) => Object.keys(t).forEach((k) => { t[k] += N(r[k]); }));
  t.rate = t.total ? (t.upd / t.total) * 100 : 0;
  return t;
}

function Delta({ cur, prev, lowerBetter, pp }) {
  if (prev == null) return <span className="delta muted">لا يوجد يوم سابق</span>;
  const d = cur - prev;
  const c = d === 0 ? 'muted' : (lowerBetter ? d < 0 : d > 0) ? 'ok' : 'bad';
  return <span className={'delta ' + c}><span dir="ltr">{pp ? sgn(d) + ' نقطة' : (d > 0 ? '+' : '') + fi(d)}</span> عن اليوم السابق</span>;
}

function Spark({ pts, n, good, bad }) {
  const W = 160, H = 30;
  const x = (i) => (n > 1 ? 4 + (i / (n - 1)) * (W - 8) : W / 2);
  const y = (v) => H - 3 - (v / 100) * (H - 6);
  const d = pts.map((p, k) => (k ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join('');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={W} y1={y(good)} y2={y(good)} stroke="var(--grid)" />
      <line x1="0" x2={W} y1={y(bad)} y2={y(bad)} stroke="var(--grid)" />
      {pts.length > 1 && <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      <line x1={x(last.i)} x2={x(last.i)} y1={y(last.v)} y2={y(last.v)} stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function App() {
  const { status, rows, msg, generated } = useData();
  const [date, setDate] = useState('');
  const [period, setPeriod] = useState('14');
  const [prio, setPrio] = useState('cod_not');
  const [sort, setSort] = useState({ k: 'rate', dir: 1 });
  const [good, setGood] = useState(() => load('inv.good', 80));
  const [bad, setBad] = useState(() => load('inv.bad', 50));
  const [copied, setCopied] = useState('');
  const dates = useMemo(() => [...new Set(rows.map((r) => r.date))].sort(), [rows]);
  const cls = (r) => (r >= good ? 'ok' : r >= bad ? 'warn' : 'bad');

  if (status === 'nourl') {
    return (
      <div className="wrap empty">
        <h1>لوحة جرد الفروع</h1>
        <p>لم يتم ضبط مصدر البيانات بعد. أضف متغير البيئة التالي في Vercel (Settings ← Environment Variables) ثم أعد النشر:</p>
        <pre>VITE_DATA_URL=https://script.google.com/macros/s/XXXX/exec</pre>
        <p className="muted">طريقة إنشاء الرابط في apps-script/WebApp.gs وفي README.</p>
      </div>
    );
  }
  if (status === 'loading') return <div className="wrap empty muted">جارٍ تحميل البيانات…</div>;
  if (status === 'error') return <div className="wrap empty"><h1>لوحة جرد الفروع</h1><p className="bad">تعذر تحميل البيانات: {msg}</p></div>;
  if (!rows.length) return <div className="wrap empty"><h1>لوحة جرد الفروع</h1><p>لا توجد صفوف في ورقة تجميع_الجرد بعد. شغّل التجميع في الشيت.</p></div>;

  const cur = date || dates[dates.length - 1];
  const idx = dates.indexOf(cur);
  const prevDate = idx > 0 ? dates[idx - 1] : null;
  const byDate = (d) => rows.filter((r) => r.date === d);
  const dayRows = byDate(cur);
  const prevRows = prevDate ? byDate(prevDate) : null;
  const T = sum(dayRows), P = prevRows ? sum(prevRows) : null;
  const prevBy = new Map((prevRows || []).map((r) => [r.branch, r]));
  const hasAge = rows.some((r) => r.aged != null && r.aged !== '');
  const hasRet = rows.some((r) => r.returns != null && r.returns !== '');

  // استمرارية: عدد الأيام المتتالية (المنتهية في اليوم المختار) التي كانت فيها نسبة الفرع تحت الحد
  const cell = new Map(rows.map((r) => [r.date + '|' + r.branch, r]));
  const streak = (b) => {
    let n = 0;
    for (let i = idx; i >= 0; i--) { const r = cell.get(dates[i] + '|' + b); if (!r || +r.rate >= bad) break; n++; }
    return n;
  };

  // قائمة الإجراءات
  const queue = dayRows.map((r) => {
    const st = streak(r.branch);
    const reasons = [];
    if (+r.rate < bad) reasons.push({ t: `نسبة التحديث ${fp(r.rate)} (أقل من ${bad}%)`, c: 'bad' });
    else if (+r.rate < good) reasons.push({ t: `نسبة التحديث ${fp(r.rate)}`, c: 'warn' });
    if (N(r.not_upd)) reasons.push({ t: `${fi(r.not_upd)} شحنة غير محدّثة`, c: '' });
    if (N(r.cod_not)) reasons.push({ t: `تحصيل ${fi(r.cod_not)} ج.م غير محدّث`, c: '' });
    if (N(r.no_reply)) reasons.push({ t: `${fi(r.no_reply)} شحنة بدون رد فرع`, c: 'bad' });
    if (N(r.aged)) reasons.push({ t: `${fi(r.aged)} شحنة متأخرة`, c: 'warn' });
    if (st >= 2) reasons.push({ t: `تحت ${bad}% منذ ${st} أيام متتالية`, c: 'bad' });
    const level = +r.rate < bad || N(r.no_reply) ? 'bad' : +r.rate < good ? 'warn' : 'ok';
    const acts = [];
    if (+r.rate < bad) acts.push('طلب خطة تصحيح وموعد تقفيل من الفرع');
    else if (+r.rate < good) acts.push('متابعة الشحنات غير المحدّثة مع الفرع');
    if (N(r.no_reply)) acts.push('طلب رد الفرع على الجرد');
    if (N(r.aged)) acts.push('مراجعة الشحنات المتأخرة');
    return { ...r, st, reasons, level, acts };
  }).filter((q) => q.level !== 'ok' || q.st >= 2)
    .sort((a, b) => (prio === 'rate' ? +a.rate - +b.rate : N(b[prio]) - N(a[prio])));

  const copyQueue = async () => {
    const txt = `ملخص جرد ${cur}\n` + queue.map((q) => `- ${q.branch}: ${q.reasons.map((x) => x.t).join('، ')} | المقترح: ${q.acts.join('، ') || '—'} | المسؤول: [  ] | الموعد: [  ]`).join('\n');
    try { await navigator.clipboard.writeText(txt); setCopied('تم النسخ'); } catch { setCopied('تعذر النسخ تلقائيًا'); }
    setTimeout(() => setCopied(''), 2500);
  };

  // اتجاه
  const win = period === 'all' ? dates : dates.slice(-Number(period));
  const trend = [...new Set(rows.map((r) => r.branch))].map((b) => {
    const pts = win.map((d, i) => { const r = cell.get(d + '|' + b); return r ? { i, v: +r.rate } : null; }).filter(Boolean);
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    return { b, pts, last: last ? last.v : null, d: last && prev ? last.v - prev.v : null };
  }).filter((t) => t.pts.length).sort((a, b) => a.last - b.last);

  // اكتمال البيانات
  const recent = dates.slice(Math.max(0, idx - 14), idx);
  const expected = new Set(rows.filter((r) => recent.includes(r.date)).map((r) => r.branch));
  const present = new Set(dayRows.map((r) => r.branch));
  const missing = [...expected].filter((b) => !present.has(b));
  const unauditedDays = dates.filter((d) => byDate(d).every((r) => N(r.other) === N(r.total)));
  const gaps = [];
  for (let i = 1; i < dates.length; i++) {
    const diff = Math.round((new Date(dates[i]) - new Date(dates[i - 1])) / 864e5);
    if (diff > 1) gaps.push(`${dates[i - 1]} → ${dates[i]} (${diff - 1} يوم ناقص)`);
  }
  const noPk = N(T.no_pickup);

  const table = dayRows.map((r) => ({ ...r, d: prevBy.has(r.branch) ? +r.rate - +prevBy.get(r.branch).rate : null }))
    .sort((a, b) => (N(a[sort.k]) > N(b[sort.k]) || (sort.k === 'branch' && a.branch > b.branch) ? 1 : -1) * sort.dir);
  const th = (k, label) => <th onClick={() => setSort({ k, dir: sort.k === k ? -sort.dir : 1 })}>{label}{sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>;

  const worst = [...dayRows].filter((r) => N(r.total) >= 50).sort((a, b) => a.rate - b.rate).slice(0, 3);

  return (
    <div className="wrap">
      <header>
        <h1>لوحة جرد الفروع</h1>
        <p className="muted">تاريخ الجرد: {cur}{generated ? ' — آخر تحديث للبيانات: ' + generated.slice(0, 16).replace('T', ' ') + ' UTC' : ''} — نتيجة الجرد مستنتجة من عمود «تعليق الأوديت»</p>
      </header>
      <div className="bar">
        <label>اليوم: <select value={cur} onChange={(e) => setDate(e.target.value)}>{[...dates].reverse().map((d) => <option key={d}>{d}</option>)}</select></label>
        <label>فترة الاتجاه: <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="7">آخر 7 أيام</option><option value="14">آخر 14 يوم</option><option value="30">آخر 30 يوم</option><option value="all">كل الأيام</option>
        </select></label>
      </div>

      <p className="lead">
        تم تحديث {fp(T.rate)} من {fi(T.total)} شحنة، و{fi(T.not_upd)} شحنة غير محدّثة عليها تحصيل {fi(T.cod_not)} ج.م.
        {worst.length > 0 && ' أضعف الفروع: ' + worst.map((r) => `${r.branch} (${fp(r.rate)})`).join('، ') + '.'}
      </p>

      <div className="tiles">
        <div className="tile"><b>{fi(T.total)}</b><span className="muted">إجمالي الشحنات</span><Delta cur={T.total} prev={P && P.total} /></div>
        <div className="tile"><b className={cls(T.rate)}>{fp(T.rate)}</b><span className="muted">نسبة التحديث</span><Delta cur={T.rate} prev={P && P.rate} pp /></div>
        <div className="tile"><b>{fi(T.not_upd)}</b><span className="muted">شحنة غير محدّثة</span><Delta cur={T.not_upd} prev={P && P.not_upd} lowerBetter /></div>
        <div className="tile"><b>{fi(T.cod_not)}</b><span className="muted">تحصيل غير محدّث (ج.م)</span><Delta cur={T.cod_not} prev={P && P.cod_not} lowerBetter /></div>
        {hasAge && <div className="tile"><b>{fi(T.aged)}</b><span className="muted">شحنة متأخرة (عمر الأوردر)</span><Delta cur={T.aged} prev={P && P.aged} lowerBetter /></div>}
        {hasRet && <div className="tile"><b>{fi(T.returns)}</b><span className="muted">شحنة في المرتجعات</span><Delta cur={T.returns} prev={P && P.returns} lowerBetter /></div>}
      </div>

      <section className="card">
        <div className="cardhead">
          <div>
            <h2>قائمة الإجراءات</h2>
            <p className="muted">الفروع التي تحتاج تدخلًا في {cur}. الإجراءات مقترحة وليست قرارات معتمدة، والمسؤول والموعد يحددهما الإدارة.</p>
          </div>
          <div className="bar">
            <label>الترتيب: <select value={prio} onChange={(e) => setPrio(e.target.value)}>
              <option value="cod_not">أعلى تحصيل غير محدّث</option><option value="not_upd">أكثر شحنات غير محدّثة</option><option value="rate">أقل نسبة تحديث</option>
              {hasAge && <option value="aged">أكثر شحنات متأخرة</option>}
            </select></label>
            <button onClick={copyQueue}>{copied || 'نسخ ملخص الإجراءات'}</button>
          </div>
        </div>
        {queue.length === 0 && <p className="ok">لا توجد فروع تحت الحدود في هذا اليوم.</p>}
        {queue.map((q, i) => (
          <div className={'item ' + q.level} key={q.branch}>
            <div className="ihead"><span className="rank">{i + 1}</span><strong>{q.branch}</strong>
              <span className={'pill ' + q.level}>{q.level === 'bad' ? 'حرج' : 'متابعة'}</span></div>
            <div className="chips">{q.reasons.map((x) => <span key={x.t} className={'chip ' + x.c}>{x.t}</span>)}</div>
            {q.acts.length > 0 && <p className="muted">المقترح: {q.acts.join('، ')}</p>}
          </div>
        ))}
      </section>

      <section className="card">
        <h2>اتجاه نسبة التحديث لكل فرع</h2>
        <p className="muted">مقياس 0–100%، الخطان الباهتان عند {bad}% و{good}%. التغيير بالنقاط عن اليوم السابق في الفترة. {win.length < 2 && 'يظهر الاتجاه عند توفر يومين على الأقل.'}</p>
        {trend.map((t) => (
          <div className="row" key={t.b}>
            <span>{t.b}</span>
            <Spark pts={t.pts} n={win.length} good={good} bad={bad} />
            <span className={'num ' + cls(t.last)}>{fp(t.last)}</span>
            <span className={'num ' + (t.d == null ? 'muted' : t.d > 0 ? 'ok' : t.d < 0 ? 'bad' : 'muted')}>{t.d == null ? '—' : sgn(t.d)}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>اكتمال البيانات</h2>
        <p className="muted">قبل قراءة أي تحسن، تأكد أن الأرقام مكتملة.</p>
        <ul className="checks">
          <li className={missing.length ? 'bad' : 'ok'}>{missing.length ? 'فروع ظهرت في الأيام السابقة وغائبة اليوم: ' + missing.join('، ') : 'كل الفروع المعتادة موجودة في هذا اليوم'}</li>
          <li className={gaps.length ? 'warn' : 'ok'}>{gaps.length ? 'أيام ناقصة بين الأوراق: ' + gaps.join('، ') : 'لا توجد أيام ناقصة بين أول وآخر ورقة'}</li>
          <li className={unauditedDays.length ? 'bad' : 'ok'}>{unauditedDays.length ? 'أيام بلا نتيجة جرد: ' + unauditedDays.join('، ') : 'كل الأيام فيها نتيجة جرد'}</li>
          {hasAge && <li className={noPk ? 'warn' : 'ok'}>{noPk ? fi(noPk) + ' شحنة بلا تاريخ استلام (غير محسوبة في التأخر)' : 'كل الشحنات لها تاريخ استلام'}</li>}
        </ul>
      </section>

      <section className="card">
        <h2>الفروع في {cur}</h2>
        <div className="scroll"><table>
          <thead><tr>{th('branch', 'الفرع')}{th('total', 'الشحنات')}{th('rate', 'نسبة التحديث')}{th('d', 'التغيير (نقطة)')}{th('not_upd', 'غير محدّثة')}{th('cod_not', 'تحصيل غير محدّث')}{th('no_reply', 'بدون رد')}{hasAge && th('aged', 'متأخرة')}{hasRet && th('returns', 'مرتجعات')}</tr></thead>
          <tbody>{table.map((r) => (
            <tr key={r.branch}>
              <td>{r.branch}</td><td>{fi(r.total)}</td>
              <td className={cls(r.rate)}>{fp(r.rate)}</td>
              <td className={'num ' + (r.d == null ? 'muted' : r.d > 0 ? 'ok' : r.d < 0 ? 'bad' : 'muted')}>{r.d == null ? '—' : sgn(r.d)}</td>
              <td>{fi(r.not_upd)}</td><td>{fi(r.cod_not)}</td><td>{fi(N(r.no_reply))}</td>
              {hasAge && <td>{fi(N(r.aged))}</td>}{hasRet && <td>{fi(N(r.returns))}</td>}
            </tr>))}</tbody>
        </table></div>
      </section>

      <footer className="card muted">
        <b>حدود الألوان (للعرض فقط، ليست سياسة معتمدة):</b>{' '}
        أخضر من <input type="number" min="0" max="100" value={good} onChange={(e) => { const v = Math.max(0, Math.min(100, +e.target.value)); setGood(v); save('inv.good', v); }} />%،
        وأحمر أقل من <input type="number" min="0" max="100" value={bad} onChange={(e) => { const v = Math.max(0, Math.min(100, +e.target.value)); setBad(v); save('inv.bad', v); }} />%.
        {' '}«متأخرة» = عمر الأوردر من تاريخ استلام البيك أب حتى تاريخ ورقة الجرد بحد قابل للتغيير في السكريبت (CFG.AGED_DAYS) ويحتاج اعتماد SOP.
      </footer>
    </div>
  );
}
