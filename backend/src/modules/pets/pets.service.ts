// Mongoose 9 renamed FilterQuery to QueryFilter. Aliased here so the rest of the file reads
// conventionally and a future rename is a one-line change.
import type { QueryFilter, SortOrder } from 'mongoose';

type FilterQuery<T> = QueryFilter<T>;
import { Pet, type IPet } from '../../models/Pet.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildMeta } from '../../utils/ApiResponse.js';
import type { PetFacetsQuery, PetListQuery } from './pets.validators.js';

export interface PetListItem {
  id: string;
  slug: string;
  name: string;
  species: IPet['species'];
  breed: string;
  age: IPet['age'];
  ageInMonths: number;
  gender: IPet['gender'];
  size: IPet['size'];
  adoptionFee: number;
  status: IPet['status'];
  image: string;
  images: { url: string; isPrimary: boolean }[];
  location: { city: string; state: string };
  health: IPet['health'];
  goodWith: IPet['goodWith'];
  temperament: string[];
  favoritesCount: number;
  featured: boolean;
  createdAt: string;
  shelter?: { id: string; name: string; slug: string };
}

interface PopulatedShelter {
  _id: unknown;
  name?: string;
  slug?: string;
  description?: string;
  email?: string;
  phone?: string;
  website?: string;
  logo?: { url: string; publicId: string };
  address?: { city?: string; state?: string; country?: string; street?: string };
  rating?: { average: number; count: number };
  stats?: { availablePets: number; adoptedPets: number; totalPets: number };
}

