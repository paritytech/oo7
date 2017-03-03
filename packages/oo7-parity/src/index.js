import {Bond, TimeBond, TransformBond as oo7TransformBond, ReactivePromise} from 'oo7';
import BigNumber from 'bignumber.js';
import {abiPolyfill} from './abis.js';

export function setupBonds(_api) {
	console.log("setupBonds...");
	_api.parity.netChain().then(c => console.log(`setupBonds: on chain ${c}`));

	let api = _api;
	var bonds = {};

	api.util.abiSig = function (name, inputs) {
		return api.util.sha3(`${name}(${inputs.join()})`);
	};

	class TransformBond extends oo7TransformBond {
		constructor (f, a = [], d = [], latched = true, mayBeNull = false) {
			super(f, a, d, latched, mayBeNull, api);
		}
		map (f) {
	        return new TransformBond(f, [this]);
	    }
		sub (name) {
			return new TransformBond((r, n) => r[n], [this, name]);
		}
		static all(list) {
			return new TransformBond((...args) => args, list);
		}
	}

	// TODO: Use more generic means to check on number, ideally push notification.
	class SubscriptionBond extends Bond {
		constructor(rpc) {
			super();
			api.subscribe(rpc, (e, n) => {
	//			console.log(`Subscription ${rpc} firing ${+n}`)
				this.trigger(n);
			}).then(id => this.subscription = id);
		}
		drop () {
			api.unsubscribe(this.subscription);
		}
		map (f) {
	        return new TransformBond(f, [this]);
	    }
		sub (name) {
			return new TransformBond((r, n) => r[n], [this, name]);
		}
		static all(list) {
			return new TransformBond((...args) => args, list);
		}
	}

	class Signature extends ReactivePromise {
		constructor(from, message) {
			super([from, message], [], ([from, message]) => {
				api.parity.postSign(from, api.util.asciiToHex(message))
					.then(signerRequestId => {
		//		    	console.log('trackRequest', `posted to signer with requestId ${signerRequestId}`);
						this.trigger({requested: signerRequestId});
				    	return api.pollMethod('parity_checkRequest', signerRequestId);
				    })
				    .then(signature => {
		//				console.log('trackRequest', `received transaction hash ${transactionHash}`);
						this.trigger({signed: signature});
					})
					.catch(error => {
		//				console.log('trackRequest', `transaction failed ${JSON.stringify(error)}`);
						this.trigger({failed: error});
					});
			});
		}
	}

	function fillDefaults(tx) {
		if (typeof(tx) === 'object' && !!tx && !(tx instanceof Bond || tx instanceof Promise)) {
			// normal object.
			if (!tx.from)
				tx.from = bonds.defaultAccount;
			if (!tx.gasPrice)
				tx.gasPrice = bonds.gasPrice;
			// TODO: fix.
	/*		if (!tx.gas)
				tx.gas = api.eth.estimateGas.bond({
					value: tx.value,
					from: tx.from,
					to: tx.to,
					gasPrice: tx.gasPrice,
					data: tx.data
				});*/
		}
		return tx;
	}

	class Transaction extends ReactivePromise {
		constructor(tx) {
			let ftx = fillDefaults(tx);
			super([ftx], [], ([tx]) => {
				api.parity.postTransaction(tx)
					.then(signerRequestId => {
		//		    	console.log('trackRequest', `posted to signer with requestId ${signerRequestId}`);
						this.trigger({requested: signerRequestId});
				    	return api.pollMethod('parity_checkRequest', signerRequestId);
				    })
				    .then(transactionHash => {
		//				console.log('trackRequest', `received transaction hash ${transactionHash}`);
						this.trigger({signed: transactionHash});
						return api.pollMethod('eth_getTransactionReceipt', transactionHash, (receipt) => receipt && receipt.blockNumber && !receipt.blockNumber.eq(0));
					})
					.then(receipt => {
		//				console.log('trackRequest', `received transaction receipt ${JSON.stringify(receipt)}`);
						this.trigger({confirmed: receipt});
					})
					.catch(error => {
		//				console.log('trackRequest', `transaction failed ${JSON.stringify(error)}`);
						this.trigger({failed: error});
					});
			});
		}
	}

	function overlay(base, top) {
		Object.keys(top).forEach(k => {
			base[k] = top[k];
		});
		return base;
	}

	function call(addr, method, args, options) {
		let data = api.util.abiEncode(method.name, method.inputs.map(f => f.type), args);
		let decode = d => api.util.abiDecode(method.outputs.map(f => f.type), d);
		return api.eth.call(overlay({to: addr, data: data}, options)).then(decode);
	};

	function post(addr, method, args, options) {
		let toOptions = (addr, method, options, ...args) => {
			return overlay({to: addr, data: api.util.abiEncode(method.name, method.inputs.map(f => f.type), args)}, options);
		};
		return new bonds.Transaction(toOptions.bond(addr, method, options, ...args));
	};

	function intArrayToHex(a) {
		return '0x' + a.map(i => ('0' + i.toString(16)).slice(-2)).join('');
	}

	bonds.Transaction = Transaction;
	bonds.Signature = Signature;
	bonds.Subscription = SubscriptionBond;
	bonds.Transform = TransformBond;
    bonds.time = new TimeBond;
	bonds.blockNumber = new TransformBond(_=>+_, [new SubscriptionBond('eth_blockNumber')]);
//	bonds.accounts = new SubscriptionBond('eth_accounts').subscriptable();
//	bonds.accountsInfo = new SubscriptionBond('parity_accountsInfo').subscriptable();
//	bonds.defaultAccount = new SubscriptionBond('parity_defaultAccount').subscriptable();
//	bonds.allAccountsInfo = new SubscriptionBond('parity_allAccountsInfo');
//	bonds.requestsToConfirm = new SubscriptionBond('signer_requestsToConfirm');

	Function.__proto__.bond = function(...args) { return new TransformBond(this, args); };
	Function.__proto__.unlatchedBond = function(...args) { return new TransformBond(this, args, [], false, undefined); };
    Function.__proto__.timeBond = function(...args) { return new TransformBond(this, args, [bonds.time]); };
    Function.__proto__.blockBond = function(...args) { return new TransformBond(this, args, [bonds.blockNumber]); };

	let presub = function (f) {
		return new Proxy(f, {
			get (receiver, name) {
				if (typeof(name) === 'string' || typeof(name) === 'number') {
					return typeof(receiver[name]) !== 'undefined' ? receiver[name] : receiver(name);
				} else if (typeof(name) === 'symbol' && Bond.knowSymbol(name)) {
					return receiver(Bond.fromSymbol(name));
				} else {
					throw `Weird value type to be subscripted by: ${typeof(name)}: ${JSON.stringify(name)}`;
				}
			}
		});
	};

	// eth_
	bonds.blockByNumber = (x => new TransformBond(api.eth.getBlockByNumber, [x], [/* TODO: chain reorg that includes number x */]).subscriptable());
	bonds.blockByHash = (x => new TransformBond(api.eth.getBlockByHash, [x]).subscriptable());
	bonds.blockByX = (x => new TransformBond(n => typeof(n) === 'number' || (typeof(n) === 'string' && n.match(/^[0-9]+$/)) ? api.eth.getBlockByNumber(x) : api.eth.getBlockByHash(x), [x], [/* TODO: chain reorg that includes number x, if x is a number */]).subscriptable());
	bonds.blocks = presub(bonds.blockByX);
	bonds.block = bonds.blockByNumber(bonds.blockNumber);
	bonds.coinbase = new TransformBond(api.eth.coinbase, [], [bonds.time]);
	bonds.accounts = new TransformBond(a => a.map(api.util.toChecksumAddress), [new TransformBond(api.eth.accounts, [], [bonds.time])]).subscriptable();
	bonds.defaultAccount = bonds.accounts[0];	// TODO: make this use its subscription

	bonds.balance = (x => new TransformBond(api.eth.getBalance, [x], [bonds.blockNumber]));
	bonds.code = (x => new TransformBond(api.eth.getCode, [x], [bonds.blockNumber]));
	bonds.transactionCount = (x => new TransformBond(api.eth.getTransactionCount, [x], [bonds.blockNumber]));
	bonds.storageAt = ((x, y) => new TransformBond(api.eth.getStorageAt, [x, y], [bonds.blockNumber]));

	bonds.syncing = new TransformBond(api.eth.syncing, [], [bonds.time]);
	bonds.hashrate = new TransformBond(api.eth.hashrate, [], [bonds.time]);
	bonds.mining = new TransformBond(api.eth.mining, [], [bonds.time]);
	bonds.protocolVersion = new TransformBond(api.eth.protocolVersion, [], [bonds.time]);
	bonds.gasPrice = new TransformBond(api.eth.gasPrice, [], [bonds.time]);

	// Weird compound

	// net_
    bonds.peerCount = new TransformBond(api.net.peerCount, [], [bonds.time]);

	// parity_
	bonds.hashContent = u => new TransformBond(api.parity.hashContent, [u], [], false);
	bonds.netChain = new TransformBond(api.parity.netChain, [], [bonds.time]);
	bonds.accountsInfo = new TransformBond(api.parity.accountsInfo, [], [bonds.time]).subscriptable(2); //new SubscriptionBond('parity_accountsInfo');

	bonds.makeContract = function(address, abi, extras = []) {
		var r = { address: address };
		let unwrapIfOne = a => a.length == 1 ? a[0] : a;
		abi.forEach(i => {
			if (i.type == 'function' && i.constant) {
				let f = function (...args) {
					var options = args.length === i.inputs.length + 1 ? args.unshift() : {};
					if (args.length != i.inputs.length)
						throw `Invalid number of arguments to ${i.name}. Expected ${i.inputs.length}, got ${args.length}.`;
					let f = (addr, ...fargs) => call(addr, i, fargs, options).then(unwrapIfOne);
					return new TransformBond(f, [address, ...args], [bonds.blockNumber]).subscriptable();	// TODO: should be subscription on contract events
				};
				r[i.name] = (i.inputs.length === 1) ? presub(f) : f;
			}
		});
		extras.forEach(i => {
			let f = function (...args) {
				let expectedInputs = (i.numInputs || i.args.length);
				var options = args.length === expectedInputs + 1 ? args.unshift() : {};
				if (args.length != expectedInputs)
					throw `Invalid number of arguments to ${i.name}. Expected ${expectedInputs}, got ${args.length}.`;
				let c = abi.find(j => j.name == i.method);
				let f = (addr, ...fargs) => {
					let args = i.args.map((v, index) => v === null ? fargs[index] : typeof(v) === 'function' ? v(fargs[index]) : v);
					return call(addr, c, args, options).then(unwrapIfOne);
				};
				return new TransformBond(f, [address, ...args], [bonds.blockNumber]).subscriptable();	// TODO: should be subscription on contract events
			};
			r[i.name] = (i.args.length === 1) ? presub(f) : f;
		});
		abi.forEach(i => {
			if (i.type == 'function' && !i.constant) {
				r[i.name] = function (...args) {
					var options = args.length === i.inputs.length + 1 ? args.pop() : {};
					if (args.length !== i.inputs.length)
						throw `Invalid number of arguments to ${i.name}. Expected ${i.inputs.length}, got ${args.length}.`;
					return post(address, i, args, options).subscriptable();
				};
			}
		});
		var eventLookup = {};
		abi.filter(i => i.type == 'event').forEach(i => {
			eventLookup[api.util.abiSig(i.name, i.inputs.map(f => f.type))] = i.name;
		});

		abi.forEach(i => {
			if (i.type == 'event') {
				r[i.name] = function (indexed = {}, params = {}) {
					return new TransformBond((addr, indexed) => {
						var topics = [api.util.abiSig(i.name, i.inputs.map(f => f.type))];
						i.inputs.filter(f => f.indexed).forEach(f => {
							var val = null;
							if (indexed[f.name]) {
								if (f.type == 'string' || f.type == 'bytes') {
									val = api.util.sha3(indexed[f.name]);
								} else {
									val = api.util.abiEncode(null, [f.type], [indexed[f.name]]);
								}
								if (val.length != 66) {
									console.warn(`Couldn't encode indexed parameter ${f.name} of type ${f.type} with value ${indexed[f.name]}`);
									val = null;
								}
							}
							topics.push(val);
						});
						return api.eth.getLogs({
							address: addr,
							fromBlock: params.fromBlock || 0,
							toBlock: params.toBlock || 'pending',
							limit: params.limit || 10,
							topics: topics
						}).then(logs => logs.map(l => {
							l.blockNumber = +l.blockNumber;
							l.transactionIndex = +l.transactionIndex;
							l.logIndex = +l.logIndex;
							l.transactionLogIndex = +l.transactionLogIndex;
							var e = {};
							let unins = i.inputs.filter(f => !f.indexed);
							api.util.abiDecode(unins.map(f => f.type), l.data).forEach((v, j) => {
								let f = unins[j];
								if (v instanceof Array) {
									v = api.util.bytesToHex(v);
								}
								if (f.type.substr(0, 4) == 'uint' && +f.type.substr(4) <= 48) {
									v = +v;
								}
								e[f.name] = v;
							});
							i.inputs.filter(f => f.indexed).forEach((f, j) => {
								if (f.type == 'string' || f.type == 'bytes') {
									l.args[f.name] = l.topics[1 + j];
								} else {
									var v = api.util.abiDecode([f.type], l.topics[1 + j])[0];
									if (v instanceof Array) {
										v = api.util.bytesToHex(v);
									}
									if (f.type.substr(0, 4) == 'uint' && +f.type.substr(4) <= 48) {
										v = +v;
									}
									e[f.name] = v;
								}
							});
							e.event = eventLookup[l.topics[0]];
							e.log = l;
							return e;
						}));
					}, [address, indexed], [bonds.blockNumber]).subscriptable();
				};
			}
		});
		return r;
	};

	bonds.registry = bonds.makeContract(new TransformBond(api.parity.registryAddress, [], [bonds.time]), api.abi.registry, api.abi.registryExtras);	// TODO should be subscription.
	bonds.githubhint = bonds.makeContract(bonds.registry.lookupAddress('githubhint', 'A'), api.abi.githubhint);
	bonds.operations = bonds.makeContract(bonds.registry.lookupAddress('operations', 'A'), api.abi.operations);

	return bonds;
}

