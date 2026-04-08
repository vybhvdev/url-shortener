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
    showFeedback('Please enter a valid URL', 'error');
    return;
  }

  shortenBtn.disabled = true;
  shortenBtn.innerText = 'Creating...';

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

    const shortUrl = data.shortUrl;
    showFeedback(`
        <span>Link ready: <a href="${shortUrl}" target="_blank" class="short-url-link">${shortUrl}</a></span>
        <button class="copy-btn" onclick="copyToClipboard('${shortUrl}')">Copy Link</button>
    `, 'success');
    
    longUrlInput.value = '';
    fetchLinks();
  } catch (error) {
    showFeedback(`Error: ${error.message}`, 'error');
  } finally {
    shortenBtn.disabled = false;
    shortenBtn.innerText = 'Shorten URL';
  }
});

async function fetchLinks() {
  try {
    const response = await fetch(API.links);
    if (!response.ok) throw new Error('Could not load links');
    const links = await response.json();
    renderLinksTable(links);
  } catch (error) {
    linksListDiv.innerHTML = `<div class="loading">Dashboard temporary unavailable: ${error.message}</div>`;
  }
}

function renderLinksTable(links) {
  if (!links.length) {
    linksListDiv.innerHTML = '<div class="loading">No active links in your history.</div>';
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Short Code</th>
          <th>Original Destination</th>
          <th>Clicks</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  links.forEach(link => {
    const shortUrl = `${window.location.origin}/${link.shortCode}`;
    html += `
      <tr>
        <td><a href="${shortUrl}" target="_blank" class="short-url-link">${link.shortCode}</a></td>
        <td title="${link.longUrl}"><div class="long-url-text">${link.longUrl}</div></td>
        <td><span class="clicks-pill">${link.clicksCount} clicks</span></td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${new Date(link.createdAt).toLocaleDateString()}</td>
        <td style="text-align: right;">
            <button class="secondary" onclick="showStatsModal('${link.shortCode}')" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;">Analytics</button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  linksListDiv.innerHTML = html;
}

async function showStatsModal(shortCode) {
  statsModal.style.display = 'block';
  modalContent.innerHTML = '<div class="loading">Retrieving link analytics...</div>';

  try {
    const response = await fetch(API.stats(shortCode));
    if (!response.ok) throw new Error('Failed to fetch analytics');
    const stats = await response.json();
    renderStatsModal(stats);
  } catch (error) {
    modalContent.innerHTML = `<div class="loading" style="color: #f87171;">Analytics Error: ${error.message}</div>`;
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
    <div class="stats-summary">
      <div class="stat-item">
        <span class="stat-label">Total Engagement</span>
        <div class="stat-value">${stats.clicksCount}</div>
      </div>
      <div class="stat-item">
        <span class="stat-label">Unique Referrers</span>
        <div class="stat-value">${(stats.topReferrers || []).length}</div>
      </div>
    </div>
    <div class="chart-container">
      <h3 style="margin-bottom: 1.5rem; font-size: 0.875rem; color: var(--text-muted);">Interaction Timeline</h3>
      <canvas id="clicksChart"></canvas>
    </div>
    <div class="analytics-sections" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
      <div>
        <h3 style="font-size: 0.875rem; margin-bottom: 1rem;">Top Traffic Sources</h3>
        ${renderReferrers(stats.topReferrers || [])}
      </div>
      <div>
        <h3 style="font-size: 0.875rem; margin-bottom: 1rem;">Recent Interactions</h3>
        ${renderRecentClicks(stats.recentClicks || [])}
      </div>
    </div>
    <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border);">
      <h3 style="font-size: 0.875rem; margin-bottom: 0.5rem; color: var(--text-muted);">Destination URL</h3>
      <p style="word-break: break-all; font-size: 0.875rem;"><a href="${stats.longUrl}" target="_blank" style="color: var(--accent);">${stats.longUrl}</a></p>
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
          label: 'Interactions',
          data: counts,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 3,
          pointBackgroundColor: '#6366f1',
          pointRadius: 4,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
            x: { grid: { display: false }, ticks: { color: '#64748b' } }
        }
      }
    });
  } else {
    document.querySelector('.chart-container').innerHTML += '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">Awaiting data for visualisation...</p>';
  }
}

function renderReferrers(referrers) {
  if (!referrers.length) return '<p style="font-size: 0.875rem; color: var(--text-muted);">No source data captured yet.</p>';
  let html = '<ul class="referrer-list" style="list-style: none;">';
  referrers.forEach(ref => {
    let name = ref.referrer === 'Direct / Unknown' ? 'Direct Entry' : ref.referrer;
    try { if(name.startsWith('http')) name = new URL(name).hostname; } catch(e) {}
    html += `<li style="padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.875rem; display: flex; justify-content: space-between;">
        <span title="${ref.referrer}">${name}</span>
        <span style="font-weight: 700; color: var(--accent);">${ref.count}</span>
    </li>`;
  });
  return html + '</ul>';
}

function renderRecentClicks(recent) {
  if (!recent.length) return '<p style="font-size: 0.875rem; color: var(--text-muted);">No recent activity.</p>';
  let html = '<ul class="recent-list" style="list-style: none;">';
  recent.forEach(click => {
    html += `<li style="padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.875rem;">
        <div style="font-weight: 600;">${click.ip || 'Anonymous'}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${new Date(click.clickedat).toLocaleString()}</div>
    </li>`;
  });
  return html + '</ul>';
}

function showFeedback(msg, type) {
  resultMessage.innerHTML = msg;
  resultMessage.className = `message ${type}`;
  resultMessage.style.display = type === 'success' ? 'flex' : 'block';
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.copy-btn');
        const originalText = btn.innerText;
        btn.innerText = 'Copied!';
        btn.style.background = '#22c55e';
        btn.style.color = '#fff';
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = '';
            btn.style.color = '';
        }, 2000);
    });
}

closeModalSpan.onclick = () => { statsModal.style.display = 'none'; };
window.onclick = (e) => { if (e.target === statsModal) statsModal.style.display = 'none'; };
