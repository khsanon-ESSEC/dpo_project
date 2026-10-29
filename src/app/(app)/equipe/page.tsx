import type { Metadata } from "next";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { aujourdhui, dateCourte, dateLocale, heure, jourAbrege, jourComplet } from "@/lib/dates";
import { monEquipe } from "@/lib/donnees/equipe";
import { chargeDesPersonnes } from "@/lib/donnees/charge";
import { Niveau } from "@/components/Charge";
import { LIBELLE_NIVEAU, nombre } from "@/lib/charge";
import { Anneau, Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { CodeProjet, LienPersonne, LienProjet } from "@/components/Liens";
import { dureeTexte } from "@/lib/projets";
import { ONGLETS_EQUIPE, SousOnglets } from "@/components/SousOnglets";
import { relancerEquipe } from "./actions";

export const metadata: Metadata = { title: "Mon équipe" };

export default async function PageEquipe({ searchParams }: { searchParams: Promise<{ filtre?: string; relance?: string }> }) {
  const { filtre = "tous", relance } = await searchParams;
  const u = await exigerInterne();
  const a = await acces(u);
  const jour = aujourdhui();

  const toute = a.directeur || a.toutVoir;
  const titre = toute ? "Ma direction" : "Mon équipe";
  if (!a.equipeDirecte.length && !toute) {
    return (
      <>
        <Bandeau surtitre={jourComplet(jour)} titre={titre} />
        <div className="page">
          <SousOnglets onglets={ONGLETS_EQUIPE} courant="/equipe" label="Équipe" />
          <p className="vide">Personne ne vous envoie directement de rapport. Les rapports et la charge de votre direction sont dans les onglets ci-dessus.</p>
        </div>
      </>
    );
  }

  const e = await monEquipe(a);
  const ch = await chargeDesPersonnes(e.personnes.map((p) => p.id), 2);
  const chargeDe = new Map(ch.lignes.map((l) => [l.id, l.charge.semaines]));
  const garde = (p: (typeof e.personnes)[number]) => filtre === "tous" || (filtre === "sans" && !p.rapport) || (filtre === "bloc" && p.bloquees > 0);
  const groupes = e.groupes.map((g) => ({ ...g, visibles: g.personnes.filter(garde) })).filter((g) => g.visibles.length || filtre === "tous");
  const filtres = [
    { id: "tous", libelle: `Tous · ${e.personnes.length}` },
    { id: "sans", libelle: `Sans rapport · ${e.manquants.length}` },
    { id: "bloc", libelle: `Avec blocage · ${e.personnes.filter((p) => p.bloquees > 0).length}` },
  ];
  const maxCharge = Math.max(1, ...e.charge.map((c) => c.n));
  const visibles = await idsProjetsVisibles(a);
  const voit = (id: string) => visibles === "tous" || visibles.has(id);

  return (
    <>
      <Bandeau surtitre={jourComplet(jour)} titre={titre}>
        <div className="chiffres">
          <Anneau fait={e.recus} total={e.personnes.length} legende="rapports" label={`${e.recus} rapports reçus sur ${e.personnes.length}`} />
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "12px 48px" }}>
            <div className="chiffre chiffre--veille">
              <dt>tâches bloquées</dt>
              <dd>{e.totaux.bloquees}</dd>
            </div>
            <div className="chiffre chiffre--retard">
              <dt>en retard</dt>
              <dd>{e.totaux.retard}</dd>
            </div>
            <div className="chiffre">
              <dt>faites cette semaine</dt>
              <dd>{e.totaux.faites}</dd>
            </div>
          </dl>
        </div>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_EQUIPE} courant="/equipe" label="Équipe" />
        <div className="ligne-actions">
          <nav className="filtres" aria-label="Filtrer l'équipe">
            {filtres.map((f) => (
              <a key={f.id} className="filtre" href={`/equipe?filtre=${f.id}`} aria-current={filtre === f.id ? "true" : undefined}>
                {f.libelle}
              </a>
            ))}
          </nav>
          {relance ? (
            <span className="succes" role="status" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icone nom="coche" taille={18} /> Rappel envoyé
            </span>
          ) : e.aRelancer.length ? (
            <form action={relancerEquipe}>
              {e.aRelancer.map((p) => (
                <input key={p.id} type="hidden" name="personneId" value={p.id} />
              ))}
              <button type="submit" className="bouton-ambre">
                Relancer {e.aRelancer.length > 1 ? `les ${e.aRelancer.length} retardataires` : e.aRelancer[0].nom}
              </button>
            </form>
          ) : null}
        </div>

        <ApercuEquipe personnes={e.personnes} semaines={e.personnes.map((p) => chargeDe.get(p.id) ?? [])} />

        {groupes.length > 1 ? (
          <nav className="filtres" aria-label="Équipes de la structure">
            {groupes.map((g) => (
              <a key={g.chefId} className="filtre" href={`#g-${g.chefId}`}>
                {g.titre} · {g.personnes.length}
              </a>
            ))}
          </nav>
        ) : null}
        {groupes.map((g) => (
          <section key={g.chefId} id={`g-${g.chefId}`} className="groupe-equipe" aria-labelledby={`g-${g.chefId}-t`}>
            <div className="groupe-equipe__entete">
              <h2 id={`g-${g.chefId}-t`} className="carte__titre">
                {g.titre}
                <span className="ton-discret" style={{ fontWeight: 400 }}>
                  {" "}
                  · {g.personnes.filter((p) => p.rapport).length}/{g.personnes.length} rapports
                </span>
              </h2>
              {g.sous ? <span className="rangee__sous">{g.sous}</span> : null}
            </div>
            {g.visibles.length ? (
              <ul className="grille-equipe">
                {g.visibles.map((p) => (
                  <CartePersonne key={p.id} p={p} semaines={chargeDe.get(p.id) ?? []} jour={jour} voit={voit} />
                ))}
              </ul>
            ) : (
              <p className="vide">Personne dans ce filtre.</p>
            )}
          </section>
        ))}
        {groupes.length === 0 ? <p className="vide">Personne dans ce filtre.</p> : null}

        <div className="colonnes">
          <section className="carte carte--liste" style={{ flex: "1 1 420px" }} aria-labelledby="t-blocages">
            <h2 id="t-blocages" className="carte__titre">
              Blocages · {e.blocages.length}
            </h2>
            <ul className="liste">
              {e.blocages.map((b) => (
                <li key={b.id} className="rangee rangee--etiree">
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--veille-point)", flex: "none" }} />
                  <span className="rangee__texte">
                    <a href={`/taches/${b.id}`} className="rangee__titre rangee__lien">
                      {b.titre}
                    </a>
                    <span className="rangee__sous">
                      <LienPersonne id={b.assigneId}>{b.qui}</LienPersonne> ·{" "}
                      {b.projetId ? (
                        <LienProjet id={b.projetId} visible={voit(b.projetId)}>
                          {b.projet}
                        </LienProjet>
                      ) : (
                        "Hors projet"
                      )}
                    </span>
                  </span>
                  <span className="rangee__meta" style={{ fontSize: 12 }}>
                    depuis le {dateCourte(b.depuis)}
                  </span>
                </li>
              ))}
              {e.blocages.length === 0 ? <li className="vide">Aucun blocage.</li> : null}
            </ul>
          </section>
          <section className="carte" style={{ flex: "1 1 420px" }} aria-labelledby="t-charge">
            <h2 id="t-charge" className="carte__titre" style={{ marginBottom: 18 }}>
              Tâches ouvertes par projet
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {e.charge.map(({ id, titre: nom, n }) => (
                <div key={id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 170px) minmax(0, 1fr) 24px", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <LienProjet id={id} visible={voit(id)}>
                      {nom}
                    </LienProjet>
                  </span>
                  <span className="barre" style={{ height: 10 }} role="img" aria-label={`${nom} : ${n} tâches ouvertes`}>
                    <span style={{ width: `${Math.round((n / maxCharge) * 100)}%` }} />
                  </span>
                  <span className="rangee__meta" style={{ textAlign: "right" }}>
                    {n}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

type Personne = Awaited<ReturnType<typeof monEquipe>>["personnes"][number];

type Semaines = Awaited<ReturnType<typeof chargeDesPersonnes>>["lignes"][number]["charge"]["semaines"];

/** Une jauge de charge : le remplissage jusqu'aux heures prévues, un trait aux heures disponibles. */
function Jauge({ heures, capacite, niveau, libelle }: { heures: number; capacite: number; niveau: Semaines[number]["niveau"]; libelle: string }) {
  const max = Math.max(heures, capacite, 1);
  const taux = capacite > 0 ? Math.round((heures / capacite) * 100) : null;
  return (
    <span className="jauge-charge">
      <span className="jauge-charge__libelle">{libelle}</span>
      <span className="jauge-charge__piste" role="img" aria-label={`${libelle} : ${nombre(heures)} h prévues sur ${nombre(capacite)} h disponibles${taux !== null ? `, ${taux} %` : ""} (${LIBELLE_NIVEAU[niveau].toLowerCase()})`}>
        <span className={`jauge-charge__rempli jauge-charge__rempli--${niveau}`} style={{ width: `${(heures / max) * 100}%` }} />
        {heures > capacite && capacite > 0 ? <span className="jauge-charge__capacite" style={{ left: `${(capacite / max) * 100}%` }} /> : null}
      </span>
      <span className={`jauge-charge__chiffre niveau--${niveau}`}>
        {nombre(heures)} / {nombre(capacite)} h
      </span>
    </span>
  );
}

/** Les tâches de la semaine d'une personne (ou de l'équipe), en une barre : faites, en cours, à faire, en retard, bloquées. */
function BarreTaches({ c, label }: { c: { faites: number; enCours: number; aFaire: number; retard: number; bloquees: number; total: number }; label: string }) {
  const parts = [
    { cle: "faites", n: c.faites, libelle: "faites" },
    { cle: "en-cours", n: c.enCours, libelle: "en cours" },
    { cle: "a-faire", n: c.aFaire - c.enCours, libelle: "à faire" },
    { cle: "retard", n: c.retard, libelle: "en retard" },
    { cle: "bloquees", n: c.bloquees, libelle: "bloquées" },
  ].filter((x) => x.n > 0);
  return (
    <span className="barre-taches" role="img" aria-label={`${label} : ${c.total ? parts.map((x) => `${x.n} ${x.libelle}`).join(", ") : "aucune tâche"}`}>
      {parts.map((x) => (
        <span key={x.cle} className={`barre-taches__part barre-taches__part--${x.cle}`} style={{ flexGrow: x.n }} title={`${x.n} ${x.libelle}`} />
      ))}
    </span>
  );
}

const LEGENDE_TACHES = [
  { cle: "faites", libelle: "Faites" },
  { cle: "en-cours", libelle: "En cours" },
  { cle: "a-faire", libelle: "À faire" },
  { cle: "retard", libelle: "En retard" },
  { cle: "bloquees", libelle: "Bloquées" },
];

/** En un coup d'œil : les rapports reçus, la charge des deux semaines, les tâches de la semaine. */
function ApercuEquipe({ personnes, semaines }: { personnes: Personne[]; semaines: Semaines[] }) {
  const niveaux = ["surchargee", "chargee", "normale", "libre"] as const;
  const repartition = [0, 1].map((k) => niveaux.map((n) => ({ niveau: n, n: semaines.filter((w) => w[k]?.niveau === n).length })));
  const t = personnes.reduce(
    (s, p) => ({ faites: s.faites + p.faites, enCours: s.enCours + p.enCours, aFaire: s.aFaire + p.aFaire, retard: s.retard + p.retard, bloquees: s.bloquees + p.bloquees, total: s.total + p.total }),
    { faites: 0, enCours: 0, aFaire: 0, retard: 0, bloquees: 0, total: 0 },
  );
  const reunion = personnes.reduce((s, p) => s + p.minutesReunion, 0);
  const recus = personnes.filter((p) => p.rapport);
  const attendus = personnes.filter((p) => !p.rapport);
  return (
    <div className="apercu-equipe">
      <section className="carte apercu-equipe__carte" aria-labelledby="a-rapports">
        <h2 id="a-rapports" className="carte__titre">
          Rapports du vendredi
        </h2>
        <p className="apercu-equipe__chiffre">
          <strong>{recus.length}</strong> reçus{attendus.length ? <span className="ton-retard"> · {attendus.length} attendus</span> : null}
        </p>
        <ul className="mur-rapports">
          {[...attendus, ...recus].map((p) => (
            <li key={p.id}>
              <a href={p.rapport ? `/rapports/${p.rapport.id}` : `/personnes/${p.id}`} className={`mur-rapports__pastille${p.rapport ? " mur-rapports__pastille--recu" : ""}`} title={`${p.nom} : ${p.rapport ? "rapport reçu" : "rapport pas encore envoyé"}`}>
                {p.initiales}
                <span className="visuellement-cache">
                  {p.nom}, {p.rapport ? "rapport reçu" : "pas encore"}
                </span>
                <span className="mur-rapports__marque" aria-hidden="true">
                  <Icone nom={p.rapport ? "coche" : "horloge"} taille={10} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className="carte apercu-equipe__carte" aria-labelledby="a-charge">
        <h2 id="a-charge" className="carte__titre">
          Charge prévue
        </h2>
        {repartition.map((r, k) => (
          <div key={k} className="repartition-charge">
            <span className="repartition-charge__libelle">{k === 0 ? "Cette semaine" : "Semaine prochaine"}</span>
            <span className="repartition-charge__barre" role="img" aria-label={`${k === 0 ? "Cette semaine" : "Semaine prochaine"} : ${r.filter((x) => x.n).map((x) => `${x.n} ${LIBELLE_NIVEAU[x.niveau].toLowerCase()}${x.n > 1 ? "s" : ""}`).join(", ")}`}>
              {r
                .filter((x) => x.n)
                .map((x) => (
                  <span key={x.niveau} className={`repartition-charge__part repartition-charge__part--${x.niveau}`} style={{ flexGrow: x.n }} title={`${x.n} ${LIBELLE_NIVEAU[x.niveau].toLowerCase()}${x.n > 1 ? "s" : ""}`}>
                    {x.n}
                  </span>
                ))}
            </span>
          </div>
        ))}
        <div className="legende" aria-hidden="true">
          <Niveau niveau="surchargee" texte="Surchargées" />
          <Niveau niveau="chargee" texte="Chargées" />
          <Niveau niveau="normale" texte="Normales" />
          <Niveau niveau="libre" texte="Libres" />
        </div>
      </section>
      <section className="carte apercu-equipe__carte" aria-labelledby="a-taches">
        <h2 id="a-taches" className="carte__titre">
          Tâches de la semaine
        </h2>
        <p className="apercu-equipe__chiffre">
          <strong>{t.faites}</strong> faites sur {t.total}
          {t.retard ? <span className="ton-retard"> · {t.retard} en retard</span> : null}
          {t.bloquees ? <span className="ton-veille"> · {t.bloquees} bloquée{t.bloquees > 1 ? "s" : ""}</span> : null}
        </p>
        <BarreTaches c={t} label="Tâches de l'équipe cette semaine" />
        <div className="legende" aria-hidden="true">
          {LEGENDE_TACHES.map((l) => (
            <span key={l.cle} className="niveau">
              <span className={`point-tache point-tache--${l.cle}`} />
              {l.libelle}
            </span>
          ))}
        </div>
        <p className="apercu-equipe__pied">
          <Icone nom="reunion" taille={15} /> {reunion ? `${dureeTexte(reunion)} de réunions notées cette semaine` : "Aucune réunion notée cette semaine"}
        </p>
      </section>
    </div>
  );
}

function CartePersonne({ p, semaines, jour, voit }: { p: Personne; semaines: Semaines; jour: string; voit: (id: string) => boolean }) {
  const envoi = p.rapport?.envoyeLe ? (dateLocale(p.rapport.envoyeLe) === jour ? heure(p.rapport.envoyeLe) : jourAbrege(dateLocale(p.rapport.envoyeLe)).toLowerCase()) : "";
  const alerte = p.retard || p.bloquees;
  return (
    <li className={`carte-personne${alerte ? " carte-personne--alerte" : ""}`}>
      <div className="carte-personne__tete">
        <span className={`carte-personne__avatar${p.rapport ? " carte-personne__avatar--recu" : ""}`} aria-hidden="true">
          {p.initiales}
        </span>
        <span className="carte-personne__nom">
          <a href={`/personnes/${p.id}`} className="lien-nom" title={`Tâches, charge et rapports de ${p.nom}`}>
            {p.nom}
          </a>
          <span className="rangee__sous">{p.poste}</span>
        </span>
        {p.rapport ? (
          <a href={`/rapports/${p.rapport.id}`} className="pastille-rapport pastille-rapport--recu" aria-label={`Rapport de ${p.nom}, ${p.direct ? "reçu" : "envoyé"} ${envoi}`}>
            <Icone nom="coche" taille={14} />
            {p.direct ? "Reçu" : "Envoyé"} {envoi}
          </a>
        ) : (
          <span className="pastille-rapport pastille-rapport--attendu">
            <Icone nom="horloge" taille={14} />
            Pas encore
          </span>
        )}
      </div>
      <div className="carte-personne__corps">
        <div className="carte-personne__ligne">
          <span className="carte-personne__etiquette">Tâches</span>
          <span className="carte-personne__valeur">
            <BarreTaches c={p} label={`Tâches de ${p.nom} cette semaine`} />
            <span className="carte-personne__detail">
              {p.total ? `${p.faites} faite${p.faites > 1 ? "s" : ""} sur ${p.total}` : "Aucune tâche cette semaine"}
              {p.retard ? <span className="ton-retard"> · {p.retard} en retard</span> : null}
              {p.bloquees ? <span className="ton-veille"> · {p.bloquees} bloquée{p.bloquees > 1 ? "s" : ""}</span> : null}
            </span>
          </span>
        </div>
        <div className="carte-personne__ligne">
          <span className="carte-personne__etiquette">Charge</span>
          <span className="carte-personne__valeur carte-personne__jauges">
            {semaines.map((w, i) => (
              <Jauge key={w.semaine} heures={w.heures} capacite={w.capacite} niveau={w.niveau} libelle={i === 0 ? "Cette sem." : "Sem. proch."} />
            ))}
          </span>
        </div>
        <div className="carte-personne__ligne">
          <span className="carte-personne__etiquette">Réunions</span>
          <span className={`carte-personne__valeur${p.minutesReunion ? "" : " ton-discret"}`}>{p.minutesReunion ? `${dureeTexte(p.minutesReunion)} cette semaine` : "Aucune notée"}</span>
        </div>
        {p.projets.length ? (
          <div className="carte-personne__ligne">
            <span className="carte-personne__etiquette">Projets</span>
            <span className="carte-personne__valeur ligne-equipe__projets" style={{ marginTop: 0 }}>
              {p.projets.map((m) => (
                <CodeProjet key={m.id} id={m.id} code={m.code} titre={m.titre} visible={voit(m.id)} />
              ))}
            </span>
          </div>
        ) : null}
      </div>
    </li>
  );
}
