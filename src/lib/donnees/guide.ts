/**
 * Le guide côté serveur (29 octobre 2026) : les droits de la personne sur les fiches (les mêmes que pour les
 * actions de la barre), et ce qu'on garde pour enrichir le guide, sans rien qui relie à la personne : les fiches
 * ouvertes (un compte) et les questions restées sans réponse (nettoyées des noms, courriels et numéros).
 */
import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces } from "@/lib/acces";
import type { Utilisateur } from "@/lib/auth/session";
import type { Permission } from "@/lib/commandes";
import { donneesCommandes } from "@/lib/donnees/commandes";
import { ficheParId, nettoyerQuestion } from "@/lib/guide";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";

/** Ce que la personne a le droit de voir dans le guide : les mêmes règles que les actions de la barre (« > »). */
export async function permisDuGuide(u: Utilisateur): Promise<(p: Permission) => boolean> {
  const a = await acces(u);
  const c = await donneesCommandes(u, a);
  return (p) => (p === "tous" ? true : p === "gere" ? c.geres.length > 0 : p === "registres" ? c.registres.length > 0 : c.droits[p]);
}

/** Une question sans réponse, gardée pour enrichir le guide : sans nom ni numéro, et sans dire qui l'a posée. */
export async function noterQuestionSansReponse(question: string, ecran: string) {
  const org = await chargerOrganisation();
  const noms = [...org.personnes.values()].flatMap((p) => [p.prenom, p.nom, `${p.prenom} ${p.nom}`]);
  const texte = nettoyerQuestion(question, noms);
  if (texte.length < 3) return;
  await noter(null, "guide_sans_reponse", ecran, { texte });
}

/** Une fiche ouverte : un compte, sans la personne. */
export async function noterFicheOuverte(id: string) {
  await noter(null, "guide_fiche", id);
}

/** Pour le suivi du pilote : les questions restées sans réponse et les fiches les plus ouvertes, depuis une date. */
export async function suiviDuGuide(depuis: Date) {
  const fois = sql<number>`count(*)::int`;
  const [sansReponse, fiches] = await Promise.all([
    db
      .select({ texte: sql<string>`${schema.journal.details}->>'texte'`, fois, derniere: sql<Date>`max(${schema.journal.creeLe})` })
      .from(schema.journal)
      .where(and(eq(schema.journal.action, "guide_sans_reponse"), gte(schema.journal.creeLe, depuis)))
      .groupBy(sql`${schema.journal.details}->>'texte'`)
      .orderBy(desc(fois), desc(sql`max(${schema.journal.creeLe})`))
      .limit(30),
    db
      .select({ id: schema.journal.objet, fois })
      .from(schema.journal)
      .where(and(eq(schema.journal.action, "guide_fiche"), gte(schema.journal.creeLe, depuis)))
      .groupBy(schema.journal.objet)
      .orderBy(desc(fois))
      .limit(10),
  ]);
  return {
    sansReponse: sansReponse.filter((q) => q.texte).map((q) => ({ texte: q.texte, fois: Number(q.fois) })),
    fiches: fiches.map((f) => ({ id: f.id ?? "", titre: ficheParId(f.id ?? "")?.titre ?? f.id ?? "", fois: Number(f.fois) })).filter((f) => f.id),
  };
}
