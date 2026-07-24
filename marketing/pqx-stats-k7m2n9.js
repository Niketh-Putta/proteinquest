const API = '/api/pqx-stats-k7m2n9';
const app = document.getElementById('app');

function fmt(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat().format(n);
}

function render(stats) {
  app.innerHTML = `
    <h1>ProteinQuest stats</h1>
    <p class="sub">Store download counts (private, not indexed).</p>
    <div class="grid">
      <div class="card">
        <div class="label">App Store (iOS)</div>
        <div class="value">${fmt(stats.apple?.total)}</div>
        <div class="hint">${stats.apple?.source ?? ''}</div>
        ${stats.apple?.error ? `<div class="error">${stats.apple.error}</div>` : ''}
      </div>
      <div class="card">
        <div class="label">Google Play (Android)</div>
        <div class="value">${fmt(stats.android?.total)}</div>
        <div class="hint">${stats.android?.source ?? ''}</div>
        ${stats.android?.error ? `<div class="error">${stats.android.error}</div>` : ''}
      </div>
    </div>
    <p class="meta">Updated ${new Date(stats.updatedAt).toLocaleString()}</p>
  `;
}

async function load() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error('Could not load stats');
    render(await res.json());
  } catch (e) {
    app.innerHTML = `
      <h1>ProteinQuest stats</h1>
      <p class="error">${e.message || 'Failed to load stats'}</p>
    `;
  }
}

load();
