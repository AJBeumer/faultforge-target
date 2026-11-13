import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { fixedClock } from "../src/deps.ts";
import { BookingStore } from "../src/store.ts";

const NOW = "2026-11-02T09:00:00Z";

function setup() {
  return buildApp({ deps: { clock: fixedClock(NOW) } });
}

const validBooking = {
  resourceId: "room-102",
  startDate: "2026-11-10",
  endDate: "2026-11-13",
  guests: 2,
};

function post(app: ReturnType<typeof setup>, body: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/bookings",
    headers: { "x-user-id": "user-alice", "idempotency-key": "key-1", ...headers },
    payload: body as object,
  });
}

describe("POST /bookings", () => {
  it("creates a confirmed booking", async () => {
    const app = setup();
    const res = await post(app, validBooking);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: "bk_0001",
      userId: "user-alice",
      ...validBooking,
      status: "confirmed",
      createdAt: NOW.replace("Z", ".000Z"),
    });
  });

  it("keeps an optional note", async () => {
    const app = setup();
    const res = await post(app, { ...validBooking, note: "late arrival" });

    expect(res.statusCode).toBe(201);
    expect(res.json().note).toBe("late arrival");
  });

  it("requires an Idempotency-Key header", async () => {
    const app = setup();
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-user-id": "user-alice" },
      payload: validBooking,
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects unauthenticated callers", async () => {
    const app = setup();
    const res = await post(app, validBooking, { "x-user-id": "mallory" });

    expect(res.statusCode).toBe(401);
  });

  it.each([
    ["missing field", { ...validBooking, guests: undefined }],
    ["unknown field", { ...validBooking, discount: 50 }],
    ["zero guests", { ...validBooking, guests: 0 }],
    ["impossible date", { ...validBooking, startDate: "2026-02-30" }],
    ["start in the past", { ...validBooking, startDate: "2026-11-01" }],
    ["end before start", { ...validBooking, endDate: "2026-11-09" }],
    ["zero nights", { ...validBooking, endDate: "2026-11-10" }],
    ["more than 14 nights", { ...validBooking, endDate: "2026-11-25" }],
    ["too many guests for the room", { ...validBooking, guests: 5 }],
  ])("rejects %s with 400", async (_label, body) => {
    const app = setup();
    const res = await post(app, body);

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
  });

  it("accepts a booking starting today for exactly 14 nights", async () => {
    const app = setup();
    const res = await post(app, { ...validBooking, startDate: "2026-11-02", endDate: "2026-11-16" });

    expect(res.statusCode).toBe(201);
  });

  it("refuses a value of the wrong type instead of converting it", async () => {
    const app = setup();
    const res = await post(app, { ...validBooking, guests: "2" });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
  });

  it("answers an unknown or missing user with 401 before looking at the body", async () => {
    const app = setup();
    const unknown = await post(app, { guests: "many" }, { "x-user-id": "mallory" });
    const missing = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "idempotency-key": "key-1" },
      payload: { guests: "many" },
    });

    expect(unknown.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
  });

  it("returns 404 for an unknown resource", async () => {
    const app = setup();
    const res = await post(app, { ...validBooking, resourceId: "room-999" });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("resource_not_found");
  });

  it("replays a repeated request: the original booking, marked as a replay, and nothing new stored", async () => {
    const store = new BookingStore();
    const app = buildApp({ deps: { store, clock: fixedClock(NOW) } });
    const first = await post(app, validBooking);
    const repeat = await post(app, validBooking);

    expect(first.statusCode).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expect(repeat.statusCode).toBe(200);
    expect(repeat.headers["idempotent-replayed"]).toBe("true");
    expect(repeat.json()).toEqual(first.json());
    expect(store.countBookings()).toBe(1);
  });

  it("refuses to reuse a key for a different request", async () => {
    const app = setup();
    await post(app, validBooking);
    const res = await post(app, { ...validBooking, guests: 3 });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("idempotency_key_reused");
  });

  it("issues distinct ids for distinct keys", async () => {
    const app = setup();
    const first = await post(app, validBooking, { "idempotency-key": "key-a" });
    const second = await post(app, validBooking, { "idempotency-key": "key-b" });

    expect(first.json().id).toBe("bk_0001");
    expect(second.json().id).toBe("bk_0002");
  });
});

