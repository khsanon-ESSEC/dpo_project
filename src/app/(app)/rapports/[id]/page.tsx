import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { acces, suitPersonne } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { ajouterJours, dateCourte, dateLocale, heure } from "@/lib/dates";
import { lireRapport, PARTIES, rapportsVoisins } from "@/lib/donnees/rapport";
import { semaineTexte } from "@/components/ResumeRapport";
import { nomComplet } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";

export const metadata: Metadata = { title: "Rapport du vendredi" };

export default async function PageRapportRecu({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const lu = await lireRapport(a, id);
  if (!lu) notFound();
  const { rapport, lignes, complet, auteur } = lu;
  const moi = auteur.id === u.id;
  // Mon brouillon de la semaine se modifie dans l'onglet « Cette semaine ».
  if (moi && rapport.statut === "brouillon") redirect("/rapport");
  const voisins = complet ? await rapportsVoisins(a, rapport) : { precedent: null, suivant: null };
  const retour = moi
    ? { href: "/rapports", texte: "Mes rapports" }
    : complet && suitPersonne(a, auteur.id)
      ? { href: `/equipe/rapports?personne=${auteur.id}`, texte: `Rapports de ${auteur.prenom}` }
      : { href: "/alertes", texte: "Alertes" };

  return (
    <>
      <Bandeau
        surtitre={`Semaine du ${dateCourte(rapport.semaine)} au ${dateCourte(ajouterJours(rapport.semaine, 4))}`}
        titre={nomComplet(auteur)}
        retour={
          <a href={retour.href} className="retour">
            <Icone nom="chevron-gauche" taille={18} /> {retour.texte}
          </a>
        }
      >
        <p className="discret" style={{ margin: "12px 0 0", fontSize: 13 }}>
          {auteur.poste}
          {rapport.envoyeLe ? ` · envoyé le ${dateCourte(dateLocale(rapport.envoyeLe))} à ${heure(rapport.envoyeLe)}` : " · brouillon"}
          {complet ? "" : " · seulement les lignes de vos projets"}
        </p>
      </Bandeau>
      <div className="page" style={{ maxWidth: 860 }}>
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
        {PARTIES.map((p) => {
          const siennes = lignes.filter((l) => l.partie === p.id);
          if (!complet && siennes.length === 0) return null;
          return (
            <section key={p.id} className="carte" aria-labelledby={`p-${p.id}`}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 8 }}>
                <span style={{ width: 32, fontSize: 32, lineHeight: "36px", fontWeight: 200 }} className={p.id === "bloque" && siennes.length ? "ton-veille" : undefined}>
                  {siennes.length}
                </span>
                <h2 id={`p-${p.id}`} style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
                  {p.libelle}
                </h2>
              </div>
              <ul className="liste" style={{ paddingLeft: 48 }}>
                {siennes.map((l) => (
                  <li key={l.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "6px 0", borderTop: 0, fontSize: 15, lineHeight: "22px" }}>
                    <span className="etiquette-projet" title={l.projetTitre ?? "Sans projet"}>
                      {l.projetCode ?? "—"}
                    </span>
                    <span>{l.texte}</span>
                  </li>
                ))}
                {siennes.length === 0 ? <li className="vide" style={{ borderTop: 0 }}>Rien cette semaine.</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
