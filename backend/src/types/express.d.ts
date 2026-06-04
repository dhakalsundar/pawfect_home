export type UserRole = 'user' | 'shelter' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';

/** The authenticated principal, attached by the `authenticate` middleware. */
export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  shelterId?: string;
  status: UserStatus;
  tokenVersion: number;
}

declare global {
  namespace Express {
    /**
     * Passport's own type definitions declare `Request.user?: Express.User`, where `User` is an
     * empty interface meant to be augmented by the application. Augmenting `User` here — rather
     * than re-declaring `Request.user` — is what makes `req.user.id` resolve; declaring the
     * property directly would collide with passport's declaration and lose the type entirely.
     */
    interface User extends AuthenticatedUser {}

    interface Request {
      /** Correlation id assigned by pino-http; surfaced in logs and error reports. */
      id?: string;
    }
  }
}
