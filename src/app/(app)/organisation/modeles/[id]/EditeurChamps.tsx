"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { ajouterChamp, deplacerChamp, reordonner, retirerChamp } from "../actions";
import { Icone } from "@/components/Icone";
import type { TypeChamp } from "@/lib/modeles";

export type ChampListe = { id: string; type: TypeChamp; libelle: string; resume: string; prive: string; nouveau: boolean };
export type GroupePalette = { titre: string; items: { type: TypeChamp; nom: string; detail: string }[] };

/** Petits dessins des types de champ (trait, 24 × 24). */
const GLYPHE: Record<TypeChamp, string> = {
  lignes: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  sante: "M3 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  charge: "M4 16a8 8 0 0 1 16 0M12 16l4-5",
  texte: "M4 9h16M4 15h10",
  texte_long: "M4 6h16M4 10h16M4 14h16M4 18h10",
  choix: "M4 5h5v5H4zM4 14h5v5H4zM13 7.5h7M13 16.5h7",
  echelle: "M4 18h3v-4H4zM10.5 18h3V10h-3zM17 18h3V6h-3z",
  nombre: "M9 4L7 20M17 4l-2 16M4 9h16M3 15h16",
  date: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  intertitre: "M6 5v14M18 5v14M6 12h12",
  note: "M12 8h.01M11 12h1v5h1M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0",
  mon_travail: "M8 3h11v14H8zM5 7v14h11",
  reprise: "M4 7h9M4 12h9M4 17h6M16 9l4 3-4 3",
  synthese: "M4 6h16M4 10h12M4 14h16M4 18h8M19 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z",
  piece_jointe: "M16.5 7.5 9.3 14.7a1.8 1.8 0 0 0 2.5 2.5l7.4-7.4a3.6 3.6 0 0 0-5.1-5.1l-7.6 7.6a5.4 5.4 0 0 0 7.6 7.6l6.4-6.4",
  reunions: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 19a5.5 5.5 0 0 1 11 0M10.5 19a5.5 5.5 0 0 1 11 0",
};

function Glyphe({ type }: { type: TypeChamp }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", color: "var(--relief-encre)" }}>
      <path d={GLYPHE[type]} />
    </svg>
  );
}

/**
 * Palette et formulaire : on glisse un champ de la palette dans le formulaire, ou on le choisit
 * (il s'ajoute sous le champ sélectionné). On réordonne en glissant, ou avec Monter / Descendre.
 */
