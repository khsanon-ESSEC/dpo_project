import type { Metadata } from "next";
import { acces, exigerAccesConseil, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { moisAnnee } from "@/lib/dates";
import { lignesConseil, moisCourant, obtenirOuCreerRapportConseil } from "@/lib/donnees/conseil";
import { iaDisponible } from "@/lib/ia";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ONGLETS_CONSEIL, SousOnglets } from "@/components/SousOnglets";
import { approuver } from "./actions";
import { EtapesConseil, TableauConseil } from "./TableauConseil";

export const metadata: Metadata = { title: "Rapport au conseil" };

export default async function PageConseil({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { mois: moisDemande } = await searchParams;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  exigerAccesConseil(a);
  const mois = moisDemande && /^\d{4}-\d{2}-01$/.test(moisDemande) ? moisDemande : moisCourant();
  const r = await obtenirOuCreerRapportConseil(mois);
  const visibles = await idsProjetsVisibles(a);
  // Un directeur ne voit que les projets stratégiques de sa direction ; un exécutif voit tout.
  const lignes = (await lignesConseil(r.id, r.statut)).filter((l) => visibles === "tous" || visibles.has(l.projet.id));
  const brouillon = r.statut === "brouillon";
  const changees = lignes.filter((l) => l.ligne.dateFinDernierRapport && l.ligne.nouvelleDateFin !== l.ligne.dateFinDernierRapport).length;

  return (
    <>
      <Bandeau surtitre="Rapport mensuel au conseil" titre={moisAnnee(mois).replace(/^./, (c) => c.toUpperCase())}>
        <EtapesConseil statut={r.statut} />
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_CONSEIL} courant="/conseil" label="Rapports au conseil" />
        <div className="ligne-actions">
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "12px 40px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <dd style={{ margin: 0, fontSize: 32, lineHeight: "36px", fontWeight: 200 }}>{lignes.length}</dd>
              <dt className="note">projets stratégiques</dt>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <dd className={changees ? "ton-retard" : undefined} style={{ margin: 0, fontSize: 32, lineHeight: "36px", fontWeight: 200 }}>
                {changees}
              </dd>
              <dt className="note">date{changees > 1 ? "s" : ""} changée{changees > 1 ? "s" : ""} depuis le dernier rapport</dt>
            </div>
          </dl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <a href={`/api/conseil/${mois}/word`} className={brouillon ? "bouton-contour" : "bouton-ambre"}>
              <Icone nom="telecharger" taille={18} /> Fichier Word
            </a>
            {brouillon && a.toutVoir ? (
              <form action={approuver.bind(null, r.id)}>
                <button type="submit" className="bouton-ambre">
                  Approuver le rapport
                </button>
              </form>
            ) : null}
          </div>
        </div>
        {brouillon ? (
          <p className="note">
            Les états d'avancement sont préparés à partir des fiches projet. Relisez-les : ce sont eux qui partent au conseil. Les dates suivent les fiches projet jusqu'à l'approbation.
            {a.toutVoir ? "" : " Vous voyez les projets stratégiques de votre direction ; un exécutif approuve le rapport complet."}
          </p>
        ) : (
          <p className="succes">Approuvé : dates et états sont figés. Ils serviront de « dernier rapport » le mois prochain.</p>
        )}
        <TableauConseil
          lignes={lignes}
          visibles={visibles}
          brouillon={brouillon}
          ia={iaDisponible()}
          entete={
            <>
              <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 700 }}>DIVISION PRODUCTIVITÉ ET ORGANISATION</span>
              <span style={{ fontSize: 13 }}>PROJETS TECHNOLOGIQUES STRATÉGIQUES EN COURS</span>
              <span style={{ marginTop: 8, fontSize: 13, fontWeight: 700 }}>CALENDRIER DE LIVRAISON</span>
            </>
          }
        />
      </div>
    </>
  );
}
