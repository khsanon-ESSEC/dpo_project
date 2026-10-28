/**
 * Évolution d'une personne sur la période choisie, comparée à la période d'avant : tâches terminées, heures
 * livrées, terminées à temps, temps en réunion, rapports du vendredi. Sur sa fiche, pour qui la suit.
 * La personne n'est comparée qu'à elle-même.
 */
import { aujourdhui, dateCourte, moisAnnee } from "@/lib/dates";
import { ecart, moisDebutExercice, planBilan, planSemaines, VUES_BILAN, type Mesures, type Periode } from "@/lib/bilan";
import { aLa, majuscule, nomsDesPeriodes } from "@/lib/bilan-libelles";
import { bilans, debutDesDonnees } from "@/lib/donnees/bilan";
import { Courbes, Jauge, valeurTexte, type PointCourbe, type Unite } from "@/components/Courbes";
import { Icone } from "@/components/Icone";

const moisCourt = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const versDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const heuresReunion = (m: Mesures) => Math.round((m.minutesReunion / 60) * 10) / 10;
const partRapports = (m: Mesures) => (m.rapportsAttendus ? Math.round((m.rapportsEnvoyes / m.rapportsAttendus) * 100) : null);

const MESURES: { id: string; titre: string; unite: Unite; valeur: (m: Mesures) => number | null; ecart: (a: Mesures, b: Mesures) => string | null; sous?: (m: Mesures) => string | null }[] = [
  { id: "taches", titre: "Tâches terminées", unite: "nombre", valeur: (m) => m.taches, ecart: (a, b) => ecart(a.taches, b.taches) },
  { id: "heures", titre: "Heures livrées", unite: "heures", valeur: (m) => m.heures, ecart: (a, b) => ecart(a.heures, b.heures, " h") },
  { id: "temps", titre: "Terminées à temps", unite: "pourcent", valeur: (m) => m.aLHeure, ecart: (a, b) => ecart(a.aLHeure, b.aLHeure, " pts"), sous: (m) => (m.avecEcheance ? `sur ${m.avecEcheance} à échéance` : null) },
  { id: "reunion", titre: "Temps en réunion", unite: "heures", valeur: heuresReunion, ecart: (a, b) => ecart(heuresReunion(a), heuresReunion(b), " h"), sous: (m) => (m.partReunion === null ? null : `${m.partReunion} % du temps de travail`) },
];

export const VUES_FICHE = [{ id: "semaines", libelle: "8 semaines" }, ...VUES_BILAN] as const;

