/*
 * app.js — לוגיקת האפליקציה: מצב, שמירה, רינדור ואירועים.
 * ------------------------------------------------------------
 * מסכים: פרויקטים | לוח שבועי | משימות היום | חגים | כללי חישוב
 * שמירה: localStorage (בדפדפן המקומי). ראו README לגבי גיבוי/שיתוף.
 */

(function () {
  'use strict';

  const LS_PROJECTS  = 'shachaf_projects_v1';
  const LS_HOL_ADD   = 'shachaf_holidays_added_v1';   // תוספות משתמש
  const LS_HOL_DEL   = 'shachaf_holidays_removed_v1'; // הסרות משתמש
  const LS_TASK_CALS = 'shachaf_task_cals_v1';        // שיוך לוח חגים לשלב
  const LS_CONTACTS  = 'shachaf_contacts_v1';         // אנשי קשר
  const LS_MAKERS    = 'shachaf_makers_v1';           // יצרנים חיצוניים
  const LS_GAPS      = 'shachaf_gaps_v1';             // מרווחי ימים ששונו
  const LS_CUSTOMERS = 'shachaf_customers_v1';        // פרטי לקוחות

  const STATUS_LABEL = { done: 'בוצע', pending: 'לא בוצע', na: 'לא רלוונטי' };
  const STATUS_CYCLE = { pending: 'done', done: 'na', na: 'pending' };
  const DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  // סדר הלוחות בממשק — נגזר מ-CALENDARS כדי שהוספת מדינה לא תדרוש שינוי כאן
  const CAL_ORDER = Object.keys(window.CALENDARS || { il: 1, is: 1, cy: 1, be: 1 });

  let state = {
    projects: [],
    search: '',
    urgentOnly: false,
    openIds: {},
    view: 'today',
    boardStart: null,   // ISO של תחילת השבוע המוצג
    confirmDelete: null,
    holFilter: 'all',   // סינון מסך החגים: all | il | is | cy
    dayPick: null,      // ISO של היום המוצג במסך 'פעולה יומית'
    dataSearch: '',
    dataStatus: '',
    dateError: null,
    dataSort: 'date',
    dataDesc: false,
    boardRange: 'week',    // week | month | 2month — נפתח שבועי
    lateOnly: false,       // הצגת משימות באיחור בלבד
    contacts: [],
    makers: [],
    makerOpen: {},
    customers: [],
    custSearch: ''
  };

  /* ---------- גישה בטוחה ל-DOM ---------- */
  /*
   * אם קובץ ה-HTML וקובץ ה-JS אינם מאותה גרסה (למשל אחרי עדכון שבו
   * הדפדפן שמר אחד מהם במטמון), אלמנט עשוי להיעדר. בלי הגנה, שורה
   * אחת שנכשלת מפילה את חיבור כל הכפתורים והדף נראה תקוע.
   * העטיפות האלה מדלגות בשקט על מה שחסר, וכל השאר ממשיך לעבוד.
   */
  const byId = id => document.getElementById(id);
  function on(id, evt, fn) {
    const e = byId(id);
    if (e) e.addEventListener(evt, fn);
    return e;
  }
  function setText(id, v) { const e = byId(id); if (e) e.textContent = v; }
  function setHTML(id, v) { const e = byId(id); if (e) e.innerHTML = v; }
  function val(id) { const e = byId(id); return e ? e.value : ''; }
  function setVal(id, v) { const e = byId(id); if (e) e.value = v; }
  function setChecked(id, v) { const e = byId(id); if (e) e.checked = v; }
  function toggleCls(id, cls, flag) { const e = byId(id); if (e) e.classList.toggle(cls, flag); }
  function focusOn(id) { const e = byId(id); if (e) e.focus(); }

  /* ---------- storage ---------- */
  function load() {
    try { state.projects = JSON.parse(localStorage.getItem(LS_PROJECTS)) || []; }
    catch (e) { state.projects = []; }
    state.projects.forEach(migrate);
    state.contacts = readList(LS_CONTACTS);
    state.makers = readList(LS_MAKERS);
    state.customers = readList(LS_CUSTOMERS);
  }
  function save() {
    try { localStorage.setItem(LS_PROJECTS, JSON.stringify(state.projects)); }
    catch (e) { /* localStorage לא זמין — הנתונים לא יישמרו */ }
  }
  function readList(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch (e) { return []; }
  }
  function writeList(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
  }
  function readObj(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch (e) { return {}; }
  }
  function writeObj(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  /*
   * migrate — משלים שדות שנוספו אחרי שנפתחו פרויקטים קיימים,
   * כדי שנתונים ישנים ימשיכו לעבוד בלי אובדן.
   */
  function migrate(p) {
    if (!p.type) p.type = DEFAULT_TYPE;
    if (p.maker === undefined) p.maker = '';   // מזהה יצרן חיצוני
    // פרויקטים שנפתחו לפני שנוספו שלבים — השלמה כ'לא רלוונטי'
    const names0 = taskNames(p.type);
    for (let n = 1; n <= TASK_COUNT; n++) {
      if (!(p.tasks || []).some(t => t.n === n)) {
        p.tasks.push({ n: n, name: names0[n - 1], status: 'na', date: null,
                       mgr: '', worker: '', notes: '', contact: '' });
      }
    }
    if (p.alumColor === undefined) p.alumColor = '';
    if (p.hardColor === undefined) p.hardColor = '';
    if (!p.delivery) p.delivery = { noUnload: false, price: '' };
    const names = taskNames(p.type);
    (p.tasks || []).forEach(t => {
      t.name = names[t.n - 1] || t.name;
      if (t.mgr === undefined) t.mgr = '';       // מנהל אחראי
      if (t.worker === undefined) t.worker = ''; // עובד אחראי
      if (t.notes === undefined) t.notes = '';   // הערות
      if (t.contact === undefined) t.contact = '';   // מזהה איש קשר
      if (t.n === 17 && t.actualDate === undefined) t.actualDate = null; // מועד בפועל
      if (t.n === 16) {
        if (t.inspector === undefined) t.inspector = '';   // שם הבודק מטעם קליל
        if (t.inspected === undefined) t.inspected = false; // האם אישר
      }
    });
    return p;
  }

  /* ---------- holidays (merge default + user) ---------- */
  /*
   * חגי ברירת המחדל נושאים שדה cal (il / is / cy).
   * חגים שהמשתמש מוסיף ידנית חלים על כל הלוחות — יום חופש הוא יום חופש.
   */
  function currentHolidays() {
    const added = readList(LS_HOL_ADD);              // [{date,name}]
    const removed = new Set(readList(LS_HOL_DEL));   // [date]
    const rows = [];
    (window.DEFAULT_HOLIDAYS || []).forEach(h => {
      if (!removed.has(h.date)) rows.push({ date: h.date, name: h.name, cal: h.cal || 'il' });
    });
    added.forEach(h => {
      if (!removed.has(h.date)) rows.push({ date: h.date, name: h.name, cal: 'all' });
    });
    return rows.sort((a, b) => a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
  }
  function refreshHolidaySet() {
    const byCal = {};
    CAL_ORDER.forEach(k => { byCal[k] = new Set(); });
    const allCal = new Set();
    currentHolidays().forEach(h => {
      if (h.cal === 'all') allCal.add(h.date);
      else if (byCal[h.cal]) byCal[h.cal].add(h.date);
    });
    if (typeof setHolidayData === 'function') setHolidayData(byCal, allCal);
  }
  /*
   * refreshTaskCals — מעביר למנוע רק את השלבים שהמשתמש שינה ידנית.
   * שלב שלא שונה נשאר ריק בכוונה, כדי ש-calsFor יוכל לגזור את הלוח
   * ממדינת היצרן של הפרויקט. מילוי כל השלבים כאן היה מבטל את זה.
   */
  /* מרווחי הימים — ברירת המחדל מהמנוע, בתוספת מה שהמשתמש שינה */
  function refreshGaps() {
    if (typeof setGaps === 'function') setGaps(readObj(LS_GAPS));
  }

  function refreshTaskCals() {
    const saved = readObj(LS_TASK_CALS);
    const map = {};
    Object.keys(saved).forEach(n => { if (saved[n]) map[n] = saved[n]; });
    if (typeof setTaskCals === 'function') setTaskCals(map);
    return map;
  }

  /* ---------- helpers ---------- */
  const todayISO = () => toISO(new Date(Date.UTC(
    new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(iso) {
    if (!iso) return '';
    const p = iso.split('-');
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0].slice(2)}` : iso;
  }
  function daysFromToday(iso) {
    if (!iso) return null;
    return Math.round((fromISO(iso) - fromISO(todayISO())) / 86400000);
  }
  function newProject(name, caseNum, type) {
    const t = PROJECT_TYPES[type] ? type : DEFAULT_TYPE;
    const names = taskNames(t);
    const na = new Set(PROJECT_TYPES[t].naDefault);
    return {
      id: 'p' + Date.now() + Math.floor(Math.random() * 1000),
      name: name, caseNum: caseNum || '', createdAt: todayISO(),
      type: t,
      alumColor: '', hardColor: '',
      delivery: { noUnload: false, price: '' },
      tasks: names.map((nm, i) => ({
        n: i + 1, name: nm,
        status: na.has(i + 1) ? 'na' : 'pending',
        date: null, actualDate: (i + 1) === 17 ? null : undefined,
        mgr: '', worker: '', notes: '', contact: '',
        inspector: (i + 1) === 16 ? '' : undefined
      }))
    };
  }
  function progressOf(p) {
    let done = 0, total = 0;
    p.tasks.forEach(t => { if (t.status !== 'na') { total++; if (t.status === 'done') done++; } });
    return { done, total: total || 1 };
  }
  function nextTask(p) { return p.tasks.find(t => t.status === 'pending') || null; }
  function installISO(p) {
    const t = p.tasks.find(x => x.n === 17);
    return t ? t.date : null;
  }
  function overdueCount(p) {
    return p.tasks.filter(t => t.status === 'pending' && t.date && daysFromToday(t.date) < 0).length;
  }
  function isComplete(p) { const pr = progressOf(p); return pr.done >= pr.total; }
  // משימה באיחור: יש לה תאריך שעבר והיא טרם בוצעה
  function isLate(t) {
    if (t.status !== 'pending' || !t.date) return false;
    const d = daysFromToday(t.date);
    return d !== null && d < 0;
  }
  function contactById(id) { return state.contacts.find(c => c.id === id) || null; }

  /* ---------- date cascade wiring ---------- */
  function makerById(id) { return state.makers.find(m => m.id === id) || null; }

  /*
   * projectLate — האיחור החמור ביותר בפרויקט: מספר הימים של המשימה
   * שעברה הכי הרבה זמן וטרם בוצעה. 0 = אין איחור.
   */
  function projectLate(p) {
    let worst = 0;
    p.tasks.forEach(t => {
      if (t.status === 'pending' && t.date) {
        const d = daysFromToday(t.date);
        if (d !== null && d < 0 && -d > worst) worst = -d;
      }
    });
    return worst;
  }

  /*
   * applyDate — מחיל תאריך ומגלגל את הגזירות.
   * מחזיר { ok:false, earliest } כשמועד המסירה המשוער מוקדם מכדי
   * שיהיה אפשרי, ואז דבר אינו נכתב.
   */
  function applyDate(project, taskIndex1, iso) {
    const mk = makerById(project.maker);
    setActiveCountry(mk ? mk.country : null);   // קובע את לוח שלבי הייצור
    const dates = [];
    for (let n = 1; n <= TASK_COUNT; n++) {
      const t = project.tasks.find(x => x.n === n);
      dates.push(t ? t.date : null);
    }

    // חסימת מועד מסירה בלתי אפשרי
    if (taskIndex1 === 17 && iso) {
      const min = earliestDelivery(dates);
      if (min && iso < min) return { ok: false, earliest: min };
    }

    dates[taskIndex1 - 1] = iso || null;
    const out = iso ? cascade(dates, taskIndex1) : dates;
    project.tasks.forEach(t => { t.date = out[t.n - 1]; });
    return { ok: true };
  }

  /*
   * applyMakerDefaults — יצרן שמסומן כמי שצריך אבקה או מוטות השלמה
   * מדליק את שלבי המשלוח המתאימים; יצרן שלא — משאיר אותם 'לא רלוונטי'.
   */
  /*
   * applyMakerDefaults — מחיל את סקופ העבודה לפי היצרן שנבחר.
   *
   * יצרן חו"ל: התהליך מצומצם לרשימת OVERSEAS_SCOPE; כל שלב מחוצה לה
   *            יורד ל'לא רלוונטי'. משלוח האבקה והמוטות נדלקים רק אם
   *            סומנו אצל היצרן.
   * יצרן בארץ / ללא יצרן: התהליך המלא, ושלבי החו"ל בלבד כבויים.
   *
   * שלב שכבר סומן 'בוצע' לעולם אינו משתנה כאן — לא מוחקים עבודה שנעשתה.
   */
  function applyMakerDefaults(p) {
    const m = makerById(p.maker);
    const overseas = m && isOverseas(m.country);

    const turnOn = n => {
      const t = p.tasks.find(x => x.n === n);
      if (t && t.status === 'na') t.status = 'pending';
    };
    const turnOff = n => {
      const t = p.tasks.find(x => x.n === n);
      if (t && t.status !== 'done') { t.status = 'na'; t.date = null; }
    };

    if (overseas) {
      OVERSEAS_SCOPE.forEach(n => {
        if (n === 18) { m.needPowder ? turnOn(18) : turnOff(18); return; }
        if (n === 19) { m.needBars ? turnOn(19) : turnOff(19); return; }
        turnOn(n);
      });
      for (let n = 1; n <= TASK_COUNT; n++) {
        if (OVERSEAS_SCOPE.indexOf(n) === -1) turnOff(n);
      }
    } else {
      OVERSEAS_ONLY.forEach(turnOff);
      // שלבים שכובו בגלל סקופ חו"ל קודם — החזרה, למעט ברירות המחדל הקבועות
      const alwaysOff = PROJECT_TYPES[p.type].naDefault;
      for (let n = 1; n <= TASK_COUNT; n++) {
        if (OVERSEAS_ONLY.indexOf(n) !== -1) continue;
        if (alwaysOff.indexOf(n) !== -1) continue;
        turnOn(n);
      }
    }
  }

  /*
   * recalcProject — מריץ מחדש את הגזירה מכל שלב שיש לו תאריך, כדי
   * שהחלפת יצרן (ולכן לוח חגים) תעדכן את התאריכים הנגזרים.
   */
  function recalcAll() {
    state.projects.forEach(recalcProject);
  }

  function recalcProject(p) {
    const seeds = [1, 2, 5, 9, 13, 18, 19, 17];
    seeds.forEach(n => {
      const t = p.tasks.find(x => x.n === n);
      if (t && t.date) applyDate(p, n, t.date);
    });
  }

  /* ============================================================
   *  RENDER
   * ============================================================ */
  function render() {
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.view === state.view));
    document.querySelectorAll('.view').forEach(v =>
      v.classList.toggle('active', v.id === 'view-' + state.view));
    try { renderActive(); applyFocusJump(); }
    catch (err) {
      // מסך אחד שנכשל לא ישתק את שאר הכלי
      if (window.console) console.error('שגיאה בציור המסך ' + state.view + ':', err);
    }
  }

  /*
   * focusEstimate — מבוצע אחרי הציור, כי האלמנט נוצר מחדש בכל רינדור.
   */
  function applyFocusJump() {
    if (!state.focusEstimate) return;
    const pid = state.focusEstimate;
    state.focusEstimate = null;
    const card = document.querySelector('.card.open');
    if (!card) return;
    const rows = card.querySelectorAll('.task-row');
    for (let i = 0; i < rows.length; i++) {
      const num = rows[i].querySelector('.task-num');
      if (num && num.textContent === '17') {
        const inp = rows[i].querySelector('input[type=date]');
        if (inp && !inp.disabled) { inp.focus(); inp.select && inp.select(); }
        rows[i].classList.add('flash');
        setTimeout(() => rows[i].classList.remove('flash'), 1600);
        return;
      }
    }
  }

  function renderActive() {
    if (state.view === 'projects') renderProjects();
    else if (state.view === 'board') renderBoard();
    else if (state.view === 'today') renderDaily();
    else if (state.view === 'contacts') renderContacts();
    else if (state.view === 'makers') renderMakers();
    else if (state.view === 'manager') renderManager();
    else if (state.view === 'data') renderData();
    else if (state.view === 'customers') renderCustomers();
    else if (state.view === 'holidays') renderHolidays();
    else if (state.view === 'rules') renderRules();
  }

  /* ----- projects view ----- */
  function renderProjects() {
    let active = 0, done = 0, overdue = 0, week = 0;
    state.projects.forEach(p => {
      isComplete(p) ? done++ : active++;
      overdue += overdueCount(p);
      const ins = installISO(p);
      if (ins) { const d = daysFromToday(ins); if (d !== null && d >= 0 && d <= 7) week++; }
    });
    setText('kpiActive', active);
    setText('kpiOverdue', overdue);
    setText('kpiWeek', week);
    setText('kpiDone', done);

    const list = byId('list');
    if (!list) return;
    list.innerHTML = '';
    const q = state.search.trim().toLowerCase();
    let items = state.projects.filter(p => {
      if (q && ((p.name || '') + ' ' + (p.caseNum || '')).toLowerCase().indexOf(q) === -1) return false;
      if (state.urgentOnly) {
        const urgent = p.tasks.some(t => {
          if (t.status !== 'pending' || !t.date) return false;
          const d = daysFromToday(t.date); return d !== null && d <= 2;
        });
        if (!urgent) return false;
      }
      return true;
    });
    if (!items.length) {
      list.appendChild(el('div', 'empty',
        state.projects.length ? 'לא נמצאו פרויקטים מתאימים.' : 'אין פרויקטים עדיין. הוסיפו פרויקט ראשון.'));
      return;
    }
    items.sort((a, b) => (installISO(a) || '9999') < (installISO(b) || '9999') ? -1 : 1);
    items.forEach(p => list.appendChild(projectCard(p)));
  }

  function projectStatus(p) {
    if (isComplete(p)) return { cls: 'ok', label: 'הושלם' };
    const od = overdueCount(p);
    if (od > 0) return { cls: 'bad', label: od + ' באיחור' };
    const nt = nextTask(p);
    if (nt && nt.date) { const d = daysFromToday(nt.date); if (d !== null && d <= 2) return { cls: 'warn', label: 'דחוף' }; }
    return { cls: 'neutral', label: 'בתהליך' };
  }

  function projectCard(p) {
    const pr = progressOf(p);
    const open = !!state.openIds[p.id];
    const card = el('div', 'card' + (open ? ' open' : ''));

    const head = el('div', 'card-head');
    const nb = el('div', 'name-block');
    nb.appendChild(el('div', 'name', esc(p.name || '(ללא שם)')));
    const meta = el('div', 'case');
    meta.innerHTML = 'מס\' תיק: ' + (p.caseNum ? '<span class="mono">' + esc(p.caseNum) + '</span>' : '—') +
      ' · <span class="type-tag">' + esc(PROJECT_TYPES[p.type].short) + '</span>';
    nb.appendChild(meta);
    head.appendChild(nb);

    const pw = el('div', 'progress-wrap');
    const track = el('div', 'progress-track');
    const fill = el('div', 'progress-fill'); fill.style.width = Math.round(100 * pr.done / pr.total) + '%';
    track.appendChild(fill); pw.appendChild(track);
    pw.appendChild(el('div', 'progress-txt', pr.done + '/' + pr.total));
    head.appendChild(pw);

    const nbk = el('div', 'next-block');
    const st = projectStatus(p);
    nbk.appendChild(el('span', 'pill ' + st.cls, esc(st.label)));
    const nt = nextTask(p);
    if (nt) nbk.appendChild(el('span', 'next-name', 'הבא: ' + esc(nt.name) + (nt.date ? ' · ' + fmt(nt.date) : '')));
    head.appendChild(nbk);

    head.appendChild(el('span', 'chev', '▾'));
    head.addEventListener('click', () => { state.openIds[p.id] = !open; render(); });
    card.appendChild(head);

    // body
    const body = el('div', 'card-body');
    body.appendChild(detailsBlock(p));

    orderTasks(p.tasks).forEach(t => {
      const row = el('div', 'task-row' + (t.status === 'pending' && t.date && daysFromToday(t.date) < 0 ? ' overdue' : '')
        + (t.status === 'na' ? ' is-na' : ''));
      row.appendChild(el('div', 'task-num', String(t.n)));
      row.appendChild(el('div', 'task-name', esc(t.name)));

      /*
       * שני כפתורים נפרדים במקום מחזור בן שלושה מצבים:
       * רלוונטי/לא רלוונטי, ובנפרד בוצע/לא בוצע. מצב 'na' נשאר במודל
       * לתאימות עם נתונים קיימים ועם שאר המסכים.
       */
      const rel = el('button', 'rel-btn' + (t.status === 'na' ? ' off' : ' on'),
        t.status === 'na' ? '✕' : '✓');
      rel.title = t.status === 'na' ? 'לא רלוונטי — לחצו כדי להחזיר' : 'רלוונטי — לחצו כדי לבטל';
      rel.addEventListener('click', e => {
        e.stopPropagation();
        t.status = (t.status === 'na') ? 'pending' : 'na';
        if (t.status === 'na') t.date = null;
        save(); render();
      });
      row.appendChild(rel);

      /*
       * שלב 16 חסום: אי אפשר לסמן "בוצע" לפני שהבודק מטעם קליל אישר.
       * הסדר הוא קודם שם הבודק, אחר כך לחיצה על "נבדק", ורק אז נפתח
       * כפתור הביצוע. כך הבדיקה לא נעקפת בטעות.
       */
      /*
       * שלב 17 הוא מועד משוער — אין לו "בוצע" ידני, כי אי אפשר לבצע
       * הערכה. המצב שלו נגזר מהמועד בפועל: ברגע שהוא מוזן, השלב נחשב
       * שנמסר; כשהוא ריק, השלב מתוכנן בלבד.
       */
      if (t.n === 17 && t.status !== 'na') {
        const chip = el('span', 'plan-chip ' + (t.actualDate ? 'delivered' : 'planned'),
          t.actualDate ? '✓ נמסר' : 'מתוכנן');
        chip.title = t.actualDate
          ? 'נמסר בפועל ב-' + fmt(t.actualDate)
          : 'הזינו מועד בפועל כדי לסמן כנמסר';
        row.appendChild(chip);
      } else {
        const gated = (t.n === 16 && t.status !== 'na' && !t.inspected);
        const sb = el('button', 'status-btn ' + t.status,
          t.status === 'na' ? 'לא רלוונטי' : STATUS_LABEL[t.status]);
        sb.disabled = (t.status === 'na') || gated;
        if (gated) sb.title = t.n === 17 ? 'נקבע לפי המועד בפועל' : 'ממתין לאישור הבודק מטעם קליל';
        sb.addEventListener('click', () => {
          if (t.status === 'na' || gated) return;
          t.status = (t.status === 'done') ? 'pending' : 'done';
          save(); render();
        });
        row.appendChild(sb);
      }

      const dw = el('div', 'task-date');
      const di = el('input'); di.type = 'date'; di.value = t.date || '';
      di.disabled = (t.status === 'na');
      di.addEventListener('change', () => {
        const res = applyDate(p, t.n, di.value || null);
        if (res && res.ok === false) {
          // התאריך נדחה — מחזירים את השדה ומסבירים למה
          di.value = t.date || '';
          state.dateError = { id: p.id, n: t.n, earliest: res.earliest };
          render();
          return;
        }
        state.dateError = null;
        /*
         * חתימת הלקוח היא נקודת הפתיחה, אבל כל החישוב אחורה נתלה
         * במועד המסירה המשוער. לכן מיד אחרי הזנת החתימה הסמן קופץ
         * לשדה המשוער — כדי שלא יישאר ריק ויעצור את כל התכנון.
         */
        if (t.n === 1 && di.value) state.focusEstimate = p.id;
        save(); render();
      });
      dw.appendChild(di); row.appendChild(dw);

      // מחוון: האם למשימה יש גזירה אוטומטית (מסומן בגוון ברונזה)
      const hasRule = DEPENDENCY_RULES.some(r => r.from === t.n);
      row.appendChild(el('div', 'task-auto', hasRule ? '⟳' : ''));
      body.appendChild(row);

      // הודעת דחייה, אם התאריך שהוזן לשלב הזה נחסם
      if (state.dateError && state.dateError.id === p.id && state.dateError.n === t.n) {
        const er = el('div', 'date-error');
        er.innerHTML = '<strong>התאריך נדחה.</strong> לא ניתן למסור לפני שהייצור מסתיים. ' +
          'המועד המוקדם ביותר האפשרי: <span class="mono">' + fmt(state.dateError.earliest) + '</span>';
        body.appendChild(er);
      }

      // שלב 17 — מועד המסירה בפועל, מתחת למועד המשוער
      if (t.n === 17 && t.status !== 'na') {
        const ar = el('div', 'inspector-row actual-row');
        ar.appendChild(el('span', 'sub-label', 'מועד בפועל'));
        const ai = el('input'); ai.type = 'date'; ai.className = 'cell-input actual-date';
        ai.value = t.actualDate || '';
        ai.addEventListener('change', () => {
          t.actualDate = ai.value || null;
          t.status = t.actualDate ? 'done' : 'pending';   // המצב נגזר מהמועד בפועל
          save(); render();
        });
        ar.appendChild(ai);

        // פער מול המשוער — המידע שבשבילו הכלי קיים
        if (t.date && t.actualDate) {
          const diff = Math.round((fromISO(t.actualDate) - fromISO(t.date)) / 86400000);
          let cls = 'ok', txt = 'בזמן';
          if (diff > 0) { cls = 'bad'; txt = 'איחור ' + diff + ' ימים'; }
          else if (diff < 0) { cls = 'ok'; txt = 'הקדמה ' + Math.abs(diff) + ' ימים'; }
          ar.appendChild(el('span', 'variance ' + cls, txt));
        } else if (!t.date) {
          ar.appendChild(el('span', 'await-name', 'חסר מועד משוער'));
        }
        body.appendChild(ar);
      }

      // שלב 16 — שם הבודק מטעם קליל, בשורה נפרדת מתחתיו
      if (t.n === 16 && t.status !== 'na') {
        const ir = el('div', 'inspector-row' + (t.inspected ? ' approved' : ''));
        ir.appendChild(el('span', 'sub-label', 'בודק מטעם קליל'));

        const ii = el('input'); ii.type = 'text'; ii.className = 'cell-input';
        ii.value = t.inspector || ''; ii.placeholder = 'שם הבודק';
        ii.disabled = !!t.inspected;   // אחרי אישור השם ננעל
        ii.addEventListener('change', () => { t.inspector = ii.value.trim(); save(); render(); });
        ir.appendChild(ii);

        if (t.inspected) {
          ir.appendChild(el('span', 'approved-chip', '✓ נבדק ואושר'));
          const undo = el('button', 'undo-btn', 'ביטול אישור');
          undo.addEventListener('click', () => {
            t.inspected = false;
            if (t.status === 'done') t.status = 'pending';  // הביצוע נשען על האישור
            save(); render();
          });
          ir.appendChild(undo);
        } else if ((t.inspector || '').trim()) {
          const ok = el('button', 'inspect-btn', 'נבדק');
          ok.title = 'אישור הבודק — יפתח את כפתור הביצוע';
          ok.addEventListener('click', () => { t.inspected = true; save(); render(); });
          ir.appendChild(ok);
        } else {
          ir.appendChild(el('span', 'await-name', 'הזינו שם בודק כדי לאשר'));
        }
        body.appendChild(ir);
      }
    });

    const foot = el('div', 'card-foot');
    foot.appendChild(el('span', 'hint', '⟳ = הזנת תאריך גוזרת אוטומטית משימות תלויות'));
    const del = el('button', 'delete-btn' + (state.confirmDelete === p.id ? ' confirming' : ''),
      state.confirmDelete === p.id ? 'בטוח? לחצו שוב למחיקה' : 'מחיקת פרויקט');
    del.addEventListener('click', () => {
      if (state.confirmDelete === p.id) {
        state.projects = state.projects.filter(x => x.id !== p.id);
        state.confirmDelete = null; save(); render();
      } else { state.confirmDelete = p.id; render(); }
    });
    foot.appendChild(del);
    body.appendChild(foot);
    card.appendChild(body);
    return card;
  }

  /*
   * detailsBlock — פרטי ההזמנה שאינם שלב בלוח הזמנים:
   * סוג הפרויקט, הגוונים שנבחרו ואופציית ההובלה.
   */
  function detailsBlock(p) {
    const box = el('div', 'details');

    // סוג פרויקט
    const f0 = el('div', 'dfield');
    f0.appendChild(el('label', null, 'סוג פרויקט'));
    const sel = el('select');
    Object.keys(PROJECT_TYPES).forEach(k => {
      const o = el('option', null, PROJECT_TYPES[k].label);
      o.value = k; if (p.type === k) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      p.type = sel.value;
      const names = taskNames(p.type);
      p.tasks.forEach(t => { t.name = names[t.n - 1]; });
      save(); render();
    });
    f0.appendChild(sel); box.appendChild(f0);

    // יצרן חיצוני — קובע את לוח החגים של שלבי הייצור
    const fm = el('div', 'dfield');
    fm.appendChild(el('label', null, 'יצרן'));
    const msel = el('select');
    const mnone = el('option', null, '— לא נבחר —'); mnone.value = ''; msel.appendChild(mnone);
    state.makers.forEach(m => {
      const o = el('option', null, m.name + ' · ' + (window.COUNTRY_CALS[m.country] || {}).name);
      o.value = m.id; if (p.maker === m.id) o.selected = true;
      msel.appendChild(o);
    });
    msel.addEventListener('change', () => {
      p.maker = msel.value;
      applyMakerDefaults(p);
      recalcProject(p);
      save(); render();
    });
    fm.appendChild(msel); box.appendChild(fm);

    // גוון אלומיניום
    const f1 = el('div', 'dfield');
    f1.appendChild(el('label', null, 'גוון אלומיניום נבחר'));
    const i1 = el('input'); i1.type = 'text'; i1.value = p.alumColor || '';
    i1.placeholder = 'למשל RAL 9016';
    i1.addEventListener('change', () => { p.alumColor = i1.value.trim(); save(); });
    f1.appendChild(i1); box.appendChild(f1);

    // גוון פרזול
    const f2 = el('div', 'dfield');
    f2.appendChild(el('label', null, 'גוון פרזול נבחר'));
    const i2 = el('input'); i2.type = 'text'; i2.value = p.hardColor || '';
    i2.placeholder = 'למשל שחור מט';
    i2.addEventListener('change', () => { p.hardColor = i2.value.trim(); save(); });
    f2.appendChild(i2); box.appendChild(f2);

    // הובלה ללא פריקה
    const f3 = el('div', 'dfield delivery');
    f3.appendChild(el('label', null, 'הובלה ללא פריקה'));
    const wrap = el('div', 'delivery-row');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!p.delivery.noUnload;
    cb.id = 'dl-' + p.id;
    const cbl = el('label', 'cb-label', 'נדרשת'); cbl.setAttribute('for', cb.id);
    const pi = el('input'); pi.type = 'text'; pi.className = 'price';
    pi.value = p.delivery.price || ''; pi.placeholder = 'עלות ₪';
    pi.disabled = !cb.checked;
    cb.addEventListener('change', () => {
      p.delivery.noUnload = cb.checked;
      pi.disabled = !cb.checked;
      if (!cb.checked) { p.delivery.price = ''; pi.value = ''; }
      save();
    });
    pi.addEventListener('change', () => { p.delivery.price = pi.value.trim(); save(); });
    wrap.appendChild(cb); wrap.appendChild(cbl); wrap.appendChild(pi);
    f3.appendChild(wrap); box.appendChild(f3);

    return box;
  }

  /* ----- דשבורד כללי: שורה לפרויקט, עמודה ליום ----- */
  /*
   * מקביל לגיליון Dashboard שבקובץ המקורי, בטווח רחב יותר: כל עבודה פעילה
   * מקבלת שורה, כל יום עבודה בטווח מקבל עמודה, והתא מציג את מספר המשימה.
   * ברירת המחדל היא חודשיים קדימה — התמונה שצריך כדי לתכנן ייצור.
   */
  const RANGE_DAYS = { week: 7, month: 31, '2month': 62 };
  const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני',
                  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

  function weekStart(iso) {
    let d = fromISO(iso);
    while (d.getUTCDay() !== 0) d = addDays(d, -1);  // מגלגל אחורה ליום ראשון
    return toISO(d);
  }

  /* ימי העבודה שבטווח המוצג (ראשון–חמישי בלבד) */
  function boardDays() {
    const span = RANGE_DAYS[state.boardRange] || 62;
    const start = fromISO(state.boardStart);
    const out = [];
    for (let i = 0; i < span; i++) {
      const d = addDays(start, i);
      const w = d.getUTCDay();
      if (w >= 0 && w <= 4) out.push({ iso: toISO(d), dow: DOW[w], d: d });
    }
    return out;
  }

  function renderBoard() {
    if (!state.boardStart) state.boardStart = weekStart(todayISO());
    const days = boardDays();

    // מדדים עליונים
    let active = 0, done = 0, overdue = 0, week = 0;
    state.projects.forEach(p => {
      isComplete(p) ? done++ : active++;
      overdue += p.tasks.filter(isLate).length;
      const ins = installISO(p);
      if (ins) { const d = daysFromToday(ins); if (d !== null && d >= 0 && d <= 7) week++; }
    });
    setText('kpiActive', active);
    setText('kpiOverdue', overdue);
    setText('kpiWeek', week);
    setText('kpiDone', done);

    setText('boardLabel', days.length
      ? fmt(days[0].iso) + ' – ' + fmt(days[days.length - 1].iso) + ' · ' + days.length + ' ימי עבודה'
      : '');
    document.querySelectorAll('#rangeSwitch button').forEach(b =>
      b.classList.toggle('active', b.dataset.range === state.boardRange));
    toggleCls('lateToggle', 'active', state.lateOnly);
    setChecked('lateCheck', state.lateOnly);

    const tbl = byId('dashTable');
    if (!tbl) return;
    tbl.innerHTML = '';
    const nCols = days.length + 4;

    // כותרת: שורת חודשים ושורת ימים
    const thead = el('thead');
    const mr = el('tr', 'month-row');
    mr.appendChild(el('th', 'dash-cli', ''));
    mr.appendChild(el('th', 'dash-maker', ''));
    mr.appendChild(el('th', 'dash-late', ''));
    let i = 0;
    while (i < days.length) {
      const mk = days[i].d.getUTCMonth() + '-' + days[i].d.getUTCFullYear();
      let span = 0;
      while (i + span < days.length &&
             (days[i + span].d.getUTCMonth() + '-' + days[i + span].d.getUTCFullYear()) === mk) span++;
      const th = el('th', 'month-cell',
        MONTHS[days[i].d.getUTCMonth()] + ' ' + days[i].d.getUTCFullYear());
      th.colSpan = span;
      mr.appendChild(th);
      i += span;
    }
    mr.appendChild(el('th', 'dash-end', ''));
    thead.appendChild(mr);

    const hr = el('tr');
    hr.appendChild(el('th', 'dash-cli', 'לקוח'));
    hr.appendChild(el('th', 'dash-maker', 'יצרן'));
    hr.appendChild(el('th', 'dash-late', 'באיחור'));
    days.forEach(d => {
      const th = el('th', 'dash-day' + (d.iso === todayISO() ? ' today' : ''));
      th.appendChild(el('div', 'dow', d.dow.slice(0, 2)));
      th.appendChild(el('div', 'dt mono', d.iso.slice(8) + '.' + d.iso.slice(5, 7)));
      hr.appendChild(th);
    });
    hr.appendChild(el('th', 'dash-end', 'מסירה'));
    thead.appendChild(hr);
    tbl.appendChild(thead);

    // שורות
    const tbody = el('tbody');
    let rows = state.projects.filter(p => !isComplete(p));
    if (state.lateOnly) rows = rows.filter(p => p.tasks.some(isLate));

    if (!rows.length) {
      const tr = el('tr');
      const td = el('td', 'empty-cell',
        state.lateOnly ? 'אין משימות באיחור. 🎉' : 'אין עבודות פעילות להצגה.');
      td.colSpan = nCols; tr.appendChild(td); tbody.appendChild(tr);
    }
    rows.sort((a, b) => (installISO(a) || '9999') < (installISO(b) || '9999') ? -1 : 1);

    rows.forEach(p => {
      const tr = el('tr');
      const nameCell = el('td', 'dash-cli');
      nameCell.appendChild(el('div', 'cli-name', esc(p.name)));
      nameCell.appendChild(el('div', 'cli-case mono',
        esc(p.caseNum || '') + ' · ' + esc(PROJECT_TYPES[p.type].short)));
      tr.appendChild(nameCell);

      /*
       * עמודת האיחורים מציגה כל משימה שעבר תאריכה ולא בוצעה — גם אם
       * התאריך שלה נמצא מחוץ לטווח המוצג. בלעדיה איחור ישן פשוט נעלם.
       */
      const mk = makerById(p.maker);
      const mkTd = el('td', 'dash-maker');
      if (mk) {
        mkTd.appendChild(el('div', 'mk-name', esc(mk.name)));
        mkTd.appendChild(el('span', 'cal-tag cal-' + mk.country,
          esc((window.COUNTRY_CALS[mk.country] || {}).name || '')));
      } else { mkTd.appendChild(el('span', 'no-late', '—')); }
      tr.appendChild(mkTd);

      const lateTd = el('td', 'dash-late');
      const lateTasks = p.tasks.filter(isLate);
      if (!lateTasks.length) {
        lateTd.appendChild(el('span', 'no-late', '—'));
      } else {
        lateTasks.forEach(t => {
          const chip = el('span', 'tnum late', String(t.n));
          chip.title = t.name + ' · ' + fmt(t.date) + ' · באיחור ' +
            Math.abs(daysFromToday(t.date)) + ' ימים';
          lateTd.appendChild(chip);
        });
      }
      tr.appendChild(lateTd);

      days.forEach(d => {
        const td = el('td', 'dash-cell' + (d.iso === todayISO() ? ' today' : ''));
        p.tasks.forEach(t => {
          if (t.status === 'na' || t.date !== d.iso) return;
          if (state.lateOnly && !isLate(t)) return;
          const late = isLate(t);
          const chip = el('span',
            'tnum ' + t.status + (late ? ' late' : '') + (t.n === 17 ? ' final' : ''),
            String(t.n));
          chip.title = t.name + ' · ' + p.name + (late ? ' · באיחור' : '');
          td.appendChild(chip);
        });
        tr.appendChild(td);
      });

      const ins = installISO(p);
      const et = el('td', 'dash-end mono');
      if (ins) {
        const d = daysFromToday(ins);
        if (d !== null && d < 0) et.className += ' late';
        et.textContent = fmt(ins);
      } else { et.textContent = '—'; }
      tr.appendChild(et);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
  }

  /* ----- פעולה יומית (מקביל לגיליון Report) ----- */
  /*
   * השורות ממוינות לפי מספר המשימה. לכל שורה אפשר לשייך איש קשר,
   * ומשם לפתוח ווטסאפ או מייל עם הודעה מוכנה.
   */
  function waLink(phone, text) {
    // המרה לפורמט בינלאומי: 0501234567 → 972501234567
    let p = String(phone || '').replace(/[^\d+]/g, '');
    if (p.indexOf('+') === 0) p = p.slice(1);
    if (p.indexOf('0') === 0) p = '972' + p.slice(1);
    return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text);
  }
  function msgFor(p, t) {
    return 'שלום, בנוגע לעבודה "' + p.name + '"' +
      (p.caseNum ? ' (תיק ' + p.caseNum + ')' : '') + ':\n' +
      'משימה ' + t.n + ' — ' + t.name +
      (t.date ? '\nתאריך יעד: ' + fmt(t.date) : '');
  }

  function renderDaily() {
    if (!state.dayPick) state.dayPick = todayISO();
    const iso = state.dayPick;
    setVal('dayPick', iso);
    byId('dayLabel').textContent =
      fmt(iso) + ' · יום ' + DOW[fromISO(iso).getUTCDay()];

    const box = byId('dailyBody');
    if (!box) return;
    box.innerHTML = '';

    const rows = [];
    state.projects.forEach(p => {
      p.tasks.forEach(t => {
        if (t.status === 'na' || t.date !== iso) return;
        rows.push({ p, t });
      });
    });
    rows.sort((a, b) => a.t.n - b.t.n);   // מיון לפי מספר המשימה

    if (!rows.length) {
      const tr = el('tr');
      const td = el('td', 'empty-cell', 'אין פעולות מתוכננות ליום זה.');
      td.colSpan = 8; tr.appendChild(td); box.appendChild(tr);
      return;
    }

    rows.forEach(({ p, t }) => {
      const tr = el('tr' + (isLate(t) ? '' : ''));
      if (isLate(t)) tr.className = 'row-late';
      tr.appendChild(el('td', 'mono tnum-cell', String(t.n)));
      tr.appendChild(el('td', null, esc(p.name)));

      // שם המשימה, ולשלב 16 גם שדה הבודק מטעם קליל
      const nameTd = el('td');
      nameTd.appendChild(el('div', null, esc(t.name)));
      if (t.n === 17 && t.actualDate === undefined) t.actualDate = null; // מועד בפועל
      if (t.n === 16) {
        const wrap = el('div', 'sub-field');
        wrap.appendChild(el('span', 'sub-label', 'בודק מטעם קליל:'));
        const ii = el('input'); ii.type = 'text'; ii.className = 'cell-input';
        ii.value = t.inspector || ''; ii.placeholder = 'שם הבודק';
        ii.disabled = !!t.inspected;
        ii.addEventListener('change', () => { t.inspector = ii.value.trim(); save(); render(); });
        wrap.appendChild(ii);
        if (t.inspected) {
          wrap.appendChild(el('span', 'approved-chip', '✓ נבדק'));
        } else if ((t.inspector || '').trim()) {
          const ok = el('button', 'inspect-btn', 'נבדק');
          ok.addEventListener('click', () => { t.inspected = true; save(); render(); });
          wrap.appendChild(ok);
        }
        nameTd.appendChild(wrap);
      }
      tr.appendChild(nameTd);

      [['mgr'], ['worker']].forEach(([key]) => {
        const td = el('td');
        const i = el('input'); i.type = 'text'; i.className = 'cell-input';
        i.value = t[key] || '';
        i.addEventListener('change', () => { t[key] = i.value.trim(); save(); });
        td.appendChild(i); tr.appendChild(td);
      });

      // איש קשר + כפתורי ווטסאפ ומייל
      const cTd = el('td');
      const row = el('div', 'contact-cell');
      const sel = el('select', 'cell-select');
      const none = el('option', null, '—'); none.value = ''; sel.appendChild(none);
      state.contacts.forEach(c => {
        const o = el('option', null, c.name + (c.role ? ' · ' + c.role : ''));
        o.value = c.id; if (t.contact === c.id) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => { t.contact = sel.value; save(); render(); });
      row.appendChild(sel);

      const c = contactById(t.contact);
      if (c && c.phone) {
        const wa = el('a', 'ico-btn wa', '✆');
        wa.href = waLink(c.phone, msgFor(p, t));
        wa.target = '_blank'; wa.rel = 'noopener';
        wa.title = 'ווטסאפ ל' + c.name;
        row.appendChild(wa);
      }
      if (c && c.mail) {
        const ml = el('a', 'ico-btn ml', '✉');
        ml.href = 'mailto:' + c.mail +
          '?subject=' + encodeURIComponent(p.name + ' — משימה ' + t.n) +
          '&body=' + encodeURIComponent(msgFor(p, t));
        ml.title = 'מייל ל' + c.name;
        row.appendChild(ml);
      }
      cTd.appendChild(row); tr.appendChild(cTd);

      const stTd = el('td');
      const gated = (t.n === 16 && !t.inspected) || t.n === 17;
      const sb = el('button', 'status-btn ' + t.status,
        t.n === 17 ? (t.actualDate ? '✓ נמסר' : 'מתוכנן') : STATUS_LABEL[t.status]);
      sb.disabled = gated;
      if (gated) sb.title = t.n === 17 ? 'נקבע לפי המועד בפועל' : 'ממתין לאישור הבודק מטעם קליל';
      sb.addEventListener('click', () => {
        if (gated) return;
        t.status = (t.status === 'done') ? 'pending' : 'done';
        save(); render();
      });
      stTd.appendChild(sb); tr.appendChild(stTd);

      const nTd = el('td');
      const ni = el('input'); ni.type = 'text'; ni.className = 'cell-input';
      ni.value = t.notes || ''; ni.placeholder = '—';
      ni.addEventListener('change', () => { t.notes = ni.value.trim(); save(); });
      nTd.appendChild(ni); tr.appendChild(nTd);

      box.appendChild(tr);
    });
  }

  /* ----- אנשי קשר ----- */
  function renderContacts() {
    const box = byId('contactsBody');
    if (!box) return;
    box.innerHTML = '';
    if (!state.contacts.length) {
      const tr = el('tr');
      const td = el('td', 'empty-cell', 'אין אנשי קשר עדיין. הוסיפו את הראשון למעלה.');
      td.colSpan = 5; tr.appendChild(td); box.appendChild(tr);
      return;
    }
    state.contacts.forEach(c => {
      const tr = el('tr');
      [['name'], ['role'], ['phone'], ['mail']].forEach(([k]) => {
        const td = el('td');
        const i = el('input'); i.type = 'text'; i.className = 'cell-input';
        i.value = c[k] || '';
        i.addEventListener('change', () => {
          c[k] = i.value.trim(); writeList(LS_CONTACTS, state.contacts); render();
        });
        td.appendChild(i); tr.appendChild(td);
      });
      const td = el('td');
      const x = el('button', 'del-x', '✕'); x.title = 'מחיקה';
      x.addEventListener('click', () => {
        state.contacts = state.contacts.filter(y => y.id !== c.id);
        // ניתוק השיוך מכל המשימות שהצביעו עליו
        state.projects.forEach(p => p.tasks.forEach(t => { if (t.contact === c.id) t.contact = ''; }));
        writeList(LS_CONTACTS, state.contacts); save(); render();
      });
      td.appendChild(x); tr.appendChild(td);
      box.appendChild(tr);
    });
  }

  /* ----- לקוחות ----- */
  /*
   * הרשימה היא איחוד של שני מקורות: לקוחות שנשמרו במפורש, ושמות
   * שמופיעים בפרויקטים ועוד לא נשמרו. כך המסך מלא מהרגע הראשון,
   * והזנת פרט קשר לשם שהגיע מפרויקט שומרת אותו אוטומטית.
   */
  function customerRows() {
    const byName = new Map();
    state.customers.forEach(c => byName.set(c.name, Object.assign({ saved: true }, c)));
    state.projects.forEach(p => {
      const nm = (p.name || '').trim();
      if (!nm) return;
      if (!byName.has(nm)) byName.set(nm, { name: nm, phone: '', mail: '', addr: '', saved: false });
    });

    const q = state.custSearch.trim().toLowerCase();
    const rows = [];
    byName.forEach(c => {
      if (q && c.name.toLowerCase().indexOf(q) === -1) return;
      const ps = state.projects.filter(p => (p.name || '').trim() === c.name);
      let open = 0, late = 0, next = null;
      ps.forEach(p => {
        if (!isComplete(p)) open++;
        late += p.tasks.filter(isLate).length;
        const ins = installISO(p);
        if (ins && !isComplete(p) && (!next || ins < next)) next = ins;
      });
      rows.push({ c: c, jobs: ps.length, open: open, late: late, next: next });
    });
    rows.sort((a, b) => a.c.name.localeCompare(b.c.name, 'he'));
    return rows;
  }

  function saveCustomer(name, field, value) {
    let c = state.customers.find(x => x.name === name);
    if (!c) { c = { name: name, phone: '', mail: '', addr: '' }; state.customers.push(c); }
    c[field] = value;
    writeList(LS_CUSTOMERS, state.customers);
  }

  function renderCustomers() {
    const rows = customerRows();
    setText('custCount', rows.length + ' לקוחות');
    const box = byId('custBody');
    if (!box) return;
    box.innerHTML = '';
    if (!rows.length) {
      const tr = el('tr');
      const td = el('td', 'empty-cell', 'אין לקוחות להצגה.'); td.colSpan = 9;
      tr.appendChild(td); box.appendChild(tr);
      return;
    }
    rows.forEach(r => {
      const tr = el('tr');
      const nt = el('td');
      nt.appendChild(el('div', 'cli-name', esc(r.c.name)));
      if (!r.c.saved) nt.appendChild(el('span', 'cli-case', 'מפרויקט'));
      tr.appendChild(nt);

      [['phone'], ['mail'], ['addr']].forEach(([k]) => {
        const td = el('td');
        const i = el('input'); i.type = 'text'; i.className = 'cell-input'; i.value = r.c[k] || '';
        i.addEventListener('change', () => { saveCustomer(r.c.name, k, i.value.trim()); render(); });
        td.appendChild(i); tr.appendChild(td);
      });

      tr.appendChild(el('td', 'mono num-cell', String(r.jobs)));
      tr.appendChild(el('td', 'mono num-cell', String(r.open)));
      const lt = el('td', 'mono num-cell');
      if (r.late) lt.appendChild(el('span', 'days-pill sev', String(r.late)));
      else lt.textContent = '—';
      tr.appendChild(lt);
      tr.appendChild(el('td', 'mono', r.next ? fmt(r.next) : '—'));

      const dt = el('td');
      if (r.c.saved && !r.jobs) {
        const x = el('button', 'del-x', '✕'); x.title = 'מחיקה';
        x.addEventListener('click', () => {
          state.customers = state.customers.filter(y => y.name !== r.c.name);
          writeList(LS_CUSTOMERS, state.customers); render();
        });
        dt.appendChild(x);
      }
      tr.appendChild(dt);
      box.appendChild(tr);
    });
  }

  /* ----- מסך מנהל: מיני דשבורד ----- */
  /*
   * תמונת מצב אחת למנהל: כמה עבודות פתוחות, כמה משימות, מה באיחור
   * ומי היצרן שהעומס אצלו. אין כאן עריכה — רק קריאה.
   */
  function renderManager() {
    let orders = 0, done = 0, openTasks = 0, late = [], soon = 0;
    state.projects.forEach(p => {
      if (isComplete(p)) { done++; return; }
      orders++;
      p.tasks.forEach(t => {
        if (t.status === 'pending') openTasks++;
        if (isLate(t)) late.push({ p, t, days: Math.abs(daysFromToday(t.date)) });
      });
      const ins = installISO(p);
      if (ins) { const d = daysFromToday(ins); if (d !== null && d >= 0 && d <= 30) soon++; }
    });
    late.sort((a, b) => b.days - a.days);   // הכי מאחר קודם

    setText('mgOrders', orders);
    setText('mgTasks', openTasks);
    setText('mgLate', late.length);
    setText('mgWeek', soon);
    setText('mgDone', done);

    setText('mgLateNote', late.length
      ? 'ממוין מהאיחור הגדול לקטן. ' + late.length + ' משימות על פני ' +
        new Set(late.map(x => x.p.id)).size + ' עבודות.'
      : 'אין משימות באיחור.');

    const lb = byId('mgLateBody');
    if (!lb) return;
    lb.innerHTML = '';
    if (!late.length) {
      const tr = el('tr');
      const td = el('td', 'empty-cell', 'הכל בזמן. 🎉'); td.colSpan = 7;
      tr.appendChild(td); lb.appendChild(tr);
    }
    late.forEach(({ p, t, days }) => {
      const tr = el('tr', 'row-late');
      const dTd = el('td', 'mono days-late');
      dTd.appendChild(el('span', 'days-pill' + (days > 14 ? ' sev' : ''), String(days)));
      tr.appendChild(dTd);
      tr.appendChild(el('td', 'mono tnum-cell', String(t.n)));
      tr.appendChild(el('td', null, esc(p.name) +
        (p.caseNum ? ' <span class="cli-case mono">' + esc(p.caseNum) + '</span>' : '')));
      tr.appendChild(el('td', null, esc(t.name)));
      const mk = makerById(p.maker);
      tr.appendChild(el('td', null, mk ? esc(mk.name) : '—'));
      tr.appendChild(el('td', null, esc(t.mgr || t.worker || '—')));
      tr.appendChild(el('td', 'mono', fmt(t.date)));
      lb.appendChild(tr);
    });

    // עומס לפי יצרן — כולל שורה לעבודות שאין להן יצרן
    const mb = byId('mgMakerBody');
    if (!mb) return;
    mb.innerHTML = '';
    const groups = state.makers.map(m => ({ m: m, ps: [] }));
    groups.push({ m: null, ps: [] });
    state.projects.forEach(p => {
      if (isComplete(p)) return;
      const g = groups.find(x => x.m ? x.m.id === p.maker : !makerById(p.maker));
      if (g) g.ps.push(p);
    });
    const rows = groups.filter(g => g.ps.length);
    if (!rows.length) {
      const tr = el('tr');
      const td = el('td', 'empty-cell', 'אין עבודות פעילות.'); td.colSpan = 6;
      tr.appendChild(td); mb.appendChild(tr);
    }
    rows.forEach(g => {
      const tr = el('tr');
      tr.appendChild(el('td', null, g.m ? esc(g.m.name) : 'ללא יצרן משויך'));
      const ct = el('td');
      if (g.m) ct.appendChild(el('span', 'cal-tag cal-' + g.m.country,
        esc((window.COUNTRY_CALS[g.m.country] || {}).name || '')));
      else ct.textContent = '—';
      tr.appendChild(ct);
      tr.appendChild(el('td', 'mono', String(g.ps.length)));
      let ot = 0, lt = 0, next = null;
      g.ps.forEach(p => {
        p.tasks.forEach(t => { if (t.status === 'pending') ot++; if (isLate(t)) lt++; });
        const ins = installISO(p);
        if (ins && (!next || ins < next)) next = ins;
      });
      tr.appendChild(el('td', 'mono', String(ot)));
      const ltd = el('td', 'mono');
      if (lt) ltd.appendChild(el('span', 'days-pill sev', String(lt)));
      else ltd.textContent = '—';
      tr.appendChild(ltd);
      tr.appendChild(el('td', 'mono', next ? fmt(next) : '—'));
      mb.appendChild(tr);
    });
  }

  /* ----- יצרנים ----- */
  function renderMakers() {
    const box = byId('makersBody');
    if (!box) return;
    box.innerHTML = '';
    if (!state.makers.length) {
      const tr = el('tr');
      const td = el('td', 'empty-cell', 'אין יצרנים עדיין. הוסיפו את הראשון למעלה.');
      td.colSpan = 7; tr.appendChild(td); box.appendChild(tr);
      return;
    }
    state.makers.forEach(m => {
      const projs = state.projects.filter(p => p.maker === m.id);
      const open = !!state.makerOpen[m.id];
      const tr = el('tr', open ? 'maker-open' : '');

      // שם + חץ פתיחה + מונה פרויקטים
      const nt = el('td', 'maker-name-cell');
      const head = el('div', 'maker-head');
      const chev = el('span', 'maker-chev', projs.length ? (open ? '\u25be' : '\u25b8') : '');
      head.appendChild(chev);
      const ni = el('input'); ni.type = 'text'; ni.className = 'cell-input'; ni.value = m.name || '';
      ni.addEventListener('change', () => { m.name = ni.value.trim(); saveMakers(); });
      ni.addEventListener('click', e => e.stopPropagation());
      head.appendChild(ni);
      const cnt = el('span', 'maker-count', String(projs.length));
      cnt.title = projs.length + ' פרויקטים';
      head.appendChild(cnt);
      if (projs.length) head.addEventListener('click', () => {
        state.makerOpen[m.id] = !open; renderMakers();
      });
      nt.appendChild(head); tr.appendChild(nt);

      // מדינה — קובעת את לוח החגים ואת סוף השבוע של שלבי הייצור
      const ct = el('td');
      const cs = el('select', 'cell-select');
      Object.keys(window.COUNTRY_CALS).forEach(k => {
        const o = el('option', null, window.COUNTRY_CALS[k].name);
        o.value = k; if (m.country === k) o.selected = true;
        cs.appendChild(o);
      });
      cs.addEventListener('change', () => {
        m.country = cs.value;
        if (!isOverseas(m.country)) { m.needPowder = false; m.needBars = false; }
        saveMakers();
        state.projects.forEach(p => {
          if (p.maker === m.id) { applyMakerDefaults(p); recalcProject(p); }
        });
        save(); render();
      });
      ct.appendChild(cs); tr.appendChild(ct);

      const wt = el('td', 'cal-cells');
      wt.appendChild(el('span', 'cal-tag cal-' +
        (window.CALENDARS[m.country] ? m.country : 'all'),
        (window.CALENDARS[m.country] || {}).weekend
          ? 'מנוחה: ' + (window.CALENDARS[m.country].weekend.map(w => DOW[w]).join(', '))
          : '—'));
      tr.appendChild(wt);

      // מה נשלח אליו מקליל
      const st = el('td', 'ship-cells');
      if (!isOverseas(m.country)) {
        // יצרן בארץ — אין מה לשלוח אליו
        st.appendChild(el('span', 'no-ship', 'לא נדרש — יצרן בארץ'));
      } else {
        [['needPowder', 'אבקה'], ['needBars', 'מוטות']].forEach(([k, label]) => {
          const b = el('button', 'cal-toggle' + (m[k] ? ' on cal-cy' : ''), label);
          b.addEventListener('click', () => {
            m[k] = !m[k]; saveMakers();
            state.projects.forEach(p => { if (p.maker === m.id) applyMakerDefaults(p); });
            save(); render();
          });
          st.appendChild(b);
        });
      }
      tr.appendChild(st);

      [['phone'], ['mail']].forEach(([k]) => {
        const td = el('td');
        const i = el('input'); i.type = 'text'; i.className = 'cell-input'; i.value = m[k] || '';
        i.addEventListener('change', () => { m[k] = i.value.trim(); saveMakers(); });
        td.appendChild(i); tr.appendChild(td);
      });

      const dt = el('td');
      const x = el('button', 'del-x', '✕'); x.title = 'מחיקה';
      x.addEventListener('click', () => {
        state.makers = state.makers.filter(y => y.id !== m.id);
        state.projects.forEach(p => { if (p.maker === m.id) p.maker = ''; });
        saveMakers(); save(); render();
      });
      dt.appendChild(x); tr.appendChild(dt);
      box.appendChild(tr);

      // פאנל הפרויקטים של היצרן — נפתח בלחיצה על שמו
      if (open) {
        const er = el('tr', 'maker-projects');
        const ec = el('td'); ec.colSpan = 7;
        if (!projs.length) {
          ec.appendChild(el('div', 'mp-empty', 'אין פרויקטים משויכים ליצרן זה.'));
        } else {
          projs.sort((a, b) => (installISO(a) || '9999') < (installISO(b) || '9999') ? -1 : 1);
          projs.forEach(p => {
            const row = el('div', 'mp-row');
            const nm = el('div', 'mp-name');
            nm.appendChild(el('span', 'mp-cli', esc(p.name)));
            if (p.caseNum) nm.appendChild(el('span', 'mp-case mono', esc(p.caseNum)));
            row.appendChild(nm);

            // סטטוס כללי
            const ins = installISO(p);
            row.appendChild(el('span', 'mp-date mono', ins ? 'מסירה: ' + fmt(ins) : 'ללא מועד'));

            // איחור
            const late = projectLate(p);
            if (isComplete(p)) {
              row.appendChild(el('span', 'mp-badge ok', 'הושלם'));
            } else if (late > 0) {
              row.appendChild(el('span', 'mp-badge bad', 'מאחר ' + late + ' ימים'));
            } else {
              row.appendChild(el('span', 'mp-badge ontime', 'בזמן'));
            }
            ec.appendChild(row);
          });
        }
        er.appendChild(ec);
        box.appendChild(er);
      }
    });
  }
  function saveMakers() { writeList(LS_MAKERS, state.makers); }

  /* ----- מסך נתונים (מקביל לגיליון Data) ----- */
  function dataRows() {
    const q = state.dataSearch.trim().toLowerCase();
    const rows = [];
    state.projects.forEach(p => {
      const pstatus = isComplete(p) ? 'הושלם' : 'בתהליך';
      p.tasks.forEach(t => {
        if (state.dataStatus && t.status !== state.dataStatus) return;
        if (state.lateOnly && !isLate(t)) return;
        if (q) {
          const hay = (p.name + ' ' + (p.caseNum || '') + ' ' + t.name).toLowerCase();
          if (hay.indexOf(q) === -1) return;
        }
        rows.push({
          name: p.name, caseNum: p.caseNum || '', pstatus: pstatus,
          task: t.name, n: t.n, tstatus: STATUS_LABEL[t.status],
          statusKey: t.status, date: t.date || ''
        });
      });
    });
    const k = state.dataSort;
    rows.sort((a, b) => {
      let x = a[k], y = b[k];
      if (k === 'n') { x = +x; y = +y; }
      if (x === y) return a.name < b.name ? -1 : 1;
      if (x === '' || x == null) return 1;
      if (y === '' || y == null) return -1;
      return (x < y ? -1 : 1) * (state.dataDesc ? -1 : 1);
    });
    return rows;
  }
  function renderData() {
    if (!byId('dataBody')) return;   // המסך הוסר
    const rows = dataRows();
    setText('dataCount', rows.length + ' שורות');
    document.querySelectorAll('#view-data th[data-sort]').forEach(th => {
      th.classList.toggle('sorted', th.dataset.sort === state.dataSort);
      th.classList.toggle('desc', th.dataset.sort === state.dataSort && state.dataDesc);
    });

    const box = byId('dataBody');
    if (!box) return;
    box.innerHTML = '';
    if (!rows.length) {
      const tr = el('tr'); const td = el('td', 'empty-cell', 'אין שורות מתאימות.');
      td.colSpan = 7; tr.appendChild(td); box.appendChild(tr);
      return;
    }
    rows.forEach(r => {
      const tr = el('tr');
      tr.appendChild(el('td', null, esc(r.name)));
      tr.appendChild(el('td', 'mono', esc(r.caseNum)));
      tr.appendChild(el('td', null, esc(r.pstatus)));
      tr.appendChild(el('td', null, esc(r.task)));
      tr.appendChild(el('td', 'mono', String(r.n)));
      const st = el('td');
      st.appendChild(el('span', 'pill-sm ' + r.statusKey, esc(r.tstatus)));
      tr.appendChild(st);
      tr.appendChild(el('td', 'mono', fmt(r.date)));
      box.appendChild(tr);
    });
  }

  /*
   * exportCsv — ייצוא מסך הנתונים לקובץ שנפתח באקסל.
   * BOM בתחילת הקובץ כדי שאקסל יזהה עברית ב-UTF-8.
   */
  function exportCsv() {
    const head = ['לקוח', 'מס. תיק', 'סטטוס', 'משימה', 'מס. משימה', 'סטטוס משימה', 'ת. התחלה'];
    const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const lines = [head.map(q).join(',')];
    dataRows().forEach(r => {
      lines.push([r.name, r.caseNum, r.pstatus, r.task, r.n, r.tstatus, fmt(r.date)].map(q).join(','));
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'klil-data-' + todayISO() + '.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  /* ----- holidays view ----- */
  function renderHolidays() {
    // כפתורי סינון לפי לוח
    const fbox = byId('holFilters');
    if (!fbox) return;
    fbox.innerHTML = '';
    const opts = [{ k: 'all', label: 'הכל' }].concat(
      CAL_ORDER.map(k => ({ k, label: window.CALENDARS[k].name })));
    opts.forEach(o => {
      const b = el('button', 'cal-chip cal-' + o.k + (state.holFilter === o.k ? ' active' : ''), o.label);
      b.addEventListener('click', () => { state.holFilter = o.k; renderHolidays(); });
      fbox.appendChild(b);
    });

    const box = byId('holBody');
    if (!box) return;
    box.innerHTML = '';
    const fromYear = todayISO().slice(0, 4) + '-01-01';
    const rows = currentHolidays().filter(h => h.date >= fromYear)
      .filter(h => state.holFilter === 'all' || h.cal === state.holFilter || h.cal === 'all');

    if (!rows.length) {
      const tr = el('tr');
      const td = el('td', 'empty-cell', 'אין ימים להצגה בלוח זה.');
      td.colSpan = 4; tr.appendChild(td); box.appendChild(tr);
      return;
    }

    rows.forEach(h => {
      const tr = el('tr');
      tr.appendChild(el('td', 'mono', fmt(h.date)));
      const calName = h.cal === 'all' ? 'כל הלוחות' : window.CALENDARS[h.cal].name;
      const ct = el('td');
      ct.appendChild(el('span', 'cal-tag cal-' + h.cal, esc(calName)));
      tr.appendChild(ct);
      tr.appendChild(el('td', null, esc(h.name)));
      const td = el('td');
      const x = el('button', 'del-x', '✕'); x.title = 'הסרה';
      x.addEventListener('click', () => {
        const del = readList(LS_HOL_DEL); if (!del.includes(h.date)) del.push(h.date);
        writeList(LS_HOL_DEL, del);
        writeList(LS_HOL_ADD, readList(LS_HOL_ADD).filter(a => a.date !== h.date));
        refreshHolidaySet(); render();
      });
      td.appendChild(x); tr.appendChild(td);
      box.appendChild(tr);
    });
  }

  /* ----- rules view ----- */
  function renderRules() {
    // טבלה 1 — כללי הגזירה
    const box = byId('rulesBody');
    if (!box) return;
    box.innerHTML = '';
    const saved = readObj(LS_GAPS);

    DEPENDENCY_RULES.forEach(r => {
      const tr = el('tr');
      tr.appendChild(el('td', 'mono', '#' + r.from));
      tr.appendChild(el('td', null, esc(TASK_TEMPLATE[r.from - 1])));
      tr.appendChild(el('td', 'mono', '#' + r.to));
      tr.appendChild(el('td', null, esc(TASK_TEMPLATE[r.to - 1])));

      // המרווח — ניתן לעריכה. ערך שלילי = חישוב אחורה מהבסיס.
      const gTd = el('td', 'gap-cell');
      const inp = el('input'); inp.type = 'number'; inp.className = 'gap-input';
      const cur = saved[r.key] !== undefined ? saved[r.key] : GAP_DEFAULTS[r.key];
      inp.value = cur;
      inp.addEventListener('change', () => {
        const v = parseInt(inp.value, 10);
        const m = readObj(LS_GAPS);
        if (isNaN(v)) { delete m[r.key]; }
        else if (v === GAP_DEFAULTS[r.key]) { delete m[r.key]; }
        else { m[r.key] = v; }
        writeObj(LS_GAPS, m);
        refreshGaps();
        recalcAll();
        save(); render();
      });
      gTd.appendChild(inp);
      gTd.appendChild(el('span', 'gap-unit', 'ימים'));
      if (saved[r.key] !== undefined) {
        gTd.appendChild(el('span', 'gap-changed', 'שונה · ברירת מחדל ' + GAP_DEFAULTS[r.key]));
      }
      if (GAP_DEFAULTS[r.key] < 0) {
        gTd.appendChild(el('span', 'gap-unit', '(אחורה)'));
      }
      tr.appendChild(gTd);
      box.appendChild(tr);
    });

    // חסימות — תצוגה בלבד
    BLOCKING_RULES.forEach(r => {
      const tr = el('tr', 'block-row');
      tr.appendChild(el('td', 'mono', '#' + r.from));
      tr.appendChild(el('td', null, esc(TASK_TEMPLATE[r.from - 1])));
      tr.appendChild(el('td', 'mono', '#' + r.to));
      tr.appendChild(el('td', null, esc(TASK_TEMPLATE[r.to - 1])));
      tr.appendChild(el('td', null, '<span class="block-tag">חוסם</span> ' + esc(r.note)));
      box.appendChild(tr);
    });

    // טבלה 2 — שיוך לוח חגים לכל שלב
    const cbox = byId('calsBody');
    if (!cbox) return;
    cbox.innerHTML = '';
    const map = readObj(LS_TASK_CALS);
    DISPLAY_ORDER.forEach(n => {
      const factory = FACTORY_TASKS.indexOf(n) !== -1;
      const cur = map[n] || DEFAULT_TASK_CALS[n] || ['il', 'is'];
      const tr = el('tr');
      tr.appendChild(el('td', 'mono', '#' + n));
      const nameTd = el('td');
      nameTd.appendChild(el('span', null, esc(TASK_TEMPLATE[n - 1])));
      if (factory && !map[n]) {
        nameTd.appendChild(el('span', 'auto-tag', 'לפי מדינת היצרן'));
      }
      tr.appendChild(nameTd);
      const td = el('td', 'cal-cells');
      CAL_ORDER.forEach(k => {
        const on = cur.indexOf(k) !== -1;
        const b = el('button', 'cal-toggle cal-' + k + (on ? ' on' : ''), window.CALENDARS[k].name);
        b.addEventListener('click', () => {
          const m = readObj(LS_TASK_CALS);
          const list = (m[n] || DEFAULT_TASK_CALS[n] || ['il', 'is']).slice();
          const i = list.indexOf(k);
          if (i === -1) list.push(k); else list.splice(i, 1);
          m[n] = list;
          writeObj(LS_TASK_CALS, m);
          refreshTaskCals();
          renderRules();
        });
        td.appendChild(b);
      });
      if (map[n]) {
        const r = el('button', 'cal-toggle reset', '↺');
        r.title = 'חזרה לברירת המחדל';
        r.addEventListener('click', () => {
          const m = readObj(LS_TASK_CALS); delete m[n];
          writeObj(LS_TASK_CALS, m); refreshTaskCals(); renderRules();
        });
        td.appendChild(r);
      }
      tr.appendChild(td);
      cbox.appendChild(tr);
    });
  }

  /* ============================================================
   *  EVENTS / INIT
   * ============================================================ */
  function bind() {
    document.querySelectorAll('.tab').forEach(t =>
      t.addEventListener('click', () => {
        state.view = t.dataset.view;
        state.confirmDelete = null;
        /*
         * כניסה לדשבורד תמיד מתחילה בשבוע הנוכחי: זו התמונה שרוצים
         * לראות ברגע הראשון. המבט הרחב נשאר בלחיצה אחת על 'חודש' או
         * 'חודשיים', אבל אינו נדבק בין כניסות.
         */
        if (state.view === 'board') {
          state.boardRange = 'week';
          state.boardStart = weekStart(todayISO());
        }
        render();
      }));

    on('search', 'input', e => { state.search = e.target.value; renderProjects(); });
    const ut = byId('urgentToggle');
    ut.addEventListener('click', () => {
      state.urgentOnly = !state.urgentOnly;
      ut.classList.toggle('active', state.urgentOnly);
      setChecked('urgentCheck', state.urgentOnly);
      renderProjects();
    });

    const form = byId('newForm');
    on('newBtn', 'click', () => {
      // רענון רשימת היצרנים בטופס בכל פתיחה
      const ms = byId('newMaker');
      if (!ms) return;
      ms.innerHTML = '';
      const n0 = el('option', null, '— לא נבחר —'); n0.value = ''; ms.appendChild(n0);
      state.makers.forEach(m => {
        const o = el('option', null, m.name + ' · ' + (window.COUNTRY_CALS[m.country] || {}).name);
        o.value = m.id; ms.appendChild(o);
      });
      form.classList.toggle('open');
    });
    on('newCancel', 'click', () => form.classList.remove('open'));
    on('newSave', 'click', () => {
      const name = val('newName').trim();
      if (!name) { focusOn('newName'); return; }
      const p = newProject(name,
        val('newCase').trim(),
        val('newType'));
      p.maker = val('newMaker');
      applyMakerDefaults(p);
      state.projects.unshift(p); state.openIds[p.id] = true;
      setVal('newName', ''); setVal('newCase', '');
      form.classList.remove('open'); save(); render();
    });

    // board nav
    const step = () => (RANGE_DAYS[state.boardRange] || 62);
    on('boardPrev', 'click', () => {
      state.boardStart = toISO(addDays(fromISO(state.boardStart), -step())); renderBoard();
    });
    on('boardNext', 'click', () => {
      state.boardStart = toISO(addDays(fromISO(state.boardStart), step())); renderBoard();
    });
    on('boardToday', 'click', () => {
      state.boardStart = weekStart(todayISO()); renderBoard();
    });
    document.querySelectorAll('#rangeSwitch button').forEach(b => {
      b.addEventListener('click', () => { state.boardRange = b.dataset.range; renderBoard(); });
    });
    on('lateToggle', 'click', () => {
      state.lateOnly = !state.lateOnly; render();
    });

    // לקוחות
    on('custSearch', 'input', e => {
      state.custSearch = e.target.value; renderCustomers();
    });
    on('custAdd', 'click', () => {
      const nm = val('custName').trim();
      if (!nm) { focusOn('custName'); return; }
      if (!state.customers.some(c => c.name === nm)) {
        state.customers.push({ name: nm, phone: '', mail: '', addr: '' });
        writeList(LS_CUSTOMERS, state.customers);
      }
      setVal('custName', '');
      render();
    });

    // יצרנים — הוספה
    on('mAdd', 'click', () => {
      const nm = val('mName').trim();
      if (!nm) { focusOn('mName'); return; }
      state.makers.push({
        id: 'm' + Date.now() + Math.floor(Math.random() * 1000),
        name: nm,
        country: val('mCountry'),
        phone: val('mPhone').trim(),
        mail: val('mMail').trim(),
        needPowder: false, needBars: false
      });
      ['mName', 'mPhone', 'mMail'].forEach(i => byId(i).value = '');
      saveMakers(); render();
    });

    // אנשי קשר — הוספה
    on('cAdd', 'click', () => {
      const nm = val('cName').trim();
      if (!nm) { focusOn('cName'); return; }
      state.contacts.push({
        id: 'c' + Date.now() + Math.floor(Math.random() * 1000),
        name: nm,
        role: val('cRole').trim(),
        phone: val('cPhone').trim(),
        mail: val('cMail').trim()
      });
      ['cName', 'cRole', 'cPhone', 'cMail'].forEach(i => byId(i).value = '');
      writeList(LS_CONTACTS, state.contacts); render();
    });

    // ניווט במסך 'פעולה יומית'
    on('dayPrev', 'click', () => {
      state.dayPick = toISO(addDays(fromISO(state.dayPick || todayISO()), -1)); renderDaily();
    });
    on('dayNext', 'click', () => {
      state.dayPick = toISO(addDays(fromISO(state.dayPick || todayISO()), 1)); renderDaily();
    });
    on('dayToday', 'click', () => {
      state.dayPick = todayISO(); renderDaily();
    });
    on('dayPick', 'change', e => {
      if (e.target.value) { state.dayPick = e.target.value; renderDaily(); }
    });

    // מסך נתונים: חיפוש, סינון, מיון וייצוא
    on('dataSearch', 'input', e => { state.dataSearch = e.target.value; renderData(); });
    on('dataStatus', 'change', e => { state.dataStatus = e.target.value; renderData(); });
    on('btnCsv', 'click', exportCsv);
    document.querySelectorAll('#view-data th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        if (state.dataSort === k) state.dataDesc = !state.dataDesc;
        else { state.dataSort = k; state.dataDesc = false; }
        renderData();
      });
    });


    // add holiday
    on('holAdd', 'click', () => {
      const d = val('holDate');
      const n = val('holName').trim() || 'חג / יום חופש';
      if (!d) { focusOn('holDate'); return; }
      const add = readList(LS_HOL_ADD).filter(a => a.date !== d);
      add.push({ date: d, name: n }); writeList(LS_HOL_ADD, add);
      writeList(LS_HOL_DEL, readList(LS_HOL_DEL).filter(x => x !== d));
      setVal('holDate', ''); setVal('holName', '');
      refreshHolidaySet(); render();
    });

    // export / import
    on('btnExport', 'click', exportData);
    on('importFile', 'change', importData);
    on('btnImport', 'click', () => { const f = byId('importFile'); if (f) f.click(); });
  }

  function exportData() {
    const blob = {
      projects: state.projects,
      holidaysAdded: readList(LS_HOL_ADD),
      holidaysRemoved: readList(LS_HOL_DEL),
      taskCals: readObj(LS_TASK_CALS),
      contacts: state.contacts,
      makers: state.makers,
      gaps: readObj(LS_GAPS),
      customers: state.customers,
      exportedAt: new Date().toISOString()
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(blob, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'klil-tracker-' + todayISO() + '.json'; a.click();
    URL.revokeObjectURL(url);
  }
  function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const b = JSON.parse(reader.result);
        if (Array.isArray(b.projects)) { state.projects = b.projects; state.projects.forEach(migrate); }
        if (Array.isArray(b.holidaysAdded)) writeList(LS_HOL_ADD, b.holidaysAdded);
        if (Array.isArray(b.holidaysRemoved)) writeList(LS_HOL_DEL, b.holidaysRemoved);
        if (b.taskCals && typeof b.taskCals === 'object') writeObj(LS_TASK_CALS, b.taskCals);
        if (Array.isArray(b.contacts)) { state.contacts = b.contacts; writeList(LS_CONTACTS, b.contacts); }
        if (Array.isArray(b.makers)) { state.makers = b.makers; writeList(LS_MAKERS, b.makers); }
        if (b.gaps && typeof b.gaps === 'object') { writeObj(LS_GAPS, b.gaps); refreshGaps(); }
        if (Array.isArray(b.customers)) { state.customers = b.customers; writeList(LS_CUSTOMERS, b.customers); }
        refreshHolidaySet(); refreshTaskCals(); save(); render();
        alert('הנתונים נטענו בהצלחה.');
      } catch (err) { alert('קובץ לא תקין.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /*
   * safe — מריץ שלב אתחול ומבודד כישלון שלו.
   * קריטי: bind() חייב לרוץ תמיד. אם שלב מוקדם נופל (למשל כשקובץ קוד
   * אחד נשאר ישן במטמון הדפדפן ופונקציה שהוא אמור לספק חסרה), בלי
   * הבידוד הזה הכפתורים כלל לא מתחברים והדף נראה תקוע.
   */
  function safe(label, fn) {
    try { fn(); return true; }
    catch (err) {
      if (window.console) console.error('כשל בשלב "' + label + '":', err);
      initErrors.push(label);
      return false;
    }
  }
  const initErrors = [];

  /* הודעה גלויה למשתמש כשהאתחול לא הושלם — עדיף על דף אילם */
  function showInitError() {
    if (!initErrors.length) return;
    const bar = el('div', 'init-error');
    bar.innerHTML = '<strong>הכלי נטען חלקית.</strong> ' +
      'כנראה שקובץ קוד נשאר ישן בזיכרון הדפדפן. ' +
      'סגרו את הלשונית ופתחו מחדש את הקובץ, או רעננו עם Ctrl+Shift+R. ' +
      '<span class="mono">(' + initErrors.join(', ') + ')</span>';
    const wrap = document.querySelector('.wrap');
    if (wrap) wrap.insertBefore(bar, wrap.firstChild);
  }


  /* ---------- נתוני הדגמה ---------- */
  function shiftISO(iso, n) { return toISO(addDays(fromISO(iso), n)); }
  function wantDemo() {
    const h = location.hostname || '';
    const forced = /[?&]demo=1\b/.test(location.search);
    let empty = true;
    try { empty = !localStorage.getItem(LS_PROJECTS) && !localStorage.getItem(LS_MAKERS); } catch (e) {}
    return !!window.DEMO && empty && (forced || /github\.io$/.test(h));
  }
  function seedDemo() {
    const D = window.DEMO, today = todayISO();
    state.makers = D.makers.map(m => Object.assign({ phone: '', mail: '', needPowder: false, needBars: false }, m));
    state.projects = D.projects.map((row, i) => {
      const [name, mid, mode, late, off] = row;
      const p = newProject(name, '2026-' + (101 + i));
      p.maker = mid;
      applyMakerDefaults(p);
      const want = shiftISO(today, off);
      // שלבי הזרע: התאריכים שמהם המנוע גוזר את כל השאר
      const seeds = isOverseas((makerById(mid) || {}).country)
        ? [[1, -75], [5, -65], [20, -45]]
        : [[1, -75], [2, -70], [5, -65], [9, -58]];
      seeds.forEach(([n, d]) => applyDate(p, n, shiftISO(want, d)));
      const r = applyDate(p, 17, want);
      if (!r.ok) applyDate(p, 17, r.earliest);
      let cut = today;
      if (mode === 'late') {
        // משאירים 'פתוחות' אחת עד שלוש משימות שכבר עבר מועדן — האיחור משתנה בין פרויקטים
        const past = p.tasks.filter(t => t.status !== 'na' && t.date && t.date < today)
          .map(t => t.date).sort();
        if (past.length) cut = past[Math.max(0, past.length - 1 - (late % 3))];
      }
      p.tasks.forEach(t => {
        if (t.status === 'na') return;
        if (mode === 'done' || (t.date && t.date < cut)) t.status = 'done';
      });
      const t17 = p.tasks.find(t => t.n === 17);
      if (mode === 'done' && t17) t17.actualDate = t17.date;
      return p;
    });
    save(); saveMakers();
  }

  function init() {
    safe('נתוני הדגמה', () => { if (wantDemo()) { load(); seedDemo(); } });
    safe('טעינת נתונים', load);
    safe('לוחות חגים', refreshHolidaySet);
    safe('שיוך לוחות לשלבים', refreshTaskCals);
    safe('מרווחי ימים', refreshGaps);
    safe('תאריכי פתיחה', () => {
      state.boardStart = weekStart(todayISO());
      state.dayPick = todayISO();
    });
    safe('חיבור כפתורים', bind);   // חייב לרוץ גם אם קדמו לו כשלים
    safe('ציור המסך', render);
    showInitError();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
