export type ApplicationStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
  | 'completed';

export interface ApplicationAnswers {
  housingType: 'house' | 'apartment' | 'condo' | 'other';
  ownOrRent: 'own' | 'rent';
  landlordApproval?: boolean;
  hasYard: boolean;
  householdSize: number;
  hasChildren: boolean;
  childrenAges?: number[];
  otherPets?: string;
  previousPets?: string;
  hoursAlonePerDay: number;
  experienceLevel: 'none' | 'some' | 'experienced';
  reasonForAdopting: string;
  vetName?: string;
  vetPhone?: string;
}

export interface ApplicationReference {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

/** Mirrors ApplicationDTO in backend/src/modules/adoptions/adoptions.service.ts. */
export interface Application {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  applicantSnapshot: { name: string; email: string; phone?: string };
  answers: ApplicationAnswers;
  references: ApplicationReference[];
  reviewNote?: string;
  withdrawnReason?: string;
  meetingScheduledAt?: string;
  statusHistory: { status: ApplicationStatus; note?: string; at: string }[];
  pet?: { id: string; slug: string; name: string; breed: string; image: string; status: string };
  shelter?: { id: string; name: string; slug: string };
  applicant?: { id: string; name: string; email: string };
}

interface StatusMeta {
  label: string;
  description: string;
  /** Tailwind classes for the badge. */
  tone: string;
}

export const STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  pending: {
    label: 'Submitted',
    description: 'The shelter has your application and will review it soon.',
    tone: 'bg-info/10 text-info border-0',
  },
  under_review: {
    label: 'Under review',
    description: 'The shelter is going through your answers now.',
    tone: 'bg-warning/15 text-warning border-0',
  },
  approved: {
    label: 'Approved',
    description: 'The shelter would like to move forward and arrange a meeting.',
    tone: 'bg-success/10 text-success border-0',
  },
  completed: {
    label: 'Adopted',
    description: 'The adoption is complete. Congratulations!',
    tone: 'bg-success/15 text-success border-0',
  },
  rejected: {
    label: 'Not successful',
    description: 'This match did not work out this time.',
    tone: 'bg-destructive/10 text-destructive border-0',
  },
  withdrawn: {
    label: 'Withdrawn',
    description: 'You withdrew this application.',
    tone: 'bg-muted text-muted-foreground border-0',
  },
};

/** The happy path, for the progress timeline. Rejected/withdrawn are terminal detours. */
export const STATUS_FLOW: ApplicationStatus[] = [
  'pending',
  'under_review',
  'approved',
  'completed',
];

export function isClosed(status: ApplicationStatus): boolean {
  return status === 'rejected' || status === 'withdrawn' || status === 'completed';
}

export function canWithdraw(status: ApplicationStatus): boolean {
  return status === 'pending' || status === 'under_review' || status === 'approved';
}
