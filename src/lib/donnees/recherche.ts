/**
 * Recherche unique : personnes, projets et tâches, seulement ce que la personne a le droit de voir
 * (mêmes règles que les pages : src/lib/acces.ts). Sans accents ni casse ; tous les mots doivent y être.
 */
import "server-only";
import { isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { acces, contactsVisibles, idsProjetsVisibles, peutVoirTache, suitPersonne, type Acces } from "@/lib/acces";
import { periodeDe, personneNommee } from "@/lib/barre";
import { aujourdhui, dateCourte, lundiDe } from "@/lib/dates";
import { auteursDontJeLisLesRapports } from "@/lib/donnees/rapport";
import { peutAdministrer, redigeUnRapport } from "@/lib/regles";
import type { Utilisateur } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/organisation";
import { cleNom } from "@/lib/projets";
import { nomComplet } from "@/lib/regles";

const LIMITE = 20;

/** Rang d'un texte pour la requête : 0 commence par la requête, 1 un mot commence par elle, 2 la contient ; null sinon. */
export function rang(texte: string, mots: string[]): number | null {
  const t = cleNom(texte);
  if (!mots.length || !mots.every((m) => t.includes(m))) return null;
  const q = mots.join(" ");
  if (t.startsWith(q)) return 0;
  if (` ${t}`.includes(` ${mots[0]}`)) return 1;
  return 2;
}

const trierPar = <T extends { r: number; texte: string }>(l: T[]) => l.sort((x, y) => x.r - y.r || x.texte.localeCompare(y.texte, "fr"));

export async function rechercher(u: Utilisateur, saisie: string) {
  const mots = cleNom(saisie.slice(0, 100)).split(" ").filter((m) => m.length >= 2 || /\d/.test(m));
  if (!mots.length) return null;
  const a = await acces(u);
  const org = await chargerOrganisation();
  const visibles = await idsProjetsVisibles(a);
  const contacts = u.externe ? await contactsVisibles(a) : null;

  const personnes = trierPar(
    [...org.personnes.values()]
      .filter((p) => p.actif && (!contacts || contacts.has(p.id)))
      .map((p) => {
        const texte = nomComplet(p);
        // Hors division (accès limité) : l'équipe n'est ni affichée ni cherchée (on ne la devinerait pas).
        const r = rang(`${texte} ${p.prenom} ${p.poste} ${p.externe ? p.organisation : contacts ? "" : (org.equipes.get(p.equipeId ?? "")?.nom ?? "")}`, mots);
        const nom = rang(texte, mots);
        return { id: p.id, texte, sous: p.externe ? ["Hors division", p.organisation].filter(Boolean).join(" · ") : [p.poste, contacts ? null : org.equipes.get(p.equipeId ?? "")?.nom].filter(Boolean).join(" · "), r: nom ?? (r === null ? null : r + 1) };
      })
      .filter((x): x is typeof x & { r: number } => x.r !== null),
  );

  const lesProjets = await db
    .select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre, programme: schema.projets.programme, statut: schema.projets.statut, archiveLe: schema.projets.archiveLe })
    .from(schema.projets);
  const projets = trierPar(
    lesProjets
      .filter((p) => visibles === "tous" || visibles.has(p.id))
      .map((p) => {
        const parCode = mots.length === 1 && cleNom(p.code) === mots[0] ? -1 : null;
        const r = parCode ?? rang(`${p.titre} ${p.code} ${p.programme}`, mots);
        return { id: p.id, code: p.code, texte: p.titre, sous: [p.programme, p.archiveLe ? "Archivé" : p.statut === "requete" ? "Demande" : p.statut === "refuse" ? "Refusé" : null].filter(Boolean).join(" · "), r };
      })
      .filter((x): x is typeof x & { r: number } => x.r !== null),
  );

  const codes = new Map(lesProjets.map((p) => [p.id, p.code]));
  const titres = new Map(lesProjets.map((p) => [p.id, p.titre]));
  const lesTaches = await db
    .select({ id: schema.taches.id, titre: schema.taches.titre, statut: schema.taches.statut, echeance: schema.taches.echeance, assigneId: schema.taches.assigneId, projetId: schema.taches.projetId, creeParId: schema.taches.creeParId })
    .from(schema.taches)
    .where(isNull(schema.taches.annuleeLe));
  const taches = trierPar(
    lesTaches
      .filter((t) => peutVoirTache(a, t))
      .map((t) => {
        const r = rang(t.titre, mots);
        const p = org.personnes.get(t.assigneId);
        return {
          id: t.id,
          texte: t.titre,
          code: t.projetId ? (codes.get(t.projetId) ?? null) : null,
          projetId: t.projetId,
          projetTitre: t.projetId && (visibles === "tous" || visibles.has(t.projetId)) ? (titres.get(t.projetId) ?? null) : null,
          projetVisible: !!t.projetId && (visibles === "tous" || visibles.has(t.projetId)),
          sous: [t.assigneId === u.id ? "Moi" : p ? nomComplet(p) : null, t.statut === "faite" ? "Faite" : t.statut === "bloquee" ? "Bloquée" : null].filter(Boolean).join(" · "),
          statut: t.statut,
          r: r === null ? null : r + (t.statut === "faite" ? 3 : 0),
        };
      })
      .filter((x): x is typeof x & { r: number } => x.r !== null),
  );

  const ecrans = await raccourcis(u, a, mots, saisie, org, lesProjets.filter((p) => !p.archiveLe && (visibles === "tous" || visibles.has(p.id))));
  return {
    ecrans: { liste: ecrans.slice(0, LIMITE), total: ecrans.length },
    personnes: { liste: personnes.slice(0, LIMITE), total: personnes.length },
    projets: { liste: projets.slice(0, LIMITE), total: projets.length },
    taches: { liste: taches.slice(0, LIMITE), total: taches.length },
  };
}

