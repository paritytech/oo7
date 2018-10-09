const { Balance } = require('../types')
const balancesModule = require('./balances')
const sessionModule = require('./session')

function augment (runtime, chain) {
	sessionModule.augment(runtime, chain)
	balancesModule.augment(runtime, chain)
	let session = runtime.session
	let staking = runtime.staking
	let balances = runtime.balances
	if (staking._extras) {
		return
	} else {
		staking._extras = true
	}

	staking.thisSessionReward = Bond
		.all([staking.sessionReward, session.lateness])
		.map(([r, l]) => Math.round(r / l));

	staking.currentNominatedBalance = who => staking.currentNominatorsFor(who)
		.map(ns => ns.map(n => balances.totalBalance(n)), 2)
		.map(bs => new Balance(bs.reduce((a, b) => a + b, 0)))
	staking.nominatedBalance = who => staking.nominatorsFor(who)
		.map(ns => ns.map(n => balances.totalBalance(n)), 2)
		.map(bs => new Balance(bs.reduce((a, b) => a + b, 0)))
	staking.stakingBalance = who => Bond
		.all([balances.totalBalance(who), staking.nominatedBalance(who)])
		.map(([f, r]) => new Balance(f + r));
	staking.currentStakingBalance = who => Bond
		.all([balances.totalBalance(who), staking.currentNominatedBalance(who)])
		.map(([f, r]) => new Balance(f + r));
		
	staking.eraLength = Bond
		.all([
			staking.sessionsPerEra,
			session.sessionLength
		]).map(([a, b]) => a * b);
	
	staking.validators = session.validators
		.map(v => v.map(who => ({
			who,
			ownBalance: balances.totalBalance(who),
			otherBalance: staking.currentNominatedBalance(who),
			nominators: staking.currentNominatorsFor(who)
		})), 2)
		.map(v => v
			.map(i => Object.assign({balance: i.ownBalance.add(i.otherBalance)}, i))
			.sort((a, b) => b.balance - a.balance)
		);

	staking.nextThreeUp = staking.intentions.map(
		l => ([session.validators, l.map(who => ({
			who, ownBalance: balances.totalBalance(who), otherBalance: staking.nominatedBalance(who)
		}) ) ]), 3
	).map(([c, l]) => l
		.map(i => Object.assign({balance: i.ownBalance.add(i.otherBalance)}, i))
		.sort((a, b) => b.balance - a.balance)
		.filter(i => !c.some(x => x+'' == i.who+''))
		.slice(0, 3)
	);

	staking.nextValidators = Bond
		.all([
			staking.intentions.map(v => v.map(who => ({
				who,
				ownBalance: balances.totalBalance(who),
				otherBalance: staking.nominatedBalance(who),
				nominators: staking.nominatorsFor(who)
			})), 2),
			staking.validatorCount
		]).map(([as, vc]) => as
			.map(i => Object.assign({balance: i.ownBalance.add(i.otherBalance)}, i))
			.sort((a, b) => b.balance - a.balance)
			.slice(0, vc)
		);
	staking.eraSessionsRemaining = Bond
		.all([
			staking.sessionsPerEra,
			session.currentIndex,
			staking.lastEraLengthChange
		]).map(([spe, si, lec]) => (spe - 1 - (si - lec) % spe));
	staking.eraBlocksRemaining = Bond
		.all([
			session.sessionLength,
			staking.eraSessionsRemaining,
			session.blocksRemaining
		]).map(([sl, sr, br]) => br + sl * sr);
}
