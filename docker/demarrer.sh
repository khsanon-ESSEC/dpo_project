#!/bin/sh
# Au démarrage du conteneur : met la base à jour (sans effet si elle l'est déjà), puis lance l'application.
set -e
node scripts/migrer.mjs
exec node server.js
