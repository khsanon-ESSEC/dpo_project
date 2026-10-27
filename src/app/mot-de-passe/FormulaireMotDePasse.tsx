"use client";

import { useActionState } from "react";
import { changerMotDePasse, type EtatMotDePasse } from "./actions";

export function FormulaireMotDePasse({ provisoire }: { provisoire: boolean }) {
  const [etat, action, enCours] = useActionState<EtatMotDePasse, FormData>(changerMotDePasse, { message: null });
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {etat.message ? (
        <p className="erreur" role="alert">
          {etat.message}
        </p>
      ) : null}
      <div className="champ">
        <label htmlFor="actuel">{provisoire ? "Mot de passe provisoire" : "Mot de passe actuel"}</label>
        <input id="actuel" name="actuel" type="password" autoComplete="current-password" required />
      </div>
      <div className="champ">
        <label htmlFor="nouveau">Nouveau mot de passe</label>
        <input id="nouveau" name="nouveau" type="password" autoComplete="new-password" required minLength={12} aria-describedby="aide-mdp" />
        <span id="aide-mdp" className="aide">
          Au moins 12 caractères, avec une lettre et un chiffre.
        </span>
      </div>
      <div className="champ">
        <label htmlFor="confirmation">Encore une fois</label>
        <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required />
      </div>
      <button type="submit" className="bouton-ambre bouton-ambre--large" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </button>
    </form>
  );
}
