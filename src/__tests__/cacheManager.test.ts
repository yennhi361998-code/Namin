import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkAndClearCacheOnNewBuild,
  BUILD_STORAGE_KEY,
  USER_DATA_KEY,
  USER_DATA_BACKUP_KEY,
} from "../lib/cacheManager";

function createMockLocalStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, val: string) => {
      store[key] = String(val);
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
}

describe("cacheManager", () => {
  let mockStorage: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    mockStorage = createMockLocalStorage();
    vi.stubGlobal("localStorage", mockStorage);
    vi.stubGlobal("window", {
      location: { reload: vi.fn() },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("safeguards existing user data into backup and updates build key", async () => {
    const dummyUserData = JSON.stringify({ household: { id: "h1", name: "Home" } });
    mockStorage.setItem(USER_DATA_KEY, dummyUserData);

    const result = await checkAndClearCacheOnNewBuild();

    expect(mockStorage.getItem(USER_DATA_KEY)).toBe(dummyUserData);
    expect(mockStorage.getItem(USER_DATA_BACKUP_KEY)).toBe(dummyUserData);
    expect(mockStorage.getItem(BUILD_STORAGE_KEY)).toBeDefined();
    expect(result.isNewBuild).toBe(false); // First run with no previous build
  });

  it("restores user data from backup if main data key is unexpectedly empty", async () => {
    const backupUserData = JSON.stringify({ household: { id: "h1", name: "Recovered Home" } });
    mockStorage.setItem(USER_DATA_BACKUP_KEY, backupUserData);

    await checkAndClearCacheOnNewBuild();

    expect(mockStorage.getItem(USER_DATA_KEY)).toBe(backupUserData);
  });

  it("detects a new build and clears CacheStorage buckets without touching user data", async () => {
    const dummyUserData = JSON.stringify({ tasks: [{ id: "t1", title: "Task 1" }] });
    mockStorage.setItem(USER_DATA_KEY, dummyUserData);
    mockStorage.setItem(BUILD_STORAGE_KEY, "old_build_123");

    const deletedCaches: string[] = [];
    const mockCaches = {
      keys: vi.fn().mockResolvedValue(["workbox-precache-old", "runtime-cache-old"]),
      delete: vi.fn().mockImplementation(async (key: string) => {
        deletedCaches.push(key);
        return true;
      }),
    };

    vi.stubGlobal("window", {
      location: { reload: vi.fn() },
      caches: mockCaches,
    });
    vi.stubGlobal("caches", mockCaches);

    const result = await checkAndClearCacheOnNewBuild();

    expect(result.isNewBuild).toBe(true);
    expect(mockCaches.keys).toHaveBeenCalled();
    expect(deletedCaches).toEqual(["workbox-precache-old", "runtime-cache-old"]);
    expect(result.clearedCaches).toEqual(["workbox-precache-old", "runtime-cache-old"]);

    // CRITICAL: User data MUST remain completely intact
    expect(mockStorage.getItem(USER_DATA_KEY)).toBe(dummyUserData);
    expect(mockStorage.getItem(USER_DATA_BACKUP_KEY)).toBe(dummyUserData);
    expect(mockStorage.getItem(BUILD_STORAGE_KEY)).not.toBe("old_build_123");
  });

  it("does not clear caches if build version has not changed", async () => {
    // Run once to store the current build
    await checkAndClearCacheOnNewBuild();
    const currentBuild = mockStorage.getItem(BUILD_STORAGE_KEY);

    const mockCaches = {
      keys: vi.fn().mockResolvedValue(["workbox-precache-current"]),
      delete: vi.fn(),
    };
    vi.stubGlobal("caches", mockCaches);

    // Run again with the same build stored
    const result = await checkAndClearCacheOnNewBuild();

    expect(result.isNewBuild).toBe(false);
    expect(mockCaches.delete).not.toHaveBeenCalled();
    expect(mockStorage.getItem(BUILD_STORAGE_KEY)).toBe(currentBuild);
  });
});
