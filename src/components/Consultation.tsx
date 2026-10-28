"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { consultation } from "@/app/actions-communes";

/** Note l'écran ouvert, pour le suivi du pilote (nombres agrégés seulement). */
export function Consultation() {
  const chemin = usePathname();
  useEffect(() => {
    consultation(chemin).catch(() => {});
  }, [chemin]);
  return null;
}
