import type { Deps } from "../deps.ts";
import type { Booking } from "./types.ts";

export const BOOKING_STATUSES = ["confirmed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type ListBookingsResult = { kind: "listed"; bookings: Booking[] } | { kind: "invalid_status"; message: string };

/**
 * Lists `userId`'s own bookings, newest first, optionally filtered by status.
 * Bookings created at the same instant keep their creation order, newest first.
 */
export function listBookings(
  deps: Deps,
  userId: string,
  statusFilter: string | string[] | undefined,
): ListBookingsResult {
  const status = parseStatusFilter(statusFilter);
  if (status.kind === "invalid") {
    return {
      kind: "invalid_status",
      message: `status must be one of: ${BOOKING_STATUSES.join(", ")}`,
    };
  }

  const created = deps.store.listBookings(userId);
  const filtered = status.kind === "value" ? created.filter((booking) => booking.status === status.value) : created;
  return { kind: "listed", bookings: filtered.reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

function parseStatusFilter(
  raw: string | string[] | undefined,
): { kind: "none" } | { kind: "value"; value: BookingStatus } | { kind: "invalid" } {
  if (raw === undefined) return { kind: "none" };
  // A repeated query key arrives as an array; only a single known value is accepted.
  if (typeof raw !== "string" || !BOOKING_STATUSES.includes(raw as BookingStatus)) {
    return { kind: "invalid" };
  }
  return { kind: "value", value: raw as BookingStatus };
}
