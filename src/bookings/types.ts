export interface BookingRequest {
  resourceId: string;
  startDate: string;
  endDate: string;
  guests: number;
  note?: string;
}

export interface Booking extends BookingRequest {
  id: string;
  userId: string;
  status: "confirmed" | "cancelled";
  createdAt: string;
}

export interface IdempotencyRecord {
  bookingId: string;
  requestFingerprint: string;
}