/** Everything the detail page needs. Superset of PetListItem — the list DTO stays lean on purpose. */
export interface PetDetail extends PetListItem {
  description: string;
  weight?: IPet['weight'];
  color?: string;
  activityLevel: IPet['activityLevel'];
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

/**
 * The single mapper from a Mongoose document to what the client sees.
 *
 * Everything crosses this boundary — ObjectIds become strings and Dates become ISO strings, so the
 * frontend never receives something it cannot serialise into a Server Component payload.
 */
export function toPetListItem(pet: IPet & { shelter?: unknown }): PetListItem {
  const primary = pet.images.find((image) => image.isPrimary) ?? pet.images[0];
  const shelter = pet.shelter as PopulatedShelter | undefined;

  return {
    id: String(pet._id),
    slug: pet.slug,
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    age: pet.age,
    ageInMonths: pet.ageInMonths,
    gender: pet.gender,
    size: pet.size,
    adoptionFee: pet.adoptionFee,
    status: pet.status,
    image: primary?.url ?? '',
    images: pet.images.map((i) => ({ url: i.url, isPrimary: i.isPrimary })),
    location: { city: pet.location.city, state: pet.location.state },
    health: pet.health,
    goodWith: pet.goodWith,
    temperament: pet.temperament,
    favoritesCount: pet.favoritesCount,
    featured: pet.featured,
    createdAt: pet.createdAt.toISOString(),
    ...(shelter && shelter.name
      ? { shelter: { id: String(shelter._id), name: shelter.name, slug: shelter.slug ?? '' } }
      : {}),
  };
}

/** Builds the detail DTO, including the fully-populated shelter card. */
export function toPetDetail(pet: IPet & { shelter?: unknown }): PetDetail {
  const shelter = pet.shelter as PopulatedShelter | undefined;

  return {
    ...toPetListItem(pet),
    description: pet.description,
    ...(pet.weight?.value ? { weight: pet.weight } : {}),
    ...(pet.color ? { color: pet.color } : {}),
    activityLevel: pet.activityLevel,
    microchipped: pet.health.microchipped,
    views: pet.views,
    applicationsCount: pet.applicationsCount,
    ...(pet.intakeDate ? { intakeDate: pet.intakeDate.toISOString() } : {}),
    images: pet.images.map((image) => ({
      url: image.url,
      isPrimary: image.isPrimary,
      ...(image.width ? { width: image.width } : {}),
      ...(image.height ? { height: image.height } : {}),
    })),
    ...(shelter?.name
      ? {
          shelterDetail: {
            id: String(shelter._id),
            name: shelter.name,
            slug: shelter.slug ?? '',
            description: shelter.description ?? '',
            ...(shelter.email ? { email: shelter.email } : {}),
            ...(shelter.phone ? { phone: shelter.phone } : {}),
            ...(shelter.website ? { website: shelter.website } : {}),
            ...(shelter.logo?.url ? { logo: shelter.logo } : {}),
            city: shelter.address?.city ?? '',
            state: shelter.address?.state ?? '',
            rating: shelter.rating ?? { average: 0, count: 0 },
            availablePets: shelter.stats?.availablePets ?? 0,
            adoptedPets: shelter.stats?.adoptedPets ?? 0,
          },
        }
      : {}),
  };
}

/**
 * Translates validated query params into a Mongo filter.
 *
 * Kept separate from the query execution so the listing and the facet counts apply *identical*
 * criteria — if these drifted, the sidebar would promise counts that the results contradict.
 */
function buildFilter(query: Partial<PetListQuery>): FilterQuery<IPet> {
  const filter: FilterQuery<IPet> = { deletedAt: null };

  if (query.status) filter.status = query.status;
  if (query.species) filter.species = { $in: query.species };
  if (query.gender) filter.gender = { $in: query.gender };
  if (query.size) filter.size = { $in: query.size };
  if (query.activityLevel) filter.activityLevel = { $in: query.activityLevel };

  // Anchored, case-insensitive prefix match — an unanchored regex cannot use an index at all.
  if (query.breed) filter.breed = { $regex: `^${escapeRegex(query.breed)}`, $options: 'i' };
  if (query.city) filter['location.city'] = { $regex: `^${escapeRegex(query.city)}$`, $options: 'i' };
  if (query.state) filter['location.state'] = { $regex: `^${escapeRegex(query.state)}$`, $options: 'i' };

  if (query.minAge !== undefined || query.maxAge !== undefined) {
    filter.ageInMonths = {};
    if (query.minAge !== undefined) filter.ageInMonths.$gte = query.minAge;
    if (query.maxAge !== undefined) filter.ageInMonths.$lte = query.maxAge;
  }

  if (query.minFee !== undefined || query.maxFee !== undefined) {
    filter.adoptionFee = {};
    if (query.minFee !== undefined) filter.adoptionFee.$gte = query.minFee;
    if (query.maxFee !== undefined) filter.adoptionFee.$lte = query.maxFee;
  }

  // "Good with kids" means explicitly yes. `unknown` is not a promise we should make on a
  // shelter's behalf, so it is excluded rather than treated as a maybe.
  if (query.goodWithKids) filter['goodWith.kids'] = 'yes';
  if (query.goodWithDogs) filter['goodWith.dogs'] = 'yes';
  if (query.goodWithCats) filter['goodWith.cats'] = 'yes';

  if (query.vaccinated !== undefined) filter['health.vaccinated'] = query.vaccinated;
  if (query.neutered !== undefined) filter['health.neutered'] = query.neutered;
  if (query.specialNeeds !== undefined) filter['health.specialNeeds'] = query.specialNeeds;

  if (query.q) filter.$text = { $search: query.q };

  return filter;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type SortSpec = Record<string, SortOrder | { $meta: string }>;

function buildSort(sort: PetListQuery['sort'], hasSearch: boolean): SortSpec {
  let spec: SortSpec;

  switch (sort) {
    case 'oldest':
      spec = { createdAt: 1 };
      break;
    case 'name':
      spec = { name: 1 };
      break;
    case 'fee_asc':
      spec = { adoptionFee: 1, createdAt: -1 };
      break;
    case 'fee_desc':
      spec = { adoptionFee: -1, createdAt: -1 };
      break;
    case 'popular':
      spec = { favoritesCount: -1, views: -1, createdAt: -1 };
      break;
    case 'relevance':
      // textScore is only available when a $text stage is present; fall back if not.
      spec = hasSearch ? { score: { $meta: 'textScore' }, createdAt: -1 } : { createdAt: -1 };
      break;
    case 'newest':
    default:
      // Featured first is a product decision, not a sort option — it applies to the default order.
      spec = { featured: -1, createdAt: -1 };
  }

  /**
   * Always break ties on _id.
   *
   * Without this the order of equal-keyed documents is undefined, and skip/limit pagination
   * silently corrupts: sorting 500 seeded pets by name across 6 pages returned 144 rows of which
   * only 135 were unique — 9 pets appeared twice and 9 others were unreachable entirely. Sorts
   * with many ties (name, fee) hit this hardest, but any non-unique key can.
   */
  return { ...spec, _id: -1 };
}

export async function listPets(query: PetListQuery) {
  const filter = buildFilter(query);
  const hasSearch = Boolean(query.q);
  const skip = (query.page - 1) * query.limit;

  const projection = hasSearch ? { score: { $meta: 'textScore' } } : {};

  const [pets, total] = await Promise.all([
    Pet.find(filter, projection)
      .sort(buildSort(query.sort, hasSearch))
      .skip(skip)
      .limit(query.limit)
      .populate('shelter', 'name slug')
      .lean<IPet[]>(),
    Pet.countDocuments(filter),
  ]);

  return {
    items: pets.map(toPetListItem),
    meta: buildMeta(total, query.page, query.limit),
  };
}

/**
 * Sidebar counts.
 *
 * One aggregation with $facet rather than a dozen countDocuments calls — the collection is scanned
 * once and every breakdown is computed from that single pass.
 */
export async function getFacets(query: PetFacetsQuery) {
  const filter = buildFilter(query);

  const [result] = await Pet.aggregate([
    { $match: filter },
    {
      $facet: {
        species: [{ $group: { _id: '$species', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        size: [{ $group: { _id: '$size', count: { $sum: 1 } } }],
        gender: [{ $group: { _id: '$gender', count: { $sum: 1 } } }],
        activityLevel: [{ $group: { _id: '$activityLevel', count: { $sum: 1 } } }],
        city: [
          { $group: { _id: '$location.city', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ],
        breed: [
          { $group: { _id: '$breed', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 30 },
        ],
        health: [
          {
            $group: {
              _id: null,
              vaccinated: { $sum: { $cond: ['$health.vaccinated', 1, 0] } },
              neutered: { $sum: { $cond: ['$health.neutered', 1, 0] } },
              specialNeeds: { $sum: { $cond: ['$health.specialNeeds', 1, 0] } },
            },
          },
        ],
        goodWith: [
          {
            $group: {
              _id: null,
              kids: { $sum: { $cond: [{ $eq: ['$goodWith.kids', 'yes'] }, 1, 0] } },
              dogs: { $sum: { $cond: [{ $eq: ['$goodWith.dogs', 'yes'] }, 1, 0] } },
              cats: { $sum: { $cond: [{ $eq: ['$goodWith.cats', 'yes'] }, 1, 0] } },
            },
          },
        ],
        fee: [{ $group: { _id: null, min: { $min: '$adoptionFee' }, max: { $max: '$adoptionFee' } } }],
        total: [{ $count: 'value' }],
      },
    },
  ]);

  const bucket = (rows: { _id: string; count: number }[] = []) =>
    rows.filter((r) => r._id).map((r) => ({ value: r._id, count: r.count }));

  return {
    species: bucket(result?.species),
    size: bucket(result?.size),
    gender: bucket(result?.gender),
    activityLevel: bucket(result?.activityLevel),
    city: bucket(result?.city),
    breed: bucket(result?.breed),
    health: result?.health?.[0] ?? { vaccinated: 0, neutered: 0, specialNeeds: 0 },
    goodWith: result?.goodWith?.[0] ?? { kids: 0, dogs: 0, cats: 0 },
    fee: result?.fee?.[0] ?? { min: 0, max: 0 },
    total: result?.total?.[0]?.value ?? 0,
  };
}

export async function getFeaturedPets(limit = 8) {
  const pets = await Pet.find({ status: 'available', deletedAt: null, featured: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('shelter', 'name slug')
    .lean<IPet[]>();

  return pets.map(toPetListItem);
}

export async function getPetBySlug(slug: string) {
  const pet = await Pet.findOne({ slug, deletedAt: null })
    .populate('shelter', 'name slug address rating stats logo description email phone website')
    .lean<IPet>();

  if (!pet) throw ApiError.notFound('Pet');
  return pet;
}

/**
 * Same species and city where possible, never the pet you are already looking at.
 *
 * Accepts a slug as well as an id so the detail page can request this in parallel with the pet
 * itself, rather than waiting for the first response just to learn the id.
 */
export async function getSimilarPets(idOrSlug: string, limit = 8) {
  const isObjectId = /^[a-f\d]{24}$/i.test(idOrSlug);
  const pet = await Pet.findOne(
    isObjectId ? { _id: idOrSlug } : { slug: idOrSlug },
  ).lean<IPet>();
  if (!pet) throw ApiError.notFound('Pet');

  const pets = await Pet.find({
    _id: { $ne: pet._id },
    species: pet.species,
    status: 'available',
    deletedAt: null,
    $or: [{ 'location.city': pet.location.city }, { size: pet.size }],
  })
    .sort({ featured: -1, createdAt: -1 })
    .limit(limit)
    .populate('shelter', 'name slug')
    .lean<IPet[]>();

  return pets.map(toPetListItem);
}

/**
 * View counting is fire-and-forget: an analytics increment must never delay or fail the response
 * the visitor is waiting for.
 */
export function incrementViews(petId: string): void {
  void Pet.updateOne({ _id: petId }, { $inc: { views: 1 } }).catch(() => {
    // Deliberately swallowed — a lost view count is not worth surfacing to the user.
  });
}