// ---------------------------------------------------------------------------
// Aller directement à un écran : « charge », « Gantt UR », « semaine de Myriam », « rapport de Fabienne semaine dernière »
// ---------------------------------------------------------------------------

type Raccourci = { texte: string; sous: string; lien: string; code: string | null; r: number };

/** Les écrans de l'application, avec les mots qui y mènent et qui peut les ouvrir. */
function ecransPermis(u: Utilisateur, a: Acces) {
  const interne = !u.externe;
  const chef = interne && (a.equipeDirecte.length > 0 || a.directeur || a.toutVoir);
  const admin = peutAdministrer(u);
  const redige = redigeUnRapport(u);
  const E: [string, string, string, boolean][] = [
    ["ma semaine semaine aujourd hui", "Ma semaine", "/semaine", true],
    ["a faire mes taches liste", "À faire", "/a-faire", true],
    ["reunions mes reunions", "Réunions", "/reunions", true],
    ["mon bilan bilan", "Mon bilan", "/bilan", interne],
    ["rapport rapport du vendredi mon rapport", "Rapport de la semaine", "/rapport", redige],
    ["mes rapports historique rapports envoyes", "Mes rapports", "/rapports", redige],
    ["equipe mon equipe cette semaine", "Équipe · cette semaine", "/equipe", chef],
    ["rapports de l equipe rapports equipe", "Équipe · rapports", "/equipe/rapports", chef],
    ["charge charge de travail", "Charge de travail", "/charge", chef],
    ["bilan de l equipe bilan equipe", "Équipe · bilan", "/equipe/bilan", chef],
    ["projets portefeuille", "Portefeuille des projets", "/projets", true],
    ["proposer un projet nouveau projet demande de projet", "Proposer un projet", "/projets/nouveau", interne],
    ["conseil rapport au conseil", "Rapport au conseil", "/conseil", interne && (a.toutVoir || a.directeur)],
    ["rapports ponctuels conseil ponctuel", "Rapports ponctuels au conseil", "/conseil/ponctuels", interne && (a.toutVoir || a.directeur)],
    ["organisation personnes et equipes", "Organisation", "/organisation", interne && (admin || a.toutVoir)],
    ["modeles de rapport modeles", "Modèles de rapport", "/organisation/modeles", admin],
    ["importer l organisation import excel annuaire", "Importer l'organisation", "/organisation/importer", admin],
    ["suivi du pilote pilote adoption", "Suivi du pilote", "/pilote", interne && (admin || u.executif)],
    ["alertes notifications", "Alertes", "/alertes", true],
    ["profil mot de passe theme", "Profil", "/profil", true],
    ["nouvelle tache formulaire complet", "Nouvelle tâche (formulaire complet)", "/taches/nouvelle", true],
  ];
  return E.filter((e) => e[3]);
}

