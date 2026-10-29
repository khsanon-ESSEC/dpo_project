"use client";

import { useEffect } from "react";

/** Garde la période choisie (« semaine », « mois », « 3m », « 6m », « exercice ») pour les autres pages. */
export function MemoriserPeriode({ vue }: { vue: string }) {
  useEffect(() => {
    if (!/^(semaine|mois|3m|6m|exercice)$/.test(vue)) return;
    const sur = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `dpo_periode=${vue}; path=/; max-age=31536000; samesite=lax${sur}`;
  }, [vue]);
  return null;
}
