"use client";

import { useEffect } from "react";

/** La touche « / » ouvre la recherche, sauf pendant une saisie. */
export function RaccourciRecherche() {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName))) return;
      e.preventDefault();
      window.location.href = "/recherche";
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, []);
  return null;
}
