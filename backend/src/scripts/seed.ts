import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { connectDB, disconnectDB, isEphemeralDB } from '../config/db.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Shelter } from '../models/Shelter.js';
import { Pet } from '../models/Pet.js';
import { Donation } from '../models/Donation.js';
import { Payment } from '../models/Payment.js';
import { Review } from '../models/Review.js';
import { recomputeShelterRating } from '../modules/reviews/reviews.service.js';

/**
 * Seeds a realistic dataset for development.
 *
 * Exported as a function as well as a CLI script because `mongodb-memory-server` is per-process:
 * running `npm run seed` against the in-memory fallback would populate the *script's* own
 * throwaway database, not the API's, leaving the running server with an empty collection. The
 * server imports `seedDatabase` and calls it on boot instead. See server.ts.
 */

// ---------------------------------------------------------------------------
// Source material. Photo ids verified to resolve on images.unsplash.com.
// ---------------------------------------------------------------------------

const IMAGES: Record<string, string[]> = {
  dog: [
    'photo-1552053831-71594a27632d',
    'photo-1543466835-00a7907e9de1',
    'photo-1601979031925-424e53b6caaa',
    'photo-1592194996308-7b43878e84a6',
    'photo-1450778869180-41d0601e046e',
    'photo-1548199973-03cce0bbc87b',
    'photo-1587300003388-59208cc962cb',
    'photo-1583511655857-d19b40a7a54e',
    'photo-1601758228041-f3b2795255f1',
    'photo-1568572933382-74d440642117',
  ],
  cat: [
    'photo-1514888286974-6c03e2ca1dba',
    'photo-1533738363-b7f9aef128ce',
    'photo-1518791841217-8f162f1e1131',
    'photo-1583337130417-3346a1be7dee',
    'photo-1425082661705-1834bfd09dca',
    'photo-1574144611937-0df059b5ef3e',
    'photo-1571566882372-1598d88abd90',
    'photo-1560807707-8cc77767d783',
  ],
  bird: ['photo-1452570053594-1b985d6ea890', 'photo-1444464666168-49d633b86797'],
  rabbit: ['photo-1596492784531-6e6eb5ea9993', 'photo-1585110396000-c9ffd4e4b308'],
  other: ['photo-1596492784531-6e6eb5ea9993', 'photo-1444464666168-49d633b86797'],
};

const BREEDS: Record<string, string[]> = {
  dog: [
    'Golden Retriever', 'Labrador Retriever', 'German Shepherd', 'Beagle', 'Poodle',
    'Border Collie', 'Siberian Husky', 'Dachshund', 'Boxer', 'Shih Tzu',
    'Australian Shepherd', 'Cocker Spaniel', 'Staffordshire Terrier', 'Jack Russell Terrier',
    'Greyhound', 'Mixed Breed',
  ],
  cat: [
    'Domestic Shorthair', 'Tabby', 'Siamese', 'Maine Coon', 'Persian', 'Bengal',
    'Ragdoll', 'British Shorthair', 'Calico', 'Tuxedo', 'Russian Blue', 'Sphynx',
  ],
  bird: ['Budgerigar', 'Cockatiel', 'Lovebird', 'Canary', 'African Grey', 'Conure'],
  rabbit: ['Holland Lop', 'Netherland Dwarf', 'Rex', 'Lionhead', 'Flemish Giant', 'Mini Lop'],
  other: ['Guinea Pig', 'Ferret', 'Hamster', 'Chinchilla', 'Gerbil'],
};

const NAMES = [
  'Luna', 'Milo', 'Bella', 'Charlie', 'Lucy', 'Max', 'Daisy', 'Cooper', 'Molly', 'Buddy',
  'Sadie', 'Rocky', 'Maggie', 'Bear', 'Sophie', 'Duke', 'Chloe', 'Tucker', 'Lily', 'Oliver',
  'Zoe', 'Jack', 'Ruby', 'Toby', 'Rosie', 'Finn', 'Nala', 'Leo', 'Willow', 'Ollie',
  'Poppy', 'Shadow', 'Hazel', 'Murphy', 'Coco', 'Simba', 'Olive', 'Gus', 'Pepper', 'Ziggy',
  'Clover', 'Kiwi', 'Mango', 'Biscuit', 'Scout', 'Juniper', 'Pumpkin', 'Marbles', 'Nutmeg', 'Pickles',
];

