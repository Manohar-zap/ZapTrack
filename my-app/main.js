// ===== ELEMENTS =====
const mainInput = document.getElementById('mainFileInput');
const dailyInput = document.getElementById('dailyFileInput');
const uploadBox = document.getElementById('uploadBox');
const dailyBox = document.getElementById('dailyUploadBox');

const percentEl = document.getElementById('percent');
const barEl = document.getElementById('bar');
const statusEl = document.getElementById('status');
const warningBox = document.getElementById('warningBox');

uploadBox.addEventListener('click', () => mainInput.click());
dailyBox.addEventListener('click', () => dailyInput.click());

dailyInput.disabled = true;
let isEditing = false;

let globalSubjects = [];
let selectedRow = null;
let currentWeek = 1;
let minAttended = 0;
let minTotal = 0;

let baseTT = null;
let week1TT = null;
let week2TT = null;
let activeTT = null;

mainInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function (event) {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: 'array' });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // 🔥 extract profile
    const profile = {};

    raw.forEach((row) => {
      row.forEach((cell) => {
        const text = String(cell || '');

        if (text.includes('Student Name')) {
          profile.name = text.split(':')[1]?.trim();
        }
        if (text.includes('Roll No')) {
          profile.roll = text.split(':')[1]?.trim();
        }
        if (text.includes('Registration')) {
          profile.reg = text.split(':')[1]?.trim();
        }
        if (text.includes('Batch')) {
          profile.batch = text.split(':')[1]?.trim();
        }
        if (text.includes('Department')) {
          profile.dept = text.split(':')[1]?.trim();
        }
        if (text.includes('Term')) {
          profile.term = text.split(':')[1]?.trim();
        }
      });
    });

    // 🔥 STORE GLOBALLY
    window.profileData = profile;

    updateSidebarProfile();
    console.log('PROFILE:', profile);

    // continue normal parsing
    const json = XLSX.utils.sheet_to_json(sheet);
    processAttendance(json);
  };

  reader.readAsArrayBuffer(file);
});

dailyInput.addEventListener('change', (e) => {
  if (!window.timetableMap) {
    alert('⚠️ Select class first (load timetable)');
    dailyInput.value = '';
    return;
  }

  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function (evt) {
    const bytes = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(bytes, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let startIndex = raw.findIndex((row) =>
      row.some((cell) => String(cell).toLowerCase().includes('date'))
    );

    if (startIndex === -1) {
      alert('Invalid file format');
      return;
    }

    const headers = raw[startIndex];

    const data = raw.slice(startIndex + 1).map((row) => {
      let obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i];
      });
      return obj;
    });

    processDaily(data);
  };

  reader.readAsArrayBuffer(file);
});

function loadSubjectsToCalc(subjects) {
  const select = document.getElementById('calcSubject');
  select.innerHTML = `<option value="">Select Subject</option>`;

  subjects.forEach((s, i) => {
    select.innerHTML += `<option value="${i}">${s.name}</option>`;
  });
}

// ===== ATTENDANCE =====
function processAttendance(data) {
  let subjects = [];
  let totalTH = 0;
  let totalAttended = 0;

  data.forEach((row) => {
    const nameRaw = row['__EMPTY'];

    if (!nameRaw || nameRaw === 'Course Name' || nameRaw === 'Total') return;

    const th = Number(row['__EMPTY_1']) || 0;
    const ahdl = Number(row['__EMPTY_4']) || 0;
    const dl = Number(row['__EMPTY_3']) || 0;
    const percentRaw = row['__EMPTY_6'];
    const percent = percentRaw ? Number(String(percentRaw).replace('%', '').trim()) : 0;

    if (th === 0) return;

    subjects.push({
      name: nameRaw,
      th,
      ah: Number(row['__EMPTY_2']) || 0,
      dl,
      ahdl,
      percent,
    });

    totalTH += th;
    totalAttended += ahdl;
  });

  // ✅ SAVE
  localStorage.setItem('baseTotal', totalTH);
  localStorage.setItem('basePresent', totalAttended);
  localStorage.setItem('subjects', JSON.stringify(subjects));

  globalSubjects = subjects;
  loadSubjectsToCalc(subjects);

  const overall = totalTH === 0 ? 0 : ((totalAttended / totalTH) * 100).toFixed(1);

  renderTable(subjects);
  renderSubjectPrediction(subjects);
  renderAttendanceChart(subjects);

  // CALCULATE
  const absent = totalTH - totalAttended;

  // UPDATE UI
  document.getElementById('overallPercent').textContent = overall + '%';
  document.getElementById('presentCount').textContent = totalAttended;
  document.getElementById('absentCount').textContent = absent;
  document.getElementById('progressBar').style.width = overall + '%';

  const percentVal = Number(overall);

  if (percentVal >= 75) {
    statusEl.textContent = 'Safe';
    statusEl.className =
      'text-5xl md:text-6xl font-extrabold mt-2 text-green-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.7)]';
  } else if (percentVal >= 65) {
    statusEl.textContent = 'Warning';
    statusEl.className =
      'text-5xl md:text-6xl font-extrabold mt-2 text-yellow-400 drop-shadow-[0_0_6px_rgba(234,179,8,0.7)]';
  } else {
    statusEl.textContent = 'Critical';
    statusEl.className =
      'text-5xl md:text-6xl font-extrabold mt-2 text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.7)]';
  }
  // SHOW ALL SECTIONS AFTER UPLOAD
  document.getElementById('overviewCards')?.classList.remove('hidden');
  document.getElementById('attendanceSection')?.classList.remove('hidden');
  document.getElementById('ttContainer')?.classList.remove('hidden');
  document.getElementById('statsSection')?.classList.remove('hidden');

  console.log('DATA:', totalAttended, totalTH, overall);
}

