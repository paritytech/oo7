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

const Bond = require('./bond')

/**
 * Derivative {@link Bond} resolving to a default value when not ready.
 * Once inputBond is ready, its value remains fixed indefinitely.
 */
class LatchBond extends Bond {
	constructor (targetBond, def = undefined, mayBeNull = undefined, cache = null) {
		super(typeof mayBeNull === 'undefined' ? targetBond._mayBeNull : mayBeNull, cache)

		if (typeof(def) !== 'undefined') {
			this._ready = true
			this._value = def
		}

		let that = this
		this._targetBond = targetBond
		this._poll = () => {
			if (targetBond._ready) {
				that.changed(targetBond._value)
				that._targetBond.unnotify(that._notifyId)
				delete that._poll
				delete that._targetBond
			}
		}
	}

	initialise () {
		if (this._poll) {
			this._notifyId = this._targetBond.notify(this._poll)
			if (this._poll) {
				// line above might have killed it.
				this._poll()
			}
		}
	}

	finalise () {
		if (this._targetBond) {
			this._targetBond.unnotify(this._notifyId)
		}
	}
}

module.exports = LatchBond
