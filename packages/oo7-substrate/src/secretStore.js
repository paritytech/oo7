const { Bond } = require('oo7')
const nacl = require('tweetnacl');
const { generateMnemonic, mnemonicToSeed } = require('bip39')
const { ss58Encode } = require('./ss58')
const { AccountId } = require('./types')
const { bytesToHex } = require('./utils')

let cache = {}

function keyFromSeed(seed) {
	if (!cache[seed]) {
		cache[seed] = nacl.sign.keyPair.fromSecretKey(mnemonicToSeed(seed))
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
		return Object.keys(this._keys).map(i => i.account)
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
		let item = find(from)
		if (item) {
			console.info(`Signing data from ${item.name}`, bytesToHex(data))
			return nacl.sign.detached(data, item.key.secretKey)
		}
		return null
	}

	forget (identifier) {
		let item = this.find(identifier)
		if (item) {
			console.info(`Forgetting key ${item.name} (${item.address})`)
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
		console.log('Sync...')
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
		console.log('...triggering...')
		this.trigger({keys: this._keys, byAddress: this._byAddress, byName: this._byName})
		console.log('...done')
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