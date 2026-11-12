import { buildApp } from './app.js';
import { registerWeb } from './web.js';
import { containerOwnerConfig } from './container.js';

const production = process.env.NODE_ENV === 'production';
const app = buildApp({
  logger: true,
  config: production ? await containerOwnerConfig() : undefined,
});
if (production) await registerWeb(app);
const port = Number(process.env.PORT ?? 3000);

async function shutdown() {
  try {
    await app.close();
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

try {
  await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
