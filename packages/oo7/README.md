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
  t.tie(console.log);

  // Prints the formatted date every second.
  new TransformBond(x => new Date(x), [t]).tie(console.log);
```

## Tests

```sh
  npm test
```

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style.
Add unit tests for any new or changed functionality. Lint and test your code.

For development, a number of git hooks are provides that allow you to ensure tightly
couple packages remain locally referenced at development time and switched to the
proper version at commit/publish time. Simply copy all files from hooks into the git
hook path:

   cp hooks/* .git/hooks

NPM's publishing functionality automatically ensures packages reference the latest
of their dependencies in the tightly-coupled group, and bumps the patch version after
publication.

For all of this to work, ensure this, `oo7-parity`, `oo7-react` and `parity-reactive-ui`
all exist in the same parent directory.

## Release History

* 0.1.2
* 0.1.1 Minor fix.
* 0.1.0 Initial release
