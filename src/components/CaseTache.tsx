"use client";

import { useOptimistic, useTransition } from "react";
import { basculerTache } from "@/app/(app)/taches/actions";
import { etatEnMots } from "./PastilleStatut";

const Coche = () => (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 6.2l2.3 2.3 4.7-4.9" />
  </svg>
);

/**
 * Case ronde d'une tâche : cocher = faite. La ligne entière se barre aussitôt. La case montre aussi l'état de la
 * tâche, comme la pastille d'état ailleurs (29 octobre 2026) : vide à faire, à moitié pleine en cours, barre ambre
 * bloquée, anneau rouge en retard, coche faite.
 */
export function CaseTache({ id, titre, faite, statut, retard = false, children }: { id: string; titre: string; faite: boolean; statut?: string; retard?: boolean; children: React.ReactNode }) {
  const [enCours, demarrer] = useTransition();
  const [coche, setCoche] = useOptimistic(faite);
  const etat = coche ? "faite" : statut && statut !== "faite" ? statut : "a_faire";
  const enRetard = !coche && retard && etat !== "bloquee";
  const mots = etatEnMots(etat, enRetard);
  return (
    <li className={coche ? "fait" : undefined} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className="case-ronde"
        aria-pressed={coche}
        aria-label={`Marquer « ${titre} » comme ${coche ? "non terminée" : "terminée"} (${mots.toLowerCase()})`}
        title={`${mots} : cliquer pour marquer ${coche ? "non terminée" : "terminée"}`}
        disabled={enCours}
        onClick={() =>
          demarrer(async () => {
            setCoche(!coche);
            await basculerTache(id);
          })
        }
      >
        <span className={`case-ronde__rond${statut ? ` case-ronde__rond--${etat}` : ""}${enRetard ? " case-ronde__rond--retard" : ""}`}>{coche ? <Coche /> : null}</span>
      </button>
      {children}
    </li>
  );
}

export function CocheSeule() {
  return <Coche />;
}
