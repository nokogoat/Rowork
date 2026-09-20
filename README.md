# Rowork

**Le méta-framework CLI pour le développement de jeux Roblox.**

Rowork est à Roblox ce que `artisan` est à Laravel : une CLI unique qui orchestre
la toolchain, génère le code et impose une architecture cohérente.

> Statut : early development. L'API plugin est en v1 et peut encore bouger.

## Le problème

Démarrer un projet Roblox moderne demande aujourd'hui de câbler à la main Rojo,
roblox-ts, Flamework, une toolchain épinglée et un gestionnaire de paquets — soit
plusieurs heures de configuration, soit un template GitHub qui périme en trois mois.
Et une fois le projet lancé, plus rien ne garantit que le fichier n°200 suive la
même architecture que le fichier n°1.

## Ce que fait Rowork

- **Génère** — `rowork init`, et bientôt `make:service`, `make:controller`,
  `make:tool`. La scaffolding ne s'arrête pas au jour 1.
- **Orchestre** — une commande pour lancer le compilateur roblox-ts, Rojo et les
  watchers ensemble, avec des logs unifiés et des erreurs lisibles.
- **S'étend** — un système de plugins pour que la communauté ajoute ses propres
  commandes et intègre ses outils.

## Ce que Rowork ne fait pas

Rowork ne remplace ni Rojo, ni roblox-ts, ni Flamework, ni Wally : il les pilote.
`default.project.json`, `tsconfig.json` et `package.json` restent des fichiers
standards, visibles et éditables. Vous pouvez à tout moment lancer les outils nus.
**Pas de lock-in.**

## Installation

```bash
npm install -g rowork
```

## Démarrage

```bash
rowork init MonJeu
cd MonJeu
rokit install
npm run watch
rojo serve
```

## Écrire un plugin

Un plugin est un paquet npm nommé `rowork-plugin-<nom>` qui exporte par défaut un
objet `RoworkPlugin`. Il est détecté automatiquement dans les dépendances du projet.

```ts
import { definePlugin, ROWORK_PLUGIN_API_VERSION } from "rowork/plugin";

export default definePlugin({
  name: "rowork-plugin-exemple",
  apiVersion: ROWORK_PLUGIN_API_VERSION,
  commands: [
    {
      name: "exemple:hello",
      description: "Dit bonjour.",
      run(context) {
        context.logger.success(`Bonjour depuis ${context.config?.name ?? "nulle part"}.`);
      },
    },
  ],
});
```

Pour une commande ponctuelle sans publier de paquet, déposez un fichier `.mjs`
dans `.rowork/commands/` à la racine du projet — il exporte la même structure.

Les commandes du cœur ne peuvent pas être écrasées par un plugin : Rowork le
signale et ignore la tentative.

## Licence

MIT
