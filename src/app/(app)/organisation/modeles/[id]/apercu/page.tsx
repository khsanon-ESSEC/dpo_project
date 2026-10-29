import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/lib/auth/session";
import { modeleDetaille } from "@/lib/donnees/modeles";
import { peutAdministrer } from "@/lib/regles";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ChampRapport, type ContexteRapport } from "@/components/ChampRapport";

export const metadata: Metadata = { title: "Aperçu du modèle" };

/** Le formulaire tel que la personne le verra, sans contenu : ce que chaque champ demande et prépare. */
export default async function PageApercu({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigerUtilisateur();
  if (!peutAdministrer(u)) notFound();
  const d = await modeleDetaille(id);
  if (!d) notFound();
  const version = d.brouillon ?? d.courante;
  const x: ContexteRapport = {
    mode: "apercu",
    rapportId: "",
    lignes: [],
    reponses: [],
    relues: new Set(),
    projets: [],
    personnes: new Map(),
    superieur: null,
    equipe: null,
    niveauTitre: d.champs.some((c) => c.type === "intertitre" || c.type === "mon_travail") ? 3 : 2,
  };
  return (
    <>
      <Bandeau
        surtitre={`Aperçu · version ${version?.numero ?? "—"}${d.brouillon ? " (brouillon)" : ""}`}
        titre={d.modele.nom}
        retour={
          <a href={`/organisation/modeles/${id}`} className="retour">
            <Icone nom="chevron-gauche" taille={18} /> Retour à l&apos;éditeur
          </a>
        }
      >
        <p className="discret" style={{ margin: "8px 0 0", fontSize: 14 }}>
          Ce que la personne voit chaque semaine, dans cet ordre. Le contenu est préparé à partir de ses tâches{d.modele.genre === "chef" ? " et des rapports qu'elle reçoit" : ""}.
        </p>
      </Bandeau>
      <div className="page" style={{ gap: 20 }}>
        {d.champs.map((c) => (
          <ChampRapport key={c.id} c={c} x={x} />
        ))}
      </div>
    </>
  );
}
