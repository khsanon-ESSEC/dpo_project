/**
 * Questions posées dans la barre (« en retard sur UR ? », « qui est surchargé ? », « mes échéances de la
 * semaine ? », « qui n'a pas envoyé son rapport ? ») : des réponses par règles simples, sans IA, à partir de ce
 * que la personne voit déjà (mêmes règles que les pages, src/lib/acces.ts).
 */
import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, contactsVisibles, idsProjetsVisibles, peutVoirTache, type Acces } from "@/lib/acces";
import type { Utilisateur } from "@/lib/auth/session";
import { analyserQuestion, personneNommee, type AnalyseQuestion } from "@/lib/barre";
import { LIBELLE_NIVEAU } from "@/lib/charge";
import { aujourdhui, dateCourte, lundiDe } from "@/lib/dates";
import { chargeDesPersonnes } from "@/lib/donnees/charge";
import { auteursDontJeLisLesRapports, statutsRapports } from "@/lib/donnees/rapport";
import { reunionsDe } from "@/lib/donnees/reunions";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet, redigeUnRapport } from "@/lib/regles";

export type LigneReponse = { texte: string; sous?: string; code?: string | null; lien: string };
export type Reponse = { titre: string; lignes: LigneReponse[]; total: number; vide?: string; incomprise?: boolean };

export const EXEMPLES = ["en retard sur UR ?", "mes échéances de la semaine ?", "tâches bloquées ?", "qui est surchargé ?", "qui n'a pas envoyé son rapport ?", "projets à surveiller ?", "mes réunions aujourd'hui ?"];

const SANTE: Record<string, string> = { dans_les_temps: "Dans les temps", a_surveiller: "À surveiller", en_retard: "En retard" };

