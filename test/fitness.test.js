import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFitness } from '../server/fitness.js';

function makeNode(id, x, y) {
  return { id, x, y };
}

function makeEdge(source, target) {
  return { source, target };
}

describe('evaluateFitness', () => {
  describe('empty graph', () => {
    it('returns score 1.0 for zero nodes', () => {
      const result = evaluateFitness([], [], 0, true);
      assert.equal(result.score, 1);
    });
  });

  describe('weights', () => {
    it('all weights sum to 1.0', () => {
      const nodes = [makeNode('a', 100, 100)];
      const result = evaluateFitness(nodes, [], 100, true);
      const totalWeight = Object.values(result.breakdown)
        .reduce((sum, term) => sum + term.weight, 0);
      assert.ok(Math.abs(totalWeight - 1.0) < 1e-10, `Weights sum to ${totalWeight}, expected 1.0`);
    });
  });

  describe('score bounds', () => {
    it('score is between 0 and 1 for a well-placed graph', () => {
      const nodes = [
        makeNode('a', 200, 200),
        makeNode('b', 400, 400),
      ];
      const edges = [makeEdge('a', 'b')];
      const result = evaluateFitness(nodes, edges, 100, true);
      assert.ok(result.score >= 0 && result.score <= 1);
    });

    it('score is between 0 and 1 for a terrible layout', () => {
      const nodes = [];
      for (let i = 0; i < 20; i++) {
        nodes.push(makeNode(`n${i}`, 500, 400));
      }
      const edges = [];
      for (let i = 0; i < 19; i++) {
        edges.push(makeEdge(`n${i}`, `n${i + 1}`));
      }
      const result = evaluateFitness(nodes, edges, 10000, false);
      assert.ok(result.score >= 0 && result.score <= 1);
    });
  });

  describe('convergence penalty', () => {
    it('no penalty when converged', () => {
      const nodes = [makeNode('a', 600, 400)];
      const result = evaluateFitness(nodes, [], 100, true);
      assert.equal(result.breakdown.didNotConverge.penalty, 0);
    });

    it('full penalty when not converged', () => {
      const nodes = [makeNode('a', 600, 400)];
      const result = evaluateFitness(nodes, [], 100, false);
      assert.equal(result.breakdown.didNotConverge.penalty, 1);
    });
  });

  describe('iteration penalty', () => {
    it('low penalty for fast convergence (200 iterations)', () => {
      const nodes = [makeNode('a', 600, 400)];
      const result = evaluateFitness(nodes, [], 200, true);
      assert.ok(result.breakdown.iterations.penalty < 0.01,
        `Expected near-zero penalty at 200 it, got ${result.breakdown.iterations.penalty}`);
    });

    it('higher penalty for slow convergence', () => {
      const nodes = [makeNode('a', 600, 400)];
      const fast = evaluateFitness(nodes, [], 200, true);
      const slow = evaluateFitness(nodes, [], 3000, true);
      assert.ok(slow.breakdown.iterations.penalty > fast.breakdown.iterations.penalty);
    });

    it('zero penalty when not converged (iterations not counted)', () => {
      const nodes = [makeNode('a', 600, 400)];
      const result = evaluateFitness(nodes, [], 5000, false);
      assert.equal(result.breakdown.iterations.penalty, 0);
    });
  });

  describe('node overlap', () => {
    it('no penalty when nodes are far apart', () => {
      const nodes = [
        makeNode('a', 100, 100),
        makeNode('b', 500, 500),
      ];
      const result = evaluateFitness(nodes, [], 100, true);
      assert.equal(result.breakdown.nodeOverlap.penalty, 0);
    });

    it('produces penalty when nodes are at the same position', () => {
      const nodes = [
        makeNode('a', 300, 300),
        makeNode('b', 300, 300),
      ];
      const result = evaluateFitness(nodes, [], 100, true);
      assert.ok(result.breakdown.nodeOverlap.penalty > 0);
      assert.equal(result.breakdown.nodeOverlap.raw, 1);
    });
  });

  describe('personal space', () => {
    it('no penalty when nodes are well separated', () => {
      const nodes = [
        makeNode('a', 100, 400),
        makeNode('b', 500, 400),
      ];
      const result = evaluateFitness(nodes, [], 100, true);
      assert.equal(result.breakdown.personalSpace.penalty, 0);
    });

    it('produces penalty when nodes are close but not overlapping', () => {
      const nodes = [
        makeNode('a', 300, 300),
        makeNode('b', 322, 300),
      ];
      const result = evaluateFitness(nodes, [], 100, true);
      assert.equal(result.breakdown.nodeOverlap.raw, 0, 'should not overlap');
      assert.ok(result.breakdown.personalSpace.raw > 0, 'should violate personal space');
    });
  });

  describe('edge crossings', () => {
    it('no penalty when edges do not cross', () => {
      const nodes = [
        makeNode('a', 100, 100),
        makeNode('b', 200, 100),
        makeNode('c', 100, 200),
        makeNode('d', 200, 200),
      ];
      const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')];
      const result = evaluateFitness(nodes, edges, 100, true);
      assert.equal(result.breakdown.edgeCrossings.raw, 0);
      assert.equal(result.breakdown.edgeCrossings.penalty, 0);
    });

    it('detects crossing edges', () => {
      const nodes = [
        makeNode('a', 100, 100),
        makeNode('b', 300, 300),
        makeNode('c', 100, 300),
        makeNode('d', 300, 100),
      ];
      const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')];
      const result = evaluateFitness(nodes, edges, 100, true);
      assert.equal(result.breakdown.edgeCrossings.raw, 1);
      assert.ok(result.breakdown.edgeCrossings.penalty > 0);
    });

    it('skips crossing check for edges sharing an endpoint', () => {
      const nodes = [
        makeNode('a', 100, 100),
        makeNode('b', 300, 300),
        makeNode('c', 300, 100),
      ];
      const edges = [makeEdge('a', 'b'), makeEdge('a', 'c')];
      const result = evaluateFitness(nodes, edges, 100, true);
      assert.equal(result.breakdown.edgeCrossings.raw, 0);
    });
  });

  describe('edge-node piercing', () => {
    it('detects edge passing through unrelated node', () => {
      const nodes = [
        makeNode('a', 100, 200),
        makeNode('b', 500, 200),
        makeNode('c', 300, 200),
      ];
      const edges = [makeEdge('a', 'b')];
      const result = evaluateFitness(nodes, edges, 100, true);
      assert.ok(result.breakdown.edgeNodePiercing.raw > 0);
    });

    it('does not count source/target nodes as pierced', () => {
      const nodes = [
        makeNode('a', 100, 200),
        makeNode('b', 500, 200),
      ];
      const edges = [makeEdge('a', 'b')];
      const result = evaluateFitness(nodes, edges, 100, true);
      assert.equal(result.breakdown.edgeNodePiercing.raw, 0);
    });
  });

  describe('viewport containment', () => {
    it('zero penalty in ideal range (60-90%)', () => {
      const nodes = [];
      for (let i = 0; i < 10; i++) {
        const inside = i < 7;
        nodes.push(makeNode(`n${i}`, inside ? 600 : -100, inside ? 400 : -100));
      }
      const result = evaluateFitness(nodes, [], 100, true);
      assert.equal(result.breakdown.viewportContainment.penalty, 0,
        `70% containment should be zero penalty, got ${result.breakdown.viewportContainment.penalty}`);
    });

    it('mild penalty at 100% containment', () => {
      const nodes = [
        makeNode('a', 200, 200),
        makeNode('b', 600, 400),
      ];
      const result = evaluateFitness(nodes, [], 100, true);
      assert.ok(result.breakdown.viewportContainment.penalty <= 0.25,
        `100% containment penalty should be <= 0.25, got ${result.breakdown.viewportContainment.penalty}`);
      assert.ok(result.breakdown.viewportContainment.penalty > 0);
    });

    it('full penalty when almost all nodes are off-screen', () => {
      const nodes = [];
      for (let i = 0; i < 10; i++) {
        nodes.push(makeNode(`n${i}`, i < 2 ? 600 : -500, i < 2 ? 400 : -500));
      }
      const result = evaluateFitness(nodes, [], 100, true);
      assert.equal(result.breakdown.viewportContainment.penalty, 1);
    });
  });

  describe('overall score quality', () => {
    it('well-separated nodes with no crossings score higher than overlapping mess', () => {
      const goodNodes = [
        makeNode('a', 200, 200),
        makeNode('b', 600, 200),
        makeNode('c', 200, 600),
        makeNode('d', 600, 600),
      ];
      const badNodes = [
        makeNode('a', 300, 300),
        makeNode('b', 301, 301),
        makeNode('c', 302, 302),
        makeNode('d', 303, 303),
      ];
      const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')];
      const good = evaluateFitness(goodNodes, edges, 100, true);
      const bad = evaluateFitness(badNodes, edges, 100, true);
      assert.ok(good.score > bad.score,
        `Good layout (${good.score}) should outscore bad layout (${bad.score})`);
    });
  });

  describe('breakdown structure', () => {
    it('contains all 10 expected terms', () => {
      const nodes = [makeNode('a', 600, 400)];
      const result = evaluateFitness(nodes, [], 100, true);
      const expectedTerms = [
        'didNotConverge', 'iterations', 'edgeCrossings', 'nearParallelCrossings',
        'edgeNodePiercing', 'nodeOverlap', 'personalSpace', 'viewportContainment',
        'clumping', 'edgeLengthVariance',
      ];
      for (const term of expectedTerms) {
        assert.ok(result.breakdown[term], `Missing breakdown term: ${term}`);
        assert.ok('raw' in result.breakdown[term], `${term} missing 'raw' field`);
        assert.ok('penalty' in result.breakdown[term], `${term} missing 'penalty' field`);
        assert.ok('weight' in result.breakdown[term], `${term} missing 'weight' field`);
      }
    });
  });
});
