const {Bond, TransformBond} = require('oo7');
const XXH = require('xxhashjs');
const {ss58_decode, ss58_encode} = require('ss58');
const {camel, snake} = require('change-case');
const nacl = require('tweetnacl');

require('isomorphic-fetch');

class VecU8 extends Uint8Array { toJSON() { return { _type: 'VecU8', data: Array.from(this) } }}
class AccountId extends Uint8Array { toJSON() { return { _type: 'AccountId', data: Array.from(this) } }}
class Hash extends Uint8Array { toJSON() { return { _type: 'Hash', data: Array.from(this) } }}
class VoteThreshold extends String { toJSON() { return { _type: 'VoteThreshold', data: this + ''} }}
class SlashPreference extends Number {
	toJSON() { return { _type: 'SlashPreference', data: this+0 } }
}
class Moment extends Date {
	constructor(seconds) {
		super(seconds * 1000)
		this.number = seconds
	}
	toJSON() {
		return { _type: 'Moment', data: this.number }
	}
}
class Balance extends Number {
	toJSON() { return { _type: 'Balance', data: this+0 } }
	add(b) { return new Balance(this + b) }
	sub(b) { return new Balance(this - b) }
}
class BlockNumber extends Number { toJSON() { return { _type: 'BlockNumber', data: this+0 } }}
class Tuple extends Array { toJSON() { return { _type: 'Tuple', data: Array.from(this) } }}

function reviver(key, bland) {
	if (typeof bland == 'object' && bland) {
		switch (bland._type) {
			case 'VecU8': return new VecU8(bland.data);
			case 'AccountId': return new AccountId(bland.data);
			case 'Hash': return new Hash(bland.data);
			case 'VoteThreshold': return new VoteThreshold(bland.data);
			case 'SlashPreference': return new SlashPreference(bland.data);
			case 'Moment': return new Moment(bland.data);
			case 'Tuple': return new Tuple(bland.data);
			case 'Balance': return new Balance(bland.data);
			case 'BlockNumber': return new BlockNumber(bland.data);
		}
	}
	return bland;
}

let transforms = {
	RuntimeMetadata: { outerEvent: 'OuterEventMetadata', modules: 'Vec<RuntimeModuleMetadata>' },
	RuntimeModuleMetadata: { prefix: 'String', module: 'ModuleMetadata', storage: 'Option<StorageMetadata>' },
	StorageFunctionModifier: { _enum: [ 'None', 'Default', 'Required' ] },
	StorageFunctionTypeMap: { key: 'Type', value: 'Type' },
	StorageFunctionType: { _enum: { Plain: 'Type', Map: 'StorageFunctionTypeMap' } },
	StorageFunctionMetadata: { name: 'String', modifier: 'StorageFunctionModifier', type: 'StorageFunctionType', documentation: 'Vec<String>' },
	StorageMetadata: { prefix: 'String', items: 'Vec<StorageFunctionMetadata>' },
	EventMetadata: { name: 'String', arguments: 'Vec<Type>', documentation: 'Vec<String>' },
	OuterEventMetadata: { name: 'String', events: 'Vec<(String, Vec<EventMetadata>)>' },
	ModuleMetadata: { name: 'String', call: 'CallMetadata' },
	CallMetadata: { name: 'String', functions: 'Vec<FunctionMetadata>' },
	FunctionMetadata: { id: 'u16', name: 'String', arguments: 'Vec<FunctionArgumentMetadata>', documentation: 'Vec<String>' },
	FunctionArgumentMetadata: { name: 'String', type: 'Type' },

	Transaction: { version: 'u8', sender: 'Address', signature: 'Signature', index: 'Index', era: 'TransactionEra', call: 'Call' }
};

var decodePrefix = 0;

