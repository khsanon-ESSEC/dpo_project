import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { acces, exigerProjetVisible } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { dateCourteAnnee, dateLongue } from "@/lib/dates";
import { ficheAExporter, type FicheProjet } from "@/lib/donnees/fiche-projet";
import { montantTexte } from "@/lib/suivi";
import { BoutonImprimer } from "@/components/BoutonImprimer";
import { Icone } from "@/components/Icone";
import { TableauRaci } from "@/components/Raci";

export const metadata: Metadata = { title: "Fiche de projet" };

/**
 * Fiche de projet (29 octobre 2026) : la synthèse du projet, prête à imprimer ou à enregistrer en PDF (le navigateur
 * le fait), ou à télécharger en Word. Mêmes droits que la fiche du projet ; le budget, pour qui gère le projet.
 */
export default async function PageFicheProjet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  await exigerProjetVisible(a, id);
  const f = await ficheAExporter(a, id);
  if (!f) notFound();
  const sections = sectionsDeLaFiche(f);
  return (
    <div className="page fiche-page">
      <div className="fiche-outils">
        <a href={`/projets/${id}`} className="retour">
          <Icone nom="chevron-gauche" taille={18} /> {f.projet.titre}
        </a>
        <div className="fiche-outils__boutons">
          <BoutonImprimer libelle="Imprimer ou enregistrer en PDF" />
          <a href={`/api/projets/${id}/fiche`} className="bouton-ambre" download>
            <Icone nom="document" taille={16} /> Télécharger en Word
          </a>
        </div>
      </div>
      <article className="fiche-doc" aria-labelledby="fiche-titre">
        <header className="fiche-doc__entete">
          <div>
            <p className="fiche-doc__division">Division Productivité et Organisation</p>
            <p className="fiche-doc__genre">Fiche de projet</p>
            <h1 id="fiche-titre" className="fiche-doc__titre">
              <span className="etiquette-projet">{f.projet.code}</span> {f.projet.titre}
            </h1>
            <p className="fiche-doc__sous">{[f.projet.programme, f.projet.division !== "DPO" ? `Division : ${f.projet.division}` : null].filter(Boolean).join(" · ") || "Sans programme"}</p>
          </div>
          <img src="/logo-couleur.png" alt="Unibank" className="fiche-doc__logo" width={150} height={59} />
        </header>
        <dl className="fiche-doc__faits">
          <Fait t="Statut" v={`${f.projet.statut}${f.projet.archive ? " (archivé)" : ""}`} />
          <Fait t="Priorité" v={f.projet.priorite} />
          <Fait t="Stratégique" v={f.projet.strategique ? "Oui (rapport au conseil)" : "Non"} />
          {f.projet.sante ? <Fait t="Santé" v={f.projet.sante} /> : null}
          <Fait t="Sponsor métier" v={f.personnes.sponsor ?? "—"} />
          <Fait t="Chef de projet" v={f.personnes.chef ?? "—"} />
          {f.personnes.referent ? <Fait t="Référent DPO" v={f.personnes.referent} /> : null}
          <Fait t="Date d'entrée" v={dateLongue(f.dates.entree)} />
          <Fait t="Fin prévue" v={`${dateLongue(f.dates.finPrevue)}${f.dates.finInitiale && f.dates.finInitiale !== f.dates.finPrevue ? ` (initialement le ${dateCourteAnnee(f.dates.finInitiale)})` : ""}`} />
          <Fait t="Lancement prévu" v={dateLongue(f.dates.lancement)} />
          {f.projet.cadrage.map((l) => (
            <Fait key={l.rubrique} t={l.rubrique} v={l.valeur} />
          ))}
        </dl>
        {f.projet.santeMotif ? <p className="fiche-doc__note">Santé : {f.projet.santeMotif}.</p> : null}
        {sections.map((s, i) => (
          <section key={s.id} className="fiche-doc__section" aria-labelledby={`fs-${s.id}`}>
            <h2 id={`fs-${s.id}`}>
              {i + 1}. {s.titre}
            </h2>
            {s.contenu}
          </section>
        ))}
        <footer className="fiche-doc__pied">
          Fiche éditée le {dateLongue(f.editeLe)} par {f.editePar}, depuis l&apos;application Pilotage des projets. Elle reprend l&apos;état du projet à cette date.
        </footer>
      </article>
    </div>
  );
}

