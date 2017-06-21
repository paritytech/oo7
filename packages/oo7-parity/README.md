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
      bonds = oo7parity.bonds,
	  formatBlockNumber = oo7parity.formatBlockNumber;

  // Prints a nicely formatted block number each time there's a new block.
  bonds.blockNumber.map(formatBlockNumber).tie(console.log);
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
