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
/* eslint-disable no-return-assign */
/* eslint-disable no-proto */

const BigNumber = require('bignumber.js');
const oo7 = require('oo7');

const ParityApi = require('@parity/api');

const { abiPolyfill, RegistryABI, RegistryExtras, GitHubHintABI, OperationsABI, BadgeRegABI, TokenRegABI, BadgeABI, TokenABI } = require('./abis');

function defaultProvider () {
  	if (typeof window !== 'undefined' && window.ethereum) {
  		return window.ethereum;
  	}

  	if (typeof window !== 'undefined' && window.parent && window.parent.ethereum) {
  		return window.parent.ethereum;
  	}

	return new ParityApi.Provider.Http('http://localhost:8545');
}

function Bonds (provider = defaultProvider()) {
	return createBonds({ api: new ParityApi(provider) });
}

function createBonds(options) {
	var bonds = {};

	// We only ever use api() at call-time of this function; this allows the
	// options (particularly the transport option) to be changed dynamically
	// and the datastructure to be reused.
	const api = () => options.api;
	const util = ParityApi.util;

	class TransformBond extends oo7.TransformBond {
		constructor (f, a = [], d = [], outResolveDepth = 0, resolveDepth = 1, latched = true, mayBeNull = true) {
			super(f, a, d, outResolveDepth, resolveDepth, latched, mayBeNull, api());
		}
		map (f, outResolveDepth = 0, resolveDepth = 1) {
	        return new TransformBond(f, [this], [], outResolveDepth, resolveDepth);
	    }
		sub (name, outResolveDepth = 0, resolveDepth = 1) {
			return new TransformBond((r, n) => r[n], [this, name], [], outResolveDepth, resolveDepth);
		}
		static all(list) {
			return new TransformBond((...args) => args, list);
		}
	}

	class SubscriptionBond extends oo7.Bond {
		constructor(module, rpcName, options = []) {
			super();
			this.module = module;
			this.rpcName = rpcName;
			this.options = [(_,n) => this.trigger(n), ...options];
		}
		initialise () {
			// promise instead of id because if a dependency triggers finalise() before id's promise is resolved the unsubscribing would call with undefined
			this.subscription = api().pubsub[this.module][this.rpcName](...this.options);
		}
		finalise () {
			this.subscription.then(id => api().pubsub.unsubscribe([id]));
		}
		map (f, outResolveDepth = 0, resolveDepth = 1) {
			return new TransformBond(f, [this], [], outResolveDepth, resolveDepth);
		}
		sub (name, outResolveDepth = 0, resolveDepth = 1) {
			return new TransformBond((r, n) => r[n], [this, name], [], outResolveDepth, resolveDepth);
		}
		static all(list) {
			return new TransformBond((...args) => args, list);
		}
	}

	class Signature extends oo7.ReactivePromise {
		constructor(message, from) {
			super([message, from], [], ([message, from]) => {
				api().parity.postSign(from, asciiToHex(message))
					.then(signerRequestId => {
						this.trigger({requested: signerRequestId});
				    	return api().pollMethod('parity_checkRequest', signerRequestId);
				    })
				    .then(signature => {
						this.trigger({
							signed: splitSignature(signature)
						});
					})
					.catch(error => {
						console.error(error);
						this.trigger({failed: error});
					});
			}, false);
			this.then(_ => null);
		}
		isDone(s) {
			return !!s.failed || !!s.signed;
		}
	}

	function transactionPromise(tx, progress, f) {
		progress({initialising: null});
		let condition = tx.condition || null;
		Promise.all([api().eth.accounts(), api().eth.gasPrice()])
			.then(([a, p]) => {
				progress({estimating: null});
				tx.from = tx.from || a[0];
				tx.gasPrice = tx.gasPrice || p;
				return tx.gas || api().eth.estimateGas(tx);
			})
			.then(g => {
				progress({estimated: g});
				tx.gas = tx.gas || g;
				return api().parity.postTransaction(tx);
			})
			.then(signerRequestId => {
				progress({requested: signerRequestId});
				return api().pollMethod('parity_checkRequest', signerRequestId);
			})
			.then(transactionHash => {
				if (condition) {
					progress(f({signed: transactionHash, scheduled: condition}));
					return {signed: transactionHash, scheduled: condition};
				} else {
					progress({signed: transactionHash});
					return api()
						.pollMethod('eth_getTransactionReceipt', transactionHash, (receipt) => receipt && receipt.blockNumber && !receipt.blockNumber.eq(0))
						.then(receipt => {
							progress(f({confirmed: receipt}));
							return receipt;
						});
				}
			})
			.catch(error => {
				progress({failed: error});
			});
	}

	class Transaction extends oo7.ReactivePromise {
		constructor(tx) {
			super([tx], [], ([tx]) => {
				let progress = this.trigger.bind(this);
				transactionPromise(tx, progress, _ => _);
			}, false);
			this.then(_ => null);
		}
		isDone(s) {
			return !!(s.failed || s.confirmed);
		}
	}

	function overlay(base, top) {
		Object.keys(top).forEach(k => {
			base[k] = top[k];
		});
		return base;
	}

	function memoized(f) {
		var memo;
		return function() {
			if (memo === undefined)
				memo = f();
			return memo;
		};
	}

	function call(addr, method, args, options) {
		let data = util.abiEncode(method.name, method.inputs.map(f => f.type), args);
		let decode = d => util.abiDecode(method.outputs.map(f => f.type), d);
		return api().eth.call(overlay({to: addr, data: data}, options)).then(decode);
	};

	function post(addr, method, args, options) {
		let toOptions = (addr, method, options, ...args) => {
			return overlay({to: addr, data: util.abiEncode(method.name, method.inputs.map(f => f.type), args)}, options);
		};
		// inResolveDepth is 2 to allow for Bonded `condition`values which are
		// object values in `options`.
		return new Transaction(new TransformBond(toOptions, [addr, method, options, ...args], [], 0, 2));
	};

	function presub (f) {
		return new Proxy(f, {
			get (receiver, name) {
				if (typeof(name) === 'string' || typeof(name) === 'number') {
					return typeof(receiver[name]) !== 'undefined' ? receiver[name] : receiver(name);
				} else if (typeof(name) === 'symbol' && oo7.Bond.knowSymbol(name)) {
					return receiver(oo7.Bond.fromSymbol(name));
				} else {
					throw new Error(`Weird value type to be subscripted by: ${typeof(name)}: ${JSON.stringify(name)}`);
				}
			}
		});
	};

	function isNumber(n) { return typeof(n) === 'number' || (typeof(n) === 'string' && n.match(/^[0-9]+$/)); }

	let useSubs = false;

	bonds.time = new oo7.TimeBond;

	if (!useSubs) {
		bonds.height = new TransformBond(() => api().eth.blockNumber().then(_ => +_), [], [bonds.time]);

		let onAccountsChanged = bonds.time; // TODO: more accurate notification
		let onHardwareAccountsChanged = bonds.time; // TODO: more accurate notification
		let onHeadChanged = bonds.height;	// TODO: more accurate notification
	//	let onReorg = undefined;	// TODO make more accurate.
		let onSyncingChanged = bonds.time;
		let onAuthoringDetailsChanged = bonds.time;
		let onPeerNetChanged = bonds.time; // TODO: more accurate notification
		let onPendingChanged = bonds.time; // TODO: more accurate notification
		let onUnsignedChanged = bonds.time; // TODO: more accurate notification
		let onAutoUpdateChanged = bonds.height;

		// eth_
		bonds.blockNumber = bonds.height;
		bonds.blockByNumber = (x => new TransformBond(x => api().eth.getBlockByNumber(x), [x], []).subscriptable());// TODO: chain reorg that includes number x
		bonds.blockByHash = (x => new TransformBond(x => api().eth.getBlockByHash(x), [x]).subscriptable());
		bonds.findBlock = (hashOrNumberBond => new TransformBond(hashOrNumber => isNumber(hashOrNumber)
			? api().eth.getBlockByNumber(hashOrNumber)
			: api().eth.getBlockByHash(hashOrNumber),
			[hashOrNumberBond], [/*onReorg*/]).subscriptable());// TODO: chain reorg that includes number x, if x is a number
		bonds.blocks = presub(bonds.findBlock);
		bonds.block = bonds.blockByNumber(bonds.height);	// TODO: DEPRECATE AND REMOVE
		bonds.head = new TransformBond(() => api().eth.getBlockByNumber('latest'), [], [onHeadChanged]).subscriptable();// TODO: chain reorgs
		bonds.author = new TransformBond(() => api().eth.coinbase(), [], [onAccountsChanged]);
		bonds.accounts = new TransformBond(a => a.map(util.toChecksumAddress), [new TransformBond(() => api().eth.accounts(), [], [onAccountsChanged])]).subscriptable();
		bonds.defaultAccount = bonds.accounts[0];	// TODO: make this use its subscription
		bonds.me = bonds.accounts[0];
		bonds.post = tx => new Transaction(tx);
		bonds.sign = (message, from = bonds.me) => new Signature(message, from);

		bonds.balance = (x => new TransformBond(x => api().eth.getBalance(x), [x], [onHeadChanged]));
		bonds.code = (x => new TransformBond(x => api().eth.getCode(x), [x], [onHeadChanged]));
		bonds.nonce = (x => new TransformBond(x => api().eth.getTransactionCount(x).then(_ => +_), [x], [onHeadChanged]));
		bonds.storageAt = ((x, y) => new TransformBond((x, y) => api().eth.getStorageAt(x, y), [x, y], [onHeadChanged]));

		bonds.syncing = new TransformBond(() => api().eth.syncing(), [], [onSyncingChanged]);
		bonds.hashrate = new TransformBond(() => api().eth.hashrate(), [], [onAuthoringDetailsChanged]);
		bonds.authoring = new TransformBond(() => api().eth.mining(), [], [onAuthoringDetailsChanged]);
		bonds.ethProtocolVersion = new TransformBond(() => api().eth.protocolVersion(), [], []);
		bonds.gasPrice = new TransformBond(() => api().eth.gasPrice(), [], [onHeadChanged]);
		bonds.estimateGas = (x => new TransformBond(x => api().eth.estimateGas(x), [x], [onHeadChanged, onPendingChanged]));

		bonds.blockTransactionCount = (hashOrNumberBond => new TransformBond(
			hashOrNumber => isNumber(hashOrNumber)
				? api().eth.getBlockTransactionCountByNumber(hashOrNumber).then(_ => +_)
				: api().eth.getBlockTransactionCountByHash(hashOrNumber).then(_ => +_),
			[hashOrNumberBond], [/*onReorg*/]));
		bonds.uncleCount = (hashOrNumberBond => new TransformBond(
			hashOrNumber => isNumber(hashOrNumber)
				? api().eth.getUncleCountByBlockNumber(hashOrNumber).then(_ => +_)
				: api().eth.getUncleCountByBlockHash(hashOrNumber).then(_ => +_),
			[hashOrNumberBond], [/*onReorg*/]).subscriptable());
		bonds.uncle = ((hashOrNumberBond, indexBond) => new TransformBond(
			(hashOrNumber, index) => isNumber(hashOrNumber)
				? api().eth.getUncleByBlockNumber(hashOrNumber, index)
				: api().eth.getUncleByBlockHash(hashOrNumber, index),
			[hashOrNumberBond, indexBond], [/*onReorg*/]).subscriptable());
		bonds.transaction = ((hashOrNumberBond, indexOrNullBond) => new TransformBond(
			(hashOrNumber, indexOrNull) =>
				indexOrNull === undefined || indexOrNull === null
					? api().eth.getTransactionByHash(hashOrNumber)
					: isNumber(hashOrNumber)
						? api().eth.getTransactionByBlockNumberAndIndex(hashOrNumber, indexOrNull)
						: api().eth.getTransactionByBlockHashAndIndex(hashOrNumber, indexOrNull),
				[hashOrNumberBond, indexOrNullBond], [/*onReorg*/]).subscriptable());
		bonds.receipt = (hashBond => new TransformBond(x => api().eth.getTransactionReceipt(x), [hashBond], []).subscriptable());

		// web3_
		bonds.clientVersion = new TransformBond(() => api().web3.clientVersion(), [], []);

		// net_
		bonds.peerCount = new TransformBond(() => api().net.peerCount().then(_ => +_), [], [onPeerNetChanged]);
		bonds.listening = new TransformBond(() => api().net.listening(), [], [onPeerNetChanged]);
		bonds.chainId = new TransformBond(() => api().net.version(), [], []);

		// parity_
		bonds.hashContent = u => new TransformBond(x => api().parity.hashContent(x), [u], [], false);
		bonds.gasPriceHistogram = new TransformBond(() => api().parity.gasPriceHistogram(), [], [onHeadChanged]).subscriptable();
		bonds.accountsInfo = new TransformBond(() => api().parity.accountsInfo(), [], [onAccountsChanged]).subscriptable(2);
		bonds.allAccountsInfo = new TransformBond(() => api().parity.allAccountsInfo(), [], [onAccountsChanged]).subscriptable(2);
		bonds.hardwareAccountsInfo = new TransformBond(() => api().parity.hardwareAccountsInfo(), [], [onHardwareAccountsChanged]).subscriptable(2);
		bonds.mode = new TransformBond(() => api().parity.mode(), [], [bonds.height]);

		// ...authoring
		bonds.defaultExtraData = new TransformBond(() => api().parity.defaultExtraData(), [], [onAuthoringDetailsChanged]);
		bonds.extraData = new TransformBond(() => api().parity.extraData(), [], [onAuthoringDetailsChanged]);
		bonds.gasCeilTarget = new TransformBond(() => api().parity.gasCeilTarget(), [], [onAuthoringDetailsChanged]);
		bonds.gasFloorTarget = new TransformBond(() => api().parity.gasFloorTarget(), [], [onAuthoringDetailsChanged]);
		bonds.minGasPrice = new TransformBond(() => api().parity.minGasPrice(), [], [onAuthoringDetailsChanged]);
		bonds.transactionsLimit = new TransformBond(() => api().parity.transactionsLimit(), [], [onAuthoringDetailsChanged]);

		// ...chain info
		bonds.chainName = new TransformBond(() => api().parity.netChain(), [], []);
		bonds.chainStatus = new TransformBond(() => api().parity.chainStatus(), [], [onSyncingChanged]).subscriptable();

		// ...networking
		bonds.peers = new TransformBond(() => api().parity.netPeers(), [], [onPeerNetChanged]).subscriptable(2);
		bonds.enode = new TransformBond(() => api().parity.enode(), [], []);
		bonds.nodePort = new TransformBond(() => api().parity.netPort().then(_ => +_), [], []);
		bonds.nodeName = new TransformBond(() => api().parity.nodeName(), [], []);
		bonds.signerPort = new TransformBond(() => api().parity.signerPort().then(_ => +_), [], []);
		bonds.dappsPort = new TransformBond(() => api().parity.dappsPort().then(_ => +_), [], []);
		bonds.dappsInterface = new TransformBond(() => api().parity.dappsInterface(), [], []);

		// ...transaction queue
		bonds.nextNonce = new TransformBond(() => api().parity.nextNonce().then(_ => +_), [], [onPendingChanged]);
		bonds.pending = new TransformBond(() => api().parity.pendingTransactions(), [], [onPendingChanged]);
		bonds.local = new TransformBond(() => api().parity.localTransactions(), [], [onPendingChanged]).subscriptable(3);
		bonds.future = new TransformBond(() => api().parity.futureTransactions(), [], [onPendingChanged]).subscriptable(2);
		bonds.pendingStats = new TransformBond(() => api().parity.pendingTransactionsStats(), [], [onPendingChanged]).subscriptable(2);
		bonds.unsignedCount = new TransformBond(() => api().parity.parity_unsignedTransactionsCount().then(_ => +_), [], [onUnsignedChanged]);

		// ...auto-update
		bonds.releasesInfo = new TransformBond(() => api().parity.releasesInfo(), [], [onAutoUpdateChanged]).subscriptable();
		bonds.versionInfo = new TransformBond(() => api().parity.versionInfo(), [], [onAutoUpdateChanged]).subscriptable();
		bonds.consensusCapability = new TransformBond(() => api().parity.consensusCapability(), [], [onAutoUpdateChanged]);
		bonds.upgradeReady = new TransformBond(() => api().parity.upgradeReady(), [], [onAutoUpdateChanged]).subscriptable();

	} else {
		bonds.height = new TransformBond(_ => +_, [new SubscriptionBond('eth', 'blockNumber')]).subscriptable();

		let onAutoUpdateChanged = bonds.height;

		// eth_
		bonds.blockNumber = bonds.height;
		bonds.blockByNumber = (numberBond => new TransformBond(number => new SubscriptionBond('eth', 'getBlockByNumber', [number]), [numberBond]).subscriptable());
		bonds.blockByHash = (x => new TransformBond(x => new SubscriptionBond('eth', 'getBlockByHash', [x]), [x]).subscriptable());
		bonds.findBlock = (hashOrNumberBond => new TransformBond(hashOrNumber => isNumber(hashOrNumber)
			? new SubscriptionBond('eth', 'getBlockByNumber', [hashOrNumber])
			: new SubscriptionBond('eth', 'getBlockByHash', [hashOrNumber]),
			[hashOrNumberBond]).subscriptable());
		bonds.blocks = presub(bonds.findBlock);
		bonds.block = bonds.blockByNumber(bonds.height);	// TODO: DEPRECATE AND REMOVE
		bonds.head = new SubscriptionBond('eth', 'getBlockByNumber', ['latest']).subscriptable();
		bonds.author = new SubscriptionBond('eth', 'coinbase');
		bonds.me = new SubscriptionBond('parity', 'defaultAccount');
		bonds.defaultAccount = bonds.me;	// TODO: DEPRECATE
		bonds.accounts = new SubscriptionBond('eth', 'accounts').subscriptable();
		bonds.post = tx => new Transaction(tx);
		bonds.sign = (message, from = bonds.me) => new Signature(message, from);

		bonds.balance = (x => new TransformBond(x => new SubscriptionBond('eth', 'getBalance', [x]), [x]));
		bonds.code = (x => new TransformBond(x => new SubscriptionBond('eth', 'getCode', [x]), [x]));
		bonds.nonce = (x => new TransformBond(x => new SubscriptionBond('eth', 'getTransactionCount', [x]), [x])); // TODO: then(_ => +_) Depth 2 if second TransformBond or apply to result
		bonds.storageAt = ((x, y) => new TransformBond((x, y) => new SubscriptionBond('eth', 'getStorageAt', [x, y]), [x, y]));

		bonds.syncing = new SubscriptionBond('eth', 'syncing');
		bonds.hashrate = new SubscriptionBond('eth', 'hashrate');
		bonds.authoring = new SubscriptionBond('eth', 'mining');
		bonds.ethProtocolVersion = new SubscriptionBond('eth', 'protocolVersion');
		bonds.gasPrice = new SubscriptionBond('eth', 'gasPrice');
		bonds.estimateGas = (x => new TransformBond(x => new SubscriptionBond('eth', 'estimateGas', [x]), [x]));

		bonds.blockTransactionCount = (hashOrNumberBond => new TransformBond(
			hashOrNumber => isNumber(hashOrNumber)
				? new TransformBond(_ => +_, [new SubscriptionBond('eth', 'getBlockTransactionCountByNumber', [hashOrNumber])])
				: new TransformBond(_ => +_, [new SubscriptionBond('eth', 'getBlockTransactionCountByHash', [hashOrNumber])]),
			[hashOrNumberBond]));
		bonds.uncleCount = (hashOrNumberBond => new TransformBond(
			hashOrNumber => isNumber(hashOrNumber)
				? new TransformBond(_ => +_, [new SubscriptionBond('eth', 'getUncleCountByBlockNumber', [hashOrNumber])])
				: new TransformBond(_ => +_, [new SubscriptionBond('eth', 'getUncleCountByBlockHash', [hashOrNumber])]),
			[hashOrNumberBond]).subscriptable());
		bonds.uncle = ((hashOrNumberBond, indexBond) => new TransformBond(
			(hashOrNumber, index) => isNumber(hashOrNumber)
				? new SubscriptionBond('eth', 'getUncleByBlockNumberAndIndex', [hashOrNumber, index])
				: new SubscriptionBond('eth', 'getUncleByBlockHashAndIndex', [hashOrNumber, index]),
			[hashOrNumberBond, indexBond]).subscriptable());

		bonds.transaction = ((hashOrNumberBond, indexOrNullBond) => new TransformBond(
			(hashOrNumber, indexOrNull) =>
				indexOrNull === undefined || indexOrNull === null
					? new SubscriptionBond('eth', 'getTransactionByHash', [hashOrNumber])
					: isNumber(hashOrNumber)
						? new SubscriptionBond('eth', 'getTransactionByBlockNumberAndIndex', [hashOrNumber, indexOrNull])
						: new SubscriptionBond('eth', 'getTransactionByBlockHashAndIndex', [hashOrNumber, indexOrNull]),
				[hashOrNumberBond, indexOrNullBond]).subscriptable());
		bonds.receipt = (hashBond => new TransformBond(x => new SubscriptionBond('eth', 'getTransactionReceipt', [x]), [hashBond]).subscriptable());

		// web3_
		bonds.clientVersion = new TransformBond(() => api().web3.clientVersion(), [], []);

		// net_
		bonds.peerCount = new TransformBond(_ => +_, [new SubscriptionBond('net', 'peerCount')]);
		bonds.listening = new SubscriptionBond('net', 'listening');
		bonds.chainId = new SubscriptionBond('net', 'version');

		// parity_
		bonds.hashContent = (u => new TransformBond(x => api().parity.hashContent(x), [u], [], false));
		bonds.gasPriceHistogram = new SubscriptionBond('parity', 'gasPriceHistogram').subscriptable();
		bonds.mode = new SubscriptionBond('parity', 'mode');
		bonds.accountsInfo = new SubscriptionBond('parity', 'accountsInfo').subscriptable(2);
		bonds.allAccountsInfo = new SubscriptionBond('parity', 'allAccountsInfo').subscriptable(2);
		bonds.hardwareAccountsInfo = new SubscriptionBond('parity', 'hardwareAccountsInfo').subscriptable(2);

		// ...authoring
		bonds.defaultExtraData = new SubscriptionBond('parity', 'defaultExtraData');
		bonds.extraData = new SubscriptionBond('parity', 'extraData');
		bonds.gasCeilTarget = new SubscriptionBond('parity', 'gasCeilTarget');
		bonds.gasFloorTarget = new SubscriptionBond('parity', 'gasFloorTarget');
		bonds.minGasPrice = new SubscriptionBond('parity', 'minGasPrice');
		bonds.transactionsLimit = new SubscriptionBond('parity', 'transactionsLimit');

		// ...chain info
		bonds.chainName = new SubscriptionBond('parity', 'netChain');
		bonds.chainStatus = new SubscriptionBond('parity', 'chainStatus').subscriptable();

		// ...networking
		bonds.peers = new SubscriptionBond('parity', 'netPeers').subscriptable(2);
		bonds.enode = new SubscriptionBond('parity', 'enode');
		bonds.nodePort = new TransformBond(_ => +_, [new SubscriptionBond('parity', 'netPort')]);
		bonds.nodeName = new SubscriptionBond('parity', 'nodeName');
		// Where defined ?
		bonds.signerPort = new TransformBond(() => api().parity.signerPort().then(_ => +_), [], []);
		bonds.dappsPort = new TransformBond(() => api().parity.dappsPort().then(_ => +_), [], []);
		bonds.dappsInterface = new TransformBond(() => api().parity.dappsInterface(), [], []);

		// ...transaction queue
		bonds.nextNonce = new TransformBond(_ => +_, [new SubscriptionBond('parity', 'nextNonce')]);
		bonds.pending = new SubscriptionBond('parity', 'pendingTransactions').subscriptable();
		bonds.local = new SubscriptionBond('parity', 'localTransactions').subscriptable(3);
		bonds.future = new SubscriptionBond('parity', 'futureTransactions').subscriptable(2);
		bonds.pendingStats = new SubscriptionBond('parity', 'pendingTransactionsStats').subscriptable(2);
		bonds.unsignedCount = new TransformBond(_ => +_, [new SubscriptionBond('parity', 'unsignedTransactionsCount')]);
		bonds.requestsToConfirm = new SubscriptionBond('signer', 'requestsToConfirm');

		// ...auto-update
		bonds.releasesInfo = new SubscriptionBond('parity', 'releasesInfo').subscriptable();
		bonds.versionInfo = new SubscriptionBond('parity', 'versionInfo').subscriptable();
		bonds.consensusCapability = new SubscriptionBond('parity', 'consensusCapability').subscriptable();
		bonds.upgradeReady = new TransformBond(() => api().parity.upgradeReady(), [], [onAutoUpdateChanged]).subscriptable();
	}

	// trace TODO: Implement contract object with new trace_many feature
	bonds.replayTx = ((x,whatTrace) => new TransformBond((x,whatTrace) => api().trace.replayTransaction(x, whatTrace), [x, whatTrace], []).subscriptable());
	bonds.callTx = ((x,whatTrace,blockNumber) => new TransformBond((x,whatTrace,blockNumber) => api().trace.call(x, whatTrace, blockNumber), [x, whatTrace, blockNumber], []).subscriptable());

	function traceCall (addr, method, args, options) {
		let data = util.abiEncode(method.name, method.inputs.map(f => f.type), args);
		let decode = d => util.abiDecode(method.outputs.map(f => f.type), d);
		let traceMode = options.traceMode;
		delete options.traceMode;
		return api().trace.call(overlay({to: addr, data: data}, options), traceMode, 'latest');
	};

	class DeployContract extends oo7.ReactivePromise {
		constructor(initBond, abiBond, optionsBond) {
			super([initBond, abiBond, optionsBond, bonds.registry], [], ([init, abi, options, registry]) => {
				options.data = init;
				delete options.to;
				let progress = this.trigger.bind(this);
				transactionPromise(options, progress, status => {
					if (status.confirmed) {
						status.deployed = bonds.makeContract(status.confirmed.contractAddress, abi, options.extras || []);
					}
					return status;
				});
				// TODO: consider allowing registry of the contract here.
			}, false);
			this.then(_ => null);
		}
		isDone(s) {
			return !!(s.failed || s.confirmed);
		}
	}

	bonds.deployContract = function(init, abi, options = {}) {
		return new DeployContract(init, abi, options);
	}

	bonds.makeContract = function(address, abi, extras = [], debug = false) {
		var r = { address: address };
		let unwrapIfOne = a => a.length == 1 ? a[0] : a;
		abi.forEach(i => {
			if (i.type == 'function' && i.constant) {
				let f = function (...args) {
					var options = args.length === i.inputs.length + 1 ? args.pop() : {};
					if (args.length != i.inputs.length)
						throw new Error(`Invalid number of arguments to ${i.name}. Expected ${i.inputs.length}, got ${args.length}.`);
					let f = (addr, ...fargs) => debug
						? traceCall(address, i, args, options)
						: call(addr, i, fargs, options)
						.then(rets => rets.map((r, o) => cleanup(r, i.outputs[o].type, api)))
						.then(unwrapIfOne);
					return new TransformBond(f, [address, ...args], [bonds.height]).subscriptable();	// TODO: should be subscription on contract events
				};
				r[i.name] = (i.inputs.length === 0) ? memoized(f) : (i.inputs.length === 1) ? presub(f) : f;
				r[i.name].args = i.inputs;
			}
		});
		extras.forEach(i => {
			let f = function (...args) {
				let expectedInputs = (i.numInputs || i.args.length);
				var options = args.length === expectedInputs + 1 ? args.pop() : {};
				if (args.length != expectedInputs)
					throw new Error(`Invalid number of arguments to ${i.name}. Expected ${expectedInputs}, got ${args.length}. ${args}`);
				let c = abi.find(j => j.name == i.method);
				let f = (addr, ...fargs) => {
					let args = i.args.map((v, index) => v === null ? fargs[index] : typeof(v) === 'function' ? v(fargs[index]) : v);
					return debug
									? traceCall(address, i, args, options)
									: call(addr, c, args, options).then(unwrapIfOne);
				};
				return new TransformBond(f, [address, ...args], [bonds.height]).subscriptable();	// TODO: should be subscription on contract events
			};
			r[i.name] = (i.args.length === 1) ? presub(f) : f;
			r[i.name].args = i.args;
		});
		abi.forEach(i => {
			if (i.type == 'function' && !i.constant) {
				r[i.name] = function (...args) {
					var options = args.length === i.inputs.length + 1 ? args.pop() : {};
					if (args.length !== i.inputs.length)
						throw new Error(`Invalid number of arguments to ${i.name}. Expected ${i.inputs.length}, got ${args.length}. ${args}`);
					return debug
									? traceCall(address, i, args, options)
									: post(address, i, args, options).subscriptable();
				};
				r[i.name].args = i.inputs;
			}
		});
		var eventLookup = {};
		abi.filter(i => i.type == 'event').forEach(i => {
			eventLookup[util.abiSignature(i.name, i.inputs.map(f => f.type))] = i.name;
		});

		function prepareIndexEncode(v, t, top = true) {
			if (v instanceof Array) {
				if (top) {
					return v.map(x => prepareIndexEncode(x, t, false));
				} else {
					throw new Error('Invalid type');
				}
			}
			var val;
			if (t == 'string' || t == 'bytes') {
				val = util.sha3(v);
			} else {
				val = util.abiEncode(null, [t], [v]);
			}
			if (val.length != 66) {
				throw new Error('Invalid length');
			}
			return val;
		}

		abi.forEach(i => {
			if (i.type == 'event') {
				r[i.name] = function (indexed = {}, params = {}) {
					return new TransformBond((addr, indexed) => {
						var topics = [util.abiSignature(i.name, i.inputs.map(f => f.type))];
						i.inputs.filter(f => f.indexed).forEach(f => {
							try {
								topics.push(indexed[f.name] ? prepareIndexEncode(indexed[f.name], f.type) : null);
							}
							catch (e) {
								throw new Error(`Couldn't encode indexed parameter ${f.name} of type ${f.type} with value ${indexed[f.name]}`);
							}
						});
						return api().eth.getLogs({
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
							util.abiDecode(unins.map(f => f.type), l.data).forEach((v, j) => {
								let f = unins[j];
								if (v instanceof Array && !f.type.endsWith(']')) {
									v = util.bytesToHex(v);
								}
								if (f.type.substr(0, 4) == 'uint' && +f.type.substr(4) <= 48) {
									v = +v;
								}
								e[f.name] = v;
							});
							i.inputs.filter(f => f.indexed).forEach((f, j) => {
								if (f.type == 'string' || f.type == 'bytes') {
									e[f.name] = l.topics[1 + j];
								} else {
									var v = util.abiDecode([f.type], l.topics[1 + j])[0];
									if (v instanceof Array) {
										v = util.bytesToHex(v);
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
					}, [address, indexed], [bonds.height]).subscriptable();
				};
				r[i.name].args = i.inputs;
			}
		});
		return r;
	};

	if (useSubs) {
		bonds.registry = bonds.makeContract(new SubscriptionBond('parity', 'registryAddress'), RegistryABI, RegistryExtras);
	} else {
		bonds.registry = bonds.makeContract(new TransformBond(() => api().parity.registryAddress(), [], [bonds.time]), RegistryABI, RegistryExtras);
	}

	bonds.githubhint = bonds.makeContract(bonds.registry.lookupAddress('githubhint', 'A'), GitHubHintABI);
	bonds.operations = bonds.makeContract(bonds.registry.lookupAddress('operations', 'A'), OperationsABI);
	bonds.badgereg = bonds.makeContract(bonds.registry.lookupAddress('badgereg', 'A'), BadgeRegABI);
	bonds.tokenreg = bonds.makeContract(bonds.registry.lookupAddress('tokenreg', 'A'), TokenRegABI);

	bonds.badges = new TransformBond(n => {
		var ret = [];
		for (var i = 0; i < +n; ++i) {
			let id = i;
			ret.push(oo7.Bond.all([
					bonds.badgereg.badge(id),
					bonds.badgereg.meta(id, 'IMG'),
					bonds.badgereg.meta(id, 'CAPTION')
				]).map(([[addr, name, owner], img, caption]) => ({
					id,
					name,
					img,
					caption,
					badge: bonds.makeContract(addr, BadgeABI)
				}))
			);
		}
		return ret;
	}, [bonds.badgereg.badgeCount()], [], 1);

	bonds.badgesOf = address => new TransformBond(
		(addr, bads) => bads.map(b => ({
			certified: b.badge.certified(addr),
			badge: b.badge,
			id: b.id,
			img: b.img,
			caption: b.caption,
			name: b.name
		})),
		[address, bonds.badges], [], 2
	).map(all => all.filter(_ => _.certified));

	bonds.tokens = new TransformBond(n => {
		var ret = [];
		for (var i = 0; i < +n; ++i) {
			let id = i;
			ret.push(oo7.Bond.all([
					bonds.tokenreg.token(id),
					bonds.tokenreg.meta(id, 'IMG'),
					bonds.tokenreg.meta(id, 'CAPTION')
				]).map(([[addr, tla, base, name, owner], img, caption]) => ({
					id,
					tla,
					base,
					name,
					img,
					caption,
					token: bonds.makeContract(addr, TokenABI)
				}))
			);
		}
		return ret;
	}, [bonds.tokenreg.tokenCount()], [], 1);

	bonds.tokensOf = address => new TransformBond(
		(addr, bads) => bads.map(b => ({
			balance: b.token.balanceOf(addr),
			token: b.token,
			id: b.id,
			name: b.name,
			tla: b.tla,
			base: b.base,
			img: b.img,
			caption: b.caption,
		})),
		[address, bonds.tokens], [], 2
	).map(all => all.filter(_ => _.balance.gt(0)));

	bonds.namesOf = address => new TransformBond((reg, addr, accs) => ({
		owned: accs[addr] ? accs[addr].name : null,
		registry: reg || null
	}), [bonds.registry.reverse(address), address, bonds.accountsInfo]);

	bonds.registry.names = oo7.Bond.mapAll([bonds.registry.ReverseConfirmed({}, {limit: 100}), bonds.accountsInfo],
		(reg, info) => {
			let r = {};
			Object.keys(info).forEach(k => r[k] = info[k].name);
			reg.forEach(a => r[a.reverse] = bonds.registry.reverse(a.reverse));
			return r;
		}, 1)

	return bonds;
}

const t = defaultProvider();
export var options = t ? { api: new ParityApi(t) } : null;
export const bonds = options ? createBonds(options) : null;

// TODO: remove once ParityApi.util.asciiToHex works.
export function asciiToHex(s) {
	var r = '0x'
	for (var i = 0; i < s.length; ++i) {
		r += ('0' + s.charCodeAt(i).toString(16)).substr(-2);
	}
	return r;
}

export const bytesToHex = ParityApi.util.bytesToHex;
export const hexToAscii = ParityApi.util.hexToAscii;
export const isAddressValid = h => oo7.Bond.instanceOf(h) ? h.map(ParityApi.util.isAddressValid) : ParityApi.util.isAddressValid(h);
export const toChecksumAddress = h => oo7.Bond.instanceOf(h) ? h.map(ParityApi.util.toChecksumAddress) : ParityApi.util.toChecksumAddress(h);
export const sha3 = h => oo7.Bond.instanceOf(h) ? h.map(ParityApi.util.sha3) : ParityApi.util.sha3(h);

export const isOwned = addr => oo7.Bond.mapAll([addr, bonds.accounts], (a, as) => as.indexOf(a) !== -1);
export const isNotOwned = addr => oo7.Bond.mapAll([addr, bonds.accounts], (a, as) => as.indexOf(a) === -1);

// Deprecated.
export { abiPolyfill };

export { RegistryABI, RegistryExtras, GitHubHintABI, OperationsABI,
	BadgeRegABI, TokenRegABI, BadgeABI, TokenABI };


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

export const denominations = [ 'wei', 'Kwei', 'Mwei', 'Gwei', 'szabo', 'finney', 'ether', 'grand', 'Mether', 'Gether', 'Tether', 'Pether', 'Eether', 'Zether', 'Yether', 'Nether', 'Dether', 'Vether', 'Uether' ];

export function denominationMultiplier(s) {
    let i = denominations.indexOf(s);
    if (i < 0)
        throw new Error('Invalid denomination');
    return (new BigNumber(1000)).pow(i);
}

export function interpretRender(s, defaultDenom = 6) {
    try {
        let m = s.toLowerCase().match(/([0-9,]+)(\.([0-9]*))? *([a-zA-Z]+)?/);
		let di = m[4] ? denominations.indexOf(m[4]) : defaultDenom;
		if (di === -1) {
			return null;
		}
		let n = (m[1].replace(',', '').replace(/^0*/, '')) || '0';
		let d = (m[3] || '').replace(/0*$/, '');
		return { denom: di, units: n, decimals: d, origNum: m[1] + (m[2] || ''), origDenom: m[4] || '' };
    }
    catch (e) {
        return null;
    }
}

export function combineValue(v) {
	let d = (new BigNumber(1000)).pow(v.denom);
	let n = v.units;
	if (v.decimals) {
		n += v.decimals;
		d = d.div((new BigNumber(10)).pow(v.decimals.length));
	}
	return new BigNumber(n).mul(d);
}

export function defDenom(v, d) {
	if (v.denom === null) {
		v.denom = d;
	}
	return v;
}

export function formatValue(n) {
	return `${formatValueNoDenom(n)} ${denominations[n.denom]}`;
}

export function formatValueNoDenom(n) {
	return `${n.units.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1,')}${n.decimals ? '.' + n.decimals : ''}`;
}

export function formatToExponential(v, n) {
	return new BigNumber(v).toExponential(4);
}

export function interpretQuantity(s) {
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
    }
    catch (e) {
        return null;
    }
}

export function splitValue(a) {
	var i = 0;
	var a = new BigNumber('' + a);
	if (a.gte(new BigNumber('10000000000000000')) && a.lt(new BigNumber('100000000000000000000000')) || a.eq(0))
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
//	let b = Math.floor(a.base * 1000) / 1000;
	return `${a.base} ${denominations[a.denom]}`;
}

export function formatBlockNumber(n) {
    return '#' + ('' + n).replace(/(\d)(?=(\d{3})+$)/g, '$1,');
}

export function isNullData(a) {
	return !a || typeof(a) !== 'string' || a.match(/^(0x)?0+$/) !== null;
}

export function splitSignature (sig) {
	if ((sig.substr(2, 2) === '1b' || sig.substr(2, 2) === '1c') && (sig.substr(66, 2) !== '1b' && sig.substr(66, 2) !== '1c')) {
		// vrs
		return [sig.substr(0, 4), `0x${sig.substr(4, 64)}`, `0x${sig.substr(68, 64)}`];
	} else {
		// rsv
		return [`0x${sig.substr(130, 2)}`, `0x${sig.substr(2, 64)}`, `0x${sig.substr(66, 64)}`];
	}
};

export function removeSigningPrefix (message) {
	if (!message.startsWith('\x19Ethereum Signed Message:\n')) {
		throw new Error('Invalid message - doesn\'t contain security prefix');
	}
	for (var i = 1; i < 6; ++i) {
		if (message.length == 26 + i + +message.substr(26, i)) {
			return message.substr(26 + i);
		}
	}
	throw new Error('Invalid message - invalid security prefix');
};

export function cleanup (value, type = 'bytes32', api = parity.api) {
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
	if (type.substr(0, 4) == 'uint' && +type.substr(4) <= 48) {
		value = +value;
	}
	return value;
}
