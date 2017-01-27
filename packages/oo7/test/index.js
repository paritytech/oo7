var should = require('chai').should(),
    oo7 = require('../src/index'),
    Bond = oo7.Bond,
    TimeBond = oo7.TimeBond,
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
});

describe('TimeBond', function() {
  it('should be constructable', () => {
      let t = new TimeBond();
      t.should.be.a('object');
      t.should.have.property('then');
  });
});
