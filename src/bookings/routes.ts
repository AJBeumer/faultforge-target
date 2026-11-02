import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Deps } from "../deps.ts";
import { isKnownUser } from "../fixtures.ts";
import { createBooking } from "./create.ts";
import type { BookingRequest } from "./types.ts";

const bookingRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["resourceId", "startDate", "endDate", "guests"],
  properties: {
    resourceId: { type: "string", minLength: 1, maxLength: 64 },
    startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    endDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    guests: { type: "integer", minimum: 1 },
    note: { type: "string", maxLength: 280 },
  },
} as const;

const createHeadersSchema = {
  type: "object",
  required: ["idempotency-key"],
  properties: {
    "idempotency-key": { type: "string", minLength: 1, maxLength: 255 },
  },
} as const;

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

/**
 * Stand-in for real authentication: the caller identifies itself with `x-user-id`,
 * which must be one of the fixture users.
 */
async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.headers["x-user-id"];
  if (typeof userId !== "string" || !isKnownUser(userId)) {
    return reply.code(401).send({ error: "unauthorized", message: "unknown or missing user" });
  }
  request.userId = userId;
}

export async function bookingRoutes(app: FastifyInstance, deps: Deps) {
  app.decorateRequest("userId", "");
  app.addHook("preHandler", authenticate);

  app.post<{ Body: BookingRequest; Headers: { "idempotency-key": string } }>(
    "/bookings",
    { schema: { body: bookingRequestSchema, headers: createHeadersSchema } },
    async (request, reply) => {
      const result = createBooking(
        deps,
        request.userId,
        request.headers["idempotency-key"],
        request.body,
      );

      switch (result.kind) {
        case "created":
          return reply.code(201).send(result.booking);
        case "replayed":
          return reply.code(200).header("idempotent-replayed", "true").send(result.booking);
        case "key_reused":
          return reply.code(422).send({ error: "idempotency_key_reused", message: result.message });
        case "rejected":
          return reply
            .code(result.code === "resource_not_found" ? 404 : 400)
            .send({ error: result.code, message: result.message });
      }
    },
  );

  app.get<{ Params: { id: string } }>("/bookings/:id", async (request, reply) => {
    const booking = deps.store.getBooking(request.params.id);
    // Someone else's booking is reported as missing so its existence does not leak.
    if (!booking || booking.userId !== request.userId) {
      return reply.code(404).send({ error: "not_found", message: "booking not found" });
    }
    return booking;
  });
}
