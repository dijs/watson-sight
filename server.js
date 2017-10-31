const express = require('express');
const config = require('./config.json');
const fs = require('fs');
const debug = require('debug');

const app = express();
const log = debug('detect.server');

const startsWith = prefix => text => text.indexOf(prefix) === 0;
const byId = name => name.match(/\w+_(\d+)/)[1];
const byMax = (max, n) => Math.max(max, n);

app.get('/untagged', (req, res) => {
  res.json(fs.readdirSync('./captures'));
});

app.get('/untagged/:file', (req, res) => {
  fs.createReadStream(`./captures/${req.params.file}`).pipe(res);
});

app.get('/tag/:file/:label', (req, res) => {
  const { label, file } = req.params;
  const id = fs
    .readdirSync('./tagged')
    .filter(startsWith(label))
    .map(byId)
    .reduce(byMax, 0) + 1;
  fs.renameSync(`./captures/${file}`, `./tagged/${label}_${id}.jpg`);
  res.json(id);
});

app.get('/negative/:file', (req, res) => {
  const { file } = req.params;
  fs.renameSync(`./captures/${file}`, `./negatives/${file}`);
  res.json({ success: true });
});

const start = () => {
  app.listen(config.serverPort);
  log(`Listening @ http://localhost:${config.serverPort}`);
};

module.exports = start;
