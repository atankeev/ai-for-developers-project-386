import { fileURLToPath } from 'node:url';
import Fastify, { LogController } from 'fastify';
import type { FastifyRequest, FastifyError, FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import openapiGlue from 'fastify-openapi-glue';
import type {
  CreateBookingRequest,
  HealthResponse,
  LoginRequest,
  CreateMeetingTypeRequest,
  ReplaceMeetingTypeRequest,
  ReplaceWeeklyScheduleRequest,
} from '@call-calendar/api-contract';
import { Calendar, CalendarError } from './calendar.js';
import { readOwnerConfig, verifyPassword } from './auth.js';
import type { OwnerConfig } from './auth.js';

declare module 'fastify' {
  interface Session {
    ownerExpiresAt?: number;
  }
}

const SESSION_LIFETIME = 12 * 60 * 60 * 1000;

export function buildApp(
  options: {
    logger?: FastifyServerOptions['logger'];
    config?: OwnerConfig;
    now?: () => number;
  } = {},
) {
  const config = options.config ?? readOwnerConfig();
  const now = options.now ?? Date.now;
  const calendar = new Calendar(now);
  // Default request/error serializers include URLs and headers. Disable request logging entirely;
  // explicit lifecycle messages contain neither request data nor credentials.
  const app = Fastify({
    logger: options.logger ?? false,
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: config.trustProxy,
  });
  const attempts = new Map<string, { start: number; count: number }>();
  const unauthenticated = () => ({ code: 'UNAUTHENTICATED', message: 'Требуется вход владельца' });

  app.register(cookie);
  app.register(session, {
    secret: config.cookieSecret,
    cookieName: 'ownerSession',
    cookie: {
      path: '/',
      maxAge: SESSION_LIFETIME,
      httpOnly: true,
      sameSite: 'strict',
      secure: config.allowedOrigin.startsWith('https:'),
    },
    rolling: false,
    saveUninitialized: false,
  });
  // One boundary protects every present and future owner route before its handler or validation.
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]!;
    if (path === '/api/bookings' || path.startsWith('/api/confirmations/'))
      reply.header('Cache-Control', 'no-store');
    if (path !== '/api/owner' && !path.startsWith('/api/owner/')) return;
    reply.header('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers.origin !== config.allowedOrigin
    ) {
      return reply
        .code(403)
        .send({ code: 'ORIGIN_FORBIDDEN', message: 'Недопустимый источник запроса' });
    }
    if (path === '/api/owner/login' && request.method === 'POST') {
      const time = now();
      for (const [ip, value] of attempts) if (time >= value.start + 60_000) attempts.delete(ip);
      const attempt = attempts.get(request.ip) ?? { start: time, count: 0 };
      attempts.set(request.ip, attempt);
      if (++attempt.count > 5) {
        return reply
          .header(
            'Retry-After',
            String(Math.max(1, Math.ceil((attempt.start + 60_000 - time) / 1000))),
          )
          .code(429)
          .send({ code: 'LOGIN_RATE_LIMITED', message: 'Слишком много попыток. Попробуйте позже' });
      }
      return;
    }
    if (!request.session.ownerExpiresAt || now() >= request.session.ownerExpiresAt) {
      if (request.session.ownerExpiresAt) await request.session.destroy();
      return reply.code(401).send(unauthenticated());
    }
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ code: 'NOT_FOUND', message: 'Ресурс не найден' }),
  );
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof CalendarError)
      return reply.code(error.status).send({
        code: error.code,
        message: error.message,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      });
    const failure = error as FastifyError;
    if (failure.validation || (failure.statusCode && failure.statusCode < 500)) {
      const fieldErrors = Object.fromEntries(
        (failure.validation ?? []).map((issue) => [
          issue.instancePath.split('/').filter(Boolean)[0] ??
            String(issue.params.missingProperty ?? 'body'),
          'Проверьте значение поля',
        ]),
      );
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Проверьте поля запроса',
        ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}),
      });
    }
    // Never serialize the error: validator/runtime errors can contain supplied fields.
    app.log.error('Request failed');
    return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' });
  });
  app.register(openapiGlue, {
    specification: fileURLToPath(import.meta.resolve('@call-calendar/api-contract/openapi.json')),
    serviceHandlers: {
      async createBooking(request: FastifyRequest<{ Body: CreateBookingRequest }>) {
        return calendar.createBooking(request.body);
      },
      async getConfirmation(request: FastifyRequest<{ Params: { token: string } }>) {
        return calendar.getConfirmation(request.params.token);
      },
      async getOwnerBooking(request: FastifyRequest<{ Params: { id: string } }>) {
        return calendar.getOwnerBooking(request.params.id);
      },
      async listOwnerBookings(
        request: FastifyRequest<{ Querystring: { group: string; cursor?: string } }>,
      ) {
        return calendar.listOwnerBookings(request.query.group, request.query.cursor);
      },
      async getOwnerSchedule() {
        return calendar.getOwnerSchedule();
      },
      async replaceWeeklySchedule(request: FastifyRequest<{ Body: ReplaceWeeklyScheduleRequest }>) {
        return calendar.replaceWeeklySchedule(request.body);
      },
      async replaceMeetingType(
        request: FastifyRequest<{ Params: { id: string }; Body: ReplaceMeetingTypeRequest }>,
      ) {
        return calendar.replaceMeetingType(request.params.id, request.body);
      },
      async createMeetingType(request: FastifyRequest<{ Body: CreateMeetingTypeRequest }>) {
        return calendar.createMeetingType(request.body);
      },
      async listOwnerMeetingTypes() {
        return calendar.listOwnerMeetingTypes();
      },
      async getCatalog() {
        return calendar.getCatalog();
      },
      async getAvailability(request: FastifyRequest<{ Params: { id: string } }>) {
        return calendar.getAvailability(request.params.id);
      },
      async getHealth(): Promise<HealthResponse> {
        return { status: 'ok' };
      },
      async ownerLogin(
        request: FastifyRequest<{ Body: LoginRequest }>,
        reply: import('fastify').FastifyReply,
      ) {
        const validPassword = verifyPassword(request.body.password, config.passwordHash);
        if (request.body.login !== config.login || !validPassword)
          return reply.code(401).send(unauthenticated());
        await request.session.regenerate();
        request.session.ownerExpiresAt = now() + SESSION_LIFETIME;
        return { authenticated: true };
      },
      async ownerSession() {
        return { authenticated: true };
      },
      async ownerLogout(request: FastifyRequest, reply: import('fastify').FastifyReply) {
        await request.session.destroy();
        reply.clearCookie('ownerSession', {
          path: '/',
          httpOnly: true,
          sameSite: 'strict',
          secure: config.allowedOrigin.startsWith('https:'),
        });
        return { authenticated: false };
      },
    },
  });
  return app;
}