// ===== TIMETABLE LOAD =====
const classSelect = document.getElementById('classSelect');

if (classSelect) {
  classSelect.addEventListener('change', async (e) => {
    const selected = e.target.value;
    if (!selected) return;

    // Reset all TT state when a new class is chosen
    baseTT = null;
    week1TT = null;
    week2TT = null;
    activeTT = null;
    isEditing = false;

    const filePath = `/timetable/${selected}.xlsx`;
    const res = await fetch(filePath);
    const buffer = await res.arrayBuffer();

    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    // Seeds baseTT / week1TT / week2TT; editMode=false → read-only display
    activeTT = json;
    renderTimetable(json, false);
    renderSubjectPrediction(globalSubjects);
  });
}

// ===== RENDER TABLE =====
// normaliseRow: works whether a row is an object (from xlsx) or a plain array (saved by saveTT)
function normaliseRow(row) {
  return Array.isArray(row) ? row : Object.values(row);
}

function renderTimetable(data, editMode = false) {
  document.getElementById('ttBox')?.remove();

  // First load: seed all three datasets
  if (!baseTT) {
    baseTT = JSON.parse(JSON.stringify(data));
    week1TT = JSON.parse(JSON.stringify(data));
    week2TT = JSON.parse(JSON.stringify(data));
  }

  // activeTT is set by caller (class-select keeps baseTT; edit buttons set week1TT/week2TT)
  window.timetableMap = {};

  data.forEach((row) => {
    const values = normaliseRow(row);
    const dayRaw = String(values[0] || '')
      .toLowerCase()
      .trim();
    const day = dayRaw.replace(/[^a-z]/g, '');
    if (!day) return;
    window.timetableMap[day] = values.slice(1);
  });

  const container = document.createElement('div');
  container.id = 'ttBox';
  container.className = 'px-6 mb-6';

  // Action toolbar – hidden when not editing
  const toolbarDisplay = editMode ? '' : 'hidden';

  let html = `
  <h2 class="text-lg font-semibold mb-4">Time Table</h2>
  <div class="card p-4 overflow-x-auto">
  <div class="flex gap-2 mb-4 ${toolbarDisplay}" id="ttToolbar">
    <button id="removeDay" class="flex-1 bg-red-500/20 text-red-400 py-2 rounded-xl text-sm">Holiday</button>
    <button id="addDay"    class="flex-1 bg-green-500/20 text-green-400 py-2 rounded-xl text-sm">Add</button>
    <button id="customDay" class="flex-1 bg-purple-500/20 text-purple-400 py-2 rounded-xl text-sm">Custom</button>
  </div>
  <table class="w-full text-sm text-left">
  <tbody>`;

  const todayDow = new Date().getDay(); // 0=Sun … 6=Sat

  data.forEach((row, rowIndex) => {
    const values = normaliseRow(row);
    let isPast = false;
    if (todayDow >= 1 && todayDow <= 5 && currentWeek === 1) {
      if (rowIndex < todayDow - 1) isPast = true;
    }

    // draggable only when editing and cell is not a day-name col
    const draggable = editMode ? 'true' : 'false';
    const cursorClass = editMode ? 'cursor-pointer' : '';

    html += `<tr data-row-index="${rowIndex}" class="${isPast ? 'opacity-40 pointer-events-none' : ''}">`;

    values.forEach((cell, i) => {
      const isDay = i === 0;
      html += `<td class="border border-gray-800 px-2 py-3 day-cell ${cursorClass}"
                   draggable="${isDay ? 'false' : draggable}"
                   data-col="${i}">${cell || ''}</td>`;
    });

    html += `</tr>`;
  });

  // ---- Extra rows: Saturday & Sunday (only in edit mode) ----
  if (
    editMode &&
    !data.some((r) => String(normaliseRow(r)[0]).toLowerCase().includes('saturday'))
     ) {
    const colCount = normaliseRow(data[0]).length;
    ['Saturday', 'Sunday'].forEach((dayName) => {
      html += `<tr class="extra-day-row" data-extra="${dayName.toLowerCase()}">`;
      for (let i = 0; i < colCount; i++) {
        if (i === 0) {
          html += `<td class="border border-gray-800 px-2 py-3 font-semibold text-purple-300">${dayName}</td>`;
        } else {
          html += `<td class="border border-gray-800 px-2 py-3 day-cell cursor-pointer extra-slot text-gray-500"
                       draggable="true" data-col="${i}">—</td>`;
        }
      }
      html += `</tr>`;
    });
  }

  html += `</tbody></table></div>`;

  container.innerHTML = html;
  document.getElementById('ttContainer').appendChild(container);

  attachDayControls(editMode);
  if (editMode) setupExtraSlotDropTargets();
  dailyInput.disabled = false;
}

