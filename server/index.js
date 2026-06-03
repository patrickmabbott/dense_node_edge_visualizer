import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeLayout } from './layout.js';
import { evaluateFitness } from './fitness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'data', 'baseline_dataset.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/dataset', (_req, res) => {
  try {
    const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read dataset', details: err.message });
  }
});

app.post('/api/layout', (req, res) => {
  const { nodes, edges, options } = req.body;

  if (!nodes || !edges) {
    return res.status(400).json({ error: 'Request must include nodes and edges arrays' });
  }

  try {
    const layoutResult = computeLayout(nodes, edges, options);
    const fitness = evaluateFitness(layoutResult.nodes, edges);

    res.json({
      nodes: layoutResult.nodes,
      edges,
      fitness,
      meta: {
        iterations: layoutResult.iterations,
        converged: layoutResult.converged,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Layout computation failed', details: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
