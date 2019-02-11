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

/* eslint-disable no-return-assign */
/* eslint-disable no-proto */

// TODO [Document auxilary types]

const oo7 = require('oo7');
const ParityApi = require('@parity/api');

const {
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
} = require('./utils');

const {
	abiPolyfill,
	RegistryABI,
	RegistryExtras,
	GitHubHintABI,
	OperationsABI,
	BadgeRegABI,
	TokenRegABI,
	BadgeABI,
	TokenABI
} = require('./abis');

function defaultProvider () {
	if (typeof window !== 'undefined' && window.ethereum) {
		return window.ethereum;
	}

	try {
		if (typeof window !== 'undefined' && window.parent && window.parent.ethereum) {
			return window.parent.ethereum;
		}
	} catch (e) {}

	return new ParityApi.Provider.Http('http://localhost:8545');
}

class Bonds {
	/**
	 * Creates a new oo7-parity bonds aggregate object with given ethereum provider.
	 *
	 * Additional documentation can be found at https://wiki.parity.io/oo7-Parity-Reference.html
	 *
	 * @param {?Provider} provider Web3-compatible transport Provider (i.e. `window.ethereum`). Uses a sane default if not provided.
	 * @returns {Bonds}
	 */
	constructor (provider = defaultProvider()) {
		if (!this) {
			return createBonds({ api: new ParityApi(provider) });
		}

		/**
		 *
		 * A {@link Bond} representing latest time. Updated every second.
		 *
		 * @type {TimeBond}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.time
		 *	.tie(console.log) // prints time periodically
		 */
		this.time = null;

		/**
		 * A {@link Bond} representing latest block number.
		 * Alias for {@link Bonds.blockNumber}
		 *
		 * @type {Bond.<Number>}
		 */
		this.height = null;

		/**
		 * A {@link Bond} representing latest block number.
		 *
		 * @type {Bond.<Number>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.blockNumber
		 *	.tie(console.log) // prints latest block number when it changes
		 */
		this.blockNumber = null;

		/**
		 * A function returning bond that represents given block content.
		 *
		 * @param {string|number|Bond} number block number
		 * @returns {Bond.<Block>} block bond
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.blockByNumber(bonds.height)
		 *	.tie(console.log) // prints latest block
		 */
		this.blockByNumber = null;

		/**
		 * A function returning bond that represents given block content.
		 *
		 * @param {string|number|Bond} hash block hash
		 * @returns {Bond.<Block>} block bond
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.blockByHash('0x2b23d04567313fa141ca396f1e2620b62ab0c5d69f8c77157118f8d7671e1f4d')
		 *	.tie(console.log) // prints block with given hash
		 */
		this.blockByHash = null;

		/**
		 * Similar to {@link Bonds.blockByNumber} and {@link Bonds.blockByHash},
		 * but accepts both hashes and numbers as arguments.
		 *
		 * @param {string|number|Bond} hashOrNumber block hash or block number
		 * @returns {Bond.<Block>} block bond
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.findBlock('0x2b23d04567313fa141ca396f1e2620b62ab0c5d69f8c77157118f8d7671e1f4d')
		 *	.tie(console.log) // prints block with given hash
		 */
		this.findBlock = null;

		/**
		 * A subscriptable version of {@link Bonds.findBlock}
		 *
		 * You can retrieve bonds given block numbers or hashes or other Bonds.
		 *
		 * @type {Object.<string|number|Bond, Bond>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.blocks['0x2b23d04567313fa141ca396f1e2620b62ab0c5d69f8c77157118f8d7671e1f4d']
		 *	.tie(console.log) // prints block with given hash
		 *
		 * bonds
		 *	.blocks[bonds.height]
		 *	.tie(console.log) // prints latest block every time it changes
		 */
		this.blocks = null;

		/**
		 * A {@link Bond} for latest block.
		 *
		 * @type {Bond.<Block>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.head
		 *	.tie(console.log) // prints latest block every time it changes
		 *
		 */
		this.head = null;

		/**
		 * A {@link Bond} for currently set block author.
		 * Represents a result of `eth_coinbase` RPC call.
		 *
		 * @type {Bond.<Address>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.author
		 *	.tie(console.log) // prints currently set block author (coinbase/miner) every time it changes
		 *
		 */
		this.author = null;

		/**
		 * List of accounts managed by the node.
		 *
		 * @type {Bond.<Address[]>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.accounts
		 *	.tie(console.log) // prints accounts list every time it changes
		 *
		 */
		this.accounts = null;

		/**
		 * User-selected default account for this dapp.
		 *
		 * @type {Bond.<Address>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.defaultAccount
		 *	.tie(console.log) // prints default account every time it changes
		 *
		 */
		this.defaultAccount = null;

		/**
		 * Alias for {@link Bonds.defaultAccount}
		 *
		 * @type {Bond.<Address>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.me
		 *	.tie(console.log) // prints default account every time it changes
		 *
		 */
		this.me = null;
		/**
		 * Posts a transaction to the network.
		 *
		 * @param {TransactionRequest} tx Transaction details
		 * @returns {ReactivePromise.<TransactionStatus>}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.post({ to: bonds.me, value: 0  })
		 *	.tie(console.log) // Reports transaction progress
		 */
		this.post = null;
		/**
		 * Returns a signature of given message
		 *
		 * @param {Hash|Bond} hash Hash to sign
		 * @param {?Address|Bond} from Optional account that should be used for signing.
		 * @returns {ReactivePromise.<SignStatus>}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.sign('0x2ea2e504d09c458dbadc703112125564d53ca03c27a5b28e7b3e2b5804289c45')
		 *	.tie(console.log) // Reports signing progress
		 */
		this.sign = null;

		/**
		 * Returns balance of given address.
		 *
		 * @param {string|Bond.<Address>} address
		 * @returns {Bond.<BigNumber>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.balance(bonds.me)
		 *	.tie(console.log) // prints default account balance every time any of them changes
		 *
		 */
		this.balance = null;

		/**
		 * Returns code of given address.
		 *
		 * @param {string|Bond.<Address>} address
		 * @returns {Bond.<Bytes>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.code(bonds.me)
		 *	.tie(console.log) // prints default account code every time any of them changes
		 *
		 */
		this.code = null;

		/**
		 * Returns the nonce of given address.
		 *
		 * @param {string|Bond.<Address>} address
		 * @returns {Bond.<BigNumber>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.nonce(bonds.me)
		 *	.tie(console.log) // prints default account nonce every time any of them changes
		 *
		 */
		this.nonce = null;

		/**
		 * Returns storage at given index of an address.
		 *
		 * @param {string|Bond.<Address>} address Contract address
		 * @param {string|number|Bond.<H256>} storageIdx Contract storage index
		 * @returns {Bond.<BigNumber>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.storageAt(bonds.me, 0)
		 *	.tie(console.log) // prints default account storage at position 0 every time any of them changes
		 *
		 */
		this.storageAt = null;

		/**
		 * Returns node's syncing status.
		 * If the node is fully synced this will return `false`.
		 *
		 * @type {Bond.<bool>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.syncing
		 *	.tie(console.log) // prints sync status every time it changes
		 *
		 */
		this.syncing = null;
		/**
		 * Returns node's authoring status.
		 * If the node is not authoring blocks this will return `false`.
		 *
		 * @type {Bond.<bool>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.authoring
		 *	.tie(console.log) // prints authoring status every time it changes
		 *
		 */
		this.authoring = null;
		/**
		 * Reported hashrate.
		 * If there is an external miner connected to the node it will return reported values.
		 *
		 * @type {Bond.<BigNumber>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.hashrate
		 *	.tie(console.log) // prints current average hashrate
		 *
		 */
		this.hashrate = null;
		this.ethProtocolVersion = null;
		/**
		 * Suggested gas price value. (Gas Price Oracle)
		 * This returns a suggested gas price for next transaction. The estimation is based on statistics from last blocks.
		 *
		 * @type {Bond.<BigNumber>}
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.gasPrice
		 *	.tie(console.log) // prints current gas price suggestion
		 *
		 */
		this.gasPrice = null;
		/**
		 * Estimates gas required to execute given transaction
		 *
		 * @param {{ from: ?Address, to: ?Address, data: ?Bytes }} call Transaction request
		 * @returns {Bond.<BigNumber>} gas estimate
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.estimateGas({ from: bonds.me, to: '0x00D6Cc1BA9cf89BD2e58009741f4F7325BAdc0ED' })
		 *	.tie(console.log) // prints current gas estimate
		 *
		 */
		this.estimateGas = null;

		/**
		 * Returns block transaction count given block number or hash.
		 *
		 * @param {string|number|Bond} block block number or hash
		 * @returns {Bond.<Number>} number of transactions in block
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.blockTransactionCount(bonds.blockNumber)
		 *	.tie(console.log) // prints number of transactions in latest block
		 *
		 */
		this.blockTransactionCount = null;
		/**
		 * Returns uncle count given block number or hash.
		 *
		 * @param {string|number|Bond} block block number or hash
		 * @returns {Bond.<Number>} number of uncles in a block
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.uncleCount(bonds.blockNumber)
		 *	.tie(console.log) // prints number of uncles in latest block
		 *
		 */
		this.uncleCount = null;
		/**
		 * Returns uncle given block number or hash and uncle index
		 *
		 * @param {string|number|Bond} block block number or hash
		 * @param {string|number|Bond} index index of an uncle within a block
		 * @returns {Bond.<Header>} uncle header at that index
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.uncle(bonds.blockNumber, 0)
		 *	.tie(console.log) // prints the first uncle in latest block
		 *
		 */
		this.uncle = null;
		/**
		 * Returns transaction given block number or hash and transaction index
		 *
		 * @param {string|number|Bond} block block number or hash
		 * @param {string|number|Bond} index index of a transaction within a block
		 * @returns {Bond.<Transaction>} transaction at that index
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.transaction(bonds.blockNumber, 0)
		 *	.tie(console.log) // prints the first uncle in latest block
		 *
		 */
		this.transaction = null;
		/**
		 * Returns receipt given transaction hash.
		 *
		 * @param {string|number|Bond} hash transaction hash
		 * @returns {Bond.<TransactionReceipt>} transaction at that index
		 *
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.receipt(bonds.transaction(bonds.height, 0).map(x => x ? x.hash : undefined))
		 *	.tie(console.log) // prints receipt of first transaction in latest block
		 *
		 */
		this.receipt = null;

		/**
		 * Returns client version string. (`web3_clientVersion`).
		 *
		 * @type {Bond.<String>}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.clientVersion
		 *	.tie(console.log)
		 *
		 */
		this.clientVersion = null;

		/**
		 * Returns current peer count. (`net_peerCount`).
		 *
		 * @type {Bond.<Number>}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.peerCount
		 *	.tie(console.log)
		 *
		 */
		this.peerCount = null;
		/**
		 * Returns true if the node is actively listening for network connections.
		 *
		 * @type {Bond.<bool>}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.listening
		 *	.tie(console.log)
		 *
		 */
		this.listening = null;
		/**
		 * Returns chain id (used for chain replay protection).
		 * NOTE: It's _not_ network id.
		 *
		 * @type {Bond.<Number>}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.chainId
		 *	.tie(console.log)
		 *
		 */
		this.chainId = null;

		/**
		 * Returns a hash of content under given URL.
		 *
		 * @param {string|Bond} url URL of the content
		 * @returns {Bond.<string>} hash of the content
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.hashContent('https://google.com')
		 *	.tie(console.log)
		 *
		 */
		this.hashContent = null;
		this.gasPriceHistogram = null;
		this.accountsInfo = null;
		this.allAccountsInfo = null;
		this.hardwareAccountsInfo = null;
		this.mode = null;

		this.defaultExtraData = null;
		this.extraData = null;
		this.gasCeilTarget = null;
		this.gasFloorTarget = null;
		this.minGasPrice = null;
		this.transactionsLimit = null;
		/**
		 * Returns a string name of currently connected chain.
		 *
		 * @type {Bond.<string>}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.chainName
		 *	.tie(console.log)
		 */
		this.chainName = null;
		/**
		 * Returns a status of currently connected chain.
		 *
		 * @type {Bond.<object>}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.chainStatus
		 *	.tie(console.log)
		 */
		this.chainStatus = null;

		this.peers = null;
		this.enode = null;
		this.nodePort = null;
		this.nodeName = null;
		this.signerPort = null;
		this.dappsPort = null;
		this.dappsInterface = null;

		this.nextNonce = null;
		this.pending = null;
		this.local = null;
		this.future = null;
		this.pendingStats = null;
		this.unsignedCount = null;

		this.releaseInfo = null;
		this.versionInfo = null;
		this.consensusCapability = null;
		this.upgradeReady = null;

		/**
		 * Replays (re-executes) a transaction. Returns requested traces of execution.
		 *
		 * @param {string} hash Transaction hash
		 * @param {String[]} traces Any subset of `trace`,`vmTrace`,`stateDiff`.
		 * @returns {Bond.<object>}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.replayTx('0x2ea2e504d09c458dbadc703112125564d53ca03c27a5b28e7b3e2b5804289c45', ['trace'])
		 *	.tie(console.log)
		 */
		this.replayTx = null;
		/**
		 * Executs a transaction and collects traces.
		 *
		 * @param {TransactionRequest} transaction Transaction request
		 * @param {String[]} traces Any subset of `trace`,`vmTrace`,`stateDiff`.
		 * @param {string|number|Bond} block Block number or hash
		 * @returns {Bond.<object>}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.callTx({
		 *		from: bonds.me,
		 *		to: bonds.registry.address
		 *	}, ['trace'], 'latest')
		 *	.tie(console.log)
		 */
		this.callTx = null;

		/**
		 * Deploys a new contract
		 *
		 * @param {string|Bytes} init Initialization bytecode
		 * @param {ABI} abi Contract ABI
		 * @param {{from: ?Address, gas: ?BigNumber, gasPrice: ?BigNumber, nonce: ?BigNumber}} options Deployment options
		 * @returns {ReactivePromise.<DeployStatus>}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.deployContract('0x1234', abi, {})
		 *	.tie(console.log) // Reports deployment progress
		 */
		this.deployContract = null;
		/**
		 * Creates bond-enabled contract object for existing contract.
		 *
		 * @param {string|Bond} address Contract address
		 * @param {ABI} abi Contract ABI
		 * @param {?ABI} extras Additional methods not defined in the ABI.
		 * @returns {Contract}
		 * @example
		 * const { bonds } = require('oo7-parity')
		 *
		 * bonds
		 *	.makeContract(bonds.me, abi)
		 *	.someMethod()
		 *	.tie(console.log) // returns a result of someMethod call
		 */
		this.makeContract = null;

		/**
		 * Parity registry contract instance.
		 * @type {Contract.<Registry>}
		 */
		this.registry = null;

		/**
		 * Parity registry contract instance.
		 * @type {Contract.<GithubHint>}
		 */
		this.githubhint = null;
		/**
		 * Parity registry contract instance.
		 * @type {Contract.<Operations>}
		 */
		this.operations = null;
		/**
		 * Parity registry contract instance.
		 * @type {Contract.<BadgeReg>}
		 */
		this.badgereg = null;
		/**
		 * Parity registry contract instance.
		 * @type {Contract.<TokenReg>}
		 */
		this.tokenreg = null;

		/**
		 * A {@link Bond} representing all currently registered badges from BadgeReg.
		 *
		 * @type {Bond.<{id:string,name:string,img:string,caption:string,badge:Contract}[]>}
		 */
		this.badges = null;
		/**
		 * Returns a list of badges for given address.
		 *
		 * @param {Address} address
		 * @returns {Bond.<Badge[]>} see {@link Bonds.badges}
		 */
		this.badgesOf = null;

		/**
		 * A {@link Bond} representing all currently registered tokens from TokenReg.
		 *
		 * @type {Bond.<{id:string,tla:string,base:string,name:string,owner:address,img:string,caption:string}[]>}
		 */
		this.tokens = null;
		/**
		 * Returns a list of tokens with a non-empty balance for given address.
		 *
		 * @param {Address} address
		 * @returns {Bond.<Token[]>} see {@link Bonds.tokens}
		 */
		this.tokensOf = null;

		return this;
	}
}

