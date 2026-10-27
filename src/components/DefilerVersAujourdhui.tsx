"use client";

import { useEffect } from "react";

/** Au chargement, fait défiler le Gantt pour qu'aujourd'hui soit visible (au premier tiers). */
export function DefilerVersAujourdhui({ cible, position }: { cible: string; position: number }) {
  useEffect(() => {
    const el = document.getElementById(cible);
    if (!el) return;
    const visible = el.clientWidth - 260;
    if (position > visible * 0.66) el.scrollLeft = Math.max(0, position - visible / 3);
  }, [cible, position]);
  return null;
}
