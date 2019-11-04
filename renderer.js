const server = 'http://192.168.1.103:9101';

function api(path) {
  return fetch(`${server}/${path}`).then(res => res.json());
}

function getDetections() {
  api('api/detections').then(data => console.log(data));
}

function getGraphData(table) {
  return api(`graph/${table}/data`);
}

function getBatteryLevel() {
  return api('battery-level');
}

getGraphData('temps').then(raw => {
  var ctx = document.getElementById('myChart').getContext('2d');
  const data = raw.map(e => ({ y: parseFloat(e.temp), x: new Date(e.time) }));
  console.log(data);

  var myChart = new Chart(ctx, {
    type: 'line',
    data
  });
});