const VUES: Record<string, { suffixe: string; libelle: string }> = {
  gantt: { suffixe: "/gantt", libelle: "Gantt" },
  calendrier: { suffixe: "/calendrier", libelle: "Calendrier" },
  tableau: { suffixe: "/tableau", libelle: "Tableau" },
  liste: { suffixe: "/liste", libelle: "Liste" },
  charge: { suffixe: "/charge", libelle: "Charge" },
  modifier: { suffixe: "/modifier", libelle: "Modifier" },
  apercu: { suffixe: "", libelle: "Vue d'ensemble" },
};

async function raccourcis(
  u: Utilisateur,
  a: Acces,
  mots: string[],
  saisie: string,
  org: Awaited<ReturnType<typeof chargerOrganisation>>,
  projets: { id: string; code: string; titre: string }[],
): Promise<Raccourci[]> {
  const sortie: Raccourci[] = [];
  // Écrans par leur nom.
  for (const [cles, texte, lien] of ecransPermis(u, a)) {
    const r = rang(`${texte} ${cles}`, mots);
    if (r !== null) sortie.push({ texte, sous: "Écran", lien, code: null, r });
  }
  // Une vue d'un projet : « Gantt UR », « calendrier credos ».
  const vue = mots.find((m) => m in VUES);
  if (vue && !(vue === "charge" && u.externe)) {
    const reste = mots.filter((m) => m !== vue && m !== "de" && m !== "du");
    for (const p of projets) {
      if (!reste.length) break;
      const r = cleNom(p.code) === reste.join(" ") ? 0 : rang(`${p.titre} ${p.code}`, reste);
      if (r !== null) sortie.push({ texte: `${p.titre} · ${VUES[vue].libelle}`, sous: "Vue du projet", lien: `/projets/${p.id}${VUES[vue].suffixe}`, code: p.code, r: r - 1 });
    }
  }
  // Une personne : « semaine de Myriam », « charge de Myriam », « rapports de Fabienne », « rapport de Fabienne semaine dernière ».
  if (!u.externe) {
    const motCle = mots.find((m) => ["semaine", "charge", "rapport", "rapports", "taches"].includes(m));
    if (motCle) {
      const nomMots = mots.filter((m) => !["semaine", "charge", "rapport", "rapports", "taches", "de", "du", "d", "la", "derniere", "passee", "prochaine", "cette"].includes(m));
      const gens = [...org.personnes.values()].filter((p) => p.actif && !p.externe && p.id !== u.id).map((p) => ({ id: p.id, nom: nomComplet(p) }));
      const p = nomMots.length ? personneNommee(nomMots.join(" "), gens) : null;
      if (p) {
        if ((motCle === "semaine" || motCle === "charge" || motCle === "taches") && suitPersonne(a, p.id)) {
          sortie.push({ texte: `${p.nom} · sa semaine, ses tâches et sa charge`, sous: "Équipe", lien: `/equipe/${p.id}`, code: null, r: -1 });
        }
        if (motCle === "rapport" || motCle === "rapports") {
          const lus = await auteursDontJeLisLesRapports(a);
          if (lus.includes(p.id)) {
            const periode = /derni|pass/.test(cleNom(saisie)) ? periodeDe(saisie, aujourdhui()) : null;
            if (periode) {
              const semaine = lundiDe(periode.debut);
              const [r] = await db
                .select({ id: schema.rapportsHebdo.id, statut: schema.rapportsHebdo.statut })
                .from(schema.rapportsHebdo)
                .where(and(eq(schema.rapportsHebdo.auteurId, p.id), eq(schema.rapportsHebdo.semaine, semaine)));
              if (r?.statut === "envoye") sortie.push({ texte: `Rapport de ${p.nom} · semaine du ${dateCourte(semaine)}`, sous: "Rapport", lien: `/rapports/${r.id}`, code: null, r: -2 });
              else sortie.push({ texte: `${p.nom} n'a pas envoyé de rapport la semaine du ${dateCourte(semaine)}`, sous: "Rapports", lien: `/equipe/rapports?personne=${p.id}`, code: null, r: -2 });
            }
            sortie.push({ texte: `Rapports de ${p.nom}`, sous: "Historique", lien: `/equipe/rapports?personne=${p.id}`, code: null, r: -1 });
          }
        }
      }
    }
  }
  return sortie.sort((x, y) => x.r - y.r || x.texte.localeCompare(y.texte, "fr"));
}
