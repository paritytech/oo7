const { ss58Decode } = require('./ss58')
const { VecU8, AccountId, Hash, VoteThreshold, SlashPreference, Moment, Balance,
	BlockNumber, AccountIndex, Tuple, TransactionEra } = require('./types')
const { toLE, leToNumber, bytesToHex } = require('./utils')
const { metadata } = require('./metadata')

const transforms = {
	RuntimeMetadata: { outerEvent: 'OuterEventMetadata', modules: 'Vec<RuntimeModuleMetadata>', outerDispatch: 'OuterDispatchMetadata' },
	OuterDispatchMetadata: { name: 'String', calls: 'Vec<OuterDispatchCall>' },
	OuterDispatchCall: { name: 'String', prefix: 'String', index: 'u16' },
	RuntimeModuleMetadata: { prefix: 'String', module: 'ModuleMetadata', storage: 'Option<StorageMetadata>' },
	StorageFunctionModifier: { _enum: [ 'Optional', 'Default' ] },
	StorageFunctionTypeMap: { key: 'Type', value: 'Type' },
	StorageFunctionType: { _enum: { Plain: 'Type', Map: 'StorageFunctionTypeMap' } },
	StorageFunctionMetadata: {
		name: 'String',
		modifier: 'StorageFunctionModifier',
		type: 'StorageFunctionType',
		default: 'Vec<u8>',
		documentation: 'Vec<String>',
		_post: x => {
			try {
				if (x.default) {
					x.default = decode(
						x.default,
						x.type.option === 'Plain' ? x.type.value : x.type.value.value
					)
				}
			}
			catch (e) {
				x.default = null
			}
		}
	},
	StorageMetadata: { prefix: 'String', items: 'Vec<StorageFunctionMetadata>' },
	EventMetadata: { name: 'String', arguments: 'Vec<Type>', documentation: 'Vec<String>' },
	OuterEventMetadata: { name: 'String', events: 'Vec<(String, Vec<EventMetadata>)>' },
	ModuleMetadata: { name: 'String', call: 'CallMetadata' },
	CallMetadata: { name: 'String', functions: 'Vec<FunctionMetadata>' },
	FunctionMetadata: { id: 'u16', name: 'String', arguments: 'Vec<FunctionArgumentMetadata>', documentation: 'Vec<String>' },
	FunctionArgumentMetadata: { name: 'String', type: 'Type' },

	NewAccountOutcome: { _enum: [ 'NoHint', 'GoodHint', 'BadHint' ] },
	UpdateBalanceOutcome: { _enum: [ 'Updated', 'AccountKilled' ] },

	Transaction: { version: 'u8', sender: 'Address', signature: 'Signature', index: 'Index', era: 'TransactionEra', call: 'Call' },
	Phase: { _enum: { ApplyExtrinsic: 'u32', Finalization: undefined } },
	EventRecord: { phase: 'Phase', event: 'Event' }
};

var decodePrefix = '';

