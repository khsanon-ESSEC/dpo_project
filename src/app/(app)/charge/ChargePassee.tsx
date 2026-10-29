/**
 * Charge de travail sur une période passée (ou en cours) : la charge réalisée de chacun, période par période,
 * et la charge prévue quand elle a été notée (chaque lundi). Mêmes personnes que la charge à venir.
 */
import { aujourdhui } from "@/lib/dates";
import { ecart, etatComparaison, moisDebutExercice, planBilan, type VueBilan } from "@/lib/bilan";
import { aLa, etiquettesAxe, nomsDesPeriodes } from "@/lib/bilan-libelles";
import { heuresTexte, LIBELLE_NIVEAU, niveauCharge, nombre } from "@/lib/charge";
import { activite } from "@/lib/donnees/bilan";
import { Bandeau } from "@/components/Bandeau";
import { LegendeCharge } from "@/components/Charge";
import { ChoixPeriode, NoteComparaison } from "@/components/ChoixPeriode";
import { Chaleur } from "@/components/Graphiques";
import { ONGLETS_EQUIPE, SousOnglets } from "@/components/SousOnglets";

type Personne = { id: string; nom: string; initiales: string; equipeId: string | null; equipe: string; capacite: number };

export async function ChargePassee({
  vue,
  param,
  personnes,
  equipe,
  equipes,
  moi,
}: {
  vue: VueBilan;
  param?: string;
  personnes: Personne[];
  equipe?: string;
  equipes: [string, string][];
  moi: string;
}) {
  const jour = aujourdhui();
  const debutExercice = moisDebutExercice(process.env.EXERCICE_DEBUT_MOIS);
  const plan = planBilan(vue, param, jour, debutExercice);
  const lignes = equipe ? personnes.filter((l) => (l.equipeId ?? "aucune") === equipe) : personnes;
  const ids = lignes.map((l) => l.id);
  const act = await activite(ids, plan);
  const etat = etatComparaison(plan, act.debuts.activite);
  const n = nomsDesPeriodes(plan, debutExercice);
  const etiquettes = etiquettesAxe(plan);
  const t = act.total(0);
  const tAvant = act.total(1);
  const au = (seuil: number) => ids.filter((id) => (act.de(id, 0).tauxCharge ?? 0) > seuil).length;
  const ec = (x: string | null) => (etat.comparer ? ` · ${x ?? "—"}` : "");
  const q = (o: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1]));
    return s.size ? `?${s}` : "";
  };
  const lien = (v: string, pp?: string) => `/charge${q({ periode: v, p: pp, equipe })}`;
  const groupes = equipes
    .filter(([eid]) => !equipe || eid === equipe)
    .map(([eid, nom]) => ({ id: eid, nom, lignes: lignes.filter((l) => (l.equipeId ?? "aucune") === eid).sort((x, y) => x.nom.localeCompare(y.nom, "fr")) }))
    .filter((g) => g.lignes.length);

  return (
    <>
      <Bandeau surtitre={`Équipe · ${n.actuel}${etat.comparer ? `, comparé ${aLa(n.avantCourt)}` : ""}`} titre="Charge de travail">
        <dl className="chiffres">
          <div className={`chiffre ${(t.tauxCharge ?? 0) > 100 ? "chiffre--retard" : (t.tauxCharge ?? 0) > 85 ? "chiffre--veille" : ""}`}>
            <dt>charge réalisée{ec(ecart(t.tauxCharge, tAvant.tauxCharge, " pts"))}</dt>
            <dd>
              {t.tauxCharge ?? "—"}
              <small>&nbsp;%</small>
            </dd>
          </div>
          <div className="chiffre">
            <dt>charge prévue (notée le lundi)</dt>
            <dd>
              {t.tauxPrevu ?? "—"}
              <small>&nbsp;%</small>
            </dd>
          </div>
          <div className={`chiffre ${au(100) ? "chiffre--retard" : ""}`}>
            <dt>au-delà de leurs heures disponibles sur la période</dt>
            <dd>{au(100)}</dd>
          </div>
          <div className={`chiffre ${au(85) - au(100) ? "chiffre--veille" : ""}`}>
            <dt>chargées sur la période (85 à 100 %)</dt>
            <dd>{au(85) - au(100)}</dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_EQUIPE} courant="/charge" label="Équipe" />
        <ChoixPeriode
          plan={plan}
          noms={n}
          lien={lien}
          comparer={etat.comparer}
          avant={
            <a href={`/charge${q({ equipe })}`} title="Les semaines à venir">
              À venir
            </a>
          }
        />
        <NoteComparaison plan={plan} noms={n} etat={etat} debutDonnees={act.debuts.activite} />
        <div className="ligne-actions">
          {equipes.length > 1 ? (
            <nav className="filtres" aria-label="Filtrer par équipe">
              <a className="filtre" href={lien(plan.vue, plan.cle)} aria-current={!equipe ? "true" : undefined}>
                Tout le monde · {personnes.length}
              </a>
              {equipes.map(([eid, nom]) => (
                <a key={eid} className="filtre" href={`/charge${q({ periode: plan.vue, p: plan.cle, equipe: eid })}`} aria-current={equipe === eid ? "true" : undefined}>
                  {nom} · {personnes.filter((l) => (l.equipeId ?? "aucune") === eid).length}
                </a>
              ))}
            </nav>
          ) : (
            <span />
          )}
          <LegendeCharge />
        </div>
        <section className="carte" aria-label="Charge réalisée, par personne et par période">
          <Chaleur
            semaines={plan.serie.map((per, k) => ({ cle: per.cle, libelle: etiquettes[k].court, sous: per.fin >= jour ? "en cours" : undefined }))}
            groupes={groupes.map((g) => ({
              id: g.id,
              nom: groupes.length > 1 ? g.nom : null,
              lignes: g.lignes.map((l) => ({
                id: l.id,
                nom: l.id === moi ? `${l.nom} (vous)` : l.nom,
                initiales: l.initiales,
                sous: l.capacite !== 40 ? `${l.capacite} h/sem.` : undefined,
                lien: `/personnes/${l.id}?vue=${plan.vue}&p=${plan.cle}#evolution`,
                cases: plan.serie.map((per, k) => {
                  const m = act.de(l.id, act.iSerie(k));
                  const sans = !etat.avecDonnees(per);
                  const niveau = niveauCharge(m.heuresRealisees, m.capaciteNette);
                  return {
                    semaine: per.cle,
                    heures: m.heuresRealisees,
                    capacite: m.capaciteNette,
                    niveau: sans ? ("libre" as const) : niveau,
                    texte: sans || m.tauxCharge === null ? "—" : `${m.tauxCharge} %`,
                    etiquette: sans
                      ? `${l.nom}, ${etiquettes[k].libelle} : pas encore de données`
                      : `${l.nom}, ${etiquettes[k].libelle} : réalisée ${heuresTexte(m.heuresRealisees)} sur ${heuresTexte(m.capaciteNette)} disponibles hors réunions (${m.tauxCharge ?? "—"} %, ${LIBELLE_NIVEAU[niveau].toLowerCase()})${m.tauxPrevu !== null ? ` ; prévue le lundi : ${m.tauxPrevu} %` : ""}`,
                  };
                }),
              })),
            }))}
          />
        </section>
        <p className="note">
          Charge réalisée : les heures estimées de chaque tâche terminée, réparties de son début à sa fin (jours ouvrés ; 4 h pour une tâche sans estimation), comparées aux heures disponibles moins les réunions notées.
          C&apos;est une estimation, pas un relevé du temps passé : une tâche encore ouverte n&apos;y compte pas. La charge prévue est notée chaque lundi par l&apos;application ; avant sa première semaine, elle n&apos;est pas connue.
          {t.heuresRealisees ? ` Sur la période : ${nombre(t.heuresRealisees)} h réalisées sur ${nombre(t.capaciteNette)} h disponibles.` : ""}
        </p>
      </div>
    </>
  );
}
