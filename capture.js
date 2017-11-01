const fs = require('fs');

function capture(path, { label, x, y, w, h }) {
  const left = Math.floor(x - w / 2);
  const top = Math.floor(y - h / 2);
  const right = left + w;
  const bottom = top + h;
  const toFile = `./captures/${label}_${Date.now()}_${left}_${right}_${top}_${bottom}.png`;
  fs.renameSync(path, toFile);
}

module.exports = function (stillPath, detections) {
  return Promise.all(detections.map(obj => capture(stillPath, obj)));
};
