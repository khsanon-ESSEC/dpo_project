/** Requêtes venues d'une autre page que l'application, et lien « Retour » d'une fiche personne. */
import { describe, expect, it } from "vitest";
import { cheminInterne, memeOrigine } from "@/lib/origine";

const h = (o: Record<string, string>) => new Headers({ host: "pilotage.unibank.local", ...o });

describe("memeOrigine", () => {
  it("accepte une page de l'application, refuse un autre site, même voisin", () => {
    expect(memeOrigine(h({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(memeOrigine(h({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(memeOrigine(h({ "sec-fetch-site": "cross-site" }))).toBe(false);
  });
  it("sans Sec-Fetch-Site, compare l'en-tête Origin à l'hôte", () => {
    expect(memeOrigine(h({ origin: "https://pilotage.unibank.local" }))).toBe(true);
    expect(memeOrigine(h({ origin: "https://intranet.unibank.local" }))).toBe(false);
    expect(memeOrigine(h({ origin: "null" }))).toBe(false);
    expect(memeOrigine(h({}))).toBe(true);
  });
});

describe("cheminInterne", () => {
  it("garde le chemin d'une page de l'application", () => {
    expect(cheminInterne("https://pilotage.unibank.local/equipe?x=1", h({}))).toBe("/equipe?x=1");
  });
  it("ignore une autre adresse, ou un chemin qui partirait ailleurs", () => {
    expect(cheminInterne("https://autre.site/equipe", h({}))).toBeNull();
    expect(cheminInterne("https://pilotage.unibank.local//evil.example/x", h({}))).toBeNull();
    expect(cheminInterne("pas une adresse", h({}))).toBeNull();
    expect(cheminInterne(null, h({}))).toBeNull();
  });
});