// ===== DAY SELECT + ACTION =====
function attachDayControls(editMode = false) {
  document.querySelectorAll('.day-cell').forEach((td) => {
    td.onclick = () => {
      if (!editMode) return; // block clicks in read-only mode

      const row = td.parentElement;
      document.querySelectorAll('tr').forEach((r) => r.classList.remove('bg-blue-500/20'));
      selectedRow = row;
      row.classList.add('bg-blue-500/20');
    };
  });

  const removeBtn = document.getElementById('removeDay');
  const addBtn = document.getElementById('addDay');
  const customBtn = document.getElementById('customDay');

  if (removeBtn) removeBtn.onclick = () => editMode && apply('remove');
  if (addBtn) addBtn.onclick = () => editMode && apply('add');
  if (customBtn) customBtn.onclick = () => editMode && enableCustomMode();

  if (editMode) enableDragAndDrop();
}

function apply(type) {
  if (!selectedRow) {
    alert('Select a row first');
    return;
  }

  const rowIndex = Array.from(selectedRow.parentNode.children).indexOf(selectedRow);
  const todayDow = new Date().getDay();

  if (currentWeek === 1 && todayDow >= 1 && todayDow <= 5 && rowIndex < todayDow - 1) {
    alert("Can't edit past days");
    return;
  }

  const cells = selectedRow.querySelectorAll('td');

  // RESET styling
  cells.forEach((td) => {
    td.classList.remove('opacity-30', 'line-through', 'text-green-400', 'bg-yellow-500/20');
  });
  selectedRow.classList.remove('removed-row');

  if (type === 'remove') {
    selectedRow.classList.add('removed-row');
    cells.forEach((td) => td.classList.add('opacity-30', 'line-through'));
  }

  if (type === 'add') {
    const tbody = selectedRow.closest('tbody');

    // 🔥 remove ALL previous extra rows
    tbody.querySelectorAll('.add-row').forEach((r) => r.remove());

    const newRow = document.createElement('tr');
    newRow.className = 'add-row text-green-400';

    cells.forEach((td, i) => {
      const ntd = document.createElement('td');
      ntd.className = 'border border-gray-800 px-2 py-3 day-cell cursor-pointer extra-slot';
      ntd.setAttribute('draggable', i === 0 ? 'false' : 'true');
      ntd.dataset.col = i;
      ntd.textContent = i === 0 ? '+ Extra' : td.textContent.trim();
      newRow.appendChild(ntd);
    });

    tbody.appendChild(newRow);
    // make drop targets work on the new row too
    setupExtraSlotDropTargets();
  }

  if (type === 'holiday') {
    cells.forEach((td) => td.classList.add('bg-yellow-500/20'));
  }

  renderSubjectPrediction(globalSubjects);
  renderAttendanceChart(globalSubjects);
}
// ===== SIMULATION =====
const weekBtn = document.getElementById('weekBtn');
const twoWeekBtn = document.getElementById('twoWeekBtn');

if (weekBtn) {
  weekBtn.onclick = () => simulate(7);
}

if (twoWeekBtn) {
  twoWeekBtn.onclick = () => simulate(14);
}

function simulate(days) {
  const total = globalSubjects.reduce((s, x) => s + x.th, 0);
  const attended = globalSubjects.reduce((s, x) => s + x.ahdl, 0);

  const extra = days * 3;

  const percent = (((attended + extra) / (total + extra)) * 100).toFixed(1);

  // ✅ STORE DATA
  if (days === 7) {
    localStorage.setItem('weekPrediction', percent);
  } else {
    localStorage.setItem('twoWeekPrediction', percent);
  }

  // ✅ DEBUG (see if it's saving)
  console.log('Saved:', days, percent);

  // ✅ GO TO STATS
  document.getElementById('statsSection')?.scrollIntoView({
    behavior: 'smooth',
  });
}

let chart;

