"use client";

import { useActionState } from "react";
import { ListeFiltrable } from "@/components/ListeFiltrable";
import { ajouterPersonne, changerAccesExterne, enregistrerExterne, enregistrerPersonne, fusionnerExterne, nouveauMotDePasse, type EtatFiche } from "./actions";

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

function ChoixListe({ id, nom, libelle, options, valeur, vide, desactive, filtrable }: { id: string; nom: string; libelle: string; options: Option[]; valeur: string | null; vide: string; desactive?: boolean; filtrable?: boolean }) {
  // Une liste qui peut s'allonger (les personnes) : on tape pour trouver.
  if (filtrable)
    return (
      <div className="champ">
        <label htmlFor={id}>{libelle}</label>
        <ListeFiltrable id={id} name={nom} defaultValue={valeur ?? ""} vide={vide} placeholder={`${vide} (tapez un nom)`} options={options.map((o) => ({ value: o.id, label: o.nom }))} disabled={desactive} aucun="Personne ne correspond à" />
      </div>
    );
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
    courriel: string | null;
    equipeId: string | null;
    superieurId: string | null;
    superieurEffectif: string | null;
    superieurVacant: boolean;
    directeur: boolean;
    executif: boolean;
    administrateur: boolean;
    capaciteHeures: number;
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
      <form key={JSON.stringify(p)} action={action} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: "2 1 200px" }}>
            <ChoixListe id="equipeId" nom="equipeId" libelle="Équipe" options={equipes} valeur={p.equipeId} vide="Sans équipe" desactive={!modifiable} />
          </div>
          <div className="champ" style={{ flex: "1 1 120px" }}>
            <label htmlFor="capaciteHeures">Heures par semaine</label>
            <input id="capaciteHeures" name="capaciteHeures" type="number" min={0} max={60} step={1} inputMode="numeric" defaultValue={p.capaciteHeures} disabled={!modifiable} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ChoixListe id="superieurId" nom="superieurId" libelle="Supérieur" filtrable options={personnes} valeur={p.superieurId} vide="Responsable de l'équipe" desactive={!modifiable} />
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
        <ChoixListe id="superieurId" nom="superieurId" libelle="Supérieur" filtrable options={personnes} valeur={null} vide="Responsable de l'équipe" />
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

/**
 * Fiche d'une personne hors division (autre département, consultant) : nom, département ou société,
 * courriel ; accès limité à ouvrir ou à fermer ; fusion avec une autre fiche (doublon).
 */
