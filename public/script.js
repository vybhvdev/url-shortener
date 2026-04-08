// API endpoints
const API = {
  shorten: '/api/shorten',
  links: '/api/links',
  stats: (code) => `/api/stats/${code}`
};

// DOM elements
const longUrlInput = document.getElementById('longUrlInput');
const shortenBtn = document.getElementById('shortenBtn');
const resultMessage = document.getElementById('resultMessage');
const linksListDiv = document.getElementById('linksList');
const statsModal = document.getElementById('statsModal');
const modalContent = document.getElementById('modalContent');
const linkCountBadge = document.getElementById('linkCount');
const closeModalSpan = document.querySelector('.close');

let currentChart = null;

document.addEventListener('DOMContentLoaded', () => {
  fetchLinks();
});

shortenBtn.addEventListener('click', async () => {
  const longUrl = longUrlInput.value.trim();
  if (!longUrl) {
    showMessage('Please provide a valid destination URL.', 'error');
    return;
  }

  const originalBtnText = shortenBtn.innerText;
  shortenBtn.innerText = 'Processing...';
  shortenBtn.disabled = true;

  try {
    const response = await fetch(API.shorten, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ longUrl })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    showMessage(`Success: <a href="${data.shortUrl}" target="_blank" style="color:inherit;text-decoration:underline;">${data.shortUrl}</a>`, 'success');
    longUrlInput.value = '';
    fetchLinks();
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'error');
  } finally {
    shortenBtn.innerText = originalBtnText;
    shortenBtn.disabled = false;
  }
});

async function fetchLinks() {
  try {
    const response = await fetch(API.links);
    if (!response.ok) throw new Error('Could not retrieve links');
    const links = await response.json();
    if (linkCountBadge) linkCountBadge.innerText = `${links.length} ${links.length === 1 ? 'Link' : 'Links'}`;
    renderLinksTable(links);
  } catch (error) {
    linksListDiv.innerHTML = `<div class="loading">Dashboard offline: ${error.message}</div>`;
  }
}

