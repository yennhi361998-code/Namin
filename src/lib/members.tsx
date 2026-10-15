import {
  Baby,
  Bike,
  BookOpen,
  Camera,
  Car,
  Cat,
  Coffee,
  Crown,
  Dog,
  Flower2,
  Gamepad2,
  Glasses,
  Headphones,
  Heart,
  Laugh,
  Moon,
  Music,
  Palette,
  Smile,
  Sparkles,
  Star,
  Sun,
  User,
  Users,
  Zap,
} from 'lucide-react';

export interface AvatarOption {
  id: string;
  label: string;
  value: string | null;
}

export const MEMBER_AVATARS: AvatarOption[] = [
  { id: 'initial', label: 'Initials', value: null },
  { id: 'user', label: 'Personal', value: 'user' },
  { id: 'users', label: 'Family', value: 'users' },
  { id: 'baby', label: 'Baby', value: 'baby' },
  { id: 'smile', label: 'Smile', value: 'smile' },
  { id: 'laugh', label: 'Laugh', value: 'laugh' },
  { id: 'crown', label: 'Crown', value: 'crown' },
  { id: 'glasses', label: 'Glasses', value: 'glasses' },
  { id: 'dog', label: 'Dog', value: 'dog' },
  { id: 'cat', label: 'Cat', value: 'cat' },
  { id: 'heart', label: 'Heart', value: 'heart' },
  { id: 'star', label: 'Star', value: 'star' },
  { id: 'sparkles', label: 'Sparkles', value: 'sparkles' },
  { id: 'sun', label: 'Sun', value: 'sun' },
  { id: 'moon', label: 'Moon', value: 'moon' },
  { id: 'coffee', label: 'Coffee', value: 'coffee' },
  { id: 'music', label: 'Music', value: 'music' },
  { id: 'headphones', label: 'Headphones', value: 'headphones' },
  { id: 'gamepad', label: 'Gaming', value: 'gamepad' },
  { id: 'camera', label: 'Camera', value: 'camera' },
  { id: 'palette', label: 'Art', value: 'palette' },
  { id: 'flower', label: 'Flower', value: 'flower' },
  { id: 'zap', label: 'Energy', value: 'zap' },
  { id: 'bike', label: 'Bicycle', value: 'bike' },
  { id: 'car', label: 'Car', value: 'car' },
  { id: 'book', label: 'Book', value: 'book' },
];

export function MemberAvatarIcon({ id, size = 20, className }: { id: string; size?: number; className?: string }) {
  // Normalize legacy keys
  let key = id;
  if (key === '👨' || key === 'man') key = 'user';
  else if (key === '👩' || key === 'woman') key = 'user';
  else if (key === '👦' || key === 'boy') key = 'user';
  else if (key === '👧' || key === '🧒' || key === 'girl') key = 'user';
  else if (key === '👴' || key === 'grandpa') key = 'glasses';
  else if (key === '👵' || key === 'grandma') key = 'glasses';
  else if (key === '👶') key = 'baby';
  else if (key === '🐶') key = 'dog';
  else if (key === '🐱') key = 'cat';

  switch (key) {
    case 'user':
      return <User size={size} strokeWidth={2} className={className} />;
    case 'users':
      return <Users size={size} strokeWidth={2} className={className} />;
    case 'baby':
      return <Baby size={size} strokeWidth={2} className={className} />;
    case 'smile':
      return <Smile size={size} strokeWidth={2} className={className} />;
    case 'laugh':
      return <Laugh size={size} strokeWidth={2} className={className} />;
    case 'crown':
      return <Crown size={size} strokeWidth={2} className={className} />;
    case 'glasses':
      return <Glasses size={size} strokeWidth={2} className={className} />;
    case 'dog':
      return <Dog size={size} strokeWidth={2} className={className} />;
    case 'cat':
      return <Cat size={size} strokeWidth={2} className={className} />;
    case 'heart':
      return <Heart size={size} strokeWidth={2} className={className} />;
    case 'star':
      return <Star size={size} strokeWidth={2} className={className} />;
    case 'sparkles':
      return <Sparkles size={size} strokeWidth={2} className={className} />;
    case 'sun':
      return <Sun size={size} strokeWidth={2} className={className} />;
    case 'moon':
      return <Moon size={size} strokeWidth={2} className={className} />;
    case 'coffee':
      return <Coffee size={size} strokeWidth={2} className={className} />;
    case 'music':
      return <Music size={size} strokeWidth={2} className={className} />;
    case 'headphones':
      return <Headphones size={size} strokeWidth={2} className={className} />;
    case 'gamepad':
      return <Gamepad2 size={size} strokeWidth={2} className={className} />;
    case 'camera':
      return <Camera size={size} strokeWidth={2} className={className} />;
    case 'palette':
      return <Palette size={size} strokeWidth={2} className={className} />;
    case 'flower':
      return <Flower2 size={size} strokeWidth={2} className={className} />;
    case 'zap':
      return <Zap size={size} strokeWidth={2} className={className} />;
    case 'bike':
      return <Bike size={size} strokeWidth={2} className={className} />;
    case 'car':
      return <Car size={size} strokeWidth={2} className={className} />;
    case 'book':
      return <BookOpen size={size} strokeWidth={2} className={className} />;
    default:
      return null;
  }
}
