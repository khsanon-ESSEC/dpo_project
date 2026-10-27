import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerTacheVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, dateCourte, echeanceRelative, jourAbrege } from "@/lib/dates";
import { dateLocale } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { retourValide } from "@/lib/retour";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { FormulaireTache } from "./FormulaireTache";

export const metadata: Metadata = { title: "Tâche" };

const LIBELLE: Record<string, string> = { a_faire: "À faire", en_cours: "En cours", bloquee: "Bloquée", faite: "Faite" };

export default async function PageTache({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ statut?: string; retour?: string }> }) {
  const { id } = await params;
  const { statut: statutDemande, retour: retourDemande } = await searchParams;
  const retour = retourValide(retourDemande);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, id);
  const org = await chargerOrganisation();
  const [projet] = t.projetId ? await db.select().from(schema.projets).where(eq(schema.projets.id, t.projetId)) : [null];
  const evenements = await db.select().from(schema.evenementsTache).where(eq(schema.evenementsTache.tacheId, id)).orderBy(desc(schema.evenementsTache.creeLe)).limit(8);
  const chef = projet?.chefProjetId ? org.personnes.get(projet.chefProjetId) : null;
  const assigne = org.personnes.get(t.assigneId)!;
  const e = echeanceRelative(t.echeance, aujourdhui());

  const decrire = (ev: (typeof evenements)[number]) => {
    if (ev.type === "creation") return "Créée";
    if (ev.type === "statut") return `${LIBELLE[ev.apres ?? ""] ?? ev.apres}${ev.note ? ` : ${ev.note}` : ""}`;
    if (ev.type === "echeance") return `Échéance déplacée au ${dateCourte(ev.apres)}`;
    return ev.note ?? "";
  };

  return (
    <>
      <Bandeau
        surtitre={projet?.titre ?? "Hors projet"}
        titre={t.titre}
        retour={
          retour ? (
            <a href={retour} className="retour">
              <Icone nom="chevron-gauche" taille={18} />{" "}
              {retour.startsWith("/projets/") && projet ? projet.titre : retour === "/charge" ? "Charge de travail" : retour.startsWith("/equipe") ? "Équipe" : "Ma semaine"}
            </a>
          ) : (
            <a href="/semaine" className="retour">
              <Icone nom="chevron-gauche" taille={18} /> Ma semaine
            </a>
          )
        }
      >
        <dl className="chiffres" style={{ marginTop: 20 }}>
          <div className="chiffre">
            <dt>échéance</dt>
            <dd style={{ fontSize: 22, lineHeight: "28px", fontWeight: 300 }}>
              {t.echeance ? dateCourte(t.echeance) : "—"} {e.retard && t.statut !== "faite" ? <small style={{ color: "inherit" }} className="ton-retard">· {e.texte}</small> : null}
            </dd>
          </div>
          <div className="chiffre">
            <dt>chef de projet</dt>
            <dd style={{ fontSize: 22, lineHeight: "28px", fontWeight: 300 }}>{chef ? nomComplet(chef) : "—"}</dd>
          </div>
          {t.estimationHeures ? (
            <div className="chiffre">
              <dt>temps estimé</dt>
              <dd style={{ fontSize: 22, lineHeight: "28px", fontWeight: 300 }}>{t.estimationHeures} h</dd>
            </div>
          ) : null}
          {assigne.id !== u.id ? (
            <div className="chiffre">
              <dt>confiée à</dt>
              <dd style={{ fontSize: 22, lineHeight: "28px", fontWeight: 300 }}>{nomComplet(assigne)}</dd>
            </div>
          ) : null}
        </dl>
      </Bandeau>
      <div className="page" style={{ maxWidth: 760 }}>
        <FormulaireTache
          tacheId={t.id}
          statut={statutDemande === "bloquee" ? "bloquee" : t.statut}
          blocage={t.blocage ?? ""}
          echeance={t.echeance ?? ""}
          debut={t.debut ?? ""}
          estimationHeures={t.estimationHeures}
          chefPrenom={chef && chef.id !== u.id ? nomComplet(chef) : null}
          retour={retour ?? null}
        />
        <section aria-labelledby="t-historique">
          <h2 id="t-historique" className="carte__titre">
            Historique
          </h2>
          <ol className="liste">
            {evenements.map((ev) => (
              <li key={ev.id} style={{ display: "flex", gap: 12, padding: "10px 0", fontSize: 13, lineHeight: "18px", borderTop: 0 }}>
                <span style={{ width: 64, flex: "none", color: "var(--discret)" }}>
                  {jourAbrege(dateLocale(ev.creeLe))} {Number(dateLocale(ev.creeLe).slice(8))}
                </span>
                <span>{decrire(ev)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