function decode(input, type) {
	if (typeof input.data === 'undefined') {
		input = { data: input };
	}
	if (typeof type === 'object') {
		return type.map(t => decode(input, t));
	}
	while (type.startsWith('T::')) {
		type = type.slice(3);
	}
	let dataHex = bytesToHex(input.data.slice(0, 50));
//	console.log(decodePrefix + 'des >>>', type, dataHex);
//	decodePrefix +=  "   ";

	let res;
	let transform = transforms[type];
	if (transform) {
		if (typeof transform == 'string') {
			res = decode(input, transform);
		} else if (typeof transform == 'object') {
			if (transform instanceof Array) {
				// just a tuple
				res = new Tuple(...decode(input, transform));
			} else if (!transform._enum) {
				// a struct
				res = {};
				Object.keys(transform).forEach(k => {
					res[k] = decode(input, transform[k]);
				});
			} else if (transform._enum instanceof Array) {
				// simple enum
				let n = input.data[0];
				input.data = input.data.slice(1);
				res = { option: transform._enum[n] };
			} else if (transform._enum) {
				// enum
				let n = input.data[0];
				input.data = input.data.slice(1);
				let option = Object.keys(transform._enum)[n];
				res = { option, value: decode(input, transform._enum[option]) };
			}
		}
		res._type = type;
	} else {
		switch (type) {
/*			case 'Call':
			case 'Proposal': {
				let c = Calls[input.data[0]];
				res = type === 'Call' ? new Call : new Proposal;
				res.module = c.name;
				c = c[type == 'Call' ? 'calls' : 'priv_calls'][input.data[1]];
				input.data = input.data.slice(2);
				res.name = c.name;
				res.params = c.params.map(p => ({ name: p.name, type: p.type, value: decode(input, p.type) }));
				break;
			}*/
			case 'AccountId': {
				res = new AccountId(input.data.slice(0, 32));
				input.data = input.data.slice(32);
				break;
			}
			case 'Hash': {
				res = new Hash(input.data.slice(0, 32));
				input.data = input.data.slice(32);
				break;
			}
			case 'Balance': {
				res = leToNumber(input.data.slice(0, 16));
				input.data = input.data.slice(16);
				res = new Balance(res);
				break;
			}
			case 'BlockNumber': {
				res = leToNumber(input.data.slice(0, 8));
				input.data = input.data.slice(8);
				res = new BlockNumber(res);
				break;
			}
			case 'Moment': {
				let n = leToNumber(input.data.slice(0, 8));
				input.data = input.data.slice(8);
				res = new Moment(n);
				break;
			}
			case 'VoteThreshold': {
				const VOTE_THRESHOLD = ['SuperMajorityApprove', 'NotSuperMajorityAgainst', 'SimpleMajority'];
				res = new VoteThreshold(VOTE_THRESHOLD[input.data[0]]);
				input.data = input.data.slice(1);
				break;
			}
			case 'SlashPreference': {
				res = new SlashPreference(decode(input, 'u32'));
				break;
			}
			case 'Compact<u128>':
			case 'Compact<u64>':
			case 'Compact<u32>':
			case 'Compact<u16>':
			case 'Compact<u8>': {
				let len;
				if (input.data[0] % 4 == 0) {
					// one byte
					res = input.data[0] >> 2;
					len = 1;
				} else if (input.data[0] % 4 == 1) {
					res = leToNumber(input.data.slice(0, 2)) >> 2;
					len = 2;
				} else if (input.data[0] % 4 == 2) {
					res = leToNumber(inpuzt.data.slice(0, 4)) >> 2;
					len = 4;
				} else {
					let n = (input.data[0] >> 2) + 4;
					res = leToNumber(input.data.slice(1, n + 1));
					len = 5 + n;
				}
				input.data = input.data.slice(len);
				break;
			}
			case 'u8':
				res = leToNumber(input.data.slice(0, 1));
				input.data = input.data.slice(1);
				break;
			case 'u16':
				res = leToNumber(input.data.slice(0, 2));
				input.data = input.data.slice(2);
				break;
			case 'u32':
			case 'VoteIndex':
			case 'PropIndex':
			case 'ReferendumIndex': {
				res = leToNumber(input.data.slice(0, 4));
				input.data = input.data.slice(4);
				break;
			}
			case 'u64':
			case 'Index': {
				res = leToNumber(input.data.slice(0, 8));
				input.data = input.data.slice(8);
				break;
			}
			case 'bool': {
				res = !!input.data[0];
				input.data = input.data.slice(1);
				break;
			}
			case 'KeyValue': {
				res = decode(input, '(Vec<u8>, Vec<u8>)');
				break;
			}
			case 'Vec<bool>': {
				let size = decode(input, 'Compact<u32>');
				res = [...input.data.slice(0, size)].map(a => !!a);
				input.data = input.data.slice(size);
				break;
			}
			case 'Vec<u8>': {
				let size = decode(input, 'Compact<u32>');
				res = input.data.slice(0, size);
				input.data = input.data.slice(size);
				break;
			}
			case 'String': {
				let size = decode(input, 'Compact<u32>');
				res = input.data.slice(0, size);
				input.data = input.data.slice(size);
				res = new TextDecoder("utf-8").decode(res);
				break;
			}
			case 'Type': {
				res = decode(input, 'String');
				while (res.indexOf('T::') != -1) {
					res = res.replace('T::', '');
				}
				res = res.match(/^Box<.*>$/) ? res.slice(4, -1) : res;
				break;
			}
			default: {
				let v = type.match(/^Vec<(.*)>$/);
				if (v) {
					let size = decode(input, 'Compact<u32>');
					res = [...new Array(size)].map(() => decode(input, v[1]));
					break;
				}
				let o = type.match(/^Option<(.*)>$/);
				if (o) {
					let some = decode(input, 'bool');
					if (some) {
						res = decode(input, o[1]);
					} else {
						res = null;
					}
					break;
				}
				let t = type.match(/^\((.*)\)$/);
				if (t) {
					res = new Tuple(...decode(input, t[1].split(', ')));
					break;
				}
				throw 'Unknown type to decode: ' + type;
			}
		}
	}
//	decodePrefix = decodePrefix.substr(3);
//	console.log(decodePrefix + 'des <<<', type, res);
	return res;
}

const numberWithCommas = n => {
	let x = n.toString();
	if (x.indexOf('.') > -1) {
		let [a, b] = x.split('.');
		return numberWithCommas(a) + '.' + b;
	} else {
		return x.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}
}

