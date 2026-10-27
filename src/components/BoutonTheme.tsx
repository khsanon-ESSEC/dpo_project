"use client";

import { useEffect, useState } from "react";
import { choisirTheme } from "@/app/actions-communes";
import { Icone } from "./Icone";

/** Bascule clair ↔ sombre selon ce qui est réellement affiché (le thème « auto » dépend de l'appareil). */
export function BoutonTheme() {
  const [sombre, setSombre] = useState(false);

  useEffect(() => {
    const lire = () => {
      const fond = getComputedStyle(document.documentElement).getPropertyValue("--fond").trim().toLowerCase();
      setSombre(fond === "#142458");
    };
    lire();
    const mq = window.matchMedia("(max-width: 899px), (prefers-color-scheme: dark)");
    mq.addEventListener("change", lire);
    return () => mq.removeEventListener("change", lire);
  }, []);

  const basculer = () => {
    const suivant = sombre ? "clair" : "sombre";
    document.documentElement.dataset.theme = suivant;
    setSombre(!sombre);
    void choisirTheme(suivant);
  };

  const libelle = sombre ? "Passer au thème clair" : "Passer au thème sombre";
  return (
    <button type="button" className="bouton-icone" onClick={basculer} aria-label={libelle} title={libelle}>
      <Icone nom={sombre ? "soleil" : "lune"} taille={20} />
    </button>
  );
}