export async function EvolutionPersonne({ personneId, vue, param, redige, lien }: { personneId: string; vue?: string; param?: string; redige: boolean; lien: (vue: string, param?: string) => string }) {
  const jour = aujourdhui();
  const debutExercice = moisDebutExercice(process.env.EXERCICE_DEBUT_MOIS);
  const plan = !vue || vue === "semaines" ? planSemaines(param, jour) : planBilan(vue, param, jour, debutExercice);
  const serieAvant = plan.serieAvant ?? [];
  const [mesures, debuts] = await Promise.all([bilans([personneId], [plan.actuel, plan.precedent, ...plan.serie, ...serieAvant]), debutDesDonnees()]);
  const m = mesures.get(personneId)!;
  const t = m[0];
  const tAvant = m[1];
  const serie = (k: number) => m[2 + k];
  const avant = (k: number) => m[2 + plan.serie.length + k];

  // Avant les premières données de l'application, il n'y a rien : ni zéro, ni comparaison.
  const debutDonnees = debuts.activite;
  const avecDonnees = (per: Periode) => !!debutDonnees && per.fin >= debutDonnees;
  const pasAvant = avecDonnees(plan.precedent);
  const partielle = pasAvant && plan.precedent.debut < debutDonnees!;
  const comparer = pasAvant && !partielle;
  const n = nomsDesPeriodes(plan, debutExercice);
  const deuxSeries = plan.vue !== "mois" && pasAvant;
  const semaines = plan.vue === "semaines";

  const points = (valeur: (x: Mesures) => number | null): PointCourbe[] =>
    plan.axe.map((cle, k) => {
      const per = plan.serie[k];
      const av = serieAvant[k];
      return {
        cle,
        libelle: semaines ? `semaine du ${dateCourte(cle)}` : moisAnnee(`${cle}-01`),
        court: semaines ? dateCourte(cle) : moisCourt.format(versDate(`${cle}-01`)),
        actuel: per && avecDonnees(per) ? valeur(serie(k)) : null,
        avant: pasAvant && av && avecDonnees(av) ? valeur(avant(k)) : null,
        libelleAvant: av ? (semaines ? `semaine du ${dateCourte(av.debut)}` : moisAnnee(av.debut)) : undefined,
        enCours: !!per && per.fin >= jour,
      };
    });

  return (
    <section aria-labelledby="evolution-titre" id="evolution" className="evolution-personne">
      <div className="carte__entete" style={{ marginBottom: 8 }}>
        <h2 id="evolution-titre" className="carte__titre" style={{ margin: 0 }}>
          Évolution
        </h2>
        <span className="note">
          {n.actuel}
          {plan.enCours && !semaines ? ` · jusqu'au ${dateCourte(jour)}` : ""}
          {comparer ? ` · comparé ${aLa(n.avantCourt)}${plan.enCours ? " à la même date" : ""}` : ""}
        </span>
      </div>
      <div className="ligne-actions bilan-periode">
        <nav className="zoom" aria-label="Période">
          {VUES_FICHE.map((v) => (
            <a key={v.id} href={lien(v.id)} aria-current={plan.vue === v.id ? "true" : undefined}>
              {v.libelle}
            </a>
          ))}
        </nav>
        <nav className="bilan-periode__nav" aria-label="Autre période">
          <a href={lien(plan.vue, plan.avant)} className="bouton-icone" aria-label="Période précédente" title="Période précédente">
            <Icone nom="chevron-gauche" taille={20} />
          </a>
          <span>
            {n.actuel}
            {comparer ? <span className="ton-discret"> vs {n.avantCourt}</span> : null}
          </span>
          {plan.apres ? (
            <a href={lien(plan.vue, plan.apres)} className="bouton-icone" aria-label="Période suivante" title="Période suivante">
              <Icone nom="chevron-droite" taille={20} />
            </a>
          ) : null}
        </nav>
      </div>
      {partielle ? (
        <p className="note">
          L&apos;application n&apos;a pas de données avant le {dateCourte(debutDonnees!)} {debutDonnees!.slice(0, 4)} : les totaux ne se comparent pas encore {aLa(n.avantCourt)} ; ce qui est déjà renseigné est en pointillé.
        </p>
      ) : !pasAvant ? (
        <p className="note">{debutDonnees ? `L'application n'a pas de données avant le ${dateCourte(debutDonnees)} ${debutDonnees.slice(0, 4)} : rien à comparer pour cette période.` : "L'application n'a pas encore de données."}</p>
      ) : null}

      <div className="bilan-graphes">
        {MESURES.map((x) => (
          <article key={x.id} className="carte graphe-carte">
            <header className="graphe-carte__tete">
              <h3 className="graphe-carte__titre">{x.titre}</h3>
              <p className="graphe-carte__valeur">
                {valeurTexte(x.valeur(t), x.unite)}
                <span className="graphe-carte__ecart">{[x.sous?.(t), comparer ? `${x.ecart(t, tAvant) ?? "—"} par rapport ${aLa(n.avantCourt)}` : null].filter(Boolean).join(" · ")}</span>
              </p>
            </header>
            <Courbes titre={`${x.titre}, ${semaines ? "semaine par semaine" : "mois par mois"}`} points={points(x.valeur)} unite={x.unite} nomActuel={n.actuel} nomAvant={deuxSeries ? n.avant : undefined} hauteur={100} />
          </article>
        ))}
        {redige ? (
          <article className="carte graphe-carte">
            <header className="graphe-carte__tete">
              <h3 className="graphe-carte__titre">Rapports du vendredi</h3>
            </header>
            <Jauge
              part={partRapports(t)}
              texte={t.rapportsAttendus ? `des rapports attendus envoyés (${t.rapportsEnvoyes} sur ${t.rapportsAttendus})` : "aucun rapport attendu sur la période"}
              sous={comparer && tAvant.rapportsAttendus ? `${ecart(partRapports(t), partRapports(tAvant), " pts") ?? "—"} par rapport ${aLa(n.avantCourt)}` : null}
            />
            <Courbes titre={`Rapports envoyés, ${semaines ? "semaine par semaine" : "mois par mois"}`} points={points(partRapports)} unite="pourcent" nomActuel={n.actuel} nomAvant={deuxSeries ? n.avant : undefined} hauteur={90} />
          </article>
        ) : null}
      </div>
      <details className="carte" style={{ marginTop: 16 }}>
        <summary className="lien-discret" style={{ cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center" }}>
          Voir les chiffres {semaines ? "semaine par semaine" : "mois par mois"}
        </summary>
        <div className="defile-x">
          <table className="comparaison bilan-valeurs" style={{ minWidth: 560, marginTop: 8 }}>
            <thead>
              <tr>
                <th scope="col">{semaines ? "Semaine" : "Mois"}</th>
                <th scope="col">Tâches terminées</th>
                <th scope="col">Heures livrées</th>
                <th scope="col">À temps</th>
                <th scope="col">En réunion</th>
                {redige ? <th scope="col">Rapports</th> : null}
              </tr>
            </thead>
            <tbody>
              {plan.axe.map((cle, k) => {
                const per = plan.serie[k];
                const av = serieAvant[k];
                const v = per && avecDonnees(per) ? serie(k) : null;
                const w = pasAvant && av && avecDonnees(av) ? avant(k) : null;
                const cellule = (f: (y: Mesures) => number | null, unite: Unite) => (
                  <td>
                    {v ? valeurTexte(f(v), unite) : "—"}
                    {deuxSeries ? <small>{w ? `${valeurTexte(f(w), unite)} avant` : "—"}</small> : null}
                  </td>
                );
                return (
                  <tr key={cle}>
                    <th scope="row">
                      {semaines ? `Sem. du ${dateCourte(cle)}` : majuscule(moisAnnee(`${cle}-01`))}
                      {per && per.fin >= jour ? <small>en cours</small> : null}
                    </th>
                    {cellule((y) => y.taches, "nombre")}
                    {cellule((y) => y.heures, "heures")}
                    {cellule((y) => y.aLHeure, "pourcent")}
                    {cellule(heuresReunion, "heures")}
                    {redige ? cellule(partRapports, "pourcent") : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      <p className="avertissement-bilan">
        Ces chiffres décrivent ce qui est enregistré dans l&apos;application (tâches marquées faites, une tâche sans estimation comptant pour 4 h ; réunions notées ; rapports envoyés). Ils ne mesurent ni la qualité du travail ni ce
        qui n&apos;est pas noté : la personne n&apos;est comparée qu&apos;à elle-même.
      </p>
    </section>
  );
}
