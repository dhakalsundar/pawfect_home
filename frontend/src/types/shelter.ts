export interface PublicShelter {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo?: string;
  coverImage?: string;
  city: string;
  state: string;
  country: string;
  email?: string;
  phone?: string;
  website?: string;
  rating: { average: number; count: number };
  stats: { availablePets: number; adoptedPets: number };
  verifiedAt?: string;
  createdAt: string;
}
