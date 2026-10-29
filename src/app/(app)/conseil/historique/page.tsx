import type { Metadata } from "next";
import { acces, exigerAccesConseil, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { dateCourte, dateLongue, dateLocale, moisAnnee } from "@/lib/dates";
import { historiqueConseil } from "@/lib/donnees/conseil";
import { Bandeau, LienChiffre } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ONGLETS_CONSEIL, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "Rapports soumis au conseil" };

const STATUT: Record<string, string> = { brouillon: "Non approuvé", approuve: "Approuvé", envoye: "Envoyé" };
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Les rapports au conseil déjà faits (mensuels et ponctuels), à relire tels qu'ils ont été approuvés. */
export default async function PageHistoriqueConseil({ searchParams }: { searchParams: Promise<{ genre?: string }> }) {
  const { genre } = await searchParams;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  exigerAccesConseil(a);
  const tous = await historiqueConseil(await idsProjetsVisibles(a), u.id);
  const filtre = genre === "mensuel" || genre === "ponctuel" ? genre : null;
  const liste = filtre ? tous.filter((r) => r.genre === filtre) : tous;
  const annees = [...new Set(liste.map((r) => r.date.slice(0, 4)))];
  const approuves = tous.filter((r) => r.statut !== "brouillon").length;

  return (
    <>
      <Bandeau surtitre="Rapports au conseil" titre="Rapports soumis">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>rapports approuvés</dt>
            <dd>{approuves}</dd>
          </div>
          <div className="chiffre">
            <dt>
              <LienChiffre href="/conseil/historique?genre=mensuel" detail="voir les rapports mensuels">
                mensuels
              </LienChiffre>
            </dt>
            <dd>{tous.filter((r) => r.genre === "mensuel").length}</dd>
          </div>
          <div className="chiffre">
            <dt>
              <LienChiffre href="/conseil/historique?genre=ponctuel" detail="voir les rapports ponctuels">
                ponctuels
              </LienChiffre>
            </dt>
            <dd>{tous.filter((r) => r.genre === "ponctuel").length}</dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_CONSEIL} courant="/conseil/historique" label="Rapports au conseil" />
        <div className="ligne-actions">
          <nav className="filtres" aria-label="Genre de rapport">
            <a className="filtre" href="/conseil/historique" aria-current={!filtre ? "true" : undefined}>
              Tous · {tous.length}
            </a>
            <a className="filtre" href="/conseil/historique?genre=mensuel" aria-current={filtre === "mensuel" ? "true" : undefined}>
              Mensuels · {tous.filter((r) => r.genre === "mensuel").length}
            </a>
            <a className="filtre" href="/conseil/historique?genre=ponctuel" aria-current={filtre === "ponctuel" ? "true" : undefined}>
              Ponctuels · {tous.filter((r) => r.genre === "ponctuel").length}
            </a>
          </nav>
          {tous.length >= 2 ? (
            <a href="/conseil/comparer" className="bouton-contour">
              <Icone nom="colonnes" taille={16} /> Comparer deux rapports
            </a>
          ) : null}
        </div>
        {liste.length === 0 ? <p className="vide">Aucun rapport au conseil n&apos;a encore été soumis.</p> : null}
        {annees.map((an) => (
          <section key={an} className="carte carte--liste" aria-labelledby={`h-${an}`}>
            <h2 id={`h-${an}`} className="carte__titre">
              {an}
            </h2>
            <ul className="liste liste--colonnes">
              {liste
                .filter((r) => r.date.startsWith(an))
                .map((r) => {
                  const lien = r.genre === "mensuel" ? `/conseil?mois=${r.mois}` : `/conseil/ponctuels/${r.id}`;
                  const word = r.genre === "mensuel" ? `/api/conseil/${r.mois}/word` : `/api/conseil/ponctuel/${r.id}/word`;
                  return (
                    <li key={r.id} className="historique-conseil">
                      <a href={lien} className="rangee" style={{ minHeight: 64, flex: "1 1 auto", flexWrap: "wrap" }}>
                        <span className={`marque-modele ${r.genre === "mensuel" ? "marque-modele--relief" : ""}`} style={{ flex: "none" }}>
                          {r.genre === "mensuel" ? "Mensuel" : "Ponctuel"}
                        </span>
                        <span className="rangee__texte" style={{ flex: "1 1 260px" }}>
                          <span className="rangee__titre">{r.genre === "mensuel" ? majuscule(moisAnnee(r.mois!)) : r.titre}</span>
                          <span className="rangee__sous">
                            {r.genre === "ponctuel" ? `${dateLongue(r.date)} · ` : ""}
                            {r.codes.length} projet{r.codes.length > 1 ? "s" : ""}
                            {r.codes.length ? ` (${r.codes.join(", ")})` : ""}
                            {r.datesChangees ? ` · ${r.datesChangees} date${r.datesChangees > 1 ? "s" : ""} changée${r.datesChangees > 1 ? "s" : ""}` : ""}
                            {r.approuveLe ? ` · approuvé le ${dateCourte(dateLocale(r.approuveLe))}${r.approuvePar ? ` par ${r.approuvePar}` : ""}` : ""}
                          </span>
                        </span>
                        <span className={`marque-modele ${r.statut === "brouillon" ? "marque-modele--ambre" : "marque-modele--relief"}`}>{STATUT[r.statut] ?? r.statut}</span>
                      </a>
                      <a href={word} className="bouton-icone" aria-label={`Fichier Word : ${r.genre === "mensuel" ? moisAnnee(r.mois!) : r.titre}`} title="Fichier Word">
                        <Icone nom="telecharger" taille={18} />
                      </a>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
        <p className="note">Un rapport approuvé est figé : il se relit tel qu&apos;il est parti au conseil, avec ses dates et ses états d&apos;avancement.</p>
      </div>
    </>
  );
}
