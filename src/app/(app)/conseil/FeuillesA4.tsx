"use client";

/**
 * Des feuilles A4 à l'italienne, à l'écran comme à l'impression (29 octobre 2026) : les blocs du rapport sont mesurés
 * puis rangés feuille par feuille (une section commence toujours une nouvelle feuille), si bien que l'écran montre
 * exactement les pages qui sortiront de l'imprimante, avec leur numéro. Sur un téléphone, pas de rangement : la
 * mise en page se resserre (on n'imprime pas d'un téléphone).
 */
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";

type Section = { cle: string; blocs: ReactNode[] };
type Page = { section: number; blocs: number[] };

/** Hauteur utile d'une feuille : 210 mm moins les marges de 10 mm, en pixels CSS (96 par pouce). */
const HAUTEUR_UTILE = (190 * 96) / 25.4;
const ECART = (6 * 96) / 25.4;

export function FeuillesA4({ sections, pied }: { sections: Section[]; pied: string }) {
  const racine = useRef<HTMLDivElement>(null);
  // Avant la mesure (rendu du serveur) ou sur téléphone : une feuille par section.
  const [pages, setPages] = useState<Page[] | null>(null);

  const ranger = useCallback(() => {
    const r = racine.current;
    if (!r) return;
    if (window.matchMedia("(max-width: 699px)").matches) {
      setPages(null);
      return;
    }
    const piedH = r.querySelector<HTMLElement>(".pc-pied")?.getBoundingClientRect().height ?? 0;
    const capacite = HAUTEUR_UTILE - piedH - ECART;
    const hauteur = (si: number, bi: number) => r.querySelector<HTMLElement>(`[data-bloc="${si}-${bi}"]`)?.getBoundingClientRect().height ?? 0;
    const resultat: Page[] = [];
    sections.forEach((s, si) => {
      let courante: number[] = [];
      let total = 0;
      s.blocs.forEach((_, bi) => {
        const h = hauteur(si, bi);
        if (courante.length && total + ECART + h > capacite) {
          resultat.push({ section: si, blocs: courante });
          courante = [];
          total = 0;
        }
        total += courante.length ? ECART + h : h;
        courante.push(bi);
      });
      if (courante.length) resultat.push({ section: si, blocs: courante });
    });
    setPages((avant) => (JSON.stringify(avant) === JSON.stringify(resultat) ? avant : resultat));
  }, [sections]);

  useLayoutEffect(() => {
    ranger();
    // Les polices peuvent changer les hauteurs une fois chargées ; le passage au téléphone aussi.
    document.fonts?.ready.then(ranger).catch(() => {});
    const mq = window.matchMedia("(max-width: 699px)");
    mq.addEventListener("change", ranger);
    return () => mq.removeEventListener("change", ranger);
  }, [ranger]);

  const feuilles = pages ?? sections.map((s, si) => ({ section: si, blocs: s.blocs.map((_, bi) => bi) }));
  return (
    <div ref={racine} className="pc-feuilles" data-rangees={pages ? "oui" : undefined}>
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
  );
}
