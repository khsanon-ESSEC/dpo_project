import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces, auteursLignesVisibles, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, dateCourte, dateLongue, echeanceRelative, ecartJours, heure } from "@/lib/dates";
import { ficheProjet } from "@/lib/donnees/projets";
import { lignesDuProjetCetteSemaine, PARTIES } from "@/lib/donnees/rapport";
import { Anneau, Bandeau } from "@/components/Bandeau";
import { CocheSeule } from "@/components/CaseTache";
import { Icone } from "@/components/Icone";
import { changerIndicateur, mettreAJourProjet } from "./actions";
import { OngletsVues } from "./commun";

export const metadata: Metadata = { title: "Projet" };

const SANTE = {
  en_retard: { texte: "En retard", classe: "ton-retard" },
  a_surveiller: { texte: "À surveiller", classe: "ton-veille" },
  dans_les_temps: { texte: "Dans les temps", classe: "ton-ok" },
} as const;
const ETAT_IND = { atteint: "Atteint", en_cours: "En cours", a_venir: "À venir" } as const;

export default async function PageProjet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  await exigerProjetVisible(a, id);
  const f = await ficheProjet(id);
  const p = f.projet;
  // Chef du projet, directeur de la direction concernée (le projet lui est visible), exécutifs.
  const peutModifier = a.toutVoir || a.directeur || p.chefProjetId === u.id;
  const auteurs = auteursLignesVisibles(a, id);
  const rapports = auteurs ? await lignesDuProjetCetteSemaine(id, auteurs) : null;
  const jour = aujourdhui();
  const atteints = f.indicateurs.filter((i) => i.etat === "atteint").length;
  const ancienne = f.dernier?.dateFinPrevue ?? null;
  const glissement = ancienne && p.dateFinPrevue ? Math.round(ecartJours(ancienne, p.dateFinPrevue) / 7) : 0;
  const libellePartie = Object.fromEntries(PARTIES.map((x) => [x.id, x.libelle === "La semaine prochaine" ? "Semaine prochaine" : x.libelle]));

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
        surtitre={[p.strategique ? "Stratégique" : "Projet", p.programme].filter(Boolean).join(" · ")}
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
              <dt>chef de projet</dt>
              <dd style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, lineHeight: "54px", fontWeight: 300 }}>{f.chef?.nom ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </Bandeau>
      <div className="page">
        <div className="ligne-actions">
          <OngletsVues projetId={p.id} vue="apercu" />
          <a href={`/taches/nouvelle?projet=${p.id}&retour=${encodeURIComponent(`/projets/${p.id}`)}`} className="bouton-contour">
            <Icone nom="ajouter" taille={16} /> Nouvelle tâche
          </a>
        </div>
        <div className="colonnes">
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
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "20px", color: i.etat === "a_venir" ? "var(--discret)" : undefined }}>{i.libelle}</span>
                    {peutModifier ? (
                      <form action={changerIndicateur.bind(null, p.id, i.id)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <label className="visuellement-cache" htmlFor={`ind-${i.id}`}>
                          État de « {i.libelle} »
                        </label>
                        <select id={`ind-${i.id}`} name="etat" defaultValue={i.etat} style={{ minHeight: 32, border: "1px solid var(--filet-fort)", background: "transparent", fontSize: 12 }}>
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
                    <li key={r.auteur} style={{ display: "flex", gap: 14, padding: "16px 0" }}>
                      <span className="mono" aria-hidden="true">
                        {r.prenom[0]}
                        {r.nom[0]}
                      </span>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                        <span style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                          <span style={{ fontSize: 15, fontWeight: 500 }}>{r.auteur}</span>
                          <span className="rangee__sous">{r.envoyeLe ? `Reçu à ${heure(r.envoyeLe)}` : ""}</span>
                        </span>
                        <ul className="liste" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {r.lignes.map((l, n) => (
                            <li key={n} style={{ borderTop: 0, display: "grid", gridTemplateColumns: "136px minmax(0, 1fr)", gap: 12, fontSize: 14, lineHeight: "20px" }}>
                              <span className="carte__titre" style={{ margin: 0, fontSize: 10, lineHeight: "20px", letterSpacing: "0.16em" }}>
                                {libellePartie[l.partie]}
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
            </section>

            {peutModifier ? (
              <section className="carte" aria-labelledby="p-maj">
                <h2 id="p-maj" className="carte__titre" style={{ marginBottom: 16 }}>
                  Mettre à jour le projet
                </h2>
                <form action={mettreAJourProjet.bind(null, p.id)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="champ">
                    <label htmlFor="sante">Santé</label>
                    <select id="sante" name="sante" defaultValue={p.sante}>
                      <option value="dans_les_temps">Dans les temps</option>
                      <option value="a_surveiller">À surveiller</option>
                      <option value="en_retard">En retard</option>
                    </select>
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
                Équipe · {f.equipe.length}
              </h2>
              <ul className="liste">
                {f.equipe.map((m) => (
                  <li key={m.id} className="rangee" style={{ minHeight: 52 }}>
                    <span className="mono" aria-hidden="true">
                      {m.initiales}
                    </span>
                    <span className="rangee__texte">
                      <span className="rangee__titre">{m.nom}</span>
                    </span>
                    <span className="rangee__meta" style={{ fontSize: 12 }}>
                      {m.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
