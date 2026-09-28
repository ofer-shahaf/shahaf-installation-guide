/*
 * schedule.js — מנוע לוח הזמנים
 * ------------------------------------------------------------
 * מכיל את שני החלקים שהיו במקור בקוד ה-VBA של קובץ האקסל:
 *
 *   1. לוגיקת ימי עבודה (chkDate / chkDateRev) — דילוג על שישי, שבת וחגים.
 *   2. כללי התלות בין המשימות — הזנת תאריך למשימה אחת גוררת חישוב
 *      אוטומטי של תאריכי היעד למשימות שתלויות בה.
 *
 * שבוע העבודה: ראשון–חמישי. המרווחים (למשל "+10") הם ימי לוח שנתווספים
 * ואז מעוגלים קדימה ליום העבודה הקרוב — בדיוק כמו במקור.
 * ------------------------------------------------------------
 */

/* ---------- עזרי תאריך (עובדים ב-UTC כדי להימנע מבעיות אזור זמן) ---------- */

function toISO(d) {
  return d.toISOString().slice(0, 10);
}
function fromISO(iso) {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}
function addDays(d, n) {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
// getUTCDay(): 0=ראשון ... 5=שישי, 6=שבת
function isWeekend(d) {
  const w = d.getUTCDay();
  return w === 5 || w === 6; // שישי או שבת
}

/* ---------- לוח החגים ---------- */
// מתמזג: ברירת מחדל (holidays.js) + תוספות המשתמש − הסרות המשתמש.
// getHolidaySet() מוגדר ב-app.js ומחזיר Set של מחרוזות ISO.
// כאן שומרים הפניה שממולאת ע"י app.js.
let HOLIDAY_SET = new Set((window.DEFAULT_HOLIDAYS || []).map(h => h.date));

function setHolidaySet(isoSet) {
  HOLIDAY_SET = isoSet;
}
function isHoliday(d) {
  return HOLIDAY_SET.has(toISO(d));
}
function isWorkingDay(d) {
  return !isWeekend(d) && !isHoliday(d);
}

/*
 * chkDate — מגלגל תאריך קדימה ליום העבודה הקרוב.
 * תואם ל-VBA:  if Weekday(dt) > 5 then dt = dt + 8 - Weekday(dt)
 * ואז לולאה שמדלגת על חגים וסופי שבוע.
 */
function chkDate(d) {
  let r = new Date(d.getTime());
  if (isWeekend(r)) {
    // דחיפה לראשון
    while (isWeekend(r)) r = addDays(r, 1);
  }
  for (let i = 0; i < 40; i++) {
    if (isWorkingDay(r)) return r;
    r = addDays(r, 1);
  }
  return r;
}

/*
 * chkDateRev — מגלגל תאריך אחורה ליום העבודה הקרוב (משמש רק למשימה 17).
 */
function chkDateRev(d) {
  let r = new Date(d.getTime());
  if (isWeekend(r)) {
    while (isWeekend(r)) r = addDays(r, -1);
  }
  for (let i = 0; i < 40; i++) {
    if (isWorkingDay(r)) return r;
    r = addDays(r, -1);
  }
  return r;
}

/* ---------- 17 שלבי מסלול ההתקנה (זהה לתבנית שבאקסל) ---------- */
const TASK_TEMPLATE = [
  'חתימת לקוח',                                   // 1
  'הזמנת מ. עיוור',                                // 2
  'התקנת מ. עיוור',                               // 3
  'חתימה על סקיצות',                              // 4
  'מידות להזמנת אלומיניום',                        // 5
  'ליקוט פירזול והשלמת הזמנת הפירזול',            // 6
  'הזמנת אלומיניום',                              // 7
  'קבלת אלומיניום',                               // 8
  'מידות ביצוע',                                  // 9
  'חיתוך כל האלומיניום',                          // 10
  'הזמנת חוסרים לאלומיניום',                      // 11
  'הזמנה מספק נוסף',                              // 12
  'הזמנת זכוכית',                                 // 13
  'קבלת זכוכית',                                  // 14
  'המשך היצור קבלת זכוכית וקבלת חוסרים אחרים',    // 15
  'פריסה ובדיקה של כל העבודה',                     // 16
  'מועד ההתקנה + תיאומים'                          // 17
];

/*
 * cascade — מנוע התלות.
 * קלט:
 *   dates    — מערך של 17 איברים; כל איבר הוא מחרוזת ISO או null.
 *   changed  — מספר המשימה שהשתנתה (1..17).
 * פלט: מערך חדש של 17 תאריכים לאחר החישוב.
 *
 * הכללים הועתקו אחד-לאחד מ-Worksheet_Change שבקובץ המקורי.
 * אינדקסים כאן הם 1-מבוססים (t[1]..t[17]) לצורך קריאוּת מול המקור.
 */
function cascade(dates, changed) {
  // t[1..17] כאובייקטי Date או null
  const t = [null];
  for (let i = 0; i < 17; i++) t.push(dates[i] ? fromISO(dates[i]) : null);

  const has = i => t[i] instanceof Date && !isNaN(t[i]);
  const set = (i, d) => { t[i] = d; };

  switch (changed) {
    case 1: // חתימת לקוח
      if (has(1)) {
        set(1, chkDate(t[1]));
        set(4, chkDate(addDays(t[1], 4)));   // חתימה על סקיצות = +4
        set(6, chkDate(addDays(t[4], 1)));   // ליקוט פירזול   = סקיצות +1
      }
      break;

    case 2: // הזמנת מ. עיוור
      if (has(2)) {
        set(2, chkDate(t[2]));
        set(3, chkDate(addDays(t[2], 10)));  // התקנת מ. עיוור = +10
      }
      break;

    case 4: // חתימה על סקיצות
      if (has(4)) {
        set(4, chkDate(t[4]));
        set(6, chkDate(addDays(t[4], 1)));   // ליקוט פירזול = +1
      }
      break;

    case 5: // מידות להזמנת אלומיניום
      if (has(5)) {
        set(5, chkDate(t[5]));
        set(7, chkDate(addDays(t[5], 1)));   // הזמנת אלומיניום = +1
        set(8, chkDate(addDays(t[7], 10)));  // קבלת אלומיניום  = הזמנה +10
        set(10, chkDate(addDays(t[8], 1)));  // חיתוך          = קבלה +1
        set(11, chkDate(addDays(t[10], 2))); // הזמנת חוסרים    = חיתוך +2
      }
      break;

    case 8: // קבלת אלומיניום
      if (has(8)) {
        set(8, chkDate(t[8]));
        set(10, chkDate(addDays(t[8], 1)));  // חיתוך = +1
      }
      break;

    case 9: // מידות ביצוע
      if (has(9)) {
        set(9, chkDate(t[9]));
        set(13, chkDate(addDays(t[9], 1)));  // הזמנת זכוכית = +1
        set(14, chkDate(addDays(t[13], 3))); // קבלת זכוכית  = הזמנה +3
      }
      break;

    case 10: // חיתוך כל האלומיניום
      if (has(10)) {
        set(10, chkDate(t[10]));
        set(11, chkDate(addDays(t[10], 2))); // הזמנת חוסרים = +2
      }
      break;

    case 13: // הזמנת זכוכית
      if (has(13)) {
        set(13, chkDate(t[13]));
        set(14, chkDate(addDays(t[13], 3))); // קבלת זכוכית = +3
      }
      break;

    case 17: // מועד ההתקנה — חישוב אחורה
      if (has(17)) {
        set(17, chkDate(t[17]));
        set(16, chkDateRev(addDays(t[17], -2))); // פריסה ובדיקה = −2
        set(15, chkDateRev(addDays(t[17], -3))); // המשך היצור   = −3
      }
      break;

    default:
      // משימות 3, 6, 7, 11, 12, 14, 15, 16 — הזנה בלבד, אין גזירה.
      // עדיין מגלגלים ליום עבודה כמו במקור.
      if (has(changed)) set(changed, chkDate(t[changed]));
      break;
  }

  // חזרה למערך ISO בן 17 איברים
  const out = [];
  for (let i = 1; i <= 17; i++) out.push(has(i) ? toISO(t[i]) : (dates[i - 1] || null));
  return out;
}

/* טבלת התלות — לתצוגה בלבד (מסך "כללי חישוב") */
const DEPENDENCY_RULES = [
  { from: 1, to: 4, gap: '+4' },
  { from: 1, to: 6, gap: 'סקיצות +1' },
  { from: 2, to: 3, gap: '+10' },
  { from: 4, to: 6, gap: '+1' },
  { from: 5, to: 7, gap: '+1' },
  { from: 5, to: 8, gap: 'הזמנה +10' },
  { from: 5, to: 10, gap: 'קבלה +1' },
  { from: 5, to: 11, gap: 'חיתוך +2' },
  { from: 8, to: 10, gap: '+1' },
  { from: 9, to: 13, gap: '+1' },
  { from: 9, to: 14, gap: 'הזמנה +3' },
  { from: 10, to: 11, gap: '+2' },
  { from: 13, to: 14, gap: '+3' },
  { from: 17, to: 16, gap: '−2 (אחורה)' },
  { from: 17, to: 15, gap: '−3 (אחורה)' }
];
