import type { LucideIcon } from 'lucide-react';
import {
  Bird,
  Cat,
  Dog,
  Heart,
  LayoutDashboard,
  PawPrint,
  Rabbit,
  Settings,
  User,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  description?: string;
}

/** Primary navigation, shown in the navbar and the mobile sheet. */
export const mainNav: NavItem[] = [
  { label: 'Browse Pets', href: '/pets', description: 'Find your new best friend' },
  { label: 'Shelters', href: '/shelters', description: 'Verified rescues near you' },
  { label: 'Donate', href: '/donate', description: 'Fund food, vets and shelter' },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: 'Adopt',
    items: [
      { label: 'Browse all pets', href: '/pets' },
      { label: 'Dogs', href: '/pets?species=dog' },
      { label: 'Cats', href: '/pets?species=cat' },
      { label: 'Birds', href: '/pets?species=bird' },
      { label: 'Rabbits', href: '/pets?species=rabbit' },
    ],
  },
  {
    title: 'Organisation',
    items: [
      { label: 'Shelters', href: '/shelters' },
      { label: 'Donate', href: '/donate' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Support',
    items: [
      { label: 'FAQ', href: '/faq' },
      { label: 'Adoption guide', href: '/faq#adoption' },
      { label: 'Register a shelter', href: '/shelters/apply' },
    ],
  },
  {
    title: 'Legal',
    items: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms of service', href: '/terms' },
      { label: 'Cookie policy', href: '/cookies' },
      { label: 'Accessibility', href: '/accessibility' },
    ],
  },
];

export interface CategoryItem {
  label: string;
  value: string;
  icon: LucideIcon;
}

/** Species categories — the home page grid and the listing filter share this list. */
export const petCategories: CategoryItem[] = [
  { label: 'Dogs', value: 'dog', icon: Dog },
  { label: 'Cats', value: 'cat', icon: Cat },
  { label: 'Birds', value: 'bird', icon: Bird },
  { label: 'Rabbits', value: 'rabbit', icon: Rabbit },
  { label: 'Others', value: 'other', icon: PawPrint },
];

export interface DashboardNavItem extends NavItem {
  icon: LucideIcon;
}

/** User dashboard sidebar. Shelter and admin equivalents arrive in Batches 8 and 9. */
export const userDashboardNav: DashboardNavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Favorites', href: '/dashboard/favorites', icon: Heart },
  { label: 'Applications', href: '/dashboard/applications', icon: PawPrint },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];
