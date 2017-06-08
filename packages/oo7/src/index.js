var defaultContext = typeof(parity) === 'undefined' ? null : parity.api;

export function setDefaultTransformBondContext(c) {
	defaultContext = c;
}

var subscripted = {};
// Any names which should never be subscripted.
const reservedNames = { toJSON: true, toString: true };

function symbolValues(o) {
	return Object.getOwnPropertySymbols(o).map(k => o[k]);
}

/**
 * @summary An object which tracks a single, potentially variable, value.
 * @description {@link Bond}s may be updated to new values with {@link Bond#change} and reset to an indeterminate
 * ("not ready") value with {@link Bond#reset}.
 *
 * {@link Bond}s track their dependents - aspects of the program, including other {@link Bond}s,
 * which reference their current value. Dependents may be added with {@link Bond#use} and
 * removed with {@link Bond#drop}.
 *
 * A {@link Bond} may be tied to a particular function to ensure it is called whenever
 * the value changes. This implies a dependency, and can be registered with {@link Bond#tie} and
 * dropped with {@link Bond#untie}. A function may also be called should the {@link Bond} be reverted
 * to an undefined value; in this case {@link Bond#notify} and {@link Bond#unnotify} should
 * be used.
 *
 * {@link Bond}s can be made to execute a function once their value becomes ready
 * using {@link Bond#then}, which in some sense replicates the same function in the
 * context of a `Promise`. The similar function {@link Bond#done} is also supplied which
 * executes a given function when the {@link Bond} reaches a value which is considered
 * "final", determined by `Bond#isDone` being implemented and `true`. Precisely
 * what any given {@link Bond} considers final depends entirely on the subclass of
 * {@link Bond}; for the {@link Bond} class itself, `isDone` is left unimplemented and thus
 * `Bond#done` is unusable. The value of the {@link Bond}, once _ready_, may
 * be logged to the console with the {@link Bond#log} function.
 *
 * A {@link Bond} can provide a derivative {@link Bond} whose value reflects the "readiness"
 * of the original, using {@link Bond#ready} and conversely {@link Bond#notReady}. This
 * can also be queried normally with {@link Bond#isReady}.
 *
 * One or a number of {@link Bond}s can be converted into a single `Promise`s with the
 * {@link Bond#promise} function.
 *
 * `Bonds` can be composed. {@link Bond#map} creates a new {@link Bond} whose value is a
 * transformation. {@link Bond#all} creates a new {@link Bond} which evaluates to the array
 * of values of each of a number of dependent {@link Bond}s. {@link Bond#mapAll} combines
 * both. {@link Bond#reduce} allows a {@link Bond} that evaluates to array to be
 * transformed into some other value recursively.
 *
 * {@link Bond#sub} forms a derivative {@link Bond} as the subscript (square-bracket
 * indexing). {@link Bond#subscriptable} may be used to return a `Proxy` object that
 * allows the {@link Bond} to be subscripted (square-bracket indexed) directly without
 * need of the {@link Bond#sub} function.
 *
 * {@link Bond} is built to be subscripted. When subscripting, three functions are
 * useful to implement. {@link Bond#isDone} (`undefined` in {@link Bond}) may be implemented
 * in order to make `Bond#done` be useful. {@link Bond#initialise} is called exactly once
 * when there becomes at least one dependent; {@link Bond#finalise} is called when there
 * are no longer any dependents.
 *
 * _WARNING_: You should not attempt to use the `toString` function with this
 * class. It cannot be meaningfully converted into a string, and to attempt it
 * will give an undefined result.
 */
export class Bond {
	/**
	 * Constructs a new {@link Bond} object whose value is _not ready_.
	 *
	 * @param {boolean} mayBeNull - `true` if this instance's value may ever
	 * validly be `null`. If `false`, then setting this object's value to `null`
	 * is equivalent to reseting back to being _not ready_.
	 */
	constructor(mayBeNull = true) {
		this.subscribers = {};
		this.notifies = {};
		this.thens = [];
		this._ready = false;
		this._value = null;
		this.mayBeNull = mayBeNull;
		this._users = 0;
		this._triggering = false;
//		return this.subscriptable();
	}

	toString () {
//		console.log(`Converting Bond to string: ${JSON.stringify(this)}`)
		let s = Symbol();
		subscripted[s] = this;
		return s;
	}

	mapToString () {
		return this.map(_ => _.toString());
	}

