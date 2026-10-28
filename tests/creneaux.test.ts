import { describe, expect, it } from "vitest";
import { chevauche, phraseOccupe } from "@/lib/creneaux";

describe("créneaux de réunion", () => {
  it("se chevauchent si l'une commence avant la fin de l'autre", () => {
    expect(chevauche({ heure: "10:00", duree: 60 }, { heure: "10:30", duree: 30 })).toBe(true);
    expect(chevauche({ heure: "10:00", duree: 60 }, { heure: "09:00", duree: 90 })).toBe(true);
    expect(chevauche({ heure: "10:00", duree: 60 }, { heure: "11:00", duree: 30 })).toBe(false); // bout à bout
    expect(chevauche({ heure: "10:00", duree: 60 }, { heure: "09:00", duree: 60 })).toBe(false);
  });
  it("une phrase claire, le titre seulement quand on le connaît", () => {
    expect(phraseOccupe({ id: "1", nom: "Fabienne Michel", moi: false, occupe: [{ debut: 600, fin: 660, titre: null }] })).toBe("Fabienne Michel est déjà pris(e) de 10 h à 11 h");
    expect(phraseOccupe({ id: "2", nom: "Moi", moi: true, occupe: [{ debut: 630, fin: 690, titre: "Comité" }] })).toBe("Vous êtes déjà pris(e) de 10 h 30 à 11 h 30 (« Comité »)");
  });
});
