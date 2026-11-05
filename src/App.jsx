import React, { useEffect, useMemo, useState } from 'react';

const URL_ = import.meta.env.VITE_DATA_URL;
const TOKEN = import.meta.env.VITE_DATA_TOKEN;
const fi = (v) => Number(v).toLocaleString('en-US');
const fp = (v) => Number(v).toFixed(1) + '%';
// حدود الألوان: افتراض للعرض وليست سياسة معتمدة
const GOOD = 80, BAD = 50;
const cls = (r) => (r >= GOOD ? 'ok' : r >= BAD ? 'warn' : 'bad');

function useData() {
  const [s, set] = useState({ status: URL_ ? 'loading' : 'nourl', rows: [] });
  useEffect(() => {
    if (!URL_) return;
    const u = TOKEN ? URL_ + (URL_.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN) : URL_;
    fetch(u)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        set({ status: 'ok', rows: j.rows || [], generated: j.generated });
      })
      .catch((e) => set({ status: 'error', rows: [], msg: String(e.message || e) }));
  }, []);
  return s;
}

function sum(rows) {
  const t = { total: 0, upd: 0, not_upd: 0, cod_not: 0 };
  rows.forEach((r) => { t.total += +r.total; t.upd += +r.upd; t.not_upd += +r.not_upd; t.cod_not += +r.cod_not; });
  t.rate = t.total ? (t.upd / t.total) * 100 : 0;
  return t;
}

function Delta({ cur, prev, unit = '', lowerBetter = false, pp = false }) {
  if (prev == null) return <span className="delta muted">لا يوجد يوم سابق</span>;
  const d = cur - prev;
  const good = lowerBetter ? d < 0 : d > 0;
  const c = d === 0 ? 'muted' : good ? 'ok' : 'bad';
  const txt = (d > 0 ? '+' : '') + (pp ? d.toFixed(1) + ' نقطة' : fi(d) + unit);
  return <span className={'delta ' + c}><span dir="ltr">{txt}</span> عن اليوم السابق</span>;
}

