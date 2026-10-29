import type { Metadata } from "next";
import { acces, idsProjetsVisibles, suitPersonne } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui } from "@/lib/dates";
import { indicationsDeCharge } from "@/lib/donnees/charge";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { assignables } from "@/lib/donnees/gestion";
import { choixDeLivrables } from "@/lib/donnees/livrables";
import { retourValide } from "@/lib/retour";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { FormulaireNouvelleTache } from "./FormulaireNouvelleTache";

export const metadata: Metadata = { title: "Nouvelle tâche" };

export default async function PageNouvelleTache({ searchParams }: { searchParams: Promise<{ projet?: string; pour?: string; retour?: string; livrable?: string }> }) {
  const { projet, pour, retour: retourDemande, livrable } = await searchParams;
  const retour = retourValide(retourDemande);
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const visibles = await idsProjetsVisibles(a);
  const projets = (await tousLesProjetsActifs()).filter((p) => visibles === "tous" || visibles.has(p.id));

  // À qui confier : soi, les personnes qu'on suit ; sur un projet qu'on dirige, les membres de son équipe.
  const { personnes, base, parProjet, parLivrable, externesPartout, horsProjet } = await assignables(a);
  // Les livrables pas encore validés de chaque projet, pour rattacher la tâche.
  const tous = await choixDeLivrables(projets.map((p) => p.id));
  const livrables = Object.fromEntries(Object.entries(tous).map(([k, l]) => [k, l.filter((x) => x.etat !== "atteint").map((x) => ({ id: x.id, libelle: x.libelle, prevuLe: x.prevuLe }))]));

  // Indication de charge : heures pour les personnes qu'on suit, seulement le niveau pour les autres.
  // Pas de charge mesurée pour les personnes hors division.
  const indications = await indicationsDeCharge(personnes.filter((p) => !p.externe).map((p) => p.id));
  for (const [id, ind] of Object.entries(indications)) {
    if (!suitPersonne(a, id)) indications[id] = { ...ind, semaines: ind.semaines.map((s) => ({ ...s, heures: null })) };
  }

  return (
    <>
      <Bandeau
        surtitre="Tâche"
        titre="Nouvelle tâche"
        retour={
          <a href={retour ?? "/semaine"} className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Retour
          </a>
        }
      />
      <div className="page" style={{ maxWidth: 760 }}>
        <FormulaireNouvelleTache
          projets={projets}
          personnes={personnes}
          base={base}
          parProjet={parProjet}
          parLivrable={parLivrable}
          livrables={livrables}
          livrableParDefaut={livrable && /^[0-9a-f-]{36}$/.test(livrable) ? livrable : ""}
          externesPartout={externesPartout}
            horsProjet={horsProjet}
          indications={indications}
          projetParDefaut={projet && projets.some((p) => p.id === projet) ? projet : ""}
          pourParDefaut={pour && personnes.some((p) => p.id === pour) ? pour : u.id}
          retour={retour}
          aujourdhui={aujourdhui()}
        />
      </div>
    </>
  );
}
