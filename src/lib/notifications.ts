export interface NotificationSettings {
  /** Master toggle for all notifications */
  enabled: boolean;

  // 1. Tasks & Chores
  morningBriefing: boolean;
  morningBriefingTime: string; // e.g. "08:30"
  assignedByPartner: boolean;
  periodicMaintenance: boolean;
  taskCompletedByPartner: boolean;

  // 2. Shopping & Smart Restock
  runningLowForecast: boolean;
  outOfStock: boolean;
  liveCartUpdate: boolean;

  // 3. Finance & Spending
  upcomingBill: boolean;
  budgetAlert: boolean;

  // 4. AI Assistant & Habit
  eveningAiScanNudge: boolean;
  eveningAiScanTime: string; // e.g. "21:30"
}

export const NOTIFICATION_STORAGE_KEY = 'namin:notification_settings';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,

  // Group 1
  morningBriefing: false,
  morningBriefingTime: '08:30',
  assignedByPartner: false,
  periodicMaintenance: false,
  taskCompletedByPartner: false,

  // Group 2
  runningLowForecast: false,
  outOfStock: false,
  liveCartUpdate: false,

  // Group 3
  upcomingBill: false,
  budgetAlert: false,

  // Group 4
  eveningAiScanNudge: false,
  eveningAiScanTime: '21:30',
};

export function getNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function saveNotificationSettings(
  patch: Partial<NotificationSettings>,
): NotificationSettings {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_SETTINGS;
  const current = getNotificationSettings();
  const next = { ...current, ...patch };
  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[Notifications] Failed to save settings to localStorage:', err);
  }
  return next;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch (err) {
    console.error('[Notifications] Failed to request permission:', err);
    return 'denied';
  }
}

export interface SendNotificationPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/**
 * Sends a silent notification without action buttons.
 * When clicked, it opens the target url in the standalone PWA.
 */
export async function sendNotification({
  title,
  body,
  url,
  tag,
}: SendNotificationPayload): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const options: NotificationOptions = {
    body,
    icon: '/favicon-32.png',
    badge: '/favicon-32.png',
    tag,
    data: { url },
    silent: true, // No sound as requested!
  };

  // Try via ServiceWorker first (best for PWA & Lockscreen)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        return true;
      }
    } catch (err) {
      console.warn('[Notifications] ServiceWorker showNotification failed, trying fallback:', err);
    }
  }

  // Fallback to standard Notification API
  try {
    const notif = new Notification(title, options);
    notif.onclick = () => {
      window.focus();
      if (url && window.location.pathname !== url) {
        window.location.href = url;
      }
    };
    return true;
  } catch (err) {
    console.error('[Notifications] Error triggering notification:', err);
    return false;
  }
}

export type NotificationCaseKey =
  | 'morningBriefing'
  | 'assignedByPartner'
  | 'periodicMaintenance'
  | 'taskCompletedByPartner'
  | 'runningLowForecast'
  | 'outOfStock'
  | 'liveCartUpdate'
  | 'upcomingBill'
  | 'budgetAlert'
  | 'eveningAiScanNudge';

export interface NotificationCaseSpec {
  key: NotificationCaseKey;
  group: 'tasks' | 'shopping' | 'finance' | 'ai';
  groupLabel: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  hasTimeConfig?: boolean;
  timeConfigKey?: 'morningBriefingTime' | 'eveningAiScanTime';
}

export const NOTIFICATION_CASES: Record<NotificationCaseKey, NotificationCaseSpec> = {
  // 1. Tasks & Chores
  morningBriefing: {
    key: 'morningBriefing',
    group: 'tasks',
    groupLabel: 'Tasks & Chores',
    title: "Today's Household Plan",
    body: 'Good morning! 3 chores due today: Take out trash, water indoor plants, and wipe kitchen counters.',
    url: '/tasks',
    tag: 'task-morning-briefing',
    hasTimeConfig: true,
    timeConfigKey: 'morningBriefingTime',
  },
  assignedByPartner: {
    key: 'assignedByPartner',
    group: 'tasks',
    groupLabel: 'Tasks & Chores',
    title: 'New Task from {Partner}',
    body: 'Minh asked: "Could you pick up the dry cleaning on your way home?"',
    url: '/tasks',
    tag: 'task-assigned',
  },
  periodicMaintenance: {
    key: 'periodicMaintenance',
    group: 'tasks',
    groupLabel: 'Tasks & Chores',
    title: 'Maintenance Reminder: Air Conditioner',
    body: "It's been 90 days since the last AC filter cleaning. Time for a quick refresh!",
    url: '/tasks',
    tag: 'task-maintenance',
  },
  taskCompletedByPartner: {
    key: 'taskCompletedByPartner',
    group: 'tasks',
    groupLabel: 'Tasks & Chores',
    title: 'Task Completed',
    body: 'Lan just finished: "Deep clean bathroom".',
    url: '/tasks',
    tag: 'task-completed',
  },

  // 2. Shopping & Smart Restock
  runningLowForecast: {
    key: 'runningLowForecast',
    group: 'shopping',
    groupLabel: 'Shopping & Smart Restock',
    title: 'Restock Alert: Running Low',
    body: 'Based on your household cycle, Laundry Detergent has ~4 days left. Added to your suggested restock!',
    url: '/inventory',
    tag: 'restock-low',
  },
  outOfStock: {
    key: 'outOfStock',
    group: 'shopping',
    groupLabel: 'Shopping & Smart Restock',
    title: 'Out of Stock: Dishwasher Tablets',
    body: 'You are likely out of Dishwasher Tablets today. Need to grab some on the next run?',
    url: '/inventory',
    tag: 'restock-out',
  },
  liveCartUpdate: {
    key: 'liveCartUpdate',
    group: 'shopping',
    groupLabel: 'Shopping & Smart Restock',
    title: 'Shopping List Updated',
    body: 'Minh added 2 items to the list: "Eggs (10-pack)" and "Greek yogurt".',
    url: '/shopping',
    tag: 'shopping-update',
  },

  // 3. Finance & Spending
  upcomingBill: {
    key: 'upcomingBill',
    group: 'finance',
    groupLabel: 'Finance & Spending',
    title: 'Upcoming Bill: Electricity',
    body: 'Due tomorrow (Oct 23): Estimated ₫850,000 for Apartment 402.',
    url: '/our-wallet',
    tag: 'finance-bill',
  },
  budgetAlert: {
    key: 'budgetAlert',
    group: 'finance',
    groupLabel: 'Finance & Spending',
    title: 'Budget Alert',
    body: "You've reached 85% of this month's dining limit (₫4,250,000 / ₫5,000,000). 9 days remaining.",
    url: '/our-wallet',
    tag: 'finance-budget',
  },

  // 4. AI Assistant & Habit
  eveningAiScanNudge: {
    key: 'eveningAiScanNudge',
    group: 'ai',
    groupLabel: 'AI Assistant & Habit',
    title: 'Expense log reminder',
    body: 'Got any receipts or mobile banking screenshots today?',
    url: '/our-wallet',
    tag: 'ai-evening-nudge',
    hasTimeConfig: true,
    timeConfigKey: 'eveningAiScanTime',
  },
};

/**
 * Triggers a test notification for a specific case key.
 */
export async function triggerTestNotification(key: NotificationCaseKey): Promise<boolean> {
  const spec = NOTIFICATION_CASES[key];
  if (!spec) return false;
  return sendNotification({
    title: spec.title,
    body: spec.body,
    url: spec.url,
    tag: spec.tag,
  });
}
