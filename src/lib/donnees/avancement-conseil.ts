/**
 * L'état d'avancement d'un projet pour le rapport mensuel au conseil, écrit par son chef de projet sur la fiche du
 * projet (décidé le 29 octobre 2026). Calendrier : src/lib/calendrier-conseil.ts. Le rapport le reprend tant qu'il est
 * un brouillon, sauf si la direction a corrigé la ligne (src/lib/donnees/conseil.ts). Les rappels aux chefs et l'alerte
 * aux exécutifs sont créés par la tournée horaire (instrumentation.ts).
 */
import "server-only";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import { calendrierConseil, chefsPeuventEcrire, moisDuConseil, type CalendrierConseil } from "@/lib/calendrier-conseil";
import { aujourdhui, dateLongue } from "@/lib/dates";
import { noter } from "@/lib/journal";
import { chargerOrganisation } from "@/lib/organisation";
import { peutGererProjet, peutTenirLesRegistres } from "@/lib/projets";
import { nomComplet } from "@/lib/regles";
import { entreAuRapportMensuel, texteAutomatique } from "./conseil";
import { acteur } from "./gestion";

type Projet = typeof schema.projets.$inferSelect;
const LONGUEUR = 2000;
const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const nomDuMois = (mois: string) => NOMS_MOIS[Number(mois.slice(5, 7)) - 1];
/** « de novembre », « d'avril », « d'août », « d'octobre ». */
export const duMois = (mois: string) => (/^[aeiouéèh]/i.test(nomDuMois(mois)) ? `d'${nomDuMois(mois)}` : `de ${nomDuMois(mois)}`);

/** Qui écrit l'état d'avancement : le chef de projet, le référent DPO, et ceux qui gèrent le projet. */
const peutEcrire = (a: Acces, p: Projet) => peutTenirLesRegistres(a.moi.id, peutGererProjet(acteur(a), p), p);

export type AvancementProjet = {
  cal: CalendrierConseil;
  /** Ce que le chef a écrit pour ce mois (ou rien encore). */
  ecrit: { texte: string; par: string | null; le: Date } | null;
  /** Le texte automatique, pour partir de quelque chose. */
  propose: string;
  /** Rapport du mois déjà approuvé par un exécutif : le texte envoyé. */
  envoye: string | null;
  /** La direction a corrigé la ligne dans le rapport : sa version. */
  corrige: { texte: string; par: string | null } | null;
  peutEcrire: boolean;
  /** Le jour limite est passé, ou le rapport est approuvé. */
  fige: boolean;
};

/** Pour la fiche du projet : null si le projet n'entre pas au rapport mensuel ou si la personne n'y écrit pas. */
export async function avancementPourProjet(a: Acces, p: Projet, jour = aujourdhui()): Promise<AvancementProjet | null> {
  if (!entreAuRapportMensuel(p) || !peutEcrire(a, p)) return null;
  const cal = calendrierConseil(moisDuConseil(jour));
  const [[ecrit], [rapport], org] = await Promise.all([
    db.select().from(schema.avancementsConseil).where(and(eq(schema.avancementsConseil.projetId, p.id), eq(schema.avancementsConseil.mois, cal.mois))),
    db.select().from(schema.rapportsConseil).where(eq(schema.rapportsConseil.mois, cal.mois)),
    chargerOrganisation(),
  ]);
  const nom = (id: string | null) => (id && org.personnes.get(id) ? nomComplet(org.personnes.get(id)!) : null);
  const [ligne] = rapport ? await db.select().from(schema.lignesConseil).where(and(eq(schema.lignesConseil.rapportId, rapport.id), eq(schema.lignesConseil.projetId, p.id))) : [];
  const approuve = rapport?.statut === "approuve";
  const fige = approuve || !chefsPeuventEcrire(cal, jour);
  return {
    cal,
    ecrit: ecrit ? { texte: ecrit.texte, par: nom(ecrit.majParId), le: ecrit.majLe } : null,
    propose: ecrit ? "" : await texteAutomatique(p, cal.mois),
    envoye: approuve && ligne ? ligne.etatAvancement : null,
    corrige: !approuve && ligne && (ligne.source === "direction" || ligne.source === "ia") ? { texte: ligne.etatAvancement, par: nom(ligne.sourceParId) } : null,
    peutEcrire: !fige,
    fige,
  };
}

