import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PetForm } from '@/features/shelter/components/pet-form';

export const metadata: Metadata = {
  title: 'Add a pet',
  robots: { index: false, follow: false },
};

export default function NewPetPage() {
  return (
    <div>
      <Link
        href="/shelter/pets"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        My pets
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Add a pet</h1>
        <p className="text-muted-foreground mt-1">
          The listing goes live once an admin approves it.
        </p>
      </div>

      <PetForm />
    </div>
  );
}
