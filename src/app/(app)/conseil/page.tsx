import { peutGererProjet } from "@/lib/projets";
import { objectifsDesProjets } from "@/lib/donnees/objectifs";
import type { Metadata } from "next";
import { acces, exigerAccesConseil, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, dateLongue, deMois, moisAnnee } from "@/lib/dates";
import { calendrierConseil, moisDuConseil } from "@/lib/calendrier-conseil";
import { lignesConseil, moisCourant, moisDesRapports, moisValide, obtenirOuCreerRapportConseil, rapportDuMois } from "@/lib/donnees/conseil";
import { iaDisponible } from "@/lib/ia";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ONGLETS_CONSEIL, SousOnglets } from "@/components/SousOnglets";
import { approuver } from "./actions";
import { EtapesConseil, TableauConseil } from "./TableauConseil";
import { PresentationConseil, type LivrablesProjet } from "./PresentationConseil";
import { livrablesDe } from "@/lib/donnees/livrables";

export const metadata: Metadata = { title: "Rapport au conseil" };

export default async function PageConseil({ searchParams }: { searchParams: Promise<{ mois?: string; vue?: string }> }) {
  const { mois: moisDemande, vue: vueDemandee } = await searchParams;
  // Deux présentations des mêmes lignes, à comparer (29 octobre 2026) : le tableau habituel, et la présentation proposée.
  const vue = vueDemandee === "presentation" ? "presentation" : "tableau";
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
        <a href={`/conseil?mois=${precedent}${vue === "presentation" ? "&vue=presentation" : ""}`} className="bouton-icone" aria-label={`Rapport ${deMois(precedent)}`} title={`Rapport ${deMois(precedent)}`}>
          <Icone nom="chevron-gauche" taille={20} />
        </a>
      ) : null}
      <span>{moisAnnee(mois).replace(/^./, (c) => c.toUpperCase())}</span>
      {suivant ? (
        <a href={`/conseil?mois=${suivant}${vue === "presentation" ? "&vue=presentation" : ""}`} className="bouton-icone" aria-label={`Rapport ${deMois(suivant)}`} title={`Rapport ${deMois(suivant)}`}>
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
            Chaque chef de projet écrit l'état d'avancement de son projet sur la fiche du projet, jusqu'au {dateLongue(cal.limiteChefs)} au soir ; à défaut, le rapport garde un texte automatique. Relisez-les et corrigez au besoin (votre version l'emporte) : ce sont eux qui partent au conseil, avant le {dateLongue(cal.dernierJeudi)}. Les dates suivent les fiches projet jusqu'à l'approbation.
            {a.toutVoir ? "" : " Vous voyez les projets stratégiques de votre direction ; un exécutif approuve le rapport complet."}
          </p>
        ) : (
          <p className="succes">Approuvé : dates et états sont figés. Ils serviront de « dernier rapport » le mois prochain.</p>
        )}
        <nav className="vues" aria-label="Présentation du rapport">
          <a href={`/conseil?mois=${mois}`} aria-current={vue === "tableau" ? "page" : undefined}>
            <Icone nom="liste" taille={16} />
            Tableau habituel
          </a>
          <a href={`/conseil?mois=${mois}&vue=presentation`} aria-current={vue === "presentation" ? "page" : undefined}>
            <Icone nom="tableau-de-bord" taille={16} />
            Présentation proposée
          </a>
        </nav>
        {vue === "presentation" ? (
          <>
            <p className="note" style={{ margin: 0 }}>
              Proposition à comparer avec le tableau habituel : les mêmes lignes, lues d&apos;un coup d&apos;œil. L&apos;état d&apos;avancement se corrige dans le tableau ; le fichier Word garde le format du tableau.
            </p>
            <PresentationConseil lignes={lignes} objectifs={await objectifsDesProjets(lignes.map((l) => l.projet.id))} livrables={await livrablesParProjet(lignes.map((l) => l.projet.id))} mois={mois} jour={aujourdhui()} visibles={visibles} />
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

/** Pour la présentation : livrables validés sur le total, et le prochain à venir (le plus proche non validé). */
async function livrablesParProjet(ids: string[]): Promise<Map<string, LivrablesProjet>> {
  const { livrables } = await livrablesDe(ids);
  const m = new Map<string, LivrablesProjet>();
  for (const id of ids) {
    const siens = livrables.filter((l) => l.projetId === id);
    const ouverts = siens.filter((l) => l.etat !== "atteint").sort((a, b) => (a.prevuLe ?? "9999").localeCompare(b.prevuLe ?? "9999"));
    const p = ouverts[0];
    m.set(id, { valides: siens.length - ouverts.length, total: siens.length, prochain: p ? { libelle: p.libelle, prevuLe: p.prevuLe, enRetard: p.enRetard } : null });
  }
  return m;
}
