const nacl = require('tweetnacl');
const { ss58Encode } = require('./ss58')
const { AccountId } = require('./types')
const { bytesToHex, hexToBytes, stringToSeed } = require('./utils')

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
		this.names[name] = ss58Encode(addr)
		this._save()
		return addr
	}
	accounts () {
		return Object.keys(this.keys).map(ss58Decode)
	}
	find (n) {
		let k = this.keys[this.names[n]]
		return k && Object.assign({ address: this.names[n] }, k)
	}
	sign (from, data) {
		if (from instanceof Uint8Array && from.length == 32 || from instanceof AccountId) {
			from = ss58Encode(from)
		}
		console.info(`Signing data from ${from}`, bytesToHex(data))
		let key = this.keys[from].key
		return key ? nacl.sign.detached(data, key.secretKey) : null
	}
	_addKey (s) {
		let key = nacl.sign.keyPair.fromSeed(s)
		let addr = new AccountId(key.publicKey)
		this.seeds.push(bytesToHex(s))
		this.keys[ss58Encode(addr)] = { key }
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

let s_secretStore = null;

function secretStore() {
	if (s_secretStore === null) {
		s_secretStore = new SecretStore;
	}
	return s_secretStore;
}

module.exports = { secretStore, SecretStore };