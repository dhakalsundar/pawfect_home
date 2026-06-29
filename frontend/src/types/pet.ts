export type Species = 'dog' | 'cat' | 'bird' | 'rabbit' | 'other';
export type Gender = 'male' | 'female' | 'unknown';
export type PetSize = 'small' | 'medium' | 'large' | 'xlarge';
export type PetStatus = 'pending' | 'available' | 'reserved' | 'adopted' | 'archived';
export type Tristate = 'yes' | 'no' | 'unknown';
export type ActivityLevel = 'low' | 'moderate' | 'high';

/** Mirrors PetListItem in backend/src/modules/pets/pets.service.ts. */
export interface Pet {
  id: string;
  slug: string;
  name: string;
  species: Species;
  breed: string;
  age: { value: number; unit: 'weeks' | 'months' | 'years' };
  ageInMonths: number;
  gender: Gender;
  size: PetSize;
  adoptionFee: number;
  status: PetStatus;
  image: string;
  images: { url: string; isPrimary: boolean }[];
  location: { city: string; state: string };
  health: {
    vaccinated: boolean;
    neutered: boolean;
    microchipped: boolean;
    specialNeeds: boolean;
    medicalNotes?: string;
  };
  goodWith: { kids: Tristate; dogs: Tristate; cats: Tristate };
  temperament: string[];
  favoritesCount: number;
  featured: boolean;
  createdAt: string;
  shelter?: { id: string; name: string; slug: string };
}

/** Mirrors PetDetail in backend/src/modules/pets/pets.service.ts. */
export interface PetDetail extends Pet {
  description: string;
  weight?: { value: number; unit: 'kg' | 'lb' };
  color?: string;
  activityLevel: ActivityLevel;
  microchipped: boolean;
  views: number;
  applicationsCount: number;
  intakeDate?: string;
  images: { url: string; isPrimary: boolean; width?: number; height?: number }[];
  shelterDetail?: {
    id: string;
    name: string;
    slug: string;
    description: string;
    email?: string;
    phone?: string;
    website?: string;
    logo?: { url: string; publicId: string };
    city: string;
    state: string;
    rating: { average: number; count: number };
    availablePets: number;
    adoptedPets: number;
  };
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  low: 'Low energy',
  moderate: 'Moderate energy',
  high: 'High energy',
};

/** "yes" / "no" / "unknown" rendered as something a person would actually say. */
export function tristateLabel(value: Tristate, subject: string): string {
  if (value === 'yes') return `Good with ${subject}`;
  if (value === 'no') return `Not suited to ${subject}`;
  return `Unknown with ${subject}`;
}

export interface FacetBucket {
  value: string;
  count: number;
}

export interface PetFacets {
  species: FacetBucket[];
  size: FacetBucket[];
  gender: FacetBucket[];
  activityLevel: FacetBucket[];
  city: FacetBucket[];
  breed: FacetBucket[];
  health: { vaccinated: number; neutered: number; specialNeeds: number };
  goodWith: { kids: number; dogs: number; cats: number };
  fee: { min: number; max: number };
  total: number;
}

export type PetSort =
  | 'newest'
  | 'oldest'
  | 'name'
  | 'fee_asc'
  | 'fee_desc'
  | 'popular'
  | 'relevance';

export const SORT_OPTIONS: { value: PetSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Longest waiting' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'fee_asc', label: 'Fee: low to high' },
  { value: 'fee_desc', label: 'Fee: high to low' },
  { value: 'popular', label: 'Most popular' },
];

export const SPECIES_LABELS: Record<Species, string> = {
  dog: 'Dog',
  cat: 'Cat',
  bird: 'Bird',
  rabbit: 'Rabbit',
  other: 'Other',
};

export const SIZE_LABELS: Record<PetSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  xlarge: 'Extra large',
};

/** Turns { value: 8, unit: 'months' } into "8 months" / "1 year". */
export function formatAge(age: Pet['age']): string {
  const unit = age.value === 1 ? age.unit.replace(/s$/, '') : age.unit;
  return `${age.value} ${unit}`;
}

/** The filter state, shared by the URL, the server fetch and the filter UI. */
export interface PetQuery {
  q?: string;
  species?: string;
  gender?: string;
  size?: string;
  activityLevel?: string;
  breed?: string;
  city?: string;
  state?: string;
  minAge?: number;
  maxAge?: number;
  minFee?: number;
  maxFee?: number;
  goodWithKids?: boolean;
  goodWithDogs?: boolean;
  goodWithCats?: boolean;
  vaccinated?: boolean;
  neutered?: boolean;
  specialNeeds?: boolean;
  status?: string;
  sort?: string;
  page?: number;
  limit?: number;
}
