import type { Metadata } from "next";
import { acces, exigerAccesConseil, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, dateCourte, dateLocale, dateLongue, moisAnnee } from "@/lib/dates";
import { lignesComparables, rapportsComparables } from "@/lib/donnees/conseil";
import { comparerRapports, ecartTexte, type LigneComparable, type LigneComparee } from "@/lib/comparaison-conseil";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { LienProjet } from "@/components/Liens";
import { ONGLETS_CONSEIL, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "Comparer deux rapports au conseil" };

const UUID = /^[0-9a-f-]{36}$/;
const STATUT: Record<string, string> = { brouillon: "brouillon", approuve: "approuvé", envoye: "envoyé" };
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

type Rapport = Awaited<ReturnType<typeof rapportsComparables>>[number];
const nomRapport = (r: Rapport) => (r.genre === "mensuel" ? `${majuscule(moisAnnee(r.mois!))} · mensuel` : `${r.titre} · ${dateCourte(r.date)}`);
const dateDecrite = (r: Rapport) => (r.statut === "brouillon" ? aujourdhui() : r.approuveLe ? dateLocale(r.approuveLe) : r.date);
const lienRapport = (r: Rapport) => (r.genre === "mensuel" ? `/conseil?mois=${r.mois}` : `/conseil/ponctuels/${r.id}`);

/** Deux rapports au conseil côte à côte : les projets alignés, et ce qui a changé de l'un à l'autre. */
export default async function PageComparer({ searchParams }: { searchParams: Promise<{ a?: string; b?: string; tout?: string }> }) {
  const { a: aDemande, b: bDemande, tout } = await searchParams;
  const u = await exigerUtilisateur();
  const ac = await acces(u);
  exigerAccesConseil(ac);
  const visibles = await idsProjetsVisibles(ac);
  // Seuls les rapports que la personne peut déjà lire (un projet visible, ou qu'elle a créés) sont proposés.
  const rapports = await rapportsComparables(visibles, u.id);
  const trouver = (id?: string) => (id && UUID.test(id) ? (rapports.find((r) => r.id === id) ?? null) : null);
  // Par défaut : les deux derniers rapports mensuels (le mois en cours et le précédent).
  const mensuels = rapports.filter((r) => r.genre === "mensuel");
  let rb = trouver(bDemande) ?? mensuels[0] ?? rapports[0] ?? null;
  const avantB = (r: Rapport) => rapports.slice(rapports.indexOf(r) + 1);
  let ra = trouver(aDemande) ?? (rb ? (avantB(rb).find((r) => r.genre === rb!.genre) ?? avantB(rb)[0] ?? null) : null);
  if (ra && rb && ra.id === rb.id) ra = rapports.find((r) => r.id !== rb!.id) ?? null;
  // A est le plus ancien des deux (par l'état qu'il décrit : un brouillon décrit aujourd'hui, un rapport approuvé le
  // jour de son approbation) : B montre ce qui a changé depuis.
  if (ra && rb && dateDecrite(ra) > dateDecrite(rb)) [ra, rb] = [rb, ra];
  const [la, lb] = await Promise.all([ra ? lignesComparables(ra.id, ra.statut, visibles) : [], rb ? lignesComparables(rb.id, rb.statut, visibles) : []]);
  const c = comparerRapports(la, lb);
  const seulementChangements = tout !== "1";
  const change = (l: LigneComparee) => !l.a || !l.b || l.finChangee || l.lancementChange || l.etatChange;
  const lignes = seulementChangements ? c.lignes.filter(change) : c.lignes;
  const lienVue = (t: boolean) => `/conseil/comparer?${new URLSearchParams({ ...(ra ? { a: ra.id } : {}), ...(rb ? { b: rb.id } : {}), ...(t ? { tout: "1" } : {}) })}`;

  return (
    <>
      <Bandeau surtitre="Rapports au conseil" titre="Comparer deux rapports">
        {ra && rb ? (
          <dl className="chiffres">
            <div className={`chiffre ${c.finsRepoussees ? "chiffre--veille" : ""}`}>
              <dt>fins repoussées</dt>
              <dd>{c.finsRepoussees}</dd>
            </div>
            <div className="chiffre">
              <dt>lancements changés</dt>
              <dd>{c.lancementsChanges}</dd>
            </div>
            <div className="chiffre">
              <dt>états mis à jour</dt>
              <dd>{c.etatsChanges}</dd>
            </div>
            <div className="chiffre">
              <dt>projets ajoutés · retirés</dt>
              <dd>
                {c.seulementB}
                <small>&nbsp;· {c.seulementA}</small>
              </dd>
            </div>
          </dl>
        ) : null}
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_CONSEIL} courant="/conseil/comparer" label="Rapports au conseil" />
        {rapports.length < 2 ? (
          <p className="vide">Il faut au moins deux rapports au conseil pour les comparer.</p>
        ) : (
          <form method="get" action="/conseil/comparer" className="carte comparaison__choix">
            <div className="champ">
              <label htmlFor="cmp-a">Rapport de référence</label>
              <select id="cmp-a" name="a" defaultValue={ra?.id}>
                {rapports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {nomRapport(r)} ({STATUT[r.statut] ?? r.statut})
                  </option>
                ))}
              </select>
            </div>
            <span className="comparaison__fleche" aria-hidden="true">
              <Icone nom="fleche-droite" taille={20} />
            </span>
            <div className="champ">
              <label htmlFor="cmp-b">Comparé à</label>
              <select id="cmp-b" name="b" defaultValue={rb?.id}>
                {rapports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {nomRapport(r)} ({STATUT[r.statut] ?? r.statut})
                  </option>
                ))}
              </select>
            </div>
            {tout === "1" ? <input type="hidden" name="tout" value="1" /> : null}
            <button type="submit" className="bouton-ambre">
              Comparer
            </button>
          </form>
        )}
        {ra && rb ? (
          <>
            <div className="ligne-actions">
              <nav className="filtres" aria-label="Projets montrés">
                <a className="filtre" href={lienVue(false)} aria-current={seulementChangements ? "true" : undefined}>
                  Ce qui a changé · {c.lignes.filter(change).length}
                </a>
                <a className="filtre" href={lienVue(true)} aria-current={!seulementChangements ? "true" : undefined}>
                  Tous les projets · {c.lignes.length}
                </a>
              </nav>
            </div>
            <section className="comparaison" aria-label={`${nomRapport(ra)} comparé à ${nomRapport(rb)}`}>
              <div className="comparaison__entete" aria-hidden="true">
                <span />
                <EnteteRapport r={ra} lettre="A" />
                <EnteteRapport r={rb} lettre="B" />
              </div>
              {lignes.length === 0 ? <p className="vide">Rien n&apos;a changé entre ces deux rapports pour les projets que vous voyez.</p> : null}
              {lignes.map((l) => (
                <article key={l.projetId} className="comparaison__ligne">
                  <header className="comparaison__projet">
                    <span className="etiquette-projet">{l.code}</span>
                    <span className="rangee__texte">
                      <span className="rangee__titre">
                        <LienProjet id={l.projetId} visible>
                          {l.titre}
                        </LienProjet>
                      </span>
                      {l.programme ? <span className="rangee__sous">{l.programme}</span> : null}
                    </span>
                    <span className="comparaison__marques">
                      {!l.a ? <span className="marque-modele marque-modele--relief">Ajouté</span> : null}
                      {!l.b ? <span className="marque-modele marque-modele--ambre">Retiré</span> : null}
                      {l.ecartFinJours ? (
                        <span className={`marque-modele ${l.ecartFinJours > 0 ? "marque-modele--ambre" : "marque-modele--relief"}`}>
                          Fin {l.ecartFinJours > 0 ? "repoussée" : "avancée"} {ecartTexte(l.ecartFinJours)}
                        </span>
                      ) : l.finChangee ? (
                        <span className="marque-modele marque-modele--ambre">Fin changée</span>
                      ) : null}
                      {l.lancementChange ? <span className="marque-modele">Lancement changé</span> : null}
                    </span>
                  </header>
                  <Cote ligne={l.a} lettre="A" />
                  <Cote ligne={l.b} lettre="B" autre={l.a} />
                </article>
              ))}
            </section>
            <p className="note">
              Les dates d&apos;un rapport approuvé sont celles parties au conseil ; celles d&apos;un brouillon suivent les fiches des projets. Seuls les projets que vous voyez sont comparés.
            </p>
          </>
        ) : null}
      </div>
    </>
  );
}

