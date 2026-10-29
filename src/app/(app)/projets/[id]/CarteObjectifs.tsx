import { Icone } from "@/components/Icone";
import { dateCourte } from "@/lib/dates";
import { LONGUEUR, estMesurable, texteMesure } from "@/lib/objectifs";
import type { ObjectifProjet } from "@/lib/donnees/objectifs";
import type { Objectifs } from "@/lib/suivi";
import { noterLeConstat } from "./actions-objectifs";

const EVALUATION: Record<Objectifs, string> = { oui: "Atteint", en_partie: "Atteint en partie", non: "Pas atteint" };

/**
 * Fiche du projet : ce qu'il doit atteindre (objectifs, dits atteints ou non à la clôture) et ce qu'il doit rapporter
 * (bénéfices : indicateur, départ → cible, valeur constatée). Qui gère le projet note la valeur constatée, aussi
 * après la clôture.
 */
export function CarteObjectifs({ projetId, objectifs, benefices, gere, modifiable, constatPossible, message }: { projetId: string; objectifs: ObjectifProjet[]; benefices: ObjectifProjet[]; gere: boolean; modifiable: boolean; constatPossible: boolean; message?: string | null }) {
  if (!objectifs.length && !benefices.length) {
    if (!gere || !modifiable) return null;
    return (
      <section className="carte objectifs-projet objectifs-projet--vide" id="objectifs" aria-labelledby="p-objectifs" style={{ scrollMarginTop: 80 }}>
        <h2 id="p-objectifs" className="carte__titre" style={{ margin: 0 }}>
          Objectifs et bénéfices attendus
        </h2>
        <p className="note" style={{ margin: "6px 0 10px" }}>
          Pas encore écrits. Ils figurent sur la fiche de projet exportée ; les objectifs se disent atteints ou non à la clôture, les bénéfices se vérifient après le lancement.
        </p>
        <a href={`/projets/${projetId}/modifier#objectifs`} className="bouton-contour">
          <Icone nom="ajouter" taille={16} /> Écrire les objectifs
        </a>
      </section>
    );
  }
  return (
    <section className="carte objectifs-projet" id="objectifs" aria-labelledby="p-objectifs" style={{ scrollMarginTop: 80 }}>
      <div className="carte__entete">
        <h2 id="p-objectifs" className="carte__titre" style={{ margin: 0 }}>
          Objectifs et bénéfices attendus
        </h2>
        {gere && modifiable ? (
          <a href={`/projets/${projetId}/modifier#objectifs`} className="bouton-mini">
            <Icone nom="modifier" taille={14} /> Modifier
          </a>
        ) : null}
      </div>
      {message ? (
        <p className="succes" role="status" style={{ margin: "8px 0" }}>
          {message}
        </p>
      ) : null}
      {objectifs.length ? (
        <>
          <h3 className="sante-barre__titre objectifs-projet__titre">Objectifs</h3>
          <ol className="objectifs-projet__liste">
            {objectifs.map((o) => (
              <li key={o.id}>
                <span>{o.libelle}</span>
                {o.evaluation ? <span className={`cloture__objectifs cloture__objectifs--${o.evaluation} objectifs-projet__eval`}>{EVALUATION[o.evaluation as Objectifs] ?? o.evaluation}</span> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {benefices.length ? (
        <>
          <h3 className="sante-barre__titre objectifs-projet__titre">Bénéfices attendus</h3>
          <ul className="objectifs-projet__benefices">
            {benefices.map((b) => (
              <li key={b.id} className="benefice">
                <span className="benefice__libelle">{b.libelle}</span>
                {b.indicateur ? (
                  <dl className="benefice__mesure">
                    <div>
                      <dt>Indicateur</dt>
                      <dd>{b.indicateur}</dd>
                    </div>
                    <div>
                      <dt>Départ</dt>
                      <dd>{b.depart || "—"}</dd>
                    </div>
                    <div>
                      <dt>Cible</dt>
                      <dd>{b.cible || "—"}</dd>
                    </div>
                    <div className={b.constate ? "benefice__constate" : undefined}>
                      <dt>Constaté{b.constateLe ? ` le ${dateCourte(b.constateLe)}` : ""}</dt>
                      <dd>{b.constate || "pas encore"}</dd>
                    </div>
                  </dl>
                ) : (
                  <span className="rangee__sous ton-veille">Sans indicateur : il ne pourra pas se vérifier.</span>
                )}
                {gere && constatPossible && estMesurable(b) ? (
                  <details className="livrable__renvoi">
                    <summary className="bouton-mini">{b.constate ? "Mettre à jour la valeur constatée" : "Noter la valeur constatée"}</summary>
                    <form action={noterLeConstat.bind(null, projetId, b.id)} className="livrable__renvoi-form">
                      <label htmlFor={`cst-${b.id}`}>{texteMesure(b)} : valeur constatée</label>
                      <input id={`cst-${b.id}`} name="constate" defaultValue={b.constate} maxLength={LONGUEUR.valeur} placeholder={`Ex. : ${b.cible}`} />
                      <button type="submit" className="bouton-contour">
                        Enregistrer
                      </button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

