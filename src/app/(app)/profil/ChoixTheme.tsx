"use client";

import { useState } from "react";
import { choisirTheme } from "@/app/actions-communes";

const CHOIX = [
  { id: "auto", libelle: "Automatique", detail: "Sombre sur téléphone, clair sur ordinateur" },
  { id: "clair", libelle: "Clair", detail: "Ivoire et marine" },
  { id: "sombre", libelle: "Sombre", detail: "Marine profond" },
] as const;

export function ChoixTheme({ actuel }: { actuel: string }) {
  const [theme, setTheme] = useState(actuel === "clair" || actuel === "sombre" ? actuel : "auto");
  return (
    <fieldset className="choix-acces" style={{ margin: 0, padding: 0, border: 0 }}>
      <legend className="visuellement-cache">Thème</legend>
      {CHOIX.map((c) => (
        <label key={c.id}>
          <input
            type="radio"
            name="theme"
            value={c.id}
            checked={theme === c.id}
            onChange={() => {
              setTheme(c.id);
              document.documentElement.dataset.theme = c.id;
              void choisirTheme(c.id);
            }}
          />
          <span className="rangee__texte">
            <span style={{ fontSize: 14, fontWeight: 500 }}>{c.libelle}</span>
            <span className="rangee__sous">{c.detail}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
