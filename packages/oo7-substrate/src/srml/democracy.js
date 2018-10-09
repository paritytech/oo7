
function augment (runtime, chain) {
	let democracy = runtime.democracy
	if (democracy._extras) {
		return
	} else {
		democracy._extras = true
	}
/*	//TODO
	let referendumInfoOf = storageMap('dem:pro:', (r, index) => {
		if (r == null) return null;
		let [ends, proposal, voteThreshold] = decode(r, ['BlockNumber', 'Proposal', 'VoteThreshold']);
		return { index, ends, proposal, voteThreshold };
	}, i => toLE(i, 4), x => x.map(x =>
		Object.assign({votes: democracy.votersFor(x.index)
			.map(r => r || [])
			.mapEach(v => Bond.all([
				democracy.voteOf([x.index, v]),
				balances.balance(v)
			]))
			.map(tallyAmounts)
		}, x), 1));

	this.democracy = {
		proposed: storageValue('dem:pub', r => r ? decode(r, 'Vec<(PropIndex, Proposal, AccountId)>') : []).map(is => is.map(i => {
			let d = depositOf(i[0]);
			return { index: i[0], proposal: i[1], proposer: i[2], sponsors: d.map(v => v ? v.sponsors : null), bond: d.map(v => v ? v.bond : null) };
		}), 2),
		active: Bond.all([nextTally, referendumCount]).map(([f, t]) => [...Array(t - f)].map((_, i) => referendumInfoOf(f + i)), 1),
	};*/
}

module.exports = { augment }