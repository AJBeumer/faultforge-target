import type { Deps } from "../deps.ts";
import type { Booking } from "./types.ts";

export type CancelBookingResult = { kind: "cancelled"; booking: Booking } | { kind: "not_found" };

/**
 * Cancels one of `userId`'s bookings. Cancelling an already cancelled booking changes nothing.
 * Someone else's booking is reported as not found, the same as a missing one.
 */
export function cancelBooking(deps: Deps, userId: string, bookingId: string): CancelBookingResult {
  const booking = deps.store.getBooking(bookingId);
  if (!booking || booking.userId !== userId) {
    return { kind: "not_found" };
  }
  if (booking.status === "cancelled") {
    return { kind: "cancelled", booking };
  }

  const cancelled: Booking = { ...booking, status: "cancelled" };
  deps.store.saveBooking(cancelled);
  return { kind: "cancelled", booking: cancelled };
}
