import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from '../server/layout.js';

function makeNode(id) {
  return { id };
}

function makeEdge(source, target) {
  return { source, target };
}

describe('computeLayout', () => {
  const triangle = {
    nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
    edges: [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('a', 'c')],
  };

  describe('output structure', () => {
    it('returns positioned nodes with x and y', () => {
      const result = computeLayout(triangle.nodes, triangle.edges);
      for (const node of result.nodes) {
        assert.ok(typeof node.x === 'number', `node ${node.id} missing x`);
        assert.ok(typeof node.y === 'number', `node ${node.id} missing y`);
        assert.ok(!Number.isNaN(node.x), `node ${node.id} has NaN x`);
        assert.ok(!Number.isNaN(node.y), `node ${node.id} has NaN y`);
        assert.ok(Number.isFinite(node.x), `node ${node.id} has Infinite x`);
        assert.ok(Number.isFinite(node.y), `node ${node.id} has Infinite y`);
      }
    });

    it('preserves node ids', () => {
      const result = computeLayout(triangle.nodes, triangle.edges);
      const ids = result.nodes.map((n) => n.id).sort();
      assert.deepEqual(ids, ['a', 'b', 'c']);
    });

    it('returns iteration count', () => {
      const result = computeLayout(triangle.nodes, triangle.edges);
      assert.ok(typeof result.iterations === 'number');
      assert.ok(result.iterations > 0);
    });

    it('returns convergence boolean', () => {
      const result = computeLayout(triangle.nodes, triangle.edges);
      assert.ok(typeof result.converged === 'boolean');
    });

    it('does not include internal force/velocity fields in output', () => {
      const result = computeLayout(triangle.nodes, triangle.edges);
      for (const node of result.nodes) {
        assert.equal(node.fx, undefined, `node ${node.id} leaks fx`);
        assert.equal(node.fy, undefined, `node ${node.id} leaks fy`);
        assert.equal(node.vx, undefined, `node ${node.id} leaks vx`);
        assert.equal(node.vy, undefined, `node ${node.id} leaks vy`);
      }
    });
  });

  describe('determinism', () => {
    it('same input produces identical output', () => {
      const r1 = computeLayout(triangle.nodes, triangle.edges, { iterations: 500 });
      const r2 = computeLayout(triangle.nodes, triangle.edges, { iterations: 500 });
      assert.equal(r1.iterations, r2.iterations);
      for (let i = 0; i < r1.nodes.length; i++) {
        assert.equal(r1.nodes[i].x, r2.nodes[i].x);
        assert.equal(r1.nodes[i].y, r2.nodes[i].y);
      }
    });
  });

  describe('convergence', () => {
    it('converges for a simple graph with enough iterations', () => {
      const result = computeLayout(triangle.nodes, triangle.edges, { iterations: 5000 });
      assert.equal(result.converged, true);
      assert.ok(result.iterations < 5000, 'Should converge before hitting max iterations');
    });

    it('respects iteration limit', () => {
      const result = computeLayout(triangle.nodes, triangle.edges, { iterations: 5 });
      assert.ok(result.iterations <= 5);
    });
  });

  describe('force behavior', () => {
    it('connected nodes end up closer than unconnected', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const edges = [makeEdge('a', 'b')];
      const result = computeLayout(nodes, edges, { iterations: 2000 });

      const pos = new Map(result.nodes.map((n) => [n.id, n]));
      const distAB = Math.hypot(pos.get('a').x - pos.get('b').x, pos.get('a').y - pos.get('b').y);
      const distAC = Math.hypot(pos.get('a').x - pos.get('c').x, pos.get('a').y - pos.get('c').y);
      assert.ok(distAB < distAC,
        `Connected a-b (${distAB.toFixed(1)}) should be closer than unconnected a-c (${distAC.toFixed(1)})`);
    });

    it('nodes do not cluster at origin', () => {
      const result = computeLayout(triangle.nodes, triangle.edges, { iterations: 1000 });
      const avgX = result.nodes.reduce((s, n) => s + n.x, 0) / result.nodes.length;
      const avgY = result.nodes.reduce((s, n) => s + n.y, 0) / result.nodes.length;
      assert.ok(avgX > 100, `Center of mass x (${avgX}) should be pulled toward canvas center`);
      assert.ok(avgY > 100, `Center of mass y (${avgY}) should be pulled toward canvas center`);
    });
  });

  describe('edge cases', () => {
    it('handles single node', () => {
      const result = computeLayout([makeNode('solo')], []);
      assert.equal(result.nodes.length, 1);
      assert.ok(typeof result.nodes[0].x === 'number');
    });

    it('handles disconnected components', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
      const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')];
      const result = computeLayout(nodes, edges, { iterations: 1000 });
      assert.equal(result.nodes.length, 4);
    });

    it('silently ignores edges referencing missing nodes', () => {
      const nodes = [makeNode('a'), makeNode('b')];
      const edges = [makeEdge('a', 'b'), makeEdge('a', 'ghost')];
      const result = computeLayout(nodes, edges);
      assert.equal(result.nodes.length, 2);
    });
  });
});
