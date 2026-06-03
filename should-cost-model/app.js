// ── Application Controller ──
let currentPage = 'dashboard';

document.addEventListener('DOMContentLoaded', async () => {
  // Wire navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Load commodity data
  try {
    await loadAllCommodities();
    document.getElementById('last-updated').textContent = `FRED data loaded: ${new Date().toLocaleDateString()}`;
  } catch (e) {
    document.getElementById('last-updated').textContent = 'Using static commodity data (FRED unavailable)';
  }

  renderPage('dashboard');
});

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
  renderPage(page);
}

function renderPage(page) {
  const el = document.getElementById(`page-${page}`);
  if (!el) return;

  switch (page) {
    case 'dashboard': renderDashboard(el); break;
    case 'category-detail': renderCategoryDetail(el); break;
    case 'commodity-tracker': renderCommodityTracker(el); break;
    case 'forecast': renderForecast(el); break;
  }
}

function renderDashboard(el) {
  const categories = Object.keys(CATEGORY_MODELS);
  const currentMonth = getCurrentMonth();

  let html = '<div class="grid">';
  for (const key of categories) {
    const model = CATEGORY_MODELS[key];
    const result = calculateShouldCostForSku(key, model.skus[0].id, currentMonth);
    const conf = getConfidenceIndicator(key);
    if (!result) continue;

    html += `
      <div class="card metric-card">
        <div style="font-size: 1.5rem; margin-bottom: 8px;">${model.icon}</div>
        <div style="font-weight: 600; margin-bottom: 4px;">${model.label}</div>
        <div class="metric-value">${formatCurrency(result.total)}</div>
        <div class="metric-label">${model.skus[0].label}</div>
        <div class="confidence-badge confidence-${conf.level}" style="margin-top: 8px;">${conf.label} Confidence</div>
      </div>
    `;
  }
  html += '</div>';

  // Breakdown table
  html += '<div class="card"><h3 style="margin-bottom: 12px;">Cost Breakdown — All Categories</h3><table><thead><tr><th>Category</th><th>SKU</th><th>Should-Cost</th><th>Materials %</th><th>Labor %</th><th>Overhead %</th><th>Margin %</th></tr></thead><tbody>';
  for (const key of categories) {
    const model = CATEGORY_MODELS[key];
    const result = calculateShouldCostForSku(key, model.skus[0].id, currentMonth);
    if (!result) continue;
    const matPct = result.subtotal / result.total;
    const ohPct = result.overheadCost / result.total;
    const mrgPct = result.supplierMargin / result.total;
    const labPct = result.breakdown.filter(b => b.id.startsWith('labor')).reduce((s, b) => s + b.cost, 0) / result.total;

    html += `<tr><td>${model.icon} ${model.label}</td><td>${model.skus[0].label}</td><td><strong>${formatCurrency(result.total)}</strong></td><td>${(matPct * 100).toFixed(0)}%</td><td>${(labPct * 100).toFixed(0)}%</td><td>${(ohPct * 100).toFixed(0)}%</td><td>${(mrgPct * 100).toFixed(0)}%</td></tr>`;
  }
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

function renderCategoryDetail(el) {
  const categories = Object.keys(CATEGORY_MODELS);
  const currentMonth = getCurrentMonth();
  let html = '';

  for (const key of categories) {
    const model = CATEGORY_MODELS[key];
    const result = calculateShouldCostForSku(key, model.skus[0].id, currentMonth);
    if (!result) continue;

    html += `<div class="card"><h3>${model.icon} ${model.label} — ${model.skus[0].label}</h3><p style="color: var(--muted); margin: 8px 0 16px;">${model.description}</p>`;
    html += '<table><thead><tr><th>Component</th><th>Driver</th><th>Multiplier</th><th>Cost</th><th>% of Total</th></tr></thead><tbody>';
    for (const b of result.breakdown) {
      const driverLabel = b.driver ? (FRED_SERIES_META[b.driver]?.label || b.driver) : '—';
      html += `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${b.color};margin-right:6px"></span>${b.label}</td><td style="color:var(--muted)">${driverLabel}</td><td>${b.multiplier?.toFixed(3) || '—'}</td><td>${formatCurrency(b.cost)}</td><td>${(b.pct * 100).toFixed(1)}%</td></tr>`;
    }
    html += `</tbody></table><div style="margin-top: 12px; font-weight: 600;">Total: ${formatCurrency(result.total)}</div></div>`;
  }
  el.innerHTML = html;
}

function renderCommodityTracker(el) {
  const series = Object.keys(commodityData).filter(k => Object.keys(commodityData[k]).length > 0);
  let html = '<div class="card"><h3>Commodity Index Tracker</h3><p style="color: var(--muted); margin: 8px 0 16px;">Latest values from FRED (or static fallback)</p>';
  html += '<table><thead><tr><th>Series</th><th>Category</th><th>Latest Value</th><th>Data Points</th></tr></thead><tbody>';
  for (const key of series) {
    const meta = FRED_SERIES_META[key] || { label: key, category: '—' };
    const data = commodityData[key];
    const months = Object.keys(data).sort();
    const latest = data[months[months.length - 1]];
    html += `<tr><td>${meta.label}</td><td>${meta.category}</td><td>${typeof latest === 'number' ? latest.toLocaleString() : '—'}</td><td>${months.length}</td></tr>`;
  }
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

function renderForecast(el) {
  const categories = Object.keys(CATEGORY_MODELS);
  let html = '<div class="card"><h3>12-Month Should-Cost Forecast</h3><p style="color: var(--muted); margin: 8px 0 16px;">Linear regression on trailing 24 months of commodity data, with ±1.5σ confidence interval</p></div>';

  for (const key of categories) {
    const model = CATEGORY_MODELS[key];
    const series = buildForecastSeries(key, model.skus[0].id, 24);
    if (!series.length) continue;

    html += `<div class="card"><h3>${model.icon} ${model.label}</h3>`;
    html += '<table><thead><tr><th>Month</th><th>Type</th><th>Should-Cost</th><th>Lower (95%)</th><th>Upper (95%)</th></tr></thead><tbody>';
    for (const point of series.slice(-12)) {
      html += `<tr><td>${point.month}</td><td>${point.type}</td><td>${formatCurrency(point.shouldCost)}</td><td>${point.lower ? formatCurrency(point.lower) : '—'}</td><td>${point.upper ? formatCurrency(point.upper) : '—'}</td></tr>`;
    }
    html += '</tbody></table></div>';
  }
  el.innerHTML = html;
}
