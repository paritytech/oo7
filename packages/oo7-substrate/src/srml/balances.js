const { Bond, TransformBond } = require('oo7')
const { ss58Encode } = require('../ss58')
const { AccountId, AccountIndex, Balance } = require('../types')

function fixedBond(b) {
	r = new Bond
	r.trigger(b)
	return r
}

function augment(runtime, chain) {
	let balances = runtime.balances
	if (balances._extras) {
		return
	} else {
		balances._extras = true
	}

	balances.balance = who => Bond
		.all([balances.freeBalance(who), balances.reservedBalance(who)])
		.map(([f, r]) => new Balance(f + r));
	balances.totalBalance = balances.balance;

	balances.lookupIndex = indexBond => new TransformBond(index =>
		index instanceof AccountIndex || typeof(index) === 'number'
		? balances.enumSet(new AccountIndex(Math.floor(index / 64))).map(items => items[index % 64])
		: null,
		[indexBond]
	)

	balances.accounts = balances.nextEnumSet.map(last =>
		[...new Array(last + 1)].map((_, i) => balances.enumSet(i))
	).map(sets => {
		let res = {}
		sets.forEach((items, i) => 
			items.forEach((item, j) =>
				res[ss58Encode(item)] = i * 64 + j
			)
		)
		return res
	}).subscriptable()

	balances.tryIndex = (id, whenNone = id) => new TransformBond((accounts, id, whenNone) => {
		if (typeof id === 'string') {
			id = ss58Decode(id)
		}
		if (id instanceof AccountId || (id instanceof Uint8Array && id.length == 32)) {
			let i = accounts[ss58Encode(id)]
			return (typeof i === 'number' || i instanceof AccountIndex)
				? new AccountIndex(i)
				: whenNone
		} else {
			return whenNone
		}
	}, [balances.accounts, id, whenNone], [], 3, 3, undefined, false)

	balances.ss58Encode = (address, type, csLength, length) => new TransformBond((address, id, index, type, csLength, length) => {
		if (address instanceof AccountIndex) {
			index = address
		}
		if (address instanceof AccountId) {
			id = address
		}
		if (!(id instanceof AccountId) || !(index instanceof AccountIndex || index instanceof AccountId)) {
			return null
		}
		return ss58Encode(index, type || undefined, csLength || undefined, length || undefined, id)
	}, [address, balances.lookupIndex(address), balances.tryIndex(address), type || null, csLength || null, length || null], [], 3, 3, undefined, false)

	balances.ss58Decode = address => {
		try {
			let indexOrId = ss58Decode(address, index => { throw {index} })
			if (indexOrId instanceof AccountId) {
				return fixedBond(indexOrId)
			} else {
				return balances.lookupIndex(indexOrId)
			}
		}
		catch (indexToLookup) {
			return balances.lookupIndex(indexToLookup.index).map(id => {
				return ss58Decode(address, id) === null ? null : id
			})
		}
	}
}

module.exports = { augment }