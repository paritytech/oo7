const XXH = require('xxhashjs');
const { blake2b } = require('blakejs')
const { SubscriptionBond } = require('./subscriptionBond')
const { VecU8 } = require('./types')
const { stringToBytes, hexToBytes, toLEHex, bytesToHex } = require('./utils')
const { decode } = require('./codec');

function storageKey(prefixString, arg, hasher = 'Twox128') {
	let loc = new Uint8Array([...stringToBytes(prefixString), ...arg]);
	switch (hasher) {
		case "Blake2_128": return '0x' + bytesToHex(blake2b(loc, null, 16));
		case "Blake2_256": return '0x' + bytesToHex(blake2b(loc, null, 32));
		case "Twox128": return '0x' + toLEHex(XXH.h64(loc.buffer, 0), 8) + toLEHex(XXH.h64(loc.buffer, 1), 8);
		case "Twox256": return '0x' + toLEHex(XXH.h64(loc.buffer, 0), 8) + toLEHex(XXH.h64(loc.buffer, 1), 8) + toLEHex(XXH.h64(loc.buffer, 2), 8) + toLEHex(XXH.h64(loc.buffer, 3), 8);
		case "Twox64Concat": return '0x' + toLEHex(XXH.h64(loc.buffer), 8) + bytesToHex(loc.buffer);
		default: throw 'Invalid hasher';
	}
}

class StorageBond extends SubscriptionBond {
	constructor (prefix, type, args = [], defaultValue = null, hasher = 'Twox128') {
		super('state_storage', [[ storageKey(prefix, args, hasher) ]], r => {
			let raw = hexToBytes(r.changes[0][1]);
			return raw.length > 0 ? type == null ? raw : decode(raw, type) : defaultValue
		})
	}
}

module.exports = { storageKey, StorageBond }