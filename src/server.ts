import { buildApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp({ fastify: { logger: true } });

try {
  await app.listen({ port, host: "127.0.0.1" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
