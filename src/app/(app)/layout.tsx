import { Suspense } from "react";
import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { rappelsDuMoment } from "@/lib/donnees/rappels";
import { initiales, redigeUnRapport } from "@/lib/regles";
import { Assistant } from "@/components/Assistant";
import { Onglets, Rail, type ElementNav } from "@/components/Navigation";
import { RaccourciRecherche } from "@/components/RaccourciRecherche";
import { Consultation } from "@/components/Consultation";
import { BarreGlobale } from "@/components/BarreGlobale";
import { donneesBarre } from "@/lib/donnees/saisie";

export default async function LayoutApplication({ children }: { children: React.ReactNode }) {
  const u = await exigerUtilisateur();
  // Le mot de passe provisoire se change à la connexion par mot de passe ; avec Google ou Windows, il ne sert pas.
  if (u.doitChangerMotDePasse && (u.connexion ?? "mot_de_passe") === "mot_de_passe") redirect("/mot-de-passe");
  const a = await acces(u);
  // Heures du rapport (prêt à relire, rappel, retard de l'équipe) : alertes créées au passage, une fois par semaine.
  await rappelsDuMoment(u.id, redigeUnRapport(u)).catch((e) => console.error("Rappels du rapport :", e));
  const [{ n: nonLues }] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.personneId, u.id), eq(schema.notifications.lue, false)));

  // L'onglet Équipe sert aux chefs d'équipe, aux directeurs et aux exécutifs (rapports, charge de travail).
  const equipe = a.equipeDirecte.length > 0 || a.directeur || a.toutVoir;
  const conseil = a.toutVoir || a.directeur;
  const organisation = a.toutVoir || u.administrateur;
  const alertes = Number(nonLues);
  // La barre unique, en haut de chaque page : ce qu'il lui faut (projets, personnes, tâches à mettre à jour…).
  const barre = await donneesBarre(u);

  const RAPPORT: ElementNav = { href: "/rapport", libelle: "Rapport", icone: "document", actifs: ["/rapports"] };
  const EQUIPE: ElementNav = { href: "/equipe", libelle: "Équipe", icone: "clients", actifs: ["/charge"] };
  const PROJETS: ElementNav = { href: "/projets", libelle: "Projets", icone: "tableau-de-bord" };
  // Les exécutifs ne rédigent pas de rapport : ils lisent ceux de tout le monde (Équipe → Rapports).
  const redige = redigeUnRapport(u);
  const SEMAINE: ElementNav = { href: "/semaine", libelle: "Semaine", icone: "calendrier", actifs: ["/reunions", "/bilan", "/a-faire"] };
  const elements: ElementNav[] = [
    SEMAINE,
    ...(redige ? [RAPPORT] : []),
    ...(equipe ? [EQUIPE] : []),
    PROJETS,
    ...(conseil ? [{ href: "/conseil", libelle: "Conseil", icone: "banque" }] : []),
    ...(organisation ? [{ href: "/organisation", libelle: "Organisation", icone: "agence", actifs: ["/pilote"] }] : []),
    { href: "/recherche", libelle: "Rechercher", icone: "loupe" },
    { href: "/alertes", libelle: "Alertes", icone: "notification", compte: alertes },
  ];
  // Téléphone : quatre entrées. La dernière, « Plus », mène à tout le reste (avec le nombre d'alertes non lues).
  const telephone: ElementNav[] = redige
    ? [
        SEMAINE,
        RAPPORT,
        equipe ? EQUIPE : PROJETS,
        { href: "/plus", libelle: "Plus", icone: "menu", compte: alertes, actifs: ["/alertes", "/profil", "/conseil", "/organisation", "/recherche", "/pilote", ...(equipe ? ["/projets"] : [])] },
      ]
    : [
        SEMAINE,
        EQUIPE,
        PROJETS,
        { href: "/plus", libelle: "Plus", icone: "menu", compte: alertes, actifs: ["/alertes", "/profil", "/conseil", "/organisation", "/recherche", "/pilote"] },
      ];

  return (
    <div className="coquille">
      <Rail elements={elements} initiales={initiales(u)} nom={`${u.prenom} ${u.nom}`} />
      <div className="contenu">
        <Suspense fallback={null}>
          <BarreGlobale {...barre} />
        </Suspense>
        {children}
      </div>
      <Onglets elements={telephone} />
      <Assistant />
      <RaccourciRecherche />
      <Consultation />
    </div>
  );
}
