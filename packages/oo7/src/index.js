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

export class Bond {
	constructor(mayBeNull = false) {
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

	reset () {
		if (this._ready) {
			this._ready = false;
			this._value = null;
			symbolValues(this.notifies).forEach(f => f());
		}
	}
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
	trigger (v) {
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
	// If you use this, you are responsible for calling drop exactly once
	// at some point later. Some Bonds won't work properly unless you call
	// this.
	use () {
		if (this._users == 0) {
			this.initialise();
		}
		this._users++;
		return this;
	}
	// To be called exactly once for each time you call pick. The object won't
	// work properly after calling this.
	drop () {
		if (this._users == 0) {
			throw `mismatched use()/drop(): drop() called once more than expected!`;
		}
		this._users--;
		if (this._users == 0) {
			this.finalise();
		}
	}

	// Will be called at most once. Object must work properly after this.
	initialise () {}
	// Will be called at most once. Object must clean up after this.
	finalise () {}

	// must call unnotify exactly once when finished with it.
	notify (f) {
		this.use();
		let id = Symbol();
		this.notifies[id] = f;
		if (this._ready) {
			f();
		}
		return id;
	}
	unnotify (id) {
		delete this.notifies[id];
		this.drop();
	}

	// must call untie exactly once when finished with it.
	tie (f) {
		this.use();
		let id = Symbol();
		this.subscribers[id] = f;
		if (this._ready) {
			f(this._value);
		}
		return id;
	}
	untie (id) {
		delete this.subscribers[id];
		this.drop();
	}

	subscribe (f) {
		console.warn(`Bond.subscribe is deprecated. Use Bond.tie instead.`);
		return this.tie(f);
	}
	ready () { return this._ready; }
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

    map (f, outResolveDepth = 0, resolveDepth = 1) {
        return new TransformBond(f, [this], [], outResolveDepth, resolveDepth);
    }
	sub (name, outResolveDepth = 0, resolveDepth = 1) {
		return new TransformBond((r, n) => r[n], [this, name], [], outResolveDepth, resolveDepth);
	}

	// Takes a Bond which evaluates to a = [a[0], a[1], ...]
	// Returns Bond which evaluates to:
	// null iff a.length === 0
	// f(i, a[0])[0] iff f(i, a[0])[1] === true
	// fold(f(0, a[0]), a.mid(1)) otherwise
	reduce (accum, init) {
		var nextItem = function (acc, rest) {
			let next = rest.pop();
			return Bond.promise([accum(acc, next)]).then(([[v, i]]) => i ? v : rest.length > 0 ? nextItem(v, rest) : null);
		};
		return this.map(a => nextItem(init, a));
	};

	static all(list) {
		return new TransformBond((...args) => args, list);
	}

	static mapAll(list, f, outResolveDepth = 0, resolveDepth = 1) {
		return new TransformBond((...args) => f(...args), list, [], outResolveDepth, resolveDepth);
	}

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
	constructor(a, d, execute = args => this.changed(args), mayBeNull = false, resolveDepth = 1) {
		super(mayBeNull);

		this._poll = () => {
//			console.log(`Polling ReactiveBond with resolveDepth ${resolveDepth}`);
			if (a.every(i => isReady(i, resolveDepth))) {
//				console.log(`poll: All dependencies good...`);
				let am = a.map(i => mapped(i, resolveDepth));
//				console.log(`poll: Mapped dependencies: ${JSON.stringify(am)}`);
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
	constructor(a, d, execute = args => this.changed(args), mayBeNull = false, resolveDepth = 1) {
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
