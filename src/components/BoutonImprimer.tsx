"use client";

import { Icone } from "./Icone";

/** Imprimer la page, ou l'enregistrer en PDF (« Enregistrer au format PDF » dans la fenêtre d'impression). */
export function BoutonImprimer({ libelle = "Imprimer ou PDF" }: { libelle?: string }) {
  return (
    <button type="button" className="bouton-contour" onClick={() => window.print()}>
      <Icone nom="telecharger" taille={16} /> {libelle}
    </button>
  );
}
