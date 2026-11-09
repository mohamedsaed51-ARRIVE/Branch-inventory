/**
 * نظام جرد الفروع: ملف Apps Script واحد كامل (انسخه كله في Code.gs واحذف أي ملفات أخرى في المشروع).
 *
 * الأقسام:
 *  1) الإعدادات (CFG)               2) القائمة والمشغّلات                3) الويب آب للوحة (doGet)
 *  4) نقطة التحديث buildAuditSummary 5) المحرك أ: ورقة لكل يوم (الشيت الحالي) + المتابعة (مفقودة/متكررة/مفتوحة/أرشيف) + عمود حالة الأوديت
 *  6) المحرك ب: جدول واحد لكل الأيام (الشيت الموحّد: استيراد، مفقود، متكرر، أرشيف، ختم تعديل)
 *  7) حذف التابات غير المستخدمة removeUnusedTabs (من القائمة، بعد تأكيد ونسخة احتياطية)
 *
 * اختيار المحرك تلقائيًا: إن كانت ورقة «الجرد» موجودة وفيها بيانات يعمل المحرك ب، وإلا المحرك أ.
 * يمكن فرضه من CFG.MODE ('perday' أو 'unified'). ورقة «الجرد» الفاضية لا تغيّر سلوك الشيت الحالي.
 * مخرجات المحركين واحدة (تجميع_الجرد وتجميع_شهري) فاللوحة تعمل مع أيهما بلا تعديل.
 */

/* ============================== 1) الإعدادات ============================== */
const CFG = {
  MODE: 'auto',                    // auto | perday | unified
  // مخرجات مشتركة (تقرؤها اللوحة)
  SUMMARY: 'تجميع_الجرد', MONTHLY: 'تجميع_شهري', LOG: 'سجل_التجميع',
  REFRESH_MIN_SECONDS: 60,         // أقل فاصل بين تحديثين يطلبهما زر اللوحة
  EVERY_HOURS: 1,                  // التحديث التلقائي بالوقت
  // المحرك أ (ورقة لكل يوم)
  RECENT_DAYS: 14,                 // أوراق الأيام الأحدث تُعاد قراءتها كل مرة، والأقدم تؤخذ من التجميع السابق
  PD_FOLLOW: true,                 // [جديد] المحرك أ يكتب أوراق المتابعة (المفقودة/المتكررة/المفتوحة/الأرشيف/مغلقة_وظاهرة)
  FOLLOW_WINDOW: 14,               // [جديد] عدد أوراق الأيام الأخيرة التي تُبنى منها المتابعة
  ASTATUS: 'حالة الأوديت',         // [جديد] عنوان العمود في أوراق الأيام
  ASTATUS_VALUES: ['انتظار رد الفرع', 'مفتوح', 'تحت المراجعة', 'تم الغلق'],   // [جديد] قائمة العمود المنسدلة
  TERMINAL: ['تم التسليم', 'تم الالغاء- واتس اب', 'مرتجع استبدال'],            // [جديد] حالات نهائية: اختفاء الشحنة بها ليس «مفقودًا» (افتراض يحتاج اعتماد)
  REPEAT_DAYS: 3,                  // [جديد] «متكررة» = ظهرت في هذا العدد من الأيام فأكثر (افتراض يحتاج اعتماد)
  // المحرك ب (جدول واحد)
  DATA: 'الجرد', IMPORT: 'استيراد', LEDGER: 'سجل_الشحنات', OPEN: 'الحالات_المفتوحة', MISSING: 'المفقودة', REPEATED: 'المتكررة',
  ARCHIVE: 'الأرشيف', ACTIONS: 'سجل_الإجراءات', ERRORS: 'سجل_الأخطاء', LISTS: 'القوائم',
  REOPENED: 'مغلقة_وظاهرة',         // [جديد] شحنات أُغلقت (تم الغلق) ثم ظهرت في جرد يوم لاحق
  FOLLOW: 'ملخص_المتابعة',          // ورقة يكتبها المحرك (JSON للوحة)
  EXPOSE_LISTS: false,             // true = الويب آب يعرض قوائم شحنات (المفقودة/المفتوحة/المتكررة/المغلقة الظاهرة) للوحة. الافتراضي: أعداد فقط
  LIST_LIMIT: 40,                  // أقصى عدد صفوف لكل قائمة
  CLOSED: 'تم الغلق',              // حالة الأوديت التي تعني إغلاق رد الأوديت
  OFF_DAY: 5                       // يوم الإجازة (JS: 0=الأحد ... 5=الجمعة)
};

/* ======================== 2) القائمة والمشغّلات ======================== */
// المحرك المستخدم الآن: 'unified' فقط لو ورقة «الجرد» موجودة وصف 2 فيه رقم بوليصة
function mode_(ss) {
  if (CFG.MODE !== 'auto') return CFG.MODE;
  const sh = ss.getSheetByName(CFG.DATA);
  if (!sh || sh.getLastRow() < 2) return 'perday';
  return String(sh.getRange(2, 2).getValue()).trim() !== '' ? 'unified' : 'perday';
}

function onOpen() {
  const un = mode_(SpreadsheetApp.getActive()) === 'unified', m = SpreadsheetApp.getUi().createMenu('جرد الفروع');
  m.addItem('تحديث التجميع الآن', 'buildAuditSummary');
  if (!un) { m.addItem('إعادة بناء كاملة', 'rebuildAll'); m.addItem('إضافة عمود «حالة الأوديت» لأوراق الأيام', 'addAuditStatusColumn'); }
  if (un) { m.addItem('تطبيق الاستيراد', 'applyImport'); m.addItem('ملء المعادلات للصفوف الجديدة', 'fillFormulas'); }
  m.addItem('تفعيل التحديث التلقائي', 'installTriggers').addSeparator().addItem('حذف التابات غير المستخدمة…', 'removeUnusedTabs').addToUi();
}

function rebuildAll() { buildAuditSummary(true); }

