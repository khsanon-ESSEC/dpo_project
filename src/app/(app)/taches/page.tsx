import type { Metadata } from "next";
import { exigerUtilisateur } from "@/lib/auth/session";
import { EtiquettePriorite } from "@/components/EtiquettePriorite";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import { aujourdhui, dateCourte, echeanceRelative, jourComplet } from "@/lib/dates";
import { chargeDesPersonnes } from "@/lib/donnees/charge";
import { mesLivrables } from "@/lib/donnees/livrables";
import { compter, confieesHorsDivision, echeancesDe, tachesDe, trier } from "@/lib/donnees/semaine";
import { nomComplet } from "@/lib/regles";
import { Anneau, Bandeau, LienChiffre } from "@/components/Bandeau";
import { CalendrierMois, grilleDuMois, moisDemande, type ElementCalendrier } from "@/components/CalendrierMois";
import { CaseTache } from "@/components/CaseTache";
import { Icone } from "@/components/Icone";
import { CodeProjet, LienPersonne, LienProjet } from "@/components/Liens";
import { etatEnMots, PastilleStatut } from "@/components/PastilleStatut";
import { Tableau, type CarteTableau } from "../projets/[id]/tableau/Tableau";
import { MaCharge } from "./MaCharge";

export const metadata: Metadata = { title: "Mes tâches" };

/**
 * Mes tâches : les miennes (ouvertes, et celles faites cette semaine), les livrables dont je suis responsable, et les
 * tâches que j'ai confiées hors division. Entrée du menu à part entière (avant : l'onglet « À faire » de Semaine ;
 * l'ancienne adresse /a-faire mène ici). Trois vues au choix (29 octobre 2026) : Liste, Tableau (par état) et
 * Calendrier (par échéance), avec ma charge des semaines à venir au-dessus.
 */
const VUES = [
  { id: "liste", libelle: "Liste", icone: "liste" },
  { id: "tableau", libelle: "Tableau", icone: "colonnes" },
  { id: "calendrier", libelle: "Calendrier", icone: "calendrier" },
] as const;
type Vue = (typeof VUES)[number]["id"];
const adresseVue = (v: Vue, mois?: string | null) => (v === "liste" ? "/taches" : `/taches?vue=${v}${mois ? `&mois=${mois}` : ""}`);

const VOIR = { retard: "En retard", bloquees: "Bloquées", encours: "En cours", afaire: "À faire", faites: "Faites" } as const;

