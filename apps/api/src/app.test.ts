import { expect, test } from 'vitest';
import { getHealth } from '@call-calendar/api-contract';
import { createClient } from '@call-calendar/api-contract/client';
import { buildApp } from './app.js';

test('starts an HTTP server and returns health through the generated SDK', async () => {
  const app = buildApp();
  try {
    const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
    const client = createClient({ baseUrl });
    const { data, response } = await getHealth({
      client,
      signal: AbortSignal.timeout(5000),
      throwOnError: true,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(data).toEqual({ status: 'ok' });
  } finally {
    await app.close();
  }
});
