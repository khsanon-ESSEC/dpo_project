"use client";

import { useActionState, useEffect, useState } from "react";
import { annulerDepuisBarre, executerBarre, type EtatBarre } from "@/app/(app)/barre/actions";
import { analyserMajProjet, texteMajProjet } from "@/lib/barre";
import { analyserMiseAJour } from "@/lib/saisie-rapide";
import { SaisieLigne, type PersonneLigne } from "@/components/SaisieLigne";

/**
 * Mettre à jour une tâche ou un projet en une ligne, depuis sa fiche, comme avec la barre : la tâche ou le projet
 * est déjà choisi. Tâche : « faite », « bloquée attente de la DTI », « vendredi », « 3h », « relancer », « @ » ou
 * « pour Fabienne » pour la confier. Projet (chef de projet) : « à surveiller : retard du prestataire »,
 * « jalon recette 15/11 », « fin prévue 20/12 ». Même action serveur que la barre, avec « Annuler » ensuite.
 * Le formulaire complet reste dessous pour le détail.
 */
export function LigneMiseAJour({
  cible,
  aujourdhui,
  libelle,
  placeholder,
}: {
  cible: { genre: "maj"; tacheId: string; personnes: PersonneLigne[]; moiId: string } | { genre: "projet"; projetId: string };
  aujourdhui: string;
  libelle: string;
  placeholder: string;
}) {
  const [etat, action, enCours] = useActionState<EtatBarre, FormData>(executerBarre, { message: null, n: 0 });
  const [net, setNet] = useState("");
  const [confie, setConfie] = useState(false);
  const [annulable, setAnnulable] = useState(false);
  const [annule, setAnnule] = useState<{ pour: string; ok: boolean; message: string } | null>(null);
  const [cle, setCle] = useState(0);

  // Après une mise à jour réussie, la ligne se vide (et « Annuler » reste proposé vingt secondes) ;
  // après un refus, elle garde ce qui a été écrit.
  useEffect(() => {
    if (!etat.ok) return;
    setCle(etat.n ?? 0);
    setAnnulable(!!etat.annulation);
    setAnnule(null);
    const t = setTimeout(() => setAnnulable(false), 20_000);
    return () => clearTimeout(t);
  }, [etat]);

  const maj = cible.genre === "maj" ? analyserMiseAJour(net, aujourdhui) : null;
  const majProjet = cible.genre === "projet" && net.trim() ? analyserMajProjet(net, aujourdhui) : null;
  const pret = cible.genre === "maj" ? !!maj?.morceaux.length || confie : !!majProjet;
  const annuleIci = annule && annule.pour === etat.annulation ? annule : null;

  const puce = (t: string, classe: string) => (
    <span key={t} className={`saisie-rapide__morceau ${classe}`}>
      {t}
    </span>
  );

  return (
    <form action={action} className="ligne-maj">
      <input type="hidden" name="genre" value={cible.genre} />
      {cible.genre === "maj" ? <input type="hidden" name="tacheId" value={cible.tacheId} /> : <input type="hidden" name="projetId" value={cible.projetId} />}
      <div className="ligne-maj__rangee">
        <SaisieLigne
          key={cle}
          id={`maj-${cible.genre === "maj" ? cible.tacheId : cible.projetId}`}
          libelle={libelle}
          placeholder={placeholder}
          personnes={cible.genre === "maj" ? cible.personnes : undefined}
          moiId={cible.genre === "maj" ? cible.moiId : undefined}
          noms={{ texte: "saisie", personne: cible.genre === "maj" ? "assigneId" : undefined }}
          onValeur={(v) => {
            setNet(v.texte);
            setConfie(!!v.personne);
          }}
          puces={() =>
            cible.genre === "maj"
              ? maj?.morceaux.map((m) => puce(m.texte, m.type === "note" ? "saisie-rapide__morceau--discret" : "saisie-rapide__morceau--echeance"))
              : majProjet
                ? puce(texteMajProjet(majProjet), "saisie-rapide__morceau--echeance")
                : null
          }
        />
        <button type="submit" className="bouton-ambre" disabled={!pret || enCours}>
          {enCours ? "…" : "Mettre à jour"}
        </button>
      </div>
      {etat.message || annuleIci ? (
        <p className={`ligne-maj__message ${annuleIci ? (annuleIci.ok ? "ton-ok" : "ton-retard") : etat.ok ? "ton-ok" : "ton-retard"}`} role={etat.ok ? "status" : "alert"}>
          {annuleIci ? annuleIci.message : etat.message}
          {etat.ok && annulable && etat.annulation && !annuleIci ? (
            <>
              {" "}
              <button
                type="button"
                className="lien-bouton"
                onClick={async () => {
                  const r = await annulerDepuisBarre(etat.annulation!);
                  setAnnule({ pour: etat.annulation!, ok: r.ok, message: r.message });
                  setAnnulable(false);
                }}
              >
                Annuler
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
