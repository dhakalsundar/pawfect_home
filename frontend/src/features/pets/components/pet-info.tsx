import {
  Activity,
  Baby,
  Cat,
  CheckCircle2,
  Dog,
  HeartPulse,
  MinusCircle,
  Palette,
  Ruler,
  Scale,
  Scissors,
  ScanLine,
  Syringe,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  ACTIVITY_LABELS,
  formatAge,
  SIZE_LABELS,
  SPECIES_LABELS,
  tristateLabel,
  type PetDetail,
  type Tristate,
} from '@/types/pet';

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="bg-muted/40 flex items-center gap-3 rounded-xl p-3">
      <Icon className="text-primary-strong size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="truncate text-sm font-medium capitalize">{value}</dd>
      </div>
    </div>
  );
}

/** yes → green tick, no → red cross, unknown → neutral dash. Never guesses on the shelter's behalf. */
function CompatibilityRow({
  icon: Icon,
  state,
  subject,
}: {
  icon: LucideIcon;
  state: Tristate;
  subject: string;
}) {
  const StateIcon = state === 'yes' ? CheckCircle2 : state === 'no' ? XCircle : MinusCircle;
  const tone =
    state === 'yes' ? 'text-success' : state === 'no' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <li className="flex items-center gap-2.5 text-sm">
      <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{subject}</span>
      <StateIcon className={`size-4 shrink-0 ${tone}`} aria-hidden="true" />
      <span className="sr-only">{tristateLabel(state, subject.toLowerCase())}</span>
    </li>
  );
}

function HealthBadge({ active, label, icon: Icon }: { active: boolean; label: string; icon: LucideIcon }) {
  return (
    <Badge
      variant={active ? 'default' : 'secondary'}
      className={active ? 'bg-success/10 text-success gap-1.5 border-0' : 'text-muted-foreground gap-1.5'}
    >
      <Icon className="size-3" />
      {active ? label : `Not ${label.toLowerCase()}`}
    </Badge>
  );
}

export function PetInfo({ pet }: { pet: PetDetail }) {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="about-heading">
        <h2 id="about-heading" className="mb-3 text-xl font-bold">
          About {pet.name}
        </h2>
        {/* whitespace-pre-line so shelter-entered paragraph breaks survive. */}
        <p className="text-muted-foreground leading-relaxed whitespace-pre-line text-pretty">
          {pet.description}
        </p>
      </section>

      <section aria-labelledby="facts-heading">
        <h2 id="facts-heading" className="mb-3 text-xl font-bold">
          At a glance
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Fact icon={Dog} label="Species" value={SPECIES_LABELS[pet.species]} />
          <Fact icon={Ruler} label="Size" value={SIZE_LABELS[pet.size]} />
          <Fact icon={Activity} label="Energy" value={ACTIVITY_LABELS[pet.activityLevel]} />
          <Fact icon={HeartPulse} label="Age" value={formatAge(pet.age)} />
          <Fact icon={Baby} label="Gender" value={pet.gender} />
          {pet.weight?.value ? (
            <Fact
              icon={Scale}
              label="Weight"
              value={`${pet.weight.value} ${pet.weight.unit}`}
            />
          ) : null}
          {pet.color ? <Fact icon={Palette} label="Colour" value={pet.color} /> : null}
        </dl>
      </section>

      {pet.temperament.length > 0 ? (
        <section aria-labelledby="temperament-heading">
          <h2 id="temperament-heading" className="mb-3 text-xl font-bold">
            Temperament
          </h2>
          <ul className="flex flex-wrap gap-2">
            {pet.temperament.map((trait) => (
              <li key={trait}>
                <Badge variant="secondary" className="capitalize">
                  {trait}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-8 sm:grid-cols-2">
        <section aria-labelledby="compat-heading">
          <h2 id="compat-heading" className="mb-3 text-xl font-bold">
            Lives well with
          </h2>
          <ul className="flex flex-col gap-2.5">
            <CompatibilityRow icon={Baby} state={pet.goodWith.kids} subject="Children" />
            <CompatibilityRow icon={Dog} state={pet.goodWith.dogs} subject="Dogs" />
            <CompatibilityRow icon={Cat} state={pet.goodWith.cats} subject="Cats" />
          </ul>
          <p className="text-muted-foreground mt-3 text-xs">
            A dash means the shelter has not assessed this yet — ask them directly.
          </p>
        </section>

        <section aria-labelledby="health-heading">
          <h2 id="health-heading" className="mb-3 text-xl font-bold">
            Health
          </h2>
          <ul className="flex flex-wrap gap-2">
            <li>
              <HealthBadge active={pet.health.vaccinated} label="Vaccinated" icon={Syringe} />
            </li>
            <li>
              <HealthBadge active={pet.health.neutered} label="Neutered" icon={Scissors} />
            </li>
            <li>
              <HealthBadge active={pet.microchipped} label="Microchipped" icon={ScanLine} />
            </li>
          </ul>

          {pet.health.specialNeeds ? (
            <div className="border-warning/40 bg-warning/10 mt-3 rounded-xl border p-3">
              <p className="text-sm font-medium">Has special needs</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {pet.health.medicalNotes ??
                  'The shelter will talk you through the ongoing care involved.'}
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
