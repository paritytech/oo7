const { camel } = require('change-case');
const { Bond, TransformBond } = require('oo7')
const { nodeService } = require('./nodeService')
const { SubscriptionBond } = require('./subscriptionBond')
const { BlockNumber, Hash } = require('./types');
const { decode, encode } = require('./codec');
const { stringToBytes, hexToBytes, bytesToHex ,toLE} = require('./utils')
const { StorageBond } = require('./storageBond')
const metadata = require('./metadata')

let chain = (() => {
	let head = new SubscriptionBond('chain_newHead').subscriptable()
	let height = head.map(h => new BlockNumber(h.number))
	let header = hashBond => new TransformBond(hash => nodeService().request('chain_getHeader', [hash]), [hashBond]).subscriptable()
	let hash = numberBond => new TransformBond(number => nodeService().request('chain_getBlockHash', [number]), [numberBond])
	return { head, height, header, hash }
})()

let system = (() => {
	let name = new TransformBond(() => nodeService().request('system_name')).subscriptable()
	let version = new TransformBond(() => nodeService().request('system_version')).subscriptable()
	let chain = new TransformBond(() => nodeService().request('system_chain')).subscriptable()
	return { name, version, chain }
})()

let runtime = { core: (() => {
	let authorityCount = new SubscriptionBond('state_storage', [['0x' + bytesToHex(stringToBytes(':auth:len'))]], r => decode(hexToBytes(r.changes[0][1]), 'u32'))
	let authorities = authorityCount.map(
		n => [...Array(n)].map((_, i) =>
			new SubscriptionBond('state_storage',
				[[ '0x' + bytesToHex(stringToBytes(":auth:")) + bytesToHex(toLE(i, 4)) ]],
				r => decode(hexToBytes(r.changes[0][1]), 'AccountId')
			)
		), 2)
	let code = new SubscriptionBond('state_storage', [['0x' + bytesToHex(stringToBytes(':code'))]], r => hexToBytes(r.changes[0][1]))
	let codeHash = new TransformBond(() => nodeService().request('state_getStorageHash', ['0x' + bytesToHex(stringToBytes(":code"))]).then(hexToBytes), [], [chain.head])
	let codeSize = new TransformBond(() => nodeService().request('state_getStorageSize', ['0x' + bytesToHex(stringToBytes(":code"))]), [], [chain.head])
	return { authorityCount, authorities, code, codeHash, codeSize }
})() }

let calls = {}

class RuntimeUp extends Bond {
	initialise() {
		let that = this
		initRuntime(() => that.trigger(true))
	}
}
let runtimeUp = new RuntimeUp

let onRuntimeInit = []

function initialiseFromMetadata (m) {
	if (metadata.set) {
		metadata.set(m)
	}
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
		runtime[m.prefix] = o
		calls[m.prefix] = c
	})
	m.modules.forEach(m => {
		if (m.storage) {
			try {
				require(`./srml/${m.prefix}`).augment(runtime, chain)
			}
			catch (e) {
				if (!e.toString().startsWith('Error: Cannot find module')) {
					throw e
				}
			}
		}
	})
	onRuntimeInit.forEach(f => { if (f) f() })
	onRuntimeInit = null
}

function initRuntime (callback = null) {
	if (onRuntimeInit instanceof Array) {
		onRuntimeInit.push(callback)
		if (onRuntimeInit.length === 1) {
			nodeService().request('state_getMetadata')
				.then(blob => decode(hexToBytes(blob), 'RuntimeMetadata'))
				.then(initialiseFromMetadata)
		}
	} else {
		// already inited runtime
		if (callback) {
			callback()
		}
	}
}

function runtimePromise() {
	return new Promise((resolve, reject) => initRuntime(() => resolve(runtime)))
}

function callsPromise() {
	return new Promise((resolve, reject) => initRuntime(() => resolve(calls)))
}

module.exports = { initRuntime, runtimeUp, runtimePromise, callsPromise, runtime, calls, chain, system }
