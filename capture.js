const jimp = require('jimp');

function capture(path, { label, x, y, w, h }) {
  const toFile = `./captures/${label}-${Date.now()}-${Math.random()*10e16}.jpg`;
  const left = x - w / 2;
  const top = y - h / 2;
  return jimp
    .read(path)
    .then(image => {
      return image
        .crop(left, top, w, h)
        .write(toFile);
    });
}

module.exports = function (stillPath, detections) {
  return Promise.all(detections.map(obj => capture(stillPath, obj)));
};
