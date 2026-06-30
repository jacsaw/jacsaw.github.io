/**
 * SNAP HR1 Scrollytelling Timeline + Map
 * Loads structured data from data.json and renders:
 *  - a scrollable timeline of policy events (left column)
 *  - a D3 US choropleth map that highlights affected states (right column)
 * The map updates to reflect whichever month is currently active/in view.
 */

const LINK_ICON = `<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V7"/><path d="M8 1h3m0 0v3m0-3L5 7"/></svg>`;

const STATES_TOPOJSON_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

let DATA = null;            // full parsed data.json
let STATE_ABBR = null;      // { "California": "CA", ... }
let activeMonthId = null;   // currently active monthId, e.g. "2025-07"
let statePathMap = {};      // { "California": <path element>, ... }
let selectedState = null;   // { name, abbr, pathEl } when a state is clicked
const isDarkMode = matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Entry point: fetch data.json, then build the timeline and map.
 */
async function init() {
  const res = await fetch('data.json');
  DATA = await res.json();
  STATE_ABBR = DATA.stateAbbreviations;
  activeMonthId = DATA.timeline[0].monthId;

  document.title = DATA.meta.title;

  buildLegend();
  buildTimeline();
  initMap();
  setupScrollSpy();
}

/**
 * Build the color legend from data.json meta.legend.
 */
function buildLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  DATA.meta.legend.forEach(item => {
    const span = document.createElement('span');
    span.className = 'leg-item';
    const swatch = document.createElement('span');
    swatch.className = 'leg-swatch';
    swatch.style.background = item.color;
    if (item.status === 'none') {
      swatch.style.border = '0.5px solid var(--color-border-tertiary)';
    }
    span.appendChild(swatch);
    span.appendChild(document.createTextNode(item.label));
    legend.appendChild(span);
  });
}

/**
 * Build the scrollable timeline column from data.json timeline array.
 */
function buildTimeline() {
  const col = document.getElementById('timeline-col');
  col.innerHTML = '';
  let lastYear = '';

  DATA.timeline.forEach((monthEntry, idx) => {
    const year = monthEntry.monthId.split('-')[0];
    if (year !== lastYear) {
      const yearLabel = document.createElement('div');
      yearLabel.className = 'tl-year';
      yearLabel.textContent = year;
      col.appendChild(yearLabel);
      lastYear = year;
    }

    const block = document.createElement('div');
    block.className = 'month-block' + (idx === 0 ? ' active' : '');
    block.dataset.idx = String(idx);
    block.dataset.monthId = monthEntry.monthId;

    const dot = document.createElement('div');
    dot.className = 'month-dot';
    block.appendChild(dot);

    const title = document.createElement('div');
    title.className = 'month-title';
    title.textContent = monthEntry.monthLabel;
    block.appendChild(title);

    monthEntry.updates.forEach(update => {
      block.appendChild(buildEventCard(update));
    });

    block.addEventListener('click', () => setActive(idx));
    col.appendChild(block);
  });
}

/**
 * Build a single event card element from one update object.
 */
function buildEventCard(update) {
  const card = document.createElement('div');
  card.className = 'event-card';

  const top = document.createElement('div');
  top.className = 'event-top';

  const tag = document.createElement('span');
  tag.className = 'event-tag tag-' + update.direction;
  tag.textContent = directionLabel(update.direction);

  const catSpan = document.createElement('span');
  catSpan.className = 'event-category';
  catSpan.textContent = update.category;

  top.appendChild(tag);
  top.appendChild(catSpan);

  const statesEl = document.createElement('div');
  statesEl.className = 'event-states';
  statesEl.textContent = update.statesAffected.length > 8
    ? update.statesAffected.length + ' states affected'
    : update.statesAffected.join(', ');

  const desc = document.createElement('div');
  desc.className = 'event-desc';
  desc.textContent = update.description;

  card.appendChild(top);
  card.appendChild(statesEl);
  card.appendChild(desc);

  if (update.source) {
    const link = document.createElement('a');
    link.className = 'event-source';
    link.href = update.source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.innerHTML = LINK_ICON + ' ' + update.source.label;
    link.addEventListener('click', e => e.stopPropagation());
    card.appendChild(link);
  }

  return card;
}

function directionLabel(direction) {
  if (direction === 'expand') return 'Expands';
  if (direction === 'restrict') return 'Restricts';
  return 'Informational';
}

function findUpdateById(updateId) {
  for (const month of DATA.timeline) {
    const found = month.updates.find(u => u.id === updateId);
    if (found) return found;
  }
  return null;
}

