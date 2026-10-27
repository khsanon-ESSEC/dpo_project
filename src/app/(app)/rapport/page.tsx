import type { Metadata } from "next";
import { exigerUtilisateur } from "@/lib/auth/session";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import { ajouterJours, dateCourte, dateLocale, heure } from "@/lib/dates";
import { dejaReprise, lecteursDuRapport, lignesDuRapport, monRapportPrecedent, obtenirOuCreerRapport, PARTIES, semaineCourante } from "@/lib/donnees/rapport";
import { ONGLETS_RAPPORT, SousOnglets } from "@/components/SousOnglets";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ajouterLigne, envoyer, reprendreLigne } from "./actions";
import { CasePartie, LigneEditable } from "./Lignes";

export const metadata: Metadata = { title: "Rapport du vendredi" };

export default async function PageRapport() {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const semaine = semaineCourante();
  const rapport = await obtenirOuCreerRapport(u.id, semaine);
  const lignes = await lignesDuRapport(rapport.id);
  const lecteurs = await lecteursDuRapport(u.id, lignes);
  const visibles = await idsProjetsVisibles(a);
  const projets = (await tousLesProjetsActifs()).filter((p) => visibles === "tous" || visibles.has(p.id));
  const brouillon = rapport.statut === "brouillon";
  const relues = new Set(rapport.partiesRelues);
  const nRelues = PARTIES.filter((p) => relues.has(p.id)).length;
  // Ce qui était prévu la semaine dernière : à reprendre en un clic s'il n'y est pas déjà.
  const precedent = brouillon ? await monRapportPrecedent(u.id, semaine) : null;
  const prevues = (precedent?.lignes ?? []).filter((l) => l.partie === "prochaine").map((l) => ({ ...l, dans: dejaReprise(l, lignes) }));
  const aReprendre = prevues.filter((l) => !l.dans);
  const LIBELLE = Object.fromEntries(PARTIES.map((x) => [x.id, x.libelle]));

  return (
    <>
      <Bandeau surtitre={`Semaine du ${dateCourte(semaine)} au ${dateCourte(ajouterJours(semaine, 4))}`} titre="Mon rapport">
        <div className="discret" style={{ marginTop: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 32px", fontSize: 13, lineHeight: "18px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icone nom="cadenas" taille={16} />
            {lecteurs.superieur
              ? `${lecteurs.superieur.nom}${lecteurs.directeurs.length ? " et votre direction lisent" : " lit"} tout ; chaque chef de projet, sa partie`
              : "Aucun supérieur désigné : voir avec l'administrateur"}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icone nom="etincelle" taille={16} />
            Préparé à partir de vos tâches de la semaine
          </span>
          {brouillon ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span className="segments" role="img" aria-label={`${nRelues} parties relues sur 4`} style={{ width: 120 }}>
                {PARTIES.map((p) => (
                  <span key={p.id} data-plein={relues.has(p.id) ? "1" : "0"} />
                ))}
              </span>
              {nRelues}/4 relues
            </span>
          ) : (
            <span>Envoyé le {dateCourte(dateLocale(rapport.envoyeLe!))} à {heure(rapport.envoyeLe!)}</span>
          )}
        </div>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_RAPPORT} courant="/rapport" label="Rapports" />
        <div className="colonnes">
          <div className="colonne-large" style={{ gap: 20 }}>
            {precedent && prevues.length && !aReprendre.length ? (
              <p className="succes" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", margin: 0 }}>
                <Icone nom="coche" taille={16} /> Tout ce que vous aviez prévu la semaine dernière est déjà dans ce rapport.
                <a href={`/rapports/${precedent.rapport.id}`} className="lien-discret">
                  Voir le rapport de la semaine dernière →
                </a>
              </p>
            ) : null}
            {precedent && aReprendre.length ? (
              <section className="carte carte--liste" aria-labelledby="r-precedent" style={aReprendre.length ? { borderColor: "var(--veille-point)" } : undefined}>
                <div className="carte__entete">
                  <h2 id="r-precedent" className="carte__titre">
                    Prévu la semaine dernière{aReprendre.length ? ` · ${aReprendre.length} à reprendre` : ""}
                  </h2>
                  <a href={`/rapports/${precedent.rapport.id}`} className="lien-discret">
                    Voir ce rapport →
                  </a>
                </div>
                <ul className="liste">
                  {prevues.map((l) => (
                    <li key={l.id} className="rangee" style={{ minHeight: 52, flexWrap: "wrap" }}>
                      <span className="etiquette-projet">{l.projetCode ?? "—"}</span>
                      <span className="rangee__texte" style={{ flex: "1 1 220px" }}>
                        <span className="rangee__titre" style={l.dans ? { color: "var(--discret)" } : undefined}>
                          {l.texte}
                        </span>
                        {l.dans ? <span className="rangee__sous ton-ok">Déjà dans « {LIBELLE[l.dans]} »</span> : null}
                      </span>
                      {l.dans ? null : (
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label={`Reprendre « ${l.texte} »`}>
                          <form action={reprendreLigne.bind(null, rapport.id, l.id, "fait")}>
                            <button type="submit" className="bouton-mini">
                              <Icone nom="coche" taille={14} /> Fait
                            </button>
                          </form>
                          <form action={reprendreLigne.bind(null, rapport.id, l.id, "en_cours")}>
                            <button type="submit" className="bouton-mini">
                              En cours
                            </button>
                          </form>
                          <form action={reprendreLigne.bind(null, rapport.id, l.id, "prochaine")}>
                            <button type="submit" className="bouton-mini">
                              <Icone nom="reprendre" taille={14} /> Reporter
                            </button>
                          </form>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="note" style={{ margin: "10px 0 4px" }}>
                  {aReprendre.length ? "Un clic ajoute la ligne à la partie choisie de ce rapport." : "Tout ce qui était prévu est déjà dans votre rapport."}
                </p>
              </section>
            ) : null}
            {PARTIES.map((p) => {
              const siennes = lignes.filter((l) => l.partie === p.id);
              return (
                <section key={p.id} className="carte" aria-labelledby={`partie-${p.id}`} style={{ padding: "12px 20px 20px 28px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, minHeight: 48 }}>
                    <span style={{ width: 32, fontSize: 32, lineHeight: "36px", fontWeight: 200 }} className={p.id === "bloque" && siennes.length ? "ton-veille" : undefined}>
                      {siennes.length}
                    </span>
                    <h2 id={`partie-${p.id}`} style={{ flex: 1, margin: 0, fontSize: 16, lineHeight: "22px", fontWeight: 500 }}>
                      {p.libelle}
                    </h2>
                    {brouillon ? <CasePartie rapportId={rapport.id} partie={p.id} relue={relues.has(p.id)} /> : null}
                  </div>
                  <ul className="liste" style={{ paddingLeft: 48 }}>
                    {siennes.map((l) => (
                      <LigneEditable key={l.id} ligne={l} projets={projets} modifiable={brouillon} />
                    ))}
                    {siennes.length === 0 ? <li style={{ borderTop: 0 }} className="vide">Rien cette semaine.</li> : null}
                  </ul>
                  {brouillon ? (
                    <form action={ajouterLigne.bind(null, rapport.id, p.id)} style={{ paddingLeft: 48, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <label className="visuellement-cache" htmlFor={`ajout-${p.id}`}>
                        Ajouter une ligne à « {p.libelle} »
                      </label>
                      <input id={`ajout-${p.id}`} name="texte" maxLength={500} placeholder="Ajouter une ligne" style={{ flex: "1 1 220px", minHeight: 40, padding: "0 12px", border: "1px solid var(--filet-fort)", background: "var(--champ)", fontSize: 14 }} />
                      <label className="visuellement-cache" htmlFor={`ajout-projet-${p.id}`}>
                        Projet de la ligne
                      </label>
                      <select id={`ajout-projet-${p.id}`} name="projetId" defaultValue="" style={{ minHeight: 40, border: "1px solid var(--filet-fort)", background: "var(--champ)", fontSize: 13, maxWidth: 200 }}>
                        <option value="">Sans projet</option>
                        {projets.map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {pr.code} · {pr.titre}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="bouton-contour">
                        <Icone nom="ajouter" taille={16} /> Ajouter
                      </button>
                    </form>
                  ) : null}
                </section>
              );
            })}
          </div>
          <div className="colonne-etroite">
            <section className="carte" aria-labelledby="r-dest" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <h2 id="r-dest" className="carte__titre" style={{ margin: 0 }}>
                Destinataire
              </h2>
              {lecteurs.superieur ? (
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span className="mono" style={{ width: 40, height: 40, fontSize: 13 }} aria-hidden="true">
                    {lecteurs.superieur.nom.split(" ").map((x) => x[0]).join("").slice(0, 2)}
                  </span>
                  <span className="rangee__texte">
                    <span className="rangee__titre">{lecteurs.superieur.nom}</span>
                    <span className="rangee__sous">{lecteurs.superieur.poste}</span>
                  </span>
                </div>
              ) : (
                <p className="note">Personne ne reçoit encore votre rapport.</p>
              )}
              {brouillon ? (
                <form action={envoyer.bind(null, rapport.id)}>
                  <button type="submit" className="bouton-ambre bouton-ambre--large" disabled={!lecteurs.superieur}>
                    Envoyer{lecteurs.superieur ? ` à ${lecteurs.superieur.prenom}` : ""}
                  </button>
                </form>
              ) : (
                <p className="succes">Rapport envoyé.</p>
              )}
            </section>
            <section className="carte carte--liste" aria-labelledby="r-qui">
              <h2 id="r-qui" className="carte__titre">
                Qui voit quoi
              </h2>
              <p className="note" style={{ marginBottom: 8 }}>
                Chaque chef de projet ne voit que les lignes marquées de son projet.
              </p>
              <ul className="liste">
                {lecteurs.superieur ? (
                  <li className="rangee">
                    <span className="rangee__texte">
                      <span className="rangee__titre">{lecteurs.superieur.nom}</span>
                      <span className="rangee__sous">Votre supérieur</span>
                    </span>
                    <span className="rangee__meta" style={{ fontSize: 12 }}>
                      Tout le rapport
                    </span>
                  </li>
                ) : null}
                {lecteurs.directeurs.map((d) => (
                  <li key={d.id} className="rangee">
                    <span className="rangee__texte">
                      <span className="rangee__titre">{d.nom}</span>
                      <span className="rangee__sous">Votre direction{d.poste ? ` · ${d.poste}` : ""}</span>
                    </span>
                    <span className="rangee__meta" style={{ fontSize: 12 }}>
                      Tout le rapport
                    </span>
                  </li>
                ))}
                <li className="rangee">
                  <span className="rangee__texte">
                    <span className="rangee__titre">Les exécutifs</span>
                    <span className="rangee__sous">Toute la banque</span>
                  </span>
                  <span className="rangee__meta" style={{ fontSize: 12 }}>
                    Tout le rapport
                  </span>
                </li>
                {lecteurs.chefs.map((c) => (
                  <li key={c.id} className="rangee">
                    <span className="rangee__texte">
                      <span className="rangee__titre">{c.nom}</span>
                      <span className="rangee__sous">Chef de projet · {c.titre}</span>
                    </span>
                    <span className="rangee__meta" style={{ fontSize: 12 }}>
                      {c.code} · {c.n} ligne{c.n > 1 ? "s" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
