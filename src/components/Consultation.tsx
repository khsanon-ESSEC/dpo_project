"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { consultation } from "@/app/actions-communes";

/** Projets ouverts récemment sur cet appareil (suggestions de la barre) : seulement leurs identifiants. */
export const CLE_PROJETS_RECENTS = "dpo_projets_recents";

/** Note l'écran ouvert, pour le suivi du pilote (nombres agrégés seulement) ; retient les projets ouverts. */
export function Consultation() {
  const chemin = usePathname();
  useEffect(() => {
    consultation(chemin).catch(() => {});
    const m = /^\/projets\/([0-9a-f-]{36})(?:\/|$)/.exec(chemin ?? "");
    if (m) {
      try {
        const avant: string[] = JSON.parse(localStorage.getItem(CLE_PROJETS_RECENTS) ?? "[]");
        localStorage.setItem(CLE_PROJETS_RECENTS, JSON.stringify([m[1], ...avant.filter((x) => x !== m[1])].slice(0, 5)));
      } catch {
        // stockage indisponible (navigation privée) : pas de projets récents, rien d'autre ne change
      }
    }
  }, [chemin]);
  return null;
}
