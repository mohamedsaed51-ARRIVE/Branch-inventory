import React, { useMemo, useState } from 'react';
import ChartBox from './ChartBox.jsx';
import { N, fi, fp, sgn, sumD, lateOf, groupBy, GROUPS, isReturnGroup, LEVELS, levelOf, toCsv, download, sumMonthly } from './lib.js';

const REPORTS = [
  ['exec', 'fa-file-lines', 'التقرير التنفيذي اليومي', 'ملخص للإدارة: المؤشرات ومقارنة اليوم السابق والفروع والملاحظات'],
  ['branch', 'fa-building', 'تقرير الفرع', 'بطاقة فرع واحد: الاتجاه وحالات الشحنات وردوده'],
  ['aging', 'fa-hourglass-half', 'تقرير عمر الحالة', 'الشحنات التي لم تتحدث حالتها منذ أيام، حسب الفرع والحالة'],
  ['returns', 'fa-rotate-left', 'تقرير المرتجعات عند الفروع', 'المرتجعات المحتجزة بالفروع وحالتها وعمرها'],
  ['replies', 'fa-comments', 'تقرير ردود الفروع وجودة الجرد', 'من لم يرد، تصنيف الردود، التعارض، بيانات ناقصة'],
  ['period', 'fa-table-cells', 'تقرير الفترة (خريطة حرارية)', 'نسبة التحديث لكل فرع في كل يوم من الفترة المختارة'],
  ['monthly', 'fa-calendar-days', 'التقرير الشهري', 'شحنات فريدة بالشهر ومقارنة بالشهر السابق']
];

const Cell = ({ lv, children }) => <td className={'n hm ' + LEVELS[lv].cls}>{children}</td>;
const Level = ({ lv }) => <span className={'chip ' + LEVELS[lv].cls}><i className={'fa-solid ' + LEVELS[lv].icon} />{LEVELS[lv].label}</span>;
const pct = (a, b) => (b ? (a / b) * 100 : 0);

function Frame({ id, title, period, scope, note, onCsv, children }) {
  return (
    <article className="report" id={'rep-' + id}>
      <header className="rep-head">
        <div>
          <h2>{title}</h2>
          <p className="rep-meta">{period}{scope ? ' — ' + scope : ''}</p>
        </div>
        <div className="qa noprint">
          {onCsv && <button className="qa-btn" onClick={onCsv}><i className="fa-solid fa-file-csv" />تصدير CSV</button>}
          <button className="qa-btn" onClick={() => window.print()}><i className="fa-solid fa-print" />طباعة / PDF</button>
        </div>
      </header>
      {children}
      <footer className="rep-foot">{note}</footer>
    </article>
  );
}

// ملاحظات آلية من قواعد عامة (ليست قرارات معتمدة) + أعمدة المسؤول والموعد للتعبئة
function Findings({ items }) {
  if (!items.length) return <p className="ok"><i className="fa-solid fa-circle-check" /> لا ملاحظات تتجاوز الحدود الحالية.</p>;
  return (
    <div className="tscroll"><table>
      <thead><tr><th>م</th><th>الملاحظة</th><th>الدليل</th><th>الإجراء المقترح</th><th>المسؤول</th><th>الموعد</th></tr></thead>
      <tbody>{items.map((f, i) => (
        <tr key={i}><td className="n">{i + 1}</td><td className="wrap">{f.t}</td><td className="wrap">{f.e}</td><td className="wrap">{f.a}</td><td className="blank">&nbsp;</td><td className="blank">&nbsp;</td></tr>))}
      </tbody>
    </table></div>
  );
}

