oo7
=========

A small library providing what might be termed as reactive expressions, `Bond`s
(hence the name). Classes deriving from `Bond` are expected to determine when
their value has changed and call `trigger` accordingly.

`TimeBond` is provided as a simple expression type which evaluates to the
current time and triggers an update once per second.

Expressions can be composed through `TransformBond`, which allows both argument
dependencies (that get passed into the combination transform) and non-argument
dependencies (which do not). For its dependencies, `TransformBond` is able to
work with basic values, `Promise`s and other `Bonds` abstractly.

## Installation

```sh
  npm install oo7 --save
```

## Usage

```javascript
  var oo7 = require('oo7'),
      Bond = oo7.Bond,
      TimeBond = oo7.TimeBond,
	  TransformBond = oo7.TransformBond;

  let t = new TimeBond;

  // Prints the Unix time every second.
  t.subscribe(console.log);

  // Prints the formatted date every second.
  new TransformBond(x => new Date(x), [t]).subscribe(console.log);
```

## Tests

```sh
  npm test
```

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style.
Add unit tests for any new or changed functionality. Lint and test your code.

## Release History

* 0.1.2
* 0.1.1 Minor fix.
* 0.1.0 Initial release
