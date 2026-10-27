import type { Metadata } from "next";
import { acces } from "@/lib/acces";
import { exigerUtilisateur } from "@/lib/auth/session";
import { libellesRoles } from "@/lib/regles";
import { seDeconnecter } from "@/app/actions-communes";
import { Bandeau } from "@/components/Bandeau";
import { Icone } from "@/components/Icone";
import { ChoixTheme } from "./ChoixTheme";

export const metadata: Metadata = { title: "Profil" };

export default async function PageProfil() {
  const u = await exigerUtilisateur();
  const a = await acces(u);
  const roles = libellesRoles({ ...u, nbRapports: a.equipeDirecte.length, nbProjetsDiriges: a.projetsDiriges.size });
  const portee = a.toutVoir
    ? "Exécutif : vous voyez tous les projets, toutes les tâches et tous les rapports."
    : a.directeur
      ? "Directeur : vous voyez les projets et les rapports des membres de votre direction."
      : a.equipeDirecte.length
        ? "Vous voyez vos tâches, celles de votre équipe directe et les projets que vous dirigez."
        : "Vous voyez vos tâches et les projets sur lesquels vous travaillez.";
  return (
    <>
      <Bandeau surtitre={u.poste || "Profil"} titre={`${u.prenom} ${u.nom}`}>
        {roles.length ? (
          <p className="discret" style={{ margin: "12px 0 0", fontSize: 13 }}>
            {roles.join(" · ")}
          </p>
        ) : null}
      </Bandeau>
      <div className="page" style={{ maxWidth: 640 }}>
        <section className="carte" aria-labelledby="pr-theme">
          <h2 id="pr-theme" className="carte__titre" style={{ marginBottom: 14 }}>
            Apparence
          </h2>
          <ChoixTheme actuel={u.theme} />
        </section>
        <section className="carte" aria-labelledby="pr-acces" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 id="pr-acces" className="carte__titre" style={{ margin: 0 }}>
            Ce que vous voyez
          </h2>
          <p style={{ margin: 0, fontSize: 14 }}>{portee}</p>
          {u.administrateur ? <p className="note" style={{ margin: 0 }}>Administrateur : vous gérez les personnes, les équipes et les accès.</p> : null}
        </section>
        <section className="carte" aria-labelledby="pr-mdp" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 id="pr-mdp" className="carte__titre" style={{ margin: 0 }}>
            Sécurité
          </h2>
          <a href="/mot-de-passe" className="bouton-contour" style={{ alignSelf: "flex-start" }}>
            <Icone nom="cadenas" taille={16} /> Changer mon mot de passe
          </a>
        </section>
        <form action={seDeconnecter}>
          <button type="submit" className="bouton-contour">
            <Icone nom="deconnexion" taille={16} /> Se déconnecter
          </button>
        </form>
      </div>
    </>
  );
}
