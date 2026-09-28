/*
 * app.js — לוגיקת האפליקציה: מצב, שמירה, רינדור ואירועים.
 * ------------------------------------------------------------
 * מסכים: פרויקטים | לוח שבועי | משימות היום | חגים | כללי חישוב
 * שמירה: localStorage (בדפדפן המקומי). ראו README לגבי גיבוי/שיתוף.
 */

(function () {
  'use strict';

  const LS_PROJECTS = 'shachaf_projects_v1';
  const LS_HOL_ADD  = 'shachaf_holidays_added_v1';   // תוספות משתמש
  const LS_HOL_DEL  = 'shachaf_holidays_removed_v1'; // הסרות משתמש

  const STATUS_LABEL = { done: 'בוצע', pending: 'לא בוצע', na: 'לא רלוונטי' };
  const STATUS_CYCLE = { pending: 'done', done: 'na', na: 'pending' };
  const DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  let state = {
    projects: [],
    search: '',
    urgentOnly: false,
    openIds: {},
    view: 'projects',
    boardStart: null,   // ISO של תחילת השבוע המוצג
    confirmDelete: null
  };

  /* ---------- storage ---------- */
  function load() {
    try { state.projects = JSON.parse(localStorage.getItem(LS_PROJECTS)) || []; }
    catch (e) { state.projects = []; }
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

  /* ---------- holidays (merge default + user) ---------- */
  function currentHolidays() {
    const added = readList(LS_HOL_ADD);   // [{date,name}]
    const removed = new Set(readList(LS_HOL_DEL)); // [date]
    const map = new Map();
    (window.DEFAULT_HOLIDAYS || []).forEach(h => map.set(h.date, h.name));
    added.forEach(h => map.set(h.date, h.name));
    removed.forEach(d => map.delete(d));
    return [...map.entries()].map(([date, name]) => ({ date, name })).sort((a, b) => a.date < b.date ? -1 : 1);
  }
  function refreshHolidaySet() {
    setHolidaySet(new Set(currentHolidays().map(h => h.date)));
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
  function newProject(name, caseNum) {
    return {
      id: 'p' + Date.now() + Math.floor(Math.random() * 1000),
      name: name, caseNum: caseNum || '', createdAt: todayISO(),
      tasks: TASK_TEMPLATE.map((nm, i) => ({ n: i + 1, name: nm, status: 'pending', date: null }))
    };
  }
  function progressOf(p) {
    let done = 0, total = 0;
    p.tasks.forEach(t => { if (t.status !== 'na') { total++; if (t.status === 'done') done++; } });
    return { done, total: total || 1 };
  }
  function nextTask(p) { return p.tasks.find(t => t.status === 'pending') || null; }
  function installISO(p) { return p.tasks[16] ? p.tasks[16].date : null; } // משימה 17
  function overdueCount(p) {
    return p.tasks.filter(t => t.status === 'pending' && t.date && daysFromToday(t.date) < 0).length;
  }
  function isComplete(p) { const pr = progressOf(p); return pr.done >= pr.total; }

  /* ---------- date cascade wiring ---------- */
  function applyDate(project, taskIndex1, iso) {
    const dates = project.tasks.map(t => t.date);
    dates[taskIndex1 - 1] = iso || null;
    const out = iso ? cascade(dates, taskIndex1) : dates;
    project.tasks.forEach((t, i) => { t.date = out[i]; });
  }

  /* ============================================================
   *  RENDER
   * ============================================================ */
  function render() {
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.view === state.view));
    document.querySelectorAll('.view').forEach(v =>
      v.classList.toggle('active', v.id === 'view-' + state.view));
    if (state.view === 'projects') renderProjects();
    else if (state.view === 'board') renderBoard();
    else if (state.view === 'today') renderToday();
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
    document.getElementById('kpiActive').textContent = active;
    document.getElementById('kpiOverdue').textContent = overdue;
    document.getElementById('kpiWeek').textContent = week;
    document.getElementById('kpiDone').textContent = done;

    const list = document.getElementById('list');
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
    nb.appendChild(el('div', 'case', 'מס\' תיק: ' + (p.caseNum ? '<span class="mono">' + esc(p.caseNum) + '</span>' : '—')));
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
    p.tasks.forEach(t => {
      const row = el('div', 'task-row' + (t.status === 'pending' && t.date && daysFromToday(t.date) < 0 ? ' overdue' : ''));
      row.appendChild(el('div', 'task-num', String(t.n)));
      row.appendChild(el('div', 'task-name', esc(t.name)));

      const sb = el('button', 'status-btn ' + t.status, STATUS_LABEL[t.status]);
      sb.addEventListener('click', () => { t.status = STATUS_CYCLE[t.status]; save(); render(); });
      row.appendChild(sb);

      const dw = el('div', 'task-date');
      const di = el('input'); di.type = 'date'; di.value = t.date || '';
      di.addEventListener('change', () => {
        applyDate(p, t.n, di.value || null);
        save(); render();
      });
      dw.appendChild(di); row.appendChild(dw);

      // מחוון: האם למשימה יש גזירה אוטומטית (מסומן בגוון ברונזה)
      const hasRule = DEPENDENCY_RULES.some(r => r.from === t.n);
      row.appendChild(el('div', 'task-auto', hasRule ? '⟳' : ''));
      body.appendChild(row);
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

  /* ----- weekly board view ----- */
  function weekStart(iso) {
    // מגלגל אחורה ליום ראשון
    let d = fromISO(iso);
    while (d.getUTCDay() !== 0) d = addDays(d, -1);
    return toISO(d);
  }
  function renderBoard() {
    if (!state.boardStart) state.boardStart = weekStart(todayISO());
    document.getElementById('boardLabel').textContent =
      'שבוע ' + fmt(state.boardStart);

    const grid = document.getElementById('boardGrid');
    grid.innerHTML = '';
    const start = fromISO(state.boardStart);
    // 5 ימי עבודה: ראשון–חמישי
    for (let i = 0; i < 5; i++) {
      const day = addDays(start, i);
      const dayISO = toISO(day);
      const col = el('div', 'day-col' + (dayISO === todayISO() ? ' today' : ''));
      const head = el('div', 'day-head');
      head.appendChild(el('div', 'dow', DOW[day.getUTCDay()]));
      head.appendChild(el('div', 'dt', fmt(dayISO)));
      col.appendChild(head);
      const bd = el('div', 'day-body');

      const items = [];
      state.projects.forEach(p => {
        if (isComplete(p)) return;
        p.tasks.forEach(t => {
          if (t.status === 'na' || !t.date) return;
          if (t.date === dayISO) items.push({ p, t });
        });
      });
      if (!items.length) bd.appendChild(el('div', 'day-empty', '—'));
      items.forEach(({ p, t }) => {
        const it = el('div', 'board-item' + (t.n === 17 ? ' install' : ''));
        it.appendChild(el('span', 'cli', esc(p.name)));
        it.appendChild(el('span', 'tsk', (t.n === 17 ? '🔧 ' : '') + esc(t.name)));
        bd.appendChild(it);
      });
      col.appendChild(bd);
      grid.appendChild(col);
    }
  }

  /* ----- today view ----- */
  function renderToday() {
    const box = document.getElementById('todayList');
    box.innerHTML = '';
    document.getElementById('todayDate').textContent = fmt(todayISO()) + ' · ' + DOW[fromISO(todayISO()).getUTCDay()];
    const rows = [];
    state.projects.forEach(p => {
      if (isComplete(p)) return;
      p.tasks.forEach(t => {
        if (t.status === 'pending' && t.date && t.date === todayISO()) rows.push({ p, t });
      });
    });
    if (!rows.length) { box.appendChild(el('div', 'empty', 'אין משימות מתוכננות להיום. 🎉')); return; }
    rows.forEach(({ p, t }) => {
      const r = el('div', 'report-item');
      r.appendChild(el('span', 'cli', esc(p.name)));
      r.appendChild(el('span', 'tsk', '#' + t.n + ' · ' + esc(t.name)));
      const sb = el('button', 'status-btn pending', 'סמן כבוצע');
      sb.addEventListener('click', () => { t.status = 'done'; save(); render(); });
      r.appendChild(sb);
      box.appendChild(r);
    });
  }

  /* ----- holidays view ----- */
  function renderHolidays() {
    const box = document.getElementById('holBody');
    box.innerHTML = '';
    const removed = new Set(readList(LS_HOL_DEL));
    currentHolidays().filter(h => h.date >= todayISO().slice(0, 4) + '-01-01').forEach(h => {
      const tr = el('tr');
      tr.appendChild(el('td', 'mono', fmt(h.date)));
      tr.appendChild(el('td', null, esc(h.name)));
      const td = el('td');
      const x = el('button', 'del-x', '✕'); x.title = 'הסרה';
      x.addEventListener('click', () => {
        const del = readList(LS_HOL_DEL); if (!del.includes(h.date)) del.push(h.date);
        writeList(LS_HOL_DEL, del);
        // הסרה גם מתוספות משתמש אם קיימת שם
        writeList(LS_HOL_ADD, readList(LS_HOL_ADD).filter(a => a.date !== h.date));
        refreshHolidaySet(); render();
      });
      td.appendChild(x); tr.appendChild(td);
      box.appendChild(tr);
    });
  }

  /* ----- rules view ----- */
  function renderRules() {
    const box = document.getElementById('rulesBody');
    box.innerHTML = '';
    DEPENDENCY_RULES.forEach(r => {
      const tr = el('tr');
      tr.appendChild(el('td', 'mono', '#' + r.from));
      tr.appendChild(el('td', null, esc(TASK_TEMPLATE[r.from - 1])));
      tr.appendChild(el('td', 'mono', '#' + r.to));
      tr.appendChild(el('td', null, esc(TASK_TEMPLATE[r.to - 1])));
      tr.appendChild(el('td', 'mono', r.gap));
      box.appendChild(tr);
    });
  }

  /* ============================================================
   *  EVENTS / INIT
   * ============================================================ */
  function bind() {
    document.querySelectorAll('.tab').forEach(t =>
      t.addEventListener('click', () => { state.view = t.dataset.view; state.confirmDelete = null; render(); }));

    document.getElementById('search').addEventListener('input', e => { state.search = e.target.value; renderProjects(); });
    const ut = document.getElementById('urgentToggle');
    ut.addEventListener('click', () => {
      state.urgentOnly = !state.urgentOnly;
      ut.classList.toggle('active', state.urgentOnly);
      document.getElementById('urgentCheck').checked = state.urgentOnly;
      renderProjects();
    });

    const form = document.getElementById('newForm');
    document.getElementById('newBtn').addEventListener('click', () => form.classList.toggle('open'));
    document.getElementById('newCancel').addEventListener('click', () => form.classList.remove('open'));
    document.getElementById('newSave').addEventListener('click', () => {
      const name = document.getElementById('newName').value.trim();
      if (!name) { document.getElementById('newName').focus(); return; }
      const p = newProject(name, document.getElementById('newCase').value.trim());
      state.projects.unshift(p); state.openIds[p.id] = true;
      document.getElementById('newName').value = ''; document.getElementById('newCase').value = '';
      form.classList.remove('open'); save(); render();
    });

    // board nav
    document.getElementById('boardPrev').addEventListener('click', () => {
      state.boardStart = toISO(addDays(fromISO(state.boardStart), -7)); renderBoard();
    });
    document.getElementById('boardNext').addEventListener('click', () => {
      state.boardStart = toISO(addDays(fromISO(state.boardStart), 7)); renderBoard();
    });
    document.getElementById('boardToday').addEventListener('click', () => {
      state.boardStart = weekStart(todayISO()); renderBoard();
    });

    // add holiday
    document.getElementById('holAdd').addEventListener('click', () => {
      const d = document.getElementById('holDate').value;
      const n = document.getElementById('holName').value.trim() || 'חג / יום חופש';
      if (!d) { document.getElementById('holDate').focus(); return; }
      const add = readList(LS_HOL_ADD).filter(a => a.date !== d);
      add.push({ date: d, name: n }); writeList(LS_HOL_ADD, add);
      writeList(LS_HOL_DEL, readList(LS_HOL_DEL).filter(x => x !== d));
      document.getElementById('holDate').value = ''; document.getElementById('holName').value = '';
      refreshHolidaySet(); render();
    });

    // export / import
    document.getElementById('btnExport').addEventListener('click', exportData);
    document.getElementById('importFile').addEventListener('change', importData);
    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
  }

  function exportData() {
    const blob = {
      projects: state.projects,
      holidaysAdded: readList(LS_HOL_ADD),
      holidaysRemoved: readList(LS_HOL_DEL),
      exportedAt: new Date().toISOString()
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(blob, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'shachaf-tracker-' + todayISO() + '.json'; a.click();
    URL.revokeObjectURL(url);
  }
  function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const b = JSON.parse(reader.result);
        if (Array.isArray(b.projects)) state.projects = b.projects;
        if (Array.isArray(b.holidaysAdded)) writeList(LS_HOL_ADD, b.holidaysAdded);
        if (Array.isArray(b.holidaysRemoved)) writeList(LS_HOL_DEL, b.holidaysRemoved);
        refreshHolidaySet(); save(); render();
        alert('הנתונים נטענו בהצלחה.');
      } catch (err) { alert('קובץ לא תקין.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function init() {
    load();
    refreshHolidaySet();
    state.boardStart = weekStart(todayISO());
    bind();
    render();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
