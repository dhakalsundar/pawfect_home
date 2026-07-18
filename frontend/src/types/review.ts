export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Review {
  id: string;
  rating: number;
  title?: string;
  comment: string;
  images: { url: string }[];
  author: { id: string; name: string; avatar?: string };
  /** Earned by a completed adoption with this shelter — never self-declared. */
  verified: boolean;
  status: ReviewStatus;
  helpfulCount: number;
  markedHelpful?: boolean;
  shelterReply?: { body: string; at: string };
  shelter?: { id: string; name: string; slug: string };
  moderationNote?: string;
  createdAt: string;
}

export interface RatingBreakdown {
  average: number;
  count: number;
  /** Star value → number of reviews. Keys are 1–5. */
  distribution: Record<string, number>;
}
