// Crée une personne avec un mot de passe provisoire (à changer à la première connexion).
// Sert surtout à créer le premier administrateur après l'installation ; ensuite, tout se fait
// dans l'écran Organisation.
//
// Usage :
//   DATABASE_URL=... node scripts/creer-utilisateur.mjs --courriel=prenom.nom@unibankhaiti.com \
//     --prenom=Prénom --nom=Nom [--poste="Directeur"] [--administrateur] [--directeur] [--executif]
import postgres from "postgres";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manque.");
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [cle, ...reste] = a.replace(/^--/, "").split("=");
    return [cle, reste.length ? reste.join("=") : true];
  }),
);
const courriel = String(args.courriel ?? "").trim().toLowerCase();
const prenom = String(args.prenom ?? "").trim();
const nom = String(args.nom ?? "").trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(courriel) || !prenom || !nom) {
  console.error("Il faut --courriel=..., --prenom=... et --nom=...");
  process.exit(1);
}

// Mot de passe provisoire : 16 caractères, avec au moins une lettre et un chiffre.
let provisoire = "";
while (!/[a-z]/i.test(provisoire) || !/\d/.test(provisoire)) provisoire = randomBytes(12).toString("base64url").slice(0, 16);

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [existe] = await sql`select id from personnes where courriel = ${courriel}`;
  if (existe) {
    console.error("Cette adresse existe déjà : rien n'a été modifié.");
    process.exitCode = 1;
  } else {
    const empreinte = await hash(provisoire, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const [p] = await sql`
      insert into personnes (prenom, nom, courriel, poste, directeur, executif, administrateur, mot_de_passe_hash, doit_changer_mot_de_passe)
      values (${prenom}, ${nom}, ${courriel}, ${String(args.poste ?? "")}, ${!!args.directeur}, ${!!args.executif}, ${!!args.administrateur}, ${empreinte}, true)
      returning id`;
    await sql`insert into journal (personne_id, action, objet) values (${p.id}, 'personne_creee_console', ${courriel})`;
    console.log(`Personne créée : ${prenom} ${nom} <${courriel}>`);
    console.log(`Mot de passe provisoire (affiché une seule fois) : ${provisoire}`);
  }
} finally {
  await sql.end();
}
