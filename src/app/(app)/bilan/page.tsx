import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces, suitPersonne } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ajouterJours, aujourdhui, dateCourte, lundiDe } from "@/lib/dates";
import { ecart, semainesJusqua, type Mesures } from "@/lib/bilan";
import { nombre } from "@/lib/charge";
import { bilans } from "@/lib/donnees/bilan";
import { chargerOrganisation } from "@/lib/organisation";
import { dureeTexte } from "@/lib/projets";
import { nomComplet } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Colonnes } from "@/components/Colonnes";
import { Icone } from "@/components/Icone";
import { LienPersonne } from "@/components/Liens";
import { ONGLETS_SEMAINE, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "Bilan" };

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const h = (m: number) => (m ? dureeTexte(m) : "0 h");
const pc = (v: number | null) => (v === null ? "—" : `${v} %`);

/** Lignes de la comparaison : libellé, valeur affichée, valeur numérique (pour l'écart). */
function lignesComparaison(m: Mesures) {
  return [
    { cle: "taches", libelle: "Tâches terminées", texte: String(m.taches), detail: undefined as string | undefined, n: m.taches as number | null, unite: "" },
    { cle: "heures", libelle: "Heures livrées (estimées)", texte: `${nombre(m.heures)} h`, n: m.heures as number | null, unite: " h" },
    { cle: "temps", libelle: "Terminées à temps", texte: m.aLHeure === null ? "—" : `${m.aLHeure} %`, detail: m.avecEcheance ? `sur ${m.avecEcheance} à échéance` : undefined, n: m.aLHeure, unite: " pts" },
    { cle: "reunions", libelle: "En réunion", texte: h(m.minutesReunion), n: Math.round((m.minutesReunion / 60) * 10) / 10, unite: " h" },
    { cle: "part", libelle: "Part du temps en réunion", texte: pc(m.partReunion), n: m.partReunion, unite: " pts" },
  ];
}

