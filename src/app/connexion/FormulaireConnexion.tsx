"use client";

import { useActionState, useState } from "react";
import { seConnecter, type EtatConnexion } from "./actions";

export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState<EtatConnexion, FormData>(seConnecter, { message: null });
  const [visible, setVisible] = useState(false);
  return (
    <form action={action} className="connexion__formulaire">
      <h2 className="connexion__soustitre">Connexion</h2>
      {etat.message ? (
        <p className="erreur" role="alert">
          {etat.message}
        </p>
      ) : null}
      <div className="champ">
        <label htmlFor="courriel">Adresse courriel</label>
        <input id="courriel" name="courriel" type="email" autoComplete="username" required placeholder="prenom.nom@unibankhaiti.com" defaultValue={etat.courriel ?? ""} key={etat.courriel ?? ""} />
      </div>
      <div className="champ">
        <label htmlFor="motDePasse">Mot de passe</label>
        <div style={{ display: "flex", alignItems: "stretch", border: "1px solid var(--controle)", background: "var(--champ)" }}>
          <input
            id="motDePasse"
            name="motDePasse"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            required
            style={{ flex: 1, minWidth: 0, border: 0, minHeight: 46 }}
          />
          <button type="button" className="bouton-icone" style={{ width: "auto", padding: "0 14px", fontSize: 13, fontWeight: 500 }} aria-pressed={visible} onClick={() => setVisible(!visible)}>
            {visible ? "Masquer" : "Afficher"}
          </button>
        </div>
        <span className="aide">Mot de passe oublié : demandez-en un nouveau à l'administrateur de l'application.</span>
      </div>
      <button type="submit" className="bouton-ambre bouton-ambre--large" disabled={enCours}>
        {enCours ? "Connexion…" : "Se connecter"}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 16, color: "var(--discret)", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase" }}>
        <span style={{ flex: 1, height: 1, background: "var(--filet)" }} />
        ou
        <span style={{ flex: 1, height: 1, background: "var(--filet)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button type="button" disabled aria-describedby="google-bientot" className="bouton-contour" style={{ height: 52, cursor: "not-allowed", color: "var(--discret)", borderColor: "var(--filet-fort)" }}>
          Continuer avec le compte Google UNIBANK
        </button>
        <span id="google-bientot" className="aide" style={{ alignSelf: "center", fontSize: 12, color: "var(--discret)" }}>
          Bientôt disponible
        </span>
      </div>
    </form>
  );
}
