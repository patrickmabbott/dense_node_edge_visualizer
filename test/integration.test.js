import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeLayout } from '../server/layout.js';
import { evaluateFitness } from '../server/fitness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'data', 'baseline_dataset.json');

function loadDataset() {
  return JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
}

function filterByConfidence(dataset, levels) {
  const edges = dataset.edges.filter((e) => levels.includes(e.confidence));
  const nodeIds = new Set(edges.flatMap((e) => [e.source, e.target]));
  const nodes = dataset.nodes.filter((n) => nodeIds.has(n.id));
  return { nodes, edges };
}

describe('baseline dataset', () => {
  const dataset = loadDataset();

  it('has metadata with expected fields', () => {
    assert.ok(dataset.metadata);
    assert.ok(typeof dataset.metadata.nodeCount === 'number');
    assert.ok(typeof dataset.metadata.edgeCount === 'number');
    assert.ok(dataset.metadata.edgeDistribution);
  });

  it('has nodes with required fields', () => {
    for (const node of dataset.nodes) {
      assert.ok(typeof node.id === 'string', 'node must have string id');
      assert.ok(typeof node.label === 'string', 'node must have string label');
      assert.ok(['person', 'organization', 'event'].includes(node.type),
        `node ${node.id} has invalid type: ${node.type}`);
      assert.ok(typeof node.cluster === 'number', 'node must have numeric cluster');
    }
  });

  it('has edges with required fields', () => {
    const nodeIds = new Set(dataset.nodes.map((n) => n.id));
    for (const edge of dataset.edges) {
      assert.ok(nodeIds.has(edge.source), `edge source ${edge.source} not in nodes`);
      assert.ok(nodeIds.has(edge.target), `edge target ${edge.target} not in nodes`);
      assert.ok(['high', 'medium', 'low'].includes(edge.confidence),
        `edge ${edge.source}->${edge.target} has invalid confidence: ${edge.confidence}`);
    }
  });

  it('metadata counts match actual data', () => {
    assert.equal(dataset.nodes.length, dataset.metadata.nodeCount);
    assert.equal(dataset.edges.length, dataset.metadata.edgeCount);
    const highCount = dataset.edges.filter((e) => e.confidence === 'high').length;
    const medCount = dataset.edges.filter((e) => e.confidence === 'medium').length;
    const lowCount = dataset.edges.filter((e) => e.confidence === 'low').length;
    assert.equal(highCount, dataset.metadata.edgeDistribution.high);
    assert.equal(medCount, dataset.metadata.edgeDistribution.medium);
    assert.equal(lowCount, dataset.metadata.edgeDistribution.low);
  });

  it('has no self-referencing edges', () => {
    for (const edge of dataset.edges) {
      assert.notEqual(edge.source, edge.target,
        `Self-edge found: ${edge.source}`);
    }
  });

  it('has multiple clusters', () => {
    const clusters = new Set(dataset.nodes.map((n) => n.cluster));
    assert.ok(clusters.size >= 3, `Expected multiple clusters, found ${clusters.size}`);
  });
});

describe('confidence filtering', () => {
  const dataset = loadDataset();

  it('high-only includes fewer edges than all', () => {
    const highOnly = filterByConfidence(dataset, ['high']);
    const all = filterByConfidence(dataset, ['high', 'medium', 'low']);
    assert.ok(highOnly.edges.length < all.edges.length);
    assert.ok(highOnly.nodes.length <= all.nodes.length);
  });

  it('adding medium increases edge and node count', () => {
    const highOnly = filterByConfidence(dataset, ['high']);
    const highMed = filterByConfidence(dataset, ['high', 'medium']);
    assert.ok(highMed.edges.length > highOnly.edges.length);
  });

  it('filtered nodes are exactly those referenced by filtered edges', () => {
    const { nodes, edges } = filterByConfidence(dataset, ['high', 'medium']);
    const referencedIds = new Set(edges.flatMap((e) => [e.source, e.target]));
    const nodeIds = new Set(nodes.map((n) => n.id));
    assert.deepEqual(nodeIds, referencedIds);
  });

  it('empty confidence selection returns no data', () => {
    const { nodes, edges } = filterByConfidence(dataset, []);
    assert.equal(nodes.length, 0);
    assert.equal(edges.length, 0);
  });
});

describe('end-to-end layout + fitness pipeline', () => {
  const dataset = loadDataset();

  it('high-only scenario produces valid fitness', () => {
    const { nodes, edges } = filterByConfidence(dataset, ['high']);
    const layout = computeLayout(nodes, edges, { iterations: 1000 });
    const fitness = evaluateFitness(layout.nodes, edges, layout.iterations, layout.converged);

    assert.ok(fitness.score >= 0 && fitness.score <= 1);
    assert.ok(fitness.breakdown);
    assert.ok(Object.keys(fitness.breakdown).length === 10);
  });

  it('increasing edge density decreases fitness score', () => {
    const high = filterByConfidence(dataset, ['high']);
    const all = filterByConfidence(dataset, ['high', 'medium', 'low']);

    const highLayout = computeLayout(high.nodes, high.edges, { iterations: 2000 });
    const allLayout = computeLayout(all.nodes, all.edges, { iterations: 2000 });

    const highFitness = evaluateFitness(highLayout.nodes, high.edges, highLayout.iterations, highLayout.converged);
    const allFitness = evaluateFitness(allLayout.nodes, all.edges, allLayout.iterations, allLayout.converged);

    assert.ok(highFitness.score > allFitness.score,
      `High-only (${highFitness.score.toFixed(3)}) should score better than all (${allFitness.score.toFixed(3)})`);
  });

  it('layout result is suitable for client rendering (has x, y, id)', () => {
    const { nodes, edges } = filterByConfidence(dataset, ['high']);
    const layout = computeLayout(nodes, edges, { iterations: 500 });
    for (const node of layout.nodes) {
      assert.ok('id' in node);
      assert.ok('x' in node);
      assert.ok('y' in node);
    }
  });

  it('fitness breakdown matches structure expected by client UI', () => {
    const { nodes, edges } = filterByConfidence(dataset, ['high']);
    const layout = computeLayout(nodes, edges, { iterations: 500 });
    const fitness = evaluateFitness(layout.nodes, edges, layout.iterations, layout.converged);

    const expectedKeys = [
      'didNotConverge', 'iterations', 'edgeCrossings', 'nearParallelCrossings',
      'edgeNodePiercing', 'nodeOverlap', 'personalSpace', 'viewportContainment',
      'clumping', 'edgeLengthVariance',
    ];
    for (const key of expectedKeys) {
      const term = fitness.breakdown[key];
      assert.ok(term, `Missing key ${key}`);
      assert.ok(typeof term.raw !== 'undefined', `${key}.raw missing`);
      assert.ok(typeof term.penalty === 'number', `${key}.penalty must be number`);
      assert.ok(typeof term.weight === 'number', `${key}.weight must be number`);
      assert.ok(term.penalty >= 0 && term.penalty <= 1,
        `${key}.penalty (${term.penalty}) must be in [0,1]`);
    }
  });
});
