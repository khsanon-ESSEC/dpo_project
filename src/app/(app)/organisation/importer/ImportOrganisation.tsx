"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { importer, previsualiserAnnuaire, previsualiserFichier, type EtatImport } from "./actions";
import type { Plan } from "@/lib/import-organisation";

const vide: EtatImport = { message: null };
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** Ce que l'import changerait : rien n'est encore modifié. */
function Apercu({ plan, lignes, source, sansAdresse, sso }: { plan: Plan; lignes: EtatImport["lignes"]; source: EtatImport["source"]; sansAdresse?: number; sso: boolean }) {
  const [etat, action, enCours] = useActionState(importer, vide);
  const bloque = plan.erreurs.length > 0;
  const rien = !plan.creer.length && !plan.modifier.length && !plan.equipesNouvelles.length;
  if (etat.ok) {
    return (
      <section className="carte" aria-live="polite">
        <p className="ton-ok" style={{ margin: 0, fontSize: 16 }}>
          {etat.message}
        </p>
        <p className="note" style={{ margin: "8px 0 0" }}>
          <a href="/organisation" className="lien-discret">
            Voir les personnes et les équipes
          </a>
          {plan.creer.length ? " · Les rôles (directeur, administrateur…) se donnent ensuite depuis la fiche de chacun." : null}
        </p>
      </section>
    );
  }
  const p = etat.plan ?? plan;
  return (
    <section className="carte" aria-labelledby="imp-apercu">
      <div style={{ display: "grid", gap: 24 }}>
      <h2 id="imp-apercu" className="carte__titre" style={{ margin: 0 }}>
        Ce que l&apos;import changerait
      </h2>
      <dl className="chiffres chiffres--clair">
        <div className="chiffre">
          <dt>personnes ajoutées</dt>
          <dd>{p.creer.length}</dd>
        </div>
        <div className="chiffre">
          <dt>mises à jour</dt>
          <dd>{p.modifier.length}</dd>
        </div>
        <div className="chiffre">
          <dt>inchangées</dt>
          <dd>{p.inchanges}</dd>
        </div>
        <div className="chiffre">
          <dt>équipes créées</dt>
          <dd>{p.equipesNouvelles.length}</dd>
        </div>
      </dl>
      {etat.message ? (
        <p className="erreur" role="alert">
          {etat.message}
        </p>
      ) : null}
      {p.erreurs.length ? (
        <div className="erreur" role="alert">
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
            {pluriel(p.erreurs.length, "ligne à corriger", "lignes à corriger")} : rien ne sera importé tant qu&apos;elles restent.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {p.erreurs.slice(0, 50).map((e, i) => (
              <li key={i}>
                {source === "fichier" ? `Ligne ${e.ligne} : ` : ""}
                {e.message}
              </li>
            ))}
          </ul>
          {p.erreurs.length > 50 ? <p style={{ margin: "6px 0 0" }}>… et {p.erreurs.length - 50} autres.</p> : null}
        </div>
      ) : null}
      {p.ignores.length ? (
        <details className="note">
          <summary style={{ cursor: "pointer", minHeight: 32 }}>
            {pluriel(p.ignores.length, "compte de l'annuaire laissé de côté", "comptes de l'annuaire laissés de côté")} (le reste s&apos;importe)
          </summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {p.ignores.slice(0, 100).map((e) => (
              <li key={e.ligne}>{e.message}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {p.creer.length ? (
        <div>
          <h3 className="surtitre" style={{ margin: "0 0 8px" }}>
            Personnes ajoutées
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table className="tableau-simple">
              <thead>
                <tr>
                  <th scope="col">Nom</th>
                  <th scope="col">Courriel</th>
                  <th scope="col">Poste</th>
                  <th scope="col">Équipe</th>
                  <th scope="col">Supérieur</th>
                </tr>
              </thead>
              <tbody>
                {p.creer.slice(0, 200).map((l) => (
                  <tr key={l.courriel}>
                    <th scope="row">
                      {l.prenom} {l.nom}
                    </th>
                    <td>{l.courriel}</td>
                    <td>{l.poste || "—"}</td>
                    <td>{l.equipe || "—"}</td>
                    <td>{l.superieur || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {p.modifier.length ? (
        <div>
          <h3 className="surtitre" style={{ margin: "0 0 8px" }}>
            Mises à jour
          </h3>
          <ul className="liste">
            {p.modifier.slice(0, 200).map((m) => (
              <li key={m.courriel} className="rangee" style={{ alignItems: "flex-start", minHeight: 48 }}>
                <span className="rangee__texte">
                  <span className="rangee__titre">{m.nom}</span>
                  <span className="rangee__sous">
                    {m.changements.map((c) => (
                      <span key={c.champ} style={{ display: "block" }}>
                        {c.champ.charAt(0).toUpperCase() + c.champ.slice(1)} : {c.avant || "—"} → <strong>{c.apres}</strong>
                      </span>
                    ))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.equipesNouvelles.length ? <p style={{ margin: 0 }}>Équipes créées : {p.equipesNouvelles.join(", ")}.</p> : null}
      <p className="note" style={{ margin: 0 }}>
        {p.absents ? `${pluriel(p.absents, "personne de l'application n'est pas", "personnes de l'application ne sont pas")} dans ${source === "annuaire" ? "l'annuaire lu" : "le fichier"} : rien ne change pour elles (personne n'est désactivé). ` : ""}
        {sansAdresse ? `${pluriel(sansAdresse, "compte de l'annuaire sans adresse courriel est laissé", "comptes de l'annuaire sans adresse courriel sont laissés")} de côté. ` : ""}
        Les rôles ne s&apos;importent pas.
      </p>
      {p.creer.length && !sso ? (
        <p className="erreur" style={{ margin: 0 }}>
          Les personnes ajoutées n&apos;ont pas de mot de passe et ni la connexion Google ni la connexion Windows ne sont activées : donnez-leur un mot de passe provisoire depuis leur fiche, ou demandez à l&apos;informatique d&apos;activer l&apos;une des deux.
        </p>
      ) : p.creer.length ? (
        <p className="note" style={{ margin: 0 }}>
          Les personnes ajoutées se connectent avec leur compte de la banque (Google ou Windows) : pas de mot de passe à transmettre.
        </p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <form action={action}>
          <input type="hidden" name="lignes" value={JSON.stringify(lignes ?? [])} />
          <input type="hidden" name="source" value={source ?? "fichier"} />
          <button type="submit" className="bouton-ambre" disabled={bloque || rien || enCours}>
            {enCours ? "Import…" : rien ? "Rien à importer" : "Importer"}
          </button>
        </form>
        {source === "annuaire" ? (
          <form action="/organisation/importer/modele" method="post">
            <input type="hidden" name="lignes" value={JSON.stringify(lignes ?? [])} />
            <button type="submit" className="bouton-contour">
              Télécharger en Excel pour retoucher
            </button>
          </form>
        ) : null}
      </div>
      </div>
    </section>
  );
}

export function ImportOrganisation({ ad, groupe, sso, baseDn }: { ad: boolean; groupe: boolean; sso: boolean; baseDn: string }) {
  const [etatFichier, actionFichier, fichierEnCours] = useActionState(previsualiserFichier, vide);
  const [etatAnnuaire, actionAnnuaire, annuaireEnCours] = useActionState(previsualiserAnnuaire, vide);
  // L'aperçu montré : celui de la dernière lecture (fichier ou annuaire).
  const [dernier, setDernier] = useState<"fichier" | "annuaire">("fichier");
  useEffect(() => {
    if (etatFichier !== vide) setDernier("fichier");
  }, [etatFichier]);
  useEffect(() => {
    if (etatAnnuaire !== vide) setDernier("annuaire");
  }, [etatAnnuaire]);
  const etat = dernier === "annuaire" ? etatAnnuaire : etatFichier;
  // Un nouvel aperçu à chaque prévisualisation (pas à chaque rendu : l'import en cours garderait son état).
  const numeros = useRef(new WeakMap<object, number>());
  const compteur = useRef(0);
  if (!numeros.current.has(etat)) numeros.current.set(etat, ++compteur.current);
  const cle = numeros.current.get(etat);
  return (
    <>
      <section className="carte" aria-labelledby="imp-fichier" style={{ display: "grid", gap: 14 }}>
        <h2 id="imp-fichier" className="carte__titre" style={{ margin: 0 }}>
          Depuis un fichier Excel
        </h2>
        <p style={{ margin: 0 }}>
          Une ligne par personne : prénom, nom, courriel, poste, équipe, et l&apos;adresse courriel du supérieur. Une case vide ne change rien. Le plus simple : partir du modèle, qui contient déjà l&apos;organisation actuelle.
        </p>
        <p style={{ margin: 0 }}>
          <a href="/organisation/importer/modele" className="bouton-contour" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            Télécharger le modèle Excel
          </a>
        </p>
        <form action={actionFichier} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div className="champ" style={{ flex: "1 1 260px", minWidth: 0 }}>
            <label htmlFor="imp-f">Fichier .xlsx ou .csv (2 Mo au plus)</label>
            <input id="imp-f" name="fichier" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required />
          </div>
          <button type="submit" className="bouton-contour" disabled={fichierEnCours}>
            {fichierEnCours ? "Lecture…" : "Prévisualiser"}
          </button>
        </form>
        {dernier === "fichier" && etatFichier.message ? (
          <p className="erreur" role="alert" style={{ margin: 0 }}>
            {etatFichier.message}
          </p>
        ) : null}
      </section>

      {ad ? (
        <section className="carte" aria-labelledby="imp-ad" style={{ display: "grid", gap: 14 }}>
          <h2 id="imp-ad" className="carte__titre" style={{ margin: 0 }}>
            Depuis Active Directory
          </h2>
          <p style={{ margin: 0 }}>
            {groupe ? "Les comptes actifs du groupe de l'application" : "Les comptes actifs d'une unité d'organisation"}, avec leur poste, leur service et leur supérieur. Vous lisez l&apos;annuaire avec votre compte Windows ; le mot de passe n&apos;est pas gardé.
          </p>
          <form action={actionAnnuaire} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
            <div className="champ">
              <label htmlFor="imp-id">Votre identifiant Windows</label>
              <input id="imp-id" name="identifiant" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required placeholder="ex. : jdupont" defaultValue={etatAnnuaire.identifiant ?? ""} key={`id-${etatAnnuaire.identifiant ?? ""}`} />
            </div>
            <div className="champ">
              <label htmlFor="imp-mdp">Mot de passe Windows</label>
              <input id="imp-mdp" name="motDePasse" type="password" autoComplete="current-password" required />
            </div>
            <div className="champ" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="imp-ou">{groupe ? "Unité d'organisation (facultatif, pour restreindre)" : "Unité d'organisation"}</label>
              <input id="imp-ou" name="ou" type="text" required={!groupe} spellCheck={false} placeholder={baseDn ? `ex. : OU=DPO,${baseDn}` : "ex. : OU=DPO,DC=unibank,DC=local"} defaultValue={etatAnnuaire.ou ?? ""} key={`ou-${etatAnnuaire.ou ?? ""}`} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, gridColumn: "1 / -1", fontSize: 15 }}>
              <input type="checkbox" name="service" defaultChecked style={{ width: 20, height: 20, accentColor: "var(--arc)" }} />
              Reprendre le service (department) comme équipe
            </label>
            <div>
              <button type="submit" className="bouton-contour" disabled={annuaireEnCours}>
                {annuaireEnCours ? "Lecture de l'annuaire…" : "Lire l'annuaire"}
              </button>
            </div>
          </form>
          {dernier === "annuaire" && etatAnnuaire.message ? (
            <p className="erreur" role="alert" style={{ margin: 0 }}>
              {etatAnnuaire.message}
            </p>
          ) : null}
        </section>
      ) : null}

      {etat.plan ? <Apercu key={cle} plan={etat.plan} lignes={etat.lignes} source={etat.source} sansAdresse={etat.sansAdresse} sso={sso} /> : null}
    </>
  );
}
