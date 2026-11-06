# AGENTS.md

Instructions for anyone, human or agent, who writes or reviews code in this repository.

## What this is

A tiny fictional booking API: create a booking, read it back. It is small on purpose, but its
business rules are strict. They are listed in [INVARIANTS.md](INVARIANTS.md), and every change
must keep them.

Stack: TypeScript, Node.js 22+, Fastify, Vitest, Biome.

## Setup and checks

```bash
npm install
npm run check     # typecheck, lint (Biome) and tests; must pass before every commit
npm run format    # apply Biome's formatting and safe fixes
npm start         # http://127.0.0.1:3000
```

Tests live in `test/`. A change in behaviour comes with a test that shows it.

## Project rules

### 1. Idempotency keys belong to a user

- **Rule:** a stored request is always looked up by user id and idempotency key together. On a
  repeat request, return the booking whose id the stored record holds. Never use the
  client-supplied key itself as a booking id, and never look a key up without the user.
- **Applies to:** `src/bookings/create.ts`, `src/store.ts`, and any new route that accepts an
  `Idempotency-Key`.
- **Why:** a key is chosen by the client, so two users can pick the same one. A lookup that
  drops the user, or treats the key as an id, can create duplicate bookings or hand one user
  another user's booking. It breaks INV-IDEMP-001 and INV-AUTH-001 at once.

### 2. Someone else's booking is "not found", never "forbidden"

- **Rule:** when a booking exists but belongs to another user, respond exactly as if it did
  not exist: `404` with `not_found`. Don't return `403`, and don't add anything to the body
  that differs from a truly missing booking.
- **Applies to:** every route that reads, changes or cancels a booking by id
  (`src/bookings/routes.ts` and any route added later).
- **Why:** a different answer confirms that the id exists, which leaks other users' data one
  guess at a time (INV-AUTH-001).

### 3. Check the whole request before touching the store

- **Rule:** reject bad input before any write. Request schemas keep
  `additionalProperties: false`, so unknown fields are refused, not ignored. Business limits
  (dates, nights, guests) are checked in `src/bookings/validate.ts` before a booking or an
  idempotency record is saved.
- **Applies to:** route schemas in `src/bookings/routes.ts`, `src/bookings/validate.ts`, and
  the order of steps in `src/bookings/create.ts`.
- **Why:** a request that fails halfway must leave no trace. A stray record or half-saved
  booking changes how later requests behave (INV-VALID-001, INV-BOUND-001).

### 4. No real clock or random ids in application code

- **Rule:** get the current time from `deps.clock` and new ids from `deps.nextId`. Don't read
  the system time (`new Date()` without arguments, `Date.now()`) or make random values
  (`Math.random()`, `crypto.randomUUID()`) in `src/`, except where `src/deps.ts` defines the
  real clock and id generator. Parsing a given date string is fine.
- **Applies to:** everything in `src/`. Tests use `fixedClock` and `sequentialIds`.
- **Why:** date rules depend on "today". With an injected clock, tests can sit exactly on a
  boundary and give the same result every run.

## For reviewers

Flag a change that breaks one of these rules or an invariant in `INVARIANTS.md`, even if all
tests pass.
