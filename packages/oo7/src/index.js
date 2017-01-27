var defaultContext = typeof(parity) === 'undefined' ? null : parity.api;

export function setDefaultTransformBondContext(c) {
	defaultContext = c;
}

export class Bond {
	constructor() {
		this.subscribers = [];
		this.thens = [];
	}
	changed(v) {
		if (JSON.stringify(v) != JSON.stringify(this._value)) {
			this.trigger(v);
		}
	}
	trigger(v) {
//		console.log(`firing`);
		if (!this.ready()) {
			this._value = v;
			this.thens.forEach(f => f(v));
			this.thens = null;
		}
		this.subscribers.forEach(f => f(v));
	}
	drop () {}
	subscribe (f) {
		this.subscribers.push(f);
		if (this.ready())
			f(this._value);
	}
	ready () { return typeof(this._value) != 'undefined'; }
	then (f) {
		if (this.ready())
			f(this._value);
		else
			this.thens.push(f);
	}

    map(f) {
        return new TransformBond(f, [this]);
    }
}

/// f is function which returns a promise. a is a set of dependencies
/// which must be passed to f as args. d are dependencies whose values are
/// unneeded. any entries of a which are reactive promises then is it their
/// underlying value which is passed.
///
/// we return a bond (an ongoing promise).
export class TransformBond extends Bond {
	constructor(f, a = [], d = [], context = defaultContext) {
		super();
		this.f = f;
		this.a = a;
		this.context = context;
		d.forEach(i => i.subscribe((() => this.poll()).bind(this)));
		var nd = 0;
		a.forEach(i => {
			if (i instanceof Bond) {
				i.subscribe(this.poll.bind(this));
				nd++;
			}
			if (i instanceof Promise) {
				let f = this.poll.bind(this);
				i.then(v => { i.v = v; f(); });
				nd++;
			}
		});
		if (nd == 0 && d.length == 0)
			this.poll();
	}
	poll () {
		if (this.a.findIndex(i => (i instanceof Bond && !i.ready()) || (i instanceof Promise && typeof(i.v) === 'undefined')) != -1)
			return;	// still have undefined params.
		let r = this.f.apply(this.context, this.a.map(i => (i instanceof Bond || i instanceof Promise) ? i.v : i));
		if (r instanceof Promise)
			r.then(this.changed.bind(this));
		else
			this.changed(r);
	}
	drop () {
		// TODO clear up all our dependency `.subscribe`s.
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
