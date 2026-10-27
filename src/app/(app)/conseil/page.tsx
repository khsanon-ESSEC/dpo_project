import type { Metadata } from "next";
import { acces, exigerAccesConseil, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { dateLongue, moisAnnee } from "@/lib/dates";
import { lignesConseil, moisCourant, obtenirOuCreerRapportConseil } from "@/lib/donnees/conseil";
import { iaDisponible } from "@/lib/ia";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { approuver, enregistrerEtat, redigerAvecAssistant } from "./actions";

export const metadata: Metadata = { title: "Rapport au conseil" };

export default async function PageConseil({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { mois: moisDemande } = await searchParams;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  exigerAccesConseil(a);
  const mois = moisDemande && /^\d{4}-\d{2}-01$/.test(moisDemande) ? moisDemande : moisCourant();
  const r = await obtenirOuCreerRapportConseil(mois);
  const visibles = await idsProjetsVisibles(a);
  // Un directeur ne voit que les projets stratégiques de sa direction ; un exécutif voit tout.
  const lignes = (await lignesConseil(r.id, r.statut)).filter((l) => visibles === "tous" || visibles.has(l.projet.id));
  const brouillon = r.statut === "brouillon";
  const changees = lignes.filter((l) => l.ligne.dateFinDernierRapport && l.ligne.nouvelleDateFin !== l.ligne.dateFinDernierRapport).length;
  const etapes = ["Brouillon préparé", "Relecture de la direction", "Approuvé", "Envoyé au conseil"];
  const courante = brouillon ? 1 : r.statut === "approuve" ? 2 : 3;

  return (
    <>
      <Bandeau surtitre="Rapport mensuel au conseil" titre={moisAnnee(mois).replace(/^./, (c) => c.toUpperCase())}>
        <ol aria-label="Étapes du rapport" style={{ margin: "32px 0 0", padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "12px 0", maxWidth: 680 }}>
          {etapes.map((e, i) => (
            <li key={e} aria-current={i === courante ? "step" : undefined} style={{ flex: "1 1 150px", display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ display: "flex", alignItems: "center" }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    flex: "none",
                    borderRadius: "50%",
                    ...(i < courante ? { background: "var(--anneau-arc)" } : i === courante ? { background: "#f4b22d" } : { border: "1.5px solid #a9b6d6" }),
                  }}
                />
                {i < 3 ? <span style={{ flex: 1, height: 1, margin: "0 8px", background: i < courante ? "var(--anneau-arc)" : "var(--anneau-piste)" }} /> : null}
              </span>
              <span className={i === courante ? undefined : "discret"} style={{ fontSize: 13, fontWeight: i === courante ? 500 : 400 }}>
                {e}
              </span>
            </li>
          ))}
        </ol>
      </Bandeau>
      <div className="page">
        <div className="ligne-actions">
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "12px 40px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <dd style={{ margin: 0, fontSize: 32, lineHeight: "36px", fontWeight: 200 }}>{lignes.length}</dd>
              <dt className="note">projets stratégiques</dt>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <dd className={changees ? "ton-retard" : undefined} style={{ margin: 0, fontSize: 32, lineHeight: "36px", fontWeight: 200 }}>
                {changees}
              </dd>
              <dt className="note">date{changees > 1 ? "s" : ""} changée{changees > 1 ? "s" : ""} depuis le dernier rapport</dt>
            </div>
          </dl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <a href={`/api/conseil/${mois}/word`} className={brouillon ? "bouton-contour" : "bouton-ambre"}>
              <Icone nom="telecharger" taille={18} /> Fichier Word
            </a>
            {brouillon && a.toutVoir ? (
              <form action={approuver.bind(null, r.id)}>
                <button type="submit" className="bouton-ambre">
                  Approuver le rapport
                </button>
              </form>
            ) : null}
          </div>
        </div>
        {brouillon ? (
          <p className="note">
            Les états d'avancement sont préparés à partir des fiches projet. Relisez-les : ce sont eux qui partent au conseil. Les dates suivent les fiches projet jusqu'à l'approbation.
            {a.toutVoir ? "" : " Vous voyez les projets stratégiques de votre direction ; un exécutif approuve le rapport complet."}
          </p>
        ) : (
          <p className="succes">Approuvé : dates et états sont figés. Ils serviront de « dernier rapport » le mois prochain.</p>
        )}
        <div className="papier">
          <div className="papier__corps">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 700 }}>DIVISION PRODUCTIVITÉ ET ORGANISATION</span>
                <span style={{ fontSize: 13 }}>PROJETS TECHNOLOGIQUES STRATÉGIQUES EN COURS</span>
                <span style={{ marginTop: 8, fontSize: 13, fontWeight: 700 }}>CALENDRIER DE LIVRAISON</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-couleur.svg" alt="UNIBANK" style={{ width: 120, height: "auto" }} />
            </div>
            <table>
              <thead>
                <tr>
                  <th scope="col" style={{ width: 22 }} />
                  <th scope="col" style={{ width: "24%" }}>Projet</th>
                  <th scope="col" style={{ width: "11%" }}>Programme</th>
                  <th scope="col" style={{ width: "26%" }}>État d'avancement</th>
                  <th scope="col">Date d'entrée</th>
                  <th scope="col">Date de fin prévue initialement</th>
                  <th scope="col">Date de fin prévue au dernier rapport</th>
                  <th scope="col">Nouvelle date de fin prévue</th>
                  <th scope="col">Date prévisionnelle de lancement</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(({ ligne, projet }, i) => {
                  const change = !!ligne.dateFinDernierRapport && ligne.nouvelleDateFin !== ligne.dateFinDernierRapport;
                  return (
                    <tr key={ligne.id}>
                      <td>{i + 1}</td>
                      <td>
                        <strong style={{ fontWeight: 600 }}>{projet.titre}</strong>
                        <br />
                        {projet.description}
                      </td>
                      <td>{projet.programme}</td>
                      <td className="ia">
                        {brouillon ? (
                          <form action={enregistrerEtat.bind(null, ligne.id)} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <label className="visuellement-cache" htmlFor={`etat-${ligne.id}`}>
                              État d'avancement de {projet.titre}
                            </label>
                            <textarea id={`etat-${ligne.id}`} name="etat" defaultValue={ligne.etatAvancement} maxLength={2000} />
                            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button type="submit" style={{ border: "1px solid #c8c8c8", background: "#fff", color: "#213e7d", fontSize: 12, padding: "4px 10px", cursor: "pointer" }}>
                                Enregistrer
                              </button>
                              {iaDisponible() ? (
                                <button formAction={redigerAvecAssistant.bind(null, ligne.id)} style={{ border: "1px solid #c8c8c8", background: "#fff", color: "#213e7d", fontSize: 12, padding: "4px 10px", cursor: "pointer" }}>
                                  Proposer avec l'assistant
                                </button>
                              ) : null}
                            </span>
                          </form>
                        ) : (
                          ligne.etatAvancement
                        )}
                      </td>
                      <td>{dateLongue(projet.dateEntree)}</td>
                      <td>{dateLongue(projet.dateFinInitiale)}</td>
                      <td>{dateLongue(ligne.dateFinDernierRapport)}</td>
                      <td className={change ? "change" : undefined}>{dateLongue(ligne.nouvelleDateFin)}</td>
                      <td className={change ? "change" : undefined}>{dateLongue(ligne.dateLancement)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 28px", fontSize: 12, color: "#5f5e5e" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 14, height: 10, background: "#f5f7fb", boxShadow: "inset 2px 0 0 #8ea3cf" }} />
                Préparé automatiquement, à relire
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 14, height: 10, background: "#fff4dc" }} />
                Changé depuis le dernier rapport
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
