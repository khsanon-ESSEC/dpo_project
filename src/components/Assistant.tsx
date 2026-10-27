"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icone } from "./Icone";
import { ecranDepuisChemin } from "./Navigation";

const SUGGESTIONS: Record<string, { contexte: string; questions: string[] }> = {
  semaine: { contexte: "Vos tâches et vos projets", questions: ["Qu'est-ce qui est en retard ?", "Par quoi commencer lundi ?", "Résumer ma semaine"] },
  rapport: { contexte: "Votre rapport de la semaine", questions: ["Qu'ai-je oublié dans mon rapport ?", "Proposer une phrase pour expliquer mon blocage", "Résumer mon rapport en deux phrases"] },
  equipe: { contexte: "Les rapports et les tâches de votre équipe", questions: ["Qui n'a pas encore envoyé son rapport ?", "Résumer les blocages de l'équipe", "Qui a de la marge la semaine prochaine ?"] },
  projet: { contexte: "Ce projet", questions: ["Pourquoi ce projet est-il en retard ?", "Rédiger l'état d'avancement du mois", "Que disent les rapports de la semaine ?"] },
  portefeuille: { contexte: "Les projets que vous pouvez voir", questions: ["Quels projets glissent ce mois-ci ?", "Quels projets demandent mon attention ?", "Résumer le portefeuille en trois phrases"] },
  conseil: { contexte: "Rapport au conseil", questions: ["Qu'est-ce qui a changé depuis le dernier rapport ?", "Quels états d'avancement relire en priorité ?", "Résumer le rapport en trois phrases"] },
  organisation: { contexte: "Organisation de la division", questions: ["Quelles équipes ont un poste vacant ?", "Qui n'a pas de supérieur désigné ?"] },
};

type Echange = { question: string; reponse?: string; erreur?: string };

export function Assistant() {
  const pathname = usePathname();
  const ecran = ecranDepuisChemin(pathname);
  const [ouvert, setOuvert] = useState(false);
  const [echanges, setEchanges] = useState<Echange[]>([]);
  const [saisie, setSaisie] = useState("");
  const [attente, setAttente] = useState(false);
  const champ = useRef<HTMLTextAreaElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const s = SUGGESTIONS[ecran] ?? SUGGESTIONS.semaine;

  useEffect(() => {
    setEchanges([]);
  }, [ecran]);

  useEffect(() => {
    if (!ouvert) return;
    champ.current?.focus();
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [ouvert]);

  function fermer() {
    setOuvert(false);
    bouton.current?.focus();
  }

  async function demander(question: string) {
    const q = question.trim();
    if (!q || attente) return;
    setSaisie("");
    setAttente(true);
    setEchanges((e) => [...e, { question: q }]);
    try {
      const rep = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ecran, chemin: pathname, question: q }) });
      const json = (await rep.json()) as { reponse?: string; erreur?: string };
      setEchanges((e) => [...e.slice(0, -1), { question: q, reponse: json.reponse, erreur: json.erreur }]);
    } catch {
      setEchanges((e) => [...e.slice(0, -1), { question: q, erreur: "Connexion impossible. Réessayez." }]);
    } finally {
      setAttente(false);
    }
  }

  const autres = s.questions.filter((q) => !echanges.some((e) => e.question === q));

  return (
    <>
      <button ref={bouton} type="button" className="fab" onClick={() => setOuvert(true)} aria-label="Ouvrir l'assistant" title="Assistant" aria-expanded={ouvert}>
        <Icone nom="etincelle" taille={24} />
      </button>
      {ouvert ? (
        <>
          <button type="button" className="assistant-voile" tabIndex={-1} aria-label="Fermer l'assistant" onClick={fermer} />
          <section className="assistant" role="dialog" aria-modal="true" aria-labelledby="assistant-titre">
            <div className="assistant__entete">
              <span className="avatar-ia" aria-hidden="true">
                <Icone nom="etincelle" taille={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <h2 id="assistant-titre" style={{ margin: 0, fontSize: 16, lineHeight: "20px", fontWeight: 500 }}>
                  Assistant
                </h2>
                <span className="rangee__sous">{s.contexte}</span>
              </div>
              {echanges.length ? (
                <button type="button" className="bouton-icone" onClick={() => setEchanges([])} aria-label="Nouvelle conversation" title="Nouvelle conversation">
                  <Icone nom="ajouter" taille={20} />
                </button>
              ) : null}
              <button type="button" className="bouton-icone" onClick={fermer} aria-label="Fermer l'assistant" title="Fermer">
                <Icone nom="fermer" taille={20} />
              </button>
            </div>
            <div className="assistant__corps" aria-live="polite">
              {echanges.length === 0 ? (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 26, lineHeight: "32px", fontWeight: 200 }}>Que voulez-vous savoir&#8239;?</p>
                    <p className="note">Il ne voit que ce que vous avez le droit de voir.</p>
                  </div>
                  <ul className="liste" style={{ borderTop: "1px solid var(--filet)" }}>
                    {s.questions.map((q) => (
                      <li key={q} style={{ borderTop: 0 }}>
                        <button type="button" className="assistant__suggestion" onClick={() => demander(q)}>
                          {q}
                          <span style={{ color: "var(--discret)", display: "flex" }}>
                            <Icone nom="fleche-droite" taille={18} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                echanges.map((e, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <p className="assistant__question">{e.question}</p>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <span className="avatar-ia" aria-hidden="true" style={{ width: 28, height: 28 }}>
                        <Icone nom="etincelle" taille={16} />
                      </span>
                      {e.erreur ? (
                        <p className="assistant__reponse ton-veille">{e.erreur}</p>
                      ) : e.reponse ? (
                        <p className="assistant__reponse">{e.reponse}</p>
                      ) : (
                        <p className="assistant__reponse ton-discret">Je regarde…</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              {echanges.length > 0 && autres.length > 0 && !attente ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {autres.map((q) => (
                    <button key={q} type="button" className="bouton-contour" style={{ height: "auto", minHeight: 40, padding: "8px 14px", whiteSpace: "normal", textAlign: "left", fontWeight: 400 }} onClick={() => demander(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <form
              className="assistant__saisie"
              onSubmit={(ev) => {
                ev.preventDefault();
                void demander(saisie);
              }}
            >
              <div className="assistant__champ">
                <textarea
                  ref={champ}
                  rows={1}
                  value={saisie}
                  maxLength={1000}
                  onChange={(ev) => setSaisie(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" && !ev.shiftKey) {
                      ev.preventDefault();
                      void demander(saisie);
                    }
                  }}
                  aria-label="Votre question à l'assistant"
                  placeholder="Posez une question"
                />
                <button type="submit" className="bouton-envoyer" aria-label="Envoyer la question" disabled={attente}>
                  <Icone nom="envoyer" taille={18} />
                </button>
              </div>
              <p className="note" style={{ fontSize: 11, lineHeight: "16px" }}>
                L'assistant peut se tromper : relisez avant d'envoyer.
              </p>
            </form>
          </section>
        </>
      ) : null}
    </>
  );
}
