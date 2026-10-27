"use client";

import { useActionState } from "react";
import { ajouterPersonne, enregistrerPersonne, nouveauMotDePasse, type EtatFiche } from "./actions";

type Option = { id: string; nom: string };

const DETAIL = {
  directeur: "Voit les projets et les rapports des membres de sa direction",
  executif: "Voit tous les projets, tâches et rapports ; approuve le rapport au conseil",
  executifVerrouille: "Voit tout. Seul un exécutif peut donner ce rôle",
  administrateur: "Gère les personnes, les équipes et les accès",
};

function Interrupteur({ nom, libelle, detail, coche, desactive }: { nom: string; libelle: string; detail: string; coche: boolean; desactive?: boolean }) {
  return (
    <label className="role-manuel">
      <span className="rangee__texte">
        <span style={{ fontSize: 14, fontWeight: 500 }}>{libelle}</span>
        <span className="rangee__sous">{detail}</span>
      </span>
      <input type="checkbox" role="switch" name={nom} defaultChecked={coche} disabled={desactive} className="interrupteur" />
      {/* Un champ désactivé n'est pas envoyé : on renvoie sa valeur actuelle pour ne pas l'effacer. */}
      {desactive && coche ? <input type="hidden" name={nom} value="on" /> : null}
    </label>
  );
}

function RoleAuto({ libelle, detail }: { libelle: string; detail: string }) {
  return (
    <div className="role-auto">
      <span className="rangee__texte">
        <span style={{ fontSize: 14, fontWeight: 500 }}>{libelle}</span>
        <span className="rangee__sous">{detail}</span>
      </span>
      <span className="etiquette-auto">Automatique</span>
    </div>
  );
}

function ChoixListe({ id, nom, libelle, options, valeur, vide, desactive }: { id: string; nom: string; libelle: string; options: Option[]; valeur: string | null; vide: string; desactive?: boolean }) {
  return (
    <div className="champ">
      <label htmlFor={id}>{libelle}</label>
      <select id={id} name={nom} defaultValue={valeur ?? ""} disabled={desactive}>
        <option value="">{vide}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nom}
          </option>
        ))}
      </select>
    </div>
  );
}

function MotDePasseProvisoire({ valeur }: { valeur: string }) {
  return (
    <div role="status" style={{ padding: "12px 14px", borderLeft: "3px solid #f4b22d", background: "var(--choisi)", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 13 }}>Mot de passe provisoire, à transmettre à la personne (il ne sera plus affiché) :</span>
      <code style={{ fontSize: 18, letterSpacing: "0.04em", userSelect: "all" }}>{valeur}</code>
    </div>
  );
}

