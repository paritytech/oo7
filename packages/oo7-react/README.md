oo7-react
=========

A small library to provide integration between React and `Bond`s.

Provides two React components: `ReactiveComponent` and `Reactive`. The first
provides an alternative to `React.Component` for classes whose state shall
depend on `Bond`ed expressions. It allows `Bond`s and `Promise`s
and plain data to be passed in as one or more named props (the names are passed
in the constructor) or explicitly as fields in the constructors. In both cases,
these reactive values show up as plain values of the same name in `this.state`.

`Reactive` is an alternative to `span` but allows you to provide reactive values
rather than plain data. For the `value` (used instead of child elements),
`className` and `id` props, the value can be a `Bond`, `Promise` or plain data.
The element will stay updated to the latest value of each expression.

## Installation

```sh
  npm install oo7-react --save
```

## Usage

```javascript
  // Assume React is already required.
  var oo7react = require('oo7-react'),
      setupBonds = oo7parity.setupBonds,
	  formatBlockNumber = oo7parity.formatBlockNumber;

  class DateFormatter extends ReactiveComponent {
	  constructor() {
		  // Tell the object to look out for 'date' prop and keep the 'date'
		  // state up to date.
		  super(['date']);
	  }
	  render() {
		  return this.state.date === null ?
		    <div>Date unknown</div> :
		    <div>The date is {this.state.date}</div>;
	  }
  }

  class App extends React.Component {
	  render() {
		  // Evaluates to a pretty datetime.
		  let b = (new TimeBond).map(t => new Date(t) + '');
		  // Prints two clocks. They both print the time and stay up to date.
		  return (<div>
			  <DateFormatter date={b} />
			  <div>The date is: <Reactive value={b} /></div>
			</div>)
	  }
  }
```

## Tests

```sh
  npm test
```

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style.
Add unit tests for any new or changed functionality. Lint and test your code.

## Release History

* 0.1.2 Add components
* 0.1.1 Initial release
