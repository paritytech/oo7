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
  it('should have subscripts which fall back properly', () => {
      let t = new Bond().subscriptable();

      var x = 0;
      t.subscribe(a => { x = a; });

      x.should.equal(0);

      // when
      t.trigger(42);

      // then
      x.should.equal(42);
  });
  it('should have subscripts which work with normals', () => {
      let t = new Bond().subscriptable();

      var x = 0;
      t[2].subscribe(a => { x = a; });

      x.should.equal(0);

      // when
      t.trigger([0, 0, 42, 0]);

      // then
      x.should.equal(42);
  });
  it('should have subscripts which work with bonds', () => {
      let t = new Bond().subscriptable();
      let u = new Bond();

      var x = 0;
      t.sub(u).subscribe(a => { x = a; });

      x.should.equal(0);

      // when
      t.trigger([0, 0, 42, 0]);

      // then
      x.should.equal(0);

      // when
      u.trigger(2);

      // then
      x.should.equal(42);
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

describe('TransformBond', function() {
    it('should react to in-object dependencies', () => {
        var x = 0;
        let t = new Bond;
        let u = new Bond;
        let v = new Bond;
        let w = new Bond;
        let b = new TransformBond((a, b, c) => {
            x = a + b.n + c[0];
            return true;
        }, [t, {n: u, m: {w}}, [v]]);

        b.ready().should.equal(false);
        x.should.equal(0);

        t.trigger(60);
        b.ready().should.equal(false);
        x.should.equal(0);

        u.trigger(6);
        b.ready().should.equal(false);
        x.should.equal(0);

        v.trigger(3);
        b.ready().should.equal(true);
        x.should.equal(69);
    });
})

describe('TimeBond', function() {
  it('should be constructable', () => {
      let t = new TimeBond();
      t.should.be.a('object');
      t.should.have.property('then');
  });
});