function getPovertyChangesForMonth(monthEntry) {
  if (!DATA.povertyRateChanges) return [];
  const updateIds = new Set(monthEntry.updates.map(u => u.id));
  return DATA.povertyRateChanges.filter(p => updateIds.has(p.relatedUpdateId));
}

function updatePovertyOverlay(monthEntry) {
  const overlay = document.getElementById('poverty-overlay');
  let changes = getPovertyChangesForMonth(monthEntry);

  if (selectedState) {
    changes = changes.filter(p => p.statesAffected.includes(selectedState.abbr));
  }

  if (!changes.length) {
    overlay.classList.remove('show');
    return;
  }

  const headerText = selectedState
    ? `Poverty Rate — ${selectedState.name}`
    : 'Poverty Rate Impact';

  const entriesHtml = changes.map(p => {
    const relatedUpdate = findUpdateById(p.relatedUpdateId);
    const label = relatedUpdate ? relatedUpdate.category : '';
    const delta = (p.newPovertyRate - p.priorPovertyRate).toFixed(1);
    const isUp = parseFloat(delta) >= 0;
    const deltaClass = isUp ? 'poverty-delta-up' : 'poverty-delta-down';
    const symbol = isUp ? '▲' : '▼';
    const sign = isUp ? '+' : '';
    return `<div class="poverty-entry">
      <div class="poverty-entry-label">${label}</div>
      <div class="poverty-entry-rates">
        <span class="poverty-before">${p.priorPovertyRate}%</span>
        <span class="poverty-arrow">→</span>
        <span class="poverty-after">${p.newPovertyRate}%</span>
        <span class="poverty-delta ${deltaClass}">${symbol} ${sign}${delta}%</span>
      </div>
    </div>`;
  }).join('');

  overlay.innerHTML = `<div class="poverty-overlay-header">${headerText}</div>${entriesHtml}`;
  overlay.classList.add('show');
}

function findLatestMonthIndexForState(abbr) {
  let latestIdx = -1;
  DATA.timeline.forEach((month, idx) => {
    if (month.updates.some(u => u.statesAffected.includes(abbr))) latestIdx = idx;
  });
  return latestIdx;
}

function handleStateClick(stateName, pathEl) {
  const abbr = STATE_ABBR[stateName];
  if (!abbr) return;
  const idx = findLatestMonthIndexForState(abbr);
  if (idx === -1) return;
  selectedState = { name: stateName, abbr, pathEl };
  setActive(idx);
  const block = document.querySelector(`.month-block[data-idx="${idx}"]`);
  if (block) block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Mark the given timeline index as active, update the header panel,
 * and recolor the map to reflect that month's updates.
 */
function setActive(idx) {
  const monthEntry = DATA.timeline[idx];
  activeMonthId = monthEntry.monthId;

  document.querySelectorAll('.month-block').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.idx) === idx);
  });

  document.getElementById('month-label').textContent =
    monthEntry.monthLabel.split(' — ')[0];

  const firstUpdate = monthEntry.updates[0];
  const catEl = document.getElementById('active-cat');
  catEl.textContent = firstUpdate.category;
  catEl.className = 'event-tag tag-' + firstUpdate.direction;
  catEl.id = 'active-cat';

  document.getElementById('active-desc').textContent = firstUpdate.description;

  updateMap(monthEntry);
  updatePovertyOverlay(monthEntry);
}

/**
 * Recolor each state path based on the active month's updates.
 * If a state appears in multiple updates with different directions,
 * it is marked "mixed".
 */
function updateMap(monthEntry) {
  const stateStatus = {};
  monthEntry.updates.forEach(update => {
    update.statesAffected.forEach(abbr => {
      if (!stateStatus[abbr]) {
        stateStatus[abbr] = update.direction;
      } else if (stateStatus[abbr] !== update.direction) {
        stateStatus[abbr] = 'mixed';
      }
    });
  });

  const colorFor = status => {
    if (!status) return isDarkMode ? '#333' : '#E0DED7';
    if (status === 'restrict') return '#D85A30';
    if (status === 'expand') return '#1D9E75';
    if (status === 'neutral') return '#378ADD';
    return '#7F77DD'; // mixed
  };

  Object.entries(statePathMap).forEach(([stateName, pathEl]) => {
    const abbr = STATE_ABBR[stateName];
    const fill = colorFor(stateStatus[abbr]);
    d3.select(pathEl).transition().duration(280).attr('fill', fill);
  });
}

