// ===== ELEMENTS =====
const fileInput = document.getElementById('fileInput');
const uploadBox = document.getElementById('uploadBox');
const fileName = document.getElementById('fileName');

const percentEl = document.getElementById('percent');
const barEl = document.getElementById('bar');
const statusEl = document.getElementById('status');
const warningBox = document.getElementById('warningBox');

let globalSubjects = [];
let selectedRow = null;
let currentWeek = 1;

if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileName.textContent = file.name;

    const reader = new FileReader();

    reader.onload = function (event) {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);

      processAttendance(json);
    };

    reader.readAsArrayBuffer(file);
  });
}

if (uploadBox) {
  uploadBox.addEventListener('click', () => {
    fileInput.click();
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

    const percentRaw = row['__EMPTY_5'];
    const percent = percentRaw ? Number(String(percentRaw).replace('%', '').trim()) : 0;

    if (th === 0) return;

    subjects.push({
      name: nameRaw,
      th,
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

    const filePath = `/timetable/${selected}.xlsx`;

    const res = await fetch(filePath);
    const buffer = await res.arrayBuffer();

    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    renderTimetable(json);
  });
}

// ===== RENDER TABLE =====
function renderTimetable(data) {
  document.getElementById('ttBox')?.remove();
  window.currentTT = data;

  const container = document.createElement('div');
  container.id = 'ttBox';
  container.className = 'px-6 mb-6';

  let html = `
  <h2 class="text-lg font-semibold mb-4">Time Table</h2>

<div class="card p-4 overflow-x-auto">

<div class="flex gap-2 mb-4">
  <button id="removeDay" class="flex-1 bg-red-500/20 text-red-400 py-2 rounded-xl text-sm">Holiday</button>
  <button id="addDay" class="flex-1 bg-green-500/20 text-green-400 py-2 rounded-xl text-sm">Add</button>
  <button id="customDay" class="flex-1 bg-purple-500/20 text-purple-400 py-2 rounded-xl text-sm">Custom</button>
</div>

<table class="w-full text-sm text-left">
<tbody>
`;

  data.forEach((row, rowIndex) => {
    let isPast = false;

    if (today >= 1 && today <= 5) {
      if (rowIndex < today - 1) {
        isPast = true;
      }
    }

    html += `<tr class="${isPast ? 'opacity-40 pointer-events-none' : ''}">`;

    Object.values(row).forEach((cell, i) => {
      html += `
        <td class="border border-gray-800 px-2 py-3 day-cell" draggable="true" data-col="${i}">
          ${cell || ''}
        </td>
      `;
    });

    html += `</tr>`;
  });

  html += `<tr class="add-row hidden">`;

  const colCount = Object.keys(data[0]).length;

  for (let i = 0; i < colCount; i++) {
    if (i === 0) {
      html += `
      <td class="border border-gray-800 px-2 py-3"></td>
    `;
    } else {
      html += `
      <td class="border border-gray-800 px-2 py-3 add-day text-green-400 cursor-pointer">
        + Add
      </td>
    `;
    }
  }

  html += `</tr>`;

  html += `</tbody></table></div>`;

  container.innerHTML = html;
  document.getElementById('ttContainer').appendChild(container);

  attachDayControls();
}

// ===== DAY SELECT + ACTION =====
function attachDayControls() {
  document.querySelectorAll('.day-cell').forEach((td) => {
    td.onclick = () => {
      const row = td.parentElement;

      document.querySelectorAll('tr').forEach((r) => {
        r.classList.remove('bg-blue-500/20');
      });

      selectedRow = row;
      row.classList.add('bg-blue-500/20');
    };
  });

  document.getElementById('removeDay').onclick = () => apply('remove');
  document.getElementById('addDay').onclick = () => apply('add');
  document.getElementById('customDay').onclick = () => enableCustomMode();

  setupAddRow();
}

function apply(type) {
  const rowIndex = Array.from(selectedRow.parentNode.children).indexOf(selectedRow);

  if (currentWeek === 1 && today >= 1 && today <= 5 && rowIndex < today - 1) {
    alert("Can't edit past days");
    return;
  }
  if (!selectedRow) {
    alert('Select a row first');
    return;
  }

  const cells = selectedRow.querySelectorAll('td');

  // RESET
  cells.forEach((td) => {
    td.classList.remove('opacity-30', 'line-through', 'text-green-400', 'bg-yellow-500/20');
  });

  selectedRow.classList.remove('removed-row');

  // 🔴 REMOVE
  if (type === 'remove') {
    selectedRow.classList.add('removed-row');

    cells.forEach((td) => {
      td.classList.add('opacity-30', 'line-through');
    });
  }

  // 🟢 ADD
  if (type === 'add') {
    const addRow = document.querySelector('.add-row');
    if (!addRow) return;

    addRow.classList.remove('hidden');

    const addCells = addRow.querySelectorAll('td');

    cells.forEach((td, i) => {
      if (i === 0) return;

      const value = td.textContent.trim();

      if (value) {
        addCells[i].textContent = value;
        addCells[i].classList.add('text-green-400');
      }
    });
  }

  // 🟡 HOLIDAY
  if (type === 'holiday') {
    cells.forEach((td) => {
      td.classList.add('bg-yellow-500/20');
    });
  }

  // 🔥 UPDATE
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
      if (cell.dataset.col == 0) return; // ❌ block day names

      e.dataTransfer.setData('text/plain', cell.textContent.trim());
    });
  });

  document.querySelectorAll('.add-row td').forEach((td) => {
    td.addEventListener('dragover', (e) => e.preventDefault());

    td.addEventListener('drop', (e) => {
      e.preventDefault();

      const data = e.dataTransfer.getData('text/plain');

      if (data) {
        td.innerHTML = data; // 🔥 FIXED
        td.classList.add('text-green-400');
      }
    });
  });
}

