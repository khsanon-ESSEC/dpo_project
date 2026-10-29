import { cheminInterne } from "@/lib/origine";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, contactsVisibles, idsProjetsVisibles, suitPersonne } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ajouterJours, aujourdhui, dateCourte, echeanceRelative, jourAbrege, lundiDe } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet, resoudreSuperieur, subordonnesDirects } from "@/lib/regles";
import { dureeTexte, LIBELLE_STATUT_PROJET } from "@/lib/projets";
import { heuresDe, heuresTexte, LIBELLE_NIVEAU } from "@/lib/charge";
import { chargeDesPersonnes } from "@/lib/donnees/charge";
import { auteursDontJeLisLesRapports, statutsRapports } from "@/lib/donnees/rapport";
import { reunionsDe } from "@/lib/donnees/reunions";
import { compter, tachesDe, trier } from "@/lib/donnees/semaine";
import { Bandeau } from "@/components/Bandeau";
import { Jauge, Niveau } from "@/components/Charge";
import { EvolutionPersonne } from "@/components/EvolutionPersonne";
import { Icone } from "@/components/Icone";
import { CodeProjet, LienPersonne, LienProjet } from "@/components/Liens";
import { PastilleStatut } from "@/components/PastilleStatut";
import { JOURS_PAR_PROJET, travailParProjet } from "@/lib/donnees/par-projet";

export const metadata: Metadata = { title: "Fiche personne" };

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fiche d'une personne : son poste, son équipe, son supérieur, ses projets (ceux que je vois), son équipe.
 * Ouverte à tous. Pour qui la suit (et pour soi-même), la même page montre aussi sa charge des semaines à
 * venir, ses tâches ouvertes, ses réunions de la semaine et son évolution, période contre période.
 */
