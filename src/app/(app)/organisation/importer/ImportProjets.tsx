"use client";

import { useActionState } from "react";
import { importerProjets, importerTaches, previsualiserProjets, previsualiserTaches, type EtatImportProjets } from "./actions-projets";

const vide: EtatImportProjets = { message: null };
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const date = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const STATUT_P: Record<string, string> = { en_attente: "En attente", en_cours: "En cours", continu: "Continu", finalise: "Finalisé" };
const STATUT_T: Record<string, string> = { a_faire: "À faire", en_cours: "En cours", bloquee: "Bloquée", faite: "Faite" };

/** Import en vrac des projets ou des tâches : télécharger le modèle, le remplir, le déposer, voir l'aperçu, importer. */
export function ImportProjets({ genre }: { genre: "projets" | "taches" }) {
  const [apercu, deposer, lecture] = useActionState(genre === "projets" ? previsualiserProjets : previsualiserTaches, vide);
  const [resultat, importer, ecriture] = useActionState(genre === "projets" ? importerProjets : importerTaches, vide);
  const etat = resultat.projets || resultat.taches ? resultat : apercu;
  const fini = resultat.ok;
  const nom = genre === "projets" ? "projets" : "tâches";
  const plan = genre === "projets" ? etat.projets : etat.taches;
  const erreurs = plan?.erreurs ?? [];
  const nombre = genre === "projets" ? (etat.projets?.projets.length ?? 0) : (etat.taches?.taches.length ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form action={deposer} className="import-depot">
        <a href={`/organisation/importer/modele-${genre}`} className="bouton-contour">
          Télécharger le modèle
        </a>
        <div className="champ" style={{ flex: "1 1 260px" }}>
          <label htmlFor={`fichier-${genre}`}>Fichier rempli (.xlsx ou CSV, 2 Mo au plus)</label>
          <input id={`fichier-${genre}`} name="fichier" type="file" accept=".xlsx,.csv,text/csv" required />
        </div>
        <button type="submit" className="bouton-ambre" disabled={lecture}>
          {lecture ? "Lecture…" : "Voir ce qui serait importé"}
        </button>
      </form>
      {apercu.message && !resultat.message ? (
        <p className="erreur" role="alert">
          {apercu.message}
        </p>
      ) : null}
      {fini ? (
        <p className="succes" role="status">
          {resultat.message} {genre === "projets" ? <a href="/projets" className="lien-discret">Voir le portefeuille</a> : null} ·{" "}
          <a href={`/organisation/importer#${genre}`} className="lien-discret">
            Importer un autre fichier
          </a>
        </p>
      ) : plan ? (
        <section aria-label={`Aperçu de l'import des ${nom}`} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0 }}>
            <strong>{etat.nomFichier ?? "Fichier"}</strong> : {pluriel(nombre, genre === "projets" ? "projet à créer" : "tâche à créer", genre === "projets" ? "projets à créer" : "tâches à créer")}
            {erreurs.length ? <span className="ton-retard"> · {pluriel(erreurs.length, "ligne à corriger", "lignes à corriger")}</span> : null}
            {etat.projets?.nouveauxProgrammes.length ? ` · programme${etat.projets.nouveauxProgrammes.length > 1 ? "s" : ""} ajouté${etat.projets.nouveauxProgrammes.length > 1 ? "s" : ""} à la liste : ${etat.projets.nouveauxProgrammes.join(", ")}` : ""}
            {etat.projets?.nouvellesDivisions.length ? ` · division${etat.projets.nouvellesDivisions.length > 1 ? "s" : ""} ajoutée${etat.projets.nouvellesDivisions.length > 1 ? "s" : ""} : ${etat.projets.nouvellesDivisions.join(", ")}` : ""}
            {etat.taches?.nouveauxLivrables.length ? ` · ${pluriel(etat.taches.nouveauxLivrables.length, "livrable créé", "livrables créés")} : ${etat.taches.nouveauxLivrables.map((l) => `${l.projetCode} « ${l.libelle} »`).join(", ")}` : ""}
          </p>
          {resultat.message && !resultat.ok ? (
            <p className="erreur" role="alert">
              {resultat.message}
            </p>
          ) : null}
          {erreurs.length ? (
            <div className="erreur" role="alert">
              <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Rien ne sera importé tant que ces lignes restent : corrigez le fichier et déposez-le de nouveau.</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {erreurs.slice(0, 60).map((e) => (
                  <li key={e.ligne}>
                    Ligne {e.ligne} : {e.message}
                  </li>
                ))}
              </ul>
              {erreurs.length > 60 ? <p style={{ margin: "6px 0 0" }}>… et {erreurs.length - 60} autres.</p> : null}
            </div>
          ) : null}
          {nombre ? (
            <div className="defile-x">
              {etat.projets ? (
                <table className="tableau-simple">
                  <thead>
                    <tr>
                      <th scope="col">Ligne</th>
                      <th scope="col">Code</th>
                      <th scope="col">Titre</th>
                      <th scope="col">Chef de projet</th>
                      <th scope="col">Équipe</th>
                      <th scope="col">Statut</th>
                      <th scope="col">Programme</th>
                      <th scope="col">Entrée</th>
                      <th scope="col">Fin prévue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etat.projets.projets.slice(0, 300).map((p) => (
                      <tr key={p.ligne}>
                        <td>{p.ligne}</td>
                        <td>
                          <span className="etiquette-projet">{p.code}</span>
                        </td>
                        <th scope="row">
                          {p.titre}
                          {p.strategique ? <span className="ton-discret"> · stratégique</span> : null}
                        </th>
                        <td>{p.chef}</td>
                        <td>{p.equipe.length ? p.equipe.map((m) => m.nom).join(", ") : "—"}</td>
                        <td>{STATUT_P[p.statut]}</td>
                        <td>{p.programme || "—"}</td>
                        <td>{date(p.dateEntree)}</td>
                        <td>{date(p.dateFinPrevue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : etat.taches ? (
                <table className="tableau-simple">
                  <thead>
                    <tr>
                      <th scope="col">Ligne</th>
                      <th scope="col">Projet</th>
                      <th scope="col">Tâche</th>
                      <th scope="col">Pour</th>
                      <th scope="col">Livrable</th>
                      <th scope="col">Statut</th>
                      <th scope="col">Échéance</th>
                      <th scope="col">Estimé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etat.taches.taches.slice(0, 300).map((t) => (
                      <tr key={t.ligne}>
                        <td>{t.ligne}</td>
                        <td>{t.projetCode ? <span className="etiquette-projet">{t.projetCode}</span> : "Hors projet"}</td>
                        <th scope="row">{t.titre}</th>
                        <td>{t.assigne}</td>
                        <td>
                          {t.livrable ?? "—"}
                          {t.livrable && !t.livrableId ? <span className="ton-discret"> (créé)</span> : null}
                        </td>
                        <td>{STATUT_T[t.statut]}</td>
                        <td>{date(t.echeance)}</td>
                        <td>{t.estimationHeures ? `${t.estimationHeures} h` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {nombre > 300 ? <p className="note">… et {nombre - 300} autres lignes.</p> : null}
            </div>
          ) : null}
          {nombre && !erreurs.length && etat.lignes ? (
            <form action={importer}>
              <input type="hidden" name="lignes" value={JSON.stringify(etat.lignes)} />
              <button type="submit" className="bouton-ambre" disabled={ecriture}>
                {ecriture ? "Import…" : `Importer ${pluriel(nombre, genre === "projets" ? "projet" : "tâche", genre === "projets" ? "projets" : "tâches")}`}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
