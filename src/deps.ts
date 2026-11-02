import { BookingStore } from "./store.ts";

export interface Clock {
  now(): Date;
}

export interface Deps {
  store: BookingStore;
  clock: Clock;
  nextId: () => string;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const instant = new Date(iso);
  return { now: () => new Date(instant) };
}

/** Sequential ids (bk_0001, bk_0002, ...) so runs are reproducible. */
export function sequentialIds(prefix = "bk"): () => string {
  let n = 0;
  return () => `${prefix}_${String(++n).padStart(4, "0")}`;
}

export function createDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    store: overrides.store ?? new BookingStore(),
    clock: overrides.clock ?? systemClock,
    nextId: overrides.nextId ?? sequentialIds(),
  };
}
