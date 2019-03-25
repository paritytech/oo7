const { Bond } = require('oo7')
const { nodeService } = require('./nodeService')

class SubscriptionBond extends Bond {
	constructor (name, params = [], xform = null, def = undefined, cache = { id: null, stringify: JSON.stringify, parse: JSON.parse }, mayBeNull) {
		super(mayBeNull, cache)
		this._name = name
		this._params = params
		this._xform = xform
		if (typeof def !== 'undefined' && (def !== null || mayBeNull)) {
			this._value = def
			this._ready = true
		}
	}

	initialise () {
		let that = this
		let callback = result => {
			if (that._xform) {
				result = that._xform(result)
			}
			that.trigger(result)
		}
		// promise instead of id because if a dependency triggers finalise() before id's promise is resolved the unsubscribing would call with undefined
		this.subscription = nodeService().subscribe(this._name, this._params, callback, error => {
			that.trigger({failed: error})
			console.warn('Failed subscription:', error)
			delete that.subscription
		})
	}
	
	finalise () {
		let x = this.subscription
		delete this.subscription
		x.then(id => nodeService().unsubscribe(id));
	}
}

module.exports = { SubscriptionBond }