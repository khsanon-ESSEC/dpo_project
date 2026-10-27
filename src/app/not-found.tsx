import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page introuvable" };

/** Page introuvable, ou réservée à d'autres rôles : on ne dit pas laquelle des deux. */
export default function Introuvable() {
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--fond)" }}>
      <div style={{ maxWidth: 440, display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", color: "#f4b22d" }}>Page introuvable</p>
        <h1 style={{ margin: 0, fontSize: 32, lineHeight: "40px", fontWeight: 200 }}>Cette page n'existe pas, ou elle ne vous est pas ouverte.</h1>
        <p className="note" style={{ margin: 0 }}>
          Si vous pensez devoir y accéder, demandez à un administrateur de vérifier vos rôles.
        </p>
        <a href="/semaine" className="bouton-ambre" style={{ alignSelf: "flex-start" }}>
          Revenir à ma semaine
        </a>
      </div>
    </main>
  );
}
