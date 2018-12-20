const { camel } = require('change-case');
const { Bond, TransformBond } = require('oo7')
const { nodeService } = require('./nodeService')
const { SubscriptionBond } = require('./subscriptionBond')
const { BlockNumber, Hash } = require('./types');
const { decode, encode } = require('./codec');
const { stringToBytes, hexToBytes, bytesToHex, toLE } = require('./utils')
const { StorageBond } = require('./storageBond')
const { setMetadata } = require('./metadata')

let chain = (() => {
	let head = new SubscriptionBond('chain_newHead').subscriptable()
	let finalisedHead = new SubscriptionBond('chain_finalisedHead').subscriptable()
	let height = head.map(h => new BlockNumber(h.number))
	let header = hashBond => new TransformBond(hash => nodeService().request('chain_getHeader', [hash]), [hashBond]).subscriptable()
	let hash = numberBond => new TransformBond(number => nodeService().request('chain_getBlockHash', [number]), [numberBond])
	return { head, finalisedHead, height, header, hash }
})()

let system = (() => {
	let name = new TransformBond(() => nodeService().request('system_name')).subscriptable()
	let version = new TransformBond(() => nodeService().request('system_version')).subscriptable()
	let chain = new TransformBond(() => nodeService().request('system_chain')).subscriptable()
	return { name, version, chain }
})()

let version = (new SubscriptionBond('state_runtimeVersion', [], r => {
	let apis = {}
	r.apis.forEach(([id, version]) => apis[String.fromCharCode.apply(null, id)] = version)
	return {
		authoringVersion: r.authoring_version,
		implName: r.impl_name,
		implVersion: r.impl_version,
		specName: r.spec_name,
		specVersion: r.spec_version,
		apis
	}
})).subscriptable()

setTimeout(() => version.tie(() => initRuntime(null, true)), 0)

let runtime = {
	version, 
	metadata: new Bond,
	core: (() => {
		let authorityCount = new SubscriptionBond('state_storage', [['0x' + bytesToHex(stringToBytes(':auth:len'))]], r => decode(hexToBytes(r.changes[0][1]), 'u32'))
		let authorities = authorityCount.map(
			n => [...Array(n)].map((_, i) =>
				new SubscriptionBond('state_storage',
					[[ '0x' + bytesToHex(stringToBytes(":auth:")) + bytesToHex(toLE(i, 4)) ]],
					r => decode(hexToBytes(r.changes[0][1]), 'AccountId')
				)
			), 2)
		let code = new SubscriptionBond('state_storage', [['0x' + bytesToHex(stringToBytes(':code'))]], r => hexToBytes(r.changes[0][1]))
		let codeHash = new TransformBond(() => nodeService().request('state_getStorageHash', ['0x' + bytesToHex(stringToBytes(":code"))]).then(hexToBytes), [], [version])
		let codeSize = new TransformBond(() => nodeService().request('state_getStorageSize', ['0x' + bytesToHex(stringToBytes(":code"))]), [], [version])
		return { authorityCount, authorities, code, codeHash, codeSize, version }
	})()
}

let calls = {}

class RuntimeUp extends Bond {
	initialise() {
		let that = this
		initRuntime(() => that.trigger(true))
	}
}
let runtimeUp = new RuntimeUp

let onRuntimeInit = []

function initialiseFromMetadata (md) {
	console.log("initialiseFromMetadata", md)
	setMetadata(md)
	md.modules.forEach((m) => {
		let o = {}
		let c = {}
		if (m.storage) {
			let storePrefix = m.storage.prefix
			m.storage.items.forEach(item => {
				switch (item.type.option) {
					case 'Plain': {
						o[camel(item.name)] = new StorageBond(`${storePrefix} ${item.name}`, item.type.value)
						break
					}
					case 'Map': {
						let keyType = item.type.value.key
						let valueType = item.type.value.value
						o[camel(item.name)] = keyBond => new TransformBond(
							key => new StorageBond(`${storePrefix} ${item.name}`, valueType, encode(key, keyType)),
							[keyBond]
						).subscriptable()
						break
					}
				}
			})
		}
		let moduleDispatch = md.outerDispatch.calls.find(c => c.prefix == m.prefix)
		if (m.module && m.module.call && moduleDispatch) {
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
						return new Uint8Array([moduleDispatch.index, item.id, ...encoded_args])
					}, [bondArgs], [], 3, 3, undefined, true)
				}
				c[camel(item.name)].help = item.arguments.map(a => a.name)
			})
		}
		runtime[m.prefix] = o
		calls[m.prefix] = c
	})
	md.modules.forEach(m => {
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

	runtime.metadata.trigger(md)

	console.log("initialiseFromMetadata DONE")
}

function initRuntime (callback = null, force = false) {
	if (onRuntimeInit instanceof Array) {
		onRuntimeInit.push(callback)
		if (onRuntimeInit.length === 1) {
			nodeService().request('state_getMetadata')
				.then(blob => decode(hexToBytes(blob), 'RuntimeMetadata'))
				.then(initialiseFromMetadata)
		}
	} else {
		if (force) {
			// reinitialise runtime
			console.info("Reinitialising runtime")
			onRuntimeInit = [callback]
			nodeService().request('state_getMetadata')
				.then(blob => decode(hexToBytes(blob), 'RuntimeMetadata'))
				.then(initialiseFromMetadata)
		}
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
