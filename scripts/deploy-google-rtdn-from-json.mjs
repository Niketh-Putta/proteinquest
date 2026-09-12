#!/usr/bin/env node
/** MCP deploy args for google-rtdn. */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = [
  {
    name: 'functions/google-rtdn/index.ts',
    path: 'supabase/functions/google-rtdn/index.ts',
  },
  {
    name: 'functions/_shared/play-rtdn.ts',
    path: 'supabase/functions/_shared/play-rtdn.ts',
  },
];

const payload = {
  project_id: 'csxdkvpvcasuknhnprxp',
  name: 'google-rtdn',
  entrypoint_path: 'functions/google-rtdn/index.ts',
  verify_jwt: false,
  files: files.map((f) => ({
    name: f.name,
    content: fs.readFileSync(path.join(root, f.path), 'utf8'),
  })),
};

process.stdout.write(JSON.stringify(payload));
