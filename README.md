# oo7 Suite

[![Build Status](https://travis-ci.org/paritytech/oo7.svg?branch=master)](https://travis-ci.org/paritytech/oo7)

[![npm:oo7](https://img.shields.io/npm/v/oo7.svg)](https://www.npmjs.com/package/oo7)
[![npm:oo7-parity](https://img.shields.io/npm/v/oo7-parity.svg)](https://www.npmjs.com/package/oo7-parity)
[![npm:oo7-react](https://img.shields.io/npm/v/oo7-react.svg)](https://www.npmjs.com/package/oo7-react)


The `oo7` suite consists of three independent packages:

- [oo7](./packages/oo7/) - Reactive Bonds
- [oo7-parity](./packages/oo7-parity) - Bonds bindings for Ethereum objects
- [oo7-react](./packages/oo7-react) - React components to display Bonds

# Documentation

[Documentation](https://paritytech.github.io/oo7/class/packages/oo7-parity/src/index.js~Bonds.html#instance-member-accounts) to all three packages can be found [here](https://paritytech.github.io/oo7/)

# Examples

### oo7
```js
// npm i oo7
import {TimeBond} from 'oo7'


// Initialize the bond
const bond = new TimeBond()
bond
    .map(t => new Date(t))
    .tie(date => console.log(`${date}`))
    // Wed Oct 11 2017 12:14:56 GMT+0200 (CEST)

```

### oo7-parity
```js
// npm i oo7-parity
import {Bonds, formatBalance} from 'oo7-parity'

const bonds = Bonds()

bonds.balance(bonds.me)
    .map(formatBalance)
    .tie(console.log) // 4.45 ETH
```

### oo7-react
```js
import ReactDOM from 'react-dom'
import React, { Component } from 'react'

// Import reactive element
import {Rspan} from 'oo7-react'
import {Bonds, formatBalance} from 'oo7-parity'

const bonds = new Bonds()

class App extends Component {
  render() {
    // Simply render bonds
    return (
      <div>
          <Rspan>
            {bonds.me} has 
            {bonds.balance(bonds.me).map(formatBalance)}
          </Rspan>
      </div>
    );
  }
}

ReactDOM.render(<App />, document.querySelector('body'))
```

