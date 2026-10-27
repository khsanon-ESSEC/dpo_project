import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/auth/session";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const metadata: Metadata = { title: "Connexion" };

const BARRES: [number, number, string][] = [
  [10, 30, "#1b316a"], [22, 52, "#1b316a"], [8, 40, "#233c7d"], [30, 74, "#233c7d"], [12, 58, "#1b316a"], [40, 100, "#24478e"],
  [10, 66, "#233c7d"], [26, 84, "#284283"], [14, 50, "#1b316a"], [34, 72, "#24478e"], [8, 36, "#233c7d"], [20, 58, "#1b316a"],
  [16, 44, "#233c7d"], [28, 64, "#284283"], [10, 34, "#1b316a"], [18, 48, "#233c7d"],
];

export default async function PageConnexion() {
  if (await utilisateurCourant()) redirect("/semaine");
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
      <section
        aria-label="Pilotage des projets"
        style={{ flex: "1 1 520px", minWidth: 0, position: "relative", overflow: "hidden", minHeight: 360, padding: "48px clamp(24px, 5vw, 56px)", background: "#142458", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 48 }}
      >
        <div aria-hidden="true" style={{ position: "absolute", left: "clamp(24px, 5vw, 56px)", right: "clamp(24px, 5vw, 56px)", bottom: 0, height: "46%", display: "flex", alignItems: "flex-end", gap: 8 }}>
          {BARRES.map(([l, h, c], i) => (
            <span key={i} style={{ display: "block", flex: `${l} 1 0`, height: `${h}%`, background: c }} />
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-blanc.svg" alt="UNIBANK" style={{ position: "relative", width: 150, height: "auto" }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 16, paddingBottom: "32%" }}>
          <p className="surtitre" style={{ color: "#f4b22d" }}>
            Division Projets Organisationnels
          </p>
          <h1 style={{ margin: 0, fontSize: "clamp(40px, 5vw, 56px)", lineHeight: 1.1, fontWeight: 200, letterSpacing: "-0.015em" }}>
            Pilotage
            <br />
            des projets
          </h1>
          <p style={{ margin: 0, maxWidth: 380, fontSize: 18, lineHeight: "27px", fontWeight: 300, color: "#a9b6d6" }}>Qui fait quoi, et où en est chaque projet.</p>
        </div>
      </section>
      <main style={{ flex: "1 1 440px", minWidth: 0, padding: "32px clamp(24px, 4vw, 40px) 48px", display: "flex", flexDirection: "column", background: "var(--fond)" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 0" }}>
          <FormulaireConnexion />
        </div>
        <p className="note" style={{ textAlign: "center", fontSize: 12 }}>
          Réservé au personnel UNIBANK
        </p>
      </main>
    </div>
  );
}
