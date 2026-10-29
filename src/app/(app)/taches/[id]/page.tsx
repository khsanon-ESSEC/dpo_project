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
import { enchainementDe, precedentesPossibles } from "@/lib/donnees/dependances";
import { ListeFiltrable } from "@/components/ListeFiltrable";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { tacheSupprimable, apresLeLivrable } from "@/lib/projets";
import { ajouterPrecedente, annuler, arreterLaRepetition, noterTempsPasse, repeterLaTache, retablir, retirerPrecedente, retirerTempsPasse, supprimer } from "../actions";
import { regleDe } from "@/lib/donnees/recurrence";
import { DELAI_CREATION, JOURS_MOIS, JOURS_SEMAINE, rythmeTexte, type Frequence } from "@/lib/recurrence";
import { LIBELLE_PRIORITE, priorite as lirePriorite } from "@/lib/suivi";
import { JOURS_RETRO, tempsDeLaTache } from "@/lib/donnees/temps";
import { dureeTexte } from "@/lib/projets";
import { ajouterJours } from "@/lib/dates";

export const metadata: Metadata = { title: "Tâche" };

const LIBELLE: Record<string, string> = { a_faire: "À faire", en_cours: "En cours", bloquee: "Bloquée", faite: "Faite" };

export default async function PageTache({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ statut?: string; retour?: string; erreur?: string; temps?: string; repetition?: string }> }) {
  const { id } = await params;
  const { statut: statutDemande, retour: retourDemande, erreur, temps: tempsFait, repetition: repetitionFaite } = await searchParams;
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
  // Le projet de la tâche, si la personne le voit encore : sinon ni ses livrables ni ses tâches ne sont proposés
  // (revue de sécurité du 29 octobre 2026 ; la tâche elle-même reste lisible par qui l'a confiée).
  const projetVu = !t.projetId || visibles === "tous" || visibles.has(t.projetId);
  // Livrables : celui de la tâche (s'il y en a un), et ceux de chaque projet pour la changer de livrable.
  const choixLivrables = await choixDeLivrables(projets.map((x) => x.id));
  if (t.projetId && !projetVu) choixLivrables[t.projetId] = (choixLivrables[t.projetId] ?? []).filter((x) => x.id === t.livrableId);
  const livrables = Object.fromEntries(Object.entries(choixLivrables).map(([k, l]) => [k, l.filter((x) => x.etat !== "atteint" || x.id === t.livrableId).map((x) => ({ id: x.id, libelle: x.libelle, prevuLe: x.prevuLe }))]));
  const leLivrable = t.livrableId && t.projetId ? (choixLivrables[t.projetId] ?? []).find((x) => x.id === t.livrableId) : undefined;
  const responsableLivrable = leLivrable?.responsableId ? org.personnes.get(leLivrable.responsableId) : undefined;
  const apresLivrable = !!leLivrable && apresLeLivrable(t, leLivrable.prevuLe);
  // Enchaînement : les tâches que celle-ci attend, et celles qui l'attendent (même projet).
  const ench = await enchainementDe(t);
  const possibles = !t.annuleeLe && t.projetId && projetVu && peutModifierTache(a, t) ? await precedentesPossibles(t) : [];
  // Temps passé : ce qui a été noté, comparé à l'estimation.
  const temps = await tempsDeLaTache(t.id);
  // Répétition : la règle de la tâche (si elle se répète), son rythme ; proposé par défaut : le jour de l'échéance.
  const regle = await regleDe(t);
  const prio = lirePriorite(t.priorite);
  const jourEcheance = t.echeance ? new Date(`${t.echeance}T12:00:00Z`).getUTCDay() : 0;
  const rythmeParDefaut = jourEcheance >= 1 && jourEcheance <= 5 ? `semaine:${jourEcheance}` : "semaine:1";
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
    if (ev.type === "creation") return ev.note ? `Créée · ${ev.note.toLowerCase()}` : "Créée";
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
    if (ev.type === "priorite") return `Priorité : ${LIBELLE_PRIORITE[lirePriorite(ev.apres)].toLowerCase()}`;
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
              {retour.startsWith("/projets/") && projet ? projet.titre : retour === "/charge" ? "Charge de travail" : retour === "/taches" || retour === "/a-faire" ? "Mes tâches" : retour.startsWith("/equipe") ? "Équipe" : "Ma semaine"}
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
          {prio !== "normale" ? (
            <div className={`chiffre${prio === "haute" ? " chiffre--veille" : ""}`}>
              <dt>priorité</dt>
              <dd style={{ fontSize: 22, lineHeight: "28px", fontWeight: 300 }}>{LIBELLE_PRIORITE[prio]}</dd>
            </div>
          ) : null}
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
      <div className="page">
        {leLivrable ? (
          <p className={`note-livrable${apresLivrable ? " note-livrable--apres" : ""}`}>
            <Icone nom="drapeau" taille={16} />
            <span>
              Mène au livrable{" "}
              <a href={`/projets/${t.projetId}/livrables/${leLivrable.id}`} className="lien-discret">
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
        <div className="volets">
        <div className="volets__partie">
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
            priorite={t.priorite}
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
        <div className="volets__partie">
        {t.projetId && !t.annuleeLe && (ench.precedentes.length || ench.suivantes.length || peutModifierTache(a, t)) ? (
          <section className="carte carte--liste" id="enchainement" aria-labelledby="t-enchainement" style={{ scrollMarginTop: 80 }}>
            <h2 id="t-enchainement" className="carte__titre">
              Enchaînement
            </h2>
            {ench.attend.length && t.statut !== "faite" ? (
              <p className="note-livrable note-livrable--apres" role="status">
                <Icone nom="horloge" taille={16} />
                <span>
                  Attend {ench.attend.map((x, i) => (
                    <span key={x.id}>
                      {i ? (i === ench.attend.length - 1 ? " et " : ", ") : ""}« {x.titre} »
                    </span>
                  ))}
                  , pas encore faite{ench.attend.length > 1 ? "s" : ""}. La personne sera prévenue quand {ench.attend.length > 1 ? "elles le seront" : "elle le sera"}.
                </span>
              </p>
            ) : null}
            {ench.conflits.length && t.statut !== "faite" ? (
              <p className="livrable__alerte" style={{ marginLeft: 0 }}>
                Prévue pour commencer avant la fin prévue de {ench.conflits.map((x) => `« ${x.titre} » (${dateCourte(x.echeance!)})`).join(", ")} : décalez son début ou son échéance.
              </p>
            ) : null}
            <h3 className="sante-barre__titre" style={{ margin: "12px 0 4px" }}>
              Après
            </h3>
            {ench.precedentes.length ? (
              <ul className="liste">
                {ench.precedentes.map((x) => (
                  <li key={x.id} className="rangee rangee--etiree">
                    <span className="mono mono--petit" aria-hidden="true">
                      {x.initiales}
                    </span>
                    <span className="rangee__texte">
                      <a href={`/taches/${x.id}`} className="rangee__titre rangee__lien">
                        {x.titre}
                      </a>
                      <span className="rangee__sous">{x.nom}</span>
                    </span>
                    <span className={`rangee__meta ${x.statut === "faite" ? "ton-ok" : x.statut === "bloquee" ? "ton-veille" : ""}`} style={{ fontSize: 12 }}>
                      {x.statut === "faite" ? "Faite" : x.statut === "bloquee" ? "Bloquée" : x.echeance ? `fin prévue ${dateCourte(x.echeance)}` : "sans échéance"}
                    </span>
                    {peutModifierTache(a, t) ? (
                      <form action={retirerPrecedente.bind(null, t.id, x.id)}>
                        <button type="submit" className="bouton-icone" style={{ width: 32, height: 32 }} aria-label={`Ne plus attendre « ${x.titre} »`} title="Retirer">
                          <Icone nom="fermer" taille={16} />
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note" style={{ margin: "0 0 4px" }}>
                Cette tâche n&apos;attend aucune autre tâche.
              </p>
            )}
            {possibles.length ? (
              <form action={ajouterPrecedente.bind(null, t.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                <div className="champ" style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <label htmlFor="dep-precedente">Attend la fin de</label>
                  <ListeFiltrable
                    id="dep-precedente"
                    name="precedenteId"
                    required
                    placeholder="Tapez le titre d'une tâche du projet"
                    aucun="Aucune tâche ne correspond à"
                    options={possibles.map((x) => ({ value: x.id, label: x.titre, detail: `${x.nom}${x.statut === "faite" ? " · faite" : x.echeance ? ` · ${dateCourte(x.echeance)}` : ""}` }))}
                  />
                </div>
                <button type="submit" className="bouton-contour">
                  <Icone nom="ajouter" taille={16} /> Ajouter
                </button>
              </form>
            ) : null}
            {ench.suivantes.length ? (
              <>
                <h3 className="sante-barre__titre" style={{ margin: "14px 0 4px" }}>
                  Ensuite, elle débloque
                </h3>
                <ul className="liste">
                  {ench.suivantes.map((x) => (
                    <li key={x.id} className="rangee rangee--etiree">
                      <span className="mono mono--petit" aria-hidden="true">
                        {x.initiales}
                      </span>
                      <span className="rangee__texte">
                        <a href={`/taches/${x.id}`} className="rangee__titre rangee__lien">
                          {x.titre}
                        </a>
                        <span className="rangee__sous">{x.nom}</span>
                      </span>
                      <span className="rangee__meta" style={{ fontSize: 12 }}>
                        {x.statut === "faite" ? "Faite" : x.debut ? `début prévu ${dateCourte(x.debut)}` : x.echeance ? `échéance ${dateCourte(x.echeance)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}
        {!t.annuleeLe && (temps.entrees.length || modifiable) ? (
          <section className="carte carte--liste" id="temps" aria-labelledby="t-temps" style={{ scrollMarginTop: 80 }}>
            <h2 id="t-temps" className="carte__titre">
              Temps passé{temps.minutes ? ` · ${dureeTexte(temps.minutes)}` : ""}
              {t.estimationHeures ? <span className="carte__titre-sous"> sur {t.estimationHeures} h estimées</span> : null}
            </h2>
            {tempsFait === "note" || tempsFait === "retire" ? (
              <p className="succes" role="status" style={{ margin: "4px 0 8px" }}>
                {tempsFait === "note" ? "Temps noté." : "Temps retiré."}
              </p>
            ) : null}
            {t.estimationHeures && temps.minutes ? (
              <div className="temps-jauge" aria-hidden="true">
                <span className={`temps-jauge__plein${temps.minutes > t.estimationHeures * 60 ? " temps-jauge__plein--depasse" : ""}`} style={{ width: `${Math.min(100, Math.round((temps.minutes / (t.estimationHeures * 60)) * 100))}%` }} />
              </div>
            ) : null}
            {t.estimationHeures && temps.minutes > t.estimationHeures * 60 ? (
              <p className="livrable__alerte" style={{ marginLeft: 0 }}>
                Plus que l&apos;estimation : {dureeTexte(temps.minutes - t.estimationHeures * 60)} de plus. Revoir l&apos;estimation aide à mieux prévoir la charge.
              </p>
            ) : null}
            {temps.entrees.length ? (
              <ul className="liste">
                {temps.entrees.slice(0, 12).map((x) => (
                  <li key={x.id} className="rangee rangee--etiree">
                    <span className="rangee__texte">
                      <span className="rangee__titre">
                        {dureeTexte(x.minutes)} · {dateCourte(x.jour)}
                      </span>
                      <span className="rangee__sous">
                        {x.note ? `${x.note} · ` : ""}
                        {x.notePar && x.notePar !== x.personne ? `noté par ${x.notePar} pour ${x.personne}` : `noté par ${x.notePar ?? "?"}`}
                      </span>
                    </span>
                    {x.noteParId === u.id || modifiable ? (
                      <form action={retirerTempsPasse.bind(null, t.id, x.id)}>
                        <button type="submit" className="bouton-icone" style={{ width: 32, height: 32 }} aria-label={`Retirer ${dureeTexte(x.minutes)} du ${dateCourte(x.jour)}`} title="Retirer">
                          <Icone nom="fermer" taille={16} />
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note" style={{ margin: "0 0 4px" }}>
                Pas encore de temps noté. Noter le temps passé, même approximatif, aide à mieux estimer les prochaines tâches.
              </p>
            )}
            {modifiable ? (
              <form action={noterTempsPasse.bind(null, t.id)} className="temps-form">
                <div className="champ">
                  <label htmlFor="temps-duree">Durée</label>
                  <input id="temps-duree" name="duree" required inputMode="text" maxLength={12} placeholder="1h30" aria-describedby="temps-aide" style={{ width: 110 }} />
                </div>
                <div className="champ">
                  <label htmlFor="temps-jour">Jour</label>
                  <input id="temps-jour" name="jour" type="date" defaultValue={aujourdhui()} max={aujourdhui()} min={ajouterJours(aujourdhui(), -JOURS_RETRO)} />
                </div>
                <div className="champ" style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <label htmlFor="temps-note">Note (facultatif)</label>
                  <input id="temps-note" name="note" maxLength={300} placeholder="Ex. : relecture du cahier des charges" />
                </div>
                <button type="submit" className="bouton-contour">
                  <Icone nom="ajouter" taille={16} /> Noter
                </button>
                <span className="aide" id="temps-aide" style={{ flexBasis: "100%" }}>
                  « 1h30 », « 45 min », « 2 » (heures). Jusqu&apos;à {JOURS_RETRO} jours en arrière.
                </span>
              </form>
            ) : null}
          </section>
        ) : null}
        {!t.annuleeLe && (regle || modifiable) ? (
          <section className="carte" id="repetition" aria-labelledby="t-repetition" style={{ scrollMarginTop: 80, display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 id="t-repetition" className="carte__titre" style={{ margin: 0 }}>
              Répétition{regle && !regle.arreteeLe ? ` · ${rythmeTexte(regle.frequence, regle.jour)}` : ""}
            </h2>
            {repetitionFaite === "active" ? (
              <p className="succes" role="status" style={{ margin: 0 }}>
                La tâche se répète : la prochaine sera créée {DELAI_CREATION[(regle?.frequence ?? "semaine") as Frequence]} jours avant son échéance.
              </p>
            ) : repetitionFaite === "arretee" ? (
              <p className="succes" role="status" style={{ margin: 0 }}>
                Répétition arrêtée : les tâches déjà créées restent.
              </p>
            ) : null}
            {regle && !regle.arreteeLe ? (
              <>
                <p className="note" style={{ margin: 0 }}>
                  Prochaine échéance le {dateCourte(regle.prochaineLe)} ; la tâche sera créée vers le {dateCourte(ajouterJours(regle.prochaineLe, -DELAI_CREATION[regle.frequence as Frequence]))}, pour {regle.assigneId === u.id ? "vous" : nomComplet(org.personnes.get(regle.assigneId) ?? { prenom: "", nom: "?" })}. Une échéance qui tombe un samedi ou un dimanche passe au vendredi.
                </p>
                {modifiable || regle.creeParId === u.id ? (
                  <form action={arreterLaRepetition.bind(null, t.id)}>
                    <button type="submit" className="bouton-mini">
                      Arrêter la répétition
                    </button>
                  </form>
                ) : null}
              </>
            ) : (
              <>
                {regle?.arreteeLe ? (
                  <p className="note" style={{ margin: 0 }}>
                    Cette tâche se répétait ({rythmeTexte(regle.frequence, regle.jour)}) ; la répétition est arrêtée.
                  </p>
                ) : (
                  <p className="note" style={{ margin: 0 }}>
                    Une tâche qui revient (point hebdomadaire, rapport mensuel) : elle sera recréée à chaque fois, quelques jours avant son échéance.
                  </p>
                )}
                {modifiable ? (
                  <form action={repeterLaTache.bind(null, t.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div className="champ" style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <label htmlFor="rep-rythme">Répéter</label>
                      <select id="rep-rythme" name="rythme" defaultValue={rythmeParDefaut}>
                        <optgroup label="Chaque semaine">
                          {JOURS_SEMAINE.map((j, i) => (
                            <option key={j} value={`semaine:${i + 1}`}>
                              Chaque {j}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Chaque mois">
                          {JOURS_MOIS.map((j) => (
                            <option key={j} value={`mois:${j}`}>
                              {j === 31 ? "Le dernier jour du mois" : `Le ${j === 1 ? "1er" : j} du mois`}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <button type="submit" className="bouton-contour">
                      Répéter
                    </button>
                  </form>
                ) : null}
              </>
            )}
          </section>
        ) : null}
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
                  {regle && !regle.arreteeLe ? " Sa répétition s'arrête aussi." : ""}
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
                    {regle && !regle.arreteeLe ? " Sa répétition s'arrête aussi (elle reprend si la tâche est rétablie)." : ""}
                  </span>
                </div>
                <button type="submit" className="bouton-contour">
                  Annuler la tâche
                </button>
              </form>
            )}
          </section>
        )}
        </div>
        </div>
      </div>
    </>
  );
}
