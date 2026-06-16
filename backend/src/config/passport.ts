import passport from 'passport';
import { Strategy as GoogleStrategy, type Profile } from 'passport-google-oauth20';
import { env } from './env.js';
import { logger } from './logger.js';

export interface GoogleProfileResult {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

/**
 * Google OAuth, registered only when credentials exist so the app still boots without them.
 *
 * Sessions are disabled throughout — passport is used purely to complete the OAuth handshake, and
 * our own JWT cookies carry the session from there. Adding express-session just for passport would
 * mean a second, redundant session store.
 */
export function configurePassport(): void {
  if (!env.isConfigured.google) {
    logger.warn('Google OAuth not configured — /auth/google will return 503.');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        callbackURL: `${env.API_PREFIX}/auth/google/callback`,
        scope: ['profile', 'email'],
        // Required so we receive the callback on our own origin behind a proxy.
        proxy: true,
      },
      (_accessToken, _refreshToken, profile: Profile, done) => {
        const email = profile.emails?.[0];

        if (!email?.value) {
          return done(new Error('Google account did not provide an email address.'));
        }

        const result: GoogleProfileResult = {
          googleId: profile.id,
          email: email.value.toLowerCase(),
          name: profile.displayName || email.value.split('@')[0] || 'PawfectHome user',
          ...(profile.photos?.[0]?.value ? { avatarUrl: profile.photos[0].value } : {}),
          // passport-google-oauth20 exposes this as a string on the raw profile.
          emailVerified:
            (email as { verified?: boolean | string }).verified === true ||
            (email as { verified?: boolean | string }).verified === 'true',
        };

        /**
         * `done` is typed to hand back an Express.User — passport's model, where the strategy
         * resolves the final authenticated principal. We deliberately pass the raw Google profile
         * instead: account lookup and creation belong in auth.service, alongside the email-
         * verification check that decides whether linking by address is safe. The custom callback
         * in auth.google.ts receives this value and does that work.
         */
        return done(null, result as unknown as Express.User);
      },
    ),
  );

  logger.info('Google OAuth configured.');
}

export { passport };
