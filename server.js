const express = require('express');
const config = require('./config.json');
const fs = require('fs');
const debug = require('debug');
const cors = require('cors');
const { basename, join } = require('path');
const uniq = require('lodash/uniq');
const find = require('lodash/find');
const isEqual = require('lodash/isEqual');
const matchesProperty = require('lodash/matchesProperty');
const property = require('lodash/property');
const moment = require('moment');
const batteryLevel = require('battery-level');
const getSummary = require('./summary');
const fetchGraphData = require('./db');

const app = express();

const http = require('http').Server(app);
const io = require('socket.io')(http);
const apicache = require('apicache');

const log = debug('detect.server');
const recognize = require('./recognize');

const startsWith = prefix => text => text.indexOf(prefix) === 0;
const byId = name => name.match(/\w+_(\d+)/)[1];
const byMax = (max, n) => Math.max(max, n);

let lastEvents = [];
try {
  lastEvents = JSON.parse(fs.readFileSync('./last-events.json', 'utf8'));
} catch(e) {
  log('Could not load last events');
}

function addToLastEvents(name, data) {
  lastEvents.unshift({ name, data });
  if (lastEvents.length > 100) {
    lastEvents.pop();
  }
  fs.writeFileSync('./last-events.json', JSON.stringify(lastEvents, null, 3));
}

app.use(cors());

app.get('/battery-level', (req, res) => {
  batteryLevel().then(level => res.json({ level }));
});

let lastScore = 0;
app.get('/online/:score', (req, res) => {
  lastScore = req.params.score;
  io.emit('score', lastScore);
  res.send('good');
});

app.get('/online', (req, res) => {
  res.json({
    score: lastScore
  });
});

const cache = apicache.middleware;

app.get('/graph/:table/data', cache('5 minutes'), (req, res, next) => {
  fetchGraphData(req.params.table, req.query.hours, req.query.spacing)
    .then(data => res.json(data))
    .catch(err => next(err));
});

app.get('/untagged', (req, res) => {
  res.json(fs.readdirSync('./captures').filter(filename => filename.indexOf('.') !== 0));
});

app.get('/recognize/:file', (req, res, next) => {
  recognize(join(__dirname, 'captures', req.params.file))
    .then(info => res.json(info))
    .catch(err => next(err));
});

app.get('/labels', (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync('./config.json', 'utf8')).labels || []);
  } catch(e) {
    log('Could not read labels', e);
    res.json([]);
  }
});

app.get('/add-label/:label', (req, res) => {
  try {
    const oldConfig = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    const newLabels = uniq([...(oldConfig.labels || []), req.params.label]);
    if (isEqual(oldConfig.labels, newLabels)) {
      res.json({
        success: true,
        noChangeNeeded: true
      });
      return;
    }
    const newConfig = Object.assign({}, oldConfig, {
      labels: newLabels,
    });
    fs.writeFileSync('./config.json', JSON.stringify(newConfig, null, 3));
    res.json({
      success: true,
    });
  } catch(e) {
    res.json({
      success: false,
      error: e,
    });
  }
});

app.get('/watch-image/:file', (req, res, next) => {
  fs.createReadStream(`${__dirname}/watch-images/${req.params.file}`)
    .on('error', err => {
      next(new Error(`Could not find untagged image ${req.params.file}. ${err.message}`));
    })
    .pipe(res);
});

app.get('/untagged/:file', (req, res, next) => {
  fs.createReadStream(`${__dirname}/captures/${req.params.file}`)
    .on('error', err => {
      next(new Error(`Could not find untagged image ${req.params.file}. ${err.message}`));
    })
    .pipe(res);
});

app.get('/tagged/:file', (req, res, next) => {
  fs.createReadStream(`${__dirname}/tagged/${req.params.file}`)
    .on('error', err => {
      next(new Error(`Could not find tagged image ${req.params.file}. ${err.message}`));
    })
    .pipe(res);
});

app.get('/tag/:file/:label', (req, res) => {
  const { label, file } = req.params;
  const [, timestamp, left, right, top, bottom] = basename(file, '.png').split('_');
  fs.renameSync(
    `./captures/${file}`,
    `./tagged/${label}_${timestamp}_${left}_${right}_${top}_${bottom}.png`
  );
  res.json({ success: true });
});

app.get('/negative/:file', (req, res) => {
  const { file } = req.params;
  fs.renameSync(`./captures/${file}`, `./negatives/${file}`);
  res.json({ success: true });
});

// TODO: Generalize these for ALL reporting
app.get('/temp/:temp/:location/:time', (req, res) => {
  const { temp, location, time } = req.params;
  const data = { temp, location, time };
  io.emit('temp', data);
  addToLastEvents('temp', data);
  res.json({ success: true });
});
app.get('/moisture/:temp/:location/:time', (req, res) => {
  const { moisture, location, time } = req.params;
  const data = { moisture, location, time };
  io.emit('moisture', data);
  addToLastEvents('moisture', data);
  res.json({ success: true });
});

app.get('/api/main', (req, res) => {
  const outside = find(lastEvents, event => {
    return event.name === 'temp' && event.data.location === 'Outside';
  });
  const inside = find(lastEvents, event => {
    return event.name === 'temp' && event.data.location === 'Upstairs';
  });
  res.json({
    outside: outside ? outside.data.temp : 'none',
    inside: inside ? inside.data.temp : 'none',
    insideData: lastEvents
      .filter(matchesProperty('name', 'temp'))
      .filter(matchesProperty('data.location', 'Upstairs'))
      .map(property('data.temp'))
      .map(v => parseInt(v, 10))
      .reverse(),
    outsideData: lastEvents
      .filter(matchesProperty('name', 'temp'))
      .filter(matchesProperty('data.location', 'Outside'))
      .map(property('data.temp'))
      .map(v => parseInt(v, 10))
      .reverse(),
    summary: getSummary(lastEvents.filter(matchesProperty('name', 'recognized')).map(property('data')))
  });
});

app.get('/api/detections', (req, res) => {
  const detections = lastEvents
  	.filter(matchesProperty('name', 'recognized'))
  	.map(property('data'))
  	.filter(obj => obj.score > 0.8)
  	.map(({ watchImage, label, guess, score, time }) => {
      return {
      	image: `http://richard.crushftp.com:5567/watch-image/${watchImage}`,
      	guess,
      	label,
      	score: `(${Math.round(score * 100)}%)`,
      	when: moment(time).fromNow()
      };
  	});
  res.json({
    detections
  });
});

app.get('/', (req, res) => res.send('Welcome to the Watson Object Tagger'));


io.on('connection', socket => {
  socket.emit('update', lastEvents);
});

const start = DetectionEvents => {
  http.listen(config.serverPort);
  log(`Listening @ http://localhost:${config.serverPort}`);
  if (DetectionEvents) {
    // Forward detection events to all sockets
    DetectionEvents.on('message', message => io.emit('message', message));
    DetectionEvents.on('detected', objects => io.emit('detected', objects));
    DetectionEvents.on('recognized', data => {
      // Save to queue
      addToLastEvents('recognized', data);
      io.emit('recognized', data);
    });
  }
};

module.exports = start;
