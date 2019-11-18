'use strict';
const asciify = require('asciify-image');


module.exports.printMessage = async function(context, blob) {
  let options = {
    fit:    'box',
    width:  60,
    height: 60
  };
  let ascii = await asciify(blob, options);
  context.log(ascii);
  context.done();
};
