const { Bond } = require('oo7')
const nacl = require('tweetnacl');
const { generateMnemonic, mnemonicToSeed, mnemonicToEntropy } = require('bip39')
const { ss58Encode } = require('./ss58')
const { AccountId } = require('./types')
const { encode } = require('./codec')
const { stringToBytes, bytesToHex, hexToBytes, toLE } = require('./utils')
const { blake2b } = require('blakejs')
const { pbkdf2Sync } = require('pbkdf2')
const { Buffer } = require('buffer')
const { waitReady, isReady, keypairFromSeed, sign, verify, deriveKeypairHard, derivePublicSoft, deriveKeypairSoft } = require('@polkadot/wasm-schnorrkel');
const wasmCrypto = require('@polkadot/wasm-crypto');

const DEV_PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk'

let edCache = {}
let srCache = {}

function chainCodeFor(x) {
	let r = encode(x)
	if (r.length <= 32) {
		r = [...r]
		while (r.length < 32) {
			r.push(0)
		}
		r = new Uint8Array(r)
	} else {
		r = blake2b(r)
	}
	return r
}

function deriveHardJunction(seed, cc) {
	return blake2b(encode(["Ed25519HDKD", seed, cc], ['String', '[u8]', '[u8]']), null, 32)
}

function edSeedFromUri(uri) {
	if (!edCache[uri]) {
		if (uri.match(/^0x[0-9a-fA-F]{64}$/)) {
			edCache[uri] = hexToBytes(uri)
		} else {
			let m = uri.match(/^([a-z]+( [a-z]+){11})?((\/\/?[^\/]*)*)(\/\/\/(.*))?$/)
			if (m) {
				let password = m[6] || ''
				let phrase = m[1] || DEV_PHRASE
				let seed = wasmCrypto.bip39ToMiniSecret(phrase, password)
//				let entropy = new Buffer(hexToBytes(mnemonicToEntropy(phrase)))
//				let salt = new Buffer(stringToBytes(`mnemonic${password}`))
//				let seed = pbkdf2Sync(entropy, salt, 2048, 64, 'sha512').slice(0, 32);
				let rest = m[3];
				while (rest != '') {
					let m = rest.match(/^\/(\/?)([^\/]*)(\/.*)?$/)
					if (m[2].match(/^[0-9]+$/)) {
						m[2] = +m[2]
					}
					let cc = chainCodeFor(m[2])
					if (m[1] == '/') {
						// hard key -all good
						seed = deriveHardJunction(seed, cc)
					} else {
						throw "Soft key"
					}
					rest = m[3] || ''
				}
				edCache[uri] = seed
			} else {
				throw "Invalid secret URI"
			}
		}
	}
	return edCache[uri]
}

function srKeypairToAccountId(pair) {
	return new AccountId(srKeypairToPublic(pair))
}

function srKeypairToPublic(pair) {
	return new Uint8Array(pair.slice(64, 96))
}

function srKeypairToSecret(pair) {
	return new Uint8Array(pair.slice(0, 64))
}

function srKeypairFromUri(uri) {
	if (!srCache[uri]) {
		if (uri.match(/^0x[0-9a-fA-F]{64}$/)) {
			srCache[uri] = keypairFromSeed(hexToBytes(uri))
		} else {
			let m = uri.match(/^([a-z]+( [a-z]+){11})?((\/\/?[^\/]*)*)(\/\/\/(.*))?$/)
			if (m) {
				let password = m[6] || ''
				let phrase = m[1] || DEV_PHRASE

				let seed = wasmCrypto.bip39ToMiniSecret(phrase, password)
/*				let entropy = new Buffer(hexToBytes(mnemonicToEntropy(phrase)))
				let salt = new Buffer(stringToBytes(`mnemonic${password}`))
				let seed = pbkdf2Sync(entropy, salt, 2048, 64, 'sha512').slice(0, 32)*/
				let pair = keypairFromSeed(seed)

				let rest = m[3];
				while (rest != '') {
					let m = rest.match(/^\/(\/?)([^\/]*)(\/.*)?$/)
					if (m[2].match(/^[0-9]+$/)) {
						m[2] = +m[2]
					}
					let cc = chainCodeFor(m[2])
					if (m[1] == '/') {
						pair = deriveKeypairHard(pair, cc)
					} else {
						pair = deriveKeypairSoft(pair, cc)
					}
					rest = m[3] || ''
				}

				srCache[uri] = pair
			} else {
				throw "Invalid secret URI"
			}
		}
	}
	return srCache[uri]
}

window.chainCodeFor = chainCodeFor
window.deriveHardJunction = deriveHardJunction
window.edSeedFromUri = edSeedFromUri
window.pbkdf2Sync = pbkdf2Sync
window.Buffer = Buffer
window.mnemonicToEntropy = mnemonicToEntropy
window.isReady = isReady
window.waitReady = waitReady
window.keypairFromSeed = keypairFromSeed
window.sign = sign
window.deriveKeypairHard = deriveKeypairHard
window.derivePublicSoft = derivePublicSoft
window.deriveKeypairSoft = deriveKeypairSoft
window.srKeypairFromUri = srKeypairFromUri
window.srKeypairToPublic = srKeypairToPublic
window.wasmCrypto = wasmCrypto