	/**
	 * Provides a transparently subscriptable version of this object.
	 *
	 * The object that is returned from this function is a convenience `Proxy`
	 * which acts exactly equivalent
	 * to the original {@link Bond}, except that any subscripting of fields that are
	 * not members of the {@link Bond} object will create a new {@link Bond} that
	 * itself evaluates to this {@link Bond}'s value when subscripted with the same
	 * field.
	 *
	 * @example
	 * let x = (new Bond).subscriptable();
	 * let y = x.foo;
	 * y.log(); // nothing yet
	 * x.changed({foo: 42, bar: 69});	// logs 42
	 *
	 * @param {number} depth - The maximum number of levels of subscripting that
	 * the returned `Proxy` will support.
	 * @returns {Proxy} - `Proxy` object that acts as a subscriptable variation
	 * for convenience.
	 */
	subscriptable (depth = 1) {
		if (depth === 0)
			return this;
		var r = new Proxy(this, {
		    get (receiver, name) {
//				console.log(`subscriptable.get: ${JSON.stringify(receiver)}, ${JSON.stringify(name)}, ${JSON.stringify(receiver)}: ${typeof(name)}, ${typeof(receiver[name])}`);
				if ((typeof(name) === 'string' || typeof(name) === 'number') && (reservedNames[name] || typeof(receiver[name]) !== 'undefined')) {
					return receiver[name];
				} else if (typeof(name) === 'symbol') {
					if (Bond.knowSymbol(name)) {
						return receiver.sub(Bond.fromSymbol(name)).subscriptable(depth - 1);
					} else {
//						console.warn(`Unknown symbol given`);
						return null;
					}
				} else {
//					console.log(`Subscripting: ${JSON.stringify(name)}`)
					return receiver.sub(name).subscriptable(depth - 1);
				}
		    }
		});
//		r.toString = Bond.prototype.toString.bind(this);
		return r;
	}

	static knowSymbol (name) {
		return !!subscripted[name];
	}
	static fromSymbol (name) {
		let sub = subscripted[name];
		delete subscripted[name];
		return sub;
	}

	/**
	 * Alters this object so that it is always _ready_.
	 *
	 * If this object is ever {@link Bond#reset}, then it will be changed to the
	 * value given.
	 *
	 * @example
	 * let x = (new Bond).defaultTo(42);
	 * x.log();	// 42
	 * x.changed(69);
	 * x.log();	// 69
	 * x.reset();
	 * x.log() // 42
	 *
	 * @param {} x - The value that this object represents if it would otherwise
	 * be _not ready_.
	 * @returns {@link Bond} - This (mutated) object.
	 */
	defaultTo (x) {
		this._defaultTo = x;
		if (!this._ready) {
			this.trigger(x);
		}
		return this;
	}

	/**
	 * Resets the state of this Bond into being _not ready_.
	 *
	 * Any functions that are registered for _notification_ (see {@link Bond#notify})
	 * will be called if this {@link Bond} is currently _ready_.
	 */
	reset () {
		if (this._defaultTo !== undefined) {
			this.trigger(this._defaultTo);
			return;
		}
		if (this._ready) {
			this._ready = false;
			this._value = null;
			symbolValues(this.notifies).forEach(f => f());
		}
	}
	/**
	 * Makes the object _ready_ and sets its current value.
	 *
	 * Any functions that are registered for _notification_ (see {@link Bond#notify})
	 * or are _tied_ (see {@link Bond#tie}) will be called if this {@link Bond} is not
	 * currently _ready_ or is _ready_ but has a different value.
	 *
	 * This function is a no-op if the JSON representations of `v` and of the
	 * current value, if any, are equal.
	 *
	 * @param {} v - The new value that this object should represent. If `undefined`
	 * then the function does nothing.
	 */
	changed (v) {
		if (typeof(v) === 'undefined') {
			return;
		}
//		console.log(`maybe changed (${this._value} -> ${v})`);
		if (!this.mayBeNull && v === null) {
			this.reset();
		} else if (!this._ready || JSON.stringify(v) !== JSON.stringify(this._value)) {
			this.trigger(v);
		}
	}

