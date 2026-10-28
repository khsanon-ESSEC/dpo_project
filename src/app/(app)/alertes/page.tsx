import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigerUtilisateur } from "@/lib/auth/session";
import { dateCourte, dateLocale, heure } from "@/lib/dates";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";

export const metadata: Metadata = { title: "Alertes" };

const ICONE: Record<string, string> = { relance: "horloge", blocage: "interdit", rapport_recu: "document", rapport_message: "envoyer", tache: "calendrier" };

async function toutMarquerLu() {
  "use server";
  const u = await exigerUtilisateur();
  await db.update(schema.notifications).set({ lue: true }).where(and(eq(schema.notifications.personneId, u.id), eq(schema.notifications.lue, false)));
  revalidatePath("/", "layout");
}

export default async function PageAlertes() {
  const u = await exigerUtilisateur();
  const alertes = await db.select().from(schema.notifications).where(eq(schema.notifications.personneId, u.id)).orderBy(desc(schema.notifications.creeLe)).limit(50);
  const nonLues = alertes.filter((a) => !a.lue).length;
  return (
    <>
      <Bandeau surtitre={nonLues ? `${nonLues} non lue${nonLues > 1 ? "s" : ""}` : "Tout est lu"} titre="Alertes" />
      <div className="page" style={{ maxWidth: 860 }}>
        {nonLues ? (
          <form action={toutMarquerLu} style={{ alignSelf: "flex-end" }}>
            <button type="submit" className="bouton-contour">
              <Icone nom="coche" taille={16} /> Tout marquer comme lu
            </button>
          </form>
        ) : null}
        <section className="carte carte--liste" aria-label="Alertes">
          <ul className="liste">
            {alertes.map((a, i) => (
              <li key={a.id} className="apparition" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                <a href={a.lien ?? "#"} className="rangee" style={{ fontWeight: a.lue ? 400 : 500 }}>
                  <span className="mono" aria-hidden="true" style={a.lue ? undefined : { background: "var(--tag)", color: "var(--tag-encre)" }}>
                    <Icone nom={ICONE[a.type] ?? "notification"} taille={16} />
                  </span>
                  <span className="rangee__texte">
                    <span className="rangee__titre">{a.texte}</span>
                    <span className="rangee__sous">
                      {dateCourte(dateLocale(a.creeLe))} à {heure(a.creeLe)}
                      {a.lue ? "" : " · nouvelle"}
                    </span>
                  </span>
                </a>
              </li>
            ))}
            {alertes.length === 0 ? <li className="vide">Rien de nouveau.</li> : null}
          </ul>
        </section>
      </div>
    </>
  );
}
