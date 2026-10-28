import "server-only";
import { notFound } from "next/navigation";
import { acces, exigerProjetVisible, peutVoirTache, type Acces } from "@/lib/acces";
import { exigerUtilisateur, type Utilisateur } from "@/lib/auth/session";
import { tachesDuProjet, type TacheDuProjet } from "@/lib/donnees/projets";
import { chargerOrganisation } from "@/lib/organisation";
import { nomComplet } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";

export type Vue = "apercu" | "liste" | "tableau" | "gantt" | "calendrier" | "charge";

const VUES: { id: Vue; libelle: string; icone: string; chemin: string }[] = [
  { id: "apercu", libelle: "Vue d'ensemble", icone: "tableau-de-bord", chemin: "" },
  { id: "liste", libelle: "Liste", icone: "liste", chemin: "/liste" },
  { id: "tableau", libelle: "Tableau", icone: "colonnes", chemin: "/tableau" },
  { id: "gantt", libelle: "Gantt", icone: "gantt", chemin: "/gantt" },
  { id: "calendrier", libelle: "Calendrier", icone: "calendrier", chemin: "/calendrier" },
  { id: "charge", libelle: "Charge", icone: "jauge", chemin: "/charge" },
];

export const cheminVue = (projetId: string, vue: Vue) => `/projets/${projetId}${VUES.find((v) => v.id === vue)!.chemin}`;

/** Onglets des vues d'un projet. Chaque vue est une page à part (application multipage). */
export function OngletsVues({ projetId, vue }: { projetId: string; vue: Vue }) {
  return (
    <nav className="vues" aria-label="Vues du projet">
      {VUES.map((v) => (
        <a key={v.id} href={cheminVue(projetId, v.id)} aria-current={v.id === vue ? "page" : undefined}>
          <Icone nom={v.icone} taille={16} />
          {v.libelle}
        </a>
      ))}
    </nav>
  );
}

export type ContexteVue = {
  u: Utilisateur;
  a: Acces;
  projet: Awaited<ReturnType<typeof exigerProjetVisible>>;
  chefNom: string | null;
  taches: (TacheDuProjet & { ouvrable: boolean })[];
};

/** Contrôle d'accès commun aux vues d'un projet, et tâches du projet. */
export async function chargerVueProjet(id: string): Promise<ContexteVue> {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const projet = await exigerProjetVisible(a, id);
  const org = await chargerOrganisation();
  const chef = projet.chefProjetId ? org.personnes.get(projet.chefProjetId) : null;
  const referent = projet.referentId ? org.personnes.get(projet.referentId) : null;
  const taches = (await tachesDuProjet(id)).map((t) => ({ ...t, ouvrable: peutVoirTache(a, t) }));
  return { u, a, projet, chefNom: chef ? `${nomComplet(chef)}${referent ? ` · référent DPO : ${nomComplet(referent)}` : ""}` : null, taches };
}

/** En-tête des vues autres que la vue d'ensemble. */
export function EnTeteVue({ ctx, vue, children }: { ctx: ContexteVue; vue: Vue; children?: React.ReactNode }) {
  const { projet } = ctx;
  return (
    <>
      <Bandeau
        surtitre={[projet.strategique ? "Stratégique" : "Projet", ctx.chefNom ? `chef de projet : ${ctx.chefNom}` : null].filter(Boolean).join(" · ")}
        titre={projet.titre}
        retour={
          <a href="/projets" className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Projets
          </a>
        }
      >
        {children}
      </Bandeau>
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="ligne-actions">
          <OngletsVues projetId={projet.id} vue={vue} />
          <a href={`/taches/nouvelle?projet=${projet.id}&retour=${encodeURIComponent(cheminVue(projet.id, vue))}`} className="bouton-contour">
            <Icone nom="ajouter" taille={16} /> Nouvelle tâche
          </a>
        </div>
      </div>
    </>
  );
}

export const LIBELLE_STATUT: Record<string, string> = { a_faire: "À faire", en_cours: "En cours", bloquee: "Bloquée", faite: "Faite" };
