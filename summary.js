const countBy = require('lodash/countBy');
const uniqBy = require('lodash/uniqBy');
const map = require('lodash/map');
const pluralize = require('pluralize');

const fullWidth = 640;
const fullHeight = 480;

const labelAndSection = a => {
  const x = Math.floor((a.x + a.w / 2) / fullWidth * 3);
  const y = Math.floor((a.y + a.h / 2) / fullHeight * 3);
  const section = y * 3 + x;
  return a.label + section;
};

const note = (n, label) => {
  if (n === 1) {
    return `1 ${label}`;
  }
  return `${n} ${pluralize(label)}`;
};

const makeNotes = notes => {
  const prefix = notes.length === 1 ? 'There has been a' : 'There have been';
  return (
    notes.reduce((sentence, note, index, arr) => {
      if (index === 0) {
        return `${prefix} ${note}`;
      }
      if (index === arr.length - 1) {
        return `${sentence}, and ${note}`;
      }
      return `${sentence}, ${note}`;
    }, '') + ' detected recently'
  );
};

module.exports = function (sightObjects) {
  if (!sightObjects.length) return 'Nothing yet.';
  const counts = countBy(uniqBy(sightObjects, labelAndSection), 'label');
  return makeNotes(map(counts, note));
};