function Fait({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt>{t}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** Les sections de la fiche, dans l'ordre d'une note de cadrage ; une section vide n'est pas montrée (sauf les objectifs). */
function sectionsDeLaFiche(f: FicheProjet): { id: string; titre: string; contenu: React.ReactNode }[] {
  const s: { id: string; titre: string; contenu: React.ReactNode }[] = [];
  if (f.projet.description || f.projet.justification)
    s.push({
      id: "description",
      titre: "Description",
      contenu: (
        <>
          {f.projet.description ? <p className="fiche-doc__texte">{f.projet.description}</p> : null}
          {f.projet.justification ? (
            <p className="fiche-doc__texte">
              <strong>Justification de la demande : </strong>
              {f.projet.justification}
            </p>
          ) : null}
        </>
      ),
    });
  s.push({
    id: "objectifs",
    titre: "Objectifs et bénéfices attendus",
    contenu: (
      <>
        <h3>Objectifs</h3>
        {f.objectifs.length ? (
          <ul className="fiche-doc__liste">
            {f.objectifs.map((o) => (
              <li key={o.libelle}>
                {o.libelle}
                {o.evaluation ? <span className="fiche-doc__eval"> — {o.evaluation}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="fiche-doc__vide">Pas encore écrits.</p>
        )}
        <h3>Bénéfices attendus</h3>
        {f.benefices.length ? (
          <div className="defile-x">
            <table className="fiche-doc__table">
              <thead>
                <tr>
                  <th scope="col">Bénéfice</th>
                  <th scope="col">Indicateur</th>
                  <th scope="col">Départ</th>
                  <th scope="col">Cible</th>
                  <th scope="col">Constaté</th>
                </tr>
              </thead>
              <tbody>
                {f.benefices.map((b) => (
                  <tr key={b.libelle}>
                    <th scope="row">{b.libelle}</th>
                    <td>{b.indicateur || "—"}</td>
                    <td className="fiche-doc__valeur">{b.depart || "—"}</td>
                    <td className="fiche-doc__valeur">{b.cible || "—"}</td>
                    <td className="fiche-doc__valeur">{b.constate ? `${b.constate}${b.constateLe ? ` (${dateCourteAnnee(b.constateLe)})` : ""}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="fiche-doc__vide">Pas encore écrits.</p>
        )}
      </>
    ),
  });
  s.push({
    id: "organisation",
    titre: "Organisation et répartition des tâches",
    contenu: (
      <>
        <h3>Équipe</h3>
        <ul className="fiche-doc__liste fiche-doc__liste--colonnes">
          {f.personnes.sponsor ? (
            <li>
              <strong>{f.personnes.sponsor}</strong> — sponsor métier
            </li>
          ) : null}
          {f.personnes.chef ? (
            <li>
              <strong>{f.personnes.chef}</strong> — chef de projet
            </li>
          ) : null}
          {f.personnes.referent ? (
            <li>
              <strong>{f.personnes.referent}</strong> — référent DPO
            </li>
          ) : null}
          {f.personnes.membres.map((m) => (
            <li key={m.nom}>
              <strong>{m.nom}</strong>
              {m.role ? ` — ${m.role}` : ""}
              {m.externe && !m.role.includes(m.externe) ? ` (${m.externe})` : ""}
            </li>
          ))}
        </ul>
        <h3>RACI{f.raciPropre ? " (adapté pour ce projet)" : ""}</h3>
        <TableauRaci raci={f.raci} noms={f.nomsRaci} />
      </>
    ),
  });
  s.push({
    id: "calendrier",
    titre: "Calendrier",
    contenu: (
      <>
        {f.dates.nbReports ? (
          <>
            <p className="fiche-doc__texte">
              La fin prévue a été déplacée {f.dates.nbReports} fois{f.dates.finInitiale ? ` depuis le ${dateLongue(f.dates.finInitiale)}` : ""}.
            </p>
            <ul className="fiche-doc__liste">
              {f.dates.reports.map((r, i) => (
                <li key={i}>
                  {dateCourteAnnee(r.avant)} → {dateCourteAnnee(r.apres)}
                  {r.motif ? ` : ${r.motif}` : ""}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {f.phases.length ? (
          <div className="defile-x">
            <table className="fiche-doc__table">
              <thead>
                <tr>
                  <th scope="col">Phase</th>
                  <th scope="col">Début</th>
                  <th scope="col">Fin prévue</th>
                  <th scope="col">État</th>
                </tr>
              </thead>
              <tbody>
                {f.phases.map((ph) => (
                  <tr key={ph.nom}>
                    <th scope="row">{ph.nom}</th>
                    <td>{dateCourteAnnee(ph.debut)}</td>
                    <td>{dateCourteAnnee(ph.fin)}</td>
                    <td>{ph.etat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="fiche-doc__vide">Pas de phases définies.</p>
        )}
      </>
    ),
  });
  s.push({
    id: "livrables",
    titre: `Livrables · ${f.avancement.livrablesValides} validé${f.avancement.livrablesValides > 1 ? "s" : ""} sur ${f.avancement.livrables}`,
    contenu: f.livrables.length ? (
      <div className="defile-x">
        <table className="fiche-doc__table">
          <thead>
            <tr>
              <th scope="col">Livrable</th>
              <th scope="col">Prévu le</th>
              <th scope="col">Responsable</th>
              <th scope="col">État</th>
              <th scope="col">Tâches faites</th>
            </tr>
          </thead>
          <tbody>
            {f.livrables.map((l) => (
              <tr key={l.libelle}>
                <th scope="row">
                  {l.libelle}
                  {l.phase ? <span className="fiche-doc__discret"> · {l.phase}</span> : null}
                </th>
                <td>{dateCourteAnnee(l.prevuLe)}</td>
                <td>{l.responsable ?? "—"}</td>
                <td>
                  {l.etat}
                  {l.enRetard ? " (en retard)" : ""}
                </td>
                <td>{l.taches || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="fiche-doc__vide">Aucun livrable.</p>
    ),
  });
  s.push({
    id: "avancement",
    titre: "Avancement",
    contenu: (
      <p className="fiche-doc__texte">
        {f.avancement.total
          ? `${f.avancement.faites} tâche${f.avancement.faites > 1 ? "s" : ""} faite${f.avancement.faites > 1 ? "s" : ""} sur ${f.avancement.total} ; ${f.avancement.ouvertes} ouverte${f.avancement.ouvertes > 1 ? "s" : ""}, dont ${f.avancement.enRetard} en retard et ${f.avancement.bloquees} bloquée${f.avancement.bloquees > 1 ? "s" : ""}.`
          : "Aucune tâche pour l'instant."}
      </p>
    ),
  });
  s.push({
    id: "risques",
    titre: `Risques ouverts · ${f.risques.length}`,
    contenu: f.risques.length ? (
      <div className="defile-x">
        <table className="fiche-doc__table">
          <thead>
            <tr>
              <th scope="col">Risque</th>
              <th scope="col">Gravité</th>
              <th scope="col">Suivi par</th>
              <th scope="col">Réponse prévue</th>
            </tr>
          </thead>
          <tbody>
            {f.risques.map((r) => (
              <tr key={r.titre}>
                <th scope="row">{r.titre}</th>
                <td>{r.gravite}</td>
                <td>{r.responsable ?? "—"}</td>
                <td>{r.reponse || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {f.risquesMaitrises ? <p className="fiche-doc__discret">Et {f.risquesMaitrises} risque{f.risquesMaitrises > 1 ? "s" : ""} maîtrisé{f.risquesMaitrises > 1 ? "s" : ""}, sous surveillance.</p> : null}
      </div>
    ) : (
      <p className="fiche-doc__vide">Aucun risque ouvert au registre.</p>
    ),
  });
  if (f.decisions.length)
    s.push({
      id: "decisions",
      titre: `Décisions${f.nbDecisions > f.decisions.length ? ` · les ${f.decisions.length} dernières sur ${f.nbDecisions}` : ""}`,
      contenu: (
        <ul className="fiche-doc__liste">
          {f.decisions.map((d, i) => (
            <li key={i}>
              <strong>{dateCourteAnnee(d.le)}</strong>
              {d.instance ? ` · ${d.instance}` : ""} : {d.texte}
            </li>
          ))}
        </ul>
      ),
    });
  if (f.budget)
    s.push({
      id: "budget",
      titre: "Budget",
      contenu: (
        <>
          <p className="fiche-doc__texte">
            Prévu : {f.budget.prevu !== null ? montantTexte(f.budget.prevu, f.budget.devise) : "—"} · engagé : {f.budget.engage !== null ? montantTexte(f.budget.engage, f.budget.devise) : "—"}
            {f.budget.part !== null ? ` (${f.budget.part} %)` : ""}
            {f.budget.majLe ? ` · mis à jour le ${dateCourteAnnee(f.budget.majLe)}` : ""}
          </p>
          {f.budget.note ? <p className="fiche-doc__texte fiche-doc__discret">{f.budget.note}</p> : null}
        </>
      ),
    });
  if (f.cloture)
    s.push({
      id: "cloture",
      titre: "Clôture",
      contenu: (
        <>
          <p className="fiche-doc__texte">
            Clôturé le {dateLongue(f.cloture.le)}
            {f.cloture.par ? ` par ${f.cloture.par}` : ""}. Objectifs : {f.cloture.objectifs.toLowerCase() || "—"}.
          </p>
          {f.cloture.bilan ? (
            <p className="fiche-doc__texte">
              <strong>Bilan : </strong>
              {f.cloture.bilan}
            </p>
          ) : null}
          {f.cloture.lecons ? (
            <p className="fiche-doc__texte">
              <strong>Leçons apprises : </strong>
              {f.cloture.lecons}
            </p>
          ) : null}
        </>
      ),
    });
  if (f.documents?.length)
    s.push({
      id: "documents",
      titre: `Documents · ${f.documents.length}`,
      contenu: (
        <ul className="fiche-doc__liste fiche-doc__liste--colonnes">
          {f.documents.map((d, i) => (
            <li key={i}>
              {d.nom} <span className="fiche-doc__discret">· {d.categorie.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      ),
    });
  return s;
}
