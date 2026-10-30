/** Le guide de la barre (29 octobre 2026) : repérage des questions, fiches trouvées, questions nettoyées. */
import { describe, expect, it } from "vitest";
import { ecranDuChemin, estQuestionGuide, FICHES, ficheParId, insecables, nettoyerQuestion, trouverFiches, type EcranGuide } from "@/lib/guide";
import { genreDe } from "@/lib/barre";
import type { Permission } from "@/lib/commandes";

const tous = () => true;
const agent = (p: Permission) => p === "tous" || p === "interne" || p === "redige";
const premiere = (q: string, ecran: EcranGuide | null = null, permis: (p: Permission) => boolean = tous) => trouverFiches(q, { ecran, permis })[0]?.fiche.id ?? null;

describe("une question pour le guide ?", () => {
  it("comment, où, pourquoi, aide… : oui", () => {
    for (const q of [
      "comment envoyer mon rapport ?",
      "Comment ajouter une tâche",
      "Où changer le thème ?",
      "où trouver le Gantt",
      "pourquoi UR est en retard ?",
      "c'est quoi le RACI ?",
      "Qu'est-ce que la charge ?",
      "je n'arrive pas à envoyer mon rapport",
      "est-ce que je peux modifier mon rapport ?",
      "aide",
      "Aide sur le rapport",
      "?",
      "mode d'emploi",
    ])
      expect(estQuestionGuide(q), q).toBe(true);
  });
  it("une tâche, une note, une question sur les données : non", () => {
    for (const q of ["Relire les maquettes /UR vendredi 2h", "Aide attendue : valider le budget", "où en est UR ?", "en retard sur UR ?", "qui est surchargé ?", "Aider Fabienne pour l'atelier", "Commenter les maquettes", "Décision : budget DTI"])
      expect(estQuestionGuide(q), q).toBe(false);
  });
  it("la barre en fait un genre à part, avant les questions sur les données", () => {
    const o = { projetChoisi: false, projets: [], aujourdhui: "2026-10-30" };
    expect(genreDe("comment envoyer mon rapport ?", o)).toBe("guide");
    expect(genreDe("en retard sur UR ?", o)).toBe("question");
    expect(genreDe("Aide attendue : budget", o)).toBe("note");
    expect(genreDe("Relire maquettes", o)).toBe("tache");
  });
});

