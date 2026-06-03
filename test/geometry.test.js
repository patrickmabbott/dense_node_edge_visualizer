import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  distance,
  segmentsIntersect,
  segmentCircleIntersects,
  segmentAngleDeg,
  nodeInViewport,
} from '../server/geometry.js';

describe('distance', () => {
  it('returns 0 for identical points', () => {
    assert.equal(distance(5, 5, 5, 5), 0);
  });

  it('computes horizontal distance', () => {
    assert.equal(distance(0, 0, 3, 0), 3);
  });

  it('computes vertical distance', () => {
    assert.equal(distance(0, 0, 0, 4), 4);
  });

  it('computes diagonal distance (3-4-5 triangle)', () => {
    assert.ok(Math.abs(distance(0, 0, 3, 4) - 5) < 1e-10);
  });

  it('is commutative', () => {
    assert.equal(distance(1, 2, 5, 8), distance(5, 8, 1, 2));
  });
});

describe('segmentsIntersect', () => {
  it('detects X-shaped crossing', () => {
    assert.equal(segmentsIntersect(0, 0, 10, 10, 0, 10, 10, 0), true);
  });

  it('returns false for parallel segments', () => {
    assert.equal(segmentsIntersect(0, 0, 10, 0, 0, 5, 10, 5), false);
  });

  it('returns false for non-crossing segments in L shape', () => {
    assert.equal(segmentsIntersect(0, 0, 5, 0, 5, 1, 5, 10), false);
  });

  it('returns false for segments that would cross if extended', () => {
    assert.equal(segmentsIntersect(0, 0, 1, 1, 5, 0, 5, -5), false);
  });

  it('detects crossing at non-trivial angle', () => {
    assert.equal(segmentsIntersect(0, 5, 10, 5, 5, 0, 5, 10), true);
  });

  it('returns false for collinear overlapping segments', () => {
    assert.equal(segmentsIntersect(0, 0, 5, 0, 3, 0, 8, 0), false);
  });
});

describe('segmentCircleIntersects', () => {
  it('detects segment passing through circle center', () => {
    assert.equal(segmentCircleIntersects(0, 50, 100, 50, 50, 50, 10), true);
  });

  it('returns false when segment is far from circle', () => {
    assert.equal(segmentCircleIntersects(0, 0, 10, 0, 50, 50, 5), false);
  });

  it('returns false for zero-length segment outside circle', () => {
    assert.equal(segmentCircleIntersects(0, 0, 0, 0, 50, 50, 5), false);
  });

  it('detects segment endpoint inside circle', () => {
    assert.equal(segmentCircleIntersects(0, 0, 50, 50, 50, 50, 10), true);
  });

  it('detects segment that clips circle edge', () => {
    assert.equal(segmentCircleIntersects(0, 0, 100, 0, 50, 5, 10), true);
  });

  it('returns false for near miss', () => {
    assert.equal(segmentCircleIntersects(0, 0, 100, 0, 50, 20, 10), false);
  });

  it('detects segment fully inside circle', () => {
    assert.equal(segmentCircleIntersects(48, 48, 52, 52, 50, 50, 20), true);
  });
});

describe('segmentAngleDeg', () => {
  it('returns 90 for perpendicular segments', () => {
    const angle = segmentAngleDeg(0, 0, 10, 0, 0, 0, 0, 10);
    assert.ok(Math.abs(angle - 90) < 0.01);
  });

  it('returns 0 for parallel same-direction segments', () => {
    const angle = segmentAngleDeg(0, 0, 10, 0, 0, 5, 10, 5);
    assert.ok(Math.abs(angle) < 0.01);
  });

  it('returns 0 for anti-parallel segments', () => {
    const angle = segmentAngleDeg(0, 0, 10, 0, 10, 5, 0, 5);
    assert.ok(Math.abs(angle) < 0.01);
  });

  it('returns 45 for diagonal vs horizontal', () => {
    const angle = segmentAngleDeg(0, 0, 10, 0, 0, 0, 10, 10);
    assert.ok(Math.abs(angle - 45) < 0.01);
  });

  it('always returns a value between 0 and 90', () => {
    const angle = segmentAngleDeg(0, 0, 3, 7, -2, 5, 8, -1);
    assert.ok(angle >= 0 && angle <= 90);
  });
});

describe('nodeInViewport', () => {
  it('returns true for node well inside viewport', () => {
    assert.equal(nodeInViewport(100, 100, 10, 1200, 800), true);
  });

  it('returns false when node circle extends past left edge', () => {
    assert.equal(nodeInViewport(5, 100, 10, 1200, 800), false);
  });

  it('returns false when node circle extends past top edge', () => {
    assert.equal(nodeInViewport(100, 5, 10, 1200, 800), false);
  });

  it('returns false when node circle extends past right edge', () => {
    assert.equal(nodeInViewport(1195, 100, 10, 1200, 800), false);
  });

  it('returns false when node circle extends past bottom edge', () => {
    assert.equal(nodeInViewport(100, 795, 10, 1200, 800), false);
  });

  it('returns true when node exactly fits at edge', () => {
    assert.equal(nodeInViewport(10, 10, 10, 1200, 800), true);
  });

  it('returns false for negative coordinates', () => {
    assert.equal(nodeInViewport(-5, 100, 10, 1200, 800), false);
  });
});
