import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces, idsProjetsVisibles, suitPersonne } from "@/lib/acces";
import { CodeProjet, LienProjet } from "@/components/Liens";
import { exigerInterne } from "@/lib/auth/session";
import { ajouterJours, aujourdhui, dateCourte, echeanceRelative, jourAbrege, lundiDe } from "@/lib/dates";
import { reunionsDe } from "@/lib/donnees/reunions";
import { dureeTexte } from "@/lib/projets";
import { heuresDe, heuresTexte, LIBELLE_NIVEAU } from "@/lib/charge";
import { chargeDesPersonnes } from "@/lib/donnees/charge";
import { statutsRapports } from "@/lib/donnees/rapport";
import { compter, tachesDe, trier } from "@/lib/donnees/semaine";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Jauge, Niveau } from "@/components/Charge";
import { Icone } from "@/components/Icone";

export const metadata: Metadata = { title: "Tâches et charge d'une personne" };

/** Une personne que je suis (ou moi-même) : sa charge des semaines à venir et ses tâches. */
export default async function PagePersonne({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semaine?: string }> }) {
  const { id } = await params;
  const { semaine: s0 } = await searchParams;
  const u = await exigerInterne();
  const a = await acces(u);
  const visibles = await idsProjetsVisibles(a);
  const voit = (id: string | null) => !!id && (visibles === "tous" || visibles.has(id));
  if (!/^[0-9a-f-]{36}$/.test(id) || !suitPersonne(a, id)) notFound();
  const org = await chargerOrganisation();
  const p = org.personnes.get(id);
  if (!p) notFound();
  const jour = aujourdhui();
  const lundi = lundiDe(jour);
  const [taches, { semaines, lignes }, rapports, reunions, reunionsSuivantes] = await Promise.all([
    tachesDe([id]),
    chargeDesPersonnes([id]),
    statutsRapports([id]),
    reunionsDe(id, lundi, ajouterJours(lundi, 6)),
    reunionsDe(id, ajouterJours(lundi, 7), ajouterJours(lundi, 13)),
  ]);
  // Le temps passé en réunion : toute la semaine (passé et à venir), et ce qui est déjà prévu la suivante.
  const minutesReunion = reunions.reduce((t, r) => t + r.dureeMinutes, 0);
  const minutesSuivantes = reunionsSuivantes.reduce((t, r) => t + r.dureeMinutes, 0);
  const triees = trier(taches, jour);
  const c = compter(triees, jour);
  const charge = lignes[0]?.charge;
  const choisie = s0 && semaines.includes(s0) ? s0 : semaines[0];
  const semaineChoisie = charge?.semaines.find((w) => w.semaine === choisie);
  const detail = lignes[0] ? semaineChoisie?.taches.map((x) => ({ ...lignes[0].taches.get(x.id)!, heuresSemaine: x.heures })) ?? [] : [];
  const rapport = rapports.get(id);
  const retourEquipe = a.equipeDirecte.includes(id) ? "/equipe" : "/charge";
  const peutVoirCharge = a.toutVoir || a.directeur || a.equipeDirecte.length > 0;

  return (
    <>
      <Bandeau
        surtitre={
          <>
            {p.poste ? `${p.poste} · ` : ""}
            <a href={`/personnes/${id}`} className="lien-nom">
              Fiche
            </a>
          </>
        }
        titre={id === u.id ? "Ma charge" : nomComplet(p)}
        retour={
          id === u.id ? (
            <a href="/semaine" className="retour">
              <Icone nom="chevron-gauche" taille={18} /> Ma semaine
            </a>
          ) : (
            <a href={peutVoirCharge ? retourEquipe : "/equipe"} className="retour">
              <Icone nom="chevron-gauche" taille={18} /> {retourEquipe === "/equipe" ? "Mon équipe" : "Charge de travail"}
            </a>
          )
        }
      >
        {charge ? (
          <dl className="chiffres">
            <div className={`chiffre ${charge.semaines[0].niveau === "surchargee" ? "chiffre--retard" : charge.semaines[0].niveau === "chargee" ? "chiffre--veille" : ""}`}>
              <dt>
                cette semaine, sur {heuresTexte(charge.semaines[0].capacite)} restantes{charge.semaines[0].reunions ? ` hors ${heuresTexte(charge.semaines[0].reunions)} de réunion` : ""}
              </dt>
              <dd>
                {Math.round(charge.semaines[0].heures)}
                <small>&nbsp;h</small>
              </dd>
            </div>
            <div className={`chiffre ${charge.semaines[1].niveau === "surchargee" ? "chiffre--retard" : charge.semaines[1].niveau === "chargee" ? "chiffre--veille" : ""}`}>
              <dt>
                la semaine prochaine, sur {charge.semaines[1].capacite} h{charge.semaines[1].reunions ? ` hors ${heuresTexte(charge.semaines[1].reunions)} de réunion` : ""}
              </dt>
              <dd>
                {Math.round(charge.semaines[1].heures)}
                <small>&nbsp;h</small>
              </dd>
            </div>
            <div className="chiffre">
              <dt>en réunion cette semaine{reunions.length ? ` · ${reunions.length} réunion${reunions.length > 1 ? "s" : ""}` : ""}</dt>
              <dd>
                <a href="#p-reunions" className="lien-nom" style={{ textDecorationColor: "rgba(255,255,255,0.35)" }}>
                  {String(Math.round((minutesReunion / 60) * 10) / 10).replace(".", ",")}
                  <small>&nbsp;h</small>
                </a>
              </dd>
            </div>
            <div className="chiffre">
              <dt>tâches ouvertes</dt>
              <dd>{charge.ouvertes + charge.bloquees}</dd>
            </div>
            <div className="chiffre">
              <dt>rapport du vendredi</dt>
              <dd style={{ fontSize: 22, lineHeight: "54px", fontWeight: 300 }}>{rapport?.statut === "envoye" ? "Reçu" : "Pas encore"}</dd>
            </div>
          </dl>
        ) : null}
      </Bandeau>
      <div className="page" style={{ maxWidth: 980 }}>
        {charge ? (
          <section className="carte" aria-labelledby="p-charge">
            <div className="carte__entete">
              <h2 id="p-charge" className="carte__titre">
                Charge des {semaines.length} prochaines semaines
              </h2>
              <span className="note">{lignes[0].capacite} h disponibles par semaine</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${semaines.length}, minmax(84px, 1fr))`, gap: 20, margin: "16px 0 24px", overflowX: "auto", paddingBottom: 6 }}>
              {charge.semaines.map((w, i) => (
                <div key={w.semaine} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span className="rangee__sous">{i === 0 ? "Cette semaine" : i === 1 ? "Semaine prochaine" : `Sem. du ${dateCourte(w.semaine)}`}</span>
                  <Jauge heures={w.heures} capacite={w.capacite} niveau={w.niveau} lien={`/equipe/${id}?semaine=${w.semaine}`} choisie={w.semaine === choisie} delai={i * 60} />
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
                            · {t.echeance ? `échéance ${dateCourte(t.echeance)}` : "sans échéance"} ·{" "}
                            {t.estimationHeures ? `${t.estimationHeures} h estimées` : `sans estimation (compte ${heuresDe(t)} h)`}
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

        <section className="carte carte--liste" aria-labelledby="p-reunions">
          <div className="carte__entete">
            <h2 id="p-reunions" className="carte__titre">
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

        <section className="carte carte--liste" aria-labelledby="p-taches">
          <div className="carte__entete">
            <h2 id="p-taches" className="carte__titre">
              Tâches ouvertes · {c.faites} faite{c.faites > 1 ? "s" : ""} cette semaine
            </h2>
            {id !== u.id ? (
              <a href={`/taches/nouvelle?pour=${id}&retour=${encodeURIComponent(`/equipe/${id}`)}`} className="lien-discret">
                Confier une tâche →
              </a>
            ) : null}
          </div>
          <ul className="liste">
            {triees.map((t) => {
              const e = echeanceRelative(t.echeance, jour);
              return (
                <li key={t.id}>
                  <div className={`rangee rangee--etiree${t.statut === "faite" ? " fait" : ""}`}>
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
        </section>
      </div>
    </>
  );
}
