import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { aujourdhui, dateCourte, moisAnnee } from "@/lib/dates";
import { additionner, ecart, mois, moisPrecedent, moisSuivant, type Mesures } from "@/lib/bilan";
import { nombre } from "@/lib/charge";
import { bilans } from "@/lib/donnees/bilan";
import { monEquipe } from "@/lib/donnees/equipe";
import { dureeTexte } from "@/lib/projets";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { LienPersonne } from "@/components/Liens";
import { ONGLETS_EQUIPE, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "Bilan de l'équipe" };

const h = (m: number) => (m ? dureeTexte(m) : "0 h");

function Cellules({ m, avant }: { m: Mesures; avant: Mesures }) {
  const heuresReunion = (x: Mesures) => Math.round((x.minutesReunion / 60) * 10) / 10;
  return (
    <>
      <td>
        {m.taches}
        <small>{ecart(m.taches, avant.taches) ?? "—"}</small>
      </td>
      <td>
        {nombre(m.heures)} h<small>{ecart(m.heures, avant.heures, " h") ?? "—"}</small>
      </td>
      <td>
        {m.aLHeure === null ? "—" : `${m.aLHeure} %`}
        <small>{ecart(m.aLHeure, avant.aLHeure, " pts") ?? "—"}</small>
      </td>
      <td>
        {h(m.minutesReunion)}
        <small>{ecart(heuresReunion(m), heuresReunion(avant), " h") ?? "—"}</small>
      </td>
      <td>
        {m.partReunion === null ? "—" : `${m.partReunion} %`}
        <small>{ecart(m.partReunion, avant.partReunion, " pts") ?? "—"}</small>
      </td>
      <td>
        {m.rapportsAttendus ? `${m.rapportsEnvoyes}/${m.rapportsAttendus}` : "—"}
        <small>{avant.rapportsAttendus ? `${avant.rapportsEnvoyes}/${avant.rapportsAttendus} avant` : ""}</small>
      </td>
    </>
  );
}

export default async function PageBilanEquipe({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const { mois: m0 } = await searchParams;
  const u = await exigerInterne();
  const a = await acces(u);
  if (!(a.equipeDirecte.length > 0 || a.directeur || a.toutVoir)) redirect("/bilan");
  const jour = aujourdhui();
  const moisCourant = jour.slice(0, 7);
  const cle = m0 && /^\d{4}-(0[1-9]|1[0-2])$/.test(m0) && m0 <= moisCourant ? m0 : moisCourant;
  const avantCle = moisPrecedent(cle);
  const [pAvant, pMois] = [mois(avantCle), mois(cle)];
  const e = await monEquipe(a);
  const ids = e.personnes.map((p) => p.id);
  const mesures = await bilans(ids, [pAvant, pMois]);
  const de = (id: string) => mesures.get(id)!;
  const total = additionner(ids.map((id) => de(id)[1]));
  const totalAvant = additionner(ids.map((id) => de(id)[0]));
  const enCours = cle === moisCourant;
  const nomMois = (c: string) => moisAnnee(`${c}-01`);
  const apres = moisSuivant(cle);

  return (
    <>
      <Bandeau surtitre={`${nomMois(cle)}${enCours ? ` · jusqu'au ${dateCourte(jour)}` : ""} · comparé à ${nomMois(avantCle).split(" ")[0]}`} titre="Bilan de l'équipe">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>tâches terminées · {ecart(total.taches, totalAvant.taches) ?? "—"}</dt>
            <dd>{total.taches}</dd>
          </div>
          <div className="chiffre">
            <dt>heures livrées · {ecart(total.heures, totalAvant.heures, " h") ?? "—"}</dt>
            <dd>
              {nombre(total.heures)}
              <small>&nbsp;h</small>
            </dd>
          </div>
          <div className={`chiffre ${(total.partReunion ?? 0) >= 30 ? "chiffre--veille" : ""}`}>
            <dt>du temps en réunion · {ecart(total.partReunion, totalAvant.partReunion, " pts") ?? "—"}</dt>
            <dd>
              {total.partReunion ?? "—"}
              <small>&nbsp;%</small>
            </dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_EQUIPE} courant="/equipe/bilan" label="Équipe" />
        <nav className="ligne-actions" aria-label="Mois">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a href={`/equipe/bilan?mois=${avantCle}`} className="bouton-icone" aria-label="Mois précédent" title="Mois précédent">
              <Icone nom="chevron-gauche" taille={20} />
            </a>
            <span style={{ fontSize: 15 }}>
              {nomMois(cle)} <span className="ton-discret">vs {nomMois(avantCle)}</span>
            </span>
            {apres <= moisCourant ? (
              <a href={`/equipe/bilan?mois=${apres}`} className="bouton-icone" aria-label="Mois suivant" title="Mois suivant">
                <Icone nom="chevron-droite" taille={20} />
              </a>
            ) : null}
          </div>
          {enCours ? <span className="note">Le mois en cours compte jusqu&apos;à aujourd&apos;hui ; les parts (à temps, en réunion) se comparent mieux que les totaux.</span> : null}
        </nav>
        {e.groupes.map((g) => {
          const t = additionner(g.personnes.map((p) => de(p.id)[1]));
          const tAvant = additionner(g.personnes.map((p) => de(p.id)[0]));
          return (
            <section key={g.chefId} className="carte" aria-labelledby={`bg-${g.chefId}`}>
              <h2 id={`bg-${g.chefId}`} className="carte__titre" style={{ marginBottom: 4 }}>
                {g.titre}
              </h2>
              {g.sous ? <p className="note" style={{ margin: "0 0 8px" }}>{g.sous}</p> : null}
              <div className="defile-x">
                <table className="comparaison" style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th scope="col">Personne</th>
                      <th scope="col">Tâches terminées</th>
                      <th scope="col">Heures livrées</th>
                      <th scope="col">À temps</th>
                      <th scope="col">En réunion</th>
                      <th scope="col">Part du temps</th>
                      <th scope="col">Rapports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...g.personnes]
                      .sort((x, y) => x.nom.localeCompare(y.nom, "fr"))
                      .map((p) => {
                        const [avant, m] = de(p.id);
                        return (
                          <tr key={p.id}>
                            <th scope="row">
                              <LienPersonne id={p.id}>{p.nom}</LienPersonne>
                              <small>
                                <a href={`/bilan?personne=${p.id}`} className="lien-discret">
                                  Semaine par semaine
                                </a>
                              </small>
                            </th>
                            <Cellules m={m} avant={avant} />
                          </tr>
                        );
                      })}
                  </tbody>
                  {g.personnes.length > 1 ? (
                    <tfoot>
                      <tr>
                        <th scope="row">Ensemble · {g.personnes.length}</th>
                        <Cellules m={t} avant={tAvant} />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </section>
          );
        })}
        {e.groupes.length === 0 ? <p className="vide">Personne dans votre équipe.</p> : null}
        <p className="avertissement-bilan">
          Sous chaque chiffre, l&apos;écart avec {nomMois(avantCle).split(" ")[0]}. Ces chiffres décrivent ce qui est enregistré dans l&apos;application (tâches marquées faites, une tâche sans estimation comptant pour 4 h ; réunions notées ; rapports envoyés). Ils ne
          mesurent ni la qualité du travail ni ce qui n&apos;est pas noté : ils servent à ouvrir une conversation avec la personne, pas à la classer.
        </p>
      </div>
    </>
  );
}
