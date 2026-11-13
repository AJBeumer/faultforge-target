/** Fictional users and resources. Fixed so every run starts from the same state. */

export const USERS = ["user-alice", "user-bob"] as const;

export const RESOURCES = [
  { id: "room-101", name: "Garden Room", maxGuests: 2 },
  { id: "room-102", name: "Harbour Suite", maxGuests: 4 },
  { id: "studio-a", name: "Studio A", maxGuests: 8 },
] as const;

export const MAX_NIGHTS = 14;

const KNOWN_USERS = new Set(USERS.map((user) => user.toLowerCase()));

/** Header values may arrive in any case from some clients, so compare without case. */
export function isKnownUser(id: string): boolean {
  return KNOWN_USERS.has(id.toLowerCase());
}

export function findResource(id: string) {
  return RESOURCES.find((r) => r.id === id);
}
