import type { Metadata } from "next";
import { peutModifierTache } from "@/lib/acces";
import { aujourdhui, echeanceRelative } from "@/lib/dates";
import { chargerVueProjet, cheminVue, EnTeteVue } from "../commun";
import { Tableau, type CarteTableau } from "./Tableau";

export const metadata: Metadata = { title: "Tableau du projet" };

export default async function PageTableau({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pour?: string }> }) {
  const { id } = await params;
  const { pour } = await searchParams;
  const ctx = await chargerVueProjet(id);
  const jour = aujourdhui();
  const retour = cheminVue(id, "tableau");
  const personnes = [...new Map(ctx.taches.map((t) => [t.assigneId, t.personne])).entries()].sort((x, y) => x[1].localeCompare(y[1], "fr"));
  const taches = pour ? ctx.taches.filter((t) => t.assigneId === pour) : ctx.taches;
  const cartes: CarteTableau[] = taches.map((t) => {
    const e = echeanceRelative(t.echeance, jour);
    return {
      id: t.id,
      titre: t.titre,
      statut: t.statut,
      personne: t.personne,
      initiales: t.initiales,
      echeanceTexte: t.statut === "faite" ? "Faite" : e.texte || "Sans échéance",
      retard: t.retard,
      estimation: t.estimationHeures,
      blocage: t.blocage,
      modifiable: peutModifierTache(ctx.a, t),
      lien: t.ouvrable ? `/taches/${t.id}?retour=${encodeURIComponent(retour)}` : null,
    };
  });

  return (
    <>
      <EnTeteVue ctx={ctx} vue="tableau" />
      <div className="page">
        <nav className="filtres" aria-label="Filtrer par personne">
          <a className="filtre" href={retour} aria-current={!pour ? "true" : undefined}>
            Toute l&apos;équipe · {ctx.taches.length}
          </a>
          {personnes.map(([pid, nom]) => (
            <a key={pid} className="filtre" href={`${retour}?pour=${pid}`} aria-current={pour === pid ? "true" : undefined}>
              {nom.split(" ")[0]} · {ctx.taches.filter((t) => t.assigneId === pid).length}
            </a>
          ))}
        </nav>
        <Tableau key={pour ?? "tous"} cartes={cartes} retour={retour} />
        <p className="note">Glissez une carte vers une autre colonne, ou changez son état dans sa liste. Pour une tâche bloquée, la fiche s&apos;ouvre : dites ce qui bloque.</p>
      </div>
    </>
  );
}
