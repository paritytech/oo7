const { VecU8 } = require('./types')

function stringToSeed(s) {
	if (s.match(/^0x[0-9a-fA-F]{64}$/)) {
		return new VecU8(hexToBytes(s))
	}
	var data = new VecU8(32);
	data.fill(32);
	for (var i = 0; i < s.length; i++){
		data[i] = s.charCodeAt(i);
	}
	return data;
}
function stringToBytes(s) {
	var data = new VecU8(s.length);
	for (var i = 0; i < s.length; i++){
		data[i] = s.charCodeAt(i);
	}
	return data;
}
function hexToBytes(str) {
	if (!str) {
		return new VecU8();
	}
	var a = [];
	for (var i = str.startsWith('0x') ? 2 : 0, len = str.length; i < len; i += 2) {
		a.push(parseInt(str.substr(i, 2), 16));
	}

	return new VecU8(a);
}
function bytesToHex(uint8arr) {
	if (!uint8arr) {
		return '';
	}
	var hexStr = '';
	for (var i = 0; i < uint8arr.length; i++) {
		var hex = (uint8arr[i] & 0xff).toString(16);
		hex = (hex.length === 1) ? '0' + hex : hex;
		hexStr += hex;
	}

	return hexStr.toLowerCase();
}
function toLEHex(val, bytes) {
	let be = ('00'.repeat(bytes) + val.toString(16)).slice(-bytes * 2);
	var le = '';
	for (var i = 0; i < be.length; i += 2) {
		le = be.substr(i, 2) + le;
	}
	return le;
}
function leHexToNumber(le) {
	var be = '';
	for (var i = le.startsWith('0x') ? 2 : 0; i < le.length; i += 2) {
		be = le.substr(i, 2) + be;
	}
	return Number.parseInt(be, 16);
}

function toLE(val, bytes) {
	let r = new VecU8(bytes);
	for (var o = 0; val > 0; ++o) {
		r[o] = val % 256;
		val /= 256;
	}
	return r;
}

function leToNumber(le) {
	let r = 0;
	let a = 1;
	le.forEach(x => { r += x * a; a *= 256; });
	return r;
}

function injectChunkUtils() {
	String.prototype.chunks = function(size) {
		var r = [];
		var count = this.length / size;
		for (var i = 0; i < count; ++i) {
			r.push(this.substr(i * size, size));
		}
		return r;
	}

	String.prototype.mapChunks = function(sizes, f) {
		var r = [];
		var count = this.length / sizes.reduce((a, b) => a + b, 0);
		var offset = 0;
		for (var i = 0; i < count; ++i) {
			r.push(f(sizes.map(s => {
				let r = this.substr(offset, s);
				offset += s;
				return r;
			})));
		}
		return r;
	}

	Uint8Array.prototype.mapChunks = function(sizes, f) {
		var r = [];
		var count = this.length / sizes.reduce((a, b) => a + b, 0);
		var offset = 0;
		for (var i = 0; i < count; ++i) {
			r.push(f(sizes.map(s => {
				offset += s;
				return this.slice(offset - s, offset);
			})));
		}
		return r;
	}
}

function siPrefix(pot) {
	switch (pot) {
		case -24: return 'y'
		case -21: return 'z'
		case -18: return 'a'
		case -15: return 'f'
		case -12: return 'p'
		case -9: return 'n'
		case -6: return 'µ'
		case -3: return 'm'
		case 0: return ''
		case 3: return 'k'
		case 6: return 'M'
		case 9: return 'G'
		case 12: return 'T'
		case 15: return 'P'
		case 18: return 'E'
		case 21: return 'Z'
		case 24: return 'Y'
	}
}

module.exports = { stringToSeed, stringToBytes, hexToBytes, bytesToHex, toLEHex, leHexToNumber, toLE, leToNumber, injectChunkUtils, siPrefix }