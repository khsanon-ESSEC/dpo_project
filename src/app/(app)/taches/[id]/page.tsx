import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerTacheVisible, idsProjetsVisibles } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, dateCourte, echeanceRelative, jourAbrege } from "@/lib/dates";
import { dateLocale } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { retourValide } from "@/lib/retour";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { LienPersonne, LienProjet } from "@/components/Liens";
import { FormulaireTache } from "./FormulaireTache";
import { DefinitionTache } from "./DefinitionTache";
import { assignables, histoireDeTache } from "@/lib/donnees/gestion";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { tacheSupprimable } from "@/lib/projets";
import { annuler, retablir, supprimer } from "../actions";

export const metadata: Metadata = { title: "Tâche" };

const LIBELLE: Record<string, string> = { a_faire: "À faire", en_cours: "En cours", bloquee: "Bloquée", faite: "Faite" };

export default async function PageTache({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ statut?: string; retour?: string; erreur?: string }> }) {
  const { id } = await params;
  const { statut: statutDemande, retour: retourDemande, erreur } = await searchParams;
  const retour = retourValide(retourDemande);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const t = await exigerTacheVisible(a, id);
  const org = await chargerOrganisation();
  const [projet] = t.projetId ? await db.select().from(schema.projets).where(eq(schema.projets.id, t.projetId)) : [null];
  const evenements = await db.select().from(schema.evenementsTache).where(eq(schema.evenementsTache.tacheId, id)).orderBy(desc(schema.evenementsTache.creeLe)).limit(12);
  const visibles = await idsProjetsVisibles(a);
  const projets = (await tousLesProjetsActifs()).filter((x) => visibles === "tous" || visibles.has(x.id) || x.id === t.projetId);
  if (projet && !projets.some((x) => x.id === projet.id)) projets.unshift({ id: projet.id, code: projet.code, titre: projet.titre });
  const { personnes, base, parProjet } = await assignables(a);
  if (!personnes.some((x) => x.id === t.assigneId)) personnes.push({ id: t.assigneId, nom: nomComplet(org.personnes.get(t.assigneId)!) });
  const supprimable = tacheSupprimable({ statut: t.statut, ...(await histoireDeTache(t.id)) });
  const chef = projet?.chefProjetId ? org.personnes.get(projet.chefProjetId) : null;
  const assigne = org.personnes.get(t.assigneId)!;
  const e = echeanceRelative(t.echeance, aujourdhui());

  const decrire = (ev: (typeof evenements)[number]) => {
    if (ev.type === "creation") return "Créée";
    if (ev.type === "statut") return `${LIBELLE[ev.apres ?? ""] ?? ev.apres}${ev.note ? ` : ${ev.note}` : ""}`;
    if (ev.type === "echeance") return `Échéance déplacée au ${dateCourte(ev.apres)}`;
    if (ev.type === "titre") return `Renommée : « ${ev.apres} »`;
    if (ev.type === "projet") return "Projet changé";
    if (ev.type === "assignation") return `Confiée à ${ev.note ?? "une autre personne"}`;
    if (ev.type === "annulation") return `Annulée : ${ev.note ?? ""}`;
    if (ev.type === "retablie") return "Rétablie";
    return ev.note ?? "";
  };

  return (
    <>
      <Bandeau
        surtitre={projet ? <LienProjet id={projet.id} visible={visibles === "tous" || visibles.has(projet.id)}>{projet.titre}</LienProjet> : "Hors projet"}
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
            <dd style={{ fontSize: 22, lineHeight: "28px", fontWeight: 300 }}>{chef ? <LienPersonne id={chef.id}>{nomComplet(chef)}</LienPersonne> : "—"}</dd>
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
              <dd style={{ fontSize: 22, lineHeight: "28px", fontWeight: 300 }}>
                <LienPersonne id={assigne.id}>{nomComplet(assigne)}</LienPersonne>
              </dd>
            </div>
          ) : null}
        </dl>
      </Bandeau>
      <div className="page" style={{ maxWidth: 760 }}>
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : null}
        {t.annuleeLe ? (
          <div className="erreur" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
            <span>
              Tâche annulée le {dateCourte(dateLocale(t.annuleeLe))}
              {t.annuleeParId && org.personnes.get(t.annuleeParId) ? (
                <>
                  {" par "}
                  <LienPersonne id={t.annuleeParId}>{nomComplet(org.personnes.get(t.annuleeParId)!)}</LienPersonne>
                </>
              ) : null}
              {" : "}
              {t.motifAnnulation}
            </span>
            <form action={retablir.bind(null, t.id)}>
              <button type="submit" className="bouton-mini">
                Rétablir
              </button>
            </form>
          </div>
        ) : null}
        {t.description && t.annuleeLe ? <p style={{ whiteSpace: "pre-line" }}>{t.description}</p> : null}
        {t.annuleeLe ? null : (
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
        )}
        {t.annuleeLe ? null : (
          <DefinitionTache
            tacheId={t.id}
            titre={t.titre}
            description={t.description}
            projetId={t.projetId ?? ""}
            assigneId={t.assigneId}
            projets={projets}
            personnes={personnes}
            base={base}
            parProjet={parProjet}
          />
        )}
        {t.annuleeLe ? null : (
          <section className="carte" id="suppression" aria-labelledby="t-suppr" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 id="t-suppr" className="carte__titre" style={{ margin: 0 }}>
              {supprimable ? "Supprimer la tâche" : "Annuler la tâche"}
            </h2>
            {supprimable ? (
              <form action={supprimer.bind(null, t.id)} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                {retour ? <input type="hidden" name="retour" value={retour} /> : null}
                <span className="note" style={{ flex: "1 1 260px" }}>
                  Elle n&apos;a encore aucune histoire : elle peut être supprimée définitivement.
                </span>
                <label className="confirmer">
                  <input type="checkbox" name="confirme" required /> Oui, la supprimer
                </label>
                <button type="submit" className="bouton-contour" style={{ color: "var(--retard)", borderColor: "var(--retard-point)" }}>
                  Supprimer
                </button>
              </form>
            ) : (
              <form action={annuler.bind(null, t.id)} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
                <div className="champ" style={{ flex: "1 1 260px" }}>
                  <label htmlFor="t-motif">Pourquoi l&apos;annuler</label>
                  <input id="t-motif" name="motif" required maxLength={500} aria-describedby="t-motif-aide" />
                  <span className="aide" id="t-motif-aide">
                    Elle a une histoire (mises à jour, rapports) : annulée, elle quitte les listes et la charge, et reste lisible.
                  </span>
                </div>
                <button type="submit" className="bouton-contour">
                  Annuler la tâche
                </button>
              </form>
            )}
          </section>
        )}
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
