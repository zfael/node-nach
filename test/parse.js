var chai = require('chai')
  , _ = require('lodash')
  , expect = chai.expect
  , File = require('../lib/file');

describe('Parse', function() {
  describe('Validate', function() {
    it('should parse successfully', function(done) {
      File.parseFile(__dirname + '/nach-valid.txt', function(err, file) {
        if (err) throw err;
        expect(file).not.equal(null);
        expect(file).not.equal(undefined);
        done()
      })
    });

    it('should parse Addenda successfully', function(done) {
      File.parseFile(__dirname + '/nach-valid-addenda.txt', function(err, file) {
        if (err) throw err;
        expect(file).not.equal(null);
        expect(file).not.equal(undefined);
        file.getBatches().forEach(batch => {
          batch.getEntries().forEach(entry => {
            entry.getAddendas().forEach(addenda => {
              expect(addenda.getReturnCode()).equal('R14')
            })
          })
        })
        expect(file).not.equal(undefined);
        done()
      })
    });

    it('should parse Addenda successfully with promise', function(done) {
      File
        .parseFile(__dirname + '/nach-valid-addenda.txt')
        .then(file => {
          expect(file).not.equal(null);
          expect(file).not.equal(undefined);
          done()
        })
        .catch(err => {
          throw err;
        });
    });
  });
});