function pretty(expr) {
	if (expr === null) {
		return 'null';
	}
	if (expr instanceof VoteThreshold) {
		return 'VoteThreshold.' + expr;
	}
	if (expr instanceof VoteThreshold) {
		return 'SlashPreference{unstake_threshold=' + expr + '}';
	}
	if (expr instanceof Balance) {
		if (s_substrate && s_substrate.denominationInfo()) {
			let di = s_substrate.denominationInfo()

			let denomincationSearch = [di.primary, Object.keys(di.denominations)]
			let unit = null
			let dp = 0
			for (ii in denomincationSearch) {
				let i = denomincationSearch[ii]
				let denom = di.denominations[i]
				let divisor = Math.pow(10, denom)
				let lower = divisor / 30
				let upper = divisor * 30000
				if (expr > lower && expr < upper) {
					unit = i
					expr /= divisor
					for (; expr < 3000 / Math.pow(10, dp); dp++) {}
					break;
				}
			}

			if (unit === null) {
				// default
				if (expr < di.denominations[di.primary] / 30 && expr !== 0) {
					unit = di.unit
				} else {
					unit = di.primary
					expr /= Math.pow(10, di.denominations[unit])
					expr = Math.round(expr)
				}
			}

			return numberWithCommas(Math.round(expr * Math.pow(10, dp)) / Math.pow(10, dp)) + ' ' + unit
		} else {
			return numberWithCommas(expr)
		}
	}
	if (expr instanceof BlockNumber) {
		return numberWithCommas(expr);
	}
	if (expr instanceof Hash) {
		return '0x' + bytesToHex(expr);
	}
	if (expr instanceof Moment) {
		return expr.toLocaleString() + " (" + expr.number + " seconds)";
	}
	if (expr instanceof AccountId) {
		return ss58_encode(expr);
	}
	if (expr instanceof Tuple) {
		return '(' + expr.map(pretty).join(', ') + ')';
	}
	if (expr instanceof VecU8 || expr instanceof Uint8Array) {
		if (expr.length <= 256) {
			return '[' + bytesToHex(expr) + ']';
		} else {
			return `[${bytesToHex(expr.slice(0, 256))}...] (${expr.length} bytes)`;
		}
	}
	if (expr instanceof Array) {
		return '[' + expr.map(pretty).join(', ') + ']';
	}
	if (typeof expr === 'object') {
		return '{' + Object.keys(expr).map(k => k + ': ' + pretty(expr[k])).join(', ') + '}';
	}
	return '' + expr;
}

const subscriptionKey = {
	author_submitAndWatchExtrinsic: {
		notification: 'author_extrinsicUpdate',
		subscribe: 'author_submitAndWatchExtrinsic',
		unsubscribe: 'author_unwatchExtrinsic'
	},
	state_storage: {
		notification: 'state_storage',
		subscribe: 'state_subscribeStorage',
		unsubscribe: 'state_unsubscribeStorage'
	},
	chain_newHead: {
		notification: 'chain_newHead',
		subscribe: 'chain_subscribeNewHead',
		unsubscribe: 'chain_unsubscribeNewHead'
	}
}

class NodeService {
	constructor() {
		this.subscriptions = {}
		this.onreply = {}
		this.onceOpen = []
		this.index = 1
		this.start()
	}
	start () {
		let uri = 'ws://127.0.0.1:9944';
		let that = this;
		this.ws = new WebSocket(uri)
		this.ws.onopen = function () {
			console.log('Connection open')
			let onceOpen = that.onceOpen;
			that.onceOpen = []
			window.setTimeout(() => onceOpen.forEach(f => f()), 0)
		}
		this.ws.onmessage = function (msg) {
			let d = JSON.parse(msg.data)
//			console.log("Message from node", d)
			if (d.id) {
				that.onreply[d.id](d)
				delete that.onreply[d.id];
			} else if (d.method && d.params && that.subscriptions[d.method] && that.subscriptions[d.method][d.params.subscription]) {
				that.subscriptions[d.method][d.params.subscription](d.params.result, d.method)
			}

			if (that.reconnect) {
				window.clearTimeout(that.reconnect)
			}
			// epect a message every 10 seconds or we reconnect.
			if (false) 
				that.reconnect = window.setTimeout(() => {
				that.ws.close()
				delete that.ws
				that.start()
			}, 10000)
		}
	}
	request (method, params = []) {
		let that = this
		let doSend = () => new Promise((resolve, reject) => {
			let id = '' + this.index++;
			let msg = {
				"jsonrpc": "2.0",
				"id": id,
				"method": method,
				"params": params
			};
			that.ws.send(JSON.stringify(msg))
//			console.log('Attempting send', msg)
	
			that.onreply[id] = msg => {
				if (msg.error) {
					reject(msg.error)
				} else {
					resolve(msg.result)
				}
			}
		})

		if (this.ws.readyState == 0) {
			// still connecting
			return new Promise(resolve => {
				that.onceOpen.push(() => {
					let res = doSend()
					resolve(res)
				})
			})
		} else {
			return doSend()
		}
	}
	subscribe (what, params, callback, errorHandler) {
		let that = this
		return this.request(subscriptionKey[what].subscribe, params).then(id => {
			let notification = subscriptionKey[what].notification;
			that.subscriptions[notification] = that.subscriptions[notification] || {}
			that.subscriptions[notification][id] = callback
			return { what, id }
		}).catch(errorHandler)
	}
	unsubscribe ({what, id}) {
		let that = this

		let notification = subscriptionKey[what].notification;
		if (!(this.subscriptions[notification] && this.subscriptions[notification][id])) {
			throw 'Invalid subscription id'
		}
		let unsubscribe = subscriptionKey[what].unsubscribe

		return this.request(unsubscribe, [id]).then(result => {
			delete that.subscriptions[notification][id]
			return result
		})
	}
	finalise () {
		delete this.ws;
	}
}

let service = new NodeService;