function renderTable(subjects) {
  const table = document.getElementById('subjectTable');
  table.innerHTML = '';

  subjects.forEach((s) => {
    let colorClass = '';

    if (s.percent >= 75) {
      colorClass = 'text-green-400';
    } else if (s.percent >= 60) {
      colorClass = 'text-yellow-400'; // or orange
    } else {
      colorClass = 'text-red-400';
    }

    const row = `
      <tr class="border-b border-gray-800">
        <td class="py-2">${s.name}</td>
        <td class="py-2">${s.ahdl}</td>
        <td class="py-2">${s.th}</td>
        <td class="py-2 font-semibold ${colorClass}">
          ${s.percent}%
        </td>
      </tr>
    `;

    table.innerHTML += row;
  });

  enableDragAndDrop();
}

function enableCustomMode() {
  const addRow = document.querySelector('.add-row');
  if (!addRow) return;

  addRow.classList.remove('hidden');

  const subjects = Array.from(document.querySelectorAll('.day-cell'))
    .filter((td) => td.dataset.col != 0)
    .map((td) => td.textContent.trim())
    .filter(Boolean);

  const uniqueSubjects = [...new Set(subjects)];

  const cells = addRow.querySelectorAll('td');

  cells.forEach((td, i) => {
    if (i === 0) {
      td.textContent = 'Saturday';
      return;
    }

    td.innerHTML = '';

    const select = document.createElement('select');
    select.className = 'bg-gray-800 text-xs p-1 rounded w-full';

    const empty = document.createElement('option');
    empty.textContent = '--';
    select.appendChild(empty);

    uniqueSubjects.forEach((sub) => {
      const opt = document.createElement('option');
      opt.value = sub;
      opt.textContent = sub;
      select.appendChild(opt);
    });

    select.onchange = () => {
      td.textContent = select.value;
      td.classList.add('text-green-400');
      renderSubjectPrediction(globalSubjects); // 🔥 live update
    };

    td.appendChild(select);
  });
}

function enableDragAndDrop() {
  document.querySelectorAll('.day-cell').forEach((cell) => {
    cell.addEventListener('dragstart', (e) => {
      if (cell.dataset.col == 0) return;
      e.dataTransfer.setData('text/plain', cell.textContent.trim());
    });
  });
  document.querySelectorAll('.day-cell').forEach((td) => {
    if (td.dataset.col == 0) return;

    td.addEventListener('dragover', (e) => e.preventDefault());

    td.addEventListener('drop', (e) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('text/plain');

      if (data) {
        td.textContent = data;
        td.classList.add('text-green-400');
      }
    });
  });
}

