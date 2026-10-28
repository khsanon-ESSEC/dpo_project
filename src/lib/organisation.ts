/**
 * Organisation en mémoire : la division compte quelques dizaines de personnes,
 * on la charge en entier une fois par requête et on calcule les liens ici.
 */
import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { resoudreSuperieur, type OrgDonnees } from "./regles";

export const chargerOrganisation = cache(async (): Promise<OrgDonnees> => {
  const [personnes, equipes] = await Promise.all([
    db
      .select({
        id: schema.personnes.id,
        prenom: schema.personnes.prenom,
        nom: schema.personnes.nom,
        poste: schema.personnes.poste,
        courriel: schema.personnes.courriel,
        equipeId: schema.personnes.equipeId,
        superieurId: schema.personnes.superieurId,
        directeur: schema.personnes.directeur,
        executif: schema.personnes.executif,
        administrateur: schema.personnes.administrateur,
        actif: schema.personnes.actif,
        externe: schema.personnes.externe,
        organisation: schema.personnes.organisation,
        acces: sql<boolean>`${schema.personnes.motDePasseHash} is not null`,
      })
      .from(schema.personnes),
    db.select().from(schema.equipes),
  ]);
  return {
    personnes: new Map(personnes.map((p) => [p.id, p])),
    equipes: new Map(equipes.map((e) => [e.id, e])),
  };
});

export async function superieurDe(personneId: string) {
  const org = await chargerOrganisation();
  return resoudreSuperieur(org, personneId);
}

export { initiales, nomComplet } from "./regles";

/**
 * Une personne lue en base, hors du cache de la requête : pour une fiche hors division qui vient
 * d'être créée dans la même requête (réunion, tâche, équipe projet).
 */
export async function personneActuelle(id: string | null | undefined) {
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [p] = await db
    .select({ id: schema.personnes.id, actif: schema.personnes.actif, externe: schema.personnes.externe, acces: sql<boolean>`${schema.personnes.motDePasseHash} is not null` })
    .from(schema.personnes)
    .where(eq(schema.personnes.id, id))
    .limit(1);
  return p ?? null;
}