function renderSubjectPrediction(subjects = globalSubjects) {
  const today = new Date().getDay();

  const table1 = document.getElementById('subjectPredictionTable');
  const table2 = document.getElementById('subjectPredictionTable2');

  if (!table1) return;

  table1.innerHTML = '';
  if (table2) table2.innerHTML = '';

  if (!subjects.length) {
    table1.innerHTML = `
      <tr>
        <td colspan="4" class="py-4 text-center text-gray-400">
          Upload attendance first
        </td>
      </tr>
    `;
    return;
  }

  const rows = document.querySelectorAll('#ttBox table tr');

  const clean = (str) => str.toLowerCase().replace(/[^a-z]/g, '');

  subjects.forEach((s) => {
    let extraWeek1 = 0;
    let extraWeek2 = 0;

    const subjectKey = clean(s.name);

    rows.forEach((tr) => {
      const firstCell = tr.querySelector('td');
      if (!firstCell) return;

      const dayName = firstCell.textContent.trim().toLowerCase();

      const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      const rowDayIndex = order.findIndex((d) => dayName.includes(d));

      if (rowDayIndex === -1) return;
      if (tr.classList.contains('removed-row')) return;

      const cells = tr.querySelectorAll('td');

      cells.forEach((td, i) => {
        if (i === 0) return;
        if (td.classList.contains('line-through')) return;

        const text = clean(td.textContent);
        if (!text) return;

        if (subjectKey.includes(text) || text.includes(subjectKey)) {
          // ✅ Week 1 → only remaining days
          if (today >= 1 && today <= 5) {
            const todayIndex = today - 1;
            if (rowDayIndex >= todayIndex) {
              extraWeek1++;
            }
          }

          // ✅ Week 2 → full week
          extraWeek2++;
        }
      });
    });

    // ---------- WEEK 1 ----------
    const newPresent1 = s.ahdl + extraWeek1;
    const newTotal1 = s.th + extraWeek1;

    const percent1 = ((newPresent1 / newTotal1) * 100).toFixed(2);

    let color1 = 'text-red-400';
    if (percent1 >= 75) color1 = 'text-green-400';
    else if (percent1 >= 60) color1 = 'text-yellow-400';

    table1.innerHTML += `
      <tr class="border-b border-gray-800">
        <td>${s.name}</td>
        <td>${newPresent1}</td>
        <td>${newTotal1}</td>
        <td class="${color1}">${percent1}%</td>
      </tr>
    `;

    // ---------- WEEK 2 ----------
    if (table2) {
      const totalExtra = extraWeek1 + extraWeek2;

      const newPresent2 = s.ahdl + totalExtra;
      const newTotal2 = s.th + totalExtra;

      const percent2 = ((newPresent2 / newTotal2) * 100).toFixed(2);

      let color2 = 'text-red-400';
      if (percent2 >= 75) color2 = 'text-green-400';
      else if (percent2 >= 60) color2 = 'text-yellow-400';

      table2.innerHTML += `
        <tr class="border-b border-gray-800">
          <td>${s.name}</td>
          <td>${newPresent2}</td>
          <td>${newTotal2}</td>
          <td class="${color2}">${percent2}%</td>
        </tr>
      `;
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

      const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
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
      currentWeek = 1;
      console.log('Week 1 mode');
    };
  }

  if (w2) {
    w2.onclick = () => {
      currentWeek = 2;
      console.log('Week 2 mode');
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

  const attended = [];
  const dutyLeave = [];
  const absent = [];

  subjects.forEach((s) => {
    const total = s.th;
    const ahdl = s.ahdl;

    const dl = Math.round(ahdl * 0.2); // fake 20%
    const ah = ahdl - dl;

    attended.push(ah);
    dutyLeave.push(dl);
    absent.push(total - ahdl);
  });

  attendanceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Attended',
          data: attended,
          backgroundColor: 'rgba(34,197,94,0.8)',
        },
        {
          label: 'Duty Leave',
          data: dutyLeave,
          backgroundColor: 'rgba(250,204,21,0.8)',
        },
        {
          label: 'Absent',
          data: absent,
          backgroundColor: 'rgba(239,68,68,0.8)',
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: '#aaa',
            maxRotation: 40,
            minRotation: 20,
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            color: '#aaa',
            maxRotation: 40,
            minRotation: 20,
          },
        },
      },
      plugins: {
        legend: {
          label: 'Attended',
          data: attended,
          backgroundColor: 'rgba(34,197,94,0.8)',
        },
      },
    },
  });
}
