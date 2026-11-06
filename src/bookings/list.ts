import type { Deps } from "../deps.ts";
import type { Booking } from "./types.ts";

/**
 * Lists `userId`'s own bookings, newest first, including cancelled ones.
 * Bookings created at the same instant keep their creation order, newest first.
 */
export function listBookings(deps: Deps, userId: string): Booking[] {
  const created = deps.store.listBookings(userId);
  return created.reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
