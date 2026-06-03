const DEFAULTS = {
  width: 1200,
  height: 800,
  iterations: 200,
  centerGravity: 0.01,
  repulsionStrength: 5000,
  springStrength: 0.005,
  springLength: 100,
  damping: 0.95,
  minVelocity: 0.01,
  maxVelocity: 50,
  initialSpread: 300,
};

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function computeLayout(inputNodes, inputEdges, options = {}) {
  const p = { ...DEFAULTS, ...options };
  const nodes = inputNodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0 }));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const validEdges = inputEdges.filter(
    (e) => nodeMap.has(e.source) && nodeMap.has(e.target)
  );

  // Deterministic initial placement
  const seed = hashString(nodes.map((n) => n.id).sort().join(','));
  const rng = mulberry32(seed);
  const cx = p.width / 2;
  const cy = p.height / 2;

  for (const node of nodes) {
    const angle = rng() * 2 * Math.PI;
    const r = rng() * p.initialSpread;
    node.x = cx + Math.cos(angle) * r;
    node.y = cy + Math.sin(angle) * r;
  }

  // Simulation loop
  let finalIter = p.iterations;
  let converged = false;

  for (let iter = 0; iter < p.iterations; iter++) {
    for (const node of nodes) {
      node.fx = 0;
      node.fy = 0;
    }

    // Center gravity
    for (const node of nodes) {
      node.fx += (cx - node.x) * p.centerGravity;
      node.fy += (cy - node.y) * p.centerGravity;
    }

    // Coulomb repulsion (all pairs)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const ni = nodes[i];
        const nj = nodes[j];
        let dx = nj.x - ni.x;
        let dy = nj.y - ni.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) distSq = 1;
        const dist = Math.sqrt(distSq);
        const force = p.repulsionStrength / distSq;
        const fx = (force * dx) / dist;
        const fy = (force * dy) / dist;
        ni.fx -= fx;
        ni.fy -= fy;
        nj.fx += fx;
        nj.fy += fy;
      }
    }

    // Spring forces along edges
    for (const edge of validEdges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      let dx = tgt.x - src.x;
      let dy = tgt.y - src.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;
      const displacement = dist - p.springLength;
      const force = p.springStrength * displacement;
      const fx = (force * dx) / dist;
      const fy = (force * dy) / dist;
      src.fx += fx;
      src.fy += fy;
      tgt.fx -= fx;
      tgt.fy -= fy;
    }

    // Update velocities and positions
    let totalVelocity = 0;
    for (const node of nodes) {
      node.vx = (node.vx + node.fx) * p.damping;
      node.vy = (node.vy + node.fy) * p.damping;
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > p.maxVelocity) {
        node.vx = (node.vx / speed) * p.maxVelocity;
        node.vy = (node.vy / speed) * p.maxVelocity;
      }
      node.x += node.vx;
      node.y += node.vy;
      totalVelocity += speed;
    }

    const avgVelocity = totalVelocity / nodes.length;
    if (avgVelocity < p.minVelocity) {
      finalIter = iter + 1;
      converged = true;
      break;
    }
  }

  const positioned = nodes.map(({ fx, fy, vx, vy, ...rest }) => rest);

  return { nodes: positioned, iterations: finalIter, converged };
}
