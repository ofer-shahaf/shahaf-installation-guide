/*
 * airtable-config.js — הגדרות החיבור ל-Airtable (שיעור 4, משימה 1).
 *
 * ⚠️ הקובץ ציבורי (הריפו והאתר פתוחים לכולם).
 *    לכן ה-Token כאן חייב להיות:
 *      - הרשאת קריאה בלבד (data.records:read)
 *      - מוגבל ל-Base אחד: "מסלול ייצור - דמו"
 *      - על נתונים בדויים בלבד. לעולם לא נתוני לקוחות אמיתיים.
 *
 * כדי לכבות את החיבור: להשאיר token ריק ('').
 * הדשבורד יחזור לנתוני ההדגמה שב-demo.js.
 */
window.AIRTABLE_CONFIG = {
  token: '',https://airtable.com/create/tokens/patE05ETarOjftLNJ                       // ← כאן מדביקים את ה-Token (מתחיל ב-pat)
  baseId: 'app9HQEz0kwaLGtRS',     // מסלול ייצור - דמו

  makers: {
    table: 'tblRHfLGD8mrVWsXh',    // יצרנים
    name: 'fldG6aDb6iFTOUlNs',     // שם יצרן
    country: 'fldnsiruR24cAXB5m',  // מדינה
    powder: 'fldVQlbuxnv5fuFUZ',   // צריך משלוח אבקה
    bars: 'fldiPDI2TXKhl5VjQ'      // צריך משלוח מוטות
  },

  projects: {
    table: 'tblcruf61cBy5JwGx',    // פרויקטים
    client: 'fldqABnk6LnJluEv6',   // לקוח
    caseNum: 'fldXD1RrgVcHECBUA',  // מספר תיק
    type: 'flddzYwKuwS05WHwC',     // סוג פרויקט
    maker: 'fldK7IEAsclxdAASM',    // יצרן (קישור)
    status: 'fld4EudMgNnhvt9Gf',   // סטטוס
    late: 'fldOGFrewVMpuWNg3',     // ימי איחור
    delivery: 'fld0lbgqysokrTRNJ'  // מועד מסירה
  }
};
