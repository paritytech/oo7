oo7-parity
=========

A small library to provide `Bond`-related functionality for the Parity
Ethereum library.

Provides two additional `Bond`s: `Transaction` which is constructed with the
standard transaction object syntax `{from: ..., to: ..., ...}` and returns a
`Bond` which tracks the transaction's status through the pipeline, evaluating to
an object with exactly one field defined from `requested`, `signed`, `confirmed`
and `failed`. In each case the value is a piece of information relevant to its
context.

The second `Bond` is `SubscriptionBond` and simply evaluates to the most recent
value returned by the subscription. Subscriptions take no parameters, so neither
does this `Bond` constructor.

Finally, the module contains a `setupBonds` function, which returns an object
containing bonds reflecting various portions of the Ethereum/Parity state. To
call it, the `parity` API object must be passed.
## Installation

```sh
  npm install oo7-parity --save
```

## Usage

```javascript
  var oo7parity = require('oo7-parity'),
      setupBonds = oo7parity.setupBonds,
	  formatBlockNumber = oo7parity.formatBlockNumber;

  // We assume parity has been polluted into the global namespace.
  parity.bonds = setupBonds(parity.api);

  // Prints a nicely formatted block number each time there's a new block.
  parity.bonds.blockNumber.map(formatBlockNumber).subscribe(console.log);
```

## Tests

```sh
  npm test
```

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style.
Add unit tests for any new or changed functionality. Lint and test your code.

## Release History

* 0.1.2 Add contract reading bonds
* 0.1.1 Initial release
