/**
 * Petit graphique en colonnes, une série (une valeur par semaine ou par mois). La période choisie est
 * dans la couleur d'accent, les autres dans un pas plus clair de la même teinte. Chaque colonne
 * s'atteint au clavier et montre sa valeur au survol ; le tableau des valeurs est juste en dessous.
 */
/** `etiquette` : la valeur courte posée sur la colonne choisie (par défaut, `texte`). */
export type Colonne = { cle: string; libelle: string; libelleCourt?: string; valeur: number; texte: string; etiquette?: string; detail?: string };

export function Colonnes({ titre, colonnes, choisie, hauteur = 112 }: { titre: string; colonnes: Colonne[]; choisie: string; hauteur?: number }) {
  const max = Math.max(1, ...colonnes.map((c) => c.valeur));
  const idT = `col-${titre.replace(/[^a-z]/gi, "").toLowerCase()}`;
  return (
    <figure className="colonnes-graphe" aria-labelledby={idT}>
      <figcaption id={idT} className="colonnes-graphe__titre">
        {titre}
      </figcaption>
      <div className="colonnes-graphe__zone" style={{ height: hauteur + 22 }}>
        {colonnes.map((c) => {
          const h = c.valeur > 0 ? Math.max(3, Math.round((c.valeur / max) * hauteur)) : 0;
          const courante = c.cle === choisie;
          return (
            <div key={c.cle} className="colonne" data-courante={courante ? "1" : undefined} tabIndex={0} aria-label={`${c.libelle} : ${c.texte}${c.detail ? `, ${c.detail}` : ""}`}>
              {courante ? (
                <span className="colonne__valeur" style={{ bottom: h + 4 }} aria-hidden="true">
                  {c.etiquette ?? c.texte}
                </span>
              ) : null}
              <span className="colonne__barre" style={{ height: h }} />
              <span className="colonne__info" role="tooltip">
                <strong>{c.texte}</strong>
                <span>{c.libelle}</span>
                {c.detail ? <span>{c.detail}</span> : null}
              </span>
            </div>
          );
        })}
      </div>
      <div className="colonnes-graphe__axe" aria-hidden="true">
        {colonnes.map((c) => (
          <span key={c.cle} data-courante={c.cle === choisie ? "1" : undefined}>
            <span className="axe-long">{c.libelle}</span>
            <span className="axe-court">{c.libelleCourt ?? c.libelle}</span>
          </span>
        ))}
      </div>
    </figure>
  );
}
