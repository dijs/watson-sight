const jsonSql = require('json-sql')({
  dialect: 'postgresql',
  namedValues: false,
});
const debug = require('debug');
const { Client } = require('pg');

const log = debug('watson:db');

const connectionString = 'postgres://jhkmcahc:ydVCsgT1sSsrpH_Wx8WgrQvQUXOyY0S6@horton.elephantsql.com:5432/jhkmcahc';

const preformQuery = (...args) => {
  const client = new Client(connectionString);
  return client
    .connect()
    .then(() => client.query(...args))
    .then(res => client.end().then(() => res.rows));
};

const fetch = table => {
  const sql = jsonSql.build({
    type: 'select',
    table,
    condition: {
      // 12 hour window
      time: {$gt: new Date(+new Date() - 1000 * 60 * 60 * 12)}
    }    
  });
  return preformQuery(sql.query, sql.values);
};

module.exports = fetch;
