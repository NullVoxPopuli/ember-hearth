'use strict';

var Datastore = require('nedb'),
  uuid = require('node-uuid'),
  Promise = require('bluebird'),
  jsonminify = require("jsonminify"),
  spawn = require('child_process').spawn,
  fs = Promise.promisifyAll(require('fs')),
  path = require('path');

const EMBER_BIN = path.join(__dirname, '..', 'node_modules', 'ember-cli', 'bin', 'ember');

let processes = {},
  db = {
    apps: Promise.promisifyAll(new Datastore({filename: path.resolve(__dirname, 'hearth.nedb.json'), autoload: true}))
  };

function addMetadata(app) {
  // get some app metadata (could probably be cached, but avoids old entries if stored in db on add)
  console.log('stat', path.resolve(app.path, 'package.json'));
  const packagePath = path.resolve(app.path, 'package.json');
  const cliPath = path.resolve(app.path, '.ember-cli');

  return Promise.props({
    'package': fs.statAsync(packagePath),
    'cli': fs.statAsync(cliPath)
  }).then((stats) => {
    return Promise.props({
      'package': stats.package.isFile() && fs.readFileAsync(packagePath),
      cli: stats.cli.isFile() && fs.readFileAsync(cliPath)
    }).then(data => {
      if (data.package) app.package = JSON.parse(data.package);
      if (data.cli) app.cli = JSON.parse(jsonminify(data.cli.toString('utf8')));

      // TODO: read default ports
      if (!app.cli) app.cli = {};
      if (!app.cli.testPort) app.cli.testPort = 7357;
      if (!app.cli.port) app.cli.port = 4200;

      return app;
    });
  });
}

function emitApps(ev) {
  return db.apps.findAsync({}).then((apps) => {
    return Promise.all(apps.map(doc => addMetadata(doc)))
      .then((apps) => {
        // send jsonapi list of apps
        ev.sender.send('app-list', {
          data: apps.map(app => {
            return {
              id: app.id,
              type: 'project',
              attributes: app
            };
          })
        });
      }).catch(e => console.error(e));
  });
}

function emitEmberHelp(ev, app){
  var ember = spawn(EMBER_BIN, ['--help', '--json'], {
    cwd: path.normalize(app.path),
    detached: true
  });
  let i = 0,
    data = '';

  ember.stdout.on('data', (stdoutData) => {
    // ignore ember version header
    if (i > 0) {
      data += stdoutData.toString('utf8');
    }
    i++;
    console.log(`${app.path} stdout: ${stdoutData.toString('utf8')}`);
  });
  ember.stderr.on('data', (data) => {
    console.log(`${app.path} stderr: ${data.toString('utf8')}`);
  });
  ember.on('close', (code) => {
    ev.sender.send('app-help', app, JSON.parse(data));
    console.log(`${app.path} child process exited with code ${code}`);
  });
}

function addApp(ev, appPath) {
  return db.apps.insertAsync({
    id: uuid.v4(),
    path: appPath,
    name: path.basename(appPath)
  }).then((data) => {
    return emitApps(ev)
      .then(() => data);
  });
}

function initApp(ev, app) {
  var ember = spawn(EMBER_BIN, ['init'], {
    cwd: path.normalize(app.path),
    detached: true
  });
  ember.stdout.on('data', (data) => {
    ev.sender.send('app-stdout', app, data.toString('utf8'));
    console.log(`${app.path} stdout: ${data.toString('utf8')}`);
  });
  ember.stderr.on('data', (data) => {
    ev.sender.send('app-stderr', app, data.toString('utf8'));
    console.log(`${app.path} stderr: ${data.toString('utf8')}`);
  });
  ember.on('close', (code) => {
    console.log(`${app.path} child process exited with code ${code}`);
    addApp(ev, app.path).then((app) => {
      ev.sender.send('app-init-end', app);
    });
  });
  ev.sender.send('app-init-start', app);
  processes[app.id] = ember;
}

function startApp(ev, app) {
  var ember = spawn(EMBER_BIN, ['s'], {
    cwd: path.normalize(app.path),
    detached: true
  });
  ember.stdout.on('data', (data) => {
    ev.sender.send('app-stdout', app, data.toString('utf8'));
    console.log(`${app.name} stdout: ${data}`);
  });
  ember.stderr.on('data', (data) => {
    ev.sender.send('app-stderr', app, data.toString('utf8'));
    console.log(`${app.name} stderr: ${data}`);
  });
  ember.on('close', (code) => {
    ev.sender.send('app-close', app, code);
    console.log(`${app.name} child process exited with code ${code}`);
  });
  ev.sender.send('app-start', app);
  processes[app.id] = ember;
}

function stopApp(ev, app) {
  processes[app.id].kill();
}

function stopAllApps() {
  Object.keys(processes).forEach(appId =>
    processes[appId].kill());
}

module.exports = {
  initApp,
  stopAllApps,
  stopApp,
  emitEmberHelp,
  emitApps,
  addApp,
  startApp
};