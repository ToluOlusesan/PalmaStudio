// Show whether Palma's ingest server is reachable.
fetch('http://127.0.0.1:47821/ping')
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then(() => {
    document.getElementById('dot').classList.add('ok')
    document.getElementById('label').textContent = 'Connected to Palma'
  })
  .catch(() => {
    document.getElementById('label').textContent = 'Palma is not running'
  })
