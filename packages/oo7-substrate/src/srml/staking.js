const { Bond, TransformBond } = require('oo7')
const { ss58Encode } = require('../ss58')
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

	oldStakers = staking.stakers
	staking.stakers = who => oldStakers(who, false)
	oldValidators = staking.validators
	staking.validators = who => oldValidators(who, false)
	staking.validators.all = oldValidators.all
	staking.validators.head = oldValidators.head
	oldNominators = staking.nominators
	staking.nominators = who => oldNominators(who, false)
	staking.nominators.all = oldNominators.all
	staking.nominators.head = oldNominators.head

	staking.thisSessionReward = new TransformBond(
		(r, l) => Math.round(r / l),
		[
			staking.sessionReward,
			session.lateness
		]
	)

	staking.bonding = either => new TransformBond(
		(ledger, controller) => {
			if (ledger) {			// was controller
				return {
					ledger,
					controller: either,
					key: 'controller'
				}
			} else if (controller) {	// was stash
				return {
					ledger: staking.ledger(controller),
					controller,
					key: 'stash'
				}
			} else {
				return undefined
			}
		},
		[staking.ledger(either), staking.bonded(either)]
	).subscriptable(2)

	staking.info = either => new TransformBond(
		({bonding, vals, noms, slashCount, payee, currentElected, invulnerables}) => bonding && ({
			ledger: bonding.ledger,
			controller: bonding.controller,
			key: bonding.key,
			role: vals ? { validator: vals } : noms ? { nominator: noms } : { idle: 'null' },
			payee
		}),
		[staking.bonding(either).map(bonding => bonding ? ({
			bonding,
			vals: staking.validators(bonding.ledger.stash),
			noms: staking.nominators(bonding.ledger.stash),
			payee: staking.payee(bonding.ledger.stash),
		}) : ({
			bonding: null
		}))]
	).subscriptable(2)

	staking.exposure = new TransformBond((validators, invulns) => {
		let r = {}
		validators.forEach(validator => {
			r[ss58Encode(validator)] = new TransformBond((stakers, controller) => Object.assign({
				validator,
				controller,
				invulnerable: validator.memberOf(invulns),
			}, stakers || {others: [], own: new Balance(0), total: new Balance(0)}), [staking.stakers(validator), staking.bonded(validator)])
		})
		return r
	}, [staking.currentElected, staking.invulnerables]).subscriptable(2)

	staking.exposureOf = nominator => new TransformBond((exposure, nominator, slotStake) => {
		let slot = exposure[ss58Encode(nominator)];
		if (slot) {
			// Validator
			return { validating: slot }
		} else {
			// Maybe a nominator?
			let nominations = {}
			Object.keys(exposure).forEach(k => {
				let slot = exposure[k]
				let n = slot.others.find(x => x.who.compare(nominator))
				if (n) {
					nominations[k] = Object.assign({
						share: n.value
					}, slot)
				}
			})
			if (Object.keys(nominations).length > 0) {
				return { nominating: nominations }
			} else {
				return { idle: true }
			}
		}
	}, [staking.exposure, nominator, staking.slotStake]).subscriptable(2)

	staking.eraLength = new TransformBond(
		(a, b) => a * b,
		[
			staking.sessionsPerEra,
			session.sessionLength
		])
	
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