function installTriggers() {
  const ss = SpreadsheetApp.getActive(), mine = ['buildAuditSummary', 'refreshAll', 'onSheetChange', 'onEditStamp'];
  ScriptApp.getProjectTriggers().forEach(t => { if (mine.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('buildAuditSummary').timeBased().everyHours(CFG.EVERY_HOURS).create();
  if (mode_(ss) === 'unified') ScriptApp.newTrigger('onEditStamp').forSpreadsheet(ss).onEdit().create();   // ختم بواسطة/آخر تعديل
  else ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss).onChange().create();                        // ورقة يوم جديدة
}

function onSheetChange(e) {
  if (e && e.changeType === 'INSERT_GRID') buildAuditSummary();
}

/* =========================== 3) الويب آب للوحة =========================== */
// النشر: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.
// ?refresh=1 يعيد التجميع قبل الإرجاع (حد أدنى CFG.REFRESH_MIN_SECONDS). خاصية DATA_TOKEN اختيارية لطلب ?token=
function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const need = props.getProperty('DATA_TOKEN');
  if (need && (!e || !e.parameter || e.parameter.token !== need)) return json_({ error: 'unauthorized' });
  // ?refresh=1 : يعيد التجميع قبل الإرجاع (زر «تحديث» في اللوحة). الحد الأدنى بين تحديثين CFG.REFRESH_MIN_SECONDS لمنع الضغط.
  let refreshed = false, note = '';
  if (e && e.parameter && e.parameter.refresh === '1') {
    const last = Number(props.getProperty('LAST_REFRESH') || 0);
    if (Date.now() - last < CFG.REFRESH_MIN_SECONDS * 1000) note = 'throttled';
    else {
      props.setProperty('LAST_REFRESH', String(Date.now()));
      refreshed = buildAuditSummary();   // true = تم، false = تجميع آخر شغال
      if (!refreshed) note = 'busy';
    }
  }
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.SUMMARY);
  const meta = { generated: new Date().toISOString(), built: props.getProperty('LAST_BUILD') || '', refreshed: refreshed, note: note };
  if (!sh || sh.getLastRow() < 2) return json_(Object.assign({ rows: [], monthly: [] }, meta));
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues().map(r => ({
    date: Utilities.formatDate(new Date(r[0]), tz, 'yyyy-MM-dd'),
    branch: r[1], total: r[2], upd: r[3], not_upd: r[4], other: r[5],
    rate: r[6], cod_not: r[7], no_reply: r[8], source: String(r[9])
  }));
  const ms = SpreadsheetApp.getActive().getSheetByName(CFG.MONTHLY);
  const mcols = ms ? Math.min(Math.max(ms.getLastColumn(), 10), 11) : 10;   // العمود 11 (مغلقة) يكتبه المحركان عند توفر عمود «حالة الأوديت»
  const monthly = (ms && ms.getLastRow() > 1) ? ms.getRange(2, 1, ms.getLastRow() - 1, mcols).getValues().map(r => ({
    month: String(r[0]).trim(), branch: r[1], total: r[2], upd: r[3], not_upd: r[4], no_audit: r[5],
    no_branch_reply: r[6], conflict: r[7], last: Utilities.formatDate(new Date(r[8]), tz, 'yyyy-MM-dd'), days: r[9],
    closed: (mcols > 10 && r[10] !== '' && r[10] != null) ? r[10] : null
  })) : [];
  // ملخص المتابعة: القوائم لا تُرسل إلا إن فعّلت CFG.EXPOSE_LISTS
  let follow = null;
  const fs = SpreadsheetApp.getActive().getSheetByName(CFG.FOLLOW);
  if (fs && fs.getLastRow() >= 2) { try { follow = JSON.parse(fs.getRange(2, 1).getValue()); } catch (err) { follow = null; } }
  if (follow && !CFG.EXPOSE_LISTS) follow.lists = null;
  return json_(Object.assign({ rows: rows, monthly: monthly, follow: follow }, meta));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ====================== 4) نقطة التحديث المشتركة ====================== */
// يستدعيها زر اللوحة والمشغّلات والقائمة. تُرجع true عند النجاح، false لو تجميع آخر شغّال.
function buildAuditSummary(full) {
  full = (full === true);   // المشغّلات تمرر كائنًا، فلا يُعتبر إعادة بناء كاملة
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return false;
  try {
    const ss = SpreadsheetApp.getActive(), unified = mode_(ss) === 'unified';
    try { if (unified) un_run_(); else pd_run_(full); }
    catch (err) { if (unified) { try { un_logError_(ss, [['buildAuditSummary', String(err), '']]); } catch (e2) { /* تجاهل */ } } throw err; }
    PropertiesService.getScriptProperties().setProperty('LAST_BUILD', new Date().toISOString());
    return true;
  } finally { lock.releaseLock(); }
}
function refreshAll() { return buildAuditSummary(true); }   // اسم قديم

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

// كتابة جدول: كل استدعاء للشيت يعيد المحاولة وحده، فعطل مؤقت لا يرجّع الكتابة من الأول
function writeTable_(ss, name, head, rows, fmt) {
  fmt = fmt || {};
  const sh = retry_(() => ss.getSheetByName(name) || ss.insertSheet(name));
  retry_(() => sh.clearContents());
  retry_(() => sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'));
  if (rows.length) {
    if (sh.getMaxRows() < rows.length + 1) retry_(() => sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows()));
    const w = rows[0].length;
    (fmt.text || []).forEach(c => retry_(() => sh.getRange(2, c, rows.length, 1).setNumberFormat('@')));
    retry_(() => sh.getRange(2, 1, rows.length, w).setValues(rows));
    (fmt.dates || []).forEach(c => retry_(() => sh.getRange(2, c, rows.length, 1).setNumberFormat('yyyy-mm-dd')));
  }
  retry_(() => sh.setFrozenRows(1));
}

