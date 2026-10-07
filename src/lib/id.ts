let counter = 0;

// crypto.randomUUID is unavailable over plain http on a LAN IP (e.g. testing on a phone), so fall back.
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* insecure context */
    }
  }
  return `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
