/** Fictional users and resources. Fixed so every run starts from the same state. */

export const USERS = ["user-alice", "user-bob"] as const;

export const RESOURCES = [
  { id: "room-101", name: "Garden Room", maxGuests: 2 },
  { id: "room-102", name: "Harbour Suite", maxGuests: 4 },
  { id: "studio-a", name: "Studio A", maxGuests: 8 },
] as const;

export const MAX_NIGHTS = 14;

export function isKnownUser(id: string): boolean {
  return (USERS as readonly string[]).includes(id);
}

export function findResource(id: string) {
  return RESOURCES.find((r) => r.id === id);
}
