import Fastify, { type FastifyServerOptions } from "fastify";
import { bookingRoutes } from "./bookings/routes.ts";
import { createDeps, type Deps } from "./deps.ts";

export interface AppOptions {
  deps?: Partial<Deps>;
  fastify?: FastifyServerOptions;
}

export function buildApp(options: AppOptions = {}) {
  const deps = createDeps(options.deps);
  // Fastify strips unknown body fields by default; reject them instead.
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } }, ...options.fastify });

  // Many clients send `Content-Type: application/json` on every request, even without a body. Treat
  // an empty body as no body, so a route that takes none still works and authentication still runs
  // first. Anything else goes through Fastify's own JSON parser, with its protections.
  const parseJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const text = typeof body === "string" ? body : body.toString("utf8");
    if (text.trim() === "") return done(null, undefined);
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
