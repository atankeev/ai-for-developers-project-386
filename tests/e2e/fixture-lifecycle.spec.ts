import { test } from './fixtures.js';

const lifecycleTest = test.extend<{ lateRequest: { release: Promise<void> } }>({
  lateRequest: async ({ context }, use) => {
    void context;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    await use({ release: ready });
    release();
    // Keep the browser alive as it can be on CI while its API fixture tears down.
    await new Promise((resolve) => setTimeout(resolve, 100));
  },
  api: async ({ lateRequest, api }, use) => {
    void lateRequest;
    void api;
    await use();
  },
});

lifecycleTest(
  'late browser requests cannot outlive the API forwarding fixture',
  async ({ page, lateRequest }) => {
    let requested!: () => void;
    const pending = new Promise<void>((resolve) => {
      requested = resolve;
    });
    await page.route('**/api/meeting-types', async (route) => {
      requested();
      await lateRequest.release;
      await route.fallback();
    });
    await page.goto('/book');
    await pending;
  },
);