const CITIES: [string, string, [number, number]][] = [
  ['Portland', 'OR', [-122.6765, 45.5231]],
  ['Seattle', 'WA', [-122.3321, 47.6062]],
  ['Denver', 'CO', [-104.9903, 39.7392]],
  ['Austin', 'TX', [-97.7431, 30.2672]],
  ['Chicago', 'IL', [-87.6298, 41.8781]],
  ['Boston', 'MA', [-71.0589, 42.3601]],
  ['Phoenix', 'AZ', [-112.074, 33.4484]],
  ['Minneapolis', 'MN', [-93.265, 44.9778]],
  ['Nashville', 'TN', [-86.7816, 36.1627]],
  ['San Diego', 'CA', [-117.1611, 32.7157]],
];

const SHELTER_NAMES = [
  'Paws & Claws Rescue', 'Second Chance Shelter', 'Happy Tails Foundation',
  'City Animal Services', 'Furry Friends Network', 'Safe Haven Sanctuary',
  'Whiskers & Wags', 'Hopeful Hearts Rescue', 'The Rescue Barn', 'Bright Beginnings Animal Trust',
];

const TEMPERAMENTS = [
  'playful', 'calm', 'affectionate', 'shy', 'energetic', 'gentle',
  'curious', 'independent', 'loyal', 'goofy', 'quiet', 'protective',
];

const DESCRIPTION_OPENERS = [
  'came to us after their family moved overseas and could not take them along',
  'was found as a stray and has blossomed since arriving',
  'was surrendered when their owner developed allergies',
  'arrived with a litter of siblings, all of whom have now found homes',
  'has been with us the longest and is more than ready for a quiet home',
  'was rescued from a hoarding situation and has recovered beautifully',
];

const DESCRIPTION_TRAITS = [
  'loves a long walk followed by an even longer nap',
  'will supervise your cooking from a respectful distance',
  'greets every visitor as though they came specifically to see them',
  'prefers a calm household and predictable routines',
  'has excellent manners and already knows the basics',
  'is happiest with a sunny window and somewhere soft to sit',
];

// ---------------------------------------------------------------------------

/**
 * Deterministic ObjectIds.
 *
 * Without these, every reseed mints fresh ids while the frontend still holds pets in Next's
 * on-disk data cache — so pages reference ids that no longer exist and per-user features
 * (favourites, applications) silently return nothing, looking exactly like broken code. Costing
 * an hour of debugging once was enough. Stable ids make a reseed invisible to the cache.
 *
 * 24 hex characters: a 20-char type prefix plus a 4-char index.
 */
function stableId(
  prefix: 'pet' | 'shelter' | 'user' | 'donation',
  index: number,
): mongoose.Types.ObjectId {
  // Hex characters only — an ObjectId is 24 hex digits, so no mnemonic letters beyond a–f.
  const prefixes = { pet: 'a11', shelter: 'b22', user: 'c33', donation: 'd44' } as const;
  const head = prefixes[prefix].repeat(7).slice(0, 20);
  return new mongoose.Types.ObjectId(head + index.toString(16).padStart(4, '0'));
}

