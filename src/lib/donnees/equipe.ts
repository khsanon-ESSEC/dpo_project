import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { aujourdhui, dateLocale } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { initiales, membresDeLaDirection, nomComplet, resoudreSuperieur } from "@/lib/regles";
import type { Acces } from "@/lib/acces";
import { semaineCourante, statutsRapports } from "./rapport";
import { compter, tachesDe } from "./semaine";

/**
 * L'équipe de la semaine. Un directeur ou un exécutif voit toute la structure sous lui (ses
 * subordonnés, les leurs, et ainsi de suite), regroupée par équipe ; les autres, leurs subordonnés directs.
 */
export async function monEquipe(a: Acces) {
  const org = await chargerOrganisation();
  const toute = a.directeur || a.toutVoir;
  const ids = toute ? [...membresDeLaDirection(org, a.moi.id)] : a.equipeDirecte;
  const semaine = semaineCourante();
  const [taches, statuts] = await Promise.all([tachesDe(ids, { semaine }), statutsRapports(ids, semaine)]);
  const jour = aujourdhui();

  const personnes = ids.map((id) => {
    const p = org.personnes.get(id)!;
    const siennes = taches.filter((t) => t.assigneId === id);
    const c = compter(siennes, jour);
    const r = statuts.get(id);
    const sup = resoudreSuperieur(org, id);
    return {
      id,
      nom: nomComplet(p),
      initiales: initiales(p),
      poste: p.poste,
      superieurId: sup?.id ?? null,
      direct: sup?.id === a.moi.id,
      rapport: r?.statut === "envoye" ? { id: r.id, envoyeLe: r.envoyeLe } : null,
      ...c,
      projets: [...new Set(siennes.map((t) => t.projetCode).filter(Boolean))] as string[],
    };
  });
  // Les personnes sans rapport d'abord, puis celles qui ont des blocages.
  personnes.sort((x, y) => Number(!!x.rapport) - Number(!!y.rapport) || y.bloquees - x.bloquees || x.nom.localeCompare(y.nom, "fr"));

  // Groupes, du haut vers le bas de la structure : avec moi, puis l'équipe de chacun de mes chefs, etc.
  const groupes: { chefId: string; titre: string; sous: string; personnes: typeof personnes }[] = [];
  const dansLaListe = new Set(ids);
  const aVoir = [a.moi.id];
  const vus = new Set<string>();
  while (aVoir.length) {
    const chefId = aVoir.shift()!;
    if (vus.has(chefId)) continue;
    vus.add(chefId);
    const membres = personnes.filter((p) => p.superieurId === chefId && dansLaListe.has(p.id));
    if (!membres.length) continue;
    const chef = org.personnes.get(chefId);
    const equipe = chef ? [...org.equipes.values()].find((e) => e.chefId === chefId) : undefined;
    groupes.push({
      chefId,
      titre: chefId === a.moi.id ? "Avec vous" : `Équipe de ${chef ? nomComplet(chef) : "?"}`,
      sous: chefId === a.moi.id ? "Ils vous envoient leur rapport" : [equipe?.nom, chef?.poste].filter(Boolean).join(" · "),
      personnes: membres,
    });
    // Les chefs de ce groupe ouvrent les groupes suivants, dans l'ordre alphabétique.
    for (const m of [...membres].sort((x, y) => x.nom.localeCompare(y.nom, "fr"))) aVoir.push(m.id);
  }

  const bloquees = ids.length
    ? await db
        .select({ id: schema.taches.id, titre: schema.taches.titre, assigneId: schema.taches.assigneId, majLe: schema.taches.majLe, projet: schema.projets.titre })
        .from(schema.taches)
        .leftJoin(schema.projets, eq(schema.projets.id, schema.taches.projetId))
        .where(and(inArray(schema.taches.assigneId, ids), eq(schema.taches.statut, "bloquee")))
        .orderBy(asc(schema.taches.majLe))
    : [];

  const charge = new Map<string, number>();
  for (const t of taches) if (t.statut !== "faite" && t.projetTitre) charge.set(t.projetTitre, (charge.get(t.projetTitre) ?? 0) + 1);

  return {
    semaine,
    toute,
    personnes,
    groupes,
    recus: personnes.filter((p) => p.rapport).length,
    manquants: personnes.filter((p) => !p.rapport),
    /** On relance les personnes qui nous envoient leur rapport ; les autres, leur chef s'en charge. */
    aRelancer: personnes.filter((p) => !p.rapport && p.direct),
    totaux: {
      bloquees: personnes.reduce((s, p) => s + p.bloquees, 0),
      retard: personnes.reduce((s, p) => s + p.retard, 0),
      faites: personnes.reduce((s, p) => s + p.faites, 0),
    },
    blocages: bloquees.map((b) => ({ ...b, qui: nomComplet(org.personnes.get(b.assigneId)!), depuis: dateLocale(b.majLe) })),
    charge: [...charge.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8),
  };
}

export async function relancer(a: Acces, personneIds: string[]) {
  const autorises = personneIds.filter((id) => a.equipeDirecte.includes(id));
  if (!autorises.length) return 0;
  const org = await chargerOrganisation();
  const moi = org.personnes.get(a.moi.id)!;
  await db.insert(schema.notifications).values(
    autorises.map((id) => ({ personneId: id, type: "relance", texte: `${nomComplet(moi)} attend votre rapport du vendredi`, lien: "/rapport" })),
  );
  return autorises.length;
}
