# Invariants

Business rules the booking API must always keep. They are written to be read without
looking at the implementation. Every change to this repository is expected to preserve them.

| Id | Rule |
|---|---|
| INV-IDEMP-001 | Reusing an idempotency key never creates a second booking. A repeat `POST /bookings` from the same user with the same `Idempotency-Key` and the same body returns the original booking. The same key with a different body is refused. |
| INV-AUTH-001 | A user cannot read or cancel another user's booking. Another user's booking is reported as not found. |
| INV-VALID-001 | Invalid requests are rejected without changing state. Unknown fields are rejected, not ignored. |
| INV-NULL-001 | Absent optional data never crashes an otherwise valid request. |
| INV-BOUND-001 | Date and quantity limits are enforced at documented boundaries: a booking starts today or later, lasts 1 to 14 nights, and has between 1 guest and the resource's capacity. |
| INV-OVERLAP-001 | A resource is never double-booked for overlapping ranges. *Not yet enforced.* |

## Conventions

- Dates are calendar dates (`YYYY-MM-DD`) in UTC. `endDate` is the checkout day.
- Idempotency keys are scoped per user: two users may use the same key independently.
