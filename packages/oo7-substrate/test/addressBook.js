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


	it('should remove an account by given address', () => {
		addressBook().accounts().should.have.lengthOf(1)
		addressBook().forget(account)
		addressBook().accounts().should.have.lengthOf(0)
	});

	it('should not remove an account by given another address', () => {
		const anotherAccount = new Uint8Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1])
		addressBook().forget(anotherAccount);
		addressBook().accounts().should.have.lengthOf(1)
	});

	it('find an account by name', () => {
		addressBook().byName(name).should.have.property('account').equal(account)
	});

	it('find an account by address', () => {
		const address = ss58Encode(account)
		addressBook().submit(account, "my-name")
		addressBook().byAddress(address).should.have.property('account').equal(account)
	});

});
