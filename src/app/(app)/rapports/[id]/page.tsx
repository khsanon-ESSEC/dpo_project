import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { acces, idsProjetsVisibles, suitPersonne } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ajouterJours, dateCourte, dateLocale, heure } from "@/lib/dates";
import { lireRapport, rapportsVoisins } from "@/lib/donnees/rapport";
import { piecesDuRapport } from "@/lib/donnees/pieces";
import { chargerOrganisation } from "@/lib/organisation";
import { semaineTexte } from "@/components/ResumeRapport";
import { initiales, nomComplet } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { LienPersonne } from "@/components/Liens";
import { ChampRapport, type ContexteRapport } from "@/components/ChampRapport";

export const metadata: Metadata = { title: "Rapport de la semaine" };

export default async function PageRapportRecu({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const lu = await lireRapport(a, id);
  if (!lu) notFound();
  const { rapport, formulaire, lignes, reponses, complet, auteur, version, caches, lecteur } = lu;
  const moi = auteur.id === u.id;
  // Mon brouillon de la semaine se modifie dans l'onglet « Cette semaine ».
  if (moi && rapport.statut === "brouillon") redirect("/rapport");
  const voisins = complet ? await rapportsVoisins(a, rapport) : { precedent: null, suivant: null };
  const org = await chargerOrganisation();
  const retour = moi
    ? { href: "/rapports", texte: "Mes rapports" }
    : complet && suitPersonne(a, auteur.id)
      ? { href: `/equipe/rapports?personne=${auteur.id}`, texte: `Rapports de ${auteur.prenom}` }
      : { href: "/alertes", texte: "Alertes" };
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
    projetsVisibles: await idsProjetsVisibles(a),
    // Pièces des seuls champs que ce lecteur voit (un chef de projet n'en voit aucune).
    pieces: lu.complet ? (await piecesDuRapport(rapport.id)).filter((x) => formulaire.some((c) => c.id === x.champId && c.type === "piece_jointe")) : [],
  };

  return (
    <>
      <Bandeau
        surtitre={`Semaine du ${dateCourte(rapport.semaine)} au ${dateCourte(ajouterJours(rapport.semaine, 4))}`}
        titre={<LienPersonne id={auteur.id}>{nomComplet(auteur)}</LienPersonne>}
        retour={
          <a href={retour.href} className="retour">
            <Icone nom="chevron-gauche" taille={18} /> {retour.texte}
          </a>
        }
      >
        <p className="discret" style={{ margin: "12px 0 0", fontSize: 13 }}>
          {auteur.poste}
          {rapport.envoyeLe ? ` · envoyé le ${dateCourte(dateLocale(rapport.envoyeLe))} à ${heure(rapport.envoyeLe)}` : " · brouillon"}
          {version ? ` · modèle ${version.nom}, version ${version.numero}` : ""}
          {complet ? "" : " · seulement les lignes et les feux de vos projets"}
        </p>
      </Bandeau>
      <div className="page" style={{ maxWidth: 860, display: "flex", flexDirection: "column", gap: 20 }}>
        {complet && (voisins.precedent || voisins.suivant) ? (
          <nav className="ligne-actions" aria-label="Autres semaines">
            {voisins.precedent ? (
              <a href={`/rapports/${voisins.precedent.id}`} className="bouton-contour">
                <Icone nom="chevron-gauche" taille={16} /> Semaine {semaineTexte(voisins.precedent.semaine)}
              </a>
            ) : (
              <span />
            )}
            {voisins.suivant && !(moi && voisins.suivant.statut === "brouillon") ? (
              <a href={voisins.suivant.statut === "brouillon" ? "/rapport" : `/rapports/${voisins.suivant.id}`} className="bouton-contour">
                Semaine {semaineTexte(voisins.suivant.semaine)} <Icone nom="chevron-droite" taille={16} />
              </a>
            ) : moi && voisins.suivant ? (
              <a href="/rapport" className="bouton-contour">
                Cette semaine <Icone nom="chevron-droite" taille={16} />
              </a>
            ) : null}
          </nav>
        ) : null}
        {formulaire.map((c) => (
          <ChampRapport key={c.id} c={c} x={x} />
        ))}
        {caches.length && lecteur !== "chef_projet" ? (
          <p className="note" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
            <Icone nom="cadenas" taille={14} />
            {caches.length === 1 ? `Un champ est réservé au supérieur de ${auteur.prenom} : « ${caches[0]} ».` : `${caches.length} champs sont réservés au supérieur de ${auteur.prenom} : ${caches.map((c) => `« ${c} »`).join(", ")}.`}
          </p>
        ) : null}
      </div>
    </>
  );
}
