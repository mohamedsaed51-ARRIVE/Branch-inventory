/**
 * تجميع جرد الفروع — يقرأ كل ورقة يوم (مثل 1/11 أو 31-10 أو 30-9)
 * ويكتب ورقة "تجميع_الجرد": صف لكل (تاريخ + فرع).
 * يعاد بناء التجميع بالكامل في كل تشغيل، فلا توجد تكرارات، وأي تعديل متأخر في ورقة يوم ينعكس.
 * الأوراق الجديدة تُلتقط تلقائيًا حسب اسمها. الأعمدة تُطابق بعناوينها لا بأماكنها.
 */
const CFG = {
  SUMMARY: 'تجميع_الجرد',
  LOG: 'سجل_التجميع',
  RECENT_DAYS: 7,      // الأوراق الأحدث من كده تُعاد قراءتها في كل تحديث، والأقدم تُؤخذ من التجميع السابق
  EVERY_HOURS: 1,      // التحديث التلقائي كل كام ساعة
  AGED_DAYS: 7         // افتراض للعرض: الأوردر الأقدم من كده (من تاريخ استلام البيك أب حتى تاريخ ورقة الجرد) يُحسب متأخرًا. يحتاج اعتماد SOP
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
    pickup: find(x => x.indexOf('استلام') !== -1),
    status: find(x => x.indexOf('حال') === 0),
    comment: find(x => x.indexOf('تعليق') !== -1 || x.indexOf('تعيق') !== -1 || x.indexOf('الاوديت') !== -1)
  };
}

function branchName_(v) {
  return normAr_(v).replace(/^فرع\s*/, '');
}

function parseDay_(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = String(v == null ? '' : v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

// يعالج مصفوفة قيم ورقة واحدة (الصف الأول عناوين). مفصولة للاختبار.
function summarizeSheet_(vals, dt) {
  const idx = findCols_(vals[0]);
  if (idx.branch < 0 || idx.comment < 0) return { error: 'لم أجد عمود الفرع أو التعليق', idx: idx };
  const by = {}, seen = {};
  let dup = 0;
  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    const awb = idx.awb >= 0 ? String(row[idx.awb]).trim() : '';
    const br = branchName_(row[idx.branch]);
    if (!awb || !br) continue;
    if (seen[awb]) { dup++; continue; }
    seen[awb] = 1;
    const o = by[br] || (by[br] = { total: 0, upd: 0, not: 0, other: 0, codNot: 0, noReply: 0, returns: 0, aged: 0, noPickup: 0 });
    const k = classify_(row[idx.comment]);
    o.total++; o[k]++;
    if (k === 'not' && idx.cod >= 0) {
      const cod = Number(row[idx.cod]);
      if (cod > 0) o.codNot += cod;
    }
    if (idx.reply >= 0 && !String(row[idx.reply]).trim()) o.noReply++;
    if (idx.status >= 0 && normAr_(row[idx.status]).indexOf('مرتجعات') !== -1) o.returns++;
    const pk = idx.pickup >= 0 ? parseDay_(row[idx.pickup]) : null;
    if (!pk) o.noPickup++;
    else if (dt && Math.round((dt.getTime() - pk.getTime()) / 864e5) >= CFG.AGED_DAYS) o.aged++;
  }
  return { by: by, dup: dup, idx: idx };
}

/* ---------- التشغيل ---------- */
function buildAuditSummary(full) {
  full = (full === true);  // المشغّلات تمرر كائنًا، فلا يُعتبر إعادة بناء كاملة
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try { run_(full); } finally { lock.releaseLock(); }
}

function run_(full) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = new Date();
  const out = [], log = [];

  // صفوف التجميع السابق مجمعة باسم الورقة المصدر
  const prev = {};
  const old = ss.getSheetByName(CFG.SUMMARY);
  if (!full && old && old.getLastRow() > 1 && old.getLastColumn() >= 13) {  // تجميع قديم بأعمدة أقل يُعاد بناؤه
    old.getRange(2, 1, old.getLastRow() - 1, 13).getValues().forEach(r => {
      const k = String(r[12]).trim();
      (prev[k] = prev[k] || []).push(r);
    });
  }

  ss.getSheets().forEach(sh => {
    const name = sh.getName();
    if (name === CFG.SUMMARY || name === CFG.LOG) return;
    const dt = sheetDate_(name, today);
    if (!dt) { log.push([name, 'تجاهل', 'ليست ورقة يوم']); return; }
    const key = name.trim();
    const hidden = sh.isSheetHidden() ? 'مخفية | ' : '';
    const ageDays = (today.getTime() - dt.getTime()) / 864e5;

    if (!full && ageDays > CFG.RECENT_DAYS && prev[key]) {
      prev[key].forEach(r => out.push(r));
      log.push([name, 'من التجميع السابق', hidden.replace(' | ', '')]);
      return;
    }

    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2) { log.push([name, 'فارغة', hidden.replace(' | ', '')]); return; }
    const vals = sh.getRange(1, 1, lastRow, Math.min(lastCol, 40)).getValues();
    const res = summarizeSheet_(vals, dt);
    if (res.error) { log.push([name, 'خطأ', hidden + res.error]); return; }
    const notes = [];
    if (res.dup) notes.push('شحنات مكررة تم تجاهلها: ' + res.dup);
    let tot = 0, oth = 0;
    Object.keys(res.by).forEach(br => {
      const o = res.by[br];
      tot += o.total; oth += o.other;
      out.push([dt, br, o.total, o.upd, o.not, o.other,
        o.total ? Math.round(o.upd / o.total * 1000) / 10 : 0,
        o.codNot, o.noReply, o.returns, o.aged, o.noPickup, key]);
    });
    if (tot && oth === tot) notes.push('كل الشحنات بلا نتيجة جرد (لم يبدأ الجرد أو عمود التعليق فارغ)');
    if (res.idx.reply < 0) notes.push('عمود رد الفرع غير موجود');
    if (res.idx.pickup < 0) notes.push('عمود تاريخ الاستلام غير موجود (العمر غير محسوب)');
    if (res.idx.status < 0) notes.push('عمود حالة الشحنة غير موجود');
    log.push([name, 'تمت', hidden + 'شحنات: ' + tot + (notes.length ? ' | ' + notes.join(' | ') : '')]);
  });

  out.sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1]), 'ar'));

  const head = ['التاريخ', 'الفرع', 'الشحنات', 'تم التحديث', 'لم يتم التحديث', 'غير محدد',
    'نسبة التحديث %', 'تحصيل غير محدّث', 'بدون رد', 'مرتجعات', 'متأخرة (عمر الأوردر)', 'بدون تاريخ استلام', 'الورقة المصدر'];
  const sum = ss.getSheetByName(CFG.SUMMARY) || ss.insertSheet(CFG.SUMMARY);
  sum.clear();
  sum.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (out.length) {
    sum.getRange(2, 1, out.length, head.length).setValues(out);
    sum.getRange(2, 1, out.length, 1).setNumberFormat('yyyy-mm-dd');
  }
  sum.setFrozenRows(1);

  const lg = ss.getSheetByName(CFG.LOG) || ss.insertSheet(CFG.LOG);
  lg.clear();
  lg.getRange(1, 1, 1, 4).setValues([['الورقة', 'الحالة', 'ملاحظات',
    'آخر تشغيل ' + Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') + (full ? ' (كامل)' : ' (سريع)')]]).setFontWeight('bold');
  if (log.length) lg.getRange(2, 1, log.length, 3).setValues(log);
}
