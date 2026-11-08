/**
 * فحص هيكل الشيت (بدون بيانات شخصية): لكل ورقة وكل عمود يكتب العنوان وعدد الصفوف المعبّأة وعدد القيم المختلفة،
 * وللأعمدة محدودة القيم (25 قيمة فأقل، مثل الفرع والحالة والرد) يكتب القيم وتكرارها.
 * الأعمدة كثيرة القيم (أسماء، موبايل، أرقام بوليصة) لا تُكتب قيمها.
 * التشغيل: افتح شيت جرد الفروع > Apps Script > الصق الملف > شغّل profileSheet > وافق على الصلاحيات.
 * الناتج: ملف Google Sheets جديد في درايفك باسم «فحص جرد الفروع» (الرابط في سجل التنفيذ).
 */
function profileSheet() {
  const src = SpreadsheetApp.getActiveSpreadsheet();
  const out = [['الورقة', 'ظاهرة؟', 'الصفوف', 'الأعمدة', 'رقم العمود', 'العنوان', 'معبّأ', 'قيم مختلفة', 'القيم (للأعمدة محدودة القيم فقط)']];
  src.getSheets().forEach(sh => {
    const name = sh.getName(), hidden = sh.isSheetHidden() ? 'مخفية' : 'ظاهرة';
    const lr = sh.getLastRow(), lc = sh.getLastColumn();
    if (lr < 1 || lc < 1) { out.push([name, hidden, lr, lc, '', '', '', '', 'فارغة']); return; }
    try {
      const vals = sh.getRange(1, 1, lr, Math.min(lc, 40)).getValues();
      const body = vals.slice(1);
      for (let c = 0; c < vals[0].length; c++) {
        const cnt = {};
        let filled = 0;
        body.forEach(r => {
          const v = r[c];
          if (v === '' || v == null) return;
          filled++;
          const k = v instanceof Date ? 'تاريخ' : String(v).trim().slice(0, 60);
          cnt[k] = (cnt[k] || 0) + 1;
        });
        const keys = Object.keys(cnt);
        let top = '';
        if (body.length > 50 && keys.length > 0 && keys.length <= 25) {
          top = keys.sort((a, b) => cnt[b] - cnt[a]).map(k => k + ' (' + cnt[k] + ')').join(' | ');
        }
        out.push([name, hidden, lr - 1, lc, c + 1, String(vals[0][c]).slice(0, 60), filled, keys.length, top]);
      }
    } catch (e) { out.push([name, hidden, lr, lc, '', '', '', '', 'خطأ: ' + String(e).slice(0, 80)]); }
  });
  const ss = SpreadsheetApp.create('فحص جرد الفروع — ' + Utilities.formatDate(new Date(), src.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm'));
  const sh = ss.getSheets()[0];
  sh.setName('بروفايل');
  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
  sh.setFrozenRows(1);
  Logger.log('تم: ' + ss.getUrl());
}
