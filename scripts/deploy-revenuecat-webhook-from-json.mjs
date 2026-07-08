#!/usr/bin/env node
/** MCP deploy args for revenuecat-webhook. */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = [
  {
    name: 'functions/revenuecat-webhook/index.ts',
    path: 'supabase/functions/revenuecat-webhook/index.ts',
  },
  {
    name: 'functions/_shared/entitlement-state.ts',
    path: 'supabase/functions/_shared/entitlement-state.ts',
  },
];

const payload = {
  project_id: 'csxdkvpvcasuknhnprxp',
  name: 'revenuecat-webhook',
  entrypoint_path: 'functions/revenuecat-webhook/index.ts',
  verify_jwt: false,
  files: files.map((f) => ({
    name: f.name,
    content: fs.readFileSync(path.join(root, f.path), 'utf8'),
  })),
};

process.stdout.write(JSON.stringify(payload));
