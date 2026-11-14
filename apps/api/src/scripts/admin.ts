/**
 * Create an admin account, or set a new password for an existing admin.
 *
 *   pnpm --filter @muhrak/api admin
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
import { upsertAdminAccount } from "../modules/auth";

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

async function main() {
  console.log("Muhrak: create an admin, or set a new password for an existing admin.\n");
  const email = z.string().trim().toLowerCase().email().parse(await ask("Admin email: "));
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
      ? `\nAdmin ${email} created. Log in on the admin app.`
      : `\nNew password set for admin ${email}. Every session of this admin was signed out.`,
  );
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