/* ============ 5) المحرك أ: ورقة لكل يوم (الشيت الحالي، أوراق مثل 1/11 و31-10) ============ */
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
    // [تعديل] «حالة الأوديت» لا تُعتبر تعليقًا
    comment: find(x => x.indexOf('تعليق') !== -1 || x.indexOf('تعيق') !== -1 || (x.indexOf('الاوديت') !== -1 && x.indexOf('حال') !== 0)),
    status: find(x => x.indexOf('حال') === 0 && x.indexOf('الشحنه') !== -1),          // [جديد] حالة الشحنة
    astatus: find(x => x.indexOf('حال') === 0 && x.indexOf('الاوديت') !== -1)         // [جديد] حالة الأوديت (اختياري)
  };
}

function branchName_(v) {
  return normAr_(v).replace(/^فرع\s*/, '');
}

// يعالج مصفوفة قيم ورقة واحدة (الصف الأول عناوين). مفصولة للاختبار.
function summarizeSheet_(vals) {
  const idx = findCols_(vals[0]);
  if (idx.branch < 0 || idx.comment < 0) return { error: 'لم أجد عمود الفرع أو التعليق', idx: idx };
  const by = {}, seen = {}, ships = [], recs = [], CL = normAr_(CFG.CLOSED);
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
    const ast = idx.astatus >= 0 ? String(row[idx.astatus]).trim() : '';
    // سجل الشحنة للتجميع الشهري: a=رقم، b=فرع، k=نتيجة الأوديت، nr=بدون رد فرع، cf=رد الفرع «تم التحديث» والأوديت «لم يتم»، cl=أُغلقت (حالة الأوديت تم الغلق)
    ships.push({ a: awb, b: br, k: k, nr: (idx.reply >= 0 && !rep) ? 1 : 0, cf: (k === 'not' && normAr_(rep) === 'تم التحديث') ? 1 : 0, cl: normAr_(ast) === CL ? 1 : 0 });
    // سجل المتابعة (مفقودة/متكررة/مفتوحة/أرشيف): نفس شكل المحرك ب
    recs.push({ awb: awb, branch: br, res: k, reply: rep, status: idx.status >= 0 ? String(row[idx.status]).trim() : '', aStatus: ast, aComment: String(row[idx.comment] == null ? '' : row[idx.comment]).trim(),
      replyDt: '', closeDt: '', cod: idx.cod >= 0 ? row[idx.cod] : '' });
  }
  return { by: by, dup: dup, idx: idx, ships: ships, recs: recs, hasAst: idx.astatus >= 0 };
}

function monthKey_(d) {
  return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
}

// يبني صفوف الشهري من [{dt, ships, hasAst}]. كل شحنة تُحسب مرة واحدة في الشهر بآخر نتيجة أوديت مسجلة لها.
// ورقة اليوم التي لم يبدأ جردها (نتيجة غير محددة) لا تمحو نتيجة سابقة مسجلة.
// العمود 11 (مغلقة): شحنات أُغلقت في أي يوم من الشهر. يبقى فارغًا إن لم يوجد عمود «حالة الأوديت» في أوراق الشهر.
function buildMonthly_(sheetsData) {
  sheetsData.sort((a, b) => a.dt - b.dt);
  const months = {};
  sheetsData.forEach(sd => {
    const mk = monthKey_(sd.dt);
    const m = months[mk] || (months[mk] = { ships: {}, days: 0, last: sd.dt, closed: {}, hasAst: false });
    m.days++; m.last = sd.dt; if (sd.hasAst) m.hasAst = true;
    sd.ships.forEach(s => {
      if (s.cl) m.closed[s.a] = 1;
      const p = m.ships[s.a];
      if (!p || s.k !== 'other' || p.k === 'other') m.ships[s.a] = s;
    });
  });
  const rows = [];
  Object.keys(months).sort().forEach(mk => {
    const m = months[mk], by = {};
    Object.keys(m.ships).forEach(a => {
      const s = m.ships[a];
      const o = by[s.b] || (by[s.b] = { total: 0, upd: 0, not: 0, other: 0, nr: 0, cf: 0, cl: 0 });
      o.total++; o[s.k]++; o.nr += s.nr; o.cf += s.cf; if (m.closed[a]) o.cl++;
    });
    Object.keys(by).sort((x, y) => String(x).localeCompare(String(y), 'ar')).forEach(b => {
      const o = by[b];
      rows.push([mk, b, o.total, o.upd, o.not, o.other, o.nr, o.cf, m.last, m.days, m.hasAst ? o.cl : '']);
    });
  });
  return rows;
}


