oo7-parity
=========

A library to provide `Bond`-related functionality for the Parity Ethereum
implementation and other compatible systems.

See the [oo7-parity reference](https://github.com/paritytech/parity/wiki/oo7-Parity-Reference)
for more information on usage.

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

In lieu of a formal style guide, take care to maintain the existing coding style.
Add unit tests for any new or changed functionality. Lint and test your code.

## Release History

* 0.1.2 Add contract reading bonds
* 0.1.1 Initial release
