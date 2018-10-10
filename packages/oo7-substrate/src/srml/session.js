const { Bond, TransformBond } = require('oo7')
const { ss58Encode } = require('../ss58')

function augment (runtime, chain) {
	let timestamp = runtime.timestamp
	let session = runtime.session
	if (session._extras) {
		return
	} else {
		session._extras = true
	}

	session.blocksRemaining = Bond					// 1..60
		.all([chain.height, session.lastLengthChange, session.sessionLength])
		.map(([h, c, l]) => {
			c = (c || 0);
			return l - (h - c + l) % l;
		});
	session.lateness = Bond
		.all([
			timestamp.blockPeriod,
			timestamp.now,
			session.blocksRemaining,
			session.sessionLength,
			session.currentStart,
		]).map(([p, n, r, l, s]) => (n.number + p.number * r - s.number) / (p.number * l));
	session.percentLate = session.lateness.map(l => Math.round(l * 100 - 100));
	
	session.validatorIndexOf = id =>
		new TransformBond((i, id) => {
			let ss58 = ss58Encode(id);
			return i.findIndex(a => ss58Encode(a) === ss58);
		}, [session.validators, id])
}

module.exports = { augment }