function isNumber (n) {
	return typeof (n) === 'number' || (typeof (n) === 'string' && n.match(/^[0-9]+$/));
}

function memoized (f) {
	var memo;
	return function () {
		if (memo === undefined) { memo = f(); }
		return memo;
	};
}

function overlay (base, top) {
	Object.keys(top).forEach(k => {
		base[k] = top[k];
	});
	return base;
}

function transactionPromise (api, tx, progress, f) {
	progress({ initialising: null });
	let condition = tx.condition || null;
	Promise.all([api().eth.accounts(), api().eth.gasPrice()])
		.then(([a, p]) => {
			progress({ estimating: null });
			tx.from = tx.from || a[0];
			tx.gasPrice = tx.gasPrice || p;
			return tx.gas || api().eth.estimateGas(tx);
		})
		.then(g => {
			progress({ estimated: g });
			tx.gas = tx.gas || g;
			return api().parity.postTransaction(tx);
		})
		.then(signerRequestId => {
			progress({ requested: signerRequestId });
			return api().pollMethod('parity_checkRequest', signerRequestId);
		})
		.then(transactionHash => {
			if (condition) {
				progress(f({ signed: transactionHash, scheduled: condition }));
				return { signed: transactionHash, scheduled: condition };
			} else {
				progress({ signed: transactionHash });
				return api()
					.pollMethod('eth_getTransactionReceipt', transactionHash, (receipt) => receipt && receipt.blockNumber && !receipt.blockNumber.eq(0))
					.then(receipt => {
						progress(f({ confirmed: receipt }));
						return receipt;
					});
			}
		})
		.catch(error => {
			progress({ failed: error });
		});
}

