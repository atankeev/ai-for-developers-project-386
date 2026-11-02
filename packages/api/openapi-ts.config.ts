import { resolve } from 'node:path';
import { defineConfig } from '@hey-api/openapi-ts';

const output = process.env.API_GENERATED_DIR ?? resolve('generated');

export default defineConfig({
  input: resolve(output, 'openapi.json'),
  output: { path: resolve(output, 'sdk'), module: { extension: '.js' } },
  plugins: ['@hey-api/typescript', '@hey-api/sdk', '@hey-api/client-fetch'],
});
