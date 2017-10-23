var should = require('chai').should(),
    oo7parity = require('../src/index');

describe('bonds', function () {
	it('should be constructable', () => {
		let t = new oo7parity.Bonds();

		t.should.be.a('object');
	});
});
