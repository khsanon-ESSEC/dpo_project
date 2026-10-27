import type { Metadata } from "next";
import { suitPersonne } from "@/lib/acces";
import { dateCourte } from "@/lib/dates";
import { heuresTexte, LIBELLE_NIVEAU, nombre } from "@/lib/charge";
import { chargeDuProjet } from "@/lib/donnees/charge";
import { LegendeCharge, Niveau } from "@/components/Charge";
import { chargerVueProjet, EnTeteVue } from "../commun";

export const metadata: Metadata = { title: "Charge de l'équipe du projet" };

/**
 * Charge de l'équipe d'un projet : les heures que chacun a sur ce projet, semaine par semaine,
 * et son niveau de charge tous projets confondus (pour savoir à qui confier une nouvelle tâche).
 * Le détail des autres projets n'est montré qu'aux personnes qui suivent déjà cette personne.
 */
export default async function PageChargeProjet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await chargerVueProjet(id);
  const { semaines, membres } = await chargeDuProjet(id, ctx.projet.chefProjetId);
  const voitCharge = ctx.a.toutVoir || ctx.a.directeur || ctx.a.equipeDirecte.length > 0;
  const tri = membres.sort((x, y) => Number(y.chefDeProjet) - Number(x.chefDeProjet) || y.projet.semaines.reduce((s, w) => s + w.heures, 0) - x.projet.semaines.reduce((s, w) => s + w.heures, 0));
  const surchargesCetteSemaine = membres.filter((m) => m.charge.semaines[0].niveau === "surchargee").length;
  const surchargesProchaine = membres.filter((m) => m.charge.semaines[1]?.niveau === "surchargee").length;
  const totalProjet = membres.reduce((s, m) => s + m.projet.semaines.reduce((x, w) => x + w.heures, 0), 0);

  return (
    <>
      <EnTeteVue ctx={ctx} vue="charge">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>personnes sur le projet</dt>
            <dd>{membres.length}</dd>
          </div>
          <div className="chiffre">
            <dt>prévues sur ce projet, {semaines.length} semaines</dt>
            <dd>
              {Math.round(totalProjet)}
              <small>&nbsp;h</small>
            </dd>
          </div>
          <div className={`chiffre ${surchargesCetteSemaine ? "chiffre--retard" : ""}`}>
            <dt>surchargée{surchargesCetteSemaine > 1 ? "s" : ""} cette semaine</dt>
            <dd>{surchargesCetteSemaine}</dd>
          </div>
          <div className={`chiffre ${surchargesProchaine ? "chiffre--veille" : ""}`}>
            <dt>la semaine prochaine</dt>
            <dd>{surchargesProchaine}</dd>
          </div>
        </dl>
      </EnTeteVue>
      <div className="page">
        <div className="ligne-actions">
          <p className="note" style={{ maxWidth: 640 }}>
            En haut de chaque case : les heures sur ce projet. En dessous : la charge totale de la personne, tous projets confondus. Cette semaine ne compte que les jours qui restent.
          </p>
          <LegendeCharge />
        </div>
        <section className="carte defile-x" aria-label="Charge par semaine">
          <table className="table-charge">
            <thead>
              <tr>
                <th scope="col">Personne</th>
                {semaines.map((s, i) => (
                  <th key={s} scope="col">
                    {i === 0 ? "Cette semaine" : i === 1 ? "Semaine prochaine" : `Semaine du ${dateCourte(s)}`}
                    <small>{i < 2 ? `du ${dateCourte(s)}` : ""}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tri.map((m) => {
                const detail = suitPersonne(ctx.a, m.id);
                return (
                  <tr key={m.id}>
                    <th scope="row">
                      {detail && voitCharge ? (
                        <a className="personne-charge" href={`/equipe/${m.id}`}>
                          <span className="mono" aria-hidden="true">
                            {m.initiales}
                          </span>
                          <span className="rangee__texte">
                            <span className="rangee__titre">{m.nom}</span>
                            <span className="rangee__sous">{m.chefDeProjet ? "Chef de projet" : `${m.nbTachesProjet} tâche${m.nbTachesProjet > 1 ? "s" : ""} ouverte${m.nbTachesProjet > 1 ? "s" : ""}`}</span>
                          </span>
                        </a>
                      ) : (
                        <span className="personne-charge">
                          <span className="mono" aria-hidden="true">
                            {m.initiales}
                          </span>
                          <span className="rangee__texte">
                            <span className="rangee__titre">{m.nom}</span>
                            <span className="rangee__sous">{m.chefDeProjet ? "Chef de projet" : `${m.nbTachesProjet} tâche${m.nbTachesProjet > 1 ? "s" : ""} ouverte${m.nbTachesProjet > 1 ? "s" : ""}`}</span>
                          </span>
                        </span>
                      )}
                    </th>
                    {m.projet.semaines.map((w, i) => {
                      const total = m.charge.semaines[i];
                      const titre = detail
                        ? `${heuresTexte(w.heures)} sur ce projet ; ${heuresTexte(total.heures)} au total sur ${heuresTexte(total.capacite)} disponibles (${LIBELLE_NIVEAU[total.niveau].toLowerCase()})`
                        : `${heuresTexte(w.heures)} sur ce projet ; charge totale : ${LIBELLE_NIVEAU[total.niveau].toLowerCase()}`;
                      return (
                        <td key={w.semaine} title={titre}>
                          <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <span className="jauge__chiffre">{w.heures > 0 ? heuresTexte(w.heures) : "—"}</span>
                            <Niveau niveau={total.niveau} texte={detail ? `${nombre(total.heures)} / ${nombre(total.capacite)} h` : LIBELLE_NIVEAU[total.niveau]} />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        {voitCharge ? (
          <p className="note">
            <a href="/charge" className="lien-discret">
              Voir la charge de toute l&apos;équipe →
            </a>
          </p>
        ) : null}
      </div>
    </>
  );
}
