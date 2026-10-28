"use client";

import { useEffect } from "react";

/** La touche « / » met le curseur dans la barre du haut (ou ouvre la recherche), sauf pendant une saisie. */
export function RaccourciRecherche() {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName))) return;
      e.preventDefault();
      const barre = document.getElementById("barre-globale") as HTMLInputElement | null;
      if (barre) {
        barre.focus();
        barre.scrollIntoView({ block: "nearest" });
      } else window.location.href = "/recherche";
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, []);
  return null;
}
