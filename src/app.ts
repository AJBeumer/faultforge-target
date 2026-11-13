import Fastify, { type FastifyServerOptions } from "fastify";
import { bookingRoutes } from "./bookings/routes.ts";
import { createDeps, type Deps } from "./deps.ts";

export interface AppOptions {
  deps?: Partial<Deps>;
  fastify?: FastifyServerOptions;
}

export function buildApp(options: AppOptions = {}) {
  const deps = createDeps(options.deps);
  // Fastify strips unknown body fields and coerces types by default; reject both instead, so "2" is not
  // taken for 2.
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false, coerceTypes: false } }, ...options.fastify });

  // Many clients send `Content-Type: application/json` on every request, even without a body. Treat
  // a body of zero length as no body, so a route that takes none still works and authentication still
  // runs first. Anything else, whitespace included, goes through Fastify's own JSON parser, with its
  // protections, and is rejected if it isn't valid JSON.
  const parseJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const text = typeof body === "string" ? body : body.toString("utf8");
    if (text.length === 0) return done(null, undefined);
    parseJson(request, text, done);
  });

  app.setErrorHandler((error: { statusCode?: number; message: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error(error);
      return reply.code(500).send({ error: "internal_error", message: "something went wrong" });
    }
    return reply.code(status).send({ error: "invalid_request", message: error.message });
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.register(async (scope) => bookingRoutes(scope, deps));

  return app;
}