function Spark({ pts, n }) {
  const W = 160, H = 30;
  const x = (i) => (n > 1 ? 4 + (i / (n - 1)) * (W - 8) : W / 2);
  const y = (v) => H - 3 - (v / 100) * (H - 6);
  const d = pts.map((p, k) => (k ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join('');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={W} y1={y(GOOD)} y2={y(GOOD)} stroke="var(--grid)" />
      <line x1="0" x2={W} y1={y(BAD)} y2={y(BAD)} stroke="var(--grid)" />
      {pts.length > 1 && <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      <line x1={x(last.i)} x2={x(last.i)} y1={y(last.v)} y2={y(last.v)} stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function App() {
  const { status, rows, msg, generated } = useData();
  const dates = useMemo(() => [...new Set(rows.map((r) => r.date))].sort(), [rows]);
  const [date, setDate] = useState('');
  const [period, setPeriod] = useState('14');
  const [sort, setSort] = useState({ k: 'rate', dir: 1 });
  const cur = date || dates[dates.length - 1];

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

  const idx = dates.indexOf(cur);
  const prevDate = idx > 0 ? dates[idx - 1] : null;
  const dayRows = rows.filter((r) => r.date === cur);
  const prevRows = prevDate ? rows.filter((r) => r.date === prevDate) : null;
  const T = sum(dayRows), P = prevRows ? sum(prevRows) : null;
  const prevByBranch = new Map((prevRows || []).map((r) => [r.branch, r]));

  const table = dayRows
    .map((r) => ({ ...r, d: prevByBranch.has(r.branch) ? r.rate - prevByBranch.get(r.branch).rate : null }))
    .sort((a, b) => (a[sort.k] > b[sort.k] ? 1 : a[sort.k] < b[sort.k] ? -1 : 0) * sort.dir);
  const th = (k, label) => (
    <th onClick={() => setSort({ k, dir: sort.k === k ? -sort.dir : 1 })}>{label}{sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
  );

  const win = period === 'all' ? dates : dates.slice(-Number(period));
  const trend = [...new Set(rows.map((r) => r.branch))].map((b) => {
    const m = new Map(rows.filter((r) => r.branch === b).map((r) => [r.date, +r.rate]));
    const pts = win.map((d, i) => (m.has(d) ? { i, v: m.get(d) } : null)).filter(Boolean);
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    return { b, pts, last: last ? last.v : null, d: last && prev ? last.v - prev.v : null };
  }).filter((t) => t.pts.length).sort((a, b) => a.last - b.last);

  const noReply = dayRows.filter((r) => +r.no_reply > 0);
  const worst = [...dayRows].filter((r) => +r.total >= 50).sort((a, b) => a.rate - b.rate).slice(0, 3);

  return (
    <div className="wrap">
      <h1>لوحة جرد الفروع</h1>
      <p className="muted">
        تاريخ الجرد: {cur}{generated ? ' — آخر تحديث للبيانات: ' + generated.slice(0, 16).replace('T', ' ') + ' UTC' : ''} — نتيجة الجرد مستنتجة من عمود «تعليق الأوديت»
      </p>
      <div className="bar">
        <label>اليوم: <select value={cur} onChange={(e) => setDate(e.target.value)}>{[...dates].reverse().map((d) => <option key={d}>{d}</option>)}</select></label>
        <label>فترة الاتجاه: <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="7">آخر 7 أيام</option><option value="14">آخر 14 يوم</option><option value="30">آخر 30 يوم</option><option value="all">كل الأيام</option>
        </select></label>
      </div>

      <p>
        تم تحديث {fp(T.rate)} من {fi(T.total)} شحنة، و{fi(T.not_upd)} شحنة غير محدّثة عليها تحصيل {fi(T.cod_not)} ج.م.
        {worst.length > 0 && ' أضعف الفروع: ' + worst.map((r) => `${r.branch} (${fp(r.rate)})`).join('، ') + '.'}
        {noReply.length > 0 && ' فروع بلا رد على بعض الشحنات: ' + noReply.map((r) => `${r.branch} (${fi(r.no_reply)})`).join('، ') + '.'}
      </p>

      <div className="tiles">
        <div className="tile"><b>{fi(T.total)}</b><span className="muted">إجمالي الشحنات</span><br /><Delta cur={T.total} prev={P && P.total} /></div>
        <div className="tile"><b className={cls(T.rate)}>{fp(T.rate)}</b><span className="muted">نسبة التحديث</span><br /><Delta cur={T.rate} prev={P && P.rate} pp /></div>
        <div className="tile"><b>{fi(T.not_upd)}</b><span className="muted">شحنة غير محدّثة</span><br /><Delta cur={T.not_upd} prev={P && P.not_upd} lowerBetter /></div>
        <div className="tile"><b>{fi(T.cod_not)}</b><span className="muted">تحصيل غير محدّث (ج.م)</span><br /><Delta cur={T.cod_not} prev={P && P.cod_not} lowerBetter /></div>
      </div>

      <section className="card">
        <h2>اتجاه نسبة التحديث لكل فرع</h2>
        <p className="muted">مقياس 0–100%، الخطان الباهتان عند 50% و80% (حدود للعرض وليست سياسة معتمدة). التغيير بالنقاط عن اليوم السابق في الفترة. {win.length < 2 && 'يظهر الاتجاه عند توفر يومين على الأقل.'}</p>
        {trend.map((t) => (
          <div className="row" key={t.b}>
            <span>{t.b}</span>
            <Spark pts={t.pts} n={win.length} />
            <span className={'num ' + cls(t.last)}>{fp(t.last)}</span>
            <span className={'num ' + (t.d == null ? 'muted' : t.d > 0 ? 'ok' : t.d < 0 ? 'bad' : 'muted')}>{t.d == null ? '—' : (t.d > 0 ? '+' : '') + t.d.toFixed(1)}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>الفروع في {cur}</h2>
        <div className="scroll"><table>
          <thead><tr>{th('branch', 'الفرع')}{th('total', 'الشحنات')}{th('rate', 'نسبة التحديث')}{th('d', 'التغيير (نقطة)')}{th('not_upd', 'غير محدّثة')}{th('cod_not', 'تحصيل غير محدّث')}{th('no_reply', 'بدون رد')}</tr></thead>
          <tbody>{table.map((r) => (
            <tr key={r.branch}>
              <td>{r.branch}</td><td>{fi(r.total)}</td>
              <td className={cls(r.rate)}>{fp(r.rate)}</td>
              <td className={'num ' + (r.d == null ? 'muted' : r.d > 0 ? 'ok' : r.d < 0 ? 'bad' : 'muted')}>{r.d == null ? '—' : (r.d > 0 ? '+' : '') + r.d.toFixed(1)}</td>
              <td>{fi(r.not_upd)}</td><td>{fi(r.cod_not)}</td><td>{fi(r.no_reply)}</td>
            </tr>))}</tbody>
        </table></div>
      </section>
    </div>
  );
}