/** Deterministic PRNG so re-seeding produces the same dataset — bugs stay reproducible. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const random = makeRandom(20260721);

const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const pickSome = <T>(items: readonly T[], count: number): T[] =>
  [...items].sort(() => random() - 0.5).slice(0, count);
const intBetween = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;
const chance = (probability: number) => random() < probability;

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const imageUrl = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`;

const SPECIES_WEIGHTS: [string, number][] = [
  ['dog', 0.42],
  ['cat', 0.36],
  ['rabbit', 0.09],
  ['bird', 0.08],
  ['other', 0.05],
];

function pickSpecies(): string {
  const roll = random();
  let cumulative = 0;
  for (const [species, weight] of SPECIES_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return species;
  }
  return 'dog';
}

export async function seedDatabase() {
  // Guarded here rather than at module load, so importing this file from the server is safe.
  if (env.isProd) {
    throw new Error('Refusing to seed in production — this deletes data.');
  }

  logger.info('Clearing existing pets and shelters…');
  await Promise.all([Pet.deleteMany({}), Shelter.deleteMany({}), Donation.deleteMany({}), Payment.deleteMany({}), Review.deleteMany({})]);
  await User.deleteMany({ email: { $regex: /@pawfecthome\.seed$/ } });

  // --- Shelter owners ------------------------------------------------------
  logger.info('Creating shelter accounts…');
  const shelters = [];

  for (const [index, shelterName] of SHELTER_NAMES.entries()) {
    const [city, state, coordinates] = CITIES[index % CITIES.length]!;

    const owner = await User.create({
      _id: stableId('user', index),
      name: `${shelterName} Admin`,
      email: `shelter${index + 1}@pawfecthome.seed`,
      password: 'ShelterPass123',
      role: 'shelter',
      emailVerified: new Date(),
      provider: 'credentials',
    });

    const shelter = await Shelter.create({
      _id: stableId('shelter', index),
      name: shelterName,
      slug: slugify(shelterName),
      owner: owner._id,
      email: `contact@${slugify(shelterName)}.org`,
      phone: `+1 (555) 0${intBetween(10, 99)}-${intBetween(1000, 9999)}`,
      website: `https://${slugify(shelterName)}.org`,
      description:
        `${shelterName} is a volunteer-run rescue based in ${city}, ${state}. We take in ` +
        'surrendered and stray animals, provide veterinary care and foster placement, and match ' +
        'each one with a household that genuinely suits them. Every animal is health-checked ' +
        'before listing, and we stay in touch long after adoption day.',
      address: {
        street: `${intBetween(10, 999)} ${pick(['Willow', 'Cedar', 'Maple', 'Oak', 'Birch'])} ${pick(['Lane', 'Street', 'Avenue', 'Road'])}`,
        city,
        state,
        country: 'USA',
        zip: String(intBetween(10_000, 99_999)),
        geo: { type: 'Point', coordinates },
      },
      registrationNumber: `REG-${intBetween(100_000, 999_999)}`,
      status: 'approved',
      verifiedAt: new Date(),
      rating: {
        average: Number((3.9 + random() * 1.1).toFixed(1)),
        count: intBetween(12, 240),
      },
    });

    owner.shelterId = shelter._id;
    await owner.save({ validateBeforeSave: false });

    shelters.push(shelter);
  }

  // --- Pets ----------------------------------------------------------------
  const TOTAL_PETS = 500;
  logger.info(`Creating ${TOTAL_PETS} pets…`);

  const pets = [];
  const usedSlugs = new Set<string>();

  for (let i = 0; i < TOTAL_PETS; i++) {
    const species = pickSpecies();
    const breed = pick(BREEDS[species]!);
    const name = pick(NAMES);
    const shelter = pick(shelters);

    // Slug must be unique, and names repeat by design across 500 pets.
    let slug = `${slugify(name)}-${slugify(breed)}`;
    let suffix = 2;
    while (usedSlugs.has(slug)) slug = `${slugify(name)}-${slugify(breed)}-${suffix++}`;
    usedSlugs.add(slug);

    const ageUnit = chance(0.15) ? 'months' : 'years';
    const ageValue = ageUnit === 'months' ? intBetween(2, 11) : intBetween(1, 13);
    const ageInMonths = ageUnit === 'months' ? ageValue : ageValue * 12;

    const size =
      species === 'dog'
        ? pick(['small', 'medium', 'large', 'xlarge'] as const)
        : species === 'cat'
          ? pick(['small', 'medium'] as const)
          : 'small';

    const speciesImages = IMAGES[species]!;
    const imageCount = intBetween(2, 4);
    const chosen = pickSome(speciesImages, Math.min(imageCount, speciesImages.length));

    // Older animals wait longer and are cheaper to rehome — mirrors reality and gives the
    // age and fee filters something meaningful to separate. Whole NPR rupees, rounded to hundreds.
    const isSenior = ageInMonths > 96;
    const baseFee =
      species === 'dog'
        ? intBetween(20, 50) * 100 // Rs 2,000 – 5,000
        : species === 'cat'
          ? intBetween(10, 25) * 100 // Rs 1,000 – 2,500
          : intBetween(5, 15) * 100; // Rs 500 – 1,500
    const adoptionFee = isSenior ? Math.round((baseFee * 0.5) / 100) * 100 : baseFee;

    const status = chance(0.06) ? 'adopted' : chance(0.04) ? 'reserved' : 'available';

    const daysAgo = intBetween(1, 300);
    const createdAt = new Date(Date.now() - daysAgo * 86_400_000);

    pets.push({
      _id: stableId('pet', i),
      name,
      slug,
      species,
      breed,
      age: { value: ageValue, unit: ageUnit },
      ageInMonths,
      gender: chance(0.5) ? 'male' : 'female',
      size,
      weight: { value: intBetween(2, 40), unit: 'kg' },
      color: pick(['Black', 'White', 'Brown', 'Golden', 'Grey', 'Tan', 'Cream', 'Brindle']),
      description:
        `${name} ${pick(DESCRIPTION_OPENERS)}. This ${ageValue} ${ageUnit === 'years' ? 'year' : 'month'}-old ` +
        `${breed.toLowerCase()} ${pick(DESCRIPTION_TRAITS)}. ` +
        `${chance(0.5) ? `${name} would suit a home with someone around for much of the day.` : `${name} is comfortable being left for a normal working day.`} ` +
        `Come and meet ${name} at ${shelter.name} — no appointment needed at weekends.`,
      images: chosen.map((id, index) => ({
        url: imageUrl(id),
        publicId: '',
        width: 800,
        height: 600,
        isPrimary: index === 0,
        order: index,
      })),
      health: {
        vaccinated: chance(0.85),
        neutered: chance(0.78),
        microchipped: chance(0.7),
        specialNeeds: chance(0.12),
        medicalNotes: chance(0.12) ? 'Requires ongoing medication. Full history available.' : undefined,
      },
      temperament: pickSome(TEMPERAMENTS, intBetween(2, 4)),
      goodWith: {
        kids: chance(0.6) ? 'yes' : chance(0.5) ? 'no' : 'unknown',
        dogs: chance(0.55) ? 'yes' : chance(0.5) ? 'no' : 'unknown',
        cats: chance(0.45) ? 'yes' : chance(0.5) ? 'no' : 'unknown',
      },
      activityLevel: pick(['low', 'moderate', 'high'] as const),
      adoptionFee,
      shelter: shelter._id,
      status,
      ...(status === 'adopted' ? { adoptedAt: new Date(Date.now() - intBetween(1, 60) * 86_400_000) } : {}),
      location: {
        city: shelter.address.city,
        state: shelter.address.state,
        country: 'USA',
        geo: shelter.address.geo,
      },
      views: intBetween(0, 900),
      favoritesCount: intBetween(0, 60),
      applicationsCount: intBetween(0, 8),
      featured: chance(0.06),
      intakeDate: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  }

  // insertMany in one call rather than 500 round trips. The pre-save hook does not run for
  // inserts, which is why ageInMonths is computed above rather than left to the model.
  await Pet.insertMany(pets, { ordered: false });

  // --- Denormalised shelter counters --------------------------------------
  logger.info('Recomputing shelter stats…');
  for (const shelter of shelters) {
    const [total, available, adopted] = await Promise.all([
      Pet.countDocuments({ shelter: shelter._id }),
      Pet.countDocuments({ shelter: shelter._id, status: 'available' }),
      Pet.countDocuments({ shelter: shelter._id, status: 'adopted' }),
    ]);
    shelter.stats.totalPets = total;
    shelter.stats.availablePets = available;
    shelter.stats.adoptedPets = adopted;
    await shelter.save({ validateBeforeSave: false });
  }

  // --- Demo accounts -------------------------------------------------------
  logger.info('Creating demo accounts…');
  await User.create([
    {
      _id: stableId('user', 900),
      name: 'Demo Adopter',
      email: 'adopter@pawfecthome.seed',
      password: 'DemoPass123',
      role: 'user',
      emailVerified: new Date(),
    },
    {
      _id: stableId('user', 901),
      name: 'Demo Admin',
      email: 'admin@pawfecthome.seed',
      password: 'DemoPass123',
      role: 'admin',
      emailVerified: new Date(),
    },
  ]);

  // --- Donations -----------------------------------------------------------
  /**
   * Succeeded donations give the stats banner and donor wall something real to render; the
   * pending ones are fixtures the webhook suite drives to completion.
   *
   * Pending fixtures exist because Checkout cannot be exercised without Stripe credentials, and
   * the parts that matter most — signature verification and replay idempotency — do not need it.
   * Their ids are deterministic (`d44…`) for the same reason pets' are: so a reseed does not
   * invalidate anything holding them.
   */
  logger.info('Creating donations…');

  const donorNames = [
    'Amara Okafor', 'Ben Sørensen', 'Chloe Nakamura', 'Diego Ramírez', 'Elena Petrova',
    'Farid Haddad', 'Grace Mwangi', 'Hana Kobayashi', 'Ivan Novak', 'Julia Lindqvist',
  ];
  const donationMessages = [
    'Keep up the wonderful work.', 'In memory of our old girl, Maple.',
    'Thank you for everything you do.', 'For the senior dogs — they deserve the most.',
    '', 'Adopted from you two years ago. Still the best decision we ever made.',
  ];

  const donations = [];
  for (let i = 0; i < 24; i++) {
    const shelter = shelters[Math.floor(random() * shelters.length)]!;
    const name = donorNames[i % donorNames.length]!;
    // Round amounts, in minor units (paisa): Rs 500 / 1,000 / 2,500 / 5,000 / 10,000.
    const amount = [50000, 100000, 250000, 500000, 1000000][Math.floor(random() * 5)]!;
    const message = donationMessages[i % donationMessages.length]!;

    donations.push({
      _id: stableId('donation', i),
      donorSnapshot: { name, email: `${name.split(' ')[0]!.toLowerCase()}@example.seed` },
      shelter: shelter._id,
      amount,
      currency: 'npr',
      type: 'one_time' as const,
      status: 'succeeded' as const,
      ...(message ? { message } : {}),
      // Every fourth donation is anonymous, so the donor wall exercises both paths.
      isAnonymous: i % 4 === 3,
      createdAt: new Date(Date.now() - i * 36 * 60 * 60 * 1000),
    });
  }

  /**
   * A pool of pending rows for the webhook suite to consume.
   *
   * Each one is single-use — a webhook test drives it to `succeeded` and it cannot be reused — so
   * the suite claims fresh ones from this pool by querying for `status=pending` rather than
   * hard-coding ids. Twelve lets the suite run several times between reseeds; it reports a clear
   * skip if it ever runs dry.
   */
  for (let i = 0; i < 12; i++) {
    donations.push({
      _id: stableId('donation', 900 + i),
      donorSnapshot: { name: 'Webhook Fixture', email: 'webhook@pawfecthome.seed' },
      shelter: shelters[0]!._id,
      // Kept at 5000 (Rs 50) because the Stripe webhook suite drives and asserts this exact value.
      amount: 5000,
      currency: 'npr',
      type: 'one_time' as const,
      status: 'pending' as const,
      isAnonymous: false,
      createdAt: new Date(),
    });
  }

  await Donation.insertMany(donations);

  for (const shelter of shelters) {
    const [received] = await Donation.aggregate<{ total: number }>([
      { $match: { shelter: shelter._id, status: 'succeeded' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    shelter.stats.donationsTotal = received?.total ?? 0;
    await shelter.save({ validateBeforeSave: false });
  }

  // --- Reviews -------------------------------------------------------------
  /**
   * Reviews for the star ratings and distribution bars.
   *
   * The unique index is `{author, shelter}` partial, so each seeded author may review each shelter
   * at most once — hence one review per (author, shelter) pair, drawn from a pool of reviewer
   * accounts rather than reusing the demo adopter.
   */
  logger.info('Creating reviews…');

  const reviewerNames = [
    'Priya Raghunathan', 'Tom Ashworth', 'Ingrid Dahl', 'Marcus Bell', 'Yuki Tanaka',
    'Sofia Marchetti', 'Kwame Boateng', 'Lena Fischer', 'Owen Pritchard', 'Rania Aziz',
    'Caleb Nguyen', 'Nadia Volkova',
  ];

  // Created one at a time rather than via insertMany: password hashing lives in a pre('save')
  // hook, which insertMany skips — the accounts would exist with plaintext passwords and no
  // working login.
  const reviewers = [];
  for (const [index, name] of reviewerNames.entries()) {
    reviewers.push(
      await User.create({
        _id: stableId('user', 800 + index),
        name,
        email: `reviewer${index + 1}@pawfecthome.seed`,
        password: 'ReviewPass123',
        role: 'user',
        emailVerified: new Date(),
      }),
    );
  }

  const REVIEW_BODIES: [number, string, string][] = [
    [5, 'Could not have asked for more', 'They matched us with a dog who suits our household exactly, and checked in twice after we brought him home. The whole process took two weeks and never once felt rushed.'],
    [5, 'Genuinely care about the animals', 'You can tell every animal here is known individually by the staff. They talked us out of the first dog we asked about because he needed a quieter home, which is exactly what you want to hear.'],
    [4, 'Great people, slow paperwork', 'No complaints about the care or the honesty. The application did take longer than we expected, though they explained why and kept us updated.'],
    [5, 'Second adoption from them', 'Came back four years later and the same warmth was there. They remembered our first cat by name.'],
    [4, 'Thorough and honest', 'They were upfront about our rabbit needing ongoing dental checks, which we appreciated even though it added cost. Better than finding out later.'],
    [3, 'Good outcome, patchy communication', 'We are very happy with our cat, but had to chase for updates a few times during the application.'],
    [5, 'They found her a home nobody expected', 'Our senior girl had been waiting eleven months. They never stopped advocating for her.'],
    [4, 'Well run and clean', 'Visited twice before applying. The facility is clean, the animals have space, and nobody pressured us.'],
    [5, 'Follow-up support was the difference', 'Three weeks in we had a behavioural issue and they got us on the phone with their trainer the same day, free.'],
    [2, 'Not the right fit for us', 'The staff were kind, but the home-check requirements were more than we could accommodate and that only became clear late in the process.'],
  ];

  const reviews = [];
  let reviewIndex = 0;
  for (const [shelterPosition, shelter] of shelters.entries()) {
    // Between three and seven reviews each, so the distribution bars are not uniform.
    const howMany = 3 + Math.floor(random() * 5);
    for (let i = 0; i < howMany && i < reviewers.length; i++) {
      const reviewer = reviewers[(shelterPosition + i) % reviewers.length]!;
      const [rating, title, comment] = REVIEW_BODIES[reviewIndex % REVIEW_BODIES.length]!;

      reviews.push({
        author: reviewer._id,
        targetType: 'shelter' as const,
        shelter: shelter._id,
        rating,
        title,
        comment,
        // Most are live; a couple sit in the queue so the moderation UI has something to show.
        status: (reviewIndex % 11 === 5 ? 'pending' : 'approved') as 'pending' | 'approved',
        helpfulCount: 0,
        helpfulBy: [],
        isActive: true,
        deletedAt: null,
        createdAt: new Date(Date.now() - reviewIndex * 30 * 60 * 60 * 1000),
      });
      reviewIndex++;
    }
  }

  await Review.insertMany(reviews);

  // Ratings are derived, never seeded by hand — this is the same code path the app uses.
  for (const shelter of shelters) {
    await recomputeShelterRating(shelter._id);
  }

  const counts = await Pet.aggregate([{ $group: { _id: '$species', n: { $sum: 1 } } }]);

  logger.info('---------------------------------------------');
  logger.info(`Shelters:  ${shelters.length}`);
  logger.info(`Pets:      ${await Pet.countDocuments()}`);
  for (const c of counts) logger.info(`  ${String(c._id).padEnd(8)} ${c.n}`);
  logger.info(`Available: ${await Pet.countDocuments({ status: 'available' })}`);
  logger.info(`Featured:  ${await Pet.countDocuments({ featured: true })}`);
  logger.info('---------------------------------------------');
  logger.info('Demo logins (password in parentheses):');
  logger.info('  adopter@pawfecthome.seed  (DemoPass123)');
  logger.info('  admin@pawfecthome.seed    (DemoPass123)');
  logger.info('  shelter1@pawfecthome.seed (ShelterPass123)');
  logger.info('---------------------------------------------');

  await mongoose.connection.syncIndexes();
}

/**
 * CLI entry point. Only runs when this file is executed directly (`npm run seed`), not when the
 * server imports seedDatabase.
 */
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void (async () => {
    try {
      await connectDB();
      if (isEphemeralDB()) {
        logger.warn(
          'Seeding the IN-MEMORY database, which belongs to THIS process and disappears when it ' +
            'exits — the running API will not see this data. Set MONGODB_URI in backend/.env to ' +
            'seed a shared database, or just start the API: it seeds itself when ephemeral.',
        );
      }
      await seedDatabase();
      await disconnectDB();
      process.exit(0);
    } catch (error) {
      logger.fatal({ err: error }, 'Seed failed');
      process.exit(1);
    }
  })();
}
