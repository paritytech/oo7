const { Bond, TransformBond } = require('oo7')
const { ss58Encode, ss58Decode } = require('../ss58')
const { AccountId, AccountIndex } = require('../types')

function fixedBond(b) {
	r = new Bond
	r.trigger(b)
	return r
}

function isId(id) {
	return id instanceof AccountId || (id instanceof Uint8Array && id.length == 32)
}

function isIndex(index) {
	return index instanceof AccountIndex || typeof index === 'number'
}

function augment(runtime, chain) {
	let indices = runtime.indices
	if (indices._extras) {
		return
	} else {
		indices._extras = true
	}

	indices.lookup = indexBond => new TransformBond(index =>
		isIndex(index) || typeof(index) === 'number'
		? indices.enumSet(new AccountIndex(Math.floor(index / 64))).map(items => items[index % 64])
		: null,
		[indexBond]
	)

	indices.accounts = indices.nextEnumSet.map(last =>
		[...new Array(last + 1)].map((_, i) => indices.enumSet(i))
	).map(sets => {
		let res = {}
		sets.forEach((items, i) => 
			items.forEach((item, j) =>
				res[ss58Encode(item)] = i * 64 + j
			)
		)
		return res
	}).subscriptable()

	indices.tryIndex = (id, whenNone = id) => {
		if (!id) {
			console.warn("bad identity passed to tryIndex", id)
			return undefined
		}
		return new TransformBond((accounts, id, whenNone) => {
			if (!id) {
				console.warn("bad identity resolved to tryIndex", id)
				return undefined
			}
			if (typeof id === 'string') {
				id = ss58Decode(id)
			}
			if (isId(id)) {
				let i = accounts[ss58Encode(id)]
				return isIndex(i)
					? new AccountIndex(i)
					: whenNone
			} else {
				return whenNone
			}
		}, [indices.accounts, id, whenNone], [], 3, 3, undefined, false)
	}

	indices.ss58Encode = (address, type, csLength, length) => new TransformBond((address, id, index, type, csLength, length) => {
		if (isIndex(address)) {
			index = address
		}
		if (isId(address)) {
			id = address
		}
		if (!isId(id) || !(isIndex(index) || isId(index))) {
			return null
		}
		return ss58Encode(index, type || undefined, csLength || undefined, length || undefined, id)
	}, [address, indices.lookup(address), indices.tryIndex(address), type || null, csLength || null, length || null], [], 3, 3, undefined, false)

	indices.ss58Decode = address => {
		try {
			let indexOrId = ss58Decode(address, index => { throw {index} })
			if (isId(indexOrId)) {
				return fixedBond(indexOrId)
			} else {
				return indices.lookup(indexOrId)
			}
		}
		catch (indexToLookup) {
			return indices.lookup(indexToLookup.index).map(id => {
				return ss58Decode(address, id) === null ? null : id
			})
		}
	}
}

module.exports = { augment }