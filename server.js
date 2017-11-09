const express = require('express');
const config = require('./config.json');
const fs = require('fs');
const debug = require('debug');
const cors = require('cors');
const { basename, join } = require('path');
const uniq = require('lodash/uniq');
const isEqual = require('lodash/isEqual');
const app = express();
const log = debug('detect.server');

const recognize = require('../watson-object-recognizer/recognize');

const startsWith = prefix => text => text.indexOf(prefix) === 0;
const byId = name => name.match(/\w+_(\d+)/)[1];
const byMax = (max, n) => Math.max(max, n);

app.use(cors());

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

app.get('/untagged/:file', (req, res, next) => {
  try {
    fs.createReadStream(`./captures/${req.params.file}`).pipe(res);
  } catch(e) {
    next(new Error(`Could not find untagged image ${req.params.file}`));
  }
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

app.get('/', (req, res) => res.send('Welcome to the Watson Object Tagger'));

const start = () => {
  app.listen(config.serverPort);
  log(`Listening @ http://localhost:${config.serverPort}`);
};

module.exports = start;
