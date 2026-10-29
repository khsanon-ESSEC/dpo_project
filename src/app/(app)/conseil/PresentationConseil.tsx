/**
 * Le rapport au conseil tel qu'il part (présentation proposée le 29 octobre 2026, retenue le même jour) : ce qu'on voit
 * à l'écran est ce qui s'imprime. Deux feuilles A4 à l'italienne : la synthèse (chiffres du mois, l'essentiel de chaque
 * projet en une ligne, calendrier de livraison), puis le détail par projet. Les projets se lisent du plus préoccupant au
 * moins préoccupant : les membres du conseil ont peu de temps, l'important vient d'abord. Lecture seule : l'état
 * d'avancement se corrige dans le tableau de relecture.
 */
import type { lignesConseil } from "@/lib/donnees/conseil";
import { dateCourteAnnee, moisAnnee } from "@/lib/dates";
import { axeCalendrier, ecart, essentielDuProjet, RANG_SANTE, texteEcart, type ApercuConseil, type DatesProjet } from "@/lib/presentation-conseil";
import { FeuillesA4 } from "./FeuillesA4";

type Lignes = Awaited<ReturnType<typeof lignesConseil>>;

const SANTE: Record<string, string> = { dans_les_temps: "Dans les temps", a_surveiller: "À surveiller", en_retard: "En retard" };

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
  apercus,
  mois,
  jour,
}: {
  lignes: Lignes;
  objectifs: Map<string, string[]>;
  /** Santé, livrables et risque critique : figés à l'approbation, ou du jour pour un brouillon. */
  apercus: Map<string, ApercuConseil>;
  mois: string;
  /** L'« aujourd'hui » du rapport : le jour de l'approbation, ou aujourd'hui pour un brouillon. */
  jour: string;
}) {
  const projets = lignes
    .map(({ ligne, projet }, ordre) => {
      const dates: DatesProjet = { entree: projet.dateEntree, finInitiale: projet.dateFinInitiale, finDernier: ligne.dateFinDernierRapport, nouvelleFin: ligne.nouvelleDateFin, lancement: ligne.dateLancement };
      const ap = apercus.get(projet.id);
      const liv = ap?.livrables ?? null;
      const p = {
        ordre,
        id: projet.id,
        code: projet.code,
        titre: projet.titre,
        programme: projet.programme,
        sante: ap?.sante ?? projet.sante,
        etat: ligne.etatAvancement,
        dates,
        ceMois: ecart(dates.finDernier, dates.nouvelleFin),
        depuisLeDebut: ecart(dates.finInitiale, dates.nouvelleFin),
        livrables: liv,
        prochainLivrable: liv?.prochain ?? null,
        risqueCritique: ap?.risqueCritique ?? null,
        objectifs: objectifs.get(projet.id) ?? [],
      };
      return { ...p, essentiel: essentielDuProjet(p, jour) };
    })
    // Du plus préoccupant au moins préoccupant ; à santé égale, l'ordre du rapport.
    .sort((a, b) => (RANG_SANTE[a.sante] ?? 3) - (RANG_SANTE[b.sante] ?? 3) || a.ordre - b.ordre)
    .map((p, i) => ({ ...p, numero: i + 1 }));
  const axe = axeCalendrier(projets.map((p) => p.dates), jour);
  const parSante = ["en_retard", "a_surveiller", "dans_les_temps"].map((s) => ({ s, n: projets.filter((p) => p.sante === s).length })).filter((x) => x.n);
  const repoussees = projets.filter((p) => (p.ceMois ?? 0) > 0);
  const lancements = projets.filter((p) => p.dates.lancement && p.dates.lancement >= jour).sort((a, b) => a.dates.lancement!.localeCompare(b.dates.lancement!));
  const prochain = lancements[0]?.dates.lancement ?? null;
  const aujourdhui = axe.position(jour);
  const titreMois = moisAnnee(mois);

  const carte = (p: (typeof projets)[number]) => (
    <article key={p.id} className={`pc-carte pc-carte--${p.sante}`} aria-labelledby={`pc-p-${p.id}`}>
      <header className="pc-carte__entete">
        <span className="pc-carte__numero">{p.numero}</span>
        <span className="pc-carte__titres">
          <h4 id={`pc-p-${p.id}`}>{p.titre}</h4>
          {p.programme ? <span className="pc-carte__programme">{p.programme}</span> : null}
        </span>
        <Sante valeur={p.sante} />
      </header>
      {p.ceMois && p.ceMois > 0 ? (
        <p className="pc-carte__alerte">
          Fin repoussée ce mois : {dateCourteAnnee(p.dates.finDernier)} → <strong>{dateCourteAnnee(p.dates.nouvelleFin)}</strong> ({texteEcart(p.ceMois)})
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
              {p.livrables.prochain.enRetard ? "En retard" : "Prochain"} : {p.livrables.prochain.libelle}
              {p.livrables.prochain.prevuLe ? `, prévu le ${dateCourteAnnee(p.livrables.prochain.prevuLe)}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}
      {p.risqueCritique ? (
        <p className="pc-carte__risque">
          <span className="pc-etiquette">Risque critique</span> {p.risqueCritique}
        </p>
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
            {p.depuisLeDebut ? <span className="pc-ecart">{texteEcart(p.depuisLeDebut)} sur l&apos;initiale</span> : null}
          </dd>
        </div>
        <div>
          <dt>Lancement</dt>
          <dd>{dateCourteAnnee(p.dates.lancement)}</dd>
        </div>
      </dl>
    </article>
  );
  // Le détail : deux fiches par rangée ; chaque rangée est un bloc (une feuille en contient autant qu'elle peut).
  const rangees: (typeof projets)[] = [];
  for (let i = 0; i < projets.length; i += 2) rangees.push(projets.slice(i, i + 2));

  // ---------- Les blocs de la synthèse ----------
  const tete = (
    <div className="pc-tete">
      <header className="pc-entete">
        <div className="pc-entete__textes">
          <span className="pc-surtitre">Division Productivité et Organisation · Rapport au conseil</span>
          <h2 className="pc-titre">Projets technologiques stratégiques · {titreMois}</h2>
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
          <dt>Fin repoussée ce mois</dt>
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
    </div>
  );
  const essentiel = (
    <section className="pc-essentiel" aria-labelledby="pc-essentiel-t">
      <h3 id="pc-essentiel-t" className="pc-section">
        L&apos;essentiel, projet par projet
      </h3>
      <ol className="pc-essentiel__liste">
        {projets.map((p) => (
          <li key={p.id} className={`pc-essentiel__ligne pc-essentiel__ligne--${p.sante}`}>
            <span className="pc-essentiel__tete">
              <span className="pc-carte__numero">{p.numero}</span>
              <span className="pc-code">{p.code}</span>
              <strong>{p.titre}</strong>
              <Sante valeur={p.sante} />
            </span>
            <span className="pc-essentiel__points">
              {p.essentiel.map((x, i) => (
                <span key={i} className={/^(Fin repoussée|Livrable en retard|Risque critique)/.test(x) ? "pc-essentiel__alerte" : undefined}>
                  {x}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
  const calendrier = (
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
          const glisse = !!(d.finInitiale && d.nouvelleFin && d.nouvelleFin > d.finInitiale);
          const resume = [
            `${p.titre} : ${SANTE[p.sante] ?? p.sante}`,
            d.entree ? `entré le ${dateCourteAnnee(d.entree)}` : null,
            d.finInitiale ? `fin prévue initialement le ${dateCourteAnnee(d.finInitiale)}` : null,
            d.nouvelleFin ? `fin prévue aujourd'hui le ${dateCourteAnnee(d.nouvelleFin)}${p.depuisLeDebut ? ` (${texteEcart(p.depuisLeDebut)} sur la date initiale)` : ""}` : null,
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
                {p.ceMois ? <span className="pc-ecart">{texteEcart(p.ceMois)} ce mois</span> : null}
              </span>
            </div>
          );
        })}
      </div>
      <ul className="pc-legende" aria-label="Légende du calendrier">
        <li>
          <span className="pc-legende__barre" /> De l&apos;entrée à la fin prévue (couleur : santé)
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
  );
  const enteteDetail = (
    <header className="pc-entete pc-entete--suite">
      <h3 id="pc-projets-t" className="pc-section" style={{ margin: 0 }}>
        Détail par projet
      </h3>
      <span className="pc-sous">Rapport au conseil · {titreMois}</span>
    </header>
  );

  return (
    <article className="presentation-conseil" aria-label={`Rapport au conseil, ${titreMois}`}>
      <FeuillesA4
        pied={`Division Productivité et Organisation · Rapport au conseil · ${titreMois}`}
        sections={[
          { cle: "synthese", blocs: [tete, essentiel, calendrier] },
          {
            cle: "detail",
            blocs: [
              enteteDetail,
              ...rangees.map((r) => (
                <div key={r[0].id} className="pc-cartes">
                  {r.map(carte)}
                </div>
              )),
            ],
          },
        ]}
      />
    </article>
  );
}