/**
 * Load US state topology and render the D3 choropleth map.
 * Attaches hover tooltips showing the active month's updates per state.
 */
function initMap() {
  const svg = d3.select('#map-svg');
  const projection = d3.geoAlbersUsa().scale(1220).translate([480, 290]);
  const pathGenerator = d3.geoPath(projection);
  const tooltip = document.getElementById('tooltip');
  const defaultStroke = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.85)';
  const selectedStroke = isDarkMode ? '#EDEBE4' : '#1A1A18';

  d3.json(STATES_TOPOJSON_URL).then(us => {
    const features = topojson.feature(us, us.objects.states).features;

    svg.selectAll('path.state-path')
      .data(features)
      .join('path')
      .attr('class', 'state-path')
      .attr('d', pathGenerator)
      .attr('stroke', defaultStroke)
      .attr('stroke-width', 0.6)
      .attr('fill', isDarkMode ? '#333' : '#E0DED7')
      .on('mousemove', function (event, d) {
        showTooltip(event, d, tooltip);
      })
      .on('mouseleave', () => tooltip.classList.remove('show'))
      .on('click', function (event, d) {
        const stateName = d.properties && d.properties.name;
        if (!stateName) return;
        // Revert previous selection stroke
        if (selectedState && selectedState.pathEl) {
          d3.select(selectedState.pathEl).attr('stroke', defaultStroke).attr('stroke-width', 0.6);
        }
        // Apply selection stroke to clicked state
        d3.select(this).attr('stroke', selectedStroke).attr('stroke-width', 2);
        handleStateClick(stateName, this);
      })
      .each(function (d) {
        if (d.properties && d.properties.name) {
          statePathMap[d.properties.name] = this;
        }
      });

    updateMap(DATA.timeline[0]);
    updatePovertyOverlay(DATA.timeline[0]);
  });
}

/**
 * Populate and position the hover tooltip for a given state feature.
 */
function showTooltip(event, feature, tooltip) {
  const stateName = feature.properties.name;
  const abbr = STATE_ABBR[stateName];
  const monthEntry = DATA.timeline.find(m => m.monthId === activeMonthId);
  if (!monthEntry) {
    tooltip.classList.remove('show');
    return;
  }

  const matched = monthEntry.updates.filter(u => u.statesAffected.includes(abbr));
  if (!matched.length) {
    tooltip.classList.remove('show');
    return;
  }

  const wrap = document.getElementById('map-wrap');
  const rect = wrap.getBoundingClientRect();

  const detailHtml = matched
    .map(u => `<div class="tooltip-detail">${u.category}: ${u.description.slice(0, 100)}…</div>`)
    .join('');

  const povertyChanges = getPovertyChangesForMonth(monthEntry)
    .filter(p => p.statesAffected.includes(abbr));
  const povertyHtml = povertyChanges.map(p => {
    const delta = (p.newPovertyRate - p.priorPovertyRate).toFixed(1);
    const isUp = parseFloat(delta) >= 0;
    const sign = isUp ? '+' : '';
    const cls = isUp ? 'tooltip-poverty-up' : 'tooltip-poverty-down';
    return `<div class="tooltip-poverty">Poverty rate: ${p.priorPovertyRate}% → <span class="${cls}">${p.newPovertyRate}% (${sign}${delta}%)</span></div>`;
  }).join('');

  tooltip.innerHTML = `<strong>${stateName}</strong>${detailHtml}${povertyHtml}`;

  const x = event.clientX - rect.left + 12;
  const y = event.clientY - rect.top + 12;
  tooltip.style.left = Math.min(x, rect.width - 215) + 'px';
  tooltip.style.top = Math.min(y, rect.height - 130) + 'px';
  tooltip.classList.add('show');
}

/**
 * Observe timeline blocks as they scroll into view and activate
 * the corresponding month automatically.
 */
function setupScrollSpy() {
  const col = document.getElementById('timeline-col');
  const blocks = document.querySelectorAll('.month-block');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.3) {
        // Scrolling the timeline clears any state focus
        if (selectedState && selectedState.pathEl) {
          const defaultStroke = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.85)';
          d3.select(selectedState.pathEl).attr('stroke', defaultStroke).attr('stroke-width', 0.6);
          selectedState = null;
        }
        setActive(Number(entry.target.dataset.idx));
      }
    });
  }, {
    root: col,
    threshold: [0.3],
    rootMargin: '-10% 0px -40% 0px'
  });

  blocks.forEach(block => observer.observe(block));
}

document.addEventListener('DOMContentLoaded', init);
