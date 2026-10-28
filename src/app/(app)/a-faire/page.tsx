import type { Metadata } from "next";
import { exigerUtilisateur } from "@/lib/auth/session";
import { acces, idsProjetsVisibles } from "@/lib/acces";
import { aujourdhui, echeanceRelative, jourComplet } from "@/lib/dates";
import { compter, confieesHorsDivision, tachesDe, trier } from "@/lib/donnees/semaine";
import { nomComplet } from "@/lib/regles";
import { Anneau, Bandeau } from "@/components/Bandeau";
import { CaseTache } from "@/components/CaseTache";
import { Icone } from "@/components/Icone";
import { CodeProjet, LienPersonne, LienProjet } from "@/components/Liens";
import { ONGLETS_SEMAINE, SousOnglets } from "@/components/SousOnglets";

export const metadata: Metadata = { title: "À faire" };

/** Mes tâches de la semaine (ouvertes, et celles faites cette semaine), et celles que j'ai confiées hors division. */
export default async function PageAFaire() {
  const u = await exigerUtilisateur();
  const jour = aujourdhui();
  const [taches, confiees] = await Promise.all([tachesDe([u.id]), confieesHorsDivision(u.id)]);
  const c = compter(taches, jour);
  const visibles = await idsProjetsVisibles(await acces(u));
  const voit = (id: string | null) => !!id && (visibles === "tous" || visibles.has(id));
  const liste = trier(taches, jour);

  return (
    <>
      <Bandeau surtitre={jourComplet(jour)} titre="À faire">
        <div className="chiffres">
          <Anneau fait={c.faites} total={c.total} legende="faites" label={`${c.faites} tâches terminées sur ${c.total}`} />
          <dl style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: "12px 48px" }}>
            <div className="chiffre chiffre--retard">
              <dt>en retard</dt>
              <dd>{c.retard}</dd>
            </div>
            <div className="chiffre">
              <dt>{c.bloquees > 1 ? "bloquées" : "bloquée"}</dt>
              <dd>{c.bloquees}</dd>
            </div>
            <div className="chiffre">
              <dt>à faire</dt>
              <dd>{c.aFaire}</dd>
            </div>
          </dl>
        </div>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_SEMAINE} courant="/a-faire" label="Ma semaine" />
        <div className="colonnes">
          <section className="carte carte--liste colonne-large" aria-labelledby="t-afaire" style={{ gap: 0 }}>
            <div className="carte__entete">
              <h2 id="t-afaire" className="carte__titre">
                Mes tâches · {c.total - c.faites} ouverte{c.total - c.faites > 1 ? "s" : ""}
              </h2>
              <a href="/taches/nouvelle?retour=%2Fa-faire" className="lien-discret" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36 }}>
                <Icone nom="ajouter" taille={16} /> Nouvelle tâche
              </a>
            </div>
            {liste.length === 0 ? (
              <p className="vide">Aucune tâche pour le moment.</p>
            ) : (
              <ul className="liste">
                {liste.map((t) => {
                  const e = echeanceRelative(t.echeance, jour);
                  const meta =
                    t.statut === "faite" ? { texte: "Faite", classe: "ton-discret" } : t.statut === "bloquee" ? { texte: "Bloquée", classe: "ton-veille" } : { texte: e.texte, classe: e.retard ? "ton-retard" : "ton-discret" };
                  return (
                    <CaseTache key={t.id} id={t.id} titre={t.titre} faite={t.statut === "faite"}>
                      <div className="rangee rangee--etiree" style={{ flex: 1, minWidth: 0 }}>
                        {t.projetCode ? <CodeProjet id={t.projetId} code={t.projetCode} titre={t.projetTitre} visible={voit(t.projetId)} mono /> : null}
                        <span className="rangee__texte">
                          <a href={`/taches/${t.id}?retour=%2Fa-faire`} className="rangee__titre rangee__lien">
                            {t.titre}
                          </a>
                          <span className="rangee__sous">
                            {t.projetId ? (
                              <LienProjet id={t.projetId} visible={voit(t.projetId)}>
                                {t.projetTitre}
                              </LienProjet>
                            ) : (
                              "Hors projet"
                            )}{" "}
                            · <span className={meta.classe}>{meta.texte}</span>
                          </span>
                        </span>
                      </div>
                    </CaseTache>
                  );
                })}
              </ul>
            )}
            <p className="note" style={{ margin: "12px 0 0" }}>
              Les tâches faites restent ici jusqu&apos;à la fin de la semaine. Ce qui s&apos;est passé chaque jour se lit dans « Ma semaine ».
            </p>
          </section>
          <div className="colonne-etroite">
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
                        <a href={`/taches/${t.id}?retour=%2Fa-faire`} className="rangee__titre lien-nom">
                          {t.titre}
                        </a>
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
          </div>
        </div>
      </div>
    </>
  );
}
