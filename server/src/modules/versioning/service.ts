import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { versions, users } from '../../db/schema/index.js';

type EntityType = 'word' | 'attribute' | 'variable' | 'rule' | 'builder' | 'derivative_type';
type ChangeType = 'created' | 'updated' | 'deleted' | 'cascade';

export async function createVersion(
  entityType: EntityType,
  entityId: string,
  userId: string,
  snapshot: Record<string, unknown>,
  changeType: ChangeType,
) {
  return db.transaction(async (tx) => {
    // Get the next version number inside the transaction to prevent race conditions
    const lastVersion = await tx.select({ versionNumber: versions.versionNumber })
      .from(versions)
      .where(and(
        eq(versions.entityType, entityType),
        eq(versions.entityId, entityId),
      ))
      .orderBy(desc(versions.versionNumber))
      .limit(1);

    const versionNumber = (lastVersion[0]?.versionNumber ?? 0) + 1;

    const [version] = await tx.insert(versions).values({
      entityType,
      entityId,
      versionNumber,
      userId,
      snapshot,
      changeType,
    }).returning();

    return version;
  });
}

export async function getVersionHistory(entityType: EntityType, entityId: string) {
  // Join with users so the UI can show who made each change.
  return db
    .select({
      id: versions.id,
      entityType: versions.entityType,
      entityId: versions.entityId,
      versionNumber: versions.versionNumber,
      userId: versions.userId,
      snapshot: versions.snapshot,
      changeType: versions.changeType,
      createdAt: versions.createdAt,
      userName: users.displayName,
      userEmail: users.email,
    })
    .from(versions)
    .leftJoin(users, eq(versions.userId, users.id))
    .where(and(
      eq(versions.entityType, entityType),
      eq(versions.entityId, entityId),
    ))
    .orderBy(desc(versions.versionNumber));
}

export async function getVersionById(versionId: string) {
  const rows = await db
    .select({
      id: versions.id,
      entityType: versions.entityType,
      entityId: versions.entityId,
      versionNumber: versions.versionNumber,
      userId: versions.userId,
      snapshot: versions.snapshot,
      changeType: versions.changeType,
      createdAt: versions.createdAt,
      userName: users.displayName,
      userEmail: users.email,
    })
    .from(versions)
    .leftJoin(users, eq(versions.userId, users.id))
    .where(eq(versions.id, versionId))
    .limit(1);
  return rows[0];
}
