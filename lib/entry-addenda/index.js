// Entry

var _ = require('lodash');
var utils = require('./../utils');
var validate = require('./../validate');

var highLevelOverrides = ['addendaTypeCode', 'paymentRelatedInformation', 'addendaSequenceNumber', 'entryDetailSequenceNumber'];

function EntryAddenda(options, autoValidate) {

  // Allow the file header defaults to be overriden if provided
  this.fields = options.fields ? _.merge(options.fields, require('./fields'), _.defaults) : _.cloneDeep(require('./fields'));

  // Set our high-level values
  utils.overrideLowLevel(highLevelOverrides, options, this);

  // Some values need special coercing, so after they've been set by overrideLowLevel() we override them
  if (options.returnCode) {
    this.fields.returnCode.value = options.returnCode.slice(0, this.fields.returnCode.width);
  }

  if (options.paymentRelatedInformation) {
    this.fields.paymentRelatedInformation.value = options.paymentRelatedInformation.slice(0, this.fields.paymentRelatedInformation.width);
  }

  if (options.addendaSequenceNumber) {
    this.fields.addendaSequenceNumber.value = options.addendaSequenceNumber;
  }

  if (options.entryDetailSequenceNumber) {
    this.fields.entryDetailSequenceNumber.value = options.entryDetailSequenceNumber.slice(0 - this.fields.entryDetailSequenceNumber.width); // last n digits. pass
  }

  if (autoValidate !== false) {
    // Validate required fields have been passed
    this._validate();
  }

  return this;
}

EntryAddenda.prototype.generateString = function(cb) {
  utils.generateString(this.fields, function(string) {
    cb(string);
  });
};

EntryAddenda.prototype._validate = function() {

  // Validate required fields
  validate.validateRequiredFields(this.fields);

  // Validate the ACH code passed is actually valid
  validate.validateACHAddendaTypeCode(this.fields.addendaTypeCode.value);

  // Validate header field lengths
  validate.validateLengths(this.fields);

  // Validate header data types
  validate.validateDataTypes(this.fields);
};

EntryAddenda.prototype.get = function(category) {

  // If the header has it, return that (header takes priority)
  if (this.fields[category]) {
    return this.fields[category]['value'];
  }
};

EntryAddenda.prototype.set = function(category, value) {
  // If the header has the field, set the value
  if (this.fields[category]) {
    if (category == 'entryDetailSequenceNumber') {
      this.fields[category]['value'] = value.slice(0 - this.fields[category].width); // pass last n digits
    }
    else {
      this.fields[category]['value'] = value;
    }
  }
};

EntryAddenda.prototype.getReturnCode = function() {
  if (this.fields.paymentRelatedInformation.value || this.fields.paymentRelatedInformation.value.length > 0) {
    return this.fields.paymentRelatedInformation.value.slice(0, 3);
  }
  return false;
}

module.exports = EntryAddenda;
