"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Icone } from "./Icone";
import { LETTRES, LIBELLE_LETTRE, LIBELLE_QUI, LIMITES, QUI, type Lettre, type Qui, type Raci } from "@/lib/raci";

/**
 * Modifier un RACI : nommer les rôles (et dire à qui chacun renvoie), écrire les activités, choisir une lettre par
 * case. Le tableau part en JSON (champ « raci ») ; le serveur le relit et le contrôle (src/lib/raci.ts).
 */
export function EditeurRaci({ raci, action, bouton, id = "raci-edition" }: { raci: Raci; action: (form: FormData) => void; bouton: string; id?: string }) {
  const [colonnes, setColonnes] = useState(raci.colonnes);
  const [lignes, setLignes] = useState(raci.lignes);

  const changerColonne = (i: number, c: Partial<{ libelle: string; qui: Qui }>) => setColonnes((cs) => cs.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const ajouterColonne = () => {
    setColonnes((cs) => [...cs, { libelle: "", qui: "libre" }]);
    setLignes((ls) => ls.map((l) => ({ ...l, lettres: [...l.lettres, ""] })));
  };
  const retirerColonne = (i: number) => {
    setColonnes((cs) => cs.filter((_, j) => j !== i));
    setLignes((ls) => ls.map((l) => ({ ...l, lettres: l.lettres.filter((_, j) => j !== i) })));
  };
  const changerLigne = (i: number, activite: string) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, activite } : l)));
  const changerLettre = (i: number, k: number, x: Lettre | "") => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, lettres: l.lettres.map((y, m) => (m === k ? x : y)) } : l)));
  const ajouterLigne = () => setLignes((ls) => [...ls, { activite: "", lettres: colonnes.map(() => "" as const) }]);
  const retirerLigne = (i: number) => setLignes((ls) => ls.filter((_, j) => j !== i));
  const deplacerLigne = (i: number, sens: -1 | 1) =>
    setLignes((ls) => {
      const j = i + sens;
      if (j < 0 || j >= ls.length) return ls;
      const n = [...ls];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  // Ce que le serveur refusera, dit tout de suite : deux « A » sur une activité.
  const doublesA = lignes.filter((l) => l.lettres.filter((x) => x === "A").length > 1).map((l) => l.activite || "une activité sans nom");

  return (
    <form action={action} className="raci-edition" id={id}>
      <input type="hidden" name="raci" value={JSON.stringify({ colonnes, lignes })} />
      <div className="defile-x">
        <table className="raci raci--edition">
          <thead>
            <tr>
              <th scope="col" className="raci__activite">
                Activité / livrable
              </th>
              {colonnes.map((c, i) => (
                <th key={i} scope="col">
                  <div className="raci-edition__role">
                    <textarea aria-label={`Rôle ${i + 1}`} value={c.libelle} onChange={(e) => changerColonne(i, { libelle: e.target.value.replace(/\n/g, " ") })} maxLength={LIMITES.libelle} required placeholder="Rôle" rows={2} />
                    <select aria-label={`À qui renvoie le rôle ${i + 1}`} value={c.qui} onChange={(e) => changerColonne(i, { qui: e.target.value as Qui })}>
                      {QUI.map((q) => (
                        <option key={q} value={q}>
                          {LIBELLE_QUI[q]}
                        </option>
                      ))}
                    </select>
                    {colonnes.length > 1 ? (
                      <button type="button" className="bouton-mini" onClick={() => retirerColonne(i)} aria-label={`Retirer le rôle « ${c.libelle || i + 1} »`}>
                        Retirer
                      </button>
                    ) : null}
                  </div>
                </th>
              ))}
              <th scope="col" className="raci-edition__outils">
                {colonnes.length < LIMITES.colonnes ? (
                  <button type="button" className="bouton-mini" onClick={ajouterColonne}>
                    <Icone nom="ajouter" taille={14} /> Rôle
                  </button>
                ) : null}
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i} className={l.lettres.filter((x) => x === "A").length > 1 ? "raci-edition__ligne--erreur" : undefined}>
                <th scope="row" className="raci__activite">
                  <input aria-label={`Activité ${i + 1}`} value={l.activite} onChange={(e) => changerLigne(i, e.target.value)} maxLength={LIMITES.activite} placeholder="Ex. : Valider la solution" />
                </th>
                {colonnes.map((c, k) => (
                  <td key={k} className="raci__case">
                    <select aria-label={`${l.activite || `Activité ${i + 1}`} : ${c.libelle || `rôle ${k + 1}`}`} value={l.lettres[k] ?? ""} onChange={(e) => changerLettre(i, k, e.target.value as Lettre | "")}>
                      <option value="">—</option>
                      {LETTRES.map((x) => (
                        <option key={x} value={x}>
                          {x} · {LIBELLE_LETTRE[x]}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
                <td className="raci-edition__outils">
                  <button type="button" className="bouton-icone" style={{ width: 32, height: 32 }} disabled={i === 0} onClick={() => deplacerLigne(i, -1)} aria-label={`Monter « ${l.activite || i + 1} »`} title="Monter">
                    <Icone nom="chevron-haut" taille={16} />
                  </button>
                  <button type="button" className="bouton-icone" style={{ width: 32, height: 32 }} disabled={i === lignes.length - 1} onClick={() => deplacerLigne(i, 1)} aria-label={`Descendre « ${l.activite || i + 1} »`} title="Descendre">
                    <Icone nom="chevron-bas" taille={16} />
                  </button>
                  <button type="button" className="bouton-icone" style={{ width: 32, height: 32 }} onClick={() => retirerLigne(i)} aria-label={`Retirer « ${l.activite || i + 1} »`} title="Retirer">
                    <Icone nom="fermer" taille={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="raci-edition__pied">
        {lignes.length < LIMITES.lignes ? (
          <button type="button" className="bouton-contour" onClick={ajouterLigne}>
            <Icone nom="ajouter" taille={16} /> Activité
          </button>
        ) : null}
        <span className="aide">R réalise · A approuve (un seul rôle par activité) · C consulté · I informé.</span>
      </div>
      {doublesA.length ? (
        <p className="erreur" role="alert" style={{ margin: 0 }}>
          Un seul rôle approuve (A) : {doublesA.map((x) => `« ${x} »`).join(", ")}.
        </p>
      ) : null}
      <Enregistrer texte={bouton} bloque={doublesA.length > 0} />
    </form>
  );
}

function Enregistrer({ texte, bloque }: { texte: string; bloque: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="bouton-ambre" disabled={pending || bloque} style={{ alignSelf: "flex-start" }}>
      <Icone nom="coche" taille={16} /> {pending ? "Enregistrement…" : texte}
    </button>
  );
}
