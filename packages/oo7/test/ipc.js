/* eslint-disable  no-return-assign */

require('chai').should();

const { Bond, BondCache, BondProxy } = require('../index');

class Setup {
	constructor () {
		let messageQueue = [];
		let parentWindow = { localStorage: {}, messages: [], listeners: { message: [] } };
		parentWindow.addEventListener = (type, f) => {
			if (parentWindow.listeners[type]) {
				parentWindow.listeners[type].push(f);
			}
		};
		let childWindow = { localStorage: {}, parent: parentWindow, messages: [], listeners: { message: [] } };
		childWindow.addEventListener = (type, f) => {
			if (childWindow.listeners[type]) {
				childWindow.listeners[type].push(f);
			}
		};

		parentWindow.postMessage = m => messageQueue.push(
			() => (parentWindow.listeners.message || []).forEach(l =>
				l({source: childWindow, data: m})
			)
		);
		childWindow.postMessage = m => messageQueue.push(
			() => (childWindow.listeners.message || []).forEach(l =>
				l({source: parentWindow, data: m})
			)
		);

		this.messageQueue = messageQueue;
		this.parentWindow = parentWindow;
		this.childWindow = childWindow;
	}

	play () {
		while (this.messageQueue.length > 0) {
			this.messageQueue.splice(0, 1)[0]();
		}
	}
}

describe('BondCache', function () {
	it('should have working scene', () => {
		let scene = new Setup();

		let roundTripsComplete = 0;
		scene.parentWindow.addEventListener('message', m => { if (m.data === 'ping') m.source.postMessage('pong'); });
		scene.parentWindow.addEventListener('message', m => { if (m.data === 'ping') m.source.postMessage('pong'); });
		scene.childWindow.addEventListener('message', m => { if (m.data === 'pong') roundTripsComplete++; });
		scene.childWindow.addEventListener('message', m => { if (m.data === 'pong') roundTripsComplete++; });
		scene.parentWindow.postMessage('ping');
		scene.play();

		roundTripsComplete.should.equal(4);
	});
	it('should work', () => {
		let scene = new Setup();

		let fireBonds = {};
		class FireBond extends Bond {
			constructor (uuid) {
				super(true, uuid);
			}
			initialise () {
				if (typeof fireBonds[this._uuid] === 'undefined') {
					fireBonds[this._uuid] = [];
				}
				fireBonds[this._uuid].push(this);
			}
			finalise () {
				fireBonds[this._uuid].splice(fireBonds[this._uuid].indexOf(this), 1);
				if (fireBonds[this._uuid].length === 0) {
					delete fireBonds[this._uuid];
				}
			}
		}
		FireBond.fire = (uuid, value) => fireBonds[uuid].forEach(b => b.trigger(value));

		let fireInstance = new FireBond('test/fireInstance');
		fireInstance._noCache = true;
		function fromUuid(uuid) {
			if (uuid === 'test/fireInstance') { return fireInstance; }
			return null;
		}

		Object.keys(fireBonds).length.should.equal(0);

		let proxy = new BondProxy('test/', fromUuid, scene.parentWindow);
		let cache = new BondCache(undefined, 'test/', scene.childWindow);
		Bond.cache = cache;
		let childBond = new FireBond('test/fireInstance');

		Object.keys(fireBonds).length.should.equal(0);

		{
			let x = 0;
			let xt = childBond.tie(n => x = n);

			console.log('Scene mQ', scene.messageQueue);
			scene.play();

			console.log('fireBonds', fireBonds);
			fireBonds['test/fireInstance'].length.should.equal(1);
			fireBonds['test/fireInstance'][0].should.equal(fireInstance);

			// Server fires.
			FireBond.fire('test/fireInstance', 69);
			fireInstance._value.should.equal(69);

			console.log('Scene mQ', scene.messageQueue);
			x.should.equal(0);

			scene.play();
			x.should.equal(69);

			childBond.untie(xt);
			fireBonds['test/fireInstance'].length.should.equal(1);

			scene.play();
			Object.keys(fireBonds).length.should.equal(0);
		}
	});
});
