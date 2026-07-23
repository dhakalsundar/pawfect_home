import type { Metadata } from 'next';
import { Separator } from '@/components/ui/separator';
import { PreferencesForm } from '@/features/dashboard/components/preferences-form';
import { PasswordForm } from '@/features/dashboard/components/password-form';
import { TwoFactorSettings } from '@/features/dashboard/components/two-factor-settings';
import { ActiveSessions } from '@/features/dashboard/components/active-sessions';
import { DataPortability } from '@/features/dashboard/components/data-portability';
import { DeleteAccount } from '@/features/dashboard/components/delete-account';
import { ThemePreference } from '@/features/dashboard/components/theme-preference';
import { requireSession } from '@/services/session';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      <p className="text-muted-foreground mt-1 mb-4 text-sm">{description}</p>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const user = await requireSession();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Notifications, appearance and account.</p>
      </div>

      <div className="flex flex-col gap-10">
        <SettingsSection
          id="notifications-heading"
          title="Notifications"
          description="Changes save as you make them."
        >
          <PreferencesForm user={user} />
        </SettingsSection>

        <Separator />

        <SettingsSection
          id="appearance-heading"
          title="Appearance"
          description="Applies to this browser."
        >
          <ThemePreference />
        </SettingsSection>

        <Separator />

        <SettingsSection
          id="password-heading"
          title="Password"
          description="Use a password you don't use anywhere else."
        >
          <PasswordForm user={user} />
        </SettingsSection>

        <Separator />

        <SettingsSection
          id="two-factor-heading"
          title="Two-factor authentication"
          description="Add a second step at sign-in using an authenticator app, so a stolen password isn't enough on its own."
        >
          <TwoFactorSettings user={user} />
        </SettingsSection>

        <Separator />

        <SettingsSection
          id="sessions-heading"
          title="Active sessions"
          description="Devices currently signed in to your account. Sign out any you don't recognise."
        >
          <ActiveSessions />
        </SettingsSection>

        <Separator />

        <SettingsSection
          id="data-heading"
          title="Your data"
          description="Export a copy of your data, or restore your profile settings from a previous export."
        >
          <DataPortability />
        </SettingsSection>

        <Separator />

        <SettingsSection
          id="danger-heading"
          title="Danger zone"
          description="Irreversible actions."
        >
          <DeleteAccount user={user} />
        </SettingsSection>
      </div>
    </div>
  );
}
