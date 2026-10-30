import { dateCourte } from "@/lib/dates";
import { ESTIMATION_PAR_DEFAUT, heuresTexte, LIBELLE_NIVEAU } from "@/lib/charge";
import type { LigneCharge } from "@/lib/donnees/charge";
import { Jauge } from "@/components/Charge";

/**
 * Ma charge, au-dessus de mes tâches (demandé le 29 octobre 2026) : les heures prévues sur les heures disponibles,
 * semaine par semaine, pour voir en consultant sa liste si l'on peut en prendre davantage. Mêmes règles que la page
 * Charge (src/lib/charge.ts) ; le détail d'une semaine est sur sa fiche.
 */
export function MaCharge({ ligne, semaines }: { ligne: LigneCharge; semaines: string[] }) {
  const { charge } = ligne;
  const cette = charge.semaines[0];
  const signaux = [
    charge.enRetard ? `${charge.enRetard} en retard, à rattraper cette semaine` : null,
    charge.sansEstimation ? `${charge.sansEstimation} sans estimation, comptée${charge.sansEstimation > 1 ? `s ${ESTIMATION_PAR_DEFAUT} h chacune` : ` ${ESTIMATION_PAR_DEFAUT} h`}` : null,
    charge.sansDate ? `${charge.sansDate} sans date, pas comptée${charge.sansDate > 1 ? "s" : ""}` : null,
    charge.bloquees ? `${charge.bloquees} bloquée${charge.bloquees > 1 ? "s" : ""}, pas comptée${charge.bloquees > 1 ? "s" : ""} tant qu'elle${charge.bloquees > 1 ? "s le restent" : " le reste"}` : null,
  ].filter(Boolean);
  const detail = (semaine: string) => `/personnes/${ligne.id}?semaine=${semaine}#charge`;
  return (
    <section className="carte ma-charge" id="ma-charge" aria-labelledby="t-ma-charge">
      <div className="carte__entete">
        <h2 id="t-ma-charge" className="carte__titre">
          Ma charge · {semaines.length} semaines
        </h2>
        <a href={detail(semaines[0])} className="lien-discret">
          Le détail, tâche par tâche →
        </a>
      </div>
      <p className="note ma-charge__resume" style={{ margin: 0 }}>
        Cette semaine, jours qui restent : {heuresTexte(cette.heures)} prévues pour {heuresTexte(cette.capacite)} disponibles · {LIBELLE_NIVEAU[cette.niveau].toLowerCase()}.
      </p>
      <div className="fiche-jauges fiche-jauges--serre">
        {charge.semaines.map((w, i) => (
          <div key={w.semaine} className="fiche-jauges__semaine">
            <span className="rangee__sous">{i === 0 ? "Cette semaine" : i === 1 ? "Semaine prochaine" : `Sem. du ${dateCourte(w.semaine)}`}</span>
            <Jauge heures={w.heures} capacite={w.capacite} niveau={w.niveau} absence={w.absence} jours={w.jours} lien={detail(w.semaine)} delai={i * 60} />
          </div>
        ))}
      </div>
      {signaux.length || cette.reunions ? (
        <p className="note ma-charge__signaux" style={{ margin: 0 }}>
          {signaux.length ? `Tâches ouvertes : ${signaux.join(" ; ")}. ` : ""}
          {cette.reunions ? `Les réunions notées (${heuresTexte(cette.reunions)} cette semaine) sont déduites du temps disponible.` : ""}
        </p>
      ) : null}
    </section>
  );
}