class SubscriptionBond extends Bond {
	constructor (name, params = [], xform = null, def = undefined, cache = { id: null, stringify: JSON.stringify, parse: JSON.parse }, mayBeNull) {
		super(mayBeNull, cache);
		this.name = name;
		this.params = params;
		this.xform = xform;
		if (typeof def !== 'undefined' && (def !== null || mayBeNull)) {
			this._value = def;
			this._ready = true;
		}
	}
	initialise () {
		let that = this;
		let callback = result => {
			if (that.xform) {
				result = that.xform(result);
			}
			that.trigger(result);
		};
		// promise instead of id because if a dependency triggers finalise() before id's promise is resolved the unsubscribing would call with undefined
		this.subscription = service.subscribe(this.name, this.params, callback, error => {
			that.trigger({failed: error})
			delete that.subscription
		});
	}
	finalise () {
		let that = this;
		this.subscription.then(id => {
			service.unsubscribe(id);
			delete that.subscription
		});
	}
}

class TransactionBond extends SubscriptionBond {
	constructor (data) {
		super('author_submitAndWatchExtrinsic', ['0x' + bytesToHex(data)], null, {sending: true})
	}
}

function makeTransaction(data) {
	return new TransactionBond(data)
}

function composeTransaction (sender, call, index, era, checkpoint, senderAccount) {
	return new Promise((resolve, reject) => {
		if (typeof sender == 'string') {
			sender = ss58_decode(sender)
		}
		if (sender instanceof Uint8Array && sender.length == 32) {
			senderAccount = sender
		} else if (!senderAccount) {
			reject(`Invalid senderAccount when sender is account index`)
		}
		let e = encoded([
			index, call, era, checkpoint
		], [
			'Index', 'Call', 'TransactionEra', 'Hash'
		])
	
		let signature = secretStore.sign(senderAccount, e)
		let signedData = encoded(encoded({
			_type: 'Transaction',
			version: 0x81,
			sender,
			signature,
			index,
			era,
			call
		}), 'Vec<u8>')
		window.setTimeout(() => resolve(signedData), 1000)
	})
}

class TransactionEra {
	constructor (period, phase) {
		if (typeof period === 'number' && typeof phase === 'number') {
			this.period = 2 << Math.min(15, Math.max(1, Math.ceil(Math.log2(period)) - 1))
			this.phase = phase % this.period
		}
	}

	encode() {
		if (typeof this.period === 'number' && typeof this.phase === 'number') {
			let l = Math.min(15, Math.max(1, Math.ceil(Math.log2(this.period)) - 1))
			let factor = Math.max(1, this.period >> 12)
			let res = toLE((Math.floor(this.phase / factor) << 4) + l, 2)
			return res
		} else {
			return new Uint8Array([0])
		}
	}
}

// tx = {
//   sender
//   call
//   longevity?
//   index?
// }
function post(tx) {
	return new LatchBond(Bond.all([tx, substrate().chain.height]).map(([o, height]) => {
		let {sender, call, index, longevity} = o
		if (typeof sender == 'number') {
			// TODO: accept integer senders
			throw 'Unsupported: account index for sender'
		}
		let era
		let eraHash
		longevity = longevity || 256
		if (longevity === true) {
			era = new TransactionEra;
			eraHash = substrate().genesisHash;
		} else {
			// use longevity with height to determine era and eraHash
			let l = Math.min(15, Math.max(1, Math.ceil(Math.log2(longevity)) - 1))
			let period = 2 << l
			let factor = Math.max(1, period >> 12)
			let Q = (n, d) => Math.floor(n / d) * d
			let eraNumber = Q(height, factor)
			let phase = eraNumber % period
			era = new TransactionEra(period, phase)
			eraHash = substrate().chain.hash(eraNumber)
		}
		return {
			sender,
			call,
			era,
			eraHash,
			index: index || substrate().runtime.system.accountNonce(sender),
			senderAccount: sender
		}
	}, 2), false).map(o => 
		o && composeTransaction(o.sender, o.call, o.index, o.era, o.eraHash, o.senderAccount)
	).map(composed =>
		composed ? new TransactionBond(composed) : { signing: true }
	)
}

/// Resolves to a default value when not ready. Once inputBond is ready,
/// its value remains fixed indefinitely.
class LatchBond extends Bond {
	constructor (targetBond, def = undefined, mayBeNull = undefined, cache = null) {
		super(typeof mayBeNull === 'undefined' ? targetBond._mayBeNull : mayBeNull, cache)

		if (typeof(def) !== 'undefined') {
			this._ready = true;
			this._value = def;
		}

		let that = this
		this._targetBond = targetBond
		this._poll = () => {
			if (targetBond._ready) {
				that.changed(targetBond._value)
				that._targetBond.unnotify(that._notifyId);
				delete that._poll
				delete that._targetBond
			}
		}
	}

	initialise () {
		if (this._poll) {
			this._notifyId = this._targetBond.notify(this._poll);
			this._poll();
		}
	}

	finalise () {
		if (this._targetBond) {
			this._targetBond.unnotify(this._notifyId);
		}
	}
}

function storageValueKey(stringLocation) {
	let loc = stringToBytes(stringLocation);
	return '0x' + toLEHex(XXH.h64(loc.buffer, 0), 8) + toLEHex(XXH.h64(loc.buffer, 1), 8);
}
function storageMapKey(prefixString, arg) {
	let loc = new VecU8([...stringToBytes(prefixString), ...arg]);
	return '0x' + toLEHex(XXH.h64(loc.buffer, 0), 8) + toLEHex(XXH.h64(loc.buffer, 1), 8);
}

class StorageBond extends SubscriptionBond {
	constructor (prefix, type, args = []) {
		super('state_storage', [[ storageMapKey(prefix, args) ]], r => decode(hexToBytes(r.changes[0][1]), type))
	}
}

