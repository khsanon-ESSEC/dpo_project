import type { Metadata } from "next";
import { dateCourte } from "@/lib/dates";
import { LIBELLE_ETAT_LIVRABLE } from "@/lib/projets";
import { ListeFiltrable } from "@/components/ListeFiltrable";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { deplacerInd, enregistrerLivrable, retirerInd } from "../../gestion-actions";
import { donneesLivrables } from "./commun";

export const metadata: Metadata = { title: "Livrables du projet" };

const FAIT: Record<string, string> = {
  ajoute: "Livrable ajouté : son responsable est prévenu.",
  enregistre: "Livrable enregistré.",
};

/**
 * Les livrables d'un projet, à gérer sur leur propre page (comme les tâches) : les modifier, les ordonner, les
 * retirer ; « Nouveau livrable » en tête. Pour qui gère le projet.
 */
export default async function PageLivrablesDuProjet({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ livrable?: string; erreur?: string; ouvrir?: string }> }) {
  const { id } = await params;
  const { livrable, erreur, ouvrir } = await searchParams;
  const { p, indicateurs, phases, nTaches, personnes, optionsResponsable, modifiable } = await donneesLivrables(id);
  const message = livrable ? (FAIT[livrable] ?? null) : null;

  return (
    <>
      <Bandeau
        surtitre={`Livrables · ${p.code}`}
        titre={p.titre}
        retour={
          <a href={`/projets/${p.id}#livrables`} className="retour">
            <Icone nom="chevron-gauche" taille={18} /> {p.titre}
          </a>
        }
      />
      <div className="page">
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : message ? (
          <p className="succes" role="status">
            {message}
          </p>
        ) : null}
        {modifiable ? (
          <div className="ligne-actions">
            <a href={`/projets/${p.id}/livrables/nouveau?retour=liste`} className="bouton-ambre">
              <Icone nom="ajouter" taille={18} /> Nouveau livrable
            </a>
          </div>
        ) : null}
        <section className="carte carte--liste" id="livrables" aria-labelledby="lv-titre">
          <h2 id="lv-titre" className="carte__titre">
            Livrables · {indicateurs.length}
          </h2>
          <p className="note" style={{ margin: "4px 0 12px" }}>
            {modifiable
              ? "Un livrable, une date, un responsable. Le responsable détermine les tâches qui y mènent et peut en confier à l'équipe du projet ; il le déclare prêt à valider, et vous le validez sur la fiche du projet. Cliquez un livrable pour le modifier."
              : "Ce projet est archivé ou refusé : ses livrables se lisent, sans se modifier."}
          </p>
          <ol className="livrables-gestion">
            {indicateurs.map((i, n) => {
              const sous = [
                i.phaseId ? (phases.find((ph) => ph.id === i.phaseId)?.nom ?? null) : null,
                i.prevuLe ? `prévu le ${dateCourte(i.prevuLe)}` : "sans date",
                i.responsableId ? (personnes.find((x) => x.id === i.responsableId)?.nom ?? "—") : "sans responsable",
                LIBELLE_ETAT_LIVRABLE[i.etat].toLowerCase(),
                nTaches.get(i.id) ? `${nTaches.get(i.id)} tâche${nTaches.get(i.id)! > 1 ? "s" : ""}` : "aucune tâche",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={i.id} id={`livrable-${i.id}`} className="livrables-gestion__ligne" style={{ scrollMarginTop: 80 }}>
                  {modifiable ? (
                    <details className="livrables-gestion__details" open={ouvrir === i.id ? true : undefined}>
                      <summary className="livrables-gestion__resume">
                        <span className="livrables-gestion__ordre" aria-hidden="true">
                          {i.ordre}
                        </span>
                        <span className="livrables-gestion__texte">
                          <span className="livrables-gestion__libelle">{i.libelle}</span>
                          <span className="rangee__sous">{sous}</span>
                        </span>
                        <span className="livrables-gestion__modifier" aria-hidden="true">
                          <Icone nom="modifier" taille={14} /> Modifier
                        </span>
                      </summary>
                      <form action={enregistrerLivrable.bind(null, p.id, i.id)} className="livrables-gestion__form">
                        <div className="champ livrables-gestion__nom">
                          <label htmlFor={`lv-l-${i.id}`}>Livrable</label>
                          <input id={`lv-l-${i.id}`} name="libelle" defaultValue={i.libelle} required maxLength={200} />
                        </div>
                        <div className="champ livrables-gestion__date">
                          <label htmlFor={`lv-d-${i.id}`}>Prévu le</label>
                          <input id={`lv-d-${i.id}`} name="prevuLe" type="date" defaultValue={i.prevuLe ?? ""} />
                        </div>
                        <div className="champ livrables-gestion__resp">
                          <label htmlFor={`lv-r-${i.id}`}>Responsable</label>
                          <ListeFiltrable id={`lv-r-${i.id}`} name="responsableId" defaultValue={i.responsableId ?? ""} vide="Aucun" placeholder="Tapez un nom" options={optionsResponsable} aucun="Personne ne correspond à" />
                        </div>
                        {phases.length ? (
                          <div className="champ">
                            <label htmlFor={`lv-p-${i.id}`}>Phase</label>
                            <select id={`lv-p-${i.id}`} name="phaseId" defaultValue={i.phaseId ?? ""}>
                              <option value="">Aucune</option>
                              {phases.map((ph) => (
                                <option key={ph.id} value={ph.id}>
                                  {ph.nom}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        <div className="champ livrables-gestion__critere">
                          <label htmlFor={`lv-c-${i.id}`}>Validé quand (facultatif)</label>
                          <input id={`lv-c-${i.id}`} name="critere" defaultValue={i.critere} maxLength={500} placeholder="Ex. : rapport d'audit sans point critique" />
                        </div>
                        <div className="livrables-gestion__pied" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                          <a href={`/projets/${p.id}/livrables/${i.id}`} className="lien-discret">
                            Ouvrir le livrable →
                          </a>
                          <button type="submit" className="bouton-contour">
                            <Icone nom="coche" taille={16} /> Enregistrer
                          </button>
                        </div>
                      </form>
                    </details>
                  ) : (
                    <a href={`/projets/${p.id}/livrables/${i.id}`} className="livrables-gestion__resume">
                      <span className="livrables-gestion__ordre" aria-hidden="true">
                        {i.ordre}
                      </span>
                      <span className="livrables-gestion__texte">
                        <span className="livrables-gestion__libelle">{i.libelle}</span>
                        <span className="rangee__sous">{sous}</span>
                      </span>
                    </a>
                  )}
                  {modifiable ? (
                    <span className="livrables-gestion__outils">
                      <form action={deplacerInd.bind(null, p.id, i.id, -1)}>
                        <button type="submit" className="bouton-icone" style={{ width: 32, height: 32 }} disabled={n === 0} aria-label={`Monter « ${i.libelle} »`} title="Monter">
                          <Icone nom="chevron-haut" taille={16} />
                        </button>
                      </form>
                      <form action={deplacerInd.bind(null, p.id, i.id, 1)}>
                        <button type="submit" className="bouton-icone" style={{ width: 32, height: 32 }} disabled={n === indicateurs.length - 1} aria-label={`Descendre « ${i.libelle} »`} title="Descendre">
                          <Icone nom="chevron-bas" taille={16} />
                        </button>
                      </form>
                      <form action={retirerInd.bind(null, p.id, i.id)}>
                        <button
                          type="submit"
                          className="bouton-icone"
                          style={{ width: 32, height: 32 }}
                          aria-label={`Retirer « ${i.libelle} »${nTaches.get(i.id) ? ` (ses tâches restent, hors livrable)` : ""}`}
                          title={nTaches.get(i.id) ? "Retirer (ses tâches restent, hors livrable)" : "Retirer"}
                        >
                          <Icone nom="fermer" taille={16} />
                        </button>
                      </form>
                    </span>
                  ) : null}
                </li>
              );
            })}
            {indicateurs.length === 0 ? (
              <li className="vide">
                Aucun livrable.
                {modifiable ? (
                  <>
                    {" "}
                    <a href={`/projets/${p.id}/livrables/nouveau?retour=liste`} className="lien-discret">
                      Ajouter le premier
                    </a>
                    .
                  </>
                ) : null}
              </li>
            ) : null}
          </ol>
        </section>
      </div>
    </>
  );
}
