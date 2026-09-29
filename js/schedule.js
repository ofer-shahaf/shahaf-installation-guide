/*
 * schedule.js — מנוע לוח הזמנים
 * ------------------------------------------------------------
 * מכיל את שני החלקים שהיו במקור בקוד ה-VBA של קובץ האקסל, בתוספת
 * שתי הרחבות שנדרשו כשהכלי עבר לשמש את קליל:
 *
 *   1. לוגיקת ימי עבודה (chkDate / chkDateRev) — דילוג על סוף שבוע וחגים.
 *      כעת לכל שלב יש לוח חגים משלו: שלב שמתבצע בארץ נעצר בחגי ישראל
 *      והאסלאם, ושלב שממתין לספק בקפריסין נעצר בחגי קפריסין — שם גם
 *      סוף השבוע שונה (שבת־ראשון במקום שישי־שבת).
 *
 *   2. כללי התלות בין המשימות — הזנת תאריך למשימה אחת גוררת חישוב
 *      אוטומטי של תאריכי היעד למשימות שתלויות בה.
 *
 * המרווחים (למשל "+10") הם ימי לוח שנתווספים ואז מעוגלים קדימה ליום
 * העבודה הקרוב — בדיוק כמו במקור.
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

/* ---------- לוחות החגים ---------- */
/*
 * HOLIDAYS_BY_CAL — מפה מקוד לוח (il / is / cy) ל-Set של תאריכי ISO.
 * ALL_CAL_HOLIDAYS — ימים שהוזנו ידנית ותקפים לכל הלוחות.
 * שתיהן ממולאות ע"י app.js דרך setHolidayData().
 */
let HOLIDAYS_BY_CAL = {};   // ממולא ע"י app.js לפי window.CALENDARS
let ALL_CAL_HOLIDAYS = new Set();

function setHolidayData(byCal, allCal) {
  HOLIDAYS_BY_CAL = byCal;
  ALL_CAL_HOLIDAYS = allCal || new Set();
}

/* ברירת מחדל: כל השלבים מתבצעים בארץ. */
const DEFAULT_CALS = ['il', 'is'];

/*
 * isWorkingDay — יום עבודה עבור צירוף לוחות נתון.
 * יום נחשב לא-זמין אם הוא סוף שבוע באחד הלוחות, או חג באחד הלוחות.
 */
function isWorkingDay(d, cals) {
  const list = (cals && cals.length) ? cals : DEFAULT_CALS;
  const w = d.getUTCDay();
  const iso = toISO(d);
  if (ALL_CAL_HOLIDAYS.has(iso)) return false;
  for (let i = 0; i < list.length; i++) {
    const cal = (window.CALENDARS || {})[list[i]];
    if (!cal) continue;
    if (cal.weekend.indexOf(w) !== -1) return false;
    const set = HOLIDAYS_BY_CAL[list[i]];
    if (set && set.has(iso)) return false;
  }
  return true;
}

/*
 * chkDate — מגלגל תאריך קדימה ליום העבודה הקרוב.
 * תואם ל-VBA המקורי, בתוספת בחירת לוח החגים לפי השלב.
 */
function chkDate(d, cals) {
  let r = new Date(d.getTime());
  for (let i = 0; i < 60; i++) {
    if (isWorkingDay(r, cals)) return r;
    r = addDays(r, 1);
  }
  return r;
}

/*
 * chkDateRev — מגלגל תאריך אחורה ליום העבודה הקרוב (משמש למשימות 15 ו-16).
 */
function chkDateRev(d, cals) {
  let r = new Date(d.getTime());
  for (let i = 0; i < 60; i++) {
    if (isWorkingDay(r, cals)) return r;
    r = addDays(r, -1);
  }
  return r;
}

/* ---------- 17 שלבי המסלול ---------- */
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
  'מועד מסירה / התקנה משוער',                      // 17
  'משלוח אבקה לצביעה ליצרן',                       // 18
  'משלוח מוטות אלומיניום להשלמה',                  // 19
  'אריזה והכנסה למכלה',                            // 20
  'תיעוד האריזה',                                  // 21
  'משלוח ימי',                                     // 22
  'פריקה בנמל',                                    // 23
  'פריקה בקליל'                                    // 24
];

const TASK_COUNT = TASK_TEMPLATE.length;   // 24

/*
 * שני השלבים האחרונים אינם המשך הרצף אלא תנאי מקדים לו: קליל שולחת
 * ליצרן החיצוני אבקה לצביעה ומוטות אלומיניום להשלמה, והייצור אינו יכול
 * להתחיל לפני שהמשלוחים הגיעו. הם קיבלו מספרים 18 ו-19 כדי לשמור על
 * ההתאמה למספור שבקובץ האקסל, אך מוצגים במקומם הלוגי — לפני שלב 10.
 */
