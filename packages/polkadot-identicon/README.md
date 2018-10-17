# polkadot-identicon

A Polkadot-themed SS58 identicon

## usage

To install the component, do `npm install --save polkadot-identicon`

Inside a React component, you can now render any Polkadot account with the associated icon -

```js
import Identicon from 'polkadot-identicon';

...
render () {
	// address is either string (ss58-encoded address) or Uint8Array (publicKey)
	const { address } = this.props;
	// size is a number, indicating the size (in pixels)
	const size = 32;

	return (
		<Identicon
			className='my-class'
			id={address}
			size={size}
		/>
	);
}
...
```