function renderSubjectPrediction(subjects = globalSubjects) {
  const table1 = document.getElementById('subjectPredictionTable');
  const table2 = document.getElementById('subjectPredictionTable2');

  if (!table1) return;
  table1.innerHTML = '';
  if (table2) table2.innerHTML = '';

  if (!subjects || !subjects.length) {
    table1.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-gray-400">Upload attendance first</td></tr>`;
    return;
  }

  if (!activeTT) {
    table1.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-gray-400">Select a class to load timetable</td></tr>`;
    return;
  }

  const clean = (str) =>
    String(str || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');

  // Which day index is "today" (Mon=0 … Fri=4)
  let todayDow = new Date().getDay(); // 0=Sun … 6=Sat
  const todayIndex = todayDow >= 1 && todayDow <= 5 ? todayDow - 1 : 0; // if weekend, treat as past all

  const ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  subjects.forEach((s) => {
    const subjectKey = clean(s.name);
    let extraW1 = 0,
      addW1 = 0; // addW1 = classes (present slots)
    let extraW2 = 0,
      addW2 = 0;

    // Use week1TT for W1 prediction, week2TT (or activeTT) for W2
    const ttW1 = week1TT || activeTT;
    const ttW2 = week2TT || activeTT;

    function countInTT(tt, weekNum) {
      let extra = 0,
        add = 0;

      tt.forEach((row) => {
        const values = normaliseRow(row);
        const dayRaw = clean(String(values[0] || ''));

        // skip rows with no valid day
        const rowDayIndex = ORDER.findIndex(
          (d) =>
            dayRaw.includes(d.replace(/[^a-z]/g, '')) || d.replace(/[^a-z]/g, '').includes(dayRaw)
        );
        if (rowDayIndex === -1) return;

        // For week1: only count from today onwards (Mon=0 index)
        if (weekNum === 1 && rowDayIndex < todayIndex) return;

        values.slice(1).forEach((cell) => {
          const rawText = String(cell || '')
            .toLowerCase()
            .trim();
          const text = clean(rawText);

          if (!text || text === '' || text === '—') return;
          if (rawText.includes('holiday')) return; // holiday → skip entirely

          if (rawText.includes('bunk')) {
            // bunk → total++ but NOT present++
            if (
              subjectKey.includes(text.replace('bunk', '')) ||
              text.replace('bunk', '').includes(subjectKey) ||
              subjectKey.includes(text) ||
              text.includes(subjectKey)
            ) {
              extra++; // total
              // no add (present)
            }
            return;
          }

          if (subjectKey.includes(text) || text.includes(subjectKey)) {
            extra++; // total
            add++; // present
          }
        });
      });

      return { extra, add };
    }

    const r1 = countInTT(ttW1, 1);
    const r2 = countInTT(ttW2, 2);

    // ---- Week 1 row ----
    const newPresent1 = s.ahdl + r1.add;
    const newTotal1 = s.th + r1.extra;
    const percent1 = newTotal1 ? ((newPresent1 / newTotal1) * 100).toFixed(2) : '0.00';
    const color1 =
      percent1 >= 75 ? 'text-green-400' : percent1 >= 60 ? 'text-yellow-400' : 'text-red-400';

    table1.innerHTML += `
      <tr class="border-b border-gray-800">
        <td class="py-1 pr-2">${s.name}</td>
        <td>+${r1.extra}</td>
        <td>${newPresent1}</td>
        <td>${newTotal1}</td>
        <td class="${color1}">${percent1}%</td>
      </tr>`;

    // ---- Week 2 row ----
    if (table2) {
      const newPresent2 = s.ahdl + r2.add;
      const newTotal2 = s.th + r2.extra;
      const percent2 = newTotal2 ? ((newPresent2 / newTotal2) * 100).toFixed(2) : '0.00';
      const color2 =
        percent2 >= 75 ? 'text-green-400' : percent2 >= 60 ? 'text-yellow-400' : 'text-red-400';

      table2.innerHTML += `
        <tr class="border-b border-gray-800">
          <td class="py-1 pr-2">${s.name}</td>
          <td>+${r2.extra}</td>
          <td>${newPresent2}</td>
          <td>${newTotal2}</td>
          <td class="${color2}">${percent2}%</td>
        </tr>`;
    }
  });
}

function setupAddRow() {
  const addRow = document.querySelector('.add-row');
  if (!addRow) return;

  addRow.classList.remove('hidden');
}

function render2WeekPrediction(subjects) {
  const table = document.getElementById('subjectPredictionTable2');
  if (!table) return;

  table.innerHTML = '';

  const today = new Date().getDay();

  subjects.forEach((s) => {
    let extraWeek1 = 0;
    let extraWeek2 = 0;

    const clean = (str) => str.toLowerCase().replace(/[^a-z]/g, '');
    const subjectKey = clean(s.name);

    const rows = document.querySelectorAll('#ttBox table tr');

    rows.forEach((tr) => {
      const firstCell = tr.querySelector('td');
      if (!firstCell) return;

      const dayName = firstCell.textContent.trim().toLowerCase();

      const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const rowDayIndex = order.findIndex((d) => dayName.includes(d));

      if (rowDayIndex === -1) return;
      if (tr.classList.contains('removed-row')) return;

      const cells = tr.querySelectorAll('td');

      cells.forEach((td, i) => {
        if (i === 0) return;

        const text = td.textContent.trim().toLowerCase();
        if (!text) return;

        if (subjectKey.includes(text) || text.includes(subjectKey)) {
          // week1
          if (today >= 1 && today <= 5) {
            const todayIndex = today - 1;
            if (rowDayIndex >= todayIndex) {
              extraWeek1++;
            }
          }

          // week2 (full)
          extraWeek2++;
        }
      });
    });

    const totalExtra = extraWeek1 + extraWeek2;

    const newPresent = s.ahdl + totalExtra;
    const newTotal = s.th + totalExtra;

    const percent = ((newPresent / newTotal) * 100).toFixed(2);

    let color = 'text-red-400';
    if (percent >= 75) color = 'text-green-400';
    else if (percent >= 60) color = 'text-yellow-400';

    table.innerHTML += `
      <tr class="border-b border-gray-800">
        <td>${s.name}</td>
        <td>${newPresent}</td>
        <td>${newTotal}</td>
        <td class="${color}">${percent}%</td>
      </tr>
    `;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const w1 = document.getElementById('editWeek1');
  const w2 = document.getElementById('editWeek2');

  if (w1) {
    w1.onclick = () => {
      if (!baseTT) {
        alert('Select a class first');
        return;
      }
      currentWeek = 1;
      isEditing = true;
      activeTT = week1TT;
      renderTimetable(week1TT, true); // editMode = true → Sat/Sun rows added
      renderSubjectPrediction(globalSubjects);
    };
  }

  if (w2) {
    w2.onclick = () => {
      if (!baseTT) {
        alert('Select a class first');
        return;
      }
      currentWeek = 2;
      isEditing = true;
      // Always fresh copy of baseTT for week2
      if (!week2TT) {
        week2TT = JSON.parse(JSON.stringify(baseTT));
      }
      activeTT = week2TT;
      renderTimetable(week2TT, true);
      renderSubjectPrediction(globalSubjects);
    };
  }
});

let attendanceChart;

function renderAttendanceChart(subjects) {
  const ctx = document.getElementById('attendanceChart');
  if (!ctx) return;

  if (attendanceChart) attendanceChart.destroy();

  const labels = subjects.map((s) => {
    const match = s.name.match(/\((.*?)\)/);
    return match ? match[1] : s.name;
  });

  const present = [];
  const dl = [];
  const absent = [];
  const minLine = [];
  const topIndex = []; // 🔥 FIXED (you missed this)

  subjects.forEach((s, i) => {
    const p = s.ah;
    const d = s.dl;
    const a = s.th - s.ahdl;

    present.push(p);
    dl.push(d);
    absent.push(a);

    minLine.push(s.th * 0.75);

    if (a > 0) topIndex[i] = 'absent';
    else if (d > 0) topIndex[i] = 'dl';
    else topIndex[i] = 'present';
  });

  attendanceChart = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Present',
          data: present,
          backgroundColor: 'rgba(99,102,241,0.9)',
          borderRadius: {
            topLeft: 12,
            topRight: 12,
            bottomLeft: 12,
            bottomRight: 12,
          },
          borderSkipped: false,
          barPercentage: 0.9,
          categoryPercentage: 0.8,
          order: 2,
        },
        {
          type: 'bar',
          label: 'DL',
          data: dl,
          backgroundColor: 'rgba(250,204,21,0.9)',
          borderRadius: {
            topLeft: 12,
            topRight: 12,
            bottomLeft: 12,
            bottomRight: 12,
          },
          borderSkipped: false,
          barPercentage: 0.9,
          categoryPercentage: 0.8,
          order: 2,
        },
        {
          type: 'bar',
          label: 'Absent',
          data: absent,
          backgroundColor: 'rgba(239,68,68,0.9)',
          borderRadius: {
            topLeft: 12,
            topRight: 12,
            bottomLeft: 12,
            bottomRight: 12,
          },
          borderSkipped: false,
          barPercentage: 0.9,
          categoryPercentage: 0.8,
          order: 2,
        },
        {
          type: 'line',
          label: 'Min 75%',
          data: minLine,
          borderColor: '#22c55e',
          borderWidth: 2,
          borderDash: [5, 5],
          spanGaps: false,
          tension: 0.4,
          order: 1, // 🔥 line always on top
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#aaa',
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#aaa' },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: '#aaa' },
        },
      },
    },
  });
}

