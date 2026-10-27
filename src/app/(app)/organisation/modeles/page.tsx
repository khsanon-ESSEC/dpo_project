import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { dateCourte, dateLocale } from "@/lib/dates";
import { listeModeles } from "@/lib/donnees/modeles";
import { peutAdministrer } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ONGLETS_ORGANISATION, SousOnglets } from "@/components/SousOnglets";
import { creer } from "./actions";

export const metadata: Metadata = { title: "Modèles de rapport" };

/** Les modèles de rapport : ce que chacun remplit chaque semaine. Seuls les administrateurs y ont accès. */
export default async function PageModeles({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  const u = await exigerUtilisateur();
  if (!peutAdministrer(u)) notFound();
  const modeles = await listeModeles();
  const enService = modeles.filter((m) => m.actif && m.courante).length;
  const brouillons = modeles.filter((m) => m.brouillon).length;

  return (
    <>
      <Bandeau surtitre="Organisation" titre="Modèles de rapport">
        <p className="discret" style={{ margin: "8px 0 0", maxWidth: 640, fontSize: 14, lineHeight: "21px" }}>
          Ce que chacun remplit, ce que l&apos;application prépare pour lui, et ce que le rapport de son chef en reprend. Seuls les administrateurs modifient les modèles.
        </p>
        <dl className="chiffres">
          <div className="chiffre">
            <dt>en service</dt>
            <dd>{enService}</dd>
          </div>
          <div className={`chiffre ${brouillons ? "chiffre--veille" : ""}`}>
            <dt>en préparation</dt>
            <dd>{brouillons}</dd>
          </div>
        </dl>
      </Bandeau>
      <div className="page">
        <SousOnglets onglets={ONGLETS_ORGANISATION} courant="/organisation/modeles" label="Organisation" />
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : null}
        <p className="note">Chacun remplit un seul modèle : celui qui lui est affecté nommément, sinon le modèle des chefs d&apos;équipe s&apos;il reçoit des rapports, sinon celui de son équipe, sinon le modèle par défaut.</p>
        <div className="grille-modeles">
          {modeles.map((m, i) => (
            <a key={m.id} href={`/organisation/modeles/${m.id}`} className="carte tuile-modele apparition" style={{ animationDelay: `${60 + i * 50}ms`, opacity: m.actif ? 1 : 0.6 }}>
              <span className="tuile-modele__nom">{m.nom}</span>
              <span className="rangee__sous">
                {[
                  m.parDefaut ? "Toute personne sans autre modèle" : null,
                  m.pourChefs ? "Les chefs d'équipe" : null,
                  m.equipes.length ? `Équipe${m.equipes.length > 1 ? "s" : ""} ${m.equipes.join(", ")}` : null,
                  m.personnes.length ? m.personnes.join(", ") : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Affecté à personne"}
                {" · "}
                {m.nbPersonnes} personne{m.nbPersonnes > 1 ? "s" : ""}
              </span>
              <span className="tuile-modele__marques">
                {m.parDefaut ? <span className="marque-modele marque-modele--relief">Par défaut</span> : null}
                {m.genre === "chef" ? <span className="marque-modele marque-modele--relief">Son travail + reçus</span> : null}
                {m.courante ? (
                  <span className="marque-modele">
                    V{m.courante.numero} en service{m.courante.publieeLe ? ` depuis le ${dateCourte(dateLocale(m.courante.publieeLe))}` : ""}
                  </span>
                ) : (
                  <span className="marque-modele">Jamais publié</span>
                )}
                {m.brouillon ? <span className="marque-modele marque-modele--ambre">V{m.brouillon} en préparation</span> : null}
                {!m.actif ? <span className="marque-modele">Désactivé</span> : null}
              </span>
            </a>
          ))}
        </div>

        <section className="carte" aria-labelledby="m-nouveau" style={{ maxWidth: 720 }}>
          <h2 id="m-nouveau" className="carte__titre">
            Nouveau modèle
          </h2>
          <form action={creer} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="champ">
              <label htmlFor="m-nom">Nom</label>
              <input id="m-nom" name="nom" required maxLength={80} />
            </div>
            <fieldset style={{ margin: 0, padding: 0, border: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <legend style={{ padding: 0, marginBottom: 8, fontSize: 13, fontWeight: 500 }}>Pour qui</legend>
              <label className="choix-radio">
                <input type="radio" name="genre" value="individuel" defaultChecked />
                <span className="rangee__texte">
                  <span className="rangee__titre">Une équipe ou des personnes</span>
                  <span className="rangee__sous">Le rapport de chacun, préparé à partir de ses tâches.</span>
                </span>
              </label>
              <label className="choix-radio">
                <input type="radio" name="genre" value="chef" />
                <span className="rangee__texte">
                  <span className="rangee__titre">Des chefs (équipe, direction)</span>
                  <span className="rangee__sous">Son propre travail, puis ce qu&apos;il reçoit de son équipe.</span>
                </span>
              </label>
            </fieldset>
            <div className="champ">
              <label htmlFor="m-depuis">À partir de</label>
              <select id="m-depuis" name="depuis" defaultValue="">
                <option value="">Un départ simple</option>
                {modeles
                  .filter((m) => m.courante)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      Copie de « {m.nom} » ({m.genre === "chef" ? "chefs" : "équipe"})
                    </option>
                  ))}
              </select>
              <span className="note">Une copie n&apos;est possible qu&apos;entre modèles du même genre.</span>
            </div>
            <div>
              <button type="submit" className="bouton-contour">
                <Icone nom="ajouter" taille={16} /> Créer le modèle
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
