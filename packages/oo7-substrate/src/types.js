const { toLE } = require('./utils')

class VecU8 extends Uint8Array {
	toJSON() {
		return { _type: 'VecU8', data: Array.from(this) }
	}
}

class AccountId extends Uint8Array {
	toJSON() {
		return { _type: 'AccountId', data: Array.from(this) }
	}
	compare (other) {
		return this.length === other.length && this.every((v, i) => other[i] === v)
	}
	memberOf (set) {
		return set.find(item => this.compare(item)) !== undefined
	}
}

class Hash extends Uint8Array {
	toJSON() {
		return { _type: 'Hash', data: Array.from(this) }
	}
}

class Signature extends Uint8Array {
	toJSON() {
		return { _type: "Signature", data: Array.from(this) }
	}
}

class VoteThreshold extends String {
	toJSON() {
		return { _type: 'VoteThreshold', data: this + ''}
	}
}

class RewardDestination extends String {
	toJSON() {
		return { _type: 'RewardDestination', data: this + ''}
	}
}

class BlockNumber extends Number {
	toJSON() {
		return { _type: 'BlockNumber', data: this+0 }
	}
}

class AccountIndex extends Number {
	toJSON() {
		return { _type: 'AccountIndex', data: this+0 }
	}
}

class Tuple extends Array {
	toJSON() {
		return { _type: 'Tuple', data: Array.from(this) }
	}
}

class SlashPreference extends Number {
	toJSON() { return { _type: 'SlashPreference', data: this+0 } }
}

class Perbill extends Number {
	toJSON() { return { _type: 'Perbill', data: this+0 } }
}

class Permill extends Number {
	toJSON() { return { _type: 'Permill', data: this+0 } }
}

class Moment extends Date {
	constructor(seconds) {
		super(seconds * 1000)
		this.number = seconds
	}
	toJSON() {
		return { _type: 'Moment', data: this.number }
	}
}

class Balance extends Number {
	toJSON() { return { _type: 'Balance', data: this+0 } }
	add(b) { return new Balance(this + b) }
	sub(b) { return new Balance(this - b) }
}

class TransactionEra {
	constructor (period, phase) {
		if (typeof period === 'number' && typeof phase === 'number') {
			this.period = 2 << Math.min(15, Math.max(1, Math.ceil(Math.log2(period)) - 1))
			this.phase = phase % this.period
		}
	}

	encode() {
		if (typeof this.period === 'number' && typeof this.phase === 'number') {
			let l = Math.min(15, Math.max(1, Math.ceil(Math.log2(this.period)) - 1))
			let factor = Math.max(1, this.period >> 12)
			let res = toLE((Math.floor(this.phase / factor) << 4) + l, 2)
			return res
		} else {
			return new Uint8Array([0])
		}
	}
}

function reviver(key, bland) {
	if (typeof bland == 'object' && bland) {
		switch (bland._type) {
			case 'VecU8': return new VecU8(bland.data);
			case 'AccountId': return new AccountId(bland.data);
			case 'Hash': return new Hash(bland.data);
			case 'Signature': return new Signature(bland.data);
			case 'VoteThreshold': return new VoteThreshold(bland.data);
			case 'SlashPreference': return new SlashPreference(bland.data);
			case 'Perbill': return new Perbill(bland.data);
			case 'Permill': return new Permill(bland.data);
			case 'Moment': return new Moment(bland.data);
			case 'Tuple': return new Tuple(bland.data);
			case 'Balance': return new Balance(bland.data);
			case 'BlockNumber': return new BlockNumber(bland.data);
			case 'AccountIndex': return new AccountIndex(bland.data);
			case 'Payee': return new Payee(bland.data);
		}
	}
	return bland;
}

module.exports = { VecU8, AccountId, Hash, Signature, VoteThreshold, SlashPreference, Moment, Balance,
	BlockNumber, AccountIndex, Tuple, TransactionEra, Perbill, Permill, reviver, RewardDestination }
