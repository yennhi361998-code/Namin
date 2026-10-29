import {
  getNotificationPermission,
  getNotificationSettings,
  sendNotification,
} from "./notifications";
import { useStore } from "../store";
import type { Task, ShoppingItem } from "./types";

export const NOTIFIED_TAGS_STORAGE_KEY = "namin:notified_tags";

export function getLocalDateString(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalTimeString(d = new Date()): string {
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function hasBeenNotified(tag: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(NOTIFIED_TAGS_STORAGE_KEY);
    if (!raw) return false;
    const tags = JSON.parse(raw) as Record<string, number>;
    return Boolean(tags[tag]);
  } catch {
    return false;
  }
}

export function markAsNotified(tag: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(NOTIFIED_TAGS_STORAGE_KEY);
    const tags: Record<string, number> = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    tags[tag] = now;

    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    for (const k of Object.keys(tags)) {
      if (tags[k] < cutoff) {
        delete tags[k];
      }
    }
    localStorage.setItem(NOTIFIED_TAGS_STORAGE_KEY, JSON.stringify(tags));
  } catch (err) {
    console.warn("[NotificationScheduler] Failed to save notified tag:", err);
  }
}

export async function checkScheduledNotifications(now = new Date()): Promise<void> {
  const settings = getNotificationSettings();
  if (!settings.enabled) return;
  if (getNotificationPermission() !== "granted") return;

  const today = getLocalDateString(now);
  const currentTime = getLocalTimeString(now);

  const state = useStore.getState();
  const tasks = state.tasks || [];
  const items = state.items || [];
  const transactions = state.transactions || [];

  // 1. Task Reminders: tasks with reminder set for today
  for (const task of tasks) {
    if (task.completed || !task.reminder) continue;
    if (task.dueDate === today) {
      if (currentTime >= task.reminder) {
        const tag = `task-reminder-${task.id}-${today}-${task.reminder}`;
        if (!hasBeenNotified(tag)) {
          markAsNotified(tag);
          await sendNotification({
            title: `Reminder: ${task.title}`,
            body: `Due today at ${task.reminder}`,
            url: "/tasks",
            tag,
          });
        }
      }
    }
  }

  // 2. Morning Briefing: daily plan
  if (settings.morningBriefing && settings.morningBriefingTime) {
    if (currentTime >= settings.morningBriefingTime) {
      const tag = `morning-briefing-${today}`;
      if (!hasBeenNotified(tag)) {
        const dueTodayCount = tasks.filter(
          (t) => !t.completed && t.dueDate <= today,
        ).length;

        const body =
          dueTodayCount > 0
            ? `Good morning! You have ${dueTodayCount} ${
                dueTodayCount === 1 ? "chore" : "chores"
              } scheduled for today.`
            : "Good morning! All household chores are up to date today.";

        markAsNotified(tag);
        await sendNotification({
          title: "Today's Household Plan",
          body,
          url: "/tasks",
          tag,
        });
      }
    }
  }

  // 3. Evening Expense Log Reminder
  if (settings.eveningAiScanNudge && settings.eveningAiScanTime) {
    if (currentTime >= settings.eveningAiScanTime) {
      const tag = `evening-ai-nudge-${today}`;
      if (!hasBeenNotified(tag)) {
        const hasExpenseToday = transactions.some(
          (t) => t.date === today && t.type === "expense",
        );
        if (!hasExpenseToday) {
          markAsNotified(tag);
          await sendNotification({
            title: "Expense log reminder",
            body: "Got any receipts or mobile banking screenshots today?",
            url: "/our-wallet",
            tag,
          });
        }
      }
    }
  }

  // 4. Periodic Maintenance
  if (settings.periodicMaintenance) {
    for (const task of tasks) {
      if (task.completed) continue;
      const lowerTitle = task.title.toLowerCase();
      const isMaintenance =
        task.area?.toLowerCase().includes("maint") ||
        lowerTitle.includes("filter") ||
        lowerTitle.includes("bảo dưỡng") ||
        lowerTitle.includes("clean") ||
        lowerTitle.includes("vệ sinh") ||
        lowerTitle.includes("air conditioner");

      if (isMaintenance && task.dueDate <= today) {
        const tag = `maintenance-${task.id}-${today}`;
        if (!hasBeenNotified(tag)) {
          markAsNotified(tag);
          await sendNotification({
            title: `Maintenance Reminder: ${task.title}`,
            body: "A scheduled household maintenance task is due today.",
            url: "/tasks",
            tag,
          });
        }
      }
    }
  }

  // 5. Out of Stock Alert
  if (settings.outOfStock) {
    for (const item of items) {
      if (item.status === "out" || (item.currentStock !== null && item.currentStock <= 0)) {
        const tag = `out-of-stock-${item.id}-${today}`;
        if (!hasBeenNotified(tag)) {
          markAsNotified(tag);
          await sendNotification({
            title: `Out of Stock: ${item.name}`,
            body: `You are out of ${item.name}. Added to your suggested restock!`,
            url: "/inventory",
            tag,
          });
        }
      }
    }
  }

  // 6. Running Low Forecast
  if (settings.runningLowForecast) {
    for (const item of items) {
      if (item.status === "running_low") {
        const tag = `running-low-${item.id}-${today}`;
        if (!hasBeenNotified(tag)) {
          markAsNotified(tag);
          await sendNotification({
            title: "Restock Alert: Running Low",
            body: `${item.name} is running low.`,
            url: "/inventory",
            tag,
          });
        }
      }
    }
  }
}

