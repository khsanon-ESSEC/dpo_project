import { ListeFiltrable } from "@/components/ListeFiltrable";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { vueOrganisation } from "@/lib/donnees/organisation";
import { peutAdministrer } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ONGLETS_ORGANISATION, SousOnglets } from "@/components/SousOnglets";
import { changerChefEquipe } from "./actions";
import { FicheExterne, FichePersonne, NouvellePersonne } from "./Formulaires";

export const metadata: Metadata = { title: "Organisation" };

const COURT: Record<string, string> = { "Chef d'équipe": "ÉQ", "Chef de projet": "CP", Directeur: "DIR", Exécutif: "EXE", Administrateur: "ADM" };

const ERREURS: Record<string, string> = {
  suivi: "Responsable non changé : ce choix vous ferait suivre le travail d'autres personnes. Demandez-le à un exécutif.",
  chef: "Responsable non changé : choisissez une personne active de la division.",
};

export default async function PageOrganisation({ searchParams }: { searchParams: Promise<{ p?: string; nouvelle?: string; erreur?: string }> }) {
  const { p: selId, nouvelle, erreur } = await searchParams;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const admin = peutAdministrer(u);
  if (!admin && !a.toutVoir) notFound();
  const o = await vueOrganisation();
  const sel = o.personnes.find((p) => p.id === selId) ?? null;
  const selExterne = sel ? null : (o.externes.find((p) => p.id === selId) ?? null);
  const equipesOptions = o.equipes.map((e) => ({ id: e.id, nom: e.nom }));
  const personnesOptions = o.personnes.filter((p) => p.actif).map((p) => ({ id: p.id, nom: p.nomComplet }));
  const rolesDe = (id: string) => o.personnes.find((p) => p.id === id)?.roles ?? [];

  const Ligne = ({ p, chef }: { p: (typeof o.personnes)[number] | (typeof o.equipes)[number]["membres"][number]; chef?: boolean }) => (
    <li style={{ borderTop: 0 }}>
      <a href={`/organisation?p=${p.id}`} className="rangee rangee--choix" aria-current={sel?.id === p.id ? "true" : undefined} style={{ minHeight: 52, padding: "8px 10px", margin: "0 -10px", opacity: p.actif ? 1 : 0.5 }}>
        <span className={`mono${chef ? " mono--fort" : ""}`} aria-hidden="true">
          {p.initiales}
        </span>
        <span className="rangee__texte">
          <span className="rangee__titre" style={{ fontSize: 14, fontWeight: chef ? 500 : 400 }}>
            {p.nomComplet}
          </span>
          <span className="rangee__sous">
            {p.poste}
            {p.actif ? "" : " · désactivé"}
          </span>
        </span>
        <span style={{ display: "flex", gap: 4, flex: "none" }}>
          {rolesDe(p.id).map((r) => (
            <span key={r} title={r} className={`marque-role marque-role--${COURT[r]}`}>
              {COURT[r]}
            </span>
          ))}
        </span>
      </a>
    </li>
  );

  return (
    <>
      <Bandeau surtitre="Division Projets Organisationnels" titre="Organisation">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>personnes</dt>
            <dd>{o.total}</dd>
          </div>
          <div className="chiffre">
            <dt>équipes</dt>
            <dd>{o.equipes.length}</dd>
          </div>
          <div className={`chiffre ${o.vacants ? "chiffre--veille" : ""}`}>
            <dt>poste{o.vacants > 1 ? "s" : ""} vacant{o.vacants > 1 ? "s" : ""}</dt>
            <dd>{o.vacants}</dd>
          </div>
          <div className="chiffre">
            <dt>administrateurs</dt>
            <dd>{o.administrateurs}</dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        {admin ? <SousOnglets onglets={ONGLETS_ORGANISATION} courant="/organisation" label="Organisation" /> : null}
        {admin && erreur && ERREURS[erreur] ? (
          <p className="erreur" role="alert">
            {ERREURS[erreur]}
          </p>
        ) : null}
        {admin ? (
          <div className="ligne-actions">
            <p className="note">
              Rôles cumulables. Chef d'équipe et chef de projet viennent des faits. Directeur : voit sa direction. Exécutif : voit tout. Administrateur : gère l'organisation, sans rien voir de plus.
            </p>
            <a href="/organisation?nouvelle=1" className="bouton-contour">
              <Icone nom="ajouter" taille={16} /> Nouvelle personne
            </a>
          </div>
        ) : (
          <p className="note">Lecture seule : seuls les administrateurs modifient l'organisation.</p>
        )}
        <div className="colonnes">
          <div className="colonne-large" style={{ gap: 16 }}>
            <div className="grille-projets" style={{ gap: 16 }}>
              {o.equipes.map((e, i) => (
                <section key={e.id} className="carte carte--liste apparition survol" style={{ flex: "1 1 280px", padding: "20px 20px 8px", animationDelay: `${80 + i * 60}ms` }} aria-labelledby={`eq-${e.id}`}>
                  <h2 id={`eq-${e.id}`} className="carte__titre" style={{ marginBottom: 12 }}>
                    {e.nom} · {e.membres.length + (e.chef ? 1 : 0)}
                  </h2>
                  {!e.chef ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", marginBottom: 4, border: "1px dashed var(--veille-point)" }}>
                      <span aria-hidden="true" style={{ width: 32, height: 32, flex: "none", border: "1px dashed var(--veille-point)" }} />
                      <span className="rangee__texte">
                        <span className="ton-veille" style={{ fontSize: 14 }}>
                          Responsable · poste vacant
                        </span>
                        <span className="rangee__sous">Les rapports remontent au niveau suivant</span>
                      </span>
                    </div>
                  ) : null}
                  <ul className="liste">
                    {e.chef ? <Ligne p={e.chef} chef /> : null}
                    {e.membres.map((m) => (
                      <Ligne key={m.id} p={m} />
                    ))}
                  </ul>
                  {admin ? (
                    <details style={{ marginTop: 8, paddingBottom: 8 }}>
                      <summary className="lien-discret" style={{ cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center" }}>
                        Changer le responsable
                      </summary>
                      <form key={`${e.id}-${e.chefId ?? ""}`} action={changerChefEquipe.bind(null, e.id)} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <label className="visuellement-cache" htmlFor={`chef-${e.id}`}>
                          Responsable de {e.nom}
                        </label>
                        <ListeFiltrable id={`chef-${e.id}`} name="chefId" defaultValue={e.chefId ?? ""} vide="Poste vacant" placeholder="Tapez un nom" options={personnesOptions.map((p) => ({ value: p.id, label: p.nom }))} aucun="Personne ne correspond à" className="liste-filtrable--ligne" />
                        <button type="submit" className="bouton-contour">
                          Changer
                        </button>
                      </form>
                    </details>
                  ) : null}
                </section>
              ))}
              {o.externes.length ? (
                <section className="carte carte--liste" style={{ flex: "1 1 100%", padding: "20px 20px 8px" }} aria-labelledby="eq-hors">
                  <h2 id="eq-hors" className="carte__titre" style={{ marginBottom: 4 }}>
                    Hors division · {o.externes.filter((p) => p.actif).length}
                  </h2>
                  <p className="note" style={{ margin: "0 0 8px" }}>
                    Autres départements, consultants : ajoutés au besoin par chacun (réunion, tâche, équipe projet). Corrigez les fiches et fusionnez les doublons ici.
                  </p>
                  <ul className="liste" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", columnGap: 24 }}>
                    {o.externes.map((p) => (
                      <li key={p.id} style={{ borderTop: 0 }}>
                        <a href={`/organisation?p=${p.id}`} className="rangee rangee--choix" aria-current={selExterne?.id === p.id ? "true" : undefined} style={{ minHeight: 52, padding: "8px 10px", margin: "0 -10px", opacity: p.actif ? 1 : 0.5 }}>
                          <span className="mono" aria-hidden="true">
                            {p.initiales}
                          </span>
                          <span className="rangee__texte">
                            <span className="rangee__titre" style={{ fontSize: 14 }}>
                              {p.nomComplet}
                            </span>
                            <span className="rangee__sous">
                              {[p.organisation, p.acces ? "accès limité" : null, p.actif ? null : "désactivée"].filter(Boolean).join(" · ") || "Département à préciser"}
                            </span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {o.sansEquipe.length ? (
                <section className="carte carte--liste" style={{ flex: "1 1 280px", padding: "20px 20px 8px" }} aria-labelledby="eq-sans">
                  <h2 id="eq-sans" className="carte__titre">
                    Sans équipe · {o.sansEquipe.length}
                  </h2>
                  <ul className="liste">
                    {o.sansEquipe.map((m) => (
                      <Ligne key={m.id} p={m} />
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
          <aside className="colonne-etroite carte apparition" style={{ animationDelay: "160ms" }} aria-label="Fiche">
            {nouvelle && admin ? (
              <NouvellePersonne equipes={equipesOptions} personnes={personnesOptions} peutDonnerExecutif={u.executif} />
            ) : selExterne ? (
              <FicheExterne
                key={selExterne.id}
                personne={selExterne}
                autres={o.externes.filter((x) => x.id !== selExterne.id).map((x) => ({ id: x.id, nom: `${x.nomComplet}${x.organisation ? ` · ${x.organisation}` : ""}` }))}
                modifiable={admin}
              />
            ) : sel ? (
              <FichePersonne
                key={sel.id}
                personne={{
                  id: sel.id,
                  nom: sel.nomComplet,
                  initiales: sel.initiales,
                  poste: sel.poste,
                  courriel: sel.courriel,
                  equipeId: sel.equipeId,
                  superieurId: sel.superieurId,
                  superieurEffectif: sel.superieurEffectif,
                  superieurVacant: sel.superieurVacant,
                  directeur: sel.directeur,
                  executif: sel.executif,
                  administrateur: sel.administrateur,
                  capaciteHeures: sel.capaciteHeures,
                  actif: sel.actif,
                  nbRapports: sel.nbRapports,
                  projetsDiriges: sel.projetsDiriges,
                }}
                equipes={equipesOptions}
                personnes={personnesOptions.filter((p) => p.id !== sel.id)}
                modifiable={admin}
                peutDonnerExecutif={u.executif}
              />
            ) : (
              <p className="vide" style={{ padding: 0 }}>
                Choisissez une personne pour voir son équipe, son supérieur et ses rôles.
              </p>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
