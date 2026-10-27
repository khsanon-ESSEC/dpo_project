/**
 * Organisation en mémoire : la division compte quelques dizaines de personnes,
 * on la charge en entier une fois par requête et on calcule les liens ici.
 */
import "server-only";
import { cache } from "react";
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
