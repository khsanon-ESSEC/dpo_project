import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { initiales } from "@/lib/regles";
import { Assistant } from "@/components/Assistant";
import { Onglets, Rail, type ElementNav } from "@/components/Navigation";

export default async function LayoutApplication({ children }: { children: React.ReactNode }) {
  const u = await exigerUtilisateur();
  if (u.doitChangerMotDePasse) redirect("/mot-de-passe");
  const a = await acces(u);
  const [{ n: nonLues }] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.personneId, u.id), eq(schema.notifications.lue, false)));

  const chef = a.equipeDirecte.length > 0;
  const elements: ElementNav[] = [
    { href: "/semaine", libelle: "Semaine", icone: "calendrier", telephone: true },
    { href: "/rapport", libelle: "Rapport", icone: "document", telephone: !chef },
    ...(chef ? [{ href: "/equipe", libelle: "Équipe", icone: "clients", telephone: true }] : []),
    { href: "/projets", libelle: "Projets", icone: "tableau-de-bord", telephone: true },
    ...(a.toutVoir || a.directeur || chef ? [{ href: "/charge", libelle: "Charge", icone: "jauge" }] : []),
    ...(a.toutVoir || a.directeur ? [{ href: "/conseil", libelle: "Conseil", icone: "banque" }] : []),
    ...(a.toutVoir || u.administrateur ? [{ href: "/organisation", libelle: "Organisation", icone: "agence" }] : []),
    { href: "/alertes", libelle: "Alertes", icone: "notification", compte: Number(nonLues), telephone: true },
  ];

  return (
    <div className="coquille">
      <Rail elements={elements} initiales={initiales(u)} nom={`${u.prenom} ${u.nom}`} />
      <div className="contenu">{children}</div>
      <Onglets elements={elements} />
      <Assistant />
    </div>
  );
}
