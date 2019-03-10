require('chai').should()

const { ss58Encode } = require('../src/ss58')
const { generateMnemonic } = require('bip39')
const { secretStore } = require('../src/secretStore')

describe('secretStore', () => {

	var phrase = null
	var account = null
	const name = "any-name"

	beforeEach(function() {
		phrase = generateMnemonic()
		account = secretStore().accountFromPhrase(phrase)
		secretStore().submit(phrase, name)
	});

	afterEach(function() {
		secretStore().forget(account)
		account
		= phrase
		= null
	});


	it('should remove an account', () => {
		const length = secretStore().accounts().length
		const account = secretStore().accountFromPhrase(phrase)
		secretStore().forget(account)
		secretStore().accounts().should.have.lengthOf(length - 1)
	});

	it('can\'t remove an non-existing account', () => {
		const length = secretStore().accounts().length
		const anotherPhrase = generateMnemonic()
		const anotherAccount = secretStore().accountFromPhrase(anotherPhrase)
		secretStore().forget(anotherAccount)
		secretStore().accounts().should.have.lengthOf(length)
	});

	it('should find an account by a name', () => {
		secretStore().byName(name).should.have.property('name').equal(name)
	});

	it('should find an account by an address', () => {
		const address = ss58Encode(account)
		secretStore().byAddress(address).should.have.property('address').equal(address)
	});

});
