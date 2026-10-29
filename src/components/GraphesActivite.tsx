/**
 * Les graphiques d'activité d'une période, comparée à la période d'avant : tâches terminées, heures livrées,
 * charge réalisée (et prévue), terminées à temps, réunions, rapports du vendredi ; puis le tableau des chiffres.
 * Le même rendu pour une personne (sa fiche, Mon bilan) et pour une équipe (bilan de l'équipe).
 */
import { ecart, type Mesures, type PlanBilan } from "@/lib/bilan";
import { aLa, etiquettesAxe, libelleLigne } from "@/lib/bilan-libelles";
import { aujourdhui } from "@/lib/dates";
import { nombre } from "@/lib/charge";
import { Courbes, Jauge, valeurTexte, type PointCourbe, type Unite } from "@/components/Courbes";

const heuresReunion = (m: Mesures) => Math.round((m.minutesReunion / 60) * 10) / 10;
export const partRapports = (m: Mesures) => (m.rapportsAttendus ? Math.round((m.rapportsEnvoyes / m.rapportsAttendus) * 100) : null);

type Mesure = { id: string; titre: string; unite: Unite; valeur: (m: Mesures) => number | null; ecart: (a: Mesures, b: Mesures) => string | null; sous?: (m: Mesures) => string | null };

function mesures(equipe: boolean): Mesure[] {
  return [
    { id: "taches", titre: "Tâches terminées", unite: "nombre", valeur: (m) => m.taches, ecart: (a, b) => ecart(a.taches, b.taches) },
    { id: "heures", titre: "Heures livrées", unite: "heures", valeur: (m) => m.heures, ecart: (a, b) => ecart(a.heures, b.heures, " h") },
    {
      id: "charge",
      titre: "Charge réalisée",
      unite: "pourcent",
      valeur: (m) => m.tauxCharge,
      ecart: (a, b) => ecart(a.tauxCharge, b.tauxCharge, " pts"),
      sous: (m) => [`${nombre(m.heuresRealisees)} h sur ${nombre(m.capaciteNette)} h disponibles`, m.tauxPrevu !== null ? `prévue : ${m.tauxPrevu} %` : null].filter(Boolean).join(" · "),
    },
    { id: "temps", titre: "Terminées à temps", unite: "pourcent", valeur: (m) => m.aLHeure, ecart: (a, b) => ecart(a.aLHeure, b.aLHeure, " pts"), sous: (m) => (m.avecEcheance ? `sur ${m.avecEcheance} à échéance` : null) },
    equipe
      ? { id: "reunion", titre: "Part du temps en réunion", unite: "pourcent", valeur: (m) => m.partReunion, ecart: (a, b) => ecart(a.partReunion, b.partReunion, " pts"), sous: (m) => `${nombre(heuresReunion(m))} h en tout` }
      : { id: "reunion", titre: "Temps en réunion", unite: "heures", valeur: heuresReunion, ecart: (a, b) => ecart(heuresReunion(a), heuresReunion(b), " h"), sous: (m) => (m.partReunion === null ? null : `${m.partReunion} % du temps de travail`) },
  ];
}

