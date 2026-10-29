import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationSettings,
  NOTIFICATION_CASES,
  saveNotificationSettings,
} from '../lib/notifications';

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

describe('notification settings and specs', () => {
  let mockStorage: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    mockStorage = createMockLocalStorage();
    vi.stubGlobal('localStorage', mockStorage);
    const mockNotification = class MockNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = vi.fn().mockResolvedValue('granted');
      onclick: (() => void) | null = null;
      constructor(public title: string, public options?: NotificationOptions) {}
    };
    vi.stubGlobal('Notification', mockNotification);
    vi.stubGlobal('window', {
      location: { href: 'http://localhost/' },
      Notification: mockNotification,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('defaults all notification toggles to false (OFF) and sets expected default times', () => {
    const s = DEFAULT_NOTIFICATION_SETTINGS;
    expect(s.enabled).toBe(false);

    // Group 1: Tasks
    expect(s.morningBriefing).toBe(false);
    expect(s.morningBriefingTime).toBe('08:30');
    expect(s.assignedByPartner).toBe(false);
    expect(s.periodicMaintenance).toBe(false);
    expect(s.taskCompletedByPartner).toBe(false);

    // Group 2: Shopping
    expect(s.runningLowForecast).toBe(false);
    expect(s.outOfStock).toBe(false);
    expect(s.liveCartUpdate).toBe(false);

    // Group 3: Finance
    expect(s.upcomingBill).toBe(false);
    expect(s.budgetAlert).toBe(false);

    // Group 4: AI
    expect(s.eveningAiScanNudge).toBe(false);
    expect(s.eveningAiScanTime).toBe('21:30');
  });

  it('persists customized notification settings in localStorage', () => {
    saveNotificationSettings({
      enabled: true,
      morningBriefing: true,
      morningBriefingTime: '08:45',
      budgetAlert: true,
    });

    const loaded = getNotificationSettings();
    expect(loaded.enabled).toBe(true);
    expect(loaded.morningBriefing).toBe(true);
    expect(loaded.morningBriefingTime).toBe('08:45');
    expect(loaded.budgetAlert).toBe(true);
    // untouched fields remain default false
    expect(loaded.outOfStock).toBe(false);
  });

  it('has exact titles, bodies, and target routes matching user specification', () => {
    // Case 1.1: Morning Briefing
    expect(NOTIFICATION_CASES.morningBriefing.title).toBe("Today's Household Plan");
    expect(NOTIFICATION_CASES.morningBriefing.url).toBe('/tasks');

    // Case 1.2: Assigned by partner
    expect(NOTIFICATION_CASES.assignedByPartner.title).toBe('New Task from {Partner}');
    expect(NOTIFICATION_CASES.assignedByPartner.url).toBe('/tasks');

    // Case 1.3: Periodic Maintenance
    expect(NOTIFICATION_CASES.periodicMaintenance.title).toBe('Maintenance Reminder: Air Conditioner');
    expect(NOTIFICATION_CASES.periodicMaintenance.url).toBe('/tasks');

    // Case 1.4: Task Completed by Partner
    expect(NOTIFICATION_CASES.taskCompletedByPartner.title).toBe('Task Completed');
    expect(NOTIFICATION_CASES.taskCompletedByPartner.url).toBe('/tasks');

    // Case 2.1: Running Low Forecast
    expect(NOTIFICATION_CASES.runningLowForecast.title).toBe('Restock Alert: Running Low');
    expect(NOTIFICATION_CASES.runningLowForecast.url).toBe('/inventory');

    // Case 2.2: Out of Stock
    expect(NOTIFICATION_CASES.outOfStock.title).toBe('Out of Stock: Dishwasher Tablets');
    expect(NOTIFICATION_CASES.outOfStock.url).toBe('/inventory');

    // Case 2.3: Live Cart Update
    expect(NOTIFICATION_CASES.liveCartUpdate.title).toBe('Shopping List Updated');
    expect(NOTIFICATION_CASES.liveCartUpdate.url).toBe('/shopping');

    // Case 3.1: Upcoming Bill
    expect(NOTIFICATION_CASES.upcomingBill.title).toBe('Upcoming Bill: Electricity');
    expect(NOTIFICATION_CASES.upcomingBill.url).toBe('/our-wallet');

    // Case 3.2: Budget Threshold Alert
    expect(NOTIFICATION_CASES.budgetAlert.title).toBe('Budget Alert');
    expect(NOTIFICATION_CASES.budgetAlert.url).toBe('/our-wallet');

    // Case 4.1: Expense log reminder
    expect(NOTIFICATION_CASES.eveningAiScanNudge.title).toBe('Expense log reminder');
    expect(NOTIFICATION_CASES.eveningAiScanNudge.body).toBe('Got any receipts or mobile banking screenshots today?');
    expect(NOTIFICATION_CASES.eveningAiScanNudge.url).toBe('/our-wallet');
  });

  describe('notification scheduler & deduplication', () => {
    it('records and checks notified tags correctly to prevent duplicate alerts', async () => {
      const { hasBeenNotified, markAsNotified } = await import('../lib/notificationScheduler');
      expect(hasBeenNotified('test-tag-1')).toBe(false);
      markAsNotified('test-tag-1');
      expect(hasBeenNotified('test-tag-1')).toBe(true);
      expect(hasBeenNotified('test-tag-2')).toBe(false);
    });

    it('evaluates task reminders, morning briefing, and evening expense reminder', async () => {
      const { checkScheduledNotifications, getLocalDateString } = await import('../lib/notificationScheduler');
      const { useStore } = await import('../store');

      saveNotificationSettings({
        enabled: true,
        morningBriefing: true,
        morningBriefingTime: '08:00',
        eveningAiScanNudge: true,
        eveningAiScanTime: '21:00',
        outOfStock: true,
      });

      const today = getLocalDateString(new Date(2026, 9, 29, 9, 15)); // 2026-10-29 09:15
      useStore.setState({
        tasks: [
          {
            id: 'task-remind-1',
            householdId: 'h1',
            title: 'Water the plants',
            assigneeId: null,
            dueDate: today,
            recurrence: null,
            estimatedDuration: null,
            reminder: '09:00',
            area: null,
            notes: '',
            completed: false,
            completedAt: null,
            nextOccurrenceId: null,
            seriesId: 'series-1',
            createdAt: '2026-10-29T00:00:00Z',
          },
        ],
        items: [
          {
            id: 'item-out-1',
            householdId: 'h1',
            name: 'Coffee Beans',
            category: 'Kitchen',
            quantity: 0,
            currentStock: 0,
            status: 'out',
            unit: 'bag',
            expectedUsageDays: null,
            notes: '',
          },
        ],
        transactions: [],
      });

      // Mock notifications module sendNotification
      const notifModule = await import('../lib/notifications');
      const sendSpy = vi.spyOn(notifModule, 'sendNotification').mockResolvedValue(true);

      // Run check at 09:15
      const mockNow = new Date(2026, 9, 29, 9, 15);
      await checkScheduledNotifications(mockNow);

      // Should have triggered task reminder, morning briefing (08:00 < 09:15), and out of stock
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Reminder: Water the plants',
          url: '/tasks',
        }),
      );
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Today's Household Plan",
          url: '/tasks',
        }),
      );
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Out of Stock: Coffee Beans',
          url: '/inventory',
        }),
      );

      // A second check at the same time shouldn't duplicate notifications
      sendSpy.mockClear();
      await checkScheduledNotifications(mockNow);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('triggers partner sync notifications when enabled', async () => {
      const {
        notifyPartnerAssignedTask,
        notifyPartnerCompletedTask,
        notifyPartnerUpdatedShopping,
      } = await import('../lib/notificationScheduler');
      const notifModule = await import('../lib/notifications');
      const sendSpy = vi.spyOn(notifModule, 'sendNotification').mockResolvedValue(true);

      saveNotificationSettings({
        enabled: true,
        assignedByPartner: true,
        taskCompletedByPartner: true,
        liveCartUpdate: true,
      });

      await notifyPartnerAssignedTask(
        {
          id: 'task-1',
          householdId: 'h1',
          title: 'Buy groceries',
          assigneeId: null,
          dueDate: '2026-10-29',
          recurrence: null,
          estimatedDuration: null,
          reminder: null,
          area: null,
          notes: '',
          completed: false,
          completedAt: null,
          nextOccurrenceId: null,
          seriesId: 'series-1',
          createdAt: '2026-10-29T00:00:00Z',
        },
        'Minh',
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Task from Minh',
          body: 'Minh assigned: "Buy groceries".',
          url: '/tasks',
        }),
      );

      await notifyPartnerCompletedTask(
        {
          id: 'task-1',
          householdId: 'h1',
          title: 'Buy groceries',
          assigneeId: null,
          dueDate: '2026-10-29',
          recurrence: null,
          estimatedDuration: null,
          reminder: null,
          area: null,
          notes: '',
          completed: true,
          completedAt: '2026-10-29T10:00:00Z',
          nextOccurrenceId: null,
          seriesId: 'series-1',
          createdAt: '2026-10-29T00:00:00Z',
        },
        'Minh',
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Task Completed',
          body: 'Minh just finished: "Buy groceries".',
          url: '/tasks',
        }),
      );

      await notifyPartnerUpdatedShopping(
        [
          {
            id: 's1',
            householdId: 'h1',
            itemId: 'i1',
            name: 'Eggs',
            category: 'Groceries',
            quantity: 1,
            unit: 'pack',
            estimatedPrice: null,
            store: '',
            note: '',
            completed: false,
            createdAt: '2026-10-29',
          },
          {
            id: 's2',
            householdId: 'h1',
            itemId: 'i2',
            name: 'Milk',
            category: 'Groceries',
            quantity: 1,
            unit: 'carton',
            estimatedPrice: null,
            store: '',
            note: '',
            completed: false,
            createdAt: '2026-10-29',
          },
        ],
        'Minh',
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Shopping List Updated',
          body: 'Minh added Eggs and Milk to the shopping list.',
          url: '/shopping',
        }),
      );
    });

    it('starts and stops scheduler cleanly without errors', async () => {
      const { startNotificationScheduler, stopNotificationScheduler } = await import(
        '../lib/notificationScheduler'
      );
      const stop = startNotificationScheduler();
      expect(typeof stop).toBe('function');
      stop();
      stopNotificationScheduler();
    });
  });
});

