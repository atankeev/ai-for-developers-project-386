import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const parameters = { N: 16384, r: 8, p: 1 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64, parameters).toString('hex');
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

function parseHash(value: string) {
  const parts = value.split('$');
  if (
    parts.length !== 6 ||
    parts[0] !== 'scrypt' ||
    parts[1] !== '16384' ||
    parts[2] !== '8' ||
    parts[3] !== '1' ||
    !/^[a-f0-9]{32}$/.test(parts[4] ?? '') ||
    !/^[a-f0-9]{128}$/.test(parts[5] ?? '')
  )
    throw new Error('OWNER_PASSWORD_HASH must be a supported scrypt hash');
  return { salt: parts[4]!, hash: Buffer.from(parts[5]!, 'hex') };
}

export function verifyPassword(password: string, value: string): boolean {
  const { salt, hash } = parseHash(value);
  return timingSafeEqual(scryptSync(password, salt, 64, parameters), hash);
}

export interface OwnerConfig {
  login: string;
  passwordHash: string;
  cookieSecret: string;
  allowedOrigin: string;
  trustProxy: false | string[];
}

export function readOwnerConfig(env: NodeJS.ProcessEnv = process.env): OwnerConfig {
  const login = env.OWNER_LOGIN;
  const passwordHash = env.OWNER_PASSWORD_HASH;
  const cookieSecret = env.OWNER_COOKIE_SECRET;
  const allowedOrigin = env.OWNER_ALLOWED_ORIGIN;
  if (!login?.trim() || !passwordHash || !cookieSecret || !allowedOrigin) {
    throw new Error('Owner login, password hash, cookie secret and allowed origin are required');
  }
  parseHash(passwordHash);
  if (Buffer.byteLength(cookieSecret) < 32 || verifyPassword(cookieSecret, passwordHash)) {
    throw new Error('OWNER_COOKIE_SECRET must be at least 32 bytes and differ from the password');
  }
  let origin: URL;
  try {
    origin = new URL(allowedOrigin);
  } catch {
    throw new Error('OWNER_ALLOWED_ORIGIN is invalid');
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== allowedOrigin) {
    throw new Error('OWNER_ALLOWED_ORIGIN must be an exact HTTP(S) origin without path');
  }
  const proxies = env.TRUSTED_PROXIES?.split(',').map((value) => value.trim());
  if (proxies?.some((value) => !value || value === '*' || value === 'true')) {
    throw new Error('TRUSTED_PROXIES must explicitly list trusted proxy addresses');
  }
  return { login, passwordHash, cookieSecret, allowedOrigin, trustProxy: proxies ?? false };
}
