"use client";

import { useOptimistic, useState, useTransition } from "react";
import { basculerPartieRelue, changerProjetLigne, modifierLigne, supprimerLigne } from "./actions";
import { CocheSeule } from "@/components/CaseTache";
import { Icone } from "@/components/Icone";

type Ligne = { id: string; texte: string; projetId: string | null; projetCode: string | null; projetTitre: string | null };
type Projet = { id: string; code: string; titre: string };

export function LigneEditable({ ligne, projets, modifiable }: { ligne: Ligne; projets: Projet[]; modifiable: boolean }) {
  const [texte, setTexte] = useState(ligne.texte);
  const [, demarrer] = useTransition();
  if (!modifiable) {
    return (
      <li style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "6px 0", borderTop: 0, fontSize: 15, lineHeight: "22px" }}>
        <span className="etiquette-projet" title={ligne.projetTitre ?? "Sans projet"}>
          {ligne.projetCode ?? "—"}
        </span>
        <span>{ligne.texte}</span>
      </li>
    );
  }
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderTop: 0 }}>
      <label className="visuellement-cache" htmlFor={`projet-${ligne.id}`}>
        Projet de la ligne « {ligne.texte} »
      </label>
      <select
        id={`projet-${ligne.id}`}
        defaultValue={ligne.projetId ?? ""}
        title={ligne.projetTitre ?? "Sans projet : seul votre supérieur voit cette ligne"}
        onChange={(e) => demarrer(() => changerProjetLigne(ligne.id, e.target.value || null))}
        style={{ width: 64, flex: "none", minHeight: 32, border: "1px solid var(--filet-fort)", background: "transparent", color: "var(--discret)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}
      >
        <option value="">—</option>
        {projets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code}
          </option>
        ))}
      </select>
      <label className="visuellement-cache" htmlFor={`texte-${ligne.id}`}>
        Texte de la ligne
      </label>
      <input
        id={`texte-${ligne.id}`}
        value={texte}
        maxLength={500}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={() => {
          if (texte.trim() !== ligne.texte) demarrer(() => modifierLigne(ligne.id, texte));
        }}
        style={{ flex: 1, minWidth: 0, minHeight: 40, padding: "0 10px", border: "1px solid transparent", background: "transparent", fontSize: 15 }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--filet-fort)")}
      />
      <button type="button" className="bouton-icone" style={{ width: 36, height: 36 }} aria-label={`Retirer « ${ligne.texte} »`} title="Retirer" onClick={() => demarrer(() => supprimerLigne(ligne.id))}>
        <Icone nom="fermer" taille={16} />
      </button>
    </li>
  );
}

export function CasePartie({ rapportId, partie, relue }: { rapportId: string; partie: "fait" | "en_cours" | "bloque" | "prochaine"; relue: boolean }) {
  const [enCours, demarrer] = useTransition();
  const [coche, setCoche] = useOptimistic(relue);
  return (
    <button
      type="button"
      className="case-ronde"
      style={{ width: "auto", padding: "0 4px 0 12px", gap: 10, color: "var(--discret)", fontSize: 13, marginLeft: 0 }}
      aria-pressed={coche}
      disabled={enCours}
      onClick={() =>
        demarrer(async () => {
          setCoche(!coche);
          await basculerPartieRelue(rapportId, partie);
        })
      }
    >
      {coche ? "Relue" : "À relire"}
      <span className="case-ronde__rond">{coche ? <CocheSeule /> : null}</span>
    </button>
  );
}
