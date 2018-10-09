const { siPrefix } = require('./utils')

let denominationInfo = {
	denominations: { unit: 0 },
	primary: 'unit',
	unit: 'unit',
	ticker: 'UNIT'
}

let denominations = [ 'unit' ]

function init (di) {
	if (!di.denominations[di.primary]) {
		throw new Error(`Denominations must include primary as key`)
	}
	
	let name = di.unit
	let denom = 0
	let ds = []
	for (let i = 0; i <= di.denominations[di.primary] + 6; i += 3) {
		let n = Object.keys(di.denominations).find(k => di.denominations[k] == i)
		if (n) {
			name = n
			denom = i
		}
		ds.push(siPrefix(i - denom) + name)
	}

	denominations.length = 0
	Object.assign(denominations, ds)
	Object.assign(denominationInfo, di)
}

module.exports = { init, denominationInfo, denominations }