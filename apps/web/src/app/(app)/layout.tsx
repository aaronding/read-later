import { AllowanceNotice } from "@/components/allowance-notice";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={user}>
      <AllowanceNotice userId={user.id} />
      {children}
    </AppShell>
  );
}
