var should = require('chai').should(),
    oo7 = require('../src/index'),
    Bond = oo7.Bond,
    TimeBond = oo7.TimeBond,
    ReactiveBond = oo7.ReactiveBond,
    ReactivePromise = oo7.ReactivePromise,
    TransformBond = oo7.TransformBond;

describe('Bond', function() {
  it('should be constructable', () => {
      let t = new Bond();
      t.should.be.a('object');
      t.should.have.property('ready');
      t.ready().should.equal(false);
  });
  it('should be triggerable', () => {
      let t = new Bond();
      var x = null;
      var z = null;
      t.then(y => {z = y;});
      t.trigger(69);
      t.then(y => {x = y;});

      t.ready().should.equal(true);
      x.should.equal(69);
      z.should.equal(69);
  });
  it('should be transformable', () => {
      let t = new Bond();
      var x = null;

      let u = new TransformBond(n => n + 1, [t])
      u.then(n => { x = n; });

      // when
      t.trigger(68);

      // then
      x.should.equal(69);
  });
  // Won't work as then gets called async.
/*  it('should work with trivial all', () => {
      let v = 6;

      var x = null;

      let a = Bond.all([v]).then(i => { console.log(`Resolved ${i}. Setting x.`); x = i; });

      sleep(1);
      console.log(`Checking x ${x}...`);
      JSON.stringify(x).should.equal(JSON.stringify([6]));
  })
  it('should work with complex all', () => {
      let t = new Bond();
      var uResolve = null;
      let u = new Promise((resolve, reject)=>{uResolve = resolve;});
      let v = 6;

      var x = null;

      let a = Bond.all([t, u, v]).then(i => x = i);
      JSON.stringify(x).should.equal("null");

      t.trigger(6);
      JSON.stringify(x).should.equal("null");

      uResolve(6);
      JSON.stringify(x).should.equal(JSON.stringify([6, 6, 6]));
  })*/
});

describe('ReactiveBond', function() {
    it('should have this set in execute', () => {
        let t = new Bond();
        class MyBond extends ReactiveBond {
            constructor(d) {
                super([d], [], () => { this.itWorks = true; });
                this.itWorks = false;
            }
        };
        let u = new MyBond(t);

        // when
        t.trigger(69);

        // then
        u.itWorks.should.equal(true);
    });
});

describe('TimeBond', function() {
  it('should be constructable', () => {
      let t = new TimeBond();
      t.should.be.a('object');
      t.should.have.property('then');
  });
});
