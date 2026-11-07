/**
 * تجميع جرد الفروع — يقرأ كل ورقة يوم (مثل 1/11 أو 31-10 أو 30-9)
 * ويكتب ورقة "تجميع_الجرد": صف لكل (تاريخ + فرع).
 * يعاد بناء التجميع بالكامل في كل تشغيل، فلا توجد تكرارات، وأي تعديل متأخر في ورقة يوم ينعكس.
 * الأوراق الجديدة تُلتقط تلقائيًا حسب اسمها. الأعمدة تُطابق بعناوينها لا بأماكنها.
 */
const CFG = {
  SUMMARY: 'تجميع_الجرد',
  LOG: 'سجل_التجميع',
  MONTHLY: 'تجميع_شهري',   // شحنات فريدة لكل شهر وفرع (آخر نتيجة أوديت مسجلة لكل شحنة)
  RECENT_DAYS: 7,      // الأوراق الأحدث من كده تُعاد قراءتها في كل تحديث، والأقدم تُؤخذ من التجميع السابق
  EVERY_HOURS: 1       // التحديث التلقائي كل كام ساعة
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('جرد الفروع')
    .addItem('تحديث الآن (سريع)', 'buildAuditSummary')
    .addItem('إعادة بناء كاملة', 'rebuildAll')
    .addItem('تفعيل التحديث التلقائي', 'installTriggers')
    .addToUi();
}

function rebuildAll() { buildAuditSummary(true); }

// تحديث تلقائي: كل ساعة + فور إضافة ورقة جديدة
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const f = t.getHandlerFunction();
    if (f === 'buildAuditSummary' || f === 'onSheetChange') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('buildAuditSummary').timeBased().everyHours(CFG.EVERY_HOURS).create();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(SpreadsheetApp.getActive()).onChange().create();
}

function onSheetChange(e) {
  if (e && e.changeType === 'INSERT_GRID') buildAuditSummary();
}

/* ---------- أدوات ---------- */
function normAr_(s) {
  return String(s == null ? '' : s)
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ').trim();
}

// اسم الورقة -> تاريخ، أو null إن لم تكن ورقة يوم
function sheetDate_(name, today) {
  const m = String(name).trim().match(/^(\d{1,2})\s*[-\/.]\s*(\d{1,2})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let dt = new Date(today.getFullYear(), mo - 1, d);
  if (dt.getTime() > today.getTime() + 2 * 864e5) dt = new Date(today.getFullYear() - 1, mo - 1, d);
  return dt;
}

// نتيجة الجرد من نص "تعليق الأوديت"
function classify_(comment) {
  const c = normAr_(comment);
  if (!c) return 'other';
  if (c.indexOf('لم يتم') !== -1) return 'not';
  if (c.indexOf('تم') === 0) return 'upd';
  return 'other';
}

function findCols_(hdr) {
  const h = hdr.map(normAr_);
  const find = fn => { for (let i = 0; i < h.length; i++) if (fn(h[i])) return i; return -1; };
  let branch = find(x => x.indexOf('فرع') !== -1 && x.indexOf('العضو') !== -1);
  if (branch < 0) { for (let i = h.length - 1; i >= 0; i--) if (h[i].indexOf('فرع') === 0) { branch = i; break; } }
  return {
    awb: find(x => x.indexOf('رقم') === 0),
    branch: branch,
    cod: find(x => x.indexOf('مبلغ') !== -1),
    reply: find(x => x.indexOf('رد') === 0),
    comment: find(x => x.indexOf('تعليق') !== -1 || x.indexOf('تعيق') !== -1 || x.indexOf('الاوديت') !== -1)
  };
}

function branchName_(v) {
  return normAr_(v).replace(/^فرع\s*/, '');
}

// يعالج مصفوفة قيم ورقة واحدة (الصف الأول عناوين). مفصولة للاختبار.
function summarizeSheet_(vals) {
  const idx = findCols_(vals[0]);
  if (idx.branch < 0 || idx.comment < 0) return { error: 'لم أجد عمود الفرع أو التعليق', idx: idx };
  const by = {}, seen = {}, ships = [];
  let dup = 0;
  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    const awb = idx.awb >= 0 ? String(row[idx.awb]).trim() : '';
    const br = branchName_(row[idx.branch]);
    if (!awb || !br) continue;
    if (seen[awb]) { dup++; continue; }
    seen[awb] = 1;
    const o = by[br] || (by[br] = { total: 0, upd: 0, not: 0, other: 0, codNot: 0, noReply: 0 });
    const k = classify_(row[idx.comment]);
    o.total++; o[k]++;
    if (k === 'not' && idx.cod >= 0) {
      const cod = Number(row[idx.cod]);
      if (cod > 0) o.codNot += cod;
    }
    const rep = idx.reply >= 0 ? String(row[idx.reply]).trim() : '';
    if (idx.reply >= 0 && !rep) o.noReply++;
    // سجل الشحنة للتجميع الشهري: a=رقم، b=فرع، k=نتيجة الأوديت، nr=بدون رد فرع، cf=رد الفرع «تم التحديث» والأوديت «لم يتم»
    ships.push({ a: awb, b: br, k: k, nr: (idx.reply >= 0 && !rep) ? 1 : 0, cf: (k === 'not' && normAr_(rep) === 'تم التحديث') ? 1 : 0 });
  }
  return { by: by, dup: dup, idx: idx, ships: ships };
}

