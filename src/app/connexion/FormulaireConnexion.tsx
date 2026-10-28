"use client";

import { useActionState, useState } from "react";
import { seConnecter, seConnecterAD, type EtatConnexion, type EtatConnexionAD } from "./actions";

/** Champ de mot de passe avec « Afficher ». */
function ChampMotDePasse({ id, libelle, aide }: { id: string; libelle: string; aide: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="champ">
      <label htmlFor={id}>{libelle}</label>
      <div style={{ display: "flex", alignItems: "stretch", border: "1px solid var(--controle)", background: "var(--champ)" }}>
        <input id={id} name="motDePasse" type={visible ? "text" : "password"} autoComplete="current-password" required style={{ flex: 1, minWidth: 0, border: 0, minHeight: 46 }} />
        <button type="button" className="bouton-icone" style={{ width: "auto", padding: "0 14px", fontSize: 13, fontWeight: 500 }} aria-pressed={visible} onClick={() => setVisible(!visible)}>
          {visible ? "Masquer" : "Afficher"}
        </button>
      </div>
      <span className="aide">{aide}</span>
    </div>
  );
}

/**
 * Connexion : avec le compte Windows de la banque (Active Directory) quand il est activé, sinon par le mot
 * de passe de l'application ; et, si elle est activée, avec le compte Google de la banque.
 */
export function FormulaireConnexion({ google, ad, erreurGoogle, suite = null }: { google: boolean; ad: boolean; erreurGoogle: string | null; suite?: string | null }) {
  const [etat, action, enCours] = useActionState<EtatConnexion, FormData>(seConnecter, { message: null });
  const [etatAD, actionAD, enCoursAD] = useActionState<EtatConnexionAD, FormData>(seConnecterAD, { message: null });
  const [mode, setMode] = useState<"ad" | "mdp">(ad ? "ad" : "mdp");
  const windows = ad && mode === "ad";
  const message = (windows ? etatAD.message : etat.message) ?? erreurGoogle;
  return (
    <form action={windows ? actionAD : action} className="connexion__formulaire">
      {suite ? <input type="hidden" name="suite" value={suite} /> : null}
      <h2 className="connexion__soustitre">Connexion</h2>
      {ad ? (
        <div className="connexion__choix" role="group" aria-label="Méthode de connexion">
          <button type="button" aria-pressed={windows} onClick={() => setMode("ad")}>
            Compte Windows
          </button>
          <button type="button" aria-pressed={!windows} onClick={() => setMode("mdp")}>
            Mot de passe de l&apos;application
          </button>
        </div>
      ) : null}
      {message ? (
        <p className="erreur" role="alert">
          {message}
        </p>
      ) : null}
      {windows ? (
        <>
          <div className="champ">
            <label htmlFor="identifiant">Identifiant Windows</label>
            <input id="identifiant" name="identifiant" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required placeholder="ex. : jdupont" defaultValue={etatAD.identifiant ?? ""} key={etatAD.identifiant ?? ""} />
          </div>
          <ChampMotDePasse id="motDePasseAD" libelle="Mot de passe Windows" aide="Le même que pour ouvrir votre session sur votre poste." />
        </>
      ) : (
        <>
          <div className="champ">
            <label htmlFor="courriel">Adresse courriel</label>
            <input id="courriel" name="courriel" type="email" autoComplete="username" required placeholder="prenom.nom@unibankhaiti.com" defaultValue={etat.courriel ?? ""} key={etat.courriel ?? ""} />
          </div>
          <ChampMotDePasse
            id="motDePasse"
            libelle="Mot de passe"
            aide={ad ? "Pour les personnes hors division, et en secours. Oublié : demandez-en un nouveau à l'administrateur." : "Mot de passe oublié : demandez-en un nouveau à l'administrateur de l'application."}
          />
        </>
      )}
      <button type="submit" className="bouton-ambre bouton-ambre--large" disabled={windows ? enCoursAD : enCours}>
        {(windows ? enCoursAD : enCours) ? "Connexion…" : "Se connecter"}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 16, color: "var(--discret)", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase" }}>
        <span style={{ flex: 1, height: 1, background: "var(--filet)" }} />
        ou
        <span style={{ flex: 1, height: 1, background: "var(--filet)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {google ? (
          <a href={suite ? `/api/auth/google?suite=${encodeURIComponent(suite)}` : "/api/auth/google"} className="bouton-contour" style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
            Continuer avec le compte Google UNIBANK
          </a>
        ) : (
          <>
            <button type="button" disabled aria-describedby="google-bientot" className="bouton-contour" style={{ height: 52, cursor: "not-allowed", color: "var(--discret)", borderColor: "var(--filet-fort)" }}>
              Continuer avec le compte Google UNIBANK
            </button>
            <span id="google-bientot" className="aide" style={{ alignSelf: "center", fontSize: 12, color: "var(--discret)" }}>
              Pas encore activée sur ce serveur
            </span>
          </>
        )}
      </div>
    </form>
  );
}
