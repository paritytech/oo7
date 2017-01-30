var defaultContext = typeof(parity) === 'undefined' ? null : parity.api;

export function setDefaultTransformBondContext(c) {
	defaultContext = c;
}

export class Bond {
	constructor() {
		this.subscribers = [];
		this.notify = [];
		this.thens = [];
	}

	changed(v) {
//		console.log(`maybe changed (${this._value} -> ${v})`);
		if (JSON.stringify(v) !== JSON.stringify(this._value)) {
			this.trigger(v);
		}
	}
	trigger(v) {
//		console.log(`firing (${v})`);
		this._value = v;
		this.notify.forEach(f => f());
		this.subscribers.forEach(f => f(v));
		if (this.ready()) {
			this.thens.forEach(f => f(v));
			this.thens = [];
		}
	}
	drop () {}
	tie (f) {
		this.notify.push(f);
		if (this.ready()) {
			f();
		}
	}
	subscribe (f) {
		this.subscribers.push(f);
		if (this.ready()) {
			f(this._value);
		}
		return this;
	}
	ready () { return typeof(this._value) !== 'undefined'; }
	then (f) {
		if (this.ready()) {
			f(this._value);
		} else {
			this.thens.push(f);
		}
		return this;
	}

    map(f) {
        return new TransformBond(f, [this]);
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

export class ReactiveBond extends Bond {
	constructor(a, d, execute = args => this.changed(args)) {
		super();

		let poll = () => {
			if (a.findIndex(i => (i instanceof Bond && !i.ready()) || (i instanceof Promise && typeof(i._value) === 'undefined')) != -1) {
	//			console.log("Input undefined");
				this.changed(undefined);
			} else {
				execute.bind(this)(a.map(i => (i instanceof Bond || i instanceof Promise) ? i._value : i));
			}
		};

		d.forEach(i => i.tie(poll));
		var nd = 0;
		a.forEach(i => {
			if (i instanceof Bond) {
				i.tie(poll);
				nd++;
			}
			if (i instanceof Promise) {
				i.then(v => { i._value = v; poll(); });
				nd++;
			}
		});
		if (nd == 0 && d.length == 0)
			poll();
	}
	drop () {
		// TODO clear up all our dependency `notify`s.
	}
}

// Just a one-off.
export class ReactivePromise extends ReactiveBond {
	constructor(a, d, execute = args => this.changed(args)) {
		var done = false;
		super(a, d, args => {
			if (!done) {
				done = true;
				execute.bind(this)(args);
			}
		})
	}
}

/// f is function which returns a promise. a is a set of dependencies
/// which must be passed to f as args. d are dependencies whose values are
/// unneeded. any entries of a which are reactive promises then is it their
/// underlying value which is passed.
///
/// we return a bond (an ongoing promise).
export class TransformBond extends ReactiveBond {
	constructor(f, a = [], d = [], latched = true, context = defaultContext) {
		super(a, d, function (args) {
			let r = f.apply(context, args);
			if (r instanceof Promise) {
				if (!latched) {
					this.changed(undefined);
				}
				r.then(this.changed.bind(this));
			} else {
				this.changed(r);
			}
		});
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
