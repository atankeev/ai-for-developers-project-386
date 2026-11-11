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

model NotFound { @statusCode statusCode: 404; @body body: ApiError; }
model PublicMeetingType { id: string; title: string; description: string; durationMinutes: int32; }
model MeetingType extends PublicMeetingType { hidden: boolean; version: int32; }
model CreateMeetingTypeRequest { title: string; description?: string; durationMinutes: int32; }
model ReplaceMeetingTypeRequest { title: string; description: string; durationMinutes: int32; hidden: boolean; expectedVersion: int32; }
model Warning { code: "DURATION_EXCEEDS_WORKING_INTERVALS"; message: string; }
model MeetingTypeResult { meetingType: MeetingType; warnings: Warning[]; }
model OwnerMeetingTypes { items: MeetingType[]; }
model CatalogItem extends PublicMeetingType { nearestStartsAt: string | null; }
model Catalog { items: CatalogItem[]; }
model Slot { startsAt: string; endsAt: string; }
model AvailabilityDay { date: string; slots: Slot[]; }
model Availability {
  meetingType: PublicMeetingType;
  timeZone: "Europe/Moscow";
  windowStart: string;
  windowEnd: string;
  days: AvailabilityDay[];
}
@route("/api/owner/meeting-types") @get @operationId("listOwnerMeetingTypes")
op listOwnerMeetingTypes(): OwnerMeetingTypes | Unauthenticated;
@route("/api/owner/meeting-types") @post @operationId("createMeetingType")
op createMeetingType(@body body: CreateMeetingTypeRequest): MeetingTypeResult | BadRequest | Unauthenticated | Forbidden;
@route("/api/owner/meeting-types/{id}") @put @operationId("replaceMeetingType")
op replaceMeetingType(@path id: string, @body body: ReplaceMeetingTypeRequest): MeetingTypeResult | BadRequest | NotFound | Unauthenticated | Forbidden;
@route("/api/meeting-types") @get @operationId("getCatalog")
op getCatalog(): Catalog;
@route("/api/meeting-types/{id}/availability") @get @operationId("getAvailability")
op getAvailability(@path id: string): Availability | NotFound;

model WorkingInterval { start: string; end: string; }
model WeekdaySchedule { day: int32; intervals: WorkingInterval[]; }
model WeeklySchedule { version: int32; days: WeekdaySchedule[]; }
model ReplaceWeeklyScheduleRequest { expectedVersion: int32; days: WeekdaySchedule[]; }
@route("/api/owner/schedule") @get @operationId("getOwnerSchedule")
op getOwnerSchedule(): WeeklySchedule | Unauthenticated;
@route("/api/owner/schedule") @put @operationId("replaceWeeklySchedule")
op replaceWeeklySchedule(@body body: ReplaceWeeklyScheduleRequest): WeeklySchedule | BadRequest | Unauthenticated | Forbidden;

model CreateBookingRequest {
 attemptId: string; meetingTypeId: string; startsAt: string;
 guestName: string; guestEmail: string; comment?: string;
}
model GuestBooking {
 id: string; title: string; startsAt: string; endsAt: string;
 timeZone: "Europe/Moscow"; status: "confirmed" | "cancelled";
}
model BookingResult { booking: GuestBooking; confirmationUrl: string; }
model OwnerBooking {
 id: string; meetingTypeId: string; title: string; description: string; durationMinutes: int32;
 startsAt: string; endsAt: string; status: "confirmed" | "cancelled"; cancelledAt: string | null;
 guestName: string; guestEmail: string; comment: string;
}
model OwnerBookings { items: OwnerBooking[]; nextCursor: string | null; }
@route("/api/bookings") @post @operationId("createBooking")
op createBooking(@body body: CreateBookingRequest): BookingResult | BadRequest | NotFound;
@route("/api/confirmations/{token}") @get @operationId("getConfirmation")
op getConfirmation(@path token: string): GuestBooking | NotFound;
@route("/api/owner/bookings") @get @operationId("listOwnerBookings")
op listOwnerBookings(@query group: "upcoming" | "past" | "cancelled", @query cursor?: string): OwnerBookings | BadRequest | Unauthenticated;
@route("/api/owner/bookings/{id}") @get @operationId("getOwnerBooking")
op getOwnerBooking(@path id: string): OwnerBooking | NotFound | Unauthenticated;
