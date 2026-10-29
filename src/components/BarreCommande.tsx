"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { annulerDepuisBarre, executerBarre, type EtatBarre } from "@/app/(app)/barre/actions";
import { analyserMajProjet, analyserNote, genreDe, LIBELLES_NOTE, projetEnTete, reconnaitreMots, texteMajProjet, type Genre } from "@/lib/barre";
import { phraseOccupe, type Disponibilite } from "@/lib/creneaux";
import { analyserMiseAJour, analyserReunion, analyserSaisie, LIBELLES_STATUT, type ProjetSaisie, type StatutTache } from "@/lib/saisie-rapide";
import { dateCourte } from "@/lib/dates";
import { cleNom } from "@/lib/projets";
import { Icone } from "@/components/Icone";
import { CLE_PROJETS_RECENTS } from "@/components/Consultation";

export type PersonneBarre = { id: string; nom: string; externe?: boolean; organisation?: string };
export type TacheBarre = { id: string; titre: string; code: string | null; echeance: string | null; projetId: string | null; statut: StatutTache; pour: string | null };
export type ReunionBarre = { id: string; titre: string; heure: string | null; semaine: string; mienne: boolean };

type Choix = { id: string; libelle: string; sous?: string; code?: string | null };
type Liste = { type: "projet" | "personne" | "tache"; debut: number; requete: string };
type Groupe<T> = { liste: T[]; total: number };
type Resultats = {
  ecrans: Groupe<{ lien: string; texte: string; code: string | null; sous: string }>;
  projets: Groupe<{ id: string; code: string; texte: string; sous: string }>;
  taches: Groupe<{ id: string; texte: string; code: string | null; sous: string }>;
  personnes: Groupe<{ id: string; texte: string; sous: string }>;
} | null;
type Reponse = { titre: string; lignes: { texte: string; sous?: string; code?: string | null; lien: string }[]; total: number; vide?: string; incomprise?: boolean } | null;
type Ligne = { cle: string; libelle: string; sous?: string; code?: string | null; action?: () => void; titre?: boolean };

const aller = (lien: string) => (window.location.href = lien);

/**
 * Une seule barre, comme dans Notion. On écrit, l'application comprend :
 * - une tâche (« Relire maquettes /unib @fab vendredi 2h », ou « … pour Fabienne projet Unibank … ») ;
 * - « # » une tâche, puis ce qui change (« faite », « bloquée … », une date, « relancer », « @ » pour la confier) ;
 * - « Réunion … » (participants avec « @ » ou « avec Fabienne et Daphnée »), en vérifiant qui est déjà pris ;
 * - « Décision : … », « Risque : … », « Fait marquant : … » vont dans le rapport du vendredi ;
 * - « /UR à surveiller : … », « /UR jalon validation métier 15/11 » mettent le projet à jour (chef de projet) ;
 * - une question (« en retard sur UR ? ») répond tout de suite ;
 * - en mode recherche : projets, tâches, personnes et écrans (« Gantt UR », « charge de Myriam ») ;
 * - la barre vide propose ce qui compte aujourd'hui ; « Annuler » suit chaque action.
 */
