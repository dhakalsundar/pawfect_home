/* eslint-disable no-console */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';

// Importing the models is what registers their schemas — and therefore their indexes — with
// mongoose. Without these imports `syncIndexes` would find nothing to do.
import '../models/User.js';
import '../models/RefreshToken.js';
import '../models/VerificationToken.js';
import '../models/NewsletterSubscriber.js';
import '../models/Shelter.js';
import '../models/Pet.js';
import '../models/AdoptionApplication.js';
import '../models/Favorite.js';
import '../models/AuditLog.js';
import '../models/Notification.js';
import '../models/Conversation.js';
import '../models/Message.js';
import '../models/Donation.js';
import '../models/Payment.js';
import '../models/Review.js';

/**
 * Creates every declared index against the connected database.
 *
 * `config/db.ts` sets `autoIndex: true` only in development, because building indexes implicitly on
 * boot is a foot-gun in production: a large collection can block for minutes, and it happens on
 * whatever deploy happens to restart first. So production indexes are created deliberately, here.
 *
 * `syncIndexes()` also DROPS indexes that are no longer declared in the schemas — which is the
 * point (Batch 15 changed several sort indexes to append `_id`, and the old ones are dead weight),
 * but it means this should be run knowingly rather than on every deploy.
 *
 * Usage:  MONGODB_URI="<uri>" npx tsx src/scripts/sync-indexes.ts
 */
async function main(): Promise<void> {
  await connectDB();

  const dbName = mongoose.connection.name;
  console.log(`\nSynchronising indexes on "${dbName}"…\n`);

  let created = 0;
  let dropped = 0;

  for (const [name, model] of Object.entries(mongoose.models)) {
    // Returns the names of indexes it removed; anything declared but missing is created.
    const removed = await model.syncIndexes();
    const indexes = await model.collection.indexes();

    created += indexes.length;
    dropped += removed.length;

    const detail = removed.length > 0 ? `  (dropped ${removed.join(', ')})` : '';
    console.log(`  ${name.padEnd(22)} ${String(indexes.length).padStart(2)} indexes${detail}`);
  }

  console.log(`\n${created} indexes in place, ${dropped} stale index(es) dropped.`);
  console.log('Verify the query plans next:  npx tsx src/scripts/index-audit.ts\n');

  await disconnectDB();
}

main().catch((error: unknown) => {
  console.error('Index sync failed:', error);
  process.exit(1);
});
