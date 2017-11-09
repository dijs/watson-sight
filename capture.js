const fs = require('fs-extra');
const join = require('path').join;

function capture(path, { label, x, y, w, h }) {
  const left = Math.floor(x - w / 2);
  const top = Math.floor(y - h / 2);
  const right = Math.floor(left + w);
  const bottom = Math.floor(top + h);
  const toFile = join(__dirname, `captures/${label}_${Date.now()}_${left}_${right}_${top}_${bottom}.png`);
  try {
    fs.copySync(path, toFile);
    return Promise.resolve(toFile);
  } catch (err) {
    return Promise.reject(err);
  }
}

module.exports = function (stillPath, detections) {
  return Promise.all(detections.map(obj => capture(stillPath, obj)));
};