describe("GET /bookings/:id", () => {
  it("returns the caller's own booking", async () => {
    const app = setup();
    const created = (await post(app, validBooking)).json();
    const res = await app.inject({
      method: "GET",
      url: `/bookings/${created.id}`,
      headers: { "x-user-id": "user-alice" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(created);
  });

  it("hides other users' bookings", async () => {
    const app = setup();
    const created = (await post(app, validBooking)).json();
    const res = await app.inject({
      method: "GET",
      url: `/bookings/${created.id}`,
      headers: { "x-user-id": "user-bob" },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("POST /bookings/:id/cancel", () => {
  function cancel(app: ReturnType<typeof setup>, id: string, userId = "user-alice") {
    return app.inject({ method: "POST", url: `/bookings/${id}/cancel`, headers: { "x-user-id": userId } });
  }

  function get(app: ReturnType<typeof setup>, id: string, userId = "user-alice") {
    return app.inject({ method: "GET", url: `/bookings/${id}`, headers: { "x-user-id": userId } });
  }

  it("cancels the caller's own booking", async () => {
    const app = setup();
    const created = (await post(app, validBooking)).json();
    const res = await cancel(app, created.id);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ...created, status: "cancelled" });
    expect((await get(app, created.id)).json().status).toBe("cancelled");
  });

  it("changes nothing when the booking is already cancelled", async () => {
    const app = setup();
    const created = (await post(app, validBooking)).json();
    const first = await cancel(app, created.id);
    const second = await cancel(app, created.id);

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
  });

  it("treats another user's booking exactly like a missing one", async () => {
    const app = setup();
    const created = (await post(app, validBooking)).json();
    const other = await cancel(app, created.id, "user-bob");
    const missing = await cancel(app, "bk_9999", "user-bob");

    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual(missing.json());
    expect((await get(app, created.id)).json().status).toBe("confirmed");
  });

  it("returns 404 for a missing booking", async () => {
    const app = setup();
    const res = await cancel(app, "bk_9999");

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found", message: "booking not found" });
  });

  it("rejects unauthenticated callers", async () => {
    const app = setup();
    const created = (await post(app, validBooking)).json();
    const res = await cancel(app, created.id, "mallory");

    expect(res.statusCode).toBe(401);
    expect((await get(app, created.id)).json().status).toBe("confirmed");
  });

  it("rejects a request without x-user-id", async () => {
    const app = setup();
    const created = (await post(app, validBooking)).json();
    const res = await app.inject({ method: "POST", url: `/bookings/${created.id}/cancel` });

    expect(res.statusCode).toBe(401);
    expect((await get(app, created.id)).json().status).toBe("confirmed");
  });

  it("rejects a request body and leaves the booking unchanged", async () => {
    const app = setup();
    const created = (await post(app, validBooking)).json();
    const res = await app.inject({
      method: "POST",
      url: `/bookings/${created.id}/cancel`,
      headers: { "x-user-id": "user-alice" },
      payload: { reason: "changed plans" },
    });

    expect(res.statusCode).toBe(400);
    expect((await get(app, created.id)).json().status).toBe("confirmed");
  });
});

describe("GET /bookings", () => {
  function list(app: ReturnType<typeof setup>, userId = "user-alice") {
    return app.inject({ method: "GET", url: "/bookings", headers: { "x-user-id": userId } });
  }

  async function book(app: ReturnType<typeof setup>, key: string, userId = "user-alice") {
    return (await post(app, validBooking, { "idempotency-key": key, "x-user-id": userId })).json();
  }

  it("returns the caller's bookings, newest first", async () => {
    let tick = 0;
    const app = buildApp({ deps: { clock: { now: () => new Date(Date.parse(NOW) + tick++ * 60_000) } } });
    const first = await book(app, "a");
    const second = await book(app, "b");
    const third = await book(app, "c");
    const res = await list(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().map((b: { id: string }) => b.id)).toEqual([third.id, second.id, first.id]);
  });

  it("keeps creation order, newest first, when bookings share a timestamp", async () => {
    const app = setup();
    const first = await book(app, "a");
    const second = await book(app, "b");

    expect((await list(app)).json().map((b: { id: string }) => b.id)).toEqual([second.id, first.id]);
  });

  it("never includes other users' bookings", async () => {
    const app = setup();
    const mine = await book(app, "a");
    await book(app, "a", "user-bob");

    expect((await list(app)).json()).toEqual([mine]);
  });

  it("returns an empty list when there are none", async () => {
    const app = setup();
    await book(app, "a", "user-bob");
    const res = await list(app);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("includes cancelled bookings with their status", async () => {
    const app = setup();
    const created = await book(app, "a");
    await app.inject({ method: "POST", url: `/bookings/${created.id}/cancel`, headers: { "x-user-id": "user-alice" } });

    expect((await list(app)).json()).toEqual([{ ...created, status: "cancelled" }]);
  });

  it("rejects unauthenticated callers", async () => {
    const app = setup();
    const res = await app.inject({ method: "GET", url: "/bookings" });

    expect(res.statusCode).toBe(401);
  });

  function listByStatus(app: ReturnType<typeof setup>, status: string, userId = "user-alice") {
    return app.inject({ method: "GET", url: `/bookings?status=${status}`, headers: { "x-user-id": userId } });
  }

  it("filters to only confirmed bookings, newest first", async () => {
    const app = setup();
    const first = await book(app, "a");
    const second = await book(app, "b");
    await app.inject({ method: "POST", url: `/bookings/${second.id}/cancel`, headers: { "x-user-id": "user-alice" } });

    const res = await listByStatus(app, "confirmed");

    expect(res.statusCode).toBe(200);
    expect(res.json().map((b: { id: string }) => b.id)).toEqual([first.id]);
  });

  it("filters to only cancelled bookings, newest first", async () => {
    const app = setup();
    const first = await book(app, "a");
    const second = await book(app, "b");
    await app.inject({ method: "POST", url: `/bookings/${first.id}/cancel`, headers: { "x-user-id": "user-alice" } });
    await app.inject({ method: "POST", url: `/bookings/${second.id}/cancel`, headers: { "x-user-id": "user-alice" } });

    const res = await listByStatus(app, "cancelled");

    expect(res.statusCode).toBe(200);
    expect(res.json().map((b: { id: string }) => b.id)).toEqual([second.id, first.id]);
  });

  it("without status, lists the same as today: all of the caller's bookings, newest first", async () => {
    const app = setup();
    const first = await book(app, "a");
    const second = await book(app, "b");
    await app.inject({ method: "POST", url: `/bookings/${first.id}/cancel`, headers: { "x-user-id": "user-alice" } });

    const res = await list(app);

    expect(res.json().map((b: { id: string }) => b.id)).toEqual([second.id, first.id]);
  });

  it("never includes another user's bookings when filtering", async () => {
    const app = setup();
    const mine = await book(app, "a");
    await book(app, "a", "user-bob");

    const res = await listByStatus(app, "confirmed");

    expect(res.json()).toEqual([mine]);
  });

  it("rejects an unknown status value with 400 naming the allowed values", async () => {
    const app = setup();
    const res = await listByStatus(app, "pending");

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/confirmed/);
    expect(res.json().message).toMatch(/cancelled/);
  });

  it("rejects an empty status value with 400", async () => {
    const app = setup();
    const res = await listByStatus(app, "");

    expect(res.statusCode).toBe(400);
  });

  it("rejects status given twice with 400", async () => {
    const app = setup();
    const res = await app.inject({
      method: "GET",
      url: "/bookings?status=confirmed&status=cancelled",
      headers: { "x-user-id": "user-alice" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("still rejects unauthenticated callers when a status filter is given", async () => {
    const app = setup();
    const res = await app.inject({ method: "GET", url: "/bookings?status=confirmed" });

    expect(res.statusCode).toBe(401);
  });
});

describe("cancel checks the login before the request body", () => {
  async function booked(app: ReturnType<typeof setup>) {
    return (await post(app, validBooking)).json();
  }

  async function statusOf(app: ReturnType<typeof setup>, id: string) {
    const res = await app.inject({ method: "GET", url: `/bookings/${id}`, headers: { "x-user-id": "user-alice" } });
    return res.json().status;
  }

  it("gives 401, not 400, to a request with a body and no x-user-id", async () => {
    const app = setup();
    const booking = await booked(app);
    const res = await app.inject({ method: "POST", url: `/bookings/${booking.id}/cancel`, payload: { reason: "x" } });

    expect(res.statusCode).toBe(401);
    expect(await statusOf(app, booking.id)).toBe("confirmed");
  });

  it("gives 401, not 400, to a request with a body and an unknown user", async () => {
    const app = setup();
    const booking = await booked(app);
    const res = await app.inject({
      method: "POST",
      url: `/bookings/${booking.id}/cancel`,
      headers: { "x-user-id": "mallory" },
      payload: { reason: "x" },
    });

    expect(res.statusCode).toBe(401);
    expect(await statusOf(app, booking.id)).toBe("confirmed");
  });

  it("still refuses a body from the logged-in owner with 400", async () => {
    const app = setup();
    const booking = await booked(app);
    const res = await app.inject({
      method: "POST",
      url: `/bookings/${booking.id}/cancel`,
      headers: { "x-user-id": "user-alice" },
      payload: { reason: "x" },
    });

    expect(res.statusCode).toBe(400);
    expect(await statusOf(app, booking.id)).toBe("confirmed");
  });
});

describe("cancel with a JSON content type and no body", () => {
  async function created(app: ReturnType<typeof setup>) {
    return (await post(app, validBooking)).json();
  }

  function cancelWith(app: ReturnType<typeof setup>, id: string, headers: Record<string, string>, payload?: string) {
    return app.inject({ method: "POST", url: `/bookings/${id}/cancel`, headers, payload });
  }

  it("cancels the owner's booking", async () => {
    const app = setup();
    const booking = await created(app);
    const res = await cancelWith(app, booking.id, { "x-user-id": "user-alice", "content-type": "application/json" });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("cancelled");
  });

  it("still refuses a body with fields and leaves the booking unchanged", async () => {
    const app = setup();
    const booking = await created(app);
    const res = await cancelWith(
      app,
      booking.id,
      { "x-user-id": "user-alice", "content-type": "application/json" },
      '{"reason":"x"}',
    );
    const after = await app.inject({
      method: "GET",
      url: `/bookings/${booking.id}`,
      headers: { "x-user-id": "user-alice" },
    });

    expect(res.statusCode).toBe(400);
    expect(after.json().status).toBe("confirmed");
  });

  it("still gives 401 without a valid user, with or without a body", async () => {
    const app = setup();
    const booking = await created(app);
    const json = { "content-type": "application/json" };

    expect((await cancelWith(app, booking.id, json)).statusCode).toBe(401);
    expect((await cancelWith(app, booking.id, json, '{"reason":"x"}')).statusCode).toBe(401);
  });

  it("still refuses an empty JSON body when creating a booking", async () => {
    const app = setup();
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      headers: { "x-user-id": "user-alice", "idempotency-key": "k", "content-type": "application/json" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects a body of only whitespace and leaves the booking unchanged", async () => {
    const app = setup();
    const booking = await created(app);
    const res = await cancelWith(
      app,
      booking.id,
      { "x-user-id": "user-alice", "content-type": "application/json" },
      "  \n",
    );
    const after = await app.inject({
      method: "GET",
      url: `/bookings/${booking.id}`,
      headers: { "x-user-id": "user-alice" },
    });

    expect(res.statusCode).toBe(400);
    expect(after.json().status).toBe("confirmed");
  });

  it("still rejects a malformed JSON body", async () => {
    const app = setup();
    const booking = await created(app);
    const res = await cancelWith(
      app,
      booking.id,
      { "x-user-id": "user-alice", "content-type": "application/json" },
      "{",
    );

    expect(res.statusCode).toBe(400);
  });
});
