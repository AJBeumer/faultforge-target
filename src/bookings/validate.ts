import { findResource, MAX_NIGHTS } from "../fixtures.ts";
import type { BookingRequest } from "./types.ts";

export type ValidationError =
  | { code: "invalid_request"; message: string }
  | { code: "resource_not_found"; message: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses a YYYY-MM-DD string as a UTC date, rejecting impossible dates like 2026-02-30. */
export function parseDate(value: string): Date | undefined {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return undefined;
  }
  return date;
}

/** Business rules that JSON schema cannot express. Shape is checked by the route schema. */
export function validateBooking(input: BookingRequest, now: Date): ValidationError | undefined {
  const start = parseDate(input.startDate);
  const end = parseDate(input.endDate);
  if (!start || !end) {
    return { code: "invalid_request", message: "startDate and endDate must be valid dates" };
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (start.getTime() < today) {
    return { code: "invalid_request", message: "startDate must not be in the past" };
  }

  const nights = (end.getTime() - start.getTime()) / DAY_MS;
  if (nights < 1) {
    return { code: "invalid_request", message: "endDate must be after startDate" };
  }
  if (nights > MAX_NIGHTS) {
    return { code: "invalid_request", message: `a booking may not exceed ${MAX_NIGHTS} nights` };
  }

  const resource = findResource(input.resourceId);
  if (!resource) {
    return { code: "resource_not_found", message: `unknown resource ${input.resourceId}` };
  }
  if (input.guests > resource.maxGuests) {
    return {
      code: "invalid_request",
      message: `${resource.name} allows at most ${resource.maxGuests} guests`,
    };
  }

  return undefined;
}