export function GraphesActivite({
  plan,
  noms,
  etat,
  actuel,
  avant,
  serie,
  serieAvant,
  redige,
  equipe = false,
}: {
  plan: PlanBilan;
  noms: { actuel: string; avant: string; avantCourt: string };
  etat: { avecDonnees: (p: PlanBilan["actuel"]) => boolean; pasAvant: boolean; comparer: boolean; deuxSeries: boolean };
  actuel: Mesures;
  avant: Mesures;
  serie: (k: number) => Mesures;
  serieAvant: (k: number) => Mesures;
  /** false : pas de rapport du vendredi attendu (exécutif). */
  redige: boolean;
  /** Une équipe : la part du temps en réunion plutôt que les heures. */
  equipe?: boolean;
}) {
  const jour = aujourdhui();
  const etiquettes = etiquettesAxe(plan);
  const semaine = plan.vue === "semaine";
  const pas = semaine ? "semaine par semaine" : "mois par mois";
  const points = (valeur: (x: Mesures) => number | null): PointCourbe[] =>
    plan.axe.map((cle, k) => {
      const per = plan.serie[k];
      const av = plan.serieAvant?.[k];
      return {
        cle,
        libelle: etiquettes[k].libelle,
        court: etiquettes[k].court,
        actuel: per && etat.avecDonnees(per) ? valeur(serie(k)) : null,
        avant: etat.deuxSeries && av && etat.avecDonnees(av) ? valeur(serieAvant(k)) : null,
        libelleAvant: etiquettes[k].libelleAvant,
        enCours: !!per && per.fin >= jour,
      };
    });
  const liste = mesures(equipe);

  return (
    <>
      <div className="bilan-graphes">
        {liste.map((x) => (
          <article key={x.id} className="carte graphe-carte">
            <header className="graphe-carte__tete">
              <h3 className="graphe-carte__titre">{x.titre}</h3>
              <p className="graphe-carte__valeur">
                {valeurTexte(x.valeur(actuel), x.unite)}
                <span className="graphe-carte__ecart">{[x.sous?.(actuel), etat.comparer ? `${x.ecart(actuel, avant) ?? "—"} par rapport ${aLa(noms.avantCourt)}` : null].filter(Boolean).join(" · ")}</span>
              </p>
            </header>
            <Courbes titre={`${x.titre}, ${pas}`} points={points(x.valeur)} unite={x.unite} nomActuel={noms.actuel} nomAvant={etat.deuxSeries ? noms.avant : undefined} hauteur={100} />
          </article>
        ))}
        {redige ? (
          <article className="carte graphe-carte">
            <header className="graphe-carte__tete">
              <h3 className="graphe-carte__titre">Rapports du vendredi</h3>
            </header>
            <Jauge
              part={partRapports(actuel)}
              texte={actuel.rapportsAttendus ? `des rapports attendus envoyés (${actuel.rapportsEnvoyes} sur ${actuel.rapportsAttendus})` : "aucun rapport attendu sur la période"}
              sous={etat.comparer && avant.rapportsAttendus ? `${ecart(partRapports(actuel), partRapports(avant), " pts") ?? "—"} par rapport ${aLa(noms.avantCourt)}` : null}
            />
            <Courbes titre={`Rapports envoyés, ${pas}`} points={points(partRapports)} unite="pourcent" nomActuel={noms.actuel} nomAvant={etat.deuxSeries ? noms.avant : undefined} hauteur={90} />
          </article>
        ) : null}
      </div>
      <details className="carte" style={{ marginTop: 16 }}>
        <summary className="lien-discret" style={{ cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center" }}>
          Voir les chiffres {pas}
        </summary>
        <div className="defile-x">
          <table className="comparaison bilan-valeurs" style={{ minWidth: 640, marginTop: 8 }}>
            <thead>
              <tr>
                <th scope="col">{semaine ? "Semaine" : "Mois"}</th>
                {liste.map((x) => (
                  <th key={x.id} scope="col">
                    {x.titre}
                  </th>
                ))}
                {redige ? <th scope="col">Rapports envoyés</th> : null}
              </tr>
            </thead>
            <tbody>
              {plan.axe.map((cle, k) => {
                const per = plan.serie[k];
                const av = plan.serieAvant?.[k];
                const v = per && etat.avecDonnees(per) ? serie(k) : null;
                const w = etat.deuxSeries && av && etat.avecDonnees(av) ? serieAvant(k) : null;
                const cellule = (f: (y: Mesures) => number | null, unite: Unite, cleCellule: string) => (
                  <td key={cleCellule}>
                    {v ? valeurTexte(f(v), unite) : "—"}
                    {etat.deuxSeries ? <small>{w ? `${valeurTexte(f(w), unite)} en ${etiquettes[k].libelleAvant ?? "période d'avant"}` : "—"}</small> : null}
                  </td>
                );
                return (
                  <tr key={cle}>
                    <th scope="row">
                      {libelleLigne(plan, cle)}
                      {per && per.fin >= jour ? <small>en cours</small> : null}
                    </th>
                    {liste.map((x) => cellule(x.valeur, x.unite, x.id))}
                    {redige ? cellule(partRapports, "pourcent", "rapports") : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
