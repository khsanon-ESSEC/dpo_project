import { Icone } from "@/components/Icone";
import { dateCourte, dateLocale, dateLongue } from "@/lib/dates";
import { duMois, type AvancementProjet } from "@/lib/donnees/avancement-conseil";
import { ecrireAvancementConseil } from "./actions-conseil";

/**
 * Fiche d'un projet stratégique : l'état d'avancement que son chef écrit pour le rapport mensuel au conseil
 * (29 octobre 2026). Ouvert jusqu'au jour limite (5 jours ouvrables avant le dernier jeudi), puis figé.
 */
export function CarteConseil({ projetId, av, message }: { projetId: string; av: AvancementProjet; message: string | null }) {
  const { cal } = av;
  const etat = av.envoye
    ? "envoye"
    : av.fige
      ? "fige"
      : av.ecrit
        ? "ecrit"
        : "a_ecrire";
  return (
    <section className="carte" id="conseil" aria-labelledby="p-conseil" style={{ scrollMarginTop: 80, display: "flex", flexDirection: "column", gap: 10, borderColor: etat === "a_ecrire" ? "var(--veille-point)" : undefined }}>
      <h2 id="p-conseil" className="carte__titre" style={{ margin: 0 }}>
        Rapport au conseil {duMois(cal.mois)}
      </h2>
      {message ? (
        <p className="succes" role="status" style={{ margin: 0 }}>
          {message}
        </p>
      ) : null}
      <p className="note" style={{ margin: 0 }}>
        {etat === "envoye"
          ? "Le rapport est approuvé : voici l'état d'avancement envoyé au conseil."
          : etat === "fige"
            ? `Figé depuis le ${dateLongue(cal.limiteChefs)} au soir : les exécutifs relisent le rapport, qui part avant le ${dateLongue(cal.dernierJeudi)}.`
            : `L'état d'avancement de ce projet, tel qu'il paraîtra au rapport mensuel. À mettre à jour au plus tard le ${dateLongue(cal.limiteChefs)} (le rapport part avant le ${dateLongue(cal.dernierJeudi)}) : écrivez-le le plus tard possible, pour qu'il dise où en est le projet.`}
      </p>
      {etat === "envoye" ? (
        <p style={{ margin: 0, fontSize: 15, lineHeight: "22px", whiteSpace: "pre-line" }}>{av.envoye}</p>
      ) : av.peutEcrire ? (
        <form action={ecrireAvancementConseil.bind(null, projetId)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="champ">
            <label htmlFor="conseil-texte">État d&apos;avancement</label>
            <textarea id="conseil-texte" name="texte" rows={4} required minLength={10} maxLength={2000} defaultValue={av.ecrit?.texte ?? av.propose} aria-describedby="conseil-aide" />
            <span className="aide" id="conseil-aide">
              {av.ecrit
                ? `Écrit par ${av.ecrit.par ?? "—"} le ${dateCourte(dateLocale(av.ecrit.le))}. Vous pouvez le reprendre jusqu'au jour limite.`
                : "Proposé à partir des livrables et des reports de la fin : corrigez-le, puis enregistrez. Tant que vous ne l'avez pas fait, le rapport garde ce texte automatique."}
            </span>
          </div>
          <button type="submit" className="bouton-contour" style={{ alignSelf: "flex-start" }}>
            <Icone nom="coche" taille={16} /> Enregistrer pour le conseil
          </button>
        </form>
      ) : (
        <p style={{ margin: 0, fontSize: 15, lineHeight: "22px", whiteSpace: "pre-line" }}>{av.ecrit?.texte ?? "Le chef de projet ne l'a pas écrit : le rapport garde le texte automatique."}</p>
      )}
      {av.corrige ? (
        <p className="note ton-veille" style={{ margin: 0 }}>
          Dans le rapport, {av.corrige.par ?? "la direction"} a corrigé ce texte : c&apos;est sa version qui partira. « {av.corrige.texte} »
        </p>
      ) : null}
    </section>
  );
}