class SecretStore {
	constructor () {
		this.keys = {}
		this.seeds = []
		this.names = {}
		this._load()
	}
	submit (seed, name) {
		let s = stringToSeed(seed);
		let addr = this._addKey(s);
		this.names[name] = ss58_encode(addr)
		this._save()
		return addr
	}
	accounts () {
		return Object.keys(this.keys).map(ss58_decode)
	}
	find (n) {
		let k = this.keys[this.names[n]]
		return k && Object.assign({ address: this.names[n] }, k)
	}
	sign (from, data) {
		if (from instanceof Uint8Array && from.length == 32 || from instanceof AccountId) {
			from = ss58_encode(from)
		}
		console.info(`Signing data from ${from}`, bytesToHex(data))
		let key = this.keys[from].key
		return key ? nacl.sign.detached(data, key.secretKey) : null
	}
	_addKey (s) {
		let key = nacl.sign.keyPair.fromSeed(s)
		let addr = new AccountId(key.publicKey)
		this.seeds.push(bytesToHex(s))
		this.keys[ss58_encode(addr)] = { key }
		return addr
	}
	_save () {
		let ss = {
			seeds: this.seeds,
			names: this.names
		}
		localStorage.secretStore = JSON.stringify(ss)
	}
	_load () {
		if (localStorage.secretStore) {
			let o = JSON.parse(localStorage.secretStore)
			o.seeds.forEach(seed => this._addKey(hexToBytes(seed)))
			this.names = o.names
		}
	}
}

let secretStore = new SecretStore

function stringToSeed(s) {
	if (s.match(/^0x[0-9a-fA-F]{64}$/)) {
		return new VecU8(hexToBytes(s))
	}
	var data = new VecU8(32);
	data.fill(32);
	for (var i = 0; i < s.length; i++){
		data[i] = s.charCodeAt(i);
	}
	return data;
}
function stringToBytes(s) {
	var data = new VecU8(s.length);
	for (var i = 0; i < s.length; i++){
		data[i] = s.charCodeAt(i);
	}
	return data;
}
function hexToBytes(str) {
	if (!str) {
		return new VecU8();
	}
	var a = [];
	for (var i = str.startsWith('0x') ? 2 : 0, len = str.length; i < len; i += 2) {
		a.push(parseInt(str.substr(i, 2), 16));
	}

	return new VecU8(a);
}
function bytesToHex(uint8arr) {
	if (!uint8arr) {
		return '';
	}
	var hexStr = '';
	for (var i = 0; i < uint8arr.length; i++) {
		var hex = (uint8arr[i] & 0xff).toString(16);
		hex = (hex.length === 1) ? '0' + hex : hex;
		hexStr += hex;
	}

	return hexStr.toLowerCase();
}
function toLEHex(val, bytes) {
	let be = ('00'.repeat(bytes) + val.toString(16)).slice(-bytes * 2);
	var le = '';
	for (var i = 0; i < be.length; i += 2) {
		le = be.substr(i, 2) + le;
	}
	return le;
}
function leHexToNumber(le) {
	var be = '';
	for (var i = le.startsWith('0x') ? 2 : 0; i < le.length; i += 2) {
		be = le.substr(i, 2) + be;
	}
	return Number.parseInt(be, 16);
}

function toLE(val, bytes) {
	let r = new VecU8(bytes);
	for (var o = 0; val > 0; ++o) {
		r[o] = val % 256;
		val /= 256;
	}
	return r;
}

function leToNumber(le) {
	let r = 0;
	let a = 1;
	le.forEach(x => { r += x * a; a *= 256; });
	return r;
}

String.prototype.chunks = function(size) {
	var r = [];
	var count = this.length / size;
	for (var i = 0; i < count; ++i) {
		r.push(this.substr(i * size, size));
	}
	return r;
}

String.prototype.mapChunks = function(sizes, f) {
	var r = [];
	var count = this.length / sizes.reduce((a, b) => a + b, 0);
	var offset = 0;
	for (var i = 0; i < count; ++i) {
		r.push(f(sizes.map(s => {
			let r = this.substr(offset, s);
			offset += s;
			return r;
		})));
	}
	return r;
}

Uint8Array.prototype.mapChunks = function(sizes, f) {
	var r = [];
	var count = this.length / sizes.reduce((a, b) => a + b, 0);
	var offset = 0;
	for (var i = 0; i < count; ++i) {
		r.push(f(sizes.map(s => {
			offset += s;
			return this.slice(offset - s, offset);
		})));
	}
	return r;
}

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