function pd_run_(full) {
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
    const mc = Math.min(Math.max(oldMon.getLastColumn(), 10), 11);
    retry_(() => oldMon.getRange(2, 1, oldMon.getLastRow() - 1, mc).getValues()).forEach(r => {
      const k = String(r[0]).trim();
      while (r.length < 11) r.push('');     // [جديد] تجميع قديم بـ10 أعمدة: العمود 11 فارغ
      (monPrev[k] = monPrev[k] || []).push(r);
    });
  }
  const curMonth = monthKey_(today), prevMonth = monthKey_(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const hot = mk => full || !oldMon || !monPrev[mk] || mk === curMonth || mk === prevMonth;
  const monthData = [];
  let maxDt = null;   // [جديد] آخر ورقة يوم في الشيت (حتى لو لم تُقرأ)

  ss.getSheets().forEach(sh => {
    const name = sh.getName();
    if (name === CFG.SUMMARY || name === CFG.LOG || name === CFG.MONTHLY) return;
    const dt = sheetDate_(name, today);
    if (!dt) { log.push([name, 'تجاهل', 'ليست ورقة يوم']); return; }
    if (!maxDt || dt > maxDt) maxDt = dt;
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
    monthData.push({ dt: dt, ships: res.ships, recs: res.recs, hasAst: res.hasAst });
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
    if (!res.hasAst) notes.push('لا يوجد عمود «' + CFG.ASTATUS + '» (الإغلاق غير محسوب لهذه الورقة)');
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
    'بدون رد الفرع', 'تعارض (رد الفرع تم والأوديت لم يتم)', 'آخر جرد', 'أيام الجرد', 'مغلقة (تم الغلق)'];
  writeTable_(ss, CFG.MONTHLY, mhead, monRows, { text: [1], dates: [9] });

  writeTable_(ss, CFG.LOG, ['الورقة', 'الحالة', 'ملاحظات',
    'آخر تشغيل ' + Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') + (full ? ' (كامل)' : ' (سريع)')], log, {});

  // [جديد] المتابعة: مفقودة/متكررة/مفتوحة/أرشيف/مغلقة_وظاهرة + ملخص اللوحة. لا تُسقط التجميع الأساسي إن فشلت.
  if (CFG.PD_FOLLOW && monthData.length && maxDt) {
    try { pd_follow_(ss, monthData, maxDt); }
    catch (err) { writeTable_(ss, CFG.LOG, ['الورقة', 'الحالة', 'ملاحظات', 'خطأ في المتابعة'], log.concat([['المتابعة', 'خطأ', String(err)]]), {}); }
  }
}

// [جديد] بناء أوراق المتابعة من آخر CFG.FOLLOW_WINDOW ورقة يوم تمت قراءتها
function pd_follow_(ss, monthData, maxDt) {
  const win = monthData.slice().sort((a, b) => a.dt - b.dt).slice(-CFG.FOLLOW_WINDOW), recs = [];
  win.forEach(sd => sd.recs.forEach(r => recs.push(Object.assign({}, r, { date: sd.dt }))));
  const o = buildOutputs_(recs, { terminal: CFG.TERMINAL, repeatDays: CFG.REPEAT_DAYS, listLimit: CFG.LIST_LIMIT, maxDay: dayKey_(maxDt) });
  un_writeFollowSheets_(ss, o);
  un_writeFollow_(ss, o.follow);
}

// [جديد] إضافة عمود «حالة الأوديت» (قائمة منسدلة) لأوراق الأيام الأخيرة التي ينقصها. لا يمس أي بيانات موجودة.
// يمكن تشغيله من القائمة كل يوم بعد لصق ورقة اليوم الجديدة.
function addAuditStatusColumn() {
  const ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi(), today = new Date(), days = [];
  ss.getSheets().forEach(sh => { const dt = sheetDate_(sh.getName(), today); if (dt) days.push({ sh: sh, dt: dt }); });
  days.sort((a, b) => a.dt - b.dt);
  const target = days.slice(-CFG.FOLLOW_WINDOW).filter(d => {
    const lc = d.sh.getLastColumn(); if (lc < 1) return false;
    const head = d.sh.getRange(1, 1, 1, lc).getValues()[0].map(normAr_);
    return head.indexOf(normAr_(CFG.ASTATUS)) < 0;
  });
  if (!target.length) { ui.alert('كل أوراق الأيام الأخيرة فيها عمود «' + CFG.ASTATUS + '» بالفعل.'); return; }
  const msg = 'سيُضاف عمود «' + CFG.ASTATUS + '» (قائمة: ' + CFG.ASTATUS_VALUES.join(' / ') + ') في آخر أعمدة هذه الأوراق:\n' + target.map(d => d.sh.getName()).join('، ') +
    '\n\nلن تُعدَّل أو تُحذف أي بيانات موجودة. هل تريد المتابعة؟';
  if (ui.alert('إضافة عمود حالة الأوديت', msg, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(CFG.ASTATUS_VALUES, true).setAllowInvalid(false).setHelpText('اختر حالة الأوديت من القائمة').build();
  target.forEach(d => {
    const sh = d.sh, col = sh.getLastColumn() + 1;
    retry_(() => { if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns()); });
    retry_(() => sh.getRange(1, 1).copyTo(sh.getRange(1, col), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false));
    retry_(() => sh.getRange(1, col).setValue(CFG.ASTATUS).setFontWeight('bold'));
    retry_(() => sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule));
  });
  ui.alert('تمت إضافة العمود لـ ' + target.length + ' ورقة. ابدأ بتعبئته، ثم «تحديث التجميع الآن».');
}

/* ============ 6) المحرك ب: جدول واحد لكل الأيام (ورقة «الجرد») ============ */
const UN_H = {  // عناوين أعمدة ورقة الجرد
  date: 'تاريخ الجرد', awb: 'رقم البوليصة', cod: 'مبلغ التحصيل', branch: 'فرع العضو', status: 'حالة الشحنة', reply: 'رد الفرع', rnote: 'ملاحظة الفرع', rdt: 'تاريخ رد الفرع',
  result: 'نتيجة الأوديت', why: 'سبب عدم التحديث', acomment: 'تعليق الأوديت', astatus: 'حالة الأوديت', closedt: 'تاريخ إغلاق الحالة', by: 'بواسطة', edited: 'آخر تعديل'
};
const UN_WATCH = ['reply', 'rnote', 'result', 'why', 'acomment', 'astatus'];

/* ======================= منطق نقي (قابل للاختبار) ======================= */
function norm_(s) { return String(s == null ? '' : s).replace(/[ً-ْ]/g, '').replace(/\s+/g, ' ').trim(); }
function dayKey_(d) {
  if (d instanceof Date) return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  return String(d).slice(0, 10);
}
function toDate_(k) { const p = String(k).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function diffDays_(a, b) { return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5); }
function addDay_(k) { const d = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) + 864e5); return d.toISOString().slice(0, 10); }
function isOff_(k) { return new Date(k + 'T00:00:00Z').getUTCDay() === CFG.OFF_DAY; }
function workDaysAfter_(last, max) { const out = []; for (let d = addDay_(last); d <= max; d = addDay_(d)) if (!isOff_(d)) out.push(d); return out; }
function resultOf_(v) { const x = norm_(v); return x === norm_('محدّثة') ? 'upd' : x === norm_('غير محدّثة') ? 'not' : 'other'; }

// recs: [{date, awb, branch, res, reply, status, aStatus, aComment, replyDt, closeDt, cod}]
// opts: {terminal:[حالات نهائية], repeatDays:3, maxDay:'YYYY-MM-DD' (اختياري)}
function buildOutputs_(recs, opts) {
  opts = opts || {}; const terminal = (opts.terminal || []).map(norm_), repeatDays = opts.repeatDays || 3, CL = norm_(CFG.CLOSED);
  recs = recs.map(r => Object.assign({}, r, { dk: dayKey_(r.date) })).sort((a, b) => a.dk < b.dk ? -1 : a.dk > b.dk ? 1 : 0);
  const maxDay = opts.maxDay || (recs.length ? recs[recs.length - 1].dk : '');
  // --- يومي (للوحة): شحنات فريدة لكل يوم + فرع
  const dseen = {}, daily = {};
  recs.forEach(r => {
    const sk = r.dk + '|' + r.awb; if (dseen[sk]) return; dseen[sk] = 1;
    const k = r.dk + '|' + r.branch, o = daily[k] || (daily[k] = { dk: r.dk, b: r.branch, t: 0, upd: 0, not: 0, other: 0, codNot: 0, nr: 0 });
    o.t++; o[r.res]++; if (r.res === 'not' && Number(r.cod) > 0) o.codNot += Number(r.cod); if (!norm_(r.reply)) o.nr++;
  });
  const dailyRows = Object.keys(daily).sort().map(k => { const o = daily[k]; return [toDate_(o.dk), o.b, o.t, o.upd, o.not, o.other, o.t ? Math.round(o.upd / o.t * 1000) / 10 : 0, o.codNot, o.nr, 'الجرد']; });
  // --- شهري + سجل الشحنات
  const months = {}, led = {};
  recs.forEach(r => {
    const mk = r.dk.slice(0, 7), m = months[mk] || (months[mk] = { ships: {}, days: {}, closed: {} });
    m.days[r.dk] = 1; const p = m.ships[r.awb];
    if (norm_(r.aStatus) === CL) m.closed[r.awb] = 1;   // أُغلقت في أي يوم من الشهر
    if (!p || r.res !== 'other' || p.res === 'other') m.ships[r.awb] = r;
    const e = led[r.awb] || (led[r.awb] = { first: r.dk, days: {}, branches: [], res: 'other', reply: '', ast: '', com: '', rdt: '', cdt: '', status: '' });
    e.last = r.dk; e.days[r.dk] = 1; e.status = r.status; e.branch = r.branch;
    if (e.branches.indexOf(r.branch) < 0) e.branches.push(r.branch);
    if (r.res !== 'other' || e.res === 'other') e.res = r.res;
    if (norm_(r.reply)) e.reply = String(r.reply).trim();
    if (norm_(r.aStatus)) e.ast = String(r.aStatus).trim();
    if (norm_(r.aComment)) e.com = String(r.aComment).trim();
    const rd = r.replyDt ? dayKey_(r.replyDt) : '';
    if (rd && (!e.rdt || rd < e.rdt)) e.rdt = rd;
    if (norm_(r.aStatus) === CL && !e.cdt) e.cdt = r.closeDt ? dayKey_(r.closeDt) : r.dk;
  });
  const monthlyRows = [];
  Object.keys(months).sort().forEach(mk => {
    const m = months[mk], by = {};
    Object.keys(m.ships).forEach(a => { const s = m.ships[a], o = by[s.branch] || (by[s.branch] = { t: 0, upd: 0, not: 0, other: 0, nr: 0, cf: 0, cl: 0 });
      o.t++; o[s.res]++; if (m.closed[a]) o.cl++; if (!norm_(s.reply)) o.nr++; if (s.res === 'not' && norm_(s.reply) === norm_('تم التحديث')) o.cf++; });
    const dk = Object.keys(m.days).sort();
    Object.keys(by).sort().forEach(b => { const o = by[b]; monthlyRows.push([mk, b, o.t, o.upd, o.not, o.other, o.nr, o.cf, toDate_(dk[dk.length - 1]), dk.length, o.cl]); });
  });
  const LBL = { upd: 'محدّثة', not: 'غير محدّثة', other: 'لم تُراجع' };
  const ledgerRows = [], openRows = [], missRows = [], repRows = [], archRows = [], reopenRows = [];
  Object.keys(led).sort().forEach(a => {
    const e = led[a], closed = norm_(e.ast) === CL;
    const state = closed ? 'مغلقة' : (e.last < maxDay ? (terminal.indexOf(norm_(e.status)) >= 0 ? 'منتهية' : 'مفقودة') : 'مفتوحة');
    const resp = e.rdt ? diffDays_(e.first, e.rdt) : '', clos = (closed && e.cdt) ? diffDays_(e.first, e.cdt) : '';
    const openD = state === 'مفتوحة' ? diffDays_(e.first, maxDay) : 0;
    const md = state === 'مفقودة' ? workDaysAfter_(e.last, maxDay) : [];
    const days = Object.keys(e.days).length, rep = days >= repeatDays ? 'نعم' : 'لا', allB = e.branches.join(' / ');
    ledgerRows.push([a, e.branch, allB, toDate_(e.first), toDate_(e.last), days, e.status, e.reply, LBL[e.res], e.com, e.ast, resp, clos, openD, state, rep, md.length, md.length ? toDate_(md[0]) : '']);
    if (state === 'مفتوحة') openRows.push([a, e.branch, e.status, e.reply, e.com, e.ast, toDate_(e.first), toDate_(e.last), days]);
    if (state === 'مفقودة') missRows.push([a, e.branch, e.status, toDate_(e.last), md.length ? toDate_(md[0]) : '', md.length, e.com, e.reply, e.ast]);
    if (rep === 'نعم') repRows.push([a, days, allB, e.status, toDate_(e.last)]);
    if (state === 'مغلقة') archRows.push([a, e.branch, e.status, e.reply, e.com, e.ast, toDate_(e.first), e.cdt ? toDate_(e.cdt) : '', clos]);
    // [جديد] استثناء: أُغلقت (تم الغلق) ولكنها ظهرت في جرد يوم لاحق ليوم الإغلاق
    if (closed && e.cdt && e.last > e.cdt) reopenRows.push([a, e.branch, e.status, toDate_(e.cdt), toDate_(e.last), diffDays_(e.cdt, e.last), e.reply, e.com, e.ast]);
  });
  const follow = buildFollow_(ledgerRows, maxDay, opts.listLimit || 40);
  follow.kpi.closed_reappeared = reopenRows.length;   // [جديد]
  follow.lists.reappeared = reopenRows.map(x => ({ awb: x[0], branch: x[1], closed_on: dayKey_(x[3]), last_seen: dayKey_(x[4]), days_after: x[5] })).sort((a, b) => b.days_after - a.days_after).slice(0, opts.listLimit || 40);
  return { dailyRows: dailyRows, monthlyRows: monthlyRows, ledgerRows: ledgerRows, openRows: openRows, missRows: missRows, repRows: repRows, archRows: archRows, reopenRows: reopenRows, follow: follow };
}

// ملخص المتابعة للوحة من صفوف سجل الشحنات (أعداد + أرقام قياسية + قوائم اختيارية)
function buildFollow_(L, maxDay, limit) {
  const r1 = x => Math.round(x * 10) / 10, avg = a => a.length ? r1(a.reduce((s, v) => s + v, 0) / a.length) : null, n = L.length;
  const cnt = st => L.filter(x => x[14] === st).length, pct = v => n ? r1(v / n * 100) : 0;
  const resp = L.map(x => x[11]).filter(v => v !== '' && v != null), clos = L.map(x => x[12]).filter(v => v !== '' && v != null);
  const by = {};
  L.forEach(x => { const o = by[x[1]] || (by[x[1]] = { branch: x[1], total: 0, open: 0, closed: 0, missing: 0, ended: 0, repeated: 0, resp: [] });
    o.total++; if (x[14] === 'مفتوحة') o.open++; else if (x[14] === 'مغلقة') o.closed++; else if (x[14] === 'مفقودة') o.missing++; else o.ended++;
    if (x[15] === 'نعم') o.repeated++; if (x[11] !== '' && x[11] != null) o.resp.push(x[11]); });
  const branches = Object.keys(by).sort().map(b => { const o = by[b]; return { branch: o.branch, total: o.total, open: o.open, closed: o.closed, missing: o.missing, ended: o.ended, repeated: o.repeated, avg_resp: avg(o.resp) }; });
  const D = d => (d instanceof Date) ? dayKey_(d) : (d || '');
  const top = (arr, key) => arr.sort((a, b) => b[key] - a[key]).slice(0, limit);
  return {
    asOf: maxDay,
    kpi: { total: n, open: cnt('مفتوحة'), closed: cnt('مغلقة'), missing: cnt('مفقودة'), ended: cnt('منتهية'),
      close_rate: pct(cnt('مغلقة')), missing_rate: pct(cnt('مفقودة')), repeated_rate: pct(L.filter(x => x[15] === 'نعم').length),
      avg_appearances: n ? r1(L.reduce((s, x) => s + x[5], 0) / n) : 0, avg_response_days: avg(resp), avg_close_days: avg(clos),
      oldest_open_days: Math.max(0, ...L.filter(x => x[14] === 'مفتوحة').map(x => x[13])) },
    branches: branches,
    lists: {
      missing: top(L.filter(x => x[14] === 'مفقودة').map(x => ({ awb: x[0], branch: x[1], status: x[6], last_seen: D(x[4]), missing_days: x[16], a_status: x[10] })), 'missing_days'),
      open: top(L.filter(x => x[14] === 'مفتوحة').map(x => ({ awb: x[0], branch: x[1], status: x[6], open_days: x[13], a_status: x[10] })), 'open_days'),
      repeated: top(L.filter(x => x[15] === 'نعم').map(x => ({ awb: x[0], branch: x[1], days: x[5], status: x[6] })), 'days')
    }
  };
}

// الاستيراد: importRows [{awb, reply, comment, astatus, by}], latest: {awb: [rowNumbers]} لآخر يوم جرد
function planImport_(importRows, latest, todayKey, nowStamp) {
  const updates = [], errors = [], actions = [];
  importRows.forEach(r => {
    const awb = String(r.awb || '').trim(); if (!awb) return;
    const rows = latest[awb];
    if (!rows || !rows.length) { errors.push([awb, 'غير موجودة في جرد آخر يوم (لم يُطبَّق الاستيراد)', '']); return; }
    const set = {};
    if (norm_(r.reply)) set.reply = r.reply;
    if (norm_(r.comment)) set.acomment = r.comment;
    if (norm_(r.astatus)) set.astatus = r.astatus;
    if (norm_(r.by)) set.by = r.by;
    if (!Object.keys(set).length) { errors.push([awb, 'صف استيراد بلا أي قيمة', '']); return; }
    if (set.reply) set.rdt = todayKey;
    if (set.astatus && norm_(set.astatus) === norm_(CFG.CLOSED)) set.closedt = todayKey;
    set.edited = nowStamp;
    rows.forEach(row => updates.push({ row: row, set: set }));
    actions.push([nowStamp, awb, 'استيراد', r.by || '', Object.keys(set).filter(k => k !== 'edited').join('، ')]);
  });
  return { updates: updates, errors: errors, actions: actions };
}

// ختم التعديل: يعيد الحقول التي تُكتب بعد تعديل خلية. current: قيم الصف الحالية {rdt, closedt}
function stampPlan_(key, value, current, todayKey, user, nowStamp) {
  if (UN_WATCH.indexOf(key) < 0) return null;
  const set = { by: user || '', edited: nowStamp };
  if (key === 'reply' && norm_(value) && !current.rdt) set.rdt = todayKey;
  if (key === 'astatus' && norm_(value) === norm_(CFG.CLOSED) && !current.closedt) set.closedt = todayKey;
  return set;
}

/* ======================= أدوات الشيت ======================= */
function colMap_(headRow) {
  const idx = {}; headRow.forEach((h, i) => { idx[norm_(h)] = i; });
  const col = {}, missing = [];
  Object.keys(UN_H).forEach(k => { const i = idx[norm_(UN_H[k])]; if (i == null) missing.push(UN_H[k]); else col[k] = i; });
  return { col: col, missing: missing };
}
function lastRow_(sh, c) { const v = sh.getRange(1, c, sh.getMaxRows(), 1).getValues(); for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]).trim() !== '') return i + 1; return 1; }
function nowStamp_() { return new Date(); }
function un_logAction_(ss, rows) { if (!rows.length) return; const sh = ss.getSheetByName(CFG.ACTIONS) || ss.insertSheet(CFG.ACTIONS); sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows); }
function un_logError_(ss, rows) { if (!rows.length) return; const sh = ss.getSheetByName(CFG.ERRORS) || ss.insertSheet(CFG.ERRORS); sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows.map(r => [nowStamp_(), r[0], r[1], r[2] || ''])); }

