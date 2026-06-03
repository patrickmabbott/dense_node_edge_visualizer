import { readFileSync, writeFileSync } from 'fs';
import { computeLayout } from './layout.js';
import { evaluateFitness } from './fitness.js';

const args = process.argv.slice(2);

function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return defaultVal;
  return args[idx + 1];
}

const inputPath = getArg('input', null);
const confidenceLevels = getArg('confidence', 'high,medium,low').split(',').map((s) => s.trim());
const outputPath = getArg('output', null);
const iterations = parseInt(getArg('iterations', '200'), 10);

if (!inputPath) {
  console.error('Usage: node server/cli.js --input <path> [--confidence high,medium] [--output result.json] [--iterations 200]');
  process.exit(1);
}

const dataset = JSON.parse(readFileSync(inputPath, 'utf-8'));

const filteredEdges = dataset.edges.filter((e) => confidenceLevels.includes(e.confidence));
const referencedIds = new Set(filteredEdges.flatMap((e) => [e.source, e.target]));
const filteredNodes = dataset.nodes.filter((n) => referencedIds.has(n.id));

console.log(`Confidence levels: ${confidenceLevels.join(', ')}`);
console.log(`Nodes: ${filteredNodes.length}, Edges: ${filteredEdges.length}`);
console.log(`Running layout (${iterations} iterations)...`);

const layoutResult = computeLayout(filteredNodes, filteredEdges, { iterations });
const fitness = evaluateFitness(layoutResult.nodes, filteredEdges, layoutResult.iterations, layoutResult.converged);

console.log(`\nConverged: ${layoutResult.converged} (${layoutResult.iterations} iterations)`);
console.log(`\nFitness Score: ${fitness.score.toFixed(4)}`);
console.log('Breakdown:');
for (const [name, term] of Object.entries(fitness.breakdown)) {
  console.log(`  ${name.padEnd(22)} raw: ${String(term.raw).padStart(5)}  penalty: ${term.penalty.toFixed(4)}  weight: ${term.weight}`);
}

if (outputPath) {
  const result = {
    nodes: layoutResult.nodes,
    edges: filteredEdges,
    fitness,
    meta: {
      iterations: layoutResult.iterations,
      converged: layoutResult.converged,
      confidenceLevels,
    },
  };
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\nResult written to ${outputPath}`);
}
