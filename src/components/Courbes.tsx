/**
 * Graphiques du bilan, dessinés au serveur (aucun script) :
 * - Courbes : une mesure mois par mois, la période étudiée en trait plein (couleur d'accent), la période
 *   comparée en pointillé (teinte effacée). Chaque mois s'atteint au clavier et montre ses deux valeurs au
 *   survol (trait vertical et bulle) ; la dernière valeur est écrite au bout de la courbe ; le tableau des
 *   valeurs est sous les graphiques.
 * - Tendance : petite courbe d'une personne, comparée à elle-même (jamais aux autres).
 * - Jauge : une part (rapports envoyés sur attendus).
 */
export type PointCourbe = {
  cle: string;
  /** « septembre 2026 » */
  libelle: string;
  /** « sept. » */
  court: string;
  actuel: number | null;
  avant: number | null;
  /** Libellé du mois comparé (« septembre 2025 »). */
  libelleAvant?: string;
  /** Mois en cours : compté jusqu'à aujourd'hui. */
  enCours?: boolean;
};

export type Unite = "nombre" | "heures" | "pourcent";

export function valeurTexte(v: number | null, unite: Unite): string {
  if (v === null) return "—";
  const n = String(Math.round(v * 10) / 10).replace(".", ",");
  return unite === "heures" ? `${n} h` : unite === "pourcent" ? `${n} %` : n;
}

