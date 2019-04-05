const { Bond } = require('oo7')
const { blake2b } = require('blakejs')
const { SubscriptionBond } = require('./subscriptionBond')
const { encode } = require('./codec')
const { secretStore } = require('./secretStore')
const { TransactionEra, AccountIndex } = require('./types')
const { runtimeUp, runtime, chain } = require('./bonds')
const { bytesToHex } = require('./utils')

class TransactionBond extends SubscriptionBond {
	constructor (data) {
		super('author_submitAndWatchExtrinsic', ['0x' + bytesToHex(data)], null, {sending: true})
	}
}

function composeTransaction (sender, call, index, era, checkpoint, senderAccount, compact) {
	return new Promise((resolve, reject) => {
		if (typeof sender == 'string') {
			sender = ss58Decode(sender)
		}
		if (sender instanceof Uint8Array && sender.length == 32) {
			senderAccount = sender
		} else if (!senderAccount) {
			reject(`Invalid senderAccount when sender is account index`)
		}
		console.log("composing transaction", senderAccount, index, call, era, checkpoint);
		let e = encode([
			index, call, era, checkpoint
		], [
			'Compact<Index>', 'Call', 'TransactionEra', 'Hash'
		])

		let legacy = runtime.version.isReady() && (
			runtime.version._value.specName == 'node' && runtime.version._value.specVersion < 17
			|| runtime.version._value.specName == 'polkadot' && runtime.version._value.specVersion < 107
		)
		if (!legacy && e.length > 256) {
			console.log(`Oversize transaction (length ${e.length} bytes). Hashing.`)
			e = blake2b(e, null, 32)
		}
	
		let signature = secretStore().sign(senderAccount, e)
		console.log("encoding transaction", sender, index, era, call);
		let signedData = encode(encode({
			_type: 'Transaction',
			version: 0x81,
			sender,
			signature,
			index,
			era,
			call
		}), 'Vec<u8>')
		console.log("signed:", bytesToHex(signedData))
		setTimeout(() => resolve(signedData), 1000)
	})
}

// tx = {
//   sender
//   call
//   longevity?
//   index?
// }
function post(tx) {
	return Bond.all([tx, chain.height, runtimeUp]).map(([o, height, unused]) => {
		if (o instanceof Uint8Array) {
			// already assembled and signed
			return o
		}
		
		console.log("Posting:", o, height)

		let {sender, call, index, longevity, compact} = o
		// defaults
		longevity = typeof longevity === 'undefined' ? 256 : longevity
		compact = typeof compact === 'undefined' ? true : compact
		
		let senderIsIndex = typeof sender === 'number' || sender instanceof AccountIndex

		let senderAccount = senderIsIndex
			? runtime.indices.lookup(sender)
			: sender
		if (senderIsIndex && !compact) {
			sender = senderAccount
		}
	
		let era
		let eraHash
		if (longevity === true) {
			era = new TransactionEra;
			eraHash = chain.hash(0)
		} else {
			// use longevity with height to determine era and eraHash
			let l = Math.min(15, Math.max(1, Math.ceil(Math.log2(longevity)) - 1))
			let period = 2 << l
			let factor = Math.max(1, period >> 12)
			let Q = (n, d) => Math.floor(n / d) * d
			let eraNumber = Q(height, factor)
			let phase = eraNumber % period
			era = new TransactionEra(period, phase)
			eraHash = chain.hash(eraNumber)
		}
		return {
			sender,
			call,
			era,
			eraHash,
			index: index || runtime.system.accountNonce(senderAccount),
			senderAccount,
			compact
		}
	}, 2).latched(false).map(o => 
		o && (o instanceof Uint8Array ? o : composeTransaction(o.sender, o.call, o.index, o.era, o.eraHash, o.senderAccount, o.compact))
	).map(composed => {
		return composed ? new TransactionBond(composed) : { signing: true }
	})
}

module.exports = { composeTransaction, post, TransactionBond };