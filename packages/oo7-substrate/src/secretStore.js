const { Bond } = require('oo7')
const nacl = require('tweetnacl');
const { generateMnemonic, mnemonicToSeed } = require('bip39')
const { ss58Encode } = require('./ss58')
const { AccountId } = require('./types')
const { bytesToHex, hexToBytes } = require('./utils')

let cache = {}

function seedFromPhrase(phrase) {
	if (!cache[phrase]) {
		cache[phrase] = phrase.match(/^0x[0-9a-fA-F]{64}$/)
			? hexToBytes(phrase)
			: new Uint8Array(mnemonicToSeed(phrase).slice(0, 32))
	}
	return cache[phrase]
}

class SecretStore extends Bond {
	constructor (storage) {
		super()
		this._storage = storage || (typeof localStorage === 'undefined' ? {} : localStorage)
		this._keys = []
		this._load()
	}

	submit (phrase, name) {
		this._keys.push({phrase, name})
		this._sync()
		return this.accountFromPhrase(phrase)
	}

	accountFromPhrase (phrase) {
		return new AccountId(nacl.sign.keyPair.fromSeed(seedFromPhrase(phrase)).publicKey)
	}

	accounts () {
		return this._keys.map(k => k.account)
	}

	byAddress (address) {
		return this._keys.filter(k => k.address === address)[0]
	}

	byName (name) {
		return this._keys.filter(k => k.name === name)[0]
	}

	find (identifier) {
		if (this._keys.indexOf(identifier) !== -1) {
			return identifier
		}
		if (identifier instanceof Uint8Array && identifier.length == 32 || identifier instanceof AccountId) {
			identifier = ss58Encode(identifier)
		}
		return this.byAddress(identifier) || this.byName(identifier)
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
			console.info(`Forgetting key ${item.name} (${item.address}, ${item.phrase})`)
			this._keys = this._keys.filter(i => i !== item)
			this._sync()
		}
	}

	_load () {
		if (this._storage.secretStore) {
			this._keys = JSON.parse(this._storage.secretStore).map(({seed, phrase, name}) => ({ phrase, name, seed: hexToBytes(seed) }))
		} else if (this._storage.secretStore2) {
			this._keys = JSON.parse(this._storage.secretStore2).map(({seed, name}) => ({ phrase: seed, name }))
		} else {
			this._keys = [{
				name: 'Default',
				phrase: generateMnemonic()
			}]
		}
		this._sync()
	}

	_sync () {
		this._keys = this._keys.map(({seed, phrase, name, key}) => {
			seed = seed || seedFromPhrase(phrase)
			key = key || nacl.sign.keyPair.fromSeed(seed)
			let account = new AccountId(key.publicKey)
			let address = ss58Encode(account)
			return {seed, phrase, name, key, account, address}
		})
		this._storage.secretStore = JSON.stringify(this._keys.map(k => ({seed: bytesToHex(k.seed), phrase: k.phrase, name: k.name})))
		this.trigger({keys: this._keys})
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