let baseAttended = 0;
let baseTotal = 0;

let extraAttended = 0;
let extraTotal = 0;

const ctx = document.getElementById('calcChart').getContext('2d');

let calcChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Attendance %',
        data: [],
        tension: 0.4,
      },
    ],
  },
  options: {
    plugins: { legend: { display: false } },
    scales: {
      y: { min: 0, max: 100 },
    },
  },
});

function updateCalc(type, val) {
  if (!baseTotal) return;

  if (type === 'attended') {
    baseAttended += val;
    if (baseAttended < minAttended) baseAttended = minAttended;
    if (baseAttended > baseTotal) baseTotal = baseAttended;
  }
  if (type === 'total') {
    baseTotal += val;
    if (baseTotal < minTotal) baseTotal = minTotal;
    if (baseAttended > baseTotal) baseAttended = baseTotal;
  }

  renderCalc();
}

function renderCalc() {
  const attended = baseAttended + extraAttended;
  const total = baseTotal + extraTotal;

  document.getElementById('attendedVal').textContent = attended;
  document.getElementById('totalVal').textContent = total;

  if (!baseTotal) {
    document.getElementById('calcPercent').textContent = '--%';
    document.getElementById('calcStatus').textContent = 'Select subject';
    return;
  }
  let percent = (attended / total) * 100;
  percent = percent.toFixed(1);

  const percentEl = document.getElementById('calcPercent');
  const statusEl = document.getElementById('calcStatus');

  percentEl.textContent = percent + '%';

  if (percent >= 75) {
    percentEl.className = 'text-green-400 text-3xl font-bold';
    statusEl.textContent = 'Safe ✅';
  } else if (percent >= 60) {
    percentEl.className = 'text-yellow-400 text-3xl font-bold';
    statusEl.textContent = 'Warning ⚠️';
  } else {
    percentEl.className = 'text-red-400 text-3xl font-bold';
    statusEl.textContent = 'Danger ❌';
  }

  updateGraph();
}

function updateGraph() {
  const attended = baseAttended + extraAttended;
  const total = baseTotal + extraTotal;

  let future = [];
  let labels = [];

  for (let i = 0; i <= 10; i++) {
    let p = ((attended + i) / (total + i)) * 100;
    future.push(p.toFixed(1));
    labels.push('+' + i);
  }

  calcChart.data.labels = labels;
  calcChart.data.datasets[0].data = future;
  calcChart.update();
}

document.getElementById('calcSubject').onchange = function () {
  const index = this.value;
  if (index === '') return;

  const s = globalSubjects[index];

  minAttended = s.ahdl;
  minTotal = s.th;

  baseAttended = s.ahdl;
  baseTotal = s.th;

  renderCalc();
};

renderCalc();

function resetCalc() {
  extraAttended = 0;
  extraTotal = 0;
  renderCalc();
}

