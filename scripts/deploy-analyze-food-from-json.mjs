#!/usr/bin/env node
/**
 * Prints deploy_edge_function MCP arguments as JSON on stdout.
 * Usage: node scripts/deploy-analyze-food-from-json.mjs > /tmp/mcp-deploy-args.json
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = [
  {
    name: 'functions/analyze-food/index.ts',
    path: 'supabase/functions/analyze-food/index.ts',
  },
  {
    name: 'functions/_shared/calorie-density.ts',
    path: 'supabase/functions/_shared/calorie-density.ts',
  },
  {
    name: 'functions/_shared/protein-density.ts',
    path: 'supabase/functions/_shared/protein-density.ts',
  },
];

const payload = {
  project_id: 'csxdkvpvcasuknhnprxp',
  name: 'analyze-food',
  entrypoint_path: 'functions/analyze-food/index.ts',
  verify_jwt: false,
  files: files.map((f) => ({
    name: f.name,
    content: fs.readFileSync(path.join(root, f.path), 'utf8'),
  })),
};

process.stdout.write(JSON.stringify(payload));
