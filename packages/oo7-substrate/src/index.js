const nacl = require('tweetnacl')
const { ss58Decode, ss58Encode, setNetworkDefault } = require('./ss58')
const { VecU8, AccountId, Hash, VoteThreshold, Moment, Balance, BlockNumber, AccountIndex, TransactionEra, Tuple, reviver } = require('./types')
const { decode, encode, addCodecTransform } = require('./codec')
const { pretty } = require('./pretty')
const { post } = require('./transact')
const { secretStore } = require('./secretStore')
const { addressBook } = require('./addressBook')
const { stringToSeed, stringToBytes, hexToBytes, bytesToHex, toLEHex, toLE, leToNumber, leHexToNumber, siPrefix } = require('./utils')
const { storageKey } = require('./storageBond')
const { initRuntime, runtime, calls, runtimePromise, callsPromise, chain, system, state, runtimeUp } = require('./bonds')
const { nodeService, setNodeUri } = require('./nodeService')
const denominationInfo = require('./denominationInfo')
const { metadata } = require('./metadata')

function tally(x) {
	var r = [0, 0]
	x.forEach(v => r[v ? 1 : 0]++)
	return {aye: r[1], nay: r[0]}
}

function tallyAmounts(x) {
	var r = [0, 0]
	x.forEach(([v, b]) => r[v ? 1 : 0] += b)
	return {aye: r[1], nay: r[0]}
}

// TODO: receipts from tx
// TODO: compact transactions (switch out account for index when possible)

if (typeof window !== 'undefined') {
	window.ss58Encode = ss58Encode
	window.ss58Decode = ss58Decode
	window.ss58Encode = ss58Encode
	window.ss58Decode = ss58Decode
	window.bytesToHex = bytesToHex
	window.stringToBytes = stringToBytes
	window.hexToBytes = hexToBytes
	window.toLE = toLE
	window.leToNumber = leToNumber
	window.storageKey = storageKey
	window.encode = encode
	window.decode = decode
	window.pretty = pretty
	window.addCodecTransform = addCodecTransform
	window.nodeService = nodeService
	window.secretStore = secretStore
	window.nacl = nacl
	window.post = post
	window.AccountId = AccountId
	window.AccountIndex = AccountIndex
	window.storageKey = storageKey
}

module.exports = {
	ss58Decode, ss58Encode, setNetworkDefault,
	// utils
	stringToSeed, stringToBytes, hexToBytes, bytesToHex, toLEHex, leHexToNumber, toLE, leToNumber, reviver, 
	// types
	AccountId, AccountIndex, TransactionEra, Hash, VoteThreshold, Moment, Balance, BlockNumber, Tuple, VecU8,
	pretty, encode, decode, addCodecTransform,
	secretStore, addressBook,
	post,
	denominationInfo,
	setNodeUri,
	metadata,
	// bonds
	initRuntime, runtime, calls, runtimePromise, callsPromise, chain, system, state, runtimeUp
}