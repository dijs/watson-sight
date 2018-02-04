const fs = require('fs');
const basename = require('path').basename;
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
const getCaptures = require('./capture');
const startServer = require('./server');
const recognize = require('./recognize');
const EventEmitter = require('events');

const log = debug('detect');

const scoreThreshold = 0.8;
const pathToStills = `${__dirname}/stills`;
const quadrants = [
  ['top-left', 'top', 'top-right'],
  ['left', 'center', 'right'],
  ['bottom-left', 'bottom', 'bottom-right'],
];
let lastDetection = [];

const DetectionEvents = new EventEmitter();

const quadrant = (x, y) => {
  return quadrants[Math.floor(y / config.stillHeight * 3)][Math.floor(x / config.stillWidth * 3)];
};

const byId = ({ label, x, y }) => `${label}_${quadrant(x, y)}`;

const byNew = detection => {
  const id = byId(detection);
  return !lastDetection.some(lastId => id === lastId);
};

function itemTitle(guess, score, label) {
  if (score >= scoreThreshold) {
    return `Recognized <b>${guess}</b> (${Math.round(score * 100)}%)`;
  }
  return `Detected a <b>${label}</b>`;
}

const createMessage = ({ label, x, y, time, guess, score }) => {
  return `${itemTitle(guess, score, label)} in the ${quadrant(x, y)} of the ${config.feed.toLowerCase()} feed at ${moment(time).format('h:mm a on dddd, MMM Do')}`;
};

function getNewObjects(objects) {
  const newObjects = objects.filter(byNew);
  lastDetection = objects.map(byId);
  return newObjects;
}

function detectObjects(path) {
  log('Detecting objects in', path, '...');
  return new Promise((resolve, reject) => {
    const name = basename(path, '.png');
    request(`${config.darknetApi}/${name}`, (err, res, body) => {
      if (err) {
        log('Detection failed', err);
        return reject(err);
      }
      const objects = JSON.parse(body)
        .filter(([label, confidence]) => confidence >= config.minConfidence)
        .map(([label, confidence, [x, y, w, h]]) => {
          return {
            label,
            x,
            y,
            w,
            h
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
    .then(objects => getNewObjects(objects))
    .then(newObjects => {
      if (!newObjects.length) {
        throw new Error('No new objects detected, bail')
      }
      return newObjects;
    })
    .then(newObjects => {
      // Save captured files with proper filename
      return getCaptures(path, newObjects)
        .then(capturePaths => {
          // Now try to recognize the object in the image
          return Promise.all(capturePaths.map((capturePath, index) => {
            return recognize(capturePath).then(info => {
              // Assign results
              const recog = Object.assign({} , newObjects[index], info);
              DetectionEvents.emit('recognized', Object.assign({}, recog, {
                time,
                capturePath
              }));
              return recog;
            });
          }));
        });
    })
    .then(newObjects => {
      const messages = newObjects.map(createMessage);
      const lines = messages.map(m => `<li>${m}</li>`).join('');
      const cid = config.sendEmail.cid;

      DetectionEvents.emit('detected', newObjects);

      return sendEmail({
        to: config.sendEmail.to,
        from: config.sendEmail.from,
        subject: `Detected ${messages.length} objects in ${config.feed} feed`,
        html: `<ul>${lines}</ul><br /><br /><img src="cid:${cid}" />`,
        attachments: [{
          filename: 'still.png',
          path,
          cid,
        }],
      });
    })
    .catch(err => {
      log('Bailed from detection handler', err.message);
    })
    .then(() => {
      log('Removing', path);
      try {
        fs.unlinkSync(path);
      } catch (e) {
        log('There was an issue removing the still image', path);
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
      DetectionEvents.emit('message', 'Motion Detected');
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

startServer(DetectionEvents);
