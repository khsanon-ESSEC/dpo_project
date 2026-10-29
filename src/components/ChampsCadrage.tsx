import { INFOS_DISPONIBLES, SPECIALISATIONS, TYPES_SOLUTION, type Cadrage } from "@/lib/cadrage";

/**
 * Les cases de la fiche de projet de la DPO : type de solution, informations déjà disponibles, spécialisations
 * impliquées. Le champ caché « cadrage » dit au serveur que ces cases étaient à l'écran (tout décoché = rien).
 */
export function ChampsCadrage({ valeur, id, aide }: { valeur: Cadrage | null; id: string; aide?: string }) {
  const groupes = [
    { nom: "cadrage-type", legende: "Type de solution", options: TYPES_SOLUTION, coches: valeur?.types ?? [] },
    { nom: "cadrage-info", legende: "Informations déjà disponibles", options: INFOS_DISPONIBLES, coches: valeur?.infos ?? [] },
    { nom: "cadrage-specialisation", legende: "Spécialisations DPO impliquées", options: SPECIALISATIONS, coches: valeur?.specialisations ?? [] },
  ];
  return (
    <div className="cadrage" id={id}>
      <input type="hidden" name="cadrage" value="1" />
      {aide ? <p className="aide" style={{ margin: 0 }}>{aide}</p> : null}
      {groupes.map((g) => (
        <fieldset key={g.nom} className="cadrage__groupe">
          <legend className="cadrage__legende">{g.legende}</legend>
          <div className="cadrage__cases">
            {g.options.map((o) => (
              <label key={o.cle} className="cadrage__case">
                <input type="checkbox" name={g.nom} value={o.cle} defaultChecked={(g.coches as string[]).includes(o.cle)} />
                <span>{o.libelle}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
