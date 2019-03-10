const { Bond } = require('oo7')
const { ss58Encode, ss58Decode } = require('./ss58')
const { AccountId } = require('./types')

class AddressBook extends Bond {
	constructor (storage) {
		super()
		this._storage = storage || typeof localStorage === 'undefined' ? {} : localStorage
		this._accounts = []
		this._load()
	}

	submit (account, name) {
		this._accounts.push({account, name})
		this._sync()
	}

	accounts () {
		return this._accounts.map(i => i.account)
	}

	byAddress (address) {
		return this._accounts.filter(i => i.address === address)[0]
	}

	byName (name) {
		return this._accounts.filter(i => i.name === name)[0]
	}

	find (identifier) {
		if (this._accounts.indexOf(identifier) !== -1) {
			return identifier
		}
		if (identifier instanceof Uint8Array && identifier.length == 32 || identifier instanceof AccountId) {
			identifier = ss58Encode(identifier)
		}
		return this.byAddress(identifier) || this.byName(identifier)
	}

	forget (identifier) {
		let item = this.find(identifier)
		if (item) {
			console.info(`Forgetting account ${item.name} (${item.address})`)
			this._accounts = this._accounts.filter(i => i !== item)
			this._sync()
		}
	}

	_load () {
		if (this._storage.addressBook) {
			this._accounts = JSON.parse(this._storage.addressBook)
		} else {
			this._accounts = []
		}
		this._sync()
	}

	_sync () {
		this._accounts = this._accounts.map(({address, account, name}) => {
			account = account || ss58Decode(address)
			address = address || ss58Encode(account)
			return {name, account, address}
		})
		this._storage.addressBook = JSON.stringify(this._accounts.map(k => ({address: k.address, name: k.name})))
		this.trigger({accounts: this._accounts})
	}
}

let s_addressBook = null;

function addressBook(storage) {
	if (s_addressBook === null) {
		s_addressBook = new AddressBook(storage);
	}
	return s_addressBook;
}

module.exports = { addressBook, AddressBook };
