"use client";

import type { Role } from "@muhrak/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { getMe, logout } from "./api";
import { loginPathFor } from "./paths";
import { clearSession, getSession, updateSessionUser, useSession } from "./session";

/**
 * The signed-in user. Starts from the stored copy so the page renders at
 * once, then checks with the API (which also catches revoked sessions).
 */
export function useCurrentUser() {
  const session = useSession();
  const query = useQuery({
    queryKey: ["auth", "me", session?.user.id],
    queryFn: async () => {
      const user = await getMe();
      updateSessionUser(user);
      return user;
    },
    enabled: Boolean(session),
    staleTime: 5 * 60_000,
  });
  return query.data ?? session?.user ?? null;
}

/** Log out here and in every other open tab, then go to the login page for this role. */
export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(
    async (role: Role) => {
      const session = getSession();
      clearSession();
      queryClient.clear();
      router.replace(loginPathFor(role));
      // Revoke the refresh token on the server. Best effort: the local session is already gone.
      if (session) await logout(session.refreshToken).catch(() => undefined);
    },
    [queryClient, router],
  );
}
