import { Icone } from "@/components/Icone";
import { LONGUEUR, MAX_PAR_GENRE, texteMesure } from "@/lib/objectifs";
import type { ObjectifProjet } from "@/lib/donnees/objectifs";
import { dateCourte } from "@/lib/dates";
import { ajouterUnObjectif, modifierUnObjectif, retirerUnObjectif } from "../actions-objectifs";

/**
 * Page Modifier : les objectifs (une phrase chacun) et les bénéfices attendus (indicateur, valeur de départ, cible,
 * tous facultatifs). Sur un projet finalisé, archivé ou refusé, ils se lisent sans se modifier.
 */
export function SectionObjectifs({ projetId, objectifs, benefices, modifiable }: { projetId: string; objectifs: ObjectifProjet[]; benefices: ObjectifProjet[]; modifiable: boolean }) {
  return (
    <section className="carte carte--liste" id="objectifs" aria-labelledby="mp-objectifs" style={{ scrollMarginTop: 80 }}>
      <h2 id="mp-objectifs" className="carte__titre">
        Objectifs et bénéfices attendus
      </h2>
      <p className="note" style={{ margin: "4px 0 14px" }}>
        Ce que le projet doit atteindre, et ce qu&apos;il doit rapporter. Chaque objectif se dit atteint ou non à la clôture. Un bénéfice se constate après le lancement : donnez-lui un indicateur, une valeur de départ et une cible pour pouvoir le vérifier.
      </p>

      <h3 className="sante-barre__titre" style={{ margin: "0 0 6px" }}>
        Objectifs · {objectifs.length}
      </h3>
      <ol className="livrables-gestion">
        {objectifs.map((o, n) => (
          <li key={o.id} className="livrables-gestion__ligne">
            {modifiable ? (
              <details className="livrables-gestion__details">
                <summary className="livrables-gestion__resume">
                  <span className="livrables-gestion__ordre" aria-hidden="true">
                    {n + 1}
                  </span>
                  <span className="livrables-gestion__texte">
                    <span className="livrables-gestion__libelle">{o.libelle}</span>
                  </span>
                  <span className="livrables-gestion__modifier" aria-hidden="true">
                    <Icone nom="modifier" taille={14} /> Modifier
                  </span>
                </summary>
                <form action={modifierUnObjectif.bind(null, projetId, o.id)} className="livrables-gestion__form objectif-form">
                  <div className="champ livrables-gestion__nom">
                    <label htmlFor={`ob-${o.id}`}>Objectif</label>
                    <input id={`ob-${o.id}`} name="libelle" defaultValue={o.libelle} required minLength={3} maxLength={LONGUEUR.libelle} />
                  </div>
                  <div className="livrables-gestion__pied" style={{ gap: 8 }}>
                    <button type="submit" formAction={retirerUnObjectif.bind(null, projetId, o.id)} formNoValidate className="bouton-mini" aria-label={`Retirer l'objectif « ${o.libelle} »`}>
                      Retirer
                    </button>
                    <button type="submit" className="bouton-contour">
                      <Icone nom="coche" taille={16} /> Enregistrer
                    </button>
                  </div>
                </form>
              </details>
            ) : (
              <span className="livrables-gestion__resume">
                <span className="livrables-gestion__ordre" aria-hidden="true">
                  {n + 1}
                </span>
                <span className="livrables-gestion__libelle">{o.libelle}</span>
              </span>
            )}
          </li>
        ))}
        {!objectifs.length ? <li className="vide">Aucun objectif écrit.</li> : null}
      </ol>
      {modifiable && objectifs.length < MAX_PAR_GENRE ? (
        <form action={ajouterUnObjectif.bind(null, projetId, "objectif")} className="livrables-gestion__nouveau">
          <div className="livrables-gestion__form objectif-form">
            <div className="champ livrables-gestion__nom">
              <label htmlFor="ob-nouveau">Nouvel objectif</label>
              <input id="ob-nouveau" name="libelle" required minLength={3} maxLength={LONGUEUR.libelle} placeholder="Ex. : Optimiser les processus et les flux de travail du Centre de contact" />
            </div>
            <div className="livrables-gestion__pied">
              <button type="submit" className="bouton-contour">
                <Icone nom="ajouter" taille={16} /> Ajouter l&apos;objectif
              </button>
            </div>
          </div>
        </form>
      ) : null}

      <h3 className="sante-barre__titre" style={{ margin: "18px 0 6px" }}>
        Bénéfices attendus · {benefices.length}
      </h3>
      <ol className="livrables-gestion">
        {benefices.map((b, n) => {
          const mesure = texteMesure(b);
          const sous = [mesure || "Pas encore d'indicateur", b.constate ? `constaté : ${b.constate}${b.constateLe ? ` (${dateCourte(b.constateLe)})` : ""}` : null].filter(Boolean).join(" · ");
          return (
            <li key={b.id} className="livrables-gestion__ligne">
              {modifiable ? (
                <details className="livrables-gestion__details">
                  <summary className="livrables-gestion__resume">
                    <span className="livrables-gestion__ordre" aria-hidden="true">
                      {n + 1}
                    </span>
                    <span className="livrables-gestion__texte">
                      <span className="livrables-gestion__libelle">{b.libelle}</span>
                      <span className={`rangee__sous${mesure ? "" : " ton-veille"}`}>{sous}</span>
                    </span>
                    <span className="livrables-gestion__modifier" aria-hidden="true">
                      <Icone nom="modifier" taille={14} /> Modifier
                    </span>
                  </summary>
                  <form action={modifierUnObjectif.bind(null, projetId, b.id)} className="livrables-gestion__form benefice-form">
                    <ChampsBenefice id={b.id} b={b} />
                    <div className="livrables-gestion__pied" style={{ gap: 8 }}>
                      <button type="submit" formAction={retirerUnObjectif.bind(null, projetId, b.id)} formNoValidate className="bouton-mini" aria-label={`Retirer le bénéfice « ${b.libelle} »`}>
                        Retirer
                      </button>
                      <button type="submit" className="bouton-contour">
                        <Icone nom="coche" taille={16} /> Enregistrer
                      </button>
                    </div>
                  </form>
                </details>
              ) : (
                <span className="livrables-gestion__resume">
                  <span className="livrables-gestion__ordre" aria-hidden="true">
                    {n + 1}
                  </span>
                  <span className="livrables-gestion__texte">
                    <span className="livrables-gestion__libelle">{b.libelle}</span>
                    <span className="rangee__sous">{sous}</span>
                  </span>
                </span>
              )}
            </li>
          );
        })}
        {!benefices.length ? <li className="vide">Aucun bénéfice écrit.</li> : null}
      </ol>
      {modifiable && benefices.length < MAX_PAR_GENRE ? (
        <form action={ajouterUnObjectif.bind(null, projetId, "benefice")} className="livrables-gestion__nouveau" id="nouveau-benefice">
          <h4 className="sante-barre__titre" style={{ margin: 0 }}>
            Nouveau bénéfice
          </h4>
          <div className="livrables-gestion__form benefice-form">
            <ChampsBenefice id="nouveau" />
            <div className="livrables-gestion__pied">
              <button type="submit" className="bouton-contour">
                <Icone nom="ajouter" taille={16} /> Ajouter le bénéfice
              </button>
            </div>
          </div>
        </form>
      ) : null}
      {!modifiable ? (
        <p className="note" style={{ margin: "12px 0 0" }}>
          Le projet n&apos;est plus en cours : ses objectifs ne se modifient plus. La valeur constatée d&apos;un bénéfice se note sur la fiche du projet.
        </p>
      ) : null}
    </section>
  );
}