export async function repondre(u: Utilisateur, saisie: string): Promise<Reponse> {
  const q = analyserQuestion(saisie.slice(0, 200), aujourdhui());
  if (!q.sujet) return { titre: "Je n'ai pas compris la question", lignes: [], total: 0, incomprise: true, vide: `Essayez : ${EXEMPLES.map((e) => `« ${e} »`).join(", ")}.` };
  const a = await acces(u);
  const org = await chargerOrganisation();
  const visibles = await idsProjetsVisibles(a);
  const lesProjets = await db.select().from(schema.projets).where(isNull(schema.projets.archiveLe));
  const projetsVus = lesProjets.filter((p) => visibles === "tous" || visibles.has(p.id));
  const projet = q.projetCode ? (projetsVus.find((p) => p.code === q.projetCode) ?? null) : null;
  if (q.projetCode && !projet && !/^(JE|ET)$/.test(q.projetCode)) return { titre: `Projet ${q.projetCode} introuvable`, lignes: [], total: 0, vide: "Ce code ne correspond à aucun projet que vous voyez." };
  // « … de Fabienne » : parmi les personnes qu'on voit (ses contacts, pour une personne hors division).
  const contacts = u.externe ? await contactsVisibles(a) : null;
  const gens = [...org.personnes.values()].filter((p) => p.actif && (!contacts || contacts.has(p.id))).map((p) => ({ id: p.id, nom: nomComplet(p) }));
  const personne = q.motsPersonne ? personneNommee(q.motsPersonne, gens) : null;
  const pour = q.miennes ? { id: u.id, nom: "vous" } : personne;
  const suffixe = [projet ? ` sur ${projet.code}` : "", pour ? (pour.id === u.id ? " (les vôtres)" : ` de ${pour.nom}`) : ""].join("");

  switch (q.sujet) {
    case "retard":
    case "bloquees":
    case "echeances":
      return reponseTaches(a, q, { projetId: projet?.id ?? null, pourId: pour?.id ?? null, suffixe, codes: new Map(lesProjets.map((p) => [p.id, p.code])), org });
    case "projets": {
      const liste = projetsVus.filter((p) => p.sante !== "dans_les_temps" && (p.statut === "en_cours" || p.statut === "continu" || p.statut === "en_attente"));
      const tri = liste.sort((x, y) => Number(y.sante === "en_retard") - Number(x.sante === "en_retard") || x.code.localeCompare(y.code));
      return {
        titre: "Projets à surveiller ou en retard",
        lignes: tri.map((p) => ({ texte: p.titre, code: p.code, sous: [SANTE[p.sante], p.santeMotif].filter(Boolean).join(" : "), lien: `/projets/${p.id}` })),
        total: tri.length,
        vide: "Tous les projets que vous voyez sont dans les temps.",
      };
    }
    case "equipe_projet": {
      if (!projet) return { titre: "Quel projet ?", lignes: [], total: 0, vide: "Précisez le projet par son code : « qui travaille sur UR ? »." };
      const membres = await db.select({ id: schema.membresProjet.personneId, role: schema.membresProjet.role }).from(schema.membresProjet).where(eq(schema.membresProjet.projetId, projet.id));
      const ids = [projet.chefProjetId, projet.referentId, ...membres.map((m) => m.id)].filter((x): x is string => !!x && (!contacts || contacts.has(x)));
      const lignes = [...new Set(ids)].map((id) => {
        const p = org.personnes.get(id);
        const role = id === projet.chefProjetId ? "Chef de projet" : id === projet.referentId ? "Référent DPO" : (membres.find((m) => m.id === id)?.role ?? "");
        return { texte: p ? nomComplet(p) : "—", sous: role || undefined, lien: `/personnes/${id}` };
      });
      return { titre: `Équipe du projet ${projet.code}`, lignes, total: lignes.length, vide: "Personne dans l'équipe de ce projet." };
    }
    case "reunions": {
      const qui = personne && personne.id !== u.id && a.suivis !== "toutes" && !a.suivis.has(personne.id) ? null : (personne ?? { id: u.id, nom: "vous" });
      if (!qui) return { titre: "Réunions", lignes: [], total: 0, vide: `Vous ne voyez pas les réunions de ${personne!.nom}.` };
      const liste = await reunionsDe(qui.id, q.periode.debut, q.periode.fin);
      const lignes = liste
        .sort((x, y) => `${x.jour}${x.heure ?? ""}`.localeCompare(`${y.jour}${y.heure ?? ""}`))
        .map((r) => ({ texte: r.titre, sous: `${dateCourte(r.jour)}${r.heure ? ` à ${r.heure.slice(0, 5).replace(":", " h ")}` : ""} · ${r.dureeMinutes} min`, lien: `/reunions?semaine=${lundiDe(r.jour)}` }));
      return { titre: `Réunions ${q.periode.libelle}${qui.id === u.id ? "" : ` de ${qui.nom}`}`, lignes, total: lignes.length, vide: `Aucune réunion notée ${q.periode.libelle}.` };
    }
    case "rapports": {
      const ids = (await auteursDontJeLisLesRapports(a)).filter((id) => {
        const p = org.personnes.get(id);
        return p?.actif && redigeUnRapport(p);
      });
      if (!ids.length) return { titre: "Rapports", lignes: [], total: 0, vide: "Vous ne recevez les rapports de personne." };
      const semaine = q.periode.libelle === "la semaine dernière" ? q.periode.debut : lundiDe(aujourdhui());
      const statuts = await statutsRapports(ids, semaine);
      const manquants = ids.filter((id) => statuts.get(id)?.statut !== "envoye").map((id) => org.personnes.get(id)!).sort((x, y) => x.nom.localeCompare(y.nom, "fr"));
      return {
        titre: `Rapports pas encore envoyés · semaine du ${dateCourte(semaine)}`,
        lignes: manquants.map((p) => ({ texte: nomComplet(p), sous: statuts.get(p.id) ? "Brouillon commencé" : "Pas commencé", lien: `/equipe/rapports?personne=${p.id}` })),
        total: manquants.length,
        vide: "Tous les rapports sont arrivés.",
      };
    }
    case "charge": {
      if (u.externe) return { titre: "Charge", lignes: [], total: 0, vide: "La charge de travail n'est mesurée que pour la division." };
      const ids = a.suivis === "toutes" ? [...org.personnes.values()].filter((p) => p.actif && !p.externe).map((p) => p.id) : [...a.suivis];
      const c = await chargeDesPersonnes(ids, 2);
      const semaine = q.periode.libelle === "la semaine prochaine" ? 1 : 0;
      const seul = ids.length === 1;
      const lignes = c.lignes
        .map((l) => ({ l, s: l.charge.semaines[semaine] }))
        .filter(({ s }) => s && (seul || s.niveau === "surchargee" || s.niveau === "chargee"))
        .sort((x, y) => y.s.heures / Math.max(1, y.s.capacite) - x.s.heures / Math.max(1, x.s.capacite))
        .map(({ l, s }) => ({ texte: l.nom, sous: `${LIBELLE_NIVEAU[s.niveau]} · ${Math.round(s.heures)} h sur ${s.capacite} h`, lien: l.id === u.id ? "/semaine" : `/personnes/${l.id}` }));
      return {
        titre: seul ? `Votre charge ${semaine ? "la semaine prochaine" : "cette semaine"}` : `Chargés ou surchargés ${semaine ? "la semaine prochaine" : "cette semaine"}`,
        lignes,
        total: lignes.length,
        vide: "Personne n'est chargé ni surchargé parmi les personnes que vous suivez.",
      };
    }
  }
}