	/**
	 * Makes the object _ready_ and sets its current value.
	 *
	 * Any functions that are registered for _notification_ (see {@link Bond#notify})
	 * or are _tied_ (see {@link Bond#tie}) will be called if this {@link Bond} is not
	 * currently _ready_ or is _ready_ but has a different value.
	 *
	 * Unlike {@link Bond#changed}, this function doesn't check equivalence
	 * between the new value and the current value.
	 *
	 * @param {} v - The new value that this object should represent. By default,
	 * it will reissue the current value. It is an error to call it without
	 * an argument if it is not _ready_.
	 */
	trigger (v = this._value) {
		if (typeof(v) === 'undefined') {
			console.error(`Trigger called with undefined value`);
			return;
		}
		if (this._triggering) {
			console.error(`Trigger cannot be called while already triggering.`);
			return;
		}
		this._triggering = true;
		if (!this.mayBeNull && v === null) {
			this.reset();
		} else {
//			console.log(`firing (${JSON.stringify(v)})`);
			this._ready = true;
			this._value = v;
			symbolValues(this.notifies).forEach(f => f());
			symbolValues(this.subscribers).forEach(f => f(this._value));
			this.thens.forEach(f => {
				f(this._value);
				this.drop();
			});
			this.thens = [];
		}
		this._triggering = false;
	}

	/**
	 * Register a single dependency for this object.
	 *
	 * Notes that the object's value is in use, and that it should be computed.
	 * {@link Bond} sub-classes are allowed to not work properly unless there is
	 * at least one dependency registered.
	 *
	 * @see {@link Bond#initialise}, {@link Bond#finalise}.
	 */
	use () {
		if (this._users == 0) {
			this.initialise();
		}
		this._users++;
		return this;
	}

	/**
	 * Unregister a single dependency for this object.
	 *
	 * Notes that a previously registered dependency has since expired. Must be
	 * called exactly once for each time {@link Bond#use} was called.
	 */
	drop () {
		if (this._users == 0) {
			throw `mismatched use()/drop(): drop() called once more than expected!`;
		}
		this._users--;
		if (this._users == 0) {
			this.finalise();
		}
	}

	/**
	 * Initialise the object.
	 *
	 * Will be called at most once before an accompanying {@link Bond#finalise}
	 * and should initialise/open/create any resources that are required for the
	 * sub-class to maintain its value.
	 *
	 * @access protected
	 */
	initialise () {}

	/**
	 * Uninitialise the object.
	 *
	 * Will be called at most once after an accompanying {@link Bond#initialise}
	 * and should close/finalise/drop any resources that are required for the
	 * sub-class to maintain its value.
	 *
	 * @access protected
	 */
	finalise () {}

	/**
	 * Returns whether the object is currently in a terminal state.
	 *
	 * _WARNING_: The output of this function should not change outside of a
	 * value change. If it ever changes without the value changing, `trigger`
	 * should be called to force an update.
	 *
	 * @returns {boolean} - `true` when the value should be interpreted as being
	 * in a final state.
	 *
	 * @access protected
	 * @see {@link Bond#done}
	 */
	isDone () { return false; }

	/**
	 * Notification callback.
	 * @callback Bond~notifyCallback
	 */

	/**
	 * Register a function to be called when the value or the _readiness_
	 * changes.
	 *
	 * Calling this function already implies calling {@link Bond#use} - there
	 * is no need to call both.
	 *
	 * Use this only when you need to be notified should the object be reset to
	 * a not _ready_ state. In general you will want to use {@link Bond#tie}
	 * instead.
	 *
	 * @param {Bond~notifyCallback} f - The function to be called. Takes no parameters.
	 * @returns {Symbol} An identifier for this registration. Must be provided
	 * to {@link Bond#unnotify} when the function no longer needs to be called.
	 */
	notify (f) {
		this.use();
		let id = Symbol();
		this.notifies[id] = f;
		if (this._ready) {
			f();
		}
		return id;
	}

	/**
	 * Unregister a function previously registered with {@link Bond#notify}.
	 *
	 * Calling this function already implies calling {@link Bond#drop} - there
	 * is no need to call both.
	 *
	 * @param {Symbol} id - The identifier returned from the corresponding
	 * {@link Bond#notify} call.
	 */
	unnotify (id) {
		delete this.notifies[id];
		this.drop();
	}

	/**
	 * Tie callback.
	 * @callback Bond~tieCallback
	 * @param {} value - The current value to which the object just changed.
	 * @param {Symbol} id - The identifier of the registration for this callback.
	 */

	/**
	 * Register a function to be called when the value changes.
	 *
	 * Calling this function already implies calling {@link Bond#use} - there
	 * is no need to call both.
	 *
	 * Unlike {@link Bond#notify}, this does not get
	 * called should the object become reset into being not _ready_.
	 *
	 * @param {Bond~tieCallback} f - The function to be called.
	 * @returns {Symbol} - An identifier for this registration. Must be provided
	 * to {@link Bond#untie} when the function no longer needs to be called.
	 */
	tie (f) {
		this.use();
		let id = Symbol();
		this.subscribers[id] = f;
		if (this._ready) {
			f(this._value, id);
		}
		return id;
	}

