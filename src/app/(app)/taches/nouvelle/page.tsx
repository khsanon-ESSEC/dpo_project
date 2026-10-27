import type { Metadata } from "next";
import { acces, idsProjetsVisibles, suitPersonne } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui } from "@/lib/dates";
import { indicationsDeCharge } from "@/lib/donnees/charge";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { retourValide } from "@/lib/retour";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { FormulaireNouvelleTache } from "./FormulaireNouvelleTache";

export const metadata: Metadata = { title: "Nouvelle tâche" };

export default async function PageNouvelleTache({ searchParams }: { searchParams: Promise<{ projet?: string; pour?: string; retour?: string }> }) {
  const { projet, pour, retour: retourDemande } = await searchParams;
  const retour = retourValide(retourDemande);
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const org = await chargerOrganisation();
  const visibles = await idsProjetsVisibles(a);
  const projets = (await tousLesProjetsActifs()).filter((p) => visibles === "tous" || visibles.has(p.id));

  // À qui confier : soi, les personnes qu'on suit ; un chef de projet peut confier une tâche de son projet à n'importe qui.
  const actives = [...org.personnes.values()].filter((p) => p.actif);
  const assignables = actives.filter((p) => p.id === u.id || suitPersonne(a, p.id) || a.projetsDiriges.size > 0);
  assignables.sort((x, y) => Number(y.id === u.id) - Number(x.id === u.id) || x.nom.localeCompare(y.nom, "fr"));
  const personnes = assignables.map((p) => ({ id: p.id, nom: p.id === u.id ? "Moi" : nomComplet(p) }));

  // Indication de charge : heures pour les personnes qu'on suit, seulement le niveau pour les autres.
  const indications = await indicationsDeCharge(assignables.map((p) => p.id));
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
