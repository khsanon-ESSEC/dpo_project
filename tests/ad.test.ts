import { describe, expect, it } from "vitest";
import { compteDesactive, estDansGroupe, MESSAGES_AD, motDePasseADAcceptable, nomDeLiaison, normaliserIdentifiant, refusDeLiaison } from "@/lib/auth/ad-regles";

const D = "unibank.local";

describe("connexion Windows (Active Directory) : identifiant", () => {
  it("accepte l'identifiant seul, DOMAINE\\identifiant et identifiant@domaine AD", () => {
    expect(normaliserIdentifiant("jdupont", D)).toBe("jdupont");
    expect(normaliserIdentifiant("  UNIBANK\\jdupont ", D)).toBe("jdupont");
    expect(normaliserIdentifiant("jdupont@UNIBANK.local", D)).toBe("jdupont");
    expect(normaliserIdentifiant("jean-robert.noel", D)).toBe("jean-robert.noel");
  });
  it("refuse une adresse d'un autre domaine (l'adresse courriel n'est pas l'identifiant Windows)", () => {
    expect(normaliserIdentifiant("jdupont@unibankhaiti.com", D)).toBeNull();
  });
  it("refuse tout ce qui pourrait modifier un filtre LDAP ou un DN", () => {
    for (const s of ["*", "jd*", "jdupont)(objectClass=*", "a(b", "a,b", "cn=admin", "a b", "", "   ", "a\u0000b", "UNIBANK\\jd*", "x".repeat(65)]) {
      expect(normaliserIdentifiant(s, D)).toBeNull();
    }
  });
});

describe("connexion Windows : liaison", () => {
  it("se lie en UPN par défaut, ou selon le format choisi par l'informatique", () => {
    expect(nomDeLiaison("jdupont", D)).toBe("jdupont@unibank.local");
    expect(nomDeLiaison("jdupont", D, "UNIBANK\\{identifiant}")).toBe("UNIBANK\\jdupont");
    expect(nomDeLiaison("jdupont", D, "CN={identifiant},OU=Utilisateurs,DC=unibank,DC=local")).toBe("CN=jdupont,OU=Utilisateurs,DC=unibank,DC=local");
  });
  it("ne laisse jamais partir un mot de passe vide (liaison anonyme d'Active Directory)", () => {
    expect(motDePasseADAcceptable("")).toBe(false);
    expect(motDePasseADAcceptable(undefined)).toBe(false);
    expect(motDePasseADAcceptable(null)).toBe(false);
    expect(motDePasseADAcceptable("a\u0000b")).toBe(false);
    expect(motDePasseADAcceptable("x".repeat(257))).toBe(false);
    expect(motDePasseADAcceptable(" ")).toBe(true);
    expect(motDePasseADAcceptable("Mot-de-passe-Windows-1")).toBe(true);
  });
  it("lit le code de refus d'Active Directory, sans distinguer identifiant inconnu et mauvais mot de passe", () => {
    const ad = (code: string) => `80090308: LdapErr: DSID-0C09044E, comment: AcceptSecurityContext error, data ${code}, v4563 Code: 0x31`;
    expect(refusDeLiaison(ad("52e"))).toBe("identifiants");
    expect(refusDeLiaison(ad("525"))).toBe("identifiants");
    expect(refusDeLiaison(ad("532"))).toBe("expire");
    expect(refusDeLiaison(ad("701"))).toBe("expire");
    expect(refusDeLiaison(ad("773"))).toBe("a_changer");
    expect(refusDeLiaison(ad("775"))).toBe("verrouille");
    expect(refusDeLiaison(ad("533"))).toBe("bloque");
    expect(refusDeLiaison("Invalid Credentials Code: 0x31")).toBe("identifiants");
  });
});

describe("connexion Windows : compte et groupe", () => {
  it("reconnaît un compte désactivé (userAccountControl)", () => {
    expect(compteDesactive("512")).toBe(false);
    expect(compteDesactive("514")).toBe(true);
    expect(compteDesactive(["66050"])).toBe(true);
    expect(compteDesactive(undefined)).toBe(false);
  });
  it("vérifie le groupe sans tenir compte de la casse ni des espaces", () => {
    const g = "CN=App-Pilotage-DPO,OU=Groupes,DC=unibank,DC=local";
    expect(estDansGroupe(["cn=app-pilotage-dpo, ou=Groupes, dc=unibank, dc=local"], g)).toBe(true);
    expect(estDansGroupe("CN=App-Pilotage-DPO,OU=Groupes,DC=unibank,DC=local", g)).toBe(true);
    expect(estDansGroupe(["CN=Autre,OU=Groupes,DC=unibank,DC=local"], g)).toBe(false);
    expect(estDansGroupe(undefined, g)).toBe(false);
  });
  it("chaque refus a son message", () => {
    expect(Object.keys(MESSAGES_AD).sort()).toEqual(["a_changer", "bloque", "expire", "identifiant", "identifiants", "indisponible", "sans_acces", "trop", "verrouille"]);
  });
});
