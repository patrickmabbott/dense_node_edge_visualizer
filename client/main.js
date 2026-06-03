import * as d3 from 'd3';

let dataset = null;
let currentResult = null;

const svg = d3.select('#graph');
const container = svg.append('g');
const tooltip = d3.select('#tooltip');

// Zoom
const zoom = d3.zoom()
  .scaleExtent([0.1, 8])
  .on('zoom', (event) => {
    container.attr('transform', event.transform);
  });
svg.call(zoom);

// Load dataset and render
async function init() {
  const res = await fetch('/api/dataset');
  dataset = await res.json();
  renderGraph();

  d3.select('#cb-high').on('change', renderGraph);
  d3.select('#cb-medium').on('change', renderGraph);
  d3.select('#cb-low').on('change', renderGraph);
}

async function renderGraph() {
  const levels = [];
  if (d3.select('#cb-high').property('checked')) levels.push('high');
  if (d3.select('#cb-medium').property('checked')) levels.push('medium');
  if (d3.select('#cb-low').property('checked')) levels.push('low');

  if (levels.length === 0) {
    container.selectAll('*').remove();
    updateFitness(null);
    updateMeta(null);
    return;
  }

  const filteredEdges = dataset.edges.filter((e) => levels.includes(e.confidence));
  const nodeIds = new Set(filteredEdges.flatMap((e) => [e.source, e.target]));
  const filteredNodes = dataset.nodes.filter((n) => nodeIds.has(n.id));

  const res = await fetch('/api/layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes: filteredNodes, edges: filteredEdges }),
  });
  currentResult = await res.json();

  draw(currentResult);
  updateFitness(currentResult.fitness);
  updateMeta(currentResult.meta);
}

function draw(result) {
  const nodeMap = new Map(result.nodes.map((n) => [n.id, n]));

  // Compute degree for sizing
  const degree = {};
  for (const e of result.edges) {
    degree[e.source] = (degree[e.source] || 0) + 1;
    degree[e.target] = (degree[e.target] || 0) + 1;
  }

  // Edges
  const lines = container.selectAll('line.edge').data(result.edges, (d) => d.source + '|' + d.target);
  lines.exit().remove();
  const linesEnter = lines.enter().append('line');
  lines.merge(linesEnter)
    .attr('class', (d) => `edge confidence-${d.confidence}`)
    .attr('x1', (d) => nodeMap.get(d.source)?.x ?? 0)
    .attr('y1', (d) => nodeMap.get(d.source)?.y ?? 0)
    .attr('x2', (d) => nodeMap.get(d.target)?.x ?? 0)
    .attr('y2', (d) => nodeMap.get(d.target)?.y ?? 0);

  // Nodes
  const circles = container.selectAll('circle.node').data(result.nodes, (d) => d.id);
  circles.exit().remove();
  const circlesEnter = circles.enter().append('circle');
  circles.merge(circlesEnter)
    .attr('class', (d) => `node type-${d.type}`)
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y)
    .attr('r', (d) => 5 + Math.min(15, (degree[d.id] || 0) * 1.5))
    .on('mouseover', (event, d) => showTooltip(event, d, degree))
    .on('mousemove', (event) => moveTooltip(event))
    .on('mouseout', hideTooltip);

  // Labels
  const labels = container.selectAll('text.label').data(result.nodes, (d) => d.id);
  labels.exit().remove();
  const labelsEnter = labels.enter().append('text');
  labels.merge(labelsEnter)
    .attr('class', 'label')
    .attr('x', (d) => d.x)
    .attr('y', (d) => d.y + 5 + Math.min(15, (degree[d.id] || 0) * 1.5) + 12)
    .text((d) => d.label);

  // Raise nodes above edges
  container.selectAll('circle.node').raise();
  container.selectAll('text.label').raise();
}

function showTooltip(event, d, degree) {
  const types = { person: 'Person', organization: 'Organization', event: 'Event' };
  tooltip
    .style('display', 'block')
    .html(`
      <strong>${d.label}</strong><br/>
      Type: ${types[d.type] || d.type}<br/>
      Cluster: ${d.cluster}<br/>
      Degree: ${degree[d.id] || 0}
    `);
  moveTooltip(event);
}

function moveTooltip(event) {
  tooltip
    .style('left', (event.clientX + 12) + 'px')
    .style('top', (event.clientY - 12) + 'px');
}

function hideTooltip() {
  tooltip.style('display', 'none');
}

function updateFitness(fitness) {
  const scoreEl = d3.select('#fitness-score');
  const breakdownEl = d3.select('#fitness-breakdown');

  if (!fitness) {
    scoreEl.text('—').attr('class', '');
    breakdownEl.html('');
    return;
  }

  const s = fitness.score;
  const cls = s >= 0.7 ? 'score-good' : s >= 0.4 ? 'score-mid' : 'score-bad';
  scoreEl.text(s.toFixed(4)).attr('class', cls);

  const termNames = {
    edgeCrossings: 'Edge Crossings',
    nearParallelCrossings: 'Near-∥ Crossings',
    edgeNodePiercing: 'Edge→Node Pierce',
    nodeOverlap: 'Node Overlap',
    personalSpace: 'Personal Space',
    viewportContainment: 'Viewport',
    clumping: 'Clumping',
    edgeLengthVariance: 'Edge Length Var',
  };

  let html = '';
  for (const [key, term] of Object.entries(fitness.breakdown)) {
    const pct = (term.penalty * 100).toFixed(0);
    const color = term.penalty > 0.5 ? '#d94a4a' : term.penalty > 0.2 ? '#d9d94a' : '#4ad94a';
    html += `
      <div class="breakdown-row">
        <span class="breakdown-label">${termNames[key] || key}</span>
        <div class="breakdown-bar-container">
          <div class="breakdown-bar" style="width:${pct}%; background:${color}"></div>
        </div>
        <span class="breakdown-value">${term.raw}</span>
      </div>
    `;
  }
  breakdownEl.html(html);
}

function updateMeta(meta) {
  const el = d3.select('#meta-info');
  if (!meta) {
    el.html('');
    return;
  }
  el.html(`
    Iterations: ${meta.iterations}<br/>
    Converged: ${meta.converged ? 'Yes' : 'No'}
  `);
}

init();