	/**
	 * Unregister a function previously registered with {@link Bond#tie}.
	 *
	 * Calling this function already implies calling {@link Bond#drop} - there
	 * is no need to call both.
	 *
	 * @param {Symbol} id - The identifier returned from the corresponding
	 * {@link Bond#tie} call.
	 */
	untie (id) {
		delete this.subscribers[id];
		this.drop();
	}

	/**
	 * Determine if there is a definite value that this object represents at
	 * present.
	 *
	 * @returns {boolean} - `true` if there is presently a value that this object represents.
	 */
	isReady () { return this._ready; }

	/**
	 * Provide a {@link Bond} which represents whether this object itself represents
	 * a particular value.
	 *
	 * @returns {@link Bond} - Object representing the value returned by
	 * this {@link Bond}'s {@link Bond#isReady} result. The returned object is
	 * itself always _ready_.
	 */
	ready () {
		if (!this._readyBond) {
			this._readyBond = new ReadyBond(this);
		}
		return this._readyBond;
	}

	/**
	 * Convenience function for the logical negation of {@link Bond#ready}.
	 *
	 * @example
	 * // These two expressions are exactly equivalent:
	 * bond.notReady();
	 * bond.ready().map(_ => !_);
	 *
	 * @returns {@link Bond} Object representing the logical opposite
	 * of the value returned by
	 * this {@link Bond}'s {@link Bond#isReady} result. The returned object is
	 * itself always _ready_.
	 */
	notReady () {
		if (!this._notReadyBond) {
			this._notReadyBond = new NotReadyBond(this);
		}
		return this._notReadyBond;
	}

	/**
	 * Then callback.
	 * @callback Bond~thenCallback
	 * @param {} value - The current value to which the object just changed.
	 */

	/**
	 * Register a function to be called when this object becomes _ready_.
	 *
	 * For an object to be considered _ready_, it must represent a definite
	 * value. In this case, {@link Bond#isReady} will return `true`.
	 *
	 * If the object is already _ready_, then `f` will be called immediately. If
	 * not, `f` will be deferred until the object assumes a value. `f` will be
	 * called at most once.
	 *
	 * @param {Bond~thenCallback} f The callback to be made once the object is ready.
	 *
	 * @example
	 * let x = new Bond;
	 * x.then(console.log);
	 * x.changed(42); // 42 is written to the console.
	 */
	then (f) {
		this.use();
		if (this._ready) {
			f(this._value);
			this.drop();
		} else {
			this.thens.push(f);
		}
		return this;
	}

	/**
	 * Register a function to be called when this object becomes _done_.
	 *
	 * For an object to be considered `done`, it must be _ready_ and the
	 * function {@link Bond#isDone} should exist and return `true`.
	 *
	 * If the object is already _done_, then `f` will be called immediately. If
	 * not, `f` will be deferred until the object assumes a value. `f` will be
	 * called at most once.
	 *
	 * @param {Bond~thenCallback} f The callback to be made once the object is ready.
	 *
	 * @example
	 * let x = new Bond;
	 * x.then(console.log);
	 * x.changed(42); // 42 is written to the console.
	 */
	done(f) {
		if (this.isDone === undefined) {
			throw 'Cannot call done() on Bond that has no implementation of isDone.';
		}
		var id;
		let h = s => {
			if (this.isDone(s)) {
				f(s);
				this.untie(id);
			}
		};
		id = this.tie(h);
		return this;
	}

	/**
	 * Logs the current value to the console.
	 *
	 * @returns {@link Bond} The current object.
	 */
	log () { this.then(console.log); return this; }

