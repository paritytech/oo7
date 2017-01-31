var defaultContext = typeof(parity) === 'undefined' ? null : parity.api;

export function setDefaultTransformBondContext(c) {
	defaultContext = c;
}

var subscripted = {};

export class Bond {
	constructor(mayBeNull = false) {
		this.subscribers = [];
		this.notify = [];
		this.thens = [];
		this._ready = false;
		this._value = null;
		this.mayBeNull = mayBeNull;
//		return this.subscriptable();
	}

	toString () {
		let s = Symbol();
		subscripted[s] = this;
		return s;
	}

	subscriptable () {
		var r = new Proxy(this, {
		    get (receiver, name) {
//				console.log(`subscriptable.get: ${JSON.stringify(receiver)}, ${JSON.stringify(name)}, ${JSON.stringify(receiver)}: ${typeof(name)}, ${typeof(receiver[name])}`);
				if ((typeof(name) === 'string' || typeof(name) === 'number') && typeof(receiver[name]) !== 'undefined') {
					return receiver[name];
				} else if (typeof(name) === 'symbol' && subscripted[name]) {
					let sub = subscripted[name];
					delete subscripted[name];
					return new TransformBond((r, n) => r[n], [receiver, sub]);
				} else {
					return new TransformBond((r, n) => r[n], [receiver, name]);
				}
		    }
		});
		return r;
	}

	reset () {
		if (this._ready) {
			this._ready = false;
			this._value = null;
			this.notify.forEach(f => f());
		}
	}
	changed (v) {
		if (typeof(v) === 'undefined') {
			console.error(`Trigger called with undefined value`);
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
		if (!this.mayBeNull && v === null) {
			this.reset();
		} else {
//			console.log(`firing (${JSON.stringify(v)})`);
			this._ready = true;
			this._value = v;
			this.notify.forEach(f => f());
			this.subscribers.forEach(f => f(this._value));
			this.thens.forEach(f => f(this._value));
			this.thens = [];
		}
	}
	drop () {}
	tie (f) {
		this.notify.push(f);
		if (this._ready) {
			f();
		}
	}
	subscribe (f) {
		this.subscribers.push(f);
		if (this._ready) {
			f(this._value);
		}
		return this;
	}
	ready () { return this._ready; }
	then (f) {
		if (this._ready) {
			f(this._value);
		} else {
			this.thens.push(f);
		}
		return this;
	}

    map (f) {
        return new TransformBond(f, [this]);
    }
	sub (name) {
		return new TransformBond((r, n) => r[n], [this, name]);
	}

	static all(list) {
		return new TransformBond((...args) => args, list);
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

function isReady(x, deep = true) {
	let r = (() => {
	if (typeof(x) === 'object' && x !== null)
		if (x instanceof Bond)
			return x._ready;
		else if (x instanceof Promise)
		  	return typeof(x._value) !== 'undefined';
		else if (deep && x.constructor === Array)
			return x.findIndex(i => !isReady(i, false)) === -1;
		else if (deep && x.constructor === Object)
			return Object.keys(x).findIndex(k => !isReady(x[k], false)) === -1;
		else
			return true;
	else
		return true;
	})();
//	console.log(`isReady(${JSON.stringify(x)}) => ${r}`);
	return r;
}

function mapped(x, deep = true) {
//	console.log(`x: ${x} ${typeof(x)} ${x.constructor.name} ${JSON.stringify(x)}`);
	if (typeof(x) === 'object' && x !== null) {
		if (x instanceof Bond || x instanceof Promise) {
//			console.log(`Bond/Promise: ${JSON.stringify(x._value)}`);
			return x._value;
		} else if (deep && x.constructor === Array && x.findIndex(i => i instanceof Bond || i instanceof Promise) != -1) {
			let o = x.slice().map(i => mapped(i, false));
//			console.log(`Deep array: ${JSON.stringify(o)}`);
			return o;
		} else if (deep && x.constructor === Object && Object.keys(x).findIndex(i => x[i] instanceof Bond || x[i] instanceof Promise) != -1) {
			var o = {};
			Object.keys(x).forEach(k => { o[k] = mapped(x[k], false); });
//			console.log(`Deep object: ${JSON.stringify(o)}`);
			return o;
		} else {
//			console.log(`Shallow object: ${JSON.stringify(x._value)}`);
			return x;
		}
	} else {
//		console.log(`Basic value: ${JSON.stringify(x)}`);
		return x;
	}
}

function deepTie(x, poll, deep = true) {
	if (typeof(x) === 'object' && x !== null) {
		if (x instanceof Bond) {
			x.tie(poll);
			return true;
		} else if (x instanceof Promise) {
			x.then(v => { x._value = v; poll(); });
			return true;
		} else if (deep && x.constructor === Array && x.findIndex(i => i instanceof Bond || i instanceof Promise) != -1) {
			var r = false;
			x.forEach(i => { r = deepTie(i, poll, false) || r; });
			return r;
		} else if (deep && x.constructor === Object && Object.keys(x).findIndex(i => x[i] instanceof Bond || x[i] instanceof Promise) != -1) {
			var r = false;
			Object.keys(x).forEach(k => { r = deepTie(x[k], poll, false) || r; });
			return r;
		} else {
			return false;
		}
	} else {
		return false;
	}
}

export class ReactiveBond extends Bond {
	constructor(a, d, execute = args => this.changed(args), mayBeNull = false) {
		super(mayBeNull);

		let poll = () => {
			if (a.findIndex(i => !isReady(i)) !== -1) {
//				console.log("poll: One or more dependencies undefined");
				this.reset();
			} else {
//				console.log(`poll: All dependencies good: ${JSON.stringify(a.map(mapped))}`);
				execute.bind(this)(a.map(mapped));
			}
		};

		d.forEach(i => i.tie(poll));
		var nd = 0;
		a.forEach(i => { if (deepTie(i, poll)) nd++; });
		if (nd == 0 && d.length == 0) {
			poll();
		}
	}
	drop () {
		// TODO clear up all our dependency `notify`s.
	}
}

// Just a one-off.
export class ReactivePromise extends ReactiveBond {
	constructor(a, d, execute = args => this.changed(args), mayBeNull = false) {
		var done = false;
		super(a, d, args => {
			if (!done) {
				done = true;
				execute.bind(this)(args);
			}
		}, mayBeNull)
	}
}

/// f is function which returns a promise. a is a set of dependencies
/// which must be passed to f as args. d are dependencies whose values are
/// unneeded. any entries of a which are reactive promises then is it their
/// underlying value which is passed.
///
/// we return a bond (an ongoing promise).
export class TransformBond extends ReactiveBond {
	constructor(f, a = [], d = [], latched = true, mayBeNull = false, context = defaultContext) {
		super(a, d, function (args) {
//			console.log(`Applying: ${JSON.stringify(args)}`);
			let r = f.apply(context, args);
			if (r instanceof Promise) {
				if (!latched) {
					this.reset();
				}
				r.then(this.changed.bind(this));
			} else {
				this.changed(r);
			}
		}, mayBeNull);
	}
}

export class TimeBond extends Bond {
	constructor() {
		super();
		let t = function() { this.trigger(Date.now()); }.bind(this);
		if (typeof(window) !== 'undefined')
			this.interval = window.setInterval(t, 1000);
		t();
	}
	drop () {
		if (typeof(window) !== 'undefined')
			window.clearInterval(this.interval);
	}
}
