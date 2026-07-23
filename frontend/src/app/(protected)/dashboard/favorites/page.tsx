import type { Metadata } from 'next';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PetCard } from '@/features/pets/components/pet-card';
import { favoritesServer } from '@/services/favorites.server';

export const metadata: Metadata = {
  title: 'Favourites',
  robots: { index: false, follow: false },
};

export default async function FavoritesPage() {
  const { items, meta } = await favoritesServer.list({ limit: 48 });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Favourites</h1>
        <p className="text-muted-foreground mt-1">
          {meta.total === 0
            ? 'Pets you save will appear here.'
            : `${meta.total} pet${meta.total === 1 ? '' : 's'} saved`}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No favourites yet"
          description="Tap the heart on any pet to save them here and come back later."
          action={
            <Button asChild className="bg-brand-gradient border-0 text-white">
              <Link href="/pets">Browse pets</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((pet, index) => (
            <PetCard
              key={pet.id}
              pet={pet}
              priority={index < 3}
              // Every card here is favourited by definition.
              favorited
              // Un-favouriting on this page should remove the card, which needs a server refresh.
              refreshOnFavorite
            />
          ))}
        </div>
      )}
    </div>
  );
}
