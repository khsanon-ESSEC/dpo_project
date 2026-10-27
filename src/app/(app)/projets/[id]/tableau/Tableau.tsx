"use client";

import { useOptimistic, useState, useTransition } from "react";
import { deplacerTache } from "@/app/(app)/taches/actions";

type Statut = "a_faire" | "en_cours" | "bloquee" | "faite";
export type CarteTableau = {
  id: string;
  titre: string;
  statut: Statut;
  personne: string;
  initiales: string;
  echeanceTexte: string;
  retard: boolean;
  estimation: number | null;
  blocage: string | null;
  modifiable: boolean;
  lien: string | null;
};

const COLONNES: { id: Statut; libelle: string }[] = [
  { id: "a_faire", libelle: "À faire" },
  { id: "en_cours", libelle: "En cours" },
  { id: "bloquee", libelle: "Bloquée" },
  { id: "faite", libelle: "Faite" },
];

/**
 * Tableau en colonnes par état. On glisse une carte d'une colonne à l'autre, ou on choisit l'état
 * dans sa liste (au clavier, ou sur téléphone). Passer en « Bloquée » ouvre la fiche de la tâche,
 * où l'on dit ce qui bloque.
 */
export function Tableau({ cartes, retour }: { cartes: CarteTableau[]; retour: string }) {
  const [etat, deplacer] = useOptimistic(cartes, (actuelles: CarteTableau[], m: { id: string; statut: Statut }) =>
    actuelles.map((c) => (c.id === m.id ? { ...c, statut: m.statut } : c)),
  );
  const [, demarrer] = useTransition();
  const [survol, setSurvol] = useState<Statut | null>(null);
  const [glisse, setGlisse] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function changer(id: string, statut: Statut) {
    const carte = etat.find((c) => c.id === id);
    if (!carte || carte.statut === statut || !carte.modifiable) return;
    if (statut === "bloquee") {
      window.location.href = `/taches/${id}?statut=bloquee&retour=${encodeURIComponent(retour)}`;
      return;
    }
    setErreur(null);
    demarrer(async () => {
      deplacer({ id, statut });
      const r = await deplacerTache(id, statut);
      if (!r.ok) setErreur(r.message ?? "Le changement n'a pas été enregistré.");
    });
  }

  return (
    <>
      {erreur ? (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      <div className="kanban">
        {COLONNES.map((col) => {
          const liste = etat.filter((c) => c.statut === col.id);
          return (
            <section
              key={col.id}
              className="kanban__colonne"
              aria-labelledby={`col-${col.id}`}
              data-survol={survol === col.id ? "true" : undefined}
              onDragOver={(e) => {
                if (!glisse) return;
                e.preventDefault();
                setSurvol(col.id);
              }}
              onDragLeave={() => setSurvol((s) => (s === col.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setSurvol(null);
                const id = e.dataTransfer.getData("text/plain") || glisse;
                if (id) changer(id, col.id);
                setGlisse(null);
              }}
            >
              <div className="kanban__entete">
                <h2 id={`col-${col.id}`} className="carte__titre" style={{ margin: 0 }}>
                  {col.libelle} · {liste.length}
                </h2>
              </div>
              {liste.map((c) => (
                <article
                  key={c.id}
                  className={`kanban__carte${c.retard && c.statut !== "faite" ? " kanban__carte--retard" : ""}${c.statut === "bloquee" ? " kanban__carte--bloquee" : ""}`}
                  draggable={c.modifiable}
                  data-glisse={glisse === c.id ? "true" : undefined}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    e.dataTransfer.effectAllowed = "move";
                    setGlisse(c.id);
                  }}
                  onDragEnd={() => {
                    setGlisse(null);
                    setSurvol(null);
                  }}
                >
                  {c.lien ? (
                    <a href={c.lien} className="kanban__titre">
                      {c.titre}
                    </a>
                  ) : (
                    <span className="kanban__titre">{c.titre}</span>
                  )}
                  {c.statut === "bloquee" && c.blocage ? (
                    <span className="ton-veille" style={{ fontSize: 12, lineHeight: "16px" }}>
                      {c.blocage}
                    </span>
                  ) : null}
                  <div className="kanban__pied">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span className="mono mono--petit" title={c.personne} aria-label={c.personne}>
                        {c.initiales}
                      </span>
                      <span className={c.retard && c.statut !== "faite" ? "ton-retard" : undefined} style={{ whiteSpace: "nowrap" }}>
                        {c.echeanceTexte}
                      </span>
                      {c.estimation ? <span style={{ whiteSpace: "nowrap" }}>· {c.estimation} h</span> : null}
                    </span>
                    {c.modifiable ? (
                      <>
                        <label className="visuellement-cache" htmlFor={`etat-${c.id}`}>
                          État de « {c.titre} »
                        </label>
                        <select id={`etat-${c.id}`} value={c.statut} onChange={(e) => changer(c.id, e.target.value as Statut)}>
                          {COLONNES.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.libelle}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
              {liste.length === 0 ? <p className="note" style={{ padding: "8px 4px" }}>Aucune tâche.</p> : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
