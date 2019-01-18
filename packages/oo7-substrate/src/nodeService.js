const { Bond } = require('oo7')
const WebSocket = require('isomorphic-ws')

const subscriptionKey = {
	author_submitAndWatchExtrinsic: {
		notification: 'author_extrinsicUpdate',
		subscribe: 'author_submitAndWatchExtrinsic',
		unsubscribe: 'author_unwatchExtrinsic'
	},
	state_storage: {
		notification: 'state_storage',
		subscribe: 'state_subscribeStorage',
		unsubscribe: 'state_unsubscribeStorage'
	},
	chain_newHead: {
		notification: 'chain_newHead',
		subscribe: 'chain_subscribeNewHead',
		unsubscribe: 'chain_unsubscribeNewHead'
	},
	chain_finalisedHead: {
		notification: 'chain_finalisedHead',
		subscribe: 'chain_subscribeFinalisedHeads',
		unsubscribe: 'chain_unsubscribeFinalisedHeads'
	},
	state_runtimeVersion: {
		notification: 'state_runtimeVersion',
		subscribe: 'state_subscribeRuntimeVersion',
		unsubscribe: 'state_unsubscribeRuntimeVersion'
	}
}

let uri = ['ws://127.0.0.1:9944']

function setNodeUri(u) {
	uri = u
	// TODO: reconnect in NodeService and rejig all subscriptions
}

class NodeService {
	constructor (uri) {
		this.subscriptions = {}
		this.cancelations = {}
		this.ids = {}
		this.onReply = {}
		this.onceOpen = []
		this.index = 1
		this.uriIndex = 0
		this.backoff = 0
		this.uri = uri
		this.status = new Bond
		this.start(uri[0])
	}

	start (uri = this.uri[0]) {
		if (this.ws) {
			this.ws.close()
			delete this.ws
		}

		let that = this
		this.ws = new WebSocket(uri)
		this.ws.onopen = function () {
			console.log('Connection open')
			that.rejig()
			that.backoff = 0
			let onceOpen = that.onceOpen;
			that.onceOpen = []
			setTimeout(() => {
//				console.warn("Proceessing deferred requests...")
				onceOpen.forEach(f => f())
			}, 0)
			that.status.trigger({connected: uri})
		}
		this.ws.onmessage = function (msg) {
			if (that.reconnect) {
				clearTimeout(that.reconnect)
			}

			let d = JSON.parse(msg.data)
			if (d.id) {
				that.onReply[d.id](d)
				delete that.onReply[d.id];
			} else if (d.method && d.params && that.subscriptions[d.params.subscription]) {
				that.subscriptions[d.params.subscription].callback(d.params.result, d.method)
			} else {
				console.error("Subscription reply without recognised ID", d, that.subscriptions, ". Unsubscribing again.")
				that.req(unsubscribe, [d.params.subscription], () => {})
			}

			// epect a message every 10 seconds or we reconnect.
			that.reconnect = setTimeout(() => { console.log('Reconnecting.'); that.start() }, 30000)
		}
		this.ws.onerror = e => {
			setTimeout(() => {
				that.uriIndex = (that.uriIndex + 1) % that.uri.length
				that.start(that.uri[that.uriIndex])
			}, that.backoff)
			that.backoff = Math.min(30000, that.backoff + 1000)
			that.status.trigger({error: e})
		}
	}

	rejig () {
		let that = this
		let subs = this.subscriptions
		this.subscriptions = {}
		let ids = this.ids
		this.ids = {}
		Object.keys(ids).forEach(id => {
			let sub = subs[ids[id]]
			that.subscribe(sub.what, sub.params, sub.callback, console.warn, id)
		})
	}

	req (method, params, callback) {
		let that = this
		let doSend = () => {
			let id = '' + this.index++;
//			console.warn("Executing request", method, params, id, callback)
			let msg = {
				"jsonrpc": "2.0",
				"id": id,
				"method": method,
				"params": params
			};
			that.ws.send(JSON.stringify(msg))
	
			that.onReply[id] = callback
		}

		if (this.ws.readyState === 1) {
			doSend(callback)
		} else {
//			console.warn("Defering request until connected", method, params)
			that.onceOpen.push(() => {
				doSend(callback)
			})
		}
	}

	request (method, params = []) {
		let that = this
		return new Promise((resolve, reject) => {
			that.req(method, params, msg => {
//				console.warn("Processing request reply", method, params, msg)
				if (msg.error) {
					reject(msg.error)
				} else {
					resolve(msg.result)
				}
			})
		})
	}

	subscribe (what, params, callback, errorHandler, extId = null) {
		let that = this
		return new Promise((resolve, reject) => {
			this.req(subscriptionKey[what].subscribe, params, msg => {
				if (msg.error) {
					errorHandler(msg.error)
				} else {
					let id = msg.result
					if (that.cancelations[extId]) {
//						console.log('Delayed unsubscription of', extId)
						delete that.cancelations[extId]
						this.req(subscriptionKey[what].unsubscribe, [id], ()=>{}, errorHandler)
						reject()
					} else {
						that.subscriptions[id] = { what, params, callback }
						extId = extId || id
						that.ids[extId] = id
						resolve(extId)
					}
				}
			})
		})
	}

	unsubscribe (extId) {
		let that = this

		if (!this.ids[extId]) {
//			console.log('Resubscription not yet complete. Defering unsubscribe', extId)
			this.cancelations[extId] = true
			return
		}
		let id = this.ids[extId]
		if (!this.subscriptions[id]) {
			throw 'Invalid subscription id'
		}
		delete this.ids[extId]
		let unsubscribe = subscriptionKey[this.subscriptions[id].what].unsubscribe

		this.req(unsubscribe, [id], () => {
			delete that.subscriptions[id]
		})
	}
	
	finalise () {
		delete this.ws;
	}
}

let s_nodeService = null;

function nodeService() {
	if (s_nodeService === null) {
		s_nodeService = new NodeService(uri);
	}
	return s_nodeService;
}

module.exports = { nodeService, NodeService, setNodeUri };