function ChampsBenefice({ id, b }: { id: string; b?: ObjectifProjet }) {
  return (
    <>
      <div className="champ livrables-gestion__nom">
        <label htmlFor={`be-l-${id}`}>Bénéfice</label>
        <input id={`be-l-${id}`} name="libelle" defaultValue={b?.libelle} required minLength={3} maxLength={LONGUEUR.libelle} placeholder="Ex. : Réduction du temps de traitement des demandes" />
      </div>
      <div className="champ livrables-gestion__critere">
        <label htmlFor={`be-i-${id}`}>Indicateur (facultatif)</label>
        <input id={`be-i-${id}`} name="indicateur" defaultValue={b?.indicateur} maxLength={LONGUEUR.indicateur} placeholder="Ex. : Délai moyen de traitement" />
      </div>
      <div className="champ livrables-gestion__date">
        <label htmlFor={`be-d-${id}`}>Valeur de départ</label>
        <input id={`be-d-${id}`} name="depart" defaultValue={b?.depart} maxLength={LONGUEUR.valeur} placeholder="Ex. : 48 h" />
      </div>
      <div className="champ livrables-gestion__date">
        <label htmlFor={`be-c-${id}`}>Cible</label>
        <input id={`be-c-${id}`} name="cible" defaultValue={b?.cible} maxLength={LONGUEUR.valeur} placeholder="Ex. : 24 h" />
      </div>
    </>
  );
}
