import type { Metadata } from "next";
import { tousLesProjetsActifs } from "@/lib/donnees/projets";
import { notFound, redirect } from "next/navigation";
import { acces, idsProjetsVisibles, suitPersonne } from "@/lib/acces";
import { exigerInterne } from "@/lib/auth/session";
import { ajouterJours, dateCourte, dateLocale, heure } from "@/lib/dates";
import { envoyeALHeure, lireRapport, messagesDuRapport, noterLecture, peutEchanger, rapportPrecedentLisible, rapportsDeLEquipe, rapportsVoisins, repriseDuRapport } from "@/lib/donnees/rapport";
import { reprendreMonRapport } from "@/app/(app)/rapport/actions";
import { piecesDuRapport } from "@/lib/donnees/pieces";
import { changementsDepuis, resumerRapport } from "@/lib/lecture-rapport";
import { chargerOrganisation } from "@/lib/organisation";
import { semaineTexte } from "@/components/ResumeRapport";
import { initiales, nomComplet } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { LienPersonne } from "@/components/Liens";
import type { ContexteRapport } from "@/components/ChampRapport";
import { LectureRapport } from "@/components/LectureRapport";
import { BoutonImprimer, Repondre } from "./Repondre";

export const metadata: Metadata = { title: "Rapport de la semaine" };

