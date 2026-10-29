import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces, auteursLignesVisibles, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, dateCourte, dateLocale, dateLongue, echeanceRelative, ecartJours, heure } from "@/lib/dates";
import { ficheProjet } from "@/lib/donnees/projets";
import { membresDuProjet } from "@/lib/donnees/gestion";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { LigneMiseAJour } from "@/components/LigneMiseAJour";
import { DocumentsProjet } from "./Documents";
import { documentsDuProjet, peutDeposerDocument } from "@/lib/donnees/documents";
import { LIBELLE_STATUT_PROJET, peutDecider, peutGererProjet, STATUTS_ACCEPTES } from "@/lib/projets";
import { ajouter, archiver, decider, retirer } from "../gestion-actions";
import { lignesDuProjetCetteSemaine } from "@/lib/donnees/rapport";
import { Anneau, Bandeau } from "@/components/Bandeau";
import { CocheSeule } from "@/components/CaseTache";
import { Icone } from "@/components/Icone";
import { LienPersonne } from "@/components/Liens";
import { ChoixPersonne } from "@/components/ChoixPersonne";
import { changerIndicateur, mettreAJourProjet } from "./actions";
import { OngletsVues } from "./commun";
import { avancementParPeriode } from "@/lib/donnees/graphiques";
import { ecart, moisDebutExercice, planBilan } from "@/lib/bilan";
import { aLa, etiquettesAxe, nomsDesPeriodes } from "@/lib/bilan-libelles";
import { periodePreferee } from "@/lib/periode-preferee";
import { ChoixPeriode } from "@/components/ChoixPeriode";
import { reportsFinDe } from "@/lib/donnees/reports-fin";
import { Courbes } from "@/components/Courbes";
import { FriseReports } from "@/components/Graphiques";

export const metadata: Metadata = { title: "Projet" };

const SANTE = {
  en_retard: { texte: "En retard", classe: "ton-retard" },
  a_surveiller: { texte: "À surveiller", classe: "ton-veille" },
  dans_les_temps: { texte: "Dans les temps", classe: "ton-ok" },
} as const;
const ETAT_IND = { atteint: "Atteint", en_cours: "En cours", a_venir: "À venir" } as const;

