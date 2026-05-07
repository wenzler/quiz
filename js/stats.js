// stats.js – Cleaned up with history limit and clear button

const HISTORY_KEY = 'quiz_history';
const MAX_HISTORY = 200;   // Keep only the last 200 attempts

function saveAttempt(score, total, trainingMode, fileName) {
  try {
    let history = getHistory();

    const attempt = {
      date: new Date().toISOString(),
      score: Number(score),
      total: Number(total),
      percent: total > 0 ? Math.round((score / total) * 100) : 0,
      trainingMode: !!trainingMode,
      fileName: fileName || '—'
    };

    history.push(attempt);

    // Enforce maximum history limit
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);   // keep only the newest entries
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    updateQuickStats();
  } catch (err) {
    console.error('Failed to save attempt:', err);
  }
}

function getHistory() {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    if (!data) return [];
    return JSON.parse(data) || [];
  } catch (err) {
    console.error('Failed to parse history:', err);
    return [];
  }
}

function clearHistory() {
  if (!confirm(i18next.t('confirm_clear_history') || 
      "Delete ALL attempt history? This action cannot be undone.")) {
    return;
  }

  localStorage.removeItem(HISTORY_KEY);
  updateQuickStats();
  
  // If currently viewing stats page, refresh it
  if ($('#quizContainer').is(':visible') && typeof showStats === 'function') {
    showStats();
  }
}

function updateQuickStats() {
  const history = getHistory();
  const $stats = $('#quickStats');

  if (history.length === 0) {
    $stats.html('<p class="text-muted">' + (i18next.t('no_attempts') || 'No attempts recorded yet.') + '</p>');
    return;
  }

  const last = history[history.length - 1];
  const lastDate = new Date(last.date).toLocaleString();
  const fileInfo = last.fileName && last.fileName !== '—' ? ` (${last.fileName})` : '';

  const totalAttempts = history.length;
  const avgPercent = Math.round(
    history.reduce((sum, a) => sum + a.percent, 0) / totalAttempts
  ) || 0;
  const bestPercent = Math.max(...history.map(a => a.percent), 0);

  let html = `
    <p><strong>${i18next.t('last_attempt') || 'Last attempt'}:</strong> 
       ${last.percent}% (${last.score}/${last.total})${fileInfo} — ${lastDate}</p>
    <p><strong>${i18next.t('average') || 'Average'}:</strong> 
       ${avgPercent}% ${i18next.t('over') || 'over'} ${totalAttempts} ${i18next.t('attempts') || 'attempts'}</p>
    <p><strong>${i18next.t('best') || 'Best'}:</strong> ${bestPercent}%</p>
  `;

  $stats.html(html);
}

function showStats() {
  const history = getHistory();

  let html = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="text-white mb-0">${i18next.t('attempt_history') || 'Attempt History'}</h4>
      <button class="btn btn-outline-danger btn-sm" id="clearHistoryBtn">
        <span data-feather="trash-2" class="me-1"></span> 
        ${i18next.t('clear_history') || 'Clear History'}
      </button>
    </div>`;

  if (history.length === 0) {
    html += `<p class="text-muted">${i18next.t('no_attempts') || 'No attempts recorded yet.'}</p>`;
    $('#quizContainer').html(html).show();
    feather.replace();
    return;
  }

  // Build history table (newest first)
  html += `
    <div class="table-responsive mb-5">
      <table class="table table-dark table-striped table-hover">
        <thead>
          <tr>
            <th>${i18next.t('date')}</th>
            <th>${i18next.t('test_file')}</th>
            <th>${i18next.t('score')}</th>
            <th>${i18next.t('percent')}</th>
            <th>${i18next.t('mode')}</th>
          </tr>
        </thead>
        <tbody>`;

  [...history].reverse().forEach(a => {
    const dateStr = new Date(a.date).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const mode = a.trainingMode 
      ? (i18next.t('training') || 'Training') 
      : (i18next.t('exam') || 'Exam');

    html += `
      <tr>
        <td>${dateStr}</td>
        <td>${a.fileName || '—'}</td>
        <td>${a.score} / ${a.total}</td>
        <td><strong>${a.percent}%</strong></td>
        <td>${mode}</td>
      </tr>`;
  });

  html += '</tbody></table></div>';

  // Chart section
  const byFile = groupByFile(history);
  const filesWithMultiple = Object.keys(byFile).filter(f => byFile[f].length >= 2);

  if (filesWithMultiple.length > 0) {
    html += `
      <h5 class="mb-3 text-white">${i18next.t('score_progress_all') || 'Score Progress – All Test Files'}</h5>
      <div class="card bg-dark text-white mb-4">
        <div class="card-body">
          <div style="height: 420px; position: relative;">
            <canvas id="combinedProgressChart"></canvas>
          </div>
        </div>
      </div>`;
  } else {
    html += `<p class="text-muted">${i18next.t('not_enough_attempts') || 'Not enough attempts for a progress graph yet.'}</p>`;
  }

  $('#quizContainer').html(html).show();
  feather.replace();

  // Attach clear button handler
  $('#clearHistoryBtn').on('click', clearHistory);

  // Render chart
  if (filesWithMultiple.length > 0) {
    renderCombinedChart(byFile);
  }
}

// Helper: Group attempts by fileName
function groupByFile(history) {
  const byFile = {};
  history.forEach(a => {
    const file = a.fileName || 'Unknown';
    if (!byFile[file]) byFile[file] = [];
    byFile[file].push(a);
  });
  return byFile;
}

// Improved Chart with proper time scale
function renderCombinedChart(byFile) {
  const canvas = document.getElementById('combinedProgressChart');
  if (!canvas) return;

  const colors = ['#0d6efd', '#dc3545', '#198754', '#ffc107', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c'];
  let colorIndex = 0;
  const datasets = [];

  Object.keys(byFile).forEach(file => {
    const attempts = byFile[file];
    if (attempts.length < 2) return;

    const sorted = [...attempts].sort((a, b) => new Date(a.date) - new Date(b.date));

    datasets.push({
      label: file,
      data: sorted.map(a => ({ 
        x: new Date(a.date), 
        y: a.percent 
      })),
      borderColor: colors[colorIndex % colors.length],
      backgroundColor: colors[colorIndex % colors.length] + '33',
      tension: 0.4,
      fill: true,
      pointRadius: 5,
      pointHoverRadius: 7
    });

    colorIndex++;
  });

  new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'day',
            tooltipFormat: 'PP p',
            displayFormats: { day: 'MMM d' }
          },
          title: { 
            display: true, 
            text: i18next.t('date') || 'Date',
            color: '#e0e0e0'
          },
          ticks: { color: '#ccc' },
          grid: { color: '#444' }
        },
        y: {
          min: 0,
          max: 100,
          title: { 
            display: true, 
            text: i18next.t('percent_score') || 'Percent Score',
            color: '#e0e0e0'
          },
          ticks: { color: '#ccc' },
          grid: { color: '#444' }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#e0e0e0', boxWidth: 12, padding: 15 }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(33,37,41,0.95)'
        }
      }
    }
  });
}

// Initialization
$(document).ready(function() {
  if (typeof updateQuickStats === 'function') {
    updateQuickStats();
  }
});

// Export functions
window.saveAttempt = saveAttempt;
window.updateQuickStats = updateQuickStats;
window.showStats = showStats;
window.clearHistory = clearHistory;   // optional, for direct access
