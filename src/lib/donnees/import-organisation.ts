/**
 * Importer l'organisation : l'existant, puis l'application du plan en une transaction (tout ou rien).
 * Le plan est recalculé ici à partir des lignes, jamais repris tel quel de la page.
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { planifierImport, type Existant, type LigneImport, type Plan } from "@/lib/import-organisation";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { cleNom } from "@/lib/projets";
import { copieOrganisation, suivisEnPlus, type OrgDonnees } from "@/lib/regles";
import { avertirChangementsDeSuperieur, REFUS_SUIVI } from "@/lib/donnees/organisation";

export async function existantPourImport(): Promise<Existant> {
  const [personnes, equipes] = await Promise.all([
    db
      .select({
        id: schema.personnes.id,
        prenom: schema.personnes.prenom,
        nom: schema.personnes.nom,
        courriel: schema.personnes.courriel,
        poste: schema.personnes.poste,
        equipeId: schema.personnes.equipeId,
        superieurId: schema.personnes.superieurId,
        externe: schema.personnes.externe,
        actif: schema.personnes.actif,
      })
      .from(schema.personnes),
    db.select({ id: schema.equipes.id, nom: schema.equipes.nom }).from(schema.equipes),
  ]);
  return { personnes, equipes };
}

export async function planPourLignes(lignes: LigneImport[], source: "fichier" | "annuaire" = "fichier"): Promise<Plan> {
  return planifierImport(lignes, await existantPourImport(), { laisserDeCote: source === "annuaire" });
}

/** L'organisation telle que l'import la laisserait (mêmes règles que l'écriture ci-dessous). */
export function simulerImport(o: OrgDonnees, plan: Plan) {
  const parCourriel = new Map([...o.personnes.values()].filter((p) => p.courriel).map((p) => [p.courriel!.toLowerCase(), p.id]));
  const equipes = new Map([...o.equipes.values()].map((e) => [cleNom(e.nom), e.id]));
  for (const nom of plan.equipesNouvelles) {
    const id = `nouvelle:${cleNom(nom)}`;
    o.equipes.set(id, { id, nom, chefId: null, equipeParenteId: null });
    equipes.set(cleNom(nom), id);
  }
  const idEquipe = (nom: string) => (nom ? (equipes.get(cleNom(nom)) ?? null) : null);
  for (const l of plan.creer) {
    const id = `nouveau:${l.courriel}`;
    parCourriel.set(l.courriel, id);
    o.personnes.set(id, { id, prenom: l.prenom, nom: l.nom, poste: l.poste, courriel: l.courriel, equipeId: idEquipe(l.equipe), superieurId: null, actif: true, externe: false, organisation: "", acces: false, directeur: false, executif: false, administrateur: false });
  }
  for (const m of plan.modifier) {
    const p = o.personnes.get(m.id);
    if (p && m.changements.some((c) => c.champ === "équipe")) p.equipeId = idEquipe(m.donnees.equipe);
  }
  for (const l of [...plan.creer, ...plan.modifier.filter((m) => m.changements.some((c) => c.champ === "supérieur")).map((m) => m.donnees)]) {
    const p = l.superieur ? o.personnes.get(parCourriel.get(l.courriel) ?? "") : undefined;
    if (p) p.superieurId = parCourriel.get(l.superieur) ?? null;
  }
}

/**
 * Garde-fous d'un administrateur qui n'est pas exécutif (comme pour une fiche) : l'import ne change ni son
 * équipe ni son supérieur, et ne lui fait pas suivre de nouvelles personnes.
 */
function refusImport(parId: string, avant: OrgDonnees, apres: OrgDonnees, plan: Plan): string | null {
  if (avant.personnes.get(parId)?.executif) return null;
  if (plan.modifier.some((m) => m.id === parId && m.changements.some((c) => c.champ === "équipe" || c.champ === "supérieur"))) {
    return "Votre équipe et votre supérieur se changent par un autre administrateur : laissez-les tels quels dans votre ligne.";
  }
  return suivisEnPlus(avant, apres, parId).length ? REFUS_SUIVI : null;
}

