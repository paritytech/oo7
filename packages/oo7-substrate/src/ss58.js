const bs58 = require('bs58')
const { blake2b } = require('blakejs')
const { toLE, leToNumber, stringToBytes } = require('./utils')
const { AccountIndex, AccountId } = require('./types')

let defaultType = 42
const KNOWN_TYPES = [0, 1, 42, 43, 68, 69]

const PREFIX = stringToBytes('SS58PRE')

function setNetworkDefault(type) {
	defaultType = type
}

function ss58Encode(a, type = defaultType, checksumLength = null, length = null, accountId) {
	let payload
	if (KNOWN_TYPES.indexOf(type) === -1) {
		throw new Error('Unknown ss58 address type', type)
	}
	if (typeof a === 'number' || a instanceof AccountIndex) {
		let minLength = (a < (1 << 8) ? 1 : a < (1 << 16) ? 2 : a < (1 << 32) ? 4 : 8)
		length = length ? length : minLength
		if ([1, 2, 4, 8].indexOf(length) === -1) {
			throw new Error('Invalid length')
		}
		length = Math.max(minLength, length)
		if (checksumLength && typeof checksumLength !== 'number') {
			throw new Error('Invalid checksum length')
		}
		switch (length) {
			case 1: { checksumLength = 1; break; }
			case 2: { checksumLength = ([1, 2].indexOf(checksumLength) + 1) || 1; break; }
			case 4: { checksumLength = ([1, 2, 3, 4].indexOf(checksumLength) + 1) || 1; break; }
			case 8: { checksumLength = ([1, 2, 3, 4, 5, 6, 7, 8].indexOf(checksumLength) + 1) || 1; break; }
		}
		payload = toLE(a, length)
	} else if ((a instanceof AccountId || a instanceof Uint8Array) && a.length === 32) {
		checksumLength = 2
		payload = a
		accountId = a
	} else {
		throw new Error('Unknown item to encode as ss58. Passing back.', a)
	}
	let hash = blake2b(new Uint8Array([...PREFIX, ...((type & 1) ? accountId : new Uint8Array([type, ...payload]))]))
	let complete = new Uint8Array([type, ...payload, ...hash.slice(0, checksumLength)])
	return bs58.encode(Buffer.from(complete))
}

/// `lookupIndex` must be synchronous. If you can do that, then throw, catch outside the
/// invocation and then retry once you have the result to hand.
function ss58Decode(ss58, lookupIndex) {
	let a
	try {
		a = bs58.decode(ss58)
	}
	catch (e) {
		return null
	}

	let type = a[0]
	if (KNOWN_TYPES.indexOf(type) === -1) {
		return null
	}

	if (a.length < 3) {
		return null
		//throw new Error('Invalid length of payload for address', a.length)
	}
	let length = a.length <= 3
		? 1
		: a.length <= 5
		? 2
		: a.length <= 9
		? 4
		: a.length <= 17
		? 8
		: 32
	let checksumLength = a.length - 1 - length

	let payload = a.slice(1, 1 + length)
	let checksum = a.slice(1 + a.length)

	let accountId
	if (length === 32) {
		accountId = payload
	}

	let result = length < 32
		? new AccountIndex(leToNumber(payload))
		: new AccountId(payload)

	if (a[0] % 1 && !accountId && !lookupIndex) {
		return null
	}
	let hash = blake2b(new Uint8Array([...PREFIX , ... (a[0] % 1 ? (accountId || lookupIndex(result)) : a.slice(0, 1 + length))]))

	for (var i = 0; i < checksumLength; ++i) {
		if (hash[i] !== a[1 + length + i]) {
			// invalid checksum
			return null
		}
	}

	return result
}

module.exports = { ss58Decode, ss58Encode, setNetworkDefault }