// LOAD FROM STORAGE ON REFRESH
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('subjects');
  if (saved) {
    globalSubjects = JSON.parse(saved);
    loadSubjectsToCalc(globalSubjects);
  }
});

function renderSubjectCards(subjects) {
  const container = document.getElementById('subjectCards');
  if (!container) return;

  container.innerHTML = '';

  subjects.forEach((s) => {
    const percent = Number(s.percent);

    let statusClass = 'danger';
    let statusText = 'Low';

    if (percent >= 75) {
      statusClass = 'safe';
      statusText = 'Good';
    } else if (percent >= 60) {
      statusClass = 'warn';
      statusText = 'Warning';
    }

    // 🔥 need to reach 75%
    let need = 0;
    let a = s.ahdl;
    let t = s.th;

    while (((a + need) / (t + need)) * 100 < 75) {
      need++;
    }

    container.innerHTML += `
      <div class="sub-card">
        <p class="text-sm font-medium">${s.name}</p>

        <p class="sub-percent ${statusClass}">
          ${percent}%
        </p>

        <p class="sub-small">${s.ahdl} / ${s.th}</p>

        <p class="sub-small mt-2">
          ${need > 0 ? `+${need} to reach 75%` : 'Safe ✔'}
        </p>
      </div>
    `;
  });
}

function processDaily(data) {
  let subjectMap = {};
  console.log('TT MAP:', window.timetableMap);
  if (!window.timetableMap) {
    alert('⚠️ Load timetable first (select class)');
    return;
  }
  data.forEach((row) => {
    const dateKey = Object.keys(row).find((k) => k.toLowerCase().includes('date'));

    let rawDate = row[dateKey];
    if (!rawDate) return;
    // Normalize Excel serial to DD-MM-YYYY string for use as a key
    if (typeof rawDate === 'number') {
      const d = new Date(Date.UTC(1899, 11, 30) + rawDate * 86400000);
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      rawDate = `${dd}-${mm}-${yyyy}`;
    }

    const fullDay = getDayName(rawDate).replace(/[^a-z]/g, '');

    const map = {
      monday: 'mon',
      tuesday: 'tue',
      wednesday: 'wed',
      thursday: 'thu',
      friday: 'fri',
    };

    const shortDay = map[fullDay] || fullDay;

    const timetable = window.timetableMap?.[fullDay] || window.timetableMap?.[shortDay];

    if (!timetable) return;

    const hours = ['hour 1', 'hour 2', 'hour 3', 'hour 4', 'hour 5', 'hour 6', 'hour 7', 'hour 8'];
    // Build a case-insensitive key lookup once per row
    const rowKeys = Object.keys(row);
    hours.forEach((hourKey, i) => {
      const matchedKey = rowKeys.find(
        (k) => k.toLowerCase().replace(/\s+/g, ' ').trim() === hourKey
      );
      const val = String(row[matchedKey] || '')
        .trim()
        .toUpperCase();
      const subject = timetable[i];

      // skip break / empty slot
      if (!subject || subject.trim() === '') return;

      // skip invalid entries (holidays etc)
      const isPresent = val.startsWith('P');
      const isAbsent = val.startsWith('A');

      if (!isPresent && !isAbsent) return;

      if (!subjectMap[subject]) subjectMap[subject] = {};

      if (!subjectMap[subject][rawDate]) {
        subjectMap[subject][rawDate] = { p: 0, t: 0 };
      }

      subjectMap[subject][rawDate].t++;

      if (isPresent) subjectMap[subject][rawDate].p++;
    });
  });

  console.log('Mapped Data:', subjectMap);

  renderSubjectDailyChart(subjectMap);
}

function renderDailyChart(labels, data) {
  const ctx = document.getElementById('dailyChart');
  if (!ctx) return;

  if (dailyChart) dailyChart.destroy();

  dailyChart = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          data,
          backgroundColor: 'rgba(99,102,241,0.15)',
          borderRadius: 8,
        },
        {
          type: 'line',
          data,
          borderColor: '#6366f1',
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          backgroundColor: 'rgba(99,102,241,0.1)',
          pointRadius: 3,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100 },
      },
    },
  });
}

function renderDailyInsights(labels, data) {
  let max = -1,
    min = 101;
  let bestDay = '',
    worstDay = '';
  let sum = 0;

  data.forEach((val, i) => {
    const num = val;
    sum += num;

    if (num > max) {
      max = num;
      bestDay = labels[i];
    }

    if (num < min) {
      min = num;
      worstDay = labels[i];
    }
  });

  const avg = (sum / data.length).toFixed(1);

  console.log('📊 Daily Analysis');
  console.log('Best:', bestDay, max + '%');
  console.log('Worst:', worstDay, min + '%');
  console.log('Avg:', avg + '%');
}

