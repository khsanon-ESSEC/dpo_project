import type { Metadata } from "next";
import { exigerInterne } from "@/lib/auth/session";
import { aujourdhui } from "@/lib/dates";
import { LIBELLE_STATUT_PROJET, STATUTS_ACCEPTES } from "@/lib/projets";
import { acces } from "@/lib/acces";
import { choixListes, peutGererListes } from "@/lib/donnees/listes";
import { ChoixListe } from "@/components/ChoixListe";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ChoixPersonne } from "@/components/ChoixPersonne";
import { proposer } from "../gestion-actions";

export async function generateMetadata(): Promise<Metadata> {
  const u = await exigerInterne();
  return { title: (await acces(u)).toutVoir ? "Créer un projet" : "Proposer un projet" };
}

/**
 * Tout le monde peut proposer un projet : il naît en « Requête », la direction l'accepte ou le refuse.
 * Un exécutif le crée directement (29 octobre 2026) : il nomme le chef de projet, et le projet naît validé.
 */
export default async function PageProposerProjet({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const u = await exigerInterne();
  const a = await acces(u);
  const executif = a.toutVoir;
  const org = await chargerOrganisation();
  const listes = await choixListes();
  const gereListes = peutGererListes(u, a);
  const personnes = [...org.personnes.values()]
    .filter((p) => p.actif)
    .sort((x, y) => x.nom.localeCompare(y.nom, "fr"))
    .map((p) => ({ id: p.id, nom: p.id === u.id ? `Moi (${nomComplet(p)})` : nomComplet(p), externe: p.externe, organisation: p.organisation, poste: p.poste }));
  return (
    <>
      <Bandeau
        surtitre="Projets"
        titre={executif ? "Créer un projet" : "Proposer un projet"}
        retour={
          <a href="/projets" className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Projets
          </a>
        }
      >
        <p className="discret" style={{ margin: "8px 0 0", fontSize: 14, lineHeight: "21px", maxWidth: 640 }}>
          {executif
            ? "Vous êtes exécutif : le projet est créé tout de suite, déjà validé, sans demande à accepter. Nommez son chef de projet ; il est prévenu."
            : "Votre proposition part à la direction. Un directeur ou un exécutif l'accepte et nomme le chef de projet, ou la refuse en vous disant pourquoi."}
        </p>
      </Bandeau>
      <div className="page">
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : null}
        <form action={proposer} className="carte formulaire-volets" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="formulaire-volets__groupes" style={{ gap: 20 }}>
          <div className="formulaire-volets__groupe" style={{ gap: 20 }}>
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
          <div className="champ">
            <label htmlFor="pp-objectifs">Objectifs (facultatif, un par ligne)</label>
            <textarea id="pp-objectifs" name="objectifs" rows={3} maxLength={3000} aria-describedby="pp-objectifs-aide" placeholder={"Optimiser les processus du Centre de contact\nMettre en place des indicateurs de performance"} />
            <span className="aide" id="pp-objectifs-aide">
              Ce que le projet doit atteindre. Le chef de projet les précise ensuite et y ajoute les bénéfices attendus, mesurables.
            </span>
          </div>
          </div>
          <div className="formulaire-volets__groupe" style={{ gap: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <div style={{ flex: "2 1 240px", minWidth: 0 }}>
              <ChoixListe id="pp-programme" name="programme" libelle="Programme (facultatif)" valeurs={listes.programme} vide="Aucun programme" lienListes={gereListes} />
            </div>
            <div className="champ" style={{ flex: "1 1 160px" }}>
              <label htmlFor="pp-fin">{executif ? "Fin prévue (facultatif)" : "Fin souhaitée (facultatif)"}</label>
              <input id="pp-fin" name="finSouhaitee" type="date" />
            </div>
          </div>
          <ChoixListe
            id="pp-division"
            name="division"
            libelle="Division du projet"
            valeurs={listes.division}
            vide="La DPO (projet de la division)"
            aide={
              executif
                ? "Pour le projet d'une autre division, son chef de projet peut être hors division ; nommez alors un référent DPO plus bas."
                : "Pour le projet d'une autre division, son chef de projet peut être hors division ; la direction nommera un référent de la DPO."
            }
            lienListes={gereListes}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            <div style={{ flex: "2 1 240px", minWidth: 0 }}>
              {executif ? (
                <ChoixPersonne id="pp-chef" name="chefSuggereId" prefixe="chef" libelle="Chef de projet" personnes={personnes} vide="Choisir" />
              ) : (
                <ChoixPersonne id="pp-chef" name="chefSuggereId" prefixe="chef" libelle="Chef de projet suggéré (facultatif)" personnes={personnes} vide="À choisir par la direction" />
              )}
            </div>
            <div className="champ" style={{ flex: "1 1 120px" }}>
              <label htmlFor="pp-code">Code (facultatif)</label>
              <input id="pp-code" name="code" maxLength={4} placeholder="Auto" style={{ textTransform: "uppercase" }} aria-describedby="pp-code-aide" />
              <span className="aide" id="pp-code-aide">
                2 à 4 lettres ; tiré du titre si vide.
              </span>
            </div>
          </div>
          {executif ? (
            <>
              <ChoixPersonne
                id="pp-referent"
                name="referentId"
                prefixe="referent"
                libelle="Référent DPO"
                personnes={personnes.filter((x) => !x.externe)}
                vide="Aucun"
                horsDivision={false}
                aide="Si le chef de projet est hors division."
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                <div className="champ" style={{ flex: "1 1 160px" }}>
                  <label htmlFor="pp-statut">Statut de départ</label>
                  <select id="pp-statut" name="statut" defaultValue="en_cours">
                    {STATUTS_ACCEPTES.filter((x) => x !== "finalise").map((x) => (
                      <option key={x} value={x}>
                        {LIBELLE_STATUT_PROJET[x]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="champ" style={{ flex: "1 1 160px" }}>
                  <label htmlFor="pp-entree">Date d&apos;entrée</label>
                  <input id="pp-entree" name="dateEntree" type="date" defaultValue={aujourdhui()} />
                </div>
              </div>
            </>
          ) : null}
          <label className="role-manuel">
            <span className="rangee__texte">
              <span className="rangee__titre">Projet stratégique</span>
              <span className="rangee__sous">{executif ? "Un projet stratégique figure au rapport au conseil." : "À confirmer par la direction ; un projet stratégique figure au rapport au conseil."}</span>
            </span>
            <input type="checkbox" className="interrupteur" name="strategique" />
          </label>
          </div>
          </div>
          <div>
            <button type="submit" className="bouton-ambre">
              {executif ? "Créer le projet" : "Envoyer la proposition"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