export default async function PageFichePersonne({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semaine?: string; vue?: string; p?: string; taches?: string }> }) {
  const { id } = await params;
  const { semaine: s0, vue, p: periode, taches: vueTaches } = await searchParams;
  const tachesParProjet = vueTaches === "projet";
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const org = await chargerOrganisation();
  const p = org.personnes.get(id);
  if (!p) notFound();
  // Une personne hors division (accès limité) ne consulte que les fiches des personnes avec qui elle
  // travaille, et sans l'organisation interne (équipe, supérieur, subordonnés).
  const limite = !!u.externe;
  if (limite && !(await contactsVisibles(a)).has(id)) notFound();
  const sup = limite ? null : resoudreSuperieur(org, id);
  const equipe = !limite && p.equipeId ? org.equipes.get(p.equipeId) : null;
  const subordonnes = limite ? [] : subordonnesDirects(org, id);
  const visibles = await idsProjetsVisibles(a);
  const voit = (pid: string | null) => !!pid && (visibles === "tous" || visibles.has(pid));
  const moi = id === u.id;
  // Le travail de la personne (tâches, charge, réunions, évolution) : pour soi et pour qui la suit ; jamais
  // pour une personne hors division (ses tâches sont suivies par qui les lui a confiées).
  const travail = !limite && !p.externe && (moi || suitPersonne(a, id));
  const jour = aujourdhui();
  const lundi = lundiDe(jour);

  const [diriges, membre, donnees, auteurs] = await Promise.all([
    db
      .select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre, statut: schema.projets.statut, referentId: schema.projets.referentId })
      .from(schema.projets)
      .where(and(or(eq(schema.projets.chefProjetId, id), eq(schema.projets.referentId, id)), isNull(schema.projets.archiveLe), ne(schema.projets.statut, "refuse"))),
    db
      .select({ id: schema.projets.id, code: schema.projets.code, titre: schema.projets.titre, statut: schema.projets.statut, role: schema.membresProjet.role })
      .from(schema.membresProjet)
      .innerJoin(schema.projets, eq(schema.projets.id, schema.membresProjet.projetId))
      .where(and(eq(schema.membresProjet.personneId, id), isNull(schema.projets.archiveLe))),
    travail
      ? Promise.all([tachesDe([id]), chargeDesPersonnes([id]), statutsRapports([id]), reunionsDe(id, lundi, ajouterJours(lundi, 6)), reunionsDe(id, ajouterJours(lundi, 7), ajouterJours(lundi, 13))])
      : null,
    travail && !moi ? auteursDontJeLisLesRapports(a) : Promise.resolve([] as string[]),
  ]);
  const vus = <T extends { id: string }>(l: T[]) => l.filter((x) => voit(x.id));
  const projets = [...vus(diriges).map((x) => ({ ...x, role: x.referentId === id ? "Référent DPO" : x.statut === "requete" ? "Chef de projet suggéré" : "Chef de projet" })), ...vus(membre).filter((x) => !diriges.some((d) => d.id === x.id)).map((x) => ({ ...x, role: x.role || "Membre" }))];
  const roles = [p.executif ? "Exécutif" : null, p.directeur ? "Directeur" : null, subordonnes.length ? "Chef d'équipe" : null, diriges.some((d) => d.statut !== "requete") ? "Chef de projet" : null, p.administrateur ? "Administrateur" : null].filter(Boolean);

  // Retour : la page d'où l'on vient, si elle est de l'application (pas cette fiche elle-même).
  const h = await headers();
  const venu = cheminInterne(h.get("referer"), h);
  const retour = venu && !venu.startsWith("/personnes/" + id) ? venu : travail && !moi ? "/equipe" : "/semaine";

  // Adresse de la fiche en gardant la semaine de charge et la période choisies.
  const adresse = (o: { semaine?: string; vue?: string; p?: string }, ancre: string) => {
    const q = new URLSearchParams();
    const s = o.semaine ?? s0;
    const v = "vue" in o ? o.vue : vue;
    const pp = "vue" in o ? o.p : periode;
    if (s && JOUR.test(s)) q.set("semaine", s);
    if (v) q.set("vue", v);
    if (pp) q.set("p", pp);
    const t = q.toString();
    return `/personnes/${id}${t ? `?${t}` : ""}#${ancre}`;
  };

  // ---------- Le travail de la personne ----------
  const [taches, { semaines, lignes }, rapports, reunions, reunionsSuivantes] = donnees ?? [[], { semaines: [] as string[], lignes: [] }, new Map(), [], []];
  const minutesReunion = reunions.reduce((t, r) => t + r.dureeMinutes, 0);
  const minutesSuivantes = reunionsSuivantes.reduce((t, r) => t + r.dureeMinutes, 0);
  const triees = trier(taches, jour);
  const c = compter(triees, jour);
  // Par projet (quatre dernières semaines) : seulement quand on voit le travail de la personne.
  const parProjet = travail ? await travailParProjet(id, jour, visibles) : null;
  const maxTemps = Math.max(1, ...(parProjet?.lignes ?? []).map((l) => l.heuresRestantes * 60 + l.minutesNotees + l.minutesReunions));
  // La liste des tâches, regroupée par projet si on l'a demandé.
  const groupesTaches = tachesParProjet
    ? [...new Map(triees.map((t) => [t.projetId ?? "", { cle: t.projetId ?? "", code: t.projetCode, titre: t.projetTitre ?? "Hors projet", projetId: t.projetId }])).values()]
        .sort((x, y) => Number(!x.cle) - Number(!y.cle) || (x.titre ?? "").localeCompare(y.titre ?? "", "fr"))
        .map((g) => ({ ...g, taches: triees.filter((t) => (t.projetId ?? "") === g.cle) }))
    : [{ cle: "toutes", code: null, titre: null, projetId: null, taches: triees }];
  const lienTaches = (parProj: boolean) => {
    const q = new URLSearchParams();
    if (s0 && JOUR.test(s0)) q.set("semaine", s0);
    if (vue) q.set("vue", vue);
    if (periode) q.set("p", periode);
    if (parProj) q.set("taches", "projet");
    const t = q.toString();
    return `/personnes/${id}${t ? `?${t}` : ""}#pf-taches`;
  };
  const ligne = lignes[0];
  const charge = ligne?.charge;
  const choisie = s0 && semaines.includes(s0) ? s0 : semaines[0];
  const semaineChoisie = charge?.semaines.find((w) => w.semaine === choisie);
  const detail = ligne ? (semaineChoisie?.taches.map((x) => ({ ...ligne.taches.get(x.id)!, heuresSemaine: x.heures })) ?? []) : [];
  const rapport = rapports.get(id);
  const lienRapports = moi ? "/rapports" : auteurs.includes(id) ? `/equipe/rapports?personne=${id}` : null;

  const identite = (
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
        ) : limite ? null : (
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
      {lienRapports ? (
        <p style={{ margin: "16px 0 0" }}>
          <a href={lienRapports} className="bouton-contour">
            <Icone nom="historique" taille={16} /> {moi ? "Mes rapports" : "Ses rapports"}
          </a>
        </p>
      ) : null}
    </section>
  );

  const listeProjets = (
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
  );

  const sonEquipe = subordonnes.length ? (
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
  ) : null;

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
        {travail && charge ? (
          <dl className="chiffres">
            <div className={`chiffre ${charge.semaines[0].niveau === "surchargee" ? "chiffre--retard" : charge.semaines[0].niveau === "chargee" ? "chiffre--veille" : ""}`}>
              <dt>
                cette semaine, sur {heuresTexte(charge.semaines[0].capacite)} restantes{charge.semaines[0].reunions ? ` hors ${heuresTexte(charge.semaines[0].reunions)} de réunion` : ""}
              </dt>
              <dd>
                <a href="#charge" className="lien-nom" style={{ textDecorationColor: "rgba(255,255,255,0.35)" }}>
                  {Math.round(charge.semaines[0].heures)}
                  <small>&nbsp;h</small>
                </a>
              </dd>
            </div>
            <div className={`chiffre ${charge.semaines[1].niveau === "surchargee" ? "chiffre--retard" : charge.semaines[1].niveau === "chargee" ? "chiffre--veille" : ""}`}>
              <dt>
                la semaine prochaine, sur {charge.semaines[1].capacite} h{charge.semaines[1].reunions ? ` hors ${heuresTexte(charge.semaines[1].reunions)} de réunion` : ""}
              </dt>
              <dd>
                <a href="#charge" className="lien-nom" style={{ textDecorationColor: "rgba(255,255,255,0.35)" }}>
                  {Math.round(charge.semaines[1].heures)}
                  <small>&nbsp;h</small>
                </a>
              </dd>
            </div>
            <div className="chiffre">
              <dt>en réunion cette semaine{reunions.length ? ` · ${reunions.length} réunion${reunions.length > 1 ? "s" : ""}` : ""}</dt>
              <dd>
                <a href="#pf-reunions" className="lien-nom" style={{ textDecorationColor: "rgba(255,255,255,0.35)" }}>
                  {String(Math.round((minutesReunion / 60) * 10) / 10).replace(".", ",")}
                  <small>&nbsp;h</small>
                </a>
              </dd>
            </div>
            <div className="chiffre">
              <dt>tâches ouvertes</dt>
              <dd>
                <a href="#pf-taches" className="lien-nom" style={{ textDecorationColor: "rgba(255,255,255,0.35)" }}>
                  {charge.ouvertes + charge.bloquees}
                </a>
              </dd>
            </div>
            {!p.executif ? (
              <div className="chiffre">
                <dt>rapport du vendredi</dt>
                <dd style={{ fontSize: 22, lineHeight: "54px", fontWeight: 300 }}>
                  {rapport?.statut === "envoye" && rapport.id ? (
                    <a href={`/rapports/${rapport.id}`} className="lien-nom" style={{ textDecorationColor: "rgba(255,255,255,0.35)" }}>
                      {moi ? "Envoyé" : "Reçu"}
                    </a>
                  ) : rapport?.statut === "envoye" ? (
                    moi ? "Envoyé" : "Reçu"
                  ) : (
                    "Pas encore"
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </Bandeau>
      <div className="page">
        {travail ? (
          <>
            <div className="colonnes colonnes--tablette">
              <div className="colonne-large">
                {charge && ligne ? (
                  <section className="carte" aria-labelledby="charge-titre" id="charge">
                    <div className="carte__entete">
                      <h2 id="charge-titre" className="carte__titre">
                        Charge des {semaines.length} prochaines semaines
                      </h2>
                      <span className="note">{ligne.capacite} h disponibles par semaine</span>
                    </div>
                    <div className="fiche-jauges">
                      {charge.semaines.map((w, i) => (
                        <div key={w.semaine} className="fiche-jauges__semaine">
                          <span className="rangee__sous">{i === 0 ? "Cette semaine" : i === 1 ? "Semaine prochaine" : `Sem. du ${dateCourte(w.semaine)}`}</span>
                          <Jauge heures={w.heures} capacite={w.capacite} niveau={w.niveau} lien={adresse({ semaine: w.semaine }, "charge")} choisie={w.semaine === choisie} delai={i * 60} />
                        </div>
                      ))}
                    </div>
                    {semaineChoisie ? (
                      <>
                        <div className="carte__entete">
                          <h3 className="carte__titre" style={{ margin: 0 }}>
                            {choisie === semaines[0] ? "Cette semaine" : `Semaine du ${dateCourte(choisie)}`} · {heuresTexte(semaineChoisie.heures)} sur {heuresTexte(semaineChoisie.capacite)}
                          </h3>
                          <Niveau niveau={semaineChoisie.niveau} />
                        </div>
                        <ul className="liste">
                          {detail.map((t) => (
                            <li key={t.id}>
                              <div className="rangee rangee--etiree">
                                {t.projetCode ? <CodeProjet id={t.projetId} code={t.projetCode} titre={t.projetTitre} visible={voit(t.projetId)} mono /> : null}
                                <span className="rangee__texte">
                                  <a href={`/taches/${t.id}`} className="rangee__titre rangee__lien">
                                    {t.titre}
                                  </a>
                                  <span className="rangee__sous">
                                    {t.projetId ? (
                                      <LienProjet id={t.projetId} visible={voit(t.projetId)}>
                                        {t.projetTitre}
                                      </LienProjet>
                                    ) : (
                                      "Hors projet"
                                    )}{" "}
                                    · {t.echeance ? `échéance ${dateCourte(t.echeance)}` : "sans échéance"} · {t.estimationHeures ? `${t.estimationHeures} h estimées` : `sans estimation (compte ${heuresDe(t)} h)`}
                                  </span>
                                </span>
                                <span className={`rangee__meta ${t.echeance && t.echeance < jour ? "ton-retard" : ""}`}>{heuresTexte(t.heuresSemaine)}</span>
                              </div>
                            </li>
                          ))}
                          {detail.length === 0 ? <li className="vide">Rien de prévu cette semaine-là.</li> : null}
                        </ul>
                        {semaineChoisie.niveau === "surchargee" ? (
                          <p className="note" style={{ marginTop: 12 }}>
                            {LIBELLE_NIVEAU.surchargee} : {heuresTexte(semaineChoisie.heures - semaineChoisie.capacite)} de trop. Repousser une échéance, confier une tâche à quelqu&apos;un d&apos;autre, ou revoir
                            l&apos;estimation.
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </section>
                ) : null}

                {parProjet && parProjet.lignes.length ? (
                  <section className="carte" aria-labelledby="pf-projets-titre" id="pf-projets" style={{ scrollMarginTop: 80 }}>
                    <div className="carte__entete">
                      <h2 id="pf-projets-titre" className="carte__titre">
                        Par projet · {JOURS_PAR_PROJET / 7} dernières semaines
                      </h2>
                      <span className="note">Le temps : heures estimées qui restent, temps passé noté et réunions</span>
                    </div>
                    <div className="defile-x">
                      <table className="par-projet">
                        <thead>
                          <tr>
                            <th scope="col">Projet</th>
                            <th scope="col" className="nombre">
                              Ouvertes
                            </th>
                            <th scope="col" className="nombre">
                              Faites
                            </th>
                            <th scope="col" className="nombre">
                              Restant
                            </th>
                            <th scope="col" className="nombre">
                              Noté
                            </th>
                            <th scope="col" className="nombre">
                              Réunions
                            </th>
                            <th scope="col" className="par-projet__barre-col">
                              Part du temps
                            </th>
                            <th scope="col">Dernière activité</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parProjet.lignes.map((l) => {
                            const minutes = l.heuresRestantes * 60 + l.minutesNotees + l.minutesReunions;
                            const lien = l.projetId && l.projetId !== "autres" && voit(l.projetId) ? `/projets/${l.projetId}/liste?pour=${id}` : null;
                            return (
                              <tr key={l.cle} className={l.delaisse ? "par-projet__delaisse" : undefined}>
                                <th scope="row">
                                  {l.code ? <span className="etiquette-projet">{l.code}</span> : null}{" "}
                                  {lien ? (
                                    <a href={lien} className="lien-discret" title={`Les tâches de ${p.prenom} sur ce projet`}>
                                      {l.titre}
                                    </a>
                                  ) : (
                                    <span className="ton-discret">{l.titre}</span>
                                  )}
                                  {l.delaisse ? <span className="marque-modele marque-modele--ambre" style={{ marginLeft: 8 }}>Rien depuis 14 j</span> : null}
                                </th>
                                <td className="nombre">
                                  {l.ouvertes}
                                  {l.enRetard ? <span className="ton-retard"> · {l.enRetard} en retard</span> : null}
                                  {l.bloquees ? <span className="ton-veille"> · {l.bloquees} bloquée{l.bloquees > 1 ? "s" : ""}</span> : null}
                                </td>
                                <td className="nombre">{l.faites}</td>
                                <td className="nombre">{l.heuresRestantes ? heuresTexte(l.heuresRestantes) : "—"}</td>
                                <td className="nombre">{l.minutesNotees ? dureeTexte(l.minutesNotees) : "—"}</td>
                                <td className="nombre">{l.minutesReunions ? dureeTexte(l.minutesReunions) : "—"}</td>
                                <td className="par-projet__barre-col">
                                  <span className="par-projet__barre" role="img" aria-label={`${Math.round(minutes / 60)} h au total`}>
                                    <span style={{ width: `${(minutes / maxTemps) * 100}%` }} />
                                  </span>
                                </td>
                                <td>{l.derniereActivite ? dateCourte(l.derniereActivite) : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="note" style={{ margin: "10px 0 0" }}>
                      « Rien depuis 14 j » : des tâches ouvertes, mais aucune faite ni mise à jour depuis deux semaines. Le nom d&apos;un projet ouvre ses tâches pour {p.prenom}.
                    </p>
                  </section>
                ) : null}

                <section className="carte carte--liste" aria-labelledby="pf-taches-titre" id="pf-taches">
                  <div className="carte__entete">
                    <h2 id="pf-taches-titre" className="carte__titre">
                      Tâches ouvertes · {c.faites} faite{c.faites > 1 ? "s" : ""} cette semaine
                    </h2>
                    <span style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                      <nav className="zoom" aria-label="Classer les tâches">
                        <a href={lienTaches(false)} aria-current={!tachesParProjet ? "true" : undefined}>
                          Par échéance
                        </a>
                        <a href={lienTaches(true)} aria-current={tachesParProjet ? "true" : undefined}>
                          Par projet
                        </a>
                      </nav>
                      {!moi ? (
                        <a href={`/taches/nouvelle?pour=${id}&retour=${encodeURIComponent(`/personnes/${id}`)}`} className="lien-discret">
                          Confier une tâche →
                        </a>
                      ) : null}
                    </span>
                  </div>
                  {groupesTaches.map((g) => (
                  <div key={g.cle}>
                  {g.titre ? (
                    <h3 className="liste-groupe">
                      {g.code ? <span className="etiquette-projet">{g.code}</span> : null}{" "}
                      {g.projetId ? (
                        <LienProjet id={g.projetId} visible={voit(g.projetId)}>
                          {g.titre}
                        </LienProjet>
                      ) : (
                        g.titre
                      )}{" "}
                      · {g.taches.filter((t) => t.statut !== "faite").length} ouverte{g.taches.filter((t) => t.statut !== "faite").length > 1 ? "s" : ""}
                      {g.taches.some((t) => t.statut === "faite") ? `, ${g.taches.filter((t) => t.statut === "faite").length} faite${g.taches.filter((t) => t.statut === "faite").length > 1 ? "s" : ""} cette semaine` : ""}
                    </h3>
                  ) : null}
                  <ul className="liste">
                    {g.taches.map((t) => {
                      const e = echeanceRelative(t.echeance, jour);
                      return (
                        <li key={t.id}>
                          <div className={`rangee rangee--etiree${t.statut === "faite" ? " fait" : ""}`}>
                            {t.projetCode ? <CodeProjet id={t.projetId} code={t.projetCode} titre={t.projetTitre} visible={voit(t.projetId)} mono /> : null}
                            <span className="rangee__texte">
                              <span style={{ display: "flex", alignItems: "baseline" }}>
                                <PastilleStatut statut={t.statut} retard={e.retard} />
                                <a href={`/taches/${t.id}`} className="rangee__titre rangee__lien">
                                  {t.titre}
                                </a>
                              </span>
                              <span className="rangee__sous" style={{ paddingLeft: 24 }}>
                                {t.projetId ? (
                                  <LienProjet id={t.projetId} visible={voit(t.projetId)}>
                                    {t.projetTitre}
                                  </LienProjet>
                                ) : (
                                  "Hors projet"
                                )}
                              </span>
                            </span>
                            <span className={`rangee__meta ${t.statut === "bloquee" ? "ton-veille" : e.retard && t.statut !== "faite" ? "ton-retard" : ""}`}>
                              {t.statut === "faite" ? "Faite" : t.statut === "bloquee" ? "Bloquée" : e.texte || "Sans échéance"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  </div>
                  ))}
                  {triees.length === 0 ? <p className="vide">Aucune tâche ouverte.</p> : null}
                </section>

                <section className="carte carte--liste" aria-labelledby="pf-reunions-titre" id="pf-reunions">
                  <div className="carte__entete">
                    <h2 id="pf-reunions-titre" className="carte__titre">
                      Réunions cette semaine · {minutesReunion ? dureeTexte(minutesReunion) : "aucune"}
                    </h2>
                    <span className="note">Semaine prochaine : {minutesSuivantes ? `${dureeTexte(minutesSuivantes)} déjà prévues` : "rien de prévu"}</span>
                  </div>
                  {reunions.length ? (
                    <ul className="liste">
                      {reunions.map((r) => (
                        <li key={r.id} className={`rangee${r.jour < jour ? " ton-discret" : ""}`} style={{ minHeight: 48 }}>
                          <span className="rangee__meta" style={{ flex: "0 0 92px", fontVariantNumeric: "tabular-nums" }}>
                            {jourAbrege(r.jour)} {r.heure ? r.heure.slice(0, 5).replace(":", " h ") : ""}
                          </span>
                          {r.projetCode ? <CodeProjet id={r.projetId} code={r.projetCode} titre={r.projetTitre} visible={voit(r.projetId)} /> : null}
                          <span className="rangee__texte">
                            <span className="rangee__titre">{r.titre}</span>
                            {r.participants.length > 1 ? (
                              <span className="rangee__sous">
                                avec {r.participants.length - 1} autre{r.participants.length > 2 ? "s" : ""} personne{r.participants.length > 2 ? "s" : ""}
                              </span>
                            ) : null}
                          </span>
                          <span className="rangee__meta">{dureeTexte(r.dureeMinutes)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="vide">Aucune réunion notée cette semaine.</p>
                  )}
                </section>
              </div>
              <div className="colonne-etroite">
                {identite}
                {listeProjets}
                {sonEquipe}
              </div>
            </div>
            <EvolutionPersonne personneId={id} vue={vue} param={periode} redige={!p.executif} lien={(v, pp) => adresse({ vue: v, p: pp }, "evolution")} />
          </>
        ) : (
          <div className="colonnes colonnes--tablette">
            <div className="colonne-large">
              {identite}
              {listeProjets}
            </div>
            <div className="colonne-etroite">{sonEquipe}</div>
          </div>
        )}
      </div>
    </>
  );
}
