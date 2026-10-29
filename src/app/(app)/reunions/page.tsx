import { RYTHMES_REUNION } from "@/lib/recurrence-reunion";
import type { Metadata } from "next";
import { acces, idsProjetsVisibles, contactsVisibles, peutVoirTache } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ajouterJours, aujourdhui, dateCourte, jourComplet, lundiDe } from "@/lib/dates";
import { capacites } from "@/lib/donnees/charge";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { reunionsDe } from "@/lib/donnees/reunions";
import { chargerOrganisation } from "@/lib/organisation";
import { DUREES_REUNION, dureeTexte } from "@/lib/projets";
import { nomComplet } from "@/lib/regles";
import { Bandeau, LienChiffre } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { CodeProjet, LienPersonne, LienProjet } from "@/components/Liens";
import { ONGLETS_SEMAINE, SousOnglets } from "@/components/SousOnglets";
import { modifier, noter, quitter, supprimer } from "./actions";
import { ChoixParticipants } from "./ChoixParticipants";
import { VerifierCreneau } from "./VerifierCreneau";
import { ActionsReunion } from "./ActionsReunion";
import { assignables } from "@/lib/donnees/gestion";
import { minutesReunionParPeriode, reunionsEnChiffres } from "@/lib/donnees/graphiques";
import { Courbes } from "@/components/Courbes";
import { ChoixPeriode } from "@/components/ChoixPeriode";
import { ecart, etatComparaison, moisDebutExercice, planBilan, type PlanBilan } from "@/lib/bilan";
import { aLa, etiquettesAxe, nomsDesPeriodes } from "@/lib/bilan-libelles";
import { debutDesDonnees } from "@/lib/donnees/bilan";
import { periodePreferee } from "@/lib/periode-preferee";
import { BarresListe, type Barre } from "@/components/Graphiques";

/** Le temps en réunion sur la période choisie, point par point, comparé à la période d'avant ; et par projet. */
async function enChiffres(ids: string[], plan: PlanBilan, projets: Map<string, { code: string; titre: string }>) {
  const serieAvant = plan.serieAvant ?? [];
  const [minutes, { parProjet }] = await Promise.all([minutesReunionParPeriode(ids, [plan.actuel, plan.precedent, ...plan.serie, ...serieAvant]), reunionsEnChiffres(ids, plan.actuel.debut, plan.actuel.fin)]);
  // Par projet : ceux qu'on voit ; les autres ensemble ; au-delà de six, « autres projets ».
  const visibles: Barre[] = [];
  let autres = 0;
  let sans = 0;
  for (const [id, m] of parProjet) {
    if (!id) sans += m;
    else if (projets.has(id)) visibles.push({ cle: id, code: projets.get(id)!.code, libelle: projets.get(id)!.titre, valeur: m, texte: dureeTexte(m), lien: `/projets/${id}` });
    else autres += m;
  }
  visibles.sort((a, b) => b.valeur - a.valeur);
  for (const b of visibles.splice(6)) autres += b.valeur;
  const barres = [...visibles, ...(autres ? [{ cle: "autres", libelle: "Autres projets", valeur: autres, texte: dureeTexte(autres) }] : []), ...(sans ? [{ cle: "sans", libelle: "Sans projet", valeur: sans, texte: dureeTexte(sans) }] : [])];
  return { total: minutes[0], avant: minutes[1], serie: (k: number) => minutes[2 + k], serieAvant: (k: number) => minutes[2 + plan.serie.length + k], barres };
}

export const metadata: Metadata = { title: "Réunions" };

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