export default async function PageMesTaches({ searchParams }: { searchParams: Promise<{ voir?: string; vue?: string; mois?: string }> }) {
  const { voir: v, vue: vueDemandee, mois: m } = await searchParams;
  const vue: Vue = VUES.some((x) => x.id === vueDemandee) ? (vueDemandee as Vue) : "liste";
  const voir = vue === "liste" && v && v in VOIR ? (v as keyof typeof VOIR) : null;
  const u = await exigerUtilisateur();
  const jour = aujourdhui();
  const mois = moisDemande(m, jour);
  const grille = grilleDuMois(mois);
  const visibles = await idsProjetsVisibles(await acces(u));
  const [taches, confiees, livrablesTous, charge, echeances] = await Promise.all([
    tachesDe([u.id]),
    confieesHorsDivision(u.id),
    mesLivrables(u.id, aujourdhui()),
    // La charge n'est mesurée que pour la division (pas pour une personne hors division).
    u.externe ? null : chargeDesPersonnes([u.id]),
    vue === "calendrier" ? echeancesDe(u.id, grille.debutGrille, grille.finGrille) : Promise.resolve([]),
  ]);
  // Mes livrables : seulement sur les projets que je vois encore (revue de sécurité du 29 octobre 2026).
  const livrables = livrablesTous.filter((l) => visibles === "tous" || visibles.has(l.projetId));
  const c = compter(taches, jour);
  const voit = (id: string | null) => !!id && (visibles === "tous" || visibles.has(id));
  type T = { statut: string; echeance: string | null };
  const enRetard = (t: T) => t.statut !== "faite" && t.statut !== "bloquee" && t.echeance !== null && t.echeance < jour;
  const garde = (t: T) =>
    !voir ||
    (voir === "faites"
      ? t.statut === "faite"
      : voir === "bloquees"
        ? t.statut === "bloquee"
        : voir === "retard"
          ? enRetard(t)
          : voir === "encours"
            ? t.statut === "en_cours"
            : t.statut === "a_faire");
  const liste = trier(taches, jour).filter(garde);
  // Les filtres d'état suivent la pastille (à faire, en cours, bloquée, faite) ; « En retard » les traverse.
  const nVoir = { retard: c.retard, bloquees: c.bloquees, encours: taches.filter((t) => t.statut === "en_cours").length, afaire: taches.filter((t) => t.statut === "a_faire").length, faites: c.faites };
  const retour = encodeURIComponent(adresseVue(vue, vue === "calendrier" && m ? mois : null));
  const ligneCharge = charge?.lignes[0];

  // ---------- Les trois vues ----------
  const vueListe = (
    <section className="carte carte--liste colonne-large" id="mes-taches" aria-labelledby="t-taches" style={{ gap: 0, scrollMarginTop: 80 }}>
      <h2 id="t-taches" className="carte__titre">
        Tâches · {c.total - c.faites} ouverte{c.total - c.faites > 1 ? "s" : ""}
      </h2>
      <nav className="filtres" aria-label="Filtrer mes tâches" style={{ margin: "8px 0 4px" }}>
        <a className="filtre" href="/taches" aria-current={!voir ? "true" : undefined}>
          Toutes · {c.total}
        </a>
        {(Object.keys(VOIR) as (keyof typeof VOIR)[]).map((k) => (
          <a key={k} className="filtre" href={`/taches?voir=${k}#mes-taches`} aria-current={voir === k ? "true" : undefined}>
            {VOIR[k]} · {nVoir[k]}
          </a>
        ))}
      </nav>
      {liste.length === 0 ? (
        <p className="vide">{voir ? "Aucune tâche dans ce filtre." : "Aucune tâche pour le moment."}</p>
      ) : (
        <ul className="liste">
          {liste.map((t) => {
            const e = echeanceRelative(t.echeance, jour);
            const meta =
              t.statut === "faite" ? { texte: "Faite", classe: "ton-discret" } : t.statut === "bloquee" ? { texte: "Bloquée", classe: "ton-veille" } : { texte: e.texte, classe: e.retard ? "ton-retard" : "ton-discret" };
            return (
              <CaseTache key={t.id} id={t.id} titre={t.titre} faite={t.statut === "faite"} statut={t.statut} retard={enRetard(t)}>
                <div className="rangee rangee--etiree" style={{ flex: 1, minWidth: 0 }}>
                  {t.projetCode ? <CodeProjet id={t.projetId} code={t.projetCode} titre={t.projetTitre} visible={voit(t.projetId)} mono /> : null}
                  <span className="rangee__texte">
                    <a href={`/taches/${t.id}?retour=%2Ftaches`} className="rangee__titre rangee__lien">
                      {t.titre}
                    </a>
                    <span className="rangee__sous">
                      <EtiquettePriorite priorite={t.priorite} faite={t.statut === "faite"} recurrente={!!t.recurrenceId} debut />
                      {t.projetId ? (
                        <LienProjet id={t.projetId} visible={voit(t.projetId)}>
                          {t.projetTitre}
                        </LienProjet>
                      ) : (
                        "Hors projet"
                      )}
                      {t.statut === "en_cours" ? " · En cours" : ""}
                      {meta.texte ? (
                        <>
                          {" "}
                          · <span className={meta.classe}>{meta.texte}</span>
                        </>
                      ) : null}
                      {t.estimationHeures && t.statut !== "faite" ? ` · ${t.estimationHeures} h estimée${t.estimationHeures > 1 ? "s" : ""}` : ""}
                    </span>
                  </span>
                </div>
              </CaseTache>
            );
          })}
        </ul>
      )}
      <p className="note" style={{ margin: "12px 0 0" }}>
        Les tâches faites restent ici jusqu&apos;à la fin de la semaine. Ce qui s&apos;est passé chaque jour se lit dans{" "}
        <a href="/semaine" className="lien-discret">
          Ma semaine
        </a>
        .
      </p>
    </section>
  );

  const cartes: CarteTableau[] = taches.map((t) => {
    const e = echeanceRelative(t.echeance, jour);
    return {
      id: t.id,
      titre: t.titre,
      statut: t.statut,
      personne: nomComplet(u),
      initiales: "",
      mono: t.projetCode ?? null,
      monoTitre: t.projetTitre ?? "Hors projet",
      echeanceTexte: t.statut === "faite" ? "Faite" : e.texte || "Sans échéance",
      retard: enRetard(t),
      estimation: t.estimationHeures ?? null,
      blocage: t.blocage ?? null,
      modifiable: true,
      lien: `/taches/${t.id}?retour=${retour}`,
    };
  });
  const vueTableau = (
    <section aria-label="Mes tâches par état" id="mes-taches" style={{ scrollMarginTop: 80 }}>
      <Tableau cartes={cartes} retour={adresseVue("tableau")} />
      <p className="note">Glissez une carte vers une autre colonne, ou changez son état dans sa liste. Pour une tâche bloquée, la fiche s&apos;ouvre : dites ce qui bloque. La colonne « Faite » garde les tâches de cette semaine.</p>
    </section>
  );

  // Calendrier : mes échéances du mois (faites ou non) et celles de mes livrables.
  const parJour = new Map<string, ElementCalendrier[]>();
  const ajouter = (d: string | null, e: ElementCalendrier) => {
    if (d && d >= grille.debutGrille && d <= grille.finGrille) parJour.set(d, [...(parJour.get(d) ?? []), e]);
  };
  for (const t of echeances) {
    const retard = enRetard(t);
    ajouter(t.echeance, {
      id: t.id,
      texte: `${t.projetCode ? `${t.projetCode} · ` : ""}${t.titre}`,
      titre: `${t.titre} — ${t.projetTitre ?? "Hors projet"} — ${etatEnMots(t.statut, retard).toLowerCase()}${t.estimationHeures ? ` — ${t.estimationHeures} h` : ""}`,
      classe: t.statut === "faite" ? "puce--faite" : t.statut === "bloquee" ? "puce--bloquee" : retard ? "puce--retard" : "",
      lien: `/taches/${t.id}?retour=${retour}`,
      statut: t.statut,
      retard,
    });
  }
  for (const l of livrables) {
    ajouter(l.prevuLe, {
      id: `livrable-${l.id}`,
      texte: `Livrable · ${l.libelle}`,
      titre: `Livrable « ${l.libelle} » (${l.projetTitre}) — ${l.affiche === "pret" ? "prêt à valider" : l.enRetard ? "en retard" : `${l.compte.faites}/${l.compte.total} tâches faites`}`,
      classe: `puce--jalon${l.enRetard ? " puce--retard" : ""}`,
      lien: `/projets/${l.projetId}/livrables/${l.id}`,
    });
  }
  const sansEcheance = trier(
    taches.filter((t) => !t.echeance && t.statut !== "faite"),
    jour,
  );
  const vueCalendrier = (
    <section aria-label="Mes échéances du mois" id="mes-taches" style={{ scrollMarginTop: 80 }}>
      <CalendrierMois
        mois={mois}
        jour={jour}
        lienMois={(x) => adresseVue("calendrier", x)}
        parJour={parJour}
        vide="Aucune de vos tâches n'arrive à échéance ce mois-ci."
        legende={
          <>
            <span>
              <PastilleStatut statut="a_faire" petite /> À faire
            </span>
            <span>
              <PastilleStatut statut="en_cours" petite /> En cours
            </span>
            <span>
              <PastilleStatut statut="bloquee" petite /> Bloquée
            </span>
            <span>
              <PastilleStatut statut="a_faire" retard petite /> En retard
            </span>
            <span>
              <PastilleStatut statut="faite" petite /> Faite
            </span>
            <span>
              <i style={{ width: 3, height: 14, border: 0, background: "#f4b22d" }} /> Livrable
            </span>
          </>
        }
      />
      {sansEcheance.length ? (
        <section className="carte carte--liste" aria-labelledby="t-sans-echeance" style={{ marginTop: 16 }}>
          <h2 id="t-sans-echeance" className="carte__titre">
            Sans échéance · {sansEcheance.length}
          </h2>
          <ul className="liste">
            {sansEcheance.map((t) => (
              <li key={t.id} className="rangee rangee--etiree">
                {t.projetCode ? <CodeProjet id={t.projetId} code={t.projetCode} titre={t.projetTitre} visible={voit(t.projetId)} mono /> : null}
                <span className="rangee__texte">
                  <span className="titre-tache">
                    <PastilleStatut statut={t.statut} />
                    <a href={`/taches/${t.id}?retour=${retour}`} className="rangee__titre rangee__lien">
                      {t.titre}
                    </a>
                  </span>
                  <span className="rangee__sous">{t.projetTitre ?? "Hors projet"}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );

  // ---------- À côté : mes livrables, et ce que j'ai confié hors division ----------
  const carteLivrables = livrables.length ? (
    <section className="carte carte--liste" aria-labelledby="t-livrables">
      <h2 id="t-livrables" className="carte__titre">
        Livrables dont je suis responsable · {livrables.length}
      </h2>
      <p className="note" style={{ margin: "4px 0 8px" }}>
        Vous en êtes responsable : déterminez les tâches qui y mènent, confiez-en à l&apos;équipe du projet, puis déclarez-le prêt à valider.
      </p>
      <ul className="liste">
        {livrables.map((l) => (
          <li key={l.id} className="rangee" style={{ minHeight: 64, alignItems: "flex-start", paddingTop: 10, paddingBottom: 10 }}>
            <CodeProjet id={l.projetId} code={l.code} titre={l.projetTitre} visible={voit(l.projetId)} />
            <span className="rangee__texte">
              <a href={`/projets/${l.projetId}/livrables/${l.id}`} className="rangee__titre lien-nom">
                {l.libelle}
              </a>
              <span className="rangee__sous">
                {l.prevuLe ? (
                  <span className={l.enRetard ? "ton-retard" : undefined}>
                    {l.enRetard ? "en retard, prévu le " : "prévu le "}
                    {dateCourte(l.prevuLe)}
                  </span>
                ) : (
                  "sans date"
                )}
                {" · "}
                {l.affiche === "pret" ? <span className="ton-veille">prêt à valider</span> : `${l.compte.faites}/${l.compte.total} tâche${l.compte.total > 1 ? "s" : ""} faite${l.compte.faites > 1 ? "s" : ""}`}
                {l.compte.apres ? <span className="ton-veille"> · {l.compte.apres} après sa date</span> : null}
                {l.remarque ? <span className="ton-retard"> · à reprendre</span> : null}
              </span>
              {l.affiche !== "pret" ? (
                <a href={`/taches/nouvelle?projet=${l.projetId}&livrable=${l.id}&retour=%2Ftaches`} className="lien-discret" style={{ fontSize: 12, marginTop: 4, alignSelf: "flex-start" }}>
                  + Ajouter une tâche
                </a>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  ) : null;

  const carteConfiees = (
    <section className="carte carte--liste" aria-labelledby="t-confiees">
      <h2 id="t-confiees" className="carte__titre">
        Confiées hors division · {confiees.length}
      </h2>
      <p className="note" style={{ margin: "4px 0 8px" }}>
        Les tâches que vous avez confiées à un autre département ou à un consultant : vous les suivez et les mettez à jour pour eux.
      </p>
      {confiees.length === 0 ? <p className="vide">Aucune pour le moment.</p> : null}
      <ul className="liste">
        {confiees.map((t) => {
          const e = echeanceRelative(t.echeance, jour);
          return (
            <li key={t.id} className="rangee" style={{ minHeight: 56, alignItems: "flex-start", paddingTop: 10, paddingBottom: 10 }}>
              {t.projetCode ? <CodeProjet id={t.projetId} code={t.projetCode} titre={t.projetTitre} visible={voit(t.projetId)} /> : null}
              <span className="rangee__texte">
                <span className="titre-tache">
                  <PastilleStatut statut={t.statut} retard={enRetard(t)} />
                  <a href={`/taches/${t.id}?retour=%2Ftaches`} className="rangee__titre lien-nom">
                    {t.titre}
                  </a>
                </span>
                <span className="rangee__sous">
                  <LienPersonne id={t.assigneId}>{nomComplet(t)}</LienPersonne>
                  {t.organisation ? ` · ${t.organisation}` : ""}
                </span>
              </span>
              <span className={`rangee__meta ${t.statut === "bloquee" ? "ton-veille" : e.retard ? "ton-retard" : ""}`} style={{ fontSize: 12 }}>
                {t.statut === "bloquee" ? "Bloquée" : e.texte || "Sans échéance"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <>
      <Bandeau surtitre={jourComplet(jour)} titre="Mes tâches">
        <div className="chiffres">
          <a href="/taches?voir=faites#mes-taches" className="chiffre-lien" aria-label={`${c.faites} tâches terminées sur ${c.total} : voir les tâches faites`}>
            <Anneau fait={c.faites} total={c.total} legende="faites" label={`${c.faites} tâches terminées sur ${c.total}`} />
          </a>
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "12px 48px" }}>
            <div className="chiffre chiffre--retard">
              <dt>
                <LienChiffre href="/taches?voir=retard#mes-taches" detail="voir les tâches en retard">
                  en retard
                </LienChiffre>
              </dt>
              <dd>{c.retard}</dd>
            </div>
            <div className="chiffre">
              <dt>
                <LienChiffre href="/taches?voir=bloquees#mes-taches" detail="voir les tâches bloquées">
                  {c.bloquees > 1 ? "bloquées" : "bloquée"}
                </LienChiffre>
              </dt>
              <dd>{c.bloquees}</dd>
            </div>
            <div className="chiffre">
              <dt>
                <LienChiffre href="/taches?voir=encours#mes-taches" detail="voir les tâches en cours">
                  en cours
                </LienChiffre>
              </dt>
              <dd>{nVoir.encours}</dd>
            </div>
            <div className="chiffre">
              <dt>
                <LienChiffre href="/taches?voir=afaire#mes-taches" detail="voir les tâches à faire">
                  à faire
                </LienChiffre>
              </dt>
              <dd>{nVoir.afaire}</dd>
            </div>
          </dl>
        </div>
      </Bandeau>
      <div className="page">
        <div className="ligne-actions">
          <nav className="vues" aria-label="Vues de mes tâches">
            {VUES.map((x) => (
              <a key={x.id} href={adresseVue(x.id)} aria-current={x.id === vue ? "page" : undefined}>
                <Icone nom={x.icone} taille={16} />
                {x.libelle}
              </a>
            ))}
          </nav>
          <a href={`/taches/nouvelle?retour=${retour}`} className="bouton-ambre">
            <Icone nom="ajouter" taille={18} /> Nouvelle tâche
          </a>
        </div>
        {ligneCharge && charge ? <MaCharge ligne={ligneCharge} semaines={charge.semaines} /> : null}
        {vue === "liste" ? (
          <div className="colonnes">
            {vueListe}
            <div className="colonne-etroite">
              {carteLivrables}
              {carteConfiees}
            </div>
          </div>
        ) : (
          <>
            {vue === "tableau" ? vueTableau : vueCalendrier}
            <div className="colonnes">
              {carteLivrables && vue === "tableau" ? <div style={{ flex: "1 1 420px", minWidth: 0 }}>{carteLivrables}</div> : null}
              <div style={{ flex: "1 1 420px", minWidth: 0 }}>{carteConfiees}</div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
