"use client";

import { useState, useTransition } from "react";
import { choisirCourrielLundi } from "@/app/actions-communes";

/** Recevoir (ou non) le courriel du lundi matin. Enregistré dès qu'on coche. */
export function ChoixCourrielLundi({ actuel }: { actuel: boolean }) {
  const [actif, setActif] = useState(actuel);
  const [fait, setFait] = useState(false);
  const [enCours, demarrer] = useTransition();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label className="choix-case" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={actif}
          disabled={enCours}
          onChange={(e) => {
            const v = e.target.checked;
            setActif(v);
            setFait(false);
            demarrer(async () => {
              await choisirCourrielLundi(v);
              setFait(true);
            });
          }}
          style={{ marginTop: 3 }}
        />
        <span className="rangee__texte">
          <span style={{ fontSize: 14, fontWeight: 500 }}>Recevoir le courriel du lundi</span>
          <span className="rangee__sous">Chaque lundi vers 7 h : mes tâches en retard, mes échéances de la semaine et mes réunions. Rien s&apos;il n&apos;y a rien.</span>
        </span>
      </label>
      <p className="succes" role="status" aria-live="polite" style={{ margin: 0, minHeight: 18, fontSize: 13 }}>
        {fait ? (actif ? "C'est noté : premier courriel lundi prochain." : "C'est noté : plus de courriel du lundi.") : ""}
      </p>
    </div>
  );
}
