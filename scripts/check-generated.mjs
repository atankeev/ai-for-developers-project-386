import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

async function contents(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const result = {};
  for (const entry of files) {
    const path = join(entry.parentPath, entry.name);
    result[path.slice(directory.length + 1)] = await readFile(path, 'utf8');
  }
  return result;
}

const temporary = await mkdtemp(join(tmpdir(), 'call-calendar-generated-'));
try {
  execFileSync('npm', ['run', 'generate'], {
    stdio: 'inherit',
    env: { ...process.env, API_GENERATED_DIR: temporary },
  });
  assert.deepEqual(
    await contents(resolve('packages/api/generated')),
    await contents(temporary),
    'Generated API files are stale. Run mise run generate.',
  );
  console.log('Generated API files are up to date.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
