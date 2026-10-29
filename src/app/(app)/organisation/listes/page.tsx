import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { GENRES_LISTE, LONGUEUR_LIBELLE, listesProjet, peutGererListes, type GenreListe } from "@/lib/donnees/listes";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ongletsOrganisation, SousOnglets } from "@/components/SousOnglets";
import { ajouterALaListe, renommerDansLaListe, retirerDeLaListe } from "./actions";

export const metadata: Metadata = { title: "Listes des projets" };

const TITRE: Record<GenreListe, string> = { programme: "Programmes", division: "Divisions" };
const AIDE: Record<GenreListe, string> = {
  programme: "Proposés dans « Programme » à la création et à la modification d'un projet.",
  division: "Proposées dans « Division du projet » pour le projet d'une autre division. Sans division, un projet est celui de la DPO.",
};
const EXEMPLE: Record<GenreListe, string> = { programme: "Ex. : Amélioration de l'expérience client", division: "Ex. : Division Réseau et succursales" };

/** Organisation → Listes : les programmes et les divisions choisis dans les fiches des projets. */
export default async function PageListes({ searchParams }: { searchParams: Promise<{ erreur?: string; ok?: string }> }) {
  const { erreur, ok } = await searchParams;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  if (!peutGererListes(u, a)) notFound();
  const listes = await listesProjet();
  const onglets = ongletsOrganisation(u, a.toutVoir);
  return (
    <>
      <Bandeau surtitre="Organisation" titre="Listes des projets">
        <dl className="chiffres">
          {GENRES_LISTE.map((g) => (
            <div key={g} className="chiffre">
              <dt>{TITRE[g].toLowerCase()}</dt>
              <dd>{listes[g].filter((v) => v.actif).length}</dd>
            </div>
          ))}
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={onglets} courant="/organisation/listes" label="Organisation" />
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : ok ? (
          <p className="succes" role="status">
            Liste enregistrée.
          </p>
        ) : null}
        <p className="note" style={{ margin: 0 }}>
          Renommer une valeur renomme aussi les projets qui la portent. Retirer une valeur ne la propose plus ; les projets qui la portent la gardent.
        </p>
        <div className="cartes-en-grille">
          {GENRES_LISTE.map((g) => (
            <section key={g} className="carte carte--liste" id={`liste-${g}`} aria-labelledby={`l-${g}`} style={{ scrollMarginTop: 80 }}>
              <h2 id={`l-${g}`} className="carte__titre">
                {TITRE[g]} · {listes[g].filter((v) => v.actif).length}
              </h2>
              <p className="note" style={{ margin: "0 0 8px" }}>
                {AIDE[g]}
              </p>
              <ul className="liste">
                {listes[g].map((v) => (
                  <li key={v.id} id={`valeur-${v.id}`} style={{ scrollMarginTop: 80 }}>
                    <div className="rangee" style={{ gap: 12, flexWrap: "wrap", opacity: v.actif ? 1 : 0.6 }}>
                      <form action={renommerDansLaListe.bind(null, v.id)} className="ligne-liste-ref" style={{ display: "flex", gap: 8, flex: "1 1 320px", minWidth: 0, alignItems: "center" }}>
                        <label htmlFor={`v-${v.id}`} className="visuellement-cache">
                          Nom
                        </label>
                        <input id={`v-${v.id}`} name="libelle" defaultValue={v.libelle} required minLength={2} maxLength={LONGUEUR_LIBELLE[g]} style={{ flex: "1 1 auto", minWidth: 0 }} />
                        <button type="submit" className="bouton-mini">
                          Renommer
                        </button>
                      </form>
                      <span className="rangee__sous" style={{ flex: "none" }}>
                        {v.projets} projet{v.projets > 1 ? "s" : ""}
                        {v.actif ? "" : " · retiré"}
                      </span>
                      <form action={retirerDeLaListe.bind(null, v.id, !v.actif)}>
                        <button type="submit" className="bouton-mini">
                          {v.actif ? "Retirer" : "Remettre"}
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
                {listes[g].length === 0 ? <li className="vide">La liste est vide.</li> : null}
              </ul>
              <form action={ajouterALaListe.bind(null, g)} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
                <div className="champ" style={{ flex: "1 1 280px" }}>
                  <label htmlFor={`n-${g}`}>{g === "programme" ? "Nouveau programme" : "Nouvelle division"}</label>
                  <input id={`n-${g}`} name="libelle" required minLength={2} maxLength={LONGUEUR_LIBELLE[g]} placeholder={EXEMPLE[g]} />
                </div>
                <button type="submit" className="bouton-contour">
                  <Icone nom="ajouter" taille={16} /> Ajouter
                </button>
              </form>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
