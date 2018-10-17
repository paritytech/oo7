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
		this.onReply = {}
		this.onceOpen = []
		this.index = 1
		this.uriIndex = 0
		this.backoff = 0
		this.uri = uri
		this.start(uri[0])
	}

	start (uri) {
		let that = this
		this.ws = new WebSocket(uri)
		this.ws.onopen = function () {
			console.log('Connection open')
			this.backoff = 0
			let onceOpen = that.onceOpen;
			that.onceOpen = []
			window.setTimeout(() => onceOpen.forEach(f => f()), 0)
		}
		this.ws.onmessage = function (msg) {
			let d = JSON.parse(msg.data)
//			console.log("Message from node", d)
			if (d.id) {
				that.onReply[d.id](d)
				delete that.onReply[d.id];
			} else if (d.method && d.params && that.subscriptions[d.method] && that.subscriptions[d.method][d.params.subscription]) {
				that.subscriptions[d.method][d.params.subscription](d.params.result, d.method)
			}

			if (that.reconnect) {
				window.clearTimeout(that.reconnect)
			}
			// epect a message every 10 seconds or we reconnect.
			if (false) 
				that.reconnect = window.setTimeout(() => {
				that.ws.close()
				delete that.ws
				that.start()
			}, 10000)
		}
		this.ws.onerror = () => {
			window.setTimeout(() => {
				that.uriIndex = (that.uriIndex + 1) % that.uri.length
				that.start(that.uri[that.uriIndex])
			}, that.backoff)
			that.backoff = Math.min(30000, that.backoff + 1000)
		}
	}

	request (method, params = []) {
		let that = this
		let doSend = () => new Promise((resolve, reject) => {
			let id = '' + this.index++;
			let msg = {
				"jsonrpc": "2.0",
				"id": id,
				"method": method,
				"params": params
			};
			that.ws.send(JSON.stringify(msg))
//			console.log('Attempting send', msg)
	
			that.onReply[id] = msg => {
				if (msg.error) {
					reject(msg.error)
				} else {
					resolve(msg.result)
				}
			}
		})

		if (this.ws.readyState == 0) {
			// still connecting
			return new Promise(resolve => {
				that.onceOpen.push(() => {
					let res = doSend()
					resolve(res)
				})
			})
		} else {
			return doSend()
		}
	}

	subscribe (what, params, callback, errorHandler) {
		let that = this
		return this.request(subscriptionKey[what].subscribe, params).then(id => {
			let notification = subscriptionKey[what].notification;
			that.subscriptions[notification] = that.subscriptions[notification] || {}
			that.subscriptions[notification][id] = callback
			return { what, id }
		}).catch(errorHandler)
	}

	unsubscribe ({what, id}) {
		let that = this

		let notification = subscriptionKey[what].notification;
		if (!(this.subscriptions[notification] && this.subscriptions[notification][id])) {
			throw 'Invalid subscription id'
		}
		let unsubscribe = subscriptionKey[what].unsubscribe

		return this.request(unsubscribe, [id]).then(result => {
			delete that.subscriptions[notification][id]
			return result
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