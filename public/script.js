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
const closeModalSpan = document.querySelector('.close');

let currentChart = null;

document.addEventListener('DOMContentLoaded', () => {
  fetchLinks();
});

shortenBtn.addEventListener('click', async () => {
  const longUrl = longUrlInput.value.trim();
  if (!longUrl) {
    showMessage('Please enter a URL', 'error');
    return;
  }

  try {
    const response = await fetch(API.shorten, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ longUrl })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to shorten URL');
    }

    showMessage(`✅ Short URL created: <a href="${data.shortUrl}" target="_blank">${data.shortUrl}</a>`, 'success');
    longUrlInput.value = '';
    fetchLinks();
  } catch (error) {
    showMessage(`❌ Error: ${error.message}`, 'error');
  }
});

async function fetchLinks() {
  linksListDiv.innerHTML = '<div class="loading">Loading links...</div>';
  try {
    const response = await fetch(API.links);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    const links = await response.json();
    renderLinksTable(links);
  } catch (error) {
    linksListDiv.innerHTML = `<div class="loading">Failed to load links: ${error.message}</div>`;
    console.error(error);
  }
}

function renderLinksTable(links) {
  if (!links.length) {
    linksListDiv.innerHTML = '<div class="loading">No links yet. Create your first short link above!</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'links-table';
  table.innerHTML = `
    <thead>
      <tr><th>Short Code</th><th>Original URL</th><th>Clicks</th><th>Created</th><th>Actions</th></tr>
    </thead>
    <tbody id="linksTableBody"></tbody>
  `;
  const tbody = table.querySelector('#linksTableBody');

  links.forEach(link => {
    const row = tbody.insertRow();
    const shortUrl = `${window.location.origin}/${link.shortCode}`;
    row.innerHTML = `
      <td><a href="${shortUrl}" target="_blank" class="short-link">${link.shortCode}</a></td>
      <td title="${link.longUrl}">${truncateUrl(link.longUrl)}</td>
      <td>${link.clicksCount}</td>
      <td>${formatDate(link.createdAt)}</td>
      <td><button class="stats-btn" data-code="${link.shortCode}">📊 Stats</button></td>
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
  modalContent.innerHTML = '<h2>Link Analytics</h2><div class="loading">Loading stats...</div>';

  try {
    const response = await fetch(API.stats(shortCode));
    if (!response.ok) throw new Error('Failed to fetch stats');
    const stats = await response.json();
    renderStatsModal(stats);
  } catch (error) {
    modalContent.innerHTML = `<h2>Error</h2><div class="loading">Failed to load stats: ${error.message}</div>`;
  }
}

function renderStatsModal(stats) {
  const shortUrl = `${window.location.origin}/${stats.shortCode}`;
  const dailyData = stats.dailyClicks || [];
  const dates = dailyData.map(d => d.date);
  const counts = dailyData.map(d => d.count);

  modalContent.innerHTML = `
    <h2>📈 Analytics for <a href="${shortUrl}" target="_blank">${stats.shortCode}</a></h2>
    <div class="stats-grid">
      <div class="stat-card"><h4>Total Clicks</h4><div class="stat-number">${stats.clicksCount}</div></div>
      <div class="stat-card"><h4>Created</h4><div class="stat-number">${formatDate(stats.createdAt)}</div></div>
    </div>
    <div class="chart-container">
      <h3>Daily Clicks (Last 30 days)</h3>
      <canvas id="clicksChart"></canvas>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
      <div>
        <h3>Top Referrers</h3>
        ${renderReferrers(stats.topReferrers || [])}
      </div>
      <div>
        <h3>Recent Clicks</h3>
        ${renderRecentClicks(stats.recentClicks || [])}
      </div>
    </div>
    <div style="margin-top: 1rem;">
      <h3>Original URL</h3>
      <p style="word-break: break-all;"><a href="${stats.longUrl}" target="_blank">${stats.longUrl}</a></p>
    </div>
  `;

  if (dates.length) {
    const ctx = document.getElementById('clicksChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    currentChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          label: 'Clicks',
          data: counts,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true
      }
    });
  } else {
    const container = document.querySelector('.chart-container');
    if (container) container.innerHTML += '<p>No click data yet.</p>';
  }
}

function renderReferrers(referrers) {
  if (!referrers.length) return '<p>No referrer data</p>';
  let html = '<ul class="referrer-list">';
  referrers.forEach(ref => {
    let displayName = ref.referrer;
    if (displayName === 'Direct / Unknown') displayName = '🔗 Direct / Unknown';
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
  if (!recent.length) return '<p>No clicks recorded yet</p>';
  let html = '<ul class="recent-list">';
  recent.forEach(click => {
    const device = click.useragent && click.useragent.includes('Mobile') ? '📱' : '💻';
    html += `
      <li>
        <div>${device} ${click.ip || 'unknown IP'}</div>
        <div class="timestamp">${new Date(click.clickedat).toLocaleString()}</div>
        <div style="font-size: 0.75rem; color: #718096;">${truncateUserAgent(click.useragent)}</div>
      </li>
    `;
  });
  html += '</ul>';
  return html;
}

function truncateUrl(url, maxLength = 50) {
  if (!url) return '';
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + '...';
}

function truncateUserAgent(ua, maxLength = 60) {
  if (!ua) return 'Unknown';
  if (ua.length <= maxLength) return ua;
  return ua.substring(0, maxLength) + '...';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
}

function showMessage(msg, type) {
  resultMessage.innerHTML = msg;
  resultMessage.className = `message ${type}`;
  // Add close button
  const closeBtn = document.createElement('span');
  closeBtn.innerHTML = '✕';
  closeBtn.className = 'close-message';
  closeBtn.onclick = () => {
    resultMessage.style.display = 'none';
  };
  resultMessage.appendChild(closeBtn);
  resultMessage.style.display = 'block';
  // No auto‑timeout – user must dismiss.
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
