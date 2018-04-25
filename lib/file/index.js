// File

var fs = require('fs');
var _ = require('lodash');
var async = require('async');
var utils = require('../utils');
var validate = require('../validate');
var highLevelOverrides = ['immediateDestination', 'immediateOrigin', 'fileCreationDate', 'fileCreationTime', 'fileIdModifier', 'immediateDestinationName', 'immediateOriginName', 'referenceCode'];
var Batch = require('../batch');
var Entry = require('../entry');
var Addenda = require('../entry-addenda');

var fileHeader = require('./header');
var fileControl = require('./control');

var batchHeader = require('./../batch/header');
var batchControl = require('./../batch/control');

var entryFields = require('./../entry/fields');
var addendaFields = require('./../entry-addenda/fields');

function File(options, autoValidate) {
  this._batches = [];

  // Allow the batch header/control defaults to be overriden if provided
  this.header = options.header ? _.merge(options.header, fileHeader(), _.defaults) : fileHeader();
  this.control = options.control ? _.merge(options.header, fileControl, _.defaults) : _.cloneDeep(fileControl);

  // Configure high-level overrides (these override the low-level settings if provided)
  utils.overrideLowLevel(highLevelOverrides, options, this);

  // This is done to make sure we have a 9-digit routing number
  if (options.immediateDestination) {
    this.header.immediateDestination.value = utils.computeCheckDigit(options.immediateDestination);
  }

  this._batchSequenceNumber = Number(options.batchSequenceNumber) || 0

  if (autoValidate !== false) {
    // Validate all values
    this._validate();
  }

  return this;
};

File.prototype.get = function(field) {

  // If the header has the field, return the value
  if (this.header[field]) {
    return this.header[field]['value'];
  }

  // If the control has the field, return the value
  if (this.control[field]) {
    return this.control[field]['value'];
  }
};

File.prototype.set = function(field, value) {

  // If the header has the field, set the value
  if (this.header[field]) {
    this.header[field]['value'] = value;
  }

  // If the control has the field, set the value
  if (this.control[field]) {
    this.control[field]['value'] = value;
  }
};

File.prototype._validate = function() {

  // Validate header field lengths
  validate.validateLengths(this.header);

  // Validate header data types
  validate.validateDataTypes(this.header);

  // Validate control field lengths
  validate.validateLengths(this.control);

  // Validate header data types
  validate.validateDataTypes(this.control);
};

File.prototype.addBatch = function(batch) {

  // Set the batch number on the header and control records
  batch.header.batchNumber.value = this._batchSequenceNumber
  batch.control.batchNumber.value = this._batchSequenceNumber

  // Increment the batchSequenceNumber
  ++this._batchSequenceNumber

  this._batches.push(batch);
};

File.prototype.generatePaddedRows = function(rows, cb) {
  var paddedRows = '';

  for (var i = 0; i < rows; i++) {
    paddedRows += utils.newLineChar() + utils.pad('', 94, '9');
  }

  // Return control flow back by calling the callback function
  cb(paddedRows);
}

File.prototype.generateBatches = function(done1) {
  var self = this;

  var result = '';
  var rows = 2;

  var entryHash = 0;
  var addendaCount = 0;

  var totalDebit = 0;
  var totalCredit = 0;

  async.each(this._batches, function(batch, done2) {
    totalDebit += batch.control.totalDebit.value;
    totalCredit += batch.control.totalCredit.value;

    async.each(batch._entries, function(entry, done3) {
      entry.fields.traceNumber.value = (entry.fields.traceNumber.value) ? entry.fields.traceNumber.value : self.header.immediateOrigin.value.slice(0, 8) + utils.pad(addendaCount, 7, false, '0');
      entryHash += Number(entry.fields.receivingDFI.value);

      // Increment the addenda and block count
      addendaCount++;
      rows++;

      done3();
    }, function(err) {

      // Only iterate and generate the batch if there is at least one entry in the batch
      if (batch._entries.length > 0) {

        // Increment the addendaCount of the batch
        self.control.batchCount.value++;

        // Bump the number of rows only for batches with at least one entry
        rows = rows + 2;

        // Generate the batch after we've added the trace numbers
        batch.generateString(function(batchString) {
          result += batchString + utils.newLineChar();
          done2();
        });
      } else {
        done2();
      }
    });
  }, function(err) {
    self.control.totalDebit.value = totalDebit;
    self.control.totalCredit.value = totalCredit;

    self.control.addendaCount.value = addendaCount;
    self.control.blockCount.value = utils.getNextMultiple(rows, 10) / 10;

    // Slice the 10 rightmost digits.
    self.control.entryHash.value = entryHash.toString().slice(-10);

    // Pass the result string as well as the number of rows back
    done1(result, rows);
  });
};

