const { Bond, TransformBond } = require('oo7')
const { ss58_encode } = require('ss58')
const { AccountId, AccountIndex, Balance } = require('../types')

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

	balances.lookupIndex = index => balances.enumSet(new AccountIndex(Math.floor(index / 64))).map(items => items[index % 64])

	balances.accounts = balances.nextEnumSet.map(last =>
		[...new Array(last + 1)].map((_, i) => balances.enumSet(i))
	).map(sets => {
		let res = {}
		sets.forEach((items, i) => 
			items.forEach((item, j) =>
				res[ss58_encode(item)] = i * 64 + j
			)
		)
		return res
	}).subscriptable()

	balances.tryIndex = id => new TransformBond((accounts, id) => {
		if (id instanceof AccountId || (id instanceof Uint8Array && id.length == 32)) {
			let i = accounts[ss58_encode(id)]
			return typeof i === 'number' || i instanceof AccountIndex
				? new AccountIndex(i)
				: id
		} else {
			return id
		}
	}, [balances.accounts, id], [], 3, 3, undefined, false)
}

module.exports = { augment }