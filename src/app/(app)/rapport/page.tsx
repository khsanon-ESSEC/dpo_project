import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import { ajouterJours, dateCourte, dateLocale, heure } from "@/lib/dates";
import {
  calendrierDuRapport,
  champDeRubrique,
  completerBrouillon,
  dejaReprise,
  formulaireDe,
  lecteursDuRapport,
  lignesDuRapport,
  manquantsDuRapport,
  monRapportPrecedent,
  obtenirOuCreerRapport,
  reponsesDuRapport,
  semaineCourante,
  suggestionsPourDecision,
  synchroniserReprises,
  synchroniserSyntheses,
  vueEquipe,
} from "@/lib/donnees/rapport";
import { piecesDuRapport } from "@/lib/donnees/pieces";
import { iaDisponible } from "@/lib/ia";
import { redigeUnRapport } from "@/lib/regles";
import { versionDuRapport } from "@/lib/donnees/modeles";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { chargerOrganisation } from "@/lib/organisation";
import { initiales, nomComplet } from "@/lib/regles";
import { estDecoratif, LIBELLE_VISIBILITE, texteMoment, type Rubrique } from "@/lib/modeles";
import { ONGLETS_RAPPORT, SousOnglets } from "@/components/SousOnglets";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ChampRapport, type ContexteRapport } from "@/components/ChampRapport";
import { completerAvecMesTaches, envoyer, reprendreLigne } from "./actions";

export const metadata: Metadata = { title: "Mon rapport" };

const LIBELLE_RUBRIQUE_COURT: Record<string, string> = { fait: "Fait", en_cours: "En cours", bloque: "Bloqué", prochaine: "La semaine prochaine", decision: "Décision attendue", autre: "Autre" };

