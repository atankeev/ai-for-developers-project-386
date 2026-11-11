import { randomBytes } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { buildApp } from '../../apps/api/src/app.js';
import { hashPassword, readOwnerConfig } from '../../apps/api/src/auth.js';

export const test = base.extend<{
  owner: { login: string; password: string };
  api: void;
  serverClock: { now: number };
  bookingFault: { dropNext: boolean; dropBefore: boolean };
}>({
  serverClock: async ({ browserName }, use) => {
    void browserName;
    await use({ now: Date.parse('2026-11-09T06:00:00Z') });
  },
  bookingFault: async ({ browserName }, use) => {
    void browserName;
    await use({ dropNext: false, dropBefore: false });
  },
  owner: async ({ browserName }, use) => {
    await use({
      login: `${browserName}-${randomBytes(16).toString('hex')}`,
      password: randomBytes(32).toString('hex'),
    });
  },
  api: [
    async ({ page, owner, bookingFault, serverClock }, use) => {
      const config = readOwnerConfig({
        OWNER_LOGIN: owner.login,
        OWNER_PASSWORD_HASH: hashPassword(owner.password),
        OWNER_COOKIE_SECRET: randomBytes(48).toString('hex'),
        OWNER_ALLOWED_ORIGIN: 'http://127.0.0.1:4174',
      });
      await page.clock.install({ time: serverClock.now });
      const app = buildApp({ config, now: () => serverClock.now });
      const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
      // Transport routing only: each browser test owns a real isolated HTTP API process state.
      await page.route('**/api/**', async (route) => {
        const incoming = new URL(route.request().url());
        if (incoming.pathname === '/api/bookings' && bookingFault.dropBefore) {
          bookingFault.dropBefore = false;
          await route.abort();
          return;
        }
        const response = await route.fetch({
          url: `${baseUrl}${incoming.pathname}${incoming.search}`,
        });
        if (incoming.pathname === '/api/bookings' && bookingFault.dropNext && response.ok()) {
          bookingFault.dropNext = false;
          await route.abort();
          return;
        }
        await route.fulfill({ response });
      });
      try {
        await use();
      } finally {
        await app.close();
      }
    },
    { auto: true },
  ],
});
export { expect };
