export type UserRole = 'user' | 'shelter' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';
export type AuthProvider = 'credentials' | 'google';

/** Mirrors PublicUser in backend/src/modules/auth/auth.service.ts. */
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  provider: AuthProvider;
  avatar?: { url: string; publicId: string };
  phone?: string;
  bio?: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  shelterId?: string;
  preferences: {
    emailNotifications: boolean;
    pushNotifications: boolean;
    newsletter: boolean;
    theme: 'light' | 'dark' | 'system';
  };
  createdAt: string;
}
