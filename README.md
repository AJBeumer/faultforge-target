# faultforge-target

A tiny fictional booking API. It is deliberately small and is not a product.

## Run

```bash
npm install
npm test          # application tests
npm run check     # typecheck, lint and tests
npm start         # http://127.0.0.1:3000
```

## API

All booking routes require an `x-user-id` header naming a fixture user (`user-alice`, `user-bob`).
This stands in for real authentication.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | Liveness check. |
| `POST` | `/bookings` | Requires an `Idempotency-Key` header. `201` on create, `200` with `Idempotent-Replayed: true` on a repeat, `422` if the key was used for a different request. |
| `GET` | `/bookings/:id` | Returns the caller's own booking, `404` otherwise. |
| `POST` | `/bookings/:id/cancel` | Cancels the caller's own booking and returns it. Cancelling twice changes nothing. `404` for a missing booking or someone else's. |

Example:

```bash
curl -X POST http://127.0.0.1:3000/bookings \
  -H "x-user-id: user-alice" -H "idempotency-key: 7f3c" -H "content-type: application/json" \
  -d '{"resourceId":"room-102","startDate":"2027-01-10","endDate":"2027-01-13","guests":2}'
```

Resources: `room-101` (2 guests), `room-102` (4 guests), `studio-a` (8 guests).

## Design

- In-memory store, one per app instance. Clock and id generator are injected so tests are deterministic.
- Business rules are listed in [INVARIANTS.md](INVARIANTS.md). Rules for contributors and reviewers are in [AGENTS.md](AGENTS.md).

Stack: TypeScript, Node.js 22+, Fastify, Vitest.
