import { Favorite } from '../../models/Favorite.js';
import { Pet, type IPet } from '../../models/Pet.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildMeta } from '../../utils/ApiResponse.js';
import { logger } from '../../config/logger.js';
import { toPetListItem } from '../pets/pets.service.js';

/**
 * Adds a favourite.
 *
 * Idempotent: favouriting something already favourited succeeds quietly rather than erroring. The
 * user's intent is "this should be saved", and that is already true.
 */
export async function addFavorite(userId: string, petId: string) {
  const pet = await Pet.findOne({ _id: petId, deletedAt: null }).select('_id').lean();
  if (!pet) throw ApiError.notFound('Pet');

  const result = await Favorite.updateOne(
    { user: userId, pet: petId },
    { $setOnInsert: { user: userId, pet: petId, createdAt: new Date() } },
    { upsert: true },
  );

  // Only bump the counter when a row was actually inserted, or a double-click inflates it.
  if (result.upsertedCount > 0) {
    await Pet.updateOne({ _id: petId }, { $inc: { favoritesCount: 1 } }).catch((error: unknown) =>
      logger.error({ err: error }, 'Failed to increment favoritesCount'),
    );
  }

  return { favorited: true };
}

export async function removeFavorite(userId: string, petId: string) {
  const result = await Favorite.deleteOne({ user: userId, pet: petId });

  if (result.deletedCount > 0) {
    // $max guards against ever going negative if a counter has drifted.
    await Pet.updateOne({ _id: petId, favoritesCount: { $gt: 0 } }, { $inc: { favoritesCount: -1 } }).catch(
      (error: unknown) => logger.error({ err: error }, 'Failed to decrement favoritesCount'),
    );
  }

  return { favorited: false };
}

export async function toggleFavorite(userId: string, petId: string) {
  const existing = await Favorite.findOne({ user: userId, pet: petId }).select('_id').lean();
  return existing ? removeFavorite(userId, petId) : addFavorite(userId, petId);
}

export async function listFavorites(userId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;

  const [favorites, total] = await Promise.all([
    Favorite.find({ user: userId })
      // _id tiebreaker: several pets saved in the same second would otherwise paginate unstably.
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'pet', populate: { path: 'shelter', select: 'name slug' } })
      .lean(),
    Favorite.countDocuments({ user: userId }),
  ]);

  const items = favorites
    // A pet deleted since being favourited leaves a dangling row; skip rather than crash.
    .filter((favorite) => favorite.pet && !(favorite.pet as unknown as IPet).deletedAt)
    .map((favorite) => ({
      ...toPetListItem(favorite.pet as unknown as IPet),
      favoritedAt: favorite.createdAt.toISOString(),
    }));

  return { items, meta: buildMeta(total, page, limit) };
}

/**
 * Just the ids, for hydrating hearts across a grid of pets.
 * Far cheaper than fetching every favourited pet when all the UI needs is which ones are filled in.
 */
export async function listFavoriteIds(userId: string): Promise<string[]> {
  const favorites = await Favorite.find({ user: userId }).select('pet').lean();
  return favorites.map((favorite) => String(favorite.pet));
}

export async function isFavorited(userId: string, petId: string): Promise<boolean> {
  const existing = await Favorite.findOne({ user: userId, pet: petId }).select('_id').lean();
  return existing !== null;
}
