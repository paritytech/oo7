const { Bond } = require('oo7')
const { ss58Encode } = require('./ss58')
const { AccountId } = require('./types')

class AddressBook extends Bond {
	constructor () {
		super()
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

	find (identifier) {
		if (this._accounts.indexOf(identifier) !== -1) { 
			return identifier
		}
		if (identifier instanceof Uint8Array && identifier.length == 32 || identifier instanceof AccountId) {
			identifier = ss58Encode(identifier)
		}
		return this._byAddress[identifier] ? this._byAddress[identifier] : this._byName[identifier]
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
		if (localStorage.addressBook) {
			this._accounts = JSON.parse(localStorage.addressBook)
		} else {
			this._accounts = []
		}
		this._sync()
	}

	_sync () {
		let byAddress = {}
		let byName = {}
		this._accounts = this._accounts.map(({address, account, name}) => {
			account = account || ss58Decode(address)
			address = address || ss58Encode(account)
			let item = {name, account, address}
			byAddress[address] = item
			byName[name] = item
			return item
		})
		this._byAddress = byAddress
		this._byName = byName
		localStorage.addressBook = JSON.stringify(this._accounts.map(k => ({address: k.address, name: k.name})))
		this.trigger({accounts: this._accounts, byAddress: this._byAddress, byName: this._byName})
	}
}

let s_addressBook = null;

function addressBook() {
	if (s_addressBook === null) {
		s_addressBook = new AddressBook;
	}
	return s_addressBook;
}

module.exports = { addressBook, AddressBook };