// ─────────────────────────────────────────────────────────────────
//  Aligno.ai — dashboard.js
//  Pure-SVG charts: reps trend, form trend, pie, quality bars, weekly
//  Uses backend API when available, falls back to localStorage.
// ─────────────────────────────────────────────────────────────────

const EXERCISE_COLORS = {
  squat:         '#6366f1',
  pushup:        '#22c55e',
  plank:         '#eab308',
  shoulderpress: '#f97316',
  bicepscurl:    '#ec4899',
};


// ─── Load sessions ────────────────────────────────────────────────
// Returns an array in the same shape as localStorage sessions.
async function loadSessions() {
  if (window.API_ONLINE) {
    try {
      const raw = await SessionsAPI.list();
      // Normalise API field names to match localStorage shape
      return raw.map(s => ({
        id:           String(s.id),
        date:         s.created_at,
        exercise:     s.exercise,
        exerciseName: s.exercise_name,
        reps:         s.reps,
        goodReps:     s.good_reps,
        badReps:      s.bad_reps,
        formScore:    s.form_score,
        repHistory:   Array.isArray(s.rep_history) ? s.rep_history : [],
        durationSecs: s.duration_secs,
        plankHoldSecs: s.plank_hold_secs,
      }));
    } catch (e) {
      console.warn('Failed to load sessions from backend, using localStorage:', e);
    }
  }
  // localStorage fallback
  const user   = JSON.parse(localStorage.getItem('aligno_current') || 'null');
  const userId = user ? user.id : 'guest';
  return JSON.parse(localStorage.getItem(`aligno_sessions_${userId}`) || '[]');
}

// ─── State ────────────────────────────────────────────────────────
let allSessions      = [];
let filteredSessions = [];
let activeExercise   = 'all';
let activePeriod     = 7;

// ─── Init ─────────────────────────────────────────────────────────
(async function init() {
  await window.apiReady;
  
  // Greet user
  const user = JSON.parse(localStorage.getItem('aligno_current') || 'null');
  if (user) {
    document.getElementById('user-greeting').textContent = '👋 ' + user.name.split(' ')[0];
  }

  allSessions = await loadSessions();

  if (allSessions.length === 0) {
    document.getElementById('no-data').classList.remove('hidden');
    return;
  }

  document.getElementById('dashboard-content').classList.remove('hidden');
  buildExerciseFilter();
  applyFilters();
  bindFilterEvents();
})();

// ─── Exercise filter pills ────────────────────────────────────────
function buildExerciseFilter() {
  const container = document.getElementById('exercise-filter');
  const exercises = [...new Set(allSessions.map(s => s.exercise))];

  const allBtn = document.createElement('button');
  allBtn.className = 'pill active';
  allBtn.dataset.ex = 'all';
  allBtn.textContent = 'All';
  container.appendChild(allBtn);

  exercises.forEach(ex => {
    const btn = document.createElement('button');
    btn.className = 'pill';
    btn.dataset.ex = ex;
    btn.textContent = (allSessions.find(s=>s.exercise===ex)?.exerciseName || ex);
    container.appendChild(btn);
  });
}

function bindFilterEvents() {
  // Exercise pills
  document.getElementById('exercise-filter').addEventListener('click', e => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    document.querySelectorAll('#exercise-filter .pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    activeExercise = btn.dataset.ex;
    applyFilters();
  });

  // Period pills
  document.querySelectorAll('.filter-right .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-right .pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      activePeriod = btn.dataset.period === 'all' ? 'all' : parseInt(btn.dataset.period);
      applyFilters();
    });
  });

  // Clear data
  document.getElementById('btn-clear').addEventListener('click', async () => {
    if (!confirm('Clear all session data? This cannot be undone.')) return;
    if (window.API_ONLINE) {
      try {
        // Delete each session individually (no bulk-delete endpoint needed)
        await Promise.all(allSessions.map(s => SessionsAPI.remove(s.id)));
        location.reload();
        return;
      } catch (e) {
        console.warn('Failed to clear sessions from backend, clearing localStorage only:', e);
      }
    }
    const user   = JSON.parse(localStorage.getItem('aligno_current') || 'null');
    const userId = user ? user.id : 'guest';
    localStorage.removeItem(`aligno_sessions_${userId}`);
    location.reload();
  });
}