function decode(input, type) {
//	console.log("Decode", input, type);		
	if (typeof input.data === 'undefined') {
		input = { data: input };
	}
	if (typeof type === 'object') {
		return type.map(t => decode(input, t));
	}
	type = type.replace(/ /g, '').replace(/^(T::)+/, '');
	if (type == 'EventRecord<Event>') {
		type = 'EventRecord'
	}

	let reencodeCompact;
	let p1 = type.match(/^<([A-Z][A-Za-z0-9]*)asHasCompact>::Type$/);
	if (p1) {
		reencodeCompact = p1[1]
	}
	let p2 = type.match(/^Compact<([A-Za-z][A-Za-z0-9]*)>$/);
	if (p2) {
		reencodeCompact = p2[1]
	}
	if (reencodeCompact) {
		return decode(encode(decode(input, 'Compact'), reencodeCompact), reencodeCompact);
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
					if (k != '_post') {
						res[k] = decode(input, transform[k])
					}
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
				res = { option, value: typeof transform._enum[option] === 'undefined' ? undefined : decode(input, transform._enum[option]) };
			}
		}
		if (transform._post) {
			transform._post(res)
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
			case 'Event': {
				let events = metadata().outerEvent.events
				let moduleIndex = decode(input, 'u8')
				let module = events[moduleIndex][0]
				let eventIndex = decode(input, 'u8')
				let name = events[moduleIndex][1][eventIndex].name
				let args = decode(input, events[moduleIndex][1][eventIndex].arguments)
				res = { _type: 'Event', module, name, args }
				break
			}
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
			case 'AccountIndex': {
				res = leToNumber(input.data.slice(0, 4));
				input.data = input.data.slice(4);
				res = new AccountIndex(res);
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
			case 'Compact': {
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
					len = 1 + n;
				}
				input.data = input.data.slice(len);
				break;
			}
			case 'u8':
				res = input.data.slice(0, 1);
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
					res = new Tuple(...decode(input, t[1].split(',')));
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

function encode(value, type = null) {
	// if an array then just concat
	if (type instanceof Array) {
		if (value instanceof Array) {
			let x = value.map((i, index) => encode(i, type[index]));
			let res = new Uint8Array();
			x.forEach(x => {
				r = new Uint8Array(res.length + x.length);
				r.set(res)
				r.set(x, res.length)
				res = r
			})
			return res
		} else {
			throw 'If type is array, value must be too'
		}
	}
	if (typeof value == 'object' && !type && value._type) {
		type = value._type
	}
	if (typeof type != 'string') {
		throw 'type must be either an array or a string'
	}
	type = type.replace(/ /g, '').replace(/^(T::)+/, '');

	if (typeof value == 'string' && value.startsWith('0x')) {
		value = hexToBytes(value)
	}

	if (transforms[type]) {
		let transform = transforms[type]
		if (transform instanceof Array) {
			// just a tuple
			return encode(value, transform)
		} else if (!transform._enum) {
			// a struct
			let keys = []
			let types = []
			Object.keys(transform).forEach(k => {
				keys.push(value[k])
				types.push(transform[k])
			})
			return encode(keys, types)
		} else if (transform._enum instanceof Array) {
			// simple enum
			return new Uint8Array([transform._enum.indexOf(value.option)])
		} else if (transform._enum) {
			// enum
			let index = Object.keys(transform._enum).indexOf(value.option)
			let value = encode(value.value, transform._enum[value.option])
			return new Uint8Array([index, ...value])
		}
	}

	// other type-specific transforms
	if (type == 'Vec<u8>') {
		if (typeof value == 'object' && value instanceof Uint8Array) {
			return new Uint8Array([...encode(value.length, 'Compact<u32>'), ...value])
		}
	}

	if (type == 'Address' || type == 'RawAddress<AccountId,AccountIndex>' || type == 'Address<AccountId,AccountIndex>') {
		if (typeof value == 'string') {
			value = ss58Decode(value)
		}
		if (typeof value == 'object' && value instanceof Uint8Array && value.length == 32) {
			return new Uint8Array([0xff, ...value])
		}
		if (typeof value == 'number' || value instanceof AccountIndex) {
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
			return ss58Decode(value);
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
			case 'AccountIndex':
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

	if (value instanceof AccountIndex && type == 'AccountIndex') {
		return toLE(value, 4)
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
	
	if (type.match(/^<[A-Z][A-Za-z0-9]*asHasCompact>::Type$/) || type.match(/^Compact<[A-Za-z][A-Za-z0-9]*>$/) || type === 'Compact') {
		if (value < 1 << 6) {
			return new Uint8Array([value << 2])
		} else if (value < 1 << 14) {
			return toLE((value << 2) + 1, 2)
		} else if (value < 1 << 30) {
			return toLE((value << 2) + 2, 4)
		} else {
			let bytes = 0;
			for (let v = value; v > 0; v = Math.floor(v / 256)) { ++bytes }
			return new Uint8Array([3 + ((bytes - 4) << 2), ...toLE(value, bytes)])
		}
	}

	if (type == 'bool') {
		return new Uint8Array([value ? 1 : 0])
	}

	if (typeof type == 'string' && type.match(/\(.*\)/)) {
		return encode(value, type.substr(1, type.length - 2).split(','))
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

module.exports = { decode, encode }