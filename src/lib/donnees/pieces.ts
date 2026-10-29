/** Pièces jointes d'un rapport : dépôt par l'auteur (brouillon), lecture selon les règles du champ. */
import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { noter } from "@/lib/journal";
import { PIECES_MAX_PAR_CHAMP, verifierFichier } from "@/lib/pieces";
import { lireRapport } from "@/lib/donnees/rapport";

/** Les pièces d'un rapport, sans leur contenu. */
export async function piecesDuRapport(rapportId: string) {
  return db
    .select({ id: schema.piecesJointes.id, champId: schema.piecesJointes.champId, nom: schema.piecesJointes.nom, type: schema.piecesJointes.type, taille: schema.piecesJointes.taille, creeLe: schema.piecesJointes.creeLe })
    .from(schema.piecesJointes)
    .where(eq(schema.piecesJointes.rapportId, rapportId))
    .orderBy(asc(schema.piecesJointes.creeLe));
}
export type PieceLue = Awaited<ReturnType<typeof piecesDuRapport>>[number];

/** Dépose des fichiers dans un champ « Pièce jointe » d'un brouillon (l'appelant a vérifié que c'est le sien). */
export async function deposerPieces(rapportId: string, champId: string, fichiers: File[], auteurId: string): Promise<{ deposees: number; erreurs: string[] }> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.piecesJointes)
    .where(and(eq(schema.piecesJointes.rapportId, rapportId), eq(schema.piecesJointes.champId, champId)));
  let place = PIECES_MAX_PAR_CHAMP - Number(n);
  const erreurs: string[] = [];
  let deposees = 0;
  for (const f of fichiers) {
    if (!f || typeof f.arrayBuffer !== "function" || !f.name) continue;
    if (place <= 0) {
      erreurs.push(`Dix fichiers au plus : « ${f.name} » n'a pas été joint.`);
      continue;
    }
    const contenu = new Uint8Array(await f.arrayBuffer());
    const v = verifierFichier(f.name, contenu);
    if (!v.ok) {
      erreurs.push(v.erreur);
      continue;
    }
    const empreinte = createHash("sha256").update(contenu).digest("hex");
    const [p] = await db
      .insert(schema.piecesJointes)
      .values({ rapportId, champId, nom: v.nom, type: v.type, taille: contenu.length, empreinte, contenu: Buffer.from(contenu), deposeParId: auteurId })
      .returning({ id: schema.piecesJointes.id });
    await noter(auteurId, "piece_deposee", p.id, { rapport: rapportId, champ: champId, nom: v.nom, taille: contenu.length, empreinte });
    deposees += 1;
    place -= 1;
  }
  return { deposees, erreurs };
}

/** Retire une pièce d'un brouillon (l'appelant a vérifié que le rapport est le sien). */
export async function retirerPiece(pieceId: string, rapportId: string, auteurId: string) {
  const [p] = await db
    .delete(schema.piecesJointes)
    .where(and(eq(schema.piecesJointes.id, pieceId), eq(schema.piecesJointes.rapportId, rapportId)))
    .returning({ id: schema.piecesJointes.id, nom: schema.piecesJointes.nom });
  if (p) await noter(auteurId, "piece_retiree", p.id, { rapport: rapportId, nom: p.nom });
}

/**
 * Une pièce, avec son contenu, pour qui peut lire son champ : l'auteur, son supérieur, et la
 * direction si le champ ne lui est pas réservé. Un chef de projet ne lit pas les pièces jointes.
 */
export async function lirePiece(a: Acces, pieceId: string) {
  // D'abord où se trouve la pièce (sans le fichier) : le contenu n'est chargé que pour qui peut la lire.
  const [m] = await db.select({ rapportId: schema.piecesJointes.rapportId, champId: schema.piecesJointes.champId }).from(schema.piecesJointes).where(eq(schema.piecesJointes.id, pieceId)).limit(1);
  if (!m) return null;
  const lu = await lireRapport(a, m.rapportId);
  if (!lu || !lu.complet || !lu.formulaire.some((c) => c.id === m.champId && c.type === "piece_jointe")) return null;
  const [p] = await db.select().from(schema.piecesJointes).where(eq(schema.piecesJointes.id, pieceId)).limit(1);
  return p ?? null;
}
