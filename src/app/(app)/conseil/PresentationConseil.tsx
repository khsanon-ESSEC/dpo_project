/**
 * Présentation proposée pour le rapport au conseil (demandée le 29 octobre 2026), à comparer avec le tableau habituel :
 * les mêmes lignes, lues d'un coup d'œil. En tête, les chiffres du mois ; puis le calendrier de livraison (une barre par
 * projet, le glissement depuis la fin prévue initialement, le lancement) ; puis une fiche par projet (santé, état
 * d'avancement, livrables, objectifs, dates). Lecture seule : l'état d'avancement se corrige dans le tableau.
 */
import type { lignesConseil } from "@/lib/donnees/conseil";
import { dateCourteAnnee, moisAnnee } from "@/lib/dates";
import { axeCalendrier, ecart, texteEcart, type DatesProjet } from "@/lib/presentation-conseil";
import { LienProjet } from "@/components/Liens";

type Lignes = Awaited<ReturnType<typeof lignesConseil>>;
export type LivrablesProjet = { valides: number; total: number; prochain: { libelle: string; prevuLe: string | null; enRetard: boolean } | null };

const SANTE: Record<string, string> = { dans_les_temps: "Dans les temps", a_surveiller: "À surveiller", en_retard: "En retard" };
const ORDRE_SANTE = ["en_retard", "a_surveiller", "dans_les_temps"];

function Sante({ valeur }: { valeur: string }) {
  return (
    <span className={`pc-sante pc-sante--${valeur}`}>
      <span className="pc-sante__point" aria-hidden="true" />
      {SANTE[valeur] ?? valeur}
    </span>
  );
}

