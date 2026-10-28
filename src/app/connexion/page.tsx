import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/auth/session";
import { googleActive } from "@/lib/auth/google";
import { MESSAGES_GOOGLE } from "@/lib/auth/google-regles";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const metadata: Metadata = { title: "Connexion" };

const BARRES: [number, number, string][] = [
  [10, 30, "#1b316a"], [22, 52, "#1b316a"], [8, 40, "#233c7d"], [30, 74, "#233c7d"], [12, 58, "#1b316a"], [40, 100, "#24478e"],
  [10, 66, "#233c7d"], [26, 84, "#284283"], [14, 50, "#1b316a"], [34, 72, "#24478e"], [8, 36, "#233c7d"], [20, 58, "#1b316a"],
  [16, 44, "#233c7d"], [28, 64, "#284283"], [10, 34, "#1b316a"], [18, 48, "#233c7d"],
];

export default async function PageConnexion({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  if (await utilisateurCourant()) redirect("/semaine");
  const { google } = await searchParams;
  // Seulement un message connu : jamais un texte venu de l'adresse de la page.
  const erreurGoogle = google && Object.hasOwn(MESSAGES_GOOGLE, google) ? MESSAGES_GOOGLE[google] : null;
  return (
    <div className="connexion">
      <section aria-label="Pilotage des projets" className="connexion__heros">
        <div aria-hidden="true" className="connexion__barres">
          {BARRES.map(([l, h, c], i) => (
            <span key={i} style={{ flex: `${l} 1 0`, height: `${h}%`, background: c }} />
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-blanc.svg" alt="UNIBANK" className="connexion__logo" />
        <div className="connexion__accroche">
          <p className="surtitre" style={{ color: "#f4b22d" }}>
            Division Projets Organisationnels
          </p>
          <h1 className="connexion__titre">
            Pilotage
            <br className="connexion__coupure" /> des projets
          </h1>
          <p className="connexion__devise">Qui fait quoi, et où en est chaque projet.</p>
        </div>
      </section>
      <main className="connexion__panneau">
        <div className="connexion__centre">
          <FormulaireConnexion google={googleActive()} erreurGoogle={erreurGoogle} />
        </div>
        <p className="note" style={{ textAlign: "center", fontSize: 12 }}>
          Réservé au personnel UNIBANK
        </p>
      </main>
    </div>
  );
}
