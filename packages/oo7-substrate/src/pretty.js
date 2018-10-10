const { ss58Encode } = require('./ss58')
const { bytesToHex } = require('./utils')
const { VecU8, AccountId, Hash, SlashPreference, VoteThreshold, Moment, Balance, BlockNumber, AccountIndex, Tuple, reviver } = require('./types')
const { denominationInfo } = require('./denominationInfo')

const numberWithCommas = n => {
	let x = n.toString();
	if (x.indexOf('.') > -1) {
		let [a, b] = x.split('.');
		return numberWithCommas(a) + '.' + b;
	} else {
		return x.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}
}

//TODO: AccountIndex

function pretty(expr) {
	if (expr === null) {
		return 'null';
	}
	if (expr instanceof VoteThreshold) {
		return 'VoteThreshold.' + expr;
	}
	if (expr instanceof SlashPreference) {
		return 'SlashPreference{unstake_threshold=' + expr + '}';
	}
	if (expr instanceof Balance) {
		let di = denominationInfo

		let denomincationSearch = [di.primary, Object.keys(di.denominations)]
		let unit = null
		let dp = 0
		for (ii in denomincationSearch) {
			let i = denomincationSearch[ii]
			let denom = di.denominations[i]
			let divisor = Math.pow(10, denom)
			let lower = divisor / 30
			let upper = divisor * 30000
			if (expr > lower && expr < upper) {
				unit = i
				expr /= divisor
				for (; expr < 3000 / Math.pow(10, dp); dp++) {}
				break;
			}
		}

		if (unit === null) {
			// default
			if (expr < Math.pow(10, di.denominations[di.primary]) / 30 && expr !== 0) {
				unit = di.unit
			} else {
				unit = di.primary
				expr /= Math.pow(10, di.denominations[unit])
				expr = Math.round(expr)
			}
		}

		return numberWithCommas(Math.round(expr * Math.pow(10, dp)) / Math.pow(10, dp)) + ' ' + unit
	}
	if (expr instanceof BlockNumber) {
		return numberWithCommas(expr);
	}
	if (expr instanceof Hash) {
		return '0x' + bytesToHex(expr);
	}
	if (expr instanceof Moment) {
		return expr.toLocaleString() + " (" + expr.number + " seconds)";
	}
	if (expr instanceof AccountId) {
		return ss58Encode(expr);
	}
	if (expr instanceof Tuple) {
		return '(' + expr.map(pretty).join(', ') + ')';
	}
	if (expr instanceof VecU8 || expr instanceof Uint8Array) {
		if (expr.length <= 256) {
			return '[' + bytesToHex(expr) + ']';
		} else {
			return `[${bytesToHex(expr.slice(0, 256))}...] (${expr.length} bytes)`;
		}
	}
	if (expr instanceof Array) {
		return '[' + expr.map(pretty).join(', ') + ']';
	}
	if (typeof expr === 'object') {
		return '{' + Object.keys(expr).map(k => k + ': ' + pretty(expr[k])).join(', ') + '}';
	}
	return '' + expr;
}

module.exports = { pretty };