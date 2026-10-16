# Exponential Growth Engine

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

## Deployment

Run `yarn deploy` to build the app, including TypeScript checking, and publish
`dist` to the `gh-pages` branch of this repository's `origin` remote. This uses
the same deployment command as UDS and requires Git push access to the repository.

In the repository's GitHub Pages settings, select deployment from the `gh-pages`
branch and the `/ (root)` folder after the first deployment creates the branch.
The current asset paths assume hosting at the root of a domain, as UDS does.
For GitHub's project URL (`https://argonprotocol.github.io/ege/`), set
`base: '/ege/'` in `vite.config.ts` before deploying. For a custom domain, configure
it in GitHub Pages and add its hostname to `public/CNAME` so deployments preserve it.

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

The competition sliders select actual daily settlements from the growth engine.
Mining settlements add competing miners at the existing bid per miner. Aggregate
bids rise and the fixed network rewards are shared across more miners. The final
integer cohort may cross below the APY benchmark; bids are not repriced to force
an exact endpoint APY.
The diagram, circulation, prices, elapsed days, and simulated ₳10,000 portfolio
all use the same settled state. The portfolio starts with a 50/50 mining/vaulting
allocation and receives that state's daily income; APY is not compounded into
its balance directly.

Current circulation equals starting circulation plus mining issuance plus
BTC-backed issuance minus burned Argons. Mining bids, Argon vault collateral,
and bond allocations use existing circulation, excluding the 10% liquid reserve.
Unfunded allocations remain requests for later mining issuance; pending requests
are not circulating supply. The header disclosure shows the issuance and burns.

Securitization is combined vault collateral: Argons plus the Argon-equivalent
value of Argonots. The snapshot does not provide separate vault Argonot holdings,
so the engine assumes Argonot collateral worth twice the Argon collateral. The
securitization tooltip shows both components and this assumption. Converted
Argonot value is not counted as circulating Argons.

Each slider phase caches daily previews. The mining slider selects exact whole
miner counts; arrow keys add or remove one miner. The engine limits each day's
recruitment and settles only the days needed to reach that count. The BTC slider
selects fractional BTC amounts; arrow keys move 0.1% along its logarithmic track.
BTC issuance uses the actual bounded deposit, and the final day's vault collateral
growth is limited to the requested portion. End selects the
phase endpoint, and Home restores its baseline. Re-grabbing the same side keeps that
baseline reversible. Switching sides starts a new phase from the selected day.
A continuous drag is one Undo action; replay restores network and portfolio
accounting without double minting.

The 53.99% APY benchmark limits each adjustment; engine settlements can finish
below it. Competition may stop increasing before that benchmark, especially
when BTC reaches the scenario's 17.5M cap. An explicit Advance one day control
continues the existing reward and bid adjustments when competition cannot grow.
Daily advances are also Undo actions. Days never advance with wall-clock time.
Reloading or restarting restores the saved snapshot.
