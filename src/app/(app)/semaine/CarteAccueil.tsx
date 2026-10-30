/**
 * « Vos trois premiers gestes » (première connexion guidée, 29 octobre 2026) : trois gestes choisis selon le rôle,
 * chacun avec sa fiche du guide et son « Le faire maintenant ». Cochés d'eux-mêmes une fois faits ; la carte
 * disparaît quand les trois le sont, ou quand on la masque.
 */
import type { Acces } from "@/lib/acces";
import { accueilDe } from "@/lib/donnees/accueil";
import { ficheParId } from "@/lib/guide";
import { Icone } from "@/components/Icone";
import { FaireMaintenant } from "../aide/FaireMaintenant";
import { fermerAccueil } from "./actions-accueil";

export async function CarteAccueil({ a }: { a: Acces }) {
  const gestes = await accueilDe(a);
  if (!gestes) return null;
  const faits = gestes.filter((g) => g.fait).length;
  return (
    <section className="carte accueil" aria-labelledby="accueil-titre">
      <div className="carte__entete">
        <h2 id="accueil-titre" className="carte__titre">
          Vos trois premiers gestes
        </h2>
        <span className="note">
          {faits} sur {gestes.length}
        </span>
      </div>
      <p className="note" style={{ margin: 0 }}>
        Pour prendre la main en quelques minutes. Chaque geste a sa fiche dans le guide ; il se coche de lui-même une fois fait.
      </p>
      <ol className="accueil__gestes">
        {gestes.map((g, i) => {
          const f = ficheParId(g.fiche);
          return (
            <li key={g.cle} className={`accueil__geste${g.fait ? " accueil__geste--fait" : ""}`}>
              <span className="accueil__rond" aria-hidden="true">
                {g.fait ? <Icone nom="coche" taille={14} /> : i + 1}
              </span>
              <span className="rangee__texte">
                <a href={`/aide/${g.fiche}`} className="rangee__titre rangee__lien">
                  {g.titre}
                </a>
                <span className="rangee__sous">{g.fait ? "Fait." : (f?.resume ?? "")}</span>
              </span>
              {!g.fait && f?.faire ? <FaireMaintenant libelle={f.faire.libelle} lien={f.faire.lien} barre={f.faire.barre} classe="bouton-mini" /> : null}
              <span className="visuellement-cache">{g.fait ? "(fait)" : "(à faire)"}</span>
            </li>
          );
        })}
      </ol>
      <form action={fermerAccueil}>
        <button type="submit" className="lien-discret" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", fontSize: 13 }}>
          Masquer ces gestes (le guide reste dans le menu)
        </button>
      </form>
    </section>
  );
}
