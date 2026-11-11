import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service(#{ title: "Call Calendar API" })
namespace CallCalendar;

model HealthResponse { status: "ok"; }
model ApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string>;
}
model BadRequest { @statusCode statusCode: 400; @body body: ApiError; }
model Unauthenticated { @statusCode statusCode: 401; @body body: ApiError; }
model Forbidden { @statusCode statusCode: 403; @body body: ApiError; }
model RateLimited {
  @statusCode statusCode: 429;
  @header("Retry-After") retryAfter: string;
  @body body: ApiError;
}
model Authenticated { authenticated: true; }
model LoggedOut { authenticated: false; }
model LoginRequest { login: string; password: string; }

@route("/api/health") @get @operationId("getHealth")
op getHealth(): HealthResponse;

@route("/api/owner/login") @post @operationId("ownerLogin")
op ownerLogin(@body body: LoginRequest): Authenticated | BadRequest | Unauthenticated | Forbidden | RateLimited;

@route("/api/owner/session") @get @operationId("ownerSession")
op ownerSession(): Authenticated | Unauthenticated;

@route("/api/owner/logout") @post @operationId("ownerLogout")
op ownerLogout(): LoggedOut | Unauthenticated | Forbidden;