const ED25519 = 'ed25519'
const SR25519 = 'sr25519'

function overrideType(uri, type) {
	let m = uri.match(/^((ed25519:)|(sr25519:))?(.*)$/)
	if (m) {
		switch (m[1]) {
			case 'ed25519:':
				type = ED25519
				break
			case 'sr25519:':
				type = SR25519
				break
			default:
		}
		uri = m[4];
	}
	return {uri, type}
}

class SecretStore extends Bond {
	constructor (storage) {
		super()
		this._storage = storage || typeof localStorage === 'undefined' ? {} : localStorage
		this._keys = []
		this._load()
	}

	generateMnemonic (wordCount = 12) {
		return wasmCrypto.bip39Generate(wordCount)
	}

	submit (_uri, name, _type = SR25519) {
		let {uri, type} = overrideType(_uri, _type)
		this._keys.push({uri, name, type})
		this._sync()
		return this.accountFromPhrase(uri, type)
	}

	accountFromPhrase (_uri, _type = SR25519) {
		try {
			let {uri, type} = overrideType(_uri, _type)
			if (type == ED25519) {
				return new AccountId(nacl.sign.keyPair.fromSeed(edSeedFromUri(uri)).publicKey)
			} else if (type == SR25519) {
				return srKeypairToAccountId(srKeypairFromUri(uri))
			}
		}
		catch (e) {
			return null
		}
	}

	accounts () {
		return this._keys.map(k => k.account)
	}

	find (identifier) {
		if (this._keys.indexOf(identifier) !== -1) {
			return identifier
		}
		if (identifier instanceof Uint8Array && identifier.length == 32 || identifier instanceof AccountId) {
			identifier = ss58Encode(identifier)
		}
		return this._byAddress[identifier] ? this._byAddress[identifier] : this._byName[identifier]
	}

	sign (from, data) {
		let item = this.find(from)
		if (item) {
			console.info(`Signing data from ${item.name}`, bytesToHex(data))
			let sig
			switch (item.type) {
				case ED25519: 
					sig = nacl.sign.detached(data, item.key.secretKey)
					if (!nacl.sign.detached.verify(data, sig, item.key.publicKey)) {
						console.warn(`Signature is INVALID!`)
						return null
					}
					break
				case SR25519:
					sig = sign(srKeypairToPublic(item.key), srKeypairToSecret(item.key), data)
					if (!verify(sig, data, srKeypairToPublic(item.key))) {
						console.warn(`Signature is INVALID!`)
						return null
					}
					break
			}
			console.info(`Signature is ${bytesToHex(sig)}`)
			return sig
		}
		return null
	}

	forget (identifier) {
		let item = this.find(identifier)
		if (item) {
			console.info(`Forgetting key ${item.name} (${item.address}, ${item.uri})`)
			this._keys = this._keys.filter(i => i !== item)
			this._sync()
		}
	}

	_load () {
		if (this._storage.secretStore) {
			this._keys = JSON.parse(this._storage.secretStore)
				.map(({keyData, seed, uri, phrase, name, type}) => ({
					name,
					keyData: null,//hexToBytes(keyData || seed),
					uri: uri || phrase,
					type: type || ED25519
				}))
		} else {
			this._keys = [{
				name: 'Default',
				uri: generateMnemonic(),
				type: SR25519
			}]
		}
		this._sync()
	}

	_sync () {
		let byAddress = {}
		let byName = {}
		this._keys = this._keys.map(({key, uri, keyData, name, type}) => {
			let item
			switch (type) {
				case ED25519: {
					keyData = keyData || edSeedFromUri(uri)
					key = key || nacl.sign.keyPair.fromSeed(keyData)
					let account = new AccountId(key.publicKey)
					item = {uri, name, type, key, keyData, account}
					break
				}
				case SR25519: {
					keyData = keyData || srKeypairFromUri(uri)
					key = key || keyData
					let account = srKeypairToAccountId(key)
					item = {uri, name, type, key, keyData, account}
					break
				}
			}
			if (item) {
				item.address = ss58Encode(item.account)
				byAddress[item.address] = item
				byName[item.name] = item
				return item
			}
		})
		this._byAddress = byAddress
		this._byName = byName
		this._storage.secretStore = JSON.stringify(this._keys.map(k => ({keyData: bytesToHex(k.keyData), uri: k.uri, name: k.name, type: k.type})))
		this.trigger({keys: this._keys, byAddress: this._byAddress, byName: this._byName})
	}
}

let s_secretStore = null;

function secretStore(storage) {
	if (s_secretStore === null) {
		s_secretStore = new SecretStore(storage);
	}
	return s_secretStore;
}

module.exports = { secretStore, SecretStore };
