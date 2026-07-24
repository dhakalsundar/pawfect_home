/* eslint-disable no-console */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { seedDatabase } from './seed.js';
import { Pet } from '../models/Pet.js';
import { Review } from '../models/Review.js';
import { Donation } from '../models/Donation.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { AdoptionApplication } from '../models/AdoptionApplication.js';
import { Notification } from '../models/Notification.js';

/**
 * Index audit — checks the queries the app actually runs against real execution plans.
 *
 * Declaring an index proves nothing: the planner may still choose a collection scan if the query
 * shape does not match the index prefix, if a sort cannot be served from it, or if a `$regex`
 * defeats it. This runs `explain('executionStats')` on each hot query and fails on:
 *
 *   - COLLSCAN — no index used at all
 *   - SORT     — an in-memory sort, which is capped at 32 MB and falls over on a big collection
 *   - a scanned:returned ratio worse than the threshold, meaning a wide index scan
 *
 * Run with:  npx tsx src/scripts/index-audit.ts
 */

let failures = 0;

interface PlanStage {
  stage: string;
  inputStage?: PlanStage;
  inputStages?: PlanStage[];
}

/** Flattens the plan tree into a list of stage names. */
function stages(plan: PlanStage | undefined): string[] {
  if (!plan) return [];
  return [
    plan.stage,
    ...stages(plan.inputStage),
    ...(plan.inputStages ?? []).flatMap((stage) => stages(stage)),
  ];
}

interface ExplainResult {
  queryPlanner: { winningPlan: PlanStage };
  executionStats: {
    nReturned: number;
    totalDocsExamined: number;
    totalKeysExamined: number;
    executionTimeMillis: number;
  };
}

async function audit(
  label: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: { explain: (verbosity: string) => Promise<any> },
  options: { maxRatio?: number; allowSort?: boolean } = {},
): Promise<void> {
  const { maxRatio = 10, allowSort = false } = options;

  const result = (await query.explain('executionStats')) as ExplainResult;
  const plan = stages(result.queryPlanner.winningPlan);
  const stats = result.executionStats;

  const problems: string[] = [];

  if (plan.includes('COLLSCAN')) problems.push('COLLSCAN — no index used');
  if (!allowSort && plan.includes('SORT')) problems.push('in-memory SORT — not served by an index');

  // A count of 0 returned is fine (an empty result set still proves the index was used).
  const ratio = stats.nReturned > 0 ? stats.totalDocsExamined / stats.nReturned : 0;
  if (ratio > maxRatio) {
    problems.push(`examined ${stats.totalDocsExamined} docs to return ${stats.nReturned}`);
  }

  const summary =
    `${String(stats.nReturned).padStart(4)} returned, ` +
    `${String(stats.totalDocsExamined).padStart(5)} examined, ` +
    `${String(stats.totalKeysExamined).padStart(5)} keys, ` +
    `${stats.executionTimeMillis}ms`;

  if (problems.length === 0) {
    console.log(`  PASS  ${label.padEnd(52)} ${summary}`);
  } else {
    console.log(`  FAIL  ${label.padEnd(52)} ${summary}`);
    for (const problem of problems) console.log(`        → ${problem}`);
    console.log(`        plan: ${plan.join(' ← ')}`);
    failures++;
  }
}

async function main(): Promise<void> {
  await connectDB();

  // The audit is only meaningful against a populated collection — a planner will happily scan
  // three documents. Seeding first guarantees 500 pets and a realistic review/donation spread.
  if ((await Pet.countDocuments()) < 100) {
    console.log('Seeding first (need a realistic dataset to judge a query plan)…\n');
    await seedDatabase();
  }

  console.log('\n=== Pets: the listing page ===');
  await audit(
    'available pets, newest first',
    Pet.find({ status: 'available', deletedAt: null }).sort({ createdAt: -1, _id: -1 }).limit(24),
  );
  await audit(
    'species + status + age range',
    Pet.find({ species: 'dog', status: 'available', ageInMonths: { $gte: 12, $lte: 60 } }).limit(24),
  );
  await audit('by slug (detail page)', Pet.find({ slug: 'nonexistent-slug-probe' }));
  await audit(
    'featured pets (home page)',
    Pet.find({ featured: true, status: 'available' }).limit(8),
  );
  await audit(
    "one shelter's pets",
    Pet.find({ shelter: 'b22b22b22b22b22b22b20000', status: 'available' }).limit(24),
  );

  console.log('\n=== Reviews ===');
  await audit(
    "a shelter's approved reviews",
    Review.find({ shelter: 'b22b22b22b22b22b22b20000', status: 'approved', isActive: true })
      .sort({ createdAt: -1, _id: -1 })
      .limit(10),
  );
  await audit(
    'moderation queue',
    Review.find({ status: 'pending', isActive: true }).sort({ createdAt: -1, _id: -1 }).limit(20),
  );

  console.log('\n=== Messaging ===');
  await audit(
    'my conversations, most recent first',
    Conversation.find({ participants: 'c33c33c33c33c33c33c30384' })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(50),
  );
  await audit(
    'a thread, newest first (cursor page)',
    Message.find({ conversation: new mongoose.Types.ObjectId(), deletedAt: null })
      .sort({ _id: -1 })
      .limit(30),
  );

  console.log('\n=== Adoptions & notifications ===');
  await audit(
    "a shelter's applications by status",
    AdoptionApplication.find({ shelter: 'b22b22b22b22b22b22b20000', status: 'pending' })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20),
  );
  await audit(
    'unread notification badge',
    Notification.find({ recipient: 'c33c33c33c33c33c33c30384', isRead: false })
      .sort({ createdAt: -1 })
      .limit(20),
  );

  console.log('\n=== Donations ===');
  await audit(
    'public donor wall',
    Donation.find({ status: 'succeeded' }).sort({ createdAt: -1, _id: -1 }).limit(12),
  );
  await audit(
    "a shelter's received donations",
    Donation.find({ shelter: 'b22b22b22b22b22b22b20000', status: 'succeeded' }).limit(20),
  );

  console.log('\n================================');
  console.log(failures === 0 ? 'ALL QUERIES INDEX-BACKED' : `${failures} QUERY PLAN(S) NEED WORK`);

  await disconnectDB();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error('Index audit crashed:', error);
  process.exit(1);
});
