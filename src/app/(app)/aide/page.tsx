import type { Metadata } from "next";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aDesMotsUtiles, FICHES, THEMES, trouverFiches } from "@/lib/guide";
import { noterQuestionSansReponse, permisDuGuide } from "@/lib/donnees/guide";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";

export const metadata: Metadata = { title: "Guide" };

/**
 * Le guide de l'application (29 octobre 2026) : toutes les fiches que la personne a le droit de voir, rangées par
 * thème, et la réponse à une question (« ?q= », depuis la barre). Une question sans réponse est gardée, sans nom.
 */
export default async function PageAide({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await exigerUtilisateur();
  const permis = await permisDuGuide(u);
  const q = String((await searchParams).q ?? "").slice(0, 200).trim();
  // « aide » ou « comment ? » seuls ne cherchent rien : le guide entier, sans réponse à afficher ni à garder.
  const cherche = !!q && aDesMotsUtiles(q);
  const resultats = cherche ? trouverFiches(q, { permis }, 8) : [];
  if (cherche && !resultats.length) await noterQuestionSansReponse(q, "aide");
  const visibles = FICHES.filter((f) => permis(f.permis));

  const ligne = (f: (typeof FICHES)[number]) => (
    <li key={f.id}>
      <a href={`/aide/${f.id}`} className="rangee">
        <span className="mono" aria-hidden="true">
          <Icone nom="aide" taille={16} />
        </span>
        <span className="rangee__texte">
          <span className="rangee__titre">{f.titre}</span>
          <span className="rangee__sous">{f.resume}</span>
        </span>
      </a>
    </li>
  );

  return (
    <>
      <Bandeau surtitre="Aide" titre="Guide de l'application">
        <p className="discret" style={{ margin: "8px 0 0", fontSize: 14, lineHeight: "21px", maxWidth: 640 }}>
          Des fiches courtes pour faire ce qu&apos;il faut dans l&apos;application. Dans la barre du haut, une question qui commence par « comment », « où » ou « pourquoi » y mène directement.
        </p>
      </Bandeau>
      <div className="page">
        <form action="/aide" method="get" className="guide-recherche" role="search">
          <div className="champ">
            <label htmlFor="guide-q">Votre question</label>
            <input id="guide-q" name="q" type="search" defaultValue={q} placeholder="Ex. : comment envoyer mon rapport ?" maxLength={200} autoComplete="off" />
          </div>
          <button type="submit" className="bouton-contour" style={{ height: 48 }}>
            <Icone nom="loupe" taille={16} /> Chercher
          </button>
        </form>

        {cherche ? (
          <section className="carte carte--liste" aria-labelledby="guide-reponses">
            <h2 id="guide-reponses" className="carte__titre">
              Réponses à « {q} »{resultats.length ? ` · ${resultats.length}` : ""}
            </h2>
            {resultats.length ? (
              <ul className="liste">{resultats.map((r) => ligne(r.fiche))}</ul>
            ) : (
              <p className="vide">
                Aucune fiche ne répond encore à cette question. Elle est gardée, sans votre nom, pour enrichir le guide. Parcourez les fiches ci-dessous, ou posez-la à votre chef d&apos;équipe.
              </p>
            )}
          </section>
        ) : null}

        <div className="cartes-en-grille">
          {THEMES.map((t) => {
            const fiches = visibles.filter((f) => f.theme === t);
            if (!fiches.length) return null;
            const cle = t.replace(/[^\p{L}]+/gu, "-").toLowerCase();
            return (
              <section key={t} className="carte carte--liste" aria-labelledby={`guide-${cle}`}>
                <h2 id={`guide-${cle}`} className="carte__titre">
                  {t} · {fiches.length}
                </h2>
                <ul className="liste">{fiches.map(ligne)}</ul>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
