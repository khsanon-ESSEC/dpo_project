import type { ReactNode } from "react";

/** Barres verticales des rapports annuels : seul ornement de l'application. */
const BARRES: [number, number, string][] = [
  [10, 34, "rgba(255, 255, 255, 0.05)"], [22, 58, "rgba(255, 255, 255, 0.05)"], [8, 46, "rgba(255, 255, 255, 0.08)"], [30, 82, "rgba(255, 255, 255, 0.08)"], [12, 64, "rgba(255, 255, 255, 0.05)"],
  [40, 100, "rgba(255, 255, 255, 0.11)"], [10, 72, "rgba(255, 255, 255, 0.08)"], [26, 90, "rgba(255, 255, 255, 0.14)"], [14, 54, "rgba(255, 255, 255, 0.05)"], [34, 78, "rgba(255, 255, 255, 0.11)"],
  [8, 40, "rgba(255, 255, 255, 0.08)"], [20, 62, "rgba(255, 255, 255, 0.05)"],
];

export function Bandeau({ surtitre, titre, retour, children }: { surtitre: ReactNode; titre: ReactNode; retour?: ReactNode; children?: ReactNode }) {
  return (
    <header className="bandeau">
      <div className="bandeau__barres" aria-hidden="true">
        {BARRES.map(([l, h, c], i) => (
          <span key={i} style={{ width: l, height: `${h}%`, background: c }} />
        ))}
      </div>
      <div className="bandeau__corps">
        {retour}
        <p className="surtitre">{surtitre}</p>
        <h1 className="titre-page">{titre}</h1>
        {children}
      </div>
    </header>
  );
}

export function Anneau({
  fait,
  total,
  legende,
  taille = 104,
  label,
}: {
  fait: number;
  total: number;
  legende?: string;
  taille?: number;
  label: string;
}) {
  const pct = total > 0 ? Math.round((fait / total) * 100) : 0;
  const grand = taille >= 96;
  return (
    <div className="anneau" role="img" aria-label={label} style={{ "--pct": `${pct}%`, "--taille": `${taille}px` } as React.CSSProperties}>
      <div className="anneau__centre">
        <span style={{ fontSize: grand ? 34 : taille >= 80 ? 22 : 12, lineHeight: 1.05, fontWeight: grand ? 200 : 300 }}>
          {fait}
          <span className="anneau__sur">/{total}</span>
        </span>
        {legende && grand ? <span className="anneau__legende">{legende}</span> : null}
      </div>
    </div>
  );
}

/**
 * Le libellé d'un chiffre du bandeau, en lien vers ce qu'il compte : tout le bloc (le chiffre compris) est
 * cliquable ; le libellé est souligné en pointillé pour le signaler. `detail` complète le nom du lien pour
 * les lecteurs d'écran (« voir les 2 tâches »).
 */
export function LienChiffre({ href, children, detail }: { href: string; children: ReactNode; detail?: string }) {
  return (
    <a href={href} className="chiffre__lien">
      {children}
      {detail ? <span className="visuellement-cache"> : {detail}</span> : null}
    </a>
  );
}
