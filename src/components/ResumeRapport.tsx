import { ajouterJours, dateCourte, dateLocale, heure, jourAbrege } from "@/lib/dates";
import type { ResumeRapport } from "@/lib/donnees/rapport";

/** « du 19 au 23 oct. » */
export function semaineTexte(semaine: string) {
  const fin = ajouterJours(semaine, 4);
  const memeMois = semaine.slice(5, 7) === fin.slice(5, 7);
  return `du ${memeMois ? Number(semaine.slice(8)) : dateCourte(semaine)} au ${dateCourte(fin)}`;
}

export function envoiTexte(r: Pick<ResumeRapport, "statut" | "envoyeLe">) {
  if (r.statut !== "envoye" || !r.envoyeLe) return "Brouillon";
  const j = dateLocale(r.envoyeLe);
  return `Envoyé ${jourAbrege(j).toLowerCase()} ${Number(j.slice(8))} à ${heure(r.envoyeLe)}`;
}

/** Une ligne d'historique : la semaine, ce qui a été fait, et le nombre de lignes par partie. */
export function LigneResume({ r, lien, titre, sous }: { r: ResumeRapport; lien: string; titre: string; sous?: string }) {
  const c = r.comptes;
  return (
    <a href={lien} className="rangee" style={{ minHeight: 72, gap: 16, alignItems: "flex-start", paddingTop: 14, paddingBottom: 14, flexWrap: "wrap" }}>
      <span className="rangee__texte" style={{ flex: "1 1 260px" }}>
        <span className="rangee__titre" style={{ fontWeight: 500 }}>
          {titre}
        </span>
        <span className="rangee__sous">
          {[sous, r.apercu.length ? r.apercu.join(" · ") : r.statut === "envoye" ? "Rien dans « Fait »" : null].filter(Boolean).join(" — ")}
        </span>
      </span>
      <span style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, fontSize: 12, lineHeight: "16px" }}>
        <span className={r.statut === "envoye" ? "ton-ok" : "ton-veille"}>{envoiTexte(r)}</span>
        <span className="ton-discret" style={{ cursor: "inherit" }}>
          {c.fait} fait{c.fait > 1 ? "s" : ""} · {c.en_cours} en cours · <span className={c.bloque ? "ton-veille" : undefined}>{c.bloque} bloqué{c.bloque > 1 ? "s" : ""}</span> · {c.prochaine} prévu{c.prochaine > 1 ? "s" : ""}
        </span>
      </span>
    </a>
  );
}
