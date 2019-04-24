const { TextDecoder } = require('text-encoding')
const { ss58Decode } = require('./ss58')
const { VecU8, AccountId, Hash, Signature, VoteThreshold, RewardDestination, SlashPreference, Moment, Balance,
	BlockNumber, AccountIndex, Tuple, TransactionEra, Perbill, Permill } = require('./types')
const { toLE, leToNumber, leToSigned, bytesToHex, hexToBytes, stringToBytes } = require('./utils')
const { metadata } = require('./metadata')

const transforms = {
	MetadataHead: { magic: 'u32', version: 'u8' },
	MetadataBodyV3: { modules: 'Vec<MetadataModuleV3>' },
	MetadataBodyV2: { modules: 'Vec<MetadataModuleV2>' },
	MetadataBodyV1: { modules: 'Vec<MetadataModuleV1>' },
	MetadataBody: { modules: 'Vec<MetadataModule>' },
	MetadataModuleV1: { 
		name: 'String',
		prefix: 'String',
		storage: 'Option<Vec<MetadataStorageV1>>',
		calls: 'Option<Vec<MetadataCall>>', 
		events: 'Option<Vec<MetadataEvent>>',
	},
	MetadataModuleV2: { 
		name: 'String',
		prefix: 'String',
		storage: 'Option<Vec<MetadataStorageV2>>',
		calls: 'Option<Vec<MetadataCall>>', 
		events: 'Option<Vec<MetadataEvent>>',
	},
	MetadataModuleV3: { 
		name: 'String',
		prefix: 'String',
		storage: 'Option<Vec<MetadataStorageV3>>',
		calls: 'Option<Vec<MetadataCall>>', 
		events: 'Option<Vec<MetadataEvent>>',
	},
	MetadataModule: { 
		name: 'String',
		prefix: 'String',
		storage: 'Option<Vec<MetadataStorage>>',
		calls: 'Option<Vec<MetadataCall>>', 
		events: 'Option<Vec<MetadataEvent>>',
	},
	MetadataStorageV1: {
		name: 'String',
		modifier: { _enum: [ 'Optional', 'Default' ] },
		type: { _enum: { Plain: 'Type', Map: { key: 'Type', value: 'Type' } } },
		default: 'Vec<u8>',
		documentation: 'Docs',
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
	MetadataStorageV2: {
		name: 'String',
		modifier: { _enum: [ 'Optional', 'Default' ] },
		type: { _enum: { Plain: 'Type', Map: { key: 'Type', value: 'Type', iterable: 'bool' } } },
		default: 'Vec<u8>',
		documentation: 'Docs',
		_post: x => {
			let def = null
			try {
				if (x.default && (x.default.length > 1 || x.default.length == 1 && x.default[0] != 0)) {
					def = decode(
						x.default,
						x.type.option === 'Plain' ? x.type.value : x.type.value.value
					)
				}
			}
			catch (e) {}
			x.default = def
		}
	},
	MetadataStorageV3: {
		name: 'String',
		modifier: { _enum: [ 'Optional', 'Default' ] },
		type: { _enum: { Plain: 'Type', Map: { key: 'Type', value: 'Type', iterable: 'bool' }, DoubleMap: { first_key: 'Type', second_key: 'Type', value: 'Type', iterable: 'bool' } } },
		default: 'Vec<u8>',
		documentation: 'Docs',
		_post: x => {
			let def = null
			try {
				if (x.modifier.option == 'Default') {
					def = decode(
						x.default,
						x.type.option === 'Plain' ? x.type.value : x.type.value.value
					)
//					if (x.type.option == 'Plain')
//						console.log("Decoding default to:", x.name, x.modifier, x.default, x.type.value, def)
				}
			}
			catch (e) {
				console.log("Couldn't decode default!", x.name, x.modifier, x.default, x.type.value)
			}
			x.default = def
		}
	},
	StorageHasher: { _enum: [ 'Blake2_128', 'Blake2_256', 'Twox128', 'Twox256', 'Twox64Concat' ] },
	MetadataStorage: {
		name: 'String',
		modifier: { _enum: [ 'Optional', 'Default' ] },
		type: { _enum: { Plain: 'Type', Map: { hasher: 'StorageHasher', key: 'Type', value: 'Type', iterable: 'bool' }, DoubleMap: { hasher: 'StorageHasher', first_key: 'Type', second_key: 'Type', value: 'Type', iterable: 'bool' } } },
		default: 'Vec<u8>',
		documentation: 'Docs',
		_post: x => {
			let def = null
			try {
				if (x.modifier.option == 'Default') {
					def = decode(
						x.default,
						x.type.option === 'Plain' ? x.type.value : x.type.value.value
					)
//					if (x.type.option == 'Plain')
//						console.log("Decoding default to:", x.name, x.modifier, x.default, x.type.value, def)
				}
			}
			catch (e) {
				console.log("Couldn't decode default!", x.name, x.modifier, x.default, x.type.value)
			}
			x.default = def
		}
	},
	MetadataCall: {
		name: 'String',
		arguments: 'Vec<MetadataCallArg>',
		documentation: 'Docs',
	},
	MetadataCallArg: { name: 'String', type: 'Type' },
	MetadataEvent: {
		name: 'String',
		arguments: 'Vec<Type>',
		documentation: 'Docs',
	},
	Docs: 'Vec<String>',

	NewAccountOutcome: { _enum: [ 'NoHint', 'GoodHint', 'BadHint' ] },
	UpdateBalanceOutcome: { _enum: [ 'Updated', 'AccountKilled' ] },

	Transaction: { version: 'u8', sender: 'Address', signature: 'Signature', index: 'Compact<Index>', era: 'TransactionEra', call: 'Call' },
	Phase: { _enum: { ApplyExtrinsic: 'u32', Finalization: undefined } },
	EventRecord: { phase: 'Phase', event: 'Event' },
	ValidatorPrefs: { unstakeThreshold: 'Compact<u32>', validatorPayment: 'Compact<Balance>' },
	UnlockChunk: { value: 'Compact<Balance>', era: 'Compact<BlockNumber>' },
	StakingLedger: { stash: 'AccountId', total: 'Compact<Balance>', active: 'Compact<Balance>', unlocking: 'Vec<UnlockChunk>' },
	IndividualExposure: { who: 'AccountId', value: 'Compact<Balance>' },
	Exposure: { total: 'Compact<Balance>', own: 'Compact<Balance>', others: 'Vec<IndividualExposure>' },
	
	"Exposure<AccountId,BalanceOf<T>>": 'Exposure',
	"IndividualExposure<AccountId,BalanceOf<T>>": 'IndividualExposure',
	"BalanceOf<T>": 'Balance',
	"<LookupasStaticLookup>::Source": 'Address',
	"RawAddress<AccountId,AccountIndex>": 'Address',
	"Address<AccountId,AccountIndex>": 'Address',
	"StakingLedger<AccountId,BalanceOf<T>,BlockNumber>": 'StakingLedger',
	"UnlockChunk<BalanceOf<T>,BlockNumber>": 'UnlockChunk',
	
	"Schedule<Gas>": { offset: 'Gas', per_block: 'Gas' },
	ProposalIndex: 'u32',
	Gas: 'u64',
	LockPeriods: 'i8',
	ParaId: 'u32',
	VoteIndex: 'u32',
	PropIndex: 'u32',
	ReferendumIndex: 'u32',
	Index: 'u64',

	KeyValue: '(Vec<u8>, Vec<u8>)',
	ParaId: 'u32'
};

function addCodecTransform(type, transform) {
	if (!transforms[type]) {
		transforms[type] = transform
	}
}

var decodePrefix = '';

const VOTE_THRESHOLD = ['SuperMajorityApprove', 'NotSuperMajorityAgainst', 'SimpleMajority'];
const REWARD_DESTINATION = ['Staked', 'Stash', 'Controller'];

function decode(input, type) {
	if (typeof input.data === 'undefined') {
		input = { data: input };
	}
	if (typeof type === 'object') {
		let res = {};
		if (type instanceof Array) {
			// just a tuple
			res = new Tuple(type.map(t => decode(input, t)));
		} else if (!type._enum) {
			// a struct
			Object.keys(type).forEach(k => {
				if (k != '_post') {
					res[k] = decode(input, type[k])
				}
			});
		} else if (type._enum instanceof Array) {
			// simple enum
			let n = input.data[0];
			input.data = input.data.slice(1);
			res = { option: type._enum[n] };
		} else if (type._enum) {
			// enum
			let n = input.data[0];
			input.data = input.data.slice(1);
			let option = Object.keys(type._enum)[n];
			res = { option, value: typeof type._enum[option] === 'undefined' ? undefined : decode(input, type._enum[option]) };
		}
		if (type._post) {
			type._post(res)
		}
		return res;
	}
	type = type.replace(/ /g, '').replace(/^(T::)+/, '').replace(/<BalanceOf<T>>$/, '');
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
		res = decode(input, transform);
		res._type = type;
	} else {
		switch (type) {
			case 'Call':
			case 'Proposal': {
				throw "Cannot represent Call/Proposal"
			}
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
			case 'Signature': {
				res = new Signature(input.data.slice(0,64));
				input.data = input.data.slice(64);
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
				res = new VoteThreshold(VOTE_THRESHOLD[input.data[0]]);
				input.data = input.data.slice(1);
				break;
			}
			case 'RewardDestination': {
				res = new RewardDestination(REWARD_DESTINATION[input.data[0]]);
				input.data = input.data.slice(1);
				break;
			}
			case 'SlashPreference': {
				res = new SlashPreference(decode(input, 'u32'));
				break;
			}
			case 'Perbill': {
				res = new Perbill(decode(input, 'u32') / 1000000000.0);
				break;
			}
			case 'Permill': {
				res = new Permill(decode(input, 'u32') / 1000000.0);
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
					res = leToNumber(input.data.slice(0, 4)) >> 2;
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
			case 'u32': {
				res = leToNumber(input.data.slice(0, 4));
				input.data = input.data.slice(4);
				break;
			}
			case 'u64': {
				res = leToNumber(input.data.slice(0, 8));
				input.data = input.data.slice(8);
				break;
			}
			case 'u128': {
				res = leToNumber(input.data.slice(0, 16));
				input.data = input.data.slice(16);
				break;
			}
			case 'i8': {
				res = leToSigned(input.data.slice(0, 1));
				input.data = input.data.slice(1);
				break;
			}
			case 'i16':
				res = leToSigned(input.data.slice(0, 2));
				input.data = input.data.slice(2);
				break;
			case 'i32': {
				res = leToSigned(input.data.slice(0, 4));
				input.data = input.data.slice(4);
				break;
			}
			case 'i64': {
				res = leToSigned(input.data.slice(0, 8));
				input.data = input.data.slice(8);
				break;
			}
			case 'i128': {
				res = leToSigned(input.data.slice(0, 16));
				input.data = input.data.slice(16);
				break;
			}
			case 'bool': {
				res = !!input.data[0];
				input.data = input.data.slice(1);
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
	if (!type) {
		if (typeof value == 'object') {
			if (value._type) {
				type = value._type
			}
		}
		if (typeof value == 'number') {
			type = 'u128'
		}
		if (typeof value == 'string') {
			type = 'String'
		}
	}
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
	if (typeof type != 'string') {
		console.log("Invalid encode type", type)
		throw 'type must be either an array or a string'
	}
	type = type.replace(/ /g, '').replace(/^(T::)+/, '').replace(/<BalanceOf<T>>$/, '');

	if (typeof value == 'string' && value.startsWith('0x')) {
		value = hexToBytes(value)
	}

	if (transforms[type]) {
		let transform = transforms[type]
		if (transform instanceof Array || typeof transform == 'string') {
			// just a tuple or string
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

	// other type-specific transforms
	if (type == 'String') {
		if (typeof value == 'string') {
			v = stringToBytes(value);
			return new Uint8Array([...encode(v.length, 'Compact<u32>'), ...v])
		}
	}

	let match_vec = type.match(/^Vec<(.*)>$/);
	if (match_vec) {
		if (value instanceof Array) {
			let res = new Uint8Array([...encode(value.length, 'Compact<u32>')])
			value.forEach(v => {
				let x = encode(v, match_vec[1])
				r = new Uint8Array(res.length + x.length)
				r.set(res)
				r.set(x, res.length)
				res = r
			})
			return res
		}
	}

	let t = type.match(/^\((.*)\)$/)
	if (t) {
		return encode(value, t[1].split(','))
	}

	if (type == 'Address') {
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

	if (type.startsWith('[') && type.endsWith(']')) {
		if (value instanceof Uint8Array) {
			return value
		} else if (value instanceof Array) {
			let type = type.substr(1, type.length - 2)
			let x = value.map(i => encode(i, type));
			let res = new Uint8Array();
			x.forEach(x => {
				r = new Uint8Array(res.length + x.length);
				r.set(res)
				r.set(x, res.length)
				res = r
			})
			return res
		}
	}

	if (type == 'RewardDestination') {
		if (typeof value == 'string') {
			let i = REWARD_DESTINATION.indexOf(value);
			if (i != -1) {
				return new Uint8Array([i])
			}
		} else if (typeof value == 'number' && value < 3) {
			return new Uint8Array([value])
		}
	}

	if (typeof value == 'number'
		|| (typeof value == 'string' && +value + '' == value)
		|| (type == 'Balance' && value instanceof Balance)
		|| (type == 'AccountIndex' && value instanceof AccountIndex)
		|| (type == 'BlockNumber' && value instanceof BlockNumber)
	) {
		value = +value
		switch (type) {
			case 'Balance':
			case 'u128':
			case 'i128':
				return toLE(value, 16)
			case 'BlockNumber':
			case 'u64':
			case 'i64':
				return toLE(value, 8)
			case 'AccountIndex':
			case 'u32':
			case 'i32':
				return toLE(value, 4)
			case 'u16':
			case 'i16':
				return toLE(value, 2)
			case 'u8':
			case 'i8':
				return toLE(value, 1)
			default:
				break
		}
	}

	if ((value instanceof Perbill || typeof value === 'number') && type == 'Perbill') {
		return toLE(value * 1000000000, 4)
	}

	if ((value instanceof Permill || typeof value === 'number') && type == 'Permill') {
		return toLE(value * 1000000, 4)
	}

	if (value instanceof Uint8Array) {
		if (type == 'Signature' && value.length == 64) {
			return value
		}
		if (type == 'Hash' && value.length == 32) {
			return value
		}
	}

	if (value.constructor.name == type && typeof value.encode == 'function') {
		return value.encode()
	}
	if (type == 'TransactionEra') {
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
			case 'Proposal':
				break
			default:
				console.warn(`Value passed apparently pre-encoded without whitelisting ${type}`)
		}
		return value
	}

	throw `Value cannot be encoded as type: ${value}, ${type}`
}

module.exports = { decode, encode, addCodecTransform }