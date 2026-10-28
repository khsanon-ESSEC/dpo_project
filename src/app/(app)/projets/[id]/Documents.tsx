/**
 * Documents du projet (cahier des charges, spécification, compte rendu…), regroupés par catégorie.
 * Chacun se télécharge ; qui l'a déposé, ou gère le projet, peut le retirer (confirmation en deux temps).
 */
import { retirerDocumentProjet } from "./actions";
import { DepotDocuments } from "./DepotDocuments";
import { Icone } from "@/components/Icone";
import { LienPersonne } from "@/components/Liens";
import { dateCourte, dateLocale } from "@/lib/dates";
import { CATEGORIES_DOCUMENT, estCategorie, ORDRE_CATEGORIES } from "@/lib/documents";
import type { DocumentLu } from "@/lib/donnees/documents";
import { FORMATS, extensionDe, tailleLisible } from "@/lib/pieces";

export function DocumentsProjet({
  projetId,
  documents,
  noms,
  moiId,
  gere,
  peutDeposer,
  erreur,
  ajoutes,
  retire,
}: {
  projetId: string;
  documents: DocumentLu[];
  noms: Map<string, string>;
  moiId: string;
  gere: boolean;
  peutDeposer: boolean;
  erreur?: string;
  ajoutes?: number;
  retire?: boolean;
}) {
  const groupes = ORDRE_CATEGORIES.map((c) => ({ c, liste: documents.filter((d) => (estCategorie(d.categorie) ? d.categorie : "autre") === c) })).filter((g) => g.liste.length);
  return (
    <section className="carte carte--liste" id="documents" aria-labelledby="p-documents">
      <div className="carte__entete">
        <h2 id="p-documents" className="carte__titre">
          Documents · {documents.length}
        </h2>
      </div>
      {ajoutes ? (
        <p className="succes" role="status" style={{ margin: "0 0 8px" }}>
          {ajoutes > 1 ? `${ajoutes} documents ajoutés.` : "Document ajouté."}
        </p>
      ) : null}
      {retire ? (
        <p className="succes" role="status" style={{ margin: "0 0 8px" }}>
          Document retiré.
        </p>
      ) : null}
      {erreur ? (
        <p className="erreur" role="alert" style={{ margin: "0 0 8px" }}>
          {erreur}
        </p>
      ) : null}
      {groupes.length === 0 ? <p className="vide">Aucun document pour le moment : cahier des charges, spécification, compte rendu…</p> : null}
      {groupes.map((g) => (
        <div key={g.c} className="documents__groupe">
          <h3 className="documents__titre">{CATEGORIES_DOCUMENT[g.c]}</h3>
          <ul className="liste">
            {g.liste.map((d) => {
              const auteur = d.deposeParId ? noms.get(d.deposeParId) : null;
              const retirable = gere || d.deposeParId === moiId;
              return (
                <li key={d.id} className="rangee document">
                  <span className="mono document__type" aria-hidden="true">
                    {(FORMATS[extensionDe(d.nom)]?.libelle ?? "Fichier").slice(0, 3).toUpperCase()}
                  </span>
                  <span className="rangee__texte">
                    <a href={`/api/documents/${d.id}`} className="rangee__titre lien-nom" download>
                      {d.nom}
                    </a>
                    <span className="rangee__sous">
                      {tailleLisible(d.taille)} · ajouté le {dateCourte(dateLocale(d.creeLe))}
                      {auteur ? (
                        <>
                          {" "}
                          par <LienPersonne id={d.deposeParId}>{auteur}</LienPersonne>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <a href={`/api/documents/${d.id}`} className="bouton-icone" download aria-label={`Télécharger ${d.nom}`} title="Télécharger">
                    <Icone nom="telecharger" taille={16} />
                  </a>
                  {retirable ? (
                    <details className="document__retirer">
                      <summary className="bouton-mini">Retirer</summary>
                      <form action={retirerDocumentProjet.bind(null, projetId, d.id)}>
                        <button type="submit" className="bouton-mini bouton-mini--danger" aria-label={`Confirmer : retirer ${d.nom}`}>
                          Confirmer
                        </button>
                      </form>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {/* Une nouvelle instance après chaque envoi : le choix de fichiers et la catégorie repartent de zéro. */}
      {peutDeposer ? <DepotDocuments key={`${documents.length}-${ajoutes ?? ""}-${erreur ?? ""}-${retire ? 1 : 0}`} projetId={projetId} /> : null}
    </section>
  );
}