const SHIPMENT_TASKS = [18, 19];

/*
 * סקופ העבודה מול יצרן חו"ל.
 * ------------------------------------------------------------
 * כשהייצור יוצא מהארץ התהליך אינו זהה לתהליך המקומי בתוספת משלוחים —
 * הוא תהליך אחר ומצומצם. היצרן מבצע את מידות הביצוע, החיתוך, הזמנת
 * הזכוכית והרכבתה, וקליל נשארת עם ההזמנה, החומר שהיא שולחת, הבדיקה
 * וקליטת המשלוח חזרה.
 *
 * OVERSEAS_ONLY — שלבים שקיימים רק בעבודת חו"ל.
 * OVERSEAS_SCOPE — כל השלבים שרלוונטיים בעבודת חו"ל; כל מה שמחוץ
 *                  לרשימה יורד ל'לא רלוונטי' בבחירת יצרן חו"ל.
 */
const OVERSEAS_ONLY  = [18, 19, 20, 21, 22, 23, 24];
const OVERSEAS_SCOPE = [1, 4, 5, 7, 8, 16, 17, 18, 19, 20, 21, 22, 23, 24];

/* מדינות שנחשבות חו"ל לעניין סקופ העבודה */
function isOverseas(country) {
  return !!country && country !== 'il';
}

/* סדר התצוגה: 18 ו-19 משובצים לפני שלב החיתוך */
const DISPLAY_ORDER = [1,2,3,4,5,6,7,8,9,18,19,10,11,12,13,14,15,16,20,21,22,23,24,17];

/* ---------- המודל ההיברידי ---------- */
/*
 * קליל מספקת חלונות, ובעתיד ייתכן שתתקין אותם בעצמה. סוג הפרויקט נבחר
 * בפתיחתו וקובע את שמו של השלב האחרון.
 *
 * naDefault — שלבים שמסומנים "לא רלוונטי" בפתיחת פרויקט חדש, כי הם אינם
 * נדרשים בכל עבודה. אפשר להדליק אותם ידנית בכל פרויקט.
 */
const PROJECT_TYPES = {
  supply: {
    label: 'אספקה בלבד',
    short: 'אספקה',
    task17: 'מועד מסירה משוער',
    naDefault: [2, 3, 12, 18, 19, 20, 21, 22, 23, 24]
  },
  install: {
    label: 'אספקה + התקנה',
    short: 'אספקה + התקנה',
    task17: 'מועד התקנה משוער + תיאומים',
    naDefault: [2, 3, 12, 18, 19, 20, 21, 22, 23, 24]
  }
};
const DEFAULT_TYPE = 'supply';

/* סדר התצוגה של משימות פרויקט */
function orderTasks(tasks) {
  return tasks.slice().sort((a, b) =>
    DISPLAY_ORDER.indexOf(a.n) - DISPLAY_ORDER.indexOf(b.n));
}

/* שמות השלבים עבור סוג פרויקט נתון */
function taskNames(type) {
  const t = PROJECT_TYPES[type] || PROJECT_TYPES[DEFAULT_TYPE];
  const names = TASK_TEMPLATE.slice();
  names[16] = t.task17;
  return names;
}

/* ---------- שיוך לוח חגים לכל שלב ---------- */
/*
 * לוח החגים של שלב נגזר מהגורם שמבצע אותו ומהמקום שבו הוא יושב:
 *
 *   קליל ובנותיה (אלומיניום, פרזול, זכוכית) — בארץ, לכן il + is.
 *   הזמנות, מידות, סקיצות וחתימות — בארץ, il + is.
 *   הייצור עצמו — מועבר ליצרן חיצוני. כשהיצרן בקפריסין, שלבי הייצור
 *   נעצרים בחגי קפריסין ובסוף השבוע שלהם (שבת–ראשון), ולא בחגי ישראל.
 *
 * ברירת המחדל מסמנת את שלבי הייצור (10, 15, 16) גם בקפריסין. שלבים
 * שמבוצעים אצל יצרן בארץ צריכים להישאר il + is בלבד — ניתן לשנות
 * לכל שלב במסך 'כללי חישוב', והשינוי נשמר.
 */
const DEFAULT_TASK_CALS = {};   // ברירת מחדל: הכל בארץ

/*
 * השלבים שמתבצעים אצל היצרן החיצוני — לוקחים את לוח החגים וסוף השבוע
 * של מדינתו במקום לוח ברירת המחדל:
 *   10, 15, 16 — הייצור, ההמשך והבדיקה אצל היצרן.
 *   20, 21, 22 — אריזה, תיעוד ויציאת המשלוח, שכולם מתרחשים בחו"ל.
 * שלבים 23 (פריקה בנמל) ו-24 (פריקה בקליל) נשארים בארץ.
 */
