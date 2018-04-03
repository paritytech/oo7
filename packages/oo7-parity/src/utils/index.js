// (C) Copyright 2016-2017 Parity Technologies (UK) Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//         http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* global parity */
const BigNumber = require('bignumber.js');
const oo7 = require('oo7');
const ParityApi = require('@parity/api');

const asciiToHex = ParityApi.util.asciiToHex;
const bytesToHex = ParityApi.util.bytesToHex;
const hexToAscii = ParityApi.util.hexToAscii;
const isAddressValid = h => oo7.Bond.instanceOf(h) ? h.map(ParityApi.util.isAddressValid) : ParityApi.util.isAddressValid(h);
const toChecksumAddress = h => oo7.Bond.instanceOf(h) ? h.map(ParityApi.util.toChecksumAddress) : ParityApi.util.toChecksumAddress(h);
const sha3 = h => oo7.Bond.instanceOf(h) ? h.map(ParityApi.util.sha3) : ParityApi.util.sha3(h);

const denominations = [ 'wei', 'Kwei', 'Mwei', 'Gwei', 'szabo', 'finney', 'ether', 'grand', 'Mether', 'Gether', 'Tether', 'Pether', 'Eether', 'Zether', 'Yether', 'Nether', 'Dether', 'Vether', 'Uether' ];

// Parity Utilities
// TODO: move to parity.js, repackage or repot.

/**
 * Capitalizes the first letter of a string
 *
 * @param {string} s
 * @returns {string}
 */
function capitalizeFirstLetter (s) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Wrap `f` in a function that ensures it's called at most once.
 * The value returned from `f` is memoized and returned for all subsequent calls.
 *
 * @param {F} f
 * @returns {function(): F}
 */
function singleton (f) {
	var instance = null;
	return function () {
		if (instance === null) { instance = f(); }
		return instance;
	};
}

/**
 * Returns a {@link BigNumber} multiplier for give string denominator
 *
 * @param {string} denominator denominator (wei, eth, finney, Gwei, etc)
 * @returns {BigNumber} multiplier
 */
function denominationMultiplier (s) {
	let i = denominations.indexOf(s);
	if (i < 0) { throw new Error('Invalid denomination'); }
	return (new BigNumber(1000)).pow(i);
}

function interpretRender (s, defaultDenom = 6) {
	try {
		let m = s.toLowerCase().match(/([0-9,]+)(\.([0-9]*))? *([a-zA-Z]+)?/);
		let di = m[4] ? denominations.indexOf(m[4]) : defaultDenom;
		if (di === -1) {
			return null;
		}
		let n = (m[1].replace(',', '').replace(/^0*/, '')) || '0';
		let d = (m[3] || '').replace(/0*$/, '');
		return { denom: di, units: n, decimals: d, origNum: m[1] + (m[2] || ''), origDenom: m[4] || '' };
	} catch (e) {
		return null;
	}
}

function combineValue (v) {
	let d = (new BigNumber(1000)).pow(v.denom);
	let n = v.units;
	if (v.decimals) {
		n += v.decimals;
		d = d.div((new BigNumber(10)).pow(v.decimals.length));
	}
	return new BigNumber(n).mul(d);
}

/**
 * Add missing denominator to the value
 *
 * @param {BigNumber} v value
 * @param {string} d denominator
 * @returns {Value}
 */
function defDenom (v, d) {
	if (v.denom === null) {
		v.denom = d;
	}
	return v;
}

/**
 * Formats a value with denominator
 *
 * @param {Value} n value with denominator
 * @returns {string}
 */
function formatValue (n) {
	return `${formatValueNoDenom(n)} ${denominations[n.denom]}`;
}

/**
 * Format value without denominator
 * @param {Value} v
 * @returns {string}
 */
function formatValueNoDenom (n) {
	return `${n.units.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1,')}${n.decimals ? '.' + n.decimals : ''}`;
}

/**
 * Format value without denominator
 *
 * @param {number|BigNumber} v
 * @param {number| exponent
 * @returns {string}
 */
function formatToExponential (v, n = 4) {
	return new BigNumber(v).toExponential(n);
}

