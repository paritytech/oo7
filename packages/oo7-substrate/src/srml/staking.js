const { Bond, TransformBond } = require('oo7')
const { ss58Encode } = require('../ss58')
const { Balance } = require('../types')
const balancesModule = require('./balances')
const sessionModule = require('./session')

function compareAccountId(a, b) {
	return a.length === b.length && a.every((v, i) => b[i] === v)
}

function accountIdMemberOf(member, set) {
	return set.find(item => compareAccountId(member, item)) !== undefined
}

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

	staking.thisSessionReward = new TransformBond(
		(r, l) => Math.round(r / l),
		[
			staking.sessionReward,
			session.lateness
		]
	)
/*
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
		*/
	staking.eraLength = new TransformBond(
		(a, b) => a * b,
		[
			staking.sessionsPerEra,
			session.sessionLength
		])
	
	staking.elected = Bond.all([staking.invulnerables, session.validators])
		.map(([inv, v]) => v.map(who => ({
			who,
			ownBalance: balances.totalBalance(who),
//			otherBalance: staking.currentNominatedBalance(who),
//			nominators: staking.currentNominatorsFor(who),
			invulnerable: accountIdMemberOf(who, inv)
		})), 2)
		.map(v => v
			.map(i => Object.assign({balance: i.ownBalance.add(i.otherBalance)}, i))
			.sort((a, b) => b.balance - a.balance)
		)

	staking.eraSessionsRemaining = new TransformBond(
		(spe, si, lec) => (spe - 1 - (si - lec) % spe),
		[
			staking.sessionsPerEra,
			session.currentIndex,
			staking.lastEraLengthChange
		])

	staking.eraBlocksRemaining = new TransformBond(
		(sl, sr, br) => br + sl * sr, 
		[
			session.sessionLength,
			staking.eraSessionsRemaining,
			session.blocksRemaining
		])
}

module.exports = { augment }