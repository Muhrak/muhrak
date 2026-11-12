import { ConsoleShell } from "@/components/shell";
import { RequireAdmin } from "@/features/auth/guards";

/** Every console page needs a signed-in admin; the API checks the admin role again on every call. */
export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <RequireAdmin>
      <ConsoleShell>{children}</ConsoleShell>
    </RequireAdmin>
  );
}
