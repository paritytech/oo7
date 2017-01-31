import {Bond, TimeBond, TransformBond, ReactivePromise} from 'oo7';
import BigNumber from 'bignumber.js';

var api = null;

// TODO: Use more generic means to check on number, ideally push notification.
export class SubscriptionBond extends Bond {
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
}

export class Signature extends ReactivePromise {
	constructor(from, message) {
		super([from, message], [], ([from, message]) => {
			parity.api.parity.postSign(from, parity.api.util.asciiToHex(message))
				.then(signerRequestId => {
	//		    	console.log('trackRequest', `posted to signer with requestId ${signerRequestId}`);
					this.trigger({requested: signerRequestId});
			    	return parity.api.pollMethod('parity_checkRequest', signerRequestId);
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

export class Transaction extends ReactivePromise {
	constructor(tx) {
		super([tx], [], ([tx]) => {
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
	let data = parity.api.util.abiEncode(method.name, method.inputs.map(f => f.type), args);
	let decode = d => parity.api.util.abiDecode(method.outputs.map(f => f.type), d);
	return parity.api.eth.call(overlay({to: addr, data: data}, options)).then(decode);
};

function post(addr, method, args, options) {
	let toOptions = (addr, method, options, ...args) => {
		console.log(`options: ${JSON.stringify(options)}`);
		return overlay({to: addr, data: parity.api.util.abiEncode(method.name, method.inputs.map(f => f.type), args)}, options);
	};
	return new Transaction(toOptions.bond(addr, method, options, ...args));
};

export function setupBonds(_api) {
	api = _api;

	window.TimeBond = TimeBond;

	var bonds = {};

    bonds.time = new TimeBond;
	bonds.blockNumber = new SubscriptionBond('eth_blockNumber');

	Function.__proto__.bond = function(...args) { return new TransformBond(this, args); };
	Function.__proto__.unlatchedBond = function(...args) { return new TransformBond(this, args, [], false, undefined); };
    Function.__proto__.timeBond = function(...args) { return new TransformBond(this, args, [parity.bonds.time]); };
    Function.__proto__.blockBond = function(...args) { return new TransformBond(this, args, [parity.bonds.blockNumber]); };

	let presub = function (f) {
		return new Proxy(f, {
			get (receiver, name) {
				if ((name instanceof String || name instanceof Number) && typeof(receiver[name]) !== 'undefined') {
					return receiver[name];
				} else {
					return receiver(name);
				}
			}
		});
	};

	// eth_
	bonds.blockByNumber = (x => new TransformBond(api.eth.getBlockByNumber, [x], [/* TODO: chain reorg that includes number x */]).subscriptable());
	bonds.blocks = presub(bonds.blockByNumber);
	bonds.block = bonds.blocks(bonds.blockNumber);
	bonds.coinbase = new TransformBond(api.eth.coinbase, [], [bonds.time]);
	bonds.balance = (x => new TransformBond(api.eth.getBalance, [x]));
	bonds.accounts = new TransformBond(api.eth.accounts, [], [bonds.time]).subscriptable();

	// Weird compound

	// net_
    bonds.peerCount = new TransformBond(api.net.peerCount, [], [bonds.time]);

	// parity_
	bonds.hashContent = u => new TransformBond(api.parity.hashContent, [u], [], false);
	bonds.netChain = new TransformBond(api.parity.netChain, [], [bonds.time]);
	bonds.accountsInfo = new TransformBond(api.parity.accountsInfo, [], [bonds.time]).subscriptable(); //new SubscriptionBond('parity_accountsInfo');

	bonds.makeContract = function(address, abi, extras = []) {
		var r = { address: address };
		let unwrapIfOne = a => a.length == 1 ? a[0] : a;
		abi.forEach(i => {
			if (i.type == 'function' && i.constant) {
				r[i.name] = function (...args) {
					var options = args.length === i.inputs.length + 1 ? args.unshift() : {};
					if (args.length != i.inputs.length)
						throw `Invalid number of arguments to ${i.name}. Expected ${i.inputs.length}, got ${args.length}.`;
					let f = (addr, ...fargs) => call(addr, i, fargs, options).then(unwrapIfOne);
					return new TransformBond(f, [address, ...args], [bonds.blockNumber]).subscriptable();	// TODO: should be subscription on contract events
				};
			}
		});
		extras.forEach(i => {
			r[i.name] = function (...args) {
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
		});
		abi.forEach(i => {
			if (i.type == 'function' && !i.constant) {
				r[i.name] = function (...args) {
					console.log(`args: ${JSON.stringify(args)}; i.inputs.length: ${i.inputs.length}`);
					var options = args.length === i.inputs.length + 1 ? args.pop() : {};
					if (args.length !== i.inputs.length)
						throw `Invalid number of arguments to ${i.name}. Expected ${i.inputs.length}, got ${args.length}.`;
					return post(address, i, args, options).subscriptable();
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

export function abiPolyfill() {
	const RegistryABI = [{"constant":false,"inputs":[{"name":"_new","type":"address"}],"name":"setOwner","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_name","type":"string"}],"name":"confirmReverse","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_name","type":"bytes32"}],"name":"reserve","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_name","type":"bytes32"},{"name":"_key","type":"string"},{"name":"_value","type":"bytes32"}],"name":"set","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_name","type":"bytes32"}],"name":"drop","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_name","type":"bytes32"},{"name":"_key","type":"string"}],"name":"getAddress","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_amount","type":"uint256"}],"name":"setFee","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_name","type":"bytes32"},{"name":"_to","type":"address"}],"name":"transfer","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_name","type":"bytes32"}],"name":"reserved","outputs":[{"name":"reserved","type":"bool"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"drain","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_name","type":"string"},{"name":"_who","type":"address"}],"name":"proposeReverse","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_name","type":"bytes32"},{"name":"_key","type":"string"}],"name":"getUint","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_name","type":"bytes32"},{"name":"_key","type":"string"}],"name":"get","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"fee","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_name","type":"bytes32"}],"name":"getOwner","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"reverse","outputs":[{"name":"","type":"string"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_name","type":"bytes32"},{"name":"_key","type":"string"},{"name":"_value","type":"uint256"}],"name":"setUint","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"removeReverse","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_name","type":"bytes32"},{"name":"_key","type":"string"},{"name":"_value","type":"address"}],"name":"setAddress","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"anonymous":false,"inputs":[{"indexed":false,"name":"amount","type":"uint256"}],"name":"Drained","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"amount","type":"uint256"}],"name":"FeeChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"name","type":"bytes32"},{"indexed":true,"name":"owner","type":"address"}],"name":"Reserved","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"name","type":"bytes32"},{"indexed":true,"name":"oldOwner","type":"address"},{"indexed":true,"name":"newOwner","type":"address"}],"name":"Transferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"name","type":"bytes32"},{"indexed":true,"name":"owner","type":"address"}],"name":"Dropped","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"name","type":"bytes32"},{"indexed":true,"name":"owner","type":"address"},{"indexed":true,"name":"key","type":"string"},{"indexed":false,"name":"plainKey","type":"string"}],"name":"DataChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"name","type":"string"},{"indexed":true,"name":"reverse","type":"address"}],"name":"ReverseProposed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"name","type":"string"},{"indexed":true,"name":"reverse","type":"address"}],"name":"ReverseConfirmed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"name","type":"string"},{"indexed":true,"name":"reverse","type":"address"}],"name":"ReverseRemoved","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"old","type":"address"},{"indexed":true,"name":"current","type":"address"}],"name":"NewOwner","type":"event"}];
	const RegistryExtras = [
		{ name: 'lookup', method: 'get', args: [parity.api.util.sha3, null] },
		{ name: 'lookupAddress', method: 'getAddress', args: [parity.api.util.sha3, null] },
		{ name: 'lookupUint', method: 'getUint', args: [parity.api.util.sha3, null] }
	];
	const GitHubHintABI = [{"constant":false,"inputs":[{"name":"_content","type":"bytes32"},{"name":"_url","type":"string"}],"name":"hintURL","outputs":[],"type":"function"},{"constant":false,"inputs":[{"name":"_content","type":"bytes32"},{"name":"_accountSlashRepo","type":"string"},{"name":"_commit","type":"bytes20"}],"name":"hint","outputs":[],"type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes32"}],"name":"entries","outputs":[{"name":"accountSlashRepo","type":"string"},{"name":"commit","type":"bytes20"},{"name":"owner","type":"address"}],"type":"function"},{"constant":false,"inputs":[{"name":"_content","type":"bytes32"}],"name":"unhint","outputs":[],"type":"function"}];
	const OperationsABI = [{"constant":false,"inputs":[{"name":"_client","type":"bytes32"},{"name":"_newOwner","type":"address"}],"name":"resetClientOwner","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_client","type":"bytes32"},{"name":"_release","type":"bytes32"}],"name":"isLatest","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_txid","type":"bytes32"}],"name":"rejectTransaction","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_newOwner","type":"address"}],"name":"setOwner","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_number","type":"uint32"},{"name":"_name","type":"bytes32"},{"name":"_hard","type":"bool"},{"name":"_spec","type":"bytes32"}],"name":"proposeFork","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_client","type":"bytes32"}],"name":"removeClient","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_client","type":"bytes32"},{"name":"_release","type":"bytes32"}],"name":"release","outputs":[{"name":"o_forkBlock","type":"uint32"},{"name":"o_track","type":"uint8"},{"name":"o_semver","type":"uint24"},{"name":"o_critical","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_client","type":"bytes32"},{"name":"_checksum","type":"bytes32"}],"name":"build","outputs":[{"name":"o_release","type":"bytes32"},{"name":"o_platform","type":"bytes32"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"rejectFork","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes32"}],"name":"client","outputs":[{"name":"owner","type":"address"},{"name":"required","type":"bool"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_newOwner","type":"address"}],"name":"setClientOwner","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint32"}],"name":"fork","outputs":[{"name":"name","type":"bytes32"},{"name":"spec","type":"bytes32"},{"name":"hard","type":"bool"},{"name":"ratified","type":"bool"},{"name":"requiredCount","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_release","type":"bytes32"},{"name":"_platform","type":"bytes32"},{"name":"_checksum","type":"bytes32"}],"name":"addChecksum","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_txid","type":"bytes32"}],"name":"confirmTransaction","outputs":[{"name":"txSuccess","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes32"}],"name":"proxy","outputs":[{"name":"requiredCount","type":"uint256"},{"name":"to","type":"address"},{"name":"data","type":"bytes"},{"name":"value","type":"uint256"},{"name":"gas","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_client","type":"bytes32"},{"name":"_owner","type":"address"}],"name":"addClient","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"clientOwner","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_txid","type":"bytes32"},{"name":"_to","type":"address"},{"name":"_data","type":"bytes"},{"name":"_value","type":"uint256"},{"name":"_gas","type":"uint256"}],"name":"proposeTransaction","outputs":[{"name":"txSuccess","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"grandOwner","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_release","type":"bytes32"},{"name":"_forkBlock","type":"uint32"},{"name":"_track","type":"uint8"},{"name":"_semver","type":"uint24"},{"name":"_critical","type":"bool"}],"name":"addRelease","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"acceptFork","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"clientsRequired","outputs":[{"name":"","type":"uint32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_client","type":"bytes32"},{"name":"_release","type":"bytes32"}],"name":"track","outputs":[{"name":"","type":"uint8"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_client","type":"bytes32"},{"name":"_r","type":"bool"}],"name":"setClientRequired","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"latestFork","outputs":[{"name":"","type":"uint32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_client","type":"bytes32"},{"name":"_track","type":"uint8"}],"name":"latestInTrack","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"_client","type":"bytes32"},{"name":"_release","type":"bytes32"},{"name":"_platform","type":"bytes32"}],"name":"checksum","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"proposedFork","outputs":[{"name":"","type":"uint32"}],"payable":false,"type":"function"},{"inputs":[],"payable":false,"type":"constructor"},{"payable":true,"type":"fallback"},{"anonymous":false,"inputs":[{"indexed":true,"name":"from","type":"address"},{"indexed":false,"name":"value","type":"uint256"},{"indexed":false,"name":"data","type":"bytes"}],"name":"Received","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"},{"indexed":true,"name":"txid","type":"bytes32"},{"indexed":true,"name":"to","type":"address"},{"indexed":false,"name":"data","type":"bytes"},{"indexed":false,"name":"value","type":"uint256"},{"indexed":false,"name":"gas","type":"uint256"}],"name":"TransactionProposed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"},{"indexed":true,"name":"txid","type":"bytes32"}],"name":"TransactionConfirmed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"},{"indexed":true,"name":"txid","type":"bytes32"}],"name":"TransactionRejected","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"txid","type":"bytes32"},{"indexed":false,"name":"success","type":"bool"}],"name":"TransactionRelayed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"},{"indexed":true,"name":"number","type":"uint32"},{"indexed":true,"name":"name","type":"bytes32"},{"indexed":false,"name":"spec","type":"bytes32"},{"indexed":false,"name":"hard","type":"bool"}],"name":"ForkProposed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"},{"indexed":true,"name":"number","type":"uint32"}],"name":"ForkAcceptedBy","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"},{"indexed":true,"name":"number","type":"uint32"}],"name":"ForkRejectedBy","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"forkNumber","type":"uint32"}],"name":"ForkRejected","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"forkNumber","type":"uint32"}],"name":"ForkRatified","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"},{"indexed":true,"name":"forkBlock","type":"uint32"},{"indexed":false,"name":"release","type":"bytes32"},{"indexed":false,"name":"track","type":"uint8"},{"indexed":false,"name":"semver","type":"uint24"},{"indexed":true,"name":"critical","type":"bool"}],"name":"ReleaseAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"},{"indexed":true,"name":"release","type":"bytes32"},{"indexed":true,"name":"platform","type":"bytes32"},{"indexed":false,"name":"checksum","type":"bytes32"}],"name":"ChecksumAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"},{"indexed":false,"name":"owner","type":"address"}],"name":"ClientAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"}],"name":"ClientRemoved","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"},{"indexed":true,"name":"old","type":"address"},{"indexed":true,"name":"now","type":"address"}],"name":"ClientOwnerChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"client","type":"bytes32"},{"indexed":false,"name":"now","type":"bool"}],"name":"ClientRequiredChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"old","type":"address"},{"indexed":false,"name":"now","type":"address"}],"name":"OwnerChanged","type":"event"}];

	return {
		registry: RegistryABI,
		registryExtras: RegistryExtras,
		githubhint: GitHubHintABI,
		operations: OperationsABI
	};
}

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

export function formatBlockNumber(n) {
    return '#' + ('' + n).replace(/(\d)(?=(\d{3})+$)/g, "$1,");
}
