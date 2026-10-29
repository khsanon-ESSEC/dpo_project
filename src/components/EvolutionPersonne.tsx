/**
 * Évolution d'une personne sur la période choisie, comparée à la période d'avant : tâches terminées, heures
 * livrées, charge réalisée, terminées à temps, réunions, rapports du vendredi. Sur sa fiche, pour qui la suit.
 * La personne n'est comparée qu'à elle-même.
 */
import { aujourdhui } from "@/lib/dates";
import { etatComparaison, moisDebutExercice, planBilan } from "@/lib/bilan";
import { nomsDesPeriodes } from "@/lib/bilan-libelles";
import { activite } from "@/lib/donnees/bilan";
import { periodePreferee } from "@/lib/periode-preferee";
import { ChoixPeriode, NoteComparaison } from "@/components/ChoixPeriode";
import { GraphesActivite } from "@/components/GraphesActivite";

export async function EvolutionPersonne({ personneId, vue, param, redige, lien }: { personneId: string; vue?: string; param?: string; redige: boolean; lien: (vue: string, param?: string) => string }) {
  const debutExercice = moisDebutExercice(process.env.EXERCICE_DEBUT_MOIS);
  const plan = planBilan(vue ?? (await periodePreferee("semaine")), param, aujourdhui(), debutExercice);
  const a = await activite([personneId], plan);
  const etat = etatComparaison(plan, a.debuts.activite);
  const n = nomsDesPeriodes(plan, debutExercice);

  return (
    <section aria-labelledby="evolution-titre" id="evolution" className="evolution-personne">
      <div className="carte__entete" style={{ marginBottom: 8 }}>
        <h2 id="evolution-titre" className="carte__titre" style={{ margin: 0 }}>
          Évolution
        </h2>
      </div>
      <ChoixPeriode plan={plan} noms={n} lien={lien} comparer={etat.comparer} />
      <NoteComparaison plan={plan} noms={n} etat={etat} debutDonnees={a.debuts.activite} />
      <GraphesActivite plan={plan} noms={n} etat={etat} actuel={a.total(0)} avant={a.total(1)} serie={(k) => a.total(a.iSerie(k))} serieAvant={(k) => a.total(a.iSerieAvant(k))} redige={redige} />
      <p className="avertissement-bilan">
        Ces chiffres décrivent ce qui est enregistré dans l&apos;application : tâches marquées faites (une tâche sans estimation compte pour 4 h), réunions notées, rapports envoyés. La charge réalisée répartit les heures
        estimées de chaque tâche terminée de son début à sa fin ; la charge prévue est notée chaque lundi. Ils ne mesurent ni la qualité du travail ni ce qui n&apos;est pas noté : la personne n&apos;est comparée qu&apos;à elle-même.
      </p>
    </section>
  );
}
