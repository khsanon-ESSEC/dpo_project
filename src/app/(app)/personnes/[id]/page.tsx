import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, idsProjetsVisibles, suitPersonne } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet, resoudreSuperieur, subordonnesDirects } from "@/lib/regles";
import { LIBELLE_STATUT_PROJET } from "@/lib/projets";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { LienPersonne } from "@/components/Liens";

export const metadata: Metadata = { title: "Fiche personne" };

/**
 * Fiche d'une personne : son poste, son équipe, son supérieur, ses projets (ceux que je vois), son équipe.
 * Ouverte à tous ; ses tâches, sa charge et ses rapports restent réservés à qui la suit.
 */
export default async function PageFichePersonne({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const org = await chargerOrganisation();
  const p = org.personnes.get(id);
  if (!p) notFound();
  const sup = resoudreSuperieur(org, id);
  const equipe = p.equipeId ? org.equipes.get(p.equipeId) : null;
  const subordonnes = subordonnesDirects(org, id);
  const visibles = await idsProjetsVisibles(a);
  const [diriges, membre] = await Promise.all([
    db
      .select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre, statut: schema.projets.statut, referentId: schema.projets.referentId })
      .from(schema.projets)
      .where(and(or(eq(schema.projets.chefProjetId, id), eq(schema.projets.referentId, id)), isNull(schema.projets.archiveLe), ne(schema.projets.statut, "refuse"))),
    db
      .select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre, statut: schema.projets.statut, role: schema.membresProjet.role })
      .from(schema.membresProjet)
      .innerJoin(schema.projets, eq(schema.projets.id, schema.membresProjet.projetId))
      .where(and(eq(schema.membresProjet.personneId, id), isNull(schema.projets.archiveLe))),
  ]);
  const vus = <T extends { id: string }>(l: T[]) => l.filter((x) => visibles === "tous" || visibles.has(x.id));
  const projets = [...vus(diriges).map((x) => ({ ...x, role: x.referentId === id ? "Référent DPO" : x.statut === "requete" ? "Chef de projet suggéré" : "Chef de projet" })), ...vus(membre).filter((x) => !diriges.some((d) => d.id === x.id)).map((x) => ({ ...x, role: x.role || "Membre" }))];
  const suivi = id === u.id || suitPersonne(a, id);
  const roles = [p.executif ? "Exécutif" : null, p.directeur ? "Directeur" : null, subordonnes.length ? "Chef d'équipe" : null, diriges.some((d) => d.statut !== "requete") ? "Chef de projet" : null, p.administrateur ? "Administrateur" : null].filter(Boolean);
  // Retour : la page d'où l'on vient, si elle est de l'application.
  const ref = (await headers()).get("referer");
  let retour = "/semaine";
  try {
    const r = ref ? new URL(ref) : null;
    if (r && r.pathname.startsWith("/") && !r.pathname.startsWith("/personnes/" + id)) retour = r.pathname + r.search;
  } catch {
    /* adresse illisible : retour à la semaine */
  }

  return (
    <>
      <Bandeau
        surtitre={[p.externe ? `Hors division${p.organisation ? ` · ${p.organisation}` : ""}` : null, p.poste, p.actif ? null : "Inactif"].filter(Boolean).join(" · ")}
        titre={nomComplet(p)}
        retour={
          <a href={retour} className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Retour
          </a>
        }
      >
        {roles.length ? (
          <p className="discret" style={{ margin: "8px 0 0", fontSize: 14 }}>
            {roles.join(" · ")}
          </p>
        ) : null}
      </Bandeau>
      <div className="page">
        <div className="colonnes">
          <div className="colonne-large">
            <section className="carte" aria-labelledby="pf-ident">
              <h2 id="pf-ident" className="carte__titre">
                Identité
              </h2>
              <dl className="fiche">
                {p.externe ? (
                  <div>
                    <dt>Département ou société</dt>
                    <dd>{p.organisation || "Non précisé"}</dd>
                  </div>
                ) : (
                  <>
                    <div>
                      <dt>Équipe</dt>
                      <dd>{equipe?.nom ?? "Sans équipe"}</dd>
                    </div>
                    <div>
                      <dt>Supérieur</dt>
                      <dd>{sup ? <LienPersonne id={sup.id}>{nomComplet(sup)}</LienPersonne> : "—"}</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>Courriel</dt>
                  <dd>
                    {p.courriel ? (
                      <a href={`mailto:${p.courriel}`} className="lien-nom">
                        {p.courriel}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
              {p.externe ? (
                <p className="note" style={{ margin: "16px 0 0" }}>
                  Personne hors division : ses tâches sont suivies par celles et ceux qui les lui ont confiées, et par les chefs de ses projets.
                </p>
              ) : null}
              {suivi && !p.externe ? (
                <p style={{ margin: "16px 0 0" }}>
                  <a href={`/equipe/${id}`} className="bouton-contour">
                    <Icone nom="jauge" taille={16} /> {id === u.id ? "Mes tâches et ma charge" : "Ses tâches, sa charge et ses rapports"}
                  </a>
                </p>
              ) : null}
            </section>
            <section className="carte carte--liste" aria-labelledby="pf-projets">
              <h2 id="pf-projets" className="carte__titre">
                Projets · {projets.length}
              </h2>
              <ul className="liste">
                {projets.map((x) => (
                  <li key={x.id}>
                    <a href={`/projets/${x.id}`} className="rangee" style={{ minHeight: 52 }}>
                      <span className="etiquette-projet">{x.code}</span>
                      <span className="rangee__texte">
                        <span className="rangee__titre">{x.titre}</span>
                        <span className="rangee__sous">{x.role}</span>
                      </span>
                      <span className="rangee__meta" style={{ fontSize: 12 }}>
                        {LIBELLE_STATUT_PROJET[x.statut]}
                      </span>
                    </a>
                  </li>
                ))}
                {projets.length === 0 ? <li className="vide">Aucun projet que vous puissiez voir.</li> : null}
              </ul>
            </section>
          </div>
          <div className="colonne-etroite">
            {subordonnes.length ? (
              <section className="carte carte--liste" aria-labelledby="pf-equipe">
                <h2 id="pf-equipe" className="carte__titre">
                  Son équipe · {subordonnes.length}
                </h2>
                <ul className="liste">
                  {subordonnes.map((s) => (
                    <li key={s.id}>
                      <a href={`/personnes/${s.id}`} className="rangee" style={{ minHeight: 52 }}>
                        <span className="rangee__texte">
                          <span className="rangee__titre">{nomComplet(s)}</span>
                          <span className="rangee__sous">{s.poste}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
