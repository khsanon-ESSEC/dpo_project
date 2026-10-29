import { PastilleStatut } from "./PastilleStatut";
import { ajouterJours, dateCourte, ecartJours, premierDuMois } from "@/lib/dates";
import { estJourOuvre } from "@/lib/charge";
import { DefilerVersAujourdhui } from "./DefilerVersAujourdhui";

export type Zoom = "jour" | "semaine" | "mois";
export const PX_PAR_JOUR: Record<Zoom, number> = { jour: 36, semaine: 16, mois: 4 };
export const LIBELLE_ZOOM: Record<Zoom, string> = { jour: "Jours", semaine: "Semaines", mois: "Mois" };

export type BarreGantt = { debut: string; fin: string; classe: string; texte?: string; titre: string; lien?: string };
export type JalonGantt = { date: string; type: "fin" | "initial" | "lancement" | "livrable" | "livrable-valide" | "livrable-retard"; titre: string };
export type LigneGantt = { id: string; libelle: string; sous?: string; lien?: string; groupe?: boolean; mono?: string; statut?: string; retard?: boolean; barres: BarreGantt[]; jalons?: JalonGantt[] };

const MOIS = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "short", year: "numeric" });
const moisCourt = (iso: string) => MOIS.format(new Date(`${iso}T12:00:00Z`)).replace(".", "");

/**
 * Diagramme de Gantt rendu côté serveur : une ligne par élément, des barres positionnées au jour près.
 * Défilement horizontal ; la colonne des noms reste visible.
 */
export function Gantt({ id, lignes, debut, fin, zoom, aujourdhui, finProjet }: { id: string; lignes: LigneGantt[]; debut: string; fin: string; zoom: Zoom; aujourdhui: string; finProjet?: string | null }) {
  const px = PX_PAR_JOUR[zoom];
  const jours = ecartJours(debut, fin) + 1;
  const largeur = jours * px;
  const x = (d: string) => ecartJours(debut, d) * px;
  const borne = (d: string) => (d < debut ? debut : d > fin ? fin : d);

  // En-tête : mois, puis jours (zoom « jours ») ou lundis (zoom « semaines »).
  const mois: { x: number; texte: string }[] = [];
  for (let m = premierDuMois(debut); m <= fin; m = premierDuMois(m, 1)) mois.push({ x: x(m < debut ? debut : m), texte: moisCourt(m) });
  const graduations: { x: number; texte: string }[] = [];
  const weekends: number[] = [];
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) {
    const jourSemaine = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (zoom === "jour") graduations.push({ x: x(d), texte: `${"DLMMJVS"[jourSemaine]} ${Number(d.slice(8))}` });
    if (zoom === "semaine" && jourSemaine === 1) graduations.push({ x: x(d), texte: dateCourte(d).replace(".", "") });
    if (zoom !== "mois" && !estJourOuvre(d)) weekends.push(x(d));
  }
  const xAujourdhui = aujourdhui >= debut && aujourdhui <= fin ? x(aujourdhui) + px / 2 : null;

  return (
    <div className="gantt" id={id}>
      <div className="gantt__interieur" style={{ width: 260 + largeur }}>
        <div className="gantt__ligne gantt__ligne--entete" aria-hidden="true">
          <div className="gantt__nom" />
          <div className="gantt__piste" style={{ width: largeur }}>
            {mois.map((m) => (
              <span key={m.x} className="gantt__mois" style={{ left: m.x }}>
                {m.texte}
              </span>
            ))}
            {graduations.map((g) => (
              <span key={g.x} className="gantt__graduation" style={{ left: g.x }}>
                {g.texte}
              </span>
            ))}
          </div>
        </div>
        {lignes.map((l, n) => (
          <div key={l.id} className={`gantt__ligne${l.groupe ? " gantt__ligne--groupe" : ""}`}>
            {l.lien ? (
              <a href={l.lien} className="gantt__nom" title={l.libelle}>
                {l.mono ? (
                  <i className="mono mono--petit" aria-hidden="true" style={{ fontStyle: "normal" }}>
                    {l.mono}
                  </i>
                ) : null}
                {l.statut ? <PastilleStatut statut={l.statut} retard={l.retard} /> : null}
                <span>
                  {l.libelle}
                  {l.sous ? <small style={{ display: "block", color: "var(--discret)", fontWeight: 400 }}>{l.sous}</small> : null}
                </span>
              </a>
            ) : (
              <div className="gantt__nom" title={l.libelle}>
                {l.mono ? (
                  <i className="mono mono--petit" aria-hidden="true" style={{ fontStyle: "normal" }}>
                    {l.mono}
                  </i>
                ) : null}
                {l.statut ? <PastilleStatut statut={l.statut} retard={l.retard} /> : null}
                <span>
                  {l.libelle}
                  {l.sous ? <small style={{ display: "block", color: "var(--discret)", fontWeight: 400 }}>{l.sous}</small> : null}
                </span>
              </div>
            )}
            <div className="gantt__piste" style={{ width: largeur }}>
              {l.barres
                .filter((b) => b.fin >= debut && b.debut <= fin)
                .map((b, i) => {
                  const d = borne(b.debut);
                  const f = borne(b.fin);
                  const w = (ecartJours(d, f) + 1) * px;
                  const style = { left: x(d), width: w, animationDelay: `${Math.min(n * 30, 600)}ms` };
                  const texte = w > 64 ? b.texte : undefined;
                  return b.lien ? (
                    <a key={i} href={b.lien} className={`gantt__barre ${b.classe}`} style={style} title={b.titre} aria-label={b.titre}>
                      {texte}
                    </a>
                  ) : (
                    <span key={i} className={`gantt__barre ${b.classe}`} style={style} title={b.titre} role="img" aria-label={b.titre}>
                      {texte}
                    </span>
                  );
                })}
              {(l.jalons ?? [])
                .filter((j) => j.date >= debut && j.date <= fin)
                .map((j) => (
                  <span key={j.type + j.date} className={`gantt__jalon gantt__jalon--${j.type}`} style={{ left: x(j.date) + px / 2 }} title={j.titre} role="img" aria-label={j.titre} />
                ))}
            </div>
          </div>
        ))}
        {/* Repères sur toute la hauteur : week-ends, aujourd'hui, fin prévue du projet */}
        {weekends.map((w) => (
          <span key={w} className="gantt__repere gantt__weekend" style={{ left: 260 + w, width: px }} aria-hidden="true" />
        ))}
        {finProjet && finProjet >= debut && finProjet <= fin ? <span className="gantt__repere gantt__fin" style={{ left: 260 + x(finProjet) + px }} aria-hidden="true" /> : null}
        {xAujourdhui !== null ? <span className="gantt__repere gantt__aujourdhui" style={{ left: 260 + xAujourdhui }} aria-hidden="true" /> : null}
      </div>
      {xAujourdhui !== null ? <DefilerVersAujourdhui cible={id} position={xAujourdhui} /> : null}
    </div>
  );
}
