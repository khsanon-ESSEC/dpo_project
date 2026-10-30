import { LIBELLE_NIVEAU, heuresTexte, nombre, type Niveau } from "@/lib/charge";

/** « 1 jour d'absence », « 3 jours d'absence ». */
export const joursAbsenceTexte = (n: number) => `${n} jour${n > 1 ? "s" : ""} d'absence`;

/**
 * Jauge d'une semaine : heures prévues sur heures disponibles, colorée selon le niveau. Les jours d'absence
 * (déjà retirés des heures disponibles) sont dits sous la jauge ; une semaine entière d'absence s'écrit « Absence ».
 */
export function Jauge({
  heures,
  capacite,
  niveau,
  lien,
  choisie,
  delai = 0,
  absence = 0,
  jours = 0,
}: {
  heures: number;
  capacite: number;
  niveau: Niveau;
  lien?: string;
  choisie?: boolean;
  delai?: number;
  absence?: number;
  jours?: number;
}) {
  const taux = capacite > 0 ? Math.min(1, heures / capacite) : heures > 0 ? 1 : 0;
  const toute = jours > 0 && absence >= jours;
  const etiquette = toute
    ? `Absence sur tous les jours comptés${heures > 0 ? ` ; ${heuresTexte(heures)} de tâches tombent quand même ici` : ""}`
    : `${heuresTexte(heures)} prévues sur ${heuresTexte(capacite)} disponibles : ${LIBELLE_NIVEAU[niveau].toLowerCase()}${absence ? ` ; ${joursAbsenceTexte(absence)}` : ""}`;
  const contenu = (
    <>
      <span className="jauge__chiffre">
        {toute && heures <= 0 ? (
          "Absence"
        ) : (
          <>
            {heures > 0 ? nombre(heures) : "—"}
            <small> / {nombre(capacite)} h</small>
          </>
        )}
      </span>
      <span className="jauge__piste" aria-hidden="true">
        <span className="jauge__rempli" style={{ width: `${taux * 100}%`, animationDelay: `${delai}ms` }} />
      </span>
      {absence && !(toute && heures <= 0) ? <span className="jauge__absence">{toute ? "Absence" : joursAbsenceTexte(absence)}</span> : null}
    </>
  );
  const classe = `jauge jauge--${niveau}${toute ? " jauge--absence" : ""}${choisie ? " jauge--choisie" : ""}`;
  return lien ? (
    <a href={lien} className={classe} title={etiquette} aria-label={etiquette} aria-current={choisie ? "true" : undefined}>
      {contenu}
    </a>
  ) : (
    <span className={classe} title={etiquette} role="img" aria-label={etiquette}>
      {contenu}
    </span>
  );
}

export function Niveau({ niveau, texte }: { niveau: Niveau; texte?: string }) {
  return (
    <span className={`niveau niveau--${niveau}`}>
      <span className={`point-niveau point-niveau--${niveau}`} aria-hidden="true" />
      {texte ?? LIBELLE_NIVEAU[niveau]}
    </span>
  );
}

export function LegendeCharge() {
  return (
    <div className="legende" aria-label="Légende">
      <Niveau niveau="normale" texte="Jusqu'à 85 % des heures disponibles" />
      <Niveau niveau="chargee" texte="De 85 à 100 %" />
      <Niveau niveau="surchargee" texte="Plus de 100 %" />
    </div>
  );
}
