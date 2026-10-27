import "server-only";
import { db, schema } from "@/db";

/** Trace une action sensible. Ne bloque jamais l'action si l'écriture échoue. */
export async function noter(personneId: string | null, action: string, objet?: string | null, details?: Record<string, unknown>) {
  try {
    await db.insert(schema.journal).values({ personneId, action, objet: objet ?? null, details: details ?? null });
  } catch (e) {
    console.error("journal :", (e as Error).message);
  }
}
