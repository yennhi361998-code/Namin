import { registerSW } from "virtual:pwa-register";

declare const __APP_BUILD_ID__: string;

export const BUILD_STORAGE_KEY = "namin:last_build_id";
export const USER_DATA_KEY = "namin:data";
export const USER_DATA_BACKUP_KEY = "namin:data_backup";

/**
 * Safeguards user data in localStorage and removes obsolete CacheStorage buckets
 * whenever a new build is deployed and launched.
 */
export async function checkAndClearCacheOnNewBuild(): Promise<{
  isNewBuild: boolean;
  clearedCaches: string[];
}> {
  if (typeof window === "undefined") {
    return { isNewBuild: false, clearedCaches: [] };
  }

  // 1. Data Safety Safeguard:
  // Ensure user data is never lost. If data exists, keep a secondary backup in localStorage.
  // If main data was ever accidentally missing, restore it from backup.
  try {
    const rawData = localStorage.getItem(USER_DATA_KEY);
    const rawBackup = localStorage.getItem(USER_DATA_BACKUP_KEY);

    if (rawData) {
      try {
        localStorage.setItem(USER_DATA_BACKUP_KEY, rawData);
      } catch {
        /* storage quota or restricted access */
      }
    } else if (rawBackup) {
      // Emergency recovery: main data key missing but backup exists
      try {
        localStorage.setItem(USER_DATA_KEY, rawBackup);
        console.info("[CacheManager] Restored user data from safety backup.");
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn("[CacheManager] Data safety check warning:", err);
  }

  // 2. Build Version Detection:
  const clearedCaches: string[] = [];
  let isNewBuild = false;

  try {
    const currentBuild = typeof __APP_BUILD_ID__ !== "undefined" ? String(__APP_BUILD_ID__) : "";
    const lastBuild = localStorage.getItem(BUILD_STORAGE_KEY);

    if (currentBuild && lastBuild && currentBuild !== lastBuild) {
      isNewBuild = true;
      console.log(`[CacheManager] New build detected (${lastBuild} -> ${currentBuild}). Clearing stale caches...`);

      if ("caches" in window) {
        try {
          const keys = await caches.keys();
          for (const key of keys) {
            await caches.delete(key);
            clearedCaches.push(key);
          }
          if (clearedCaches.length > 0) {
            console.log("[CacheManager] Cleared CacheStorage buckets:", clearedCaches);
          }
        } catch (cacheErr) {
          console.warn("[CacheManager] Failed to clear CacheStorage:", cacheErr);
        }
      }
    }

    if (currentBuild) {
      localStorage.setItem(BUILD_STORAGE_KEY, currentBuild);
    }
  } catch (err) {
    console.error("[CacheManager] Error during cache invalidation check:", err);
  }

  return { isNewBuild, clearedCaches };
}

/**
 * Sets up Service Worker auto-updates and handles automatic page refresh
 * when a new Service Worker claims clients.
 */
export function setupServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  // In development, ensure any stale service worker is completely unregistered
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    });
    return;
  }

  let isRefreshing = false;

  // When the new Service Worker activates and claims clients (via skipWaiting + clientsClaim),
  // refresh the page once so the browser loads the new JS/CSS bundles immediately.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!isRefreshing) {
      isRefreshing = true;
      console.log("[CacheManager] New service worker took control. Refreshing to activate latest build...");
      window.location.reload();
    }
  });

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log("[CacheManager] New content available, applying update...");
      updateSW(true);
    },
    onOfflineReady() {
      console.log("[CacheManager] App is ready to work offline.");
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Check for updates when user comes back online
      window.addEventListener("online", () => {
        console.log("[CacheManager] Device online. Checking for build updates...");
        registration.update().catch(() => {});
      });

      // Check for updates when app regains focus or tab becomes visible
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          registration.update().catch(() => {});
        }
      });

      // Periodic check every 30 minutes
      setInterval(() => {
        registration.update().catch(() => {});
      }, 30 * 60 * 1000);
    },
  });
}

/**
 * Top-level initializer to run at application startup.
 */
export function initCacheAndServiceWorker(): void {
  checkAndClearCacheOnNewBuild();
  setupServiceWorker();
}