function fillFormulas() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.DATA), last = lastRow_(sh, 2), first = 25, n = 8;   // الأعمدة الرمادية Y:AF
  if (last < 3) return;
  sh.getRange(3, first, last - 2, n).clearContent();
  sh.getRange(2, first, 1, n).copyTo(sh.getRange(3, first, last - 2, n));
}

function onEditStamp(e) {
  try {
    const sh = e.range.getSheet(); if (sh.getName() !== CFG.DATA || e.range.getRow() < 2) return;
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], cm = colMap_(head), r = e.range.getRow();
    const key = Object.keys(cm.col).filter(k => cm.col[k] === e.range.getColumn() - 1)[0]; if (!key) return;
    const cur = { rdt: sh.getRange(r, cm.col.rdt + 1).getValue(), closedt: sh.getRange(r, cm.col.closedt + 1).getValue() };
    const user = (e.user && e.user.getEmail && e.user.getEmail()) || Session.getActiveUser().getEmail();
    const today = dayKey_(new Date()), set = stampPlan_(key, e.value, cur, today, user, nowStamp_()); if (!set) return;
    Object.keys(set).forEach(k => { sh.getRange(r, cm.col[k] + 1).setValue(k === 'rdt' || k === 'closedt' ? toDate_(set[k]) : set[k]); });
    un_logAction_(SpreadsheetApp.getActive(), [[nowStamp_(), String(sh.getRange(r, cm.col.awb + 1).getValue()), 'تعديل ' + UN_H[key], user, '']]);
  } catch (err) { un_logError_(SpreadsheetApp.getActive(), [['onEditStamp', String(err), '']]); }
}

