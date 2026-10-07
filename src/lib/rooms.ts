import type { IconName } from '../components/icons';
/**
 * Rooms a task can belong to. Each has a pastel tint (from the Stitch category palette)
 * for the icon tile and a deeper shade of the same hue for the icon, so it reads at a glance.
 */
export const ROOMS: { name: string; icon: IconName; bg: string; fg: string }[] = [
  { name: 'Kitchen', icon: 'kitchen', bg: '#FBF0DC', fg: '#8A6420' },
  { name: 'Living', icon: 'chair', bg: '#E3F2FA', fg: '#2F7FA6' },
  { name: 'Bathroom', icon: 'bathtub', bg: '#E9EEF8', fg: '#4A5F96' },
  { name: 'Bedroom', icon: 'bed', bg: '#F2EBF8', fg: '#6F4E92' },
  { name: 'Laundry', icon: 'local_laundry_service', bg: '#ECF1F3', fg: '#55666E' },
  { name: 'Outdoor', icon: 'yard', bg: '#E3F3EE', fg: '#2F7562' },
];

const FALLBACK: { icon: IconName; bg: string; fg: string } = { icon: 'home', bg: '#E8F5FA', fg: '#5FA8CC' };

export function roomStyle(name: string) {
  return ROOMS.find((r) => r.name === name) ?? FALLBACK;
}

export function roomIcon(name: string): IconName {
  return roomStyle(name).icon;
}
