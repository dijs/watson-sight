const fs = require('fs');

function capture(path, { label, x, y, w, h }) {
  const left = Math.floor(x - w / 2);
  const top = Math.floor(y - h / 2);
  const right = Math.floor(left + w);
  const bottom = Math.floor(top + h);
  const toFile = `./captures/${label}_${Date.now()}_${left}_${right}_${top}_${bottom}.png`;
  try {
    fs.renameSync(path, toFile);
    return Promise.resolve(toFile);
  } catch (err) {
    return Promise.reject(err);
  }
}

module.exports = function (stillPath, detections) {
  return Promise.all(detections.map(obj => capture(stillPath, obj)));
};