/** Applique l'import : équipes, nouvelles personnes (sans mot de passe), modifications, puis supérieurs. */
export async function appliquerImport(parId: string, lignes: LigneImport[], source: "fichier" | "annuaire"): Promise<{ ok: true; plan: Plan } | { ok: false; plan: Plan; refus?: string }> {
  const r = await db.transaction(async (tx) => {
    // Verrou : deux imports en même temps ne se mélangent pas.
    await tx.execute(sql`select pg_advisory_xact_lock(42001)`);
    const existant: Existant = {
      personnes: await tx
        .select({
          id: schema.personnes.id,
          prenom: schema.personnes.prenom,
          nom: schema.personnes.nom,
          courriel: schema.personnes.courriel,
          poste: schema.personnes.poste,
          equipeId: schema.personnes.equipeId,
          superieurId: schema.personnes.superieurId,
          externe: schema.personnes.externe,
          actif: schema.personnes.actif,
        })
        .from(schema.personnes),
      equipes: await tx.select({ id: schema.equipes.id, nom: schema.equipes.nom }).from(schema.equipes),
    };
    const plan = planifierImport(lignes, existant, { laisserDeCote: source === "annuaire" });
    if (plan.erreurs.length) return { ok: false as const, plan };
    const avant = await chargerOrganisation();
    const apres = copieOrganisation(avant);
    simulerImport(apres, plan);
    const refus = refusImport(parId, avant, apres, plan);
    if (refus) return { ok: false as const, plan, refus };

    const equipes = new Map(existant.equipes.map((e) => [cleNom(e.nom), e.id]));
    for (const nom of plan.equipesNouvelles) {
      const [e] = await tx.insert(schema.equipes).values({ nom }).returning({ id: schema.equipes.id });
      equipes.set(cleNom(nom), e.id);
    }
    const idEquipe = (nom: string) => (nom ? (equipes.get(cleNom(nom)) ?? null) : null);

    const ids = new Map(existant.personnes.filter((p) => p.courriel).map((p) => [p.courriel!.toLowerCase(), p.id]));
    for (const l of plan.creer) {
      // Sans mot de passe : la personne se connecte avec son compte Google ou Windows de la banque, ou un
      // administrateur lui donne un mot de passe provisoire depuis sa fiche.
      const [p] = await tx
        .insert(schema.personnes)
        .values({ prenom: l.prenom, nom: l.nom, courriel: l.courriel, poste: l.poste, equipeId: idEquipe(l.equipe), motDePasseHash: null, doitChangerMotDePasse: false })
        .returning({ id: schema.personnes.id });
      ids.set(l.courriel, p.id);
    }
    for (const m of plan.modifier) {
      // La ligne validée par le plan elle-même (jamais retrouvée par son numéro, qui vient de la page).
      const l = m.donnees;
      const champs: Partial<typeof schema.personnes.$inferInsert> = { majLe: new Date() };
      for (const c of m.changements) {
        if (c.champ === "prénom") champs.prenom = l.prenom;
        if (c.champ === "nom") champs.nom = l.nom;
        if (c.champ === "poste") champs.poste = l.poste;
        if (c.champ === "équipe") champs.equipeId = idEquipe(l.equipe);
      }
      await tx.update(schema.personnes).set(champs).where(eq(schema.personnes.id, m.id));
    }
    // Supérieurs en dernier : une nouvelle personne peut être le supérieur d'une autre.
    const avecSuperieur = [...plan.creer, ...plan.modifier.filter((m) => m.changements.some((c) => c.champ === "supérieur")).map((m) => m.donnees)].filter((l) => l.superieur);
    for (const l of avecSuperieur) {
      await tx.update(schema.personnes).set({ superieurId: ids.get(l.superieur)! }).where(eq(schema.personnes.id, ids.get(l.courriel)!));
    }
    await noter(parId, "organisation_importee", null, { source, creees: plan.creer.length, modifiees: plan.modifier.length, equipes: plan.equipesNouvelles.length, laissees: plan.ignores.length });
    return { ok: true as const, plan, avant, apres };
  });
  if (!r.ok) return r;
  await avertirChangementsDeSuperieur(parId, r.avant, r.apres);
  return { ok: true, plan: r.plan };
}

/** Le tableau de l'organisation actuelle (personnes actives de la division), au format de l'import. */
export async function tableauOrganisation(): Promise<string[][]> {
  const e = await existantPourImport();
  const equipes = new Map(e.equipes.map((x) => [x.id, x.nom]));
  const courriels = new Map(e.personnes.map((p) => [p.id, p.courriel ?? ""]));
  return e.personnes
    .filter((p) => p.actif && !p.externe && p.courriel)
    .sort((a, b) => (equipes.get(a.equipeId ?? "") ?? "").localeCompare(equipes.get(b.equipeId ?? "") ?? "", "fr") || a.nom.localeCompare(b.nom, "fr"))
    .map((p) => [p.prenom, p.nom, p.courriel!, p.poste, p.equipeId ? (equipes.get(p.equipeId) ?? "") : "", p.superieurId ? (courriels.get(p.superieurId) ?? "") : ""]);
}

