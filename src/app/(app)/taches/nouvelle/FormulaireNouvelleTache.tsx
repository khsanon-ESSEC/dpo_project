"use client";

import { useActionState } from "react";
import { creerTache, type EtatNouvelleTache } from "../actions";

export function FormulaireNouvelleTache({ projets, personnes }: { projets: { id: string; code: string; titre: string }[]; personnes: { id: string; nom: string }[] }) {
  const [etat, action, enCours] = useActionState<EtatNouvelleTache, FormData>(creerTache, { message: null });
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {etat.message ? (
        <p className="erreur" role="alert">
          {etat.message}
        </p>
      ) : null}
      <div className="champ">
        <label htmlFor="titre">Titre</label>
        <input id="titre" name="titre" required maxLength={200} />
      </div>
      <div className="champ">
        <label htmlFor="projetId">Projet</label>
        <select id="projetId" name="projetId" defaultValue="">
          <option value="">Hors projet</option>
          {projets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titre}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div className="champ" style={{ flex: "1 1 220px" }}>
          <label htmlFor="assigneId">Pour</label>
          <select id="assigneId" name="assigneId" defaultValue={personnes[0]?.id}>
            {personnes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="champ" style={{ flex: "1 1 200px" }}>
          <label htmlFor="echeance">Échéance</label>
          <input id="echeance" name="echeance" type="date" />
        </div>
      </div>
      <button type="submit" className="bouton-ambre bouton-ambre--large" disabled={enCours}>
        {enCours ? "Création…" : "Créer la tâche"}
      </button>
    </form>
  );
}
