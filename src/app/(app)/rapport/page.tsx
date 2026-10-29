import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerInterne } from "@/lib/auth/session";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import { ajouterJours, aujourdhui, dateCourte, dateLocale, heure } from "@/lib/dates";
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
  rapportPrecedentLisible,
  reponsesDuRapport,
  semaineCourante,
  suggestionsPourDecision,
  synchroniserReprises,
  synchroniserSyntheses,
  vueEquipe,
} from "@/lib/donnees/rapport";
import { piecesDuRapport } from "@/lib/donnees/pieces";
import { reunionsDeLaSemaine } from "@/lib/donnees/reunions";
import { iaDisponible } from "@/lib/ia";
import { redigeUnRapport } from "@/lib/regles";
import { versionDuRapport } from "@/lib/donnees/modeles";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { chargerOrganisation } from "@/lib/organisation";
import { initiales, nomComplet } from "@/lib/regles";
import { changementsDepuis, resumerRapport } from "@/lib/lecture-rapport";
import { estDecoratif, LIBELLE_VISIBILITE, texteMoment, visibiliteDeLigne, voitVisibilite, type Champ, type Rubrique } from "@/lib/modeles";
import { ONGLETS_RAPPORT, SousOnglets } from "@/components/SousOnglets";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { CodeProjet, LienPersonne } from "@/components/Liens";
import { ChampRapport, type ContexteRapport } from "@/components/ChampRapport";
import { LectureRapport } from "@/components/LectureRapport";
import { LienOuvrir } from "./Lignes";
import { envoyer, reconduireTout, reprendreLigne, reprendreReponse } from "./actions";

export const metadata: Metadata = { title: "Mon rapport" };

const LIBELLE_RUBRIQUE_COURT: Record<string, string> = { fait: "Fait", en_cours: "En cours", bloque: "Bloqué", prochaine: "La semaine prochaine", decision: "Décision attendue", autre: "Autre" };

