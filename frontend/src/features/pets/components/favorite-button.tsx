'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';
import { favoritesService } from '@/services/favorites.service';
import { isApiError } from '@/services/api-error';
import { cn } from '@/lib/utils';

/**
 * The one interactive island inside a pet card.
 *
 * Optimistic: the heart fills immediately and rolls back if the request fails, because waiting
 * ~200ms for a round trip on a click this small feels broken.
 */
export function FavoriteButton({
  petId,
  petName,
  initialFavorited = false,
  className,
  /** Refresh Server Components after the change — used on the favourites page, where removing
   *  an item should drop it from the list. */
  refreshOnChange = false,
}: {
  petId: string;
  petName: string;
  initialFavorited?: boolean;
  className?: string;
  refreshOnChange?: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  async function handleClick(event: React.MouseEvent) {
    // The card title's link is stretched over the whole card, so without this the click
    // navigates to the detail page instead of toggling.
    event.preventDefault();
    event.stopPropagation();

    if (!isAuthenticated) {
      // Includes the query string, so filters survive the round trip through login.
      const target = `${window.location.pathname}${window.location.search}`;
      router.push(`/login?callbackUrl=${encodeURIComponent(target)}`);
      return;
    }

    if (pending) return;

    const previous = favorited;
    const next = !favorited;
    setFavorited(next);
    setPending(true);

    try {
      const result = await favoritesService.toggle(petId);
      // Trust the server's answer over our guess — they diverge if the same pet was toggled
      // in another tab.
      setFavorited(result.favorited);
      toast.success(
        result.favorited ? `${petName} saved to favourites` : `${petName} removed from favourites`,
      );
      if (refreshOnChange) router.refresh();
    } catch (error) {
      setFavorited(previous);
      toast.error(
        isApiError(error) ? error.message : 'Could not update favourites. Please try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      data-pet-id={petId}
      // z-10 lifts it above the card link's stretched ::after overlay.
      className={cn(
        'glass hover:bg-background absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full border transition-colors disabled:opacity-70',
        className,
      )}
      aria-label={favorited ? `Remove ${petName} from favourites` : `Save ${petName} to favourites`}
      aria-pressed={favorited}
    >
      <Heart
        className={cn(
          'size-4 transition-all duration-300',
          favorited ? 'fill-primary text-primary-strong scale-110' : 'text-foreground',
        )}
      />
    </button>
  );
}