class DeployContract extends oo7.ReactivePromise {
	constructor (initBond, abiBond, optionsBond, api) {
		super([initBond, abiBond, optionsBond, bonds.registry], [], ([init, abi, options, registry]) => {
			options.data = init;
			delete options.to;
			let progress = this.trigger.bind(this);
			transactionPromise(api, options, progress, status => {
				if (status.confirmed) {
					status.deployed = bonds.makeContract(status.confirmed.contractAddress, abi, options.extras || []);
				}
				return status;
			});
			// TODO: consider allowing registry of the contract here.
		}, false);
		this.then(_ => null);
	}
	isDone (s) {
		return !!(s.failed || s.confirmed);
	}
}

class Transaction extends oo7.ReactivePromise {
	constructor (tx, api) {
		super([tx], [], ([tx]) => {
			let progress = this.trigger.bind(this);
			transactionPromise(api, tx, progress, _ => _);
		}, false);
		this.then(_ => null);
	}
	isDone (s) {
		return !!(s.failed || s.confirmed);
	}
}

/**
 * @param {{api: ParityApi}} Options object
 * @returns {Bonds}
 */
function createBonds (options) {
	const bonds = new Bonds();

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
		static all (list) {
			return new TransformBond((...args) => args, list);
		}
	}

	class SubscriptionBond extends oo7.Bond {
		constructor (module, rpcName, options = []) {
			super();
			this.module = module;
			this.rpcName = rpcName;
			this.options = [(_, n) => this.trigger(n), ...options];
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
		static all (list) {
			return new TransformBond((...args) => args, list);
		}
	}

	class Signature extends oo7.ReactivePromise {
		constructor (message, from) {
			super([message, from], [], ([message, from]) => {
				api().parity.postSign(from, asciiToHex(message))
					.then(signerRequestId => {
						this.trigger({ requested: signerRequestId });
						return api().pollMethod('parity_checkRequest', signerRequestId);
					})
					.then(signature => {
						this.trigger({
							signed: splitSignature(signature)
						});
					})
					.catch(error => {
						console.error(error);
						this.trigger({ failed: error });
					});
			}, false);
			this.then(_ => null);
		}
		isDone (s) {
			return !!s.failed || !!s.signed;
		}
	}

	function call (addr, method, args, options) {
		let data = util.abiEncode(method.name, method.inputs.map(f => f.type), args);
		let decode = d => util.abiDecode(method.outputs.map(f => f.type), d);
		return api().eth.call(overlay({ to: addr, data: data }, options)).then(decode);
	}

	function post (addr, method, args, options) {
		let toOptions = (addr, method, options, ...args) => {
			return overlay({ to: addr, data: util.abiEncode(method.name, method.inputs.map(f => f.type), args) }, options);
		};
		// inResolveDepth is 2 to allow for Bonded `condition`values which are
		// object values in `options`.
		return new Transaction(new TransformBond(toOptions, [addr, method, options, ...args], [], 0, 2), api);
	}

	function presub (f) {
		return new Proxy(f, {
			get (receiver, name) {
				if (typeof (name) === 'string' || typeof (name) === 'number') {
					return typeof (receiver[name]) !== 'undefined' ? receiver[name] : receiver(name);
				} else if (typeof (name) === 'symbol' && oo7.Bond.knowSymbol(name)) {
					return receiver(oo7.Bond.fromSymbol(name));
				} else {
					throw new Error(`Weird value type to be subscripted by: ${typeof (name)}: ${JSON.stringify(name)}`);
				}
			}
		});
	}

	let useSubs = false;

	bonds.time = new oo7.TimeBond();

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
		bonds.blockByNumber = x => new TransformBond(x => api().eth.getBlockByNumber(x), [x], []).subscriptable();// TODO: chain reorg that includes number x
		bonds.blockByHash = x => new TransformBond(x => api().eth.getBlockByHash(x), [x]).subscriptable();
		bonds.findBlock = hashOrNumberBond => new TransformBond(hashOrNumber => isNumber(hashOrNumber)
			? api().eth.getBlockByNumber(hashOrNumber)
			: api().eth.getBlockByHash(hashOrNumber),
		[hashOrNumberBond], [/* onReorg */]).subscriptable();// TODO: chain reorg that includes number x, if x is a number
		bonds.blocks = presub(bonds.findBlock);
		bonds.block = bonds.blockByNumber(bonds.height);	// TODO: DEPRECATE AND REMOVE
		bonds.head = new TransformBond(() => api().eth.getBlockByNumber('latest'), [], [onHeadChanged]).subscriptable();// TODO: chain reorgs
		bonds.author = new TransformBond(() => api().eth.coinbase(), [], [onAccountsChanged]);
		bonds.accounts = new TransformBond(a => a.map(util.toChecksumAddress), [new TransformBond(() => api().eth.accounts(), [], [onAccountsChanged])]).subscriptable();
		bonds.defaultAccount = bonds.accounts[0];	// TODO: make this use its subscription
		bonds.me = bonds.accounts[0];
		// TODO [ToDr] document (Post & Sign)
		bonds.post = tx => new Transaction(tx, api);
		bonds.sign = (message, from = bonds.me) => new Signature(message, from);

		bonds.balance = x => new TransformBond(x => api().eth.getBalance(x), [x], [onHeadChanged]);
		bonds.code = x => new TransformBond(x => api().eth.getCode(x), [x], [onHeadChanged]);
		bonds.nonce = x => new TransformBond(x => api().eth.getTransactionCount(x).then(_ => +_), [x], [onHeadChanged]);
		bonds.storageAt = (x, y) => new TransformBond((x, y) => api().eth.getStorageAt(x, y), [x, y], [onHeadChanged]);

		bonds.syncing = new TransformBond(() => api().eth.syncing(), [], [onSyncingChanged]);
		bonds.hashrate = new TransformBond(() => api().eth.hashrate(), [], [onAuthoringDetailsChanged]);
		bonds.authoring = new TransformBond(() => api().eth.mining(), [], [onAuthoringDetailsChanged]);
		bonds.ethProtocolVersion = new TransformBond(() => api().eth.protocolVersion(), [], []);
		bonds.gasPrice = new TransformBond(() => api().eth.gasPrice(), [], [onHeadChanged]);
		bonds.estimateGas = x => new TransformBond(x => api().eth.estimateGas(x), [x], [onHeadChanged, onPendingChanged]);

		bonds.blockTransactionCount = hashOrNumberBond => new TransformBond(
			hashOrNumber => isNumber(hashOrNumber)
				? api().eth.getBlockTransactionCountByNumber(hashOrNumber).then(_ => +_)
				: api().eth.getBlockTransactionCountByHash(hashOrNumber).then(_ => +_),
			[hashOrNumberBond], [/* onReorg */]);
		bonds.uncleCount = hashOrNumberBond => new TransformBond(
			hashOrNumber => isNumber(hashOrNumber)
				? api().eth.getUncleCountByBlockNumber(hashOrNumber).then(_ => +_)
				: api().eth.getUncleCountByBlockHash(hashOrNumber).then(_ => +_),
			[hashOrNumberBond], [/* onReorg */]).subscriptable();
		bonds.uncle = (hashOrNumberBond, indexBond) => new TransformBond(
			(hashOrNumber, index) => isNumber(hashOrNumber)
				? api().eth.getUncleByBlockNumber(hashOrNumber, index)
				: api().eth.getUncleByBlockHash(hashOrNumber, index),
			[hashOrNumberBond, indexBond], [/* onReorg */]).subscriptable();
		bonds.transaction = (hashOrNumberBond, indexOrNullBond) => new TransformBond(
			(hashOrNumber, indexOrNull) =>
				indexOrNull === undefined || indexOrNull === null
					? api().eth.getTransactionByHash(hashOrNumber)
					: isNumber(hashOrNumber)
						? api().eth.getTransactionByBlockNumberAndIndex(hashOrNumber, indexOrNull)
						: api().eth.getTransactionByBlockHashAndIndex(hashOrNumber, indexOrNull),
			[hashOrNumberBond, indexOrNullBond], [/* onReorg */]).subscriptable();
		bonds.receipt = hashBond => new TransformBond(x => api().eth.getTransactionReceipt(x), [hashBond], []).subscriptable();

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
		bonds.blockByNumber = numberBond => new TransformBond(number => new SubscriptionBond('eth', 'getBlockByNumber', [number]), [numberBond]).subscriptable();
		bonds.blockByHash = x => new TransformBond(x => new SubscriptionBond('eth', 'getBlockByHash', [x]), [x]).subscriptable();
		bonds.findBlock = hashOrNumberBond => new TransformBond(hashOrNumber => isNumber(hashOrNumber)
			? new SubscriptionBond('eth', 'getBlockByNumber', [hashOrNumber])
			: new SubscriptionBond('eth', 'getBlockByHash', [hashOrNumber]),
		[hashOrNumberBond]).subscriptable();
		bonds.blocks = presub(bonds.findBlock);
		bonds.block = bonds.blockByNumber(bonds.height);	// TODO: DEPRECATE AND REMOVE
		bonds.head = new SubscriptionBond('eth', 'getBlockByNumber', ['latest']).subscriptable();
		bonds.author = new SubscriptionBond('eth', 'coinbase');
		bonds.me = new SubscriptionBond('parity', 'defaultAccount');
		bonds.defaultAccount = bonds.me;	// TODO: DEPRECATE
		bonds.accounts = new SubscriptionBond('eth', 'accounts').subscriptable();
		bonds.post = tx => new Transaction(tx, api);
		bonds.sign = (message, from = bonds.me) => new Signature(message, from);

		bonds.balance = x => new TransformBond(x => new SubscriptionBond('eth', 'getBalance', [x]), [x]);
		bonds.code = x => new TransformBond(x => new SubscriptionBond('eth', 'getCode', [x]), [x]);
		bonds.nonce = x => new TransformBond(x => new SubscriptionBond('eth', 'getTransactionCount', [x]), [x]); // TODO: then(_ => +_) Depth 2 if second TransformBond or apply to result
		bonds.storageAt = (x, y) => new TransformBond((x, y) => new SubscriptionBond('eth', 'getStorageAt', [x, y]), [x, y]);

		bonds.syncing = new SubscriptionBond('eth', 'syncing');
		bonds.hashrate = new SubscriptionBond('eth', 'hashrate');
		bonds.authoring = new SubscriptionBond('eth', 'mining');
		bonds.ethProtocolVersion = new SubscriptionBond('eth', 'protocolVersion');
		bonds.gasPrice = new SubscriptionBond('eth', 'gasPrice');
		bonds.estimateGas = x => new TransformBond(x => new SubscriptionBond('eth', 'estimateGas', [x]), [x]);

		bonds.blockTransactionCount = hashOrNumberBond => new TransformBond(
			hashOrNumber => isNumber(hashOrNumber)
				? new TransformBond(_ => +_, [new SubscriptionBond('eth', 'getBlockTransactionCountByNumber', [hashOrNumber])])
				: new TransformBond(_ => +_, [new SubscriptionBond('eth', 'getBlockTransactionCountByHash', [hashOrNumber])]),
			[hashOrNumberBond]);
		bonds.uncleCount = hashOrNumberBond => new TransformBond(
			hashOrNumber => isNumber(hashOrNumber)
				? new TransformBond(_ => +_, [new SubscriptionBond('eth', 'getUncleCountByBlockNumber', [hashOrNumber])])
				: new TransformBond(_ => +_, [new SubscriptionBond('eth', 'getUncleCountByBlockHash', [hashOrNumber])]),
			[hashOrNumberBond]).subscriptable();
		bonds.uncle = (hashOrNumberBond, indexBond) => new TransformBond(
			(hashOrNumber, index) => isNumber(hashOrNumber)
				? new SubscriptionBond('eth', 'getUncleByBlockNumberAndIndex', [hashOrNumber, index])
				: new SubscriptionBond('eth', 'getUncleByBlockHashAndIndex', [hashOrNumber, index]),
			[hashOrNumberBond, indexBond]).subscriptable();

		bonds.transaction = (hashOrNumberBond, indexOrNullBond) => new TransformBond(
			(hashOrNumber, indexOrNull) =>
				indexOrNull === undefined || indexOrNull === null
					? new SubscriptionBond('eth', 'getTransactionByHash', [hashOrNumber])
					: isNumber(hashOrNumber)
						? new SubscriptionBond('eth', 'getTransactionByBlockNumberAndIndex', [hashOrNumber, indexOrNull])
						: new SubscriptionBond('eth', 'getTransactionByBlockHashAndIndex', [hashOrNumber, indexOrNull]),
			[hashOrNumberBond, indexOrNullBond]).subscriptable();
		bonds.receipt = hashBond => new TransformBond(x => new SubscriptionBond('eth', 'getTransactionReceipt', [x]), [hashBond]).subscriptable();

		// web3_
		bonds.clientVersion = new TransformBond(() => api().web3.clientVersion(), [], []);

		// net_
		bonds.peerCount = new TransformBond(_ => +_, [new SubscriptionBond('net', 'peerCount')]);
		bonds.listening = new SubscriptionBond('net', 'listening');
		bonds.chainId = new SubscriptionBond('net', 'version');

		// parity_
		bonds.hashContent = u => new TransformBond(x => api().parity.hashContent(x), [u], [], false);
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
	bonds.replayTx = (x, whatTrace) => new TransformBond((x, whatTrace) => api().trace.replayTransaction(x, whatTrace), [x, whatTrace], []).subscriptable();
	bonds.callTx = (x, whatTrace, blockNumber) => new TransformBond((x, whatTrace, blockNumber) => api().trace.call(x, whatTrace, blockNumber), [x, whatTrace, blockNumber], []).subscriptable();

	function traceCall (addr, method, args, options) {
		let data = util.abiEncode(method.name, method.inputs.map(f => f.type), args);
		let decode = d => util.abiDecode(method.outputs.map(f => f.type), d);
		let traceMode = options.traceMode;
		delete options.traceMode;
		return api().trace.call(overlay({ to: addr, data: data }, options), traceMode, 'latest').then(decode);
	}

	bonds.deployContract = function (init, abi, options = {}) {
		return new DeployContract(init, abi, options, api);
	};

	bonds.makeContract = function (address, abi, extras = [], debug = false) {
		var r = { address: address };
		let unwrapIfOne = a => a.length === 1 ? a[0] : a;
		abi.forEach(i => {
			if (i.type === 'function' && i.constant) {
				let f = function (...args) {
					var options = args.length === i.inputs.length + 1 ? args.pop() : {};
					if (args.length !== i.inputs.length) {
						throw new Error(`Invalid number of arguments to ${i.name}. Expected ${i.inputs.length}, got ${args.length}.`);
					}
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
				if (args.length !== expectedInputs) {
					throw new Error(`Invalid number of arguments to ${i.name}. Expected ${expectedInputs}, got ${args.length}. ${args}`);
				}
				let c = abi.find(j => j.name === i.method);
				let f = (addr, ...fargs) => {
					let args = i.args.map((v, index) => v === null ? fargs[index] : typeof (v) === 'function' ? v(fargs[index]) : v);
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
			if (i.type === 'function' && !i.constant) {
				r[i.name] = function (...args) {
					var options = args.length === i.inputs.length + 1 ? args.pop() : {};
					if (args.length !== i.inputs.length) { throw new Error(`Invalid number of arguments to ${i.name}. Expected ${i.inputs.length}, got ${args.length}. ${args}`); }
					return debug
						? traceCall(address, i, args, options)
						: post(address, i, args, options).subscriptable();
				};
				r[i.name].args = i.inputs;
			}
		});
		var eventLookup = {};
		abi.filter(i => i.type === 'event').forEach(i => {
			eventLookup[util.abiSignature(i.name, i.inputs.map(f => f.type))] = i.name;
		});

		function prepareIndexEncode (v, t, top = true) {
			if (v instanceof Array) {
				if (top) {
					return v.map(x => prepareIndexEncode(x, t, false));
				} else {
					throw new Error('Invalid type');
				}
			}
			var val;
			if (t === 'string' || t === 'bytes') {
				val = util.sha3(v);
			} else {
				val = util.abiEncode(null, [t], [v]);
			}
			if (val.length !== 66) {
				throw new Error('Invalid length');
			}
			return val;
		}

		abi.forEach(i => {
			if (i.type === 'event') {
				r[i.name] = function (indexed = {}, params = {}) {
					return new TransformBond((addr, indexed) => {
						var topics = [util.abiSignature(i.name, i.inputs.map(f => f.type))];
						i.inputs.filter(f => f.indexed).forEach(f => {
							try {
								topics.push(indexed[f.name] ? prepareIndexEncode(indexed[f.name], f.type) : null);
							} catch (e) {
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
								if (f.type.substr(0, 4) === 'uint' && +f.type.substr(4) <= 48) {
									v = +v;
								}
								e[f.name] = v;
							});
							i.inputs.filter(f => f.indexed).forEach((f, j) => {
								if (f.type === 'string' || f.type === 'bytes') {
									e[f.name] = l.topics[1 + j];
								} else {
									var v = util.abiDecode([f.type], l.topics[1 + j])[0];
									if (v instanceof Array) {
										v = util.bytesToHex(v);
									}
									if (f.type.substr(0, 4) === 'uint' && +f.type.substr(4) <= 48) {
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
			caption: b.caption
		})),
		[address, bonds.tokens], [], 2
	).map(all => all.filter(_ => _.balance.gt(0)));

	bonds.namesOf = address => new TransformBond((reg, addr, accs) => ({
		owned: accs[addr] ? accs[addr].name : null,
		registry: reg || null
	}), [bonds.registry.reverse(address), address, bonds.accountsInfo]);

	bonds.registry.names = oo7.Bond.mapAll([bonds.registry.ReverseConfirmed({}, { limit: 100 }), bonds.accountsInfo],
		(reg, info) => {
			let r = {};
			Object.keys(info).forEach(k => r[k] = info[k].name);
			reg.forEach(a => r[a.reverse] = bonds.registry.reverse(a.reverse));
			return r;
		}, 1);

	return bonds;
}

const t = defaultProvider();
const options = t ? { api: new ParityApi(t) } : null;
/** @type {Bonds} */
const bonds = options ? createBonds(options) : null;

const isOwned = addr => oo7.Bond.mapAll([addr, bonds.accounts], (a, as) => as.indexOf(a) !== -1);
const isNotOwned = addr => oo7.Bond.mapAll([addr, bonds.accounts], (a, as) => as.indexOf(a) === -1);

module.exports = {
	// Bonds stuff
	// abiPolyfill,
	options,
	bonds,
	Bonds,
	createBonds,

	// Util functions
	isOwned,
	isNotOwned,
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
	cleanup,

	// ABIs
	abiPolyfill,
	RegistryABI,
	RegistryExtras,
	GitHubHintABI,
	OperationsABI,
	BadgeRegABI,
	TokenRegABI,
	BadgeABI,
	TokenABI
};
