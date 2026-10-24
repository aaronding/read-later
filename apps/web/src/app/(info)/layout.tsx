import { AppShell, PublicShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";

// About and Privacy are for anyone, signed in or not: Google's consent screen
// links to the privacy policy. Signed in, they sit inside the app.
export default async function InfoLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return user ? <AppShell user={user}>{children}</AppShell> : <PublicShell>{children}</PublicShell>;
}
