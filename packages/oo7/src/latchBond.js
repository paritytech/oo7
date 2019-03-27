// (C) Copyright 2016-2017 Parity Technologies (UK) Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License")
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

const Bond = require('./bond');

/**
 * Derivative {@link Bond} resolving to a default value when not ready.
 * Once inputBond is ready, its value remains fixed indefinitely.
 */
class LatchBond extends Bond {
	constructor (targetBond, def = undefined, mayBeNull = undefined, cache = null) {
		super(typeof mayBeNull === 'undefined' ? targetBond._mayBeNull : mayBeNull, cache);

		if (typeof (def) !== 'undefined') {
			this._ready = true;
			this._value = def;
		}

		let that = this;
		this._targetBond = targetBond;
		this._poll = () => {
			if (that._targetBond) {
				if (that._targetBond._ready) {
					that.changed(targetBond._value);
					if (that._notifyId) {
						that._targetBond.unnotify(that._notifyId);
						delete that._targetBond;
					}
					delete that._poll;
				}
			} else {
				console.warn("poll called when targetBond is not set. This cannot happen.")
			}
		};
	}

	initialise () {
		if (this._poll) {
			let notifyId = this._targetBond.notify(this._poll);
			// line above might have killed it (if the target is already ready):
			// we should only save it that wasn't the case
			if (this._poll) {
				// It didn't delete it. Carry on.
				this._notifyId = notifyId
				this._poll();
			} else {
				// It did delete it; unnotify immediately.
				this._targetBond.unnotify(notifyId);
				delete this._targetBond;
			}
		}
	}

	finalise () {
		if (this._targetBond) {
			this._targetBond.unnotify(this._notifyId);
		}
	}
}

module.exports = LatchBond;
