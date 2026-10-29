import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { cadrageValide, lignesCadrage } from "@/lib/cadrage";
import { dateCourte, dateLongue, dateLocale } from "@/lib/dates";
import { kitDuProjet, projetPourKit } from "@/lib/donnees/kit";
import { tailleDuKit } from "@/lib/kit";
import { peutGererProjet } from "@/lib/projets";
import { criticite, gravite, LIBELLE_GRAVITE } from "@/lib/risques";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ecarterLeKit, utiliserLeKit } from "./actions";

export const metadata: Metadata = { title: "Kit de démarrage" };

const PROBABILITE = ["", "faible", "moyenne", "forte"];
const IMPACT = ["", "faible", "moyen", "fort"];

/**
 * Kit de démarrage d'un projet validé : ce que la fiche du projet permet de proposer (phases, livrables, risques,
 * bénéfices attendus, personnes), chaque élément avec sa raison. Le chef de projet coche ce qu'il garde.
 */
export default async function PageKit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erreur?: string }> }) {
  const { id } = await params;
  const { erreur } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const p = await exigerProjetVisible(a, id);
  if (!peutGererProjet({ moiId: u.id, directeur: a.directeur, toutVoir: a.toutVoir, suivis: a.suivis }, p)) notFound();
  const ouvert = projetPourKit(p);
  const cadrage = cadrageValide(p.cadrage);
  const kit = ouvert ? await kitDuProjet(p) : null;
  const n = kit ? tailleDuKit(kit) : 0;

  const Element = ({ cle, titre, sous, raison }: { cle: string; titre: string; sous?: string; raison: string }) => (
    <li>
      <label className="kit-element">
        <input type="checkbox" name="choix" value={cle} defaultChecked />
        <span className="kit-element__texte">
          <span className="kit-element__titre">{titre}</span>
          {sous ? <span className="rangee__sous">{sous}</span> : null}
          <span className="kit-element__raison">Parce que : {raison}</span>
        </span>
      </label>
    </li>
  );

  return (
    <>
      <Bandeau
        surtitre={`Kit de démarrage · ${p.code}`}
        titre={p.titre}
        retour={
          <a href={`/projets/${p.id}`} className="retour">
            <Icone nom="chevron-gauche" taille={18} /> {p.titre}
          </a>
        }
      >
        <p className="discret" style={{ margin: "8px 0 0", fontSize: 14, lineHeight: "21px", maxWidth: 680 }}>
          D&apos;après la fiche du projet, l&apos;application propose de quoi démarrer. Décochez ce qui ne convient pas : le reste est ajouté au projet, confié au chef de projet, qui le réattribue.
        </p>
      </Bandeau>
      <div className="page">
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : null}
        {!ouvert ? (
          <p className="note">Le kit de démarrage sert aux projets acceptés et en cours (pas une demande, ni un projet finalisé ou archivé).</p>
        ) : null}
        {p.kitLe && ouvert ? (
          <p className="note" role="status">
            Kit déjà utilisé ou écarté le {dateLongue(dateLocale(p.kitLe))}. Ce qui suit n&apos;est pas encore dans le projet.
          </p>
        ) : null}

        <section className="carte" aria-labelledby="kit-fiche" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 id="kit-fiche" className="carte__titre" style={{ margin: 0 }}>
            Fiche du projet
          </h2>
          {cadrage ? (
            <dl className="kit-fiche">
              {lignesCadrage(cadrage).map((l) => (
                <div key={l.rubrique} style={{ display: "contents" }}>
                  <dt className="discret" style={{ fontSize: 13 }}>{l.rubrique}</dt>
                  <dd style={{ margin: 0, fontSize: 14 }}>{l.valeur}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="note ton-veille" style={{ margin: 0 }}>
              La fiche ne dit pas encore le type de solution, les informations disponibles ni les spécialisations de la DPO impliquées : le kit se limite à ce qui vaut pour tout projet.
            </p>
          )}
          <a href={`/projets/${p.id}/modifier#mp-cadrage`} className="lien-discret" style={{ alignSelf: "flex-start" }}>
            {cadrage ? "Changer ces cases" : "Remplir ces cases"} (Modifier le projet) →
          </a>
        </section>

        {kit && n === 0 ? <p className="note">Rien à proposer de plus : le projet a déjà ce que le kit contient.</p> : null}

        {kit && n > 0 ? (
          <form action={utiliserLeKit.bind(null, p.id)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {kit.phases.length ? (
              <section className="carte carte--liste" aria-labelledby="kit-phases">
                <h2 id="kit-phases" className="carte__titre">
                  Phases · {kit.phases.length}
                </h2>
                <ul className="kit-liste">
                  <Element
                    cle="phases"
                    titre={kit.phases.map((x) => x.nom).join(" → ")}
                    sous={kit.phases[0].debut ? `Réparties du ${dateCourte(kit.phases[0].debut)} au ${dateCourte(kit.phases[kit.phases.length - 1].fin!)}` : "Sans dates : le projet n'a pas de date d'entrée ou de fin prévue"}
                    raison="le projet n'a pas encore de phases : les phases types de la DPO"
                  />
                </ul>
              </section>
            ) : null}
            {kit.livrables.length ? (
              <section className="carte carte--liste" aria-labelledby="kit-livrables">
                <h2 id="kit-livrables" className="carte__titre">
                  Livrables · {kit.livrables.length}
                </h2>
                <ul className="kit-liste">
                  {kit.livrables.map((x) => (
                    <Element key={x.cle} cle={x.cle} titre={x.libelle} sous={[x.phase, x.prevuLe ? `prévu le ${dateCourte(x.prevuLe)}` : null, `validé quand : ${x.critere}`].filter(Boolean).join(" · ")} raison={x.raison} />
                  ))}
                </ul>
              </section>
            ) : null}
            {kit.risques.length ? (
              <section className="carte carte--liste" aria-labelledby="kit-risques">
                <h2 id="kit-risques" className="carte__titre">
                  Risques · {kit.risques.length}
                </h2>
                <ul className="kit-liste">
                  {kit.risques.map((x) => (
                    <Element
                      key={x.cle}
                      cle={x.cle}
                      titre={x.titre}
                      sous={`${LIBELLE_GRAVITE[gravite(x.probabilite, x.impact)]} · ${criticite(x.probabilite, x.impact)} · probabilité ${PROBABILITE[x.probabilite]}, impact ${IMPACT[x.impact]} · réponse : ${x.reponse}`}
                      raison={x.raison}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
            {kit.benefices.length ? (
              <section className="carte carte--liste" aria-labelledby="kit-benefices">
                <h2 id="kit-benefices" className="carte__titre">
                  Bénéfices attendus · {kit.benefices.length}
                </h2>
                <p className="note" style={{ margin: "4px 0 6px" }}>
                  Avec l&apos;indicateur qui les mesure ; la valeur de départ et la cible restent à écrire.
                </p>
                <ul className="kit-liste">
                  {kit.benefices.map((x) => (
                    <Element key={x.cle} cle={x.cle} titre={x.libelle} sous={`indicateur : ${x.indicateur}`} raison={x.raison} />
                  ))}
                </ul>
              </section>
            ) : null}
            {kit.personnes.length ? (
              <section className="carte carte--liste" aria-labelledby="kit-equipe">
                <h2 id="kit-equipe" className="carte__titre">
                  Équipe du projet · {kit.personnes.length}
                </h2>
                <ul className="kit-liste">
                  {kit.personnes.map((x) => (
                    <Element key={x.cle} cle={x.cle} titre={x.nom} sous={`rôle : ${x.role}`} raison={x.raison} />
                  ))}
                </ul>
              </section>
            ) : null}
            <div className="kit-pied">
              <button type="submit" className="bouton-ambre">
                <Icone nom="ajouter" taille={18} /> Ajouter au projet
              </button>
              {!p.kitLe ? (
                <button type="submit" formAction={ecarterLeKit.bind(null, p.id)} formNoValidate className="bouton-contour">
                  Ne pas utiliser le kit
                </button>
              ) : null}
              <span className="aide">Les livrables et les risques sont confiés au chef de projet ; il les réattribue.</span>
            </div>
          </form>
        ) : null}
      </div>
    </>
  );
}
