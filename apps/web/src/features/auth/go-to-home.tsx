"use client";

import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { browser } from "react-dom";
import { HOME_PATH, LOGIN_PATH } from "./paths";
import { useSession } from "./session";

/** Redirect to the signed-in user's dashboard, or to the buyer login. */
export function GoToHome() {
  use(browser("The session is stored in localStorage."));
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    router.replace(session ? HOME_PATH[session.user.role] : LOGIN_PATH.buyer);
  }, [session, router]);
  return null;
}