export default async function PageBilan({ searchParams }: { searchParams: Promise<{ semaine?: string; personne?: string }> }) {
  const { semaine: s0, personne } = await searchParams;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const org = await chargerOrganisation();
  const qui = personne && personne !== u.id ? personne : u.id;
  if (qui !== u.id && (!/^[0-9a-f-]{36}$/.test(qui) || !suitPersonne(a, qui) || !org.personnes.get(qui))) notFound();
  const p = org.personnes.get(qui)!;
  const jour = aujourdhui();
  const courante = lundiDe(jour);
  const semaine = s0 && JOUR.test(s0) && !Number.isNaN(Date.parse(s0)) && lundiDe(s0) <= courante ? lundiDe(s0) : courante;
  const periodes = semainesJusqua(semaine, 8);
  const mesures = (await bilans([qui], periodes)).get(qui)!;
  const actuelle = mesures.at(-1)!;
  const precedente = mesures.at(-2)!;
  const enCours = semaine === courante;
  const rapports = actuelle.rapportsAttendus + precedente.rapportsAttendus > 0 || !p.executif;
  const libelleSemaine = (l: string) => dateCourte(l).replace(/\.$/, "");
  const court = (l: string) => `${Number(l.slice(8))}/${Number(l.slice(5, 7))}`;
  const lien = (s: string) => `/bilan?semaine=${s}${qui !== u.id ? `&personne=${qui}` : ""}`;

  return (
    <>
      <Bandeau
        surtitre={qui === u.id ? `Semaine du ${dateCourte(semaine)}${enCours ? ", jusqu'à aujourd'hui" : ""}` : <LienPersonne id={qui}>{nomComplet(p)}</LienPersonne>}
        titre={qui === u.id ? "Mon bilan" : `Bilan de ${p.prenom}`}
      >
        <dl className="chiffres">
          <div className="chiffre">
            <dt>tâches terminées</dt>
            <dd>{actuelle.taches}</dd>
          </div>
          <div className="chiffre">
            <dt>heures livrées</dt>
            <dd>
              {nombre(actuelle.heures)}
              <small>&nbsp;h</small>
            </dd>
          </div>
          <div className="chiffre">
            <dt>en réunion</dt>
            <dd style={{ whiteSpace: "nowrap" }}>{h(actuelle.minutesReunion)}</dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        {qui === u.id ? <SousOnglets onglets={ONGLETS_SEMAINE} courant="/bilan" label="Ma semaine" /> : null}
        <nav className="ligne-actions" aria-label="Semaines">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a href={lien(ajouterJours(semaine, -7))} className="bouton-icone" aria-label="Semaine précédente" title="Semaine précédente">
              <Icone nom="chevron-gauche" taille={20} />
            </a>
            <span style={{ fontSize: 15 }}>{enCours ? "Cette semaine" : `Semaine du ${dateCourte(semaine)}`}</span>
            {semaine < courante ? (
              <a href={lien(ajouterJours(semaine, 7))} className="bouton-icone" aria-label="Semaine suivante" title="Semaine suivante">
                <Icone nom="chevron-droite" taille={20} />
              </a>
            ) : null}
          </div>
          {qui !== u.id ? (
            <a href={`/equipe/bilan`} className="lien-discret">
              Bilan de l&apos;équipe →
            </a>
          ) : null}
        </nav>
        <div className="colonnes">
          <section className="carte colonne-large" aria-labelledby="b-comp">
            <h2 id="b-comp" className="carte__titre" style={{ marginBottom: 8 }}>
              Semaine sur semaine
            </h2>
            <div className="defile-x">
              <table className="comparaison">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="visuellement-cache">Mesure</span>
                    </th>
                    <th scope="col">Sem. du {libelleSemaine(periodes.at(-2)!.debut)}</th>
                    <th scope="col">{enCours ? "Cette semaine" : `Sem. du ${libelleSemaine(semaine)}`}</th>
                    <th scope="col">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {lignesComparaison(actuelle).map((l, i) => {
                    const avant = lignesComparaison(precedente)[i];
                    return (
                      <tr key={l.cle}>
                        <th scope="row">{l.libelle}</th>
                        <td>
                          {avant.texte}
                          {avant.detail ? <small>{avant.detail}</small> : null}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {l.texte}
                          {l.detail ? <small>{l.detail}</small> : null}
                        </td>
                        <td className="ecart">{ecart(l.n, avant.n, l.unite) ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {rapports ? (
                    <tr>
                      <th scope="row">Rapport du vendredi</th>
                      <td>{precedente.rapportsAttendus ? (precedente.rapportsEnvoyes ? "Envoyé" : "Pas envoyé") : "—"}</td>
                      <td style={{ fontWeight: 600 }}>{actuelle.rapportsEnvoyes ? "Envoyé" : enCours ? "Pas encore envoyé" : actuelle.rapportsAttendus ? "Pas envoyé" : "—"}</td>
                      <td className="ecart" />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {enCours ? (
              <p className="note" style={{ margin: "12px 0 0" }}>
                La semaine en cours n&apos;est pas finie : elle compte jusqu&apos;à aujourd&apos;hui.
              </p>
            ) : null}
          </section>
          <section className="carte colonne-etroite" aria-labelledby="b-tend" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <h2 id="b-tend" className="carte__titre" style={{ margin: 0 }}>
              Huit semaines
            </h2>
            <Colonnes
              titre="Tâches terminées"
              choisie={semaine}
              colonnes={periodes.map((per, i) => ({ cle: per.cle, libelle: libelleSemaine(per.debut), libelleCourt: court(per.debut), valeur: mesures[i].taches, texte: `${mesures[i].taches} tâche${mesures[i].taches > 1 ? "s" : ""}`, etiquette: String(mesures[i].taches), detail: `${nombre(mesures[i].heures)} h estimées` }))}
            />
            <Colonnes
              titre="Heures de réunion"
              choisie={semaine}
              colonnes={periodes.map((per, i) => ({ cle: per.cle, libelle: libelleSemaine(per.debut), libelleCourt: court(per.debut), valeur: mesures[i].minutesReunion, texte: h(mesures[i].minutesReunion), detail: mesures[i].partReunion === null ? undefined : `${mesures[i].partReunion} % du temps` }))}
            />
            <details>
              <summary className="lien-discret" style={{ cursor: "pointer" }}>
                Voir les chiffres
              </summary>
              <table className="comparaison" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th scope="col">Semaine</th>
                    <th scope="col">Tâches</th>
                    <th scope="col">Heures</th>
                    <th scope="col">Réunions</th>
                  </tr>
                </thead>
                <tbody>
                  {periodes.map((per, i) => (
                    <tr key={per.cle}>
                      <th scope="row">{libelleSemaine(per.debut)}</th>
                      <td>{mesures[i].taches}</td>
                      <td>{nombre(mesures[i].heures)}</td>
                      <td>{h(mesures[i].minutesReunion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        </div>
        <p className="avertissement-bilan">
          Ces chiffres décrivent ce qui est enregistré dans l&apos;application : les tâches marquées faites (une tâche sans estimation compte pour 4 h) et les réunions notées. Ils ne mesurent ni la qualité du travail ni ce qui n&apos;est pas
          noté ; ils servent à en parler, pas à classer.
        </p>
      </div>
    </>
  );
}
