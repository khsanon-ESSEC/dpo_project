import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerInterne } from "@/lib/auth/session";
import { moisAnnee } from "@/lib/dates";
import { mesRapports, semaineCourante, serieDeRapports } from "@/lib/donnees/rapport";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet, redigeUnRapport } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { LigneResume, semaineTexte } from "@/components/ResumeRapport";
import { ONGLETS_RAPPORT, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "Mes rapports" };

/** Tous mes rapports du vendredi, du plus récent au plus ancien, regroupés par mois. */
export default async function PageMesRapports() {
  const u = await exigerInterne();
  if (!redigeUnRapport(u)) redirect("/equipe/rapports");
  const semaine = semaineCourante();
  const [liste, org] = await Promise.all([mesRapports(u.id), chargerOrganisation()]);
  const envoyes = liste.filter((r) => r.statut === "envoye");
  const serie = serieDeRapports(liste, semaine);
  const mois = [...new Set(liste.map((r) => r.semaine.slice(0, 7)))];

  return (
    <>
      <Bandeau surtitre="Rapport du vendredi" titre="Mes rapports">
        <dl className="chiffres">
          <div className="chiffre">
            <dt>rapports envoyés</dt>
            <dd>{envoyes.length}</dd>
          </div>
          <div className="chiffre">
            <dt>semaine{serie > 1 ? "s" : ""} d&apos;affilée</dt>
            <dd>{serie}</dd>
          </div>
          <div className="chiffre">
            <dt>lignes « Fait » au total</dt>
            <dd>{envoyes.reduce((s, r) => s + r.comptes.fait, 0)}</dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page" style={{ maxWidth: 980 }}>
        <SousOnglets onglets={ONGLETS_RAPPORT} courant="/rapports" label="Rapports" />
        {liste.length === 0 ? <p className="vide">Pas encore de rapport. Le premier se prépare tout seul à partir de vos tâches, dans l&apos;onglet « Cette semaine ».</p> : null}
        {mois.map((m) => (
          <section key={m} className="carte carte--liste" aria-labelledby={`m-${m}`}>
            <h2 id={`m-${m}`} className="carte__titre">
              {moisAnnee(`${m}-01`)}
            </h2>
            <ul className="liste">
              {liste
                .filter((r) => r.semaine.startsWith(m))
                .map((r) => {
                  const dest = r.destinataireId ? org.personnes.get(r.destinataireId) : null;
                  const courant = r.semaine === semaine;
                  return (
                    <li key={r.id}>
                      <LigneResume
                        r={r}
                        lien={courant && r.statut !== "envoye" ? "/rapport" : `/rapports/${r.id}`}
                        titre={`${courant ? "Cette semaine" : "Semaine"} ${semaineTexte(r.semaine)}`}
                        sous={dest ? `Pour ${nomComplet(dest)}` : undefined}
                      />
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