export function FichePersonne({
  personne: p,
  equipes,
  personnes,
  modifiable,
  peutDonnerExecutif,
}: {
  personne: {
    id: string;
    nom: string;
    initiales: string;
    poste: string;
    courriel: string;
    equipeId: string | null;
    superieurId: string | null;
    superieurEffectif: string | null;
    superieurVacant: boolean;
    directeur: boolean;
    executif: boolean;
    administrateur: boolean;
    actif: boolean;
    nbRapports: number;
    projetsDiriges: string[];
  };
  equipes: Option[];
  personnes: Option[];
  modifiable: boolean;
  peutDonnerExecutif: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatFiche, FormData>(enregistrerPersonne, { message: null });
  const [etatMdp, actionMdp, enCoursMdp] = useActionState<EtatFiche, FormData>(nouveauMotDePasse, { message: null });
  return (
    <div className="glisse" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span className="mono mono--fort mono--grand" aria-hidden="true">
          {p.initiales}
        </span>
        <div className="rangee__texte">
          <h2 style={{ margin: 0, fontSize: 26, lineHeight: "32px", fontWeight: 200 }}>{p.nom}</h2>
          <span className="rangee__sous" style={{ fontSize: 13 }}>
            {p.courriel}
          </span>
        </div>
      </div>
      <form action={action} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <input type="hidden" name="personneId" value={p.id} />
        {etat.message ? (
          <p className={etat.ok ? "succes" : "erreur"} role={etat.ok ? "status" : "alert"}>
            {etat.message}
          </p>
        ) : null}
        <div className="champ">
          <label htmlFor="poste">Poste</label>
          <input id="poste" name="poste" defaultValue={p.poste} disabled={!modifiable} maxLength={120} />
        </div>
        <ChoixListe id="equipeId" nom="equipeId" libelle="Équipe" options={equipes} valeur={p.equipeId} vide="Sans équipe" desactive={!modifiable} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ChoixListe id="superieurId" nom="superieurId" libelle="Supérieur" options={personnes} valeur={p.superieurId} vide="Responsable de l'équipe" desactive={!modifiable} />
          <span className={p.superieurVacant && !p.superieurId ? "aide" : "aide"} style={{ fontSize: 12, color: "var(--discret)" }}>
            Ses rapports du vendredi vont à : <strong style={{ fontWeight: 500 }}>{p.superieurEffectif ?? "personne"}</strong>
          </span>
        </div>
        <fieldset style={{ margin: 0, padding: 0, border: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <legend style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, display: "flex", justifyContent: "space-between", width: "100%" }}>
            Rôles <span className="rangee__sous">cumulables</span>
          </legend>
          {p.nbRapports ? <RoleAuto libelle="Chef d'équipe" detail={`${p.nbRapports} personne${p.nbRapports > 1 ? "s" : ""} lui envoie${p.nbRapports > 1 ? "nt" : ""} son rapport`} /> : null}
          {p.projetsDiriges.length ? <RoleAuto libelle="Chef de projet" detail={p.projetsDiriges.join(", ")} /> : null}
          <Interrupteur nom="directeur" libelle="Directeur" detail={DETAIL.directeur} coche={p.directeur} desactive={!modifiable} />
          <Interrupteur nom="executif" libelle="Exécutif" detail={peutDonnerExecutif ? DETAIL.executif : DETAIL.executifVerrouille} coche={p.executif} desactive={!modifiable || !peutDonnerExecutif} />
          <Interrupteur nom="administrateur" libelle="Administrateur" detail={DETAIL.administrateur} coche={p.administrateur} desactive={!modifiable} />
          <Interrupteur nom="actif" libelle="Compte actif" detail="Désactiver ferme ses sessions" coche={p.actif} desactive={!modifiable} />
        </fieldset>
        {modifiable ? (
          <button type="submit" className="bouton-ambre bouton-ambre--large" disabled={enCours}>
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        ) : null}
      </form>
      {modifiable ? (
        <form action={actionMdp} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="hidden" name="personneId" value={p.id} />
          {etatMdp.provisoire ? <MotDePasseProvisoire valeur={etatMdp.provisoire} /> : null}
          <button type="submit" className="bouton-contour" style={{ alignSelf: "flex-start" }} disabled={enCoursMdp}>
            Nouveau mot de passe provisoire
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function NouvellePersonne({ equipes, personnes, peutDonnerExecutif }: { equipes: Option[]; personnes: Option[]; peutDonnerExecutif: boolean }) {
  const [etat, action, enCours] = useActionState<EtatFiche, FormData>(ajouterPersonne, { message: null });
  return (
    <div className="glisse" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 26, lineHeight: "32px", fontWeight: 200 }}>Nouvelle personne</h2>
      {etat.provisoire ? <MotDePasseProvisoire valeur={etat.provisoire} /> : null}
      {etat.message ? (
        <p className="erreur" role="alert">
          {etat.message}
        </p>
      ) : null}
      <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="champ" style={{ flex: "1 1 140px" }}>
            <label htmlFor="prenom">Prénom</label>
            <input id="prenom" name="prenom" required maxLength={80} />
          </div>
          <div className="champ" style={{ flex: "1 1 140px" }}>
            <label htmlFor="nom">Nom</label>
            <input id="nom" name="nom" required maxLength={80} />
          </div>
        </div>
        <div className="champ">
          <label htmlFor="courriel">Adresse courriel</label>
          <input id="courriel" name="courriel" type="email" required placeholder="prenom.nom@unibankhaiti.com" />
        </div>
        <div className="champ">
          <label htmlFor="poste">Poste</label>
          <input id="poste" name="poste" maxLength={120} />
        </div>
        <ChoixListe id="equipeId" nom="equipeId" libelle="Équipe" options={equipes} valeur={null} vide="Sans équipe" />
        <ChoixListe id="superieurId" nom="superieurId" libelle="Supérieur" options={personnes} valeur={null} vide="Responsable de l'équipe" />
        <Interrupteur nom="directeur" libelle="Directeur" detail={DETAIL.directeur} coche={false} />
        {peutDonnerExecutif ? <Interrupteur nom="executif" libelle="Exécutif" detail={DETAIL.executif} coche={false} /> : null}
        <Interrupteur nom="administrateur" libelle="Administrateur" detail={DETAIL.administrateur} coche={false} />
        <button type="submit" className="bouton-ambre bouton-ambre--large" disabled={enCours}>
          {enCours ? "Création…" : "Créer"}
        </button>
      </form>
    </div>
  );
}
