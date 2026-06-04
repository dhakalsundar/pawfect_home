/**
 * Placeholder content for the landing page.
 *
 * The featured-pet grid and platform stats now come from the API; what remains here is the
 * genuinely static marketing content — testimonials, care tips, partner logos and success
 * stories — that has no backend source.
 *
 * Photography: Unsplash, free to use under their licence. Every id below was verified to resolve.
 */

const unsplash = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`;

export const platformStats = [
  { value: 12480, suffix: '+', label: 'Pets rehomed', description: 'Since we started in 2019' },
  { value: 340, suffix: '+', label: 'Partner shelters', description: 'Verified across 42 states' },
  { value: 96, suffix: '%', label: 'Placement rate', description: 'Of pets listed with us' },
  { value: 2.1, suffix: 'M', label: 'Donated', description: 'Funding food, vets and care', prefix: '$' },
] as const;

export const trustedOrganisations = [
  'Paws & Claws Rescue',
  'Second Chance Shelter',
  'Happy Tails Foundation',
  'City Animal Services',
  'Furry Friends Network',
  'Safe Haven Sanctuary',
] as const;

export interface SuccessStory {
  id: string;
  petName: string;
  adopterName: string;
  location: string;
  quote: string;
  image: string;
  adoptedAgo: string;
}

export const successStories: SuccessStory[] = [
  {
    id: 's1',
    petName: 'Biscuit',
    adopterName: 'The Okonkwo family',
    location: 'Portland, OR',
    quote:
      'He was the shyest dog at the shelter and hid under a bench the whole first visit. Six months on he greets every single person on our street like an old friend.',
    image: unsplash('photo-1450778869180-41d0601e046e', 900),
    adoptedAgo: '6 months ago',
  },
  {
    id: 's2',
    petName: 'Mango',
    adopterName: 'Priya & Sam',
    location: 'Austin, TX',
    quote:
      'We came in looking for a kitten and left with a nine-year-old cat who decided we were hers. Best decision we have made together.',
    image: unsplash('photo-1533738363-b7f9aef128ce', 900),
    adoptedAgo: '1 year ago',
  },
  {
    id: 's3',
    petName: 'Scout',
    adopterName: 'Marcus T.',
    location: 'Denver, CO',
    quote:
      'Three shelters turned me down because I work shifts. PawfectHome matched me with Scout, who sleeps through my nights and walks me awake in the mornings.',
    image: unsplash('photo-1543466835-00a7907e9de1', 900),
    adoptedAgo: '3 months ago',
  },
];

export const happyFamilies = [
  { image: unsplash('photo-1548199973-03cce0bbc87b', 600), alt: 'Two dogs walking together on a trail' },
  { image: unsplash('photo-1601758228041-f3b2795255f1', 600), alt: 'A small dog resting on a sofa' },
  { image: unsplash('photo-1425082661705-1834bfd09dca', 600), alt: 'A tabby cat curled up asleep' },
  { image: unsplash('photo-1583511655857-d19b40a7a54e', 600), alt: 'A puppy sitting in the grass' },
  { image: unsplash('photo-1596492784531-6e6eb5ea9993', 600), alt: 'A rabbit sitting in a garden' },
  { image: unsplash('photo-1444464666168-49d633b86797', 600), alt: 'A colourful bird perched on a branch' },
] as const;

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  avatar: string;
  rating: 1 | 2 | 3 | 4 | 5;
  quote: string;
}

export const testimonials: Testimonial[] = [
  {
    id: 't1',
    name: 'Amara Johnson',
    role: 'Adopted Luna, 2023',
    avatar: unsplash('photo-1494790108377-be9c29b29330', 160),
    rating: 5,
    quote:
      'The filters actually work. I found three dogs near me that suited a flat with no garden, and the shelter replied the same afternoon.',
  },
  {
    id: 't2',
    name: 'Daniel Reyes',
    role: 'Adopted Milo, 2024',
    avatar: unsplash('photo-1500648767791-00dcc994a43e', 160),
    rating: 5,
    quote:
      'I had adopted before and dreaded the paperwork. This took about ten minutes and I could track exactly where my application was.',
  },
  {
    id: 't3',
    name: 'Sofia Lindqvist',
    role: 'Volunteer, Safe Haven Sanctuary',
    avatar: unsplash('photo-1438761681033-6461ffad8d80', 160),
    rating: 5,
    quote:
      'From the shelter side it is the first system that has not created more admin than it saves. Our listings get seen and the applicants are serious.',
  },
  {
    id: 't4',
    name: 'James Whitfield',
    role: 'Adopted Bella, 2024',
    avatar: unsplash('photo-1507003211169-0a1dd7228f2d', 160),
    rating: 4,
    quote:
      'Being able to message the shelter directly made the difference. They knew Bella needed a quiet home and told me so before I applied.',
  },
];

export interface CareTip {
  id: string;
  title: string;
  excerpt: string;
  image: string;
  readingTime: string;
  category: string;
}

export const careTips: CareTip[] = [
  {
    id: 'c1',
    title: 'The first 72 hours with a rescue dog',
    excerpt:
      'Why the "three-day decompression" matters more than training, and what to skip entirely in week one.',
    image: unsplash('photo-1587300003388-59208cc962cb', 700),
    readingTime: '6 min read',
    category: 'New adopters',
  },
  {
    id: 'c2',
    title: 'Introducing a cat to a home that already has one',
    excerpt:
      'Scent swapping, gradual introductions, and the signs that mean you should slow the process down.',
    image: unsplash('photo-1574144611937-0df059b5ef3e', 700),
    readingTime: '8 min read',
    category: 'Cats',
  },
  {
    id: 'c3',
    title: 'What adopting a senior pet is actually like',
    excerpt:
      'Older animals wait four times longer for a home. Here is an honest look at the costs and the rewards.',
    image: unsplash('photo-1568572933382-74d440642117', 700),
    readingTime: '5 min read',
    category: 'Senior pets',
  },
];