function encoded(value, type = null) {
	// if an array then just concat
	if (type instanceof Array) {
		if (value instanceof Array) {
			let x = value.map((i, index) => encoded(i, type[index]));
			let res = new Uint8Array();
			x.forEach(x => {
				r = new Uint8Array(res.length + x.length);
				r.set(res)
				r.set(x, res.length)
				res = r
			})
			return res
		} else {
			throw 'If type if array, value must be too'
		}
	}
	if (typeof value == 'object' && !type && value._type) {
		type = value._type
	}
	if (typeof type != 'string') {
		throw 'type must be either an array or a string'
	}

	if (typeof value == 'string' && value.startsWith('0x')) {
		value = hexToBytes(value)
	}

	if (transforms[type]) {
		let transform = transforms[type]
		if (transform instanceof Array) {
			// just a tuple
			return encoded(value, transform)
		} else if (!transform._enum) {
			// a struct
			let keys = []
			let types = []
			Object.keys(transform).forEach(k => {
				keys.push(value[k])
				types.push(transform[k])
			})
			return encoded(keys, types)
		} else if (transform._enum instanceof Array) {
			// simple enum
			return new Uint8Array([transform._enum.indexOf(value.option)])
		} else if (transform._enum) {
			// enum
			let index = Object.keys(transform._enum).indexOf(value.option)
			let value = encoded(value.value, transform._enum[value.option])
			return new Uint8Array([index, ...value])
		}
	}

	// other type-specific transforms
	if (type == 'Vec<u8>') {
		if (typeof value == 'object' && value instanceof Uint8Array) {
			return new Uint8Array([...encoded(value.length, 'Compact<u32>'), ...value])
		}
	}

	if (type == 'Address' || type == 'RawAddress<AccountId, AccountIndex>') {
		if (typeof value == 'string') {
			value = ss58_decode(value)
		}
		if (typeof value == 'object' && value instanceof Uint8Array && value.length == 32) {
			return new Uint8Array([0xff, ...value])
		}
		if (typeof value == 'number') {
			if (value < 0xf0) {
				return new Uint8Array([value])
			} else if (value < 1 << 16) {
				return new Uint8Array([0xfc, ...toLE(value, 2)])
			} else if (value < 1 << 32) {
				return new Uint8Array([0xfd, ...toLE(value, 4)])
			} else if (value < 1 << 64) {
				return new Uint8Array([0xfe, ...toLE(value, 8)])
			}
		}
	}

	if (type == 'AccountId') {
		if (typeof value == 'string') {
			return ss58_decode(value);
		}
		if (value instanceof Uint8Array && value.length == 32) {
			return value
		}
	}

	if (typeof value == 'number') {
		switch (type) {
			case 'Balance':
			case 'u128':
				return toLE(value, 16)
			case 'Index':
			case 'u64':
				return toLE(value, 8)
			case 'u32':
				return toLE(value, 4)
			case 'u16':
				return toLE(value, 2)
			case 'u8':
				return toLE(value, 1)
			default:
				break
		}
	}

	if (value instanceof Uint8Array) {
		if (type == 'Signature' && value.length == 64) {
			return value
		}
		if (type == 'Hash' && value.length == 32) {
			return value
		}
	}

	if (type == 'TransactionEra' && value instanceof TransactionEra) {
		return value.encode()
	} else if (type == 'TransactionEra') {
		console.error("TxEra::encode bad", type, value)
	}
	
	if (type.match(/^Compact<u[0-9]*>$/)) {
		if (value < 1 << 6) {
			return new Uint8Array([value << 2])
		} else if (value < 1 << 14) {
			return toLE((value << 2) + 1, 2)
		} else if (value < 1 << 30) {
			return toLE((value << 2) + 2, 4)
		} else {
			var v = [3, ...toLE(value, 4)]
			let n = value >> 32
			while (n > 0) {
				v[0]++
				v.push(n % 256)
				n >>= 8
			}
			return new Uint8Array(v)
		}
	}

	if (type == 'bool') {
		return new Uint8Array([value ? 1 : 0])
	}

	if (typeof type == 'string' && type.match(/\(.*\)/)) {
		return encoded(value, type.substr(1, type.length - 2).split(','))
	}

	// Maybe it's pre-encoded?
	if (typeof value == 'object' && value instanceof Uint8Array) {
		switch (type) {
			case 'Call':
				break
			default:
				console.warn(`Value passed apparently pre-encoded without whitelisting ${type}`)
		}
		return value
	}

	throw `Value cannot be encoded as type: ${value}, ${type}`
}

let s_substrate = null

function substrate(di) {
	if (!s_substrate) {
		s_substrate = new Substrate
	}
	if (di) {
		s_substrate.initialiseDenominations(di)
	}
	return s_substrate
}

class Substrate {
	initialiseFromMetadata(m) {
		this.metadata = m
		this.runtime = {}
		this.call = {}
		m.modules.forEach((m, module_index) => {
			let o = {}
			let c = {}
			if (m.storage) {
				let prefix = m.storage.prefix
				m.storage.items.forEach(item => {
					switch (item.type.option) {
						case 'Plain': {
							o[camel(item.name)] = new StorageBond(`${prefix} ${item.name}`, item.type.value)
							break
						}
						case 'Map': {
							let keyType = item.type.value.key
							let valueType = item.type.value.value
							o[camel(item.name)] = keyBond => new TransformBond(
								key => new StorageBond(`${prefix} ${item.name}`, valueType, encoded(key, keyType)),
								[keyBond]
							).subscriptable()
							break
						}
					}
				})
			}
			if (m.module && m.module.call) {
				m.module.call.functions.forEach(item => {
					if (item.arguments.length > 0 && item.arguments[0].name == 'origin' && item.arguments[0].type == 'Origin') {
						item.arguments = item.arguments.slice(1)						
					}
					c[camel(item.name)] = function (...bondArgs) {
						if (bondArgs.length != item.arguments.length) {
							throw `Invalid number of argments (${bondArgs.length} given, ${item.arguments.length} expected)`
						}
						return new TransformBond(args => {
							let encoded_args = encoded(args, item.arguments.map(x => x.type))
							return new Uint8Array([module_index - 1, item.id, ...encoded_args])
						}, [bondArgs], [], 3, 3, undefined, true)
					}
					c[camel(item.name)].help = item.arguments.map(a => a.name)
				})
			}
			this.runtime[m.prefix] = o
			this.call[m.prefix] = c;
		})
		let that = this
		m.modules.forEach(m => {
			if (m.storage) {
				let s = 'addExtra' + m.storage.prefix
				if (that[s]) {
					that[s]()
				}
			}
		})

		this.ready()
	}