export function BarreCommande({
  mode,
  projets,
  personnes,
  base,
  parProjet,
  taches,
  participants = [],
  reunionsDuJour = [],
  moiId,
  aujourdhui,
  retour,
  initial = "",
  focus = mode === "recherche",
  idChamp,
}: {
  mode: "tache" | "recherche";
  projets: ProjetSaisie[];
  personnes: PersonneBarre[];
  base: string[];
  parProjet: Record<string, string[]>;
  taches: TacheBarre[];
  /** « Réunion … » puis « @ » : les personnes qu'on peut inviter. */
  participants?: PersonneBarre[];
  reunionsDuJour?: ReunionBarre[];
  moiId: string;
  aujourdhui: string;
  retour: string;
  initial?: string;
  /** Curseur dans la barre à l'ouverture de la page (pas sur le menu du téléphone : le clavier s'ouvrirait). */
  focus?: boolean;
  /** Identifiant stable du champ (la touche « / » y met le curseur depuis n'importe quelle page). */
  idChamp?: string;
}) {
  const [etat, action, enCours] = useActionState<EtatBarre, FormData>(executerBarre, { message: null, n: 0 });
  const [texte, setTexte] = useState(initial);
  const [tache, setTache] = useState<TacheBarre | null>(null);
  const [projet, setProjet] = useState<ProjetSaisie | null>(null);
  const [personne, setPersonne] = useState<PersonneBarre | null>(null);
  const [invites, setInvites] = useState<PersonneBarre[]>([]);
  const [liste, setListe] = useState<Liste | null>(null);
  const [surligne, setSurligne] = useState(-1);
  const [resultats, setResultats] = useState<Resultats>(null);
  const [reponse, setReponse] = useState<Reponse>(null);
  const [occupes, setOccupes] = useState<Disponibilite[]>([]);
  const [vide, setVide] = useState(false);
  // La liste ne s'ouvre que pendant qu'on est dans la barre : une barre préremplie (page Rechercher) reste fermée.
  const [actif, setActif] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [vu, setVu] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annule, setAnnule] = useState<{ pour: string; ok: boolean; message: string } | null>(null);
  const [annulable, setAnnulable] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const formulaire = useRef<HTMLFormElement>(null);
  const idListe = useId();

  // Refus du serveur : affiché jusqu'à la prochaine frappe.
  useEffect(() => {
    if (etat.message && !etat.ok) setErreur(etat.message);
  }, [etat]);
  // Après une action réussie : tout se vide, et « Annuler » reste proposé vingt secondes.
  if (etat.ok && etat.n !== vu) {
    setVu(etat.n ?? 0);
    setTexte("");
    setProjet(null);
    setPersonne(null);
    setTache(null);
    setInvites([]);
    setListe(null);
    setResultats(null);
    setReponse(null);
    setOccupes([]);
    setAnnule(null);
    setAnnulable(!!etat.annulation);
  }
  useEffect(() => {
    if (!annulable) return;
    const t = setTimeout(() => setAnnulable(false), 20_000);
    return () => clearTimeout(t);
  }, [annulable, etat.n]);

  // ---------- De quoi parle la ligne ----------
  let genre: Genre | "maj" = tache ? "maj" : texte.trim() ? genreDe(texte, { projetChoisi: !!projet, projets, aujourdhui }) : "tache";
  const motsProjet = !tache && genre === "tache" && !projet ? reconnaitreMots(texte, { personnes: [], projets }) : null;
  if (motsProjet?.projet && analyserMajProjet(motsProjet.texte, aujourdhui)) genre = "projet";
  const reunion = genre === "reunion";
  // Des mots à la place des touches : « pour Fabienne », « projet Unibank », « avec Fabienne et Daphnée ».
  const mots =
    genre === "tache" || genre === "maj" || genre === "reunion" || genre === "note"
      ? reconnaitreMots(texte, { personnes: reunion ? participants : genre === "note" ? [] : personnes, projets, reunion, moiId })
      : null;
  const net = mots ? mots.texte : texte;
  const analyse = genre === "tache" && net.trim() ? analyserSaisie(net, aujourdhui, projets) : null;
  const maj = genre === "maj" ? analyserMiseAJour(net, aujourdhui) : null;
  const analyseReunion = reunion ? analyserReunion(net, aujourdhui, projets) : null;
  const note = genre === "note" ? analyserNote(net, projets) : null;
  const enTete = genre === "projet" && !projet ? projetEnTete(texte, projets, aujourdhui) : null;
  const projetMaj = genre === "projet" ? (projet ?? enTete?.projet ?? motsProjet?.projet ?? null) : null;
  const majProjet = genre === "projet" ? analyserMajProjet(enTete ? enTete.reste : motsProjet?.projet && !projet ? motsProjet.texte : texte, aujourdhui) : null;
  const question = genre === "question";

  const personneEff = personne ?? mots?.personne ?? null;
  const invitesEff = [...invites, ...(mots?.invites ?? []).filter((p) => !invites.some((i) => i.id === p.id))];
  const projetEff = projet ?? mots?.projet ?? analyse?.projet ?? analyseReunion?.projet ?? note?.projet ?? projetMaj ?? null;
  const rienAChanger = !!maj && !maj.morceaux.length && !projet && !personneEff;
  const projetEffectifId = projetEff?.id ?? (tache ? tache.projetId : null);

  // Personnes qu'on peut choisir pour une tâche : soi, celles qu'on suit, l'équipe des projets qu'on dirige ;
  // hors division seulement sur un projet qu'on dirige (mêmes règles que le formulaire complet).
  const permis = new Set([...base, ...(projetEffectifId ? (parProjet[projetEffectifId] ?? []) : [])]);
  const externesPermis = !!projetEffectifId && projetEffectifId in parProjet;
  const personnesPermises = personnes.filter((p) => (p.externe ? externesPermis : permis.has(p.id)));
  useEffect(() => {
    if (personne && !personnesPermises.some((p) => p.id === personne.id)) setPersonne(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetEffectifId]);

  // Peut-on envoyer ?
  const pret =
    genre === "maj"
      ? true
      : genre === "reunion"
        ? !!analyseReunion?.titre
        : genre === "note"
          ? !!note?.texte
          : genre === "projet"
            ? !!projetMaj && !!majProjet
            : genre === "question"
              ? false
              : !!analyse?.titre;

  // Une phrase qui est clairement une action (réunion, note, question, mise à jour, ou une tâche avec un projet,
  // une personne, une date ou une durée) s'exécute avec Entrée ; sinon, Entrée cherche, et la liste propose
  // « Ajouter la tâche » en première ligne.
  const agir =
    mode === "tache" || !!tache || genre !== "tache" || !!projet || !!personneEff || (!!analyse?.titre && (analyse.morceaux.length > 0 || !!mots?.projet));

  // ---------- Listes « / », « @ », « # » ----------
  const choix: Choix[] = !liste
    ? []
    : liste.type === "tache"
      ? taches
          .filter((t) => !liste.requete || cleNom(`${t.code ?? ""} ${t.titre}`).includes(cleNom(liste.requete)))
          .slice(0, 8)
          .map((t) => ({ id: t.id, libelle: t.titre, sous: [t.pour ? `Pour ${t.pour}` : null, LIBELLES_STATUT[t.statut], t.echeance ? dateCourte(t.echeance) : null].filter(Boolean).join(" · "), code: t.code }))
      : liste.type === "projet"
        ? projets
            .filter((p) => !liste.requete || cleNom(`${p.code} ${p.titre}`).includes(cleNom(liste.requete)))
            .slice(0, 8)
            .map((p) => ({ id: p.id, libelle: p.titre, sous: p.code }))
        : reunion
          ? participants
              .filter((p) => !invitesEff.some((i) => i.id === p.id) && (!liste.requete || cleNom(`${p.nom} ${p.organisation ?? ""}`).includes(cleNom(liste.requete))))
              .slice(0, 8)
              .map((p) => ({ id: p.id, libelle: p.nom, sous: p.externe ? ["Hors division", p.organisation].filter(Boolean).join(" · ") : p.organisation || undefined }))
          : personnesPermises
              .filter((p) => !liste.requete || cleNom(`${p.nom} ${p.organisation ?? ""}`).includes(cleNom(liste.requete)))
              .slice(0, 8)
              .map((p) => ({ id: p.id, libelle: p.id === moiId ? "Moi" : p.nom, sous: p.externe ? ["Hors division", p.organisation].filter(Boolean).join(" · ") : undefined }));

  // ---------- Recherche en direct (mode recherche) ----------
  useEffect(() => {
    if (!actif || mode !== "recherche" || liste || tache || genre !== "tache" || cleNom(texte).length < 2) {
      setResultats(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/recherche?q=${encodeURIComponent(texte)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setResultats(j))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [texte, mode, liste, tache, genre, actif]);

  // ---------- Question : la réponse s'affiche pendant qu'on écrit ----------
  useEffect(() => {
    if (!question) {
      setReponse(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/question?q=${encodeURIComponent(texte)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setReponse(j))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [texte, question]);

  // ---------- Réunion : qui est déjà pris à ce créneau ? ----------
  const cleCreneau = analyseReunion?.heure ? `${analyseReunion.jour}|${analyseReunion.heure}|${analyseReunion.dureeMinutes}|${invitesEff.map((p) => p.id).join(",")}` : "";
  useEffect(() => {
    if (!cleCreneau) {
      setOccupes([]);
      return;
    }
    const [jour, heure, duree, ids] = cleCreneau.split("|");
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/disponibilites?jour=${jour}&heure=${heure}&duree=${duree}&ids=${ids}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setOccupes(Array.isArray(d) ? d : []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [cleCreneau]);

  /** Repère « /… », « @… » ou « #… » juste avant le curseur (au début ou après une espace). */
  const reperer = (valeur: string, curseur: number) => {
    const avant = valeur.slice(0, curseur);
    const m = /(^|\s)([/@#])([^/@#]{0,40})$/.exec(avant);
    if (!m) return setListe(null);
    const g = genreDe(valeur, { projetChoisi: !!projet, projets, aujourdhui });
    // Dans une réunion ou une note, « # » (une tâche) n'a pas de sens ; dans une question, aucune liste.
    if ((m[2] === "#" && (g === "reunion" || g === "note")) || g === "question") return setListe(null);
    const requete = m[3];
    const type = m[2] === "/" ? "projet" : m[2] === "#" ? "tache" : "personne";
    setListe({ type, debut: avant.length - requete.length - 1, requete });
    setSurligne(0);
  };

  const choisir = (c: Choix) => {
    if (!liste) return;
    const curseur = champ.current?.selectionStart ?? texte.length;
    let nouveau = `${texte.slice(0, liste.debut)}${texte.slice(curseur)}`.replace(/\s{2,}/g, " ");
    if (liste.type === "tache") {
      setTache(taches.find((t) => t.id === c.id) ?? null);
      setProjet(null);
      setPersonne(null);
      nouveau = nouveau.trim() ? `${nouveau.trim()} ` : "";
    } else if (liste.type === "projet") setProjet(projets.find((p) => p.id === c.id) ?? null);
    else if (reunion) {
      const p = participants.find((x) => x.id === c.id);
      if (p) setInvites([...invites, p]);
    } else setPersonne(personnes.find((p) => p.id === c.id) ?? null);
    setTexte(nouveau);
    setListe(null);
    const position = liste.type === "tache" ? nouveau.length : liste.debut;
    requestAnimationFrame(() => {
      champ.current?.focus();
      champ.current?.setSelectionRange(position, position);
    });
  };

  const choisirTache = (t: TacheBarre) => {
    setTache(t);
    setProjet(null);
    setPersonne(null);
    setTexte("");
    setVide(false);
    requestAnimationFrame(() => champ.current?.focus());
  };

  const envoyer = () => {
    if (tache && rienAChanger) return aller(`/taches/${tache.id}?retour=${encodeURIComponent(retour)}`);
    if (pret) formulaire.current?.requestSubmit();
  };
  const chercher = () => {
    if (texte.trim()) aller(`/recherche?q=${encodeURIComponent(texte.trim())}`);
  };
  const annuler = async () => {
    if (!etat.annulation) return;
    const r = await annulerDepuisBarre(etat.annulation);
    setAnnule({ pour: etat.annulation, ok: r.ok, message: r.message });
    setAnnulable(false);
  };

  // ---------- Barre vide : ce qui compte aujourd'hui ----------
  useEffect(() => {
    try {
      setRecents(JSON.parse(localStorage.getItem(CLE_PROJETS_RECENTS) ?? "[]"));
    } catch {
      setRecents([]);
    }
  }, [vide]);
  const suggestions: Ligne[] =
    vide && !texte && !tache && !projet && !personne && !invites.length
      ? (() => {
          const miennes = taches.filter((t) => !t.pour && t.echeance);
          const retard = miennes.filter((t) => t.echeance! < aujourdhui && t.statut !== "bloquee");
          const jour = miennes.filter((t) => t.echeance === aujourdhui);
          const l: Ligne[] = [
            ...retard.slice(0, 4).map((t) => ({ cle: `r-${t.id}`, libelle: t.titre, sous: `En retard · ${dateCourte(t.echeance)} · à mettre à jour`, code: t.code, action: () => choisirTache(t) })),
            ...jour.slice(0, 4).map((t) => ({ cle: `j-${t.id}`, libelle: t.titre, sous: "Pour aujourd'hui · à mettre à jour", code: t.code, action: () => choisirTache(t) })),
            ...reunionsDuJour.slice(0, 3).map((r) => ({
              cle: `m-${r.id}`,
              libelle: r.titre,
              sous: `Réunion d'aujourd'hui${r.heure ? ` à ${r.heure.slice(0, 5).replace(":", " h ")}` : ""} · ${r.mienne ? "compléter (notes, actions)" : "voir"}`,
              code: "RÉU",
              action: () => aller(`/reunions?semaine=${r.semaine}${r.mienne ? `&modifier=${r.id}#noter` : ""}`),
            })),
            ...recents
              .map((id) => projets.find((p) => p.id === id))
              .filter((p): p is ProjetSaisie => !!p)
              .slice(0, 3)
              .map((p) => ({ cle: `p-${p.id}`, libelle: p.titre, sous: "Projet ouvert récemment", code: p.code, action: () => aller(`/projets/${p.id}`) })),
          ];
          return [
            ...(l.length ? l : [{ cle: "rien", libelle: "Rien d'urgent aujourd'hui", titre: true }]),
            { cle: "aide", libelle: "Écrivez une tâche, « Réunion … », « Décision : … » ou une question ?", sous: "/ un projet · @ une personne · # une tâche à mettre à jour · sinon, Entrée cherche", titre: true },
            { cle: "formulaire", libelle: "Nouvelle tâche (formulaire complet)", code: "+", action: () => aller(`/taches/nouvelle?retour=${encodeURIComponent(retour)}`) },
          ];
        })()
      : [];

  // ---------- Lignes de la liste déroulante (hors « / », « @ », « # ») ----------
  const lignes: Ligne[] = suggestions.length
    ? suggestions
    : question && reponse
      ? [
          { cle: "titre", libelle: `${reponse.titre}${reponse.total ? ` · ${reponse.total}` : ""}`, titre: true },
          ...(reponse.lignes.length ? reponse.lignes.slice(0, 12).map((x, i) => ({ cle: `q-${i}`, libelle: x.texte, sous: x.sous, code: x.code, action: () => aller(x.lien) })) : [{ cle: "vide", libelle: reponse.vide ?? "Rien.", titre: true }]),
          ...(reponse.total > 12 ? [{ cle: "plus", libelle: `… et ${reponse.total - 12} autres : précisez la question (un projet, une personne)`, titre: true }] : []),
        ]
      : mode === "recherche" && !liste && !tache && texte.trim() && genre !== "question"
        ? [
            ...(pret && genre !== "tache"
              ? [
                  {
                    cle: "ajouter",
                    libelle: genre === "reunion" ? `Noter la réunion « ${analyseReunion!.titre} »` : genre === "note" ? `Ajouter au rapport : « ${note!.texte} »` : `${projetMaj!.code} · ${texteMajProjet(majProjet!)}`,
                    sous: genre === "reunion" ? analyseReunion!.morceaux.filter((m) => m.type !== "projet").map((m) => m.texte).join(" · ") : genre === "note" ? LIBELLES_NOTE[note!.rubrique] : "Mettre le projet à jour",
                    code: "+",
                    action: envoyer,
                  },
                ]
              : []),
            ...(analyse?.titre ? [{ cle: "ajouter", libelle: `Ajouter la tâche « ${analyse.titre} »`, sous: "pour vous ; « pour Fabienne », « projet … » ou @ et /", code: "+", action: envoyer }] : []),
            ...(resultats?.ecrans.liste ?? []).map((e) => ({ cle: `e-${e.lien}`, libelle: e.texte, sous: e.sous, code: e.code ?? "→", action: () => aller(e.lien) })),
            ...(resultats?.projets.liste ?? []).map((p) => ({ cle: `p-${p.id}`, libelle: p.texte, sous: p.sous || "Projet", code: p.code, action: () => aller(`/projets/${p.id}`) })),
            ...(resultats?.taches.liste ?? []).map((t) => ({ cle: `t-${t.id}`, libelle: t.texte, sous: t.sous || "Tâche", code: t.code, action: () => aller(`/taches/${t.id}`) })),
            ...(resultats?.personnes.liste ?? []).map((p) => ({ cle: `n-${p.id}`, libelle: p.texte, sous: p.sous || "Personne", code: null, action: () => aller(`/personnes/${p.id}`) })),
            ...(genre === "tache" ? [{ cle: "tout", libelle: `Tous les résultats pour « ${texte.trim()} »`, code: null, action: chercher }] : []),
          ]
        : [];
  const actives = liste ? choix.map((_, i) => i) : lignes.map((l, i) => (l.action ? i : -1)).filter((i) => i >= 0);
  const ouvert = actif && (liste ? choix.length > 0 : lignes.length > 0);

  const clavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (liste) setListe(null);
      else {
        setVide(false);
        setSurligne(-1);
        setActif(false);
      }
      return;
    }
    // Retour arrière dans une barre vide : la dernière étiquette s'en va.
    if (e.key === "Backspace" && !texte && (tache || personne || projet || invites.length)) {
      e.preventDefault();
      if (invites.length) setInvites(invites.slice(0, -1));
      else if (personne) setPersonne(null);
      else if (projet) setProjet(null);
      else setTache(null);
      return;
    }
    if (ouvert && (e.key === "ArrowDown" || e.key === "ArrowUp") && actives.length) {
      e.preventDefault();
      const pos = actives.indexOf(surligne);
      const suivant = e.key === "ArrowDown" ? actives[(pos + 1) % actives.length] : actives[(pos - 1 + actives.length) % actives.length];
      setSurligne(suivant);
      return;
    }
    if (liste && (e.key === "Enter" || e.key === "Tab") && choix.length) {
      e.preventDefault();
      choisir(choix[Math.max(0, surligne)]);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (surligne >= 0 && lignes[surligne]?.action) return lignes[surligne].action!();
      if (question) return;
      if (agir) return envoyer();
      return chercher();
    }
  };

  const puce = (t: string, retirer: (() => void) | null, classe = "") => (
    <span className={`saisie-rapide__morceau ${classe}`}>
      {t}
      {retirer ? (
        <button type="button" className="puce__retirer" onClick={retirer} aria-label={`Retirer ${t}`}>
          ×
        </button>
      ) : null}
    </span>
  );
  const puceProjet = (p: ProjetSaisie | null, retirable: boolean) =>
    p ? puce(`${p.code} · ${p.titre}`, retirable ? () => setProjet(null) : null, "saisie-rapide__morceau--projet") : puce("Hors projet", null, "saisie-rapide__morceau--discret");

  const bouton = enCours
    ? "…"
    : tache
      ? rienAChanger
        ? "Ouvrir"
        : "Mettre à jour"
      : question
        ? "Demander"
        : genre === "reunion"
          ? "Noter"
          : genre === "note"
            ? "Ajouter au rapport"
            : genre === "projet"
              ? "Mettre à jour"
              : agir
                ? "Ajouter"
                : "Chercher";
  const annuleIci = annule && etat.annulation && annule.pour === etat.annulation ? annule : null;
  const icone = question ? "loupe" : reunion ? "reunion" : genre === "note" ? "document" : mode === "recherche" ? "loupe" : "ajouter";

  return (
    <form ref={formulaire} action={action} className="saisie-rapide" role={mode === "recherche" ? "search" : undefined} onSubmit={(e) => !(tache ? !rienAChanger : pret) && e.preventDefault()}>
      <label htmlFor={idChamp ?? `${idListe}-champ`} className="visuellement-cache">
        {tache ? `Mettre à jour la tâche « ${tache.titre} »` : "Écrire une tâche, une réunion, une note pour le rapport, ou une question"}
      </label>
      <div className="commande">
        <div className="saisie-rapide__ligne">
          {tache ? (
            <button type="button" className="saisie-rapide__tache" onClick={() => setTache(null)} title="Retirer la tâche choisie" aria-label={`Retirer la tâche « ${tache.titre} »`}>
              <span className="mono">{tache.code ?? "#"}</span>
              <span className="saisie-rapide__tache-titre">{tache.titre}</span>
              <span aria-hidden="true">×</span>
            </button>
          ) : (
            <Icone nom={icone} taille={18} />
          )}
          <input
            ref={champ}
            id={idChamp ?? `${idListe}-champ`}
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value);
              setErreur(null);
              setAnnulable(false);
              setSurligne(-1);
              setVide(!e.target.value);
              setActif(true);
              reperer(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onFocus={() => {
              setVide(true);
              setActif(true);
            }}
            onKeyDown={clavier}
            onBlur={() =>
              setTimeout(() => {
                setListe(null);
                setVide(false);
                setActif(false);
              }, 150)
            }
            maxLength={300}
            autoComplete="off"
            autoFocus={focus}
            enterKeyHint={question || !agir ? "search" : "done"}
            placeholder={
              tache
                ? "faite · en cours · bloquée … · une date · relancer · @ confier"
                : mode === "recherche"
                  ? "Chercher ou ajouter : une tâche, « Réunion … », « Décision : … », une question ?"
                  : "Une tâche, « Réunion … », « Décision : … » ou une question ?"
            }
            role="combobox"
            aria-expanded={ouvert}
            aria-controls={`${idListe}-liste`}
            aria-autocomplete="list"
            aria-activedescendant={ouvert && surligne >= 0 ? `${idListe}-o${surligne}` : undefined}
          />
          <button
            type="button"
            className="bouton-ambre"
            disabled={enCours || (tache ? false : question ? !texte.trim() : genre !== "tache" ? !pret : mode === "tache" ? !analyse?.titre : !texte.trim())}
            onClick={() => (question ? champ.current?.focus() : agir ? envoyer() : chercher())}
          >
            {bouton}
          </button>
        </div>
        {ouvert ? (
          <ul
            id={`${idListe}-liste`}
            role="listbox"
            className="commande__liste"
            aria-label={liste ? (liste.type === "projet" ? "Projets" : liste.type === "tache" ? "Tâches" : reunion ? "Participants" : "Personnes") : question ? "Réponse" : suggestions.length ? "Suggestions" : "Résultats"}
          >
            {liste
              ? choix.map((c, i) => (
                  <li
                    key={c.id}
                    id={`${idListe}-o${i}`}
                    role="option"
                    aria-selected={i === surligne}
                    className="commande__option"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choisir(c);
                    }}
                  >
                    {liste.type === "projet" ? <span className="mono">{c.sous}</span> : liste.type === "tache" ? <span className="mono">{c.code ?? "—"}</span> : null}
                    <span className="commande__texte">
                      <span className="commande__libelle">{c.libelle}</span>
                      {liste.type !== "projet" && c.sous ? <span className="commande__sous">{c.sous}</span> : null}
                    </span>
                  </li>
                ))
              : lignes.map((l, i) =>
                  l.titre ? (
                    <li key={l.cle} role="presentation" className="commande__titre">
                      <span className="commande__libelle">{l.libelle}</span>
                      {l.sous ? <span className="commande__sous">{l.sous}</span> : null}
                    </li>
                  ) : (
                    <li
                      key={l.cle}
                      id={`${idListe}-o${i}`}
                      role="option"
                      aria-selected={i === surligne}
                      className={`commande__option${l.cle === "ajouter" ? " commande__option--ajouter" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        l.action?.();
                      }}
                    >
                      {l.code ? <span className="mono">{l.code}</span> : null}
                      <span className="commande__texte">
                        <span className="commande__libelle">{l.libelle}</span>
                        {l.sous ? <span className="commande__sous">{l.sous}</span> : null}
                      </span>
                    </li>
                  ),
                )}
          </ul>
        ) : null}
        {liste && !choix.length ? (
          <p className="commande__vide" role="status">
            {liste.type === "projet"
              ? "Aucun projet ne correspond."
              : liste.type === "tache"
                ? "Aucune tâche ouverte ne correspond (les vôtres, celles de votre équipe, celles que vous avez confiées, celles de vos projets)."
                : reunion
                  ? "Personne ne correspond."
                  : "Personne ne correspond parmi celles à qui vous pouvez confier une tâche."}
          </p>
        ) : null}
      </div>
      <p className="saisie-rapide__apercu" aria-live="polite">
        {tache ? (
          <>
            <span className="saisie-rapide__titre">{rienAChanger ? "Écrivez ce qui change, ou Entrée pour ouvrir la tâche" : `« ${tache.titre} »`}</span>
            {maj?.morceaux.map((m) => (
              <span key={m.type} className={`saisie-rapide__morceau saisie-rapide__morceau--${m.type === "statut" || m.type === "relance" ? "echeance" : m.type === "note" ? "discret" : m.type}`}>
                {m.texte}
              </span>
            ))}
            {projet ? puce(`Vers ${projet.code} · ${projet.titre}`, () => setProjet(null), "saisie-rapide__morceau--projet") : null}
            {personneEff ? puce(`Confier à ${personneEff.id === moiId ? "moi" : personneEff.nom}`, personne ? () => setPersonne(null) : null, "saisie-rapide__morceau--personne") : null}
          </>
        ) : analyseReunion ? (
          <>
            <span className="saisie-rapide__titre">{analyseReunion.titre ? `Réunion « ${analyseReunion.titre} »` : "Réunion : écrivez son titre"}</span>
            {puceProjet(projetEff, !!projet)}
            {analyseReunion.morceaux
              .filter((m) => m.type !== "projet")
              .map((m) => (
                <span key={m.type} className={`saisie-rapide__morceau saisie-rapide__morceau--${m.type === "jour" ? "echeance" : "heures"}`}>
                  {m.texte}
                </span>
              ))}
            {invitesEff.map((p) => (
              <span key={p.id}>{puce(`Avec ${p.nom}`, invites.some((i) => i.id === p.id) ? () => setInvites(invites.filter((i) => i.id !== p.id)) : null, "saisie-rapide__morceau--personne")}</span>
            ))}
          </>
        ) : note ? (
          <>
            <span className="saisie-rapide__titre">Pour le rapport du vendredi</span>
            {puce(LIBELLES_NOTE[note.rubrique], null, "saisie-rapide__morceau--echeance")}
            {puceProjet(projetEff, !!projet)}
            {note.texte ? puce(`« ${note.texte} »`, null, "saisie-rapide__morceau--discret") : null}
          </>
        ) : genre === "projet" ? (
          <>
            <span className="saisie-rapide__titre">{projetMaj ? `Mettre à jour ${projetMaj.code} · ${projetMaj.titre}` : "Quel projet ?"}</span>
            {majProjet ? puce(texteMajProjet(majProjet), null, "saisie-rapide__morceau--echeance") : null}
          </>
        ) : question ? (
          <span className="ton-discret">Question : la réponse s&apos;affiche au fur et à mesure. Rien n&apos;est modifié.</span>
        ) : analyse && agir ? (
          <>
            <span className="saisie-rapide__titre">{analyse.titre || "Écrivez ce qu'il y a à faire"}</span>
            {projet ? puceProjet(projet, true) : puceProjet(mots?.projet ?? analyse.projet, false)}
            {personneEff ? puce(`Pour ${personneEff.id === moiId ? "moi" : personneEff.nom}`, personne ? () => setPersonne(null) : null, "saisie-rapide__morceau--personne") : null}
            {analyse.morceaux
              .filter((m) => m.type !== "projet")
              .map((m) => (
                <span key={m.type} className={`saisie-rapide__morceau saisie-rapide__morceau--${m.type}`}>
                  {m.texte}
                </span>
              ))}
          </>
        ) : etat.ok && etat.message ? (
          <span className={annuleIci ? (annuleIci.ok ? "ton-discret" : "ton-retard") : "ton-ok"}>
            {annuleIci ? annuleIci.message : etat.message}{" "}
            {annulable && etat.annulation && !annuleIci ? (
              <button type="button" className="lien-bouton" onClick={annuler}>
                Annuler
              </button>
            ) : null}
            {etat.lien && !annuleIci?.ok ? (
              <>
                {" "}
                <a href={etat.lien} className="lien-discret">
                  Voir
                </a>
              </>
            ) : null}
          </span>
        ) : mode === "tache" ? (
          <span className="ton-discret">
            <kbd>/</kbd> un projet · <kbd>@</kbd> une personne · <kbd>#</kbd> une tâche à mettre à jour · « Réunion … » · « Décision : … » · une question ?{" "}
            <a href={`/taches/nouvelle?retour=${encodeURIComponent(retour)}`} className="lien-discret">
              Formulaire complet
            </a>
          </span>
        ) : null}
      </p>
      {reunion && occupes.length ? (
        <div className="avertissement-creneau" role="status">
          {occupes.map((o) => (
            <p key={o.id} style={{ margin: 0 }}>
              {phraseOccupe(o)}.
            </p>
          ))}
        </div>
      ) : null}
      {erreur && genre !== "question" ? (
        <p className="saisie-rapide__erreur ton-retard" role="alert">
          {erreur}
        </p>
      ) : null}
      <input type="hidden" name="genre" value={genre} />
      <input type="hidden" name="saisie" value={genre === "projet" ? texte : net} />
      <input type="hidden" name="tacheId" value={tache?.id ?? ""} />
      <input type="hidden" name="projetId" value={genre === "projet" ? (projet?.id ?? "") : (projet?.id ?? mots?.projet?.id ?? "")} />
      <input type="hidden" name="assigneId" value={personneEff?.id ?? ""} />
      {reunion ? invitesEff.map((p) => <input key={p.id} type="hidden" name="participants" value={p.id} />) : null}
    </form>
  );
}
