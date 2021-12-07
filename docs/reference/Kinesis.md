---
title: Basic Examples
---
# Kinesis SDK Example

`@abx/js-kinesis-sdk` is published as private package. Hence, you need to configure your `.npmrc` as follow:

```
# .npmrc
@abx:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

Then `npm install @abx/js-kinesis-sdk@9.1.0-beta.4`

- [Creating a payment Transaction](#creating-a-payment-transaction)
- [Loading an account's transaction history](#loading-an-accounts-transaction-history)
- [Streaming payment events](#streaming-payment-events)


## Breaking Change

- `Network.use()` is no longer supported
- `Network.current()` is not longer supported
- If you code relied read `TransactionResponse` and making use of `fee_paid` beware later version horizon renamed `fee_paid` to `fee_charged` a recommend work around is to secure your retrieval logic like so `(transaction["fee_paid"] || transaction.fee_charged)`
## Server

```javascript
// import sdk
const KinesisSdk = require('@abx/js-kinesis-sdk');

// Configure KinesisSdk to talk to the horizon instance
const server = new KinesisSdk.Server('https://kag-testnet.kinesisgroup.io', {
  v1: false, // required to work with KAU/KAG horizon endpoint v0.9.x
});

// Right now, there's built-in function for fetching base fee.
// it relies on `v1` feature flag when we create a new server object.
const fee = await server.fetchBaseFee();
```

## TransactionBuilder

```javascript
  // Using the following snippet to build transaction that can be submit
  // to legacy horizon endpoint
  const transaction = new KinesisSdk.TransactionBuilder(account, {
      fee,
      networkPassphrase: 'Kinesis KAG UAT',
      v1: false, // required to work with KAU/KAG horizon endpoint v0.9.x
    })
    // Add a payment operation to the transaction
    .addOperation(
      // ...
    )
    .setTimeout(30) // required!!! make this transaction valid for the next 30 seconds only
    .build();
```

## Creating a payment transaction

The `@abx/js-kinesis-sdk` exposes the [`TransactionBuilder`](https://stellar.github.io/js-stellar-base/TransactionBuilder.html) class from `@abx/js-stellar-base`.  There are more examples of [building transactions here](https://github.com/stellar/js-stellar-base/blob/master/docs/reference/base-examples.md). All those examples can be signed and submitted to Stellar in a similar manner as is done below.

In this example, the destination account must exist. The example is written
using modern Javascript, but `await` calls can also be rendered with promises.

```javascript
// Create, sign, and submit a transaction using JS Kinesis SDK.
const KinesisSdk = require('@abx/js-kinesis-sdk');

// The source account is the account we will be signing and sending from.
const sourceSecretKey = 'SCZANGBA5YHTNYVVV4C3U252E2B6P6F5T3U6MM63WBSBZATAQI3EBTQ4';

// Derive Keypair object and public key (that starts with a G) from the secret
const sourceKeypair = KinesisSdk.Keypair.fromSecret(sourceSecretKey);
const sourcePublicKey = sourceKeypair.publicKey();

const receiverPublicKey = 'GAIRISXKPLOWZBMFRPU5XRGUUX3VMA3ZEWKBM5MSNRU3CHV6P4PYZ74D';

// Configure KinesisSdk to talk to the horizon instance
const server = new KinesisSdk.Server('https://kag-testnet.kinesisgroup.io', {
  v1: false, // required to work with KAU/KAG horizon endpoint v0.9.x
});

(async function main() {
  // Transactions require a valid sequence number that is specific to this account.
  // We can fetch the current sequence number for the source account from Horizon.
  const account = await server.loadAccount(sourcePublicKey);

  // Right now, there's one function that fetches the base fee.
  // In the future, we'll have functions that are smarter about suggesting fees.
  const fee = await server.fetchBaseFee();

  const transaction = new KinesisSdk.TransactionBuilder(account, {
      fee,
      networkPassphrase: 'Kinesis KAG UAT',
      v1: false, // required to work with KAU/KAG horizon endpoint v0.9.x
    })
    // Add a payment operation to the transaction
    .addOperation(KinesisSdk.Operation.payment({
      destination: receiverPublicKey,
      // The term native asset refers to lumens
      asset: KinesisSdk.Asset.native(),
      // Specify 350.1234567 lumens. Lumens are divisible to seven digits past
      // the decimal. They are represented in JS Kinesis SDK in string format
      // to avoid errors from the use of the JavaScript Number data structure.
      amount: '350.1234567',
    }))
    // Make this transaction valid for the next 30 seconds only
    .setTimeout(30)
    .addMemo(KinesisSdk.Memo.text('Hello world!'))
    .build();

  // Sign this transaction with the secret key
  // NOTE: signing is transaction is network specific. Test network transactions
  // won't work in the public network.
  transaction.sign(sourceKeypair);

  // Let's see the XDR (encoded in base64) of the transaction we just built
  console.log(transaction.toEnvelope().toXDR('base64'));

  // Submit the transaction to the Horizon server. The Horizon server will then
  // submit the transaction into the network for us.
  try {
    const transactionResult = await server.submitTransaction(transaction);
    console.log(JSON.stringify(transactionResult, null, 2));
    console.log('\nSuccess! View the transaction at: ');
    console.log(transactionResult._links.transaction.href);
  } catch (e) {
    console.log('An error has occured:');
    console.log(e);
  }
})();
```

## Loading an account's transaction history

Let's say you want to look at an account's transaction history.  You can use the `transactions()` command and pass in the account address to `forAccount` as the resource you're interested in.

```javascript
const KinesisSdk = require('@abx/js-kinesis-sdk')
const server = new KinesisSdk.Server('https://kag-testnet.kinesisgroup.io', { v1: false });
const accountId = 'GBBORXCY3PQRRDLJ7G7DWHQBXPCJVFGJ4RGMJQVAX6ORAUH6RWSPP6FM';

server.transactions()
    .forAccount(accountId)
    .call()
    .then(function (page) {
        console.log('Page 1: ');
        console.log(page.records);
        return page.next();
    })
    .then(function (page) {
        console.log('Page 2: ');
        console.log(page.records);
    })
    .catch(function (err) {
        console.log(err);
    });
```

## Streaming payment events

@abx/js-kinesis-sdk provides streaming support for Horizon endpoints using `EventSource`.  You can pass a function to handle any events that occur on the stream.

Try submitting a transaction (via the guide above) while running the following code example.
```javascript
const KinesisSdk = require('@abx/js-kinesis-sdk')
const server = new KinesisSdk.Server('https://kag-testnet.kinesisgroup.io', { v1: false });

// Get a message any time a payment occurs. Cursor is set to "now" to be notified
// of payments happening starting from when this script runs (as opposed to from
// the beginning of time).
const es = server.payments()
  .cursor('now')
  .stream({
    onmessage: function (message) {
      console.log(message);
    }
  })
```

For more on streaming events, please check out [the Horizon documentation](https://developers.stellar.org/api/introduction/streaming/) and this [guide to server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).
