const { camel } = require('change-case');
const { TransformBond } = require('oo7')
const { nodeService } = require('./nodeService')
const { SubscriptionBond } = require('./subscriptionBond')
const { BlockNumber } = require('./types');
const { decode, encode } = require('./codec');
const { post } = require('./transact');
const { stringToBytes, hexToBytes, bytesToHex, siPrefix } = require('./utils')
const { StorageBond } = require('./storageBond')
const metadata = require('./metadata')

class Substrate {
	constructor () {
		s_substrate = this
		let service = nodeService()

		service.request('chain_getBlockHash', [0]).then(h => s_substrate.genesisHash = hexToBytes(h))

		{
			let head = new SubscriptionBond('chain_newHead').subscriptable()
			let height = head.map(h => new BlockNumber(h.number))
			let header = hashBond => new TransformBond(hash => service.request('chain_getHeader', [hash]), [hashBond]).subscriptable();
			let hash = numberBond => new TransformBond(number => service.request('chain_getBlockHash', [number]), [numberBond]);
			this.chain = { head, height, header, hash }
		}
		
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
			.then(m => s_substrate._initialiseFromMetadata(m))

		this.onReady = []
	}

	post (tx) {
		post(tx, this)
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

	_initialiseFromMetadata(m) {
		if (metadata.set) {
			metadata.set(m)
		}
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
								key => new StorageBond(`${prefix} ${item.name}`, valueType, encode(key, keyType)),
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
							let encoded_args = encode(args, item.arguments.map(x => x.type))
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
				try {
					require(`./srml/${m.prefix}`).augment(that.runtime, that.chain)
				}
				catch (e) {}
			}
		})

		this.ready()
	}
}

let s_substrate = null

function substrate() {
	if (!s_substrate) {
		s_substrate = new Substrate
	}
	return s_substrate
}

module.exports = { Substrate, substrate }