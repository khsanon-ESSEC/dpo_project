import type { Metadata } from "next";
import { livrablesDuProjet } from "@/lib/donnees/livrables";
import { aujourdhui } from "@/lib/dates";
import { CalendrierMois, grilleDuMois, moisDemande, type ElementCalendrier } from "@/components/CalendrierMois";
import { chargerVueProjet, cheminVue, EnTeteVue, LIBELLE_STATUT } from "../commun";

export const metadata: Metadata = { title: "Calendrier du projet" };

export default async function PageCalendrier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mois?: string }> }) {
  const { id } = await params;
  const { mois: m } = await searchParams;
  const ctx = await chargerVueProjet(id);
  const { projet } = ctx;
  const jour = aujourdhui();
  const mois = moisDemande(m, jour);
  const { debutGrille, finGrille } = grilleDuMois(mois);
  const retour = encodeURIComponent(`${cheminVue(id, "calendrier")}`);
  const base = cheminVue(id, "calendrier");

  // Ce qui tombe chaque jour : les échéances des tâches, les livrables et les jalons du projet.
  const parJour = new Map<string, ElementCalendrier[]>();
  const ajouter = (d: string | null, e: ElementCalendrier) => {
    if (d && d >= debutGrille && d <= finGrille) parJour.set(d, [...(parJour.get(d) ?? []), e]);
  };
  for (const t of ctx.taches) {
    const etat = t.retard ? "en retard" : LIBELLE_STATUT[t.statut].toLowerCase();
    ajouter(t.echeance, {
      id: t.id,
      texte: `${t.initiales} · ${t.titre}`,
      titre: `${t.titre} — ${t.personne} — ${etat}${t.estimationHeures ? ` — ${t.estimationHeures} h` : ""}`,
      classe: t.statut === "faite" ? "puce--faite" : t.statut === "bloquee" ? "puce--bloquee" : t.retard ? "puce--retard" : "",
      lien: t.ouvrable ? `/taches/${t.id}?retour=${retour}` : null,
      statut: t.statut,
      retard: t.retard,
    });
  }
  // Les livrables, à leur date prévue.
  for (const l of (await livrablesDuProjet(id, jour)).livrables) {
    ajouter(l.prevuLe, {
      id: `livrable-${l.id}`,
      texte: `Livrable · ${l.libelle}`,
      titre: `Livrable « ${l.libelle} »${l.responsable ? ` — ${l.responsable}` : ""} — ${l.affiche === "atteint" ? "validé" : l.affiche === "pret" ? "prêt à valider" : l.enRetard ? "en retard" : `${l.compte.faites}/${l.compte.total} tâches faites`}`,
      classe: `puce--jalon${l.enRetard ? " puce--retard" : ""}`,
      lien: `/projets/${id}/livrables/${l.id}`,
    });
  }
  ajouter(projet.dateFinPrevue, { id: "fin", texte: "Fin prévue du projet", titre: "Fin prévue du projet", classe: "puce--jalon", lien: null });
  ajouter(projet.dateLancementPrevue, { id: "lancement", texte: "Lancement prévu", titre: "Lancement prévu", classe: "puce--jalon", lien: null });

  return (
    <>
      <EnTeteVue ctx={ctx} vue="calendrier" />
      <div className="page">
        <CalendrierMois
          mois={mois}
          jour={jour}
          lienMois={(x) => (x ? `${base}?mois=${x}` : base)}
          parJour={parJour}
          legende={
            <>
              <span>
                <i style={{ width: 3, height: 14, border: 0, background: "var(--arc)" }} /> Échéance
              </span>
              <span>
                <i style={{ width: 3, height: 14, border: 0, background: "var(--retard-point)" }} /> En retard
              </span>
              <span>
                <i style={{ width: 3, height: 14, border: 0, background: "var(--veille-point)" }} /> Bloquée
              </span>
              <span>
                <i style={{ width: 3, height: 14, border: 0, background: "#f4b22d" }} /> Livrable, fin ou lancement
              </span>
            </>
          }
        />
      </div>
    </>
  );
}
