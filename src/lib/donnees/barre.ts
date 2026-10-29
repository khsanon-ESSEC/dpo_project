/**
 * Ce que fait la barre pour le rapport du vendredi et pour un projet (le cœur des actions de
 * src/app/(app)/barre/actions.ts, testé dans tests/barre-base.test.ts). La saisie est toujours relue ici.
 */
import "server-only";
import { and, eq, isNull, max } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Acces } from "@/lib/acces";
import type { Utilisateur } from "@/lib/auth/session";
import { analyserMajProjet, analyserNote, LIBELLES_NOTE, projetEnTete, reconnaitreMots, texteMajProjet, type RubriqueNote } from "@/lib/barre";
import { ajouterJours, aujourdhui, dateCourte } from "@/lib/dates";
import { enregistrerAnnulation } from "@/lib/donnees/annulations";
import { formulaireDe, obtenirOuCreerRapport, ordreSuivant, semaineCourante } from "@/lib/donnees/rapport";
import { projetsPourSaisie } from "@/lib/donnees/saisie";
import { noter } from "@/lib/journal";
import type { Champ } from "@/lib/modeles";
import { peutGererProjet } from "@/lib/projets";
import { redigeUnRapport } from "@/lib/regles";
import { noterReportFin } from "./reports-fin";
import { recalculerSante } from "./sante";

export type ResultatBarre = { message: string; ok?: boolean; annulation?: string; lien?: string; projetId?: string };

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Le champ du rapport qui reçoit une note : une liste de la bonne rubrique, sinon un texte de cette rubrique.
 * Une décision attendue, dans un modèle qui n'a pas de rubrique « Décision », va dans « Bloqué » (préfixée) :
 * c'est là que le supérieur cherche ce qui attend quelqu'un.
 */
function champPourNote(f: Champ[], r: RubriqueNote): { champ: Champ; prefixe: string } | undefined {
  const de = (rub: string) => {
    const mien = f.filter((c) => c.partie !== "equipe" && c.rubrique === rub);
    return mien.find((c) => c.type === "lignes") ?? mien.find((c) => c.type === "texte_long" || c.type === "texte");
  };
  const c = de(r);
  if (c) return { champ: c, prefixe: "" };
  const repli = r === "decision" ? de("bloque") : undefined;
  return repli ? { champ: repli, prefixe: "Décision attendue : " } : undefined;
}

/**
 * « Décision : … », « Risque : … », « Fait marquant : … », « Semaine prochaine : … » : la note va dans le
 * brouillon du rapport de la semaine (celui de la semaine prochaine si celui-ci est déjà parti), dans le champ
 * de cette rubrique, avec son projet. Le rapport se relit et se modifie ensuite comme d'habitude.
 */
export async function ajouterNoteAuRapport(u: Utilisateur, o: { saisie: string; projetId: string }): Promise<ResultatBarre> {
  if (!redigeUnRapport(u)) return { message: "Vous ne rédigez pas de rapport du vendredi : rien à y ajouter." };
  const projets = await projetsPourSaisie(u);
  const n = analyserNote(o.saisie, projets);
  if (!n || !n.texte) return { message: "Écrivez la note après les deux-points : « Décision : valider le budget DTI »." };
  const choisi = o.projetId;
  const projet = choisi ? projets.find((p) => p.id === choisi) : n.projet;
  if (choisi && !projet) return { message: "Projet introuvable." };

  let rapport = await obtenirOuCreerRapport(u.id, semaineCourante());
  let prochaine = false;
  if (rapport.statut !== "brouillon") {
    rapport = await obtenirOuCreerRapport(u.id, ajouterJours(semaineCourante(), 7));
    prochaine = true;
  }
  const f = formulaireDe(rapport);
  const choisiChamp = champPourNote(f, n.rubrique);
  const champ = choisiChamp?.champ;
  const texteNote = `${choisiChamp?.prefixe ?? ""}${n.texte}`;
  if (!champ) return { message: `Votre modèle de rapport n'a pas de rubrique « ${LIBELLES_NOTE[n.rubrique]} » : écrivez-la directement dans le rapport.` };

  let annulation: string;
  if (champ.type === "lignes") {
    const projetId = champ.parProjet === false ? null : (projet?.id ?? null);
    const texte = projet && !projetId ? `${projet.code} : ${texteNote}` : texteNote;
    const [l] = await db
      .insert(schema.lignesRapport)
      .values({ rapportId: rapport.id, champId: champ.id, partie: n.rubrique, texte, projetId, ordre: await ordreSuivant(rapport.id) })
      .returning({ id: schema.lignesRapport.id });
    annulation = await enregistrerAnnulation(u.id, { genre: "note_ligne", ligneId: l.id });
  } else {
    const ligne = projet ? `${projet.code} : ${texteNote}` : texteNote;
    const cible = and(eq(schema.reponsesRapport.rapportId, rapport.id), eq(schema.reponsesRapport.champId, champ.id), isNull(schema.reponsesRapport.projetId));
    const [avant] = await db.select({ valeur: schema.reponsesRapport.valeur }).from(schema.reponsesRapport).where(cible);
    const limite = champ.type === "texte" ? 500 : 4000;
    const valeur = (avant?.valeur ? `${avant.valeur}${champ.type === "texte" ? " ; " : "\n"}${ligne}` : ligne).slice(0, limite);
    if (avant) await db.update(schema.reponsesRapport).set({ valeur, majLe: new Date() }).where(cible);
    else await db.insert(schema.reponsesRapport).values({ rapportId: rapport.id, champId: champ.id, valeur, commentaire: "" });
    annulation = await enregistrerAnnulation(u.id, { genre: "note_reponse", rapportId: rapport.id, champId: champ.id, avant: avant ? avant.valeur : null, apres: valeur });
  }
  await noter(u.id, "note_rapport", rapport.id, { rubrique: n.rubrique, champ: champ.id });
  return {
    message: `Ajouté au rapport ${prochaine ? "de la semaine prochaine (celui de cette semaine est parti)" : "de la semaine"}, dans « ${champ.libelle} »${projet ? ` (${projet.code})` : ""}.`,
    ok: true,
    annulation,
    lien: prochaine ? undefined : "/rapport",
  };
}

