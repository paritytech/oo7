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

/* global setInterval,clearInterval */

const Bond = require('./bond');

var privateTestIntervals = {};

/**
 * @summary {@link Bond} object which represents the current time rounded down
 * to the second.
 *
 * @example
 * let b = new TimeBond;
 * b.log(); // logs 1497080209000
 * setTimeout(() => b.log(), 1000); // logs 1497080210000
 */
class TimeBond extends Bond {
	constructor () {
		super();
		this.poll();
	}
	poll () {
		this.trigger(Math.floor(Date.now() / 1000) * 1000);
	}
	initialise () {
		if (!TimeBond.useTestIntervals) {
			this.interval = setInterval(this.poll.bind(this), 1000);
		} else {
			this.interval = Object.keys(privateTestIntervals).length + 1;
			privateTestIntervals[this.interval] = this.poll.bind(this);
		}
	}
	finalise () {
		if (!TimeBond.useTestIntervals) {
			clearInterval(this.interval);
		} else {
			if (!privateTestIntervals[this.interval]) {
				throw new Error(`finalise() called multiple time on same timer!`);
			}
			delete privateTestIntervals[this.interval];
		}
	}

	static testIntervals () { return privateTestIntervals; }
}

TimeBond.useTestIntervals = false;

module.exports = TimeBond;