/** Un maximum d'axe rond (1, 2, 5 × 10ⁿ) au-dessus de la plus grande valeur. */
function maxRond(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;

export function Courbes({
  titre,
  points,
  unite,
  nomActuel,
  nomAvant,
  hauteur = 120,
}: {
  titre: string;
  points: PointCourbe[];
  unite: Unite;
  nomActuel: string;
  /** Absent : une seule série (pas de légende). */
  nomAvant?: string;
  hauteur?: number;
}) {
  const n = points.length;
  const valeurs = points.flatMap((p) => [p.actuel, nomAvant ? p.avant : null]).filter((v): v is number => v !== null);
  // Une part reste sur une échelle ronde (10 %, 20 %, 50 %, 100 %) : 6 % sur une échelle de 100 % serait une ligne plate.
  const max = unite === "pourcent" ? Math.min(100, maxRond(Math.max(5, ...valeurs))) : maxRond(Math.max(0, ...valeurs));
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (Math.min(v, max) / max) * 94;
  const trace = (f: (p: PointCourbe) => number | null) => {
    // Une ligne par suite de mois renseignés (un mois sans valeur coupe la courbe).
    const morceaux: string[][] = [[]];
    points.forEach((p, i) => {
      const v = f(p);
      if (v === null) morceaux.push([]);
      else morceaux[morceaux.length - 1].push(`${x(i) * 10},${y(v)}`);
    });
    return morceaux.filter((m) => m.length > 0);
  };
  const actuels = trace((p) => p.actuel);
  const avants = nomAvant ? trace((p) => p.avant) : [];
  const dernier = points.map((p, i) => ({ p, i })).filter(({ p }) => p.actuel !== null).at(-1);
  // La valeur finale se pose du côté où la courbe n'arrive pas (dessous si elle descend vers le dernier point).
  const veille = dernier && dernier.i > 0 ? points[dernier.i - 1].actuel : null;
  // Tout en haut, l'étiquette passe dessous (elle irait sur la légende).
  // Et si l'autre courbe passe juste au-dessus du point, l'étiquette passe dessous aussi (elle la chevaucherait).
  const autre = dernier && nomAvant ? dernier.p.avant : null;
  const gene = dernier && autre != null && autre >= dernier.p.actuel! && y(dernier.p.actuel!) - y(autre) < 26;
  const dessous = dernier ? y(dernier.p.actuel!) < 16 || (veille !== null && veille > dernier.p.actuel!) || !!gene : false;
  const tousLesPoints = n <= 6;
  const idT = `courbe-${titre.replace(/[^a-z]/gi, "").toLowerCase()}`;
  // Six mois et plus : noms courts (« sept. ») ; au-delà de six, un sur deux.
  const court = n >= 6;

  return (
    <figure className={`courbes${dernier && dessous && y(dernier.p.actuel!) > 78 ? " courbes--fin-bas" : ""}`} aria-labelledby={idT}>
      <figcaption id={idT} className="visuellement-cache">
        {titre}
      </figcaption>
      {nomAvant ? (
        <p className="courbes__legende" aria-hidden="true">
          <span>
            <i className="courbes__cle" /> {nomActuel}
          </span>
          <span>
            <i className="courbes__cle courbes__cle--avant" /> {nomAvant}
          </span>
        </p>
      ) : null}
      <div className="courbes__cadre">
        <div className="courbes__axe-y" aria-hidden="true" style={{ height: hauteur }}>
          <span style={{ top: 0 }}>{valeurTexte(max, unite)}</span>
          <span style={{ top: "50%" }}>{valeurTexte(max / 2, unite)}</span>
          <span style={{ top: "100%" }}>0</span>
        </div>
        <div className="courbes__zone" style={{ height: hauteur }}>
          <span className="courbes__grille" style={{ top: pct(y(max)) }} aria-hidden="true" />
          <span className="courbes__grille" style={{ top: pct(y(max / 2)) }} aria-hidden="true" />
          <span className="courbes__grille courbes__grille--base" style={{ top: "100%" }} aria-hidden="true" />
          <svg className="courbes__svg" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            {avants.map((m, k) => (
              <polyline key={`a${k}`} className="courbes__ligne courbes__ligne--avant" points={m.join(" ")} />
            ))}
            {actuels.map((m, k) => (
              <polyline key={`c${k}`} className="courbes__ligne" points={m.join(" ")} />
            ))}
          </svg>
          {points.map((p, i) =>
            p.actuel !== null && (tousLesPoints || i === dernier?.i) ? (
              <span key={`d${p.cle}`} className={`courbes__point${p.enCours ? " courbes__point--en-cours" : ""}`} style={{ left: pct(x(i)), top: pct(y(p.actuel)) }} aria-hidden="true" />
            ) : null,
          )}
          {dernier ? (
            <span className={`courbes__fin${dernier.i > n / 2 ? " courbes__fin--gauche" : ""}${dessous ? " courbes__fin--dessous" : ""}`} style={{ left: pct(x(dernier.i)), top: pct(y(dernier.p.actuel!)) }} aria-hidden="true">
              {valeurTexte(dernier.p.actuel, unite)}
            </span>
          ) : null}
          {points.map((p, i) => (
            <span
              key={p.cle}
              className="courbes__mois"
              style={{ left: pct((i / n) * 100), width: pct(100 / n) }}
              tabIndex={0}
              aria-label={`${p.libelle}${p.enCours ? " (en cours)" : ""} : ${valeurTexte(p.actuel, unite)}${nomAvant ? ` ; ${p.libelleAvant ?? nomAvant} : ${valeurTexte(p.avant, unite)}` : ""}`}
            >
              <span className={`courbes__info${i > n / 2 ? " courbes__info--gauche" : ""}`} role="tooltip">
                <strong>{valeurTexte(p.actuel, unite)}</strong>
                <span>
                  {p.libelle}
                  {p.enCours ? " · en cours" : ""}
                </span>
                {nomAvant ? (
                  <span className="courbes__info-avant">
                    <i className="courbes__cle courbes__cle--avant" /> {valeurTexte(p.avant, unite)} · {p.libelleAvant ?? nomAvant}
                  </span>
                ) : null}
              </span>
            </span>
          ))}
        </div>
      </div>
      {/* Au-delà de neuf points, sur un écran étroit, un libellé sur trois seulement. */}
      <div className="courbes__axe-x" aria-hidden="true" data-etroit={n > 9 ? "1" : undefined}>
        {points.map((p, i) => (
          <span key={p.cle} data-cache={n > 6 && i % 2 === 1 ? "1" : undefined} data-tiers={i % 3 === 0 ? "1" : undefined}>
            {court ? p.court : p.libelle.split(" ")[0]}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Petite courbe d'une personne (un point par mois), avec son dernier point. */
export function Tendance({ valeurs, libelles, unite }: { valeurs: (number | null)[]; libelles: string[]; unite: Unite }) {
  const n = valeurs.length;
  const connues = valeurs.filter((v): v is number => v !== null);
  if (connues.length < 2) return <span className="tendance-courbe tendance-courbe--vide">—</span>;
  const max = Math.max(1, ...connues);
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 90 - (v / max) * 80;
  const pts = valeurs.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
  const derniere = valeurs.map((v, i) => ({ v, i })).filter((e) => e.v !== null).at(-1)!;
  const texte = valeurs.map((v, i) => `${libelles[i]} : ${valeurTexte(v, unite)}`).join(", ");
  return (
    <span className="tendance-courbe" role="img" aria-label={texte} title={texte}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={pts.join(" ")} />
      </svg>
      <span className="tendance-courbe__point" style={{ left: `${x(derniere.i)}%`, top: `${y(derniere.v!)}%` }} aria-hidden="true" />
    </span>
  );
}

/** Une part sur un total (rapports envoyés sur attendus), avec l'écart à la période comparée. */
export function Jauge({ part, texte, sous }: { part: number | null; texte: string; sous?: string | null }) {
  return (
    <div className="jauge-bilan">
      <div className="jauge-bilan__piste" role="img" aria-label={texte}>
        <span className="jauge-bilan__plein" style={{ width: `${Math.max(0, Math.min(100, part ?? 0))}%` }} />
      </div>
      <p className="jauge-bilan__texte">
        <strong>{part === null ? "—" : `${part} %`}</strong> {texte}
        {sous ? <span className="note"> · {sous}</span> : null}
      </p>
    </div>
  );
}
