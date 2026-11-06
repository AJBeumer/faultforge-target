import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { fixedClock } from "../src/deps.ts";

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

  it("returns 404 for an unknown resource", async () => {
    const app = setup();
    const res = await post(app, { ...validBooking, resourceId: "room-999" });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("resource_not_found");
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
});
