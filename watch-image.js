const join = require('path').join;
const jimp = require('jimp');

module.exports = function writeWatchImage(capturePath) {
  const rand = Math.abs(Math.random() * 10e13 | 0);
  const tempFilename = `${Date.now()}-${rand}.jpg`;
  return jimp
    .read(capturePath)
    .then(image => {
      return image
        .quality(1)
        .resize(312, jimp.AUTO)
        .write(join(__dirname, 'watch-images', tempFilename))
    })
    .then(() => tempFilename);
}