describe("les fiches trouvées", () => {
  it("la bonne fiche en tête pour les questions courantes", () => {
    const cas: [string, string][] = [
      ["comment envoyer mon rapport ?", "envoyer-mon-rapport"],
      ["comment ajouter une tâche ?", "ajouter-une-tache"],
      ["comment cocher une tâche terminée", "cocher-une-tache-faite"],
      ["comment signaler un blocage ?", "signaler-une-tache-bloquee"],
      ["je ne peux plus modifier mon rapport", "reprendre-mon-rapport"],
      ["comment corriger mon rapport déjà envoyé ?", "reprendre-mon-rapport"],
      ["où changer le thème ?", "changer-le-theme"],
      ["comment passer en mode sombre", "changer-le-theme"],
      ["j'ai oublié mon mot de passe", "mot-de-passe"],
      ["comment imprimer le rapport du conseil en pdf ?", "imprimer-le-rapport-au-conseil"],
      ["où trouver le gantt ?", "voir-un-projet-autrement"],
      ["comment confier une tâche à Fabienne ?", "confier-une-tache"],
      ["comment noter une réunion ?", "noter-une-reunion"],
      ["comment proposer un nouveau projet ?", "proposer-un-projet"],
      ["comment ajouter un livrable ?", "ajouter-un-livrable"],
      ["comment valider un livrable ?", "faire-valider-un-livrable"],
      ["c'est quoi le RACI ?", "voir-ou-adapter-le-raci"],
      ["pourquoi mon projet est à surveiller ?", "comprendre-la-sante-d-un-projet"],
      ["comment noter le temps passé ?", "noter-le-temps-passe"],
      ["comment voir mes tâches en calendrier ?", "voir-mes-taches-autrement"],
      ["à quoi sert la barre ?", "ce-que-sait-faire-la-barre"],
      ["où voir mes alertes ?", "alertes"],
      ["comment noter une décision pour mon rapport ?", "ajouter-une-note-au-rapport"],
      ["comment approuver le rapport au conseil ?", "relire-et-approuver-le-rapport-au-conseil"],
      ["pourquoi je ne vois pas le projet UC ?", "pourquoi-je-ne-vois-pas"],
      ["comment faire revenir une tâche chaque lundi ?", "repeter-une-tache"],
    ];
    for (const [q, id] of cas) expect(premiere(q), q).toBe(id);
  });
  it("les droits : un agent ne voit pas les fiches du conseil ni celles de l'équipe", () => {
    expect(premiere("comment imprimer le rapport du conseil ?", null, agent)).not.toBe("imprimer-le-rapport-au-conseil");
    expect(trouverFiches("rapports de mon équipe", { permis: agent }).some((r) => r.fiche.permis === "chef")).toBe(false);
  });
  it("l'écran ouvert départage, et sans mot utile il propose les fiches de l'écran", () => {
    const surRapport = trouverFiches("aide", { ecran: "rapport", permis: tous });
    expect(surRapport.length).toBeGreaterThan(0);
    expect(surRapport.every((r) => r.fiche.ecrans.includes("rapport"))).toBe(true);
    expect(trouverFiches("comment faire du café ?", { permis: tous })).toEqual([]);
  });
  it("chaque fiche est complète, et ses renvois existent", () => {
    const ids = new Set(FICHES.map((f) => f.id));
    expect(ids.size).toBe(FICHES.length);
    for (const f of FICHES) {
      expect(f.etapes.length, f.id).toBeGreaterThanOrEqual(2);
      expect(f.resume.length, f.id).toBeLessThanOrEqual(140);
      for (const v of f.voirAussi ?? []) expect(ficheParId(v), `${f.id} → ${v}`).not.toBeNull();
      expect(/[Rr]ecette/.test(JSON.stringify(f)), f.id).toBe(false);
    }
  });
  it("guillemets et deux-points jamais seuls en bout de ligne", () => {
    expect(insecables("Cliquez « Envoyer » : c'est fait ?")).toBe("Cliquez «\u00a0Envoyer\u00a0»\u00a0: c'est fait\u00a0?");
    for (const f of FICHES) expect(/« | »| :/.test([f.titre, f.resume, ...f.etapes].join(" ")), f.id).toBe(false);
  });
  it("l'écran d'un chemin", () => {
    expect(ecranDuChemin("/rapport")).toBe("rapport");
    expect(ecranDuChemin("/projets/abc/gantt")).toBe("projet");
    expect(ecranDuChemin("/projets")).toBe("portefeuille");
    expect(ecranDuChemin("/taches?vue=tableau")).toBe("taches");
    expect(ecranDuChemin("/")).toBe("semaine");
  });
});

describe("les questions gardées sans nom ni numéro", () => {
  it("noms de l'organisation, courriels et numéros retirés", () => {
    const noms = ["Fabienne", "Michel", "Myriam", "Valcin", "Jean-Robert", "Noël"];
    expect(nettoyerQuestion("comment confier une tâche à Fabienne Michel ?", noms)).toBe("comment confier une tâche à [personne] ?");
    expect(nettoyerQuestion("pourquoi jean-robert noël ne voit pas UR", noms)).toBe("pourquoi [personne] ne voit pas UR");
    expect(nettoyerQuestion("écrire à myriam.valcin@unibank.ht ou au +509 3712-4480", noms)).toBe("écrire à [courriel] ou au [numéro]");
    expect(nettoyerQuestion("comment michelin ?", noms)).toBe("comment michelin ?");
    expect(nettoyerQuestion("x".repeat(300), noms).length).toBe(120);
  });
});
