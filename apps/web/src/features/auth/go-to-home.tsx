"use client";

import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { browser } from "react-dom";
import { HOME_PATH, LOGIN_PATH } from "./paths";
import { useSession } from "./session";

/**
 * Old Day 1 account page: go to the dashboard of the side the user is signed
 * in on (buyer first), or to the buyer login. Each side's session is read on
 * its own; they are never mixed.
 */
export function GoToHome() {
  use(browser("The session is stored in localStorage."));
  const buyer = useSession("buyer");
  const seller = useSession("seller");
  const router = useRouter();
  useEffect(() => {
    router.replace(buyer ? HOME_PATH.buyer : seller ? HOME_PATH.seller : LOGIN_PATH.buyer);
  }, [buyer, seller, router]);
  return null;
}
