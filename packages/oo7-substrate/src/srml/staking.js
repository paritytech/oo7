const { Bond, TransformBond } = require('oo7')
const { ss58Encode } = require('../ss58')
const { Balance } = require('../types')
const balancesModule = require('./balances')
const sessionModule = require('./session')

function compareAccountId(a, b) {
	a.length == b.length && a.every((v, i) => b[i] == v)
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
		
	staking.eraLength = new TransformBond(
		(a, b) => a * b,
		[
			staking.sessionsPerEra,
			session.sessionLength
		])
	
	staking.validators = Bond.all([
		staking.invulerables,
		session.validators
			.map(v => v.map(who => ({
				who,
				ownBalance: balances.totalBalance(who),
				otherBalance: staking.currentNominatedBalance(who),
				nominators: staking.currentNominatorsFor(who)
			})), 2)
		]).map(([inv, v]) => v
			.map(i => Object.assign({balance: i.ownBalance.add(i.otherBalance), invulnerable: inv.find(x => compareAccountId(x, i.who)) !== null}, i))
			.sort((a, b) => b.balance - a.balance)
		)

	staking.nextThreeUp = staking.intentions.map(
			l => ([session.validators, l.map(who => ({
				who, ownBalance: balances.totalBalance(who), otherBalance: staking.nominatedBalance(who)
			}) ) ]), 3
		).map(([c, l]) => l
			.map(i => Object.assign({balance: i.ownBalance.add(i.otherBalance)}, i))
			.sort((a, b) => b.balance - a.balance)
			.filter(i => !c.some(x => x+'' == i.who+''))
			.slice(0, 3)
		)

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

	staking.intentionIndexOf = id =>
		new TransformBond((i, id) => {
			let ss58 = ss58Encode(id);
			return i.findIndex(a => ss58Encode(a) === ss58);
		}, [runtime.staking.intentions, id])
	
	staking.bondageOf = id =>
		new TransformBond(
			(b, h) => h >= b ? null : (b - h),
			[runtime.staking.bondage(id), chain.height]
		)
	
	staking.nominationIndex = (val) =>
		new TransformBond((i, id) => {
			let ss58 = ss58Encode(id);
			return i.findIndex(a => ss58Encode(a) === ss58);
		}, [runtime.staking.nominatorsFor(staking.nominating(val)), val])
}

module.exports = { augment }