	addExtraSession () {
		let timestamp = this.runtime.timestamp
		let session = this.runtime.session
		if (session._extras) {
			return
		} else {
			session._extras = true
		}

		session.blocksRemaining = Bond					// 1..60
			.all([this.height, session.lastLengthChange, session.sessionLength])
			.map(([h, c, l]) => {
				c = (c || 0);
				return l - (h - c + l) % l;
			});
		session.lateness = Bond
			.all([
				timestamp.blockPeriod,
				timestamp.now,
				session.blocksRemaining,
				session.sessionLength,
				session.currentStart,
			]).map(([p, n, r, l, s]) => (n.number + p.number * r - s.number) / (p.number * l));
		session.percentLate = session.lateness.map(l => Math.round(l * 100 - 100));
	}

	addExtraBalances() {
		let balances = this.runtime.balances
		if (balances._extras) {
			return
		} else {
			balances._extras = true
		}

		balances.balance = who => Bond
			.all([balances.freeBalance(who), balances.reservedBalance(who)])
			.map(([f, r]) => new Balance(f + r));
		balances.totalBalance = balances.balance;
	}

	addExtraDemocracy () {
		let democracy = this.runtime.democracy
		if (democracy._extras) {
			return
		} else {
			democracy._extras = true
		}
/*	//TODO
		let referendumInfoOf = storageMap('dem:pro:', (r, index) => {
			if (r == null) return null;
			let [ends, proposal, voteThreshold] = decode(r, ['BlockNumber', 'Proposal', 'VoteThreshold']);
			return { index, ends, proposal, voteThreshold };
		}, i => toLE(i, 4), x => x.map(x =>
			Object.assign({votes: democracy.votersFor(x.index)
				.map(r => r || [])
				.mapEach(v => Bond.all([
					democracy.voteOf([x.index, v]),
					balances.balance(v)
				]))
				.map(tallyAmounts)
			}, x), 1));

		this.democracy = {
			proposed: storageValue('dem:pub', r => r ? decode(r, 'Vec<(PropIndex, Proposal, AccountId)>') : []).map(is => is.map(i => {
				let d = depositOf(i[0]);
				return { index: i[0], proposal: i[1], proposer: i[2], sponsors: d.map(v => v ? v.sponsors : null), bond: d.map(v => v ? v.bond : null) };
			}), 2),
			active: Bond.all([nextTally, referendumCount]).map(([f, t]) => [...Array(t - f)].map((_, i) => referendumInfoOf(f + i)), 1),
		};*/
	}

	addExtraStaking () {
		this.addExtraSession()
		this.addExtraBalances()
		let session = this.runtime.session
		let staking = this.runtime.staking
		let balances = this.runtime.balances
		if (staking._extras) {
			return
		} else {
			staking._extras = true
		}

		staking.thisSessionReward = Bond
			.all([staking.sessionReward, session.lateness])
			.map(([r, l]) => Math.round(r / l));

		staking.currentNominatedBalance = who => staking.currentNominatorsFor(who)
			.map(ns => ns.map(n => balances.totalBalance(n)), 2)
			.map(bs => new Balance(bs.reduce((a, b) => a + b, 0)))
		staking.nominatedBalance = who => staking.nominatorsFor(who)
			.map(ns => ns.map(n => balances.totalBalance(n)), 2)
			.map(bs => new Balance(bs.reduce((a, b) => a + b, 0)))
		staking.stakingBalance = who => Bond
			.all([balances.totalBalance(who), staking.nominatedBalance(who)])
			.map(([f, r]) => new Balance(f + r));
		staking.currentStakingBalance = who => Bond
			.all([balances.totalBalance(who), staking.currentNominatedBalance(who)])
			.map(([f, r]) => new Balance(f + r));
			
		staking.eraLength = Bond
			.all([
				staking.sessionsPerEra,
				session.sessionLength
			]).map(([a, b]) => a * b);
		
		staking.validators = session.validators
			.map(v => v.map(who => ({
				who,
				ownBalance: balances.totalBalance(who),
				otherBalance: staking.currentNominatedBalance(who),
				nominators: staking.currentNominatorsFor(who)
			})), 2)
			.map(v => v
				.map(i => Object.assign({balance: i.ownBalance.add(i.otherBalance)}, i))
				.sort((a, b) => b.balance - a.balance)
			);

		staking.nextThreeUp = staking.intentions.map(
			l => ([session.validators, l.map(who => ({
				who, ownBalance: balances.totalBalance(who), otherBalance: staking.nominatedBalance(who)
			}) ) ]), 3
		).map(([c, l]) => l
			.map(i => Object.assign({balance: i.ownBalance.add(i.otherBalance)}, i))
			.sort((a, b) => b.balance - a.balance)
			.filter(i => !c.some(x => x+'' == i.who+''))
			.slice(0, 3)
		);

		staking.nextValidators = Bond
			.all([
				staking.intentions.map(v => v.map(who => ({
					who,
					ownBalance: balances.totalBalance(who),
					otherBalance: staking.nominatedBalance(who),
					nominators: staking.nominatorsFor(who)
				})), 2),
				staking.validatorCount
			]).map(([as, vc]) => as
				.map(i => Object.assign({balance: i.ownBalance.add(i.otherBalance)}, i))
				.sort((a, b) => b.balance - a.balance)
				.slice(0, vc)
			);
		staking.eraSessionsRemaining = Bond
			.all([
				staking.sessionsPerEra,
				session.currentIndex,
				staking.lastEraLengthChange
			]).map(([spe, si, lec]) => (spe - 1 - (si - lec) % spe));
		staking.eraBlocksRemaining = Bond
			.all([
				session.sessionLength,
				staking.eraSessionsRemaining,
				session.blocksRemaining
			]).map(([sl, sr, br]) => br + sl * sr);
	}

