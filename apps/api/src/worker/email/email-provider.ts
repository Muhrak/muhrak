/** One rendered email, ready to send. */
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Provider-side duplicate guard: the same key is never sent twice. */
  idempotencyKey: string;
}

/** Anything that can deliver an email. Implementations live in ./providers. */
export interface EmailProvider {
  readonly name: string;
  send(email: OutgoingEmail): Promise<void>;
}

/** A failure that retrying will not fix (bad address, rejected sender). The job stops instead of retrying. */
export class PermanentEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentEmailError";
  }
}
