import type { Metadata } from "next";
import { acces } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { aujourdhui, dateCourte, dateLocale, heure, jourAbrege, jourComplet } from "@/lib/dates";
import { monEquipe } from "@/lib/donnees/equipe";
import { chargeDesPersonnes } from "@/lib/donnees/charge";
import { Niveau } from "@/components/Charge";
import { nombre } from "@/lib/charge";
import { Anneau, Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
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
  const maxCharge = Math.max(1, ...e.charge.map(([, n]) => n));

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
          <section key={g.chefId} id={`g-${g.chefId}`} className="carte carte--liste" aria-labelledby={`g-${g.chefId}-t`}>
            <div className="carte__entete">
              <h2 id={`g-${g.chefId}-t`} className="carte__titre">
                {g.titre}
                <span className="ton-discret" style={{ fontWeight: 400 }}>
                  {" "}
                  · {g.personnes.filter((p) => p.rapport).length}/{g.personnes.length} rapports
                </span>
              </h2>
              {g.sous ? <span className="rangee__sous">{g.sous}</span> : null}
            </div>
            <ul className="liste">
              {g.visibles.map((p) => (
                <LignePersonne key={p.id} p={p} semaines={chargeDe.get(p.id) ?? []} jour={jour} />
              ))}
              {g.visibles.length === 0 ? <li className="vide">Personne dans ce filtre.</li> : null}
            </ul>
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
                <li key={b.id}>
                  <a href={`/taches/${b.id}`} className="rangee">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--veille-point)", flex: "none" }} />
                    <span className="rangee__texte">
                      <span className="rangee__titre">{b.titre}</span>
                      <span className="rangee__sous">
                        {b.qui} · {b.projet ?? "Hors projet"}
                      </span>
                    </span>
                    <span className="rangee__meta" style={{ fontSize: 12 }}>
                      depuis le {dateCourte(b.depuis)}
                    </span>
                  </a>
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
              {e.charge.map(([nom, n]) => (
                <div key={nom} role="img" aria-label={`${nom} : ${n} tâches ouvertes`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 170px) minmax(0, 1fr) 24px", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nom}</span>
                  <span className="barre" style={{ height: 10 }}>
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

function LignePersonne({ p, semaines, jour }: { p: Personne; semaines: Semaines; jour: string }) {
  return (
    <li>
                <div className="rangee" style={{ minHeight: 64, gap: 16, flexWrap: "wrap" }}>
                  <span className="mono" style={{ width: 36, height: 36, fontSize: 12 }} aria-hidden="true">
                    {p.initiales}
                  </span>
                  <span className="rangee__texte" style={{ flex: "1 1 170px" }}>
                    <span className="rangee__titre">
                      <a href={`/equipe/${p.id}`} className="lien-nom" title={`Tâches, charge et rapports de ${p.nom}`}>
                        {p.nom}
                      </a>
                    </span>
                    <span className="rangee__sous">{p.poste}</span>
                  </span>
                  {p.rapport ? (
                    <a href={`/rapports/${p.rapport.id}`} style={{ flex: "0 0 128px", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }} className="ton-ok lien-nom" aria-label={`Rapport de ${p.nom}`}>
                      <Icone nom="coche" taille={16} />
                      {p.rapport.envoyeLe && dateLocale(p.rapport.envoyeLe) === jour ? `${p.direct ? "Reçu" : "Envoyé"} à ${heure(p.rapport.envoyeLe)}` : `${p.direct ? "Reçu" : "Envoyé"} ${p.rapport.envoyeLe ? jourAbrege(dateLocale(p.rapport.envoyeLe)).toLowerCase() : ""}`}
                    </a>
                  ) : (
                    <span style={{ flex: "0 0 128px", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }} className="ton-retard">
                      <Icone nom="horloge" taille={16} />
                      Pas encore
                    </span>
                  )}
                  <span role="img" aria-label={`${p.faites} tâches faites sur ${p.total}`} style={{ flex: "0 0 112px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="barre" style={{ width: 64 }}>
                      <span style={{ width: `${p.total ? Math.round((p.faites / p.total) * 100) : 0}%` }} />
                    </span>
                    <span className="rangee__meta">
                      {p.faites}/{p.total}
                    </span>
                  </span>
                  <span style={{ flex: "0 0 92px", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }} title="Réunions notées cette semaine" className={p.minutesReunion ? undefined : "ton-discret"}>
                    <Icone nom="reunion" taille={15} />
                    {p.minutesReunion ? dureeTexte(p.minutesReunion) : "—"}
                    <span className="visuellement-cache"> en réunion cette semaine</span>
                  </span>
                  <span style={{ flex: "0 0 132px", fontSize: 13 }}>
                    {p.retard ? <span className="ton-retard">{p.retard} en retard</span> : null}
                    {p.retard && p.bloquees ? <span className="ton-discret"> · </span> : null}
                    {p.bloquees ? <span className="ton-veille">{p.bloquees} bloquée{p.bloquees > 1 ? "s" : ""}</span> : null}
                    {!p.retard && !p.bloquees ? <span className="ton-discret">—</span> : null}
                  </span>
                  <span style={{ flex: "0 0 168px", display: "flex", flexDirection: "column", gap: 4 }} aria-label="Charge">
                    {semaines.map((w, i) => (
                      <Niveau key={w.semaine} niveau={w.niveau} texte={`${i === 0 ? "Cette sem." : "Sem. proch."} ${nombre(w.heures)} / ${nombre(w.capacite)} h`} />
                    ))}
                  </span>
                  <span style={{ flex: "0 0 auto", display: "flex", gap: 4 }}>
                    {p.projets.map((m) => (
                      <span key={m} className="etiquette-projet" style={{ width: 30 }}>
                        {m}
                      </span>
                    ))}
                  </span>
                </div>
              </li>
  );
}
