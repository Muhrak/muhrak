import * as repo from "./audit.repository";

/**
 * Audit module: a permanent record of every admin action.
 *
 * Pass the caller's transaction (`ex`) so the audit row is saved together
 * with the change it describes: either both are written, or neither is.
 */
export interface AuditEntry {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export async function recordAudit(entry: AuditEntry, ex?: repo.Executor): Promise<void> {
  await repo.insertAuditEntry(
    {
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.details ?? {},
      ip: entry.ip ?? null,
    },
    ex,
  );
}