export function PresentationConseil({
  lignes,
  objectifs,
  livrables,
  mois,
  jour,
  visibles,
}: {
  lignes: Lignes;
  objectifs: Map<string, string[]>;
  livrables: Map<string, LivrablesProjet>;
  mois: string;
  jour: string;
  visibles: "tous" | Set<string>;
}) {
  const projets = lignes.map(({ ligne, projet }, i) => {
    const dates: DatesProjet = { entree: projet.dateEntree, finInitiale: projet.dateFinInitiale, finDernier: ligne.dateFinDernierRapport, nouvelleFin: ligne.nouvelleDateFin, lancement: ligne.dateLancement };
    return {
      numero: i + 1,
      id: projet.id,
      code: projet.code,
      titre: projet.titre,
      description: projet.description,
      programme: projet.programme,
      sante: projet.sante,
      etat: ligne.etatAvancement,
      dates,
      ceMois: ecart(dates.finDernier, dates.nouvelleFin),
      depuisLeDebut: ecart(dates.finInitiale, dates.nouvelleFin),
      livrables: livrables.get(projet.id) ?? null,
      objectifs: objectifs.get(projet.id) ?? [],
    };
  });
  const axe = axeCalendrier(projets.map((p) => p.dates), jour);
  const parSante = ORDRE_SANTE.map((s) => ({ s, n: projets.filter((p) => p.sante === s).length })).filter((x) => x.n);
  const repoussees = projets.filter((p) => (p.ceMois ?? 0) > 0);
  const lancements = projets.filter((p) => p.dates.lancement && p.dates.lancement >= jour).sort((a, b) => a.dates.lancement!.localeCompare(b.dates.lancement!));
  const prochain = lancements[0]?.dates.lancement ?? null;
  const voit = (id: string) => visibles === "tous" || visibles.has(id);
  const aujourdhui = axe.position(jour);

  return (
    <div className="papier presentation-conseil">
      <div className="papier__corps">
        <header className="pc-entete">
          <div className="pc-entete__textes">
            <span className="pc-surtitre">Division Productivité et Organisation</span>
            <h2 className="pc-titre">Projets technologiques stratégiques</h2>
            <span className="pc-sous">Rapport au conseil · {moisAnnee(mois)}</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-couleur.svg" alt="UNIBANK" className="pc-logo" />
        </header>

        <dl className="pc-chiffres">
          <div>
            <dt>Projets suivis</dt>
            <dd className="pc-chiffre">{projets.length}</dd>
          </div>
          <div>
            <dt>Santé</dt>
            <dd className="pc-chiffres__sante">
              {parSante.map(({ s, n }) => (
                <span key={s}>
                  <strong>{n}</strong> <Sante valeur={s} />
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>Fin repoussée depuis le dernier rapport</dt>
            <dd>
              <span className={`pc-chiffre${repoussees.length ? " pc-chiffre--alerte" : ""}`}>{repoussees.length}</span>
              {repoussees.length ? <span className="pc-chiffre__detail">{repoussees.map((p) => `${p.code} ${texteEcart(p.ceMois)}`).join(" · ")}</span> : null}
            </dd>
          </div>
          <div>
            <dt>Prochain lancement</dt>
            <dd>
              <span className="pc-chiffre pc-chiffre--date">{prochain ? dateCourteAnnee(prochain) : "—"}</span>
              {prochain ? (
                <span className="pc-chiffre__detail">
                  {lancements
                    .filter((p) => p.dates.lancement === prochain)
                    .map((p) => p.code)
                    .join(", ")}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>

        <section className="pc-calendrier" aria-labelledby="pc-calendrier-t">
          <h3 id="pc-calendrier-t" className="pc-section">
            Calendrier de livraison
          </h3>
          <div className="pc-grille">
            <div className="pc-axe" aria-hidden="true">
              <span />
              <span className="pc-axe__piste">
                {axe.reperes.map((r) => (
                  <span key={r.iso} className={`pc-axe__repere${r.annee ? " pc-axe__repere--annee" : ""}`} style={{ left: `${r.pc}%` }}>
                    {r.libelle}
                  </span>
                ))}
              </span>
              <span />
            </div>
            {projets.map((p) => {
              const d = p.dates;
              const debut = d.entree ?? d.finInitiale ?? d.nouvelleFin;
              const fin = d.nouvelleFin ?? d.finInitiale;
              const glisse = d.finInitiale && d.nouvelleFin && d.nouvelleFin > d.finInitiale;
              const resume = [
                `${p.titre} : ${SANTE[p.sante] ?? p.sante}`,
                d.entree ? `entré le ${dateCourteAnnee(d.entree)}` : null,
                d.finInitiale ? `fin prévue initialement le ${dateCourteAnnee(d.finInitiale)}` : null,
                d.nouvelleFin ? `fin prévue aujourd'hui le ${dateCourteAnnee(d.nouvelleFin)}${p.depuisLeDebut ? ` (${texteEcart(p.depuisLeDebut)} depuis le début)` : ""}` : null,
                d.lancement ? `lancement le ${dateCourteAnnee(d.lancement)}` : null,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <div key={p.id} className="pc-ligne">
                  <span className="pc-ligne__nom">
                    <span className="pc-code">{p.code}</span>
                    <span>{p.titre}</span>
                  </span>
                  <span className="pc-piste" role="img" aria-label={resume} title={resume}>
                    <span className="pc-piste__aujourdhui" style={{ left: `${aujourdhui}%` }} />
                    {debut && fin ? (
                      <span
                        className={`pc-barre pc-barre--${p.sante}${glisse ? "" : " pc-barre--entiere"}`}
                        style={{ left: `${axe.position(debut)}%`, width: `${Math.max(0.6, axe.position(glisse ? d.finInitiale! : fin) - axe.position(debut))}%` }}
                      />
                    ) : null}
                    {glisse ? <span className="pc-glissement" style={{ left: `${axe.position(d.finInitiale!)}%`, width: `${axe.position(d.nouvelleFin!) - axe.position(d.finInitiale!)}%` }} /> : null}
                    {d.finInitiale ? <span className="pc-marque pc-marque--initiale" style={{ left: `${axe.position(d.finInitiale)}%` }} /> : null}
                    {d.finDernier && d.finDernier !== d.nouvelleFin ? <span className="pc-marque pc-marque--dernier" style={{ left: `${axe.position(d.finDernier)}%` }} /> : null}
                    {d.lancement ? <span className="pc-lancement" style={{ left: `${axe.position(d.lancement)}%` }} /> : null}
                  </span>
                  <span className="pc-ligne__fin">
                    {d.nouvelleFin ? dateCourteAnnee(d.nouvelleFin) : "—"}
                    {p.ceMois ? <span className="pc-ecart pc-ecart--mois">{texteEcart(p.ceMois)} ce mois</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
          <ul className="pc-legende" aria-label="Légende du calendrier">
            <li>
              <span className="pc-legende__barre" /> De l&apos;entrée à la fin prévue (couleur : santé du projet)
            </li>
            <li>
              <span className="pc-legende__glissement" /> Retard sur la fin prévue initialement
            </li>
            <li>
              <span className="pc-legende__marque" /> Fin prévue initialement
            </li>
            <li>
              <span className="pc-legende__marque pc-legende__marque--dernier" /> Fin prévue au dernier rapport
            </li>
            <li>
              <span className="pc-legende__lancement" /> Lancement prévu
            </li>
            <li>
              <span className="pc-legende__aujourdhui" /> Aujourd&apos;hui
            </li>
          </ul>
        </section>

        <section aria-labelledby="pc-projets-t">
          <h3 id="pc-projets-t" className="pc-section">
            Où en est chaque projet
          </h3>
          <div className="pc-cartes">
            {projets.map((p) => (
              <article key={p.id} className={`pc-carte pc-carte--${p.sante}`} aria-labelledby={`pc-p-${p.id}`}>
                <header className="pc-carte__entete">
                  <span className="pc-carte__numero">{p.numero}</span>
                  <span className="pc-carte__titres">
                    <h4 id={`pc-p-${p.id}`}>
                      <LienProjet id={p.id} visible={voit(p.id)}>
                        {p.titre}
                      </LienProjet>
                    </h4>
                    {p.programme ? <span className="pc-carte__programme">{p.programme}</span> : null}
                  </span>
                  <Sante valeur={p.sante} />
                </header>
                {p.ceMois ? (
                  <p className="pc-carte__alerte">
                    Fin repoussée depuis le dernier rapport : {dateCourteAnnee(p.dates.finDernier)} → <strong>{dateCourteAnnee(p.dates.nouvelleFin)}</strong> ({texteEcart(p.ceMois)})
                  </p>
                ) : null}
                <p className="pc-carte__etat">{p.etat}</p>
                {p.livrables && p.livrables.total ? (
                  <div className="pc-livrables">
                    <span className="pc-livrables__texte">
                      <strong>
                        {p.livrables.valides}/{p.livrables.total}
                      </strong>{" "}
                      livrable{p.livrables.total > 1 ? "s" : ""} validé{p.livrables.valides > 1 ? "s" : ""}
                    </span>
                    <span className="pc-livrables__piste" aria-hidden="true">
                      <span style={{ width: `${(p.livrables.valides / p.livrables.total) * 100}%` }} />
                    </span>
                    {p.livrables.prochain ? (
                      <span className={`pc-livrables__prochain${p.livrables.prochain.enRetard ? " pc-livrables__prochain--retard" : ""}`}>
                        Prochain : {p.livrables.prochain.libelle}
                        {p.livrables.prochain.prevuLe ? `, ${p.livrables.prochain.enRetard ? "prévu le" : "le"} ${dateCourteAnnee(p.livrables.prochain.prevuLe)}${p.livrables.prochain.enRetard ? " (en retard)" : ""}` : ""}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {p.objectifs.length ? (
                  <div className="pc-objectifs">
                    <span className="pc-etiquette">Objectifs</span>
                    <ul>
                      {p.objectifs.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <dl className="pc-dates">
                  <div>
                    <dt>Entrée</dt>
                    <dd>{dateCourteAnnee(p.dates.entree)}</dd>
                  </div>
                  <div>
                    <dt>Fin initiale</dt>
                    <dd>{dateCourteAnnee(p.dates.finInitiale)}</dd>
                  </div>
                  <div>
                    <dt>Dernier rapport</dt>
                    <dd>{dateCourteAnnee(p.dates.finDernier)}</dd>
                  </div>
                  <div className={p.ceMois ? "pc-dates__change" : undefined}>
                    <dt>Fin prévue</dt>
                    <dd>
                      {dateCourteAnnee(p.dates.nouvelleFin)}
                      {p.depuisLeDebut ? <span className="pc-ecart">{texteEcart(p.depuisLeDebut)} depuis le début</span> : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Lancement</dt>
                    <dd>{dateCourteAnnee(p.dates.lancement)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
