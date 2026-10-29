import { EditeurRaci } from "@/components/EditeurRaci";
import { TableauRaci } from "@/components/Raci";
import { Icone } from "@/components/Icone";
import type { Raci } from "@/lib/raci";
import { adapterLeRaci, enregistrerLeRaci, revenirAuRaci } from "../actions-objectifs";

/**
 * Page Modifier : le RACI du projet. Par défaut le RACI type de la DPO (lu ici avec les noms du projet) ; « Adapter
 * pour ce projet » en fait une copie qu'on modifie ; « Revenir au RACI type » l'efface.
 */
export function SectionRaci({ projetId, raci, propre, noms, modifiable, attention }: { projetId: string; raci: Raci; propre: boolean; noms: string[]; modifiable: boolean; attention?: string }) {
  return (
    <section className="carte" id="raci" aria-labelledby="mp-raci" style={{ scrollMarginTop: 80, display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 id="mp-raci" className="carte__titre" style={{ margin: 0 }}>
        RACI · {propre ? "adapté pour ce projet" : "type de la DPO"}
      </h2>
      <p className="note" style={{ margin: 0 }}>
        Qui réalise (R), approuve (A), est consulté (C) ou informé (I) pour chaque activité. {propre ? "Ce projet a son propre tableau." : "Ce projet suit le RACI type, défini dans Organisation → RACI ; les noms viennent de l'équipe du projet."}
      </p>
      {attention ? (
        <p className="note ton-veille" role="status" style={{ margin: 0 }}>
          Enregistré. À vérifier : {attention}
        </p>
      ) : null}
      {propre && modifiable ? (
        <>
          <EditeurRaci raci={raci} action={enregistrerLeRaci.bind(null, projetId)} bouton="Enregistrer le RACI du projet" />
          <form action={revenirAuRaci.bind(null, projetId)}>
            <button type="submit" className="bouton-mini">
              Revenir au RACI type
            </button>
          </form>
        </>
      ) : (
        <>
          <TableauRaci raci={raci} noms={noms} />
          {modifiable ? (
            <form action={adapterLeRaci.bind(null, projetId)}>
              <button type="submit" className="bouton-contour">
                <Icone nom="modifier" taille={16} /> Adapter pour ce projet
              </button>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}
