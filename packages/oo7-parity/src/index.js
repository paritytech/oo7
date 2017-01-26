import {Bond, TimeBond, TransformBond} from 'oo7';

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

export class Transaction extends Bond {
	constructor(tx) {
		super();
		var p = api.parity.postTransaction(tx)
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
	}
}

export function setupBonds(_api) {
	api = _api;

	var bonds = {};
    bonds.time = new TimeBond;
	bonds.blockNumber = new SubscriptionBond('eth_blockNumber');
	bonds.accountsInfo = new TransformBond(api.parity.accountsInfo, [], [bonds.time]); //new SubscriptionBond('parity_accountsInfo');
    bonds.netChain = new TransformBond(api.parity.netChain, [], [bonds.time]);
    bonds.peerCount = new TransformBond(api.net.peerCount, [], [bonds.time]);

    Function.__proto__.bond = function(...args) { return new TransformBond(this, args); };
    Function.__proto__.timeBond = function(...args) { return new TransformBond(this, args, [parity.bonds.time]); };
    Function.__proto__.blockBond = function(...args) { return new TransformBond(this, args, [parity.bonds.blockNumber]); };

	return bonds;
}
