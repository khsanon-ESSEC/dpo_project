import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { hacherMotDePasse } from "@/lib/auth/session";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { initiales, libellesRoles, nomComplet, resoudreSuperieur, subordonnesDirects, type Roles } from "@/lib/regles";

export async function vueOrganisation() {
  const org = await chargerOrganisation();
  const projets = await db.select({ code: schema.projets.code, titre: schema.projets.titre, chefId: schema.projets.chefProjetId, referentId: schema.projets.referentId }).from(schema.projets).orderBy(asc(schema.projets.titre));
  const caps = new Map((await db.select({ id: schema.personnes.id, c: schema.personnes.capaciteHeures }).from(schema.personnes)).map((x) => [x.id, x.c]));
  const equipes = [...org.equipes.values()].sort((a, b) => (a.equipeParenteId ? 1 : 0) - (b.equipeParenteId ? 1 : 0) || a.nom.localeCompare(b.nom, "fr"));
  const toutes = [...org.personnes.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  // La division d'un côté ; les personnes hors division (autres départements, consultants) de l'autre.
  const personnes = toutes.filter((p) => !p.externe);
  const externes = toutes.filter((p) => p.externe);
  const ouvertes = externes.length
    ? await db
        .select({ id: schema.taches.assigneId })
        .from(schema.taches)
        .where(and(inArray(schema.taches.assigneId, externes.map((p) => p.id)), ne(schema.taches.statut, "faite"), isNull(schema.taches.annuleeLe)))
    : [];
  const equipesProjet = externes.length
    ? await db
        .select({ personneId: schema.membresProjet.personneId, code: schema.projets.code })
        .from(schema.membresProjet)
        .innerJoin(schema.projets, eq(schema.projets.id, schema.membresProjet.projetId))
        .where(inArray(schema.membresProjet.personneId, externes.map((p) => p.id)))
    : [];
  const fiche = (id: string) => {
    const p = org.personnes.get(id)!;
    const sup = resoudreSuperieur(org, id);
    const designe = p.superieurId ? org.personnes.get(p.superieurId) : null;
    return {
      ...p,
      nomComplet: nomComplet(p),
      initiales: initiales(p),
      superieurEffectif: sup ? nomComplet(sup) : null,
      superieurVacant: !designe || !designe.actif,
      equipeNom: p.equipeId ? org.equipes.get(p.equipeId)?.nom ?? "" : "",
      nbRapports: subordonnesDirects(org, id).length,
      capaciteHeures: caps.get(id) ?? 40,
      projetsDiriges: projets.filter((pr) => pr.chefId === id || pr.referentId === id).map((pr) => pr.titre),
    };
  };
  const roles = (f: ReturnType<typeof fiche>) => libellesRoles({ ...f, nbProjetsDiriges: f.projetsDiriges.length });
  return {
    equipes: equipes.map((e) => ({
      ...e,
      chef: e.chefId ? fiche(e.chefId) : null,
      membres: personnes.filter((p) => p.equipeId === e.id && p.id !== e.chefId).map((p) => fiche(p.id)),
      parent: e.equipeParenteId ? org.equipes.get(e.equipeParenteId)?.nom ?? null : null,
    })),
    sansEquipe: personnes.filter((p) => !p.equipeId).map((p) => fiche(p.id)),
    personnes: personnes.map((p) => ({ ...fiche(p.id), roles: roles(fiche(p.id)) })),
    externes: externes.map((p) => ({
      ...p,
      nomComplet: nomComplet(p),
      initiales: initiales(p),
      nbTaches: ouvertes.filter((t) => t.id === p.id).length,
      projets: [...new Set(equipesProjet.filter((m) => m.personneId === p.id).map((m) => m.code))],
    })),
    total: personnes.filter((p) => p.actif).length,
    vacants: equipes.filter((e) => !e.chefId).length,
    administrateurs: personnes.filter((p) => p.actif && p.administrateur).length,
    executifs: personnes.filter((p) => p.actif && p.executif).length,
  };
}

export type ModificationPersonne = Roles & {
  capaciteHeures: number;
  equipeId: string | null;
  superieurId: string | null;
  poste: string;
  actif: boolean;
};

/** Il reste toujours au moins un administrateur en poste : sinon personne ne pourrait plus gérer les accès. */
async function verifierDernierAdministrateur(personneId: string, resteAdministrateur: boolean) {
  if (resteAdministrateur) return;
  const org = await chargerOrganisation();
  const admins = [...org.personnes.values()].filter((p) => p.actif && p.administrateur);
  if (admins.length === 1 && admins[0].id === personneId) {
    throw new Error("C'est le dernier administrateur : nommez d'abord quelqu'un d'autre administrateur.");
  }
}

/**
 * Une personne hors division n'a ni rôle, ni équipe, ni supérieur ici, et n'est le supérieur ni le chef
 * d'équipe de personne : sa fiche se gère dans « Hors division ».
 */
async function verifierInterne(personneId: string | null, superieurId: string | null) {
  const org = await chargerOrganisation();
  if (personneId && org.personnes.get(personneId)?.externe) throw new Error("Cette personne est hors division : modifiez sa fiche dans « Hors division ».");
  if (superieurId) {
    const s = org.personnes.get(superieurId);
    if (!s || s.externe || !s.actif) throw new Error("Le supérieur est une personne active de la division.");
  }
}

/** Le rôle Exécutif ouvre tout : seul un exécutif peut le donner ou le retirer. */
async function verifierDroitExecutif(parId: string, personneId: string | null, executif: boolean) {
  const org = await chargerOrganisation();
  const actuel = personneId ? org.personnes.get(personneId)?.executif ?? false : false;
  if (actuel === executif) return;
  if (!org.personnes.get(parId)?.executif) throw new Error("Seul un exécutif peut donner ou retirer le rôle Exécutif.");
}

export async function modifierPersonne(parId: string, personneId: string, m: ModificationPersonne) {
  if (m.superieurId === personneId) throw new Error("Une personne ne peut pas être son propre supérieur.");
  // Pas de boucle : le supérieur choisi ne doit pas rapporter, même indirectement, à cette personne.
  const org = await chargerOrganisation();
  let courant = m.superieurId;
  const vus = new Set<string>();
  while (courant && !vus.has(courant)) {
    if (courant === personneId) throw new Error("Ce choix créerait une boucle : ce supérieur rapporte déjà à cette personne.");
    vus.add(courant);
    courant = org.personnes.get(courant)?.superieurId ?? null;
  }
  await verifierInterne(personneId, m.superieurId);
  await verifierDroitExecutif(parId, personneId, m.executif);
  await verifierDernierAdministrateur(personneId, m.administrateur && m.actif);
  await db
    .update(schema.personnes)
    .set({ equipeId: m.equipeId, superieurId: m.superieurId, directeur: m.directeur, executif: m.executif, administrateur: m.administrateur, capaciteHeures: m.capaciteHeures, poste: m.poste.trim(), actif: m.actif, majLe: new Date() })
    .where(eq(schema.personnes.id, personneId));
  if (!m.actif) await db.delete(schema.sessions).where(eq(schema.sessions.personneId, personneId));
  await noter(parId, "personne_modifiee", personneId, m);
}

export async function definirChefEquipe(parId: string, equipeId: string, chefId: string | null) {
  if (chefId) await verifierInterne(null, chefId);
  await db.update(schema.equipes).set({ chefId }).where(eq(schema.equipes.id, equipeId));
  await noter(parId, "chef_equipe", equipeId, { chefId });
}

/** Crée une personne avec un mot de passe provisoire, affiché une seule fois. */
export async function creerPersonne(parId: string, d: Roles & { prenom: string; nom: string; courriel: string; poste: string; equipeId: string | null; superieurId: string | null }) {
  await verifierInterne(null, d.superieurId);
  await verifierDroitExecutif(parId, null, d.executif);
  const provisoire = randomBytes(9).toString("base64url");
  const [p] = await db
    .insert(schema.personnes)
    .values({
      prenom: d.prenom.trim(),
      nom: d.nom.trim(),
      courriel: d.courriel.trim().toLowerCase(),
      poste: d.poste.trim(),
      equipeId: d.equipeId,
      superieurId: d.superieurId,
      directeur: d.directeur,
      executif: d.executif,
      administrateur: d.administrateur,
      motDePasseHash: await hacherMotDePasse(provisoire),
      doitChangerMotDePasse: true,
    })
    .returning({ id: schema.personnes.id });
  await noter(parId, "personne_creee", p.id, { courriel: d.courriel });
  return { id: p.id, provisoire };
}

export async function reinitialiserMotDePasse(parId: string, personneId: string) {
  const provisoire = randomBytes(9).toString("base64url");
  await db
    .update(schema.personnes)
    .set({ motDePasseHash: await hacherMotDePasse(provisoire), doitChangerMotDePasse: true, echecsConnexion: 0, bloqueJusqua: null })
    .where(eq(schema.personnes.id, personneId));
  await db.delete(schema.sessions).where(eq(schema.sessions.personneId, personneId));
  await noter(parId, "mot_de_passe_reinitialise", personneId);
  return provisoire;
}
