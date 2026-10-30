/**
 * Les absences à venir d'une personne (congé, formation, mission), avec le formulaire pour en noter une :
 * dans son profil, et sur sa fiche pour qui la suit. Elles comptent dans la charge.
 */
import { joursOuvresDe, LIBELLE_MOTIF, texteAbsence, JOURS_FUTURS_MAX, JOURS_PASSES_MAX } from "@/lib/absences";
import type { Acces } from "@/lib/acces";
import { ajouterJours, aujourdhui } from "@/lib/dates";
import { absencesAVenir, peutGererAbsences } from "@/lib/donnees/absences";
import { Icone } from "@/components/Icone";
import { enleverAbsence } from "./actions";
import { FormAbsence } from "./FormAbsence";

export async function CarteAbsences({ a, personneId, prenom }: { a: Acces; personneId: string; prenom: string }) {
  if (!(await peutGererAbsences(a, personneId))) return null;
  const moi = personneId === a.moi.id;
  const jour = aujourdhui();
  const liste = await absencesAVenir(personneId);
  return (
    <section className="carte carte--liste" aria-labelledby={`abs-titre-${personneId}`} id="absences" style={{ scrollMarginTop: 80 }}>
      <h2 id={`abs-titre-${personneId}`} className="carte__titre">
        {moi ? "Mes absences" : `Absences de ${prenom}`}
      </h2>
      <p className="note" style={{ margin: "0 0 6px" }}>
        Congés, formations, missions : les jours d&apos;absence ne comptent pas dans la charge, et qui note une réunion ce jour-là en est averti.
        {moi ? " Votre supérieur est prévenu." : ` ${prenom} est prévenu(e).`}
      </p>
      {liste.length ? (
        <ul className="liste">
          {liste.map((x) => {
            const n = joursOuvresDe(x);
            return (
              <li key={x.id} className="rangee rangee--etiree">
                <span className="rangee__texte">
                  <span className="rangee__titre">
                    {LIBELLE_MOTIF[x.motif]} {texteAbsence(x)}
                  </span>
                  <span className="rangee__sous">
                    {n} jour{n > 1 ? "s" : ""} ouvré{n > 1 ? "s" : ""}
                    {x.debut <= jour ? " · en cours" : ""}
                  </span>
                </span>
                <form action={enleverAbsence.bind(null, x.id)}>
                  <button type="submit" className="bouton-icone" style={{ width: 32, height: 32 }} aria-label={`Retirer l'absence ${texteAbsence(x)}`} title="Retirer">
                    <Icone nom="fermer" taille={16} />
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="note" style={{ margin: "0 0 4px" }}>
          Aucune absence prévue.
        </p>
      )}
      <FormAbsence personneId={personneId} aujourdhui={jour} min={ajouterJours(jour, -JOURS_PASSES_MAX)} max={ajouterJours(jour, JOURS_FUTURS_MAX)} />
    </section>
  );
}
