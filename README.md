# Dense Network Graph Visualizer

Network graph visualization tool for investigation data. Nodes represent entities (people, organizations, events) and edges represent known or suspected associations at varying confidence levels. Includes a headless evaluation mode with a multi-objective fitness function for measuring layout quality.

## Architecture

```
client/           Browser-based D3 visualization
  index.html      Main page with confidence level filters and fitness display
  main.js         D3 rendering, zoom/pan, tooltip, fitness breakdown UI
  style.css       Dark theme styling with color-coded confidence/type

server/           Node.js backend
  index.js        Express API server (/api/dataset, /api/layout)
  layout.js       Force-directed layout engine (Coulomb repulsion + spring forces)
  fitness.js      10-term weighted fitness evaluator
  geometry.js     Segment intersection, circle intersection, angle utilities
  cli.js          Headless CLI for evaluating layouts without the browser

data/
  baseline_dataset.json   Reference dataset with schema and sample data
```

## Running

```bash
npm install

# Web UI (starts Express server + Vite dev server)
npm run dev

# Headless CLI evaluation
npm run cli -- --input data/baseline_dataset.json --confidence high,medium --iterations 10000
npm run cli -- --input <path> --confidence <levels> [--output result.json] [--iterations 200]
```

CLI options:
- `--input` (required): Path to a dataset JSON file
- `--confidence`: Comma-separated confidence levels to include (default: `high,medium,low`)
- `--output`: Write full result (positioned nodes, edges, fitness) to a JSON file
- `--iterations`: Max simulation iterations (default: 200)

## Dataset Format

Datasets are JSON with `metadata`, `nodes`, and `edges` arrays:

```json
{
  "metadata": { "nodeCount": 100, "edgeCount": 301, "edgeDistribution": { "high": 61, "medium": 100, "low": 140 } },
  "nodes": [
    { "id": "person_name", "label": "Display Name", "type": "person|organization|event", "cluster": 1 }
  ],
  "edges": [
    { "source": "node_id_a", "target": "node_id_b", "confidence": "high|medium|low", "label": "Relationship type" }
  ]
}
```

**Confidence levels** model investigative certainty:
- **high**: Confirmed associations. These follow a power-law degree distribution with a few hub nodes and many leaf nodes. The resulting graph is relatively tractable for force-directed layout.
- **medium**: Probable associations. These add cross-cluster connections that increase edge density and create more layout challenges.
- **low**: Speculative associations (algorithmic flags, tips, surveillance overlaps). These heavily connect leaf nodes across clusters, creating a dense web of intersecting edges that overwhelms a basic force-directed approach.

## Force-Directed Layout Engine

`server/layout.js` implements a basic force-directed algorithm:
- **Coulomb repulsion**: All node pairs repel (inverse-square law)
- **Spring attraction**: Connected nodes attract toward a rest length
- **Center gravity**: Gentle pull toward canvas center
- **Damping**: Velocity decay per iteration

Deterministic: uses a seeded PRNG (`mulberry32`) so the same input always produces the same layout.

## Fitness Function

`server/fitness.js` evaluates layout quality as a weighted sum of 10 penalty terms, each normalized to [0, 1]. The composite score is `1 - sum(penalty * weight)`.

| Term | Weight | What it penalizes |
|------|--------|-------------------|
| Convergence | 0.05 | Algorithm failed to converge within iteration limit |
| Iterations | 0.05 | Higher iteration count to converge (log scale, 200-5000 range) |
| Edge Crossings | 0.15 | Edges that intersect (normalized by E^1.5) |
| Near-Parallel Crossings | 0.10 | Intersecting edges at very shallow angles (< 5 degrees) |
| Edge-Node Piercing | 0.20 | Edges passing through unrelated nodes (highest weight) |
| Node Overlap | 0.15 | Nodes whose circles overlap |
| Personal Space | 0.10 | Nodes too close together but not overlapping |
| Viewport Containment | 0.10 | Nodes outside the 1200x800 canvas (ideal: 60-90% visible) |
| Clumping | 0.05 | Uneven spatial distribution (coefficient of variation across grid cells) |
| Edge Length Variance | 0.05 | Uneven edge lengths (high CV means some edges are much longer than others) |

Edge-Node Piercing carries the highest weight (0.20) because an edge passing through an unrelated node creates the most confusing visual artifact in an investigation graph.

## Expected Fitness Scores

Baseline scores using the included dataset with the default force-directed algorithm at 10000 iterations:

| Scenario | Nodes | Edges | Baseline Score | Improved Target |
|----------|-------|-------|----------------|-----------------|
| High only | ~60 | ~60 | ~0.90 | ~0.95 |
| High + Medium | ~95 | ~160 | ~0.80 | ~0.85 |
| All (high + medium + low) | ~100 | ~300 | ~0.55 | ~0.70 |

The high-only scenario is already well-handled by basic force-directed layout. The primary challenges are:
- **High + Medium**: Cross-cluster medium-confidence edges create significantly more edge crossings and node piercings. Algorithmic improvements should target reducing these.
- **All confidence**: The low-confidence edges connect leaf nodes across clusters, producing a dense mesh that a vanilla force-directed approach cannot untangle. This scenario may require fundamentally different techniques beyond parameter tuning.

When generating synthetic test data, aim for datasets that produce baseline scores in these ranges to ensure the data exhibits the right structural characteristics. A synthetic dataset that scores 0.90+ at all confidence levels is too easy and doesn't model the problem well.
