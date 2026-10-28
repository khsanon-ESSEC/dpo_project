#!/bin/bash
# Comme lancer-sur-mac.command, mais l'application s'ouvre aussi sur le téléphone (même Wi-Fi) :
# l'adresse à taper sur le téléphone s'affiche dans cette fenêtre.
cd "$(dirname "$0")" || exit 1
exec ./lancer-sur-mac.command --reseau
