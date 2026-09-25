# The Growth Flywheel

A desktop foundation for TGF, built with Vue, TypeScript, and Vite.
It retains Argon's branding and the visual styling of the original LLB website.
The workspace includes Mining and Vaulting APY sliders initialized from a local mainnet snapshot.

## Development

Use Node.js 22 or newer and the Yarn 4 version pinned in `package.json`.
Enable Yarn through Corepack with `corepack enable` if needed.

```sh
yarn install --immutable
yarn dev
```

## Validation

```sh
yarn typecheck
yarn test
yarn build
yarn preview
```

The build includes TypeScript checking. `yarn test` compiles the simulation modules
into a temporary directory and runs the Node test runner without additional test
dependencies. There are no scheduled data-refresh jobs.

## Structure

- `src/App.vue`: desktop shell and workspace.
- `src/components/Header.vue`: Argon link, logo, and TGF title.
- `src/components/ApySlider.vue`: shared slider and moving details card.
- `src/lib/GrowthSimulation.ts`: direct-transfer preview and commit model shared by both sliders.
- `src/lib/exponentialTriggers.ts`, `vaultCalculator.ts`, `growthSimulatorPlayback.ts`,
  and `growthOperatorAccount.ts`: the website's growth simulation and playback code,
  with local imports. `currencyUtils.ts` supplies the same base-unit conversions.
- `src/index.css`: shared colors, typography, and workspace styling.
- `src/assets/`: Argon logo and a small set of reusable action icons.
- `public/`: existing Argon favicons.

The desktop shell has a minimum width of 1,224px. Smaller viewports scroll
horizontally; mobile layouts will be added with the new functionality.

## Refresh mainnet Mining APY

```sh
yarn update:argon
yarn build
```

The update command downloads the published mainnet snapshot from
`https://argon.network/data/argonBasics.mainnet.json`, validates the mining,
price, circulation, and timestamp inputs, and saves the complete snapshot to
`src/data/argonBasics.json`, preserving all fields. Failed downloads or
invalid responses leave the previous snapshot intact. Commit the refreshed JSON
and rebuild/redeploy to publish it; the build itself does not fetch data.

The slider imports this snapshot directly and converts the ten-day return to APY
using `((1 + miningTDR / 100) ** (365 / 10) - 1) * 100`, matching the website.
There are no runtime network requests, and the default reflects the saved snapshot's
timestamp (shown in the nib tooltip), not a live chain subscription. Moving the
slider changes only local state; reloading restores the snapshot default.

Global Network's Starting Value uses the snapshot's total market value in USD
divided by the Argon USD price, matching the website's GrowthSimulator. Its
fallback uses circulating Argon and Argonot values when the total is unavailable.

## Connected slider model

The sliders use a direct-transfer scenario, separate from the copied engine's
daily playback. Each phase starts from the last committed state and previews changes
without accumulating repeated transfers. Releasing and re-grabbing the same
slider keeps the phase reversible. Either slider can be used at any time. Switching
sides commits the current adjustment, even before its APY floor, and uses it as the
new baseline. Escape or a cancelled pointer restores only the active adjustment's
starting state. The header tracks elapsed days; there is no cycle counter. Reload
resets the scenario.

Lowering Mining APY solves the website's ten-day bid formula with fixed prices
and reward allocations. The vault receives the change in its share of auction
income, calculated by `vaultCalculator.ts`, and its APY increases.

Lowering Vaulting APY holds the phase's ten-day earnings fixed. Added Capital is
returned as principal, increasing Vaulting Payout by the same amount. Total capital
is `earnings / ((1 + APY / 100) ** (10 / 365) - 1)`, with a 53.99% APY floor.
Mining auction revenue increases earnings in a subsequent mining phase. TGF assumes each
additional ARGN of vault securitization funds one ARGN of prospective mining
rewards; total added vault capital includes the matching 2× ARGNOT allocation.

The column scenario retains fixed prices and prospective reward allocations.
Network totals and Days use a separate replay of the original daily growth engine,
including ARGN/ARGNOT issuance, ARGN burns, BTC-backed issuance, and ARGNOT repricing.
Each phase caches daily engine states. Mining slider progress (log APY) and vaulting
slider progress (added capital fraction) preview that timeline, interpolating network
metrics between daily settlements. Fractional days are previews, not extra mint events.
Switching sides preserves the exact previewed time and network values. If the switch
occurs partway through a day, the pending daily settlement finishes under its original
rules before subsequent days use the new side. Unvisited future days are discarded.
Reversing or cancelling restores the active adjustment's baseline. Transfers are never added to circulation a second time.
Operator balances are unchanged; personal portfolio figures remain placeholders. The cards
show the changes since the start of the active phase. A receiving
slider can rise above its snapshot default; a dragged slider cannot rise above
its value at the start of that phase. Mining has a 53.3% floor; vaulting has a 53.99% floor. At the start of each phase, the receiving
scale is sized for its projected APY when the active slider reaches the floor,
with headroom, and stays fixed during adjustments. Displayed APYs use the website's 1T% display cap.

Mining slider positions use a logarithmic APY scale. The vaulting slider uses a
linear added-capital fraction so its thumb follows the shaded fill.
Keyboard arrows move 0.1% of the track; End reaches the floor and Home restores
the active phase's starting APY. Added amounts are shown separately from the
phase's base capital and payout columns, with proportional fills. Transfers are
shown in argon equivalents, and chevron arrows indicate their direction.
