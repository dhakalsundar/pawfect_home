import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PetForm } from '@/features/shelter/components/pet-form';
import { shelterServer } from '@/services/shelter.server';
import { isApiError } from '@/services/api-error';

export const metadata: Metadata = {
  title: 'Edit pet',
  robots: { index: false, follow: false },
};

export default async function EditPetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let pet;
  try {
    pet = await shelterServer.pet(slug);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }

  return (
    <div>
      <Link
        href="/shelter/pets"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        My pets
      </Link>

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">Edit {pet.name}</h1>
        <Badge variant="outline" className="capitalize">
          {pet.status}
        </Badge>
      </div>

      {/*
        The form is rendered from data fetched with cache: 'no-store'. A shelter editing a listing
        must see its own last save, not a cached copy from before it.
      */}
      <PetForm pet={pet} />
    </div>
  );
}
