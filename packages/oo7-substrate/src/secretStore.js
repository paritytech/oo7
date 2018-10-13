const { Bond } = require('oo7')
const nacl = require('tweetnacl');
const { generateMnemonic, mnemonicToSeed } = require('bip39')
const { ss58Encode } = require('./ss58')
const { AccountId } = require('./types')
const { bytesToHex, hexToBytes } = require('./utils')

let cache = {}

function keyFromSeed(seed) {
	if (!cache[seed]) {
		cache[seed] = seed.match(/^0x[0-9a-fA-F]{64}$/)
			? nacl.sign.keyPair.fromSeed(hexToBytes(seed))
			: nacl.sign.keyPair.fromSeed(new Uint8Array(mnemonicToSeed(seed).slice(0, 32)))
	}
	return cache[seed]
}

class SecretStore extends Bond {
	constructor () {
		super()
		this._keys = []
		this._load()
	}

	submit (seed, name) {
		this._keys.push({seed, name})
		this._sync()
		return this.accountFromSeed(seed)
	}

	accountFromSeed (seed) {
		return new AccountId(keyFromSeed(seed).publicKey)
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
			let sig = nacl.sign.detached(data, item.key.secretKey)
			console.info(`Signature is ${bytesToHex(sig)}`)
			if (!nacl.sign.detached.verify(data, sig, item.key.publicKey)) {
				console.warn(`Signature is INVALID!`)
				return null
			}
			return sig
		}
		return null
	}

	forget (identifier) {
		let item = this.find(identifier)
		if (item) {
			console.info(`Forgetting key ${item.name} (${item.address}, ${item.seed})`)
			this._keys = this._keys.filter(i => i !== item)
			this._sync()
		}
	}

	_load () {
		if (localStorage.secretStore2) {
			this._keys = JSON.parse(localStorage.secretStore2)
		} else {
			this._keys = [{
				name: 'Default',
				seed: generateMnemonic()
			}]
		}
		this._sync()
	}

	_sync () {
		localStorage.secretStore2 = JSON.stringify(this._keys.map(k => ({seed: k.seed, name: k.name})))
		let byAddress = {}
		let byName = {}
		this._keys = this._keys.map(({seed, name, key}) => {
			key = key || keyFromSeed(seed)
			let account = new AccountId(key.publicKey)
			let address = ss58Encode(account)
			let item = {seed, name, key, account, address}
			byAddress[address] = item
			byName[name] = item
			return item
		})
		this._byAddress = byAddress
		this._byName = byName
		this.trigger({keys: this._keys, byAddress: this._byAddress, byName: this._byName})
	}
}

let s_secretStore = null;

function secretStore() {
	if (s_secretStore === null) {
		s_secretStore = new SecretStore;
	}
	return s_secretStore;
}

module.exports = { secretStore, SecretStore };