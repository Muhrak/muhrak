"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { getMe, logout } from "./api";
import { LOGIN_PATH, type AuthSide } from "./paths";
import { clearSession, updateSessionUser, useSession } from "./session";

/**
 * The signed-in user of `side`. Starts from the stored copy so the page
 * renders at once, then checks with the API (which also catches revoked
 * sessions).
 */
export function useCurrentUser(side: AuthSide) {
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
export function useSignOut(side: AuthSide) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(
    async () => {
      clearSession(side);
      queryClient.clear();
      router.replace(LOGIN_PATH[side]);
      // Revoke the refresh token on the server and clear its httpOnly cookie
      // (only the server can). One retry if the network blips.
      await logout(side).catch(() => logout(side)).catch(() => undefined);
    },
    [side, queryClient, router],
  );
}