function applyImport() {
  const ss = SpreadsheetApp.getActive(), imp = ss.getSheetByName(CFG.IMPORT), dsh = ss.getSheetByName(CFG.DATA);
  const ilast = imp.getLastRow(); if (ilast < 5) return;
  const irows = imp.getRange(5, 1, ilast - 4, 5).getValues().map(r => ({ awb: r[0], reply: r[1], comment: r[2], astatus: r[3], by: r[4] }));
  const last = lastRow_(dsh, 2), vals = dsh.getRange(1, 1, last, dsh.getLastColumn()).getValues(), cm = colMap_(vals[0]);
  if (cm.missing.length) { SpreadsheetApp.getUi().alert('أعمدة غير موجودة في الجرد: ' + cm.missing.join('، ')); return; }
  let maxDay = ''; for (let i = 1; i < vals.length; i++) { const k = vals[i][cm.col.date] ? dayKey_(vals[i][cm.col.date]) : ''; if (k > maxDay) maxDay = k; }
  const latest = {}; for (let i = 1; i < vals.length; i++) { if (vals[i][cm.col.date] && dayKey_(vals[i][cm.col.date]) === maxDay) { const a = String(vals[i][cm.col.awb]).trim(); (latest[a] = latest[a] || []).push(i + 1); } }
  const plan = planImport_(irows, latest, dayKey_(new Date()), nowStamp_());
  plan.updates.forEach(u => Object.keys(u.set).forEach(k => { const v = (k === 'rdt' || k === 'closedt') ? toDate_(u.set[k]) : u.set[k]; dsh.getRange(u.row, cm.col[k] + 1).setValue(v); }));
  un_logAction_(ss, plan.actions); un_logError_(ss, plan.errors);
  imp.getRange(5, 1, ilast - 4, 5).clearContent();
  SpreadsheetApp.getUi().alert('تم تطبيق ' + plan.actions.length + ' صف، ورُفض ' + plan.errors.length + ' (راجع سجل_الأخطاء).');
}