function monthKey_(d) {
  return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
}

// يبني صفوف الشهري من [{dt, ships}]. كل شحنة تُحسب مرة واحدة في الشهر بآخر نتيجة أوديت مسجلة لها.
// ورقة اليوم التي لم يبدأ جردها (نتيجة غير محددة) لا تمحو نتيجة سابقة مسجلة.
function buildMonthly_(sheetsData) {
  sheetsData.sort((a, b) => a.dt - b.dt);
  const months = {};
  sheetsData.forEach(sd => {
    const mk = monthKey_(sd.dt);
    const m = months[mk] || (months[mk] = { ships: {}, days: 0, last: sd.dt });
    m.days++; m.last = sd.dt;
    sd.ships.forEach(s => {
      const p = m.ships[s.a];
      if (!p || s.k !== 'other' || p.k === 'other') m.ships[s.a] = s;
    });
  });
  const rows = [];
  Object.keys(months).sort().forEach(mk => {
    const m = months[mk], by = {};
    Object.keys(m.ships).forEach(a => {
      const s = m.ships[a];
      const o = by[s.b] || (by[s.b] = { total: 0, upd: 0, not: 0, other: 0, nr: 0, cf: 0 });
      o.total++; o[s.k]++; o.nr += s.nr; o.cf += s.cf;
    });
    Object.keys(by).sort((x, y) => String(x).localeCompare(String(y), 'ar')).forEach(b => {
      const o = by[b];
      rows.push([mk, b, o.total, o.upd, o.not, o.other, o.nr, o.cf, m.last, m.days]);
    });
  });
  return rows;
}

/* ---------- التشغيل ---------- */
// إعادة المحاولة عند مهلة خدمة Spreadsheets (الشيت الكبير): 4 محاولات بانتظار متزايد
function retry_(fn) {
  for (let i = 1; ; i++) {
    try { return fn(); }
    catch (e) {
      if (i >= 4 || !/timed out|Service Spreadsheets|try again|Internal error|Too many|Rate Limit/i.test(String(e))) throw e;
      Utilities.sleep(2000 * i);
    }
  }
}

function buildAuditSummary(full) {
  full = (full === true);  // المشغّلات تمرر كائنًا، فلا يُعتبر إعادة بناء كاملة
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return false;
  try { run_(full); PropertiesService.getScriptProperties().setProperty('LAST_BUILD', new Date().toISOString()); return true; } finally { lock.releaseLock(); }
}

