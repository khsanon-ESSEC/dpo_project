#!/bin/bash
# Pilotage des projets DPO — essai sur un Mac.
# Double-cliquez sur ce fichier dans le Finder. La première fois, il installe ce qu'il faut
# (Node.js 22 si besoin, les dépendances, une base PostgreSQL embarquée), compile l'application,
# puis l'ouvre dans le navigateur. Les fois suivantes, il la relance directement.
# Rien n'est installé hors de ce dossier, sauf Node.js 22 via nvm s'il est déjà présent.
# Pour arrêter : Ctrl+C dans la fenêtre du Terminal, ou fermez-la.

cd "$(dirname "$0")" || exit 1
mkdir -p .local
JOURNAL="$PWD/.local/lancement.log"
# tee ignore Ctrl+C : les derniers messages (arrêt propre) restent visibles et journalisés.
exec > >(trap "" INT HUP; tee "$JOURNAL") 2>&1

etape() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
echec() {
  printf '\n\033[1;31m✗ %s\033[0m\n' "$1"
  printf 'Détails dans %s\n' "$JOURNAL"
  read -r -p "Appuyez sur Entrée pour fermer." _
  exit 1
}
majeur_node() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

printf '\033[1mPilotage des projets DPO — essai local\033[0m\n'

# ---------- 1. Node.js 22 ou plus récent ----------
etape "Node.js"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -x "$PWD/.local/node/bin/node" ]; then
  export PATH="$PWD/.local/node/bin:$PATH"
fi
if [ "$(majeur_node)" -lt 22 ] && [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm install 22 || true
  nvm use 22 >/dev/null 2>&1 || true
fi
if [ "$(majeur_node)" -lt 22 ]; then
  # Node.js portable, rangé dans ce dossier seulement (pas de mot de passe administrateur).
  case "$(uname -m)" in
    arm64) ARCH=darwin-arm64 ;;
    *) ARCH=darwin-x64 ;;
  esac
  printf 'Téléchargement de Node.js 22 (%s)…\n' "$ARCH"
  FICHIER=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | awk -v a="$ARCH.tar.gz" '$2 ~ a"$" {print $2; exit}')
  [ -n "$FICHIER" ] || echec "Impossible de joindre nodejs.org pour télécharger Node.js."
  rm -rf .local/node && mkdir -p .local/node
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$FICHIER" | tar -xz -C .local/node --strip-components 1 || echec "Le téléchargement de Node.js a échoué."
  export PATH="$PWD/.local/node/bin:$PATH"
fi
[ "$(majeur_node)" -ge 22 ] || echec "Node.js 22 n'a pas pu être installé."
printf 'Node.js %s\n' "$(node -v)"

# ---------- 2. Dépendances ----------
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  etape "Installation des dépendances (quelques minutes la première fois)"
  npm ci --no-audit --no-fund || echec "L'installation des dépendances a échoué."
fi

# ---------- 3. Base, données de démonstration, compilation, lancement ----------
etape "Lancement"
NEXT_TELEMETRY_DISABLED=1 node scripts/local.mjs "$@"
CODE=$?
if [ $CODE -ne 0 ] && [ $CODE -ne 130 ]; then
  echec "L'application s'est arrêtée avec une erreur."
fi
