import type { MetadataRoute } from "next";

/** Installable sur téléphone : « Ajouter à l'écran d'accueil ». */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pilotage des projets DPO",
    short_name: "Pilotage DPO",
    description: "Tâches, rapports du vendredi et projets de la Division des Projets Organisationnels",
    start_url: "/semaine",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#142458",
    theme_color: "#142458",
    lang: "fr",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icone-masquable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