function run_(full) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = new Date();
  const out = [], log = [];

  // صفوف التجميع السابق مجمعة باسم الورقة المصدر
  const prev = {};
  const old = ss.getSheetByName(CFG.SUMMARY);
  if (!full && old && old.getLastRow() > 1) {
    retry_(() => old.getRange(2, 1, old.getLastRow() - 1, 10).getValues()).forEach(r => {
      const k = String(r[9]).trim();
      (prev[k] = prev[k] || []).push(r);
    });
  }

  // التجميع الشهري السابق (للأشهر الأقدم من الشهر الماضي نعيد استخدامه ولا نعيد قراءة أوراقها)
  const monPrev = {};
  const oldMon = ss.getSheetByName(CFG.MONTHLY);
  if (!full && oldMon && oldMon.getLastRow() > 1) {
    retry_(() => oldMon.getRange(2, 1, oldMon.getLastRow() - 1, 10).getValues()).forEach(r => {
      const k = String(r[0]).trim();
      (monPrev[k] = monPrev[k] || []).push(r);
    });
  }
  const curMonth = monthKey_(today), prevMonth = monthKey_(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const hot = mk => full || !oldMon || !monPrev[mk] || mk === curMonth || mk === prevMonth;
  const monthData = [];

  ss.getSheets().forEach(sh => {
    const name = sh.getName();
    if (name === CFG.SUMMARY || name === CFG.LOG || name === CFG.MONTHLY) return;
    const dt = sheetDate_(name, today);
    if (!dt) { log.push([name, 'تجاهل', 'ليست ورقة يوم']); return; }
    const key = name.trim();
    const hidden = sh.isSheetHidden() ? 'مخفية | ' : '';
    const ageDays = (today.getTime() - dt.getTime()) / 864e5;

    if (!full && ageDays > CFG.RECENT_DAYS && prev[key] && !hot(monthKey_(dt))) {
      prev[key].forEach(r => out.push(r));
      log.push([name, 'من التجميع السابق', hidden.replace(' | ', '')]);
      return;
    }

    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2) { log.push([name, 'فارغة', hidden.replace(' | ', '')]); return; }
    const vals = retry_(() => sh.getRange(1, 1, lastRow, Math.min(lastCol, 40)).getValues());
    const res = summarizeSheet_(vals);
    if (res.error) { log.push([name, 'خطأ', hidden + res.error]); return; }
    monthData.push({ dt: dt, ships: res.ships });
    const notes = [];
    if (res.dup) notes.push('شحنات مكررة تم تجاهلها: ' + res.dup);
    let tot = 0, oth = 0;
    Object.keys(res.by).forEach(br => {
      const o = res.by[br];
      tot += o.total; oth += o.other;
      out.push([dt, br, o.total, o.upd, o.not, o.other,
        o.total ? Math.round(o.upd / o.total * 1000) / 10 : 0,
        o.codNot, o.noReply, key]);
    });
    if (tot && oth === tot) notes.push('كل الشحنات بلا نتيجة جرد (لم يبدأ الجرد أو عمود التعليق فارغ)');
    if (res.idx.reply < 0) notes.push('عمود رد الفرع غير موجود');
    log.push([name, 'تمت', hidden + 'شحنات: ' + tot + (notes.length ? ' | ' + notes.join(' | ') : '')]);
  });

  out.sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1]), 'ar'));

  const head = ['التاريخ', 'الفرع', 'الشحنات', 'تم التحديث', 'لم يتم التحديث', 'غير محدد',
    'نسبة التحديث %', 'تحصيل غير محدّث', 'بدون رد', 'الورقة المصدر'];
  writeTable_(ss, CFG.SUMMARY, head, out, { dates: [1] });

  // الشهري: الأشهر الساخنة تُبنى من الأوراق، والباقي يُعاد من التجميع السابق
  const monRows = buildMonthly_(monthData).filter(r => hot(r[0]));
  Object.keys(monPrev).forEach(mk => { if (!hot(mk)) monPrev[mk].forEach(r => monRows.push(r)); });
  monRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1]), 'ar'));
  const mhead = ['الشهر', 'الفرع', 'الشحنات (فريدة)', 'تم التحديث (أوديت)', 'لم يتم التحديث (أوديت)', 'بدون رد الأوديت',
    'بدون رد الفرع', 'تعارض (رد الفرع تم والأوديت لم يتم)', 'آخر جرد', 'أيام الجرد'];
  writeTable_(ss, CFG.MONTHLY, mhead, monRows, { text: [1], dates: [9] });

  writeTable_(ss, CFG.LOG, ['الورقة', 'الحالة', 'ملاحظات',
    'آخر تشغيل ' + Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') + (full ? ' (كامل)' : ' (سريع)')], log, {});
}

// كتابة جدول: كل استدعاء للشيت يعيد المحاولة وحده، فعطل مؤقت لا يرجّع الكتابة من الأول
function writeTable_(ss, name, head, rows, fmt) {
  fmt = fmt || {};
  const sh = retry_(() => ss.getSheetByName(name) || ss.insertSheet(name));
  retry_(() => sh.clearContents());
  retry_(() => sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'));
  if (rows.length) {
    const w = rows[0].length;
    (fmt.text || []).forEach(c => retry_(() => sh.getRange(2, c, rows.length, 1).setNumberFormat('@')));
    retry_(() => sh.getRange(2, 1, rows.length, w).setValues(rows));
    (fmt.dates || []).forEach(c => retry_(() => sh.getRange(2, c, rows.length, 1).setNumberFormat('yyyy-mm-dd')));
  }
  retry_(() => sh.setFrozenRows(1));
}
