import React from 'react';
import ChartBox from './ChartBox.jsx';
import { N, fi, fp, toCsv, download } from './lib.js';

const cv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#0837C9';
const Tile = ({ label, value, sub, accent, chip }) => (
  <div className={'kpi ' + (accent || '')}><span className="l">{label}{chip && <> <span className="chip s-progress">{chip}</span></>}</span><span className="v">{value}</span>{sub && <span className="d muted">{sub}</span>}</div>
);

function ListTable({ title, note, cols, rows, file }) {
  return (
    <div className="panel">
      <div className="cardhead">
        <div><h3>{title}</h3><p className="panel-sub">{note}</p></div>
        <button className="qa-btn" onClick={() => download(file, toCsv(rows, cols))} disabled={!rows.length}><i className="fa-solid fa-file-csv" />CSV</button>
      </div>
      {!rows.length ? <p className="muted">لا توجد شحنات.</p> : (
        <div className="tscroll" style={{ maxHeight: 320 }}><table>
          <thead><tr>{cols.map((c) => <th key={c.k}>{c.h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.k} className={typeof r[c.k] === 'number' ? 'n' : ''}>{r[c.k] ?? ''}</td>)}</tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

export default function Follow({ follow, theme, branchOk }) {
  const k = follow.kpi, all = follow.branches, bl = all.filter((b) => branchOk({ branch: b.branch })), filtered = bl.length !== all.length;
  const sum = (key) => bl.reduce((s, b) => s + N(b[key]), 0);
  const total = sum('total'), open = sum('open'), closed = sum('closed'), missing = sum('missing'), ended = sum('ended'), repeated = sum('repeated');
  const pct = (v) => (total ? (v / total) * 100 : 0);
  const byMiss = [...bl].sort((a, b) => b.missing - a.missing || b.open - a.open);
  const L = follow.lists;
  const keep = (arr) => (arr || []).filter((r) => branchOk({ branch: r.branch }));
  return (
    <>
      <div className="section-heading"><span className="tag">المتابعة</span><h2>متابعة الشحنات: مفتوحة ومغلقة ومفقودة</h2></div>
      <p className="section-sub">تراكمي عبر كل الأيام حتى {follow.asOf}. «مغلقة» = حالة الأوديت «تم الغلق». «مفقودة» = اختفت من الجرد بلا إغلاق وبحالة غير نهائية (الجمعة إجازة ولا تُحسب). «منتهية» = اختفت بحالة نهائية. {filtered && 'الأعداد والنسب للفروع المحددة، والمتوسطات لكل الفروع.'}</p>
      <div className="kpi-row">
        <Tile label="مفتوحة" value={fi(open)} sub={fp(pct(open)) + ' من الشحنات'} accent="accent-warn" />
        <Tile label="مغلقة" chip="حسب الأوديت" value={fi(closed)} sub={'نسبة الإغلاق ' + fp(pct(closed))} accent="accent-ok" />
        <Tile label="مفقودة" value={fi(missing)} sub={fp(pct(missing)) + ' من الشحنات'} accent="accent-bad" />
        <Tile label="منتهية (حالة نهائية)" value={fi(ended)} sub={fp(pct(ended)) + ' من الشحنات'} />
        <Tile label="متكررة" value={fi(repeated)} sub={fp(pct(repeated)) + ' (ظهرت عدة أيام)'} accent="accent-teal" />
        <Tile label="متوسط أيام استجابة الفرع" value={k.avg_response_days == null ? '—' : N(k.avg_response_days).toFixed(1)} sub={'من أول ظهور حتى أول رد' + (filtered ? ' (كل الفروع)' : '')} />
        <Tile label="متوسط أيام الإغلاق" value={k.avg_close_days == null ? '—' : N(k.avg_close_days).toFixed(1)} sub={'للمغلقة فقط' + (filtered ? ' (كل الفروع)' : '')} />
        <Tile label="أقدم حالة مفتوحة (يوم)" value={fi(k.oldest_open_days)} sub={filtered ? 'كل الفروع' : ''} />
      </div>
      <div className="panel-grid" style={{ marginTop: 12 }}>
        <div className="panel"><h3>حالة الشحنات حسب الفرع</h3><p className="panel-sub">مرتبة بالأكثر مفقودًا ثم مفتوحًا</p>
          <div className="chart-wrap tall"><ChartBox type="bar" theme={theme} horizontal stacked labels={byMiss.map((b) => b.branch)} datasets={[
            { label: 'مفتوحة', data: byMiss.map((b) => N(b.open)), backgroundColor: cv('--status-progress') },
            { label: 'مغلقة', data: byMiss.map((b) => N(b.closed)), backgroundColor: cv('--status-success') },
            { label: 'مفقودة', data: byMiss.map((b) => N(b.missing)), backgroundColor: cv('--status-violation') },
            { label: 'منتهية', data: byMiss.map((b) => N(b.ended)), backgroundColor: cv('--chart-4') }]} /></div></div>
        <div className="panel"><h3>أرقام المتابعة لكل فرع</h3>
          <div className="tscroll"><table>
            <thead><tr><th>الفرع</th><th>الشحنات</th><th>مفتوحة</th><th>مغلقة</th><th>مفقودة</th><th>منتهية</th><th>متكررة</th><th>أيام استجابة الفرع</th></tr></thead>
            <tbody>{byMiss.map((b) => (
              <tr key={b.branch}><td>{b.branch}</td><td className="n">{fi(b.total)}</td><td className="n">{fi(b.open)}</td><td className="n">{fi(b.closed)}</td>
                <td className={'n ' + (N(b.missing) > 0 ? 'bad' : '')}>{fi(b.missing)}</td><td className="n">{fi(b.ended)}</td><td className="n">{fi(b.repeated)}</td>
                <td className="n">{b.avg_resp == null ? '—' : N(b.avg_resp).toFixed(1)}</td></tr>))}</tbody>
          </table></div></div>
      </div>
      {L ? (
        <div className="panel-grid" style={{ marginTop: 12 }}>
          <ListTable title="الشحنات المفقودة" note="الأكثر أيامًا مفقودة" file="missing.csv" rows={keep(L.missing)} cols={[{ k: 'awb', h: 'رقم البوليصة' }, { k: 'branch', h: 'الفرع' }, { k: 'status', h: 'آخر حالة' }, { k: 'last_seen', h: 'آخر ظهور' }, { k: 'missing_days', h: 'أيام مفقودة' }, { k: 'a_status', h: 'حالة الأوديت' }]} />
          <ListTable title="أقدم الحالات المفتوحة" note="الأكثر أيامًا منذ أول ظهور" file="open.csv" rows={keep(L.open)} cols={[{ k: 'awb', h: 'رقم البوليصة' }, { k: 'branch', h: 'الفرع' }, { k: 'status', h: 'آخر حالة' }, { k: 'open_days', h: 'أيام مفتوحة' }, { k: 'a_status', h: 'حالة الأوديت' }]} />
          <ListTable title="الشحنات المتكررة" note="الأكثر ظهورًا" file="repeated.csv" rows={keep(L.repeated)} cols={[{ k: 'awb', h: 'رقم البوليصة' }, { k: 'branch', h: 'الفرع' }, { k: 'days', h: 'مرات الظهور' }, { k: 'status', h: 'آخر حالة' }]} />
        </div>
      ) : <p className="muted" style={{ marginTop: 8 }}>قوائم الشحنات (المفقودة والمفتوحة والمتكررة) غير مفعّلة في الويب آب. للتفعيل: <code>CFG.EXPOSE_LISTS = true</code> في Code.gs، علمًا أن الرابط عام وسيعرض أرقام بوالص الشحنات.</p>}
    </>
  );
}
