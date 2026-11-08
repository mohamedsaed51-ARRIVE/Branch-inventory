/**
 * يعرض أوراق "تجميع_الجرد" و"تجميع_شهري" و"تجميع_تفصيلي" كـ JSON للوحة (تجميع فقط، بدون بيانات شحنات أو عملاء).
 * النشر: نشر > نشر كتطبيق ويب > تنفيذ باسمي > الوصول: أي شخص.
 * اختياري: خصائص السكريبت (Project Settings > Script properties) أضف DATA_TOKEN لطلب ?token=
 */
const REFRESH_MIN_SECONDS = 60;

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const need = props.getProperty('DATA_TOKEN');
  if (need && (!e || !e.parameter || e.parameter.token !== need)) return json_({ error: 'unauthorized' });
  // ?refresh=1 : يعيد التجميع قبل الإرجاع (زر «تحديث» في اللوحة). الحد الأدنى بين تحديثين REFRESH_MIN_SECONDS لمنع الضغط.
  let refreshed = false, note = '';
  if (e && e.parameter && e.parameter.refresh === '1') {
    const last = Number(props.getProperty('LAST_REFRESH') || 0);
    if (Date.now() - last < REFRESH_MIN_SECONDS * 1000) note = 'throttled';
    else {
      props.setProperty('LAST_REFRESH', String(Date.now()));
      refreshed = buildAuditSummary();   // true = تم، false = تجميع آخر شغال
      if (!refreshed) note = 'busy';
    }
  }
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.SUMMARY);
  const meta = { generated: new Date().toISOString(), built: props.getProperty('LAST_BUILD') || '', refreshed: refreshed, note: note };
  if (!sh || sh.getLastRow() < 2) return json_(Object.assign({ rows: [], monthly: [], detail: [], detail_cols: DETAIL_COLS }, meta));
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues().map(r => ({
    date: Utilities.formatDate(new Date(r[0]), tz, 'yyyy-MM-dd'),
    branch: r[1], total: r[2], upd: r[3], not_upd: r[4], other: r[5],
    rate: r[6], cod_not: r[7], no_reply: r[8], source: String(r[9])
  }));
  const ms = SpreadsheetApp.getActive().getSheetByName(CFG.MONTHLY);
  const monthly = (ms && ms.getLastRow() > 1) ? ms.getRange(2, 1, ms.getLastRow() - 1, 10).getValues().map(r => ({
    month: String(r[0]).trim(), branch: r[1], total: r[2], upd: r[3], not_upd: r[4], no_audit: r[5],
    no_branch_reply: r[6], conflict: r[7], last: Utilities.formatDate(new Date(r[8]), tz, 'yyyy-MM-dd'), days: r[9]
  })) : [];
  // التفصيلي كمصفوفات (أخف حجمًا): الأعمدة في detail_cols. التاريخ ثم الفرع ثم المجموعة ثم الأرقام.
  const ds = SpreadsheetApp.getActive().getSheetByName(CFG.DETAIL);
  const detail = (ds && ds.getLastRow() > 1) ? ds.getRange(2, 1, ds.getLastRow() - 1, DETAIL_COLS.length).getValues().map(r => {
    r[0] = Utilities.formatDate(new Date(r[0]), tz, 'yyyy-MM-dd');
    return r;
  }) : [];
  return json_(Object.assign({ rows: rows, monthly: monthly, detail: detail, detail_cols: DETAIL_COLS }, meta));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