/**
 * Le chef de projet (ou le référent DPO, sa direction, les exécutifs) met le projet à jour depuis la barre :
 * « à surveiller : retard du prestataire », « jalon validation métier 15/11 », « fin prévue 20/12 », « lancement 5/1 ».
 */
export async function mettreAJourProjetDepuisBarre(u: Utilisateur, a: Acces, o: { saisie: string; projetId: string }): Promise<ResultatBarre> {
  const projets = await projetsPourSaisie(u);
  const saisie = o.saisie;
  const choisi = o.projetId;
  // Le projet : celui choisi avec « / », sinon le code en tête (« UR à surveiller : … »), sinon « projet … ».
  const enTete = !choisi ? projetEnTete(saisie, projets, aujourdhui()) : null;
  const mots = !choisi && !enTete ? reconnaitreMots(saisie, { personnes: [], projets }) : null;
  const projetVu = choisi ? projets.find((p) => p.id === choisi) : (enTete?.projet ?? mots?.projet ?? null);
  if (!projetVu || (choisi && !UUID.test(choisi))) return { message: "Projet introuvable." };
  const m = analyserMajProjet(enTete ? enTete.reste : (mots?.texte ?? saisie), aujourdhui());
  if (!m) return { message: "Écrivez « risque : … », « jalon … 15/11 », « fin prévue 20/12 » ou « lancement 15/01 »." };
  if (m.genre === "sante" && m.sante === "en_retard")
    return { message: "La santé d'un projet est calculée par l'application (fin prévue, jalons, tâches). Pour signaler un risque que les données ne montrent pas : « risque : … »." };
  if (m.genre === "sante" && m.sante === "a_surveiller" && !m.motif) return { message: "Dites quel risque : « risque : le prestataire ne livre pas »." };
  const [p] = await db.select().from(schema.projets).where(eq(schema.projets.id, projetVu.id));
  if (!p || !peutGererProjet({ moiId: u.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p))
    return { message: "Seuls le chef de projet (ou le référent DPO), sa direction et les exécutifs mettent ce projet à jour." };
  if (p.archiveLe || p.statut === "requete" || p.statut === "refuse") return { message: "Ce projet ne se met plus à jour (demande, refusé ou archivé)." };

  let annulation: string;
  if (m.genre === "jalon") {
    if (!m.libelle) return { message: "Donnez un nom au jalon : « jalon validation métier 15/11 »." };
    const [{ dernier }] = await db.select({ dernier: max(schema.indicateurs.ordre) }).from(schema.indicateurs).where(eq(schema.indicateurs.projetId, p.id));
    const [i] = await db
      .insert(schema.indicateurs)
      .values({ projetId: p.id, libelle: m.libelle, ordre: (dernier ?? 0) + 1, prevuLe: m.prevuLe })
      .returning({ id: schema.indicateurs.id });
    await noter(u.id, "indicateur_ajoute", p.id, { libelle: m.libelle, prevuLe: m.prevuLe, barre: true });
    annulation = await enregistrerAnnulation(u.id, { genre: "jalon", projetId: p.id, indicateurId: i.id });
  } else {
    if (m.genre === "sante" && m.sante === "dans_les_temps" && !p.risqueMotif) return { message: "Aucun risque signalé sur ce projet : sa santé est calculée par l'application." };
    const avant = { risqueMotif: p.risqueMotif, risqueLe: p.risqueLe ? p.risqueLe.toISOString() : null, risqueParId: p.risqueParId, dateFinPrevue: p.dateFinPrevue, dateLancementPrevue: p.dateLancementPrevue };
    const valeurs: Partial<typeof schema.projets.$inferInsert> =
      m.genre === "sante"
        ? m.sante === "a_surveiller"
          ? { risqueMotif: m.motif, risqueLe: new Date(), risqueParId: u.id }
          : { risqueMotif: "", risqueLe: null, risqueParId: null }
        : m.genre === "fin"
          ? { dateFinPrevue: m.date }
          : { dateLancementPrevue: m.date };
    const [apres] = await db
      .update(schema.projets)
      .set({ ...valeurs, majLe: new Date() })
      .where(eq(schema.projets.id, p.id))
      .returning({ majLe: schema.projets.majLe });
    await noter(u.id, "projet_modifie", p.id, { ...valeurs, barre: true });
    if (m.genre === "fin") await noterReportFin(p.id, p.dateFinPrevue, m.date, u.id);
    await recalculerSante([p.id]);
    annulation = await enregistrerAnnulation(u.id, { genre: "projet", projetId: p.id, apresMajLe: apres.majLe.toISOString(), avant });
  }
  return {
    message: `${p.code} · ${m.genre === "sante" ? (m.sante === "a_surveiller" ? `Risque signalé : ${m.motif}` : "Risque retiré") : texteMajProjet(m)}${m.genre === "fin" && p.dateFinPrevue && p.dateFinPrevue !== m.date ? ` (au lieu du ${dateCourte(p.dateFinPrevue)})` : ""}.`,
    ok: true,
    annulation,
    lien: `/projets/${p.id}`,
    projetId: p.id,
  };
}

