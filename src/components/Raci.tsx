import { LETTRES, LIBELLE_LETTRE, type Lettre, type Raci } from "@/lib/raci";

/**
 * Un RACI en lecture : les rôles en colonnes (avec, dessous, les noms des personnes du projet quand on les connaît),
 * les activités en lignes, une lettre par case. La légende dit ce que veut dire chaque lettre.
 */
export function TableauRaci({ raci, noms, legende = true }: { raci: Raci; noms?: string[]; legende?: boolean }) {
  return (
    <div className="raci-cadre">
      <div className="defile-x">
        <table className="raci">
          <thead>
            <tr>
              <th scope="col" className="raci__activite">
                Activité / livrable
              </th>
              {raci.colonnes.map((c, i) => (
                <th key={i} scope="col">
                  <span className="raci__role">{c.libelle}</span>
                  {noms?.[i] ? <span className="raci__noms">{noms[i]}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {raci.lignes.map((l) => (
              <tr key={l.activite}>
                <th scope="row" className="raci__activite">
                  {l.activite}
                </th>
                {raci.colonnes.map((c, i) => {
                  const x = l.lettres[i] as Lettre | "";
                  return (
                    <td key={i} className={x ? `raci__case raci__case--${x}` : "raci__case"}>
                      {x ? <abbr title={LIBELLE_LETTRE[x]}>{x}</abbr> : <span className="visuellement-cache">rien</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {legende ? <p className="raci__legende">{LETTRES.map((x) => `${x} = ${LIBELLE_LETTRE[x].toLowerCase()}`).join(" · ")}</p> : null}
    </div>
  );
}