export function EditeurChamps({ modeleId, champs, selection, palette }: { modeleId: string; champs: ChampListe[]; selection: string | null; palette: GroupePalette[] }) {
  const [enCours, demarrer] = useTransition();
  const [liste, setListe] = useOptimistic(champs);
  const [survol, setSurvol] = useState<number | null>(null);
  const [annonce, setAnnonce] = useState("");
  const glisse = useRef<{ type?: TypeChamp; de?: number } | null>(null);
  const iSel = liste.findIndex((c) => c.id === selection);

  const ajouter = (type: TypeChamp, position: number | null, nom: string) =>
    demarrer(async () => {
      setAnnonce(`« ${nom} » ajouté.`);
      await ajouterChamp(modeleId, type, position);
    });

  const deposer = (i: number) => {
    const g = glisse.current;
    glisse.current = null;
    setSurvol(null);
    if (!g) return;
    if (g.type) {
      const nom = palette.flatMap((p) => p.items).find((x) => x.type === g.type)?.nom ?? "Champ";
      ajouter(g.type, i, nom);
      return;
    }
    if (g.de === undefined || i === g.de || i === g.de + 1) return;
    const nl = [...liste];
    const [x] = nl.splice(g.de, 1);
    nl.splice(i > g.de ? i - 1 : i, 0, x);
    demarrer(async () => {
      setListe(nl);
      setAnnonce(`« ${x.libelle} » est maintenant en position ${nl.indexOf(x) + 1}.`);
      await reordonner(modeleId, nl.map((c) => c.id));
    });
  };

  const surDragOver = (i: number) => (e: React.DragEvent) => {
    if (!glisse.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = glisse.current.type ? "copy" : "move";
    if (survol !== i) setSurvol(i);
  };

  return (
    <>
      <aside className="editeur__palette" aria-labelledby="ed-palette">
        <div>
          <h2 id="ed-palette" className="editeur__titre">
            Champs
          </h2>
          <p className="note">Glissez un champ dans le formulaire, ou choisissez-le : il s&apos;ajoute sous le champ sélectionné.</p>
        </div>
        {palette.map((g) => (
          <div key={g.titre} className="editeur__groupe">
            <h3>{g.titre}</h3>
            {g.items.map((it) => (
              <button
                key={it.type}
                type="button"
                className="editeur__outil"
                draggable
                disabled={enCours}
                onDragStart={(e) => {
                  glisse.current = { type: it.type };
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData("text/plain", it.type);
                }}
                onDragEnd={() => {
                  glisse.current = null;
                  setSurvol(null);
                }}
                onClick={() => ajouter(it.type, iSel >= 0 ? iSel + 1 : null, it.nom)}
              >
                <Glyphe type={it.type} />
                <span className="rangee__texte">
                  <span className="editeur__outil-nom">{it.nom}</span>
                  <span className="rangee__sous">{it.detail}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div className="editeur__formulaire">
        <div className="ligne-actions" style={{ marginBottom: 4 }}>
          <h2 className="editeur__titre">Formulaire · {liste.length} champ{liste.length > 1 ? "s" : ""}</h2>
          <span className="note">Dans l&apos;ordre où la personne les voit</span>
        </div>
        <ol className="editeur__liste" aria-busy={enCours}>
          {liste.map((c, i) => (
            <li key={c.id} onDragOver={surDragOver(i)} onDrop={(e) => (e.preventDefault(), deposer(i))}>
              {survol === i ? <span className="editeur__repere" aria-hidden="true" /> : null}
              <div
                className={`editeur__champ${c.id === selection ? " editeur__champ--choisi" : ""}${c.type === "intertitre" || c.type === "mon_travail" ? " editeur__champ--partie" : ""}`}
                draggable
                onDragStart={(e) => {
                  glisse.current = { de: i };
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", c.id);
                }}
                onDragEnd={() => {
                  glisse.current = null;
                  setSurvol(null);
                }}
              >
                <span className="editeur__poignee" aria-hidden="true" title="Glisser pour déplacer">
                  <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor">
                    <circle cx="3" cy="4" r="1.5" />
                    <circle cx="9" cy="4" r="1.5" />
                    <circle cx="3" cy="10" r="1.5" />
                    <circle cx="9" cy="10" r="1.5" />
                    <circle cx="3" cy="16" r="1.5" />
                    <circle cx="9" cy="16" r="1.5" />
                  </svg>
                </span>
                <span className="editeur__numero">{i + 1}</span>
                <Glyphe type={c.type} />
                <span className="rangee__texte">
                  <a href={`/organisation/modeles/${modeleId}?champ=${c.id}#proprietes`} className="editeur__libelle" aria-current={c.id === selection ? "true" : undefined}>
                    {c.libelle}
                  </a>
                  <span className="rangee__sous">
                    {c.resume}
                    {c.prive ? (
                      <>
                        {" · "}
                        <Icone nom="cadenas" taille={12} /> {c.prive}
                      </>
                    ) : null}
                  </span>
                </span>
                {c.nouveau ? <span className="etiquette-auto">Nouveau</span> : null}
                <span className="editeur__boutons">
                  <button
                    type="button"
                    className="bouton-icone"
                    disabled={i === 0 || enCours}
                    aria-label={`Monter « ${c.libelle} »`}
                    title="Monter"
                    onClick={() => demarrer(() => deplacerChamp(modeleId, c.id, -1))}
                  >
                    <Icone nom="chevron-haut" taille={18} />
                  </button>
                  <button
                    type="button"
                    className="bouton-icone"
                    disabled={i === liste.length - 1 || enCours}
                    aria-label={`Descendre « ${c.libelle} »`}
                    title="Descendre"
                    onClick={() => demarrer(() => deplacerChamp(modeleId, c.id, 1))}
                  >
                    <Icone nom="chevron-bas" taille={18} />
                  </button>
                  <button type="button" className="bouton-icone" disabled={enCours} aria-label={`Retirer « ${c.libelle} »`} title="Retirer du formulaire" onClick={() => demarrer(() => retirerChamp(modeleId, c.id))}>
                    <Icone nom="fermer" taille={18} />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ol>
        <div
          className={`editeur__depot${survol === liste.length ? " editeur__depot--actif" : ""}`}
          onDragOver={surDragOver(liste.length)}
          onDrop={(e) => (e.preventDefault(), deposer(liste.length))}
          onDragLeave={() => setSurvol(null)}
        >
          {survol !== null ? "Déposer ici pour placer le champ à la fin" : "Glissez un champ de la palette ici, ou choisissez-le à gauche"}
        </div>
        <p aria-live="polite" className="note" style={{ minHeight: 19 }}>
          {annonce}
        </p>
      </div>
    </>
  );
}
