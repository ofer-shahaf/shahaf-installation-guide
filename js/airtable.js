/*
 * airtable.js — טעינת יצרנים ופרויקטים מ-Airtable דרך ה-API (קריאה בלבד).
 *
 * איך זה עובד:
 *   1. אם יש Token ב-airtable-config.js והדף פתוח ב-GitHub Pages
 *      (או עם ?airtable=1 בכתובת), שולפים את שתי הטבלאות.
 *   2. הנתונים מומרים לאותו מבנה של demo.js (window.DEMO),
 *      כך שמנוע התאריכים בונה מהם את כל 24 השלבים כרגיל.
 *   3. app.js מחכה ל-window.AT_READY לפני שהוא מצייר את המסך.
 *   כל כשל (אין רשת, Token שגוי) → חוזרים בשקט לנתוני demo.js ומציגים הודעה.
 */
(function () {
  const C = window.AIRTABLE_CONFIG || {};
  const API = 'https://api.airtable.com/v0/';
  const COUNTRY = { 'ישראל': 'il', 'קפריסין': 'cy', 'בלגיה': 'be' };
  const MODE = { 'הושלם': 'done', 'באיחור': 'late', 'בזמן': 'ontime' };
  const TYPE = { 'אספקה בלבד': 'supply', 'אספקה והתקנה': 'install' };

  window.AT_STATUS = { active: false, ok: false, count: 0, error: '' };

  /* המפתח: או מהקובץ airtable-config.js, או כזה שהמשתמש שמר בדפדפן שלו (מסך פרויקטים ← Airtable) */
  const LS_TOKEN = 'shachaf_airtable_token_v1';
  let localToken = '';
  try { localToken = localStorage.getItem(LS_TOKEN) || ''; } catch (e) {}
  const TOKEN = localToken || C.token || '';
  window.AT_HAS_LOCAL_TOKEN = !!localToken;

  function enabled() {
    if (!TOKEN || !C.baseId) return false;
    if (localToken) return true;                    // מפתח שנשמר בדפדפן עובד מכל מקום
    const onPages = /github\.io$/.test(location.hostname || '');
    const forced = /[?&]airtable=1\b/.test(location.search);
    return onPages || forced;
  }

  /* שליפת כל הרשומות בטבלה, כולל דפדוף (Airtable מחזיר עד 100 בכל פעם) */
  async function fetchAll(table) {
    const rows = [];
    let offset = '';
    do {
      const url = API + C.baseId + '/' + table +
        '?returnFieldsByFieldId=true&pageSize=100' +
        (offset ? '&offset=' + encodeURIComponent(offset) : '');
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
      if (!res.ok) throw new Error('Airtable החזיר שגיאה ' + res.status);
      const data = await res.json();
      rows.push.apply(rows, data.records || []);
      offset = data.offset || '';
    } while (offset);
    return rows;
  }

  /* כמה ימים בין היום לתאריך (שלילי = עבר) */
  function daysFromToday(iso) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const d = new Date(iso + 'T00:00:00');
    return Math.round((d - t) / 86400000);
  }

  async function loadFromAirtable() {
    const M = C.makers, P = C.projects;
    const [mRows, pRows] = await Promise.all([fetchAll(M.table), fetchAll(P.table)]);

    const makers = mRows.map(r => ({
      id: r.id,
      name: r.fields[M.name] || '',
      country: COUNTRY[r.fields[M.country]] || 'il',
      needPowder: !!r.fields[M.powder],
      needBars: !!r.fields[M.bars]
    }));

    // אותו מבנה כמו demo.js: [לקוח, יצרן, סטטוס, ימי איחור, מסירה ביחס להיום, מספר תיק, סוג]
    const projects = pRows
      .filter(r => r.fields[P.client] && r.fields[P.delivery])
      .map(r => [
        r.fields[P.client],
        (r.fields[P.maker] || [])[0] || '',
        MODE[r.fields[P.status]] || 'ontime',
        Number(r.fields[P.late]) || 0,
        daysFromToday(r.fields[P.delivery]),
        r.fields[P.caseNum] || '',
        TYPE[r.fields[P.type]] || ''
      ]);

    window.DEMO = { makers: makers, projects: projects };
    window.DEMO_SOURCE = 'airtable';
    window.AT_STATUS = { active: true, ok: true, count: projects.length, error: '' };
  }

  window.AT_READY = enabled()
    ? loadFromAirtable().catch(err => {
        if (window.console) console.error('טעינה מ-Airtable נכשלה:', err);
        window.AT_STATUS = { active: true, ok: false, count: 0, error: String(err.message || err) };
      })
    : Promise.resolve();
})();
