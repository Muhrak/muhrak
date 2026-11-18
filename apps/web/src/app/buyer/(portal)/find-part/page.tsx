import { redirect } from "next/navigation";

/** Older links ("Ask Muhrak AI" before Day 8) pointed here; photo search lives at /ai. */
export default function Page() {
  redirect("/ai");
}
