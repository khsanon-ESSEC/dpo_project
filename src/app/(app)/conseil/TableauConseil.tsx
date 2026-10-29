/** Le tableau du rapport au conseil, au format du document Word habituel (rapport mensuel et rapports ponctuels). */
import type { ReactNode } from "react";
import { dateCourte, dateLocale, dateLongue } from "@/lib/dates";
import type { lignesConseil } from "@/lib/donnees/conseil";
import { LienProjet } from "@/components/Liens";
import { enregistrerEtat, redigerAvecAssistant, retirerLigne } from "./actions";

type Lignes = Awaited<ReturnType<typeof lignesConseil>>;

const petitBouton = { border: "1px solid #c8c8c8", background: "#fff", color: "#213e7d", fontSize: 12, padding: "4px 10px", cursor: "pointer" } as const;

export function TableauConseil({
  lignes,
  brouillon,
  ia,
  entete,
  rapportRetirable,
  visibles,
  redigeables,
  objectifs,
  mensuel,
}: {
  lignes: Lignes;
  brouillon: boolean;
  ia: boolean;
  /** Les lignes du haut de la page (division, titre, sous-titre). */
  entete: ReactNode;
  /** Rapport ponctuel en brouillon : chaque projet peut être retiré. */
  rapportRetirable?: string | null;
  /** Projets que le lecteur peut ouvrir (leurs titres deviennent des liens). */
  visibles?: "tous" | Set<string>;
  /** Rapport mensuel : projets dont le lecteur rédige la ligne (ceux qu'il gère) ; les autres se lisent. */
  redigeables?: Set<string>;
  /** Les objectifs écrits de chaque projet (29 octobre 2026), rappelés sous sa description. */
  objectifs?: Map<string, string[]>;
  /** Rapport mensuel : dire, sous chaque état d'avancement, s'il vient du chef de projet (29 octobre 2026). */
  mensuel?: boolean;
}) {
  return (
    <div className="papier">
      <div className="papier__corps">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>{entete}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-couleur.svg" alt="UNIBANK" style={{ width: 120, height: "auto", flex: "none" }} />
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
            {lignes.map(({ ligne, projet, auteurEtat }, i) => {
              const change = !!ligne.dateFinDernierRapport && ligne.nouvelleDateFin !== ligne.dateFinDernierRapport;
              return (
                <tr key={ligne.id}>
                  <td>{i + 1}</td>
                  <td>
                    <strong style={{ fontWeight: 600 }}>
                      <LienProjet id={projet.id} visible={!!visibles && (visibles === "tous" || visibles.has(projet.id))}>
                        {projet.titre}
                      </LienProjet>
                    </strong>
                    <br />
                    {projet.description}
                    {objectifs?.get(projet.id)?.length ? (
                      <span className="objectifs-conseil">
                        <strong>Objectifs : </strong>
                        {objectifs.get(projet.id)!.join(" ; ")}
                      </span>
                    ) : null}
                    {rapportRetirable ? (
                      <form action={retirerLigne.bind(null, rapportRetirable, ligne.id)} style={{ marginTop: 8 }}>
                        <button type="submit" style={petitBouton} aria-label={`Retirer ${projet.titre} de ce rapport`}>
                          Retirer du rapport
                        </button>
                      </form>
                    ) : null}
                  </td>
                  <td>{projet.programme}</td>
                  <td className="ia">
                    {brouillon && (!redigeables || redigeables.has(projet.id)) ? (
                      <form key={`${ligne.id}-${ligne.redigeParIa}-${ligne.etatAvancement.length}`} action={enregistrerEtat.bind(null, ligne.id)} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label className="visuellement-cache" htmlFor={`etat-${ligne.id}`}>
                          État d'avancement de {projet.titre}
                        </label>
                        <textarea id={`etat-${ligne.id}`} name="etat" defaultValue={ligne.etatAvancement} maxLength={2000} />
                        <SourceEtat source={ligne.source} auteur={auteurEtat} le={ligne.sourceLe} mensuel={!!mensuel} />
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button type="submit" style={petitBouton}>
                            Enregistrer
                          </button>
                          {ia ? (
                            <button formAction={redigerAvecAssistant.bind(null, ligne.id)} style={petitBouton}>
                              Proposer avec l'assistant
                            </button>
                          ) : null}
                        </span>
                      </form>
                    ) : (
                      <>
                        {ligne.etatAvancement}
                        {brouillon ? <SourceEtat source={ligne.source} auteur={auteurEtat} le={ligne.sourceLe} mensuel={!!mensuel} /> : null}
                      </>
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
            <span style={{ width: 14, height: 10, background: "#f5f7fb", boxShadow: "inset 2px 0 0 #8cb3d9" }} />
            Préparé automatiquement, à relire
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 14, height: 10, background: "#fff4dc" }} />
            Changé depuis le dernier rapport mensuel
          </span>
        </div>
      </div>
    </div>
  );
}

/** Les étapes d'un rapport au conseil, sous son titre. */
export function EtapesConseil({ statut }: { statut: string }) {
  const etapes = ["Brouillon préparé", "Relecture de la direction", "Approuvé", "Envoyé au conseil"];
  const courante = statut === "brouillon" ? 1 : statut === "approuve" ? 2 : 3;
  return (
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
                ...(i < courante ? { background: "var(--anneau-arc)" } : i === courante ? { background: "#f4b22d" } : { border: "1.5px solid #c0d7ed" }),
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
  );
}

/** D'où vient l'état d'avancement : le chef de projet, la direction, l'assistant, ou le texte automatique. */
function SourceEtat({ source, auteur, le, mensuel }: { source: string; auteur: string | null; le: Date | null; mensuel: boolean }) {
  const quand = le ? ` le ${dateCourte(dateLocale(le))}` : "";
  const style = { display: "block", fontSize: 11, lineHeight: "15px", color: "#5f5e5e" } as const;
  if (source === "chef") return <span style={style}>Écrit par {auteur ?? "le chef de projet"} (chef de projet){quand}</span>;
  if (source === "direction") return <span style={style}>Corrigé par {auteur ?? "la direction"}{quand}</span>;
  if (source === "ia") return <span style={style}>Rédigé par l&apos;assistant{auteur ? ` à la demande de ${auteur}` : ""}, à relire</span>;
  return mensuel ? <span style={{ ...style, color: "#9a6a00" }}>Texte automatique : le chef de projet ne l&apos;a pas mis à jour</span> : null;
}