	/**
	 * Make a new {@link Bond} which is the functional transformation of this object.
	 *
	 * @example
	 * let b = new Bond;
	 * let t = b.map(_ => _ * 2);
	 * t.tie(console.log);
	 * b.changed(21); // logs 42
	 * b.changed(34.5); // logs 69
	 *
	 * @example
	 * let b = new Bond;
	 * let t = b.map(_ => { let r = new Bond; r.changed(_ * 2); return r; });
	 * t.tie(console.log);
	 * b.changed(21); // logs 42
	 * b.changed(34.5); // logs 69
	 *
	 * @example
	 * let b = new Bond;
	 * let t = b.map(_ => { let r = new Bond; r.changed(_ * 2); return [r]; }, 1);
	 * t.tie(console.log);
	 * b.changed(21); // logs [42]
	 * b.changed(34.5); // logs [69]
	 *
	 * @param {function} f - The transformation to apply to the value represented
	 * by this {@link Bond}.
	 * @param {number} outResolveDepth - The number of levels deep in any array
	 * object values of the result of the transformation that {@link Bond} values
	 * will be resolved.
	 * @default 0
	 * @returns {@link Bond} - An object representing this object's value with
	 * the function `f` applied to it.
	 */
    map (f, outResolveDepth = 0) {
        return new TransformBond(f, [this], [], outResolveDepth);
    }

	/**
	 * Create a new {@link Bond} which represents this object's value when
	 * subscripted.
	 *
	 * @example
	 * let b = new Bond;
	 * let t = b.sub('foo');
	 * t.tie(console.log);
	 * b.changed({foo: 42}); // logs 42
	 * b.changed({foo: 69}); // logs 69
	 *
	 * @example
	 * let b = new Bond;
	 * let c = new Bond;
	 * let t = b.sub(c);
	 * t.tie(console.log);
	 * b.changed([42, 4, 2]);
	 * c.changed(0); // logs 42
	 * c.changed(1); // logs 4
	 * b.changed([68, 69, 70]); // logs 69
	 *
	 * @param {} name - The field or index by which to subscript this object's
	 * represented value. May itself be a {@link Bond}, in which case, the
	 * resolved value is used.
	 * @param {number} outResolveDepth - The depth in any returned structure
	 * that a {@link Bond} may be for it to be resolved.
	 * @returns {@link Bond} - The object representing the value which is the
	 * value represented by this object subscripted by the value represented by
	 * `name`.
	 */
	sub (name, outResolveDepth = 0) {
		return new TransformBond((r, n) => r[n], [this, name], [], outResolveDepth, 1);
	}

	/**
	 * Create a new {@link Bond} which represents the array of many objects'
	 * representative values.
	 *
	 * This object will be _ready_ if and only if all objects in `list` are
	 * themselves _ready_.
	 *
	 * @example
	 * let b = new Bond;
	 * let c = new Bond;
	 * let t = Bond.all([b, c]);
	 * t.tie(console.log);
	 * b.changed(42);
	 * c.changed(69); // logs [42, 69]
	 * b.changed(3); // logs [3, 69]
	 *
	 * @example
	 * let b = new Bond;
	 * let c = new Bond;
	 * let t = Bond.all(['a', {b, c}, 'd'], 2);
	 * t.tie(console.log);
	 * b.changed(42);
	 * c.changed(69); // logs ['a', {b: 42, c: 69}, 'd']
	 * b.changed(null); // logs ['a', {b: null, c: 69}, 'd']
	 *
	 * @param {array} list - An array of {@link Bond} objects, plain values or
	 * structures (arrays/objects) which contain either of these.
	 * @param {number} resolveDepth - The depth in a structure (array or object)
	 * that a {@link Bond} may be in any of `list`'s items for it to be resolved.
	 * @returns {@link Bond} - The object representing the value of the array of
	 * each object's representative value in `list`.
	 */
	static all(list, resolveDepth = 1) {
		return new TransformBond((...args) => args, list, [], 0, resolveDepth);
	}

	/**
	 * Create a new {@link Bond} which represents a functional transformation of
	 * many objects' representative values.
	 *
	 * @example
	 * let b = new Bond;
	 * b.changed(23);
	 * let c = new Bond;
	 * c.changed(3);
	 * let multiply = (x, y) => x * y;
	 * // These two are exactly equivalent:
	 * let bc = Bond.all([b, c]).map(([b, c]) => multiply(b, c));
	 * let bc2 = Bond.mapAll([b, c], multiply);
	 *
	 * @param {array} list - An array of {@link Bond} objects or plain values.
	 * @param {function} f - A function which accepts as many parameters are there
	 * values in `list` and transforms it into a {@link Bond}, {@link Promise}
	 * or other value.
	 * @param {number} resolveDepth - The depth in a structure (array or object)
	 * that a {@link Bond} may be in any of `list`'s items for it to be resolved.
	 * @param {number} outResolveDepth - The depth in any returned structure
	 * that a {@link Bond} may be for it to be resolved.
	 */
	static mapAll(list, f, outResolveDepth = 0, resolveDepth = 1) {
		return new TransformBond((...args) => f(...args), list, [], outResolveDepth, resolveDepth);
	}

