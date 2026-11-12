import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { hashPassword, readOwnerConfig } from './auth.js';

export async function containerOwnerConfig(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.OWNER_LOGIN ||
    env.OWNER_PASSWORD_HASH ||
    env.OWNER_COOKIE_SECRET ||
    env.OWNER_ALLOWED_ORIGIN
  ) {
    return readOwnerConfig(env);
  }
  const login = 'test';
  const password = randomBytes(24).toString('base64url');
  const config = readOwnerConfig({
    ...env,
    OWNER_LOGIN: login,
    OWNER_PASSWORD_HASH: hashPassword(password),
    OWNER_COOKIE_SECRET: randomBytes(48).toString('hex'),
    OWNER_ALLOWED_ORIGIN: `http://localhost:${env.PORT ?? 3000}`,
  });
  await writeFile('/tmp/call-calendar-owner.json', JSON.stringify({ login, password }), {
    mode: 0o600,
    flag: 'w',
  });
  return config;
}
