import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { adActive } from "@/lib/auth/ad";
import { googleActive } from "@/lib/auth/google";
import { peutImporterProjets } from "@/lib/donnees/import-projets";
import { COLONNES_PROJETS, COLONNES_TACHES } from "@/lib/import-projets";
import { peutAdministrer } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { ongletsOrganisation, SousOnglets } from "@/components/SousOnglets";
import { ImportOrganisation } from "./ImportOrganisation";
import { ImportProjets } from "./ImportProjets";

export const metadata: Metadata = { title: "Importer" };

/**
 * Importer en vrac (demandé le 29 octobre 2026, pour la première mise en service notamment) : les personnes et les
 * équipes (administrateurs, depuis Excel ou Active Directory), les projets et les tâches (exécutifs). Chaque fois :
 * un modèle à télécharger, le fichier rempli à déposer, l'aperçu de ce qui serait créé, puis l'import.
 */
export default async function PageImporter() {
  const u = await exigerInterne();
  const a = await acces(u);
  const admin = peutAdministrer(u);
  const projets = peutImporterProjets(a);
  if (!admin && !projets) notFound();
  const ad = adActive();
  const Colonnes = ({ colonnes }: { colonnes: typeof COLONNES_PROJETS }) => (
    <details className="note">
      <summary style={{ cursor: "pointer", minHeight: 32 }}>Les colonnes du modèle</summary>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {colonnes.map((c) => (
          <li key={c.cle}>
            <strong>{c.titre}</strong>
            {c.aide ? ` : ${c.aide}` : " : facultatif."}
            {c.exemple ? ` Ex. : ${c.exemple}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
  return (
    <>
      <Bandeau surtitre="Organisation" titre="Importer">
        <p className="discret" style={{ margin: "8px 0 0", fontSize: 14, lineHeight: "21px", maxWidth: 720 }}>
          Pour démarrer avec les données existantes : téléchargez un modèle, remplissez-le dans Excel, déposez-le. L&apos;application montre d&apos;abord ce qu&apos;elle créerait et les lignes à corriger ; rien n&apos;est écrit avant « Importer ».
        </p>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ongletsOrganisation(u, a.toutVoir)} courant="/organisation/importer" label="Organisation" />
        <nav className="filtres" aria-label="Que voulez-vous importer ?">
          {admin ? (
            <a className="filtre" href="#personnes">
              1. Personnes et équipes
            </a>
          ) : null}
          {projets ? (
            <>
              <a className="filtre" href="#projets">
                {admin ? "2." : "1."} Projets
              </a>
              <a className="filtre" href="#taches">
                {admin ? "3." : "2."} Tâches
              </a>
            </>
          ) : null}
        </nav>
        {admin ? (
          <section className="carte" id="personnes" aria-labelledby="imp-personnes" style={{ scrollMarginTop: 80, display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 id="imp-personnes" className="carte__titre" style={{ margin: 0 }}>
              Personnes et équipes (employés, utilisateurs)
            </h2>
            <p className="note" style={{ margin: 0 }}>
              Ajoute les personnes qui manquent et met à jour poste, équipe et supérieur. Les rôles (directeur, exécutif, administrateur) ne s&apos;importent pas, et personne n&apos;est désactivé. À faire en premier : les projets et les tâches désignent les personnes par leur courriel.
            </p>
            <ImportOrganisation ad={ad} groupe={!!process.env.AD_GROUPE?.trim()} sso={ad || googleActive()} baseDn={process.env.AD_BASE_DN?.trim() ?? ""} />
          </section>
        ) : null}
        {projets ? (
          <>
            <section className="carte" id="projets" aria-labelledby="imp-projets" style={{ scrollMarginTop: 80, display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 id="imp-projets" className="carte__titre" style={{ margin: 0 }}>
                Projets
              </h2>
              <p className="note" style={{ margin: 0 }}>
                Une ligne par projet : créé directement (sans passer par la demande), avec son chef, son équipe, ses dates, son programme. Un code déjà pris est refusé : un projet existant se modifie dans l&apos;application.
              </p>
              <Colonnes colonnes={COLONNES_PROJETS} />
              <ImportProjets genre="projets" />
            </section>
            <section className="carte" id="taches" aria-labelledby="imp-taches" style={{ scrollMarginTop: 80, display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 id="imp-taches" className="carte__titre" style={{ margin: 0 }}>
                Tâches
              </h2>
              <p className="note" style={{ margin: 0 }}>
                Une ligne par tâche, rattachée à un projet existant par son code (importez d&apos;abord les projets). Un livrable nommé qui n&apos;existe pas est créé ; la personne d&apos;une tâche entre dans l&apos;équipe du projet.
              </p>
              <Colonnes colonnes={COLONNES_TACHES} />
              <ImportProjets genre="taches" />
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
