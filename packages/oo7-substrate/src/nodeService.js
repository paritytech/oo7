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
	chain_finalizedHead: {
		notification: 'chain_finalizedHead',
		subscribe: 'chain_subscribeFinalizedHeads',
		unsubscribe: 'chain_unsubscribeFinalizedHeads'
	},
	state_runtimeVersion: {
		notification: 'state_runtimeVersion',
		subscribe: 'state_subscribeRuntimeVersion',
		unsubscribe: 'state_unsubscribeRuntimeVersion'
	}
}

let uri = ['ws://127.0.0.1:9944']

function setNodeUri(u) {
	if (uri === u) return
	uri = u
	if (!s_nodeService) return // prevent instanciating
	s_nodeService.uri = u
	s_nodeService.uriIndex = 0
	s_nodeService.uriChanged = true
	s_nodeService.start()
}

class NodeService {
	constructor (uri) {
		this.subscriptions = {}
		this.cancelations = {}
		this.pendingCancelations = {}
		this.theirIds = {}
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
//			console.log('Incoming:', d);
			if (d.id) {
				that.onReply[d.id](d)
				delete that.onReply[d.id];
			} else if (d.method && d.params && that.subscriptions[d.params.subscription]) {
				that.subscriptions[d.params.subscription].callback(d.params.result, d.method)
			} else if (that.pendingCancelations[d.params.subscription]) {
				// Ok; this message was sent by them before they heard that we wanted to unsubscribe.
			} else {
				console.warn("Subscription reply without recognized ID", d.params.subscription)
			}

			// epect a message every 10 seconds or we reconnect.
			that.reconnect = setTimeout(() => { console.log('Reconnecting.'); that.start() }, 60000)
		}
		this.ws.onerror = (err) => {
			if (that.uriChanged) {
				delete that.uriChanged
				return // no reconnection if uri changed
			}
			setTimeout(() => {
				that.uriIndex = (that.uriIndex + 1) % that.uri.length
				that.start(that.uri[that.uriIndex])
			}, that.backoff)
			that.backoff = Math.min(30000, that.backoff + 1000)
			that.status.trigger({error: err})
		}
	}

	rejig () {
		let that = this
		let subs = this.subscriptions
		this.subscriptions = {}
		let theirIds = this.theirIds
		this.theirIds = {}
		Object.keys(theirIds).forEach(ourId => {
			let sub = subs[theirIds[ourId]]
			that.subscribe(sub.what, sub.params, sub.callback, console.warn, ourId)
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

	subscribe (what, params, callback, errorHandler, ourId = null) {
		let that = this
		return new Promise((resolve, reject) => {
//			console.log('Subscribing', ourId)
			this.req(subscriptionKey[what].subscribe, params, msg => {
				if (msg.error) {
//					console.log('Error subscribing', ourId)
					errorHandler(msg.error)
				} else {
					let theirId = msg.result
//					console.log('Subscribed', 'ourId=', ourId, 'theirId=', theirId)
					if (that.cancelations[ourId]) {
//						console.log('Delayed unsubscription of', ourId)
						that.pendingCancelations[theirId] = ourId
						this.req(subscriptionKey[what].unsubscribe, [theirId], () => {
							delete that.pendingCancelations[theirId]
							delete that.cancelations[ourId]
						}, errorHandler)
					} else {
						that.subscriptions[theirId] = { what, params, callback }
						ourId = ourId || theirId
						that.theirIds[ourId] = theirId
					}
					// We resolve to our ID regardless which should be safe since
					// unsubscribes of old IDs are no-ops.
					resolve(ourId)
				}
			})
		})
	}

	unsubscribe (ourId) {
		let that = this

		if (this.theirIds[ourId] == null) {
//			console.log('Resubscription not yet complete. Defering unsubscribe', ourId)
			this.cancelations[ourId] = true
			return
		}
		let theirId = this.theirIds[ourId]
		if (!this.subscriptions[theirId]) {
			throw 'Invalid subscription id'
		}
		let unsubscribe = subscriptionKey[this.subscriptions[theirId].what].unsubscribe

//		console.log('Unsubscribing', ourId, theirId, this.subscriptions[theirId].what, unsubscribe)
		this.req(unsubscribe, [theirId], () => {
			delete that.theirIds[ourId]
			delete that.subscriptions[theirId]
		})
	}
	
	finalise () {
		delete this.ws;
	}
}

let s_nodeService = null;

function nodeService() {
	if (!s_nodeService) {
		s_nodeService = new NodeService(uri);
	}
	return s_nodeService;
}

module.exports = { nodeService, NodeService, setNodeUri };
