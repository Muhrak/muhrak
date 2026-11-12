import { db } from "../../db/client";
import { auditLog } from "../../db/schema";

/** Repository layer: database queries only. The audit log is append only: no update or delete here, ever. */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;

export async function insertAuditEntry(values: typeof auditLog.$inferInsert, ex: Executor = db): Promise<void> {
  await ex.insert(auditLog).values(values);
}