/** Le chef de projet écrit (ou réécrit) l'état d'avancement du mois, jusqu'au jour limite. */
export async function enregistrerAvancement(a: Acces, projetId: string, texte: unknown, jour = aujourdhui()): Promise<{ ok: true } | { erreur: string }> {
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetId));
  if (!p) return { erreur: "Projet introuvable." };
  if (!entreAuRapportMensuel(p)) return { erreur: "Seuls les projets stratégiques de la DPO, en cours, entrent au rapport mensuel au conseil." };
  if (!peutEcrire(a, p)) return { erreur: "Seuls le chef du projet, son référent, son directeur et les exécutifs écrivent son état d'avancement." };
  const cal = calendrierConseil(moisDuConseil(jour));
  const [rapport] = await db.select({ statut: schema.rapportsConseil.statut }).from(schema.rapportsConseil).where(eq(schema.rapportsConseil.mois, cal.mois));
  if (rapport?.statut === "approuve") return { erreur: `Le rapport ${duMois(cal.mois)} est déjà approuvé : son état d'avancement est figé.` };
  if (!chefsPeuventEcrire(cal, jour)) return { erreur: `L'état d'avancement ${duMois(cal.mois)} est figé depuis le ${dateLongue(cal.limiteChefs)} au soir : les exécutifs relisent le rapport.` };
  const t = String(texte ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim().slice(0, LONGUEUR);
  if (t.length < 10) return { erreur: "Écrivez l'état d'avancement en une ou deux phrases." };
  await db
    .insert(schema.avancementsConseil)
    .values({ projetId, mois: cal.mois, texte: t, majParId: a.moi.id, majLe: new Date() })
    .onConflictDoUpdate({ target: [schema.avancementsConseil.projetId, schema.avancementsConseil.mois], set: { texte: t, majParId: a.moi.id, majLe: new Date() } });
  await noter(a.moi.id, "conseil_avancement", projetId, { mois: cal.mois });
  return { ok: true };
}

/** Les personnes qui écrivent l'état d'avancement d'un projet : son chef (de la division) et son référent DPO. */
function redacteurs(p: Projet, org: Awaited<ReturnType<typeof chargerOrganisation>>): string[] {
  return [p.chefProjetId, p.referentId].filter((id): id is string => {
    const x = id ? org.personnes.get(id) : undefined;
    return !!x && x.actif && !x.externe;
  });
}

/**
 * Rappels du rapport au conseil, créés une fois chacun (clé de la notification) :
 * - aux chefs (et référents) des projets du rapport, le jour du rappel, s'ils n'ont rien écrit pour le mois ;
 * - la veille du jour limite, une relance à ceux qui n'ont toujours rien écrit ;
 * - le lendemain du jour limite, aux exécutifs : le rapport est prêt à valider (combien de projets à jour).
 */
export async function rappelsConseil(jour = aujourdhui()) {
  const cal = calendrierConseil(moisDuConseil(jour));
  if (jour < cal.rappel || jour >= cal.dernierJeudi) return { rappels: 0, executifs: 0 };
  const [rapport] = await db.select({ statut: schema.rapportsConseil.statut }).from(schema.rapportsConseil).where(eq(schema.rapportsConseil.mois, cal.mois));
  if (rapport?.statut === "approuve") return { rappels: 0, executifs: 0 };
  const projets = (await db.select().from(schema.projets).where(and(eq(schema.projets.strategique, true), eq(schema.projets.division, ""), isNull(schema.projets.archiveLe), ne(schema.projets.statut, "finalise")))).filter(entreAuRapportMensuel);
  if (!projets.length) return { rappels: 0, executifs: 0 };
  const ecrits = new Set(
    (await db.select({ projetId: schema.avancementsConseil.projetId }).from(schema.avancementsConseil).where(and(eq(schema.avancementsConseil.mois, cal.mois), inArray(schema.avancementsConseil.projetId, projets.map((p) => p.id))))).map((x) => x.projetId),
  );
  const org = await chargerOrganisation();
  const nouvelles: (typeof schema.notifications.$inferInsert)[] = [];
  const m = cal.mois.slice(0, 7);
  if (jour <= cal.limiteChefs) {
    const relance = jour >= cal.relance;
    for (const p of projets.filter((x) => !ecrits.has(x.id))) {
      for (const personneId of redacteurs(p, org)) {
        nouvelles.push({
          personneId,
          type: "conseil_rappel",
          cle: `conseil_${relance ? "relance" : "rappel"}:${m}:${p.id}`,
          lien: `/projets/${p.id}#conseil`,
          texte: relance
            ? `Rapport au conseil ${duMois(cal.mois)} : l'état d'avancement de « ${p.titre} » n'est pas encore écrit ; il se fige demain, ${dateLongue(cal.limiteChefs)}, au soir.`
            : `Rapport au conseil ${duMois(cal.mois)} : mettez à jour l'état d'avancement de « ${p.titre} » avant le ${dateLongue(cal.limiteChefs)} au soir.`,
        });
      }
    }
  }
  let executifs = 0;
  if (jour >= cal.pretAValider) {
    const aJour = projets.filter((p) => ecrits.has(p.id)).length;
    for (const x of [...org.personnes.values()].filter((y) => y.actif && y.executif && !y.externe)) {
      executifs += 1;
      nouvelles.push({
        personneId: x.id,
        type: "conseil_pret",
        cle: `conseil_pret:${m}`,
        lien: "/conseil",
        texte: `Rapport au conseil ${duMois(cal.mois)} prêt à valider : ${aJour} projet${aJour > 1 ? "s" : ""} sur ${projets.length} mis à jour par leur chef ; à envoyer avant le ${dateLongue(cal.dernierJeudi)}.`,
      });
    }
  }
  if (nouvelles.length) await db.insert(schema.notifications).values(nouvelles).onConflictDoNothing();
  return { rappels: nouvelles.length - executifs, executifs };
}
