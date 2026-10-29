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
          <form method="get" action="/conseil/comparer" className="carte comparatif__choix">
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
            <span className="comparatif__fleche" aria-hidden="true">
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
            <section className="comparatif" aria-label={`${nomRapport(ra)} comparé à ${nomRapport(rb)}`}>
              <div className="comparatif__tete" aria-hidden="true">
                <span className="comparatif__tete-projet">Projet</span>
                <EnteteRapport r={ra} cote="a" />
                <EnteteRapport r={rb} cote="b" />
              </div>
              {lignes.length === 0 ? <p className="vide comparatif__vide">Rien n&apos;a changé entre ces deux rapports pour les projets que vous voyez.</p> : null}
              {lignes.map((l) => (
                <article key={l.projetId} className="comparatif__ligne" aria-labelledby={`cmp-${l.projetId}`}>
                  <header className="comparatif__projet">
                    <span className="etiquette-projet">{l.code}</span>
                    <span className="rangee__texte">
                      <span className="rangee__titre" id={`cmp-${l.projetId}`}>
                        <LienProjet id={l.projetId} visible>
                          {l.titre}
                        </LienProjet>
                      </span>
                      {l.programme ? <span className="rangee__sous">{l.programme}</span> : null}
                    </span>
                    <Ecarts l={l} b={rb} />
                  </header>
                  <Cote ligne={l.a} rapport={ra} cote="a" />
                  <Cote ligne={l.b} rapport={rb} cote="b" autre={l.a} />
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

/** Le nom court d'un rapport, pour l'en-tête de sa colonne : « Septembre 2026 », ou le titre d'un rapport ponctuel. */
const nomCourt = (r: Rapport) => (r.genre === "mensuel" ? majuscule(moisAnnee(r.mois!)) : r.titre);
const etatRapport = (r: Rapport) =>
  [r.genre === "mensuel" ? "Rapport mensuel" : `Rapport ponctuel · ${dateCourte(r.date)}`, r.approuveLe ? `approuvé le ${dateCourte(dateLocale(r.approuveLe))}${r.approuvePar ? ` par ${r.approuvePar}` : ""}` : STATUT[r.statut] ?? r.statut].join(" · ");

/** L'en-tête d'une colonne : le mois (ou le rapport ponctuel), son état ; la colonne la plus récente en bleu. */
function EnteteRapport({ r, cote }: { r: Rapport; cote: "a" | "b" }) {
  return (
    <span className={`comparatif__mois comparatif__mois--${cote}`}>
      <a href={lienRapport(r)} className="comparatif__mois-nom lien-discret">
        {nomCourt(r)}
      </a>
      <span className="comparatif__mois-etat">{etatRapport(r)}</span>
    </span>
  );
}

/** Ce qui a bougé pour le projet, en clair (jamais par la couleur seule). */
function Ecarts({ l, b }: { l: LigneComparee; b: Rapport }) {
  const marques: { texte: string; ton: "veille" | "relief" | "neutre" }[] = [];
  if (!l.a) marques.push({ texte: `Ajouté en ${nomCourt(b).toLowerCase()}`, ton: "relief" });
  if (!l.b) marques.push({ texte: `Retiré en ${nomCourt(b).toLowerCase()}`, ton: "veille" });
  if (l.ecartFinJours) marques.push({ texte: `Fin ${l.ecartFinJours > 0 ? "repoussée" : "avancée"} de ${ecartTexte(l.ecartFinJours).replace(/^[+−]/, "")}`, ton: l.ecartFinJours > 0 ? "veille" : "relief" });
  else if (l.finChangee) marques.push({ texte: "Fin prévue changée", ton: "veille" });
  if (l.lancementChange) marques.push({ texte: "Lancement changé", ton: "neutre" });
  if (l.a && l.b && !l.finChangee && !l.lancementChange) marques.push({ texte: "Dates inchangées", ton: "neutre" });
  return (
    <ul className="comparatif__ecarts" aria-label="Ce qui a changé">
      {marques.map((m) => (
        <li key={m.texte} className={`comparatif__ecart comparatif__ecart--${m.ton}`}>
          {m.texte}
        </li>
      ))}
    </ul>
  );
}

/**
 * Une colonne de la comparaison pour un projet : le mois rappelé en tête (utile sur téléphone, où les colonnes
 * s'empilent), la fin prévue et le lancement, l'état d'avancement. Dans la colonne la plus récente, une date qui a
 * changé dit de combien ; un état d'avancement resté le même est dit « inchangé ».
 */
function Cote({ ligne, rapport, cote, autre }: { ligne: LigneComparable | null; rapport: Rapport; cote: "a" | "b"; autre?: LigneComparable | null }) {
  const mois = <span className="comparatif__cellule-mois">{nomCourt(rapport)}</span>;
  if (!ligne)
    return (
      <div className={`comparatif__cellule comparatif__cellule--${cote} comparatif__cellule--vide`}>
        {mois}
        <p>Pas dans ce rapport.</p>
      </div>
    );
  const ecartFin = autre?.fin && ligne.fin && autre.fin !== ligne.fin ? Math.round((Date.parse(`${ligne.fin}T12:00:00Z`) - Date.parse(`${autre.fin}T12:00:00Z`)) / 86400000) : null;
  const lancementChange = !!autre && (autre.lancement ?? "") !== (ligne.lancement ?? "");
  const memeEtat = !!autre && autre.etat.replace(/\s+/g, " ").trim() === ligne.etat.replace(/\s+/g, " ").trim();
  return (
    <div className={`comparatif__cellule comparatif__cellule--${cote}`}>
      {mois}
      <dl className="comparatif__dates">
        <div>
          <dt>Fin prévue</dt>
          <dd>
            {dateLongue(ligne.fin)}
            {ecartFin ? <span className={`comparatif__delta comparatif__delta--${ecartFin > 0 ? "veille" : "relief"}`}>{ecartTexte(ecartFin)}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Lancement</dt>
          <dd>
            {dateLongue(ligne.lancement)}
            {lancementChange ? <span className="comparatif__delta">changé</span> : null}
          </dd>
        </div>
      </dl>
      {ligne.etat ? (
        <p className={`comparatif__etat${memeEtat ? " comparatif__etat--meme" : ""}`}>
          {memeEtat ? <span className="comparatif__inchange">Inchangé · </span> : null}
          {ligne.etat}
        </p>
      ) : (
        <p className="comparatif__etat comparatif__etat--meme">État d&apos;avancement non rédigé.</p>
      )}
    </div>
  );
}
