import type { Metadata } from "next";
import { CodeProjet, LienProjet } from "@/components/Liens";
import { exigerUtilisateur } from "@/lib/auth/session";
import { rechercher } from "@/lib/donnees/recherche";
import { Bandeau } from "@/components/Bandeau";

export const metadata: Metadata = { title: "Rechercher" };

/** Une seule case : personnes, projets et tâches que l'on a le droit de voir. Touche « / » pour y venir. */
export default async function PageRecherche({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await exigerUtilisateur();
  const q = String((await searchParams).q ?? "").trim().slice(0, 100);
  const r = q ? await rechercher(u, q) : null;
  const total = r ? r.ecrans.total + r.personnes.total + r.projets.total + r.taches.total : 0;
  const groupe = (titre: string, id: string, n: number, contenu: React.ReactNode) =>
    n ? (
      <section className="carte carte--liste" aria-labelledby={id}>
        <h2 id={id} className="carte__titre">
          {titre} · {n}
        </h2>
        <ul className="liste">{contenu}</ul>
        {n > 20 ? <p className="note" style={{ margin: "8px 0 0" }}>Les 20 premiers : précisez la recherche pour voir les autres.</p> : null}
      </section>
    ) : null;

  return (
    <>
      <Bandeau surtitre="Chercher, ou ajouter une tâche" titre="Rechercher" />
      <div className="page">
        {q && !r ? <p className="note">Tapez au moins deux lettres.</p> : null}
        {r && !total ? <p className="vide">Rien trouvé pour « {q} ». Essayez un autre mot, ou une partie du nom.</p> : null}
        {r ? (
          <div className="cartes-en-grille">
            {groupe(
              "Aller à",
              "rq-ecrans",
              r.ecrans.total,
              r.ecrans.liste.map((e) => (
                <li key={e.lien}>
                  <a href={e.lien} className="rangee">
                    {e.code ? (
                      <span className="mono" aria-hidden="true">
                        {e.code}
                      </span>
                    ) : null}
                    <span className="rangee__texte">
                      <span className="rangee__titre">{e.texte}</span>
                      <span className="rangee__sous">{e.sous}</span>
                    </span>
                  </a>
                </li>
              )),
            )}
            {groupe(
              "Projets",
              "rq-projets",
              r.projets.total,
              r.projets.liste.map((p) => (
                <li key={p.id}>
                  <a href={`/projets/${p.id}`} className="rangee">
                    <span className="mono" aria-hidden="true">
                      {p.code}
                    </span>
                    <span className="rangee__texte">
                      <span className="rangee__titre">{p.texte}</span>
                      {p.sous ? <span className="rangee__sous">{p.sous}</span> : null}
                    </span>
                  </a>
                </li>
              )),
            )}
            {groupe(
              "Tâches",
              "rq-taches",
              r.taches.total,
              r.taches.liste.map((t) => (
                <li key={t.id}>
                  <div className="rangee rangee--etiree">
                    {t.code ? <CodeProjet id={t.projetId} code={t.code} titre={t.projetTitre} visible={t.projetVisible} mono /> : null}
                    <span className="rangee__texte">
                      <a href={`/taches/${t.id}`} className="rangee__titre rangee__lien" style={t.statut === "faite" ? { textDecoration: "line-through", color: "var(--discret)" } : undefined}>
                        {t.texte}
                      </a>
                      <span className="rangee__sous">
                        {t.projetId && t.projetTitre ? (
                          <>
                            <LienProjet id={t.projetId} visible={t.projetVisible}>
                              {t.projetTitre}
                            </LienProjet>
                            {t.sous ? ` · ${t.sous}` : ""}
                          </>
                        ) : (
                          [t.sous, t.projetId ? null : "Hors projet"].filter(Boolean).join(" · ")
                        )}
                      </span>
                    </span>
                  </div>
                </li>
              )),
            )}
            {groupe(
              "Personnes",
              "rq-personnes",
              r.personnes.total,
              r.personnes.liste.map((p) => (
                <li key={p.id}>
                  <a href={`/personnes/${p.id}`} className="rangee">
                    <span className="rangee__texte">
                      <span className="rangee__titre">{p.texte}</span>
                      {p.sous ? <span className="rangee__sous">{p.sous}</span> : null}
                    </span>
                  </a>
                </li>
              )),
            )}
          </div>
        ) : !q ? (
          <div className="note" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Une seule barre pour chercher et pour ajouter : écrivez « Relire maquettes », tapez / pour choisir un projet, @ pour une personne, puis Entrée. # affiche vos tâches ouvertes.</span>
            <span>Depuis n&apos;importe quelle page, la touche « / » ouvre cette barre.</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
