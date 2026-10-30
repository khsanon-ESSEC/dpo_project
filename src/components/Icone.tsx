/** Icônes au trait (24 × 24), couleur héritée du texte. Décoratives : masquées aux lecteurs d'écran. */
const traces: Record<string, string> = {
  calendrier: "M4 6.5h16v13H4zM4 10h16M8.5 4v4M15.5 4v4",
  document: "M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h6",
  "tableau-de-bord": "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  clients: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c1.8.8 3 2.8 3 5.5",
  banque: "M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3.5 20.5h17",
  agence: "M5 20.5V5.5l7-2 7 2v15M3.5 20.5h17M9 9h1.5M13.5 9H15M9 13h1.5M13.5 13H15M10.5 20.5v-3.5h3v3.5",
  notification: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  "chevron-gauche": "M14.5 6 8.5 12l6 6",
  "chevron-droite": "M9.5 6l6 6-6 6",
  "chevron-bas": "M6 9.5l6 6 6-6",
  "chevron-haut": "M6 14.5l6-6 6 6",
  modeles: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h3",
  trombone: "M16.5 7.5 9.3 14.7a1.8 1.8 0 0 0 2.5 2.5l7.4-7.4a3.6 3.6 0 0 0-5.1-5.1l-7.6 7.6a5.4 5.4 0 0 0 7.6 7.6l6.4-6.4",
  eclair: "M13 3 5.5 13.5H12L11 21l7.5-10.5H12z",
  ajouter: "M12 5v14M5 12h14",
  modifier: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  cadenas: "M6.5 10.5h11v9h-11zM9 10.5V7.5a3 3 0 0 1 6 0v3",
  "fleche-droite": "M4.5 12h15M13.5 6l6 6-6 6",
  fermer: "M6 6l12 12M18 6 6 18",
  envoyer: "M4 12 20 4l-4 16-4-7zM12 13l8-9",
  telecharger: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
  coche: "M5 12.5l4.5 4.5L19 7.5",
  drapeau: "M5.5 21V4M5.5 4.5h12l-2.5 4 2.5 4h-12",
  horloge: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 7.5V12l3 2",
  sablier: "M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 5-8 8.5s8 4 8 8.5",
  interdit: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM6 6l12 12",
  soleil: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  lune: "M20 14.6A8.5 8.5 0 0 1 9.4 4a8.5 8.5 0 1 0 10.6 10.6z",
  etincelle: "M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9zM18.5 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z",
  deconnexion: "M14 4.5H5v15h9M10 12h10M16.5 8.5 20 12l-3.5 3.5",
  courriel: "M3.5 5.5h17v13h-17zM4 6.5l8 6 8-6",
  utilisateur: "M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5",
  liste: "M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h1M4.5 12h1M4.5 17.5h1",
  menu: "M4.5 7h15M4.5 12h15M4.5 17h15",
  loupe: "M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM15.5 15.5l5 5",
  importer: "M12 15V4M7 9.5l5-5 5 5M5 14v6h14v-6",
  historique: "M4 12a8 8 0 1 0 2.3-5.6M4 4.5V8h3.5M12 8v4.5l3 1.8",
  reprendre: "M15 5.5 19 9.5l-4 4M19 9.5H9a4.5 4.5 0 0 0 0 9h2",
  colonnes: "M4 4.5h4.5v15H4zM9.75 4.5h4.5v10h-4.5zM15.5 4.5H20v12.5h-4.5z",
  gantt: "M4 4v16.5h16.5M7 7.5h7M10 11.5h8M8.5 15.5h6",
  jauge: "M4.5 17a7.5 7.5 0 1 1 15 0M12 17l4-5.5M3.5 20.5h17",
  personnes: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c1.8.8 3 2.8 3 5.5",
  reunion: "M3.5 5.5h17v10h-9l-4.5 3.5v-3.5H3.5zM8 9.5h8M8 12.5h5",
  bilan: "M4 4v16.5h16.5M8 16v-4M12 16V8M16 16v-6",
  aide: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM9.6 9.6a2.5 2.5 0 0 1 4.85.85c0 1.7-2.45 2.05-2.45 3.6M12 16.9v.1",
};

export type NomIcone = keyof typeof traces;

export function Icone({ nom, taille = 22, trait = 1.5 }: { nom: string; taille?: number; trait?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={trait} strokeLinecap="round" strokeLinejoin="round">
      <path d={traces[nom] ?? traces.document} />
    </svg>
  );
}
