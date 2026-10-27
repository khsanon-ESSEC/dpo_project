import type { Metadata } from "next";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { idsProjetsVisibles } from "@/lib/acces";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { FormulaireNouvelleTache } from "./FormulaireNouvelleTache";

export const metadata: Metadata = { title: "Nouvelle tâche" };

export default async function PageNouvelleTache() {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const org = await chargerOrganisation();
  const visibles = await idsProjetsVisibles(a);
  const projets = (await tousLesProjetsActifs()).filter((p) => visibles === "tous" || visibles.has(p.id));
  const personnes = [u.id, ...a.equipeDirecte].map((id) => ({ id, nom: id === u.id ? "Moi" : nomComplet(org.personnes.get(id)!) }));
  return (
    <>
      <Bandeau
        surtitre="Tâche"
        titre="Nouvelle tâche"
        retour={
          <a href="/semaine" className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Ma semaine
          </a>
        }
      />
      <div className="page" style={{ maxWidth: 760 }}>
        <FormulaireNouvelleTache projets={projets} personnes={personnes} />
      </div>
    </>
  );
}
