import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import openapiGlue from 'fastify-openapi-glue';
import type { HealthResponse } from '@call-calendar/api-contract';

export function buildApp(options: { logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? false });

  app.register(openapiGlue, {
    specification: fileURLToPath(import.meta.resolve('@call-calendar/api-contract/openapi.json')),
    serviceHandlers: {
      async getHealth(): Promise<HealthResponse> {
        return { status: 'ok' };
      },
    },
  });

  return app;
}