export default async function PageProjet({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ propose?: string; erreur?: string; doc?: string; docOk?: string; docRetire?: string; vue?: string; p?: string }> }) {
  const { id } = await params;
  const { propose, erreur, doc, docOk, docRetire, vue: vueAvancement, p: pAvancement } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  await exigerProjetVisible(a, id);
  const f = await ficheProjet(id);
  const p = f.projet;
  // Chef du projet, directeur de la direction concernée (le projet lui est visible), exécutifs.
  const peutModifier = peutGererProjet({ moiId: u.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p);
  const demande = p.statut === "requete";
  const refuse = p.statut === "refuse";
  const actif = !demande && !refuse && !p.archiveLe;
  const org = await chargerOrganisation();
  const membres = await membresDuProjet(id);
  const nom = (pid: string | null) => (pid && org.personnes.get(pid) ? nomComplet(org.personnes.get(pid)!) : null);
  const personnesActives = [...org.personnes.values()]
    .filter((x) => x.actif)
    .sort((x, y) => x.nom.localeCompare(y.nom, "fr"))
    .map((x) => ({ id: x.id, nom: nomComplet(x), externe: x.externe, organisation: x.organisation }));
  const chefP = p.chefProjetId ? org.personnes.get(p.chefProjetId) : undefined;
  const referentP = p.referentId ? org.personnes.get(p.referentId) : undefined;
  /** « hors division · DTI » sous le nom d'une personne hors division. */
  const hors = (id: string | null | undefined) => {
    const x = id ? org.personnes.get(id) : undefined;
    return x?.externe ? `Hors division${x.organisation ? ` · ${x.organisation}` : ""}` : null;
  };
  const ouvertesParPersonne = new Map(f.equipe.map((m) => [m.id, m.detail]));
  const auteurs = auteursLignesVisibles(a, id);
  const [documents, peutDeposer] = await Promise.all([documentsDuProjet(id), peutDeposerDocument(a, p)]);
  const nomsDeposants = new Map(documents.filter((d) => d.deposeParId).map((d) => [d.deposeParId!, nom(d.deposeParId) ?? "—"]));
  const rapports = auteurs ? await lignesDuProjetCetteSemaine(id, auteurs) : null;
  const jour = aujourdhui();
  const atteints = f.indicateurs.filter((i) => i.etat === "atteint").length;
  // Avancement sur la période choisie (le même sélecteur que le bilan), comparé à la période d'avant.
  const debutExercice = moisDebutExercice(process.env.EXERCICE_DEBUT_MOIS);
  const planAv = planBilan(vueAvancement ?? (await periodePreferee("semaine")), pAvancement, jour, debutExercice);
  const [avancement, reports] = await Promise.all([avancementParPeriode(id, [planAv.actuel, planAv.precedent, ...planAv.serie], jour), reportsFinDe(id)]);
  const nomsAv = nomsDesPeriodes(planAv, debutExercice);
  const etiquettesAv = etiquettesAxe(planAv);
  const pointsAv = avancement.slice(2);
  const comparerAv = !avancement[1].avant;
  const ancienne = f.dernier?.dateFinPrevue ?? null;
  const glissement = ancienne && p.dateFinPrevue ? Math.round(ecartJours(ancienne, p.dateFinPrevue) / 7) : 0;

  const dates = [
    { libelle: "Date d'entrée", date: p.dateEntree },
    { libelle: "Fin prévue initialement", date: p.dateFinInitiale, barre: p.dateFinInitiale !== p.dateFinPrevue },
    ...(ancienne ? [{ libelle: "Fin prévue au dernier rapport", date: ancienne, barre: ancienne !== p.dateFinPrevue }] : []),
    { libelle: "Fin prévue aujourd'hui", date: p.dateFinPrevue, actuelle: true },
    { libelle: "Lancement prévu", date: p.dateLancementPrevue },
  ];

  return (
    <>
      <Bandeau
        surtitre={[demande ? "Demande de projet" : refuse ? "Demande refusée" : p.strategique ? "Stratégique" : "Projet", p.division ? p.division : null, p.archiveLe ? "Archivé" : null, actif || p.archiveLe ? LIBELLE_STATUT_PROJET[p.statut] : null, p.programme].filter(Boolean).join(" · ")}
        titre={p.titre}
        retour={
          <a href="/projets" className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Projets
          </a>
        }
      >
        <div className="chiffres">
          <Anneau fait={atteints} total={f.indicateurs.length} legende="indicateurs" label={`${atteints} indicateurs vérifiables atteints sur ${f.indicateurs.length}`} />
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "12px 48px" }}>
            <div className="chiffre">
              <dt>fin prévue{ancienne && ancienne !== p.dateFinPrevue ? ` · ${dateCourte(ancienne)} au dernier rapport` : ""}</dt>
              <dd>{dateCourte(p.dateFinPrevue)}</dd>
            </div>
            <div className={`chiffre ${p.sante === "en_retard" ? "chiffre--retard" : p.sante === "a_surveiller" ? "chiffre--veille" : ""}`}>
              <dt>{SANTE[p.sante].texte.toLowerCase()}</dt>
              <dd>
                {glissement > 0 ? (
                  <>
                    +{glissement}
                    <small>&nbsp;sem.</small>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="chiffre">
              <dt>chef de projet{hors(p.chefProjetId) ? ` · ${hors(p.chefProjetId)!.toLowerCase()}` : ""}</dt>
              <dd style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, lineHeight: "54px", fontWeight: 300 }}>{f.chef ? <LienPersonne id={p.chefProjetId}>{f.chef.nom}</LienPersonne> : "—"}</dd>
            </div>
            {referentP ? (
              <div className="chiffre">
                <dt>référent DPO</dt>
                <dd style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, lineHeight: "54px", fontWeight: 300 }}>
                  <LienPersonne id={referentP.id}>{nomComplet(referentP)}</LienPersonne>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </Bandeau>
      <div className="page">
        {propose ? (
          <p className="succes" role="status">
            Votre proposition est envoyée à la direction. Vous serez prévenu de sa décision.
          </p>
        ) : null}
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : null}
        {demande || refuse ? (
          <section className="carte" id="decision" aria-labelledby="p-demande" style={{ display: "flex", flexDirection: "column", gap: 14, borderColor: demande ? "var(--veille-point)" : undefined }}>
            <h2 id="p-demande" className="carte__titre" style={{ margin: 0 }}>
              {demande ? "Demande de projet" : "Demande refusée"}
            </h2>
            <p className="note" style={{ margin: 0 }}>
              {nom(p.demandeParId) ? (
                <>
                  Proposé par <LienPersonne id={p.demandeParId}>{nom(p.demandeParId)}</LienPersonne>
                </>
              ) : (
                "Proposé"
              )}
              {p.demandeLe ? ` le ${dateLongue(dateLocale(p.demandeLe))}` : ""}
              {p.chefProjetId && demande ? (
                <>
                  {" · chef de projet suggéré : "}
                  <LienPersonne id={p.chefProjetId}>{nom(p.chefProjetId)}</LienPersonne>
                </>
              ) : null}
            </p>
            {p.justification ? <p style={{ margin: 0, whiteSpace: "pre-line", fontSize: 15, lineHeight: "22px" }}>{p.justification}</p> : null}
            {refuse ? (
              <p className="erreur" style={{ margin: 0 }}>
                Refusée
                {nom(p.decisionParId) ? (
                  <>
                    {" par "}
                    <LienPersonne id={p.decisionParId}>{nom(p.decisionParId)}</LienPersonne>
                  </>
                ) : null}
                {p.decisionLe ? ` le ${dateCourte(dateLocale(p.decisionLe))}` : ""} : {p.motifDecision}
              </p>
            ) : null}
            {demande && peutDecider(a) ? (
              <div className="colonnes" style={{ alignItems: "flex-start" }}>
                <form action={decider.bind(null, p.id)} style={{ flex: "2 1 320px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <input type="hidden" name="decision" value="accepter" />
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Accepter</h3>
                  <ChoixPersonne id="d-chef" name="chefProjetId" prefixe="chef" libelle="Chef de projet" personnes={personnesActives} defaut={p.chefProjetId} vide="Choisir" />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
                    <div className="champ" style={{ flex: "1 1 180px" }}>
                      <label htmlFor="d-division">Division du projet</label>
                      <input id="d-division" name="division" defaultValue={p.division} maxLength={120} placeholder="Vide : la DPO" />
                    </div>
                    <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                      <ChoixPersonne
                        id="d-referent"
                        name="referentId"
                        prefixe="referent"
                        libelle="Référent DPO"
                        personnes={personnesActives.filter((x) => !x.externe)}
                        defaut={p.referentId}
                        vide="Aucun"
                        horsDivision={false}
                        aide="Si le chef de projet est hors division."
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <div className="champ" style={{ flex: "1 1 150px" }}>
                      <label htmlFor="d-statut">Statut de départ</label>
                      <select id="d-statut" name="statut" defaultValue="en_attente">
                        {STATUTS_ACCEPTES.filter((x) => x !== "finalise").map((x) => (
                          <option key={x} value={x}>
                            {LIBELLE_STATUT_PROJET[x]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="champ" style={{ flex: "1 1 150px" }}>
                      <label htmlFor="d-entree">Date d&apos;entrée</label>
                      <input id="d-entree" name="dateEntree" type="date" defaultValue={jour} />
                    </div>
                    <div className="champ" style={{ flex: "1 1 150px" }}>
                      <label htmlFor="d-fin">Fin prévue</label>
                      <input id="d-fin" name="dateFinPrevue" type="date" defaultValue={p.dateFinPrevue ?? ""} />
                    </div>
                  </div>
                  <label className="role-manuel">
                    <span className="rangee__texte">
                      <span className="rangee__titre">Projet stratégique</span>
                    </span>
                    <input type="checkbox" className="interrupteur" name="strategique" defaultChecked={p.strategique} />
                  </label>
                  <div className="champ">
                    <label htmlFor="d-note">Note pour le demandeur (facultatif)</label>
                    <input id="d-note" name="motif" maxLength={1000} />
                  </div>
                  <div>
                    <button type="submit" className="bouton-ambre">
                      Accepter le projet
                    </button>
                  </div>
                </form>
                <form action={decider.bind(null, p.id)} style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <input type="hidden" name="decision" value="refuser" />
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Refuser</h3>
                  <div className="champ">
                    <label htmlFor="d-motif">Motif (le demandeur le lira)</label>
                    <textarea id="d-motif" name="motif" rows={4} required maxLength={1000} />
                  </div>
                  <div>
                    <button type="submit" className="bouton-contour">
                      Refuser la demande
                    </button>
                  </div>
                </form>
              </div>
            ) : demande ? (
              <p className="note" style={{ margin: 0 }}>
                En attente de la décision d&apos;un directeur ou d&apos;un exécutif.
              </p>
            ) : null}
          </section>
        ) : null}
        {p.archiveLe ? (
          <div className="note" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
            <span>
              Projet archivé le {dateCourte(dateLocale(p.archiveLe))}
              {nom(p.archiveParId) ? ` par ${nom(p.archiveParId)}` : ""} : il n&apos;est plus dans le portefeuille, mais reste lisible.
            </span>
            {peutModifier ? (
              <form action={archiver.bind(null, p.id, false)}>
                <button type="submit" className="bouton-mini">
                  Désarchiver
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
        {p.sante !== "dans_les_temps" && p.santeMotif ? (
          <p className={`note-sante ${p.sante === "en_retard" ? "note-sante--retard" : ""}`}>
            <strong>{SANTE[p.sante].texte}</strong>
            {p.santeLe ? ` depuis le ${dateCourte(dateLocale(p.santeLe))}` : ""} : {p.santeMotif}
          </p>
        ) : null}
        <div className="ligne-actions">
          <OngletsVues projetId={p.id} vue="apercu" sansCharge={!!u.externe} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {peutModifier ? (
              <a href={`/projets/${p.id}/modifier`} className="bouton-contour">
                <Icone nom="modifier" taille={16} /> Modifier le projet
              </a>
            ) : null}
            {actif ? (
              <a href={`/taches/nouvelle?projet=${p.id}&retour=${encodeURIComponent(`/projets/${p.id}`)}`} className="bouton-contour">
                <Icone nom="ajouter" taille={16} /> Nouvelle tâche
              </a>
            ) : null}
          </div>
        </div>
        <div className="colonnes colonnes--tablette">
          <div className="colonne-large">
            <section className="carte carte--liste" aria-labelledby="p-ind">
              <h2 id="p-ind" className="carte__titre">
                Indicateurs vérifiables
              </h2>
              <ol className="liste">
                {f.indicateurs.map((i) => (
                  <li key={i.id} style={{ display: "flex", alignItems: "center", gap: 16, minHeight: 48 }}>
                    <span style={{ width: 18, flex: "none", fontSize: 12, color: "var(--discret)", textAlign: "right" }}>{i.ordre}</span>
                    <span
                      role="img"
                      aria-label={ETAT_IND[i.etat]}
                      style={{
                        width: 18,
                        height: 18,
                        flex: "none",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--case-coche)",
                        ...(i.etat === "atteint" ? { background: "var(--case-fait)" } : i.etat === "en_cours" ? { border: "1.5px dashed var(--veille-point)" } : { border: "1.5px solid var(--case)" }),
                      }}
                    >
                      {i.etat === "atteint" ? <CocheSeule /> : null}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "20px", color: i.etat === "a_venir" ? "var(--discret)" : undefined }}>
                      {i.libelle}
                      {i.prevuLe ? (
                        <span className={`indicateur__date${i.etat !== "atteint" && i.prevuLe < aujourdhui() ? " ton-retard" : ""}`}> · prévu le {dateCourte(i.prevuLe)}</span>
                      ) : null}
                    </span>
                    {peutModifier && actif ? (
                      <form key={`${i.id}-${i.etat}`} action={changerIndicateur.bind(null, p.id, i.id)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <label className="visuellement-cache" htmlFor={`ind-${i.id}`}>
                          État de « {i.libelle} »
                        </label>
                        <select id={`ind-${i.id}`} name="etat" defaultValue={i.etat} className="saisie saisie--compacte">
                          <option value="a_venir">À venir</option>
                          <option value="en_cours">En cours</option>
                          <option value="atteint">Atteint</option>
                        </select>
                        <button type="submit" className="bouton-icone" style={{ width: 32, height: 32 }} aria-label="Enregistrer" title="Enregistrer">
                          <Icone nom="coche" taille={16} />
                        </button>
                      </form>
                    ) : (
                      <span className={i.etat === "en_cours" ? "ton-veille" : "ton-discret"} style={{ fontSize: 12 }}>
                        {ETAT_IND[i.etat]}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            {pointsAv.some((x) => !x.avant) ? (
              <section className="carte" aria-labelledby="p-avancement" id="avancement" style={{ scrollMarginTop: 80 }}>
                <h2 id="p-avancement" className="carte__titre" style={{ marginBottom: 4 }}>
                  Avancement
                </h2>
                <ChoixPeriode plan={planAv} noms={nomsAv} lien={(v, pp) => `/projets/${id}?vue=${v}${pp ? `&p=${pp}` : ""}#avancement`} comparer={comparerAv} />
                <p className="note" style={{ margin: "0 0 12px" }}>
                  {avancement[0].terminees} tâche{avancement[0].terminees > 1 ? "s" : ""} terminée{avancement[0].terminees > 1 ? "s" : ""} {nomsAv.actuel.charAt(0).toLowerCase() + nomsAv.actuel.slice(1)}
                  {comparerAv ? ` (${ecart(avancement[0].terminees, avancement[1].terminees) ?? "—"} par rapport ${aLa(nomsAv.avantCourt)})` : ""} ; {avancement[0].faites} sur {avancement[0].total} depuis le début. Quand les
                  deux courbes s&apos;écartent, le travail s&apos;ajoute plus vite qu&apos;il ne se termine.
                </p>
                <Courbes
                  titre={`Avancement du projet, ${planAv.vue === "semaine" ? "semaine par semaine" : "mois par mois"}`}
                  unite="nombre"
                  nomActuel="Tâches terminées"
                  nomAvant="Tâches au total"
                  points={planAv.axe.map((cle, k) => ({
                    cle,
                    libelle: etiquettesAv[k].libelle,
                    court: etiquettesAv[k].court,
                    actuel: !pointsAv[k] || pointsAv[k].avant ? null : pointsAv[k].faites,
                    avant: !pointsAv[k] || pointsAv[k].avant ? null : pointsAv[k].total,
                    libelleAvant: "au total",
                    enCours: !!planAv.serie[k] && planAv.serie[k].fin >= jour,
                  }))}
                />
              </section>
            ) : null}

            <section className="carte carte--liste" aria-labelledby="p-taches">
              <div className="carte__entete">
                <h2 id="p-taches" className="carte__titre">
                  Tâches · {f.nTaches}
                </h2>
                <a href={`/projets/${p.id}/liste`} className="lien-discret">
                  Toutes les tâches →
                </a>
              </div>
              <div role="img" aria-label={`${f.compte.faite} faites, ${f.compte.en_cours} en cours, ${f.compte.a_faire} à faire, ${f.compte.bloquee} bloquées`} style={{ margin: "14px 0 10px", display: "flex", height: 10, gap: 2 }}>
                <span style={{ flex: f.compte.faite, background: "var(--arc)" }} />
                <span style={{ flex: f.compte.en_cours, background: "var(--arc-2)" }} />
                <span style={{ flex: f.compte.a_faire, background: "var(--piste)" }} />
                <span style={{ flex: f.compte.bloquee, background: "var(--veille-point)" }} />
              </div>
              <div aria-hidden="true" style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginBottom: 14, fontSize: 12, color: "var(--discret)" }}>
                <span>■ {f.compte.faite} faites</span>
                <span>{f.compte.en_cours} en cours</span>
                <span>{f.compte.a_faire} à faire</span>
                <span className="ton-veille">{f.compte.bloquee} bloquée{f.compte.bloquee > 1 ? "s" : ""}</span>
              </div>
              <ul className="liste">
                {f.urgentes.map((t) => {
                  const e = echeanceRelative(t.echeance, jour);
                  return (
                    <li key={t.id}>
                      <a href={`/taches/${t.id}`} className="rangee">
                        <span className="mono mono--petit" aria-hidden="true">
                          {t.initiales}
                        </span>
                        <span className="rangee__texte">
                          <span className="rangee__titre">{t.titre}</span>
                        </span>
                        <span className={`rangee__meta ${t.statut === "bloquee" ? "ton-veille" : t.retard ? "ton-retard" : ""}`}>{t.statut === "bloquee" ? "Bloquée" : e.texte || "Sans échéance"}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>

            <DocumentsProjet
              projetId={p.id}
              documents={documents}
              noms={nomsDeposants}
              moiId={u.id}
              gere={peutModifier}
              peutDeposer={peutDeposer}
              erreur={doc ? doc.slice(0, 800) : undefined}
              ajoutes={docOk ? Number(docOk) || 0 : undefined}
              retire={docRetire === "1"}
            />

            {rapports ? (
              <section className="carte carte--liste" aria-labelledby="p-rapports">
                <div className="carte__entete">
                  <h2 id="p-rapports" className="carte__titre">
                    Rapports du vendredi · ce projet
                  </h2>
                  <span className="rangee__meta">
                    {rapports.length} reçu{rapports.length > 1 ? "s" : ""}
                  </span>
                </div>
                <p className="note" style={{ marginBottom: 12 }}>
                  Seulement les lignes qui concernent ce projet.
                </p>
                <ul className="liste">
                  {rapports.map((r) => (
                    <li key={r.auteurId} style={{ display: "flex", gap: 14, padding: "16px 0" }}>
                      <span className="mono" aria-hidden="true">
                        {r.prenom[0]}
                        {r.nom[0]}
                      </span>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                        <span style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                          <span style={{ fontSize: 15, fontWeight: 500 }}>
                            <LienPersonne id={r.auteurId}>{r.auteur}</LienPersonne>
                          </span>
                          <span className="rangee__sous">{r.envoyeLe ? `Reçu à ${heure(r.envoyeLe)}` : ""}</span>
                        </span>
                        <ul className="liste" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {r.lignes.map((l, n) => (
                            <li key={n} style={{ borderTop: 0, display: "grid", gridTemplateColumns: "136px minmax(0, 1fr)", gap: 12, fontSize: 14, lineHeight: "20px" }}>
                              <span className="carte__titre" style={{ margin: 0, fontSize: 10, lineHeight: "20px", letterSpacing: "0.16em" }}>
                                {l.champ}
                              </span>
                              <span>{l.texte}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                  {rapports.length === 0 ? <li className="vide">Aucun rapport reçu sur ce projet cette semaine.</li> : null}
                </ul>
              </section>
            ) : null}
          </div>

          <div className="colonne-etroite">
            <section className="carte" aria-labelledby="p-dates">
              <h2 id="p-dates" className="carte__titre" style={{ marginBottom: 16 }}>
                Calendrier
              </h2>
              <ol className="liste">
                {dates.map((d, n) => (
                  <li key={d.libelle} style={{ display: "flex", gap: 16, paddingBottom: 18, borderTop: 0, position: "relative" }}>
                    <span style={{ position: "relative", width: 10, flex: "none", display: "flex", justifyContent: "center" }}>
                      {n < dates.length - 1 ? <span style={{ position: "absolute", top: 14, bottom: -18, width: 1, background: "var(--filet-fort)" }} /> : null}
                      <span
                        style={{ position: "relative", marginTop: 5, width: 9, height: 9, borderRadius: "50%", ...("actuelle" in d && d.actuelle ? { background: SANTE[p.sante].classe === "ton-ok" ? "var(--ok-point)" : "var(--retard-point)" } : { border: "1.5px solid var(--case)", background: "var(--surface)" }) }}
                      />
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span className="rangee__sous">{d.libelle}</span>
                      <span style={{ fontSize: 17, lineHeight: "22px", fontWeight: 300, textDecoration: "barre" in d && d.barre ? "line-through" : undefined, color: "barre" in d && d.barre ? "var(--discret)" : undefined }}>{dateLongue(d.date)}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {(p.dateFinInitiale && p.dateFinPrevue && p.dateFinInitiale !== p.dateFinPrevue) || reports.length ? (
                <div style={{ marginTop: 8, paddingTop: 16, borderTop: "1px solid var(--filet)" }}>
                  <h3 className="carte__titre" style={{ marginBottom: 10 }}>
                    Reports de la fin
                  </h3>
                  <FriseReports initiale={p.dateFinInitiale} actuelle={p.dateFinPrevue} reports={reports.map((r) => ({ avant: r.avant, apres: r.apres, le: dateLocale(r.creeLe) }))} jour={jour} />
                </div>
              ) : null}
            </section>

            {peutModifier && actif ? (
              <section className="carte" aria-labelledby="p-maj">
                <h2 id="p-maj" className="carte__titre" style={{ marginBottom: 16 }}>
                  Mettre à jour le projet
                </h2>
                <LigneMiseAJour
                  cible={{ genre: "projet", projetId: p.id }}
                  aujourdhui={aujourdhui()}
                  libelle="Mettre à jour le projet en une ligne"
                  placeholder="« à surveiller : retard du prestataire », « jalon recette 15/11 », « fin prévue 20/12 »"
                />
                <p className="note" style={{ margin: "16px 0 12px" }}>
                  Ou champ par champ :
                </p>
                <form key={`maj-${p.majLe.toISOString()}`} action={mettreAJourProjet.bind(null, p.id)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="champ">
                    <label htmlFor="sante">Santé</label>
                    <select id="sante" name="sante" defaultValue={p.sante}>
                      <option value="dans_les_temps">Dans les temps</option>
                      <option value="a_surveiller">À surveiller</option>
                      <option value="en_retard">En retard</option>
                    </select>
                  </div>
                  <div className="champ">
                    <label htmlFor="sante-motif">Pourquoi (si à surveiller ou en retard)</label>
                    <input id="sante-motif" name="santeMotif" type="text" maxLength={500} defaultValue={p.santeMotif} placeholder="ex. : retard du prestataire" />
                  </div>
                  <div className="champ">
                    <label htmlFor="fin">Fin prévue</label>
                    <input id="fin" name="dateFinPrevue" type="date" defaultValue={p.dateFinPrevue ?? ""} />
                  </div>
                  <div className="champ">
                    <label htmlFor="lancement">Lancement prévu</label>
                    <input id="lancement" name="dateLancementPrevue" type="date" defaultValue={p.dateLancementPrevue ?? ""} />
                  </div>
                  <button type="submit" className="bouton-contour" style={{ alignSelf: "flex-start" }}>
                    Enregistrer
                  </button>
                </form>
              </section>
            ) : null}

            <section className="carte carte--liste" aria-labelledby="p-equipe">
              <h2 id="p-equipe" className="carte__titre">
                Équipe projet · {membres.length + (p.chefProjetId ? 1 : 0) + (referentP ? 1 : 0)}
              </h2>
              <ul className="liste">
                {p.chefProjetId && nom(p.chefProjetId) ? (
                  <li className="rangee" style={{ minHeight: 52 }}>
                    <span className="rangee__texte">
                      <span className="rangee__titre">
                        <LienPersonne id={p.chefProjetId}>{nom(p.chefProjetId)}</LienPersonne>
                      </span>
                      <span className="rangee__sous">Chef de projet{hors(p.chefProjetId) ? ` · ${hors(p.chefProjetId)!.toLowerCase()}` : ""}</span>
                    </span>
                    <span className="rangee__meta" style={{ fontSize: 12 }}>
                      {ouvertesParPersonne.get(p.chefProjetId) === "Chef de projet" ? "" : (ouvertesParPersonne.get(p.chefProjetId) ?? "")}
                    </span>
                  </li>
                ) : null}
                {referentP ? (
                  <li className="rangee" style={{ minHeight: 52 }}>
                    <span className="rangee__texte">
                      <span className="rangee__titre">
                        <LienPersonne id={referentP.id}>{nomComplet(referentP)}</LienPersonne>
                      </span>
                      <span className="rangee__sous">Référent DPO · gère le projet ici</span>
                    </span>
                    <span className="rangee__meta" style={{ fontSize: 12 }}>
                      {ouvertesParPersonne.get(referentP.id) ?? ""}
                    </span>
                  </li>
                ) : null}
                {membres.map((m) => (
                  <li key={m.id} className="rangee" style={{ minHeight: 52, flexWrap: "wrap" }}>
                    <span className="rangee__texte" style={{ flex: "1 1 160px" }}>
                      <span className="rangee__titre">
                        <LienPersonne id={m.personneId}>{m.nom}</LienPersonne>
                      </span>
                      <span className="rangee__sous">{[m.role || m.poste, m.externe ? `hors division${m.organisation ? ` · ${m.organisation}` : ""}` : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="rangee__meta" style={{ fontSize: 12 }}>
                      {ouvertesParPersonne.get(m.personneId) ?? "Aucune tâche ouverte"}
                    </span>
                    {peutModifier && actif ? (
                      <form action={retirer.bind(null, p.id, m.id)}>
                        <button type="submit" className="bouton-mini" aria-label={`Retirer ${m.nom} de l'équipe`}>
                          Retirer
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
                {!membres.length && !p.chefProjetId ? <li className="vide">Personne pour l&apos;instant.</li> : null}
              </ul>
              {peutModifier && actif ? (
                <form action={ajouter.bind(null, p.id)} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                  <ChoixPersonne
                    id="m-personne"
                    name="personneId"
                    prefixe="membre"
                    libelle="Ajouter à l'équipe"
                    personnes={personnesActives.filter((x) => x.id !== p.chefProjetId && x.id !== p.referentId && !membres.some((m) => m.personneId === x.id))}
                    vide="Choisir une personne"
                  />
                  <div className="champ">
                    <label htmlFor="m-role">Son rôle dans le projet (facultatif)</label>
                    <input id="m-role" name="role" maxLength={80} placeholder="Ex. : analyste, consultant sécurité" />
                  </div>
                  <button type="submit" className="bouton-contour" style={{ alignSelf: "flex-start" }}>
                    <Icone nom="ajouter" taille={16} /> Ajouter
                  </button>
                </form>
              ) : null}
              <p className="note" style={{ margin: "10px 0 4px" }}>
                Les membres voient le projet ; le chef de projet (ou le référent DPO) peut leur confier des tâches, y compris aux personnes hors division.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
