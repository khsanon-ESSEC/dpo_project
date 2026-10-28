import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/auth/session";
import { googleActive } from "@/lib/auth/google";
import { adActive } from "@/lib/auth/ad";
import { MESSAGES_GOOGLE } from "@/lib/auth/google-regles";
import { suiteValide } from "@/lib/retour";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const metadata: Metadata = { title: "Connexion" };

// Un graphique en traits fins, comme dans un rapport annuel : l'avancement monte, une seule barre est dorée
// (« un seul détail ambré par écran : ce qui compte »).
const BARRES = [22, 30, 26, 38, 34, 44, 40, 52, 47, 58, 54, 63, 60, 70, 66, 76, 72, 84, 79, 90, 86, 96, 92, 100];
const BARRE_DOREE = 17;

export default async function PageConnexion({ searchParams }: { searchParams: Promise<{ google?: string; suite?: string }> }) {
  const { google, suite: brute } = await searchParams;
  // « suite » : la page où aller une fois connecté (lien d'un courriel), seulement une page connue de l'application.
  const suite = suiteValide(brute);
  if (await utilisateurCourant()) redirect(suite ?? "/semaine");
  // Seulement un message connu : jamais un texte venu de l'adresse de la page.
  const erreurGoogle = google && Object.hasOwn(MESSAGES_GOOGLE, google) ? MESSAGES_GOOGLE[google] : null;
  return (
    <div className="connexion">
      <section aria-label="Pilotage des projets" className="connexion__heros">
        <div aria-hidden="true" className="connexion__barres">
          {BARRES.map((h, i) => (
            <span key={i} className={i === BARRE_DOREE ? "connexion__barre connexion__barre--or" : "connexion__barre"} style={{ height: `${h}%` }} />
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-blanc.svg" alt="UNIBANK" className="connexion__logo" />
        <div className="connexion__accroche">
          <p className="connexion__division">Division des projets organisationnels</p>
          <h1 className="connexion__titre">
            Pilotage
            <br className="connexion__coupure" /> des projets
          </h1>
          <p className="connexion__devise">Qui fait quoi, et où en est chaque projet.</p>
        </div>
      </section>
      <main className="connexion__panneau">
        <div className="connexion__centre">
          <FormulaireConnexion google={googleActive()} ad={adActive()} erreurGoogle={erreurGoogle} suite={suite} />
        </div>
        <p className="note" style={{ textAlign: "center", fontSize: 12 }}>
          Réservé au personnel UNIBANK
        </p>
      </main>
    </div>
  );
}
