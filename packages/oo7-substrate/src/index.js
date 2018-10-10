const nacl = require('tweetnacl');
const { ss58_decode, ss58_encode } = require('ss58');
const { VecU8, AccountId, Hash, VoteThreshold, Moment, Balance, BlockNumber, AccountIndex, TransactionEra, Tuple, reviver } = require('./types');
const { decode, encode } = require('./codec');
const { pretty } = require('./pretty');
const { post } = require('./transact');
const { secretStore } = require('./secretStore')
const { stringToSeed, stringToBytes, hexToBytes, bytesToHex, toLEHex, toLE, leToNumber, leHexToNumber, siPrefix } = require('./utils')
const { storageKey } = require('./storageBond')
const { initRuntime, storage, calls, storagePromise, callsPromise, chain, system, state, runtimeUp } = require('./bonds')
const { nodeService } = require('./nodeService')
const denominationInfo = require('./denominationInfo')

function tally(x) {
	var r = [0, 0];
	x.forEach(v => r[v ? 1 : 0]++);
	return {aye: r[1], nay: r[0]};
}

function tallyAmounts(x) {
	var r = [0, 0];
	x.forEach(([v, b]) => r[v ? 1 : 0] += b);
	return {aye: r[1], nay: r[0]};
}

// TODO: SS58: make typesafe, include accountindex and rename to camel
// TODO: receipts from tx
// TODO: compact transactions (switch out account for index when possible)

if (typeof window !== 'undefined') {
	window.ss58_encode = ss58_encode;
	window.ss58_decode = ss58_decode;
	window.bytesToHex = bytesToHex;
	window.stringToBytes = stringToBytes;
	window.hexToBytes = hexToBytes;
	window.toLE = toLE;
	window.leToNumber = leToNumber;
	window.storageKey = storageKey;
	window.encode = encode;
	window.decode = decode;
	window.pretty = pretty;
	window.nodeService = nodeService;
	window.secretStore = secretStore;
	window.nacl = nacl;
	window.post = post;
	window.AccountId = AccountId;
	window.AccountIndex = AccountIndex;
	window.storageKey = storageKey;
}

module.exports = {
	// TODO: type-correct variants &c.
	ss58_decode, ss58_encode,
	// utils
	stringToSeed, stringToBytes, hexToBytes, bytesToHex, toLEHex, leHexToNumber, toLE, leToNumber, reviver, 
	// types
	AccountId, AccountIndex, TransactionEra, Hash, VoteThreshold, Moment, Balance, BlockNumber, Tuple, VecU8,
	pretty, encode, decode,
	secretStore,
	post,
	denominationInfo,
	// bonds
	initRuntime, storage, calls, storagePromise, callsPromise, chain, system, state, runtimeUp
}