const FACTORY_TASKS = [10, 15, 16, 20, 21, 22];

let TASK_CALS = {};   // ממולא ע"י app.js (ברירת מחדל + התאמות המשתמש)

function setTaskCals(map) {
  TASK_CALS = map || {};
}
/*
 * ACTIVE_COUNTRY — מדינת היצרן של הפרויקט שמחושב כרגע. נקבעת ע"י app.js
 * לפני כל cascade, ומשפיעה רק על השלבים שמתבצעים אצל היצרן.
 */
let ACTIVE_COUNTRY = null;
function setActiveCountry(code) { ACTIVE_COUNTRY = code || null; }

function calsFor(n) {
  if (TASK_CALS[n]) return TASK_CALS[n];                 // בחירה ידנית גוברת
  if (ACTIVE_COUNTRY && FACTORY_TASKS.indexOf(n) !== -1) {
    const c = (window.COUNTRY_CALS || {})[ACTIVE_COUNTRY];
    if (c) return c.cals;
  }
  return DEFAULT_TASK_CALS[n] || DEFAULT_CALS;
}

/* ---------- מרווחי הימים בין השלבים ---------- */
/*
 * כל גזירה היא "שלב היעד = שלב הבסיס + מספר ימים", ואז עיגול ליום עבודה.
 * המספרים הועתקו במקור מקובץ האקסל, אך הם אינם קבועים בקוד: כל אחד מהם
 * ניתן לעריכה במסך 'כללי חישוב', והשינוי נשמר ומשפיע על כל חישוב הבא.
 *
 * המפתח הוא "יעד<-בסיס". ערך שלילי = חישוב אחורה מהבסיס.
 */
const GAP_DEFAULTS = {
  '21<-20': 3,    // אריזה למכלה (3 ימים) → תיעוד
  '22<-21': 1,    // תיעוד (1 יום) → משלוח ימי
  '23<-22': 8,    // משלוח ימי (8 ימים) → פריקה בנמל
  '24<-23': 1,    // פריקה בנמל (1 יום) → פריקה בקליל
  '4<-1':   4,    // חתימת לקוח → חתימה על סקיצות
  '6<-4':   1,    // סקיצות → ליקוט פירזול
  '3<-2':   10,   // הזמנת מ. עיוור → התקנת מ. עיוור
  '7<-5':   1,    // מידות → הזמנת אלומיניום
  '8<-7':   10,   // הזמנה → קבלת אלומיניום
  '10<-8':  1,    // קבלה → חיתוך
  '11<-10': 2,    // חיתוך → הזמנת חוסרים
  '13<-9':  1,    // מידות ביצוע → הזמנת זכוכית
  '14<-13': 3,    // הזמנה → קבלת זכוכית
  '16<-17': -2,   // מסירה → פריסה ובדיקה (אחורה)
  '15<-17': -3    // מסירה → המשך היצור (אחורה)
};

let GAPS = Object.assign({}, GAP_DEFAULTS);
function setGaps(overrides) {
  GAPS = Object.assign({}, GAP_DEFAULTS, overrides || {});
}
function gapOf(key) {
  return (GAPS[key] !== undefined && GAPS[key] !== null) ? Number(GAPS[key]) : 0;
}

/*
 * שרשרת הגזירה לכל שלב שמפעיל חישוב. כל איבר הוא [יעד, בסיס], והמרווח
 * נלקח מ-GAPS לפי המפתח "יעד<-בסיס". הסדר חשוב — שלב נגזר עשוי לשמש
 * בסיס לשלב הבא אחריו בשרשרת.
 */
const CHAINS = {
  1:  [[4, 1], [6, 4]],
  20: [[21, 20], [22, 21], [23, 22], [24, 23]],
  21: [[22, 21], [23, 22], [24, 23]],
  22: [[23, 22], [24, 23]],
  23: [[24, 23]],
  2:  [[3, 2]],
  4:  [[6, 4]],
  5:  [[7, 5], [8, 7], [10, 8], [11, 10]],
  8:  [[10, 8]],
  9:  [[13, 9], [14, 13]],
  10: [[11, 10]],
  13: [[14, 13]],
  17: [[16, 17], [15, 17]]
};

