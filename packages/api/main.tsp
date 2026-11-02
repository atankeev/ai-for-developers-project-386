import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service(#{ title: "Call Calendar API" })
namespace CallCalendar;

model HealthResponse {
  status: "ok";
}

@route("/api/health")
@get
@operationId("getHealth")
op getHealth(): HealthResponse;