	denominationInfo () { 
		return this._denominationInfo;
	}
	denominations () {
		return this._denominations;
	}

	initialiseDenominations (di) {
		if (!di.denominations[di.primary]) {
			throw new Error(`Denominations must include primary as key`)
		}
		
		let name = di.unit
		let denom = 0
		let ds = []
		for (let i = 0; i <= di.denominations[di.primary] + 6; i += 3) {
			let n = Object.keys(di.denominations).find(k => di.denominations[k] == i)
			if (n) {
				name = n
				denom = i
			}
			ds.push(siPrefix(i - denom) + name)
		}
		this._denominations = ds
		this._denominationInfo = di;
	}

	constructor (denominationInfo) {
		let that = this;
		s_substrate = this;

		this.chain = {
			head: new SubscriptionBond('chain_newHead').subscriptable()
		}
		this.chain.height = this.chain.head.map(h => new BlockNumber(h.number))
		this.chain.header = hashBond => new TransformBond(hash => service.request('chain_getHeader', [hash]), [hashBond]).subscriptable();
		this.chain.hash = numberBond => new TransformBond(number => service.request('chain_getBlockHash', [number]), [numberBond]);
		service.request('chain_getBlockHash', [0]).then(h => that.genesisHash = hexToBytes(h))
		this.system = {
			name: new TransformBond(() => service.request('system_name')).subscriptable(),
			version: new TransformBond(() => service.request('system_version')).subscriptable(),
			chain: new TransformBond(() => service.request('system_chain')).subscriptable()
		}
		this.state = {
			authorityCount: new SubscriptionBond('state_storage', [['0x' + bytesToHex(stringToBytes(':auth:len'))]], r => decode(hexToBytes(r.changes[0][1]), 'u32')),
			code: new SubscriptionBond('state_storage', [['0x' + bytesToHex(stringToBytes(':code'))]], r => hexToBytes(r.changes[0][1])),
			codeHash: new TransformBond(() => service.request('state_getStorageHash', ['0x' + bytesToHex(stringToBytes(":code"))]).then(hexToBytes), [], [this.chain.head]),
			codeSize: new TransformBond(() => service.request('state_getStorageSize', ['0x' + bytesToHex(stringToBytes(":code"))]), [], [this.chain.head])
		}
		this.state.authorities = this.state.authorityCount.map(
			n => [...Array(n)].map((_, i) =>
				new SubscriptionBond('state_storage',
					[[ '0x' + bytesToHex(stringToBytes(":auth:")) + bytesToHex(toLE(i, 4)) ]],
					r => decode(hexToBytes(r.changes[0][1]), 'AccountId')
				)
			), 2);

		service.request('state_getMetadata')
			.then(blob => decode(hexToBytes(blob), 'RuntimeMetadata'))
			.then(m => that.initialiseFromMetadata(m))

		this.onReady = []
	}

	whenReady (callback) {
		if (this.onReady instanceof Array) {
			this.onReady.push(callback)
		} else {
			callback()
		}
	}
	ready () {
		this.onReady.forEach(x => x())
		delete this.onReady
	}
}

if (typeof window !== 'undefined') {
	window.ss58_encode = ss58_encode;
	window.ss58_decode = ss58_decode;
	window.bytesToHex = bytesToHex;
	window.stringToBytes = stringToBytes;
	window.hexToBytes = hexToBytes;
	window.toLE = toLE;
	window.leToNumber = leToNumber;
	window.storageMapKey = storageMapKey;
	window.storageValueKey = storageValueKey;
	window.pretty = pretty;
	window.decode = decode;
	window.service = service;
	window.SubscriptionBond = SubscriptionBond;
	window.TransactionBond = SubscriptionBond;
	window.StorageBond = StorageBond;
	window.nacl = nacl;
	window.secretStore = secretStore;
	window.encoded = encoded;
	window.makeTransaction = makeTransaction;
	window.post = post;
	window.Bond = Bond;
}

function siPrefix(pot) {
	switch (pot) {
		case -24: return 'y'
		case -21: return 'z'
		case -18: return 'a'
		case -15: return 'f'
		case -12: return 'p'
		case -9: return 'n'
		case -6: return 'µ'
		case -3: return 'm'
		case 0: return ''
		case 3: return 'k'
		case 6: return 'M'
		case 9: return 'G'
		case 12: return 'T'
		case 15: return 'P'
		case 18: return 'E'
		case 21: return 'Z'
		case 24: return 'Y'
	}
}

module.exports = { ss58_decode, ss58_encode, pretty, stringToSeed, stringToBytes,
	hexToBytes, bytesToHex, toLEHex, leHexToNumber, toLE,
	leToNumber, Substrate, reviver, AccountId, Hash, VoteThreshold, Moment, Balance,
	BlockNumber, Tuple, TransactionBond, secretStore, substrate, post
}