function un_writeFollow_(ss, follow) {
  let json = JSON.stringify(follow);
  if (json.length > 48000) { follow = Object.assign({}, follow, { lists: null }); json = JSON.stringify(follow); }   // حد الخلية 50 ألف حرف
  const sh = retry_(() => ss.getSheetByName(CFG.FOLLOW) || ss.insertSheet(CFG.FOLLOW));
  retry_(() => sh.getRange(1, 1, 3, 1).setValues([['ملخص المتابعة (JSON تقرؤه اللوحة، لا تعدّله يدويًا)'], [json], [new Date().toISOString()]]));
}

// [جديد] أوراق المتابعة المشتركة بين المحركين
function un_writeFollowSheets_(ss, o) {
  writeTable_(ss, CFG.OPEN, ['رقم البوليصة', 'الفرع', 'آخر حالة', 'رد الفرع', 'تعليق الأوديت', 'حالة الأوديت', 'أول ظهور', 'آخر ظهور', 'عدد الأيام'], o.openRows, { dates: [7, 8] });
  writeTable_(ss, CFG.MISSING, ['رقم البوليصة', 'آخر فرع', 'آخر حالة', 'آخر يوم ظهرت', 'أول يوم اختفاء', 'عدد الأيام المفقودة', 'تعليق الأوديت', 'رد الفرع', 'حالة الأوديت'], o.missRows, { dates: [4, 5] });
  writeTable_(ss, CFG.REPEATED, ['رقم البوليصة', 'عدد مرات الظهور', 'الفروع', 'آخر حالة', 'آخر ظهور'], o.repRows, { dates: [5] });
  writeTable_(ss, CFG.REOPENED, ['رقم البوليصة', 'الفرع', 'آخر حالة شحنة', 'تاريخ الإغلاق', 'آخر ظهور', 'أيام الظهور بعد الإغلاق', 'رد الفرع', 'تعليق الأوديت', 'حالة الأوديت'], o.reopenRows, { dates: [4, 5] });
}

