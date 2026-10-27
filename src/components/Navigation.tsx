"use client";

import { usePathname } from "next/navigation";
import { BoutonTheme } from "./BoutonTheme";
import { Icone } from "./Icone";

export type ElementNav = { href: string; libelle: string; icone: string; compte?: number; telephone?: boolean };

function estCourant(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Rail({ elements, initiales, nom }: { elements: ElementNav[]; initiales: string; nom: string }) {
  const pathname = usePathname();
  return (
    <nav className="rail" aria-label="Navigation principale">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="rail__logo" src="/logo-blanc.svg" alt="UNIBANK" />
      {elements.map((e) => (
        <a key={e.href} href={e.href} className="rail__lien" aria-current={estCourant(pathname, e.href) ? "page" : undefined}>
          <span className="rail__pastille">
            <Icone nom={e.icone} />
            {e.compte ? <span className="compteur">{e.compte}</span> : null}
          </span>
          {e.libelle}
          {e.compte ? <span className="visuellement-cache"> ({e.compte} non lues)</span> : null}
        </a>
      ))}
      <div className="rail__pied">
        <BoutonTheme />
        <a
          href="/profil"
          aria-label={`Votre profil : ${nom}`}
          title={nom}
          style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "#24478e", color: "#fff", fontSize: 13, fontWeight: 500, letterSpacing: "0.04em", textDecoration: "none" }}
        >
          {initiales}
        </a>
      </div>
    </nav>
  );
}

export function Onglets({ elements }: { elements: ElementNav[] }) {
  const pathname = usePathname();
  return (
    <nav className="onglets" aria-label="Navigation principale">
      {elements
        .filter((e) => e.telephone)
        .map((e) => (
          <a key={e.href} href={e.href} aria-current={estCourant(pathname, e.href) ? "page" : undefined}>
            <span style={{ position: "relative", display: "flex" }}>
              <Icone nom={e.icone} />
              {e.compte ? <span className="compteur" style={{ top: -6, right: -12 }}>{e.compte}</span> : null}
            </span>
            {e.libelle}
          </a>
        ))}
    </nav>
  );
}

/** Écran courant, pour adapter les suggestions de l'assistant. */
export function ecranDepuisChemin(pathname: string): string {
  if (pathname.startsWith("/rapport")) return "rapport";
  if (pathname.startsWith("/equipe")) return "equipe";
  if (pathname.startsWith("/projets/")) return "projet";
  if (pathname.startsWith("/projets")) return "portefeuille";
  if (pathname.startsWith("/conseil")) return "conseil";
  if (pathname.startsWith("/organisation")) return "organisation";
  return "semaine";
}
