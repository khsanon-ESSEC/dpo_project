import { peutGererProjet } from "@/lib/projets";
import { objectifsDesProjets } from "@/lib/donnees/objectifs";
import type { Metadata } from "next";
import { acces, exigerAccesConseil, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { deMois, moisAnnee } from "@/lib/dates";
import { lignesConseil, moisCourant, moisDesRapports, moisValide, obtenirOuCreerRapportConseil, rapportDuMois } from "@/lib/donnees/conseil";
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
  const courant = moisCourant();
  const mois = moisValide(moisDemande) ? moisDemande : courant;
  // Un mois passé se relit tel qu'il a été fait : on ne crée pas après coup le rapport d'un mois qui n'en a pas eu.
  const existant = mois < courant ? await rapportDuMois(mois) : null;
  const tousLesMois = [...new Set([...(await moisDesRapports()), courant])].sort();
  const precedent = [...tousLesMois].reverse().find((m) => m < mois) ?? null;
  const suivant = tousLesMois.find((m) => m > mois && m <= courant) ?? null;
  const rapportPrecedent = precedent ? await rapportDuMois(precedent) : null;
  const navigation = (rapportId?: string) => (
    <nav className="bilan-periode__nav" aria-label="Autre mois" style={{ marginBottom: 12 }}>
      {precedent ? (
        <a href={`/conseil?mois=${precedent}`} className="bouton-icone" aria-label={`Rapport ${deMois(precedent)}`} title={`Rapport ${deMois(precedent)}`}>
          <Icone nom="chevron-gauche" taille={20} />
        </a>
      ) : null}
      <span>{moisAnnee(mois).replace(/^./, (c) => c.toUpperCase())}</span>
      {suivant ? (
        <a href={`/conseil?mois=${suivant}`} className="bouton-icone" aria-label={`Rapport ${deMois(suivant)}`} title={`Rapport ${deMois(suivant)}`}>
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
          objectifs={await objectifsDesProjets(lignes.map((l) => l.projet.id))}
          visibles={visibles}
          redigeables={redigeables}
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
