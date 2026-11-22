/**
 * Create an admin account, or set a new password for an existing admin.
 *
 *   pnpm admin                 (in apps/api)
 *   pnpm admin change-email    move an existing admin to another email
 *   pnpm admin 2fa             set up (or replace) two-factor login
 *
 * Admins log in with their password AND a 6-digit code from an
 * authenticator app (22 Nov 2026). A new admin is asked to set it up right
 * away; an admin without it cannot log in.
 *
 * Asks for the email, name and password (the password is not shown while
 * typed and never printed or logged). There is no admin sign-up endpoint,
 * and admin passwords cannot be reset by email: this script is the only way.
 * Setting a new password signs that admin out everywhere.
 *
 * Against staging, run it inside the Railway API service:
 *   railway ssh --service muhrak  →  pnpm --filter @muhrak/api admin
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { z } from "zod";
import { pool } from "../db/client";
import { changeAdminEmail, confirmAdminTwoFactorSetup, startAdminTwoFactorSetup, upsertAdminAccount } from "../modules/auth";

const MIN_PASSWORD = 14;

/** One reader for all questions (so piped input works too); muted while a password is typed. */
let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
const lines = rl[Symbol.asyncIterator]();

/** Read one line; with `hidden`, nothing typed is echoed to the terminal. */
async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  muted = hidden;
  const next = await lines.next();
  muted = false;
  if (hidden) process.stdout.write("\n");
  if (next.done) throw new Error("No answer given. Nothing was changed.");
  return String(next.value).trim();
}

const emailSchema = z.string().trim().toLowerCase().email();

/** Same account, password and audit history; only the email changes. Signs that admin out everywhere. */
async function changeEmail() {
  console.log("Muhrak: move an existing admin to another email.\n");
  const currentEmail = emailSchema.parse(await ask("Current admin email: "));
  const newEmail = emailSchema.parse(await ask("New email: "));
  if ((await ask(`Type the new email again to confirm: `)).trim().toLowerCase() !== newEmail) {
    throw new Error("The emails do not match. Nothing was changed.");
  }
  await changeAdminEmail({ currentEmail, newEmail });
  console.log(`\nAdmin moved from ${currentEmail} to ${newEmail}. Every session of this admin was signed out.`);
}

/**
 * Two-factor login: show a new key, then save it only once a code from the
 * app matches. Replacing the key signs that admin out everywhere.
 */
async function setUpTwoFactor(knownEmail?: string) {
  if (!knownEmail) console.log("Muhrak: set up two-factor login for an admin.\n");
  const email = knownEmail ?? emailSchema.parse(await ask("Admin email: "));
  const { key, uri } = await startAdminTwoFactorSetup(email);
  console.log(
    [
      "",
      "In an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password...),",
      'add an account, choose "Enter a setup key", and type:',
      "",
      `  Account:  Muhrak Admin (${email})`,
      `  Key:      ${key.replace(/(.{4})/g, "$1 ").trim()}`,
      "  Type:     Time based",
      "",
      "Or paste this link into an app that accepts one:",
      `  ${uri}`,
      "",
      "Keep this key private. It is shown only now and stored encrypted.",
      "",
    ].join("\n"),
  );
  const code = await ask("Enter the 6-digit code the app shows now: ");
  await confirmAdminTwoFactorSetup({ email, key, code });
  console.log(`\nTwo-factor login is on for ${email}. Every session of this admin was signed out.`);
}

async function main() {
  if (process.argv[2] === "change-email") return changeEmail();
  if (process.argv[2] === "2fa") return setUpTwoFactor();
  console.log("Muhrak: create an admin, or set a new password for an existing admin.\n");
  const email = emailSchema.parse(await ask("Admin email: "));
  const fullName = z.string().trim().min(2).max(120).parse(await ask("Full name: "));
  const password = await ask(`Password (at least ${MIN_PASSWORD} characters, hidden): `, true);
  if (password.length < MIN_PASSWORD || password.length > 200) {
    throw new Error(`The password must be ${MIN_PASSWORD} to 200 characters.`);
  }
  if ((await ask("Repeat the password (hidden): ", true)) !== password) {
    throw new Error("The passwords do not match. Nothing was changed.");
  }
  const result = await upsertAdminAccount({ email, fullName, password });
  console.log(
    result === "created"
      ? `\nAdmin ${email} created. Now set up two-factor login (needed to log in).`
      : `\nNew password set for admin ${email}. Every session of this admin was signed out.`,
  );
  if (result === "created") await setUpTwoFactor(email);
}

main()
  .catch((error: unknown) => {
    console.error(`\nFailed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await pool.end();
  });