/*
 * cascade — מנוע התלות.
 * קלט:
 *   dates    — מערך של 19 איברים; כל איבר הוא מחרוזת ISO או null.
 *   changed  — מספר המשימה שהשתנתה (1..19).
 * פלט: מערך חדש של 19 תאריכים לאחר החישוב.
 *
 * הלוגיקה זהה למקור שב-VBA, בשלושה הבדלים: המרווחים נקראים מטבלה
 * ולא מהקוד, כל עיגול ליום עבודה נעשה לפי לוח החגים של אותו שלב,
 * ושלבי המשלוח 18 ו-19 חוסמים את תחילת הייצור.
 */
function cascade(dates, changed) {
  const N = TASK_COUNT;
  const t = [null];
  for (let i = 0; i < N; i++) t.push(dates[i] ? fromISO(dates[i]) : null);

  const has = i => t[i] instanceof Date && !isNaN(t[i]);

  if (!has(changed)) {
    const out = [];
    for (let i = 1; i <= N; i++) out.push(has(i) ? toISO(t[i]) : (dates[i - 1] || null));
    return out;
  }

  // השלב שהשתנה עצמו מתעגל ליום עבודה לפי הלוח שלו
  t[changed] = chkDate(t[changed], calsFor(changed));

  // שלבי המשלוח מתעגלים ללוח של היצרן, כי הם מתרחשים אצלו
  if (SHIPMENT_TASKS.indexOf(changed) !== -1) {
    t[changed] = chkDate(t[changed], calsFor(10));
  }

  (CHAINS[changed] || []).forEach(pair => {
    const target = pair[0], base = pair[1];
    if (!has(base)) return;
    const gap = gapOf(target + '<-' + base);
    const raw = addDays(t[base], gap);
    t[target] = gap < 0 ? chkDateRev(raw, calsFor(target)) : chkDate(raw, calsFor(target));
  });

  /*
   * שערי המשלוח: הייצור (שלב 10) אינו יכול להתחיל לפני שהאבקה ומוטות
   * ההשלמה הגיעו ליצרן. אם אחד המשלוחים מאוחר יותר מהתאריך שחושב
   * לשלב 10 — השלב נדחף קדימה, ואיתו הזמנת החוסרים שנגזרת ממנו.
   */
  if (has(10)) {
    let gate = t[10];
    SHIPMENT_TASKS.forEach(s => { if (has(s) && t[s] > gate) gate = t[s]; });
    if (gate > t[10]) {
      t[10] = chkDate(gate, calsFor(10));
      if (has(11)) {
        t[11] = chkDate(addDays(t[10], gapOf('11<-10')), calsFor(11));
      }
    }
  }

  const out = [];
  for (let i = 1; i <= N; i++) out.push(has(i) ? toISO(t[i]) : (dates[i - 1] || null));
  return out;
}

/*
 * earliestDelivery — המועד המוקדם ביותר שבו אפשר למסור, בהינתן
 * התאריכים שכבר הוזנו.
 * ------------------------------------------------------------
 * שלב 15 (המשך הייצור) נגזר אחורה מהמסירה, ולכן הוא חייב ליפול אחרי
 * כל שלב שמתבצע לפניו. מכאן שהמסירה אינה יכולה להיות מוקדמת מהשלב
 * המאוחר ביותר שכבר נקבע, בתוספת המרווח האחורי.
 *
 * מחזיר מחרוזת ISO, או null כשאין עדיין ממה להיגזר.
 */
function earliestDelivery(dates) {
  const BACKWARD = [15, 16, 17];        // אלה נגזרים מהמסירה עצמה
  let latest = null;
  for (let n = 1; n <= TASK_COUNT; n++) {
    if (BACKWARD.indexOf(n) !== -1) continue;
    const iso = dates[n - 1];
    if (!iso) continue;
    if (!latest || iso > latest) latest = iso;
  }
  if (!latest) return null;
  const back = Math.abs(gapOf('15<-17'));
  return toISO(chkDate(addDays(fromISO(latest), back), calsFor(17)));
}

/* טבלת התלות — נגזרת מהשרשראות, כדי שהתצוגה לא תוכל להתנתק מהמנוע */
const DEPENDENCY_RULES = (function () {
  const seen = {}, out = [];
  Object.keys(CHAINS).forEach(trig => {
    CHAINS[trig].forEach(pair => {
      const key = pair[0] + '<-' + pair[1];
      if (seen[key]) return;
      seen[key] = true;
      out.push({ key: key, from: pair[1], to: pair[0] });
    });
  });
  return out;
})();

/* חסימות — לתצוגה בלבד, אין להן מרווח לעריכה */
const BLOCKING_RULES = [
  { from: 18, to: 10, note: 'הייצור לא מתחיל לפני שהאבקה הגיעה' },
  { from: 19, to: 10, note: 'הייצור לא מתחיל לפני שהמוטות הגיעו' }
];
