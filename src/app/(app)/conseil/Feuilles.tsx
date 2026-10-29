"use client";

/**
 * Des feuilles Legal (8,5 × 14 po) à l'italienne, à l'écran comme à l'impression (29 octobre 2026 ; A4 d'abord, Legal à
 * la demande de Karl-Henry, le format du rapport au conseil) : les blocs du rapport sont mesurés
 * puis rangés feuille par feuille (une section commence toujours une nouvelle feuille), si bien que l'écran montre
 * exactement les pages qui sortiront de l'imprimante, avec leur numéro.
 *
 * Une feuille Legal (14 po, 1 344 px) est plus large que l'écran d'un portable : elle est alors réduite pour tenir dans
 * la largeur, comme un lecteur PDF « ajusté à la largeur » ; la mise en page ne change pas. Sous 80 %, on garde la
 * taille réelle et la zone défile (le zoom du navigateur reste utile). Sur un téléphone, ni rangement ni réduction : la
 * mise en page se resserre (on n'imprime pas d'un téléphone).
 */
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";

type Section = { cle: string; blocs: ReactNode[] };
type Page = { section: number; blocs: number[] };

/** Hauteur utile d'une feuille : 8,5 po (215,9 mm) moins les marges de 10 mm, en pixels CSS (96 par pouce). */
const HAUTEUR_UTILE = ((215.9 - 20) * 96) / 25.4;
/** En deçà, la feuille garde sa taille réelle et la zone défile. */
const REDUCTION_MINIMALE = 0.8;
const TELEPHONE = "(max-width: 699px)";

export function Feuilles({ sections, pied }: { sections: Section[]; pied: string }) {
  const cadre = useRef<HTMLDivElement>(null);
  const racine = useRef<HTMLDivElement>(null);
  // Avant la mesure (rendu du serveur) ou sur téléphone : une feuille par section.
  const [pages, setPages] = useState<Page[] | null>(null);
  const [ajustement, setAjustement] = useState<{ echelle: number; hauteur: number } | null>(null);

  // Les hauteurs se lisent avant toute réduction (offsetHeight ignore les transformations).
  const ranger = useCallback(() => {
    const r = racine.current;
    if (!r) return;
    if (window.matchMedia(TELEPHONE).matches) {
      setPages(null);
      return;
    }
    const feuille = r.querySelector<HTMLElement>(".pc-feuille");
    const ecart = feuille ? parseFloat(getComputedStyle(feuille).rowGap) || 0 : 0;
    const piedH = r.querySelector<HTMLElement>(".pc-pied")?.offsetHeight ?? 0;
    const capacite = HAUTEUR_UTILE - piedH - ecart;
    const hauteur = (si: number, bi: number) => r.querySelector<HTMLElement>(`[data-bloc="${si}-${bi}"]`)?.offsetHeight ?? 0;
    const resultat: Page[] = [];
    sections.forEach((s, si) => {
      let courante: number[] = [];
      let total = 0;
      s.blocs.forEach((_, bi) => {
        const h = hauteur(si, bi);
        if (courante.length && total + ecart + h > capacite) {
          resultat.push({ section: si, blocs: courante });
          courante = [];
          total = 0;
        }
        total += courante.length ? ecart + h : h;
        courante.push(bi);
      });
      if (courante.length) resultat.push({ section: si, blocs: courante });
    });
    setPages((avant) => (JSON.stringify(avant) === JSON.stringify(resultat) ? avant : resultat));
  }, [sections]);

  // Ajuster à la largeur : la réduction, et la hauteur qu'occupent alors les feuilles.
  const ajuster = useCallback(() => {
    const c = cadre.current;
    const r = racine.current;
    if (!c || !r || window.matchMedia(TELEPHONE).matches) {
      setAjustement(null);
      return;
    }
    const echelle = Math.min(1, c.clientWidth / r.offsetWidth);
    const suivant = echelle < 1 && echelle >= REDUCTION_MINIMALE ? { echelle, hauteur: Math.ceil(r.offsetHeight * echelle) } : null;
    setAjustement((avant) => (JSON.stringify(avant) === JSON.stringify(suivant) ? avant : suivant));
  }, []);

  useLayoutEffect(() => {
    ranger();
    // Les polices peuvent changer les hauteurs une fois chargées ; le passage au téléphone aussi.
    document.fonts?.ready.then(ranger).catch(() => {});
    const mq = window.matchMedia(TELEPHONE);
    mq.addEventListener("change", ranger);
    return () => mq.removeEventListener("change", ranger);
  }, [ranger]);

  // Après chaque rangement (le nombre de feuilles change la hauteur) et à chaque changement de largeur.
  useLayoutEffect(() => {
    ajuster();
  }, [ajuster, pages]);
  useLayoutEffect(() => {
    const c = cadre.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(() => ajuster());
    o.observe(c);
    return () => o.disconnect();
  }, [ajuster]);

  const feuilles = pages ?? sections.map((s, si) => ({ section: si, blocs: s.blocs.map((_, bi) => bi) }));
  return (
    <div ref={cadre} className="pc-cadre" data-ajuste={ajustement ? "oui" : undefined} style={ajustement ? { height: ajustement.hauteur } : undefined}>
      <div
        ref={racine}
        className="pc-feuilles"
        data-rangees={pages ? "oui" : undefined}
        data-echelle={ajustement ? ajustement.echelle.toFixed(3) : "1"}
        style={ajustement ? { transform: `scale(${ajustement.echelle})` } : undefined}
      >
        {feuilles.map((f, i) => (
          <section key={`${f.section}-${f.blocs[0]}`} className="pc-feuille" aria-label={`Page ${i + 1} sur ${feuilles.length}`}>
            {f.blocs.map((bi) => (
              <div key={bi} className="pc-bloc" data-bloc={`${f.section}-${bi}`}>
                {sections[f.section].blocs[bi]}
              </div>
            ))}
            <footer className="pc-pied">
              <span>{pied}</span>
              <span>
                Page {i + 1} sur {feuilles.length}
              </span>
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}