export async function notifyPartnerAssignedTask(task: Task, partnerName = "Your partner"): Promise<void> {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.assignedByPartner) return;
  if (getNotificationPermission() !== "granted") return;

  await sendNotification({
    title: `New Task from ${partnerName}`,
    body: `${partnerName} assigned: "${task.title}".`,
    url: "/tasks",
    tag: `partner-assigned-${task.id}`,
  });
}

export async function notifyPartnerCompletedTask(task: Task, partnerName = "Your partner"): Promise<void> {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.taskCompletedByPartner) return;
  if (getNotificationPermission() !== "granted") return;

  await sendNotification({
    title: "Task Completed",
    body: `${partnerName} just finished: "${task.title}".`,
    url: "/tasks",
    tag: `partner-completed-${task.id}`,
  });
}

export async function notifyPartnerUpdatedShopping(newItems: ShoppingItem[], partnerName = "Your partner"): Promise<void> {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.liveCartUpdate) return;
  if (getNotificationPermission() !== "granted") return;
  if (newItems.length === 0) return;

  const names = newItems.map((i) => i.name).slice(0, 2).join(" and ");
  const more = newItems.length > 2 ? ` (+ ${newItems.length - 2} more)` : "";

  await sendNotification({
    title: "Shopping List Updated",
    body: `${partnerName} added ${names}${more} to the shopping list.`,
    url: "/shopping",
    tag: `shopping-update-${Date.now()}`,
  });
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let visibilityListener: (() => void) | null = null;

export function startNotificationScheduler(): () => void {
  if (typeof window === "undefined") return () => {};

  stopNotificationScheduler();

  checkScheduledNotifications().catch((err) => {
    console.warn("[NotificationScheduler] Check failed:", err);
  });

  if (typeof document !== "undefined") {
    visibilityListener = () => {
      if (document.visibilityState === "visible") {
        checkScheduledNotifications().catch((err) => {
          console.warn("[NotificationScheduler] Visibility check failed:", err);
        });
      }
    };
    document.addEventListener("visibilitychange", visibilityListener);
  }

  schedulerTimer = setInterval(() => {
    checkScheduledNotifications().catch((err) => {
      console.warn("[NotificationScheduler] Periodic check failed:", err);
    });
  }, 30000);

  return stopNotificationScheduler;
}

export function stopNotificationScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (visibilityListener && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", visibilityListener);
    visibilityListener = null;
  }
}
