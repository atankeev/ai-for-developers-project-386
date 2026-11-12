import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

export async function registerWeb(
  app: FastifyInstance,
  root = fileURLToPath(new URL('../../web/dist/', import.meta.url)),
) {
  await app.register(async (web) => {
    await web.register(fastifyStatic, { root, wildcard: false });
    web.route({
      method: ['GET', 'HEAD'],
      url: '/*',
      handler: (request, reply) => {
        const path = request.url.split('?')[0]!;
        if (
          path !== '/api' &&
          !path.startsWith('/api/') &&
          path !== '/assets' &&
          !path.startsWith('/assets/')
        ) {
          return reply.type('text/html').sendFile('index.html');
        }
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Ресурс не найден' });
      },
    });
  });
}