export default async function PageRapport({ searchParams }: { searchParams: Promise<{ envoi?: string; piece?: string; champ?: string; apercu?: string; repris?: string }> }) {
  const { envoi, piece, champ: champPiece, apercu, repris } = await searchParams;
  const u = await exigerInterne();
  // Les exécutifs ne rédigent pas de rapport : ils lisent ceux de tout le monde.
  if (!redigeUnRapport(u)) redirect("/equipe/rapports");
  const a = await acces(u);
  const semaine = semaineCourante();
  const rapport = await obtenirOuCreerRapport(u.id, semaine);
  // Envoyé : il se lit comme le lit son supérieur (avec « Lu par » et les réponses).
  if (rapport.statut !== "brouillon") redirect(`/rapports/${rapport.id}`);
  const f = formulaireDe(rapport);
  const { horaires, etape } = await calendrierDuRapport(rapport);
  // Le brouillon suit la semaine : à chaque ouverture, il reprend ce qui a été fait depuis (tâches terminées,
  // en cours, bloquées) et les blocages non résolus de la semaine dernière ; ce qu'on a retiré ne revient pas.
  // L'heure « prêt à relire » reste notée (rappels).
  await completerBrouillon(rapport, { marquer: etape !== "en_preparation" && !rapport.completeLe });
  const chef = f.some((c) => c.type === "reprise" || c.type === "synthese");
  if (chef) await synchroniserReprises(rapport);
  const syntheses = chef ? await synchroniserSyntheses(rapport) : null;
  const [lignes, reponses, version, visibles, org, pieces, frais] = await Promise.all([
    lignesDuRapport(rapport.id),
    reponsesDuRapport(rapport.id),
    versionDuRapport(rapport.versionModeleId),
    idsProjetsVisibles(a),
    chargerOrganisation(),
    piecesDuRapport(rapport.id),
    obtenirOuCreerRapport(u.id, semaine),
  ]);
  const suggestions = new Map<string, number>();
  for (const c of f.filter((k) => k.rubrique === "decision" && k.partie !== "equipe")) suggestions.set(c.id, (await suggestionsPourDecision(rapport, c)).length);
  const lecteurs = await lecteursDuRapport(u.id, lignes, f);
  const projets = (await tousLesProjetsActifs()).filter((p) => visibles === "tous" || visibles.has(p.id));
  const equipe = chef ? { ...(await vueEquipe(rapport)), synthese: syntheses ?? undefined } : null;
  const manquants = await manquantsDuRapport(rapport);
  const remplissables = f.filter((c) => !estDecoratif(c) && !(c.type === "reprise" && (c.reprise === "sante" || c.reprise === "charge")));
  const relues = new Set(rapport.partiesRelues);
  const nRelues = remplissables.filter((c) => relues.has(c.id)).length;
  const parties = f.filter((c) => c.type === "intertitre" && c.partie);
  const prives = f.filter((c) => !estDecoratif(c) && (c.visibilite ?? "tous") !== "tous");
  const recus = equipe?.recus.length ?? 0;
  const reunions = f.some((c) => c.type === "reunions") ? await reunionsDeLaSemaine(u.id, rapport.semaine) : null;
  const sup = lecteurs.superieur;
  const x: ContexteRapport = {
    mode: "saisie",
    rapportId: rapport.id,
    lignes,
    reponses,
    relues,
    projets,
    personnes: new Map([...org.personnes.values()].map((p) => [p.id, { initiales: initiales(p), nom: nomComplet(p) }])),
    superieur: sup?.prenom ?? null,
    equipe,
    niveauTitre: f.some((c) => c.type === "intertitre") ? 3 : 2,
    pieces,
    erreurPiece: piece && champPiece ? { champId: champPiece, message: piece.slice(0, 600) } : null,
    suggestions,
    ia: iaDisponible(),
    projetsVisibles: visibles,
    codesProjets: new Map(projets.map((p) => [p.code, { id: p.id, titre: p.titre }])),
    reunions,
    semaine: rapport.semaine,
  };
  const limite = horaires.limite ? texteMoment(horaires.limite, semaine) : null;
  const surtitre = `Semaine du ${dateCourte(semaine)} au ${dateCourte(ajouterJours(semaine, 4))}`;
  const majLe = frais.majLe;

  const BoutonEnvoyer = ({ court }: { court?: boolean }) => (
    <form action={envoyer.bind(null, rapport.id)} className="envoi__form">
      <button type="submit" className="bouton-ambre" disabled={!sup}>
        {court || !sup ? "Envoyer" : `Envoyer à ${sup.prenom}`}
      </button>
    </form>
  );
  const Manquants = manquants.length ? (
    <div className={envoi === "incomplet" ? "erreur" : "note"} role={envoi === "incomplet" ? "alert" : undefined} style={{ margin: 0 }}>
      {envoi === "incomplet" ? "Il manque encore : " : "À remplir avant l'envoi : "}
      {manquants.map((c, i) => (
        <span key={c.id}>
          {i ? ", " : ""}
          <a href={apercu ? `/rapport#c-${c.id}` : `#c-${c.id}`}>{c.libelle}</a>
        </span>
      ))}
      .
    </div>
  ) : null;

  // ---------- Aperçu : le rapport tel que le supérieur le lira ----------
  if (apercu === "1") {
    const champs = new Map(f.map((c) => [c.id, c]));
    // Ce que lit le supérieur : tous les champs, sans les éléments retirés ni ce qui reste à l'auteur.
    const lues = lignes.filter((l) => {
      const c = champs.get(l.champId);
      return !!c && !l.retiree && voitVisibilite("superieur", visibiliteDeLigne(c, l));
    });
    const precedent = await rapportPrecedentLisible(a, rapport);
    const resume = resumerRapport(f, lues, reponses, semaine, reunions);
    const resumePrecedent = precedent ? resumerRapport(precedent.formulaire, precedent.lignes, precedent.reponses, precedent.rapport.semaine) : null;
    const xl: ContexteRapport = {
      ...x,
      mode: "lecture",
      lignes: lues,
      precedent: resumePrecedent ? { sante: new Map([...resumePrecedent.sante].map(([k, v]) => [k, v.valeur])) } : null,
    };
    return (
      <>
        <Bandeau
          surtitre={`Aperçu · ${surtitre}`}
          titre={
            <span className="titre-avatar">
              <span className="mono titre-avatar__mono" aria-hidden="true">
                {initiales(u)}
              </span>
              {nomComplet(u)}
            </span>
          }
          retour={
            <a href="/rapport" className="retour">
              <Icone nom="chevron-gauche" taille={18} /> Revenir au brouillon
            </a>
          }
        >
          <p className="discret tete-lecture">
            <span className="pastille-envoi pastille-envoi--apercu">Aperçu · brouillon, pas encore transmis</span>
            <span>{sup ? `Tel que ${sup.nom} le lira` : "Aucun supérieur désigné"}</span>
            {limite ? <span>À envoyer avant {limite}</span> : null}
          </p>
        </Bandeau>
        <div className="page page--lecture">
          <LectureRapport
            formulaire={f}
            x={xl}
            resume={resume}
            precedent={resumePrecedent}
            changements={resumePrecedent ? changementsDepuis(resume, resumePrecedent) : []}
            lienPrecedent={precedent ? `/rapports/${precedent.rapport.id}` : null}
            complet
            cote={
              <section className="carte envoi" aria-label="Envoyer">
                <p className="note" style={{ margin: 0 }}>
                  {sup ? `${sup.prenom} recevra ce rapport en alerte ; chaque chef de projet, ses lignes.` : "Personne ne reçoit encore votre rapport : voir avec l'administrateur."}
                </p>
                {Manquants}
                <div className="envoi__boutons">
                  <a href="/rapport" className="bouton-contour">
                    Modifier
                  </a>
                  <BoutonEnvoyer />
                </div>
              </section>
            }
          />
        </div>
        <div className="barre-envoi" aria-label="Envoyer le rapport">
          <a href="/rapport" className="bouton-contour">
            Modifier
          </a>
          <BoutonEnvoyer court />
        </div>
      </>
    );
  }

  // ---------- La semaine dernière : ce qui était prévu, en cours, bloqué, les commentaires ----------
  const precedent = await monRapportPrecedent(u.id, semaine);
  const propres = lignes.filter((l) => l.origines.length === 0);
  const ecartees = new Set(rapport.ecartees);
  const dejaLa = (l: { id: string; texte: string; tacheId: string | null }) => {
    const ici = propres.find((p) => p.repriseDeId === l.id);
    return ici ? (ici.partie ?? "autre") : dejaReprise(l, propres);
  };
  const avec = (r: Rubrique) => !!champDeRubrique(f, r);
  const prevues = (precedent?.lignes ?? []).filter((l) => l.partie === "prochaine").map((l) => ({ ...l, dans: dejaLa(l) }));
  const enCours = (precedent?.lignes ?? []).filter((l) => l.partie === "en_cours").map((l) => ({ ...l, dans: dejaLa(l) }));
  const bloques = (precedent?.lignes ?? [])
    .filter((l) => (l.partie === "bloque" || l.partie === "decision") && !l.resolu)
    .map((l) => {
      const ici = propres.find((p) => p.repriseDeId === l.id) ?? (l.tacheId ? propres.find((p) => p.tacheId === l.tacheId && p.partie === l.partie) : undefined);
      return { ...l, ici, retire: !ici && ecartees.has(`r:${l.id}`) };
    });
  const commentaires = precedent
    ? precedent.reponses
        .filter((r) => !r.projetId && r.valeur.trim())
        .map((r) => ({ r, c: f.find((c) => c.id === r.champId && (c.type === "texte" || c.type === "texte_long") && c.partie !== "equipe") }))
        .filter((k): k is { r: (typeof k)["r"]; c: Champ } => !!k.c)
        .map(({ r, c }) => ({ c, texte: r.valeur.trim(), vide: !reponses.some((x) => x.champId === c.id && !x.projetId && x.valeur.trim()) }))
    : [];
  const rien = !prevues.length && !enCours.length && !bloques.length && !commentaires.length;

  const LignePrecedente = ({ l, cibles, note }: { l: { id: string; texte: string; projetId: string | null; projetCode: string | null; projetTitre: string | null }; cibles?: { r: Rubrique; libelle: string }[]; note?: string | null }) => (
    <li className={`prec-ligne${note ? " prec-ligne--faite" : ""}`}>
      <CodeProjet id={l.projetId} code={l.projetCode ?? "—"} titre={l.projetTitre ?? "Sans projet"} visible={!!l.projetId && (visibles === "tous" || visibles.has(l.projetId))} />
      <span className="prec-ligne__texte">
        {l.texte}
        {note ? <span className="prec-ligne__note"> · {note}</span> : null}
      </span>
      {cibles?.length ? (
        <span className="prec-ligne__actions" role="group" aria-label={`Reprendre « ${l.texte} »`}>
          {cibles.map((k) => (
            <form key={k.r} action={reprendreLigne.bind(null, rapport.id, l.id, k.r)}>
              <button type="submit" className="bouton-mini">
                {k.libelle}
              </button>
            </form>
          ))}
        </span>
      ) : null}
    </li>
  );

  return (
    <>
      <Bandeau surtitre={surtitre} titre="Mon rapport">
        <p className="discret tete-rapport">
          {/* Statut du rapport, en clair (29 octobre 2026) : tant qu'il n'est pas envoyé, c'est un brouillon. */}
          <span className="pastille-envoi pastille-envoi--brouillon">Brouillon · pas encore transmis</span>
          <span>
            {sup ? (
              <>
                Pour <strong>{sup.nom}</strong>
              </>
            ) : (
              "Aucun supérieur désigné : voir avec l'administrateur"
            )}{" "}
            · <LienOuvrir cible="qui-lit">qui lit quoi ?</LienOuvrir>
          </span>
          {limite ? (
            <span className={etape === "en_retard" ? "ton-retard-clair" : undefined}>
              {etape === "en_retard" ? "En retard : à envoyer avant " : "À envoyer avant "}
              <strong>{limite}</strong>
            </span>
          ) : null}
          <span>
            {etape === "en_preparation"
              ? `Prêt à relire ${texteMoment(horaires.pret, semaine)}`
              : `${chef ? `Préparé avec vos tâches et ${recus} rapport${recus > 1 ? "s" : ""} reçu${recus > 1 ? "s" : ""}` : "Préparé avec vos tâches"} · mis à jour ${dateLocale(majLe) === aujourdhui() ? "" : `le ${dateCourte(dateLocale(majLe))} `}à ${heure(majLe)}`}
          </span>
        </p>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_RAPPORT} courant="/rapport" label="Rapports" />
        {repris === "1" ? (
          <p className="succes" role="status" style={{ margin: 0 }}>
            Votre rapport est redevenu un brouillon{sup ? ` : ${sup.prenom} le recevra à votre nouvel envoi` : ""}. Complétez-le ou corrigez-le, puis renvoyez-le.
          </p>
        ) : null}
        <div className="colonnes saisie-rapport">
          <div className="colonne-large saisie-rapport__corps">
            {parties.length > 1 ? (
              <nav aria-label="Parties du rapport" className="filtres">
                {parties.map((p, i) => (
                  <a key={p.id} href={`#partie-${p.id}`} className="filtre">
                    <strong>{i + 1}</strong>&nbsp;{p.libelle}
                  </a>
                ))}
              </nav>
            ) : null}
            {f.map((c) => (
              <ChampRapport key={c.id} c={c} x={x} />
            ))}
          </div>
          <div className="colonne-etroite saisie-rapport__cote">
            <section className="carte envoi" id="envoi" aria-label="Relire et envoyer">
              <div className="envoi__progression">
                <span>
                  {nRelues} partie{nRelues > 1 ? "s" : ""} relue{nRelues > 1 ? "s" : ""} sur {remplissables.length}
                </span>
                <span className="envoi__jauge" role="img" aria-label={`${nRelues} parties relues sur ${remplissables.length}`}>
                  <span style={{ width: `${remplissables.length ? Math.round((nRelues / remplissables.length) * 100) : 0}%` }} />
                </span>
              </div>
              <div className="envoi__boutons">
                <a href="/rapport?apercu=1" className="bouton-contour">
                  Aperçu
                </a>
                <BoutonEnvoyer />
              </div>
              {Manquants}
              <p className="note" style={{ margin: 0 }}>
                {sup ? `L'aperçu montre le rapport tel que ${sup.prenom} le lira.` : "Personne ne reçoit encore votre rapport."}
                {chef ? " Un seul envoi : votre travail, puis votre équipe." : ""}
              </p>
            </section>
            {precedent && !rien ? (
              <section className="carte semaine-derniere" aria-labelledby="r-precedent">
                <div className="carte__entete">
                  <h2 id="r-precedent" className="carte__titre">
                    La semaine dernière
                  </h2>
                  <a href={`/rapports/${precedent.rapport.id}`} className="lien-discret">
                    Ouvrir le rapport
                  </a>
                </div>
                {prevues.length ? (
                  <>
                    <h3 className="semaine-derniere__titre">
                      Prévu
                      {avec("prochaine") && prevues.some((l) => !l.dans) ? (
                        <form action={reconduireTout.bind(null, rapport.id, "prochaine")}>
                          <button type="submit" className="lien-bouton">
                            Tout reconduire
                          </button>
                        </form>
                      ) : null}
                    </h3>
                    <ul className="liste">
                      {prevues.map((l) => (
                        <LignePrecedente
                          key={l.id}
                          l={l}
                          note={l.dans ? `déjà « ${LIBELLE_RUBRIQUE_COURT[l.dans] ?? l.dans} »` : null}
                          cibles={
                            l.dans
                              ? []
                              : [
                                  ...(avec("fait") ? [{ r: "fait" as Rubrique, libelle: "Fait" }] : []),
                                  ...(avec("en_cours") ? [{ r: "en_cours" as Rubrique, libelle: "En cours" }] : []),
                                  ...(avec("prochaine") ? [{ r: "prochaine" as Rubrique, libelle: "Reconduire" }] : []),
                                ]
                          }
                        />
                      ))}
                    </ul>
                  </>
                ) : null}
                {enCours.length ? (
                  <>
                    <h3 className="semaine-derniere__titre">
                      En cours
                      {avec("en_cours") && enCours.some((l) => !l.dans) ? (
                        <form action={reconduireTout.bind(null, rapport.id, "en_cours")}>
                          <button type="submit" className="lien-bouton">
                            Tout reconduire
                          </button>
                        </form>
                      ) : null}
                    </h3>
                    <ul className="liste">
                      {enCours.map((l) => (
                        <LignePrecedente
                          key={l.id}
                          l={l}
                          note={l.dans ? (l.dans === "en_cours" ? "déjà repris" : `déjà « ${LIBELLE_RUBRIQUE_COURT[l.dans] ?? l.dans} »`) : null}
                          cibles={
                            l.dans
                              ? []
                              : [...(avec("fait") ? [{ r: "fait" as Rubrique, libelle: "Fait" }] : []), ...(avec("en_cours") ? [{ r: "en_cours" as Rubrique, libelle: "Reconduire" }] : [])]
                          }
                        />
                      ))}
                    </ul>
                  </>
                ) : null}
                {bloques.length ? (
                  <>
                    <h3 className="semaine-derniere__titre">Bloqué, décisions</h3>
                    <ul className="liste">
                      {bloques.map((l) => (
                        <LignePrecedente
                          key={l.id}
                          l={l}
                          note={l.ici ? (l.ici.resolu ? "reconduit, résolu cette semaine" : "reconduit automatiquement") : l.retire ? "retiré de ce rapport" : l.tacheId ? "levé : la tâche n'est plus bloquée" : "non reconduit"}
                          cibles={l.retire && l.partie && avec(l.partie as Rubrique) ? [{ r: l.partie as Rubrique, libelle: "Remettre" }] : []}
                        />
                      ))}
                    </ul>
                  </>
                ) : null}
                {commentaires.length ? (
                  <>
                    <h3 className="semaine-derniere__titre">Commentaires</h3>
                    <ul className="liste">
                      {commentaires.map(({ c, texte, vide }) => (
                        <li key={c.id} className={`prec-ligne${vide ? "" : " prec-ligne--faite"}`}>
                          <span className="prec-ligne__texte">
                            <span className="prec-ligne__champ">{c.libelle}</span>« {texte.length > 140 ? `${texte.slice(0, 137)}…` : texte} »{vide ? null : <span className="prec-ligne__note"> · déjà rempli cette semaine</span>}
                          </span>
                          {vide ? (
                            <span className="prec-ligne__actions">
                              <form action={reprendreReponse.bind(null, rapport.id, c.id)}>
                                <button type="submit" className="bouton-mini" aria-label={`Reprendre le texte de « ${c.libelle} »`}>
                                  Reprendre
                                </button>
                              </form>
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <p className="note" style={{ margin: "12px 0 0" }}>
                  Un blocage ou une décision non marqué « Résolu » revient de lui-même la semaine suivante.
                </p>
              </section>
            ) : null}
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
                        <a href={r ? `/rapports/${r.id}` : `/personnes/${p.id}`} className="rangee" style={{ minHeight: 52 }}>
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
            <details className="carte qui-lit" id="qui-lit">
              <summary className="carte__titre">Qui lit quoi</summary>
              <p className="note" style={{ margin: "8px 0" }}>
                Réglé dans le modèle, champ par champ. Chaque chef de projet ne voit que les lignes et les feux de son projet.
              </p>
              <ul className="liste">
                {sup ? (
                  <li className="rangee">
                    <span className="rangee__texte">
                      <span className="rangee__titre">
                        <LienPersonne id={sup.id}>{sup.nom}</LienPersonne>
                      </span>
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
                      <span className="rangee__titre">
                        <LienPersonne id={d.id}>{d.nom}</LienPersonne>
                      </span>
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
                      <span className="rangee__titre">
                        <LienPersonne id={c.id}>{c.nom}</LienPersonne>
                      </span>
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
              {version ? (
                <p className="note" style={{ margin: "10px 0 4px" }}>
                  Modèle {version.nom} · version {version.numero}
                </p>
              ) : null}
            </details>
          </div>
        </div>
      </div>
      <div className="barre-envoi" aria-label="Envoyer le rapport">
        <a href="/rapport?apercu=1" className="bouton-contour">
          Aperçu
        </a>
        <BoutonEnvoyer court />
      </div>
    </>
  );
}