export default async function PageRapportRecu({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reprise?: string }> }) {
  const { id } = await params;
  const { reprise: erreurReprise } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerInterne();
  const a = await acces(u);
  const lu = await lireRapport(a, id);
  if (!lu) notFound();
  const { rapport, formulaire, lignes, reponses, complet, auteur, version, caches, lecteur } = lu;
  const moi = auteur.id === u.id;
  // Mon brouillon de la semaine se modifie dans l'onglet « Cette semaine ».
  if (moi && rapport.statut === "brouillon") redirect("/rapport");
  // « Lu par » : la première ouverture par son destinataire.
  await noterLecture(a, rapport);
  const [voisins, org, visibles, actifs, precedent, aLHeure, messages, reprise] = await Promise.all([
    complet ? rapportsVoisins(a, rapport) : { precedent: null, suivant: null },
    chargerOrganisation(),
    idsProjetsVisibles(a),
    tousLesProjetsActifs(),
    complet ? rapportPrecedentLisible(a, rapport) : null,
    envoyeALHeure(rapport),
    peutEchanger(lecteur) ? messagesDuRapport(rapport.id) : [],
    moi ? repriseDuRapport(rapport, u.id) : null,
  ]);
  // Le rapport suivant de la même semaine, pour qui lit ceux de son équipe à la suite.
  const equipe = complet && !moi ? (await rapportsDeLEquipe(a, rapport.semaine)).filter((p) => p.rapport) : [];
  const rang = equipe.findIndex((p) => p.id === auteur.id);
  const suivantEquipe = rang >= 0 && rang < equipe.length - 1 ? equipe[rang + 1] : null;
  const retour = moi
    ? { href: "/rapports", texte: "Mes rapports" }
    : complet && suitPersonne(a, auteur.id)
      ? { href: `/equipe/rapports?personne=${auteur.id}`, texte: `Rapports de ${auteur.prenom}` }
      : { href: "/alertes", texte: "Alertes" };
  const resume = resumerRapport(formulaire, lignes, reponses, rapport.semaine);
  const resumePrecedent = precedent ? resumerRapport(precedent.formulaire, precedent.lignes, precedent.reponses, precedent.rapport.semaine) : null;
  const x: ContexteRapport = {
    mode: "lecture",
    rapportId: rapport.id,
    lignes,
    reponses,
    relues: new Set(),
    projets: [],
    personnes: new Map([...org.personnes.values()].map((p) => [p.id, { initiales: initiales(p), nom: nomComplet(p) }])),
    superieur: null,
    equipe: null,
    niveauTitre: formulaire.some((c) => c.type === "intertitre") ? 3 : 2,
    projetsVisibles: visibles,
    codesProjets: new Map(actifs.filter((p) => visibles === "tous" || visibles.has(p.id)).map((p) => [p.code, { id: p.id, titre: p.titre }])),
    // Pièces des seuls champs que ce lecteur voit (un chef de projet n'en voit aucune).
    pieces: complet ? (await piecesDuRapport(rapport.id)).filter((x) => formulaire.some((c) => c.id === x.champId && c.type === "piece_jointe")) : [],
    semaine: rapport.semaine,
    precedent: resumePrecedent ? { sante: new Map([...resumePrecedent.sante].map(([k, v]) => [k, v.valeur])) } : null,
  };
  const lecteurDuRapport = rapport.luPar ? org.personnes.get(rapport.luPar) : null;
  const destinataire = rapport.destinataireId ? org.personnes.get(rapport.destinataireId) : null;

  return (
    <>
      <Bandeau
        surtitre={`Semaine du ${dateCourte(rapport.semaine)} au ${dateCourte(ajouterJours(rapport.semaine, 4))}`}
        titre={
          <span className="titre-avatar">
            <span className="mono titre-avatar__mono" aria-hidden="true">
              {initiales(auteur)}
            </span>
            <LienPersonne id={auteur.id}>{nomComplet(auteur)}</LienPersonne>
          </span>
        }
        retour={
          <a href={retour.href} className="retour">
            <Icone nom="chevron-gauche" taille={18} /> {retour.texte}
          </a>
        }
      >
        {auteur.poste ? <p className="discret tete-lecture__poste">{auteur.poste}</p> : null}
        <p className="discret tete-lecture">
          {complet && aLHeure !== null ? <span className={`pastille-envoi${aLHeure ? "" : " pastille-envoi--retard"}`}>{aLHeure ? "✓ Envoyé à l'heure" : "Envoyé en retard"}</span> : null}
          <span>{rapport.envoyeLe ? `Envoyé le ${dateCourte(dateLocale(rapport.envoyeLe))} à ${heure(rapport.envoyeLe)}` : "Brouillon"}</span>
          {complet && rapport.luLe && lecteurDuRapport && rapport.luPar !== u.id ? (
            <span>
              Lu par <strong>{nomComplet(lecteurDuRapport)}</strong>
              {moi ? ` le ${dateCourte(dateLocale(rapport.luLe))} à ${heure(rapport.luLe)}` : ""}
            </span>
          ) : moi && !rapport.luLe && destinataire ? (
            <span>Pas encore lu par {nomComplet(destinataire)}</span>
          ) : null}
          {reprise?.possible ? (
            <a href="#reprendre" className="lien-nom" style={{ textDecorationColor: "rgba(255,255,255,0.35)" }}>
              Le reprendre pour le compléter
            </a>
          ) : null}
          {version ? (
            <span>
              Modèle « {version.nom} » v{version.numero}
            </span>
          ) : null}
          {complet ? null : <span>Seulement les lignes et les feux de vos projets</span>}
        </p>
      </Bandeau>
      <div className="page page--lecture">
        {voisins.precedent || voisins.suivant || suivantEquipe ? (
          <nav className="ligne-actions nav-lecture" aria-label="Autres rapports">
            <span className="nav-lecture__groupe">
              {voisins.precedent ? (
                <a href={`/rapports/${voisins.precedent.id}`} className="bouton-contour">
                  <Icone nom="chevron-gauche" taille={16} /> Semaine {semaineTexte(voisins.precedent.semaine)}
                </a>
              ) : null}
              {voisins.suivant && !(moi && voisins.suivant.statut === "brouillon") ? (
                <a href={voisins.suivant.statut === "brouillon" ? "/rapport" : `/rapports/${voisins.suivant.id}`} className="bouton-contour">
                  Semaine {semaineTexte(voisins.suivant.semaine)} <Icone nom="chevron-droite" taille={16} />
                </a>
              ) : moi && voisins.suivant ? (
                <a href="/rapport" className="bouton-contour">
                  Cette semaine <Icone nom="chevron-droite" taille={16} />
                </a>
              ) : null}
            </span>
            {suivantEquipe?.rapport ? (
              <a href={`/rapports/${suivantEquipe.rapport.id}`} className="bouton-contour" title="Rapport suivant de la même semaine">
                {suivantEquipe.nom} <Icone nom="chevron-droite" taille={16} />
              </a>
            ) : null}
          </nav>
        ) : null}
        <LectureRapport
          formulaire={formulaire}
          x={x}
          resume={resume}
          precedent={resumePrecedent}
          changements={resumePrecedent ? changementsDepuis(resume, resumePrecedent) : []}
          lienPrecedent={precedent ? `/rapports/${precedent.rapport.id}` : null}
          complet={complet}
          cote={
            peutEchanger(lecteur) && rapport.statut === "envoye" ? (
              <>
                {reprise ? (
                  <section className="carte reprendre" id="reprendre" aria-labelledby="reprendre-t" style={{ scrollMarginTop: 80 }}>
                    <h2 id="reprendre-t" className="carte__titre">
                      Compléter mon rapport
                    </h2>
                    {erreurReprise ? (
                      <p className="erreur" role="alert" style={{ margin: 0 }}>
                        {erreurReprise.slice(0, 300)}
                      </p>
                    ) : null}
                    {reprise.possible ? (
                      <>
                        <p className="note" style={{ margin: 0 }}>
                          {destinataire ? `${destinataire.prenom} ne l'a pas encore ouvert` : "Personne ne l'a encore ouvert"} : vous pouvez le reprendre pour le compléter ou le corriger, puis le renvoyer.
                        </p>
                        <form action={reprendreMonRapport.bind(null, rapport.id)}>
                          <button type="submit" className="bouton-contour">
                            <Icone nom="modifier" taille={16} /> Reprendre mon rapport
                          </button>
                        </form>
                      </>
                    ) : (
                      <p className="note" style={{ margin: 0 }}>
                        {reprise.raison === "lu"
                          ? `${reprise.qui ?? "Votre supérieur"} l'a ouvert : il ne se modifie plus.`
                          : reprise.raison === "echange"
                            ? "Un échange a commencé dessous : il ne se modifie plus."
                            : `${reprise.qui ?? "Votre supérieur"} a déjà envoyé son rapport, qui reprend le vôtre : il ne se modifie plus.`}{" "}
                        Écrivez ci-dessous ce que vous voulez ajouter.
                      </p>
                    )}
                  </section>
                ) : null}
              <section className="carte reponses" id="reponses" aria-labelledby="reponses-t">
                <h2 id="reponses-t" className="carte__titre">
                  {messages.length ? "Échanges" : "Répondre"}
                </h2>
                {messages.length ? (
                  <ul className="liste messages-rapport">
                    {messages.map((m) => (
                      <li key={m.id} className="message-rapport">
                        <span className="mono mono--petit" aria-hidden="true">
                          {m.initiales}
                        </span>
                        <span className="message-rapport__corps">
                          <span className="message-rapport__qui">
                            <LienPersonne id={m.auteurId}>{m.nom}</LienPersonne> · {dateCourte(dateLocale(m.creeLe))} à {heure(m.creeLe)}
                          </span>
                          <span className="message-rapport__texte">{m.texte}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Repondre
                  rapportId={rapport.id}
                  aide={`Écrire à ${moi ? (destinataire?.prenom ?? "votre supérieur") : auteur.prenom} au sujet de ce rapport : votre message lui arrive dans ses alertes${messages.length ? "." : ", et vos échanges s'afficheront ici."}`}
                  exemple={moi ? "Par exemple : la DTI a répondu, je relance mardi." : "Par exemple : licence validée, la validation métier peut commencer."}
                />
              </section>
              </>
            ) : complet ? (
              <BoutonImprimer />
            ) : null
          }
          pied={
            caches.length && lecteur !== "chef_projet" ? (
              <p className="note" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                <Icone nom="cadenas" taille={14} />
                {caches.length === 1 ? `Un champ est réservé au supérieur de ${auteur.prenom} : « ${caches[0]} ».` : `${caches.length} champs sont réservés au supérieur de ${auteur.prenom} : ${caches.map((c) => `« ${c} »`).join(", ")}.`}
              </p>
            ) : null
          }
        />
      </div>
    </>
  );
}
