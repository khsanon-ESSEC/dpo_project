import type { ReactNode } from "react";

/** Barres verticales des rapports annuels : seul ornement de l'application. */
const BARRES: [number, number, string][] = [
  [10, 34, "#1b316a"], [22, 58, "#1b316a"], [8, 46, "#233c7d"], [30, 82, "#233c7d"], [12, 64, "#1b316a"],
  [40, 100, "#24478e"], [10, 72, "#233c7d"], [26, 90, "#284283"], [14, 54, "#1b316a"], [34, 78, "#24478e"],
  [8, 40, "#233c7d"], [20, 62, "#1b316a"],
];

export function Bandeau({ surtitre, titre, retour, children }: { surtitre: string; titre: string; retour?: ReactNode; children?: ReactNode }) {
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
