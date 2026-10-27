import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, echeanceRelative } from "@/lib/dates";
import { compter, tachesDe, trier } from "@/lib/donnees/semaine";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";

export const metadata: Metadata = { title: "Tâches d'une personne" };

/** Les tâches d'une personne de mon équipe, quand son rapport n'est pas encore arrivé. */
export default async function PagePersonne({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await exigerUtilisateur();
  const a = await acces(u);
  if (!a.equipeDirecte.includes(id) && !a.toutVoir) notFound();
  const org = await chargerOrganisation();
  const p = org.personnes.get(id);
  if (!p) notFound();
  const jour = aujourdhui();
  const taches = trier(await tachesDe([id]), jour);
  const c = compter(taches, jour);
  return (
    <>
      <Bandeau
        surtitre={p.poste}
        titre={nomComplet(p)}
        retour={
          <a href="/equipe" className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Mon équipe
          </a>
        }
      >
        <p className="discret" style={{ margin: "12px 0 0", fontSize: 13 }}>
          Pas encore de rapport cette semaine · {c.faites}/{c.total} tâches faites
        </p>
      </Bandeau>
      <div className="page" style={{ maxWidth: 860 }}>
        <section className="carte carte--liste" aria-label="Tâches">
          <ul className="liste">
            {taches.map((t) => {
              const e = echeanceRelative(t.echeance, jour);
              return (
                <li key={t.id}>
                  <a href={`/taches/${t.id}`} className={`rangee${t.statut === "faite" ? " fait" : ""}`}>
                    {t.projetCode ? (
                      <span className="mono" aria-hidden="true">
                        {t.projetCode}
                      </span>
                    ) : null}
                    <span className="rangee__texte">
                      <span className="rangee__titre">{t.titre}</span>
                      <span className="rangee__sous">{t.projetTitre ?? "Hors projet"}</span>
                    </span>
                    <span className={`rangee__meta ${t.statut === "bloquee" ? "ton-veille" : e.retard && t.statut !== "faite" ? "ton-retard" : ""}`}>
                      {t.statut === "faite" ? "Faite" : t.statut === "bloquee" ? "Bloquée" : e.texte}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