export default async function PageReunions({ searchParams }: { searchParams: Promise<{ semaine?: string; modifier?: string; erreur?: string; notee?: string; info?: string; vue?: string; p?: string }> }) {
  const { semaine: s0, modifier: idModif, erreur, notee, info, vue: vueChiffres, p: pChiffres } = await searchParams;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const jour = aujourdhui();
  const courante = lundiDe(jour);
  const semaine = s0 && JOUR.test(s0) && !Number.isNaN(Date.parse(s0)) ? lundiDe(s0) : courante;
  const fin = ajouterJours(semaine, 6);
  const [liste, org, visibles, caps] = await Promise.all([reunionsDe(u.id, semaine, fin), chargerOrganisation(), idsProjetsVisibles(a), capacites([u.id])]);
  const projets = (await tousLesProjetsActifs()).filter((p) => visibles === "tous" || visibles.has(p.id));
  const minutes = liste.reduce((t, r) => t + r.dureeMinutes, 0);
  const capacite = caps.get(u.id) ?? 40;
  const part = Math.round((minutes / 60 / capacite) * 100);
  const enModif = idModif ? liste.find((r) => r.id === idModif && r.noteeParId === u.id) : undefined;
  const jourParDefaut = semaine === courante ? jour : semaine;
  // Hors division (accès limité) : seulement les personnes avec qui elle travaille, pas l'annuaire.
  const contacts = u.externe ? await contactsVisibles(a) : null;
  const personnes = [...org.personnes.values()]
    .filter((p) => p.actif && p.id !== u.id && (!contacts || contacts.has(p.id)))
    .sort((x, y) => x.nom.localeCompare(y.nom, "fr"))
    .sort((x, y) => Number(x.externe) - Number(y.externe))
    .map((p) => ({
      id: p.id,
      nom: nomComplet(p),
      externe: p.externe,
      detail: p.externe ? ["Hors division", p.organisation].filter(Boolean).join(" · ") : [p.poste, !contacts && p.equipeId ? org.equipes.get(p.equipeId)?.nom : null].filter(Boolean).join(" · "),
    }));
  // « Pour » des actions décidées : mêmes règles que pour confier une tâche.
  const pourActions = await assignables(a);
  const parJour = new Map<string, typeof liste>();
  for (const r of liste) parJour.set(r.jour, [...(parJour.get(r.jour) ?? []), r]);
  const visible = (id: string | null) => !!id && (visibles === "tous" || visibles.has(id));
  // En chiffres : vous, et l'équipe que vous suivez (heures-personnes : chaque participant compte).
  const projetsVus = new Map(projets.map((p) => [p.id, { code: p.code, titre: p.titre }]));
  const equipe = u.externe ? [] : a.suivis === "toutes" ? [...org.personnes.values()].filter((p) => p.actif && !p.externe).map((p) => p.id) : [...a.suivis];
  const debutExercice = moisDebutExercice(process.env.EXERCICE_DEBUT_MOIS);
  const plan = planBilan(vueChiffres ?? (await periodePreferee("semaine")), pChiffres, jour, debutExercice);
  const [debuts, ...groupesCalcules] = await Promise.all([
    debutDesDonnees(),
    enChiffres([u.id], plan, projetsVus),
    ...(equipe.length > 1 ? [enChiffres(equipe, plan, projetsVus)] : []),
  ]);
  const groupesChiffres = [
    { titre: "Vous", sous: "en réunion", ...groupesCalcules[0] },
    ...(groupesCalcules[1] ? [{ titre: a.toutVoir ? "Toute la division" : a.directeur ? "Votre direction" : "Votre équipe", sous: `heures-personnes, ${equipe.length} personnes`, ...groupesCalcules[1] }] : []),
  ];
  const etat = etatComparaison(plan, debuts.activite);
  const nomsPeriode = nomsDesPeriodes(plan, debutExercice);
  const etiquettes = etiquettesAxe(plan);
  const lienChiffres = (v: string, pp?: string) => `/reunions?${semaine !== courante ? `semaine=${semaine}&` : ""}vue=${v}${pp ? `&p=${pp}` : ""}#r-chiffres`;
  const heures = (m: number) => Math.round((m / 60) * 10) / 10;

  return (
    <>
      <Bandeau surtitre={`Semaine du ${dateCourte(semaine)} au ${dateCourte(ajouterJours(semaine, 4))}`} titre="Réunions">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>
              <LienChiffre href="#r-chiffres" detail="voir les réunions en chiffres">
                en réunion
              </LienChiffre>
            </dt>
            <dd>
              {Math.floor(minutes / 60)}
              <small>&nbsp;h{minutes % 60 ? ` ${String(minutes % 60).padStart(2, "0")}` : ""}</small>
            </dd>
          </div>
          <div className="chiffre">
            <dt>
              <LienChiffre href="#r-liste" detail="voir la liste des réunions">
                réunion{liste.length > 1 ? "s" : ""}
              </LienChiffre>
            </dt>
            <dd>{liste.length}</dd>
          </div>
          <div className={`chiffre ${part >= 40 ? "chiffre--retard" : part >= 25 ? "chiffre--veille" : ""}`}>
            <dt>de vos {capacite} h de la semaine</dt>
            <dd>
              {part}
              <small>&nbsp;%</small>
            </dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_SEMAINE} courant="/reunions" label="Ma semaine" />
        <nav className="ligne-actions" aria-label="Semaines">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a href={`/reunions?semaine=${ajouterJours(semaine, -7)}`} className="bouton-icone" aria-label="Semaine précédente" title="Semaine précédente">
              <Icone nom="chevron-gauche" taille={20} />
            </a>
            <span style={{ fontSize: 15 }}>
              {semaine === courante ? "Cette semaine" : semaine === ajouterJours(courante, -7) ? "La semaine dernière" : semaine > courante ? "Semaine à venir" : `Semaine du ${dateCourte(semaine)}`}
            </span>
            <a href={`/reunions?semaine=${ajouterJours(semaine, 7)}`} className="bouton-icone" aria-label="Semaine suivante" title="Semaine suivante">
              <Icone nom="chevron-droite" taille={20} />
            </a>
          </div>
          {semaine !== courante ? (
            <a href="/reunions" className="lien-discret">
              Revenir à cette semaine →
            </a>
          ) : null}
        </nav>
        {notee || info ? (
          <p className="succes" role="status">
            {notee ? "Réunion notée. Les autres participants la voient dans leur semaine : ils n'ont pas à la noter. " : ""}
            {info ?? ""}
          </p>
        ) : null}
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : null}
        <div className="colonnes">
          <section className="carte carte--liste colonne-large" aria-labelledby="r-liste" style={{ scrollMarginTop: 80 }}>
            <h2 id="r-liste" className="carte__titre">
              Réunions de la semaine · {liste.length}
            </h2>
            {liste.length === 0 ? <p className="vide">Aucune réunion notée cette semaine.</p> : null}
            {[...parJour.entries()].map(([j, rs]) => (
              <div key={j} className="jour-reunions">
                <h3 className="jour-reunions__titre">
                  {jourComplet(j)}
                  <span className="ton-discret"> · {dureeTexte(rs.reduce((t, r) => t + r.dureeMinutes, 0))}</span>
                </h3>
                <ul className="liste">
                  {rs.map((r) => {
                    const moi = r.noteeParId === u.id;
                    const autres = r.participants.filter((p) => p.id !== u.id);
                    return (
                      <li key={r.id} className="reunion" data-choisie={enModif?.id === r.id ? "1" : undefined}>
                        <span className="reunion__heure">{r.heure ? r.heure.replace(":", " h ") : "—"}</span>
                        <div className="reunion__corps">
                          <span className="reunion__titre">
                            {r.projetCode ? <CodeProjet id={r.projetId} code={r.projetCode} titre={r.projetTitre} visible={visible(r.projetId)} /> : null}
                            {r.titre}
                            {r.serie ? (
                              <span className="marque-modele" style={{ marginLeft: 8 }} title={`Réunion récurrente : ${r.serie.texte}`}>
                                <Icone nom="reprendre" taille={12} /> {r.serie.texte}
                              </span>
                            ) : null}
                          </span>
                          <span className="rangee__sous">
                            {autres.length ? (
                              <>
                                Avec{" "}
                                {autres.map((p, i) => (
                                  <span key={p.id}>
                                    {i ? (i === autres.length - 1 ? " et " : ", ") : ""}
                                    <LienPersonne id={p.id}>{p.nom}</LienPersonne>
                                  </span>
                                ))}
                              </>
                            ) : (
                              "Seul·e"
                            )}
                            {r.projetTitre ? (
                              <>
                                {" · "}
                                <LienProjet id={r.projetId} visible={visible(r.projetId)}>
                                  {r.projetTitre}
                                </LienProjet>
                              </>
                            ) : null}
                            {!moi && r.noteePar ? (
                              <>
                                {" · notée par "}
                                <LienPersonne id={r.noteePar.id}>{r.noteePar.nom}</LienPersonne>
                              </>
                            ) : null}
                          </span>
                          {r.notes ? <span className="reunion__notes">{r.notes}</span> : null}
                          {r.actions.length ? (
                            <ul className="reunion__actions-liste" aria-label={`Actions décidées · ${r.titre}`}>
                              {r.actions.map((t) =>
                                peutVoirTache(a, t) ? (
                                  <li key={t.id} className={t.statut === "faite" ? "faite" : undefined}>
                                    <a href={`/taches/${t.id}`} className="lien-nom">
                                      {t.titre}
                                    </a>
                                    <span className="ton-discret">
                                      {" · "}
                                      {t.assigneId === u.id ? "moi" : t.prenom}
                                      {t.echeance ? `, ${dateCourte(t.echeance)}` : ""}
                                      {t.statut === "faite" ? " · faite" : ""}
                                    </span>
                                  </li>
                                ) : (
                                  <li key={t.id} className="ton-discret">
                                    Une action pour {t.prenom}
                                  </li>
                                ),
                              )}
                            </ul>
                          ) : null}
                        </div>
                        <span className="reunion__duree">{dureeTexte(r.dureeMinutes)}</span>
                        <span className="reunion__actions">
                          {moi ? (
                            <>
                              <a href={`/reunions?semaine=${semaine}&modifier=${r.id}#noter`} className="bouton-mini">
                                Modifier
                              </a>
                              {r.serie ? (
                                <details className="livrable__renvoi">
                                  <summary className="bouton-mini">Supprimer</summary>
                                  <form action={supprimer.bind(null, r.id, semaine)} className="livrable__renvoi-form">
                                    <label className="choix-radio">
                                      <input type="radio" name="portee" value="une" defaultChecked /> Celle-ci seulement
                                    </label>
                                    <label className="choix-radio">
                                      <input type="radio" name="portee" value="suivantes" /> Celle-ci et les suivantes de la série
                                    </label>
                                    <button type="submit" className="bouton-contour" aria-label={`Supprimer « ${r.titre} »`}>
                                      Supprimer
                                    </button>
                                  </form>
                                </details>
                              ) : (
                                <form action={supprimer.bind(null, r.id, semaine)}>
                                  <button type="submit" className="bouton-mini" aria-label={`Supprimer « ${r.titre} »`}>
                                    Supprimer
                                  </button>
                                </form>
                              )}
                            </>
                          ) : (
                            <form action={quitter.bind(null, r.id, semaine)}>
                              <button type="submit" className="bouton-mini" title="Vous n'y étiez pas : la réunion ne compte plus pour vous">
                                Je n&apos;y étais pas
                              </button>
                            </form>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          <section className="carte colonne-etroite" id="noter" aria-labelledby="r-noter">
            <h2 id="r-noter" className="carte__titre" style={{ marginBottom: 14 }}>
              {enModif ? "Modifier la réunion" : "Noter une réunion"}
            </h2>
            <form key={enModif?.id ?? "neuve"} action={enModif ? modifier.bind(null, enModif.id) : noter} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="champ">
                <label htmlFor="r-titre">Sujet</label>
                <input id="r-titre" name="titre" required maxLength={160} defaultValue={enModif?.titre ?? ""} placeholder="Ex. : Comité de pilotage UR" />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <div className="champ" style={{ flex: "1 1 150px" }}>
                  <label htmlFor="r-jour">Jour</label>
                  <input id="r-jour" name="jour" type="date" required defaultValue={enModif?.jour ?? jourParDefaut} />
                </div>
                <div className="champ" style={{ flex: "1 1 110px" }}>
                  <label htmlFor="r-heure">Heure</label>
                  <input id="r-heure" name="heure" type="time" defaultValue={enModif?.heure ?? ""} />
                </div>
                <div className="champ" style={{ flex: "1 1 110px" }}>
                  <label htmlFor="r-duree">Durée</label>
                  <select id="r-duree" name="duree" defaultValue={String(enModif?.dureeMinutes ?? 60)}>
                    {[...new Set([...DUREES_REUNION, enModif?.dureeMinutes ?? 60])]
                      .sort((x, y) => x - y)
                      .map((d) => (
                        <option key={d} value={d}>
                          {dureeTexte(d)}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              {!enModif ? (
                <fieldset className="champ" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>Répéter</legend>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <div className="champ" style={{ flex: "2 1 200px" }}>
                      <label htmlFor="r-rythme" className="visuellement-cache">
                        Rythme
                      </label>
                      <select id="r-rythme" name="rythme" defaultValue="" aria-describedby="r-rythme-aide">
                        <option value="">Une seule fois</option>
                        {Object.entries(RYTHMES_REUNION).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="champ" style={{ flex: "1 1 150px" }}>
                      <label htmlFor="r-jusquau">Jusqu&apos;au</label>
                      <input id="r-jusquau" name="jusquau" type="date" min={jourParDefaut} />
                    </div>
                  </div>
                  <span className="aide" id="r-rythme-aide">
                    Pour une réunion qui revient (comité, point d&apos;équipe) : toutes les dates jusqu&apos;à la dernière sont notées d&apos;un coup, pour chaque participant. Un an au plus.
                  </span>
                </fieldset>
              ) : enModif.serie ? (
                <fieldset className="champ" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>Réunion récurrente ({enModif.serie.texte})</legend>
                  <label className="choix-radio">
                    <input type="radio" name="portee" value="une" defaultChecked /> Modifier celle-ci seulement
                  </label>
                  <label className="choix-radio">
                    <input type="radio" name="portee" value="suivantes" /> Modifier celle-ci et les suivantes (le jour ne change que pour celle-ci)
                  </label>
                </fieldset>
              ) : null}
              <div className="champ">
                <label htmlFor="r-projet">Projet (facultatif)</label>
                <select id="r-projet" name="projetId" defaultValue={enModif?.projetId ?? ""}>
                  <option value="">Aucun</option>
                  {projets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.titre}
                    </option>
                  ))}
                </select>
              </div>
              <ChoixParticipants personnes={personnes} choisis={enModif ? enModif.participants.map((p) => p.id).filter((id) => id !== u.id) : []} autresPermis={!u.externe} />
              <div className="champ">
                <label htmlFor="r-notes">Notes (facultatif)</label>
                <textarea id="r-notes" name="notes" rows={3} maxLength={2000} defaultValue={enModif?.notes ?? ""} placeholder="Ce qui a été dit ou décidé" />
              </div>
              {!u.externe ? <ActionsReunion moiId={u.id} personnes={pourActions.personnes} base={pourActions.base} parProjet={pourActions.parProjet} projetInitial={enModif?.projetId ?? ""} aujourdhui={aujourdhui()} /> : null}
              <VerifierCreneau sauf={enModif?.id} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <button type="submit" className="bouton-ambre">
                  {enModif ? "Enregistrer" : "Noter la réunion"}
                </button>
                {enModif ? (
                  <a href={`/reunions?semaine=${semaine}`} className="lien-discret">
                    Annuler
                  </a>
                ) : null}
              </div>
              <p className="note" style={{ margin: 0 }}>
                Une seule personne note la réunion : elle compte pour chaque participant, dans sa semaine, son rapport du vendredi et sa charge.
              </p>
            </form>
          </section>
        </div>
        <section aria-labelledby="r-chiffres-titre" id="r-chiffres" style={{ scrollMarginTop: 80 }}>
          <h2 id="r-chiffres-titre" className="carte__titre" style={{ marginBottom: 12 }}>
            Le temps en réunion
          </h2>
          <ChoixPeriode plan={plan} noms={nomsPeriode} lien={lienChiffres} comparer={etat.comparer} />
          <div className="bilan-graphes">
            {groupesChiffres.map((g) => (
              <article key={g.titre} className="carte graphe-carte">
                <header className="graphe-carte__tete">
                  <h3 className="graphe-carte__titre">{g.titre}</h3>
                  <p className="graphe-carte__valeur">
                    {g.total ? dureeTexte(g.total) : "0 h"}
                    <span className="graphe-carte__ecart">
                      {g.sous}
                      {etat.comparer ? ` · ${ecart(heures(g.total), heures(g.avant), " h") ?? "—"} par rapport ${aLa(nomsPeriode.avantCourt)}` : ""}
                    </span>
                  </p>
                </header>
                <Courbes
                  titre={`${g.titre} : heures de réunion, ${plan.vue === "semaine" ? "semaine par semaine" : "mois par mois"}`}
                  unite="heures"
                  nomActuel={nomsPeriode.actuel}
                  nomAvant={etat.deuxSeries ? nomsPeriode.avant : undefined}
                  hauteur={100}
                  points={plan.axe.map((cle, k) => ({
                    cle,
                    libelle: etiquettes[k].libelle,
                    court: etiquettes[k].court,
                    actuel: plan.serie[k] && etat.avecDonnees(plan.serie[k]) ? heures(g.serie(k)) : null,
                    avant: etat.deuxSeries && plan.serieAvant && etat.avecDonnees(plan.serieAvant[k]) ? heures(g.serieAvant(k)) : null,
                    libelleAvant: etiquettes[k].libelleAvant,
                    enCours: !!plan.serie[k] && plan.serie[k].fin >= jour,
                  }))}
                />
                <h4 className="colonnes-graphe__titre" style={{ margin: "12px 0 0" }}>
                  Par projet, {nomsPeriode.actuel.charAt(0).toLowerCase() + nomsPeriode.actuel.slice(1)}
                </h4>
                <BarresListe titre={`${g.titre} : heures de réunion par projet`} barres={g.barres} />
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