function renderLinksTable(links) {
  if (!links.length) {
    linksListDiv.innerHTML = '<div class="loading">No links found. Create one to get started.</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'links-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Alias</th>
        <th>Destination</th>
        <th>Analytics</th>
        <th>Activity</th>
        <th></th>
      </tr>
    </thead>
    <tbody id="linksTableBody"></tbody>
  `;
  const tbody = table.querySelector('#linksTableBody');

  links.forEach(link => {
    const row = tbody.insertRow();
    const shortUrl = `${window.location.origin}/${link.shortCode}`;
    row.innerHTML = `
      <td class="short-link-cell"><a href="${shortUrl}" target="_blank" class="short-link">${link.shortCode}</a></td>
      <td class="long-link-cell" title="${link.longUrl}">${link.longUrl}</td>
      <td><span class="clicks-badge">${link.clicksCount} clicks</span></td>
      <td style="font-size:0.8rem;color:var(--text-muted);">${formatDate(link.createdAt)}</td>
      <td class="actions-cell"><button class="stats-btn" data-code="${link.shortCode}">View Report</button></td>
    `;
  });

  linksListDiv.innerHTML = '';
  linksListDiv.appendChild(table);

  document.querySelectorAll('.stats-btn').forEach(btn => {
    btn.addEventListener('click', () => showStatsModal(btn.getAttribute('data-code')));
  });
}

async function showStatsModal(shortCode) {
  statsModal.style.display = 'block';
  modalContent.innerHTML = '<h2>Analytics Report</h2><div class="loading">Synchronising data...</div>';

  try {
    const response = await fetch(API.stats(shortCode));
    if (!response.ok) throw new Error('Analytics unavailable');
    const stats = await response.json();
    renderStatsModal(stats);
  } catch (error) {
    modalContent.innerHTML = `<h2>Sync Failure</h2><div class="loading">${error.message}</div>`;
  }
}

function renderStatsModal(stats) {
  const shortUrl = `${window.location.origin}/${stats.shortCode}`;
  const dailyData = stats.dailyClicks || [];
  const dates = dailyData.map(d => d.date);
  const counts = dailyData.map(d => d.count);

  modalContent.innerHTML = `
    <div class="modal-header">
        <h2>Report for /${stats.shortCode}</h2>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><h4>Performance</h4><div class="stat-number">${stats.clicksCount}</div></div>
      <div class="stat-card"><h4>Created</h4><div class="stat-number" style="font-size:1.2rem;margin-top:0.5rem;">${formatDate(stats.createdAt)}</div></div>
    </div>
    <div class="chart-container">
      <h3>Historical Performance</h3>
      <canvas id="clicksChart"></canvas>
    </div>
    <div class="analytics-sections">
      <div>
        <h3>Source Distribution</h3>
        ${renderReferrers(stats.topReferrers || [])}
      </div>
      <div>
        <h3>Recent Traffic</h3>
        ${renderRecentClicks(stats.recentClicks || [])}
      </div>
    </div>
    <div style="margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border);">
      <h3>Destination</h3>
      <p style="word-break: break-all; font-size:0.9rem; opacity:0.7;"><a href="${stats.longUrl}" target="_blank" style="color:var(--accent);">${stats.longUrl}</a></p>
    </div>
  `;

  if (dates.length) {
    const ctx = document.getElementById('clicksChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f43f5e';
    
    currentChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          label: 'Interactions',
          data: counts,
          borderColor: accentColor,
          backgroundColor: 'rgba(244, 63, 114, 0.05)',
          borderWidth: 3,
          pointBackgroundColor: accentColor,
          pointRadius: 4,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
            legend: { display: false }
        },
        scales: {
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#666', font: { weight: 'bold' } }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#666' }
            }
        }
      }
    });
  } else {
    const container = document.querySelector('.chart-container');
    if (container) container.innerHTML += '<p style="text-align:center;padding:2rem;color:var(--text-muted);">Awaiting interaction data...</p>';
  }
}

function renderReferrers(referrers) {
  if (!referrers.length) return '<p style="color:var(--text-muted);font-size:0.9rem;">No source data</p>';
  let html = '<ul class="referrer-list">';
  referrers.forEach(ref => {
    let displayName = ref.referrer;
    if (displayName === 'Direct / Unknown') displayName = 'Direct Traffic';
    else {
      try {
        const url = new URL(ref.referrer);
        displayName = url.hostname;
      } catch(e) {}
    }
    html += `<li><span title="${ref.referrer}">${displayName}</span><span class="count">${ref.count}</span></li>`;
  });
  html += '</ul>';
  return html;
}

function renderRecentClicks(recent) {
  if (!recent.length) return '<p style="color:var(--text-muted);font-size:0.9rem;">No traffic recorded</p>';
  let html = '<ul class="recent-list">';
  recent.forEach(click => {
    html += `
      <li>
        <div>${click.ip || 'Masked IP'}</div>
        <div class="timestamp">${new Date(click.clickedat).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
      </li>
    `;
  });
  html += '</ul>';
  return html;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showMessage(msg, type) {
  resultMessage.innerHTML = msg;
  resultMessage.className = `message ${type}`;
  const closeBtn = document.createElement('span');
  closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
  closeBtn.style.cssText = 'position:absolute;right:1rem;top:50%;transform:translateY(-50%);cursor:pointer;opacity:0.6;';
  closeBtn.onclick = () => {
    resultMessage.style.display = 'none';
  };
  resultMessage.appendChild(closeBtn);
  resultMessage.style.display = 'block';
}

closeModalSpan.addEventListener('click', () => {
  statsModal.style.display = 'none';
  if (currentChart) {
    currentChart.destroy();
    currentChart = null;
  }
});

window.addEventListener('click', (e) => {
  if (e.target === statsModal) {
    statsModal.style.display = 'none';
    if (currentChart) {
      currentChart.destroy();
      currentChart = null;
    }
  }
});
