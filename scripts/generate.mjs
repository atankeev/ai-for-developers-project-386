import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const output = process.env.API_GENERATED_DIR ?? resolve('generated');
execFileSync('tsp', ['compile', '.', '--output-dir', output, '--warn-as-error'], {
  stdio: 'inherit',
});
execFileSync('openapi-ts', [], {
  stdio: 'inherit',
  env: { ...process.env, API_GENERATED_DIR: output },
});