export default async function PageRapport({ searchParams }: { searchParams: Promise<{ envoi?: string; piece?: string; champ?: string }> }) {
  const { envoi, piece, champ: champPiece } = await searchParams;
  const u = await exigerUtilisateur();
  // Les exécutifs ne rédigent pas de rapport : ils lisent ceux de tout le monde.
  if (!redigeUnRapport(u)) redirect("/equipe/rapports");
  const a = await acces(u);
  const semaine = semaineCourante();
  const rapport = await obtenirOuCreerRapport(u.id, semaine);
  const brouillon = rapport.statut === "brouillon";
  const f = formulaireDe(rapport);
  const { horaires, etape } = await calendrierDuRapport(rapport);
  // À l'heure « prêt à relire », le brouillon est complété une fois avec les tâches de la semaine.
  if (brouillon && etape !== "en_preparation" && !rapport.completeLe) await completerBrouillon(rapport);
  const chef = f.some((c) => c.type === "reprise" || c.type === "synthese");
  if (chef && brouillon) await synchroniserReprises(rapport);
  const syntheses = chef && brouillon ? await synchroniserSyntheses(rapport) : null;
  const [lignes, reponses, version, visibles, org, pieces] = await Promise.all([
    lignesDuRapport(rapport.id),
    reponsesDuRapport(rapport.id),
    versionDuRapport(rapport.versionModeleId),
    idsProjetsVisibles(a),
    chargerOrganisation(),
    piecesDuRapport(rapport.id),
  ]);
  const suggestions = new Map<string, number>();
  if (brouillon) for (const c of f.filter((k) => k.rubrique === "decision" && k.partie !== "equipe")) suggestions.set(c.id, (await suggestionsPourDecision(rapport, c)).length);
  const lecteurs = await lecteursDuRapport(u.id, lignes, f);
  const projets = (await tousLesProjetsActifs()).filter((p) => visibles === "tous" || visibles.has(p.id));
  const equipe = chef && brouillon ? { ...(await vueEquipe(rapport)), synthese: syntheses ?? undefined } : null;
  const manquants = brouillon ? await manquantsDuRapport(rapport) : [];
  const remplissables = f.filter((c) => !estDecoratif(c) && !(c.type === "reprise" && (c.reprise === "sante" || c.reprise === "charge")));
  const relues = new Set(rapport.partiesRelues);
  const nRelues = remplissables.filter((c) => relues.has(c.id)).length;
  // Ce qui était prévu la semaine dernière : à reprendre en un clic s'il n'y est pas déjà.
  const precedent = brouillon ? await monRapportPrecedent(u.id, semaine) : null;
  const propres = lignes.filter((l) => l.origines.length === 0);
  const prevues = (precedent?.lignes ?? []).filter((l) => l.partie === "prochaine").map((l) => ({ ...l, dans: dejaReprise(l, propres) }));
  const aReprendre = prevues.filter((l) => !l.dans);
  const cibles = (["fait", "en_cours", "prochaine"] as Rubrique[]).filter((r) => champDeRubrique(f, r));
  const personnes = new Map([...org.personnes.values()].map((p) => [p.id, { initiales: initiales(p), nom: nomComplet(p) }]));
  const parties = f.filter((c) => c.type === "intertitre" && c.partie);
  const prives = f.filter((c) => !estDecoratif(c) && (c.visibilite ?? "tous") !== "tous");
  const recus = equipe?.recus.length ?? 0;
  const x: ContexteRapport = {
    mode: brouillon ? "saisie" : "lecture",
    rapportId: rapport.id,
    lignes,
    reponses,
    relues,
    projets,
    personnes,
    superieur: lecteurs.superieur?.prenom ?? null,
    equipe,
    niveauTitre: f.some((c) => c.type === "intertitre") ? 3 : 2,
    pieces,
    erreurPiece: piece && champPiece ? { champId: champPiece, message: piece.slice(0, 600) } : null,
    suggestions,
    ia: iaDisponible(),
  };
  const limite = horaires.limite ? texteMoment(horaires.limite, semaine) : null;

  return (
    <>
      <Bandeau surtitre={`Semaine du ${dateCourte(semaine)} au ${dateCourte(ajouterJours(semaine, 4))}`} titre="Mon rapport">
        <div className="discret" style={{ marginTop: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 32px", fontSize: 13, lineHeight: "18px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icone nom="cadenas" taille={16} />
            {lecteurs.superieur
              ? `${lecteurs.superieur.nom}${lecteurs.directeurs.length ? " et votre direction lisent" : " lit"} ${prives.length ? "votre rapport" : "tout"} ; chaque chef de projet, sa partie`
              : "Aucun supérieur désigné : voir avec l'administrateur"}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icone nom="etincelle" taille={16} />
            {chef ? `Préparé à partir de vos tâches et de ${recus} rapport${recus > 1 ? "s" : ""} reçu${recus > 1 ? "s" : ""}` : "Préparé à partir de vos tâches de la semaine"}
          </span>
          {version ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icone nom="document" taille={16} />
              Modèle {version.nom} · version {version.numero}
            </span>
          ) : null}
          {brouillon && limite ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }} className={etape === "en_retard" ? "ton-retard" : undefined}>
              <Icone nom="horloge" taille={16} />
              {etape === "en_retard" ? `En retard : à envoyer avant ${limite}` : `À envoyer avant ${limite}`}
            </span>
          ) : null}
          {brouillon ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span className="segments" role="img" aria-label={`${nRelues} champs relus sur ${remplissables.length}`} style={{ width: Math.min(24 * remplissables.length, 200), gridTemplateColumns: `repeat(${remplissables.length}, minmax(0, 1fr))` }}>
                {remplissables.map((c) => (
                  <span key={c.id} data-plein={relues.has(c.id) ? "1" : "0"} />
                ))}
              </span>
              {nRelues}/{remplissables.length} relus
            </span>
          ) : (
            <span>
              Envoyé le {dateCourte(dateLocale(rapport.envoyeLe!))} à {heure(rapport.envoyeLe!)}
            </span>
          )}
        </div>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_RAPPORT} courant="/rapport" label="Rapports" />
        <div className="colonnes">
          <div className="colonne-large" style={{ gap: 20 }}>
            {parties.length > 1 ? (
              <nav aria-label="Parties du rapport" className="filtres">
                {parties.map((p, i) => (
                  <a key={p.id} href={`#partie-${p.id}`} className="filtre">
                    <strong>{i + 1}</strong>&nbsp;{p.libelle}
                  </a>
                ))}
              </nav>
            ) : null}
            {precedent && prevues.length && !aReprendre.length ? (
              <p className="succes" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", margin: 0 }}>
                <Icone nom="coche" taille={16} /> Tout ce que vous aviez prévu la semaine dernière est déjà dans ce rapport.
                <a href={`/rapports/${precedent.rapport.id}`} className="lien-discret">
                  Voir le rapport de la semaine dernière →
                </a>
              </p>
            ) : null}
            {precedent && aReprendre.length && cibles.length ? (
              <section className="carte carte--liste" aria-labelledby="r-precedent" style={{ borderColor: "var(--veille-point)" }}>
                <div className="carte__entete">
                  <h2 id="r-precedent" className="carte__titre">
                    Prévu la semaine dernière · {aReprendre.length} à reprendre
                  </h2>
                  <a href={`/rapports/${precedent.rapport.id}`} className="lien-discret">
                    Voir ce rapport →
                  </a>
                </div>
                <ul className="liste">
                  {prevues.map((l) => (
                    <li key={l.id} className="rangee" style={{ minHeight: 52, flexWrap: "wrap" }}>
                      <span className="etiquette-projet">{l.projetCode ?? "—"}</span>
                      <span className="rangee__texte" style={{ flex: "1 1 220px" }}>
                        <span className="rangee__titre" style={l.dans ? { color: "var(--discret)" } : undefined}>
                          {l.texte}
                        </span>
                        {l.dans ? <span className="rangee__sous ton-ok">Déjà dans « {LIBELLE_RUBRIQUE_COURT[l.dans] ?? l.dans} »</span> : null}
                      </span>
                      {l.dans ? null : (
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label={`Reprendre « ${l.texte} »`}>
                          {cibles.map((r) => (
                            <form key={r} action={reprendreLigne.bind(null, rapport.id, l.id, r)}>
                              <button type="submit" className="bouton-mini">
                                {r === "fait" ? <Icone nom="coche" taille={14} /> : r === "prochaine" ? <Icone nom="reprendre" taille={14} /> : null}
                                {r === "fait" ? "Fait" : r === "en_cours" ? "En cours" : "Reporter"}
                              </button>
                            </form>
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="note" style={{ margin: "10px 0 4px" }}>
                  Un clic ajoute la ligne à la partie choisie de ce rapport.
                </p>
              </section>
            ) : null}
            {f.map((c) => (
              <ChampRapport key={c.id} c={c} x={x} />
            ))}
          </div>
          <div className="colonne-etroite">
            <section className="carte" id="envoi" aria-labelledby="r-dest" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <h2 id="r-dest" className="carte__titre" style={{ margin: 0 }}>
                Destinataire
              </h2>
              {lecteurs.superieur ? (
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span className="mono" style={{ width: 40, height: 40, fontSize: 13 }} aria-hidden="true">
                    {lecteurs.superieur.nom.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                  </span>
                  <span className="rangee__texte">
                    <span className="rangee__titre">{lecteurs.superieur.nom}</span>
                    <span className="rangee__sous">{lecteurs.superieur.poste}</span>
                  </span>
                </div>
              ) : (
                <p className="note">Personne ne reçoit encore votre rapport.</p>
              )}
              {brouillon && chef ? <p className="note" style={{ margin: 0 }}>Un seul envoi : votre travail, puis votre équipe.</p> : null}
              {brouillon ? (
                <p className="note" style={{ margin: 0 }}>
                  {etape === "en_preparation"
                    ? `Prêt à relire ${texteMoment(horaires.pret, semaine)} : le brouillon sera complété avec vos tâches de la semaine.`
                    : rapport.completeLe
                      ? `Complété avec vos tâches le ${dateCourte(dateLocale(rapport.completeLe))} à ${heure(rapport.completeLe)}.`
                      : ""}
                </p>
              ) : null}
              {brouillon ? (
                <form action={completerAvecMesTaches.bind(null, rapport.id)}>
                  <button type="submit" className="bouton-contour" style={{ width: "100%" }}>
                    <Icone nom="reprendre" taille={16} /> Mettre à jour avec mes tâches
                  </button>
                </form>
              ) : null}
              {brouillon && manquants.length ? (
                <div className={envoi === "incomplet" ? "erreur" : "note"} role={envoi === "incomplet" ? "alert" : undefined} style={{ margin: 0 }}>
                  {envoi === "incomplet" ? "Il manque encore : " : "À remplir avant l'envoi : "}
                  {manquants.map((c, i) => (
                    <span key={c.id}>
                      {i ? ", " : ""}
                      <a href={`#c-${c.id}`}>{c.libelle}</a>
                    </span>
                  ))}
                  .
                </div>
              ) : null}
              {brouillon ? (
                <form action={envoyer.bind(null, rapport.id)}>
                  <button type="submit" className="bouton-ambre bouton-ambre--large" disabled={!lecteurs.superieur}>
                    Envoyer{lecteurs.superieur ? ` à ${lecteurs.superieur.prenom}` : ""}
                  </button>
                </form>
              ) : (
                <p className="succes">Rapport envoyé.</p>
              )}
            </section>
            {equipe ? (
              <section className="carte carte--liste" aria-labelledby="r-recus">
                <h2 id="r-recus" className="carte__titre">
                  Rapports reçus · {equipe.recus.length} sur {equipe.subordonnes.length}
                </h2>
                <ul className="liste">
                  {equipe.subordonnes.map((p) => {
                    const r = equipe.recus.find((x) => x.auteurId === p.id);
                    return (
                      <li key={p.id}>
                        <a href={r ? `/rapports/${r.id}` : `/equipe/${p.id}`} className="rangee" style={{ minHeight: 52 }}>
                          <span className="mono mono--petit" aria-hidden="true">
                            {p.initiales}
                          </span>
                          <span className="rangee__texte">
                            <span className="rangee__titre">{p.nom}</span>
                            <span className={`rangee__sous ${r ? "" : "ton-veille"}`}>{r?.envoyeLe ? `Reçu le ${dateCourte(dateLocale(r.envoyeLe))} à ${heure(r.envoyeLe)}` : "Pas encore envoyé"}</span>
                          </span>
                          <span className="rangee__meta">{r ? "Lire" : "Voir"}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
                <p className="note" style={{ margin: "10px 0 4px" }}>
                  Un rapport qui arrive après s'ajoute à votre brouillon ; rien ne change sans vous. Relancer depuis l&apos;onglet <a href="/equipe">Équipe</a>.
                </p>
              </section>
            ) : null}
            <section className="carte carte--liste" aria-labelledby="r-qui">
              <h2 id="r-qui" className="carte__titre">
                Qui voit quoi
              </h2>
              <p className="note" style={{ marginBottom: 8 }}>
                Réglé dans le modèle, champ par champ. Chaque chef de projet ne voit que les lignes et les feux de son projet.
              </p>
              <ul className="liste">
                {lecteurs.superieur ? (
                  <li className="rangee">
                    <span className="rangee__texte">
                      <span className="rangee__titre">{lecteurs.superieur.nom}</span>
                      <span className="rangee__sous">Votre supérieur</span>
                    </span>
                    <span className="rangee__meta" style={{ fontSize: 12 }}>
                      Tout le rapport
                    </span>
                  </li>
                ) : null}
                {lecteurs.directeurs.map((d) => (
                  <li key={d.id} className="rangee">
                    <span className="rangee__texte">
                      <span className="rangee__titre">{d.nom}</span>
                      <span className="rangee__sous">Votre direction{d.poste ? ` · ${d.poste}` : ""}</span>
                    </span>
                    <span className="rangee__meta" style={{ fontSize: 12 }}>
                      {prives.some((c) => c.visibilite === "superieur") ? "Tout, sauf les champs réservés" : "Tout le rapport"}
                    </span>
                  </li>
                ))}
                <li className="rangee">
                  <span className="rangee__texte">
                    <span className="rangee__titre">Les exécutifs</span>
                    <span className="rangee__sous">Toute la banque</span>
                  </span>
                  <span className="rangee__meta" style={{ fontSize: 12 }}>
                    {prives.some((c) => c.visibilite === "superieur") ? "Tout, sauf les champs réservés" : "Tout le rapport"}
                  </span>
                </li>
                {lecteurs.chefs.map((c) => (
                  <li key={c.id} className="rangee">
                    <span className="rangee__texte">
                      <span className="rangee__titre">{c.nom}</span>
                      <span className="rangee__sous">Chef de projet · {c.titre}</span>
                    </span>
                    <span className="rangee__meta" style={{ fontSize: 12 }}>
                      {c.code} · {c.n} ligne{c.n > 1 ? "s" : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {prives.length ? (
                <p className="note" style={{ margin: "10px 0 4px" }}>
                  {prives.map((c) => `« ${c.libelle} » : ${LIBELLE_VISIBILITE[c.visibilite ?? "tous"].court.toLowerCase()}`).join(" ; ")}.
                </p>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
