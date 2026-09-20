# Modules

Rowork is a general-purpose tool. A **module** is a ready-made feature that
almost every Roblox game ends up rebuilding by hand: saving player data, showing
stats, and so on. You add it with one command and it becomes part of your project.

```bash
rowork add                 # choose from a list, then answer a few questions
rowork add:player-data     # or go straight to one
```

## What a module is (and is not)

- **Code copied into your project.** Not a library hidden in `node_modules`, not
  a black box. The files are yours: read them, change them, delete what you do not
  need. Rowork never rewrites them afterwards.
- **Small and commented.** A module should read in a few minutes. Each one
  explains what it does and how to use it, in the files themselves.
- **Guided.** With no options, a module asks its own questions with sensible
  defaults. Options exist for scripts.
- **Composable.** A module can require another one; Rowork tells you which to add
  first.

Modules are not [plugins](plugins.md). A plugin adds *commands* to Rowork; a
module adds *game code* to your project. (Community modules will be shipped as
plugins.)

## What `rowork add:<module>` does

1. Refuses if the module is already installed, or a module it needs is missing.
2. Asks its questions (or reads its options).
3. Refuses if it would overwrite one of your files. Nothing is written until
   every check has passed, so a refusal leaves your project untouched.
4. Installs the module's npm packages (skip with `--no-install`).
5. Writes the files, and registers their directory in the Flamework entry file so
   they are actually picked up.
6. Records the module in the `modules` list of [`rowork.json`](configuration.md).

## Available modules

### `player-data`: save each player's progress

Saves and loads whatever you choose (coins, level, a nickname...) for each player,
so it survives leaving the game. Built on
[Lapis](https://github.com/nezuo/lapis), which handles the hard parts: session
locking (two servers never overwrite each other), automatic saving, and saving
when a server shuts down. The module wraps it in a small service you can read in
one sitting.

```bash
rowork add:player-data                                         # guided
rowork add:player-data --field coins:number=0 --field nickname:string=Guest
```

The guided version offers `coins`, `level` and `xp` to tick, plus **Other...** to
type values of your own with any name you like (`best score` becomes `bestScore`),
and asks the kind of value and its starting value for each.

| Option | Effect |
| --- | --- |
| `--field <name:type=default>` | a value to save, repeatable. Types: `number`, `string`, `boolean`. The name can be anything: `"Best Score"` becomes `bestScore` |
| `--no-install` | do not run `npm install` |

Without `--field`, it saves `coins` and `level`.

**Files it adds**

| File | Role |
| --- | --- |
| `src/shared/data/PlayerData.ts` | *what* is saved: the fields and their starting values |
| `src/server/services/PlayerDataService.ts` | loads on join, saves on leave, exposes the API below |

**Using it**, from any service:

```ts
@Service()
export class RewardService {
  constructor(private readonly playerData: PlayerDataService) {}

  giveCoins(player: Player, amount: number): void {
    this.playerData.update(player, (data) => {
      data.coins += amount;
      return data;
    });
  }
}
```

| Method | Meaning |
| --- | --- |
| `get(player)` | the player's data, or `undefined` while it loads. Read only |
| `update(player, change)` | edit the copy you receive and return it |
| `onLoaded(callback)` | run when a player's data has finished loading |
| `onChanged(callback)` | run each time `update` changes a player's data |

**Saving something new later.** Edit `PlayerData.ts` and add the field in its two
places (the interface and `DEFAULT_PLAYER_DATA`); TypeScript refuses to compile if
you forget one. Players who already have a save get the default when they next
join.

**Testing in Studio.** DataStores only work in Studio when the place is
published and *Game Settings → Security → Enable Studio Access to API Services* is
on. Otherwise the module warns and keeps the data in memory for that session (it
is **not** saved), so you can keep testing. On a live server, if data cannot be
loaded, the player is sent back with a message instead of playing on a save that
would be lost or overwritten.

### `leaderstats`: show player data in the leaderboard

Shows chosen values (coins, level...) in Roblox's in-game player list, and keeps
them current. It needs [`player-data`](#player-data-save-each-players-progress)
first and reads its fields, so you pick from what you actually save.

```bash
rowork add:leaderstats                       # guided: tick the values to show
rowork add:leaderstats --stat coins --stat level
```

| Option | Effect |
| --- | --- |
| `--stat <field>` | a `PlayerData` field to show, repeatable. Default: every number field |

**File it adds:** `src/server/services/LeaderstatsService.ts`. It builds the
`leaderstats` folder Roblox looks for under each player when their data has
loaded, and refreshes it each time `PlayerDataService.update` changes the data.
You write nothing to keep it in sync.

**Showing another value later:** add its name to the `SHOWN` list at the top of
that file. Numbers, text and yes/no values are supported. The leaderboard is only
a display: read a player's value from `PlayerDataService`, never from the folder.

## Coming next

More chores everyone redoes: typed networking, player settings, notifications. See the [roadmap](roadmap.md).
