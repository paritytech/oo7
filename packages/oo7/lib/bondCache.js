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

class BondCache {
	constructor (backupStorage, deferParentPrefix, surrogateWindow = null) {
		this.window = surrogateWindow || (typeof window === 'undefined' ? null : window);
		if (this.window) {
			this.window.addEventListener('storage', this.onStorageChanged.bind(this));
			this.window.addEventListener('unload', this.onUnload.bind(this));
			this.window.addEventListener('message', this.onMessage.bind(this));
		}

		this.deferParentPrefix = this.window && this.window.parent ? deferParentPrefix : null;

		this.regs = {};

		// TODO: would be nice if this were better.
		this.sessionId = Math.floor((1 + Math.random()) * 0x100000000).toString(16).substr(1);
//		console.log('Constructing Cache. ID: ', this.sessionId);

		this.storage = this.window ? this.window.localStorage : backupStorage;
	}

	initialise (uuid, bond, stringify, parse) {
//		console.log('BondCache.initialise', this.sessionId, uuid, bond, this.regs);
		if (!this.regs[uuid]) {
			this.regs[uuid] = { owner: null, deferred: false, users: [bond], stringify, parse };
			let key = '$_Bonds.' + uuid;
			if (this.storage[key] !== undefined) {
				bond.changed(parse(this.storage[key]));
			}
			this.ensureActive(uuid);
//			console.log('Created reg', this.regs);
		} else {
			this.regs[uuid].users.push(bond);
			let equivBond = (this.regs[uuid].owner || this.regs[uuid].users[0]);
			if (equivBond.isReady()) {
				bond.changed(equivBond._value);
			}
		}
	}

	changed (uuid, value) {
//		console.log('Bond changed', this.sessionId, uuid, value, this.regs);
		let item = this.regs[uuid];
		if (item && this.storage['$_Bonds^' + uuid] === this.sessionId) {
			let key = '$_Bonds.' + uuid;
			if (value === undefined) {
				delete this.storage[key];
				item.users.forEach(bond => bond.reset());
			} else {
				this.storage[key] = item.stringify(value);
				item.users.forEach(bond => bond.changed(value));
			}
		}
//		console.log('Bond change complete', this.regs[uuid]);
	}

	finalise (uuid, bond) {
//		console.log('BondCache.finalise', uuid, bond, this.regs);
		let item = this.regs[uuid];
		if (item.owner === bond) {
			item.owner.finalise();
			item.owner = null;
			if (item.users.length === 0) {
				// no owner and no users. we shold be the owner in
				// storage. if we are, remove our key to signify to other
				// tabs we're no longer maintaining this.
				let storageKey = '$_Bonds^' + uuid;
				let owner = this.storage[storageKey];
				if (owner === this.sessionId) {
					delete this.storage[storageKey];
				}
				delete this.regs[uuid];
			} else {
				// we removed the owner and there are users, must ensure that
				// the bond is maintained.
				this.ensureActive(uuid);
			}
		} else {
			// otherwise, just remove the exiting bond from the users.
			item.users = item.users.filter(b => b !== bond);

			// If we're the last user from a parent-deferred Bond, then notify
			// parent we're no longer bothered about further updates.
			if (item.users.length === 0 && this.regs[uuid].deferred) {
				console.log('finalise: dropping deferral from parent frame', uuid);
				this.window.parent.postMessage({ dropBond: uuid });
			}
		}
	}

	ensureActive (uuid, key = '$_Bonds^' + uuid) {
		let item = this.regs[uuid];
		if (item && item.users.length > 0 && item.owner === null && !item.deferred) {
			if (this.deferParentPrefix && uuid.startsWith(this.deferParentPrefix)) {
				console.log('ensureActive: deferring to parent frame', uuid);
				item.deferred = true;
				this.window.parent.postMessage({ useBond: uuid });
			}
			// One that we use - adopt it if necessary.
			else if (!this.storage[key]) {
				this.storage[key] = this.sessionId;
				item.owner = item.users.pop();
				item.owner.initialise();
			}
		}
	}

	onMessage (e) {
//		console.log('Received message', e);
		if (this.window && e.source === this.window.parent) {
			// Comes from parent.
//			console.log('Message is from parent');
			if (typeof e.data === 'object' && e.data !== null) {
				let up = e.data.bondCacheUpdate;
				if (up && this.regs[up.uuid]) {
					console.log('Bond cache update that we care about:', up.uuid);
					let item = this.regs[up.uuid];
					if (typeof up.value !== 'undefined') {
						item.users.forEach(bond => bond.changed(up.value));
					} else {
						item.users.forEach(bond => bond.reset());
					}
				}
			}
		}
	}

	onStorageChanged (e) {
//		console.log('BondCache.onStorageChanged');
		if (!e.key.startsWith('$_Bonds')) {
			return;
		}
		let uuid = e.key.substr(8);
		let item = this.regs[uuid];
		if (!item) {
			return;
		}
		if (e.key[7] === '.') {
			// Bond changed...
			if (typeof(this.storage[e.key]) === 'undefined') {
				item.users.forEach(bond => bond.reset());
			} else {
				let v = item.parse(this.storage[e.key]);
				item.users.forEach(bond => bond.changed(v));
			}
		}
		else if (e.key[7] === '^') {
			// Owner going offline...
			this.ensureActive(uuid, e.key);
		}
	}

	onUnload () {
//		console.log('BondCache.onUnload');
		// Like drop for all items, except that we don't care about usage; we
		// drop anyway.
		Object.keys(this.regs).forEach(uuid => {
			if (this.regs[uuid].deferred) {
				console.log('onUnload: dropping deferral from parent frame', uuid);
				this.window.parent.postMessage({ dropBond: uuid });
			} else {
				let storageKey = '$_Bonds^' + uuid;
				let owner = this.storage[storageKey];
				if (owner === this.sessionId) {
					delete this.storage[storageKey];
				}
			}
		});
		this.regs = {};
	}
}

module.exports = BondCache;
