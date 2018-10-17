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
		consoleDebug('BondCache: Constructing', this.sessionId);

		try {
			this.storage = this.window ? this.window.localStorage : backupStorage;
		} catch (e) {
			this.storage = backupStorage;
		}
	}

	initialise (uuid, bond, stringify, parse) {
		consoleDebug('BondCache.initialise', this.sessionId, uuid, bond, this.regs);
		if (!this.regs[uuid]) {
			consoleDebug('BondCache.initialise: creating...');
			this.regs[uuid] = { owned: false, deferred: false, users: [bond], primary: null, stringify, parse };
			let key = '$_Bonds.' + uuid;
			if (this.storage[key] !== undefined) {
				consoleDebug('BondCache.initialise: restoring from persistent cache');
				bond.changed(parse(this.storage[key]));
			}
			this.ensureActive(uuid);
			consoleDebug('BondCache.initialise: Created reg', this.regs);
		} else if (this.regs[uuid].primary === bond) {
			consoleDebug('BondCache.initialise: Reactivating an inactive primary.');
			if (this.regs[uuid].owned) {
				console.error('BondCache.initialise: initialise called on already-active Bond.');
			}
			this.regs[uuid].owned = true;
		} else {
			consoleDebug('BondCache.initialise: appending to pre-existing entry', JSON.parse(JSON.stringify(this.regs[uuid])));
			if (!this.regs[uuid].primary && !this.regs[uuid].deferred) {
				console.error('BondCache.initialise: Registered Bond that has neither primary nor deferred.');
			}
			this.regs[uuid].users.push(bond);
			let equivBond = (this.regs[uuid].primary || this.regs[uuid].users[0]);
			if (equivBond.isReady()) {
				consoleDebug('BondCache.initialise: restoring from equivalent active');
				bond.changed(equivBond._value);
			}
		}
		if (typeof window !== 'undefined' && window.debugging) {
			this.checkConsistency();
		}
	}

	checkConsistency () {
		Object.keys(this.regs).forEach(uuid => {
			let item = this.regs[uuid];
			if (
				(item.primary === null &&
					!item.deferred &&
					item.users.length > 0 &&
					(this.storage['$_Bonds^' + uuid] === this.sessionId ||
						!this.storage['$_Bonds^' + uuid])
				) || (item.primary === null && item.owned)
			) {
				console.error('BondCache consistency failed!', this.regs);
			}
		});
	}

	changed (uuid, value) {
		consoleDebug('BondCache.changed', this.sessionId, uuid, value, this.regs);
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
		consoleDebug('BondCache.changed: complete', this.regs[uuid]);
	}

	finalise (uuid, bond) {
		consoleDebug('BondCache.finalise', uuid, bond, this.regs);
		let item = this.regs[uuid];
		if (typeof item === 'undefined') {
			console.error(`BondCache.finalise: called for unregistered UUID ${uuid}`, bond);
			return;
		}
		if (item.primary === bond) {
			consoleDebug('BondCache.finalise: We own; finalising Bond');

			// TODO: decide whether to delete directly, or keep around.
			let keepAround = true;

			if (keepAround) {
				item.owned = false;
				// TODO: record the current time as an LRU and place the bond in a map for eventual deletion.
			} else {
				item.primary.finalise();
				item.primary = null;
				if (item.users.length === 0) {
					consoleDebug('BondCache.finalise: No users; deleting entry and unreging from storage.');
					// no owner and no users. we shold be the owner in
					// storage. if we are, remove our key to signify to other
					// tabs we're no longer maintaining this.
					let storageKey = '$_Bonds^' + uuid;
					let owner = this.storage[storageKey];
					if (owner === this.sessionId) {
						delete this.storage[storageKey];
					}
				} else {
					consoleDebug('BondCache.finalise: Still users; ensuring active.');
					// we removed the owner and there are users, must ensure that
					// the bond is maintained.
					this.ensureActive(uuid);
				}
			}
		} else {
			consoleDebug('BondCache.finalise: Not owner. Removing self from users.');
			// otherwise, just remove the exiting bond from the users.
			item.users = item.users.filter(b => b !== bond);

			// If we're the last user from a parent-deferred Bond, then notify
			// parent we're no longer bothered about further updates.
			if (item.users.length === 0 && this.regs[uuid].deferred) {
				consoleDebug('BondCache.finalise: dropping deferral from parent frame', uuid);
				this.window.parent.postMessage({ dropBond: uuid }, '*');
				this.regs[uuid].deferred = false;
			}
		}
		if (item.primary === null && !item.deferred && item.users.length === 0) {
			delete this.regs[uuid];
		}
		if (typeof window !== 'undefined' && window.debugging) {
			this.checkConsistency();
		}
	}

	ensureActive (uuid, key = '$_Bonds^' + uuid) {
		consoleDebug('BondCache.ensureActive', uuid);
		let item = this.regs[uuid];
		if (item && item.users.length > 0 && item.primary && !item.owned) {
			// would-be owners (users). no need for the primary any more.
			consoleDebug('BondCache.ensureActive: Cleaning up orphan primary.');
			item.primary.finalise();
			item.primary = null;
			item.owned = false;
		}
		if (item && item.users.length > 0 && item.primary === null && !item.deferred) {
			consoleDebug('BondCache.ensureActive: Activating...');
			if (item.owned) {
				console.error('BondCache.ensureActive: INCONSISTENT. Cannot have no primary but be owned.');
			}
			if (this.deferParentPrefix && uuid.startsWith(this.deferParentPrefix)) {
				consoleDebug('BondCache.ensureActive: deferring to parent frame', uuid);
				item.deferred = true;
				this.window.parent.postMessage({ useBond: uuid }, '*');
			// One that we use - adopt it if necessary.
			} else {
				consoleDebug('BondCache.ensureActive: One that we use - adopt it if necessary.', this.storage[key], this.sessionId);
				if (!this.storage[key]) {
					consoleDebug('BondCache.ensureActive: No registered owner yet. Adopting');
					this.storage[key] = this.sessionId;
				}
				if (this.storage[key] === this.sessionId) {
					consoleDebug('BondCache.ensureActive: We are responsible for this UUID - initialise');
					item.primary = item.users.pop();
					item.owned = true;
					item.primary.initialise();
				}
			}
		}
	}

	reconstruct (updateMessage, bond) {
		if (updateMessage.valueString) {
			return bond._parse(updateMessage.valueString);
		}
		return updateMessage.value;
	}

	onMessage (e) {
		//		console.log('Received message', e);
		if (this.window && e.source === this.window.parent) {
			// Comes from parent.
			//			console.log('Message is from parent');
			if (typeof e.data === 'object' && e.data !== null) {
				let up = e.data.bondCacheUpdate;
				if (up && this.regs[up.uuid]) {
					consoleDebug('BondCache.onMessage: Bond cache update that we care about:', up.uuid);
					let item = this.regs[up.uuid];
					if (item.users.length > 0) {
						let value = this.reconstruct(up, item.users[0]);
						if (typeof value !== 'undefined') {
							consoleDebug('BondCache.onMessage: Updating bond:', up.uuid, value, item.users);
							item.users.forEach(bond => bond.changed(value));
						} else {
							consoleDebug('BondCache.onMessage: Resetting bond:', up.uuid, item.users);
							item.users.forEach(bond => bond.reset());
						}
					}
				}
			}
		}
	}

	onStorageChanged (e) {
		if (!e.key.startsWith('$_Bonds')) {
			return;
		}
		let uuid = e.key.substr(8);
		let item = this.regs[uuid];
		consoleDebug('BondCache.onStorageChanged', uuid, item);
		if (!item) {
			return;
		}
		if (e.key[7] === '.') {
			// Bond changed...
			if (typeof (this.storage[e.key]) === 'undefined') {
				item.users.forEach(bond => bond.reset());
			} else {
				let v = item.parse(this.storage[e.key]);
				item.users.forEach(bond => bond.changed(v));
			}
		} else if (e.key[7] === '^') {
			// Owner going offline...
			this.ensureActive(uuid, e.key);
		}
	}

	onUnload () {
		consoleDebug('BondCache.onUnload');
		// Like drop for all items, except that we don't care about usage; we
		// drop anyway.
		Object.keys(this.regs).forEach(uuid => {
			if (this.regs[uuid].deferred) {
				consoleDebug('BondCache.onUnload: dropping deferral from parent frame', uuid);
				this.window.parent.postMessage({ dropBond: uuid }, '*');
			} else {
				consoleDebug('BondCache.onUnload: dropping ownership key from storage', uuid);
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
