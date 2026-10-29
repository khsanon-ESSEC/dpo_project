import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { acces, exigerTacheVisible, idsProjetsVisibles, peutModifierTache } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { aujourdhui, dateCourte, echeanceRelative, jourAbrege, lundiDe } from "@/lib/dates";
import { dateLocale } from "@/lib/dates";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { retourValide } from "@/lib/retour";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { LienPersonne, LienProjet } from "@/components/Liens";
import { FormulaireTache } from "./FormulaireTache";
import { DefinitionTache } from "./DefinitionTache";
import { LigneMiseAJour } from "@/components/LigneMiseAJour";
import { assignables, histoireDeTache } from "@/lib/donnees/gestion";
import { choixDeLivrables } from "@/lib/donnees/livrables";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { tacheSupprimable, apresLeLivrable } from "@/lib/projets";
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
  const { personnes, base, parProjet, parLivrable, externesPartout, horsProjet } = await assignables(a);
  // Livrables : celui de la tâche (s'il y en a un), et ceux de chaque projet pour la changer de livrable.
  const choixLivrables = await choixDeLivrables(projets.map((x) => x.id));
  const livrables = Object.fromEntries(Object.entries(choixLivrables).map(([k, l]) => [k, l.filter((x) => x.etat !== "atteint" || x.id === t.livrableId).map((x) => ({ id: x.id, libelle: x.libelle, prevuLe: x.prevuLe }))]));
  const leLivrable = t.livrableId && t.projetId ? (choixLivrables[t.projetId] ?? []).find((x) => x.id === t.livrableId) : undefined;
  const responsableLivrable = leLivrable?.responsableId ? org.personnes.get(leLivrable.responsableId) : undefined;
  const apresLivrable = !!leLivrable && apresLeLivrable(t, leLivrable.prevuLe);
  const actuel = org.personnes.get(t.assigneId)!;
  if (!personnes.some((x) => x.id === t.assigneId)) personnes.push({ id: t.assigneId, nom: nomComplet(actuel), externe: actuel.externe, organisation: actuel.organisation });
  // « @ » ou « pour … » dans la ligne de mise à jour : les personnes à qui l'on peut confier cette tâche
  // (mêmes règles que « Confiée à » plus bas ; le serveur les vérifie de nouveau).
  const modifiable = peutModifierTache(a, t);
  const permisLigne = new Set([...base, ...(parProjet[t.projetId ?? ""] ?? []), ...(parLivrable[t.livrableId ?? ""] ?? [])]);
  const externesLigne = externesPartout || (!t.projetId && horsProjet) || (!!t.projetId && t.projetId in parProjet);
  const personnesLigne = personnes.filter((x) => permisLigne.has(x.id) || (x.externe && externesLigne));
  const supprimable = tacheSupprimable({ statut: t.statut, ...(await histoireDeTache(t.id)) });
  const chef = projet?.chefProjetId ? org.personnes.get(projet.chefProjetId) : null;
  const assigne = org.personnes.get(t.assigneId)!;
  const e = echeanceRelative(t.echeance, aujourdhui());
  // Action décidée en réunion : la réunion d'origine (lien vers la semaine pour qui y a participé).
  const [reunion] = t.reunionId ? await db.select({ id: schema.reunions.id, titre: schema.reunions.titre, jour: schema.reunions.jour }).from(schema.reunions).where(eq(schema.reunions.id, t.reunionId)) : [];
  const [participe] = reunion
    ? await db.select({ id: schema.participantsReunion.personneId }).from(schema.participantsReunion).where(and(eq(schema.participantsReunion.reunionId, reunion.id), eq(schema.participantsReunion.personneId, u.id)))
    : [];

  const decrire = (ev: (typeof evenements)[number]) => {
    if (ev.type === "creation") return "Créée";
    if (ev.type === "statut") return `${LIBELLE[ev.apres ?? ""] ?? ev.apres}${ev.note ? ` : ${ev.note}` : ""}`;
    if (ev.type === "echeance") return `Échéance déplacée au ${dateCourte(ev.apres)}`;
    if (ev.type === "titre") return `Renommée : « ${ev.apres} »`;
    if (ev.type === "projet") return "Projet changé";
    if (ev.type === "livrable") {
      const l = ev.apres ? Object.values(choixLivrables).flat().find((x) => x.id === ev.apres) : null;
      return ev.apres ? `Rattachée au livrable${l ? ` « ${l.libelle} »` : ""}` : "Retirée de son livrable";
    }
    if (ev.type === "assignation") return `Confiée à ${ev.note ?? "une autre personne"}`;
    if (ev.type === "annulation") return `Annulée : ${ev.note ?? ""}`;
    if (ev.type === "retablie") return "Rétablie";
    if (ev.type === "relance") return `Relance${ev.note ? ` : « ${ev.note} »` : ""}`;
    if (ev.type === "relance_annulee") return "Relance annulée";
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
              {retour.startsWith("/projets/") && projet ? projet.titre : retour === "/charge" ? "Charge de travail" : retour === "/a-faire" ? "À faire" : retour.startsWith("/equipe") ? "Équipe" : "Ma semaine"}
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
        {leLivrable ? (
          <p className={`note-livrable${apresLivrable ? " note-livrable--apres" : ""}`}>
            <Icone nom="drapeau" taille={16} />
            <span>
              Mène au livrable{" "}
              <a href={`/projets/${t.projetId}#livrable-${leLivrable.id}`} className="lien-discret">
                « {leLivrable.libelle} »
              </a>
              {leLivrable.prevuLe ? `, prévu le ${dateCourte(leLivrable.prevuLe)}` : ""}
              {responsableLivrable ? (
                <>
                  {" "}
                  · responsable <LienPersonne id={responsableLivrable.id}>{nomComplet(responsableLivrable)}</LienPersonne>
                </>
              ) : null}
              {apresLivrable ? <strong> · l&apos;échéance de la tâche tombe après : le livrable prendra du retard.</strong> : null}
            </span>
          </p>
        ) : null}
        {reunion ? (
          <p className="note" style={{ margin: 0 }}>
            Action décidée en réunion :{" "}
            {participe ? (
              <a href={`/reunions?semaine=${lundiDe(reunion.jour)}`} className="lien-discret">
                « {reunion.titre} », {dateCourte(reunion.jour)}
              </a>
            ) : (
              <>« {reunion.titre} », {dateCourte(reunion.jour)}</>
            )}
          </p>
        ) : null}
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
        {t.annuleeLe || !modifiable ? null : (
          <section aria-labelledby="t-ligne" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 id="t-ligne" className="carte__titre" style={{ margin: 0 }}>
              En une ligne
            </h2>
            <LigneMiseAJour
              cible={{ genre: "maj", tacheId: t.id, personnes: personnesLigne, moiId: u.id }}
              aujourdhui={aujourdhui()}
              libelle="Mettre à jour la tâche en une ligne"
              placeholder="« faite », « bloquée attente DTI », « vendredi 3h », « @ » pour la confier"
            />
          </section>
        )}
        {t.annuleeLe ? null : (
        <FormulaireTache
          key={`etat-${t.majLe.toISOString()}`}
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
            key={`def-${t.majLe.toISOString()}`}
            tacheId={t.id}
            titre={t.titre}
            description={t.description}
            projetId={t.projetId ?? ""}
            livrableId={t.livrableId ?? ""}
            livrables={livrables}
            parLivrable={parLivrable}
            assigneId={t.assigneId}
            projets={projets}
            personnes={personnes}
            base={base}
            parProjet={parProjet}
            externesPartout={externesPartout}
            horsProjet={horsProjet}
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
