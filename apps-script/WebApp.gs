/**
 * يعرض ورقة "تجميع_الجرد" كـ JSON للوحة (تجميع فقط، بدون بيانات شحنات أو عملاء).
 * النشر: نشر > نشر كتطبيق ويب > تنفيذ باسمي > الوصول: أي شخص.
 * اختياري: خصائص السكريبت (Project Settings > Script properties) أضف DATA_TOKEN لطلب ?token=
 */
function doGet(e) {
  const need = PropertiesService.getScriptProperties().getProperty('DATA_TOKEN');
  if (need && (!e || !e.parameter || e.parameter.token !== need)) return json_({ error: 'unauthorized' });
  const sh = SpreadsheetApp.getActive().getSheetByName(CFG.SUMMARY);
  if (!sh || sh.getLastRow() < 2) return json_({ rows: [] });
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues().map(r => ({
    date: Utilities.formatDate(new Date(r[0]), tz, 'yyyy-MM-dd'),
    branch: r[1], total: r[2], upd: r[3], not_upd: r[4], other: r[5],
    rate: r[6], cod_not: r[7], no_reply: r[8], returns: r[9], aged: r[10], no_pickup: r[11], source: String(r[12])
  }));
  return json_({ rows: rows, generated: new Date().toISOString() });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
