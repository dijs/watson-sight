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

function writeTrainingImage(capturePath) {
  const { x, y, w, h } = getImageInfo(capturePath);
  const tempFilename = `${Date.now()}.jpg`;
  return jimp
    .read(capturePath)
    .then(image => {
      return image
        .crop(x, y, w, h)
        .contain(size, size)
        .write(join(__dirname, 'temp', tempFilename))
    })
    .then(() => tempFilename);
}

function getLabelResults(tempFilename) {
  return new Promise((resolve, reject) => {
    request.get(`http://localhost:5001/label/${tempFilename}`, (err, res, body) => {
      if (err) {
        return reject(err);
      }
      // Delete temp file
      try {
        fs.unlinkSync(join(__dirname, 'temp', tempFilename));
      } catch(e) {
        console.log('Could not delete temp file', tempFilename);
      }
      try {
        return resolve(JSON.parse(body));
      } catch(e) {
        console.log(body);
        return reject('Could not find labels');
      }
    });
  });
}

module.exports = function recognize(capturePath) {
  return writeTrainingImage(capturePath)
    .then(getLabelResults)
    .then(results => {
      let guess = null;
      let score = 0;
      Object.keys(results).forEach(key => {
        if (results[key] > score) {
          score = results[key];
          guess = key;
        }
      });
      return { guess, score };
    })
};
