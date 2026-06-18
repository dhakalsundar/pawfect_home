import type { QueryFilter } from 'mongoose';
import { Pet, type IPet } from '../../models/Pet.js';
import { Shelter } from '../../models/Shelter.js';
import { AdoptionApplication } from '../../models/AdoptionApplication.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildMeta } from '../../utils/ApiResponse.js';
import { toPetListItem } from '../pets/pets.service.js';
import type { AuthenticatedUser } from '../../types/express.js';
import type { ShelterPetsQuery } from '../pets/pets.validators.js';

/** The shelter this request acts on: the user's own, or an explicit one for admins. */
export async function resolveShelterId(user: AuthenticatedUser, explicitId?: string): Promise<string> {
  if (user.role === 'admin' && explicitId) return explicitId;
  if (!user.shelterId) throw ApiError.forbidden('Your account is not linked to a shelter.');
  return user.shelterId;
}

/**
 * A shelter's own pets, including pending and archived ones.
 *
 * Deliberately separate from the public listing, which only ever shows approved, available
 * animals. Mixing the two would mean one endpoint whose visibility rules depend on who is asking.
 */
export async function listShelterPets(shelterId: string, query: ShelterPetsQuery) {
  const filter: QueryFilter<IPet> = { shelter: shelterId, deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.q) {
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { breed: { $regex: escaped, $options: 'i' } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [pets, total] = await Promise.all([
    // _id tiebreaker, same reason as the public listing: tied createdAt values would make
    // pagination drop and duplicate rows.
    Pet.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(query.limit).lean<IPet[]>(),
    Pet.countDocuments(filter),
  ]);

  return { items: pets.map(toPetListItem), meta: buildMeta(total, query.page, query.limit) };
}

export interface ShelterAnalytics {
  pets: { total: number; available: number; pending: number; reserved: number; adopted: number };
  applications: {
    total: number;
    pending: number;
    underReview: number;
    approved: number;
    rejected: number;
    completed: number;
  };
  engagement: { views: number; favorites: number; conversionRate: number };
  averageDaysToAdopt: number | null;
  topPets: { id: string; name: string; slug: string; views: number; applications: number }[];
  applicationsByMonth: { month: string; count: number }[];
}

export async function getShelterAnalytics(shelterId: string): Promise<ShelterAnalytics> {
  const shelter = await Shelter.findById(shelterId).lean();
  if (!shelter) throw ApiError.notFound('Shelter');

  const [petStats, applicationStats, topPets, monthly, adoptedTimings] = await Promise.all([
    // One pass over the shelter's pets for every count and total.
    Pet.aggregate<{
      _id: null;
      total: number;
      available: number;
      pending: number;
      reserved: number;
      adopted: number;
      views: number;
      favorites: number;
    }>([
      { $match: { shelter: shelter._id, deletedAt: null } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          reserved: { $sum: { $cond: [{ $eq: ['$status', 'reserved'] }, 1, 0] } },
          adopted: { $sum: { $cond: [{ $eq: ['$status', 'adopted'] }, 1, 0] } },
          views: { $sum: '$views' },
          favorites: { $sum: '$favoritesCount' },
        },
      },
    ]),

    AdoptionApplication.aggregate<{ _id: string; count: number }>([
      { $match: { shelter: shelter._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    Pet.find({ shelter: shelter._id, deletedAt: null })
      .sort({ views: -1, _id: -1 })
      .limit(5)
      .select('name slug views applicationsCount')
      .lean(),

    AdoptionApplication.aggregate<{ _id: string; count: number }>([
      { $match: { shelter: shelter._id } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]),

    // Days between intake and adoption, for pets that actually got adopted.
    Pet.aggregate<{ _id: null; avgDays: number }>([
      { $match: { shelter: shelter._id, status: 'adopted', adoptedAt: { $ne: null }, intakeDate: { $ne: null } } },
      {
        $group: {
          _id: null,
          avgDays: { $avg: { $divide: [{ $subtract: ['$adoptedAt', '$intakeDate'] }, 86_400_000] } },
        },
      },
    ]),
  ]);

  const pets = petStats[0] ?? {
    total: 0, available: 0, pending: 0, reserved: 0, adopted: 0, views: 0, favorites: 0,
  };

  const byStatus = Object.fromEntries(applicationStats.map((row) => [row._id, row.count]));
  const totalApplications = applicationStats.reduce((sum, row) => sum + row.count, 0);

  return {
    pets: {
      total: pets.total,
      available: pets.available,
      pending: pets.pending,
      reserved: pets.reserved,
      adopted: pets.adopted,
    },
    applications: {
      total: totalApplications,
      pending: byStatus.pending ?? 0,
      underReview: byStatus.under_review ?? 0,
      approved: byStatus.approved ?? 0,
      rejected: byStatus.rejected ?? 0,
      completed: byStatus.completed ?? 0,
    },
    engagement: {
      views: pets.views,
      favorites: pets.favorites,
      // Applications per 100 views. Guarded against divide-by-zero on a brand new shelter.
      conversionRate: pets.views > 0 ? Number(((totalApplications / pets.views) * 100).toFixed(1)) : 0,
    },
    averageDaysToAdopt: adoptedTimings[0]?.avgDays ? Math.round(adoptedTimings[0].avgDays) : null,
    topPets: topPets.map((pet) => ({
      id: String(pet._id),
      name: pet.name,
      slug: pet.slug,
      views: pet.views,
      applications: pet.applicationsCount,
    })),
    applicationsByMonth: monthly.map((row) => ({ month: row._id, count: row.count })),
  };
}

// ---------------------------------------------------------------------------
// Public shelter profiles (Batch 15)
//
// Deferred since Batch 2 with a note saying they "arrive with Batch 9" — Batch 9 turned out to be
// the admin dashboard, so the pet page's "Listed by" card had been linking to a 404 ever since.
// ---------------------------------------------------------------------------

export interface PublicShelterDTO {
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

interface ShelterRow {
  _id: unknown;
  name: string;
  slug: string;
  description: string;
  logo?: { url?: string };
  coverImage?: { url?: string };
  address: { city: string; state: string; country: string };
  email?: string;
  phone?: string;
  website?: string;
  rating: { average: number; count: number };
  stats: { availablePets: number; adoptedPets: number };
  verifiedAt?: Date;
  createdAt: Date;
}

function toPublicShelterDTO(shelter: ShelterRow): PublicShelterDTO {
  return {
    id: String(shelter._id),
    name: shelter.name,
    slug: shelter.slug,
    description: shelter.description,
    ...(shelter.logo?.url ? { logo: shelter.logo.url } : {}),
    ...(shelter.coverImage?.url ? { coverImage: shelter.coverImage.url } : {}),
    city: shelter.address.city,
    state: shelter.address.state,
    country: shelter.address.country,
    // Contact details are public by design — these are organisations, not private individuals.
    ...(shelter.email ? { email: shelter.email } : {}),
    ...(shelter.phone ? { phone: shelter.phone } : {}),
    ...(shelter.website ? { website: shelter.website } : {}),
    rating: shelter.rating,
    stats: { availablePets: shelter.stats.availablePets, adoptedPets: shelter.stats.adoptedPets },
    ...(shelter.verifiedAt ? { verifiedAt: shelter.verifiedAt.toISOString() } : {}),
    createdAt: shelter.createdAt.toISOString(),
  };
}

const PUBLIC_FIELDS =
  'name slug description logo coverImage address email phone website rating stats verifiedAt createdAt';

export interface PublicShelterQuery {
  q?: string;
  city?: string;
  state?: string;
  sort?: 'rating' | 'pets' | 'name';
  page: number;
  limit: number;
}

/**
 * The public directory. Approved, non-deleted shelters only.
 *
 * `status: 'approved'` is a query condition rather than a post-filter, so a pending or suspended
 * shelter cannot leak through a code path that forgets to check.
 */
export async function listPublicShelters(query: PublicShelterQuery) {
  const filter: Record<string, unknown> = { status: 'approved', deletedAt: null };

  if (query.q) {
    // Escaped: an unescaped user string here is a regex-injection and a ReDoS vector.
    const safe = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { 'address.city': { $regex: safe, $options: 'i' } },
    ];
  }
  if (query.city) filter['address.city'] = query.city;
  if (query.state) filter['address.state'] = query.state;

  // Every sort ends with `_id` — see buildSort in pets.service.ts.
  const sorts: Record<string, Record<string, 1 | -1>> = {
    rating: { 'rating.average': -1, 'rating.count': -1, _id: -1 },
    pets: { 'stats.availablePets': -1, _id: -1 },
    name: { name: 1, _id: 1 },
  };
  const sort = sorts[query.sort ?? 'rating'] ?? sorts.rating!;

  const skip = (query.page - 1) * query.limit;

  const [shelters, total] = await Promise.all([
    Shelter.find(filter).select(PUBLIC_FIELDS).sort(sort).skip(skip).limit(query.limit).lean<ShelterRow[]>(),
    Shelter.countDocuments(filter),
  ]);

  return { items: shelters.map(toPublicShelterDTO), meta: buildMeta(total, query.page, query.limit) };
}

export async function getPublicShelter(slug: string): Promise<PublicShelterDTO> {
  const shelter = await Shelter.findOne({ slug, status: 'approved', deletedAt: null })
    .select(PUBLIC_FIELDS)
    .lean<ShelterRow>();

  if (!shelter) throw ApiError.notFound('Shelter');
  return toPublicShelterDTO(shelter);
}