export default function Reports({ rep, detail, monthly, dates, dFrom, dTo, branchOk, sel, th, ageMin, setAgeMin, theme, cv, snap, prevDate, allBranches }) {
  const [rb, setRb] = useState('');
  const inRange = useMemo(() => detail.filter((r) => r.date >= dFrom && r.date <= dTo && branchOk(r)), [detail, dFrom, dTo, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const snapRows = inRange.filter((r) => r.date === snap);
  const prevRows = prevDate ? detail.filter((r) => r.date === prevDate && branchOk(r)) : null;
  const T = sumD(snapRows, ageMin), P = prevRows ? sumD(prevRows, ageMin) : null;
  const byBranch = useMemo(() => [...groupBy(snapRows, (r) => r.branch)].map(([b, l]) => ({ branch: b, ...sumD(l, ageMin), rows: l })), [snapRows, ageMin]);
  const prevBy = useMemo(() => new Map([...groupBy(prevRows || [], (r) => r.branch)].map(([b, l]) => [b, sumD(l, ageMin)])), [prevRows, ageMin]);
  const lv = (r) => levelOf(r.rate, th);
  const ageLabel = AGE_LABEL[ageMin];
  const period = `${dFrom} ← ${dTo} (يوم الجرد المعروض: ${snap})`;
  const scope = sel.length ? 'الفروع: ' + sel.join('، ') : 'كل الفروع';
  const basis = 'المصدر: ورقة تجميع_تفصيلي. نتيجة الجرد مستنتجة من نص «تعليق الأوديت». عمر الحالة = تاريخ ورقة الجرد − تاريخ آخر حالة، والحد (' + ageLabel + ') قابل للضبط وليس حدًا معتمدًا من SOP. مجموعات الحالة وتصنيف ردود الفروع تجميع للعرض.';

  if (!detail.length) {
    return <div className="panel"><p><i className="fa-solid fa-triangle-exclamation warn" /> التقارير تحتاج ورقة <b>تجميع_تفصيلي</b> من السكريبت المحدّث (apps-script/ArriveAuditSummary.gs و WebApp.gs): انسخ الملفين، انشر نسخة جديدة، ثم شغّل «إعادة بناء كاملة». لم أعرض أرقامًا تقديرية.</p></div>;
  }
  if (!snapRows.length) return <div className="panel"><p>لا توجد بيانات تفصيلية ليوم {snap} بالفلاتر الحالية.</p></div>;

  const csvOf = (name, rows, cols) => () => download(name + '.csv', toCsv(rows, cols));
  const dRow = (label, a, b, lowerBetter, f = fi, pp = false) => {
    const d = b == null ? null : a - b;
    const good = d == null || d === 0 ? null : lowerBetter ? d < 0 : d > 0;
    return (<tr key={label}><td>{label}</td><td className="n"><b>{f(a)}</b></td><td className="n">{b == null ? '—' : f(b)}</td>
      <td className={'n ' + (good == null ? 'muted' : good ? 'ok' : 'bad')} dir="ltr" style={{ textAlign: 'right' }}>{d == null ? '—' : pp ? sgn(d) + ' نقطة' : (d > 0 ? '+' : '') + fi(d)}</td></tr>);
  };

  let body = null;

  /* ---------------- التنفيذي ---------------- */
  if (rep === 'exec') {
    const worst = [...byBranch].filter((r) => r.total >= 30).sort((a, b) => a.rate - b.rate);
    const finds = [];
    worst.filter((r) => lv(r) === 'critical').forEach((r) => finds.push({ t: `نسبة تحديث منخفضة في فرع ${r.branch}`, e: `${fp(r.rate)} (${fi(r.upd)} من ${fi(r.total)}) وهي أقل من ${th.bad}%`, a: 'طلب خطة تصحيح وموعد تقفيل من الفرع' }));
    [...byBranch].filter((r) => r.late >= 20 && pct(r.late, r.total) >= 15).sort((a, b) => b.late - a.late).forEach((r) => finds.push({ t: `شحنات متأخرة التحديث في ${r.branch}`, e: `${fi(r.late)} شحنة (${fp(r.p_late)}) عمر حالتها ${ageLabel}`, a: 'مراجعة الشحنات المتأخرة مع الفرع وتحديث حالتها أو توثيق سبب التأخير' }));
    [...byBranch].filter((r) => r.r_none > 0).forEach((r) => finds.push({ t: `لا يوجد رد من فرع ${r.branch}`, e: `${fi(r.r_none)} شحنة (${fp(pct(r.r_none, r.total))}) عمود رد الفرع فيها فارغ`, a: 'طلب رد الفرع على كل الشحنات' }));
    if (T.conflict) finds.push({ t: 'تعارض بين رد الفرع ونتيجة الأوديت', e: `${fi(T.conflict)} شحنة ردّ الفرع فيها «تم التحديث» والأوديت «لم يتم التحديث»`, a: 'مراجعة الشحنات المتعارضة وتحديد الصحيح منهما' });
    if (T.neg_cod) finds.push({ t: 'مبالغ تحصيل سالبة', e: `${fi(T.neg_cod)} شحنة بمبلغ تحصيل سالب`, a: 'مراجعة سبب التسوية وتوثيقه' });
    if (T.returns_main > 0 && pct(T.returns_main, T.total) >= 20) finds.push({ t: 'حجم مرتجعات كبير عند الفروع في طريقها للرئيسي', e: `${fi(T.returns_main)} شحنة (${fp(pct(T.returns_main, T.total))} من الجرد) حالتها «مرتجعات إلى الرئيسي»`, a: 'التأكد من توريدها للرئيسي وتقفيلها' });
    body = (<>
      <h3>المؤشرات الرئيسية</h3>
      <div className="tscroll"><table>
        <thead><tr><th>المؤشر</th><th>{snap}</th><th>{prevDate || 'اليوم السابق'}</th><th>الفرق</th></tr></thead>
        <tbody>
          {dRow('شحنات الجرد', T.total, P && P.total, false)}
          {dRow('نسبة التحديث (حسب الأوديت)', T.rate, P && P.rate, false, fp, true)}
          {dRow(`شحنات متأخرة (${ageLabel})`, T.late, P && P.late, true)}
          {dRow('مرتجعات عند الفروع', T.returns, P && P.returns, true)}
          {dRow('بدون رد الفرع', T.r_none, P && P.r_none, true)}
          {dRow('تعارض (رد الفرع تم والأوديت لم يتم)', T.conflict, P && P.conflict, true)}
        </tbody>
      </table></div>
      <h3>أداء الفروع — {snap}</h3>
      <div className="tscroll"><table>
        <thead><tr><th>الفرع</th><th>الشحنات</th><th>نسبة التحديث</th><th>التغيير (نقطة)</th><th>متأخرة</th><th>مرتجعات</th><th>بدون رد الفرع</th><th>المستوى</th></tr></thead>
        <tbody>{[...byBranch].sort((a, b) => a.rate - b.rate).map((r) => { const p = prevBy.get(r.branch); const d = p ? r.rate - p.rate : null; return (
          <tr key={r.branch}><td>{r.branch}</td><td className="n">{fi(r.total)}</td><td className="n"><b>{fp(r.rate)}</b></td>
            <td className={'n ' + (d == null ? 'muted' : d > 0 ? 'ok' : d < 0 ? 'bad' : 'muted')} dir="ltr" style={{ textAlign: 'right' }}>{d == null ? '—' : sgn(d)}</td>
            <td className="n">{fi(r.late)} <small className="muted">({fp(r.p_late)})</small></td><td className="n">{fi(r.returns)}</td><td className="n">{fi(r.r_none)}</td><td><Level lv={lv(r)} /></td></tr>); })}</tbody>
      </table></div>
      <h3>الملاحظات والإجراءات المقترحة</h3>
      <p className="section-sub">ملاحظات آلية من قواعد عامة، والمسؤول والموعد تحددهما الإدارة.</p>
      <Findings items={finds} />
    </>);
    return <Frame id="exec" title="التقرير التنفيذي اليومي لجرد الفروع" period={period} scope={scope} note={basis}
      onCsv={csvOf('exec-branches-' + snap, byBranch.map((r) => ({ ...r, level: LEVELS[lv(r)].label })), [{ h: 'الفرع', k: 'branch' }, { h: 'الشحنات', k: 'total' }, { h: 'نسبة التحديث %', k: 'rate' }, { h: 'متأخرة', k: 'late' }, { h: 'مرتجعات', k: 'returns' }, { h: 'بدون رد الفرع', k: 'r_none' }, { h: 'المستوى', k: 'level' }])}>{body}</Frame>;
  }

  /* ---------------- الفرع ---------------- */
  if (rep === 'branch') {
    const names = [...new Set(snapRows.map((r) => r.branch))].sort();
    const b = names.includes(rb) ? rb : (byBranch.sort((x, y) => x.rate - y.rate)[0] || {}).branch;
    const days = [...new Set(inRange.filter((r) => r.branch === b).map((r) => r.date))].sort();
    const dayT = days.map((d) => ({ date: d, ...sumD(inRange.filter((r) => r.branch === b && r.date === d), ageMin) }));
    const gRows = [...groupBy(snapRows.filter((r) => r.branch === b), (r) => r.grp)].map(([g, l]) => ({ grp: g, ...sumD(l, ageMin) })).sort((x, y) => y.total - x.total);
    const Tb = sumD(snapRows.filter((r) => r.branch === b), ageMin);
    body = (<>
      <div className="fgrid noprint" style={{ maxWidth: 320 }}><div className="fgroup"><label htmlFor="rb">الفرع</label><select id="rb" value={b} onChange={(e) => setRb(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select></div></div>
      <div className="kpi-row" style={{ marginTop: 10 }}>
        <div className="kpi"><span className="l">شحنات الجرد</span><span className="v">{fi(Tb.total)}</span></div>
        <div className={'kpi ' + (Tb.rate >= th.good ? 'accent-ok' : Tb.rate >= th.bad ? 'accent-warn' : 'accent-bad')}><span className="l">نسبة التحديث</span><span className="v">{fp(Tb.rate)}</span></div>
        <div className="kpi accent-warn"><span className="l">متأخرة ({ageLabel})</span><span className="v">{fi(Tb.late)}</span><span className="d muted">{fp(Tb.p_late)} من شحنات الفرع</span></div>
        <div className="kpi accent-teal"><span className="l">مرتجعات عند الفرع</span><span className="v">{fi(Tb.returns)}</span><span className="d muted">{fp(Tb.p_ret)} من شحنات الفرع</span></div>
        <div className="kpi accent-bad"><span className="l">بدون رد الفرع</span><span className="v">{fi(Tb.r_none)}</span><span className="d muted">{fp(Tb.p_none)}</span></div>
      </div>
      <h3>الاتجاه اليومي</h3>
      <div className="chart-wrap"><ChartBox type="line" theme={theme} labels={dayT.map((d) => d.date)} pct datasets={[{ label: 'نسبة التحديث', data: dayT.map((d) => +d.rate.toFixed(1)), borderColor: cv('--chart-1'), backgroundColor: cv('--chart-1'), tension: .25, borderWidth: 3, pointRadius: 3 }]} /></div>
      <div className="tscroll"><table>
        <thead><tr><th>التاريخ</th><th>الشحنات</th><th>نسبة التحديث</th><th>متأخرة</th><th>مرتجعات</th><th>بدون رد الفرع</th></tr></thead>
        <tbody>{[...dayT].reverse().map((d) => <tr key={d.date}><td className="n">{d.date}</td><td className="n">{fi(d.total)}</td><td className="n"><b>{fp(d.rate)}</b></td><td className="n">{fi(d.late)}</td><td className="n">{fi(d.returns)}</td><td className="n">{fi(d.r_none)}</td></tr>)}</tbody>
      </table></div>
      <h3>حالات الشحنات في {snap}</h3>
      <div className="tscroll"><table>
        <thead><tr><th>مجموعة الحالة</th><th>الشحنات</th><th>% من الفرع</th><th>نسبة التحديث</th><th>متأخرة</th><th>بدون رد الفرع</th></tr></thead>
        <tbody>{gRows.map((g) => <tr key={g.grp}><td>{g.grp}</td><td className="n">{fi(g.total)}</td><td className="n">{fp(pct(g.total, Tb.total))}</td><td className="n">{fp(g.rate)}</td><td className="n">{fi(g.late)}</td><td className="n">{fi(g.r_none)}</td></tr>)}</tbody>
      </table></div>
    </>);
    return <Frame id="branch" title={'تقرير فرع ' + b} period={period} scope="" note={basis}
      onCsv={csvOf('branch-' + b, dayT, [{ h: 'التاريخ', k: 'date' }, { h: 'الشحنات', k: 'total' }, { h: 'نسبة التحديث %', k: 'rate' }, { h: 'متأخرة', k: 'late' }, { h: 'مرتجعات', k: 'returns' }, { h: 'بدون رد الفرع', k: 'r_none' }])}>{body}</Frame>;
  }

  /* ---------------- عمر الحالة ---------------- */
  if (rep === 'aging') {
    const ab = [...byBranch].sort((a, b) => b.late - a.late);
    const ag = [...groupBy(snapRows, (r) => r.grp)].map(([g, l]) => ({ grp: g, ...sumD(l, ageMin) })).sort((a, b) => b.late - a.late);
    body = (<>
      <div className="fgrid noprint" style={{ maxWidth: 320 }}><div className="fgroup"><label htmlFor="ag">حد «متأخرة» (عمر الحالة)</label>
        <select id="ag" value={ageMin} onChange={(e) => setAgeMin(+e.target.value)}>{[[2, 'يومان فأكثر'], [3, '3 أيام فأكثر'], [5, '5 أيام فأكثر']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
      <p className="section-sub" style={{ marginTop: 8 }}>عمر الحالة = تاريخ ورقة الجرد ({snap}) − تاريخ آخر حالة للشحنة. الحد يُضبط من القائمة لأن حد الـSOP لكل حالة لم يُعتمد بعد. الإجمالي: <b>{fi(T.late)}</b> شحنة متأخرة من {fi(T.total)} ({fp(T.p_late)}).</p>
      <div className="panel-grid">
        <div className="panel"><h3>الشحنات المتأخرة حسب الفرع</h3><div className="chart-wrap tall"><ChartBox type="bar" theme={theme} horizontal stacked labels={ab.map((r) => r.branch)} datasets={[
          { label: 'يومان', data: ab.map((r) => N(r.a2)), backgroundColor: cv('--chart-2') },
          { label: '3–4 أيام', data: ab.map((r) => N(r.a3)), backgroundColor: cv('--status-action') },
          { label: '5 أيام فأكثر', data: ab.map((r) => N(r.a5)), backgroundColor: cv('--status-violation') }]} /></div></div>
        <div className="panel"><h3>حسب مجموعة الحالة</h3><div className="tscroll"><table>
          <thead><tr><th>الحالة</th><th>الشحنات</th><th>متأخرة</th><th>%</th></tr></thead>
          <tbody>{ag.map((g) => <tr key={g.grp}><td>{g.grp}</td><td className="n">{fi(g.total)}</td><td className="n"><b>{fi(g.late)}</b></td><td className="n">{fp(g.p_late)}</td></tr>)}</tbody></table></div></div>
      </div>
      <h3>تفصيل الفروع</h3>
      <div className="tscroll"><table>
        <thead><tr><th>الفرع</th><th>الشحنات</th><th>0–1 يوم</th><th>يومان</th><th>3–4 أيام</th><th>5+ أيام</th><th>متأخرة ({ageLabel})</th><th>% متأخرة</th></tr></thead>
        <tbody>{ab.map((r) => <tr key={r.branch}><td>{r.branch}</td><td className="n">{fi(r.total)}</td><td className="n">{fi(r.a0)}</td><td className="n">{fi(r.a2)}</td><td className="n">{fi(r.a3)}</td><td className="n">{fi(r.a5)}</td><td className="n"><b>{fi(r.late)}</b></td><td className={'n ' + (r.p_late >= 30 ? 'bad' : r.p_late >= 15 ? 'warn' : '')}>{fp(r.p_late)}</td></tr>)}</tbody>
      </table></div>
      {T.nd > 0 && <p className="section-sub">{fi(T.nd)} شحنة بلا تاريخ آخر حالة صالح، ولم يُحسب عمرها.</p>}
    </>);
    return <Frame id="aging" title="تقرير عمر الحالة" period={period} scope={scope} note={basis}
      onCsv={csvOf('aging-' + snap, ab, [{ h: 'الفرع', k: 'branch' }, { h: 'الشحنات', k: 'total' }, { h: '0-1 يوم', k: 'a0' }, { h: 'يومان', k: 'a2' }, { h: '3-4 أيام', k: 'a3' }, { h: '5+ أيام', k: 'a5' }, { h: 'متأخرة', k: 'late' }, { h: '% متأخرة', k: 'p_late' }])}>{body}</Frame>;
  }

  /* ---------------- المرتجعات ---------------- */
  if (rep === 'returns') {
    const rb2 = [...groupBy(snapRows, (r) => r.branch)].map(([b, l]) => {
      const rl = l.filter((r) => isReturnGroup(r.grp));
      const by = (g) => sumD(rl.filter((r) => r.grp === g), ageMin).total;
      const R = sumD(rl, ageMin), A = sumD(l, ageMin);
      return { branch: b, all: A.total, main: by('مرتجعات إلى الرئيسي'), toBr: by('مرتجعات إلى الفروع'), other: by('مرتجعات أخرى'), toMer: sumD(l.filter((r) => r.grp === 'في الطريق للتاجر'), ageMin).total, ret: R.total, p: pct(R.total, A.total), notUpd: R.not_upd, late: R.late, cod: R.cod };
    }).sort((a, b) => b.ret - a.ret);
    const tot = rb2.reduce((a, r) => ({ ret: a.ret + r.ret, main: a.main + r.main, toBr: a.toBr + r.toBr, late: a.late + r.late, notUpd: a.notUpd + r.notUpd, cod: a.cod + r.cod }), { ret: 0, main: 0, toBr: 0, late: 0, notUpd: 0, cod: 0 });
    body = (<>
      <div className="kpi-row">
        <div className="kpi"><span className="l">مرتجعات عند الفروع</span><span className="v">{fi(tot.ret)}</span><span className="d muted">{fp(T.p_ret)} من شحنات الجرد</span></div>
        <div className="kpi accent-warn"><span className="l">إلى الرئيسي</span><span className="v">{fi(tot.main)}</span></div>
        <div className="kpi accent-teal"><span className="l">إلى الفروع</span><span className="v">{fi(tot.toBr)}</span></div>
        <div className="kpi accent-bad"><span className="l">مرتجعات غير محدّثة</span><span className="v">{fi(tot.notUpd)}</span><span className="d muted">حسب الأوديت</span></div>
        <div className="kpi accent-bad"><span className="l">مرتجعات متأخرة</span><span className="v">{fi(tot.late)}</span><span className="d muted">{ageLabel}</span></div>
      </div>
      <h3>المرتجعات حسب الفرع</h3>
      <div className="tscroll"><table>
        <thead><tr><th>الفرع</th><th>شحنات الجرد</th><th>مرتجعات إلى الرئيسي</th><th>مرتجعات إلى الفروع</th><th>مرتجعات أخرى</th><th>إجمالي المرتجعات</th><th>% من الفرع</th><th>غير محدّثة</th><th>متأخرة</th><th>تحصيل مرتبط (ج.م)</th></tr></thead>
        <tbody>{rb2.map((r) => <tr key={r.branch}><td>{r.branch}</td><td className="n">{fi(r.all)}</td><td className="n">{fi(r.main)}</td><td className="n">{fi(r.toBr)}</td><td className="n">{fi(r.other)}</td><td className="n"><b>{fi(r.ret)}</b></td><td className="n">{fp(r.p)}</td><td className="n">{fi(r.notUpd)}</td><td className="n">{fi(r.late)}</td><td className="n">{fi(r.cod)}</td></tr>)}</tbody>
      </table></div>
      <p className="section-sub">«في الطريق للتاجر» ({fi(rb2.reduce((a, r) => a + r.toMer, 0))} شحنة) لا تدخل ضمن المرتجعات في هذا الجدول. التحصيل المرتبط = مجموع مبلغ التحصيل الموجب لشحنات المرتجعات (قيمة مرتبطة بالشحنات وليست مبلغًا مستحق التوريد بالضرورة).</p>
    </>);
    return <Frame id="returns" title="تقرير المرتجعات عند الفروع" period={period} scope={scope} note={basis}
      onCsv={csvOf('returns-' + snap, rb2, [{ h: 'الفرع', k: 'branch' }, { h: 'شحنات الجرد', k: 'all' }, { h: 'مرتجعات إلى الرئيسي', k: 'main' }, { h: 'مرتجعات إلى الفروع', k: 'toBr' }, { h: 'مرتجعات أخرى', k: 'other' }, { h: 'الإجمالي', k: 'ret' }, { h: 'غير محدّثة', k: 'notUpd' }, { h: 'متأخرة', k: 'late' }, { h: 'تحصيل مرتبط', k: 'cod' }])}>{body}</Frame>;
  }

  /* ---------------- الردود والجودة ---------------- */
  if (rep === 'replies') {
    const rows = [...byBranch].sort((a, b) => b.r_none - a.r_none);
    body = (<>
      <div className="kpi-row">
        <div className="kpi accent-bad"><span className="l">بدون رد الفرع</span><span className="v">{fi(T.r_none)}</span><span className="d muted">{fp(T.p_none)} من الشحنات</span></div>
        <div className="kpi accent-warn"><span className="l">تعارض</span><span className="v">{fi(T.conflict)}</span><span className="d muted">رد الفرع «تم التحديث» والأوديت «لم يتم»</span></div>
        <div className="kpi accent-teal"><span className="l">بدون نتيجة أوديت</span><span className="v">{fi(T.other)}</span><span className="d muted">تعليق الأوديت فارغ أو غير مطابق</span></div>
        <div className="kpi"><span className="l">تحصيل سالب</span><span className="v">{fi(T.neg_cod)}</span><span className="d muted">شحنات بمبلغ تحصيل سالب</span></div>
      </div>
      <div className="panel-grid" style={{ marginTop: 12 }}>
        <div className="panel"><h3>تصنيف رد الفرع حسب الفرع</h3><div className="chart-wrap tall"><ChartBox type="bar" theme={theme} horizontal stacked labels={rows.map((r) => r.branch)} datasets={[
          { label: 'تم التحديث', data: rows.map((r) => N(r.r_done)), backgroundColor: cv('--status-success') },
          { label: 'للرئيسي', data: rows.map((r) => N(r.r_main)), backgroundColor: cv('--chart-1') },
          { label: 'مندوب', data: rows.map((r) => N(r.r_rep)), backgroundColor: cv('--chart-2') },
          { label: 'تقفيل/وكيل', data: rows.map((r) => N(r.r_close)), backgroundColor: cv('--status-action') },
          { label: 'أخرى', data: rows.map((r) => N(r.r_other)), backgroundColor: cv('--chart-4') },
          { label: 'بدون رد', data: rows.map((r) => N(r.r_none)), backgroundColor: cv('--status-violation') }]} /></div></div>
        <div className="panel"><h3>ملاحظة</h3><p className="muted">تصنيف الرد مستنتج من نص «رد الفرع» بقواعد بسيطة (كلمات مثل «الرئيسي» و«مندوب» و«وكيل/تقفيل»)، لأن العمود نص حر. لقياس أسباب التأخر بدقة يلزم قائمة منسدلة موحدة (راجع docs/sheet-improvements.md).</p></div>
      </div>
      <h3>تفصيل الفروع</h3>
      <div className="tscroll"><table>
        <thead><tr><th>الفرع</th><th>الشحنات</th><th>بدون رد</th><th>تم التحديث</th><th>للرئيسي</th><th>مندوب</th><th>تقفيل/وكيل</th><th>أخرى</th><th>تعارض</th><th>بدون نتيجة أوديت</th><th>تحصيل سالب</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.branch}><td>{r.branch}</td><td className="n">{fi(r.total)}</td><td className={'n ' + (r.r_none ? 'bad' : '')}><b>{fi(r.r_none)}</b></td><td className="n">{fi(r.r_done)}</td><td className="n">{fi(r.r_main)}</td><td className="n">{fi(r.r_rep)}</td><td className="n">{fi(r.r_close)}</td><td className="n">{fi(r.r_other)}</td><td className="n">{fi(r.conflict)}</td><td className="n">{fi(r.other)}</td><td className="n">{fi(r.neg_cod)}</td></tr>)}</tbody>
      </table></div>
    </>);
    return <Frame id="replies" title="تقرير ردود الفروع وجودة الجرد" period={period} scope={scope} note={basis}
      onCsv={csvOf('replies-' + snap, rows, [{ h: 'الفرع', k: 'branch' }, { h: 'الشحنات', k: 'total' }, { h: 'بدون رد', k: 'r_none' }, { h: 'تم التحديث', k: 'r_done' }, { h: 'للرئيسي', k: 'r_main' }, { h: 'مندوب', k: 'r_rep' }, { h: 'تقفيل/وكيل', k: 'r_close' }, { h: 'أخرى', k: 'r_other' }, { h: 'تعارض', k: 'conflict' }, { h: 'بدون نتيجة أوديت', k: 'other' }, { h: 'تحصيل سالب', k: 'neg_cod' }])}>{body}</Frame>;
  }

  /* ---------------- الفترة (خريطة حرارية) ---------------- */
  if (rep === 'period') {
    const days = [...new Set(inRange.map((r) => r.date))].sort();
    const bs = [...new Set(inRange.map((r) => r.branch))].sort();
    const m = new Map(); inRange.forEach((r) => { const k = r.branch + '|' + r.date; const o = m.get(k) || { total: 0, upd: 0 }; o.total += N(r.total); o.upd += N(r.upd); m.set(k, o); });
    const rowsH = bs.map((b) => { const cells = days.map((d) => { const o = m.get(b + '|' + d); return o && o.total ? { r: pct(o.upd, o.total), t: o.total } : null; }); const tt = cells.reduce((a, c) => a + (c ? c.t : 0), 0); const uu = cells.reduce((a, c) => a + (c ? (c.r / 100) * c.t : 0), 0); return { b, cells, avg: pct(uu, tt), tt }; }).sort((a, b) => a.avg - b.avg);
    body = (<>
      <p className="section-sub">كل خلية = نسبة التحديث للفرع في اليوم، ولونها حسب حدود الصحة ({th.excellent}/{th.good}/{th.bad}). الخلية الفارغة = لا توجد شحنات للفرع في ذلك اليوم. المتوسط موزون بعدد الشحنات.</p>
      <div className="tscroll"><table className="heat">
        <thead><tr><th>الفرع</th>{days.map((d) => <th key={d} className="n">{d.slice(5)}</th>)}<th>المتوسط</th></tr></thead>
        <tbody>{rowsH.map((r) => <tr key={r.b}><td>{r.b}</td>{r.cells.map((c, i) => c ? <Cell key={i} lv={levelOf(c.r, th)}>{Math.round(c.r)}</Cell> : <td key={i} className="n muted">–</td>)}<Cell lv={levelOf(r.avg, th)}><b>{r.avg.toFixed(1)}%</b></Cell></tr>)}</tbody>
      </table></div>
    </>);
    return <Frame id="period" title="تقرير الفترة — نسبة التحديث لكل فرع ويوم" period={period} scope={scope} note={basis}
      onCsv={csvOf('period', rowsH.map((r) => { const o = { branch: r.b, avg: r.avg.toFixed(1) }; days.forEach((d, i) => { o[d] = r.cells[i] ? r.cells[i].r.toFixed(1) : ''; }); return o; }), [{ h: 'الفرع', k: 'branch' }, { h: 'المتوسط %', k: 'avg' }, ...days.map((d) => ({ h: d, k: d }))])}>{body}</Frame>;
  }

  /* ---------------- الشهري ---------------- */
  const months = [...new Set(monthly.map((r) => r.month))].sort();
  const cur = months[months.length - 1], prev = months[months.length - 2];
  if (!cur) return <div className="panel"><p>لا توجد بيانات شهرية (ورقة تجميع_شهري).</p></div>;
  const mr = monthly.filter((r) => r.month === cur && branchOk(r));
  const M = sumMonthly(mr), MP = prev ? sumMonthly(monthly.filter((r) => r.month === prev && branchOk(r))) : null;
  const mrow = (l, a, b, lb, f = fi, pp = false) => dRow(l, a, b, lb, f, pp);
  return (
    <Frame id="monthly" title={'التقرير الشهري — ' + cur} period={`شهر ${cur}${prev ? ' مقابل ' + prev : ''}`} scope={scope}
      note="المصدر: ورقة تجميع_شهري. كل شحنة تُحسب مرة واحدة في الشهر بآخر نتيجة أوديت مسجلة لها. الشهر الأقدم قد يكون ناقص الأيام إن لم تُقرأ كل أوراقه."
      onCsv={csvOf('monthly-' + cur, mr, [{ h: 'الفرع', k: 'branch' }, { h: 'الشحنات', k: 'total' }, { h: 'تم التحديث', k: 'upd' }, { h: 'لم يتم', k: 'not_upd' }, { h: 'بدون رد الأوديت', k: 'no_audit' }, { h: 'بدون رد الفرع', k: 'no_branch_reply' }, { h: 'تعارض', k: 'conflict' }])}>
      <div className="tscroll"><table>
        <thead><tr><th>المؤشر</th><th>{cur}</th><th>{prev || 'الشهر السابق'}</th><th>الفرق</th></tr></thead>
        <tbody>
          {mrow('الشحنات الفريدة', M.total, MP && MP.total, false)}
          {mrow('نسبة التحديث (حسب الأوديت)', M.rate, MP && MP.rate, false, fp, true)}
          {mrow('غير محدّثة', M.not_upd, MP && MP.not_upd, true)}
          {mrow('بدون رد الفرع', M.no_branch_reply, MP && MP.no_branch_reply, true)}
          {mrow('بدون رد الأوديت', M.no_audit, MP && MP.no_audit, true)}
          {mrow('تعارض', M.conflict, MP && MP.conflict, true)}
        </tbody>
      </table></div>
      <h3>الفروع</h3>
      <div className="tscroll"><table>
        <thead><tr><th>الفرع</th><th>الشحنات</th><th>نسبة التحديث</th><th>غير محدّثة</th><th>بدون رد الفرع</th><th>بدون رد الأوديت</th><th>تعارض</th></tr></thead>
        <tbody>{[...mr].sort((a, b) => N(a.upd) / (N(a.total) || 1) - N(b.upd) / (N(b.total) || 1)).map((r) => <tr key={r.branch}><td>{r.branch}</td><td className="n">{fi(r.total)}</td><td className="n"><b>{fp(pct(N(r.upd), N(r.total)))}</b></td><td className="n">{fi(r.not_upd)}</td><td className="n">{fi(r.no_branch_reply)}</td><td className="n">{fi(r.no_audit)}</td><td className="n">{fi(r.conflict)}</td></tr>)}</tbody>
      </table></div>
    </Frame>
  );
}

const AGE_LABEL = { 2: 'يومان فأكثر', 3: '3 أيام فأكثر', 5: '5 أيام فأكثر' };

export { REPORTS };
export function ReportNav({ rep, setRep }) {
  return (
    <div className="repnav noprint">
      {REPORTS.map(([id, icon, t, sub]) => (
        <button key={id} className={'repbtn' + (rep === id ? ' on' : '')} onClick={() => setRep(id)} title={sub}><i className={'fa-solid ' + icon} /><span>{t}</span></button>))}
    </div>
  );
}