function interpretQuantity (s) {
	try {
		let m = s.toLowerCase().match(/([0-9,]+)(\.([0-9]*))? *([a-zA-Z]+)?/);
		let d = denominationMultiplier(m[4] || 'ether');
		let n = +m[1].replace(',', '');
		if (m[2]) {
			n += m[3];
			for (let i = 0; i < m[3].length; ++i) {
				d = d.div(10);
			}
		}
		return new BigNumber(n).mul(d);
	} catch (e) {
		return null;
	}
}

/**
 * Split value into base and denominator
 *
 * @param {number|BigNumber} a
 * @returns {Value}
 */
function splitValue (a) {
	var i = 0;
	a = new BigNumber('' + a);
	if (a.gte(new BigNumber('10000000000000000')) && a.lt(new BigNumber('100000000000000000000000'))) {
		i = 6;
	} else {
		for (var aa = a; aa.gte(1000) && i < denominations.length - 1; aa = aa.div(1000)) { i++; }
	}

	for (var j = 0; j < i; ++j) { a = a.div(1000); }

	return {base: a, denom: i};
}

/**
 * Display balance into human-readable format with denomnator
 *
 * @param {string|BigNumber} balance
 * @returns {string}
 */
function formatBalance (n) {
	let a = splitValue(n);
	//	let b = Math.floor(a.base * 1000) / 1000;
	return `${a.base} ${denominations[a.denom]}`;
}

/**
 * Format block number into human-readable representation.
 * @param {string|number|BigNumber} blockNumber
 * @returns {string}
 */
function formatBlockNumber (n) {
	return '#' + ('' + n).replace(/(\d)(?=(\d{3})+$)/g, '$1,');
}

function isNullData (a) {
	return !a || typeof (a) !== 'string' || a.match(/^(0x)?0+$/) !== null;
}

function splitSignature (sig) {
	if ((sig.substr(2, 2) === '1b' || sig.substr(2, 2) === '1c') && (sig.substr(66, 2) !== '1b' && sig.substr(66, 2) !== '1c')) {
		// vrs
		return [sig.substr(0, 4), `0x${sig.substr(4, 64)}`, `0x${sig.substr(68, 64)}`];
	} else {
		// rsv
		return [`0x${sig.substr(130, 2)}`, `0x${sig.substr(2, 64)}`, `0x${sig.substr(66, 64)}`];
	}
}

function removeSigningPrefix (message) {
	if (!message.startsWith('\x19Ethereum Signed Message:\n')) {
		throw new Error('Invalid message - doesn\'t contain security prefix');
	}
	for (var i = 1; i < 6; ++i) {
		if (message.length === 26 + i + +message.substr(26, i)) {
			return message.substr(26 + i);
		}
	}
	throw new Error('Invalid message - invalid security prefix');
}

function cleanup (value, type = 'bytes32', api = parity.api) {
	// TODO: make work with arbitrary depth arrays
	if (value instanceof Array && type.match(/bytes[0-9]+/)) {
		// figure out if it's an ASCII string hiding in there:
		var ascii = '';
		for (var i = 0, ended = false; i < value.length && ascii !== null; ++i) {
			if (value[i] === 0) {
				ended = true;
			} else {
				ascii += String.fromCharCode(value[i]);
			}
			if ((ended && value[i] !== 0) || (!ended && (value[i] < 32 || value[i] >= 128))) {
				ascii = null;
			}
		}
		value = ascii === null ? '0x' + value.map(n => ('0' + n.toString(16)).slice(-2)).join('') : ascii;
	}
	if (type.substr(0, 4) === 'uint' && +type.substr(4) <= 48) {
		value = +value;
	}
	return value;
}

module.exports = {
	asciiToHex,
	bytesToHex,
	hexToAscii,
	isAddressValid,
	toChecksumAddress,
	sha3,
	capitalizeFirstLetter,
	singleton,
	denominations,
	denominationMultiplier,
	interpretRender,
	combineValue,
	defDenom,
	formatValue,
	formatValueNoDenom,
	formatToExponential,
	interpretQuantity,
	splitValue,
	formatBalance,
	formatBlockNumber,
	isNullData,
	splitSignature,
	removeSigningPrefix,
	cleanup
};
