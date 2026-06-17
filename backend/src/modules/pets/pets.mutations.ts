import { Pet, type IPet, type PetStatus } from '../../models/Pet.js';
import { Shelter } from '../../models/Shelter.js';
import { AdoptionApplication } from '../../models/AdoptionApplication.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../config/logger.js';
import { destroyAssets, verifyAsset } from '../upload/upload.service.js';
import type { AuthenticatedUser } from '../../types/express.js';
import { toPetDetail } from './pets.service.js';
import type { CreatePetInput, UpdatePetInput } from './pets.validators.js';

const MONTHS_PER_UNIT = { weeks: 1 / 4.345, months: 1, years: 12 } as const;

function toAgeInMonths(age: { value: number; unit: 'weeks' | 'months' | 'years' }): number {
  return Math.round(age.value * MONTHS_PER_UNIT[age.unit]);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Scopes a write to what this user may touch.
 *
 * Returned as query conditions rather than a fetch-then-compare check. Beyond being one round trip
 * instead of two, it collapses "doesn't exist" and "isn't yours" into the same 404 — so a shelter
 * cannot probe ids to discover that another shelter's records exist.
 */
function ownershipScope(user: AuthenticatedUser) {
  if (user.role === 'admin') return {};
  // '__none__' can never match an ObjectId, so a shelter user without a shelterId matches nothing
  // rather than accidentally matching everything.
  return { shelter: user.shelterId ?? '__none__' };
}

async function requireShelter(user: AuthenticatedUser) {
  if (user.role === 'admin') return null;
  if (!user.shelterId) {
    throw ApiError.forbidden('Your account is not linked to a shelter.');
  }
  const shelter = await Shelter.findById(user.shelterId).lean();
  if (!shelter) throw ApiError.forbidden('Your shelter account could not be found.');
  if (shelter.status !== 'approved') {
    throw ApiError.forbidden('Your shelter is not approved yet, so it cannot list pets.');
  }
  return shelter;
}

/** Unique slug from the pet's name and breed, with a numeric suffix on collision. */
async function uniqueSlug(name: string, breed: string): Promise<string> {
  const base = `${slugify(name)}-${slugify(breed)}`;
  let slug = base;
  let suffix = 2;
  // Bounded so a pathological case cannot spin forever.
  while (suffix < 100 && (await Pet.exists({ slug }))) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

/**
 * Rejects publicIds that do not correspond to a real asset in one of our folders.
 *
 * The client sends back whatever Cloudinary returned, and nothing stops it sending something else
 * — including a publicId belonging to another shelter's pet.
 *
 * Images with no publicId pass straight through: that is the URL-paste fallback, and there is
 * nothing to verify. But a publicId that IS present is always verified, including when Cloudinary
 * is unconfigured — in that case no legitimate publicId can exist, so its presence means the
 * client fabricated it. `verifyAsset` returns false there, which is the behaviour we want.
 */
async function assertImagesAreOurs(images: CreatePetInput['images']): Promise<void> {
  const withIds = images.filter((image) => image.publicId);
  if (withIds.length === 0) return;

  const results = await Promise.all(
    withIds.map(async (image) => ({
      publicId: image.publicId!,
      ok: await verifyAsset(image.publicId!),
    })),
  );

  const bad = results.filter((result) => !result.ok);
  if (bad.length > 0) {
    throw ApiError.validation('One or more images could not be verified.', {
      images: 'Please re-upload the highlighted photos.',
    });
  }
}

/** Exactly one primary image, whatever the client sent. */
function normaliseImages(images: CreatePetInput['images']) {
  const primaryIndex = Math.max(
    0,
    images.findIndex((image) => image.isPrimary),
  );
  return images.map((image, index) => ({
    url: image.url,
    publicId: image.publicId ?? '',
    ...(image.width ? { width: image.width } : {}),
    ...(image.height ? { height: image.height } : {}),
    isPrimary: index === primaryIndex,
    order: index,
  }));
}

export async function createPet(user: AuthenticatedUser, input: CreatePetInput) {
  const shelter = await requireShelter(user);

  // An admin creating a pet must say which shelter it belongs to.
  const shelterId = shelter?._id ?? input.shelterId;
  if (!shelterId) throw ApiError.validation('A shelter is required.', { shelterId: 'Required.' });

  const owningShelter = shelter ?? (await Shelter.findById(shelterId).lean());
  if (!owningShelter) throw ApiError.notFound('Shelter');

  await assertImagesAreOurs(input.images);

  const pet = await Pet.create({
    ...input,
    slug: await uniqueSlug(input.name, input.breed),
    ageInMonths: toAgeInMonths(input.age),
    images: normaliseImages(input.images),
    shelter: shelterId,
    // New listings start pending until an admin approves them (Batch 9).
    status: 'pending',
    // Denormalised from the shelter so listing filters need no join.
    location: {
      city: owningShelter.address.city,
      state: owningShelter.address.state,
      country: owningShelter.address.country,
      ...(owningShelter.address.geo ? { geo: owningShelter.address.geo } : {}),
    },
    intakeDate: input.intakeDate ?? new Date(),
  });

  await Shelter.updateOne({ _id: shelterId }, { $inc: { 'stats.totalPets': 1 } }).catch(
    (error: unknown) => logger.error({ err: error }, 'Failed to increment shelter totalPets'),
  );

  await pet.populate('shelter', 'name slug address rating stats logo description email phone website');
  return toPetDetail(pet.toObject() as IPet);
}

export async function updatePet(user: AuthenticatedUser, petId: string, input: UpdatePetInput) {
  const update: Record<string, unknown> = { ...input };

  if (input.age) update.ageInMonths = toAgeInMonths(input.age);

  if (input.images) {
    await assertImagesAreOurs(input.images);

    /**
     * Clean up photos the shelter removed during the edit. Read the current set first, then
     * destroy whatever is no longer referenced — otherwise every edit leaks the old files.
     */
    const current = await Pet.findOne({ _id: petId, ...ownershipScope(user) })
      .select('images')
      .lean();

    if (current) {
      const keeping = new Set(input.images.map((image) => image.publicId).filter(Boolean));
      const dropped = current.images
        .map((image) => image.publicId)
        .filter((publicId) => publicId && !keeping.has(publicId));
      await destroyAssets(dropped);
    }

    update.images = normaliseImages(input.images);
  }
  // Status changes go through setPetStatus, which enforces the side effects.
  delete update.status;
  delete update.shelterId;

  const pet = await Pet.findOneAndUpdate(
    { _id: petId, deletedAt: null, ...ownershipScope(user) },
    { $set: update },
    { new: true, runValidators: true },
  ).populate('shelter', 'name slug address rating stats logo description email phone website');

  if (!pet) throw ApiError.notFound('Pet');
  return toPetDetail(pet.toObject() as IPet);
}

/** Status transitions a shelter may make directly. Adoption itself goes through the application. */
const ALLOWED_STATUSES: PetStatus[] = ['available', 'reserved', 'adopted', 'archived'];

export async function setPetStatus(user: AuthenticatedUser, petId: string, status: PetStatus) {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw ApiError.validation(`Cannot set status to ${status}.`);
  }

  const pet = await Pet.findOne({ _id: petId, deletedAt: null, ...ownershipScope(user) });
  if (!pet) throw ApiError.notFound('Pet');

  // A pending listing has not been approved yet, so it cannot jump straight to available.
  if (pet.status === 'pending' && status === 'available') {
    throw ApiError.conflict('This listing is awaiting approval and cannot be published yet.');
  }

  const previous = pet.status;
  pet.status = status;
  if (status === 'adopted' && !pet.adoptedAt) pet.adoptedAt = new Date();
  await pet.save();

  /**
   * Marking a pet adopted directly (rather than by completing an application) still has to close
   * the applications people are waiting on. Leaving them pending would have applicants waiting on
   * an animal that has already gone home.
   */
  if (status === 'adopted' && previous !== 'adopted') {
    const open = await AdoptionApplication.find({
      pet: pet._id,
      status: { $in: ['pending', 'under_review', 'approved'] },
    });

    for (const application of open) {
      application.status = 'rejected';
      application.isActive = false;
      application.reviewNote = 'This pet has been adopted.';
      application.statusHistory.push({
        status: 'rejected',
        changedBy: user.id as never,
        note: 'This pet has been adopted.',
        at: new Date(),
      });
      await application.save();
    }

    await Shelter.updateOne(
      { _id: pet.shelter },
      { $inc: { 'stats.adoptedPets': 1, 'stats.availablePets': -1 } },
    ).catch((error: unknown) => logger.error({ err: error }, 'Failed to update shelter stats'));
  }

  await pet.populate('shelter', 'name slug address rating stats logo description email phone website');
  return toPetDetail(pet.toObject() as IPet);
}

/**
 * Soft delete.
 *
 * Hard-deleting would orphan the adoption applications shelters keep as records, and break the
 * history of pets that were actually rehomed.
 */
export async function deletePet(user: AuthenticatedUser, petId: string) {
  const pet = await Pet.findOneAndUpdate(
    { _id: petId, deletedAt: null, ...ownershipScope(user) },
    { $set: { deletedAt: new Date(), status: 'archived' } },
    { new: true },
  );

  if (!pet) throw ApiError.notFound('Pet');

  /**
   * Remove the images from Cloudinary. The database row is kept (soft delete) so adoption history
   * survives, but the files are pure storage cost with nothing left to display them.
   * `destroyAssets` never throws — a storage hiccup must not fail a delete that already succeeded.
   */
  await destroyAssets(pet.images.map((image) => image.publicId));

  // Withdraw open applications so nobody waits on a listing that no longer exists.
  await AdoptionApplication.updateMany(
    { pet: pet._id, status: { $in: ['pending', 'under_review'] } },
    {
      $set: {
        status: 'rejected',
        isActive: false,
        reviewNote: 'This listing has been withdrawn by the shelter.',
      },
    },
  );

  await Shelter.updateOne({ _id: pet.shelter }, { $inc: { 'stats.totalPets': -1 } }).catch(
    (error: unknown) => logger.error({ err: error }, 'Failed to decrement shelter totalPets'),
  );

  return { deleted: true };
}
