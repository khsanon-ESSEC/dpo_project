"use client";

import { useOptimistic, useTransition } from "react";
import { basculerTache } from "@/app/(app)/taches/actions";

const Coche = () => (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 6.2l2.3 2.3 4.7-4.9" />
  </svg>
);

/** Case ronde d'une tâche : cocher = faite. La ligne entière se barre aussitôt. */
export function CaseTache({ id, titre, faite, children }: { id: string; titre: string; faite: boolean; children: React.ReactNode }) {
  const [enCours, demarrer] = useTransition();
  const [coche, setCoche] = useOptimistic(faite);
  return (
    <li className={coche ? "fait" : undefined} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className="case-ronde"
        aria-pressed={coche}
        aria-label={`Marquer « ${titre} » comme ${coche ? "non terminée" : "terminée"}`}
        disabled={enCours}
        onClick={() =>
          demarrer(async () => {
            setCoche(!coche);
            await basculerTache(id);
          })
        }
      >
        <span className="case-ronde__rond">{coche ? <Coche /> : null}</span>
      </button>
      {children}
    </li>
  );
}

export function CocheSeule() {
  return <Coche />;
}