	// Takes a Bond which evaluates to a = [a[0], a[1], ...]
	// Returns Bond which evaluates to:
	// null iff a.length === 0
	// f(i, a[0])[0] iff f(i, a[0])[1] === true
	// fold(f(0, a[0]), a.mid(1)) otherwise
	/**
	 * Lazily transforms the contents of this object's value when it is an array.
	 *
	 * This operates on a {@link Bond} which should represent an array. It
	 * transforms this into a value based on a number of elements at the
	 * beginning of that array using a recursive _reduce_ algorithm.
	 *
	 * The reduce algorithm works around an accumulator model. It begins with
	 * the `init` value, and incremenetally accumulates
	 * elements from the array by changing its value to one returned from the
	 * `accum` function, when passed the current accumulator and the next value
	 * from the array. The `accum` function may return a {@link Bond}, in which case it
	 * will be resolved (using {@link Bond#then}) and that value used.
	 *
	 * The `accum` function returns a value (or a {@link Bond} which resolves to a value)
	 * of an array with exactly two elements; the first is the new value for the
	 * accumulator. The second is a boolean _early exit_ flag.
	 *
	 * Accumulation will continue until either there are no more elements in the
	 * array to be processed, or until the _early exit_ flag is true, which ever
	 * happens first.
	 *
	 * @param {function} accum - The reduce's accumulator function.
	 * @param {} init - The initialisation value for the reduce algorithm.
	 * @returns {} - A {@link Bond} representing `init` when the input array is empty,
	 * otherwise the reduction of that array.
	 */
	reduce (accum, init) {
		var nextItem = function (acc, rest) {
			let next = rest.pop();
			return Bond.promise([accum(acc, next)]).then(([[v, i]]) => i ? v : rest.length > 0 ? nextItem(v, rest) : null);
		};
		return this.map(a => a.length > 0 ? nextItem(init, a) : init);
	};

	/**
	 * Create a Promise which represents one or more {@link Bond}s.
	 *
	 * @example
	 * let b = new Bond;
 	 * let p = Bond.promise([b, 42])
	 * p.then(console.log);
	 * b.changed(69); // logs [69, 42]
	 * b.changed(42); // nothing.
	 *
	 * @param {array} list - A list of values, {Promise}s or {@link Bond}s.
	 * @returns {Promise} - A object which resolves to an array of values
	 * corresponding to those passed in `list`.
	 */
	static promise(list) {
		return new Promise((resolve, reject) => {
			var finished = 0;
			var l = [];
			l.length = list.length;

			let done = (i, v) => {
//				console.log(`done ${i} ${v}`);
				l[i] = v;
				finished++;
//				console.log(`finished ${finished}; l.length ${l.length}`);
				if (finished === l.length) {
//					console.log(`resolving with ${l}`);
					resolve(l);
				}
			};

			list.forEach((v, i) => {
				if (v instanceof Bond) {
					v.then(x => done(i, x));
				} else if (v instanceof Promise) {
					v.then(x => done(i, x), reject);
				} else {
					done(i, v);
				}
			});
		});
	}
}

class ReadyBond extends Bond {
	constructor(b) {
		super(false);

		this._poll = () => this.changed(b._ready);
		this._b = b;
	}

	initialise () {
		this._id = this._b.notify(this._poll);
		this._poll();
	}
	finalise () {
		this._b.unnotify(this._id);
	}
}

class NotReadyBond extends Bond {
	constructor(b) {
		super(false);

		this._poll = () => this.changed(!b._ready);
		this._b = b;
	}

	initialise () {
		this._id = this._b.notify(this._poll);
		this._poll();
	}
	finalise () {
		this._b.unnotify(this._id);
	}
}

function isReady(x, depthLeft) {
	if (typeof(x) === 'object' && x !== null)
		if (x instanceof Bond)
			return x._ready;
		else if (x instanceof Promise)
		  	return typeof(x._value) !== 'undefined';
		else if (depthLeft > 0 && x.constructor === Array)
			return x.every(i => isReady(i, depthLeft - 1));
		else if (depthLeft > 0 && x.constructor === Object)
			return Object.keys(x).every(k => isReady(x[k], depthLeft - 1));
		else
			return true;
	else
		return true;
}

