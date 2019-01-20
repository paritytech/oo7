const XXH = require('xxhashjs');
const { SubscriptionBond } = require('./subscriptionBond')
const { VecU8 } = require('./types')
const { stringToBytes, hexToBytes, toLEHex } = require('./utils')
const { decode } = require('./codec');

function storageKey(prefixString, arg) {
	let loc = new VecU8([...stringToBytes(prefixString), ...arg]);
	return '0x' + toLEHex(XXH.h64(loc.buffer, 0), 8) + toLEHex(XXH.h64(loc.buffer, 1), 8);
}

class StorageBond extends SubscriptionBond {
	constructor (prefix, type, args = [], defaultValue = null) {
		super('state_storage', [[ storageKey(prefix, args) ]], r => {
			let raw = hexToBytes(r.changes[0][1]);
			return decode(raw.length > 0 ? raw : defaultValue, type)
		})			
	}
}

module.exports = { storageKey, StorageBond }