async function reponseTaches(
  a: Acces,
  q: AnalyseQuestion,
  o: { projetId: string | null; pourId: string | null; suffixe: string; codes: Map<string, string>; org: Awaited<ReturnType<typeof chargerOrganisation>> },
): Promise<Reponse> {
  const jour = aujourdhui();
  const conditions = [isNull(schema.taches.annuleeLe), ne(schema.taches.statut, "faite")];
  if (o.projetId) conditions.push(eq(schema.taches.projetId, o.projetId));
  if (o.pourId) conditions.push(eq(schema.taches.assigneId, o.pourId));
  if (q.sujet === "bloquees") conditions.push(eq(schema.taches.statut, "bloquee"));
  const lignes = (
    await db
      .select({ id: schema.taches.id, titre: schema.taches.titre, statut: schema.taches.statut, echeance: schema.taches.echeance, blocage: schema.taches.blocage, assigneId: schema.taches.assigneId, projetId: schema.taches.projetId, creeParId: schema.taches.creeParId })
      .from(schema.taches)
      .where(and(...conditions))
  )
    .filter((t) => peutVoirTache(a, t))
    .filter((t) =>
      q.sujet === "retard" ? t.statut !== "bloquee" && !!t.echeance && t.echeance < jour : q.sujet === "echeances" ? !!t.echeance && t.echeance >= q.periode.debut && t.echeance <= q.periode.fin : true,
    )
    .sort((x, y) => (x.echeance ?? "9999").localeCompare(y.echeance ?? "9999"));
  const qui = (id: string) => (id === a.moi.id ? "Moi" : o.org.personnes.get(id) ? nomComplet(o.org.personnes.get(id)!) : "—");
  const titre = q.sujet === "retard" ? `Tâches en retard${o.suffixe}` : q.sujet === "bloquees" ? `Tâches bloquées${o.suffixe}` : `Échéances ${q.periode.libelle}${o.suffixe}`;
  return {
    titre,
    lignes: lignes.slice(0, 50).map((t) => ({
      texte: t.titre,
      code: t.projetId ? (o.codes.get(t.projetId) ?? null) : null,
      sous: [qui(t.assigneId), q.sujet === "bloquees" ? t.blocage : t.echeance ? dateCourte(t.echeance) : null].filter(Boolean).join(" · "),
      lien: `/taches/${t.id}`,
    })),
    total: lignes.length,
    vide: q.sujet === "retard" ? "Rien en retard." : q.sujet === "bloquees" ? "Rien de bloqué." : `Aucune échéance ${q.periode.libelle}.`,
  };
}


