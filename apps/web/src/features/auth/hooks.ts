"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { getMe, logout } from "./api";
import { LOGIN_PATH, type PortalSide } from "./paths";
import { clearSession, getSession, updateSessionUser, useSession } from "./session";

/**
 * The signed-in user of `side`. Starts from the stored copy so the page
 * renders at once, then checks with the API (which also catches revoked
 * sessions).
 */
export function useCurrentUser(side: PortalSide) {
  const session = useSession(side);
  const query = useQuery({
    queryKey: ["auth", "me", side, session?.user.id],
    queryFn: async () => {
      const user = await getMe(side);
      updateSessionUser(side, user);
      return user;
    },
    enabled: Boolean(session),
    staleTime: 5 * 60_000,
  });
  return query.data ?? session?.user ?? null;
}

/**
 * Log out of `side` here and in every other open tab, then go to that
 * side's login page. The other side's session is left alone.
 */
export function useSignOut(side: PortalSide) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(
    async () => {
      const session = getSession(side);
      clearSession(side);
      queryClient.clear();
      router.replace(LOGIN_PATH[side]);
      // Revoke the refresh token on the server. Best effort: the local session is already gone.
      if (session) await logout(session.refreshToken).catch(() => undefined);
    },
    [side, queryClient, router],
  );
}
