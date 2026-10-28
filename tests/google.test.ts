import { describe, expect, it } from "vitest";
import { domainesDe, MESSAGES_GOOGLE, verifierRevendications } from "@/lib/auth/google-regles";

const banque = ["unibankhaiti.com"];
const bon = { nonce: "n-123", email: "Prenom.Nom@UnibankHaiti.com", email_verified: true, hd: "unibankhaiti.com" };

describe("connexion Google : ce qu'on exige du jeton", () => {
  it("accepte un compte vérifié de l'organisation de la banque, adresse en minuscules", () => {
    expect(verifierRevendications(bon, { nonce: "n-123", domaines: banque })).toEqual({ ok: true, courriel: "prenom.nom@unibankhaiti.com" });
  });
  it("refuse un jeton qui ne répond pas à notre demande (nonce)", () => {
    expect(verifierRevendications(bon, { nonce: "autre", domaines: banque })).toEqual({ ok: false, refus: "nonce" });
    expect(verifierRevendications({ ...bon, nonce: undefined }, { nonce: "n-123", domaines: banque })).toEqual({ ok: false, refus: "nonce" });
    expect(verifierRevendications(bon, { nonce: "", domaines: banque })).toEqual({ ok: false, refus: "nonce" });
  });
  it("refuse une adresse non vérifiée ou absente", () => {
    expect(verifierRevendications({ ...bon, email_verified: false }, { nonce: "n-123", domaines: banque })).toEqual({ ok: false, refus: "courriel" });
    expect(verifierRevendications({ ...bon, email_verified: "true" }, { nonce: "n-123", domaines: banque })).toEqual({ ok: false, refus: "courriel" });
    expect(verifierRevendications({ ...bon, email: undefined }, { nonce: "n-123", domaines: banque })).toEqual({ ok: false, refus: "courriel" });
  });
  it("refuse un compte personnel (sans hd) ou d'une autre organisation", () => {
    expect(verifierRevendications({ ...bon, email: "quelquun@gmail.com", hd: undefined }, { nonce: "n-123", domaines: banque })).toEqual({ ok: false, refus: "domaine" });
    expect(verifierRevendications({ ...bon, email: "x@autrebanque.ht", hd: "autrebanque.ht" }, { nonce: "n-123", domaines: banque })).toEqual({ ok: false, refus: "domaine" });
  });
  it("exige que le domaine Workspace et le domaine de l'adresse soient tous deux acceptés", () => {
    // Adresse de la banque, mais compte d'une autre organisation : refusé.
    expect(verifierRevendications({ ...bon, hd: "autre.com" }, { nonce: "n-123", domaines: banque })).toEqual({ ok: false, refus: "domaine" });
    // Organisation de la banque, mais adresse d'un autre domaine non déclaré : refusé.
    expect(verifierRevendications({ ...bon, email: "x@filiale.ht" }, { nonce: "n-123", domaines: banque })).toEqual({ ok: false, refus: "domaine" });
    // Second domaine déclaré : accepté.
    expect(verifierRevendications({ ...bon, email: "x@filiale.ht" }, { nonce: "n-123", domaines: [...banque, "filiale.ht"] })).toEqual({ ok: true, courriel: "x@filiale.ht" });
  });
  it("sans domaine configuré, tout est refusé", () => {
    expect(verifierRevendications(bon, { nonce: "n-123", domaines: [] })).toEqual({ ok: false, refus: "domaine" });
  });
  it("lit la liste des domaines", () => {
    expect(domainesDe(" UnibankHaiti.com , filiale.ht ,")).toEqual(["unibankhaiti.com", "filiale.ht"]);
    expect(domainesDe(undefined)).toEqual([]);
  });
  it("la page de connexion n'affiche que des messages connus", () => {
    expect(Object.keys(MESSAGES_GOOGLE).sort()).toEqual(["annule", "domaine", "echec", "indisponible", "sans_acces"]);
  });
});
