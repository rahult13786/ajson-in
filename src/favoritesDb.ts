import Dexie, { type Table } from "dexie";

/**
 * Favorites storage, client-side only: IndexedDB via Dexie instead of localStorage, so a
 * payload's raw text lives in the browser's structured-storage database rather than a
 * JSON-stringified blob in localStorage (which has a much smaller practical size ceiling).
 */
export interface FavoriteRecord {
  id?: number;
  name: string;
  raw: string;
  kind: string;
  bytes: number;
  savedAt: string;
}

class FavoritesDatabase extends Dexie {
  favorites!: Table<FavoriteRecord, number>;
  constructor() {
    super("payload-inspector-favorites-db");
    this.version(1).stores({
      favorites: "++id, savedAt",
    });
  }
}

export const db = new FavoritesDatabase();

/** Total budget for all stored favorites, combined. */
export const FAVORITES_CAP_BYTES = 2 * 1024 * 1024; // 2 MB

export function byteSizeOf(text: string): number {
  return new TextEncoder().encode(text).length;
}

export async function listFavorites(): Promise<FavoriteRecord[]> {
  const all = await db.favorites.toArray();
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function getUsedBytes(): Promise<number> {
  const all = await db.favorites.toArray();
  return all.reduce((sum, f) => sum + f.bytes, 0);
}

export interface EvictionPlan {
  toEvict: FavoriteRecord[];
  evictedBytes: number;
  currentUsedBytes: number;
  newUsedBytes: number;
  /** False when even removing every stored favorite wouldn't make room for the incoming payload. */
  fits: boolean;
}

/**
 * Figures out which of the oldest favorites would need to be removed to fit `incomingBytes`
 * of new payload within the 2 MB cap. Oldest-first eviction, stopping as soon as there's room.
 */
export async function planEviction(incomingBytes: number): Promise<EvictionPlan> {
  const all = await db.favorites.toArray();
  all.sort((a, b) => a.savedAt.localeCompare(b.savedAt)); // oldest first
  const currentUsedBytes = all.reduce((sum, f) => sum + f.bytes, 0);

  if (currentUsedBytes + incomingBytes <= FAVORITES_CAP_BYTES) {
    return {
      toEvict: [],
      evictedBytes: 0,
      currentUsedBytes,
      newUsedBytes: currentUsedBytes + incomingBytes,
      fits: true,
    };
  }

  const toEvict: FavoriteRecord[] = [];
  let freed = 0;
  for (const f of all) {
    if (currentUsedBytes - freed + incomingBytes <= FAVORITES_CAP_BYTES) break;
    toEvict.push(f);
    freed += f.bytes;
  }
  const newUsedBytes = currentUsedBytes - freed + incomingBytes;
  return { toEvict, evictedBytes: freed, currentUsedBytes, newUsedBytes, fits: newUsedBytes <= FAVORITES_CAP_BYTES };
}

export async function addFavorite(
  name: string,
  raw: string,
  kind: string,
  evictIds: number[] = []
): Promise<FavoriteRecord> {
  if (evictIds.length > 0) {
    await db.favorites.bulkDelete(evictIds);
  }
  const bytes = byteSizeOf(raw);
  const record: FavoriteRecord = { name, raw, kind, bytes, savedAt: new Date().toISOString() };
  const id = await db.favorites.add(record);
  return { ...record, id };
}

export async function removeFavorite(id: number): Promise<void> {
  await db.favorites.delete(id);
}