////
// Parity Utilities

// TODO: move to parity.js, repackage or repot.

export function capitalizeFirstLetter(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function singleton(f) {
    var instance = null;
    return function() {
        if (instance === null)
            instance = f();
        return instance;
    }
}

export const denominations = [ "wei", "Kwei", "Mwei", "Gwei", "szabo", "finney", "ether", "grand", "Mether", "Gether", "Tether", "Pether", "Eether", "Zether", "Yether", "Nether", "Dether", "Vether", "Uether" ];

export function denominationMultiplier(s) {
    let i = denominations.indexOf(s);
    if (i < 0)
        throw "Invalid denomination";
    return (new BigNumber(1000)).pow(i);
}

export function interpretQuantity(s) {
    try {
        let m = s.toLowerCase().match('([0-9,.]+) *([a-zA-Z]+)?');
        let d = denominationMultiplier(m[2] || 'ether');
        let n = +m[1].replace(',', '');
        while (n !== Math.round(n)) {
            n *= 10;
            d = d.div(10);
        }
        return new BigNumber(n).mul(d);
    }
    catch (e) {
        return null;
    }
}

export function splitValue(a) {
	var i = 0;
	var a = new BigNumber('' + a);
	if (a.gte(new BigNumber("10000000000000000")) && a.lt(new BigNumber("100000000000000000000000")) || a.eq(0))
		i = 6;
	else
		for (var aa = a; aa.gte(1000) && i < denominations.length - 1; aa = aa.div(1000))
			i++;

	for (var j = 0; j < i; ++j)
		a = a.div(1000);

	return {base: a, denom: i};
}

export function formatBalance(n) {
	let a = splitValue(n);
	let b = Math.floor(a.base * 1000) / 1000;
	return `${b} ${denominations[a.denom]}`;
}

export function formatBlockNumber(n) {
    return '#' + ('' + n).replace(/(\d)(?=(\d{3})+$)/g, "$1,");
}

export function isNullData(a) {
	return !a || typeof(a) !== 'string' || a.match(/^(0x)?0+$/) !== null;
}

export { abiPolyfill };