function isPlain(x, depthLeft) {
	if (typeof(x) === 'object' && x !== null)
		if (x instanceof Bond)
			return false;
		else if (x instanceof Promise)
		  	return false;
		else if (depthLeft > 0 && x.constructor === Array)
			return x.every(i => isPlain(i, depthLeft - 1));
		else if (depthLeft > 0 && x.constructor === Object)
			return Object.keys(x).every(k => isPlain(x[k], depthLeft - 1));
		else
			return true;
	else
		return true;
}

function isArrayWithNonPlainItems(x, depthLeft) {
	return depthLeft > 0 &&
		x.constructor === Array &&
		(
			(depthLeft == 1 && x.findIndex(i => i instanceof Bond || i instanceof Promise) != -1)
		||
			(depthLeft > 1 && x.findIndex(i => i instanceof Bond || i instanceof Promise || i instanceof Array || i instanceof Object) != -1)
		);
}

function isObjectWithNonPlainItems(x, depthLeft) {
	return depthLeft > 0 &&
		x.constructor === Object &&
		(
			(depthLeft == 1 && Object.keys(x).findIndex(i => x[i] instanceof Bond || x[i] instanceof Promise) != -1)
		||
			(depthLeft > 1 && Object.keys(x).findIndex(i => x[i] instanceof Bond || x[i] instanceof Promise || x[i] instanceof Array || x[i] instanceof Object) != -1)
		);
}

function mapped(x, depthLeft) {
	if (!isReady(x, depthLeft)) {
		throw `Internal error: Unready value being mapped`;
	}
//	console.log(`x info: ${x} ${typeof(x)} ${x.constructor.name} ${JSON.stringify(x)}; depthLeft: ${depthLeft}`);
	if (typeof(x) === 'object' && x !== null) {
		if (x instanceof Bond) {
			if (x._ready !== true) {
				throw `Internal error: Unready Bond being mapped`;
			}
			if (typeof(x._value) === 'undefined') {
				throw `Internal error: Ready Bond with undefined value in mapped`;
			}
//			console.log(`Bond: ${JSON.stringify(x._value)}}`);
			return x._value;
		} else if (x instanceof Promise) {
			if (typeof(x._value) === 'undefined') {
				throw `Internal error: Ready Promise has undefined value`;
			}
//			console.log(`Promise: ${JSON.stringify(x._value)}}`);
			return x._value;
		} else if (isArrayWithNonPlainItems(x, depthLeft)) {
//			console.log(`Deep array...`);
			let o = x.slice().map(i => mapped(i, depthLeft - 1));
//			console.log(`...Deep array: ${JSON.stringify(o)}`);
			return o;
		} else if (isObjectWithNonPlainItems(x, depthLeft)) {
			var o = {};
//			console.log(`Deep object...`);
			Object.keys(x).forEach(k => { o[k] = mapped(x[k], depthLeft - 1); });
//			console.log(`...Deep object: ${JSON.stringify(o)}`);
			return o;
		} else {
//			console.log(`Shallow object.`);
			return x;
		}
	} else {
//		console.log(`Basic value.`);
		return x;
	}
}

function deepNotify(x, poll, ids, depthLeft) {
//	console.log(`Setitng up deep notification on object: ${JSON.stringify(x)} - ${typeof(x)}/${x === null}/${x.constructor.name} (depthLeft: ${depthLeft})`);
	if (typeof(x) === 'object' && x !== null) {
		if (x instanceof Bond) {
			ids.push(x.notify(poll));
			return true;
		} else if (x instanceof Promise) {
			x.then(v => { x._value = v; poll(); });
			return true;
		} else if (isArrayWithNonPlainItems(x, depthLeft)) {
			var r = false;
			x.forEach(i => { r = deepNotify(i, poll, ids, depthLeft - 1) || r; });
			return r;
		} else if (isObjectWithNonPlainItems(x, depthLeft)) {
			var r = false;
			Object.keys(x).forEach(k => { r = deepNotify(x[k], poll, ids, depthLeft - 1) || r; });
			return r;
		} else {
			return false;
		}
	} else {
		return false;
	}
}

function deepUnnotify(x, ids, depthLeft) {
	if (typeof(x) === 'object' && x !== null) {
		if (x instanceof Bond) {
			x.unnotify(ids.shift());
			return true;
		} else if (isArrayWithNonPlainItems(x, depthLeft)) {
			var r = false;
			x.forEach(i => { r = deepUnnotify(i, ids, depthLeft - 1) || r; });
			return r;
		} else if (isObjectWithNonPlainItems(x, depthLeft)) {
			var r = false;
			Object.keys(x).forEach(k => { r = deepUnnotify(x[k], ids, depthLeft - 1) || r; });
			return r;
		} else {
			return false;
		}
	} else {
		return false;
	}
}

