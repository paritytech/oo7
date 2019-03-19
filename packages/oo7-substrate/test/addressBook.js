require('chai').should()

const { ss58Encode } = require('../src/ss58')
const { addressBook } = require('../src/addressBook')

describe('addressBook', () => {

	const account = new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])
	const name = "any-name"

	beforeEach(function() {
		// add an account
		addressBook().submit(account, name)
	});

	afterEach(function() {
		// clean up
		addressBook().forget(account)
	});


	it('should remove an account by an address', () => {
		const length = addressBook().accounts().length
		addressBook().forget(account)
		addressBook().accounts().should.have.lengthOf(length - 1)
	});

	it('should not remove an account using another address', () => {
		const length = addressBook().accounts().length
		const anotherAccount = new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1])
		addressBook().forget(anotherAccount);
		addressBook().accounts().should.have.lengthOf(length)
	});

	it('should find an account by a name', () => {
		addressBook().byName(name).should.have.property('account').equal(account)
	});

	it('should find an account by an address', () => {
		const address = ss58Encode(account)
		addressBook().byAddress(address).should.have.property('account').equal(account)
	});

});
