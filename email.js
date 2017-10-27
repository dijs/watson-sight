const nodemailer = require('nodemailer');
const debug = require('debug');
const config = require('./config.json');

const log = debug('detect.email');

const transporter = nodemailer.createTransport(config.email);

// Prevents CERT_HAS_EXPIRED error
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// {to, from, subject, html}
module.exports = options => {
  return new Promise((resolve, reject) => {
    log('Sending email to ' + options.to);
    transporter.sendMail(options, error => {
      if (error) {
        log('Could not send email', error);
        return reject(error);
      }
      log('Sent email.');
      return resolve();
    });
  });
};
