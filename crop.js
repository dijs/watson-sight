const join = require('path').join;
const basename = require('path').basename;
const jimp = require('jimp');
const request = require('request');

const size = 224;

function getImageInfo(filename) {
  const [tag, timestamp, left, right, top, bottom] = basename(filename, '.png').split('_');
  const x = parseInt(left, 10);
  const y = parseInt(top, 10);
  return {
    tag,
    age: Date.now() - parseInt(timestamp, 0),
    x,
    y,
    w: parseInt(right, 10) - x,
    h: parseInt(bottom, 10) - y,
  };
}

module.exports = function crop(req, res, next) { 
  const { x, y, w, h } = getImageInfo(req.params.file);
  const path = `${__dirname}/captures/${req.params.file}`;
  jimp
    .read(path)
    .then(image => {
      return image
        .crop(x, y, w, h)
        .contain(size, size)
        .getBuffer(jimp.MIME_PNG, (err, buffer) => {
            if (err) {
              return next(err);
            }
            res.set("Content-Type", jimp.MIME_PNG);
            res.send(buffer);
         });
    })
    .catch(err => {
      return next(err);
    })
}