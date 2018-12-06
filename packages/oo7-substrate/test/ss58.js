require('chai').should()

const { ss58Encode, ss58Decode } = require('../src/ss58');

describe('ss58', () => {
	it('should encode & decode back', () => {
		const encoded = ss58Encode(1);
		encoded.should.equal('F7L6');
		const decoded = ss58Decode(encoded);
		decoded.should.equal(1);
	});
});
