import { peutGererProjet } from "@/lib/projets";
import { objectifsDesProjets } from "@/lib/donnees/objectifs";
import type { Metadata } from "next";
import { acces, exigerAccesConseil, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, dateLocale, dateLongue, deMois, moisAnnee } from "@/lib/dates";
import type { ApercuConseil } from "@/lib/presentation-conseil";
import { calendrierConseil, moisDuConseil } from "@/lib/calendrier-conseil";
import { lignesConseil, moisCourant, moisDesRapports, moisValide, obtenirOuCreerRapportConseil, rapportDuMois } from "@/lib/donnees/conseil";
import { iaDisponible } from "@/lib/ia";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ONGLETS_CONSEIL, SousOnglets } from "@/components/SousOnglets";
import { approuver } from "./actions";
import { EtapesConseil, TableauConseil } from "./TableauConseil";
import { PresentationConseil } from "./PresentationConseil";
import { apercusDuJour } from "@/lib/donnees/presentation-conseil";
import { BoutonImprimer } from "../rapports/[id]/Repondre";

export const metadata: Metadata = { title: "Rapport au conseil" };

export default async function PageConseil({ searchParams }: { searchParams: Promise<{ mois?: string; vue?: string }> }) {
  const { mois: moisDemande, vue: vueDemandee } = await searchParams;
  // Deux présentations des mêmes lignes (29 octobre 2026) : le rapport tel qu'il part au conseil (par défaut, identique à
  // ce qui s'imprime), et le tableau de relecture, où l'on corrige les états d'avancement (et d'où sort le fichier Word).
  const vue = vueDemandee === "tableau" ? "tableau" : "presentation";
  const u = await exigerUtilisateur();
  const a = await acces(u);
  exigerAccesConseil(a);
  // Après le dernier jeudi du mois, le rapport du mois est parti : les chefs préparent celui du mois suivant, qu'on
  // peut ouvrir d'ici (29 octobre 2026).
  const enPreparation = moisDuConseil(aujourdhui());
  const courant = moisCourant();
  const mois = moisValide(moisDemande) ? moisDemande : courant;
  // Un mois passé se relit tel qu'il a été fait : on ne crée pas après coup le rapport d'un mois qui n'en a pas eu.
  const existant = mois < courant ? await rapportDuMois(mois) : null;
  const tousLesMois = [...new Set([...(await moisDesRapports()), courant, enPreparation])].sort();
  const precedent = [...tousLesMois].reverse().find((m) => m < mois) ?? null;
  const suivant = tousLesMois.find((m) => m > mois && m <= enPreparation) ?? null;
  const rapportPrecedent = precedent ? await rapportDuMois(precedent) : null;
  const navigation = (rapportId?: string) => (
    <nav className="bilan-periode__nav" aria-label="Autre mois" style={{ marginBottom: 12 }}>
      {precedent ? (
        <a href={`/conseil?mois=${precedent}${vue === "tableau" ? "&vue=tableau" : ""}`} className="bouton-icone" aria-label={`Rapport ${deMois(precedent)}`} title={`Rapport ${deMois(precedent)}`}>
          <Icone nom="chevron-gauche" taille={20} />
        </a>
      ) : null}
      <span>{moisAnnee(mois).replace(/^./, (c) => c.toUpperCase())}</span>
      {suivant ? (
        <a href={`/conseil?mois=${suivant}${vue === "tableau" ? "&vue=tableau" : ""}`} className="bouton-icone" aria-label={`Rapport ${deMois(suivant)}`} title={`Rapport ${deMois(suivant)}`}>
          <Icone nom="chevron-droite" taille={20} />
        </a>
      ) : null}
      <a href="/conseil/historique" className="lien-discret" style={{ marginLeft: 12 }}>
        Tous les rapports soumis →
      </a>
      {rapportId && rapportPrecedent ? (
        <a href={`/conseil/comparer?a=${rapportPrecedent.id}&b=${rapportId}`} className="lien-discret" style={{ marginLeft: 12 }}>
          Comparer avec {moisAnnee(precedent!)} →
        </a>
      ) : null}
    </nav>
  );
  if (mois < courant && !existant) {
    return (
      <>
        <Bandeau surtitre="Rapport mensuel au conseil" titre={moisAnnee(mois).replace(/^./, (c) => c.toUpperCase())} />
        <div className="page">
          <SousOnglets onglets={ONGLETS_CONSEIL} courant="/conseil" label="Rapports au conseil" />
          {navigation()}
          <p className="vide">Aucun rapport au conseil n&apos;a été fait pour ce mois.</p>
        </div>
      </>
    );
  }
  const r = existant ?? (await obtenirOuCreerRapportConseil(mois));
  const visibles = await idsProjetsVisibles(a);
  // Un directeur ne voit que les projets stratégiques de sa direction ; un exécutif voit tout.
  const lignes = (await lignesConseil(r.id, r.statut)).filter((l) => visibles === "tous" || visibles.has(l.projet.id));
  const brouillon = r.statut === "brouillon";
  const acteur = { moiId: a.moi.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis };
  const redigeables = new Set(lignes.filter((l) => peutGererProjet(acteur, l.projet)).map((l) => l.projet.id));
  const changees = lignes.filter((l) => l.ligne.dateFinDernierRapport && l.ligne.nouvelleDateFin !== l.ligne.dateFinDernierRapport).length;
  // Écrits par leur chef de projet (sur la fiche du projet), et le calendrier du mois (29 octobre 2026).
  const parLeChef = lignes.filter((l) => l.ligne.source === "chef").length;
  const cal = calendrierConseil(mois);
  // L'« aujourd'hui » du rapport tel qu'il est parti : le jour de son approbation (sinon, aujourd'hui).
  const jourDuRapport = r.approuveLe ? dateLocale(r.approuveLe) : aujourdhui();

  return (
    <>
      <Bandeau surtitre="Rapport mensuel au conseil" titre={moisAnnee(mois).replace(/^./, (c) => c.toUpperCase())}>
        <EtapesConseil statut={r.statut} />
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_CONSEIL} courant="/conseil" label="Rapports au conseil" />
        {navigation(r.id)}
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
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <dd className={brouillon && parLeChef < lignes.length ? "ton-veille" : undefined} style={{ margin: 0, fontSize: 32, lineHeight: "36px", fontWeight: 200 }}>
                {parLeChef}/{lignes.length}
              </dd>
              <dt className="note">états d&apos;avancement écrits par le chef de projet</dt>
            </div>
          </dl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {vue === "presentation" ? (
              <BoutonImprimer />
            ) : (
              <a href={`/api/conseil/${mois}/word`} className="bouton-contour">
                <Icone nom="telecharger" taille={18} /> Fichier Word (tableau)
              </a>
            )}
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
            Chaque chef de projet écrit l'état d'avancement de son projet sur la fiche du projet, jusqu'au {dateLongue(cal.limiteChefs)} au soir ; à défaut, le rapport garde un texte automatique. Relisez-les et corrigez au besoin (votre version l'emporte) : ce sont eux qui partent au conseil, avant le {dateLongue(cal.dernierJeudi)}. Les dates suivent les fiches projet jusqu'à l'approbation.
            {a.toutVoir ? "" : " Vous voyez les projets stratégiques de votre direction ; un exécutif approuve le rapport complet."}
          </p>
        ) : (
          <p className="succes">Approuvé : dates et états sont figés. Ils serviront de « dernier rapport » le mois prochain.</p>
        )}
        <nav className="vues" aria-label="Présentation du rapport">
          <a href={`/conseil?mois=${mois}`} aria-current={vue === "presentation" ? "page" : undefined}>
            <Icone nom="tableau-de-bord" taille={16} />
            Rapport pour le conseil
          </a>
          <a href={`/conseil?mois=${mois}&vue=tableau`} aria-current={vue === "tableau" ? "page" : undefined}>
            <Icone nom="liste" taille={16} />
            Tableau de relecture
          </a>
        </nav>
        {vue === "presentation" ? (
          <>
            <p className="note" style={{ margin: 0 }}>
              Le rapport tel qu&apos;il part au conseil : ce qui s&apos;affiche ici est ce qui s&apos;imprime (Legal, 8,5 × 14 po, à l&apos;italienne). Les projets vont du plus préoccupant au moins préoccupant. Pour corriger un état d&apos;avancement : le{" "}
              <a href={`/conseil?mois=${mois}&vue=tableau`} className="lien-discret">
                tableau de relecture
              </a>
              .
            </p>
            {!brouillon && lignes.some((l) => !l.ligne.apercu) ? (
              <p className="note" style={{ margin: 0 }}>
                Ce rapport a été approuvé avant que la santé, les livrables et les risques soient figés avec lui : ils sont montrés tels qu&apos;ils sont aujourd&apos;hui.
              </p>
            ) : null}
            <div className="zone-impression">
              <PresentationConseil lignes={lignes} objectifs={await objectifsDesProjets(lignes.map((l) => l.projet.id))} apercus={await apercusDuRapport(lignes)} mois={mois} jour={jourDuRapport} />
            </div>
          </>
        ) : (
        <TableauConseil
          lignes={lignes}
          objectifs={await objectifsDesProjets(lignes.map((l) => l.projet.id))}
          visibles={visibles}
          redigeables={redigeables}
          mensuel
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
        )}
      </div>
    </>
  );
}

/** Santé, livrables et risque critique de chaque ligne : figés à l'approbation, sinon ceux du jour. */
async function apercusDuRapport(lignes: { ligne: { projetId: string; apercu: ApercuConseil | null }; projet: { id: string } }[]) {
  const manquants = lignes.filter((l) => !l.ligne.apercu).map((l) => l.projet.id);
  const du = await apercusDuJour(manquants);
  return new Map(lignes.map((l) => [l.projet.id, l.ligne.apercu ?? du.get(l.projet.id)!]).filter((x): x is [string, ApercuConseil] => !!x[1]));
}
