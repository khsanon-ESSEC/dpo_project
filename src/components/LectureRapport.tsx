/**
 * Un rapport tel que son lecteur le consulte : quelques chiffres « en un coup d'œil », ce qui demande une
 * réponse en premier (décisions, blocages), puis le reste ; à côté, ce qui a changé depuis la semaine dernière.
 * Sert à la lecture d'un rapport envoyé et à l'aperçu du brouillon (« tel que votre supérieur le lira »).
 */
import type { ReactNode } from "react";
import { ChampRapport, type ContexteRapport } from "@/components/ChampRapport";
import { ecart, nouvellesDecisions, ordreDeLecture, type Changement, type Resume } from "@/lib/lecture-rapport";
import { libelleRessenti, type Champ } from "@/lib/modeles";
import { dureeTexte } from "@/lib/projets";

const s = (n: number, un: string, plusieurs = `${un}s`) => (n > 1 ? plusieurs : un);

type Tuile = { libelle: string; valeur: string; sous: string; ton?: "veille" | "retard" };

function tuiles(m: Resume, p: Resume | null): Tuile[] {
  const t: Tuile[] = [];
  if (m.fait !== null) t.push({ libelle: "Fait", valeur: String(m.fait), sous: ecart(m.fait, p?.fait) ?? `${s(m.fait, "ligne")} cette semaine` });
  if (m.bloques !== null) {
    t.push({
      libelle: "Bloqué",
      valeur: String(m.bloques),
      sous: m.anciens.length
        ? `dont ${m.anciens.length} depuis 2 semaines ou plus`
        : m.resolus
          ? `${m.resolus} ${s(m.resolus, "résolu")} cette semaine`
          : m.bloques
            ? p
              ? `${s(m.bloques, "apparu", "apparus")} cette semaine`
              : ""
            : "rien de bloqué",
      ton: m.anciens.length ? "retard" : m.bloques ? "veille" : undefined,
    });
  }
  if (m.decisions !== null) {
    t.push({
      libelle: "Décisions attendues",
      valeur: String(m.decisions),
      sous: !m.decisions ? "aucune" : !p ? "" : nouvellesDecisions(m, p) ? `${nouvellesDecisions(m, p)} ${s(nouvellesDecisions(m, p), "nouvelle")}` : `déjà ${s(m.decisions, "signalée")} la semaine dernière`,
      ton: m.decisions ? "veille" : undefined,
    });
  }
  if (m.reunion) {
    t.push({
      libelle: "En réunion",
      valeur: m.reunion.minutes ? dureeTexte(m.reunion.minutes) : "0 h",
      sous: [`${m.reunion.n} ${s(m.reunion.n, "réunion")}`, p?.reunion ? `${dureeTexte(p.reunion.minutes)} la semaine dernière` : null].filter(Boolean).join(" · "),
    });
  }
  if (m.charge) {
    t.push({
      libelle: "Charge ressentie",
      valeur: libelleRessenti(m.charge.valeur),
      sous: m.charge.commentaire ? `calculé : ${m.charge.commentaire} prévues` : p?.charge && p.charge.valeur !== m.charge.valeur ? `était ${libelleRessenti(p.charge.valeur).toLowerCase()}` : "",
      ton: m.charge.valeur === "trop_lourde" ? "retard" : m.charge.valeur === "lourde" ? "veille" : undefined,
    });
  }
  return t;
}

const SIGNE: Record<Changement["ton"], string> = { mieux: "↗", moins_bien: "↘", alerte: "!", neutre: "•" };

/** Ce qui a changé depuis le rapport précédent : pour le lecteur pressé. */
export function DepuisLaSemaineDerniere({ changements, lien }: { changements: Changement[]; lien?: string | null }) {
  return (
    <section className="carte depuis" aria-labelledby="depuis-t">
      <div className="carte__entete">
        <h2 id="depuis-t" className="carte__titre">
          Depuis la semaine dernière
        </h2>
        {lien ? (
          <a href={lien} className="lien-discret">
            Rapport précédent
          </a>
        ) : null}
      </div>
      {changements.length ? (
        <ul className="liste">
          {changements.map((c, i) => (
            <li key={i} className={`depuis__ligne depuis__ligne--${c.ton}`}>
              <span className="depuis__signe" aria-hidden="true">
                {SIGNE[c.ton]}
              </span>
              <span>
                <strong>{c.fort}</strong> {c.suite}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vide" style={{ margin: 0 }}>
          Rien de notable.
        </p>
      )}
    </section>
  );
}

export function LectureRapport({
  formulaire,
  x,
  resume,
  precedent,
  changements,
  lienPrecedent,
  complet,
  cote,
  pied,
}: {
  formulaire: Champ[];
  x: ContexteRapport;
  resume: Resume;
  /** Le rapport précédent, résumé (null : pas de précédent lisible). */
  precedent: Resume | null;
  changements: Changement[];
  lienPrecedent?: string | null;
  /** Le lecteur voit tout le rapport (un chef de projet n'en voit que ses lignes : ni chiffres ni comparaison). */
  complet: boolean;
  /** Ce qui vient dans la colonne de droite, après « Depuis la semaine dernière » (répondre, envoyer…). */
  cote?: ReactNode;
  /** Sous les champs (mention des champs réservés…). */
  pied?: ReactNode;
}) {
  const t = complet ? tuiles(resume, precedent) : [];
  return (
    <>
      {t.length >= 2 ? (
        <section aria-label="En un coup d'œil">
          <dl className="coup-doeil">
            {t.map((k) => (
              <div key={k.libelle} className="coup-doeil__tuile">
                <dt>{k.libelle}</dt>
                <dd className={`coup-doeil__valeur${/^\d/.test(k.valeur) ? "" : " coup-doeil__valeur--texte"}${k.ton ? ` ton-${k.ton}` : ""}`}>{k.valeur}</dd>
                {k.sous ? <dd className="coup-doeil__sous">{k.sous}</dd> : null}
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <div className="colonnes lecture">
        <div className="colonne-large lecture__corps">
          {ordreDeLecture(formulaire, (c) =>
            c.type === "texte" || c.type === "texte_long"
              ? x.reponses.some((r) => r.champId === c.id && r.valeur.trim())
              : x.lignes.some((l) => l.champId === c.id && !l.retiree && !l.resolu && (c.type !== "reprise" || l.remonte)),
          ).map((c) => (
            <ChampRapport key={c.id} c={c} x={x} />
          ))}
          {pied}
        </div>
        {complet && (precedent || cote) ? (
          <div className="colonne-etroite lecture__cote">
            {precedent ? <DepuisLaSemaineDerniere changements={changements} lien={lienPrecedent} /> : null}
            {cote}
          </div>
        ) : null}
      </div>
    </>
  );
}