export class ReactiveBond extends Bond {
	constructor(a, d, execute = args => this.changed(args), mayBeNull = true, resolveDepth = 1) {
		super(mayBeNull);

		this._poll = () => {
//			console.log(`Polling ReactiveBond with resolveDepth ${resolveDepth}`);
			if (a.every(i => isReady(i, resolveDepth))) {
//				console.log(`poll: All dependencies good...`, a, resolveDepth);
				let am = a.map(i => mapped(i, resolveDepth));
//				console.log(`poll: Mapped dependencies:`, am);
				execute.bind(this)(am);
			} else {
//				console.log("poll: One or more dependencies undefined");
				this.reset();
			}
		};
		this._active = false;
		this._d = d.slice();
		this._a = a.slice();
		this.resolveDepth = resolveDepth;
	}

	// TODO: implement isDone.
	initialise () {
//		console.log(`Initialising ReactiveBond for resolveDepth ${this.resolveDepth}`);
		this._ids = [];
		this._d.forEach(_=>this._ids.push(_.notify(this._poll)));
		var nd = 0;
		this._a.forEach(i => { if (deepNotify(i, this._poll, this._ids, this.resolveDepth)) nd++; });
		if (nd == 0 && this._d.length == 0) {
			this._poll();
		}
	}
	finalise () {
//		console.log(`Finalising ReactiveBond with resolveDepth ${this.resolveDepth}`);
		this._d.forEach(_=>_.unnotify(this._ids.shift()));
		this._a.forEach(_=>deepUnnotify(_, this._ids, this.resolveDepth));
	}
}

// Just a one-off.
export class ReactivePromise extends ReactiveBond {
	constructor(a, d, execute = args => this.changed(args), mayBeNull = true, resolveDepth = 1) {
		var done = false;
		super(a, d, args => {
			if (!done) {
				done = true;
				execute.bind(this)(args);
			}
		}, mayBeNull, resolveDepth)
	}
}

/// f is function which returns a promise. a is a set of dependencies
/// which must be passed to f as args. d are dependencies whose values are
/// unneeded. any entries of a which are reactive promises then is it their
/// underlying value which is passed.
///
/// we return a bond (an ongoing promise).
export class TransformBond extends ReactiveBond {
	constructor(f, a = [], d = [], outResolveDepth = 0, resolveDepth = 1, latched = true, mayBeNull = true, context = defaultContext) {
		super(a, d, function (args) {
//			console.log(`Applying: ${JSON.stringify(args)}`);
			this.dropOut();
			let r = f.apply(context, args);
			if (typeof(r) === 'undefined') {
				console.warn(`Transformation returned undefined: Applied ${f} to ${JSON.stringify(args)}.`);
				this.reset();
			} else if (r instanceof Promise) {
				if (!latched) {
					this.reset();
				}
				r.then(this.changed.bind(this));
			} else if (!isPlain(r, outResolveDepth)) {
//				console.log(`Using ReactiveBond to resolve and trigger non-plain result (at depth ${outResolveDepth})`);
				this.useOut(new ReactiveBond([r], [], ([v]) => {
//					console.log(`Resolved results: ${JSON.stringify(v)}. Triggering...`);
					this.changed.bind(this)(v);
				}, false, outResolveDepth));
			} else {
				this.changed(r);
			}
		}, mayBeNull, resolveDepth);
		this._outBond = null;
	}
	useOut (b) {
		this._outBond = b.use();
	}
	dropOut () {
		if (this._outBond !== null) {
			this._outBond.drop();
		}
		this._outBond = null;
	}
	finalise () {
		this.dropOut();
		ReactiveBond.prototype.finalise.call(this);
	}
}

export var testIntervals = {};

export class TimeBond extends Bond {
	constructor() {
		super();
		this.poll();
	}
	poll () {
		this.trigger(Date.now());
	}
	initialise () {
		if (typeof(window) !== 'undefined')
			this.interval = window.setInterval(this.poll.bind(this), 1000);
		else {
			this.interval = Object.keys(testIntervals).length + 1;
			testIntervals[this.interval] = this.poll.bind(this);
		}
	}
	finalise () {
		if (typeof(window) !== 'undefined')
			window.clearInterval(this.interval);
		else {
			if (!testIntervals[this.interval])
				throw `finalise() called multiple time on same timer!`;
			delete testIntervals[this.interval];
		}
	}
}