function getDayName(dateStr) {
  let d;
  if (typeof dateStr === 'number') {
    // Excel serial: days since 1899-12-30
    d = new Date(Date.UTC(1899, 11, 30) + dateStr * 86400000);
  } else {
    // Already a string like "07-01-2026"
    const parts = String(dateStr).split('-');
    if (parts.length === 3 && parts[0].length === 2) {
      // DD-MM-YYYY format
      d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    } else {
      d = new Date(dateStr);
    }
  }
  return d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
}

let dailyChart;

function renderSubjectDailyChart(subjectMap) {
  const ctx = document.getElementById('dailyChart');
  if (!ctx) return;

  if (dailyChart) dailyChart.destroy();

  const allDates = new Set();

  Object.values(subjectMap).forEach((sub) => {
    Object.keys(sub).forEach((d) => allDates.add(d));
  });

  const labels = Array.from(allDates).sort((a, b) => {
    const [d1, m1, y1] = a.split('-');
    const [d2, m2, y2] = b.split('-');
    return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
  });

  const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6'];

  const subjects = Object.keys(subjectMap).slice(0, 5);

  let datasets = subjects.map((subject, i) => {
    const data = labels.map((date) => {
      const obj = subjectMap[subject][date];
      if (!obj || obj.t === 0) return null;
      return (obj.p / obj.t) * 100;
    });

    return {
      label: subject,
      data,
      borderColor: colors[i % colors.length],
      tension: 0.4,
      borderWidth: 2,
      fill: false,
      pointRadius: 0,
      spanGaps: false,
    };
  });

  dailyChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
        },
      },
    },
  });
}

function renderProfileSettings() {
  if (!window.profileData) return;

  const p = window.profileData;

  document.getElementById('profileName').textContent = p.name || '--';
  document.getElementById('profileDept').textContent = p.dept || '--';

  document.getElementById('profileRoll').textContent = p.roll || '--';

  document.getElementById('profileBatch').textContent = p.batch || '--';
  document.getElementById('profileTerm').textContent = p.term || '--';

  document.getElementById('profileDeptBig').textContent = p.dept || '--';

  // 🔥 initial (first letter)
  document.getElementById('profileInitial').textContent = p.name ? p.name.charAt(0) : '--';
}

function openSettings() {
  document.getElementById('dashboardContent').classList.add('hidden');
  document.getElementById('settingsPanel').classList.remove('hidden');

  renderProfileSettings();
}

function openDashboard() {
  document.getElementById('dashboardContent').classList.remove('hidden');
  document.getElementById('settingsPanel').classList.add('hidden');
}

function closeSettings() {
  openDashboard();
}

function updateSidebarProfile() {
  if (!window.profileData) return;

  const p = window.profileData;

  document.getElementById('sideName').textContent = p.name || '--';
  document.getElementById('sideDept').textContent = p.dept || '--';

  document.getElementById('sideInitial').textContent = p.name ? p.name.charAt(0) : '--';
}

function enableEditingUI() {
  document.querySelectorAll('.day-cell').forEach((cell) => {
    cell.setAttribute('draggable', true);
    cell.classList.add('cursor-pointer');
  });
}

document.getElementById('saveTT').onclick = () => {
  if (!isEditing) {
    alert('Not in edit mode');
    return;
  }

  const rows = document.querySelectorAll('#ttBox table tr');
  let newTT = [];

  rows.forEach((tr) => {
    // ❌ skip extra rows completely
    if (tr.classList.contains('extra-day-row')) return;
    if (tr.classList.contains('add-row')) return;

    const cells = tr.querySelectorAll('td');
    if (!cells.length) return;
    if (tr.classList.contains('removed-row')) return; // skip holiday rows

    let row = [];
    cells.forEach((td) => row.push(td.textContent.trim()));
    newTT.push(row); // stored as plain array
  });

  if (currentWeek === 1) {
    week1TT = newTT;
  } else {
    week2TT = newTT;
  }

  // activeTT now points to the saved data
  activeTT = currentWeek === 1 ? week1TT : week2TT;
  isEditing = false;

  // Re-render in read-only mode (no Sat/Sun rows, no drag)
  renderTimetable(activeTT, false);
  renderSubjectPrediction(globalSubjects);
  renderAttendanceChart(globalSubjects);

  alert('Saved ✅');
};

document.getElementById('resetTT').onclick = () => {
  if (!baseTT) return;

  week1TT = JSON.parse(JSON.stringify(baseTT));
  week2TT = JSON.parse(JSON.stringify(baseTT));
  activeTT = baseTT;

  isEditing = false;

  renderTimetable(baseTT, false);
  renderSubjectPrediction(globalSubjects);
  renderAttendanceChart(globalSubjects);

  alert('Reset done 🔄');
};

function setupExtraSlotDropTargets() {
  document.querySelectorAll('.extra-slot').forEach((td) => {
    td.addEventListener('dragover', (e) => e.preventDefault());

    td.addEventListener('drop', (e) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('text/plain');

      if (data) {
        td.textContent = data;
        td.classList.add('text-green-400');
      }
    });
  });
}