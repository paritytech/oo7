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

const Bond = require('./bond');
const ReactiveBond = require('./reactiveBond');

let defaultContext = typeof (global.parity) === 'undefined' ? null : global.parity.api;

/* Determines whether a `value` is not a {@link Bond} or
 * a {@link Promise}, nor a possibly recursive structure that contains such
 * a thing up to a depth `depthLeft` into it.
 */
function isPlain (value, depthLeft) {
	if (typeof (value) !== 'object' || value === null) {
		return true;
	}

	if (Bond.instanceOf(value)) {
		return false;
	}

	if (value instanceof Promise) {
		return false;
	}

	if (depthLeft > 0 && value.constructor === Array) {
		return value.every(index => isPlain(index, depthLeft - 1));
	}

	if (depthLeft > 0 && value.constructor === Object) {
		return Object.keys(value).every(key =>
			isPlain(value[key], depthLeft - 1)
		);
	}

	return true;
}

/**
 * @summary Configurable {@link Bond}-derivation representing a functional transformation
 * of a number of other items.
 * @description This is the underlying class which powers the {@link Bond#map} and {@link Bond#mapAll}
 * functions; you'll generally want to use those unless there is some particular
 * aspect of this class's configurability that you need.
 *
 * It is constructed with a transform function and a number of args; this
 * {@link Bond} represents the result of the function when applied to those arguemnts'
 * representative values. `Bond`s and `Promises`, are resolved automatically at
 * a configurable depth within complex structures, both as input items and
 * the value resulting from the transform function.
 */
class TransformBond extends ReactiveBond {
	/**
	 * Constructs a new object.
	 *
	 * @param {function} transform - The transformation function. It is called with
	 * values corresponding (in order) to the items of `args`. It may return a
	 * {@link Bond}, {Promise} or plain value resolving to representative values.
	 * @param {array} args - A list of items whose representative values should be
	 * passed to `transform`.
	 * @defaultValue [].
	 * @param {array} dependencies - A list of {@link Bond}s on which `transform` indirectly
	 * depends.
	 * @defaultValue [].
	 * @param {number} outResolveDepth - The depth in any returned structure
	 * that a {@link Bond} may be for it to be resolved.
	 * @defaultValue 0.
	 * @param {number} resolveDepth - The depth in a structure (array or object)
	 * that a {@link Bond} may be in any of `args`'s items for it to be resolved
	 * (in place) to its representative value. Beyond this depth, {@link Bond}s amd
	 * {Promise}s will be left alone.
	 * @defaultValue 1.
	 * @param {number} latched - If `false`, this object becomes _not ready_ as
	 * long as there is an output value waiting for resolution.
	 * @defaultValue `true`
	 * @param {boolean} mayBeNull - If `false`, a resultant value of `null` from
	 * `transform` causes this {@link Bond} to become _not ready_. Optional.
	 * @defaultValue `true`
	 * @param {object} context - The context (i.e. `this` object) that `transform`
	 * is bound to. Optional; defaults to the value set by {@link setDefaultTransformBondContext}.
	 * @defaultValue `null`
	 */
	constructor (
		transform,
		args = [],
		dependencies = [],
		outResolveDepth = 3,
		resolveDepth = 3,
		cache = { id: null, stringify: JSON.stringify, parse: JSON.parse },
		latched = false,
		mayBeNull = true,
		context = defaultContext
	) {
		super(args, dependencies, function (resolvedArguments) {
			//			console.log(`Applying: ${JSON.stringify(args)}`);
			// Cancel any previous result-resolving.
			this.dropOut();

			// Apply transform to the resolved argument values.
			let result = transform.apply(context, resolvedArguments);

			// Assue an undefined result means "reset".
			if (typeof (result) === 'undefined') {
				console.warn(`Transformation returned undefined: Applied ${transform} to ${JSON.stringify(resolvedArguments)}.`);
				this.reset();
			} else if (result instanceof Promise) {
				// If we're not latching, we reset while we resolve the
				// resultant promise.
				if (!latched) {
					this.reset();
				}
				// Then resolve the Promise; by calling `changed`, we recurse
				// as necessary.
				result.then(this.changed.bind(this));
			} else if (!isPlain(result, outResolveDepth)) {
				//				console.log(`Using ReactiveBond to resolve and trigger non-plain result (at depth ${outResolveDepth})`);
				// If we're not latching, we reset while we resolve the
				// resultant Bond(s)/Promise(s).
				if (!latched) {
					this.reset();
				}
				// Then create a new `Bond` which we own to maintain the
				// resultant complex resolvable structure.
				this.useOut(new ReactiveBond([result], [], ([resolvedResult]) => {
					//					console.log(`Resolved results: ${JSON.stringify(v)}. Triggering...`);
					// Call `changed` to recurse as neccessary.
					this.changed.bind(this)(resolvedResult);
				}, false, outResolveDepth));
			} else {
				// Nothing special here - just call changed with the result.
				this.changed(result);
			}
		}, mayBeNull, resolveDepth, cache);

		// the current Bond used to resolve the result (output) value if the
		// result of our transform is itself a Bond.
		this._outBond = null;
	}

	// Register `newOutBond` as our result-resolving bond. Ensures it knows
	// we depend on it via `use`.
	useOut (newOutBond) {
		this._outBond = newOutBond.use();
	}

	// Unregister our current result-resolving bond. Ensures it knows
	// we no longer depend on it via `drop`.
	dropOut () {
		if (this._outBond !== null) {
			this._outBond.drop();
		}
		this._outBond = null;
	}

	// If nobody depends on us (anymore), then drop our result-resolving Bond.
	finalise () {
		this.dropOut();
		ReactiveBond.prototype.finalise.call(this);
	}

	/**
	 * Set the default context under which {@link Bond} transformations run.
	 *
	 * @see {@link Bond#map} {@link Bond#mapAll} {@link TransformBond}
	 */
	static setDefaultContext (c) {
		defaultContext = c;
	}
}

module.exports = TransformBond;
