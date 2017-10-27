const fs = require('fs');
const extension = require('path').extname;
const ffmpeg = require('fluent-ffmpeg');
const request = require('request');
const debug = require('debug');
const watch = require('watch');
const express = require('express');
const moment = require('moment');
const createQueue = require('./siju');
const sendEmail = require('./email');
const config = require('./config.json');

const log = debug('detect');

const pathToStills = `${__dirname}/stills`;
const quadrants = [
  ['top-left', 'top', 'top-right'],
  ['left', 'center', 'right'],
  ['bottom-left', 'bottom', 'bottom-right'],
];
let lastDetection = [];

const quadrant = (x, y) => {
  return quadrants[Math.floor(y / config.stillHeight * 3)][Math.floor(x / config.stillWidth * 3)];
};

const byId = ({ label, x, y }) => `${label}_${quadrant(x, y)}`;

const byNew = detection => {
  const id = byId(detection);
  return !lastDetection.some(lastId => id === lastId);
};

const createMessage = (label, x, y, time) => {
  return `Detected a <b>${label}</b> in the ${quadrant(x, y)} of the ${config.feed.toLowerCase()} feed at ${moment(time).format('h:mm a on dddd, MMM Do')}`;
};

function getNewObjects(objects) {
  const newObjects = objects.filter(byNew);
  lastDetection = objects.map(byId);
  return newObjects;
}

const createUploadOptions = path => {
  return {
    url: config.darknetApi,
    formData: {
      image: fs.createReadStream(path),
    }
  };
};

function detectObjects(path) {
  log('Detecting objects in', path, '...');
  return new Promise((resolve, reject) => {
    request.post(createUploadOptions(path), (err, res, body) => {
      if (err) {
        log('Detection failed', err);
        return reject(err);
      }
      const objects = JSON.parse(body)
        .filter(([label, confidence]) => confidence >= minConfidence)
        .map(([label, confidence, [x, y]]) => {
          return {
            label,
            x,
            y,
          };
        });
      return resolve(objects);
    });
  });
}

function getStills(path) {
  const timestamp = Date.now();
  return ffmpeg(path)
    .screenshots({
      count: 4,
      filename: `still-${timestamp}-%i.png`,
      folder: 'stills',
      size: `${config.stillWidth}x${config.stillHeight}`,
    });
}

function handleDetection({ path, time }) {
  return detectObjects(path)
    .then(objects => {
      if (!objects.length) {
        throw new Error('No objects detected, bail')
      }
      return objects;
    })
    .then(getNewObjects)
    .then(newObjects => {
      if (!newObjects.length) {
        throw new Error('No new objects detected, bail')
      }
      return newObjects;
    })
    .then(newObjects => {
      const messages = newObjects.map(({ label, x, y }) => createMessage(label, x, y, time));
      const lines = messages.map(m => `<li>${m}</li>`).join('');
      const cid = config.sendEmail.cid;
      return sendEmail({
        to: config.sendEmail.to,
        from: config.sendEmail.from,
        subject: `Detected ${messages.length} objects in ${feed} feed`,
        html: `<ul>${lines}</ul><br /><br /><img src="cid:${cid}" />`,
        attachments: [{
          filename: 'still.png',
          path,
          cid,
        }],
      });
    })
    .catch(err => {
      // Do Nothing
    })
    .then(() => {
      log('Removing', path);
      try {
        fs.unlinkSync(path);
      } catch (e) {
        // Do nothing
      }
    });
}

const queue = createQueue(handleDetection, 'path');

log('Started watching for new motion detected videos');
watch.createMonitor(config.pathToVideos, monitor => {
  monitor.on('created', function (path, stat) {
    if (extension(path) === '.m4v') {
      log('New video was created, fetching stills');
      getStills(path);
    }
  });
});

log('Started watching for new stills');
watch.createMonitor(pathToStills, monitor => {
  monitor.on('created', function (path, stat) {
    if (extension(path) === '.png') {
      const job = { path, time: Date.now() };
      if (queue.add(job)) {
        log('New still was created, queue for detection');
      }
    }
  });
});
