import {
  segmentsIntersect,
  segmentAngleDeg,
  segmentCircleIntersects,
  distance,
  nodeInViewport,
} from './geometry.js';

const DEFAULTS = {
  width: 1200,
  height: 800,
  nodeRadius: 10,
  personalSpaceMultiplier: 1.25,
  nearParallelThresholdDeg: 5,
  weights: {
    converged: 0.05,
    iterationsRequired : .05,
    edgeCrossings: 0.15,
    nearParallelCrossings: 0.10,
    edgeNodePiercing: 0.20,
    nodeOverlap: 0.15,
    personalSpace: 0.10,
    viewportContainment: 0.10,
    clumping: 0.05,
    edgeLengthVariance: 0.05,
  },
};

export function evaluateFitness(positionedNodes, edges, iterations, converged, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const w = opts.weights;
  const R = opts.nodeRadius;

  const nodeMap = new Map(positionedNodes.map((n) => [n.id, n]));
  const N = positionedNodes.length;
  const E = edges.length;

  if (N === 0) {
    return { score: 1, breakdown: emptyBreakdown(w) };
  }

  // --- Convergence and iteration count terms ---

  // No penalty as long as the algorithm managed to converge.
  const didNotConvergePenalty = converged ? 0 : 1;

  // If it didn't converge, full iteration penalty. Otherwise, logarithmic penalty that starts at 0 for fast iteration (200 it) and approaches 1 at very high iteration counts (5000 it). 
  // This encourages the algorithm to find a good layout quickly without needing to run for an excessive number of iterations.
  const iterationPenalty = converged
    ? Math.min(1, Math.max(0, (Math.log(iterations) - Math.log(200)) / (Math.log(5000) - Math.log(200))))
    : 0;

  // --- Edge crossings. It's infeasible to entirely eliminate edge crossings in dense graphs but they should still be minimized ---
  const edgeSegments = edges
    .map((e) => {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (!s || !t) return null;
      return { ax: s.x, ay: s.y, bx: t.x, by: t.y, source: e.source, target: e.target };
    })
    .filter(Boolean);

  let crossingCount = 0;
  let nearParallelCount = 0;
  for (let i = 0; i < edgeSegments.length; i++) {
    for (let j = i + 1; j < edgeSegments.length; j++) {
      const a = edgeSegments[i];
      const b = edgeSegments[j];
      if (a.source === b.source || a.source === b.target ||
          a.target === b.source || a.target === b.target) {
        continue;
      }
      if (segmentsIntersect(a.ax, a.ay, a.bx, a.by, b.ax, b.ay, b.bx, b.by)) {
        crossingCount++;
        const angle = segmentAngleDeg(a.ax, a.ay, a.bx, a.by, b.ax, b.ay, b.bx, b.by);
        if (angle < opts.nearParallelThresholdDeg) {
          nearParallelCount++;
        }
      }
    }
  }
  const crossingPenalty = Math.min(1, crossingCount / (Math.pow(E, 1.5) || 1));
  const nearParallelPenalty = Math.min(1, nearParallelCount / (Math.pow(E, 1.2) || 1));

  // --- Edge-node piercing ---
  let piercingCount = 0;
  for (const seg of edgeSegments) {
    for (const node of positionedNodes) {
      if (node.id === seg.source || node.id === seg.target) continue;
      if (segmentCircleIntersects(seg.ax, seg.ay, seg.bx, seg.by, node.x, node.y, R)) {
        piercingCount++;
      }
    }
  }
  const piercingPenalty = Math.min(1, piercingCount / (E * 0.5 || 1));

  // --- Node overlap ---
  let overlapCount = 0;
  const overlapDist = R * 2;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const d = distance(
        positionedNodes[i].x, positionedNodes[i].y,
        positionedNodes[j].x, positionedNodes[j].y
      );
      if (d < overlapDist) {
        overlapCount++;
      }
    }
  }
  const overlapPenalty = Math.min(1, overlapCount / (N * 0.3 || 1));

  // --- Personal space violation (non-stacking with overlap) ---
  let spaceViolations = 0;
  const spaceDist = overlapDist * opts.personalSpaceMultiplier;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const d = distance(
        positionedNodes[i].x, positionedNodes[i].y,
        positionedNodes[j].x, positionedNodes[j].y
      );
      if (d >= overlapDist && d < spaceDist) {
        spaceViolations++;
      }
    }
  }
  const spacePenalty = Math.min(1, spaceViolations / (N * 0.5 || 1));

  // --- Viewport containment ---
  let visibleCount = 0;
  for (const node of positionedNodes) {
    if (nodeInViewport(node.x, node.y, R, opts.width, opts.height)) {
      visibleCount++;
    }
  }
  const containmentRatio = visibleCount / N;
  let viewportPenalty;
  // Ideal containment is 60-90%. Above 90% gets a gentle penalty (max 0.25 at 100%) since
  // over-compression is already penalized by nodeOverlap and personalSpace terms.
  // Below 60% means too many nodes are off-screen; below 30% is unusable.
  if(containmentRatio >= 0.90) {
    viewportPenalty = (containmentRatio - 0.90) / 0.10 * 0.25;
  } else if (containmentRatio >= 0.60) {
    viewportPenalty = 0;
  } else if (containmentRatio >= 0.30) {
    viewportPenalty = (0.60 - containmentRatio) / 0.30;
  } else {
    viewportPenalty = 1.0;
  }

  // --- Clumping (grid-based coefficient of variation) ---
  const gridCols = 6;
  const gridRows = 4;
  const cellW = opts.width / gridCols;
  const cellH = opts.height / gridRows;
  const cells = new Array(gridCols * gridRows).fill(0);
  for (const node of positionedNodes) {
    const col = Math.max(0, Math.min(gridCols - 1, Math.floor(node.x / cellW)));
    const row = Math.max(0, Math.min(gridRows - 1, Math.floor(node.y / cellH)));
    cells[row * gridCols + col]++;
  }
  const nonEmpty = cells.filter((c) => c > 0);
  let clumpingPenalty = 0;
  if (nonEmpty.length > 1) {
    const mean = nonEmpty.reduce((s, v) => s + v, 0) / nonEmpty.length;
    const variance = nonEmpty.reduce((s, v) => s + (v - mean) ** 2, 0) / nonEmpty.length;
    const cv = Math.sqrt(variance) / mean;
    clumpingPenalty = Math.min(1, Math.max(0, (cv - 1.0) / 2.0));
  }

  // --- Edge length variance. This is similar to clumping, but for edges. 
  // Generally, we want to use the space effectively by having nodes and edges both relatively evenly distributed. Obviously these are correlated and so they only sum to .1 weight.  ---
  let edgeLengthPenalty = 0;
  if (edgeSegments.length > 1) {
    const lengths = edgeSegments.map((s) =>
      distance(s.ax, s.ay, s.bx, s.by)
    );
    const mean = lengths.reduce((s, v) => s + v, 0) / lengths.length;
    const variance = lengths.reduce((s, v) => s + (v - mean) ** 2, 0) / lengths.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    edgeLengthPenalty = Math.min(1, Math.max(0, (cv - 0.5) / 1.5));
  }

  // --- Composite score ---
  const breakdown = {
    didNotConverge: { raw: didNotConvergePenalty, penalty: didNotConvergePenalty, weight: w.converged },
    iterations: { raw: iterations, penalty: iterationPenalty, weight: w.iterationsRequired },
    edgeCrossings: { raw: crossingCount, penalty: crossingPenalty, weight: w.edgeCrossings },
    nearParallelCrossings: { raw: nearParallelCount, penalty: nearParallelPenalty, weight: w.nearParallelCrossings },
    edgeNodePiercing: { raw: piercingCount, penalty: piercingPenalty, weight: w.edgeNodePiercing },
    nodeOverlap: { raw: overlapCount, penalty: overlapPenalty, weight: w.nodeOverlap },
    personalSpace: { raw: spaceViolations, penalty: spacePenalty, weight: w.personalSpace },
    viewportContainment: { raw: containmentRatio, penalty: viewportPenalty, weight: w.viewportContainment },
    clumping: { raw: nonEmpty.length, penalty: clumpingPenalty, weight: w.clumping },
    edgeLengthVariance: { raw: edgeSegments.length, penalty: edgeLengthPenalty, weight: w.edgeLengthVariance },
  };

  // Check whether the algorithm uses excessive space in pursuit of other goals, thus becoming unusuable. If less than 30% of nodes are visible, apply a penalty override that sets the score to 0 regardless of other factors. This prevents gaming the other metrics by just spreading everything out.
  let totalPenalty = 0;
  if (containmentRatio < 0.30) {
    breakdown.viewportContainment.penalty = 100000000; // effectively infinite penalty to override all others
    totalPenalty = 1;
  } else {
      totalPenalty = 0;
      for (const term of Object.values(breakdown)) {
        totalPenalty += term.penalty * term.weight;
      }
  }

  const score = Math.max(0, 1 - totalPenalty);

  return { score, breakdown };
}

function emptyBreakdown(w) {
  const result = {};
  for (const [key, weight] of Object.entries(w)) {
    result[key] = { raw: 0, penalty: 0, weight };
  }
  return result;
}
