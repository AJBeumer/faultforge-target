import type { Booking, IdempotencyRecord } from "./bookings/types.ts";

/**
 * In-memory storage. Each app instance gets its own store, so tests are isolated.
 * Idempotency records are keyed per user: two users may use the same key.
 */
export class BookingStore {
  private readonly bookings = new Map<string, Booking>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();

  /** Each user's list, built on first use and dropped when one of their bookings is saved. */
  private readonly listsByUser = new Map<string, Booking[]>();

  getBooking(id: string): Booking | undefined {
    return this.bookings.get(id);
  }

  saveBooking(booking: Booking): void {
    this.bookings.set(booking.id, booking);
    this.listsByUser.delete(booking.userId);
  }

  /** A user's bookings in the order they were created. Saving a booking again keeps its place. */
  listBookings(userId: string): Booking[] {
    let list = this.listsByUser.get(userId);
    if (!list) {
      list = [...this.bookings.values()].filter((booking) => booking.userId === userId);
      this.listsByUser.set(userId, list);
    }
    return list;
  }

  countBookings(): number {
    return this.bookings.size;
  }

  getIdempotencyRecord(userId: string, key: string): IdempotencyRecord | undefined {
    return this.idempotency.get(idempotencyId(userId, key));
  }

  saveIdempotencyRecord(userId: string, key: string, record: IdempotencyRecord): void {
    this.idempotency.set(idempotencyId(userId, key), record);
  }
}

function idempotencyId(userId: string, key: string): string {
  return JSON.stringify([userId, key]);
}
