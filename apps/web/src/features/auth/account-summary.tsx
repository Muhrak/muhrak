"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMe, logout } from "./api";
import { clearSession, readSession } from "./session";

const noopSubscribe = () => () => {};

/** Read the stored session on the client only (localStorage does not exist on the server). */
function useStoredSession() {
  const raw = useSyncExternalStore(
    noopSubscribe,
    () => JSON.stringify(readSession()),
    () => undefined,
  );
  if (raw === undefined) return { ready: false as const };
  return { ready: true as const, session: readSession() };
}

export function AccountSummary() {
  const router = useRouter();
  const stored = useStoredSession();
  const accessToken = stored.ready ? stored.session?.accessToken : undefined;

  const me = useQuery({
    queryKey: ["auth", "me", accessToken],
    queryFn: () => getMe(accessToken as string),
    enabled: Boolean(accessToken),
  });

  async function signOut() {
    const refreshToken = stored.ready ? stored.session?.refreshToken : undefined;
    if (refreshToken) await logout(refreshToken).catch(() => undefined);
    clearSession();
    router.push("/buyer/login");
  }

  if (!stored.ready || (accessToken && me.isPending)) {
    return <p className="text-center text-muted-foreground">Loading…</p>;
  }

  if (!accessToken || me.isError) {
    return (
      <Card className="[--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="text-xl">You are not signed in</CardTitle>
          <CardDescription>
            {me.isError ? "Your session has ended. Please log in again." : "Log in to see your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/buyer/login" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
            Log in
          </Link>
        </CardContent>
      </Card>
    );
  }

  const user = me.data;
  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-xl">Welcome, {user?.fullName}</CardTitle>
        <CardDescription>You are signed in.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{user?.email}</dd>
          <dt className="text-muted-foreground">Account type</dt>
          <dd className="capitalize">{user?.role}</dd>
        </dl>
        <Button variant="outline" size="lg" className="h-10" onClick={signOut}>
          Log out
        </Button>
      </CardContent>
    </Card>
  );
}
