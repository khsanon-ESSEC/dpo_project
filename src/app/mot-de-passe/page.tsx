import type { Metadata } from "next";
import { exigerUtilisateur } from "@/lib/auth/session";
import { FormulaireMotDePasse } from "./FormulaireMotDePasse";

export const metadata: Metadata = { title: "Choisir un mot de passe" };

export default async function PageMotDePasse() {
  const u = await exigerUtilisateur();
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 24 }}>
        <p className="surtitre" style={{ color: "var(--surtitre)" }}>
          Bienvenue, {u.prenom}
        </p>
        <h1 style={{ margin: 0, fontSize: 34, lineHeight: "40px", fontWeight: 200 }}>Choisissez votre mot de passe</h1>
        <FormulaireMotDePasse provisoire={u.doitChangerMotDePasse} />
      </div>
    </main>
  );
}
