// Annuaire factice qui imite Active Directory en LDAPS, pour essayer la connexion Windows en local.
// ESSAIS SEULEMENT : comptes et mots de passe fictifs, jamais en production.
//
// Préparer (une fois) : à la racine du dépôt, npm i --no-save ldapjs@3.0.7 ; puis, dans un dossier de
// travail hors du dépôt, les certificats d'essai :
//   openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=AC essai" -keyout ac.key -out ac.pem
//   openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=AC inconnue" -keyout autre-ac.key -out autre-ac.pem
//   openssl req -newkey rsa:2048 -nodes -subj "/CN=localhost" -keyout serveur.key -out serveur.csr
//   printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n" > ext.cnf
//   openssl x509 -req -in serveur.csr -CA ac.pem -CAkey ac.key -CAcreateserial -days 30 -extfile ext.cnf -out serveur.pem
// Lancer : ESSAI_DOSSIER=<ce dossier> node scripts/essai/annuaire-factice.mjs
// Tests  : AD_TEST_URL=ldaps://127.0.0.1:6360 AD_TEST_CA=<dossier>/ac.pem AD_TEST_AUTRE_CA=<dossier>/autre-ac.pem npm test
// - liaison par DN « uid=<identifiant>,ou=personnes,dc=demo,dc=local » (AD accepte aussi l'UPN) ;
// - refus avec les codes d'AD (data 52e, 532, 533) ;
// - comme AD, une liaison avec un mot de passe vide réussit en anonyme (c'est ce que l'application doit empêcher) ;
// - recherche réservée aux liaisons authentifiées.
import { readFileSync } from "node:fs";
import ldap from "ldapjs";

const ICI = (process.env.ESSAI_DOSSIER || new URL(".", import.meta.url).pathname).replace(/\/?$/, "/");
const BASE = "dc=demo,dc=local";
const GROUPE = "CN=App-Pilotage-DPO,OU=Groupes,DC=demo,DC=local";
const comptes = {
  naugustin: { mdp: "Windows-Nadege-1", mail: "nadege.augustin@demo.dpo.local", groupe: true },
  jrnoel: { mdp: "Windows-JeanRobert-1", mail: "jean-robert.noel@demo.dpo.local", groupe: true },
  ncelestin: { mdp: "Windows-Nathalie-1", mail: "nathalie.celestin@demo.dpo.local", groupe: true },
  djoseph: { mdp: "Windows-Daphnee-1", mail: "daphnee.joseph@demo.dpo.local", groupe: false },
  inconnu: { mdp: "Windows-Inconnu-1", mail: "inconnu.personne@demo.dpo.local", groupe: true },
  desactive: { mdp: "Windows-Desactive-1", mail: "desactive@demo.dpo.local", groupe: true, code: "533", uac: "514" },
  expire: { mdp: "Windows-Expire-1", mail: "expire@demo.dpo.local", groupe: true, code: "532" },
  sansmail: { mdp: "Windows-SansMail-1", upn: "sansmail@demo.local", groupe: true },
};
// Refus comme AD : code 49 (invalidCredentials) avec le message de diagnostic « … data 52e … ».
const refuser = (res, code) => { res.diagnosticMessage = `80090308: LdapErr: DSID-0C09044E, comment: AcceptSecurityContext error, data ${code}, v4563`; res.end(49); };
const liaisons = [];

const s = ldap.createServer({ certificate: readFileSync(ICI + "serveur.pem"), key: readFileSync(ICI + "serveur.key") });

s.bind("ou=personnes," + BASE, (req, res, next) => {
  const id = String(req.dn.toString().match(/uid=([^,]+)/i)?.[1] ?? "");
  const mdp = req.credentials ?? "";
  liaisons.push({ id, vide: mdp === "" });
  if (mdp === "") { res.end(); return next(); } // liaison anonyme, comme AD
  const c = comptes[id];
  if (!c || c.mdp !== mdp) { refuser(res, "52e"); return next(); }
  if (c.code) { refuser(res, c.code); return next(); }
  res.end();
  return next();
});

s.search(BASE, (req, res, next) => {
  const qui = req.connection.ldap.bindDN?.toString() ?? "";
  if (!/uid=/i.test(qui)) return next(new ldap.OperationsError("000004DC: LdapErr: DSID-0C090A5C, comment: In order to perform this operation a successful bind must be completed on the connection."));
  // Cette bibliothèque compare les attributs demandés en minuscules : on les y ramène.
  res.attributes = res.attributes.map((a) => a.toLowerCase());
  for (const [id, c] of Object.entries(comptes)) {
    const attributes = { objectClass: ["top", "person", "user"], sAMAccountName: id, userAccountControl: c.uac ?? "512" };
    if (c.mail) attributes.mail = c.mail;
    attributes.userPrincipalName = c.upn ?? `${id}@demo.local`;
    if (c.groupe) attributes.memberOf = [GROUPE];
    // Noms d'attributs en minuscules : la bibliothèque de ce serveur factice ne renvoie que ceux-là ;
    // Active Directory renvoie « memberOf », « userAccountControl » : l'application lit sans tenir compte de la casse.
    const entree = { dn: `uid=${id},ou=personnes,${BASE}`, attributes: Object.fromEntries(Object.entries(attributes).map(([k, v]) => [k.toLowerCase(), v])) };
    if (req.filter.matches(attributes, false)) res.send(entree);
  }
  res.end();
  return next();
});

// Pour les tests : liste des liaisons reçues (sans les mots de passe).
s.search("cn=journal", (req, res, next) => { res.send({ dn: "cn=journal", attributes: { liaisons: JSON.stringify(liaisons) } }); res.end(); next(); });

s.listen(6360, "127.0.0.1", () => console.log("Annuaire factice (LDAPS) sur 6360"));
