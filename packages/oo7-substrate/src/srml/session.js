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
}

module.exports = { augment }