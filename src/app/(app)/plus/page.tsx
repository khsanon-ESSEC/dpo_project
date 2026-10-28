import type { Metadata } from "next";
import { and, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { redigeUnRapport } from "@/lib/regles";
import { seDeconnecter } from "@/app/actions-communes";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ChoixTheme } from "../profil/ChoixTheme";
import { BarreCommande } from "@/components/BarreCommande";
import { donneesBarre } from "@/lib/donnees/saisie";

export const metadata: Metadata = { title: "Plus" };

type Entree = { href: string; libelle: string; sous?: string; icone: string; compte?: number };

/** Sur téléphone, la barre du bas n'a que quatre entrées : cette page mène à tout le reste. */
export default async function PagePlus() {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.personneId, u.id), eq(schema.notifications.lue, false)));
  const equipe = a.equipeDirecte.length > 0 || a.directeur || a.toutVoir;

  const groupes: { titre: string; entrees: Entree[] }[] = [
    {
      titre: "Suivi",
      entrees: [
        { href: "/alertes", libelle: "Alertes", sous: Number(n) ? `${n} non lue${Number(n) > 1 ? "s" : ""}` : "Rien de nouveau", icone: "notification", compte: Number(n) },
        { href: "/reunions", libelle: "Réunions", sous: "Noter une réunion, voir le temps passé en réunion", icone: "reunion" },
        { href: "/bilan", libelle: "Mon bilan", sous: "Cette semaine comparée aux précédentes", icone: "bilan" },
        ...(redigeUnRapport(u) ? [{ href: "/rapports", libelle: "Mes rapports", sous: "Tous les rapports du vendredi que vous avez envoyés", icone: "historique" }] : []),
        ...(equipe && redigeUnRapport(u) ? [{ href: "/projets", libelle: "Projets", sous: "Portefeuille, liste, tableau", icone: "tableau-de-bord" }] : []),
      ],
    },
    ...(equipe
      ? [
          {
            titre: "Équipe",
            entrees: [
              { href: "/equipe/rapports", libelle: redigeUnRapport(u) ? "Rapports de l'équipe" : "Rapports", sous: "Semaine par semaine, ou par personne", icone: "document" },
              { href: "/charge", libelle: "Charge de travail", sous: "Qui est chargé, qui a de la marge", icone: "jauge" },
              { href: "/equipe/bilan", libelle: "Bilan de l'équipe", sous: "Ce mois comparé au précédent, réunions comprises", icone: "bilan" },
            ],
          },
        ]
      : []),
    ...(a.toutVoir || a.directeur || u.administrateur
      ? [
          {
            titre: "Direction",
            entrees: [
              ...(a.toutVoir || a.directeur ? [{ href: "/conseil", libelle: "Rapports au conseil", sous: "Le rapport du mois, et les rapports ponctuels", icone: "banque" }] : []),
              ...(a.toutVoir || u.administrateur ? [{ href: "/organisation", libelle: "Organisation", sous: "Personnes, équipes, rôles", icone: "agence" }] : []),
              ...(u.executif || u.administrateur ? [{ href: "/pilote", libelle: "Suivi du pilote", sous: "Rapports à l'heure, tâches à jour, écrans utilisés", icone: "bilan" }] : []),
            ],
          },
        ]
      : []),
  ];

  return (
    <>
      <Bandeau surtitre={`${u.prenom} ${u.nom}`} titre="Plus" />
      <div className="page" style={{ maxWidth: 640 }}>
        <BarreCommande mode="recherche" retour="/a-faire" focus={false} {...await donneesBarre(u)} />
        {groupes.map((g) => (
          <section key={g.titre} className="carte carte--liste" aria-labelledby={`plus-${g.titre}`}>
            <h2 id={`plus-${g.titre}`} className="carte__titre">
              {g.titre}
            </h2>
            <ul className="liste">
              {g.entrees.map((e) => (
                <li key={e.href}>
                  <a href={e.href} className="rangee" style={{ minHeight: 64 }}>
                    <span className="mono" aria-hidden="true" style={{ position: "relative" }}>
                      <Icone nom={e.icone} taille={18} />
                      {e.compte ? (
                        <span className="compteur" style={{ top: -6, right: -8 }}>
                          {e.compte}
                        </span>
                      ) : null}
                    </span>
                    <span className="rangee__texte">
                      <span className="rangee__titre">{e.libelle}</span>
                      {e.sous ? <span className="rangee__sous">{e.sous}</span> : null}
                    </span>
                    <Icone nom="chevron-droite" taille={18} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section className="carte" aria-labelledby="plus-compte" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 id="plus-compte" className="carte__titre" style={{ margin: 0 }}>
            Mon compte
          </h2>
          <ChoixTheme actuel={u.theme} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <a href="/profil" className="bouton-contour">
              <Icone nom="utilisateur" taille={16} /> Profil
            </a>
            <form action={seDeconnecter}>
              <button type="submit" className="bouton-contour">
                <Icone nom="deconnexion" taille={16} /> Se déconnecter
              </button>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