// ─── Apply filters & re-render ────────────────────────────────────
function applyFilters() {
  const now = Date.now();
  const cutoff = activePeriod === 'all' ? 0 : now - activePeriod * 86400000;

  filteredSessions = allSessions
    .filter(s => (activeExercise === 'all' || s.exercise === activeExercise))
    .filter(s => new Date(s.date).getTime() >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  renderHeroStats();
  renderRepsChart();
  renderFormChart();
  renderPieChart();
  renderQualityChart();
  renderWeeklyChart();
  renderSessionsTable();
}

// ─── Hero Stats ───────────────────────────────────────────────────
function renderHeroStats() {
  const s = filteredSessions;
  if (!s.length) return;

  const totalReps    = s.reduce((a,b) => a + b.reps, 0);
  const totalSessions= s.length;
  const avgForm      = s.length ? Math.round(s.reduce((a,b) => a + b.formScore, 0) / s.length) : 0;
  const formRangeStr = `${Math.max(0, avgForm - 5)}% - ${Math.min(100, avgForm + 5)}%`;
  const bestReps     = Math.max(...s.map(x => x.reps));
  const totalMins    = Math.round(s.reduce((a,b) => a + (b.durationSecs || 0), 0) / 60);

  // Trend vs previous period
  const half = Math.floor(s.length / 2);
  const firstHalf  = s.slice(0, half);
  const secondHalf = s.slice(half);
  const avgReps1 = firstHalf.length  ? firstHalf.reduce((a,b) => a+b.reps,0)/firstHalf.length : 0;
  const avgReps2 = secondHalf.length ? secondHalf.reduce((a,b) => a+b.reps,0)/secondHalf.length : 0;
  const repsTrend = avgReps1 > 0 ? Math.round(((avgReps2 - avgReps1) / avgReps1) * 100) : 0;

  const avgForm1 = firstHalf.length  ? firstHalf.reduce((a,b)  => a+b.formScore,0)/firstHalf.length : 0;
  const avgForm2 = secondHalf.length ? secondHalf.reduce((a,b) => a+b.formScore,0)/secondHalf.length : 0;
  const formTrend = avgForm1 > 0 ? Math.round(((avgForm2 - avgForm1) / avgForm1) * 100) : 0;

  const cards = [
    { label: 'Total Reps',    value: totalReps,     sub: `${totalSessions} sessions`,     color: '#818cf8', trend: repsTrend, unit: '' },
    { label: 'Avg Form Score',value: formRangeStr,  sub: 'per session',                    color: avgForm>=80?'#22c55e':avgForm>=50?'#eab308':'#ef4444', trend: formTrend, unit: '' },
    { label: 'Best Session',  value: bestReps,       sub: 'reps in one session',            color: '#f97316', trend: null },
    { label: 'Sessions',      value: totalSessions,  sub: activePeriod==='all'?'all time':`last ${activePeriod} days`, color: '#818cf8', trend: null },
    { label: 'Time Trained',  value: totalMins + 'm',sub: 'total active time',              color: '#3b82f6', trend: null },
  ];

  const row = document.getElementById('hero-stats');
  row.innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="sc-label">${c.label}</div>
      <div class="sc-value" style="color:${c.color}">${c.value}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:2px">
        <div class="sc-sub">${c.sub}</div>
        ${c.trend !== null ? `<div class="sc-change ${c.trend > 0 ? 'up' : c.trend < 0 ? 'down' : 'flat'}">${c.trend > 0 ? '↑' : c.trend < 0 ? '↓' : '→'} ${Math.abs(c.trend)}%</div>` : ''}
      </div>
    </div>
  `).join('');
}

// ─── Chart.js Shared Helpers ─────────────────────────────────────────
Chart.defaults.color = '#888899';
Chart.defaults.font.family = 'system-ui, -apple-system, sans-serif';

let charts = {}; // Store chart instances to destroy before re-render

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
  }
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

// ─── Reps Line Chart ──────────────────────────────────────────────
function renderRepsChart() {
  const container = document.getElementById('chart-reps');
  container.innerHTML = '<canvas id="canvas-reps"></canvas>';
  
  const s = filteredSessions;
  if (!s.length) { container.innerHTML = '<div style="color:#888;padding:40px;text-align:center">No data for this period</div>'; return; }

  const labels = s.map(x => formatDate(x.date));
  const data = s.map(x => x.reps);

  const ctx = document.getElementById('canvas-reps').getContext('2d');
  destroyChart('reps');
  charts['reps'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Total Reps',
        data,
        borderColor: '#818cf8',
        backgroundColor: 'rgba(129, 140, 248, 0.2)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#818cf8',
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });

  // Trend badge
  const badge = document.getElementById('reps-trend-badge');
  const first = s.slice(0, Math.ceil(s.length/2));
  const last  = s.slice(Math.ceil(s.length/2));
  const avg1  = first.length ? first.reduce((a,b)=>a+b.reps,0)/first.length : 0;
  const avg2  = last.length ? last.reduce((a,b)=>a+b.reps,0)/last.length : 0;
  const diff  = Math.round(avg2-avg1);
  badge.className = 'card-badge ' + (diff>0?'up':diff<0?'down':'flat');
  badge.textContent = diff>0?`↑ +${diff} reps avg`:diff<0?`↓ ${diff} reps avg`:'→ Stable';
}

// ─── Form Score Line Chart ────────────────────────────────────────
function renderFormChart() {
  const container = document.getElementById('chart-form');
  container.innerHTML = '<canvas id="canvas-form"></canvas>';
  
  const s = filteredSessions;
  if (!s.length) { container.innerHTML = '<div style="color:#888;padding:40px;text-align:center">No data for this period</div>'; return; }

  const labels = s.map(x => formatDate(x.date));
  const data = s.map(x => x.formScore);

  const ctx = document.getElementById('canvas-form').getContext('2d');
  destroyChart('form');
  charts['form'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Form Score %',
        data,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: (ctx) => {
          const val = ctx.raw || 0;
          return val >= 80 ? '#22c55e' : val >= 50 ? '#eab308' : '#ef4444';
        },
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw || 0;
              const min = Math.max(0, val - 5);
              const max = Math.min(100, val + 5);
              return `Form Score: ${min}% - ${max}%`;
            }
          }
        }
      },
      scales: {
        y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });

  // Trend badge
  const badge = document.getElementById('form-trend-badge');
  const first = s.slice(0, Math.ceil(s.length/2));
  const last  = s.slice(Math.ceil(s.length/2));
  const avg1  = first.length ? first.reduce((a,b)=>a+b.formScore,0)/first.length : 0;
  const avg2  = last.length  ? last.reduce((a,b)=>a+b.formScore,0)/last.length   : 0;
  const diff  = Math.round(avg2 - avg1);
  badge.className = 'card-badge ' + (diff>0?'up':diff<0?'down':'flat');
  badge.textContent = diff>0?`↑ +${diff}% avg`:diff<0?`↓ ${diff}% avg`:'→ Stable';
}

// ─── Pie Chart (exercise breakdown) ──────────────────────────────
function renderPieChart() {
  const container = document.getElementById('chart-pie');
  container.innerHTML = '<div style="display:flex; height:100%;"><div style="flex:1;"><canvas id="canvas-pie"></canvas></div><div class="pie-legend" id="pie-legend-container"></div></div>';
  const s = allSessions; // always show all for pie
  if (!s.length) return;

  const counts = {};
  s.forEach(x => { counts[x.exercise] = (counts[x.exercise] || 0) + 1; });
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  const entries = Object.entries(counts).sort((a,b) => b[1]-a[1]);

  const labels = entries.map(e => allSessions.find(s=>s.exercise===e[0])?.exerciseName || e[0]);
  const data = entries.map(e => e[1]);
  const bgColors = entries.map(e => EXERCISE_COLORS[e[0]] || '#6366f1');

  const ctx = document.getElementById('canvas-pie').getContext('2d');
  destroyChart('pie');
  charts['pie'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors,
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: { legend: { display: false } }
    }
  });

  const legend = document.getElementById('pie-legend-container');
  entries.forEach(([ex, count]) => {
    const name = allSessions.find(s=>s.exercise===ex)?.exerciseName || ex;
    const pct  = Math.round((count/total)*100);
    const li   = document.createElement('div');
    li.className = 'pie-legend-item';
    li.innerHTML = `<div class="pie-dot" style="background:${EXERCISE_COLORS[ex]||'#6366f1'}"></div>
      <span style="flex:1;color:#b0b0c8">${name}</span>
      <span style="color:#e8e8f2;font-weight:700">${pct}%</span>`;
    legend.appendChild(li);
  });
}

// ─── Good vs Bad Stacked Bars ─────────────────────────────────────
function renderQualityChart() {
  const container = document.getElementById('chart-quality');
  container.innerHTML = '<canvas id="canvas-quality"></canvas>';
  
  const s = filteredSessions.slice(-12);
  if (!s.length) return;

  const labels = s.map(x => formatDate(x.date));
  const goodData = s.map(x => x.goodReps);
  const badData = s.map(x => x.badReps);

  const ctx = document.getElementById('canvas-quality').getContext('2d');
  destroyChart('quality');
  charts['quality'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Good Form', data: goodData, backgroundColor: '#22c55e' },
        { label: 'Needs Work', data: badData, backgroundColor: '#ef4444' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#888899' } } },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// ─── Weekly Volume Bar Chart ──────────────────────────────────────
function renderWeeklyChart() {
  const container = document.getElementById('chart-weekly');
  container.innerHTML = '<canvas id="canvas-weekly"></canvas>';
  
  const s = allSessions;
  if (!s.length) return;

  const weeks = {};
  s.forEach(x => {
    const d = new Date(x.date);
    const day = d.getDay() || 7; 
    const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
    const key = mon.toISOString().split('T')[0];
    weeks[key] = (weeks[key] || 0) + x.reps;
  });

  const sorted = Object.entries(weeks).sort((a,b) => a[0].localeCompare(b[0])).slice(-12);
  if (!sorted.length) return;

  const labels = sorted.map(([k]) => `W${getWeekNum(new Date(k))}`);
  const data = sorted.map(x => x[1]);

  const ctx = document.getElementById('canvas-weekly').getContext('2d');
  destroyChart('weekly');
  charts['weekly'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Reps',
        data,
        backgroundColor: '#6366f1',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function getWeekNum(d) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7);
}

// ─── Sessions Table ───────────────────────────────────────────────
function renderSessionsTable() {
  const container = document.getElementById('sessions-table');
  const recent = [...filteredSessions].reverse().slice(0, 10);

  if (!recent.length) { container.innerHTML = '<p style="color:#888;padding:16px">No sessions found</p>'; return; }

  const scoreClass = s => s >= 80 ? 'good' : s >= 50 ? 'fair' : 'bad';
  const fmtDur = s => s ? `${Math.floor(s/60)}m ${s%60}s` : '—';
  const fmtDate = iso => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  };

  container.innerHTML = `
    <table class="sessions-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Exercise</th>
          <th>Reps</th>
          <th>Form Score</th>
          <th>Good Reps</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${recent.map(s => `
          <tr>
            <td style="color:var(--muted);font-size:12px">${fmtDate(s.date)}</td>
            <td><span class="ex-tag">${s.exerciseName}</span></td>
            <td><strong style="color:var(--a2)">${s.reps}</strong></td>
            <td><span class="score-badge ${scoreClass(s.formScore)}">${Math.max(0, s.formScore - 5)}% - ${Math.min(100, s.formScore + 5)}%</span></td>
            <td>${s.goodReps} <span style="color:var(--muted);font-size:12px">/ ${s.reps}</span></td>
            <td style="color:var(--muted)">${fmtDur(s.durationSecs)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
