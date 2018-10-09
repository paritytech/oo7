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
	constructor (prefix, type, args = []) {
		super('state_storage', [[ storageKey(prefix, args) ]], r => decode(hexToBytes(r.changes[0][1]), type))
	}
}

module.exports = { storageKey, StorageBond }