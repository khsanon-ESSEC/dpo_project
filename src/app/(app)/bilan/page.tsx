import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui } from "@/lib/dates";
import { ecart, etatComparaison, moisDebutExercice, planBilan } from "@/lib/bilan";
import { aLa, nomsDesPeriodes } from "@/lib/bilan-libelles";
import { nombre } from "@/lib/charge";
import { activite } from "@/lib/donnees/bilan";
import { periodePreferee } from "@/lib/periode-preferee";
import { dureeTexte } from "@/lib/projets";
import { Bandeau } from "@/components/Bandeau";
import { ChoixPeriode, NoteComparaison } from "@/components/ChoixPeriode";
import { GraphesActivite } from "@/components/GraphesActivite";
import { ONGLETS_SEMAINE, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "Mon bilan" };

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mon bilan : mon activité sur la période choisie (semaine, mois, 3 ou 6 mois, exercice), comparée à la période
 * d'avant. Le bilan d'une autre personne est sur sa fiche (les anciens liens « ?personne= » y mènent).
 */
export default async function PageBilan({ searchParams }: { searchParams: Promise<{ vue?: string; p?: string; semaine?: string; personne?: string }> }) {
  const { vue: v0, p: p0, semaine, personne } = await searchParams;
  const u = await exigerUtilisateur();
  // Anciennes adresses : « ?semaine= » devient la vue Semaine ; « ?personne= », la fiche de la personne.
  const vue = v0 ?? (semaine && JOUR.test(semaine) ? "semaine" : undefined);
  const p = p0 ?? (semaine && JOUR.test(semaine) ? semaine : undefined);
  if (personne && personne !== u.id && /^[0-9a-f-]{36}$/.test(personne)) {
    const q = new URLSearchParams();
    if (vue) q.set("vue", vue);
    if (p) q.set("p", p);
    redirect(`/personnes/${personne}${q.size ? `?${q}` : ""}#evolution`);
  }
  const debutExercice = moisDebutExercice(process.env.EXERCICE_DEBUT_MOIS);
  const plan = planBilan(vue ?? (await periodePreferee("semaine")), p, aujourdhui(), debutExercice);
  const a = await activite([u.id], plan);
  const etat = etatComparaison(plan, a.debuts.activite);
  const n = nomsDesPeriodes(plan, debutExercice);
  const t = a.total(0);
  const tAvant = a.total(1);
  const ec = (x: string | null) => (etat.comparer ? ` · ${x ?? "—"}` : "");
  const lien = (vv: string, pp?: string) => `/bilan?vue=${vv}${pp ? `&p=${pp}` : ""}`;

  return (
    <>
      <Bandeau surtitre={`${n.actuel}${etat.comparer ? `, comparé ${aLa(n.avantCourt)}` : ""}`} titre="Mon bilan">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>tâches terminées{ec(ecart(t.taches, tAvant.taches))}</dt>
            <dd>{t.taches}</dd>
          </div>
          <div className="chiffre">
            <dt>heures livrées{ec(ecart(t.heures, tAvant.heures, " h"))}</dt>
            <dd>
              {nombre(t.heures)}
              <small>&nbsp;h</small>
            </dd>
          </div>
          <div className={`chiffre ${(t.tauxCharge ?? 0) > 100 ? "chiffre--retard" : (t.tauxCharge ?? 0) > 85 ? "chiffre--veille" : ""}`}>
            <dt>charge réalisée{ec(ecart(t.tauxCharge, tAvant.tauxCharge, " pts"))}</dt>
            <dd>
              {t.tauxCharge ?? "—"}
              <small>&nbsp;%</small>
            </dd>
          </div>
          <div className="chiffre">
            <dt>en réunion</dt>
            <dd style={{ whiteSpace: "nowrap" }}>{t.minutesReunion ? dureeTexte(t.minutesReunion) : "0 h"}</dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_SEMAINE} courant="/bilan" label="Ma semaine" />
        <ChoixPeriode plan={plan} noms={n} lien={lien} comparer={etat.comparer} />
        <NoteComparaison plan={plan} noms={n} etat={etat} debutDonnees={a.debuts.activite} />
        <GraphesActivite plan={plan} noms={n} etat={etat} actuel={t} avant={tAvant} serie={(k) => a.total(a.iSerie(k))} serieAvant={(k) => a.total(a.iSerieAvant(k))} redige={!u.executif && !u.externe} />
        <p className="avertissement-bilan">
          Ces chiffres décrivent ce qui est enregistré dans l&apos;application : les tâches marquées faites (une tâche sans estimation compte pour 4 h), les réunions notées, les rapports envoyés. La charge réalisée répartit les
          heures estimées de chaque tâche terminée de son début à sa fin ; la charge prévue est notée chaque lundi. Ils ne mesurent ni la qualité du travail ni ce qui n&apos;est pas noté ; ils servent à en parler, pas à classer.
        </p>
      </div>
    </>
  );
}
