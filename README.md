<div align="center">
  <img alt="Stellar" src="https://github.com/bullioncapital/.github/raw/main/stellar-logo.png" width="558" />
  <br/>
  <strong>Creating equitable access to the global financial system</strong>
  <h1>@abx/js-kinesis-sdk</h1>
</div>

`@abx/js-kinesis-sdk` is a Javascript library for communicating with a
[Stellar Horizon server](https://github.com/stellar/go/tree/master/services/horizon).
It is used for building Stellar apps either on Node.js or in the browser.

It provides:

- a networking layer API for Horizon endpoints.
- facilities for building and signing transactions, for communicating with a
  Stellar Horizon instance, and for submitting transactions or querying network
  history.

### stellar-sdk vs stellar-base

@abx/js-kinesis-sdk is a high-level library that serves as client-side API for Horizon.
[@abx/js-kinesis-base](https://github.com/bullioncapital/js-kinesis-base) is lower-level
library for creating Stellar primitive constructs via XDR helpers and wrappers.

**Most people will want @abx/js-kinesis-sdk instead of @abx/js-kinesis-base.** You should only
use stellar-base if you know what you're doing!

If you add `stellar-sdk` to a project, **do not add `stellar-base`!** Mis-matching
versions could cause weird, hard-to-find bugs. `stellar-sdk` automatically
installs `stellar-base` and exposes all of its exports in case you need them.

> **Important!** The Node.js version of the `@abx/js-kinesis-base` (`@abx/js-kinesis-sdk` dependency) package
> uses the [`sodium-native`](https://www.npmjs.com/package/sodium-native) package as
> an [optional dependency](https://docs.npmjs.com/files/package.json#optionaldependencies). `sodium-native` is
> a low level binding to [libsodium](https://github.com/jedisct1/libsodium),
> (an implementation of [Ed25519](https://ed25519.cr.yp.to/) signatures).
> If installation of `sodium-native` fails, or it is unavailable, `stellar-base` (and `stellar-sdk`) will
> fallback to using the [`tweetnacl`](https://www.npmjs.com/package/tweetnacl) package implementation.
>
> If you are using `@abx/js-kinesis-sdk`/`@abx/js-kinesis-base` in a browser you can ignore
> this. However, for production backend deployments you should be
> using `sodium-native`. If `sodium-native` is successfully installed and working the
> `StellarSdk.FastSigning` variable will return `true`.

## Installation

### To use as a module in a Node.js project

Using npm or yarn to include `@abx/js-kinesis-sdk` in your own project

```shell
npm install --save @abx/js-kinesis-sdk
# or
yarn add --save @abx/js-kinesis-sdk
```

### To develop and test js-kinesis-sdk itself

1. Clone the repo:

```shell
git clone https://github.com/bullioncapital/js-kinesis-sdk.git
```

2. Install dependencies inside js-stellar-sdk folder:

```shell
cd js-kinesis-sdk
yarn
```

3. Install Node 18

Because we support the latest maintenance version of Node, please install and develop on Node 18 so you don't get surprised when your code works locally but breaks in CI.

Here's how to install `nvm` if you haven't: https://github.com/creationix/nvm

```shell
nvm install

# if you've never installed 18 before you'll want to re-install yarn
npm install -g yarn
```

If you work on several projects that use different Node versions, you might it
helpful to install this automatic version manager:
https://github.com/wbyoung/avn

4. Observe the project's code style

While you're making changes, make sure to run the linter-watcher to catch any
linting errors (in addition to making sure your text editor supports ESLint)

```shell
yarn fmt
```

## Testing

To run all tests:

```shell
yarn test
```

To run a specific set of tests:

```shell
yarn test:node
yarn test:browser
yarn test:integration
```

To generate and check the documentation site:

```shell
# install the `serve` command if you don't have it already
npm install -g serve

# generate the docs files
npm run docs

# get these files working in a browser
cd jsdoc && serve .

# you'll be able to browse the docs at http://localhost:5000
```

## Contributing

For information on how to contribute, please refer to our
[contribution guide](https://github.com/bullioncapital/js-kinesis-sdk/blob/main/CONTRIBUTING.md).

## Publishing to npm

- Update `package.json` version
- Publish new release via GitHub release

## License

@abx/js-stellar-sdk is licensed under an Apache-2.0 license. See the
[LICENSE](https://github.com/bullioncapital/js-kinesis-sdk/blob/master/LICENSE) file
for details.