File.prototype.generateHeader = function(cb) {
  utils.generateString(this.header, function(string) {
    cb(string);
  });
};

File.prototype.generateControl = function(cb) {
  utils.generateString(this.control, function(string) {
    cb(string);
  });
};

File.prototype.generateFile = function(cb) {
  var self = this;

  self.generateHeader(function(headerString) {
    self.generateBatches(function(batchString, rows) {
      self.generateControl(function(controlString) {

        // These must be within this callback otherwise rows won't be calculated yet
        var paddedRows = utils.getNextMultipleDiff(rows, 10);

        self.generatePaddedRows(paddedRows, function(paddedString) {
          cb(undefined, headerString + utils.newLineChar() + batchString + controlString + paddedString);
        });
      });
    })
  });
};

File.prototype.writeFile = function(path, cb) {
  var self = this;
  self.generateFile(function(err, fileSting) {
    if (err) return cb(err);
    fs.writeFile(path, fileSting, cb)
  })
};

File.parseFile = function(filePath, cb) {
  fs.readFile(filePath, function(err, data) {
    if (err) return cb(err);
    File.parse(data.toString(), cb);
  });
}

File.parse = function(str, cb) {
  if (!str || !str.length) {
    return cb('Input string is empty');
  }
  var lines = str.split('\n');
  if (lines.length <= 1) {
    lines = [];
    for (var i = 0; i < str.length; i += 94) {
      lines.push(str.substr(i, 94));
    }
  }
  var file = {};
  var batches = [];
  var batchIndex = 0;
  var hasAddenda = false;
  lines.forEach(function(line) {
    if (!line || !line.length) {
      return;
    }
    switch (parseInt(line[0])) {
      case 1: 
        file.header = utils.parseLine(line, fileHeader());
        break;
      case 9: 
        file.control = utils.parseLine(line, fileControl); 
        break;
      case 5:
        batches.push({
          header: utils.parseLine(line, batchHeader),
          entry: [],
          addenda: []
        });
        break;
      case 8:
        batches[batchIndex].control = utils.parseLine(line, batchControl);
        batchIndex++;
        break;
      case 6:
        batches[batchIndex].entry.push(new Entry(utils.parseLine(line, entryFields)));
        break;
      case 7:
        batches[batchIndex]
          .entry[batches[batchIndex].entry.length - 1]
          .addAddenda(new Addenda(utils.parseLine(line, addendaFields)));
        hasAddenda = true;
        break;
    }
  });
  if (!file.header || !file.control) {
    return cb('File records parse error');
  }
  if (!batches || !batches.length) {
    return cb('No batches found');
  }
  try {
    var nachFile;
    if (!hasAddenda) {
      nachFile = new File(file.header);
    } else {
      nachFile = new File(file.header, false);
    }
    
    batches.forEach(function(batchOb) {
      var batch = new Batch(batchOb.header);
      batchOb.entry.forEach(function(entry) {
        batch.addEntry(entry);
      });
      nachFile.addBatch(batch);
    })
    cb(undefined, nachFile);
  } catch (e) {
    return cb(e);
  }
}

module.exports = File;