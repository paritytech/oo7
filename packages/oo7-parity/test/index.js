var should = require('chai').should();
var oo7parity = require('../src/index');

describe('bonds', () => {
	it('should be constructable', () => {
		let t = new oo7parity.Bonds();

		t.should.be.a('object');
	});
});
