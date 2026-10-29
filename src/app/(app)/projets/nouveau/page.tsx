import type { Metadata } from "next";
import { exigerInterne } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ChoixPersonne } from "@/components/ChoixPersonne";
import { proposer } from "../gestion-actions";

export const metadata: Metadata = { title: "Proposer un projet" };

/** Tout le monde peut proposer un projet : il naît en « Requête », la direction l'accepte ou le refuse. */
export default async function PageProposerProjet({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const u = await exigerInterne();
  const org = await chargerOrganisation();
  const personnes = [...org.personnes.values()]
    .filter((p) => p.actif)
    .sort((x, y) => x.nom.localeCompare(y.nom, "fr"))
    .map((p) => ({ id: p.id, nom: p.id === u.id ? `Moi (${nomComplet(p)})` : nomComplet(p), externe: p.externe, organisation: p.organisation, poste: p.poste }));
  return (
    <>
      <Bandeau
        surtitre="Projets"
        titre="Proposer un projet"
        retour={
          <a href="/projets" className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Projets
          </a>
        }
      >
        <p className="discret" style={{ margin: "8px 0 0", fontSize: 14, lineHeight: "21px", maxWidth: 640 }}>
          Votre proposition part à la direction. Un directeur ou un exécutif l&apos;accepte et nomme le chef de projet, ou la refuse en vous disant pourquoi.
        </p>
      </Bandeau>
      <div className="page" style={{ maxWidth: 760 }}>
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : null}
        <form action={proposer} className="carte" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="champ">
            <label htmlFor="pp-titre">Titre</label>
            <input id="pp-titre" name="titre" required maxLength={160} placeholder="Ex. : Signature électronique des contrats de prêt" />
          </div>
          <div className="champ">
            <label htmlFor="pp-justification">Pourquoi ce projet</label>
            <textarea id="pp-justification" name="justification" rows={4} required maxLength={2000} aria-describedby="pp-justification-aide" />
            <span className="aide" id="pp-justification-aide">
              Le problème à résoudre, ce que la banque y gagne, qui le demande.
            </span>
          </div>
          <div className="champ">
            <label htmlFor="pp-description">Description (facultatif)</label>
            <textarea id="pp-description" name="description" rows={3} maxLength={2000} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <div className="champ" style={{ flex: "2 1 240px" }}>
              <label htmlFor="pp-programme">Programme (facultatif)</label>
              <input id="pp-programme" name="programme" maxLength={160} placeholder="Ex. : Amélioration de l'expérience client" />
            </div>
            <div className="champ" style={{ flex: "1 1 160px" }}>
              <label htmlFor="pp-fin">Fin souhaitée (facultatif)</label>
              <input id="pp-fin" name="finSouhaitee" type="date" />
            </div>
          </div>
          <div className="champ">
            <label htmlFor="pp-division">Projet d&apos;une autre division ? (facultatif)</label>
            <input id="pp-division" name="division" maxLength={120} placeholder="Ex. : Division Réseau et succursales" aria-describedby="pp-division-aide" />
            <span className="aide" id="pp-division-aide">
              Laissez vide pour un projet de la DPO. Pour le projet d&apos;une autre division, son chef de projet peut être hors division ; la direction nommera un référent de la DPO.
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            <div style={{ flex: "2 1 240px", minWidth: 0 }}>
              <ChoixPersonne id="pp-chef" name="chefSuggereId" prefixe="chef" libelle="Chef de projet suggéré (facultatif)" personnes={personnes} vide="À choisir par la direction" />
            </div>
            <div className="champ" style={{ flex: "1 1 120px" }}>
              <label htmlFor="pp-code">Code (facultatif)</label>
              <input id="pp-code" name="code" maxLength={4} placeholder="Auto" style={{ textTransform: "uppercase" }} aria-describedby="pp-code-aide" />
              <span className="aide" id="pp-code-aide">
                2 à 4 lettres ; tiré du titre si vide.
              </span>
            </div>
          </div>
          <label className="role-manuel">
            <span className="rangee__texte">
              <span className="rangee__titre">Projet stratégique</span>
              <span className="rangee__sous">À confirmer par la direction ; un projet stratégique figure au rapport au conseil.</span>
            </span>
            <input type="checkbox" className="interrupteur" name="strategique" />
          </label>
          <div>
            <button type="submit" className="bouton-ambre">
              Envoyer la proposition
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
