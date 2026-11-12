import type { Deps } from "../deps.ts";
import type { Booking, BookingRequest } from "./types.ts";
import { type ValidationError, validateBooking } from "./validate.ts";

export type CreateBookingResult =
  | { kind: "created"; booking: Booking }
  | { kind: "replayed"; booking: Booking }
  | { kind: "key_reused"; message: string }
  | ({ kind: "rejected" } & ValidationError);

/**
 * Creates a booking for `userId`, keyed by a client-supplied idempotency key.
 *
 * A repeat call with the same key and the same request returns the original booking
 * instead of creating a new one. Reusing a key for a different request is refused.
 */
export function createBooking(
  deps: Deps,
  userId: string,
  idempotencyKey: string,
  input: BookingRequest,
): CreateBookingResult {
  const fingerprint = fingerprintRequest(input);

  const previous = deps.store.getIdempotencyRecord(userId, idempotencyKey);
  if (previous) {
    if (previous.requestFingerprint !== fingerprint) {
      return {
        kind: "key_reused",
        message: "this Idempotency-Key was already used for a different request",
      };
    }
    const original = deps.store.getBooking(previous.bookingId);
    if (original) {
      return { kind: "replayed", booking: original };
    }
  }

  const error = validateBooking(input, deps.clock.now());
  if (error) {
    return { kind: "rejected", ...error };
  }

  const booking: Booking = {
    id: deps.nextId(),
    userId,
    resourceId: input.resourceId,
    startDate: input.startDate,
    endDate: input.endDate,
    guests: input.guests,
    ...(input.note !== undefined && { note: input.note }),
    status: "confirmed",
    createdAt: deps.clock.now().toISOString(),
  };

  deps.store.saveBooking(booking);
  deps.store.saveIdempotencyRecord(userId, idempotencyKey, {
    bookingId: booking.id,
    requestFingerprint: fingerprint,
  });

  return { kind: "created", booking };
}

/** Stable representation of the fields that define a booking request. */
function fingerprintRequest(input: BookingRequest): string {
  return JSON.stringify([input.resourceId, input.startDate, input.endDate, input.guests]);
}
