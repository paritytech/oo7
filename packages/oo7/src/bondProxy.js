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

// The parent-side cache-server to which child-side BondCaches can connect.
// Will send messages of the form { bondCacheUpdate: { uuid: '...', value: ... }}
// value, if provided is the actual Bond value, not a stringification of it.
// Will try to send these only for UUIDs that it knows the child is interested
// in - child can register interest with a message { useBond: uuid } and
// unregister interest with { dropBond: uuid }.
//
// If you construct BondCache passing a deferParentPrefix arg, then it's up to
// you to ensure that the parent actually has a BondCacheProxy constructed. If
// it doesn't, things will go screwy.

let consoleDebug = typeof window !== 'undefined' && window.debugging ? console.debug : () => {};

// Prepare value `v` for being sent over `window.postMessage`.
function prepUpdate (uuid, bond) {
	let value = bond.isReady() ? bond._value : undefined;

	if (typeof value === 'object' && value !== null && bond._stringify) {
		return { uuid, valueString: bond._stringify(value) };
	}

	return { uuid, value };
}

class BondProxy {
	constructor (deferParentPrefix, fromUuid, surrogateWindow = null) {
		this.bonds = {};
		this.deferParentPrefix = deferParentPrefix;
		this.fromUuid = fromUuid;
		this.window = surrogateWindow || (typeof window === 'undefined' ? null : window);

		// set up listener so that we get notified by our child.
		this.window.addEventListener('message', this.onMessage.bind(this));
	}

	onMessage (e) {
		if (e.source.parent !== this.window) {
			console.warn(`BondProxy.onMessage: Unknown client at ${e.origin} attempting to message proxy with ${e.data}. Ignoring.`);
			return;
		}
		if (typeof e.data === 'object' && e.data !== null) {
			consoleDebug('BondProxy.onMessage: Received message from child: ', e.data);
			if (e.data.helloBondProxy) {
				e.source.postMessage({ bondProxyInfo: { deferParentPrefix: this.deferParentPrefix } }, '*');
			} else if (typeof e.data.useBond === 'string') {
				let uuid = e.data.useBond;
				let entry = this.bonds[uuid];
				consoleDebug('BondProxy.onMessage: useBond ', uuid, entry);
				if (entry) {
					// already here - increase refs.
					if (entry.users.indexOf(e.source) !== -1) {
						console.warn(`BondProxy.onMessage: Source using UUID ${uuid} more than once.`);
					}
					consoleDebug('BondProxy.onMessage: Another user');
					entry.users.push(e.source);
				} else {
					// create it.
					let newBond = this.fromUuid(uuid);
					if (newBond) {
						consoleDebug('BondProxy.onMessage: Creating new bond');
						entry = this.bonds[uuid] = { bond: newBond, users: [e.source] };
						entry.notifyKey = newBond.notify(() => {
							let bondCacheUpdate = prepUpdate(uuid, newBond);
							consoleDebug('BondProxy.onMessage: Bond changed. Updating child:', bondCacheUpdate);
							entry.users.forEach(u =>
								u.postMessage({ bondCacheUpdate }, '*')
							);
						});
					} else {
						console.warn(`BondProxy.onMessage: UUID ${uuid} is unknown - cannot create a Bond for it.`);
						e.source.postMessage({ bondUnknown: { uuid } }, '*');
						return;
					}
				}
				let bondCacheUpdate = prepUpdate(uuid, entry.bond);
				consoleDebug('BondProxy.onMessage: Posting update back to child', bondCacheUpdate);
				e.source.postMessage({ bondCacheUpdate }, '*');
			} else if (typeof e.data.dropBond === 'string') {
				let uuid = e.data.dropBond;
				let entry = this.bonds[uuid];
				consoleDebug('BondProxy.onMessage: dropBond ', uuid, entry);
				if (entry) {
					let i = entry.users.indexOf(e.source);
					if (i !== -1) {
						consoleDebug('BondProxy.onMessage: Removing child from updates list');
						entry.users.splice(i, 1);
					} else {
						console.warn(`BondProxy.onMessage: Source asking to drop UUID ${uuid} that they do not track. They probably weren't getting updates.`);
					}
					if (entry.users.length === 0) {
						consoleDebug('BondProxy.onMessage: No users - retiring bond');
						entry.bond.unnotify(entry.notifyKey);
						delete this.bonds[uuid];
					}
				} else {
					console.warn(`BondProxy.onMessage: Cannot drop a Bond (${uuid}) that we do not track.`);
				}
			}
		}
	}
}

module.exports = BondProxy;
