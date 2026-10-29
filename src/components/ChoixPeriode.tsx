/**
 * Le sélecteur de période, le même sur chaque page qui montre de l'activité : Semaine, Mois, 3 mois, 6 mois,
 * Exercice ; la période d'avant et d'après ; ce à quoi elle est comparée. La période choisie est gardée
 * (préférence du navigateur) pour les autres pages.
 */
import type { ReactNode } from "react";
import { VUES_BILAN, type PlanBilan } from "@/lib/bilan";
import { aLa } from "@/lib/bilan-libelles";
import { dateCourte } from "@/lib/dates";
import { Icone } from "@/components/Icone";
import { MemoriserPeriode } from "@/components/MemoriserPeriode";

export function ChoixPeriode({
  plan,
  noms,
  lien,
  comparer,
  active = true,
  avant,
}: {
  plan: PlanBilan;
  noms: { actuel: string; avantCourt: string };
  lien: (vue: string, param?: string) => string;
  comparer: boolean;
  /** false : une autre vue de la page est choisie (« À venir » de la charge) ; aucune période n'est marquée. */
  active?: boolean;
  /** Choix propres à la page, avant les périodes (« À venir »). */
  avant?: ReactNode;
}) {
  return (
    <div className="ligne-actions bilan-periode">
      <nav className="zoom" aria-label="Période">
        {avant}
        {VUES_BILAN.map((v) => (
          <a key={v.id} href={lien(v.id)} aria-current={active && plan.vue === v.id ? "true" : undefined}>
            {v.libelle}
          </a>
        ))}
      </nav>
      {active ? (
        <nav className="bilan-periode__nav" aria-label="Autre période">
          <a href={lien(plan.vue, plan.avant)} className="bouton-icone" aria-label="Période précédente" title="Période précédente">
            <Icone nom="chevron-gauche" taille={20} />
          </a>
          <span>
            {noms.actuel}
            {comparer ? <span className="ton-discret"> vs {noms.avantCourt}</span> : null}
          </span>
          {plan.apres ? (
            <a href={lien(plan.vue, plan.apres)} className="bouton-icone" aria-label="Période suivante" title="Période suivante">
              <Icone nom="chevron-droite" taille={20} />
            </a>
          ) : null}
          <MemoriserPeriode vue={plan.vue} />
        </nav>
      ) : null}
    </div>
  );
}

/** Ce qu'il faut savoir de la comparaison : pas de données avant, comparaison partielle, période en cours. */
export function NoteComparaison({ plan, noms, etat, debutDonnees }: { plan: PlanBilan; noms: { avantCourt: string }; etat: { pasAvant: boolean; partielle: boolean; comparer: boolean }; debutDonnees: string | null }) {
  if (etat.partielle)
    return (
      <p className="note">
        L&apos;application n&apos;a pas de données avant le {dateCourte(debutDonnees!)} {debutDonnees!.slice(0, 4)} : les totaux ne se comparent pas encore {aLa(noms.avantCourt)} ; ce qui est déjà renseigné est en pointillé.
      </p>
    );
  if (!etat.pasAvant)
    return <p className="note">{debutDonnees ? `L'application n'a pas de données avant le ${dateCourte(debutDonnees)} ${debutDonnees.slice(0, 4)} : rien à comparer pour cette période.` : "L'application n'a pas encore de données."}</p>;
  if (plan.enCours && plan.vue !== "semaine")
    return (
      <p className="note">
        Période en cours : comparée à la même date ({dateCourte(plan.precedent.debut)} – {dateCourte(plan.precedent.fin)} {plan.precedent.fin.slice(0, 4)}), pour que les totaux se comparent.
      </p>
    );
  if (plan.enCours) return <p className="note">La semaine en cours compte jusqu&apos;à aujourd&apos;hui ; la semaine dernière, jusqu&apos;au même jour.</p>;
  return null;
}
