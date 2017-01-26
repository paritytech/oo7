'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Bond = exports.Bond = function () {
	function Bond() {
		_classCallCheck(this, Bond);

		this.fire = [];
	}

	_createClass(Bond, [{
		key: 'changed',
		value: function changed(v) {
			if (JSON.stringify(this.v) != JSON.stringify(v)) {
				// Horrible - would be nice to less flakey way of determining difference.
				//			console.log(`changing from ${this.v} => ${v}`);
				this.trigger(v);
			}
		}
	}, {
		key: 'trigger',
		value: function trigger(v) {
			//		console.log(`firing`);
			this.v = v;
			this.fire.forEach(function (f) {
				return f(v);
			});
		}
	}, {
		key: 'drop',
		value: function drop() {}
	}, {
		key: 'subscribe',
		value: function subscribe(f) {
			this.fire.push(f);if (this.ready()) f(this.v);
		}
	}, {
		key: 'ready',
		value: function ready() {
			return typeof this.v != 'undefined';
		}
	}, {
		key: 'map',
		value: function map(f) {
			return new TransformBond(f, [this]);
		}
	}]);

	return Bond;
}();

/// f is function which returns a promise. a is a set of dependencies
/// which must be passed to f as args. d are dependencies whose values are
/// unneeded. any entries of a which are reactive promises then is it their
/// underlying value which is passed.
///
/// we return a bond (an ongoing promise).


var TransformBond = exports.TransformBond = function (_Bond) {
	_inherits(TransformBond, _Bond);

	function TransformBond(f) {
		var a = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
		var d = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
		var context = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : parity.api;

		_classCallCheck(this, TransformBond);

		var _this = _possibleConstructorReturn(this, (TransformBond.__proto__ || Object.getPrototypeOf(TransformBond)).call(this));

		_this.f = f;
		_this.a = a;
		_this.context = context;
		d.forEach(function (i) {
			return i.subscribe(function () {
				return _this.poll();
			}.bind(_this));
		});
		var nd = 0;
		a.forEach(function (i) {
			if (i instanceof Bond) {
				i.subscribe(_this.poll.bind(_this));
				nd++;
			}
			if (i instanceof Promise) {
				(function () {
					var f = _this.poll.bind(_this);
					i.then(function (v) {
						i.v = v;f();
					});
					nd++;
				})();
			}
		});
		if (nd == 0 && d.length == 0) _this.poll();
		return _this;
	}

	_createClass(TransformBond, [{
		key: 'poll',
		value: function poll() {
			if (this.a.findIndex(function (i) {
				return i instanceof Bond && !i.ready() || i instanceof Promise && typeof i.v === 'undefined';
			}) != -1) return; // still have undefined params.
			var r = this.f.apply(this.context, this.a.map(function (i) {
				return i instanceof Bond || i instanceof Promise ? i.v : i;
			}));
			if (r instanceof Promise) r.then(this.changed.bind(this));else this.changed(r);
		}
	}, {
		key: 'drop',
		value: function drop() {
			// TODO clear up all our dependency `.subscribe`s.
		}
	}]);

	return TransformBond;
}(Bond);

var TimeBond = exports.TimeBond = function (_Bond2) {
	_inherits(TimeBond, _Bond2);

	function TimeBond() {
		_classCallCheck(this, TimeBond);

		var _this2 = _possibleConstructorReturn(this, (TimeBond.__proto__ || Object.getPrototypeOf(TimeBond)).call(this));

		_this2.interval = window.setInterval(_this2.trigger.bind(_this2), 1000);
		_this2.trigger();
		return _this2;
	}

	_createClass(TimeBond, [{
		key: 'trigger',
		value: function trigger() {
			this.fire.forEach(function (f) {
				return f(Date.now());
			});
		}
	}, {
		key: 'drop',
		value: function drop() {
			window.clearInterval(this.interval);
		}
	}]);

	return TimeBond;
}(Bond);