export function FicheExterne({
  personne: p,
  autres,
  modifiable,
}: {
  personne: { id: string; prenom: string; nom: string; nomComplet: string; initiales: string; organisation: string; poste: string; courriel: string | null; actif: boolean; acces: boolean; nbTaches: number; projets: string[] };
  autres: Option[];
  modifiable: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatFiche, FormData>(enregistrerExterne, { message: null });
  const [etatAcces, actionAcces, enCoursAcces] = useActionState<EtatFiche, FormData>(changerAccesExterne, { message: null });
  const [etatFusion, actionFusion, enCoursFusion] = useActionState<EtatFiche, FormData>(fusionnerExterne, { message: null });
  return (
    <div className="glisse" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span className="mono mono--grand" aria-hidden="true">
          {p.initiales}
        </span>
        <div className="rangee__texte">
          <h2 style={{ margin: 0, fontSize: 26, lineHeight: "32px", fontWeight: 200 }}>{p.nomComplet}</h2>
          <span className="rangee__sous" style={{ fontSize: 13 }}>
            Hors division{p.organisation ? ` · ${p.organisation}` : ""} · {p.acces ? "accès limité ouvert" : "sans accès"}
          </span>
        </div>
      </div>
      <p className="note" style={{ margin: 0 }}>
        {p.nbTaches ? `${p.nbTaches} tâche${p.nbTaches > 1 ? "s" : ""} ouverte${p.nbTaches > 1 ? "s" : ""}` : "Aucune tâche ouverte"}
        {p.projets.length ? ` · équipe de ${p.projets.join(", ")}` : ""}. Sans équipe ni supérieur ici : ni rapport du vendredi, ni charge, ni bilan.
      </p>
      <form key={JSON.stringify(p)} action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <input type="hidden" name="personneId" value={p.id} />
        {etat.message ? (
          <p className={etat.ok ? "succes" : "erreur"} role={etat.ok ? "status" : "alert"}>
            {etat.message}
          </p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div className="champ" style={{ flex: "1 1 140px" }}>
            <label htmlFor="ex-prenom">Prénom</label>
            <input id="ex-prenom" name="prenom" defaultValue={p.prenom} required maxLength={80} disabled={!modifiable} />
          </div>
          <div className="champ" style={{ flex: "1 1 160px" }}>
            <label htmlFor="ex-nom">Nom</label>
            <input id="ex-nom" name="nom" defaultValue={p.nom} maxLength={120} disabled={!modifiable} />
          </div>
        </div>
        <div className="champ">
          <label htmlFor="ex-organisation">Département ou société</label>
          <input id="ex-organisation" name="organisation" defaultValue={p.organisation} maxLength={120} disabled={!modifiable} placeholder="Ex. : DTI, Cabinet Atlas" />
        </div>
        <div className="champ">
          <label htmlFor="ex-poste">Fonction (facultatif)</label>
          <input id="ex-poste" name="poste" defaultValue={p.poste} maxLength={120} disabled={!modifiable} placeholder="Ex. : consultante sécurité" />
        </div>
        <div className="champ">
          <label htmlFor="ex-courriel">Adresse courriel (facultatif, nécessaire pour un accès)</label>
          <input id="ex-courriel" name="courriel" type="email" defaultValue={p.courriel ?? ""} maxLength={200} disabled={!modifiable} />
        </div>
        <Interrupteur nom="actif" libelle="Active" detail="Désactivée, elle ne se choisit plus ; ce qu'elle a fait reste" coche={p.actif} desactive={!modifiable} />
        {modifiable ? (
          <button type="submit" className="bouton-ambre" disabled={enCours} style={{ alignSelf: "flex-start" }}>
            Enregistrer
          </button>
        ) : null}
      </form>
      {modifiable ? (
        <form action={actionAcces} style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 20, borderTop: "1px solid var(--filet)" }}>
          <input type="hidden" name="personneId" value={p.id} />
          <input type="hidden" name="ouvrir" value={p.acces ? "" : "1"} />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Accès à l&apos;application</h3>
          <p className="note" style={{ margin: 0 }}>
            {p.acces
              ? "Elle se connecte et voit seulement ses tâches et les projets dont elle fait partie."
              : "Sans accès, la personne qui lui confie une tâche la met à jour pour elle. Un accès limité lui montre seulement ses tâches et ses projets."}
          </p>
          {etatAcces.message ? (
            <p className={etatAcces.ok ? "succes" : "erreur"} role={etatAcces.ok ? "status" : "alert"}>
              {etatAcces.message}
            </p>
          ) : null}
          {etatAcces.provisoire ? <MotDePasseProvisoire valeur={etatAcces.provisoire} /> : null}
          <button type="submit" className="bouton-contour" disabled={enCoursAcces} style={{ alignSelf: "flex-start" }}>
            {p.acces ? "Fermer l'accès" : "Ouvrir un accès limité"}
          </button>
        </form>
      ) : null}
      {modifiable && autres.length ? (
        <form action={actionFusion} style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 20, borderTop: "1px solid var(--filet)" }}>
          <input type="hidden" name="personneId" value={p.id} />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Doublon</h3>
          {etatFusion.message ? (
            <p className={etatFusion.ok ? "succes" : "erreur"} role={etatFusion.ok ? "status" : "alert"}>
              {etatFusion.message}
            </p>
          ) : null}
          <ChoixListe id="ex-cible" nom="cibleId" libelle="C'est la même personne que" options={autres} valeur={null} vide="Choisir la fiche à garder" />
          <span className="aide">Ses tâches, ses équipes projet et ses réunions passent sur la fiche gardée ; celle-ci disparaît.</span>
          <label className="confirmer">
            <input type="checkbox" name="confirme" required /> Oui, fusionner
          </label>
          <button type="submit" className="bouton-contour" disabled={enCoursFusion} style={{ alignSelf: "flex-start" }}>
            Fusionner les deux fiches
          </button>
        </form>
      ) : null}
    </div>
  );
}
