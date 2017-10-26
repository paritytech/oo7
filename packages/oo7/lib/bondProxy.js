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

class BondCacheProxy {
	constructor (deferParentPrefix, fromUuid) {
		// set up listener so that we get notified by our child.
		window.addEventListener('message', this.onMessage.bind(this));

		this.bonds = {};
		this.deferParentPrefix = deferParentPrefix;
		this.fromUuid = fromUuid;
	}

	onMessage (e) {
		if (e.source.parent !== window) {
			console.warn(`Unknown client at ${e.origin} attempting to message proxy with ${e.data}. Ignoring.`);
			return;
		}
		if (typeof e.data === 'object' && e.data !== null) {
			console.log('Received message from child: ', e.data);
			if (e.data.helloBondProxy) {
				e.source.postMessage({ bondProxyInfo: { deferParentPrefix: this.deferParentPrefix } });
			}
			else if (typeof e.data.useBond === 'string') {
				let uuid = e.data.useBond;
				let entry = this.bonds[uuid];
				console.log('>>> useBond ', uuid, entry);
				if (entry) {
					// already here - increase refs.
					if (entry.users.indexOf(e.source) !== -1) {
						console.warn(`Source using UUID ${uuid} more than once.`);
					}
					console.log('Another user');
					entry.users.push(e.source);
				} else {
					// create it.
					let newBond = this.fromUuid(uuid);
					if (newBond) {
						console.log('Creating new bond');
						entry = this.bonds[uuid] = { bond: newBond, users: [e.source] };
						entry.notifyKey = newBond.notify(value =>
							entry.users.forEach(u =>
								u.postMessage({ bondCacheUpdate: { uuid, value } })
							)
						);
					} else {
						console.warn(`UUID ${uuid} is unknown - cannot create a Bond for it.`);
					}
				}
				console.log('Posting update back to child');
				let value = entry.bond.isReady() ? entry._value : undefined;
				e.source.postMessage({ bondCacheUpdate: { uuid, value } });
			}
			else if (typeof e.data.dropBond === 'string') {
				let uuid = e.data.dropBond;
				let entry = this.bonds[uuid];
				console.log('>>> dropBond ', uuid, entry);
				if (entry) {
					let i = entry.users.indexOf(e.source);
					if (i !== -1) {
						console.log('Removing child from updates list');
						entry.users.splice(i, 1);
					} else {
						console.warn(`Source asking to drop UUID ${uuid} that they do not track. They probably weren't getting updates.`);
					}
					if (entry.users.length === 0) {
						console.log('No users - retiring bond');
						entry.bond.unnotify(entry.notifyKey);
						delete this.bonds[uuid];
					}
				} else {
					console.warn(`Cannot drop a Bond (${uuid}) that we do not track.`);
				}
			}
		}
	}
}