function EnteteRapport({ r, lettre }: { r: Rapport; lettre: string }) {
  return (
    <span className="comparaison__rapport">
      <span className="comparaison__lettre">{lettre}</span>
      <span className="rangee__texte">
        <a href={lienRapport(r)} className="rangee__titre lien-discret">
          {nomRapport(r)}
        </a>
        <span className="rangee__sous">
          {r.approuveLe ? `Approuvé le ${dateCourte(dateLocale(r.approuveLe))}` : majuscule(STATUT[r.statut] ?? r.statut)}
          {r.approuvePar ? ` par ${r.approuvePar}` : ""}
        </span>
      </span>
    </span>
  );
}

/** Un côté de la comparaison : fin prévue, lancement et état d'avancement ; ce qui diffère de A est marqué. */
function Cote({ ligne, lettre, autre }: { ligne: LigneComparable | null; lettre: string; autre?: LigneComparable | null }) {
  if (!ligne) return <div className="comparaison__cote comparaison__cote--vide">Pas dans le rapport {lettre}.</div>;
  const diff = (k: "fin" | "lancement" | "etat") => !!autre && (autre[k] ?? "").trim() !== (ligne[k] ?? "").trim();
  return (
    <div className="comparaison__cote">
      <span className="comparaison__lettre comparaison__lettre--petite" aria-hidden="true">
        {lettre}
      </span>
      <dl className="comparaison__dates">
        <div data-change={diff("fin") ? "1" : undefined}>
          <dt>Fin prévue</dt>
          <dd>{dateLongue(ligne.fin)}</dd>
        </div>
        <div data-change={diff("lancement") ? "1" : undefined}>
          <dt>Lancement</dt>
          <dd>{dateLongue(ligne.lancement)}</dd>
        </div>
      </dl>
      <p className="comparaison__etat" data-change={diff("etat") ? "1" : undefined}>
        {ligne.etat || <span className="ton-discret">État d&apos;avancement non rédigé.</span>}
      </p>
    </div>
  );
}
