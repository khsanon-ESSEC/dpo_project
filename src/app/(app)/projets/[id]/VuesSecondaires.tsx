"use client";

import { useState } from "react";
import { Icone } from "@/components/Icone";

/** Gantt, Calendrier, Charge : en second plan, derrière « Plus de vues » (ouvert si l'une d'elles est affichée). */
export function VuesSecondaires({ vues, active }: { vues: { href: string; libelle: string; icone: string; courante: boolean }[]; active: boolean }) {
  const [ouvert, setOuvert] = useState(active);
  return (
    <>
      <button type="button" className="vues__plus" aria-expanded={ouvert} aria-controls="vues-secondaires" onClick={() => setOuvert(!ouvert)}>
        Plus de vues
        <Icone nom={ouvert ? "chevron-gauche" : "chevron-droite"} taille={14} />
      </button>
      <span id="vues-secondaires" style={{ display: ouvert ? "contents" : "none" }}>
        {vues.map((v) => (
          <a key={v.href} href={v.href} aria-current={v.courante ? "page" : undefined}>
            <Icone nom={v.icone} taille={16} />
            {v.libelle}
          </a>
        ))}
      </span>
    </>
  );
}