function un_run_() {
  const ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(CFG.DATA), last = lastRow_(sh, 2); if (last < 2) return;
  const vals = sh.getRange(1, 1, last, sh.getLastColumn()).getValues(), cm = colMap_(vals[0]);
  if (cm.missing.length) throw new Error('أعمدة غير موجودة في ورقة الجرد: ' + cm.missing.join('، '));
  const recs = [];
  for (let r = 1; r < vals.length; r++) { const row = vals[r], awb = String(row[cm.col.awb]).trim(), br = String(row[cm.col.branch]).trim();
    if (!awb || !br || !row[cm.col.date]) continue;
    recs.push({ date: row[cm.col.date], awb: awb, branch: br, res: resultOf_(row[cm.col.result]), reply: row[cm.col.reply], status: row[cm.col.status], aStatus: row[cm.col.astatus], aComment: row[cm.col.acomment], replyDt: row[cm.col.rdt], closeDt: row[cm.col.closedt], cod: row[cm.col.cod] }); }
  const lst = ss.getSheetByName(CFG.LISTS), terminal = lst ? lst.getRange(2, 6, 25, 1).getValues().map(x => x[0]).filter(String) : [];
  const repeatDays = lst ? Number(lst.getRange('I8').getValue()) || 3 : 3;
  const o = buildOutputs_(recs, { terminal: terminal, repeatDays: repeatDays, listLimit: CFG.LIST_LIMIT });
  writeTable_(ss, CFG.SUMMARY, ['التاريخ', 'الفرع', 'الشحنات', 'تم التحديث', 'لم يتم التحديث', 'غير محدد', 'نسبة التحديث %', 'تحصيل غير محدّث', 'بدون رد', 'الورقة المصدر'], o.dailyRows, { dates: [1] });
  writeTable_(ss, CFG.MONTHLY, ['الشهر', 'الفرع', 'الشحنات (فريدة)', 'تم التحديث (أوديت)', 'لم يتم التحديث (أوديت)', 'بدون رد الأوديت', 'بدون رد الفرع', 'تعارض (رد الفرع تم والأوديت لم يتم)', 'آخر جرد', 'أيام الجرد', 'مغلقة (تم الغلق)'], o.monthlyRows, { text: [1], dates: [9] });
  un_writeFollowSheets_(ss, o);
  un_writeFollow_(ss, o.follow);
  un_logAction_(ss, [[nowStamp_(), '', 'تحديث التجميع', Session.getActiveUser().getEmail(), 'شحنات: ' + o.ledgerRows.length + ' | مفتوحة: ' + o.openRows.length + ' | مفقودة: ' + o.missRows.length + ' | مغلقة وظاهرة: ' + o.reopenRows.length]]);
}

/* ============ 7) حذف التابات غير المستخدمة (يشغَّل من القائمة، بعد تأكيد ونسخة احتياطية) ============ */
const UNUSED_TABS = ['ابدأ_هنا', 'الجرد', 'استيراد', 'ملخص_يومي', 'ملخص_شهري', 'تغطية_الأيام', 'الاستثناءات', 'المؤشرات', 'القوائم',
  'سجل_الشحنات', 'الأرشيف', 'سجل_الإجراءات', 'سجل_الأخطاء'];

function removeUnusedTabs() {
  const ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi();
  const found = ss.getSheets().filter(s => UNUSED_TABS.indexOf(s.getName()) >= 0);
  if (!found.length) { ui.alert('لا توجد تابات غير مستخدمة. لا شيء للحذف.'); return; }
  if (found.length >= ss.getSheets().length) { ui.alert('لن يُحذف شيء: سيتبقى الملف بلا أوراق.'); return; }
  const list = found.map(s => '• ' + s.getName() + ' (' + Math.max(0, s.getLastRow() - 1) + ' صف بيانات)').join('\n');
  const msg = 'سيُحذف نهائيًا من «' + ss.getName() + '» هذه التابات فقط:\n' + list +
    '\n\nلن يُمسّ أي تاب يومي ولا تجميع_الجرد ولا تجميع_شهري ولا سجل_التجميع ولا ملخص_المتابعة ولا المفتوحة/المفقودة/المتكررة/مغلقة_وظاهرة.\nسيُعمل نسخة احتياطية في Drive أولًا، وإن تعذّر عملها لن يُحذف شيء. هل تريد المتابعة؟';
  if (ui.alert('حذف التابات غير المستخدمة', msg, ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  let url;
  try {
    url = ss.copy('نسخة احتياطية قبل حذف التابات - ' + ss.getName() + ' - ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm')).getUrl();
  } catch (e) { ui.alert('تعذّر عمل نسخة احتياطية (' + e + '). لم يُحذف شيء.'); return; }
  const done = [], failed = [];
  found.forEach(s => { const n = s.getName(); try { retry_(() => ss.deleteSheet(s)); done.push(n); } catch (e) { failed.push(n + ': ' + e); } });
  ui.alert('تم', 'حُذف ' + done.length + ' تاب.\nالنسخة الاحتياطية: ' + url + (failed.length ? '\n\nتعذّر حذف:\n' + failed.join('\n') : ''), ui.ButtonSet.OK);
}
